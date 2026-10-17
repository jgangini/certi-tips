"""CertiChat HTTP boundary; the only process holding the OpenRouter credential."""

import asyncio
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timezone
import hashlib
import json
import logging
import re
import time
from urllib.parse import urlsplit
from typing import Annotated
from uuid import UUID

import anyio
from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import httpx
import psycopg
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .provider import Provider
from .corpus import verified_local_context
from .graph import sanitize_graph, validate_trace
from .security import ChatError, GuardMiddleware, cookie_name, network_digest, new_token, set_cookie, token_digest
from .settings import Settings, Locale
from .decisions import answer_with_decisions
from .store import Store
from .telemetry import BrowserBatch, EventMiddleware, emit
from .voice import LectureBody, PageActivity, VoiceBody, VoiceProvider, wav_seconds

CLEANUP_SECONDS = 60


async def maintain_retention(store):
    while True:
        await asyncio.sleep(CLEANUP_SECONDS)
        try:
            await db(store.cleanup)
        except psycopg.Error:
            # A temporary database outage must not disable subsequent retention sweeps.
            continue


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class SessionBody(StrictBody):
    turnstileToken: str | None = Field(default=None, min_length=1, max_length=2048)


class ChatBody(StrictBody):
    requestId: str = Field(min_length=36, max_length=36)
    message: str = Field(min_length=1, max_length=1500)
    pageUrl: str | None = Field(default=None, max_length=1024)
    locale: Locale = "es"
    contextIds: list[Annotated[str, Field(min_length=1, max_length=200)]] = Field(default_factory=list, max_length=2)
    activityTrail: list[PageActivity] = Field(default_factory=list, max_length=12)

    @field_validator("requestId")
    @classmethod
    def uuid_id(cls, value):
        if str(UUID(value)) != value:
            raise ValueError("Canonical UUID required")
        return value

    @field_validator("message")
    @classmethod
    def nonempty(cls, value):
        if not value.strip() or any(ord(char) < 32 and char not in "\n\t" for char in value):
            raise ValueError("Text required")
        return value.strip()


async def db(function, *args):
    return await anyio.to_thread.run_sync(function, *args)


def network(request):
    # Trust only ASGI's client after Uvicorn validates the explicit Caddy address, never X-Forwarded-For directly.
    return network_digest(request.client.host if request.client else "unknown", request.app.state.settings.network_secret)


async def identity(request, verified=True):
    row = await db(request.app.state.store.session,
                   token_digest(request.cookies.get(cookie_name(request.app.state.settings))))
    if not row or (verified and not row["verified"]):
        raise ChatError("Verifica tu acceso para continuar.", 401)
    return row["token_hash"]


async def service_available(request):
    if not await db(request.app.state.store.available):
        return False
    try:
        with anyio.fail_after(2):
            response = await request.app.state.client.get(f"{request.app.state.settings.knowledge_url}/health", timeout=2)
            response.raise_for_status()
            return response.json().get("status") == "ready"
    except (httpx.HTTPError, ValueError, AttributeError, TimeoutError):
        return False


def public_url(value, settings):
    if not isinstance(value, str) or not value.startswith(settings.site_url) or len(value) > 1024:
        return False
    parsed = urlsplit(value)
    return not parsed.username and not parsed.password and not parsed.query and not any(
        part in (".", "..") for part in parsed.path.split("/"))


def page_activity(trail, settings):
    values = [item.model_dump(exclude_none=True) for item in trail]
    if (len(json.dumps(values, ensure_ascii=False, separators=(",", ":")).encode()) > 8192
            or any(not public_url(item["pageUrl"], settings) or urlsplit(item["pageUrl"]).fragment for item in values)
            or [item["at"] for item in values] != sorted(item["at"] for item in values)):
        raise ChatError("El contexto de actividad de la página no es válido.", 422)
    now = int(time.time() * 1000)
    # The original snapshot remains in the request hash; expiry must not break an identical retry.
    return [item for item in values if 0 <= now - item["at"] < 86400000]


def conversation_history(turns, settings):
    history = []
    for turn in turns[-4:]:
        if (not isinstance(turn, dict) or any(not isinstance(turn.get(key), str) or not turn[key].strip()
                or len(turn[key]) > limit for key, limit in (("question", 1500), ("answer", 5000)))
                or not isinstance(turn.get("version"), str) or not re.fullmatch(r"[0-9a-f]{64}", turn["version"])):
            continue
        sources = turn.get("sources", [])
        if (not isinstance(sources, list) or len(sources) > 8 or any(
                not isinstance(source, dict) or any(not isinstance(source.get(key), str) or not source[key].strip()
                    or len(source[key]) > limit for key, limit in (("id", 200), ("title", 500), ("url", 1024)))
                or not re.fullmatch(r"[0-9a-f]{64}-[0-9]{4}", source["id"])
                or not public_url(source["url"], settings) for source in sources)
                or len({source["id"] for source in sources}) != len(sources)):
            sources = []
        history.append({key: turn[key] for key in ("question", "answer", "version")} |
                       {"sources": [{key: source[key] for key in ("id", "title", "url")} for source in sources]})
    return history


async def retrieve(application, body, history=(), continuity="", context_ids=None):
    settings = application.state.settings
    if body.pageUrl and not public_url(body.pageUrl, settings):
        raise ChatError("La página de contexto no pertenece a CertiTips.", 422)
    try:
        response = await application.state.client.post(f"{settings.knowledge_url}/retrieve",
                    json={"message": body.message, "pageUrl": body.pageUrl, "locale": body.locale,
                          "history": conversation_history(history, settings),
                          "continuity": continuity, "contextIds": context_ids or []},
                    headers={"Authorization": f"Bearer {settings.chat_internal_token}"}, timeout=25)
        response.raise_for_status()
        result = response.json()
        version, fragments = result["version"], result["fragments"]
        if not isinstance(version, str) or not re.fullmatch(r"[0-9a-f]{64}", version):
            raise ValueError("Invalid version")
        if not isinstance(fragments, list) or len(fragments) > 8:
            raise ValueError("Invalid fragments")
        ids = set()
        for fragment in fragments:
            if (not isinstance(fragment, dict) or not isinstance(fragment.get("id"), str)
                    or not 1 <= len(fragment["id"]) <= 200 or fragment["id"] in ids
                    or not isinstance(fragment.get("title"), str) or len(fragment["title"]) > 500
                    or not isinstance(fragment.get("text"), str) or len(fragment["text"].encode()) > 18000
                    or (fragment.get("sourceId") is not None and (not isinstance(fragment["sourceId"], str) or not 1 <= len(fragment["sourceId"]) <= 200))
                    or not public_url(fragment.get("url"), settings)):
                raise ValueError("Invalid fragment")
            ids.add(fragment["id"])
        trace = validate_trace(result["graphTrace"])
        if settings.local_voice_corpus_dir and (context_ids or history) and (not context_ids or not any(
                fragment.get("sourceId") == context_ids[0] for fragment in fragments)):
            try:
                local = await db(verified_local_context, settings.local_voice_corpus_dir, body.pageUrl or "", context_ids or [], history, fragments)
            except (OSError, ValueError, KeyError, TypeError):
                raise ChatError("El corpus local del diagrama no está disponible o su contenido cambió. Actualiza el build antes de continuar.",
                                503, code="voice_context_unavailable") from None
            if local:
                version, fragments = local
                trace = {"version": version, "nodes": [], "edges": [], "truncated": False}
                logging.getLogger(__name__).info("Voice context provenance=verified_local_corpus fragments=%s version=%s", len(fragments), version)
        page = (body.pageUrl or "").split("#", 1)[0]
        diagram = next((fragment for fragment in fragments if fragment.get("kind") == "diagram"
                        and fragment.get("sourceId") in (context_ids or [])
                        and fragment["url"].split("#", 1)[0] == page), None)
        # ponytail: explicit references in the four UI languages only; broader coreference needs retrieval evaluation.
        noun = r"(?:diagrama|diagram|diagramma|svg|imagen|imagem|image|immagine|l[aá]mina|diapositiva|slide)"
        selected = (rf"\b(?:este|esta|ese|esa|this|that|current|selected|esse|essa|questo|questa)\s+{noun}\b"
                    rf"|\b{noun}\s+(?:actual|atual|attuale|current|selected|seleccionad[oa]|selecionad[oa]|selezionat[oa])\b"
                    rf"|^\s*(?:explica(?:me)?|explícame|explain|explique|spiega(?:mi)?)\s+(?:(?:el|la|the|o|a|il)\s+)?{noun}[.?!\s]*$")
        if diagram and re.search(selected, body.message, re.IGNORECASE) and not re.search(
                r"\b(?:compar\w*|contrast\w*|confront\w*|raffront\w*|versus|vs|diferenc\w*|differenc\w*)\b",
                body.message, re.IGNORECASE):
            module_id = diagram["sourceId"].split("#", 1)[0]
            allowed = {module_id, diagram["sourceId"], *(source for source in context_ids or []
                       if source.split("#", 1)[0] == module_id)}
            scoped = [fragment for fragment in fragments if fragment.get("sourceId") in allowed
                      and fragment["url"].split("#", 1)[0] == page
                      and (fragment.get("kind") != "diagram" or fragment["sourceId"] == diagram["sourceId"])]
            if len(scoped) != len(fragments):
                # The worker trace cannot attribute its global nodes to this narrower source set.
                trace = {**trace, "nodes": [], "edges": [], "truncated": False}
            fragments = scoped
        # A reference to this practice belongs to the open course, even after a cross-course chat turn.
        if page.endswith("/practice/") and re.search(
                r"\b(?:esta|este|this|essa|esse|nesta|questa|questo)\s+(?:pr[aá]ctica|practice|pr[aá]tica|pratica)\b",
                body.message, re.IGNORECASE):
            fragments = [fragment for fragment in fragments if not fragment["url"].split("#", 1)[0].endswith("/practice/")
                         or fragment["url"].split("#", 1)[0] == page]
        return version, fragments, trace
    except (httpx.HTTPError, KeyError, TypeError, ValueError):
        raise ChatError("El contenido está actualizándose o no está disponible. Inténtalo más tarde.") from None


async def lecture_segment(body, request, token_hash, activity=()):
    store, app = request.app.state.store, request.app
    prior = await db(store.request_result, token_hash, body.previousRequestId, False)
    progress = prior.get("lecture") if prior else None
    # ponytail: one bounded course authorization permits 200 segments; larger courses need a new spoken request.
    if (not isinstance(progress, dict) or type(progress.get("step")) is not int
            or not 0 <= progress["step"] < 200 or progress.get("done")
            or not isinstance(progress.get("startedAt"), (int, float))
            or not 0 <= time.time() - progress["startedAt"] < 86400
            or not (prior.get("action", {}) and prior["action"].get("name") == "lecture_start" or prior.get("educational"))):
        raise ChatError("Pide iniciar una charla para continuar con sus explicaciones.", 409, code="voice_lecture_expired")
    target = body.context.diagramId or body.context.sectionId
    if progress["step"] == 0 and target != prior.get("action", {}).get("targetId"):
        raise ChatError("La charla debe comenzar con el diagrama solicitado.", 409, code="voice_lecture_context")
    if not target:
        raise ChatError("Selecciona un diagrama o sección para la charla.", 422, code="voice_lecture_context")
    if progress.get("moduleId") and target.split("#", 1)[0] != progress["moduleId"]:
        raise ChatError("La charla de este módulo terminó. Pide iniciar otra para cambiar de módulo.", 409, code="voice_lecture_scope")
    question = "Charla guiada: explica el diagrama actual y su propósito con las fuentes verificadas." if body.context.diagramId else "Charla guiada: explica la sección actual con las fuentes verificadas."
    question += " Continúa el hilo pedagógico sin repetir la explicación previa."
    memory = await db(store.continuity, token_hash)
    history = conversation_history(await db(store.history, token_hash), app.state.settings)
    query = ChatBody(requestId=body.requestId, message=question, pageUrl=body.pageUrl, locale=body.locale)
    version, fragments, trace = await retrieve(app, query, history, memory["text"] if memory else "", [target])
    if prior.get("contentVersion") and prior["contentVersion"] != version:
        raise ChatError("Las fuentes cambiaron. Inicia una charla nueva con el contenido actualizado.", 409, code="voice_stale_playback")
    fragments = [fragment for fragment in fragments if fragment.get("sourceId") == target
                 and (not body.context.diagramId or fragment.get("kind") == "diagram")]
    if not fragments:
        raise ChatError("Este diagrama o sección todavía no tiene una fuente vigente disponible. No se puede narrar con fuentes verificadas.", 409, code="voice_context_unindexed")
    course_id = fragments[0].get("courseId")
    if not isinstance(course_id, str) or not course_id or (progress.get("courseId") and progress["courseId"] != course_id):
        raise ChatError("La charla no puede cambiar de curso sin una nueva solicitud.", 409, code="voice_lecture_context")
    history = [turn for turn in history if turn["version"] == version]
    answer, sources, card = await app.state.provider.answer(question, fragments, history, body.locale,
                                                           continuity=memory["text"] if memory else "", channel="voice", **({"activity": activity} if activity else {}))
    if not sources or len(answer) > 900:
        raise ChatError("No se pudo validar una explicación breve del contenido actual.", 502, code="invalid_answer")
    step = progress["step"] + 1
    result = {"requestId": body.requestId, "transcript": "", "answer": answer, "sources": sources,
              "contentVersion": version, "educational": True, "action": None, "audio": None, "graphTrace": trace,
              "provenance": "verified_local_corpus" if all(fragment.get("provenance") == "verified_local_corpus" for fragment in fragments) else "cognee",
              "lecture": {"step": step, "startedAt": progress["startedAt"], "done": step >= 200, "courseId": course_id}}
    if progress.get("moduleId"):
        result["lecture"]["moduleId"] = progress["moduleId"]
    if body.audioOutput == "provider":
        try:
            result["audio"] = await app.state.voice.speak(answer)
        except ChatError as error:
            result["audioError"] = error.code or "voice_provider"
    result["quota"] = await db(store.quota, token_hash, "voice")
    await db(store.finish_request, token_hash, body.requestId, result, question, "voice", card, memory["since"] if memory else None)
    return result


def create_app(settings=None, *, transport=None):
    graph_lock, graph_cache = asyncio.Lock(), {"until": 0, "value": None}

    @asynccontextmanager
    async def lifespan(application):
        configured = settings or Settings.from_env()
        configured.validate()
        application.state.settings = configured
        application.state.store = Store(configured.database_url, configured.refresh_hours, configured.questions,
                                        index_budget_usd=configured.index_budget_usd, chat_budget_usd=configured.chat_budget_usd,
                                        voice_pilot_budget_usd=configured.voice_pilot_budget_usd,
                                        local_voice_pilot=configured.local_voice_pilot)
        await db(application.state.store.open)
        try:
            await db(application.state.store.health)
            await db(application.state.store.cleanup)
            async with (
                httpx.AsyncClient(transport=transport, follow_redirects=False, trust_env=False,
                                  limits=httpx.Limits(max_connections=12, max_keepalive_connections=8)) as client,
                httpx.AsyncClient(transport=transport, follow_redirects=False, trust_env=False,
                                  limits=httpx.Limits(max_connections=32, max_keepalive_connections=16)) as index_client,
            ):
                application.state.client = client
                application.state.provider = Provider(configured, application.state.store, client, index_client)
                application.state.voice = VoiceProvider(configured, application.state.store, client)
                cleanup = asyncio.create_task(maintain_retention(application.state.store))
                try:
                    yield
                finally:
                    cleanup.cancel()
                    with suppress(asyncio.CancelledError):
                        await cleanup
        finally:
            await db(application.state.store.close)

    application = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    application.add_middleware(GuardMiddleware)
    application.add_middleware(EventMiddleware)

    @application.exception_handler(ChatError)
    async def chat_error(_request, error):
        detail = {"detail": str(error), **({"code": error.code} if error.code else {})}
        return JSONResponse(detail, error.status,
                            headers={"Retry-After": str(error.retry_after)} if error.retry_after else None)

    @application.exception_handler(RequestValidationError)
    async def validation_error(_request, _error):
        return JSONResponse({"detail": "Revisa los datos enviados. Hay un campo no válido."}, 422)

    @application.exception_handler(psycopg.Error)
    async def database_error(_request, _error):
        return JSONResponse({"detail": "El servicio está ocupado. Vuelve a intentarlo."}, 503)

    @application.get("/api/health")
    async def health(request: Request):
        result = {"ok": await db(request.app.state.store.health), "knowledge": None}
        try:
            response = await request.app.state.client.get(f"{request.app.state.settings.knowledge_url}/health", timeout=2)
            response.raise_for_status()
            value = response.json()
            version = value.get("version")
            result["knowledge"] = {"version": version if isinstance(version, str) and re.fullmatch(r"[0-9a-f]{64}", version) else None,
                                   "indexing": value.get("indexing") is True, "checkedAt": None}
            checked_at = value.get("checkedAt")
            with suppress(ValueError):
                if isinstance(checked_at, str) and len(checked_at) <= 40:
                    stamp = datetime.fromisoformat(checked_at)
                    if stamp.tzinfo:
                        result["knowledge"]["checkedAt"] = stamp.astimezone(timezone.utc).isoformat()
        except (httpx.HTTPError, ValueError, AttributeError):
            pass
        return result

    @application.get("/api/graph")
    async def knowledge_graph(request: Request):
        # One cached safe projection per API worker; concurrent visitors never fan out native graph reads.
        async with graph_lock:
            if time.monotonic() >= graph_cache["until"]:
                graph_cache.update(until=time.monotonic() + 30, value=None)
                settings = request.app.state.settings
                try:
                    async with request.app.state.client.stream("GET", f"{settings.knowledge_url}/graph",
                               headers={"Authorization": f"Bearer {settings.chat_internal_token}"}, timeout=10) as response:
                        response.raise_for_status()
                        content = bytearray()
                        async for chunk in response.aiter_bytes():
                            content.extend(chunk)
                            if len(content) > 16000000:
                                raise ValueError("Graph is too large")
                    graph_cache["value"] = sanitize_graph(json.loads(content))
                except (httpx.HTTPError, KeyError, TypeError, ValueError, AttributeError):
                    pass
        if graph_cache["value"] is None:
            raise ChatError("El mapa de conocimiento no está disponible. Inténtalo más tarde.")
        return graph_cache["value"]

    async def session_state(request):
        store = request.app.state.store
        row = await db(store.session, token_digest(request.cookies.get(cookie_name(request.app.state.settings))))
        return {"mode": request.app.state.settings.mode,
                "authenticated": row is not None, "verificationRequired": not row or not row["verified"],
                "quota": await db(store.quota, row["token_hash"]) if row else None,
                "voice": {"enabled": request.app.state.settings.voice_enabled,
                          "model": request.app.state.settings.voice_model, "maxSeconds": 30},
                "available": await service_available(request)}

    @application.get("/api/session")
    async def get_session(request: Request):
        return await session_state(request)

    @application.post("/api/session")
    async def start_session(body: SessionBody, request: Request, response: Response):
        store = request.app.state.store
        await db(store.session_attempt, network(request))
        settings = request.app.state.settings
        if settings.mode == "VPS":
            if not body.turnstileToken:
                raise ChatError("Verifica tu acceso para continuar.", 403)
            try:
                verification = await request.app.state.client.post("https://challenges.cloudflare.com/turnstile/v0/siteverify",
                           data={"secret": settings.turnstile_secret, "response": body.turnstileToken}, timeout=10)
                verification.raise_for_status()
                result = verification.json()
                if (result.get("success") is not True or result.get("hostname") != settings.turnstile_hostname
                    or result.get("action") != "certichat_session"):
                    raise ChatError("La verificación caducó o no es válida. Inténtalo de nuevo.", 403)
            except (httpx.HTTPError, ValueError, AttributeError):
                raise ChatError("No se pudo verificar el acceso. Inténtalo más tarde.") from None
        old = request.cookies.get(cookie_name(settings))
        existing = await db(store.session, token_digest(old))
        token = old if existing else new_token()
        await db(store.verify_session, token_digest(token))
        set_cookie(response, token, settings)
        return {"mode": settings.mode, "authenticated": True, "verificationRequired": False,
                "voice": {"enabled": settings.voice_enabled, "model": settings.voice_model, "maxSeconds": 30},
                "quota": await db(store.quota, token_digest(token)), "available": await service_available(request)}

    @application.delete("/api/conversation")
    async def clear_conversation(body: StrictBody, request: Request):
        token_hash = await identity(request, verified=False)
        await db(request.app.state.store.clear_history, token_hash)
        return {"ok": True, "quota": await db(request.app.state.store.quota, token_hash)}

    @application.post("/api/chat")
    async def chat(body: ChatBody, request: Request):
        token_hash = await identity(request)
        store = request.app.state.store
        if body.pageUrl and not public_url(body.pageUrl, request.app.state.settings):
            raise ChatError("La página de contexto no pertenece a CertiTips.", 422)
        activity = page_activity(body.activityTrail, request.app.state.settings)
        # Keep Spanish request hashes compatible with requests persisted before locale support.
        identity_fields = [body.message, body.pageUrl] + ([] if body.locale == "es" else [body.locale])
        if body.contextIds:
            identity_fields.append(body.contextIds)
        if body.activityTrail:
            identity_fields.append([item.model_dump(exclude_none=True) for item in body.activityTrail])
        input_hash = hashlib.sha256(json.dumps(identity_fields, ensure_ascii=False).encode()).hexdigest()
        previous = await db(store.begin_request, token_hash, body.requestId, input_hash, network(request))
        if previous is not None:
            return {**previous, "quota": await db(store.quota, token_hash)}
        try:
            async with asyncio.timeout(45):
                if not await db(store.available):
                    raise ChatError("CertiChat alcanzó su presupuesto de uso. Inténtalo más adelante.", 503, 3600)
                history = conversation_history(await db(store.history, token_hash), request.app.state.settings)
                memory = await db(store.continuity, token_hash) if request.app.state.settings.voice_enabled else None
                version, fragments, graph_trace = await retrieve(request.app, body, history, memory["text"] if memory else "", context_ids=body.contextIds)
                history = [turn for turn in history if turn["version"] == version]
                if request.app.state.settings.voice_enabled:
                    answer, sources, card = await answer_with_decisions(request.app.state.provider, body.message, fragments, history,
                                                                       body.locale, continuity=memory["text"] if memory else "", **({"activity": activity} if activity else {}))
                else:
                    answer, sources = await answer_with_decisions(request.app.state.provider, body.message, fragments, history, body.locale, **({"activity": activity} if activity else {}))
                    card = None
                if not sources:
                    graph_trace = {key: value for key, value in graph_trace.items() if key != "sources"}
                    graph_trace.update(nodes=[], edges=[], truncated=False)
                result = {"requestId": body.requestId, "answer": answer, "sources": sources,
                          "quota": await db(store.quota, token_hash), "contentVersion": version, "graphTrace": graph_trace}
                if fragments and all(fragment.get("provenance") == "verified_local_corpus" for fragment in fragments):
                    result["provenance"] = "verified_local_corpus"
                await db(store.finish_request, token_hash, body.requestId, result, body.message, "chat", card,
                         memory["since"] if memory else None)
                return result
        except BaseException as error:
            with anyio.CancelScope(shield=True):
                await db(store.finish_request, token_hash, body.requestId)
            if isinstance(error, TimeoutError):
                raise ChatError("La consulta tardó demasiado. Inténtalo más tarde.", 504) from None
            raise

    @application.post("/api/events", status_code=204)
    async def browser_events(body: BrowserBatch, request: Request):
        await identity(request)
        await db(request.app.state.store.session_attempt, network(request) + ":events")
        for event in body.events:
            emit("browser." + event.name, source="browser", **event.model_dump(exclude_none=True, exclude={"name"}))
        return Response(status_code=204)

    @application.post("/api/voice")
    async def voice(body: VoiceBody | LectureBody, request: Request):
        if not request.app.state.settings.voice_enabled:
            raise ChatError("El piloto de voz está desactivado.", 404, code="voice_disabled")
        token_hash = await identity(request)
        if not public_url(body.pageUrl, request.app.state.settings):
            raise ChatError("La página de contexto no pertenece a CertiTips.", 422)
        activity = page_activity(body.activityTrail, request.app.state.settings)
        if isinstance(body, VoiceBody):
            wav_seconds(body.audio)
        store, provider = request.app.state.store, request.app.state.voice
        # Preserve retries created before optional output/completion metadata was introduced.
        identity_fields = body.model_dump(exclude=({"audioOutput"} if body.audioOutput == "provider" else set())
                                                | ({"activityTrail"} if not body.activityTrail else set()))
        for key in ("completedDiagramId", "nextDiagramId"):
            if identity_fields["context"].get(key) is None:
                identity_fields["context"].pop(key, None)
        input_hash = hashlib.sha256(json.dumps(identity_fields, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        previous = await db(store.begin_request, token_hash, body.requestId, input_hash, network(request), "voice")
        if previous is not None:
            return {**previous, "quota": await db(store.quota, token_hash, "voice")}
        emit("voice.request", source="server", request_id=body.requestId, audio_output=body.audioOutput, mode="lecture" if isinstance(body, LectureBody) else "turn")
        started = time.monotonic()
        phase = "intent"
        try:
            async with asyncio.timeout(120):
                if isinstance(body, LectureBody):
                    phase = "lecture"
                    return await lecture_segment(body, request, token_hash, activity)
                history = conversation_history(await db(store.history, token_hash), request.app.state.settings)
                memory = await db(store.continuity, token_hash)
                intent = await provider.intent(body, history, memory["text"] if memory else "", activity)
                interpreted = time.monotonic()
                phase = "context"
                result = {"requestId": body.requestId, "transcript": intent["transcript"], "answer": "", "sources": [],
                          "contentVersion": None, "educational": not bool(intent["action"]), "action": None, "audio": None}
                card = None
                if intent["action"]:
                    result["action"] = {"name": intent["action"], "targetId": intent["targetId"]}
                    if intent.get("text"):
                        result["action"]["text"] = intent["text"]
                    if intent["action"] == "lecture_start":
                        result["lecture"] = {"step": 0, "startedAt": time.time(), "done": False}
                        if intent.get("text") == "module":
                            result["lecture"]["moduleId"] = intent["targetId"].split("#", 1)[0]
                    if intent["action"] == "continue":
                        prior = await db(store.request_result, token_hash, body.playback.requestId) if body.playback else None
                        if not prior:
                            raise ChatError("No hay una narración pendiente. Indica qué deseas retomar.", 409, code="voice_no_playback")
                        query = ChatBody(requestId=body.requestId, message=prior["transcript"] or "Retoma la explicación de la charla guiada.", pageUrl=body.pageUrl, locale=body.locale)
                        phase = "retrieval"
                        version, _fragments, _trace = await retrieve(request.app, query, [{"question": query.message,
                            "answer": prior["answer"], "version": prior["contentVersion"], "sources": prior["sources"]}])
                        if version != prior["contentVersion"]:
                            raise ChatError("Las fuentes cambiaron. Pide una explicación actualizada.", 409, code="voice_stale_playback")
                        heard = min(body.playback.heardCharacters, len(prior["answer"]))
                        # Audio has no word timestamps. Repeat the preceding sentence instead of dropping unheard words.
                        boundaries = [match.end() for match in re.finditer(r"[.!?]\s+", prior["answer"][:heard])]
                        offset = boundaries[-2] if len(boundaries) > 1 else 0
                        result.update(answer=prior["answer"][offset:], sources=prior["sources"], contentVersion=version,
                                      playbackRequestId=body.playback.requestId, playbackOffset=offset)
                        phase = "speech"
                        if body.audioOutput == "provider":
                            try:
                                result["audio"] = await provider.speak(result["answer"])
                            except ChatError as error:
                                result["audioError"] = error.code or "voice_provider"
                else:
                    query = ChatBody(requestId=body.requestId, message=intent["transcript"], pageUrl=body.pageUrl, locale=body.locale)
                    phase = "retrieval"
                    version, fragments, trace = await retrieve(request.app, query, history, memory["text"] if memory else "",
                                                              [value for value in (body.context.diagramId, body.context.sectionId) if value])
                    recent = [{"question": turn["question"], "answer": turn["answer"], "sources": turn.get("sources", [])}
                              for turn in history if turn["version"] == version]
                    phase = "answer"
                    if body.audioOutput == "browser":
                        answer, sources, card = await request.app.state.provider.answer(intent["transcript"], fragments, recent, body.locale,
                            continuity=memory["text"] if memory else "", channel="voice", expand=intent["expand"],
                            voice_context=body.context.model_dump(include={"sectionId", "diagramId", "completedDiagramId", "nextDiagramId"}),
                            **({"activity": activity} if activity else {}))
                    else:
                        answer, sources, card = await provider.answer(body, intent["transcript"], fragments, recent,
                                                                      memory["text"] if memory else "", intent["expand"], **({"activity": activity} if activity else {}))
                    validated = time.monotonic()
                    result.update(answer=answer, sources=sources, contentVersion=version,
                                  provenance="verified_local_corpus" if fragments and all(fragment.get("provenance") == "verified_local_corpus" for fragment in fragments) else "cognee",
                                  graphTrace=trace if sources else {**trace, "nodes": [], "edges": [], "truncated": False})
                    # Buffer generation until validated; never stream unverified facts to the browser.
                    phase = "speech"
                    if body.audioOutput == "provider":
                        try:
                            result["audio"] = await provider.speak(answer)
                        except ChatError as error:
                            # The verified explanation remains available as text; rejected audio never leaves the server.
                            result["audioError"] = error.code or "voice_provider"
                    result["timings"] = {"interpretationMs": round((interpreted - started) * 1000),
                                         "validationMs": round((validated - interpreted) * 1000),
                                         "readyMs": round((time.monotonic() - started) * 1000)}
                phase = "persist"
                result["quota"] = await db(store.quota, token_hash, "voice")
                await db(store.finish_request, token_hash, body.requestId, result, intent["transcript"], "voice", card,
                         memory["since"] if memory else None)
                emit("voice.complete", source="server", request_id=body.requestId, action=(result.get("action") or {}).get("name"),
                     audio_output=body.audioOutput, audio_error=bool(result.get("audioError")), duration_ms=round((time.monotonic() - started) * 1000))
                return result
        except BaseException as error:
            emit("voice.failure", source="server", request_id=body.requestId, phase=phase,
                 error_code=(error.code or type(error).__name__) if isinstance(error, ChatError) else type(error).__name__,
                 status=error.status if isinstance(error, ChatError) else 504 if isinstance(error, TimeoutError) else 500)
            with anyio.CancelScope(shield=True):
                await db(store.finish_request, token_hash, body.requestId)
            if isinstance(error, TimeoutError):
                raise ChatError("La intervención tardó demasiado. Inténtalo más tarde.", 504) from None
            raise

    @application.post("/internal/llm/v1/{operation:path}")
    async def internal_llm(operation: str, request: Request):
        try:
            data = await request.json()
        except (ValueError, UnicodeDecodeError):
            raise ChatError("JSON no válido.", 422) from None
        return await request.app.state.provider.request(operation, data, request.scope["certichat_purpose"])

    return application


app = create_app()

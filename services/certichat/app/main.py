"""CertiChat HTTP boundary; the only process holding the OpenRouter credential."""

import asyncio
from contextlib import asynccontextmanager, suppress
import hashlib
import json
import re
from urllib.parse import urlsplit
from uuid import UUID

import anyio
from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import httpx
import psycopg
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .provider import Provider, REFUSAL
from .security import COOKIE, ChatError, GuardMiddleware, network_digest, new_token, set_cookie, token_digest
from .settings import Settings
from .store import Store

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
    turnstileToken: str = Field(min_length=1, max_length=2048)


class ChatBody(StrictBody):
    requestId: str = Field(min_length=36, max_length=36)
    message: str = Field(min_length=1, max_length=1500)
    pageUrl: str | None = Field(default=None, max_length=1024)

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
    row = await db(request.app.state.store.session, token_digest(request.cookies.get(COOKIE)))
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


async def retrieve(application, body):
    settings = application.state.settings
    if body.pageUrl and not public_url(body.pageUrl, settings):
        raise ChatError("La página de contexto no pertenece a CertiTips.", 422)
    try:
        response = await application.state.client.post(f"{settings.knowledge_url}/retrieve",
                    json={"message": body.message, "pageUrl": body.pageUrl},
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
                    or not public_url(fragment.get("url"), settings)):
                raise ValueError("Invalid fragment")
            ids.add(fragment["id"])
        return version, fragments
    except (httpx.HTTPError, KeyError, TypeError, ValueError):
        raise ChatError("El contenido está actualizándose o no está disponible. Inténtalo más tarde.") from None


def create_app(settings=None, *, transport=None):
    @asynccontextmanager
    async def lifespan(application):
        configured = settings or Settings.from_env()
        configured.validate()
        application.state.settings = configured
        application.state.store = Store(configured.database_url)
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
        return {"ok": await db(request.app.state.store.health)}

    async def session_state(request):
        store = request.app.state.store
        row = await db(store.session, token_digest(request.cookies.get(COOKIE)))
        return {"authenticated": row is not None, "verificationRequired": not row or not row["verified"],
                "quota": await db(store.quota, row["token_hash"]) if row else None,
                "available": await service_available(request)}

    @application.get("/api/session")
    async def get_session(request: Request):
        return await session_state(request)

    @application.post("/api/session")
    async def start_session(body: SessionBody, request: Request, response: Response):
        store = request.app.state.store
        await db(store.session_attempt, network(request))
        settings = request.app.state.settings
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
        old = request.cookies.get(COOKIE)
        existing = await db(store.session, token_digest(old))
        token = old if existing else new_token()
        await db(store.verify_session, token_digest(token))
        set_cookie(response, token)
        return {"authenticated": True, "verificationRequired": False,
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
        input_hash = hashlib.sha256(json.dumps([body.message, body.pageUrl], ensure_ascii=False).encode()).hexdigest()
        previous = await db(store.begin_request, token_hash, body.requestId, input_hash, network(request))
        if previous is not None:
            return {**previous, "quota": await db(store.quota, token_hash)}
        try:
            async with asyncio.timeout(45):
                if not await db(store.available):
                    raise ChatError("CertiChat alcanzó su presupuesto de uso. Inténtalo más adelante.", 503, 3600)
                version, fragments = await retrieve(request.app, body)
                history = await db(store.history, token_hash, version)
                answer, sources = await request.app.state.provider.answer(body.message, fragments, history) if fragments else (REFUSAL, [])
                result = {"requestId": body.requestId, "answer": answer, "sources": sources,
                          "quota": await db(store.quota, token_hash), "contentVersion": version}
                await db(store.finish_request, token_hash, body.requestId, result, body.message)
                return result
        except BaseException as error:
            with anyio.CancelScope(shield=True):
                await db(store.finish_request, token_hash, body.requestId)
            if isinstance(error, TimeoutError):
                raise ChatError("La consulta tardó demasiado. Inténtalo más tarde.", 504) from None
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

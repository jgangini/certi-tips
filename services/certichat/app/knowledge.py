"""One private process owns the embedded stores for the active snapshot."""

import asyncio
import fcntl
import hmac
import os
import re
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from itertools import zip_longest
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .corpus import (DATASET, digest, public_url, read_json,
                     snapshot_path, supported_fragments, validate_manifest)
from .graph import current_evidence, graph_trace, node_documents, public_graph, read_graph
from .settings import INDEX_MAX_TOKENS, Locale
from .localization import localized_evidence


def configure_cognee(snapshot: Path, token: str) -> None:
    if len(token) < 32:
        raise RuntimeError("A private gateway token is required")
    endpoint = "http://api:8000/internal/llm/v1"
    # ponytail: one process per permanent snapshot; scale by replacing embedded stores first.
    values = {
        "DATA_ROOT_DIRECTORY": str(snapshot / "data"),
        "SYSTEM_ROOT_DIRECTORY": str(snapshot / "system"),
        "CACHE_ROOT_DIRECTORY": str(snapshot / "cache"),
        "COGNEE_LOGS_DIR": "/tmp/cognee-logs", "COGNEE_REPOS_DIR": "/tmp/cognee-repos",
        "DB_PROVIDER": "sqlite", "VECTOR_DB_PROVIDER": "lancedb",
        "GRAPH_DATABASE_PROVIDER": "ladybug", "ENABLE_BACKEND_ACCESS_CONTROL": "true",
        "KUZU_BUFFER_POOL_SIZE": "536870912", "KUZU_NUM_THREADS": "2",
        "LLM_PROVIDER": "custom", "LLM_MODEL": "openai/certichat-extract",
        "LLM_ENDPOINT": endpoint, "LLM_API_KEY": token, "LLM_MAX_COMPLETION_TOKENS": str(INDEX_MAX_TOKENS),
        "LLM_RATE_LIMIT_ENABLED": "true", "LLM_RATE_LIMIT_REQUESTS": "60",
        "EMBEDDING_PROVIDER": "openai", "EMBEDDING_MODEL": "openai/text-embedding-3-small",
        "EMBEDDING_ENDPOINT": endpoint, "EMBEDDING_API_KEY": token,
        "EMBEDDING_DIMENSIONS": "1536", "EMBEDDING_BATCH_SIZE": "8",
        "EMBEDDING_MAX_CONCURRENT_DATA_POINTS": "8", "TELEMETRY_DISABLED": "true",
        "COGNEE_SKIP_CONNECTION_TEST": "true",
        "COGNEE_TRACING_ENABLED": "false", "COGNEE_LOG_SEARCH_HISTORY": "false",
        "IMPROVE_AUTO_ENABLED": "false", "AUTO_FEEDBACK": "false", "CACHING": "false",
        "PERSONALIZATION_ENABLED": "false", "DEFAULT_FEEDBACK_INFLUENCE": "0",
        "LOG_LEVEL": "CRITICAL", "LITELLM_LOG": "ERROR", "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1", "LITELLM_LOCAL_MODEL_COST_MAP": "True",
    }
    os.environ.update(values)


async def close_cognee() -> None:
    from cognee.infrastructure.databases.graph.get_graph_engine import _create_graph_engine
    from cognee.infrastructure.databases.vector.create_vector_engine import _create_vector_engine
    from cognee.infrastructure.databases.relational import get_relational_engine
    # These pinned 1.6.1 caches own every per-dataset subprocess, not just the current context.
    for factory in (_create_graph_engine, _create_vector_engine):
        factory.cache_clear()
        await factory.cache_await_closed()
    await get_relational_engine().engine.dispose()


async def retrieve_evidence(message: str, context: str | None = None) -> list[dict]:
    import cognee
    from cognee.api.v1.search import SearchType
    results = await asyncio.gather(*[
        asyncio.wait_for(cognee.search(query, query_type=kind, datasets=[DATASET], only_context=True, verbose=True,
                                      include_references=True, feedback_influence=0, top_k=8), timeout=18)
        for query, kind in ((message, SearchType.RAG_COMPLETION), (message, SearchType.CHUNKS_LEXICAL),
                            (context or message, SearchType.GRAPH_COMPLETION))],
        return_exceptions=True)
    if not isinstance(results[1], BaseException):
        # Cognee 1.6.1 BM25 omits its evidence hook; reuse native chunk provenance.
        from cognee.modules.retrieval.utils.evidence import chunk_context_evidence
        for result in results[1]:
            result["evidence"] = [reference.model_dump(mode="json") for reference in chunk_context_evidence(
                result.get("objects_result"), dataset_id=result.get("dataset_id"))]
    successful = [lane for lane in results if not isinstance(lane, BaseException)]
    evidence = [[item for result in lane for item in result.get("evidence", [])] for lane in successful]
    segments = [[item for item in lane if item.get("kind") == "segment"] for lane in evidence]
    if not any(segments) and len(successful) != len(results):
        raise next(lane for lane in results if isinstance(lane, BaseException))
    # Interleave native ranks without comparing scores from different search engines.
    return ([item for pair in zip_longest(*segments) for item in pair if item is not None]
            + [item for lane in evidence for item in lane if item.get("kind") != "segment"])


class PreviousSource(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    id: str = Field(pattern=r"^[0-9a-f]{64}-[0-9]{4}$")
    title: str = Field(min_length=1, max_length=500)
    url: str = Field(min_length=1, max_length=1024)


class PreviousQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    question: str = Field(min_length=1, max_length=1500)
    answer: str = Field(default="", max_length=5000)
    version: str = Field(pattern=r"^[0-9a-f]{64}$")
    sources: list[PreviousSource] = Field(default_factory=list, max_length=8)


class Retrieval(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=1500)
    pageUrl: str | None = Field(default=None, max_length=1500)
    locale: Locale = "es"
    history: list[PreviousQuestion] = Field(default_factory=list, max_length=4)
    contextIds: list[str] = Field(default_factory=list, max_length=2)
    continuity: str = Field(default="", max_length=1200)


RESOURCE = r"(?:v[ií]deo|recurso|resource|risorsa|gu[ií]a|guide|guida|curso|course|corso|materiale?|tutorial|link|enlace|fuente|source|fonte|lesson|lecci[oó]n|aula|lezione)"
ORDINALS = ("primer|primero|primera|first|primeiro|primeira|primo|prima|1st|1[ºª]",
            "segundo|segunda|second|secondo|seconda|2nd|2[ºª]", "tercer|tercero|tercera|third|terceiro|terceira|terzo|terza|3rd|3[ºª]",
            "cuarto|cuarta|fourth|quarto|quarta|4th|4[ºª]", "quinto|quinta|fifth|5th|5[ºª]",
            "sexto|sexta|sixth|sesto|sesta|6th|6[ºª]", "s[eé]ptimo|s[eé]ptima|seventh|s[eé]timo|s[eé]tima|settimo|settima|7th|7[ºª]",
            "octavo|octava|eighth|oitavo|oitava|ottavo|ottava|8th|8[ºª]")


def reference_positions(message: str) -> list[int]:
    return [i for i, ordinal in enumerate(ORDINALS) if re.search(
        rf"\b(?:{ordinal})\s+{RESOURCE}\b|\b(?:el|la|the|o|a|il|lo)\s+(?:{ordinal})\s*[?.!,;:]*\s*$|\b{RESOURCE}\s+(?:n[uú]mero\s+|number\s+)?{i+1}\b",
        message, re.IGNORECASE)]


def retrieval_query(body: Retrieval, version: str) -> str:
    previous = [turn.question for turn in body.history if turn.version == version]
    if not previous and not body.continuity:
        return body.message
    # ponytail: recent questions resolve references without another model call; bounded to 2,000 UTF-8 bytes.
    context = "\n".join([body.continuity, *previous]).encode("utf-8")[-2000:].decode("utf-8", errors="ignore")
    return f"Pregunta actual: {body.message}\n\nPreguntas anteriores (solo contexto):\n{context}"


def previous_reference(body: Retrieval, version: str) -> PreviousSource | None:
    if not body.history or body.history[-1].version != version or not body.history[-1].sources:
        return None
    visible = {}
    for source in body.history[-1].sources:
        visible.setdefault(source.url, source)
    sources = list(visible.values())
    if sum(bool(re.search(rf"\b(?:{ordinal})\b", body.message, re.IGNORECASE)) for ordinal in ORDINALS) > 1:
        return None
    positions = reference_positions(body.message)
    # ponytail: only explicit singular references to the last turn; broader coreference needs measured retrieval.
    if positions:
        return sources[positions[0]] if len(positions) == 1 and positions[0] < len(sources) else None
    if len(sources) == 1 and re.search(
        rf"\b(?:ese|esa|este|esta|aquel|aquella|that|this|esse|essa|aquele|aquela|quel|quella|questo|questa)\s+{RESOURCE}\b",
            body.message, re.IGNORECASE):
        return sources[0]
    return None


def followup_sources(body: Retrieval, version: str) -> list[PreviousSource]:
    if not body.history or body.history[-1].version != version:
        return []
    previous = body.history[-1].sources
    reference = previous_reference(body, version)
    if reference:
        return [source for source in previous if source.url == reference.url]
    # ponytail: explicit anaphora in the four supported languages, not a general coreference resolver.
    # Ambiguous references retain the last turn's alternatives; the generator must ask rather than choose silently.
    demonstrative = r"(?:es[eo]s?|esas?|est[eo]s?|estas?|aquell[oa]s?|that|those|this|these|iss[oa]|[dn]?ess[ea]s?|aquele|aquela|quel(?:lo|la|li|le)?|quest[oaie])"
    subject = r"(?:funci[oó]n|funciones|funcionalidad|feature|function|função|funcionalidade|funzione|funzionalità|v[ií]deos?|recursos?|resources?|risors[ae]|gu[ií]as?|guides?|guid[ae]|cursos?|courses?|cors[oi]|material[ei]?|tutorial|links?|enlaces?|fuentes?|sources?|font[ei]|temas?|topics?|argoment[oi]|conceptos?|concepts?|concett[oi]|opci[oó]n|options?|opção|opzione|t[eé]cnicas?|techniques?|tecnic[ae]|consejos?|advice|conselhos?|consigli[oa])"
    narrative = rf"(?:{'|'.join(ORDINALS)})\s+(?:pr[aá]cticas?|practices?|pr[aá]ticas?|pratiche|exerc[ií]cios?|esercizi[oa]|pasos?|steps?|pass[oi]|ejemplos?|examples?|exemplos?|esempi[oa])"
    elliptical = r"(?:c[oó]mo\s+se\s+aplica|como\s+se\s+aplica|come\s+si\s+applica|explain\s+that\s+further|explique\s+melhor\s+isso|spiega\s+meglio\s+questo)\s*[?.!]*\s*$|how\s+(?:does|can)\s+(?:it|that)\b"
    return previous if reference_positions(body.message) or re.search(
        rf"\b{demonstrative}\s+{subject}\b|\b{narrative}\b|\b(?:{elliptical})", body.message, re.IGNORECASE) else []


def select_evidence(body: Retrieval, evidence: list[dict], sources: dict, latest: dict, root: Path) -> tuple[list[dict], list[dict]]:
    localized = localized_evidence(root, body.locale, body.message, sources, latest)
    native_segments = [item for item in evidence if item.get("kind") == "segment"]
    evidence = ([item for pair in zip_longest(native_segments, localized) for item in pair if item is not None]
                + [item for item in evidence if item.get("kind") != "segment"])
    previous = followup_sources(body, latest["contentHash"])
    remembered = supported_fragments([{"kind": "segment", "document_name": source.id} for source in previous],
                                     sources, latest, limit=None, max_bytes=None)
    # Session references only nominate current snapshot segments; their text and links never override the manifest.
    identities = {(source.id, source.title, source.url) for source in previous}
    references = [{"kind": "segment", "document_name": fragment["id"]} for fragment in remembered
                  if (fragment["id"], fragment["title"], fragment["url"]) in identities]
    # Preserve the ordinary selection order; only a follow-up protects its revalidated references before the cap.
    current = {doc["id"]: doc for doc in latest["documents"]}
    # Context IDs locate only registered, current evidence on this page. They never supply facts.
    context_ids = {identifier for identifier in body.contextIds if identifier in current
                   and current[identifier]["url"].split("#")[0] == (body.pageUrl or "").split("#")[0]}
    explicit_context = [{"kind": "segment", "document_name": name}
                        for name, source in sources.items() if source["id"] in context_ids]
    page_context = [{"kind": "segment", "document_name": name} for name, source in sources.items()
                     if source["id"] in current and (source["id"] == "home" or current[source["id"]]["url"] == body.pageUrl)]
    return supported_fragments(explicit_context + references + page_context + evidence, sources, latest), references + evidence


@asynccontextmanager
async def lifespan(app: FastAPI):
    root = Path(os.environ.get("CERTICHAT_DATA_DIR", "/data"))
    root.mkdir(parents=True, exist_ok=True)
    token = os.environ["CERTICHAT_CHAT_INTERNAL_TOKEN"]
    app.state.root, app.state.token, app.state.snapshot = root, token, None
    app.state.lock = asyncio.Lock()
    if not (root / "active.json").exists():
        yield
        return
    version = read_json(root / "active.json")["version"]
    snapshot = snapshot_path(root, version)
    if read_json(snapshot / "ready.json")["version"] != version:
        raise RuntimeError("Snapshot is not ready")
    app.state.manifest = read_json(snapshot / "manifest.json")
    if app.state.manifest["contentHash"] != version:
        raise RuntimeError("Snapshot manifest does not match its stores")
    app.state.sources = read_json(snapshot / "sources.json")
    app.state.graph_generated_at = (read_json(snapshot / "ready.json").get("generatedAt")
                                   or datetime.fromtimestamp((snapshot / "ready.json").stat().st_mtime, timezone.utc).isoformat())
    app.state.graph_version = digest(version + app.state.graph_generated_at)
    app.state.version, app.state.snapshot = version, snapshot
    stores_lock = (root / "stores.lock").open("a")
    try:
        fcntl.flock(stores_lock, fcntl.LOCK_SH | fcntl.LOCK_NB)
        configure_cognee(snapshot, token)
        # Open stores through a metadata-only startup check; no paid search on restart.
        from cognee.context_global_variables import set_database_global_context_variables
        from cognee.modules.users.methods import get_default_user
        from cognee.modules.data.methods import get_authorized_existing_datasets
        from cognee.infrastructure.databases.graph import get_graph_engine
        from cognee.infrastructure.databases.vector import get_vector_engine_async
        user = await get_default_user()
        datasets = await get_authorized_existing_datasets([DATASET], "read", user, strict=True)
        # ponytail: this worker owns one snapshot; keep its stores pinned until shutdown.
        # Cognee otherwise closes idle subprocesses after 10 minutes, making the next query cold.
        async with set_database_global_context_variables(datasets[0].id, user.id):
            if await (await get_graph_engine()).is_empty():
                raise RuntimeError("Snapshot graph is empty")
            if not await (await get_vector_engine_async()).has_collection("Entity_name"):
                raise RuntimeError("Snapshot vector collection is missing")
            async with app.state.lock:
                await cached_graph()
            yield
    finally:
        try:
            await close_cognee()
        finally:
            stores_lock.close()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/health")
async def health():
    indexing = False
    with (app.state.root / "index.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            indexing = True
    try:
        checked_at = datetime.fromtimestamp((app.state.root / "latest.json").stat().st_mtime, timezone.utc).isoformat()
    except FileNotFoundError:
        checked_at = None
    return {"status": "ready" if app.state.snapshot else "waiting", "version": getattr(app.state, "version", None),
            "indexing": indexing, "checkedAt": checked_at}


async def cached_graph():
    # The owning process has one immutable active snapshot; callers hold its graph lock.
    cached = getattr(app.state, "public_graph", None)
    version = getattr(app.state, "graph_version", app.state.version)
    if cached is None or cached["version"] != version:
        nodes, edges = await asyncio.wait_for(read_graph(), timeout=30)
        cached = public_graph(nodes, edges, version)
        cached["generatedAt"] = getattr(app.state, "graph_generated_at", cached["generatedAt"])
        app.state.node_documents = node_documents(nodes, edges)
        app.state.public_graph = cached
    return cached


@app.get("/graph")
async def graph(authorization: str = Header(default="")):
    if not hmac.compare_digest(authorization, f"Bearer {app.state.token}"):
        raise HTTPException(401, "Unauthorized")
    if not app.state.snapshot or app.state.lock.locked():
        raise HTTPException(503, "Knowledge graph unavailable")
    async with app.state.lock:
        try:
            return await cached_graph()
        except Exception:
            raise HTTPException(503, "Knowledge graph unavailable") from None


@app.post("/retrieve")
async def retrieve(body: Retrieval, authorization: str = Header(default="")):
    if not hmac.compare_digest(authorization, f"Bearer {app.state.token}"):
        raise HTTPException(401, "Unauthorized")
    if not app.state.snapshot:
        raise HTTPException(503, "Knowledge is not ready")
    latest_path = app.state.root / "latest.json"
    try:
        latest = validate_manifest(read_json(latest_path))
        if time.time() - latest_path.stat().st_mtime > 1800:
            raise ValueError("Published manifest verification expired")
    except (OSError, ValueError):
        raise HTTPException(503, "Knowledge freshness is unverified") from None
    if body.pageUrl and not public_url(body.pageUrl):
        raise HTTPException(400, "Invalid page")
    # Interactive pages have no corpus entry; their optional hint must not block general questions.
    if app.state.lock.locked():
        raise HTTPException(503, "Knowledge retrieval busy")
    # Graph adapters use per-context state; serialize to keep one deterministic owner.
    async with app.state.lock:
        try:
            evidence = await asyncio.wait_for(
                retrieve_evidence(body.message, retrieval_query(body, latest["contentHash"])), timeout=20)
            projection = await cached_graph()
        except Exception:
            raise HTTPException(503, "Knowledge retrieval unavailable") from None
    # Re-read after search so removals published during retrieval are excluded too.
    latest = validate_manifest(read_json(latest_path))
    fragments, evidence = select_evidence(body, evidence, app.state.sources, latest, app.state.root)
    # Unrelated edits must not hide valid evidence; accepted fragments already exclude stale content.
    documents = getattr(app.state, "node_documents", {})
    trace_evidence = current_evidence(evidence, fragments, documents)
    return {"version": latest["contentHash"], "fragments": fragments,
            "graphTrace": graph_trace(trace_evidence, projection, fragments, documents)}

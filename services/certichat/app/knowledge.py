"""One private process owns the embedded stores for the active snapshot."""

import asyncio
import fcntl
import hmac
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from itertools import zip_longest
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .corpus import (DATASET, SITE, public_url, read_json,
                     snapshot_path, supported_fragments, validate_manifest)
from .graph import current_evidence, graph_trace, node_documents, public_graph, read_graph


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
        "LLM_ENDPOINT": endpoint, "LLM_API_KEY": token, "LLM_MAX_COMPLETION_TOKENS": "4096",
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
        for query, kind in ((message, SearchType.RAG_COMPLETION), (context or message, SearchType.GRAPH_COMPLETION))],
        return_exceptions=True)
    successful = [lane for lane in results if not isinstance(lane, BaseException)]
    evidence = [[item for result in lane for item in result.get("evidence", [])] for lane in successful]
    segments = [[item for item in lane if item.get("kind") == "segment"] for lane in evidence]
    if not any(segments) and len(successful) != len(results):
        raise next(lane for lane in results if isinstance(lane, BaseException))
    # Keep current-question document matches independent of history; reserve room for graph context by rank.
    return ([item for pair in zip_longest(*segments) for item in pair if item is not None]
            + [item for lane in evidence for item in lane if item.get("kind") != "segment"])


class PreviousQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    question: str = Field(min_length=1, max_length=1500)
    version: str = Field(pattern=r"^[0-9a-f]{64}$")


class Retrieval(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=1500)
    pageUrl: str | None = Field(default=None, max_length=1500)
    history: list[PreviousQuestion] = Field(default_factory=list, max_length=4)


def retrieval_query(body: Retrieval, version: str) -> str:
    previous = [turn.question for turn in body.history if turn.version == version]
    if not previous:
        return body.message
    # ponytail: recent questions resolve references without another model call; bounded to 2,000 UTF-8 bytes.
    context = "\n".join(previous).encode("utf-8")[-2000:].decode("utf-8", errors="ignore")
    return f"Pregunta actual: {body.message}\n\nPreguntas anteriores (solo contexto):\n{context}"


@asynccontextmanager
async def lifespan(app: FastAPI):
    root = Path(os.environ.get("CERTICHAT_DATA_DIR", "/data"))
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
    return {"status": "ready" if app.state.snapshot else "waiting", "version": getattr(app.state, "version", None), "indexing": indexing}


async def cached_graph():
    # The owning process has one immutable active snapshot; callers hold its graph lock.
    cached = getattr(app.state, "public_graph", None)
    if cached is None or cached["version"] != app.state.version:
        nodes, edges = await asyncio.wait_for(read_graph(), timeout=30)
        cached = public_graph(nodes, edges, app.state.version)
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
    # The published root describes site navigation; both it and the current page obey source/freshness limits.
    current = {doc["id"]: doc for doc in latest["documents"]}
    page_context = [{"kind": "segment", "document_name": name}
                    for name, source in app.state.sources.items()
                    if source["id"] in current and current[source["id"]]["url"] in (SITE, body.pageUrl)]
    fragments = supported_fragments(page_context + evidence, app.state.sources, latest)
    # Unrelated edits must not hide valid evidence; accepted fragments already exclude stale content.
    documents = getattr(app.state, "node_documents", {})
    trace_evidence = current_evidence(evidence, fragments, documents)
    return {"version": latest["contentHash"], "fragments": fragments,
            "graphTrace": graph_trace(trace_evidence, projection, fragments, documents)}

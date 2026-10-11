"""One private process owns the embedded stores for the active snapshot."""

import asyncio
import hmac
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .corpus import DATASET, public_url, read_json, snapshot_path, supported_fragments, validate_manifest
from .graph import public_graph, read_graph


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


async def retrieve_evidence(message: str) -> list[dict]:
    import cognee
    from cognee.api.v1.search import SearchType
    results = await cognee.search(message, query_type=SearchType.GRAPH_COMPLETION,
                                  datasets=[DATASET], only_context=True, verbose=True,
                                  include_references=True, feedback_influence=0, top_k=8)
    return [item for result in results for item in result.get("evidence", [])]


class Retrieval(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=1500)
    pageUrl: str | None = Field(default=None, max_length=1500)


@asynccontextmanager
async def lifespan(app: FastAPI):
    root = Path(os.environ.get("CERTICHAT_DATA_DIR", "/data"))
    token = os.environ["CERTICHAT_CHAT_INTERNAL_TOKEN"]
    app.state.root, app.state.token, app.state.snapshot = root, token, None
    app.state.lock = asyncio.Lock()
    if (root / "active.json").exists():
        version = read_json(root / "active.json")["version"]
        snapshot = snapshot_path(root, version)
        if read_json(snapshot / "ready.json")["version"] != version:
            raise RuntimeError("Snapshot is not ready")
        app.state.sources = read_json(snapshot / "sources.json")
        app.state.version, app.state.snapshot = version, snapshot
        configure_cognee(snapshot, token)
        # Open stores through a metadata-only startup check; no paid search on restart.
        from cognee.context_global_variables import set_database_global_context_variables
        from cognee.modules.users.methods import get_default_user
        from cognee.modules.data.methods import get_authorized_existing_datasets
        from cognee.infrastructure.databases.graph import get_graph_engine
        user = await get_default_user()
        datasets = await get_authorized_existing_datasets([DATASET], "read", user, strict=True)
        async with set_database_global_context_variables(datasets[0].id, user.id):
            if await (await get_graph_engine()).is_empty():
                raise RuntimeError("Snapshot graph is empty")
    yield
    if app.state.snapshot:
        await close_cognee()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/health")
async def health():
    return {"status": "ready" if app.state.snapshot else "waiting", "version": getattr(app.state, "version", None)}


@app.get("/graph")
async def graph(authorization: str = Header(default="")):
    if not hmac.compare_digest(authorization, f"Bearer {app.state.token}"):
        raise HTTPException(401, "Unauthorized")
    if not app.state.snapshot or app.state.lock.locked():
        raise HTTPException(503, "Knowledge graph unavailable")
    async with app.state.lock:
        try:
            nodes, edges = await asyncio.wait_for(read_graph(), timeout=30)
            return public_graph(nodes, edges, app.state.version)
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
            evidence = await asyncio.wait_for(retrieve_evidence(body.message), timeout=20)
        except Exception:
            raise HTTPException(503, "Knowledge retrieval unavailable") from None
    # Re-read after search so removals published during retrieval are excluded too.
    latest = validate_manifest(read_json(latest_path))
    # The explicit page context uses the same freshness and source checks as graph evidence.
    page_context = [{"kind": "segment", "document_name": name}
                    for name, source in app.state.sources.items() if source["url"] == body.pageUrl]
    return {"version": latest["contentHash"],
            "fragments": supported_fragments(page_context + evidence, app.state.sources, latest, body.message)}

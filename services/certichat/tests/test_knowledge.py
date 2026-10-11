"""Published freshness must invalidate conversational context before snapshot promotion."""

import asyncio
from contextlib import asynccontextmanager
import sys
from types import SimpleNamespace

import pytest

from app import knowledge
from app.corpus import CORPUS_URL, SITE, atomic_json, digest, segments, snapshot_path


@pytest.mark.parametrize("vector_ready", [True, False])
def test_lifespan_keeps_both_stores_warm_until_shutdown(tmp_path, monkeypatch, vector_ready):
    version = "a" * 64
    snapshot = snapshot_path(tmp_path, version)
    snapshot.mkdir(parents=True)
    atomic_json(tmp_path / "active.json", {"version": version})
    atomic_json(snapshot / "ready.json", {"version": version})
    atomic_json(snapshot / "sources.json", {})
    monkeypatch.setenv("CERTICHAT_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CERTICHAT_CHAT_INTERNAL_TOKEN", "t" * 32)
    monkeypatch.setattr(knowledge.app, "state", SimpleNamespace())
    events, active = [], set()

    @asynccontextmanager
    async def context(dataset, user):
        assert (dataset, user) == ("dataset", "user")
        active.add(dataset)
        events.append("pin")
        try:
            yield
        finally:
            active.remove(dataset)
            events.append("release")

    async def user():
        return SimpleNamespace(id="user")

    async def datasets(*_args, **_kwargs):
        return [SimpleNamespace(id="dataset")]

    async def is_empty():
        events.append("graph")
        return False

    async def has_collection(name):
        assert name == "Entity_name" and active == {"dataset"}
        events.append("vector")
        return vector_ready

    async def graph():
        return SimpleNamespace(is_empty=is_empty)

    async def vector():
        return SimpleNamespace(has_collection=has_collection)

    async def projection():
        assert active == {"dataset"} and events[-1] == "vector"
        events.append("projection")

    async def close():
        assert not active
        events.append("close")

    for name, value in {
        "cognee.context_global_variables": SimpleNamespace(set_database_global_context_variables=context),
        "cognee.modules.users.methods": SimpleNamespace(get_default_user=user),
        "cognee.modules.data.methods": SimpleNamespace(get_authorized_existing_datasets=datasets),
        "cognee.infrastructure.databases.graph": SimpleNamespace(get_graph_engine=graph),
        "cognee.infrastructure.databases.vector": SimpleNamespace(get_vector_engine_async=vector),
    }.items():
        monkeypatch.setitem(sys.modules, name, value)
    monkeypatch.setattr(knowledge, "configure_cognee", lambda *_: events.append("configure"))
    monkeypatch.setattr(knowledge, "cached_graph", projection)
    monkeypatch.setattr(knowledge, "close_cognee", close)

    async def run():
        async with knowledge.lifespan(knowledge.app):
            # A ready worker must retain the dataset pin even when no query is active.
            assert active == {"dataset"}
            assert events == ["configure", "pin", "graph", "vector", "projection"]
            assert (await knowledge.health())["status"] == "ready"

    if vector_ready:
        asyncio.run(run())
    else:
        with pytest.raises(RuntimeError, match="Snapshot vector collection is missing"):
            asyncio.run(run())
    assert events[-2:] == ["release", "close"]


@pytest.fixture(autouse=True)
def empty_graph(monkeypatch):
    async def read():
        return [], []
    monkeypatch.setattr(knowledge, "read_graph", read)


@pytest.mark.parametrize("page_url", [None, SITE + "changed/", SITE + "removed/"])
def test_retrieval_uses_latest_manifest_after_search_while_health_keeps_snapshot(tmp_path, monkeypatch, page_url):
    documents = [{"id": name, "title": name, "courseId": "course", "url": SITE + name + "/",
                  "text": f"Información original de {name}."} for name in ("stable", "changed", "removed")]
    sources = segments(documents)
    initial = {"schemaVersion": 1, "contentHash": "a"*64, "corpusUrl": CORPUS_URL,
               "documents": [{key: value for key, value in doc.items() if key != "text"} |
                             {"hash": digest(doc["text"])} for doc in documents]}
    current = {**initial, "contentHash": "b"*64,
               "documents": [initial["documents"][0], {**initial["documents"][1], "hash": digest("Nuevo contenido")}]}
    atomic_json(tmp_path / "latest.json", initial)
    state = SimpleNamespace(root=tmp_path, token="test-token", snapshot=tmp_path, version="a"*64,
                            sources=sources, lock=asyncio.Lock())
    monkeypatch.setattr(knowledge.app, "state", state)

    async def evidence(_message):
        atomic_json(tmp_path / "latest.json", current)
        return [{"kind": "segment", "document_name": name.removesuffix(".txt")} for name in sources]

    monkeypatch.setattr(knowledge, "retrieve_evidence", evidence)
    result = asyncio.run(knowledge.retrieve(knowledge.Retrieval(message="Información del curso", pageUrl=page_url), "Bearer test-token"))
    assert result["version"] == current["contentHash"]
    assert result["graphTrace"]["version"] == initial["contentHash"]
    assert [fragment["url"] for fragment in result["fragments"]] == [SITE + "stable/"]
    assert asyncio.run(knowledge.health()) == {"status": "ready", "version": "a"*64}


def test_current_page_precedes_graph_results_with_existing_source_limit(tmp_path, monkeypatch):
    documents = [{"id": name, "title": name, "courseId": "course", "url": SITE + name + "/",
                  "text": f"Información publicada de {name}."} for name in ["current", *[f"graph{i}" for i in range(7)]]]
    sources = segments(documents)
    manifest = {"schemaVersion": 1, "contentHash": "a"*64, "corpusUrl": CORPUS_URL,
                "documents": [{key: value for key, value in doc.items() if key != "text"} |
                              {"hash": digest(doc["text"])} for doc in documents]}
    atomic_json(tmp_path / "latest.json", manifest)
    monkeypatch.setattr(knowledge.app, "state", SimpleNamespace(
        root=tmp_path, token="test-token", snapshot=tmp_path, version="a"*64, sources=sources, lock=asyncio.Lock()))

    async def evidence(_message):
        names = list(sources)
        return [{"kind": "segment", "document_name": name} for name in [*names[1:], names[0]]]

    monkeypatch.setattr(knowledge, "retrieve_evidence", evidence)
    result = asyncio.run(knowledge.retrieve(
        knowledge.Retrieval(message="Información de esta página", pageUrl=SITE + "current/"), "Bearer test-token"))
    assert [fragment["title"] for fragment in result["fragments"]] == ["current", *[f"graph{i}" for i in range(5)]]


@pytest.mark.parametrize("question,first", [("que sabes de dama y oci", "governance"),
                                           ("Qué cursos reúne Foundation", "home")])
def test_specific_visible_evidence_precedes_home_before_context_limits(tmp_path, monkeypatch, question, first):
    documents = [{"id": "home", "title": "Rutas", "courseId": "site", "url": SITE,
                  "text": "Foundation reúne tres cursos. " + "OCI: " * 340 + "DAMA está en Governance."},
                 *[{"id": f"oci{i}", "title": "OCI Enterprise AI", "courseId": "agents",
                    "url": SITE + f"oci{i}/", "text": "OCI Enterprise AI usa proyectos y herramientas. " * 35}
                   for i in range(6)],
                 {"id": "governance", "title": "Tu punto de partida", "courseId": "data-governance",
                  "url": SITE + "data-governance/overview/", "text":
                  "DAMA es un marco de gestión de datos. El taller aplica sus principios con Oracle Cloud."}]
    sources = segments(documents)
    manifest = {"schemaVersion": 1, "contentHash": "a"*64, "corpusUrl": CORPUS_URL,
                "documents": [{key: value for key, value in doc.items() if key != "text"} |
                              {"hash": digest(doc["text"])} for doc in documents]}
    atomic_json(tmp_path / "latest.json", manifest)
    monkeypatch.setattr(knowledge.app, "state", SimpleNamespace(
        root=tmp_path, token="test-token", snapshot=tmp_path, version="a"*64, sources=sources, lock=asyncio.Lock()))

    async def evidence(_message):
        return [{"kind": "segment", "document_name": name} for name in sources]

    monkeypatch.setattr(knowledge, "retrieve_evidence", evidence)
    result = asyncio.run(knowledge.retrieve(
        knowledge.Retrieval(message=question, pageUrl=SITE), "Bearer test-token"))
    assert result["fragments"][0]["url"] == (SITE if first == "home" else SITE + "data-governance/overview/")
    assert len(result["fragments"]) == 6


@pytest.mark.parametrize("current", [True, False])
def test_trace_uses_same_search_evidence_and_active_version_only_with_valid_sources(tmp_path, monkeypatch, current):
    node = "00000000-0000-0000-0000-000000000001"
    doc = {"id": "guide", "title": "Guía", "courseId": "course", "url": SITE + "guide/", "text": "Información publicada."}
    sources = segments([doc])
    manifest = {"schemaVersion": 1, "contentHash": "b"*64, "corpusUrl": CORPUS_URL,
                "documents": [{key: value for key, value in doc.items() if key != "text"} |
                              {"hash": digest(doc["text"] if current else "Nuevo contenido")}]}
    atomic_json(tmp_path / "latest.json", manifest)
    projection = {"version": "a"*64, "nodes": [{"id": node}], "edges": []}
    monkeypatch.setattr(knowledge.app, "state", SimpleNamespace(
        root=tmp_path, token="test-token", snapshot=tmp_path, version="a"*64, sources=sources,
        lock=asyncio.Lock(), public_graph=projection))
    calls = []

    async def evidence(message):
        calls.append(message)
        return [{"kind": "graph_node", "artifact_id": node},
                {"kind": "segment", "document_name": next(iter(sources))}]

    monkeypatch.setattr(knowledge, "retrieve_evidence", evidence)
    result = asyncio.run(knowledge.retrieve(knowledge.Retrieval(message="Consulta"), "Bearer test-token"))
    assert calls == ["Consulta"] and result["version"] == "b"*64
    assert result["graphTrace"] == {"version": "a"*64, "nodes": [node] if current else [], "edges": [], "truncated": False}

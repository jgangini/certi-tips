"""Published freshness must invalidate conversational context before snapshot promotion."""

import asyncio
import fcntl
from contextlib import asynccontextmanager
import sys
from types import SimpleNamespace

import pytest

from app import knowledge
from app.corpus import CORPUS_URL, SITE, atomic_json, digest, segments, snapshot_path, supported_fragments


@pytest.mark.parametrize("vector_ready", [True, False])
def test_lifespan_keeps_both_stores_warm_until_shutdown(tmp_path, monkeypatch, vector_ready):
    version = "a" * 64
    snapshot = snapshot_path(tmp_path, version)
    snapshot.mkdir(parents=True)
    atomic_json(tmp_path / "active.json", {"version": version})
    atomic_json(snapshot / "ready.json", {"version": version})
    atomic_json(snapshot / "manifest.json", {"contentHash": version, "documents": []})
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
                            sources=sources, manifest=initial, lock=asyncio.Lock())
    monkeypatch.setattr(knowledge.app, "state", state)

    async def evidence(_message, _context):
        atomic_json(tmp_path / "latest.json", current)
        return [{"kind": "segment", "document_name": name.removesuffix(".txt")} for name in sources]

    monkeypatch.setattr(knowledge, "retrieve_evidence", evidence)
    result = asyncio.run(knowledge.retrieve(knowledge.Retrieval(message="Información del curso", pageUrl=page_url), "Bearer test-token"))
    assert result["version"] == current["contentHash"]
    assert result["graphTrace"]["version"] == initial["contentHash"]
    assert [fragment["url"] for fragment in result["fragments"]] == [SITE + "stable/"]
    assert asyncio.run(knowledge.health()) == {"status": "ready", "version": "a"*64, "indexing": False}


def test_health_tracks_the_live_index_lock_and_stops_after_release(tmp_path, monkeypatch):
    monkeypatch.setattr(knowledge.app, "state", SimpleNamespace(root=tmp_path, snapshot=tmp_path, version="a"*64))
    with (tmp_path / "index.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        assert asyncio.run(knowledge.health())["indexing"] is True
    assert asyncio.run(knowledge.health())["indexing"] is False


def test_current_page_precedes_graph_results_with_existing_source_limit(tmp_path, monkeypatch):
    documents = [{"id": name, "title": name, "courseId": "course", "url": SITE + name + "/",
                  "text": f"Información publicada de {name}."} for name in ["current", *[f"graph{i}" for i in range(7)]]]
    sources = segments(documents)
    manifest = {"schemaVersion": 1, "contentHash": "a"*64, "corpusUrl": CORPUS_URL,
                "documents": [{key: value for key, value in doc.items() if key != "text"} |
                              {"hash": digest(doc["text"])} for doc in documents]}
    atomic_json(tmp_path / "latest.json", manifest)
    monkeypatch.setattr(knowledge.app, "state", SimpleNamespace(
        root=tmp_path, token="test-token", snapshot=tmp_path, version="a"*64, sources=sources, manifest=manifest, lock=asyncio.Lock()))

    async def evidence(_message, _context):
        names = list(sources)
        return [{"kind": "segment", "document_name": name} for name in [*names[1:], names[0]]]

    monkeypatch.setattr(knowledge, "retrieve_evidence", evidence)
    result = asyncio.run(knowledge.retrieve(
        knowledge.Retrieval(message="Información de esta página", pageUrl=SITE + "current/"), "Bearer test-token"))
    assert [fragment["title"] for fragment in result["fragments"]] == ["current", *[f"graph{i}" for i in range(7)]]


@pytest.mark.parametrize("fresh", [True, False])
def test_chat_page_includes_published_navigation_only_while_its_hash_matches(tmp_path, monkeypatch, fresh):
    documents = [{"id": "home", "title": "Oferta y rutas", "courseId": "site", "url": SITE,
                  "text": "Curso publicado: Fundamentos. Curso futuro: Diseño."},
                 {"id": "guide", "title": "Guía", "courseId": "course", "url": SITE + "guide/#concept",
                  "text": "Concepto publicado en la guía."}]
    sources = segments(documents)
    manifest = {"schemaVersion": 1, "contentHash": "a"*64, "corpusUrl": CORPUS_URL,
                "documents": [{key: value for key, value in doc.items() if key != "text"} |
                              {"hash": digest(doc["text"])} for doc in documents]}
    if not fresh:
        manifest["documents"][0]["hash"] = digest("Nueva oferta publicada")
    atomic_json(tmp_path / "latest.json", manifest)
    monkeypatch.setattr(knowledge.app, "state", SimpleNamespace(
        root=tmp_path, token="test-token", snapshot=tmp_path, version="a"*64, sources=sources, manifest=manifest, lock=asyncio.Lock()))

    async def evidence(message, context):
        assert message == context == "¿Qué puedo estudiar aquí?"
        return [{"kind": "segment", "document_name": list(sources)[1]}]

    monkeypatch.setattr(knowledge, "retrieve_evidence", evidence)
    result = asyncio.run(knowledge.retrieve(
        knowledge.Retrieval(message="¿Qué puedo estudiar aquí?", pageUrl=SITE + "certichat/"), "Bearer test-token"))
    assert [fragment["title"] for fragment in result["fragments"]] == (["Oferta y rutas", "Guía"] if fresh else ["Guía"])


@pytest.mark.parametrize("question", ["que sabes de dama y oci", "Qué cursos reúne Foundation"])
def test_compound_evidence_preserves_retrieved_order_and_late_source(tmp_path, monkeypatch, question):
    documents = [{"id": "home", "title": "Rutas", "courseId": "site", "url": SITE,
                  "text": "Foundation reúne tres cursos. " + "OCI: " * 340 + "DAMA está en Governance."},
                 *[{"id": f"oci{i}", "title": "OCI Enterprise AI", "courseId": "agents",
                    "url": SITE + f"oci{i}/", "text": "OCI Enterprise AI usa proyectos y herramientas. " * 35}
                   for i in range(6)],
                 {"id": "governance", "title": "Tu punto de partida", "courseId": "data-governance",
                  "url": SITE + "CDMP-DMF/overview/", "text":
                  "DAMA es un marco de gestión de datos. El taller aplica sus principios con Oracle Cloud."}]
    sources = segments(documents)
    manifest = {"schemaVersion": 1, "contentHash": "a"*64, "corpusUrl": CORPUS_URL,
                "documents": [{key: value for key, value in doc.items() if key != "text"} |
                              {"hash": digest(doc["text"])} for doc in documents]}
    atomic_json(tmp_path / "latest.json", manifest)
    monkeypatch.setattr(knowledge.app, "state", SimpleNamespace(
        root=tmp_path, token="test-token", snapshot=tmp_path, version="a"*64, sources=sources, manifest=manifest, lock=asyncio.Lock()))

    async def evidence(_message, _context):
        return [{"kind": "segment", "document_name": name} for name in sources]

    monkeypatch.setattr(knowledge, "retrieve_evidence", evidence)
    result = asyncio.run(knowledge.retrieve(
        knowledge.Retrieval(message=question, pageUrl=SITE), "Bearer test-token"))
    assert result["fragments"][0]["url"] == SITE
    assert result["fragments"][-1]["url"] == SITE + "CDMP-DMF/overview/"
    assert len(result["fragments"]) == 8
    assert "DAMA está en Governance" in result["fragments"][0]["text"]


@pytest.mark.parametrize("current", [True, False])
def test_followup_retrieval_uses_only_current_version_questions(tmp_path, monkeypatch, current):
    manifest = {"schemaVersion": 1, "contentHash": "a" * 64, "corpusUrl": CORPUS_URL,
                "documents": [{"id": "guide", "title": "Guía", "courseId": "course",
                               "url": SITE + "guide/", "hash": digest("Contenido")}]}
    atomic_json(tmp_path / "latest.json", manifest)
    monkeypatch.setattr(knowledge.app, "state", SimpleNamespace(
        root=tmp_path, token="test-token", snapshot=tmp_path, version="a"*64, sources={}, manifest=manifest, lock=asyncio.Lock()))
    queries = []

    async def evidence(message, context):
        queries.append((message, context))
        return []

    monkeypatch.setattr(knowledge, "retrieve_evidence", evidence)
    question = "en donde puedo investigar mas sobre este tema o relacion"
    body = knowledge.Retrieval(message=question, history=[
        {"question": "que sabes de dama y oci", "version": ("a" if current else "b") * 64}])
    asyncio.run(knowledge.retrieve(body, "Bearer test-token"))
    assert queries[0][0] == question
    assert question in queries[0][1]
    assert ("que sabes de dama y oci" in queries[0][1]) is current


def test_retrieval_context_preserves_current_question_and_bounds_recent_history():
    body = knowledge.Retrieval(message="Ahora explícame las regiones de OCI", history=[
        {"question": "antiguo" * 200, "version": "a" * 64},
        {"question": "á" * 1480 + " más reciente", "version": "a" * 64}])
    query = knowledge.retrieval_query(body, "a" * 64)
    assert query.startswith("Pregunta actual: " + body.message)
    assert query.endswith(" más reciente") and "antiguo" not in query
    assert len(query.split("solo contexto):\n")[1].encode()) <= 2000


@pytest.mark.parametrize("question,previous", [
    ("¿Qué es una región?", []),
    ("¿Qué sabes de DAMA y OCI?", []),
    ("Dame los enlaces de esos temas", ["¿Qué sabes de DAMA y OCI?"]),
    ("cuales son las certificaciones de oci que tienes", ["que sabes de dama y oci", "dame los enlaces"]),
])
def test_native_document_question_stays_independent_and_balanced_with_graph_context(monkeypatch, question, previous):
    body = knowledge.Retrieval(message=question, history=[{"question": q, "version": "a"*64} for q in previous])
    context = knowledge.retrieval_query(body, "a"*64)
    documents = [{"id": f"{lane}{i}", "title": f"{lane}{i}", "courseId": "course",
                  "url": SITE + f"{lane}/#source-{i}", "text": "Información publicada. "*80}
                 for lane in ("document", "graph") for i in range(8)]
    sources = segments(documents)
    manifest = {"documents": [{key: value for key, value in doc.items() if key != "text"} |
                              {"hash": digest(doc["text"])} for doc in documents]}
    names = list(sources)
    calls = []

    async def search(query, **options):
        calls.append((query, options))
        start = 0 if options["query_type"] == "document" else 8
        # Graph metadata must not consume the source slots before alternating the actual segments.
        return [{"evidence": [{"kind": "graph_node", "artifact_id": "node"}]
                 + [{"kind": "segment", "document_name": name.removesuffix(".txt")} for name in names[start:start+8]]}]

    monkeypatch.setitem(sys.modules, "cognee", SimpleNamespace(search=search))
    monkeypatch.setitem(sys.modules, "cognee.api.v1.search", SimpleNamespace(
        SearchType=SimpleNamespace(RAG_COMPLETION="document", GRAPH_COMPLETION="graph")))
    evidence = asyncio.run(knowledge.retrieve_evidence(question, context))
    assert [call[0] for call in calls] == [question, context]
    assert all(call[1] == {"query_type": lane, "datasets": ["certitips"], "only_context": True,
                          "verbose": True, "include_references": True, "feedback_influence": 0, "top_k": 8}
               for call, lane in zip(calls, ("document", "graph")))
    fragments = supported_fragments(evidence, sources, manifest)
    assert [f["title"] for f in fragments] == [f"{lane}{i}" for i in range(4) for lane in ("document", "graph")]
    assert sum(len(f["text"].encode()) for f in fragments) <= 16000
    assert all("#source-" in f["url"] for f in fragments)


@pytest.mark.parametrize("failures,empty", [({"document"}, False), ({"graph"}, False),
                                          ({"document", "graph"}, False), ({"document"}, True)])
def test_native_search_uses_surviving_lane_but_does_not_hide_total_failure(monkeypatch, failures, empty):
    async def search(_query, **options):
        lane = options["query_type"]
        if lane in failures:
            raise RuntimeError(lane)
        return [{"evidence": [] if empty else [{"kind": "segment", "document_name": lane}]}]

    monkeypatch.setitem(sys.modules, "cognee", SimpleNamespace(search=search))
    monkeypatch.setitem(sys.modules, "cognee.api.v1.search", SimpleNamespace(
        SearchType=SimpleNamespace(RAG_COMPLETION="document", GRAPH_COMPLETION="graph")))
    if len(failures) == 2 or empty:
        with pytest.raises(RuntimeError, match="document"):
            asyncio.run(knowledge.retrieve_evidence("Pregunta"))
    else:
        assert asyncio.run(knowledge.retrieve_evidence("Pregunta")) == [
            {"kind": "segment", "document_name": next(iter({"document", "graph"} - failures))}]


def test_native_search_timeout_cancels_slow_lane_and_keeps_completed_evidence(monkeypatch):
    cancelled = []
    wait_for = asyncio.wait_for

    async def search(_query, **options):
        if options["query_type"] == "graph":
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.append(True)
        return [{"evidence": [{"kind": "segment", "document_name": "current"}]}]

    async def bounded(awaitable, timeout):
        assert timeout == 18
        return await wait_for(awaitable, timeout=.01)

    monkeypatch.setitem(sys.modules, "cognee", SimpleNamespace(search=search))
    monkeypatch.setitem(sys.modules, "cognee.api.v1.search", SimpleNamespace(
        SearchType=SimpleNamespace(RAG_COMPLETION="document", GRAPH_COMPLETION="graph")))
    monkeypatch.setattr(knowledge.asyncio, "wait_for", bounded)
    assert asyncio.run(knowledge.retrieve_evidence("Pregunta")) == [
        {"kind": "segment", "document_name": "current"}]
    assert cancelled == [True]


@pytest.mark.parametrize("current,active_version", [(True, "b"*64), (False, "a"*64), (True, "a"*64)])
def test_trace_requires_current_source_even_when_published_navigation_survives(tmp_path, monkeypatch, current, active_version):
    node = "00000000-0000-0000-0000-000000000001"
    doc = {"id": "guide", "title": "Guía", "courseId": "course", "url": SITE + "guide/", "text": "Información publicada."}
    home = {"id": "home", "title": "Rutas", "courseId": "site", "url": SITE, "text": "Oferta publicada."}
    sources = segments([doc, home])
    manifest = {"schemaVersion": 1, "contentHash": "b"*64, "corpusUrl": CORPUS_URL,
                "documents": [{key: value for key, value in doc.items() if key != "text"} |
                              {"hash": digest(doc["text"] if current else "Nuevo contenido")},
                              {key: value for key, value in home.items() if key != "text"} | {"hash": digest(home["text"])}]}
    atomic_json(tmp_path / "latest.json", manifest)
    indexed = {**manifest, "contentHash": active_version,
               "documents": [{**manifest["documents"][0], "hash": digest(doc["text"])}, manifest["documents"][1],
                             {**manifest["documents"][0], "id": "removed-unrelated-document"}]}
    projection = {"version": active_version, "nodes": [{"id": node}], "edges": []}
    monkeypatch.setattr(knowledge.app, "state", SimpleNamespace(
        root=tmp_path, token="test-token", snapshot=tmp_path, version=active_version, sources=sources,
        manifest=indexed, lock=asyncio.Lock(), public_graph=projection, node_documents={node: {next(iter(sources))}}))
    calls = []

    async def evidence(message, _context):
        calls.append(message)
        return [{"kind": "graph_node", "artifact_id": node},
                {"kind": "segment", "document_name": next(iter(sources))}]

    monkeypatch.setattr(knowledge, "retrieve_evidence", evidence)
    result = asyncio.run(knowledge.retrieve(knowledge.Retrieval(message="Consulta"), "Bearer test-token"))
    assert calls == ["Consulta"] and result["version"] == "b"*64
    assert any(fragment["url"] == SITE for fragment in result["fragments"])
    highlight = current
    assert result["graphTrace"] == {"version": active_version, "nodes": [node] if highlight else [], "edges": [], "truncated": False,
                                    **({"sources": [{"nodeId": node, "title": doc["title"], "url": doc["url"]}]} if highlight else {})}


def test_relocated_page_keeps_context_and_graph_identity_with_current_links(tmp_path, monkeypatch):
    node = "00000000-0000-0000-0000-000000000001"
    doc = {"id": "guide", "title": "Guía", "courseId": "course", "url": SITE + "old/#concept",
           "text": "Información que permanece igual."}
    sources = segments([doc])
    indexed = {"schemaVersion": 1, "contentHash": "a" * 64, "corpusUrl": CORPUS_URL,
               "documents": [{key: value for key, value in doc.items() if key != "text"} | {"hash": digest(doc["text"])}]}
    current_url = SITE + "new/#concept"
    current = {**indexed, "contentHash": "b" * 64,
               "documents": [{**indexed["documents"][0], "url": current_url}]}
    atomic_json(tmp_path / "latest.json", current)
    projection = {"version": indexed["contentHash"], "nodes": [{"id": node}], "edges": []}
    monkeypatch.setattr(knowledge.app, "state", SimpleNamespace(
        root=tmp_path, token="test-token", snapshot=tmp_path, version=indexed["contentHash"], sources=sources,
        manifest=indexed, lock=asyncio.Lock(), public_graph=projection,
        node_documents={node: {next(iter(sources))}}))

    async def evidence(*_args):
        # No retrieved segment: the new page hint itself must locate the unchanged indexed text.
        return [{"kind": "graph_node", "artifact_id": node}]

    monkeypatch.setattr(knowledge, "retrieve_evidence", evidence)
    result = asyncio.run(knowledge.retrieve(
        knowledge.Retrieval(message="Explica este concepto", pageUrl=current_url), "Bearer test-token"))
    assert result["version"] == current["contentHash"]
    assert result["fragments"] == [{"id": next(iter(sources)).removesuffix(".txt"), "title": doc["title"],
                                    "url": current_url, "text": doc["text"]}]
    assert result["graphTrace"] == {"version": indexed["contentHash"], "nodes": [node], "edges": [], "truncated": False,
                                    "sources": [{"nodeId": node, "title": doc["title"], "url": current_url}]}
    assert knowledge.app.state.sources == sources and next(iter(sources.values()))["url"] == doc["url"]

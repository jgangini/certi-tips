"""Published freshness must invalidate conversational context before snapshot promotion."""

import asyncio
import fcntl
import os
from datetime import datetime, timezone
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
            assert knowledge.app.state.graph_version == digest(version + knowledge.app.state.graph_generated_at)

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


@pytest.fixture(autouse=True)
def native_chunk_evidence(monkeypatch):
    # The API-only test image omits Cognee; real BM25 integration is checked against the live worker.
    def references(objects, dataset_id):
        return [SimpleNamespace(model_dump=lambda mode, item=item: item) for item in objects or []]
    monkeypatch.setitem(sys.modules, "cognee.modules.retrieval.utils.evidence",
                        SimpleNamespace(chunk_context_evidence=references))


def test_rebuilt_graph_invalidates_trace_for_the_same_corpus(monkeypatch):
    corpus_version = "a" * 64
    versions = [digest(corpus_version + stamp) for stamp in ("2026-10-14T01:00:00Z", "2026-10-14T02:00:00Z")]
    state = SimpleNamespace(version=corpus_version, graph_version=versions[0], graph_generated_at="first")
    monkeypatch.setattr(knowledge.app, "state", state)
    first = asyncio.run(knowledge.cached_graph())
    assert first["version"] == versions[0]
    state.graph_version, state.graph_generated_at = versions[1], "second"
    second = asyncio.run(knowledge.cached_graph())
    assert second["version"] == versions[1] != first["version"]
    assert second["generatedAt"] == "second"


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
    assert asyncio.run(knowledge.health()) == {"status": "ready", "version": "a"*64, "indexing": False,
        "checkedAt": datetime.fromtimestamp((tmp_path / "latest.json").stat().st_mtime, timezone.utc).isoformat()}


def test_health_tracks_the_live_index_lock_and_stops_after_release(tmp_path, monkeypatch):
    monkeypatch.setattr(knowledge.app, "state", SimpleNamespace(root=tmp_path, snapshot=tmp_path, version="a"*64))
    with (tmp_path / "index.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        assert asyncio.run(knowledge.health())["indexing"] is True
    assert asyncio.run(knowledge.health())["indexing"] is False
    assert asyncio.run(knowledge.health())["checkedAt"] is None
    latest = tmp_path / "latest.json"
    atomic_json(latest, {"contentHash": "b"*64})
    for timestamp in (1791878400, 1791878700):
        os.utime(latest, (timestamp, timestamp))
        status = asyncio.run(knowledge.health())
        assert status["checkedAt"] == datetime.fromtimestamp(timestamp, timezone.utc).isoformat()
        assert status["version"] == "a"*64 and status["indexing"] is False


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


def test_voice_diagram_context_is_registered_page_scoped_and_hash_checked(tmp_path, monkeypatch):
    documents = [{"id": "guide#diagram-a.svg", "kind": "diagram", "title": "Diagrama A", "courseId": "guide",
                  "url": SITE + "guide/#diagram-a.svg", "text": "A conecta con B según la descripción."},
                 {"id": "other#diagram-b.svg", "kind": "diagram", "title": "Diagrama B", "courseId": "other",
                  "url": SITE + "other/#diagram-b.svg", "text": "Otro módulo."}]
    sources = segments(documents)
    manifest = {"schemaVersion": 1, "contentHash": "a"*64, "corpusUrl": CORPUS_URL,
                "documents": [{key: value for key, value in doc.items() if key != "text"} |
                              {"hash": digest(doc["text"])} for doc in documents]}
    atomic_json(tmp_path / "latest.json", manifest)
    monkeypatch.setattr(knowledge.app, "state", SimpleNamespace(root=tmp_path, token="test-token", snapshot=tmp_path,
                       version="a"*64, sources=sources, manifest=manifest, lock=asyncio.Lock()))

    async def evidence(message, context):
        assert "Tema: redes" in context
        return []

    monkeypatch.setattr(knowledge, "retrieve_evidence", evidence)
    request = knowledge.Retrieval(message="Explica esto", pageUrl=SITE + "guide/", continuity="Tema: redes",
                                  contextIds=[documents[0]["id"], documents[1]["id"]])
    result = asyncio.run(knowledge.retrieve(request, "Bearer test-token"))
    assert len(result["fragments"]) == 1 and result["fragments"][0]["kind"] == "diagram"
    manifest["documents"][0]["hash"] = digest("Descripción modificada")
    atomic_json(tmp_path / "latest.json", manifest)
    assert asyncio.run(knowledge.retrieve(request, "Bearer test-token"))["fragments"] == []


@pytest.mark.parametrize("fresh", [True, False])
@pytest.mark.parametrize("navigation_url", [SITE, SITE + "cursos/"])
def test_chat_page_includes_published_navigation_only_while_its_hash_matches(tmp_path, monkeypatch, fresh, navigation_url):
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
    manifest["documents"][0]["url"] = navigation_url
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
        {"question": "que sabes de dama y oci", "answer": "Ambos temas tienen material publicado.",
         "version": ("a" if current else "b") * 64}])
    asyncio.run(knowledge.retrieve(body, "Bearer test-token"))
    assert queries[0][0] == question
    assert question in queries[0][1]
    assert ("que sabes de dama y oci" in queries[0][1]) is current
    assert "Ambos temas tienen material publicado." not in queries[0][1]
    assert ("Preguntas anteriores (solo contexto)" in queries[0][1]) is current


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
                 for lane in ("document", "lexical", "graph") for i in range(8)]
    sources = segments(documents)
    manifest = {"documents": [{key: value for key, value in doc.items() if key != "text"} |
                              {"hash": digest(doc["text"])} for doc in documents]}
    names = list(sources)
    calls = []

    async def search(query, **options):
        calls.append((query, options))
        start = ("document", "lexical", "graph").index(options["query_type"]) * 8
        # Graph metadata must not consume the source slots before alternating the actual segments.
        chunks = [{"kind": "segment", "document_name": name.removesuffix(".txt")} for name in names[start:start+8]]
        return [{"objects_result": chunks}] if options["query_type"] == "lexical" else [
            {"evidence": [{"kind": "graph_node", "artifact_id": "node"}, *chunks]}]

    monkeypatch.setitem(sys.modules, "cognee", SimpleNamespace(search=search))
    monkeypatch.setitem(sys.modules, "cognee.api.v1.search", SimpleNamespace(
        SearchType=SimpleNamespace(RAG_COMPLETION="document", CHUNKS_LEXICAL="lexical", GRAPH_COMPLETION="graph")))
    evidence = asyncio.run(knowledge.retrieve_evidence(question, context))
    queries = [question, question, context]
    assert [call[0] for call in calls] == queries
    assert all(call[1] == {"query_type": lane, "datasets": ["certitips"], "only_context": True,
                          "verbose": True, "include_references": True, "feedback_influence": 0, "top_k": 8}
               for call, lane in zip(calls, ("document", "lexical", "graph") * (len(queries) // 3)))
    fragments = supported_fragments(evidence, sources, manifest)
    assert [f["title"] for f in fragments] == [f"{lane}{i}" for i in range(3) for lane in ("document", "lexical", "graph")][:8]
    assert sum(len(f["text"].encode()) for f in fragments) <= 16000
    assert all("#source-" in f["url"] for f in fragments)


@pytest.mark.parametrize("failures,empty", [({"document"}, False), ({"lexical"}, False), ({"graph"}, False),
                                          ({"document", "graph"}, False), ({"document", "lexical"}, False),
                                          ({"lexical", "graph"}, False), ({"document", "lexical", "graph"}, False),
                                          ({"document"}, True)])
def test_native_search_uses_surviving_lane_but_does_not_hide_total_failure(monkeypatch, failures, empty):
    async def search(_query, **options):
        lane = options["query_type"]
        if lane in failures:
            raise RuntimeError(lane)
        return [{"objects_result" if lane == "lexical" else "evidence":
                 [] if empty else [{"kind": "segment", "document_name": lane}]}]

    monkeypatch.setitem(sys.modules, "cognee", SimpleNamespace(search=search))
    monkeypatch.setitem(sys.modules, "cognee.api.v1.search", SimpleNamespace(
        SearchType=SimpleNamespace(RAG_COMPLETION="document", CHUNKS_LEXICAL="lexical", GRAPH_COMPLETION="graph")))
    if len(failures) == 3 or empty:
        with pytest.raises(RuntimeError, match="document"):
            asyncio.run(knowledge.retrieve_evidence("Pregunta"))
    else:
        evidence = asyncio.run(knowledge.retrieve_evidence("Pregunta"))
        assert [item["document_name"] for item in evidence] == [
            lane for lane in ("document", "lexical", "graph") if lane not in failures]


def test_native_lexical_raw_chunks_use_native_provenance_before_source_validation(monkeypatch):
    document = {"id": "video", "title": "Demostración", "courseId": "site", "url": SITE + "certitube/demo/",
                "text": "Material publicado."}
    sources = segments([document])
    name = next(iter(sources)).removesuffix(".txt")
    chunks = [{"id": "chunk", "document_name": name}, {"id": "other", "document_name": "removed"}]

    async def search(_query, **options):
        return [{"dataset_id": "dataset", "evidence": [],
                 "objects_result": chunks if options["query_type"] == "lexical" else []}]

    def provenance(objects, dataset_id):
        assert objects is chunks and dataset_id == "dataset"
        return [SimpleNamespace(model_dump=lambda mode, chunk=chunk: {
            "kind": "segment", "artifact_id": chunk["id"], "document_name": chunk["document_name"]}) for chunk in objects]

    monkeypatch.setitem(sys.modules, "cognee", SimpleNamespace(search=search))
    monkeypatch.setitem(sys.modules, "cognee.api.v1.search", SimpleNamespace(
        SearchType=SimpleNamespace(RAG_COMPLETION="document", CHUNKS_LEXICAL="lexical", GRAPH_COMPLETION="graph")))
    monkeypatch.setitem(sys.modules, "cognee.modules.retrieval.utils.evidence", SimpleNamespace(chunk_context_evidence=provenance))
    evidence = asyncio.run(knowledge.retrieve_evidence("Muéstrame una demostración"))
    assert [item["artifact_id"] for item in evidence] == ["chunk", "other"]
    manifest = {"documents": [{key: value for key, value in document.items() if key != "text"} |
                               {"hash": digest(document["text"])}]}
    assert [fragment["url"] for fragment in supported_fragments(evidence, sources, manifest)] == [document["url"]]


def test_native_search_timeout_cancels_slow_lane_and_keeps_completed_evidence(monkeypatch):
    cancelled = []
    wait_for = asyncio.wait_for

    async def search(_query, **options):
        if options["query_type"] == "graph":
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.append(True)
        return [{"objects_result" if options["query_type"] == "lexical" else "evidence":
                 [{"kind": "segment", "document_name": "current"}]}]

    async def bounded(awaitable, timeout):
        assert timeout == 18
        return await wait_for(awaitable, timeout=.01)

    monkeypatch.setitem(sys.modules, "cognee", SimpleNamespace(search=search))
    monkeypatch.setitem(sys.modules, "cognee.api.v1.search", SimpleNamespace(
        SearchType=SimpleNamespace(RAG_COMPLETION="document", CHUNKS_LEXICAL="lexical", GRAPH_COMPLETION="graph")))
    monkeypatch.setattr(knowledge.asyncio, "wait_for", bounded)
    evidence = asyncio.run(knowledge.retrieve_evidence("Pregunta"))
    assert [item["document_name"] for item in evidence] == ["current", "current"]
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
                                    "sourceId": doc["id"], "courseId": doc["courseId"],
                                    "url": current_url, "text": doc["text"]}]
    assert result["graphTrace"] == {"version": indexed["contentHash"], "nodes": [node], "edges": [], "truncated": False,
                                    "sources": [{"nodeId": node, "title": doc["title"], "url": current_url}]}
    assert knowledge.app.state.sources == sources and next(iter(sources.values()))["url"] == doc["url"]


def test_selection_validates_deduplicates_before_limit_and_preserves_navigation(tmp_path):
    documents = [{"id": str(i), "title": str(i), "courseId": "course", "url": SITE + str(i),
                  "text": "Texto vigente."} for i in range(10)]
    documents += [{"id": "home", "title": "Rutas", "courseId": "site", "url": SITE, "text": "Catálogo."}]
    sources = segments(documents)
    latest = {"contentHash": "a" * 64, "documents": [
        {key: value for key, value in doc.items() if key != "text"} | {"hash": digest(doc["text"])}
        for doc in documents]}
    names = list(sources)
    evidence = [{"kind": "segment", "document_name": name} for name in ["invented", *[names[0]] * 20, *names[1:10]]]
    latest["documents"][0]["hash"] = digest("Contenido cambiado")
    fragments, _ = knowledge.select_evidence(knowledge.Retrieval(message="Conceptos", pageUrl=SITE),
        evidence, sources, latest, tmp_path)
    assert [fragment["title"] for fragment in fragments] == ["Rutas", *[str(i) for i in range(1, 8)]]
    assert len(fragments) == 8
    assert not any(item["id"] in ("invented", names[0].removesuffix(".txt")) for item in fragments)


@pytest.mark.parametrize("change", [None, "version", "hash", "removed", "title", "url"])
def test_history_sources_require_exact_current_identity_and_manifest(tmp_path, change):
    document = {"id": "video", "title": "Vídeo", "courseId": "site", "url": SITE + "certitube/video/",
                "text": "Explicación de herramientas y agentes."}
    sources = segments([document])
    name = next(iter(sources)).removesuffix(".txt")
    latest = {"contentHash": "a" * 64, "documents": [
        {key: value for key, value in document.items() if key != "text"} | {"hash": digest(document["text"])}]}
    previous = {"question": "Dame un vídeo", "answer": "Seleccioné este vídeo.", "version": "a" * 64,
                "sources": [{"id": name, "title": document["title"], "url": document["url"]}]}
    if change == "version":
        previous["version"] = "b" * 64
    elif change == "hash":
        latest["documents"][0]["hash"] = "b" * 64
    elif change == "removed":
        latest["documents"] = []
    elif change in {"title", "url"}:
        previous["sources"][0][change] = "Inventado" if change == "title" else SITE + "wrong/"
    body = knowledge.Retrieval(message="Explícame ese vídeo", history=[previous])
    fragments, _ = knowledge.select_evidence(body, [], sources, latest, tmp_path)
    assert bool(fragments) is (change is None)
    if fragments:
        assert fragments[0]["text"] == document["text"] and fragments[0]["id"] == name
    context = knowledge.retrieval_query(body, latest["contentHash"])
    assert "Seleccioné este vídeo." not in context


def test_native_candidate_count_and_search_count_stay_fixed_with_history(monkeypatch):
    calls = []

    async def search(query, **options):
        calls.append((query, options["top_k"], options["query_type"]))
        return []

    monkeypatch.setitem(sys.modules, "cognee", SimpleNamespace(search=search))
    monkeypatch.setitem(sys.modules, "cognee.api.v1.search", SimpleNamespace(
        SearchType=SimpleNamespace(RAG_COMPLETION="document", CHUNKS_LEXICAL="lexical", GRAPH_COMPLETION="graph")))
    asyncio.run(knowledge.retrieve_evidence("current", "bounded history"))
    assert calls == [("current", 8, "document"), ("current", 8, "lexical"), ("bounded history", 8, "graph")]


@pytest.mark.parametrize("locale,message,ordinal", [
    ("es", "Explícame el segundo video", True), ("en", "Explain the second", True),
    ("pt", "Explique o segundo vídeo", True), ("it", "Spiega la seconda risorsa", True),
    ("es", "Amplía ese recurso", False), ("en", "Explain that resource", False),
    ("pt", "Explique esse recurso", False), ("it", "Spiega quella risorsa", False),
])
@pytest.mark.parametrize("duplicate_url", [False, True])
def test_explicit_previous_reference_survives_eight_distractors(tmp_path, locale, message, ordinal, duplicate_url):
    documents = [{"id": f"distractor{i}", "title": f"Distractor {i}", "courseId": "course",
                  "url": SITE + f"distractor{i}/", "text": "Información ajena a la referencia."} for i in range(8)]
    documents += [{"id": f"prior{i}", "title": f"Previo {i}", "courseId": "site",
                   "url": SITE + f"certitube/prior{i}/", "text": "Contenido publicado del recurso."} for i in range(2)]
    if duplicate_url:
        documents.insert(9, {**documents[8], "id": "prior-extra", "text": "Otro segmento del primer recurso."})
    sources = segments(documents)
    latest = {"contentHash": "a" * 64, "documents": [
        {key: value for key, value in doc.items() if key != "text"} | {"hash": digest(doc["text"])} for doc in documents]}
    names = list(sources)
    previous = [{"id": names[i].removesuffix(".txt"), "title": documents[i]["title"], "url": documents[i]["url"]}
                for i in range(8, len(documents)) if ordinal or i == len(documents) - 1]
    body = knowledge.Retrieval(message=message, locale=locale, history=[
        {"question": "Materiales", "answer": "Recursos recomendados.", "version": latest["contentHash"], "sources": previous}])
    evidence = [{"kind": "segment", "document_name": name} for name in names[:8]]
    fragments, _ = knowledge.select_evidence(body, evidence, sources, latest, tmp_path)
    assert len(fragments) == 8 and fragments[0]["id"] == previous[-1]["id"]
    # A removed second source must not silently turn the original first source into the second.
    latest["documents"] = latest["documents"][:-1]
    fragments, _ = knowledge.select_evidence(body, evidence, sources, latest, tmp_path)
    assert all(fragment["id"] not in {source["id"] for source in previous} for fragment in fragments)


@pytest.mark.parametrize("locale,followup,new_topic", [
    ("es", "¿Cómo se llama esa función y para qué sirve?", "Ahora explícame almacenamiento"),
    ("en", "What is that feature called and what does it do?", "Now explain storage"),
    ("pt", "Como se chama essa função e para que serve?", "Agora explique armazenamento"),
    ("it", "Come si chiama quella funzione e a cosa serve?", "Ora spiega archiviazione"),
])
def test_followup_restores_current_sources_and_answer_without_changing_new_topic_selection(tmp_path, monkeypatch, locale, followup, new_topic):
    from app.provider import conversation_context
    documents = [{"id": f"current{i}", "title": f"Current {i}", "courseId": "course", "url": SITE + f"current{i}/",
                  "text": "Texto publicado vigente."} for i in range(8)]
    documents += [{"id": name, "title": name, "courseId": "course", "url": SITE + name + "/",
                   "text": "Evidencia vigente de " + name} for name in ("Auto-Tiering", "Online Resizing")]
    documents += [{"id": "home", "title": "Rutas", "courseId": "site", "url": SITE, "text": "Catálogo vigente."}]
    sources = segments(documents)
    latest = {"contentHash": "a" * 64, "documents": [
        {key: value for key, value in doc.items() if key != "text"} | {"hash": digest(doc["text"])} for doc in documents]}
    names = list(sources)
    previous = [{"id": names[i].removesuffix(".txt"), "title": documents[i]["title"], "url": documents[i]["url"]} for i in (8, 9)]
    turn = {"question": "Elige una función de OCI", "answer": "Elijo Online Resizing.", "version": latest["contentHash"], "sources": previous}
    native = [{"kind": "segment", "document_name": name} for name in names[:8]]
    monkeypatch.setattr(knowledge, "localized_evidence", lambda *_: [native[-1]])
    body = knowledge.Retrieval(message=new_topic, locale=locale, pageUrl=documents[1]["url"], history=[turn])
    baseline, _ = knowledge.select_evidence(body.model_copy(update={"history": []}), native, sources, latest, tmp_path)
    selected, _ = knowledge.select_evidence(body, native, sources, latest, tmp_path)
    assert selected == baseline
    assert [item["title"] for item in selected] == ["Current 1", "Rutas", "Current 0", "Current 7", "Current 2", "Current 3", "Current 4", "Current 5"]
    body.message = followup
    selected, trace = knowledge.select_evidence(body, native, sources, latest, tmp_path)
    assert [item["id"] for item in selected[:2]] == [item["id"] for item in previous]
    assert [item["id"] for item in selected[2:]] == [item["id"] for item in baseline[:6]]
    assert len(selected) == 8 and sum(len(item["text"].encode()) for item in selected) <= 16000
    assert [item["document_name"] for item in trace[:2]] == [item["id"] for item in previous]
    assert conversation_context([turn], selected)[0]["answer"] == turn["answer"]
    # A changed response topic without sources must not revive references from an older turn.
    body.history.append(knowledge.PreviousQuestion(question="Otro tema", version=latest["contentHash"]))
    assert knowledge.select_evidence(body, native, sources, latest, tmp_path)[0] == baseline


@pytest.mark.parametrize("message", ["Explain that resource", "Explica ese recurso", "Explique esse recurso", "Spiega quella risorsa",
    "Compare the first and second resource", "Compara el primero y el segundo", "What is the second availability domain?",
    "Ahora explícame almacenamiento", "Now explain storage", "Agora explique armazenamento", "Ora spiega archiviazione"])
def test_ambiguous_reference_and_topic_change_do_not_choose_previous_resource(message):
    previous = [{"id": f"{i}"*64 + "-0000", "title": f"Source {i}", "url": SITE + f"source{i}/"} for i in (1, 2)]
    body = knowledge.Retrieval(message=message, history=[
        {"question": "Materiales", "version": "a"*64, "sources": previous}])
    assert knowledge.previous_reference(body, "a"*64) is None
    body.message = "Explain the second"
    assert knowledge.previous_reference(body, "a"*64).id == previous[1]["id"]
    assert knowledge.previous_reference(body, "b"*64) is None
    body.history.append(knowledge.PreviousQuestion(question="Another topic", version="a"*64))
    assert knowledge.previous_reference(body, "a"*64) is None


@pytest.mark.parametrize("locale,message", [
    ("es", "Compara el primero y el segundo"), ("en", "Compare the first and second resource"),
    ("pt", "Compare o primeiro e o segundo recurso"), ("it", "Confronta la prima e la seconda risorsa"),
])
def test_ordinal_comparison_keeps_both_previous_resources(locale, message):
    previous = [{"id": str(i)*64 + "-0000", "title": f"Recurso {i}", "url": SITE + f"source{i}/"} for i in (1, 2)]
    body = knowledge.Retrieval(message=message, locale=locale, history=[
        {"question": "Materiales", "version": "a"*64, "sources": previous}])
    assert knowledge.previous_reference(body, "a"*64) is None
    assert knowledge.followup_sources(body, "a"*64) == body.history[-1].sources


@pytest.mark.parametrize("locale,index", [("es", 0), ("en", 1), ("pt", 2), ("it", 3)])
@pytest.mark.parametrize("family,messages", [
    ("h01", (
        "Del segundo recurso de la lista de enlaces, ¿una política restringida elimina permisos amplios concedidos por otra? Explica por qué.",
        "In the second resource in the link list, does a restricted policy remove broad permissions granted by another policy? Explain why.",
        "No segundo recurso da lista de links, uma política restrita elimina permissões amplas concedidas por outra política? Explique por quê.",
        "Nel secondo materiale dell'elenco dei link, una policy restrittiva elimina le autorizzazioni estese concesse da un'altra policy? Spiega perché.",
    )),
    ("h02", (
        "En la segunda práctica que enumeraste en tu explicación, ¿cómo se llama la función y puede mover objetos a Archive?",
        "In the second practice exercise you numbered in your explanation, what is the feature called, and can it move objects to Archive?",
        "No segundo exercício que você numerou na explicação, como se chama a funcionalidade e ela pode mover objetos para Archive?",
        "Nel secondo esercizio che hai numerato nella spiegazione, come si chiama la funzionalità e può spostare gli oggetti in Archive?",
    )),
    ("h03", (
        "¿Cómo se llama esa técnica y necesita que ya existan etiquetas de segmentos para los clientes?",
        "What is that technique called, and does it require existing customer segment labels?",
        "Como se chama essa técnica e ela exige que já existam rótulos de segmentos para os clientes?",
        "Come si chiama quella tecnica e richiede etichette dei segmenti dei clienti già esistenti?",
    )),
    ("h04", (
        "¿En qué minuto de ese video se presenta Agent Flow y qué datos consulta?",
        "At what time in that video is Agent Flow introduced, and what data does it query?",
        "Em que minuto desse vídeo o Agent Flow é apresentado e quais dados ele consulta?",
        "A quale minuto di quel video viene presentato Agent Flow e quali dati consulta?",
    )),
    ("h05", (
        "¿Debo seguir ese consejo con un volumen que contiene datos importantes? Si no, ¿qué debo comprobar primero?",
        "Should I follow that advice for a volume containing important data? If not, what should I check first?",
        "Devo seguir esse conselho para um volume com dados importantes? Se não, o que devo verificar primeiro?",
        "Devo seguire quel consiglio per un volume che contiene dati importanti? In caso contrario, cosa devo controllare prima?",
    )),
    ("h06", (
        "Amplía ese recurso.", "Expand on that resource.", "Explique melhor esse material.", "Approfondisci quel materiale.",
    )),
], ids=["h01", "h02", "h03", "h04", "h05", "h06"])
def test_saved_followup_expressions_keep_last_turn_references(locale, index, family, messages):
    count = 1 if family in {"h03", "h04", "h05"} else 2
    previous = [{"id": str(i)*64 + "-0000", "title": f"Recurso {i}",
                 "url": SITE + ("practice/" if family == "h02" else f"source{i}/")} for i in range(1, count + 1)]
    body = knowledge.Retrieval(message=messages[index], locale=locale, history=[
        {"question": "Materiales", "answer": "1. Primera práctica. 2. Segunda práctica.",
         "version": "a"*64, "sources": previous}])
    expected = body.history[-1].sources[-1:] if family == "h01" else body.history[-1].sources
    assert knowledge.followup_sources(body, "a"*64) == expected
    if family == "h02":
        # The narrative numbers exercises; the UI shows one URL for both source segments.
        assert knowledge.previous_reference(body, "a"*64) is None
        assert len(expected) == 2 and len({source.url for source in expected}) == 1
    body.history[-1].version = "b"*64
    assert knowledge.followup_sources(body, "a"*64) == []
    body.history[-1].version = "a"*64
    body.history.append(knowledge.PreviousQuestion(question="Otro tema", version="a"*64))
    assert knowledge.followup_sources(body, "a"*64) == []


@pytest.mark.parametrize("locale,message", [
    ("es", "Ahora explícame cómo se aplica IAM en OCI"),
    ("en", "Now explain how IAM applies in OCI"),
    ("pt", "Agora explique como se aplica IAM na OCI"),
    ("it", "Ora spiega come si applica IAM in OCI"),
])
def test_explicit_new_subject_does_not_restore_previous_resources(locale, message):
    previous = [{"id": str(i)*64 + "-0000", "title": f"Almacenamiento {i}",
                 "url": SITE + f"storage{i}/"} for i in (1, 2)]
    body = knowledge.Retrieval(message=message, locale=locale, history=[
        {"question": "Almacenamiento", "version": "a"*64, "sources": previous}])
    assert knowledge.previous_reference(body, "a"*64) is None
    assert knowledge.followup_sources(body, "a"*64) == []


def test_empty_nested_data_root_starts_waiting_without_cognee(tmp_path, monkeypatch):
    root = tmp_path / "fresh-volume" / "claude55-haiku"
    assert not root.exists()
    monkeypatch.setenv("CERTICHAT_DATA_DIR", str(root))
    monkeypatch.setenv("CERTICHAT_CHAT_INTERNAL_TOKEN", "t" * 32)
    monkeypatch.setattr(knowledge.app, "state", SimpleNamespace())

    def unexpected(*_args, **_kwargs):
        pytest.fail("An empty knowledge worker must not initialize Cognee or perform retrieval")

    monkeypatch.setattr(knowledge, "configure_cognee", unexpected)
    monkeypatch.setattr(knowledge, "retrieve_evidence", unexpected)

    async def run():
        async with knowledge.lifespan(knowledge.app):
            assert root.is_dir()
            assert await knowledge.health() == {"status": "waiting", "version": None,
                                                 "indexing": False, "checkedAt": None}
    asyncio.run(run())


def test_voice_diagram_context_and_followup_keep_both_current_sources(tmp_path):
    documents = [{"id": str(i), "title": str(i), "courseId": "course", "url": SITE + str(i),
                  "text": "Texto vigente."} for i in range(8)]
    documents += [{"id": "guide#diagram.svg", "kind": "diagram", "title": "Diagrama", "courseId": "guide",
                   "url": SITE + "guide/#diagram.svg", "text": "Descripción del diagrama."},
                  {"id": "previous", "title": "Recurso anterior", "courseId": "course",
                   "url": SITE + "previous/", "text": "Evidencia del recurso anterior."}]
    sources = segments(documents)
    latest = {"contentHash": "a" * 64, "documents": [
        {key: value for key, value in doc.items() if key != "text"} | {"hash": digest(doc["text"])} for doc in documents]}
    names = list(sources)
    previous = {"id": names[-1].removesuffix(".txt"), "title": documents[-1]["title"], "url": documents[-1]["url"]}
    body = knowledge.Retrieval(message="Amplía ese recurso", pageUrl=SITE + "guide/", contextIds=[documents[-2]["id"]],
        continuity="Tema: diagrama y recurso previo.", history=[{"question": "Recomienda un recurso", "answer": "Recurso anterior.",
        "version": latest["contentHash"], "sources": [previous]}])
    evidence = [{"kind": "segment", "document_name": name} for name in names[:8]]
    fragments, _ = knowledge.select_evidence(body, evidence, sources, latest, tmp_path)
    assert len(fragments) == 8
    assert [item["id"] for item in fragments[:2]] == [names[-2].removesuffix(".txt"), previous["id"]]
    latest["documents"][-1]["hash"] = digest("Recurso modificado")
    assert all(item["id"] != previous["id"] for item in knowledge.select_evidence(body, evidence, sources, latest, tmp_path)[0])

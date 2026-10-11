"""Graph export is private and projects only bounded conceptual labels."""

import asyncio
import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app import graph as graph_module, knowledge
from app.corpus import SITE
from app.graph import graph_trace, node_documents, public_graph, validate_trace

NODES = [f"00000000-0000-0000-0000-{index:012d}" for index in range(3)]
EDGE = {"source": NODES[0], "target": NODES[1], "label": "is_a"}
TRACE = {"version": "a"*64, "nodes": NODES[:2], "edges": [EDGE], "truncated": False}


def test_graph_export_drops_document_content_metadata_and_unsafe_labels():
    identifiers = [f"00000000-0000-0000-0000-{index:012d}" for index in range(9)]
    nodes = [(identifiers[0], {"type": "Entity", "name": "DAMA", "description": "private description",
                              "metadata": {"token": "private credential"}}),
             (identifiers[1], {"type": "EntityType", "name": "Marco de gestión"}),
             (identifiers[2], {"type": "DocumentChunk", "name": "private chunk", "text": "private source"}),
             *[(identifiers[index + 3], {"type": "Entity", "name": name}) for index, name in enumerate(
                 ["<script>alert(1)</script>", "https://internal.example/token", "sk-or-private-secret",
                  "C:\\private\\source.txt", "x"*161, "control\ncharacter"])],
             ("private-path-instead-of-id", {"type": "Entity", "name": "Ignored"})]
    edges = [(identifiers[0], identifiers[1], "is_a", {"text": "private relation", "token": "private token"}),
             (identifiers[0], identifiers[2], "belongs_to", {}),
             (identifiers[0], identifiers[1], "<unsafe>", {})]
    exported = public_graph(nodes, edges, "a"*64)
    assert exported["version"] == "a"*64 and exported["generatedAt"]
    assert exported["nodes"] == [{"id": identifiers[0], "label": "DAMA", "type": "Entity"},
                                 {"id": identifiers[1], "label": "Marco de gestión", "type": "EntityType"}]
    assert exported["edges"] == [{"source": identifiers[0], "target": identifiers[1], "label": "is_a"}]
    assert "private" not in json.dumps(exported)


@pytest.mark.parametrize("authorization,snapshot,busy,status", [
    ("", True, False, 401), ("Bearer wrong", True, False, 401),
    ("Bearer test-token", False, False, 503), ("Bearer test-token", True, True, 503)])
def test_private_graph_requires_authentication_ready_snapshot_and_free_owner(monkeypatch, authorization, snapshot, busy, status):
    async def run():
        lock = asyncio.Lock()
        if busy:
            await lock.acquire()
        monkeypatch.setattr(knowledge.app, "state", SimpleNamespace(token="test-token", snapshot=snapshot, lock=lock))
        with pytest.raises(HTTPException) as caught:
            await knowledge.graph(authorization)
        assert caught.value.status_code == status
    asyncio.run(run())


def test_graph_is_read_under_snapshot_lock_without_provider_calls(monkeypatch):
    state = SimpleNamespace(token="test-token", snapshot=True, lock=asyncio.Lock(), version="a"*64)
    monkeypatch.setattr(knowledge.app, "state", state)

    reads = []

    async def read():
        assert state.lock.locked()
        reads.append(state.version)
        return [], []

    monkeypatch.setattr(knowledge, "read_graph", read)
    result = asyncio.run(knowledge.graph("Bearer test-token"))
    assert result["version"] == "a"*64 and result["nodes"] == result["edges"] == []
    assert asyncio.run(knowledge.graph("Bearer test-token")) == result and reads == ["a"*64]
    state.version = "b"*64
    assert asyncio.run(knowledge.graph("Bearer test-token"))["version"] == "b"*64
    assert reads == ["a"*64, "b"*64]
    assert not state.lock.locked()


def test_graph_failure_does_not_leak_database_details(monkeypatch):
    state = SimpleNamespace(token="test-token", snapshot=True, lock=asyncio.Lock(), version="a"*64)
    monkeypatch.setattr(knowledge.app, "state", state)

    async def read():
        raise RuntimeError("private database path")

    monkeypatch.setattr(knowledge, "read_graph", read)
    with pytest.raises(HTTPException) as caught:
        asyncio.run(knowledge.graph("Bearer test-token"))
    assert caught.value.status_code == 503 and "private" not in caught.value.detail
    assert not state.lock.locked()


def test_chunk_provenance_cache_is_private_and_replaced_with_snapshot(monkeypatch):
    state = SimpleNamespace(token="test-token", snapshot=True, lock=asyncio.Lock(), version="a"*64)
    monkeypatch.setattr(knowledge.app, "state", state)
    reads = []

    async def read():
        assert state.lock.locked()
        reads.append(state.version)
        if state.version != "a"*64:
            return [], []
        return [(NODES[0], {"type": "Entity", "name": "DAMA"}),
                (NODES[1], {"type": "DocumentChunk", "document_name": "private-source.txt",
                            "text": "private source body"})], [(NODES[1], NODES[0], "contains", {})]

    monkeypatch.setattr(knowledge, "read_graph", read)
    result = asyncio.run(knowledge.graph("Bearer test-token"))
    assert state.node_documents == {NODES[0]: {"private-source.txt"}}
    assert "private" not in json.dumps(result) and set(result) == {"version", "generatedAt", "nodes", "edges"}
    assert asyncio.run(knowledge.graph("Bearer test-token")) == result and reads == ["a"*64]
    state.version = "b"*64
    asyncio.run(knowledge.graph("Bearer test-token"))
    assert state.node_documents == {} and reads == ["a"*64, "b"*64]


def test_standalone_node_sources_use_exact_contains_and_selected_fragments(monkeypatch):
    entities = [(node, {"type": "Entity", "name": "DAMA"}) for node in NODES]
    chunks = [("chunk", {"type": "DocumentChunk", "document_name": "selected.txt"}),
              ("obsolete", {"type": "DocumentChunk", "document_name": "obsolete.txt"}),
              ("unselected", {"type": "DocumentChunk", "document_name": "unselected.txt"}),
              ("wrong-type", {"type": "TextDocument", "document_name": "wrong.txt"}),
              ("no-name", {"type": "DocumentChunk"})]
    edges = [("chunk", NODES[0], "contains", {}), ("chunk", NODES[2], "contains", {}),
             ("chunk", NODES[1], "is_part_of", {}), (NODES[1], "chunk", "contains", {}),
             ("missing", NODES[1], "contains", {}), ("wrong-type", NODES[1], "contains", {}),
             ("no-name", NODES[1], "contains", {}), ("obsolete", NODES[0], "contains", {}),
             ("unselected", NODES[0], "contains", {})]
    documents = node_documents(entities + chunks, edges)
    graph = public_graph(entities + chunks, edges, "a"*64)
    fragments = [{"id": "selected", "title": "DAMA: Tu punto de partida", "url": SITE + "data-governance/overview/"},
                 {"id": "wrong", "title": "DAMA", "url": SITE + "wrong/"}]
    evidence = [{"kind": "graph_node", "artifact_id": node} for node in NODES[:2]]
    trace = graph_trace(evidence, graph, fragments, documents)
    assert trace["edges"] == [] and trace["nodes"] == NODES[:2]
    assert trace["sources"] == [{"nodeId": NODES[0], "title": fragments[0]["title"], "url": fragments[0]["url"]}]
    assert validate_trace(trace) == trace
    assert "sources" not in graph_trace(evidence, graph, [], documents)
    assert "sources" not in graph_trace([], graph, fragments, documents)
    monkeypatch.setattr(graph_module, "TRACE_NODES", 0)
    assert "sources" not in graph_trace(evidence, graph, fragments, documents)


def test_trace_uses_exact_retrieved_ids_and_relationships_not_labels():
    projection = {"version": "a"*64, "nodes": [{"id": node, "label": "DAMA"} for node in NODES[:2]], "edges": [EDGE]}
    evidence = [{"kind": "graph_node", "artifact_id": NODES[0]},
                {"kind": "graph_node", "artifact_id": NODES[2], "label": "DAMA"},
                {"kind": "graph_edge", "source_node_id": NODES[0], "target_node_id": NODES[1], "relationship_name": "is_a"},
                {"kind": "graph_edge", "source_node_id": NODES[1], "target_node_id": NODES[0], "relationship_name": "is_a"},
                {"kind": "graph_edge", "source_node_id": NODES[0], "target_node_id": NODES[1], "relationship_name": "invented"},
                {"kind": "segment", "artifact_id": NODES[2], "document_name": "source"}]
    assert graph_trace(evidence, projection) == TRACE
    assert validate_trace(TRACE) == TRACE
    assert graph_trace([], projection) == {**TRACE, "nodes": [], "edges": []}


def test_trace_caps_keep_only_edges_with_visible_endpoints():
    nodes = [f"00000000-0000-0000-0000-{index:012d}" for index in range(514)]
    edges = [{"source": nodes[0], "target": nodes[1], "label": f"relation{index}"} for index in range(1025)]
    edges.append({"source": nodes[0], "target": nodes[-1], "label": "omitted_endpoint"})
    graph = {"version": "a"*64, "nodes": [{"id": node} for node in nodes], "edges": edges}
    evidence = [{"kind": "graph_node", "artifact_id": node} for node in nodes]
    evidence.extend({"kind": "graph_edge", "source_node_id": edge["source"], "target_node_id": edge["target"],
                     "relationship_name": edge["label"]} for edge in edges)
    trace = graph_trace(evidence, graph)
    assert trace["truncated"] and len(trace["nodes"]) == 512 and len(trace["edges"]) == 1024
    assert all(edge["source"] in trace["nodes"] and edge["target"] in trace["nodes"] for edge in trace["edges"])
    assert validate_trace(trace) == trace


def test_trace_sources_require_exact_assertion_and_selected_current_fragment():
    graph = {**TRACE, "nodes": [{"id": node, "label": "Same label"} for node in NODES]}
    fragments = [{"id": name, "title": title, "url": SITE + name + "/#section"}
                 for name, title in [("selected", "Guía actual"), ("second", "Otra fuente"),
                                     ("unrelated", "Same label")]]
    edge = {"kind": "graph_edge", "artifact_id": "edge", "source_node_id": NODES[0],
            "target_node_id": NODES[1], "relationship_name": "is_a"}
    source = {"kind": "segment", "role": "supports_assertion", "assertion_id": "edge",
              "document_name": "selected"}
    evidence = [edge, {"kind": "graph_node", "artifact_id": NODES[2]}, source,
                {**source, "document_name": "selected.txt"},
                {**source, "document_name": "second.txt"},
                {**source, "document_name": "removed-or-not-selected"},
                {**source, "document_name": "unrelated", "assertion_id": "unknown"},
                {**source, "document_name": "unrelated", "assertion_id": None},
                {**source, "document_name": "unrelated", "role": "used_as_context"},
                {**source, "document_name": "unrelated", "assertion_id": []},
                {**source, "document_name": ["unrelated"]}]
    trace = graph_trace(evidence, graph, fragments)
    assert trace["sources"] == [{"nodeId": node, "title": fragment["title"], "url": fragment["url"]}
                                for node in NODES[:2] for fragment in sorted(fragments[:2], key=lambda item: item["url"])]
    assert validate_trace(trace) == trace
    assert "sources" not in graph_trace(evidence, graph), "Unselected or stale fragments cannot expose links"


@pytest.mark.parametrize("limit", ["TRACE_NODES", "TRACE_EDGES"])
def test_trace_source_cannot_outlive_its_visible_assertion(monkeypatch, limit):
    graph = {**TRACE, "nodes": [{"id": node} for node in NODES[:2]],
             "edges": [EDGE, {**EDGE, "label": "z_omitted"}]}
    evidence = [{"kind": "graph_edge", "artifact_id": edge["label"], "source_node_id": edge["source"],
                 "target_node_id": edge["target"], "relationship_name": edge["label"]} for edge in graph["edges"]]
    evidence.append({"kind": "segment", "role": "supports_assertion", "assertion_id": "z_omitted",
                     "document_name": "guide"})
    monkeypatch.setattr(graph_module, limit, 1)
    trace = graph_trace(evidence, graph, [{"id": "guide", "title": "Guía", "url": SITE + "guide/"}])
    assert trace["truncated"] and "sources" not in trace
    assert validate_trace(trace) == trace


def test_trace_source_links_are_bounded_and_titles_are_shortened():
    graph = {**TRACE, "nodes": [{"id": node} for node in NODES[:2]]}
    fragments = [{"id": f"guide-{i}", "title": "Título largo " * 30, "url": SITE + f"guide-{i}/"}
                 for i in range(257)]
    evidence = [{"kind": "graph_edge", "artifact_id": "edge", "source_node_id": NODES[0],
                 "target_node_id": NODES[1], "relationship_name": "is_a"},
                *[{"kind": "segment", "role": "supports_assertion", "assertion_id": "edge",
                   "document_name": fragment["id"]} for fragment in fragments]]
    trace = graph_trace(evidence, graph, fragments)
    assert trace["truncated"] and len(trace["sources"]) == 512
    assert all(source["title"] == fragments[0]["title"][:200].strip() for source in trace["sources"])
    assert validate_trace(trace) == trace


SOURCE = {"nodeId": NODES[0], "title": "Guía pública", "url": SITE + "guide/#section"}


@pytest.mark.parametrize("sources", [
    None, {}, "source", [None], [SOURCE] * 513, [SOURCE, SOURCE],
    [{**SOURCE, "nodeId": NODES[2]}], [{**SOURCE, "nodeId": []}],
    [{**SOURCE, "title": ""}], [{**SOURCE, "title": " padded "}],
    [{**SOURCE, "title": "x" * 201}], [{**SOURCE, "title": "bad\ncontrol"}],
    [{**SOURCE, "title": None}], [{**SOURCE, "text": "private source body"}],
    [{**SOURCE, "url": None}], [{**SOURCE, "url": "https://evil.test/"}],
    [{**SOURCE, "url": SITE + "%2e%2e/private"}], [{**SOURCE, "url": SITE + "a" * 1024}],
    [{**SOURCE, "url": SITE + "guide/?redirect=evil"}],
])
def test_trace_source_validation_rejects_unsafe_or_unbounded_metadata(sources):
    with pytest.raises(ValueError):
        validate_trace({**TRACE, "sources": sources})


def test_trace_source_validation_preserves_legacy_and_plain_text_titles():
    assert validate_trace(TRACE) == TRACE
    assert validate_trace({**TRACE, "sources": []})["sources"] == []
    source = {**SOURCE, "title": "Comparación: 1 < 2"}
    assert validate_trace({**TRACE, "sources": [source]})["sources"] == [source]


@pytest.mark.parametrize("override", [
    {"version": "bad"}, {"version": None}, {"truncated": 1}, {"private": "metadata"},
    {"nodes": "not a list"}, {"nodes": ["not-a-uuid"]}, {"nodes": [NODES[0]]*513},
    {"nodes": [NODES[0], NODES[0]]}, {"nodes": [None]},
    {"edges": None}, {"edges": [EDGE]*1025}, {"edges": [EDGE, EDGE]},
    {"edges": [{**EDGE, "target": NODES[2]}]}, {"edges": [{**EDGE, "source": []}]},
    {"edges": [{**EDGE, "label": None}]}, {"edges": [{**EDGE, "label": "<script>"}]},
    {"edges": [{**EDGE, "label": " padded "}]}, {"edges": [{**EDGE, "text": "private body"}]},
])
def test_malformed_worker_trace_is_rejected(override):
    with pytest.raises(ValueError):
        validate_trace({**TRACE, **override})

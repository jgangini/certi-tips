"""Graph export is private and projects only bounded conceptual labels."""

import asyncio
import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app import knowledge
from app.graph import graph_trace, public_graph, validate_trace

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

"""Graph export is private and projects only bounded conceptual labels."""

import asyncio
import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app import knowledge
from app.graph import public_graph


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

    async def read():
        assert state.lock.locked()
        return [], []

    monkeypatch.setattr(knowledge, "read_graph", read)
    result = asyncio.run(knowledge.graph("Bearer test-token"))
    assert result["version"] == "a"*64 and result["nodes"] == result["edges"] == []
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

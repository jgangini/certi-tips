"""Published freshness must invalidate conversational context before snapshot promotion."""

import asyncio
from types import SimpleNamespace

from app import knowledge
from app.corpus import CORPUS_URL, SITE, atomic_json, digest, segments


def test_retrieval_uses_latest_manifest_after_search_while_health_keeps_snapshot(tmp_path, monkeypatch):
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
    result = asyncio.run(knowledge.retrieve(knowledge.Retrieval(message="Información del curso"), "Bearer test-token"))
    assert result["version"] == current["contentHash"]
    assert [fragment["url"] for fragment in result["fragments"]] == [SITE + "stable/"]
    assert asyncio.run(knowledge.health()) == {"status": "ready", "version": "a"*64}

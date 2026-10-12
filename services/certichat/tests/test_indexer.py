"""Relocating public routes must reuse closed native stores, never regenerate knowledge."""

import asyncio
from copy import deepcopy
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app import indexer
from app.corpus import CORPUS_URL, SITE, atomic_json, digest, read_json, snapshot_path


def manifest(version):
    return {"schemaVersion": 1, "contentHash": version, "corpusUrl": CORPUS_URL,
            "documents": [{"id": "course/guide", "title": "Guía", "courseId": "course",
                           "url": SITE + "old/", "hash": digest("Texto que permanece igual.")}]}


def ready_snapshot(root, value):
    snapshot = snapshot_path(root, value["contentHash"])
    snapshot.mkdir(parents=True)
    atomic_json(snapshot / "manifest.json", value)
    atomic_json(snapshot / "ready.json", {"version": value["contentHash"], "documents": len(value["documents"])})
    (snapshot / "native-store.db").write_bytes(b"closed native database")
    return snapshot


@pytest.mark.parametrize("candidate_status,expected", [("compatible", "b"), ("different", "a"), ("incomplete", "a")])
def test_build_reuses_candidate_before_active_without_opening_or_mutating_stores(tmp_path, monkeypatch, candidate_status, expected):
    active, candidate, current = [manifest(letter * 64) for letter in "abc"]
    current["documents"][0]["url"] = SITE + "new/"
    if candidate_status == "different":
        candidate["documents"][0]["title"] = "Otra guía"
    snapshots = [ready_snapshot(tmp_path, value) for value in (active, candidate)]
    if candidate_status == "incomplete":
        (snapshots[1] / "ready.json").unlink()
    atomic_json(tmp_path / "active.json", {"version": active["contentHash"]})
    atomic_json(tmp_path / "candidate.json", {"version": candidate["contentHash"]})
    original = {path: path.read_bytes() for snapshot in snapshots for path in snapshot.iterdir()}

    async def refresh(root):
        atomic_json(root / "latest.json", current)
        return current

    download = AsyncMock(side_effect=AssertionError("Metadata-only reuse downloaded a corpus"))
    configure = Mock(side_effect=AssertionError("Metadata-only reuse opened native stores"))
    cognee = SimpleNamespace(add=AsyncMock(), cognify=AsyncMock())
    monkeypatch.setattr(indexer, "refresh", refresh)
    monkeypatch.setattr(indexer, "download", download)
    monkeypatch.setattr(indexer, "configure_cognee", configure)
    monkeypatch.setitem(sys.modules, "cognee", cognee)
    asyncio.run(indexer.build(tmp_path))
    assert read_json(tmp_path / "candidate.json") == {"version": expected * 64}
    assert read_json(tmp_path / "active.json") == {"version": active["contentHash"]}
    assert read_json(tmp_path / "latest.json") == current
    assert all(path.read_bytes() == value for path, value in original.items())
    assert not snapshot_path(tmp_path, current["contentHash"]).exists()
    download.assert_not_called()
    configure.assert_not_called()
    cognee.add.assert_not_called()
    cognee.cognify.assert_not_called()


@pytest.mark.parametrize("change", ["hash", "title", "courseId", "id", "added", "removed", "ready-version", "ready-count"])
def test_candidate_reuse_rejects_changed_content_identity_set_and_incomplete_readiness(tmp_path, change):
    indexed = manifest("a" * 64)
    snapshot = ready_snapshot(tmp_path, indexed)
    atomic_json(tmp_path / "candidate.json", {"version": indexed["contentHash"]})
    current = deepcopy(indexed)
    current["contentHash"] = "b" * 64
    current["documents"][0]["url"] = SITE + "new/"
    if change == "added":
        current["documents"].append({**current["documents"][0], "id": "extra"})
    elif change == "removed":
        current["documents"] = []
    elif change.startswith("ready-"):
        atomic_json(snapshot / "ready.json", {"version": "c" * 64 if change == "ready-version" else indexed["contentHash"],
                                              "documents": 2 if change == "ready-count" else 1})
    else:
        current["documents"][0][change] = "changed"
    assert indexer.reusable_snapshot(tmp_path, current) is None

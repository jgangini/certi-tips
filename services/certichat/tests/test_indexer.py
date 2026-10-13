"""Relocating public routes must reuse closed native stores, never regenerate knowledge."""

import asyncio
import fcntl
import sqlite3
from contextlib import closing
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


@pytest.mark.parametrize("fails", [False, True])
def test_cli_build_releases_its_live_status_lock_on_success_and_failure(tmp_path, monkeypatch, fails):
    monkeypatch.setenv("CERTICHAT_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(sys, "argv", ["indexer", "build"])

    async def build(root):
        with (root / "index.lock").open("a") as probe:
            with pytest.raises(BlockingIOError):
                fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if fails:
            raise RuntimeError("Simulated indexing failure")

    monkeypatch.setattr(indexer, "build", build)
    if fails:
        with pytest.raises(RuntimeError, match="Simulated indexing failure"):
            indexer.main()
    else:
        indexer.main()
    with (tmp_path / "index.lock").open("a") as probe:
        fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)


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


@pytest.mark.parametrize("journal_mode", ["DELETE", "WAL"])
def test_prepare_clones_only_closed_stores_rebases_paths_and_preserves_original(tmp_path, monkeypatch, journal_mode):
    original = ready_snapshot(tmp_path, manifest("a" * 64))
    database = original / "system/databases/cognee_db"
    database.parent.mkdir(parents=True)
    old_uri = "file://" + str(original) + "/data/text.txt"
    connect = sqlite3.connect
    with closing(connect(database)) as db:
        assert db.execute("PRAGMA journal_mode=" + journal_mode).fetchone()[0] == journal_mode.lower()
        with db:
            db.execute("CREATE TABLE data (raw_data_location, original_data_location)")
            db.execute("INSERT INTO data VALUES (?, ?)", (old_uri, old_uri))
            db.execute("CREATE TABLE dataset_database (vector_database_url, graph_database_url)")
            db.execute("INSERT INTO dataset_database VALUES (?, '')", (str(original) + "/system/vector",))
    assert not database.with_name(database.name + "-wal").exists()
    connections = []

    def tracked_connect(*args, **kwargs):
        connection = connect(*args, **kwargs)
        connections.append(connection)
        return connection

    monkeypatch.setattr(indexer.sqlite3, "connect", tracked_connect)
    atomic_json(tmp_path / "active.json", {"version": original.name})
    atomic_json(tmp_path / "latest.json", manifest("b" * 64))
    before = {p.relative_to(original): p.read_bytes() for p in original.rglob("*") if p.is_file()}
    with (tmp_path / "stores.lock").open("a") as live_worker:
        fcntl.flock(live_worker, fcntl.LOCK_SH)
        with pytest.raises(BlockingIOError):
            indexer.prepare(tmp_path)
    indexer.prepare(tmp_path)
    assert len(connections) == 1
    with pytest.raises(sqlite3.ProgrammingError, match="closed"):
        connections[0].execute("SELECT 1")
    target = snapshot_path(tmp_path, "b" * 64)
    assert not (target / "ready.json").exists()
    assert read_json(target / "base.json") == {"version": target.name, "baseVersion": original.name}
    assert not (target / "system/databases/cognee_db-wal").exists()
    with closing(connect(target / "system/databases/cognee_db")) as db:
        assert db.execute("SELECT raw_data_location FROM data").fetchone()[0] == old_uri.replace(str(original), str(target))
        assert db.execute("SELECT vector_database_url FROM dataset_database").fetchone()[0] == str(target) + "/system/vector"
    assert before == {p.relative_to(original): p.read_bytes() for p in original.rglob("*") if p.is_file()}
    assert read_json(tmp_path / "active.json")["version"] == original.name
    with pytest.raises(FileNotFoundError):
        atomic_json(tmp_path / "candidate.json", {"version": target.name})
        indexer.activate(tmp_path)
    assert read_json(tmp_path / "active.json")["version"] == original.name


def test_changed_content_requires_preparation_and_never_mutates_active(tmp_path, monkeypatch):
    active = manifest("a" * 64)
    original = ready_snapshot(tmp_path, active)
    atomic_json(tmp_path / "active.json", {"version": original.name})
    changed = manifest("b" * 64)
    changed["documents"][0]["hash"] = "c" * 64
    monkeypatch.setattr(indexer, "refresh", AsyncMock(return_value=changed))
    assert asyncio.run(indexer.plan(tmp_path)) == "prepare"
    with pytest.raises(RuntimeError, match="Prepare the candidate"):
        asyncio.run(indexer.build(tmp_path))
    changed["contentHash"] = original.name
    with pytest.raises(RuntimeError, match="Refusing to mutate active"):
        asyncio.run(indexer.build(tmp_path))


@pytest.mark.parametrize("change,rollback,allowed", [("hash", False, False), ("url", False, True),
                                                    ("hash", True, True)])
def test_activation_rechecks_published_content_but_preserves_route_reuse_and_rollback(tmp_path, change, rollback, allowed):
    active, candidate = manifest("a" * 64), manifest("b" * 64)
    ready_snapshot(tmp_path, active)
    ready_snapshot(tmp_path, candidate)
    atomic_json(tmp_path / "active.json", {"version": active["contentHash"]})
    atomic_json(tmp_path / "candidate.json", {"version": candidate["contentHash"]})
    if rollback:
        atomic_json(tmp_path / "previous.json", {"version": candidate["contentHash"]})
    latest = deepcopy(candidate)
    latest["contentHash"] = "c" * 64
    latest["documents"][0][change] = digest("New published content") if change == "hash" else SITE + "new/"
    atomic_json(tmp_path / "latest.json", latest)
    if allowed:
        indexer.activate(tmp_path, rollback=rollback)
        assert read_json(tmp_path / "active.json")["version"] == candidate["contentHash"]
    else:
        with pytest.raises(RuntimeError, match="Published content changed"):
            indexer.activate(tmp_path)
        assert read_json(tmp_path / "active.json")["version"] == active["contentHash"]
        assert not (tmp_path / "previous.json").exists()

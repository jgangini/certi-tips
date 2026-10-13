"""Offline, resumable candidate construction; activation is owned by the host timer."""

import argparse
import asyncio
import fcntl
import os
import shutil
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from .corpus import (CORPUS_URL, DATASET, MANIFEST_URL, atomic_json, download,
                     read_json, same_indexed_content, segments, snapshot_path,
                     supported_fragments, validate_corpus, validate_manifest)
from .knowledge import close_cognee, configure_cognee


async def refresh(root: Path) -> dict:
    import json
    manifest = validate_manifest(json.loads(await download(MANIFEST_URL, 8_000_000)))
    root.mkdir(parents=True, exist_ok=True)
    atomic_json(root / "latest.json", manifest)
    return manifest


def reusable_snapshot(root: Path, manifest: dict) -> str | None:
    versions = [manifest["contentHash"]]
    # Prefer a prepared compatible candidate over the active graph; neither store is opened or moved.
    versions += [read_json(root / name)["version"] for name in ("candidate.json", "active.json")
                 if (root / name).exists()]
    for version in dict.fromkeys(versions):
        snapshot = snapshot_path(root, version)
        if not (snapshot / "ready.json").exists() or not (snapshot / "manifest.json").exists():
            continue
        indexed = read_json(snapshot / "manifest.json")
        ready = read_json(snapshot / "ready.json")
        if (indexed["contentHash"] == version and type(ready.get("documents")) is int
                and ready.get("version") == version and ready["documents"] == len(indexed["documents"])
                and same_indexed_content(indexed, manifest)):
            return version
    return None


async def plan(root: Path) -> str:
    manifest = await refresh(root)
    version = reusable_snapshot(root, manifest)
    if version:
        atomic_json(root / "candidate.json", {"version": version})
        return "ready"
    snapshot = snapshot_path(root, manifest["contentHash"])
    return "prepare" if (root / "active.json").exists() and not snapshot.exists() else "build"


def prepare(root: Path) -> None:
    """Clone closed stores; never change an active database or reuse its absolute paths."""
    version = read_json(root / "latest.json")["contentHash"]
    target = snapshot_path(root, version)
    if target.exists():
        return
    source = snapshot_path(root, read_json(root / "active.json")["version"])
    if read_json(source / "ready.json")["version"] != source.name:
        raise RuntimeError("Cannot clone an incomplete active snapshot")
    staging = target.with_name("prepare-" + version)
    with (root / "stores.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # ponytail: copy only after clean worker shutdown; native embedded stores cannot be copied live.
        if staging.exists():
            shutil.rmtree(staging)
        try:
            if any(path.is_symlink() for path in source.rglob("*")):
                raise RuntimeError("Snapshot contains unsupported links")
            shutil.copytree(source, staging)
            (staging / "ready.json").unlink()
            with closing(sqlite3.connect(staging / "system/databases/cognee_db")) as db:
                with db:
                    for table, column in (("data", "raw_data_location"), ("data", "original_data_location"),
                                          ("dataset_database", "vector_database_url"), ("dataset_database", "graph_database_url")):
                        for prefix in ("", "file://"):
                            old, new = prefix + str(source) + "/", prefix + str(target) + "/"
                            db.execute(f'UPDATE "{table}" SET "{column}" = ? || substr("{column}", ?) '
                                       f'WHERE substr("{column}", 1, ?) = ?', (new, len(old) + 1, len(old), old))
            atomic_json(staging / "base.json", {"version": version, "baseVersion": source.name})
            staging.rename(target)
        finally:
            if staging.exists():
                shutil.rmtree(staging)


async def update_sources(snapshot: Path, sources: dict) -> dict:
    import cognee
    from cognee.modules.users.methods import get_default_user
    from cognee.modules.data.methods import get_authorized_existing_datasets, get_dataset_data
    from cognee.tasks.ingestion.data_item import DataItem
    from cognee.context_global_variables import set_database_global_context_variables
    from cognee.infrastructure.databases.graph import get_graph_engine
    from cognee.modules.engine.operations.setup import setup
    from cognee.modules.migrations.startup import run_migrations_and_block

    await setup()
    await run_migrations_and_block(DATASET, None)
    user = await get_default_user()
    datasets = await get_authorized_existing_datasets([DATASET], "write", user)
    dataset = datasets[0] if datasets else None
    rows = await get_dataset_data(dataset.id) if dataset else []
    indexed = {row.name + "." + row.extension.lstrip("."): row for row in rows}
    if len(indexed) != len(rows):
        raise RuntimeError("Ambiguous source identities in candidate")
    previous = read_json(snapshot / "sources.json") if (snapshot / "sources.json").exists() else {}
    pending = snapshot / "updating.json"
    interrupted = read_json(pending).get("source") if pending.exists() else None
    counts = dict(added=0, updated=0, removed=0, reused=0)
    for filename in indexed.keys() - sources.keys():
        await cognee.forget(data_id=indexed[filename].id, dataset_id=dataset.id)
        previous.pop(filename, None)
        atomic_json(snapshot / "sources.json", previous)
        (snapshot / "sources" / filename).unlink(missing_ok=True)
        counts["removed"] += 1
    for filename, source in sources.items():
        row = indexed.get(filename)
        if row and previous.get(filename, {}).get("text") == source["text"] and filename != interrupted:
            counts["reused"] += 1
        else:
            path = snapshot / "sources" / filename
            path.write_text(source["text"], encoding="utf-8")
            atomic_json(pending, {"source": filename})
            if row:
                result = await cognee.update(data_id=row.id, data=str(path), dataset_id=dataset.id,
                                             chunk_level_diff=filename != interrupted)
                if result.get("status") not in {"incremental", "unchanged", "full_rebuild"}:
                    raise RuntimeError("Cognee did not complete the document update")
                counts["updated"] += 1
            else:
                # Stable pins preserve distinct source identities even when their text is identical.
                await cognee.add(DataItem(data=str(path), data_id=uuid5(NAMESPACE_URL, DATASET + "/" + filename)),
                                 dataset_name=DATASET, data_per_batch=1, skip_connection_test=True)
                counts["added"] += 1
            pending.unlink()
        previous[filename] = source
        atomic_json(snapshot / "sources.json", previous)
    # Native pipeline stamps skip completed documents, including retries after an interrupted batch.
    await cognee.cognify(datasets=[DATASET], data_per_batch=16, chunk_size=1000,
                         chunks_per_batch=1, extractor="llm", raise_on_error=True)
    dataset = (await get_authorized_existing_datasets([DATASET], "read", user, strict=True))[0]
    rows = await get_dataset_data(dataset.id)
    completed = {row.name + "." + row.extension.lstrip(".") for row in rows
                 if ((row.pipeline_status or {}).get("cognify_pipeline") or {}).get(str(dataset.id)) == "DATA_ITEM_PROCESSING_COMPLETED"}
    if completed != sources.keys():
        raise RuntimeError("Candidate has missing, obsolete or incomplete documents")
    async with set_database_global_context_variables(dataset.id, user.id):
        graph = await get_graph_engine()
        for row in rows:
            await graph.update_node(str(row.id), {"raw_data_location": row.raw_data_location})
    atomic_json(snapshot / "sources.json", sources)
    return counts


async def build(root: Path) -> None:
    manifest = await refresh(root)
    version = reusable_snapshot(root, manifest)
    if version:
        atomic_json(root / "candidate.json", {"version": version})
        return
    version = manifest["contentHash"]
    snapshot = snapshot_path(root, version)
    if (root / "active.json").exists():
        if read_json(root / "active.json")["version"] == version:
            raise RuntimeError("Refusing to mutate active stores")
        if not snapshot.exists():
            raise RuntimeError("Prepare the candidate from closed active stores before indexing")
    documents = validate_corpus(await download(CORPUS_URL, 32_000_000), manifest)
    snapshot.mkdir(parents=True, exist_ok=True)
    sources = segments(documents)
    source_dir = snapshot / "sources"
    source_dir.mkdir(exist_ok=True)
    configure_cognee(snapshot, os.environ["CERTICHAT_INDEX_INTERNAL_TOKEN"])
    try:
        counts = await update_sources(snapshot, sources)
        from .graph import read_graph, node_documents
        nodes, edges = await read_graph()
        evidence = [{"kind": "segment", "document_name": name}
                    for names in node_documents(nodes, edges).values() for name in names]
        if not supported_fragments(evidence, sources, manifest):
            raise RuntimeError("Candidate failed source provenance validation")
    finally:
        await close_cognee()
    atomic_json(snapshot / "manifest.json", manifest)
    atomic_json(snapshot / "changes.json", counts)
    atomic_json(snapshot / "ready.json", {"version": version, "documents": len(documents),
                                         "generatedAt": datetime.now(timezone.utc).isoformat()})
    atomic_json(root / "candidate.json", {"version": version})
    print(f"Candidate validated: {version}; {counts}")


def activate(root: Path, rollback: bool = False) -> None:
    requested = read_json(root / ("previous.json" if rollback else "candidate.json"))
    snapshot = snapshot_path(root, requested["version"])
    if read_json(snapshot / "ready.json")["version"] != requested["version"]:
        raise RuntimeError("Refusing incomplete snapshot")
    if not rollback and not same_indexed_content(read_json(snapshot / "manifest.json"),
                                                validate_manifest(read_json(root / "latest.json"))):
        raise RuntimeError("Published content changed while the candidate was indexing")
    active = root / "active.json"
    if active.exists():
        current = read_json(active)
        if current == requested:
            return
        if not rollback:
            atomic_json(root / "previous.json", current)
    atomic_json(active, requested)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("plan", "prepare", "build", "refresh", "activate", "rollback", "changed"), default="build", nargs="?")
    args = parser.parse_args()
    root = Path(os.environ.get("CERTICHAT_DATA_DIR", "/data"))
    if args.action in {"build", "prepare", "plan"}:
        root.mkdir(parents=True, exist_ok=True)
        # ponytail: Linux containers share this lock; process exit releases it without stale status flags.
        with (root / "index.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            if args.action == "prepare":
                prepare(root)
            elif args.action == "plan":
                print(asyncio.run(plan(root)))
            else:
                asyncio.run(build(root))
    elif args.action == "refresh":
        asyncio.run(refresh(root))
    elif args.action == "changed":
        candidate = root / "candidate.json"
        active = root / "active.json"
        print("yes" if candidate.exists() and (not active.exists() or read_json(candidate) != read_json(active)) else "no")
    else:
        activate(root, rollback=args.action == "rollback")


if __name__ == "__main__":
    main()

"""Offline, resumable candidate construction; activation is owned by the host timer."""

import argparse
import asyncio
import os
from pathlib import Path

from .corpus import (CORPUS_URL, DATASET, MANIFEST_URL, atomic_json, download,
                     read_json, segments, snapshot_path, supported_fragments, validate_corpus, validate_manifest)
from .knowledge import close_cognee, configure_cognee, retrieve_evidence


async def refresh(root: Path) -> dict:
    import json
    manifest = validate_manifest(json.loads(await download(MANIFEST_URL, 8_000_000)))
    root.mkdir(parents=True, exist_ok=True)
    atomic_json(root / "latest.json", manifest)
    return manifest


async def build(root: Path) -> None:
    manifest = await refresh(root)
    version = manifest["contentHash"]
    snapshot = snapshot_path(root, version)
    if (snapshot / "ready.json").exists():
        atomic_json(root / "candidate.json", {"version": version})
        return
    documents = validate_corpus(await download(CORPUS_URL, 32_000_000), manifest)
    snapshot.mkdir(parents=True, exist_ok=True)
    sources = segments(documents)
    source_dir = snapshot / "sources"
    source_dir.mkdir(exist_ok=True)
    atomic_json(snapshot / "manifest.json", manifest)
    atomic_json(snapshot / "sources.json", sources)
    configure_cognee(snapshot, os.environ["CERTICHAT_INDEX_INTERNAL_TOKEN"])
    import cognee
    try:
        for filename, source in sources.items():
            path = source_dir / filename
            path.write_text(source["text"], encoding="utf-8")
            await cognee.add(str(path), dataset_name=DATASET, data_per_batch=1,
                             skip_connection_test=True)
        await cognee.cognify(datasets=[DATASET], data_per_batch=4, chunk_size=1000,
                             chunks_per_batch=1, extractor="llm", raise_on_error=True)
        evidence = await retrieve_evidence(documents[0]["title"])
        if not supported_fragments(evidence, sources, manifest):
            raise RuntimeError("Candidate failed source provenance validation")
    finally:
        await close_cognee()
    atomic_json(snapshot / "ready.json", {"version": version, "documents": len(documents)})
    atomic_json(root / "candidate.json", {"version": version})
    print(f"Candidate validated: {version}")


def activate(root: Path, rollback: bool = False) -> None:
    requested = read_json(root / ("previous.json" if rollback else "candidate.json"))
    snapshot = snapshot_path(root, requested["version"])
    if read_json(snapshot / "ready.json")["version"] != requested["version"]:
        raise RuntimeError("Refusing incomplete snapshot")
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
    parser.add_argument("action", choices=("build", "refresh", "activate", "rollback", "changed"), default="build", nargs="?")
    args = parser.parse_args()
    root = Path(os.environ.get("CERTICHAT_DATA_DIR", "/data"))
    if args.action == "build":
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

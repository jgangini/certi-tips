"""Opt-in paid integration check in the real knowledge image.

Run with --run-paid, the index gateway token in the environment, and the private
Docker network containing api. Mount this file and the current app read-only;
do not mount the production knowledge volume. Every store lives in /tmp.
The gateway keeps its real monthly budget and ledger; measure that ledger around
the reported UTC phase boundaries. No provider or native Cognee API is mocked.
"""

import argparse
import asyncio
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

from app import indexer
from app.corpus import (CORPUS_URL, DATASET, SITE, atomic_json, digest, read_json,
                        segments, snapshot_path, supported_fragments,
                        validate_corpus, validate_manifest)


def fixture(revision):
    unchanged = "La biblioteca Río conserva manuales de arquitectura. Ana revisa los manuales cada lunes."
    texts = {
        "unchanged": unchanged,
        "duplicate": unchanged,
        "changed": "El almacén Sol retiene sus informes durante treinta días. Luis administra el almacén Sol.",
        "deleted": "El proyecto Nube Azul usa un catálogo experimental. Marta dirige el proyecto Nube Azul.",
    }
    if revision == "delta":
        texts["changed"] = texts["changed"].replace("treinta días", "noventa días")
        del texts["deleted"]
        texts["added"] = "El laboratorio Faro publica indicadores de calidad. Elena valida los indicadores del laboratorio Faro."
    documents = [{"id": name, "title": f"Prueba de integración: {name}", "courseId": "integration",
                  "url": SITE + f"integration/{name}/", "text": text} for name, text in texts.items()]
    raw = json.dumps({"schemaVersion": 1, "documents": documents}, ensure_ascii=False).encode()
    manifest = {"schemaVersion": 1, "contentHash": digest(raw), "corpusUrl": CORPUS_URL,
                "documents": [{key: value for key, value in doc.items() if key != "text"}
                              | {"hash": digest(doc["text"])} for doc in documents]}
    validate_manifest(manifest)
    validate_corpus(raw, manifest)
    return manifest, raw


def published_fixture(root, revision):
    manifest, corpus = fixture(revision)

    async def refresh(destination):
        assert destination == root
        destination.mkdir(parents=True, exist_ok=True)
        atomic_json(destination / "latest.json", manifest)
        return manifest

    async def download(url, maximum):
        assert url == CORPUS_URL and len(corpus) <= maximum
        return corpus

    indexer.refresh, indexer.download = refresh, download
    return manifest


async def inspect_snapshot(root, revision):
    from app.graph import read_graph
    from app.knowledge import close_cognee, configure_cognee, retrieve_evidence

    manifest, _ = fixture(revision)
    snapshot = snapshot_path(root, manifest["contentHash"])
    configure_cognee(snapshot, os.environ["CERTICHAT_INDEX_INTERNAL_TOKEN"])
    from cognee.modules.users.methods import get_default_user
    from cognee.modules.data.methods import get_authorized_existing_datasets, get_dataset_data

    try:
        user = await get_default_user()
        dataset = (await get_authorized_existing_datasets([DATASET], "read", user, strict=True))[0]
        rows = await get_dataset_data(dataset.id)
        nodes, edges = await read_graph()
        sources = read_json(snapshot / "sources.json")
        chunk_names = {props.get("document_name", "").removesuffix(".txt") for _node, props in nodes
                       if props.get("type") == "DocumentChunk"}
        assert chunk_names <= {name.removesuffix(".txt") for name in sources}, "Deleted source chunks remain in the graph"
        metadata = {}
        for row in rows:
            filename = row.name + "." + row.extension.lstrip(".")
            assert filename in sources, "Obsolete native data row survived"
            source_id = sources[filename]["id"]
            chunks = sorted(str(node_id) for node_id, props in nodes
                            if props.get("type") == "DocumentChunk"
                            and props.get("document_name", "").removesuffix(".txt") == row.name)
            assert chunks, f"No native chunks for {source_id}"
            metadata[source_id] = {"id": str(row.id), "chunks": chunks,
                                   "pipeline": row.pipeline_status, "hash": row.content_hash}
            for location in (row.raw_data_location, row.original_data_location):
                if location:
                    assert str(snapshot) + "/" in location, "A copied data row still targets another snapshot"
                    assert Path(location.removeprefix("file://")).is_file(), "Native data path is missing"
        assert set(metadata) == {doc["id"] for doc in manifest["documents"]}
        evidence = await retrieve_evidence("¿Quién revisa los manuales de la biblioteca Río y cuándo los revisa?")
        fragments = supported_fragments(evidence, sources, manifest)
        retrieved = Counter(sources[fragment["id"] + ".txt"]["id"] for fragment in fragments)
        assert retrieved["unchanged"] or retrieved["duplicate"], "Unchanged content is no longer retrievable"
        assert "deleted" not in retrieved or revision == "base", "Deleted content remains retrievable"
        return {"version": manifest["contentHash"], "documents": metadata,
                "retrieved": dict(retrieved), "nodes": len(nodes), "edges": len(edges)}
    finally:
        await close_cognee()


async def phase(root, name):
    revision = "base" if name.endswith("base") else "delta"
    manifest = published_fixture(root, revision)
    if name.startswith("inspect-"):
        atomic_json(root / f"{name}.json", await inspect_snapshot(root, revision))
    elif name == "build-base":
        assert await indexer.plan(root) == "build"
        await indexer.build(root)
        indexer.activate(root)
    elif name == "prepare-delta":
        assert await indexer.plan(root) == "prepare"
        indexer.prepare(root)
        assert read_json(snapshot_path(root, manifest["contentHash"]) / "base.json")["baseVersion"] == fixture("base")[0]["contentHash"]
    elif name == "build-delta":
        assert await indexer.plan(root) == "build"
        await indexer.build(root)
        snapshot = snapshot_path(root, manifest["contentHash"])
        assert read_json(snapshot / "changes.json") == {"added": 1, "updated": 1, "removed": 1, "reused": 2}
        indexer.activate(root)
    elif name == "unchanged-delta":
        # A fresh process must return before importing Cognee or downloading the corpus.
        async def forbidden_download(*_args):
            raise AssertionError("An unchanged corpus was downloaded")

        indexer.download = forbidden_download
        assert "cognee" not in sys.modules
        assert await indexer.plan(root) == "ready"
        await indexer.build(root)
        assert "cognee" not in sys.modules, "No-change polling opened Cognee"
        assert read_json(root / "active.json") == read_json(root / "candidate.json")


def fingerprint(snapshot):
    result = {}
    for path in sorted(snapshot.rglob("*")):
        if path.is_file() and not path.name.endswith(".lock"):
            with path.open("rb") as stream:
                result[str(path.relative_to(snapshot))] = hashlib.file_digest(stream, "sha256").hexdigest()
    return result


def subprocess_phase(root, name):
    print(json.dumps({"phase": name, "event": "start", "at": datetime.now(timezone.utc).isoformat()}), flush=True)
    completed = subprocess.run([sys.executable, str(Path(__file__).resolve()), "--run-paid", "--phase", name,
                                "--root", str(root)], capture_output=True, text=True, timeout=1800)
    if completed.returncode:
        output = completed.stdout + completed.stderr
        for key in ("CERTICHAT_INDEX_INTERNAL_TOKEN", "OPENROUTER_API_KEY", "CERTICHAT_CHAT_INTERNAL_TOKEN"):
            secret = os.environ.get(key)
            if secret:
                output = output.replace(secret, "[redacted]")
        raise RuntimeError(f"Integration phase {name} failed:\n{output[-12000:]}")
    print(json.dumps({"phase": name, "event": "passed", "at": datetime.now(timezone.utc).isoformat()}), flush=True)


def check(root):
    subprocess_phase(root, "build-base")
    subprocess_phase(root, "inspect-base")
    base = read_json(root / "inspect-base.json")
    source = snapshot_path(root, base["version"])
    original = fingerprint(source)
    base_docs = base["documents"]
    assert len({doc["id"] for doc in base_docs.values()}) == 4, "Identical texts collapsed distinct sources"
    for name in ("prepare-delta", "build-delta", "inspect-delta"):
        subprocess_phase(root, name)
        assert fingerprint(source) == original, f"Phase {name} modified the original snapshot"
    updated = read_json(root / "inspect-delta.json")
    current = updated["documents"]
    for name in ("unchanged", "duplicate", "changed"):
        assert current[name]["id"] == base_docs[name]["id"], f"Document identity changed for {name}"
    for name in ("unchanged", "duplicate"):
        assert current[name] == base_docs[name], f"Unchanged chunks or pipeline stamps were regenerated for {name}"
    assert current["changed"]["hash"] != base_docs["changed"]["hash"]
    assert "deleted" not in current and "added" in current
    assert not set(base_docs["deleted"]["chunks"]) & {chunk for doc in current.values() for chunk in doc["chunks"]}
    candidate = snapshot_path(root, updated["version"])
    ready = fingerprint(candidate)
    subprocess_phase(root, "unchanged-delta")
    assert fingerprint(candidate) == ready and fingerprint(source) == original
    assert read_json(root / "previous.json")["version"] == base["version"]
    print(json.dumps({"result": "passed", "baseDocuments": 4, "currentDocuments": 4,
                      "changes": read_json(candidate / "changes.json"), "preservedDocumentIds": 3,
                      "preservedChunks": sum(len(current[name]["chunks"]) for name in ("unchanged", "duplicate")),
                      "retrievedBefore": base["retrieved"], "retrievedAfter": updated["retrieved"],
                      "originalSnapshotUnchanged": True, "noChangeOpenedCognee": False}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-paid", action="store_true", help="Required opt-in: uses the real index budget")
    parser.add_argument("--phase", choices=("build-base", "inspect-base", "prepare-delta", "build-delta", "inspect-delta", "unchanged-delta"))
    parser.add_argument("--root", type=Path)
    args = parser.parse_args()
    if not args.run_paid or len(os.environ.get("CERTICHAT_INDEX_INTERNAL_TOKEN", "")) < 32:
        parser.error("Use --run-paid with the private index gateway token supplied via environment")
    if args.phase:
        if not args.root or Path("/tmp") not in args.root.resolve().parents or not args.root.name.startswith("certichat-incremental-"):
            parser.error("Integration phases require an isolated /tmp/certichat-incremental-* directory")
        asyncio.run(phase(args.root.resolve(), args.phase))
    else:
        if args.root:
            parser.error("The main check always creates its own disposable /tmp directory")
        with tempfile.TemporaryDirectory(prefix="certichat-incremental-", dir="/tmp") as directory:
            check(Path(directory))


if __name__ == "__main__":
    main()

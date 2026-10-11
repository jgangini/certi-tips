import json
from copy import deepcopy
from pathlib import Path

import pytest

from app.corpus import (CORPUS_URL, SITE, digest, public_url, segments,
                        snapshot_path, supported_fragments, validate_corpus, validate_manifest)


def fixture():
    doc = {"id": "course/chapter", "title": "Español", "courseId": "course",
           "url": SITE + "course/chapter/#concepto", "text": "Información publicada. " * 200}
    raw = json.dumps({"schemaVersion": 1, "documents": [doc]}, ensure_ascii=False).encode()
    manifest = {"schemaVersion": 1, "contentHash": digest(raw), "corpusUrl": CORPUS_URL,
                "documents": [{k: v for k, v in doc.items() if k != "text"} | {"hash": digest(doc["text"])}]}
    return doc, raw, manifest


def test_hash_validation_and_published_sources():
    doc, raw, manifest = fixture()
    assert validate_corpus(raw, validate_manifest(manifest)) == [doc]
    with pytest.raises(ValueError):
        validate_corpus(raw + b" ", manifest)
    invalid = deepcopy(manifest)
    invalid["documents"][0]["url"] = "https://evil.example/extract"
    with pytest.raises(ValueError):
        validate_manifest(invalid)
    invalid = deepcopy(manifest)
    invalid["documents"].append(invalid["documents"][0])
    with pytest.raises(ValueError):
        validate_manifest(invalid)


@pytest.mark.parametrize("url", ["https://jgangini.github.io.evil.test/certi-tips/x",
    SITE + "%2e%2e/.private/x", SITE + "%5cx", "http://jgangini.github.io/certi-tips/x",
    SITE + "x?redirect=evil", "https://user@jgangini.github.io/certi-tips/x"])
def test_reject_ambiguous_public_urls(url):
    assert not public_url(url)


def test_provenance_never_returns_changed_deleted_or_unmapped_sources():
    doc, _, manifest = fixture()
    sources = segments([doc])
    evidence = [{"kind": "segment", "document_name": name.removesuffix(".txt")} for name in sources]
    evidence += [{"kind": "segment", "document_name": "invented.txt"}]
    found = supported_fragments(evidence, sources, manifest)
    assert len(found) == 2 and found[0]["url"] == doc["url"]
    assert "".join(f["text"] for f in found) == doc["text"]
    manifest["documents"][0]["url"] = SITE + "moved/"
    assert not supported_fragments(evidence, sources, manifest)
    manifest["documents"][0]["url"] = doc["url"]
    manifest["documents"][0]["hash"] = "0" * 64
    assert not supported_fragments(evidence, sources, manifest)
    manifest["documents"] = []
    assert not supported_fragments(evidence, sources, manifest)


def test_snapshot_paths_cannot_traverse():
    tmp_path = Path("/data")
    with pytest.raises(ValueError):
        snapshot_path(tmp_path, "../live")
    assert snapshot_path(tmp_path, "a" * 64).parent == tmp_path / "snapshots"


def test_context_byte_limit_skips_large_fragment_but_keeps_later_small_source():
    documents = [{"id": str(i), "title": str(i), "courseId": "course", "url": SITE + str(i),
                  "text": text} for i, text in enumerate(["á" * 3000, "á" * 3000, "á" * 3000, "segunda parte"])]
    sources = segments(documents)
    latest = {"documents": [{key: value for key, value in doc.items() if key != "text"} |
                            {"hash": digest(doc["text"])} for doc in documents]}
    fragments = supported_fragments([{"kind": "segment", "document_name": name} for name in sources], sources, latest)
    assert [item["title"] for item in fragments] == ["0", "1", "3"]
    assert sum(len(item["text"].encode()) for item in fragments) <= 16000

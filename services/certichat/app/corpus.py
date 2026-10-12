"""The public build manifest is the only source of CertiChat knowledge."""

import hashlib
import json
import re
import tempfile
from pathlib import Path
from urllib.parse import unquote, urlsplit

import httpx

SITE = "https://jgangini.github.io/certitips/"
MANIFEST_URL = SITE + "assets/certichat/manifest.json"
CORPUS_URL = SITE + "assets/certichat/corpus.json"
HASH = re.compile(r"[a-f0-9]{64}")
DATASET = "certitips"


def digest(value: str | bytes) -> str:
    return hashlib.sha256(value.encode("utf-8") if isinstance(value, str) else value).hexdigest()


def public_url(value: str) -> bool:
    if not isinstance(value, str) or len(value) > 1500:
        return False
    parsed = urlsplit(value)
    decoded = unquote(parsed.path)
    return (parsed.scheme == "https" and parsed.netloc == "jgangini.github.io"
            and decoded.startswith("/certitips/") and not parsed.query
            and "\\" not in decoded and not any(p in {".", ".."} for p in decoded.split("/"))
            and not any(ord(c) < 32 for c in value))


def validate_manifest(value: dict) -> dict:
    if (not isinstance(value, dict) or value.get("schemaVersion") != 1
            or not HASH.fullmatch(str(value.get("contentHash", "")))
            or value.get("corpusUrl") != CORPUS_URL):
        raise ValueError("Invalid knowledge manifest")
    documents = value.get("documents")
    if not isinstance(documents, list) or not 1 <= len(documents) <= 10000:
        raise ValueError("Invalid document count")
    seen = set()
    for doc in documents:
        if not isinstance(doc, dict):
            raise ValueError("Invalid document")
        if any(not isinstance(doc.get(key), str) or not 1 <= len(doc[key]) <= 1500
               for key in ("id", "title", "url", "courseId")):
            raise ValueError("Invalid document metadata")
        if doc["id"] in seen or not public_url(doc["url"]) or not HASH.fullmatch(str(doc.get("hash", ""))):
            raise ValueError("Duplicate document or invalid source")
        seen.add(doc["id"])
    return value


def validate_corpus(raw: bytes, manifest: dict) -> list[dict]:
    if digest(raw) != manifest["contentHash"]:
        raise ValueError("Published corpus digest mismatch")
    corpus = json.loads(raw)
    if not isinstance(corpus, dict) or corpus.get("schemaVersion") != 1:
        raise ValueError("Invalid corpus schema")
    docs = corpus.get("documents")
    if not isinstance(docs, list) or len(docs) != len(manifest["documents"]):
        raise ValueError("Corpus documents mismatch")
    expected = {doc["id"]: doc for doc in manifest["documents"]}
    seen = set()
    for doc in docs:
        if not isinstance(doc, dict) or doc.get("id") not in expected or doc["id"] in seen:
            raise ValueError("Unexpected corpus document")
        metadata = expected[doc["id"]]
        if any(doc.get(key) != metadata[key] for key in ("id", "title", "url", "courseId")):
            raise ValueError("Corpus metadata mismatch")
        text = doc.get("text")
        if not isinstance(text, str) or not text.strip() or len(text) > 100000 or digest(text) != metadata["hash"]:
            raise ValueError("Document text mismatch")
        seen.add(doc["id"])
    return docs


async def download(url: str, max_bytes: int) -> bytes:
    if url not in (MANIFEST_URL, CORPUS_URL):
        raise ValueError("Only published knowledge artifacts may be downloaded")
    async with httpx.AsyncClient(timeout=30, follow_redirects=False, trust_env=False) as client:
        async with client.stream("GET", url, headers={"Cache-Control": "no-cache"}) as response:
            response.raise_for_status()
            data = bytearray()
            async for chunk in response.aiter_bytes():
                data.extend(chunk)
                if len(data) > max_bytes:
                    raise ValueError("Knowledge artifact is too large")
            return bytes(data)


def atomic_json(path: Path, value: dict) -> None:
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                     prefix=path.name, suffix=".tmp", delete=False) as stream:
        json.dump(value, stream, ensure_ascii=False)
        temporary = Path(stream.name)
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def snapshot_path(root: Path, version: str) -> Path:
    if not HASH.fullmatch(version):
        raise ValueError("Invalid snapshot version")
    return root / "snapshots" / version


def segments(documents: list[dict]) -> dict[str, dict]:
    result = {}
    for doc in documents:
        text = doc["text"]
        for index, offset in enumerate(range(0, len(text), 3000)):
            name = f"{digest(doc['id'])}-{index:04d}.txt"
            result[name] = {**doc, "hash": digest(text), "text": text[offset:offset + 3000]}
    return result


def same_indexed_content(indexed: dict, current: dict) -> bool:
    # URLs locate published evidence; Cognee ingests only text under names derived from document IDs.
    keys = ("id", "title", "courseId", "hash")
    return bool(indexed["documents"]) and sorted(
        tuple(doc[key] for key in keys) for doc in indexed["documents"]
    ) == sorted(tuple(doc[key] for key in keys) for doc in current["documents"])


def supported_fragments(evidence: list[dict], sources: dict, latest: dict) -> list[dict]:
    current = {doc["id"]: doc for doc in latest["documents"]}
    candidates, seen = [], set()
    for item in evidence:
        name = item.get("document_name")
        if isinstance(name, str) and not name.endswith(".txt"):
            name += ".txt"  # Cognee 1.6.1 records a document's filename stem.
        source = sources.get(name) if isinstance(name, str) else None
        if item.get("kind") != "segment" or not source or name in seen:
            continue
        metadata = current.get(source["id"])
        if (not metadata or not public_url(metadata.get("url"))
                or any(metadata.get(key) != source.get(key) for key in ("hash", "title", "courseId"))):
            continue
        seen.add(name)
        candidates.append({"id": name.removesuffix(".txt"), "title": source["title"],
                           "url": metadata["url"], "text": source["text"]})
    selected, size = [], 0
    for candidate in candidates:
        length = len(candidate["text"].encode("utf-8"))
        if len(selected) >= 8:
            break
        if size + length > 16000:
            continue
        size += length
        selected.append(candidate)
    return selected

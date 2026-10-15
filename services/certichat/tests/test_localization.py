"""Localized lookup may choose canonical segments but cannot alter evidence or call a model."""

import asyncio
from copy import deepcopy
import json
from types import SimpleNamespace

import httpx
import pytest

from app import knowledge, localization
from app.corpus import CORPUS_URL, SITE, atomic_json, digest, segments, supported_fragments


def fixture():
    document = {"id": "course/storage#data", "title": "Almacenamiento", "courseId": "course",
                "url": SITE + "course/storage/#data", "text": "Oracle almacena datos. " + "🙂" * 3000}
    sources = segments([document])
    manifest = {"contentHash": "a" * 64, "documents": [
        {key: value for key, value in document.items() if key != "text"} | {"hash": digest(document["text"])}]}
    texts = {"en": "Store information in the database", "pt": "Armazenar informações no banco de dados",
             "it": "Archiviare informazioni nella banca dati"}
    projections = {locale: {"schemaVersion": 1, "locale": locale, "contentHash": manifest["contentHash"],
        "segments": [{"name": name, "sourceHash": source["hash"], "title": text, "text": text}
                     for name, source in sources.items()]} for locale, text in texts.items()}
    files = {locale + ".json": json.dumps(value).encode() for locale, value in projections.items()}
    files["manifest.json"] = json.dumps({"schemaVersion": 1, "contentHash": manifest["contentHash"],
        "locales": {locale: digest(files[locale + ".json"]) for locale in texts}}).encode()
    return sources, manifest, files


def publish(root, manifest, files):
    calls = []

    async def download(url, limit):
        assert url.startswith(localization.I18N_URL)
        raw = files[url.removeprefix(localization.I18N_URL)]
        assert len(raw) <= limit
        calls.append(url)
        return raw

    assert asyncio.run(localization.refresh_localization(root, manifest, download))
    assert len(calls) == 4


@pytest.mark.parametrize("locale,query", [("en", "How do I store information?"),
    ("pt", "Como armazenar informações?"), ("it", "Come archiviare informazioni?")])
def test_localized_matches_resolve_original_spanish_evidence(tmp_path, locale, query):
    sources, manifest, files = fixture()
    publish(tmp_path, manifest, files)
    evidence = localization.localized_evidence(tmp_path, locale, query, sources, manifest)
    assert evidence and all(set(item) == {"kind", "document_name"} for item in evidence)
    fragments = supported_fragments(evidence, sources, manifest)
    assert fragments[0]["text"].startswith("Oracle almacena datos.")
    assert fragments[0]["url"].endswith("#data") and len(sources) == 2
    assert localization.localized_evidence(tmp_path, "es", query, sources, manifest) == []
    assert localization.localized_evidence(tmp_path, locale, "unmatchedxyz", sources, manifest) == []


@pytest.mark.parametrize("locale,query", [("es", "¿Cómo almacena datos Oracle?"),
    ("en", "How do I store information?"), ("pt", "Como armazenar informações?"),
    ("it", "Come archiviare informazioni?")])
def test_equivalent_queries_recover_same_canonical_ids_without_providers(tmp_path, monkeypatch, locale, query):
    sources, manifest, files = fixture()
    manifest = {**manifest, "schemaVersion": 1, "corpusUrl": CORPUS_URL}
    publish(tmp_path, manifest, files)
    atomic_json(tmp_path / "latest.json", manifest)
    monkeypatch.setattr(knowledge.app, "state", SimpleNamespace(root=tmp_path, token="test-token",
        snapshot=tmp_path, version=manifest["contentHash"], sources=sources, lock=asyncio.Lock()))
    calls = []

    async def native(message, context):
        # Exercise the fusion contract, not a claimed evaluation of real multilingual embeddings.
        calls.append((message, context))
        return [{"kind": "segment", "document_name": name} for name in sources] if locale == "es" else []

    async def graph():
        return [], []

    monkeypatch.setattr(knowledge, "retrieve_evidence", native)
    monkeypatch.setattr(knowledge, "read_graph", graph)
    result = asyncio.run(knowledge.retrieve(knowledge.Retrieval(message=query, locale=locale), "Bearer test-token"))
    expected = supported_fragments([{"kind": "segment", "document_name": name} for name in sources], sources, manifest)
    assert result["fragments"] == expected
    assert {fragment["id"] for fragment in result["fragments"]} == {name.removesuffix(".txt") for name in sources}
    assert calls == [(query, query)]


def test_stale_unknown_and_forged_segments_never_become_evidence(tmp_path):
    sources, manifest, files = fixture()
    publish(tmp_path, manifest, files)
    stale = {**manifest, "contentHash": "b" * 64}
    assert localization.localized_evidence(tmp_path, "en", "information", sources, stale) == []
    stale = deepcopy(manifest)
    stale["documents"][0]["hash"] = "b" * 64
    assert localization.localized_evidence(tmp_path, "en", "information", sources, stale) == []
    assert localization.localized_evidence(tmp_path, "en", "information", {}, manifest) == []
    cache = json.loads((tmp_path / "localized-search.json").read_bytes())
    for entry in cache["locales"]["en"]:
        entry["sourceHash"] = "b" * 64
    atomic_json(tmp_path / "localized-search.json", cache)
    assert localization.localized_evidence(tmp_path, "en", "information", sources, manifest) == []


def test_failed_refresh_retains_last_complete_projection(tmp_path):
    sources, manifest, files = fixture()
    publish(tmp_path, manifest, files)
    before = (tmp_path / "localized-search.json").read_bytes()
    files["pt.json"] += b" "

    async def mismatched(url, _limit):
        return files[url.removeprefix(localization.I18N_URL)]

    assert not asyncio.run(localization.refresh_localization(tmp_path, manifest, mismatched))
    assert (tmp_path / "localized-search.json").read_bytes() == before

    async def offline(*_args):
        raise httpx.ConnectError("offline")

    assert not asyncio.run(localization.refresh_localization(tmp_path, manifest, offline))
    assert localization.localized_evidence(tmp_path, "en", "information", sources, manifest)


@pytest.mark.parametrize("change", [lambda value: value.update(locale="es"),
    lambda value: value["segments"].append(value["segments"][0]),
    lambda value: value["segments"][0].update(name="../../private.txt"),
    lambda value: value["segments"][0].update(text="x" * 15001)])
def test_projection_rejects_unknown_locale_duplicate_path_and_oversized_text(change):
    _, manifest, files = fixture()
    value = json.loads(files["en.json"])
    change(value)
    with pytest.raises(ValueError):
        localization.validate_projection(value, "en", manifest["contentHash"])

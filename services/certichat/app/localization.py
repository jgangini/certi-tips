"""Offline translation projections select existing Spanish evidence, never create it."""

from functools import lru_cache
import json
import logging
import re
import unicodedata

import httpx

from .corpus import SITE, atomic_json, digest

I18N_URL = SITE + "assets/certichat/i18n/"
PROJECTION_BYTES = 32_000_000
TOTAL_BYTES = 64_000_000
HASH = re.compile(r"[a-f0-9]{64}\Z")
SEGMENT = re.compile(r"[a-f0-9]{64}-\d{4}\.txt\Z")
IGNORED = {
    "en": set("a an the and or of to for with in on is are how what can i my do does this that it".split()),
    "pt": set("a o as os um uma de do da dos das e ou em no na para por com como que qual eu meu isso".split()),
    "it": set("a il lo la i gli le un una di del della e o in nel per con come che quale io mio questo".split()),
}


def validate_projection(value, locale, version):
    if (not isinstance(value, dict) or value.get("schemaVersion") != 1 or value.get("locale") != locale
            or value.get("contentHash") != version or not isinstance(value.get("segments"), list)
            or not 1 <= len(value["segments"]) <= 10000):
        raise ValueError("Invalid localized retrieval projection")
    seen = set()
    for segment in value["segments"]:
        if (not isinstance(segment, dict) or not SEGMENT.fullmatch(str(segment.get("name", "")))
                or segment["name"] in seen or not HASH.fullmatch(str(segment.get("sourceHash", "")))
                or any(not isinstance(segment.get(key), str) or not segment[key].strip()
                       or len(segment[key]) > limit for key, limit in (("title", 1500), ("text", 15000)))):
            raise ValueError("Invalid localized retrieval segment")
        seen.add(segment["name"])
    return value["segments"]


async def refresh_localization(root, manifest, download):
    try:
        raw = await download(I18N_URL + "manifest.json", 100_000)
        metadata = json.loads(raw)
        version = manifest["contentHash"]
        if (not isinstance(metadata, dict) or metadata.get("schemaVersion") != 1
                or metadata.get("contentHash") != version or not isinstance(metadata.get("locales"), dict)
                or set(metadata["locales"]) != set(IGNORED)
                or any(not isinstance(value, str) or not HASH.fullmatch(value) for value in metadata["locales"].values())):
            raise ValueError("Invalid localized retrieval manifest")
        remaining, locales = TOTAL_BYTES, {}
        for locale, expected in metadata["locales"].items():
            raw = await download(I18N_URL + locale + ".json", min(PROJECTION_BYTES, remaining))
            remaining -= len(raw)
            if remaining < 0 or digest(raw) != expected:
                raise ValueError("Localized retrieval digest mismatch")
            locales[locale] = validate_projection(json.loads(raw), locale, version)
        atomic_json(root / "localized-search.json", {"contentHash": version, "locales": locales})
        return True
    except (OSError, ValueError, RecursionError, httpx.HTTPError) as error:
        logging.getLogger(__name__).warning("Localized retrieval unavailable (%s); retaining canonical retrieval.", type(error).__name__)
        return False


def words(value):
    normalized = "".join(char for char in unicodedata.normalize("NFKD", value.casefold())
                         if not unicodedata.combining(char))
    return set(re.findall(r"[a-z0-9]+", normalized))


@lru_cache(maxsize=1)
def search_projection(path, stamp, size):
    if size > TOTAL_BYTES:
        raise ValueError("Localized retrieval cache is too large")
    value = json.loads(path.read_bytes())
    version = value["contentHash"]
    if not isinstance(version, str) or not HASH.fullmatch(version) or set(value["locales"]) != set(IGNORED):
        raise ValueError("Invalid localized retrieval cache")
    locales = {}
    for locale, entries in value["locales"].items():
        validate_projection({"schemaVersion": 1, "locale": locale, "contentHash": version, "segments": entries}, locale, version)
        locales[locale] = [(entry, words(entry["title"]), words(entry["text"])) for entry in entries]
    return version, locales


def localized_evidence(root, locale, message, sources, manifest):
    if locale not in IGNORED:
        return []
    try:
        path = root / "localized-search.json"
        stat = path.stat()
        version, locales = search_projection(path, stat.st_mtime_ns, stat.st_size)
        if version != manifest["contentHash"]:
            return []
    except (OSError, ValueError, KeyError, TypeError, RecursionError):
        return []
    terms = words(message) - IGNORED[locale]
    if not terms:
        return []
    current = {document["id"]: document for document in manifest["documents"]}
    matches = []
    # ponytail: bounded linear scan of <=10,000 segments; add an inverted index only after measured latency warrants it.
    for entry, title, text in locales[locale]:
        source = sources.get(entry["name"])
        if not source or source["hash"] != entry["sourceHash"] or current.get(source["id"], {}).get("hash") != source["hash"]:
            continue
        covered = terms & (title | text)
        if covered:
            score = len(covered) * 10 + len(terms & title) * 5
            matches.append((-score, entry["name"]))
    return [{"kind": "segment", "document_name": name} for _, name in sorted(matches)[:8]]

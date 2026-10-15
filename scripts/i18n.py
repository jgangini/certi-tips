"""Generate/check disposable translations; Spanish remains the only editable source."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor

from i18n_models import ArgosModel, file_hash, model_files, pieces, protected_pattern
from i18n_svg import render_svg, svg_sources, validate_svg

LOCALES = ("en", "pt", "it")


def encoded(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()


def sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def read_json(path: Path, limit=200 * 1024 * 1024):
    if path.stat().st_size > limit:
        raise ValueError(f"JSON exceeds size limit: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(encoded(value))
    temporary.replace(path)


def manifest_records(manifest):
    if manifest.get("version") != 1 or manifest.get("sourceRoot", "data/es") != "data/es":
        raise ValueError("Invalid source manifest/version")
    records = manifest.get("segments")
    if not isinstance(records, list) or len(records) > 250000:
        raise ValueError("Invalid manifest segment list")
    found = set()
    for record in records:
        text, context = record.get("text"), record.get("context", "")
        if not isinstance(text, str) or len(text) > 32768 or not isinstance(context, str) or len(context) > 1024:
            raise ValueError("Invalid translation text/context")
        expected = sha((context + "\0" + text).encode())
        if record.get("id") != expected or expected in found:
            raise ValueError("Invalid/duplicate manifest segment identity")
        found.add(expected)
    return records


def source_digest(records):
    return sha(encoded(sorted([[item["id"], item["text"], item.get("context", "")] for item in records])))


def validate_config(config):
    if config.get("version") != 1 or config.get("sourceLocale") != "es":
        raise ValueError("Invalid i18n configuration")
    pairs = [(model.get("from"), model.get("to")) for model in config.get("models", [])]
    if pairs != [("es", "en"), ("en", "pb"), ("en", "it")]:
        raise ValueError("Expected pinned es→en, en→pb, en→it models")
    for model in config["models"]:
        if not re.fullmatch(r"[a-z0-9_-]+", model.get("id", "")) or not re.fullmatch(r"[a-f0-9]{64}", model.get("sha256", "")):
            raise ValueError("Invalid model identifier/hash")
    for locale in LOCALES:
        if not isinstance(config.get("overrides", {}).get(locale, {}), dict):
            raise ValueError("Invalid translation overrides")


def validate_translation(source, target, protected):
    if not isinstance(target, str) or not target.strip() or len(target) > 131072:
        raise ValueError(f"Empty/oversize translation: {source[:80]}")
    if any(char.isalpha() for char in source) and not any(char.isalpha() for char in target):
        raise ValueError(f"Translation lost all words: {source[:100]}")
    # Models never see these tokens; changed placeholders must also fail reviewed overrides.
    wanted = [match.group() for match in protected.finditer(source)]
    for token in set(wanted):
        boundary_start = r"(?<!\w)" if token[0].isalnum() or token[0] == "_" else ""
        boundary_end = r"(?!\w)" if token[-1].isalnum() or token[-1] == "_" else ""
        matches = re.findall(boundary_start + re.escape(token) + boundary_end, target)
        if len(matches) < wanted.count(token):
            raise ValueError(f"Translation lost protected token {token!r}: {source[:100]}")
    if len(target) > max(80, len(source) * 3):
        raise ValueError(f"Translation expands unexpectedly; review an override: {source[:150]}")
    repetition = re.compile(r"\b((?!that\b)\w{3,})[ \t]+\1\b", re.I)
    if repetition.search(target) and not repetition.search(source):
        raise ValueError(f"Translation repeats words; review an override: {source[:150]}")


class Translator:
    def __init__(self, root, config, digest):
        self.root, self.config, self.digest = root, config, digest
        self.protected = protected_pattern(config["protectedTerms"])
        self.models = {}
        self.replacement_maps = {locale: self.replacements(locale) for locale in LOCALES}
        self.patterns = {locale: protected_pattern(config["protectedTerms"] + list(values)) for locale, values in self.replacement_maps.items()}

    def replacements(self, locale):
        glossary = self.config.get("glossary", {})
        replacements = {source if locale == "en" else targets["en"]: targets[locale] for source, targets in glossary.items()}
        # Reviewed source phrases also apply inside longer corpus blocks, preventing drift there.
        for source, target in self.config["overrides"].get(locale, {}).items():
            intermediate = source if locale == "en" else self.config["overrides"].get("en", {}).get(source)
            if intermediate:
                replacements[intermediate] = target
        return replacements

    def mask(self, text, locale, preserved=()):
        replacements, pattern = self.replacement_maps[locale], self.patterns[locale]
        values = []
        def replace(match):
            values.append(match.group() if match.group() in preserved else replacements.get(match.group(), match.group()))
            return f"ZXQ{len(values) - 1}XZ"
        return pattern.sub(replace, text), values

    @staticmethod
    def restore(text, values):
        for index, value in enumerate(values):
            token = f"ZXQ{index}XZ"
            matcher = re.compile(r"\s*".join(map(re.escape, token)))
            if len(matcher.findall(text)) != 1:
                raise ValueError(f"Model changed protected marker {token}")
            def insert(match):
                before = " " if match.start() and match.string[match.start() - 1].isalnum() else ""
                after = " " if match.end() < len(match.string) and match.string[match.end()].isalnum() else ""
                return before + value + after
            text = matcher.sub(insert, text)
        if re.search(r"ZXQ\s*\d+\s*XZ", text):
            raise ValueError("Unexpected model marker")
        return text

    def phrases(self, locale, values):
        spec = self.config["models"][LOCALES.index(locale)]
        filename = self.root / ".cache/i18n/phrases" / f"{spec['sha256']}-{self.config['engineRevision']}.json"
        cached = read_json(filename) if filename.exists() else {}
        missing = list(dict.fromkeys(value for value in values if value not in cached))
        if missing and locale not in self.models:
            self.models[locale] = ArgosModel(self.root / ".cache/i18n/models", spec)
        for offset in range(0, len(missing), 32):
            batch = missing[offset:offset + 32]
            translated = self.models[locale].translate(batch)
            for source, target in zip(batch, translated, strict=True):
                if not target:
                    raise ValueError(f"Model returned empty text for {source!r}")
                cached[source] = target
            if offset % 256 == 0 or offset + 32 >= len(missing):
                write_json(filename, cached)
                print(f"{locale}: {min(offset + 32, len(missing))}/{len(missing)} uncached phrases", flush=True)
        return cached

    def restore_blocks(self, locale, plans, markers, sources, preserved):
        phrases = self.phrases(locale, [text for plan in plans.values() for text, translate in plan if translate])
        result, retry = {}, {}
        for identity, plan in plans.items():
            rendered = "".join(phrases[text] if translate else text for text, translate in plan)
            try:
                result[identity] = self.restore(rendered, markers[identity])
            except ValueError:
                glossary, pattern = self.replacement_maps[locale], self.patterns[locale]
                retry[identity] = [(glossary.get(text, text) if not translate and text not in preserved[identity] else text, translate) for text, translate in pieces(sources[identity], pattern)]
        if retry:
            result.update(self.retry_blocks(locale, retry))
            write_json(self.root / "output" / f"i18n-{locale}-marker-retries.json", [{"id": identity, "source": sources[identity], "translation": result[identity]} for identity in retry])
            print(f"{locale}: {len(retry)} blocks retried with literal-token preservation (output/i18n-{locale}-marker-retries.json)", flush=True)
        return result

    def retry_blocks(self, locale, plans):
        # Never publish broken markers: immutable tokens remain outside fallback inference.
        phrases = self.phrases(locale, [text for plan in plans.values() for text, translate in plan if translate])
        result = {}
        for identity, plan in plans.items():
            output = ""
            for text, translate in plan:
                value = phrases[text] if translate else text
                if output and value and (output[-1].isalnum() or output[-1] in ")]}\"") and value[0].isalnum():
                    output += " "
                output += value
            result[identity] = output
        return result

    def blocks(self, locale, records, english=None):
        overrides = self.config["overrides"].get(locale, {})
        plans, result, markers, sources, preserved = {}, {}, {}, {}, {}
        for record in records:
            original, identity = record["text"], record["id"]
            if original in overrides:
                result[identity] = overrides[original]
            else:
                sources[identity] = english[identity] if english is not None else original
                preserved[identity] = {match.group() for match in self.protected.finditer(original)}
                masked, markers[identity] = self.mask(sources[identity], locale, preserved[identity])
                plans[identity] = [(text, translate and any(char.isalpha() for char in re.sub(r"ZXQ\d+XZ", "", text))) for text, translate in pieces(masked, re.compile(r"(?!)"))]
        result.update(self.restore_blocks(locale, plans, markers, sources, preserved))
        issues = []
        for record in records:
            try:
                validate_translation(record["text"], result[record["id"]], self.protected)
            except ValueError as error:
                issues.append({"id": record["id"], "source": record["text"], "translation": result[record["id"]], "reason": str(error)})
        filename = self.root / "output" / f"i18n-{locale}-issues.json"
        write_json(filename, issues)
        if issues:
            raise ValueError(f"{len(issues)} translation issues require review: {filename}; {issues[0]['reason']}")
        return result


def document_for(locale, records, translations, digest):
    selected = {record["id"]: translations[record["id"]] for record in records}
    return {
        "version": 1, "locale": locale, "sourceDigest": source_digest(records), "engineDigest": digest,
        "translationDigest": sha(encoded(sorted(selected.items()))), "translations": selected,
    }


def generate(root, records, config, digest, pilot=False):
    diagrams = svg_sources(root / "data/es")
    all_records = {record["id"]: record for record in records}
    for diagram in diagrams:
        for unit in diagram["units"]:
            all_records[unit["segment"]["id"]] = unit["segment"]
    if pilot:
        sample = [item for item in records if 100 < len(item["text"]) < 300][:8]
        sample += [next(item for item in records if item["text"].startswith("¿") and len(item["text"]) > 100)]
        sample += [next(item for item in records if "\nTérmino\n" in item["text"])]
        sample += [{"id": sha(b"text\0Usa OCI con {count} recursos y consulta https://example.com/docs."), "text": "Usa OCI con {count} recursos y consulta https://example.com/docs.", "context": "text"}]
        sample += [unit["segment"] for item in diagrams[:2] for unit in item["units"][:2]]
        all_records = {record["id"]: record for record in sample}
    translator, translations = Translator(root, config, digest), {}
    selected = list(all_records.values())
    def generate_locale(locale):
        translations[locale] = translator.blocks(locale, selected, None if locale == "en" else translations["en"])
        if pilot:
            return
        document = document_for(locale, records, translations[locale], digest)
        document["svg"] = {}
        for diagram in diagrams:
            target = root / "data" / locale / diagram["path"]
            rendered = render_svg(diagram["source"], diagram["units"], translations[locale])
            validate_svg(rendered, diagram["path"])
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(rendered, encoding="utf-8", newline="")
            document["svg"][diagram["path"]] = {"sourceHash": diagram["sourceHash"], "outputHash": file_hash(target)}
        write_json(root / "data" / locale / "translations.json", document)
    generate_locale("en")
    # Portuguese and Italian share the completed English intermediate, not mutable models/caches.
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(generate_locale, ("pt", "it")))
    if pilot:
        report = [{"source": item["text"], **{locale: translations[locale][item["id"]] for locale in LOCALES}} for item in selected]
        write_json(root / "output/i18n-pilot.json", report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"Translated {len(selected)} blocks; {len(diagrams)} SVG sources; no Markdown copies", flush=True)


def check(root, records, config, digest):
    protected = protected_pattern(config["protectedTerms"])
    diagrams = svg_sources(root / "data/es")
    for locale in LOCALES:
        directory = root / "data" / locale
        document = read_json(directory / "translations.json")
        if document.get("version") != 1 or document.get("locale") != locale or document.get("sourceDigest") != source_digest(records) or document.get("engineDigest") != digest:
            raise ValueError(f"Stale {locale} translations; regenerate")
        translated = document.get("translations", {})
        if set(translated) != {item["id"] for item in records} or document.get("translationDigest") != sha(encoded(sorted(translated.items()))):
            raise ValueError(f"Incomplete/corrupt {locale} translations")
        for record in records:
            validate_translation(record["text"], translated[record["id"]], protected)
        if any(directory.rglob("*.md")):
            raise ValueError(f"Translated Markdown copies are forbidden: {directory}")
        if set(document.get("svg", {})) != {item["path"] for item in diagrams}:
            raise ValueError(f"Incomplete {locale} SVG coverage")
        for diagram in diagrams:
            expected = document["svg"][diagram["path"]]
            target = directory / diagram["path"]
            if expected["sourceHash"] != diagram["sourceHash"] or not target.exists() or expected["outputHash"] != file_hash(target):
                raise ValueError(f"Stale/corrupt {locale} SVG: {diagram['path']}")
            validate_svg(target.read_text(encoding="utf-8"), diagram["path"])
    print(f"i18n check passed: {len(records)} source segments, {len(diagrams)} SVGs, {len(LOCALES)} translations")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["generate", "check", "models", "pilot"])
    parser.add_argument("--manifest", default=".cache/i18n/manifest.json")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    config = read_json(root / "data/i18n.json", 1024 * 1024)
    validate_config(config)
    digest = sha((root / "data/i18n.json").read_bytes() + (root / "requirements-i18n.txt").read_bytes())
    if args.command == "models":
        for spec in config["models"]:
            print(model_files(root / ".cache/i18n/models", spec))
        return
    records = manifest_records(read_json(root / args.manifest))
    start = time.monotonic()
    if args.command == "check":
        check(root, records, config, digest)
    else:
        generate(root, records, config, digest, args.command == "pilot")
    print(f"Elapsed: {time.monotonic() - start:.1f}s", flush=True)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError) as error:
        print(f"i18n: {error}", file=sys.stderr)
        sys.exit(1)

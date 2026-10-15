"""Translate SVG labels as phrases while retaining authored markup and geometry."""
import hashlib
import html
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ELEMENT = re.compile(r"<(text|title|desc)\b[^>]*>([\s\S]*?)</\1\s*>")
TEXT = re.compile(r"[^<]+(?=<|$)")
ATTRIBUTE = re.compile(r'\b(aria-label|aria-description|title)=("[^"]*"|\'[^\']*\')')


def segment(text: str) -> dict:
    return {"id": hashlib.sha256(("svg\0" + text).encode()).hexdigest(), "text": text, "context": "svg"}


def validate_svg(source: str, name: str):
    if re.search(r"<!DOCTYPE|<!ENTITY", source, re.I):
        raise ValueError(f"SVG external declarations are forbidden: {name}")
    tree = ET.fromstring(source)
    for node in tree.iter():
        if node.tag.rsplit("}", 1)[-1] in {"script", "foreignObject"}:
            raise ValueError(f"Executable SVG element: {name}")
        if node.tag.rsplit("}", 1)[-1] == "image":
            raise ValueError(f"Embedded images are forbidden; use vector paths/text: {name}")
        for key, value in node.attrib.items():
            if key.rsplit("}", 1)[-1] == "href" and not value.startswith("#"):
                raise ValueError(f"External SVG resource is forbidden: {name}")
    return tree


def svg_units(source: str):
    units = []
    for match in ELEMENT.finditer(source):
        body = match.group(2)
        # Text-node positions come from tokenizing the complete element body, not XML rewriting.
        slots = [(item.start(), item.end(), html.unescape(item.group())) for item in re.finditer(r"<[^>]*>|[^<]+", body) if not item.group().startswith("<") and item.group().strip()]
        text = " ".join(value.strip() for _, _, value in slots)
        if text and any(char.isalpha() for char in text):
            units.append({"start": match.start(2), "end": match.end(2), "body": body, "slots": slots, "segment": segment(text)})
    for match in ATTRIBUTE.finditer(source):
        text = html.unescape(match.group(2)[1:-1])
        if text and any(char.isalpha() for char in text):
            units.append({"start": match.start(2) + 1, "end": match.end(2) - 1, "segment": segment(text), "attribute": True})
    return units


def repartition(words: list[str], weights: list[int]) -> list[str]:
    """Keep authored line count and minimize the longest estimated line; never shrink text."""
    if len(weights) == 1:
        return [" ".join(words)]
    if len(words) > 256:
        raise ValueError("SVG label exceeds 256 words; split its source text")
    width = lambda text: sum(1.5 if c in "MWmw@%" else .5 if c in "ilIjtfr.,:;!|'" else .6 if c == " " else 1 for c in text)
    prefix = [0]
    for word in words:
        prefix.append(prefix[-1] + width(word) + .6)
    lines = min(len(weights), len(words))
    # ponytail: O(lines * words²), bounded to 256 words; DOM measurements remain the final gate.
    costs = [{0: (0, None)}]
    for line in range(1, lines + 1):
        row = {}
        for end in range(line, len(words) + 1):
            choices = [(max(costs[-1][start][0], prefix[end] - prefix[start] - .6), start) for start in range(line - 1, end) if start in costs[-1]]
            row[end] = min(choices)
        costs.append(row)
    output, end = [""] * len(weights), len(words)
    for line in range(lines, 0, -1):
        start = costs[line][end][1]
        output[line - 1] = " ".join(words[start:end])
        end = start
    return output


def render_svg(source: str, units: list[dict], translations: dict[str, str]) -> str:
    for unit in sorted(units, key=lambda item: item["start"], reverse=True):
        value = translations[unit["segment"]["id"]]
        if unit.get("attribute"):
            replacement = html.escape(value, quote=True)
        else:
            chunks = repartition(value.split(), [len(text.strip()) for _, _, text in unit["slots"]])
            replacement = unit["body"]
            for index in reversed(range(len(chunks))):
                start, end, original = unit["slots"][index]
                before = original[:len(original) - len(original.lstrip())]
                after = original[len(original.rstrip()):]
                translated = before + chunks[index] + (after or (" " if index < len(chunks) - 1 else ""))
                replacement = replacement[:start] + html.escape(translated, quote=False) + replacement[end:]
        source = source[:unit["start"]] + replacement + source[unit["end"]:]
    return source


def svg_sources(source_root: Path):
    result = []
    for filename in sorted(source_root.rglob("*.svg")):
        if filename.is_symlink():
            raise ValueError(f"Symlink is not a translation source: {filename}")
        relative = filename.relative_to(source_root).as_posix()
        if "diagram-sources" in filename.parts:
            continue
        if filename.stat().st_size > 5 * 1024 * 1024:
            raise ValueError(f"SVG exceeds 5 MiB: {filename}")
        source = filename.read_text(encoding="utf-8")
        validate_svg(source, relative)
        result.append({"path": relative, "source": source, "sourceHash": hashlib.sha256(filename.read_bytes()).hexdigest(), "units": svg_units(source)})
    return result

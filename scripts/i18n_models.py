"""Pinned Argos packages on their native CTranslate2/SentencePiece backend."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
from contextlib import contextmanager
import uuid
import urllib.parse
import urllib.request
import zipfile


def file_hash(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


@contextmanager
def staging_directory(cache):
    # Python TemporaryDirectory installs a user-only Windows ACL that excludes sandbox tokens.
    directory = cache / f"extract-{uuid.uuid4().hex}"
    directory.mkdir()
    try:
        yield directory
    finally:
        if not any(directory.iterdir()):
            directory.rmdir()


def model_files(cache: Path, spec: dict) -> Path:
    """Only fixed, digest-verified packages; no pickle/code or auto model update."""
    cache.mkdir(parents=True, exist_ok=True)
    archive = cache / f"{spec['id']}.argosmodel"
    if not archive.exists():
        url = urllib.parse.urlparse(spec["url"])
        if url.scheme != "https" or url.hostname != "data.argosopentech.com":
            raise ValueError("Model download must use the pinned official HTTPS mirror")
        temporary = archive.with_suffix(".download")
        try:
            with urllib.request.urlopen(spec["url"], timeout=90) as response, temporary.open("wb") as out:
                if urllib.parse.urlparse(response.geturl()).hostname != url.hostname:
                    raise ValueError("Unexpected model download redirect")
                size = 0
                while chunk := response.read(1024 * 1024):
                    size += len(chunk)
                    if size > 512 * 1024 * 1024:
                        raise ValueError("Model package exceeds 512 MiB")
                    out.write(chunk)
            if file_hash(temporary) != spec["sha256"]:
                raise ValueError(f"Model SHA256 mismatch: {spec['id']}")
            temporary.replace(archive)
        finally:
            temporary.unlink(missing_ok=True)
    if file_hash(archive) != spec["sha256"]:
        raise ValueError(f"Cached model SHA256 mismatch: {archive}; remove it and retry")
    destination = cache / ("package-" + spec["sha256"])
    marker = destination / "verified.json"
    if marker.exists():
        if marker.stat().st_size > 1024 * 1024:
            raise ValueError("Oversize extracted model manifest")
        files = json.loads(marker.read_text(encoding="utf-8"))
        if not isinstance(files, dict) or not files or len(files) > 1000:
            raise ValueError("Invalid extracted model manifest")
        for name, digest in files.items():
            if not (destination / name).resolve().is_relative_to(destination.resolve()) or not re.fullmatch(r"[a-f0-9]{64}", digest):
                raise ValueError("Unsafe extracted model manifest")
        if all(file_hash(destination / name) == digest for name, digest in files.items()):
            return destination
        raise ValueError(f"Extracted model has changed: {destination}")
    with staging_directory(cache) as temporary:
        stage = Path(temporary) / "model"
        stage.mkdir()
        hashes = {}
        with zipfile.ZipFile(archive) as package:
            if len(package.infolist()) > 1000 or sum(item.file_size for item in package.infolist()) > 2**31:
                raise ValueError("Model archive exceeds extraction limits")
            for item in package.infolist():
                relative = Path(*item.filename.split("/")[1:])
                if ".." in relative.parts or relative.is_absolute():
                    raise ValueError("Unsafe path in model archive")
                if item.is_dir() or not relative.parts:
                    continue
                if relative.parts[0] not in {"model", "sentencepiece.model", "bpe.model", "metadata.json", "README.md", "LICENSE"}:
                    continue
                target = stage / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(package.read(item))
                hashes[relative.as_posix()] = file_hash(target)
        metadata = json.loads((stage / "metadata.json").read_text(encoding="utf-8"))
        if (metadata["from_code"], metadata["to_code"], metadata["package_version"]) != (spec["from"], spec["to"], spec["version"]):
            raise ValueError("Model metadata differs from the pinned configuration")
        (stage / "verified.json").write_text(json.dumps(hashes), encoding="utf-8")
        stage.replace(destination)
    return destination


def protected_pattern(terms: list[str]) -> re.Pattern:
    names = "|".join(re.escape(term) for term in sorted(terms, key=len, reverse=True))
    return re.compile(
        r"https?://[^\s<>]+|`[^`]+`|\$?\{\{?[^{}]+\}\}?|\[\[[^\]]+\]\]|%[sd]|\b[A-Z0-9]+(?:[-_][A-Z0-9]+)+\b"
        r"|\b[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*\([^()\n]{0,120}\)"
        r"|\b[A-Za-z_]\w*(?:\[[^\]\n]{1,80}\])+(?:\.[A-Za-z_]\w*)*"
        r"|\b[A-Za-z_]\w*(?:(?:\[\d+\])?\.[A-Za-z_]\w*)+|\b[a-zA-Z]+_[a-zA-Z_]+\b"
        r"|\b[A-Za-z][\w]*-\d+\b|(?<!\w)\d+(?:[.,:/–—-]\d+)*(?:[ \t]?%)?(?!\w)"
        r"|\b[A-Za-z][A-Za-z_]*[0-9₀-₉][A-Za-z0-9_₀-₉]*\b"
        + (rf"|(?<!\w)(?:{names})(?!\w)" if names else "")
    )


def pieces(text: str, protected: re.Pattern) -> list[tuple[str, bool]]:
    """Keep placeholders and names outside the model, including exact whitespace."""
    result = []
    start = 0
    for match in protected.finditer(text):
        result.extend(natural_pieces(text[start:match.start()]))
        result.append((match.group(), False))
        start = match.end()
    result.extend(natural_pieces(text[start:]))
    return result


def natural_pieces(text: str) -> list[tuple[str, bool]]:
    result = []
    # ponytail: deterministic punctuation splitting avoids downloading an NLP model.
    # Long prose is split at word boundaries; replace with a pinned sentence model if needed.
    for sentence in re.split(r"(?<=[.!?;])(?=\s)|(?=\n)|(?<=\n)", text):
        match = re.fullmatch(r"(\s*)(.*?)(\s*)", sentence, flags=re.S)
        before, body, after = match.groups()
        result.append((before, False))
        words = re.findall(r"\S+\s*", body)
        for offset in range(0, len(words), 100):
            chunk = "".join(words[offset:offset + 100])
            tail = chunk[len(chunk.rstrip()):]
            content = chunk.rstrip()
            result.append((content, any(char.isalpha() for char in content)))
            result.append((tail, False))
        result.append((after, False))
    return [(value, translate) for value, translate in result if value]


class ArgosModel:
    def __init__(self, cache: Path, spec: dict):
        import ctranslate2
        import sentencepiece

        directory = model_files(cache, spec)
        if (directory / "sentencepiece.model").exists():
            processor = sentencepiece.SentencePieceProcessor(model_file=str(directory / "sentencepiece.model"))
            self.encode = lambda text: processor.encode(text, out_type=str)
            self.decode = lambda tokens: processor.decode(tokens).replace("▁", " ").strip()
        else:
            from sacremoses import MosesTokenizer, MosesDetokenizer, MosesPunctNormalizer
            from subword_nmt.apply_bpe import BPE

            with (directory / "bpe.model").open(encoding="utf-8") as stream:
                bpe = BPE(stream)
            tokenizer, detokenizer = MosesTokenizer(spec["from"]), MosesDetokenizer(spec["to"])
            normalizer = MosesPunctNormalizer(spec["from"])
            self.encode = lambda text: bpe.process_line(" ".join(tokenizer.tokenize(normalizer.normalize(text)))).split()
            self.decode = lambda tokens: detokenizer.detokenize(" ".join(tokens).replace("@@ ", "").split())
        self.translator = ctranslate2.Translator(
            str(directory / "model"), device="cpu", compute_type="int8",
            inter_threads=1, intra_threads=min(4, os.cpu_count() or 1),
        )

    def translate(self, texts: list[str]) -> list[str]:
        tokens = [self.encode(text) for text in texts]
        if any(len(item) > 512 for item in tokens):
            raise ValueError("Translation segment exceeds 512 tokens; split the source block")
        results = self.translator.translate_batch(
            tokens, beam_size=4, length_penalty=1, max_batch_size=32, batch_type="examples",
            max_input_length=0, max_decoding_length=768, replace_unknowns=True,
        )
        for index, item in enumerate(results):
            if len(item.hypotheses[0]) >= 768:
                results[index] = self.translator.translate_batch(
                    [tokens[index]], beam_size=2, length_penalty=1, max_input_length=0, max_decoding_length=768,
                    repetition_penalty=1.1, no_repeat_ngram_size=4, replace_unknowns=True,
                )[0]
                if len(results[index].hypotheses[0]) >= 768:
                    raise ValueError(f"Translation reached decoding limit: {texts[index][:200]}")
        return [self.decode(item.hypotheses[0]).strip() for item in results]

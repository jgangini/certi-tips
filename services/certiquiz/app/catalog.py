"""Bounded published-catalog refreshes with the packaged catalog as startup fallback."""

import hashlib
import json
from http.client import HTTPException
import logging
import os
from pathlib import Path
import re
from threading import Lock
from time import monotonic
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

SOURCE = "https://jgangini.github.io/certitips/assets/certiquiz/"
LOCALES = ("en", "pt", "it")
CATALOG_BYTES = 256 * 1024
BANK_BYTES = 2 * 1024 * 1024
REFRESH_BYTES = 8 * 1024 * 1024
REFRESH_SECONDS = 300
NAME = re.compile(r"[a-z0-9][a-z0-9-]{0,99}\Z")
BANK = re.compile(r"(?:[A-Za-z0-9][A-Za-z0-9-]{0,63}/)?[a-z0-9][a-z0-9-]{0,99}\Z")
QUESTION_ID = re.compile(r"[A-Za-z0-9_-]+\Z")
logger = logging.getLogger(__name__)


def text(value, maximum, empty=False):
    if not isinstance(value, str) or len(value) > maximum or (not empty and not value.strip()):
        raise ValueError("El catálogo contiene texto no válido.")
    return value


def validate_questions(questions):
    if not isinstance(questions, list) or not 1 <= len(questions) <= 1000:
        raise ValueError("El banco debe contener entre 1 y 1000 preguntas.")
    validated, ids = [], set()
    for question in questions:
        if not isinstance(question, dict):
            raise ValueError("La pregunta debe ser un objeto.")
        identity = text(question.get("id"), 100)
        options = question.get("options")
        if not QUESTION_ID.fullmatch(identity) or identity in ids or not isinstance(options, list) or not 2 <= len(options) <= 6:
            raise ValueError("El banco contiene una pregunta no válida.")
        normalized, option_ids = [], set()
        for option in options:
            if not isinstance(option, dict):
                raise ValueError("La alternativa debe ser un objeto.")
            option_id = text(option.get("id"), 40)
            if not QUESTION_ID.fullmatch(option_id) or option_id in option_ids:
                raise ValueError("La alternativa debe tener un identificador único.")
            normalized.append({"id": option_id, "text": text(option.get("text"), 4000),
                               "explanation": text(option.get("explanation", ""), 4000, empty=True)})
            option_ids.add(option_id)
        correct = text(question.get("correctOption"), 40)
        if correct not in option_ids:
            raise ValueError("La respuesta correcta no pertenece a las alternativas.")
        translated = question.get("translations", {})
        if not isinstance(translated, dict) or (translated and set(translated) != set(LOCALES)):
            raise ValueError("El banco debe incluir los tres idiomas traducidos.")
        translations = {}
        for locale, value in translated.items():
            if (not isinstance(value, dict) or set(value) != {"question", "options"}
                    or not isinstance(value["options"], dict) or set(value["options"]) != option_ids):
                raise ValueError("La traducción no conserva las alternativas originales.")
            localized_options = {}
            for option_id, option in value["options"].items():
                if not isinstance(option, dict) or set(option) != {"text", "explanation"}:
                    raise ValueError("Alternativa traducida no válida.")
                localized_options[option_id] = {"text": text(option["text"], 4000),
                                                "explanation": text(option["explanation"], 4000, empty=True)}
            translations[locale] = {"question": text(value["question"], 4000), "options": localized_options}
        validated.append({"id": identity, "question": text(question.get("question"), 4000),
                          "options": normalized, "correctOption": correct, "translations": translations})
        ids.add(identity)
    return validated


def parse_catalog(document, read_bank, *, published=False):
    items = document.get("courses") if isinstance(document, dict) else None
    if not isinstance(items, list) or not 1 <= len(items) <= 32:
        raise ValueError("El catálogo debe contener entre 1 y 32 cursos.")
    courses, banks = {}, {}
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("El curso debe ser un objeto.")
        identity = text(item.get("id"), 100)
        bank = item.get("questionBank")
        # The original published Agentic course predates the questionBank field.
        if bank is None and identity == "agentic-ai-foundations-2026":
            bank = "questions"
        if bank is None:
            continue
        bank = text(bank, 100)
        if not NAME.fullmatch(identity) or identity in courses or not BANK.fullmatch(bank):
            raise ValueError("El catálogo contiene un identificador o banco no válido.")
        expected = item.get("sha256")
        if (published or expected is not None) and (not isinstance(expected, str) or not re.fullmatch(r"[a-f0-9]{64}", expected)):
            raise ValueError("El banco publicado necesita un hash SHA-256.")
        if bank not in banks:
            try:
                raw = read_bank(f"{bank}.json")
                if expected is not None and (not isinstance(raw, bytes) or hashlib.sha256(raw).hexdigest() != expected):
                    raise ValueError("El hash del banco no coincide con el catálogo.")
                questions = validate_questions(json.loads(raw) if isinstance(raw, bytes) else raw)
                if published and any(set(question["translations"]) != set(LOCALES) for question in questions):
                    raise ValueError("El banco publicado tiene traducciones incompletas.")
                banks[bank] = (expected, questions)
            except (OSError, ValueError, RecursionError) as error:
                raise ValueError(f"{bank}.json (curso {identity}): {error}") from error
        if expected != banks[bank][0]:
            raise ValueError("El mismo banco tiene hashes incompatibles.")
        titles = item.get("titleTranslations", {})
        if not isinstance(titles, dict) or set(titles) - set(LOCALES):
            raise ValueError("Idiomas del título no válidos.")
        courses[identity] = {"id": identity, "title": text(item.get("title"), 240), "questions": banks[bank][1],
                             "titleTranslations": {locale: text(title, 240) for locale, title in titles.items()}}
    if not courses:
        raise ValueError("No hay cursos con preguntas disponibles.")
    return courses


def load_catalog(data_dir: Path, *, published=False):
    budget = REFRESH_BYTES

    def read_file(name):
        nonlocal budget
        limit = min(CATALOG_BYTES if name == "catalog.json" else BANK_BYTES, budget)
        try:
            with (data_dir / name).open("rb") as source:
                raw = source.read(limit + 1)
            if len(raw) > limit:
                raise ValueError("Excede el límite del archivo o del catálogo completo.")
            budget -= len(raw)
            return raw
        except (OSError, ValueError, RecursionError) as error:
            raise ValueError(f"{name}: {error}") from error
    return parse_catalog(json.loads(read_file("catalog.json")), read_file, published=published)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, _request, _file, _code, _message, _headers, _new_url):
        raise ValueError("La fuente del catálogo no puede redirigir a otra URL.")


def download(filename, limit, deadline):
    if not filename.endswith(".json") or not BANK.fullmatch(filename[:-5]):
        raise ValueError("Archivo remoto no permitido.")
    remaining = deadline - monotonic()
    if remaining <= 0:
        raise TimeoutError("Se agotó el plazo del catálogo.")
    url = SOURCE + filename
    request = Request(url, headers={"Accept": "application/json", "Accept-Encoding": "identity", "User-Agent": "CertiQuiz/1"})
    with build_opener(ProxyHandler({}), NoRedirect()).open(request, timeout=min(3, remaining)) as response:
        if response.geturl() != url or int(response.headers.get("Content-Length", "0")) > limit:
            raise ValueError("Respuesta remota fuera de los límites.")
        raw = bytearray()
        while True:
            if monotonic() >= deadline:
                raise TimeoutError("Se agotó el plazo del catálogo.")
            chunk = response.read1(min(65536, limit - len(raw) + 1))
            if not chunk:
                return bytes(raw)
            raw.extend(chunk)
            if len(raw) > limit:
                raise ValueError("El archivo remoto excede el límite.")


class Catalog:
    def __init__(self, data_dir: Path, source=None):
        self.source = source or os.environ.get("CERTIQUIZ_CATALOG_SOURCE", "published")
        # Existing private deployment settings retain this value until the next rollout.
        if self.source == "github":
            self.source = "published"
        if self.source not in ("published", "bundled"):
            raise ValueError("CERTIQUIZ_CATALOG_SOURCE debe ser published o bundled.")
        self._courses = load_catalog(data_dir)
        self._next_refresh = 0
        self._lock = Lock()

    def get(self):
        if self.source == "bundled" or monotonic() < self._next_refresh or not self._lock.acquire(blocking=False):
            return self._courses
        try:
            if monotonic() >= self._next_refresh:
                self._next_refresh = monotonic() + REFRESH_SECONDS
                deadline, budget = monotonic() + 15, REFRESH_BYTES

                def fetch(name):
                    nonlocal budget
                    limit = min(CATALOG_BYTES if name == "catalog.json" else BANK_BYTES, budget)
                    raw = download(name, limit, deadline)
                    budget -= len(raw)
                    return raw

                try:
                    # ponytail: one process refreshes on demand; multiple API workers need a shared cache.
                    updated = parse_catalog(json.loads(fetch("catalog.json")), fetch, published=True)
                except (OSError, HTTPException, ValueError, RecursionError) as error:
                    logger.warning("CertiQuiz conserva el catálogo válido anterior (%s).", type(error).__name__)
                else:
                    self._courses = updated
            return self._courses
        finally:
            self._lock.release()

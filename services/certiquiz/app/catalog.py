"""Bounded public GitHub refreshes with the packaged catalog as startup fallback."""

import json
from http.client import HTTPException
import logging
import os
from pathlib import Path
import re
from threading import Lock
from time import monotonic
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

SOURCE = "https://raw.githubusercontent.com/jgangini/certi-tips/main/data/"
CATALOG_BYTES = 256 * 1024
BANK_BYTES = 2 * 1024 * 1024
REFRESH_BYTES = 8 * 1024 * 1024
REFRESH_SECONDS = 300
NAME = re.compile(r"[a-z0-9][a-z0-9-]{0,99}\Z")
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
        validated.append({"id": identity, "question": text(question.get("question"), 4000),
                          "options": normalized, "correctOption": correct})
        ids.add(identity)
    return validated


def parse_catalog(document, read_bank):
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
        if not NAME.fullmatch(identity) or identity in courses or not NAME.fullmatch(bank):
            raise ValueError("El catálogo contiene un identificador o banco no válido.")
        if bank not in banks:
            banks[bank] = validate_questions(read_bank(f"{bank}.json"))
        courses[identity] = {"id": identity, "title": text(item.get("title"), 240), "questions": banks[bank]}
    if not courses:
        raise ValueError("No hay cursos con preguntas disponibles.")
    return courses


def load_catalog(data_dir: Path):
    def read_file(name):
        with (data_dir / name).open("rb") as source:
            raw = source.read(BANK_BYTES + 1)
        if len(raw) > BANK_BYTES:
            raise ValueError("El archivo de preguntas excede el límite.")
        return json.loads(raw)
    return parse_catalog(read_file("catalog.json"), read_file)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, _request, _file, _code, _message, _headers, _new_url):
        raise ValueError("La fuente del catálogo no puede redirigir a otra URL.")


def download(filename, limit, deadline):
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,99}\.json", filename):
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
        self.source = source or os.environ.get("CERTIQUIZ_CATALOG_SOURCE", "github")
        if self.source not in ("github", "bundled"):
            raise ValueError("CERTIQUIZ_CATALOG_SOURCE debe ser github o bundled.")
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
                    return json.loads(raw)

                try:
                    # ponytail: one process refreshes on demand; multiple API workers need a shared cache.
                    updated = parse_catalog(fetch("catalog.json"), fetch)
                except (OSError, HTTPException, ValueError, RecursionError) as error:
                    logger.warning("CertiQuiz conserva el catálogo válido anterior (%s).", type(error).__name__)
                else:
                    self._courses = updated
            return self._courses
        finally:
            self._lock.release()

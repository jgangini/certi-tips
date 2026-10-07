import copy
from concurrent.futures import ThreadPoolExecutor
import io
import json
from threading import Event

import pytest

from app import catalog, game

QUESTIONS = [{"id": "q1", "question": "Pregunta original", "correctOption": "a", "options": [
    {"id": "a", "text": "Correcta", "explanation": "Explicación"}, {"id": "b", "text": "Incorrecta"}]}]
DOCUMENT = {"courses": [{"id": "practice", "title": "Práctica", "questionBank": "questions"}]}


def packaged(tmp_path):
    (tmp_path / "catalog.json").write_text(json.dumps(DOCUMENT), encoding="utf-8")
    (tmp_path / "questions.json").write_text(json.dumps(QUESTIONS), encoding="utf-8")
    return tmp_path


def remote(monkeypatch, documents):
    calls = []

    def download(name, limit, _deadline):
        calls.append(name)
        value = documents[name]
        if isinstance(value, Exception):
            raise value
        result = json.dumps(value).encode()
        assert len(result) <= limit
        return result

    monkeypatch.setattr(catalog, "download", download)
    return calls


def test_refresh_is_cached_authoritative_and_preserves_existing_room(tmp_path, monkeypatch):
    now = [100]
    monkeypatch.setattr(catalog, "monotonic", lambda: now[0])
    documents = {"catalog.json": copy.deepcopy(DOCUMENT), "questions.json": copy.deepcopy(QUESTIONS)}
    calls = remote(monkeypatch, documents)
    cache = catalog.Catalog(packaged(tmp_path), "github")
    room = game.new_room(cache.get()["practice"], 1, 10)
    for _ in range(100):
        assert cache.get()["practice"]["title"] == "Práctica"
    assert calls == ["catalog.json", "questions.json"]
    documents["catalog.json"]["courses"][0]["id"] = "new-course"
    documents["questions.json"][0]["question"] = "Pregunta actualizada"
    now[0] += 301
    courses = cache.get()
    assert list(courses) == ["new-course"]
    assert courses["new-course"]["questions"][0]["question"] == "Pregunta actualizada"
    assert room["questions"][0]["question"] == "Pregunta original"


def test_outage_and_invalid_refresh_keep_last_valid_catalog(tmp_path, monkeypatch):
    now = [100]
    monkeypatch.setattr(catalog, "monotonic", lambda: now[0])
    documents = {"catalog.json": OSError("offline"), "questions.json": copy.deepcopy(QUESTIONS)}
    calls = remote(monkeypatch, documents)
    cache = catalog.Catalog(packaged(tmp_path), "github")
    assert cache.get()["practice"]["questions"][0]["question"] == "Pregunta original"
    assert cache.get() and calls == ["catalog.json"]
    documents["catalog.json"] = copy.deepcopy(DOCUMENT)
    documents["questions.json"][0]["question"] = "Versión de GitHub"
    now[0] += 301
    assert cache.get()["practice"]["questions"][0]["question"] == "Versión de GitHub"
    documents["questions.json"][0]["correctOption"] = "unknown"
    now[0] += 301
    assert cache.get()["practice"]["questions"][0]["question"] == "Versión de GitHub"


def test_single_refresh_serves_cached_value_to_concurrent_clients(tmp_path, monkeypatch):
    started, release = Event(), Event()
    calls = []

    def download(name, _limit, _deadline):
        calls.append(name)
        if name == "catalog.json":
            started.set()
            assert release.wait(3)
        return json.dumps(DOCUMENT if name == "catalog.json" else QUESTIONS).encode()

    monkeypatch.setattr(catalog, "download", download)
    cache = catalog.Catalog(packaged(tmp_path), "github")
    with ThreadPoolExecutor(max_workers=2) as pool:
        updating = pool.submit(cache.get)
        assert started.wait(3)
        assert all(cache.get()["practice"] for _ in range(100))
        release.set()
        assert updating.result()["practice"]
    assert calls == ["catalog.json", "questions.json"]


@pytest.mark.parametrize("bank", ["../../.env", "https://evil.test/data", "questions?token=x", "//127.0.0.1", "questions.json"])
def test_untrusted_bank_cannot_select_another_path_or_url(bank):
    document = copy.deepcopy(DOCUMENT)
    document["courses"][0]["questionBank"] = bank
    with pytest.raises(ValueError):
        catalog.parse_catalog(document, lambda _name: pytest.fail("Unsafe bank was fetched"))


def test_legacy_bank_is_supported_only_for_the_original_course():
    document = {"courses": [{"id": "agentic-ai-foundations-2026", "title": "Agentic"}]}
    seen = []
    courses = catalog.parse_catalog(document, lambda name: seen.append(name) or QUESTIONS)
    assert list(courses) == ["agentic-ai-foundations-2026"] and seen == ["questions.json"]
    document["courses"][0]["id"] = "another-course"
    with pytest.raises(ValueError):
        catalog.parse_catalog(document, lambda _name: pytest.fail("Unconfigured bank was fetched"))


def test_bundled_mode_never_fetches_and_rejects_unknown_sources(tmp_path, monkeypatch):
    monkeypatch.setattr(catalog, "download", lambda *_args: pytest.fail("Network is disabled"))
    monkeypatch.setenv("CERTIQUIZ_CATALOG_SOURCE", "bundled")
    assert catalog.Catalog(packaged(tmp_path)).get()["practice"]
    with pytest.raises(ValueError):
        catalog.Catalog(tmp_path, "https://evil.test")


def test_download_rejects_redirect_oversize_and_expired_deadline(monkeypatch):
    with pytest.raises(ValueError):
        catalog.NoRedirect().redirect_request(None, None, 302, "", {}, "https://evil.test")
    with pytest.raises(ValueError):
        catalog.download("../questions.json", 100, catalog.monotonic() + 10)
    with pytest.raises(TimeoutError):
        catalog.download("questions.json", 100, catalog.monotonic() - 1)

    class Response(io.BytesIO):
        headers = {}

        def geturl(self):
            return catalog.SOURCE + "questions.json"

    class Opener:
        def open(self, request, timeout):
            assert request.full_url == catalog.SOURCE + "questions.json" and 0 < timeout <= 3
            assert not request.has_header("Authorization")
            return Response(b"0123456789")

    monkeypatch.setattr(catalog, "build_opener", lambda *_args: Opener())
    with pytest.raises(ValueError):
        catalog.download("questions.json", 5, catalog.monotonic() + 10)


def test_question_limits_and_types_are_validated():
    with pytest.raises(ValueError):
        catalog.validate_questions(QUESTIONS * 1001)
    for bad in ({"correctOption": []}, {"id": "../secret"}, {"options": []}, {"question": "x" * 4001}):
        questions = copy.deepcopy(QUESTIONS)
        questions[0].update(bad)
        with pytest.raises(ValueError):
            catalog.validate_questions(questions)


def test_identifiers_fit_the_answer_api_limits():
    questions = copy.deepcopy(QUESTIONS)
    questions[0]["id"] = "q" * 100
    questions[0]["options"][0]["id"] = questions[0]["correctOption"] = "a" * 40
    assert catalog.validate_questions(questions)
    questions[0]["id"] += "q"
    with pytest.raises(ValueError):
        catalog.validate_questions(questions)
    questions[0]["id"] = "q"
    questions[0]["options"][0]["id"] = questions[0]["correctOption"] = "a" * 41
    with pytest.raises(ValueError):
        catalog.validate_questions(questions)

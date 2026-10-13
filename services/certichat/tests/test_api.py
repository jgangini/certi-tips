"""Real PostgreSQL integration; Turnstile, knowledge and OpenRouter use a deterministic HTTP transport."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
from datetime import datetime, timezone
import json
import os
import time
from uuid import uuid4

from fastapi.testclient import TestClient
import httpx
import psycopg
import pytest

from app.main import create_app
from app.security import COOKIE, LOCAL_COOKIE, ChatError, network_digest, new_token, token_digest
from app.settings import Settings
from app.store import Store

ORIGIN = "https://certichat.test"
FRONTEND = "https://jgangini.github.io"
HEADERS = {"Origin": FRONTEND, "X-CertiChat": "1"}
VERSION = "a"*64
TRACE = {"version": VERSION, "nodes": ["00000000-0000-0000-0000-000000000001"], "edges": [], "truncated": False}
FRAGMENT = {"id": "guide", "title": "Guía", "url": f"{FRONTEND}/certitips/guide.html", "text": "Oracle almacena datos."}


@pytest.fixture
def database_url():
    value = os.environ.get("CERTICHAT_TEST_DATABASE_URL")
    if not value:
        pytest.skip("CERTICHAT_TEST_DATABASE_URL is required for PostgreSQL integration tests")
    config = psycopg.conninfo.conninfo_to_dict(value)
    if config.get("host") != "test-postgres" and "test" not in config.get("dbname", ""):
        pytest.fail("Integration tests require test-postgres or a database whose name contains test.")
    with psycopg.connect(value) as connection:
        for table in ("cc_history", "cc_requests", "cc_sessions", "cc_rate_limits", "cc_spend"):
            connection.execute(f"DELETE FROM {table}")
    return value


@pytest.fixture
def clients(database_url, request):
    settings = Settings(database_url, "a"*32, "b"*32, "c"*32, "d"*32, "e"*32,
                        **getattr(request, "param", {"public_origin": ORIGIN}))
    calls = []
    turnstile = {"success": True, "hostname": "jgangini.github.io", "action": "certichat_session"}
    knowledge = {"version": VERSION, "fragments": [FRAGMENT], "status": "ready", "graphTrace": TRACE}

    def handler(request):
        calls.append(request)
        if request.url.host == "challenges.cloudflare.com":
            return httpx.Response(200, json=turnstile)
        if request.url.host == "knowledge":
            if request.url.path == "/health":
                return httpx.Response(200, json={"status": knowledge["status"], "version": knowledge["version"],
                                               "indexing": knowledge.get("indexing", False), "checkedAt": knowledge.get("checkedAt")})
            assert request.headers["Authorization"] == "Bearer " + "c"*32
            if request.url.path == "/graph":
                return httpx.Response(200, json=knowledge.get("graph"))
            return httpx.Response(200, json=knowledge)
        assert request.url.host == "openrouter.ai"
        payload = json.loads(request.content)
        if request.url.path.endswith("embeddings"):
            return httpx.Response(200, json={"usage": {"cost": .000001}, "data": [{"embedding": [0.0]}]})
        assert payload["max_tokens"] <= 4096
        content = payload["messages"][-1]["content"]
        supported = not content.startswith("{") or json.loads(content).get("fragments") != []
        return httpx.Response(200, json={"usage": {"cost": .0001}, "choices": [{"message": {"content": json.dumps(
            {"kind": "grounded", "answer": "Oracle almacena datos.", "citations": ["S1"] if supported else []})}}]})

    application = create_app(settings, transport=httpx.MockTransport(handler))
    with ExitStack() as stack:
        stack.enter_context(TestClient(application, base_url=settings.public_origin))

        def make(ip="192.0.2.10"):
            client = TestClient(application, base_url=settings.public_origin,
                                headers={**HEADERS, "Origin": settings.allowed_origins[0]}, client=(ip, 50000))
            stack.callback(client.close)
            return client

        yield make, application, calls, turnstile, knowledge


def session(make):
    client = make()
    response = client.post("/api/session", json={"turnstileToken": "proof"})
    assert response.status_code == 200, response.text
    return client


def question():
    return {"requestId": str(uuid4()), "message": "¿Qué almacena Oracle?", "pageUrl": FRAGMENT["url"]}


def test_public_health_reports_indexing_without_a_paid_request_and_rejects_invalid_metadata(clients):
    make, _app, calls, _turnstile, knowledge = clients
    client = make()
    knowledge["indexing"] = True
    knowledge["checkedAt"] = "2026-10-13T11:04:11-05:00"
    assert client.get("/api/health").json() == {"ok": True, "knowledge": {"version": VERSION, "indexing": True,
        "checkedAt": "2026-10-13T16:04:11+00:00"}}
    knowledge.update(indexing="true", version="private/internal/path")
    for invalid in (None, "private/internal/path", "2026-10-32T16:04:11+00:00", "2026-10-13T16:04:11", 123):
        knowledge["checkedAt"] = invalid
        assert client.get("/api/health").json()["knowledge"] == {"version": None, "indexing": False, "checkedAt": None}
    assert all(request.url.host == "knowledge" and request.url.path == "/health" for request in calls)


def test_public_graph_is_safe_cached_and_does_not_call_provider(clients):
    make, _app, calls, _turnstile, knowledge = clients
    knowledge["graph"] = {"version": VERSION, "generatedAt": "2026-10-11T20:04:11+00:00",
                          "nodes": [{"id": TRACE["nodes"][0], "type": "Entity", "label": "DAMA", "text": "private body"}],
                          "edges": [], "private": "secret"}
    client = make()
    first = client.get("/api/graph")
    assert first.status_code == 200
    assert first.json() == {"version": VERSION, "generatedAt": "2026-10-11T20:04:11+00:00",
                            "nodes": [{"id": TRACE["nodes"][0], "type": "Entity", "label": "DAMA"}], "edges": []}
    assert client.get("/api/graph").json() == first.json()
    assert [(request.url.host, request.url.path) for request in calls] == [("knowledge", "/graph")]
    assert client.get("/api/graph", headers={"Origin": "https://evil.test"}).status_code == 403


@pytest.mark.parametrize("graph", [None, {"version": "private/path"},
    {"version": VERSION, "generatedAt": "bad date", "nodes": [], "edges": []},
    {"version": VERSION, "generatedAt": "2026-10-11T20:04:11", "nodes": [], "edges": []},
    {"version": VERSION, "generatedAt": "2026-10-11T20:04:11Z", "nodes": [None], "edges": []}])
def test_public_graph_rejects_invalid_worker_metadata_without_leaking_it(clients, graph):
    make, _app, calls, _turnstile, knowledge = clients
    knowledge["graph"] = graph
    response = make().get("/api/graph")
    assert response.status_code == 503 and "private" not in response.text
    assert len(calls) == 1


def test_session_cookie_csrf_body_and_turnstile_validation(clients):
    make, app, calls, turnstile, _ = clients
    client = make()
    assert client.get("/api/session").json()["authenticated"] is False
    calls.clear()
    assert client.post("/api/session", json={"turnstileToken": "proof"}, headers={"Origin": "https://evil.test"}).status_code == 403
    assert not calls
    for update in ({"success": False}, {"success": True, "hostname": "evil.test"},
                   {"hostname": "jgangini.github.io", "action": "wrong"}):
        turnstile.update(update)
        assert client.post("/api/session", json={"turnstileToken": "proof"}).status_code == 403
    turnstile["action"] = "certichat_session"
    response = client.post("/api/session", json={"turnstileToken": "proof"})
    assert response.status_code == 200
    cookie = response.headers["set-cookie"].lower()
    assert cookie.startswith("__host-certichat=")
    assert all(value in cookie for value in ("secure", "httponly", "samesite=none", "partitioned", "max-age=2592000", "path=/"))
    assert "domain=" not in cookie
    assert response.headers["access-control-allow-origin"] == FRONTEND
    assert response.headers["access-control-allow-credentials"] == "true"
    assert client.post("/api/chat", content="x"*9000, headers={"Content-Type": "application/json"}).status_code == 413
    response = client.post("/api/chat", json={**question(), "private": "do-not-echo"})
    assert response.status_code == 422 and "do-not-echo" not in response.text
    assert client.get("/api/health").headers["cache-control"] == "no-store"


def test_vps_cannot_select_local_mode_from_request(clients):
    make, app, calls, _, _ = clients
    client = make()
    state = client.get("/api/session")
    assert state.json()["mode"] == "VPS" and "set-cookie" not in state.headers
    calls.clear()
    assert client.post("/api/session", json={"mode": "LOCAL"}).status_code == 422
    assert client.post("/api/session", json={}, headers={"CERTICHAT_MODE": "LOCAL"}).status_code == 403
    assert client.post("/api/session", json={}, headers={"Origin": "http://127.0.0.1:4173"}).status_code == 403
    assert not calls and not client.cookies


@pytest.mark.parametrize("clients", [{"mode": "LOCAL", "public_origin": "http://127.0.0.1:18741",
                                      "allowed_origins": ("http://127.0.0.1:4173",)}], indirect=True)
def test_local_session_without_turnstile_preserves_guards_and_quotas(clients):
    make, app, calls, _, _ = clients
    client = make()
    state = client.get("/api/session")
    assert state.json()["mode"] == "LOCAL" and not state.json()["authenticated"]
    assert "set-cookie" not in state.headers
    assert client.post("/api/chat", json=question()).status_code == 401
    assert client.post("/api/session", json={}, headers={"Origin": FRONTEND}).status_code == 403
    assert client.post("/api/session", json={}, headers={"X-CertiChat": ""}).status_code == 403
    response = client.post("/api/session", json={})
    assert response.status_code == 200 and response.json()["verificationRequired"] is False
    cookie = response.headers["set-cookie"].lower()
    assert cookie.startswith(LOCAL_COOKIE + "=") and COOKIE not in client.cookies
    assert "httponly" in cookie and "samesite=lax" in cookie
    assert "secure" not in cookie and "partitioned" not in cookie
    assert client.get("/api/session").json()["authenticated"] is True
    body = question()
    first = client.post("/api/chat", json=body)
    assert first.status_code == 200
    count = len(calls)
    assert client.post("/api/chat", json=body).json() == first.json() and len(calls) == count
    token = client.cookies[LOCAL_COOKIE]
    assert client.post("/api/session", json={}).json()["quota"]["remaining"] == 19
    assert client.cookies[LOCAL_COOKIE] == token
    assert client.post("/api/chat", json=question()).status_code == 200
    assert client.post("/api/chat", json=question(), headers={"X-Forwarded-For": "198.51.100.7"}).status_code == 429
    assert not any(call.url.host == "challenges.cloudflare.com" for call in calls)


def test_answer_sources_idempotency_and_clear_preserve_quota(clients):
    make, app, calls, _, _ = clients
    client = session(make)
    body = question()
    first = client.post("/api/chat", json=body)
    assert first.status_code == 200, first.text
    assert first.json()["answer"] == "Oracle almacena datos."
    assert first.json()["sources"] == [{key: FRAGMENT[key] for key in ("id", "title", "url")}]
    count = len(calls)
    second = client.post("/api/chat", json=body)
    assert second.json() == first.json() and len(calls) == count
    assert client.post("/api/chat", json={**body, "message": "otra"}).json()["code"] == "request_conflict"
    assert client.request("DELETE", "/api/conversation", json={}).json()["quota"]["remaining"] == 19
    assert client.post("/api/chat", json=body).json()["code"] == "request_expired"
    assert len(calls) == count
    token = client.cookies[COOKIE]
    assert client.post("/api/session", json={"turnstileToken": "fresh"}).json()["quota"]["remaining"] == 19
    assert client.cookies[COOKIE] == token


def test_minute_quota_and_spoofed_forwarding_headers(clients):
    make, app, _, _, _ = clients
    client = session(make)
    assert client.post("/api/chat", json=question()).status_code == 200
    assert client.post("/api/chat", json=question()).status_code == 200
    response = client.post("/api/chat", json=question(), headers={"X-Forwarded-For": "198.51.100.7"})
    assert response.status_code == 429 and int(response.headers["Retry-After"]) > 0
    with app.state.store.pool.connection() as connection:
        rows = connection.execute("SELECT DISTINCT network_hash FROM cc_requests").fetchall()
    assert rows == [{"network_hash": network_digest("192.0.2.10", "e"*32)}]


def test_private_gateway_denies_browser_and_reserves_per_purpose(clients):
    make, app, calls, _, _ = clients
    client = make()
    route = "/internal/llm/v1/embeddings"
    body = {"model": "text-embedding-3-small", "input": "dato"}
    assert client.post(route, json=body).status_code == 403
    assert client.post(route, json=body, headers={"Authorization": "Bearer " + "c"*32}).status_code == 403
    private = TestClient(app, base_url=ORIGIN)
    try:
        for token in ("c"*32, "d"*32):
            assert private.post(route, json=body, headers={"Authorization": f"Bearer {token}"}).status_code == 200
        assert private.post(route, json={**body, "model": "expensive"}, headers={"Authorization": "Bearer " + "c"*32}).status_code == 422
    finally:
        private.close()
    with app.state.store.pool.connection() as connection:
        rows = connection.execute("SELECT purpose,charged_micro,settled FROM cc_spend ORDER BY purpose").fetchall()
    assert rows == [{"purpose": "chat", "charged_micro": 1, "settled": True}, {"purpose": "index", "charged_micro": 1, "settled": True}]


def test_empty_retrieval_can_classify_conversation_but_unsafe_retrieval_never_generates(clients):
    make, app, calls, _, knowledge = clients
    client = session(make)
    knowledge["fragments"] = []
    result = client.post("/api/chat", json=question())
    assert result.status_code == 200 and result.json()["sources"] == []
    assert sum(request.url.host == "openrouter.ai" for request in calls) == 1
    calls.clear()
    knowledge["fragments"] = [{**FRAGMENT, "url": "https://evil.test/"}]
    assert client.post("/api/chat", json=question()).status_code == 503
    assert not any(request.url.host == "openrouter.ai" for request in calls)


def test_fifty_sessions_behind_one_network(clients):
    make, app, _, _, _ = clients
    visitors = [session(make) for _ in range(50)]
    for client in visitors:
        response = client.post("/api/chat", json=question())
        assert response.status_code == 200, response.text
    with app.state.store.pool.connection() as connection:
        assert connection.execute("SELECT count(*) AS n FROM cc_sessions").fetchone()["n"] == 50
        assert connection.execute("SELECT count(*) AS n FROM cc_spend").fetchone()["n"] == 50


def test_session_expiry_and_history_retention(clients):
    make, app, calls, _, _ = clients
    client = session(make)
    assert client.post("/api/chat", json=question()).status_code == 200
    with app.state.store.pool.connection() as connection:
        connection.execute("UPDATE cc_sessions SET verified_until=now()-interval '1 second'")
        connection.execute("UPDATE cc_history SET created_at=now()-interval '25 hours'")
        connection.execute("UPDATE cc_requests SET created_at=now()-interval '25 hours'")
    app.state.store.last_cleanup = 0
    state = client.get("/api/session").json()
    assert state["authenticated"] and state["verificationRequired"]
    assert client.post("/api/chat", json=question()).status_code == 401
    with app.state.store.pool.connection() as connection:
        assert not connection.execute("SELECT 1 FROM cc_history").fetchone()
        assert connection.execute("SELECT response FROM cc_requests").fetchone()["response"] is None


def test_atomic_admission_single_session_global_limit_and_expired_leases(clients):
    make, app, _, _, _ = clients
    store = app.state.store
    hashes = [token_digest(new_token()) for _ in range(5)]
    for token in hashes:
        store.verify_session(token)

    def admit(token):
        try:
            return store.begin_request(token, str(uuid4()), "input", "network")
        except ChatError as error:
            return error.status

    with ThreadPoolExecutor(max_workers=5) as pool:
        outcomes = list(pool.map(admit, hashes))
    assert outcomes.count(None) == 4 and outcomes.count(429) == 1
    assert admit(hashes[outcomes.index(None)]) == 429
    with store.pool.connection() as connection:
        connection.execute("UPDATE cc_requests SET active_until=now()-interval '1 second'")
        previous = connection.execute("SELECT session_hash,request_id,input_hash FROM cc_requests LIMIT 1").fetchone()
    with pytest.raises(ChatError) as caught:
        store.begin_request(previous["session_hash"], previous["request_id"], previous["input_hash"], "network")
    assert caught.value.code == "request_expired"
    assert admit(hashes[outcomes.index(429)]) is None


def test_window_limit_cannot_be_reset_by_reverification_or_clearing(clients):
    make, app, calls, _, _ = clients
    client = session(make)
    token = token_digest(client.cookies[COOKIE])
    assert client.post("/api/chat", json=question()).status_code == 200
    with app.state.store.pool.connection() as connection:
        connection.execute("UPDATE cc_rate_limits SET hits=20,expires_at=now()+interval '1 hour' WHERE bucket=%s",
                           (f"chat:{token}",))
    state = client.get("/api/session").json()["quota"]
    assert state["remaining"] == 0 and state["retryAfter"] >= 3590
    renewed = client.post("/api/session", json={"turnstileToken": "renewed"}).json()["quota"]
    cleared = client.request("DELETE", "/api/conversation", json={}).json()["quota"]
    for quota in (renewed, cleared):
        assert quota["remaining"] == 0 and quota["resetAt"] == state["resetAt"]
    calls.clear()
    response = client.post("/api/chat", json=question())
    assert response.status_code == 429 and int(response.headers["Retry-After"]) >= 3590
    assert not any(request.url.host == "openrouter.ai" or request.url.path == "/retrieve" for request in calls)


@pytest.mark.parametrize("clients", [{"public_origin": ORIGIN, "refresh_hours": 2, "questions": 3}], indirect=True)
def test_fixed_window_starts_on_first_question_and_resets_without_sliding(clients):
    make, app, _, _, _ = clients
    client = session(make)
    initial = client.get("/api/session").json()["quota"]
    assert initial["remaining"] == 3 and initial["resetAt"] is None and initial["refreshHours"] == 2
    body = question()
    first = client.post("/api/chat", json=body).json()["quota"]
    assert first["remaining"] == 2 and first["limit"] == 3
    until_reset = (datetime.fromisoformat(first["resetAt"]) - datetime.now(timezone.utc)).total_seconds()
    assert 7190 <= until_reset <= 7200
    second = client.post("/api/chat", json=question()).json()["quota"]
    assert second["remaining"] == 1 and second["resetAt"] == first["resetAt"]
    replay = client.post("/api/chat", json=body).json()["quota"]
    assert replay["remaining"] == 1 and replay["resetAt"] == first["resetAt"]
    assert client.post("/api/chat", json=question()).status_code == 429
    token = token_digest(client.cookies[COOKIE])
    with app.state.store.pool.connection() as connection:
        connection.execute("UPDATE cc_requests SET created_at=now()-interval '2 minutes' WHERE session_hash=%s", (token,))
    exhausted = client.post("/api/chat", json=question()).json()["quota"]
    assert exhausted["remaining"] == 0 and exhausted["resetAt"] == first["resetAt"]
    assert client.post("/api/chat", json=question()).status_code == 429
    with app.state.store.pool.connection() as connection:
        connection.execute("UPDATE cc_rate_limits SET expires_at=now()-interval '1 second' WHERE bucket=%s", (f"chat:{token}",))
    reset = client.get("/api/session").json()["quota"]
    assert reset["remaining"] == 3 and reset["resetAt"] is None
    fresh = client.post("/api/chat", json=question()).json()["quota"]
    assert fresh["remaining"] == 2 and fresh["resetAt"] != first["resetAt"]


def test_spent_budget_blocks_public_and_internal_outbound(clients):
    make, app, calls, _, _ = clients
    client = session(make)
    app.state.store.reserve("chat", 10_000_000)
    previous = len(calls)
    assert client.post("/api/chat", json=question()).status_code == 503
    private = TestClient(app, base_url=ORIGIN)
    try:
        response = private.post("/internal/llm/v1/embeddings", json={"model": "text-embedding-3-small", "input": "test"},
                                headers={"Authorization": "Bearer " + "c"*32})
        assert response.status_code == 503
    finally:
        private.close()
    assert len(calls) == previous


def test_timeout_releases_chat_lease_without_repeating_request(clients, monkeypatch):
    make, app, calls, _, _ = clients
    client = session(make)

    async def timeout(*_):
        raise TimeoutError("simulated")

    monkeypatch.setattr(app.state.provider, "answer", timeout)
    body = question()
    assert client.post("/api/chat", json=body).status_code == 504
    assert client.post("/api/chat", json=body).json()["code"] == "request_failed"
    with app.state.store.pool.connection() as connection:
        row = connection.execute("SELECT status,active_until<=now() AS inactive FROM cc_requests").fetchone()
        assert row == {"status": "failed", "inactive": True}


def test_history_retains_four_turns_and_isolates_content_versions(clients):
    make, app, _, _, _ = clients
    store = app.state.store
    token = token_digest(new_token())
    store.verify_session(token)
    for number in range(5):
        request_id = str(uuid4())
        with store.pool.connection() as connection:
            connection.execute("INSERT INTO cc_requests(session_hash,request_id,input_hash,network_hash) VALUES (%s,%s,'input','network')",
                               (token, request_id))
        store.finish_request(token, request_id, {"contentVersion": VERSION, "answer": f"Answer {number}"}, f"Question {number}")
    assert len(store.history(token, VERSION)) == 4
    assert len(store.history(token)) == 4
    assert all(turn["version"] == VERSION for turn in store.history(token))
    assert store.history(token_digest(new_token())) == []
    assert store.history(token, "b"*64) == []
    late = str(uuid4())
    with store.pool.connection() as connection:
        connection.execute("INSERT INTO cc_requests(session_hash,request_id,input_hash,network_hash,active_until) "
                           "VALUES (%s,%s,'input','network',now()-interval '1 second')", (token, late))
    store.clear_history(token)
    store.finish_request(token, late, {"contentVersion": VERSION, "answer": "late"}, "late question")
    assert store.history(token, VERSION) == []
    assert store.history(token) == []


def test_followup_sends_only_own_server_questions_to_retrieval(clients):
    make, app, calls, _, _ = clients
    client = session(make)
    first = {**question(), "message": "que sabes de dama y oci"}
    assert client.post("/api/chat", json=first).status_code == 200
    second = {**question(), "message": "en donde puedo investigar mas sobre este tema o relacion"}
    result = client.post("/api/chat", json=second)
    assert result.status_code == 200 and result.json()["sources"] == [
        {key: FRAGMENT[key] for key in ("id", "title", "url")}]
    queries = [json.loads(call.content) for call in calls if call.url.path == "/retrieve"]
    assert queries[0]["history"] == []
    assert queries[1]["message"] == second["message"]
    assert queries[1]["history"] == [{"question": first["message"], "version": VERSION}]
    stranger = session(make)
    assert stranger.post("/api/chat", json=question()).status_code == 200
    assert json.loads(next(call.content for call in reversed(calls) if call.url.path == "/retrieve"))["history"] == []
    assert client.request("DELETE", "/api/conversation", json={}).status_code == 200
    assert app.state.store.history(token_digest(client.cookies[COOKIE])) == []


def test_idle_retention_sweeps_without_http_traffic(database_url, monkeypatch):
    import app.main as main
    monkeypatch.setattr(main, "CLEANUP_SECONDS", .01)
    settings = Settings(database_url, "a"*32, "b"*32, "c"*32, "d"*32, "e"*32, public_origin=ORIGIN)
    application = create_app(settings, transport=httpx.MockTransport(lambda _: pytest.fail("No outbound call expected")))
    with TestClient(application, base_url=ORIGIN):
        store = application.state.store
        token = token_digest(new_token())
        store.verify_session(token)
        with store.pool.connection() as connection:
            connection.execute("INSERT INTO cc_history(session_hash,request_id,version,question,answer,created_at) "
                               "VALUES (%s,%s,'old','private question','private answer',now()-interval '25 hours')", (token, uuid4()))
        store.last_cleanup = 0
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            with store.pool.connection() as connection:
                if not connection.execute("SELECT 1 FROM cc_history").fetchone():
                    break
            time.sleep(.01)
        else:
            pytest.fail("Expired history survived the background retention sweep")


def test_published_version_change_excludes_old_history_but_preserves_idempotency(clients, monkeypatch):
    make, app, _, _, knowledge = clients
    histories = []

    async def answer(_message, _fragments, history):
        histories.append(history)
        return "Respuesta respaldada.", [{key: FRAGMENT[key] for key in ("id", "title", "url")}]

    monkeypatch.setattr(app.state.provider, "answer", answer)
    client = session(make)
    original = question()
    first = client.post("/api/chat", json=original)
    assert first.status_code == 200 and first.json()["contentVersion"] == VERSION
    assert first.json()["graphTrace"] == TRACE
    assert app.state.store.history(token_digest(client.cookies[COOKIE]), VERSION)
    knowledge["version"] = "b"*64
    knowledge["graphTrace"] = {**TRACE, "version": "c"*64}
    second = client.post("/api/chat", json=question())
    assert second.status_code == 200 and second.json()["contentVersion"] == "b"*64
    assert second.json()["graphTrace"]["version"] == "c"*64
    assert histories == [[], []]
    replay = client.post("/api/chat", json=original)
    assert replay.status_code == 200 and replay.json()["contentVersion"] == VERSION
    assert replay.json()["graphTrace"] == TRACE
    assert replay.json()["answer"] == first.json()["answer"] and len(histories) == 2


def test_invalid_worker_trace_stops_before_provider_call(clients):
    make, _, calls, _, knowledge = clients
    client = session(make)
    knowledge["graphTrace"] = {**TRACE, "nodes": ["private/path"]}
    calls.clear()
    response = client.post("/api/chat", json=question())
    assert response.status_code == 503 and "private/path" not in response.text
    assert not any(request.url.host == "openrouter.ai" for request in calls)


@pytest.mark.parametrize("no_fragments", [False, True])
def test_unsupported_answer_has_no_graph_highlights(clients, monkeypatch, no_fragments):
    make, app, _, _, knowledge = clients
    client = session(make)
    if no_fragments:
        knowledge["fragments"] = []

    async def unsupported(*_args):
        return "No dispongo de información suficiente para responder esa consulta.", []

    monkeypatch.setattr(app.state.provider, "answer", unsupported)
    response = client.post("/api/chat", json=question())
    assert response.status_code == 200
    assert response.json()["graphTrace"] == {**TRACE, "nodes": [], "edges": []}


def test_session_availability_waits_for_first_knowledge_snapshot(clients):
    make, app, calls, _, knowledge = clients
    knowledge["status"] = "waiting"
    client = make()
    assert client.get("/api/session").json()["available"] is False
    response = client.post("/api/session", json={"turnstileToken": "proof"})
    assert response.json()["authenticated"] is True and response.json()["available"] is False
    knowledge["status"] = "ready"
    assert client.get("/api/session").json()["available"] is True
    assert not any(request.url.host == "openrouter.ai" for request in calls)

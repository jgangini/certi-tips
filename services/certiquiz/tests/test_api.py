"""Run against the isolated PostgreSQL test profile, never the production DSN."""

from concurrent.futures import ThreadPoolExecutor
from collections import Counter
from contextlib import ExitStack
import json
import os
from threading import Barrier

from fastapi.testclient import TestClient
import psycopg
import pytest

from app import game
from app.main import Settings, create_app
from app.security import HOST_COOKIE, ROOM_COOKIE, token_digest

ORIGIN = "https://quiz.test"
FRONTEND = "https://jgangini.github.io"
HEADERS = {"Origin": FRONTEND, "X-CertiQuiz": "1"}
CREATE_BODY = {"courseId": "practice", "questionCount": 2, "secondsPerQuestion": 10}
QUESTIONS = [{"id": f"q{number}", "question": f"Pregunta {number}", "correctOption": "b", "options": [
    {"id": "a", "text": "Incorrecta", "explanation": "No es la respuesta"},
    {"id": "b", "text": "Correcta", "explanation": "Esta es la respuesta"}]} for number in range(3)]


@pytest.fixture
def database_url():
    value = os.environ.get("CERTIQUIZ_TEST_DATABASE_URL")
    if not value:
        pytest.skip("CERTIQUIZ_TEST_DATABASE_URL is required for real PostgreSQL integration tests")
    # Guard the destructive fixture independently of the main application's environment.
    connection_info = psycopg.conninfo.conninfo_to_dict(value)
    if connection_info.get("host") != "test-postgres" and "test" not in connection_info.get("dbname", ""):
        pytest.fail("Use test-postgres or a dedicated database whose name contains 'test'.")
    with psycopg.connect(value) as connection:
        connection.execute("DELETE FROM cq_sessions")
        connection.execute("DELETE FROM cq_rooms")
        connection.execute("DELETE FROM cq_rate_limits")
    return value


@pytest.fixture
def clients(database_url, tmp_path, monkeypatch):
    monkeypatch.setenv("CERTIQUIZ_CATALOG_SOURCE", "bundled")
    (tmp_path / "catalog.json").write_text(json.dumps({"courses": [
        {"id": "practice", "title": "Práctica", "questionBank": "questions"}]}), encoding="utf-8")
    (tmp_path / "questions.json").write_text(json.dumps(QUESTIONS), encoding="utf-8")
    app = create_app(Settings(database_url, ORIGIN, (FRONTEND,), True, tmp_path))
    with ExitStack() as stack:
        stack.enter_context(TestClient(app, base_url=ORIGIN))

        def make(ip="192.0.2.10"):
            client = TestClient(app, base_url=ORIGIN, headers=HEADERS, client=(ip, 50000))
            stack.callback(client.close)
            return client

        yield make, app


def host_room(make, count=2, ip="192.0.2.10"):
    host = make(ip)
    response = host.post("/api/rooms", json={**CREATE_BODY, "questionCount": count})
    assert response.status_code == 201, response.text
    return host, response.json()["code"]


def join(make, code, nickname):
    player = make()
    response = player.post(f"/api/rooms/{code}/join", json={"nickname": nickname})
    assert response.status_code == 200, response.text
    return player, response.json()["me"]["id"]


def test_complete_round_hides_answers_and_keeps_tied_ranks(clients, monkeypatch):
    make, _ = clients
    host, code = host_room(make, 1)
    alice, alice_id = join(make, code, "Alice")
    bob, _ = join(make, code, "Bob")
    state = host.post(f"/api/rooms/{code}/start", json={}).json()
    question_id = state["question"]["id"]
    answer_question = game.answer_question
    monkeypatch.setattr(game, "answer_question", lambda room, player_id, question_id, option_id, now:
                        answer_question(room, player_id, question_id, option_id, state["deadline"] - 5000))
    assert "correctOption" not in state["question"]
    assert "explanation" not in json.dumps(state) and "answerPoints" not in state
    response = alice.post(f"/api/rooms/{code}/answers", json={"questionId": question_id, "optionId": "b"})
    assert response.status_code == 200 and response.json()["me"]["correct"] is None
    assert response.json()["me"]["score"] == 0
    state = bob.post(f"/api/rooms/{code}/answers", json={"questionId": question_id, "optionId": "b"}).json()
    assert state["status"] == "reveal" and state["question"]["correctOption"] == "b"
    assert [entry["rank"] for entry in state["leaderboard"]] == [1, 1]
    assert [entry["score"] for entry in state["leaderboard"]] == [750, 750]
    state = host.post(f"/api/rooms/{code}/next", json={}).json()
    assert state["status"] == "ranking" and state["question"] is None and state["deadline"] is None
    assert alice.get(f"/api/rooms/{code}").json()["status"] == "ranking"
    state = host.post(f"/api/rooms/{code}/next", json={}).json()
    assert state["status"] == "finished" and state["question"] is None
    assert alice.get(f"/api/rooms/{code}").json()["me"]["id"] == alice_id


def test_host_ownership_cross_room_auth_and_fake_scores(clients):
    make, _ = clients
    host, first = host_room(make)
    other_host, second = host_room(make)
    alice, _ = join(make, first, "Alice")
    unknown = make()
    assert unknown.get(f"/api/rooms/{first}").status_code == 403
    assert unknown.get("/api/rooms/000000").status_code == 403
    assert alice.get(f"/api/rooms/{second}").status_code == 403
    assert other_host.post(f"/api/rooms/{first}/finish", json={}).status_code == 403
    assert alice.post(f"/api/rooms/{first}/start", json={}).status_code == 401
    assert unknown.get("/api/session").json() == {"host": False, "roomCode": None}
    state = host.post(f"/api/rooms/{first}/start", json={}).json()
    payload = {"questionId": state["question"]["id"], "optionId": "b"}
    assert host.post(f"/api/rooms/{first}/answers", json=payload).status_code == 403
    assert alice.post(f"/api/rooms/{second}/answers", json=payload).status_code == 403
    assert alice.post(f"/api/rooms/{first}/answers", json={**payload, "score": 10000}).status_code == 422
    assert alice.post(f"/api/rooms/{first}/answers", json={**payload, "elapsedMs": 0}).status_code == 422
    assert host.post(f"/api/rooms/{first}/next", json={}).status_code == 409


def test_csrf_cookies_body_limits_and_no_secret_echo(clients):
    make, _ = clients
    client = make()
    payload = CREATE_BODY
    assert client.post("/api/rooms", json=payload, headers={"Origin": "https://evil.test"}).status_code == 403
    assert client.post("/api/rooms", json=payload, headers={"Origin": ""}).status_code == 403
    assert client.post("/api/rooms", json=payload, headers={"Origin": ORIGIN}).status_code == 403
    assert client.post("/api/rooms", json=payload, headers={"X-CertiQuiz": ""}).status_code == 403
    assert client.post("/api/rooms", content="x", headers={"Content-Type": "text/plain"}).status_code == 415
    assert client.post("/api/rooms", content="x" * 5000, headers={"Content-Type": "application/json"}).status_code == 413
    assert client.post("/api/rooms", content=iter([b"x" * 3000, b"y" * 3000]),
                       headers={"Content-Type": "application/json"}).status_code == 413
    rejected = client.post("/api/rooms", json={**payload, "debug": "submitted-private-value"})
    assert rejected.status_code == 422 and "submitted-private-value" not in rejected.text
    response = client.post("/api/rooms", json=payload)
    assert response.status_code == 201 and len(response.headers.get_list("set-cookie")) == 2
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "secure" in cookie and "samesite=none" in cookie and "partitioned" in cookie
    assert cookie.startswith("__host-cq_host=") and "path=/" in cookie
    assert "domain=" not in cookie
    assert response.headers["access-control-allow-origin"] == FRONTEND
    assert response.headers["access-control-allow-credentials"] == "true"
    assert client.get("/").headers["content-security-policy"].startswith("default-src 'self'")
    assert client.get("/").status_code == 404
    assert client.get("/index.html").status_code == 404
    assert client.get("/questions.json").status_code == 404
    assert client.get("/api/catalog").headers["cache-control"] == "no-store"


def test_join_retries_alias_collision_and_logout_cleanup(clients):
    make, _ = clients
    host, code = host_room(make)
    player, player_id = join(make, code, "Alice")
    state = player.post(f"/api/rooms/{code}/join", json={"nickname": "Other Name"}).json()
    assert state["me"]["id"] == player_id and state["me"]["nickname"] == "Alice"
    assert make().post(f"/api/rooms/{code}/join", json={"nickname": "ＡＬＩＣＥ"}).status_code == 409
    assert player.post("/api/logout", json={}).status_code == 200
    assert host.get(f"/api/rooms/{code}").json()["players"] == []
    player, _ = join(make, code, "Alice")
    token = host.cookies[HOST_COOKIE]
    assert host.post("/api/rooms", json=CREATE_BODY).status_code == 409
    assert host.cookies[HOST_COOKIE] == token
    assert host.get("/api/session").json()["roomCode"] == code
    response = host.post("/api/logout", json={})
    assert response.status_code == 200
    assert len(response.headers.get_list("set-cookie")) == 2
    for header in response.headers.get_list("set-cookie"):
        assert "Max-Age=0" in header and "SameSite=none" in header and "Partitioned" in header
    assert player.get(f"/api/rooms/{code}").json()["status"] == "finished"
    assert host.get("/api/session").json() == {"host": False, "roomCode": None}


def test_concurrent_equivalent_nicknames_create_only_one_participant(clients, database_url):
    make, _ = clients
    host, code = host_room(make)
    barrier = Barrier(2)
    visitors = [(make(), "  Ana   María  "), (make(), "ＡＮＡ　ＭＡＲＩ\u0301Ａ")]

    def enter(visitor):
        client, nickname = visitor
        barrier.wait(timeout=5)
        return client.post(f"/api/rooms/{code}/join", json={"nickname": nickname})

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(enter, visitors))
    assert sorted(response.status_code for response in responses) == [200, 409]
    rejected = next(response for response in responses if response.status_code == 409)
    assert "ya está en uso" in rejected.json()["detail"] and "set-cookie" not in rejected.headers
    assert host.get(f"/api/rooms/{code}").json()["playerCount"] == 1
    with psycopg.connect(database_url) as connection:
        assert connection.execute("SELECT count(*) FROM cq_sessions WHERE room_code=%s AND kind='player'", (code,)).fetchone()[0] == 1
        assert connection.execute("SELECT state->'players'->0->>'normalized' FROM cq_rooms WHERE code=%s", (code,)).fetchone()[0] == "ana maría"


def test_duplicate_concurrent_and_stale_answers_do_not_inflate_scores(clients):
    make, _ = clients
    host, code = host_room(make)
    alice, _ = join(make, code, "Alice")
    bob, _ = join(make, code, "Bob")
    state = host.post(f"/api/rooms/{code}/start", json={}).json()
    question_id = state["question"]["id"]
    payload = {"questionId": question_id, "optionId": "b"}
    with ThreadPoolExecutor(max_workers=4) as pool:
        replies = list(pool.map(lambda client: client.post(f"/api/rooms/{code}/answers", json=payload), [alice, alice, bob, bob]))
    assert all(reply.status_code == 200 for reply in replies)
    state = host.get(f"/api/rooms/{code}").json()
    assert state["status"] == "reveal" and state["answeredCount"] == 2
    assert all(type(player["score"]) is int and 500 <= player["score"] <= 1000 for player in state["leaderboard"])
    scores = state["leaderboard"]
    assert alice.post(f"/api/rooms/{code}/answers", json=payload).status_code == 200
    assert host.get(f"/api/rooms/{code}").json()["leaderboard"] == scores
    assert alice.post(f"/api/rooms/{code}/answers", json={**payload, "optionId": "a"}).status_code == 409
    host.post(f"/api/rooms/{code}/next", json={})
    host.post(f"/api/rooms/{code}/next", json={})
    assert alice.post(f"/api/rooms/{code}/answers", json=payload).status_code == 409


def test_late_answer_is_rejected_and_deadline_survives_new_app(clients, database_url):
    make, app = clients
    host, code = host_room(make)
    alice, _ = join(make, code, "Alice")
    bob, _ = join(make, code, "Bob")
    state = host.post(f"/api/rooms/{code}/start", json={}).json()
    question_id = state["question"]["id"]
    alice.post(f"/api/rooms/{code}/answers", json={"questionId": question_id, "optionId": "b"})
    with psycopg.connect(database_url) as connection:
        expected = connection.execute("SELECT state->'answerPoints' FROM cq_rooms WHERE code=%s", (code,)).fetchone()[0]
        connection.execute("UPDATE cq_rooms SET state=jsonb_set(state,'{deadline}',to_jsonb(0::bigint)) WHERE code=%s", (code,))
    response = bob.post(f"/api/rooms/{code}/answers", json={"questionId": question_id, "optionId": "b"})
    assert response.status_code == 409
    restarted = create_app(app.state.settings)
    with TestClient(restarted, base_url=ORIGIN, headers=HEADERS) as recovered:
        recovered.cookies.update(alice.cookies)
        state = recovered.get(f"/api/rooms/{code}").json()
        assert state["status"] == "reveal" and state["me"]["score"] == next(iter(expected.values()))
        assert state["answeredCount"] == 1
    assert restarted.state.store.pool.closed


def test_get_before_deadline_does_not_wait_for_a_room_write_lock(clients, database_url):
    make, _ = clients
    host, code = host_room(make)
    alice, _ = join(make, code, "Alice")
    assert host.post(f"/api/rooms/{code}/start", json={}).status_code == 200
    with psycopg.connect(database_url) as connection:
        connection.execute("SELECT code FROM cq_rooms WHERE code=%s FOR UPDATE", (code,))
        # A locking GET would hit lock_timeout while this transaction remains open.
        response = alice.get(f"/api/rooms/{code}")
        assert response.status_code == 200 and response.json()["status"] == "question"


def test_concurrent_deadline_reads_and_late_answer_score_exactly_once(clients, database_url):
    make, _ = clients
    host, code = host_room(make)
    alice, _ = join(make, code, "Alice")
    bob, _ = join(make, code, "Bob")
    state = host.post(f"/api/rooms/{code}/start", json={}).json()
    payload = {"questionId": state["question"]["id"], "optionId": "b"}
    state = alice.post(f"/api/rooms/{code}/answers", json=payload).json()
    with psycopg.connect(database_url) as connection:
        expected = connection.execute("SELECT state->'answerPoints' FROM cq_rooms WHERE code=%s", (code,)).fetchone()[0]
        connection.execute("UPDATE cq_rooms SET state=jsonb_set(state,'{deadline}',to_jsonb(0::bigint)) WHERE code=%s", (code,))
    with ThreadPoolExecutor(max_workers=9) as pool:
        reads = [pool.submit(alice.get, f"/api/rooms/{code}") for _ in range(8)]
        late = pool.submit(bob.post, f"/api/rooms/{code}/answers", json=payload)
        assert late.result().status_code == 409
        for pending in reads:
            response = pending.result()
            assert response.status_code == 200
            assert response.json()["status"] == "reveal" and response.json()["me"]["score"] == next(iter(expected.values()))
    with psycopg.connect(database_url) as connection:
        persisted = connection.execute("SELECT state FROM cq_rooms WHERE code=%s", (code,)).fetchone()[0]
    assert persisted["version"] == state["version"] + 1
    assert sorted(player["score"] for player in persisted["players"]) == [0, next(iter(expected.values()))]


def test_projected_reads_match_full_state_for_host_and_players_in_every_phase(clients):
    make, app = clients
    host, code = host_room(make)
    alice, alice_id = join(make, code, "Alice")
    bob, bob_id = join(make, code, "Bob")

    def compare():
        for client, role, player_id in ((host, "host", None), (alice, "player", alice_id), (bob, "player", bob_id)):
            with app.state.store.room(code) as (_, row, now):
                expected = game.snapshot(code, row["state"], role, player_id, now)
            response = client.get(f"/api/rooms/{code}")
            assert response.status_code == 200
            actual = response.json()
            actual.pop("serverNow")
            expected.pop("serverNow")
            assert actual == expected
            with app.state.store.room(code, read_only=True, player_id=player_id) as (_, row, _):
                assert "questions" not in row["state"] and "answerPoints" not in row["state"]
                assert row["state"]["questionCount"] == row["state"]["playerCount"] == 2
                if row["state"]["status"] == "question":
                    assert [player["id"] for player in row["state"]["players"]] == ([player_id] if player_id else [])
                assert set(row["state"]["answers"]) <= ({player_id} if player_id else set())

    compare()
    for index in range(2):
        action = "start" if index == 0 else "next"
        state = host.post(f"/api/rooms/{code}/{action}", json={}).json()
        assert state["questionIndex"] == index
        compare()
        payload = {"questionId": state["question"]["id"], "optionId": "b"}
        assert alice.post(f"/api/rooms/{code}/answers", json=payload).status_code == 200
        compare()
        assert bob.post(f"/api/rooms/{code}/answers", json={**payload, "optionId": "a"}).status_code == 200
        compare()
        assert host.post(f"/api/rooms/{code}/next", json={}).json()["status"] == "ranking"
        compare()
    assert host.post(f"/api/rooms/{code}/next", json={}).json()["status"] == "finished"
    compare()


def test_conditional_reads_preserve_authorization_changes_and_deadlines(clients, database_url):
    make, _ = clients
    host, code = host_room(make, 1)
    alice, _ = join(make, code, "Alice")
    bob, _ = join(make, code, "Bob")
    other_host, other_code = host_room(make)
    version = host.get(f"/api/rooms/{code}").json()["version"]
    for client in (host, alice, bob):
        response = client.get(f"/api/rooms/{code}?version={version}")
        assert response.status_code == 204 and response.content == b""
        assert response.headers["cache-control"] == "no-store"
    for client in (make(), other_host):
        assert client.get(f"/api/rooms/{code}?version={version}").status_code == 403
    assert alice.get(f"/api/rooms/{other_code}?version=1").status_code == 403
    for invalid in ("-1", "unknown", "2147483648"):
        assert alice.get(f"/api/rooms/{code}?version={invalid}").status_code == 422
    state = host.post(f"/api/rooms/{code}/start", json={}).json()
    response = alice.get(f"/api/rooms/{code}?version={version}")
    assert response.status_code == 200 and "correctOption" not in response.json()["question"]
    assert alice.get(f"/api/rooms/{code}?version={state['version']}").status_code == 204
    alice.post(f"/api/rooms/{code}/answers", json={"questionId": state["question"]["id"], "optionId": "b"})
    response = alice.get(f"/api/rooms/{code}?version={state['version']}")
    assert response.status_code == 200 and response.json()["me"]["answer"] == "b"
    version = response.json()["version"]
    assert bob.get(f"/api/rooms/{code}?version={version}").status_code == 204
    with psycopg.connect(database_url) as connection:
        connection.execute("UPDATE cq_rooms SET state=jsonb_set(state,'{deadline}',to_jsonb(0::bigint)) WHERE code=%s", (code,))
    response = alice.get(f"/api/rooms/{code}?version={version}")
    assert response.status_code == 200 and response.json()["status"] == "reveal"
    assert type(response.json()["me"]["score"]) is int and 500 <= response.json()["me"]["score"] <= 1000
    assert response.json()["answeredCount"] == 1
    version = response.json()["version"]
    assert alice.get(f"/api/rooms/{code}?version={version}").status_code == 204
    state = host.post(f"/api/rooms/{code}/next", json={}).json()
    assert alice.get(f"/api/rooms/{code}?version={version}").status_code == 200
    assert alice.get(f"/api/rooms/{code}?version={state['version']}").status_code == 204
    # A retained session cannot substitute for a real member, even when the version matches.
    with psycopg.connect(database_url) as connection:
        connection.execute("UPDATE cq_rooms SET state=jsonb_set(state,'{players}','[]'::jsonb) WHERE code=%s", (code,))
    assert alice.get(f"/api/rooms/{code}?version={state['version']}").status_code == 403
    assert host.get(f"/api/rooms/{code}?version={state['version']}").status_code == 204


def test_one_thousand_attempts_cannot_evade_ip_limits_by_rotating_cookies_or_forwarded_header(clients, database_url):
    make, app = clients
    host, code = host_room(make)
    with psycopg.connect(database_url) as connection:
        tokens = [row[0] for row in connection.execute("SELECT token_hash FROM cq_sessions").fetchall()]
    assert host.cookies[HOST_COOKIE] not in tokens and host.cookies[ROOM_COOKIE] not in tokens
    assert token_digest(host.cookies[HOST_COOKIE]) in tokens
    bad = make()
    for number in range(1000):
        bad.cookies.clear()
        response = bad.post("/api/rooms", json=CREATE_BODY, headers={"X-Forwarded-For": f"198.51.100.{number % 250}"})
        assert response.status_code == (201 if number == 0 else 429)
        if number:
            assert "set-cookie" not in response.headers and "Retry-After" in response.headers
    with psycopg.connect(database_url) as connection:
        assert connection.execute("SELECT count(*) FROM cq_rooms").fetchone()[0] == 2
        assert connection.execute("SELECT count(*) FROM cq_sessions").fetchone()[0] == 4
        assert connection.execute("SELECT count(*) FROM cq_rate_limits").fetchone()[0] <= 5
    restarted = create_app(app.state.settings)
    with TestClient(restarted, base_url=ORIGIN, headers=HEADERS, client=("192.0.2.10", 50000)) as recovered:
        assert recovered.post("/api/rooms", json=CREATE_BODY).status_code == 429


def test_runtime_database_permissions_are_limited(database_url):
    with psycopg.connect(database_url) as connection:
        capabilities = connection.execute("SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls "
                                          "FROM pg_roles WHERE rolname=current_user").fetchone()
        assert capabilities == (False, False, False, False, False)
        assert connection.execute("SELECT has_schema_privilege(current_user,'public','CREATE')").fetchone() == (False,)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            connection.execute("CREATE TABLE forbidden_table (id integer)")
        connection.rollback()


def test_rate_limit_capacity_is_atomic_and_existing_buckets_do_not_wait_for_global_lock(clients, database_url):
    _, app = clients
    store = app.state.store
    assert store.rate_limit("known", 100, 60)
    with psycopg.connect(database_url) as connection:
        connection.execute("INSERT INTO cq_rate_limits(bucket,hits,expires_at) "
                           "SELECT 'capacity:'||number,1,now()+interval '1 hour' FROM generate_series(1,9998) number")
    buckets = ["known"] * 8 + [f"new:{number}" for number in range(16)]
    with ThreadPoolExecutor(max_workers=12) as pool:
        admitted = list(pool.map(lambda bucket: store.rate_limit(bucket, 100, 60), buckets))
    assert all(admitted[:8]) and sum(admitted[8:]) == 1
    with psycopg.connect(database_url) as connection:
        assert connection.execute("SELECT count(*) FROM cq_rate_limits").fetchone()[0] == 10000
        connection.execute("SELECT pg_advisory_xact_lock(61473202)")
        assert store.rate_limit("known", 100, 60)
        assert connection.execute("SELECT hits FROM cq_rate_limits WHERE bucket='known'").fetchone()[0] == 10


def test_configuration_rejects_unsafe_production_defaults(tmp_path):
    with pytest.raises(ValueError, match="HTTPS"):
        Settings("postgresql://localhost/test", "http://quiz.example", (FRONTEND,), True, tmp_path).validate()
    with pytest.raises(ValueError, match="desarrollo"):
        Settings("postgresql://localhost/test", "https://quiz.example", (FRONTEND,), False, tmp_path).validate()
    for origins in [(), ("*",), (FRONTEND + "/certi-tips/",), ("https://*.github.io",)]:
        with pytest.raises(ValueError):
            Settings("postgresql://localhost/test", ORIGIN, origins, True, tmp_path).validate()


def test_cors_only_allows_explicit_frontend_origin_and_methods(clients):
    make, _ = clients
    client = make()
    headers = {"Origin": FRONTEND, "Access-Control-Request-Method": "POST",
               "Access-Control-Request-Headers": "content-type,x-certiquiz"}
    response = client.options("/api/rooms", headers=headers)
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == FRONTEND
    assert response.headers["access-control-allow-credentials"] == "true"
    assert set(response.headers["access-control-allow-methods"].replace(" ", "").split(",")) == {"GET", "POST"}
    assert "Origin" in response.headers["vary"]
    for forbidden in ("https://evil.test", "https://another.github.io", FRONTEND + "/certi-tips/"):
        response = client.options("/api/rooms", headers={**headers, "Origin": forbidden})
        assert response.status_code == 400 and "access-control-allow-origin" not in response.headers
    assert client.options("/api/rooms", headers={**headers, "Access-Control-Request-Method": "DELETE"}).status_code == 400
    assert client.options("/api/rooms", headers={**headers, "Access-Control-Request-Headers": "authorization"}).status_code == 400
    response = client.get("/api/catalog", headers={"Origin": "https://evil.test"})
    assert "access-control-allow-origin" not in response.headers


def test_local_development_cookies_are_strict_without_partitioned(clients):
    _, app = clients
    configured = app.state.settings
    local = create_app(Settings(configured.database_url,
                                "http://127.0.0.1:18740", ("http://127.0.0.1:4173",), False, configured.data_dir))
    headers = {"Origin": "http://127.0.0.1:4173", "X-CertiQuiz": "1"}
    with TestClient(local, base_url="http://127.0.0.1:18740", headers=headers) as client:
        response = client.post("/api/rooms", json=CREATE_BODY)
        assert response.status_code == 201
        cookie = response.headers["set-cookie"].lower()
        assert "httponly" in cookie and "samesite=strict" in cookie
        assert cookie.startswith("cq_host=")
        assert "secure" not in cookie and "partitioned" not in cookie
        assert client.get("/api/session").json()["host"] is True
        response = client.post("/api/logout", json={})
        assert all("Partitioned" not in value for value in response.headers.get_list("set-cookie"))


def test_five_hundred_players_on_one_network_can_answer_concurrently_and_capacity_is_enforced(clients):
    make, _ = clients
    host, code = host_room(make, 1)
    assert host.get("/api/catalog").json()["limits"]["maxPlayers"] == 500
    players = [join(make, code, f"Player {number:03}")[0] for number in range(500)]
    assert make().post(f"/api/rooms/{code}/join", json={"nickname": "Over capacity"}).status_code == 409
    state = host.post(f"/api/rooms/{code}/start", json={}).json()
    payload = {"questionId": state["question"]["id"], "optionId": "b"}
    with ThreadPoolExecutor(max_workers=12) as pool:
        replies = list(pool.map(lambda player: player.post(f"/api/rooms/{code}/answers", json=payload), players))
    failures = Counter((reply.status_code, reply.json().get("detail", "")) for reply in replies if reply.status_code != 200)
    assert not failures, dict(failures)
    state = host.get(f"/api/rooms/{code}").json()
    assert state["status"] == "reveal" and state["answeredCount"] == 500
    assert state["playerCount"] == len(state["leaderboard"]) == 500 and state["players"] == []
    assert all(type(player["score"]) is int and 500 <= player["score"] <= 1000 for player in state["leaderboard"])
    assert [player["score"] for player in state["leaderboard"]] == sorted(
        [player["score"] for player in state["leaderboard"]], reverse=True)


def reset_creation_minute(database_url):
    with psycopg.connect(database_url) as connection:
        connection.execute("DELETE FROM cq_rate_limits WHERE bucket LIKE 'create-ip-minute:%'")


def test_public_creation_returns_host_cookies_without_a_login_or_browser_token(clients):
    make, _ = clients
    visitor = make()
    assert visitor.get("/api/session").json() == {"host": False, "roomCode": None}
    assert visitor.post("/api/host/login", json={}).status_code == 404
    response = visitor.post("/api/rooms", json=CREATE_BODY)
    assert response.status_code == 201 and response.json()["role"] == "host"
    assert visitor.get("/api/session").json() == {"host": True, "roomCode": response.json()["code"]}
    for name in (HOST_COOKIE, ROOM_COOKIE):
        assert visitor.cookies[name] not in response.text
    # Recover after losing the room cookie while retaining the existing host session.
    visitor.cookies.delete(ROOM_COOKIE)
    assert visitor.get("/api/session").json()["roomCode"] == response.json()["code"]
    rejected = visitor.post("/api/rooms", json=CREATE_BODY)
    assert rejected.status_code == 409 and "set-cookie" not in rejected.headers


def test_failed_creation_rolls_back_both_sessions_and_room(clients, database_url, monkeypatch):
    make, _ = clients
    # A duplicate session digest makes the presenter insert fail after the host and room inserts.
    with monkeypatch.context() as patch:
        patch.setattr("app.main.new_token", lambda: "a" * 43)
        response = make().post("/api/rooms", json=CREATE_BODY)
    assert response.status_code == 503 and "set-cookie" not in response.headers
    with psycopg.connect(database_url) as connection:
        assert connection.execute("SELECT count(*) FROM cq_rooms").fetchone()[0] == 0
        assert connection.execute("SELECT count(*) FROM cq_sessions").fetchone()[0] == 0
    # The same pool remains usable after the aborted transaction.
    assert make().get("/api/health").json() == {"ok": True}
    assert make().post("/api/rooms", json=CREATE_BODY).status_code == 201


def test_empty_lobby_expires_without_host_poll_extending_it(clients, database_url):
    make, _ = clients
    host, code = host_room(make)
    occupied_host, occupied_code = host_room(make, ip="192.0.2.20")
    join(make, occupied_code, "Alice")
    assert host.get(f"/api/rooms/{code}").status_code == 200
    with psycopg.connect(database_url) as connection:
        connection.execute("UPDATE cq_rooms SET created_at=now()-interval '16 minutes' WHERE code=ANY(%s)",
                           ([code, occupied_code],))
    assert host.get(f"/api/rooms/{code}").status_code == 404
    assert host.get("/api/session").json() == {"host": True, "roomCode": None}
    assert occupied_host.get(f"/api/rooms/{occupied_code}").status_code == 200
    response = host.post("/api/rooms", json=CREATE_BODY)
    assert response.status_code == 201 and response.json()["code"] != code


@pytest.mark.parametrize("expired", ["session", "room"])
def test_expired_participant_session_or_room_denies_access(clients, database_url, expired):
    make, _ = clients
    _, code = host_room(make)
    alice, _ = join(make, code, "Alice")
    with psycopg.connect(database_url) as connection:
        if expired == "session":
            connection.execute("UPDATE cq_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=%s",
                               (token_digest(alice.cookies[ROOM_COOKIE]),))
        else:
            connection.execute("UPDATE cq_rooms SET expires_at=now()-interval '1 second' WHERE code=%s", (code,))
    assert alice.get("/api/session").json() == {"host": False, "roomCode": None}
    assert alice.get(f"/api/rooms/{code}").status_code == 403
    assert alice.get(f"/api/rooms/{code}?version=1").status_code == 403
    assert alice.post(f"/api/rooms/{code}/answers", json={"questionId": "q0", "optionId": "b"}).status_code == 403


def test_three_active_rooms_per_network_and_global_capacity_are_atomic(clients, database_url):
    make, _ = clients
    for _ in range(2):
        host_room(make)
    reset_creation_minute(database_url)
    host_room(make)
    response = make().post("/api/rooms", json=CREATE_BODY)
    assert response.status_code == 429 and "3 salas" in response.json()["detail"]
    assert response.headers["retry-after"] and "set-cookie" not in response.headers
    visitors = [make(f"198.51.100.{number}") for number in range(1, 9)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        responses = list(pool.map(lambda visitor: visitor.post("/api/rooms", json=CREATE_BODY), visitors))
    assert [response.status_code for response in responses].count(201) == 7
    assert [response.status_code for response in responses].count(429) == 1
    with psycopg.connect(database_url) as connection:
        assert connection.execute("SELECT count(*) FROM cq_rooms").fetchone()[0] == 10
        assert connection.execute("SELECT count(*) FROM cq_sessions").fetchone()[0] == 20


def test_six_creations_per_host_per_hour_even_after_finishing_rooms(clients, database_url):
    make, _ = clients
    host = make()
    for _ in range(6):
        reset_creation_minute(database_url)
        response = host.post("/api/rooms", json=CREATE_BODY)
        assert response.status_code == 201
        assert host.post(f"/api/rooms/{response.json()['code']}/finish", json={}).status_code == 200
    reset_creation_minute(database_url)
    response = host.post("/api/rooms", json=CREATE_BODY)
    assert response.status_code == 429 and "set-cookie" not in response.headers


def test_ten_creations_per_network_per_hour_with_new_browser_sessions(clients, database_url):
    make, _ = clients
    for _ in range(10):
        reset_creation_minute(database_url)
        host, code = host_room(make)
        assert host.post(f"/api/rooms/{code}/finish", json={}).status_code == 200
    reset_creation_minute(database_url)
    response = make().post("/api/rooms", json=CREATE_BODY)
    assert response.status_code == 429 and "set-cookie" not in response.headers


def test_ipv6_address_rotation_within_one_64_does_not_reset_creation_limit(clients):
    make, _ = clients
    host_room(make, ip="2001:db8:1234:5678::1")
    host_room(make, ip="2001:db8:1234:5678::2")
    response = make("2001:db8:1234:5678:ffff:ffff:ffff:ffff").post("/api/rooms", json=CREATE_BODY)
    assert response.status_code == 429 and "set-cookie" not in response.headers

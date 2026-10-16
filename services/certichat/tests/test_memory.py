"""Shared 24-hour continuity and conservative voice accounting, using disposable PostgreSQL."""

from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from decimal import Decimal
import os
import time
from uuid import uuid4

import psycopg
import pytest

from app.security import ChatError
from app.settings import Settings, VOICE_MODELS
from app.store import Store

VERSION = "a"*64
SOURCE = {"id": "b"*64 + "-0000", "title": "Guía", "url": "https://jgangini.github.io/certitips/guide/"}


@pytest.fixture
def memory_store(request):
    url = os.environ.get("CERTICHAT_TEST_DATABASE_URL")
    if not url:
        pytest.skip("CERTICHAT_TEST_DATABASE_URL is required")
    config = psycopg.conninfo.conninfo_to_dict(url)
    if config.get("host") != "test-postgres" and "test" not in config.get("dbname", ""):
        pytest.fail("A disposable test database is required")
    store = Store(url, local_voice_pilot=getattr(request, "param", False))
    store.open()
    try:
        with store.pool.connection() as connection:
            for table in ("cc_sessions", "cc_rate_limits", "cc_spend"):
                connection.execute(f"DELETE FROM {table}")
        store.verify_session("session")
        yield store
    finally:
        store.close()


def add_turn(store, number, channel="chat", card=None, since=None, educational=True):
    request_id = str(uuid4())
    with store.pool.connection() as connection:
        connection.execute("INSERT INTO cc_requests(session_hash,request_id,input_hash,network_hash,channel) VALUES ('session',%s,'input','network',%s)", (request_id, channel))
    result = {"answer": f"Respuesta {number}", "contentVersion": VERSION, "sources": [SOURCE], "educational": educational}
    store.finish_request("session", request_id, result, f"Pregunta {number}", channel, card, since)
    return request_id, result


def test_continuity_survives_more_than_four_turns_without_renewing_its_oldest_contribution(memory_store):
    store = memory_store
    with store.pool.connection() as connection:
        since = connection.execute("SELECT now()-interval '23 hours' AS since").fetchone()["since"]
    add_turn(store, 0, card="Objetivo inicial", since=since)
    for number in range(1, 6):
        latest, result = add_turn(store, number, "voice" if number % 2 else "chat", f"Tema y duda {number}")
    history = store.history("session")
    assert [turn["question"] for turn in history] == [f"Pregunta {number}" for number in range(2, 6)]
    assert [turn["channel"] for turn in history] == ["chat", "voice", "chat", "voice"]
    assert all(turn["sources"] == [SOURCE] and isinstance(turn["request_id"], str) for turn in history)
    assert store.continuity("session") == {"text": "Tema y duda 5", "since": since}
    assert store.request_result("session", latest) == result
    assert store.request_result("another-session", latest) is None
    store.finish_request("session", latest, result, "Reintento", "voice", "No se duplica")
    assert store.continuity("session")["text"] == "Tema y duda 5"
    command, _ = add_turn(store, 6, "voice", "No guardar navegación", educational=False)
    assert len(store.history("session")) == 4 and store.continuity("session")["since"] == since
    assert store.request_result("session", command) is None
    store.clear_history("session")
    assert store.history("session") == [] and store.continuity("session") is None
    assert store.request_result("session", latest) is None


def test_expired_or_invalid_cards_cannot_be_renewed_by_late_responses(memory_store):
    store = memory_store
    add_turn(store, 0, card="Tema original")
    original = store.continuity("session")
    add_turn(store, 1, card="x"*1201)
    assert store.continuity("session") == original
    with store.pool.connection() as connection:
        expired = connection.execute("UPDATE cc_continuity SET since=now()-interval '25 hours' RETURNING since").fetchone()["since"]
    assert store.continuity("session") is None
    request_id, _ = add_turn(store, 2, "voice", "Resumen derivado de información vencida", expired)
    assert store.continuity("session") is None
    with store.pool.connection() as connection:
        connection.execute("UPDATE cc_requests SET created_at=now()-interval '25 hours' WHERE request_id=%s", (request_id,))
    assert store.request_result("session", request_id) is None
    add_turn(store, 3, card="Nuevo objetivo explícito")
    assert store.continuity("session")["text"] == "Nuevo objetivo explícito"


def test_first_card_preserves_the_oldest_retained_turn_timestamp(memory_store):
    request_id, _ = add_turn(memory_store, 0)
    with memory_store.pool.connection() as connection:
        oldest = connection.execute("UPDATE cc_history SET created_at=now()-interval '23 hours' WHERE request_id=%s RETURNING created_at", (request_id,)).fetchone()["created_at"]
    add_turn(memory_store, 1, card="Objetivo de ambos turnos")
    assert memory_store.continuity("session")["since"] == oldest


@pytest.mark.parametrize("channel", ["chat", "voice"])
def test_cached_responses_expire_even_when_cleanup_is_throttled(memory_store, channel):
    store, request_id = memory_store, str(uuid4())
    result = {"answer": "Respuesta", "contentVersion": VERSION, "sources": [SOURCE]}
    if channel == "voice":
        result.update(transcript="Pregunta", educational=True, audio={"data": "synthetic", "format": "wav"})
    assert store.begin_request("session", request_id, "input", "network", channel) is None
    reservation = store.reserve("chat", 100, channel)
    store.settle(reservation, 20)
    store.finish_request("session", request_id, result, "Pregunta", channel)
    assert store.begin_request("session", request_id, "input", "network", channel) == result
    assert store.request_result("session", request_id) == (result if channel == "voice" else None)
    with store.pool.connection() as connection:
        connection.execute("UPDATE cc_requests SET created_at=now()-interval '24 hours 5 seconds' WHERE request_id=%s", (request_id,))
    store.last_cleanup = time.monotonic()
    quota, spending = store.quota("session", channel), store.spend_breakdown()
    with pytest.raises(ChatError) as error:
        store.begin_request("session", request_id, "input", "network", channel)
    assert error.value.status == 409 and error.value.code == "request_expired"
    assert store.request_result("session", request_id) is None
    assert store.quota("session", channel) == quota and store.spend_breakdown() == spending
    with store.pool.connection() as connection:
        row = connection.execute("SELECT response,(SELECT count(*) FROM cc_requests) AS count FROM cc_requests WHERE request_id=%s", (request_id,)).fetchone()
    assert row["response"] == result and row["count"] == 1  # Expiry is enforced before the next cleanup, without a new admission or charge.


def test_voice_pilot_is_cumulative_and_separate_from_the_monthly_joint_runtime(memory_store):
    store = memory_store
    reservation = store.reserve("chat", 4_000_000, "voice")
    store.settle(reservation, 4_000_000)
    with store.pool.connection() as connection:
        connection.execute("UPDATE cc_spend SET created_at=now()-interval '100 days' WHERE id=%s", (reservation,))
    store.cleanup()
    store.reserve("chat", 580_000, "voice")
    assert not store.available("voice") and store.available("chat")
    assert store.spend_breakdown()["voicePilotMicro"] == 4_580_000
    assert store.spend_breakdown()["runtimeMicro"] == 580_000
    with pytest.raises(ChatError, match="piloto"):
        store.reserve("chat", 1, "voice")
    store.reserve("index", 5)
    assert store.spend_breakdown()["indexMicro"] == 5


def test_atomic_reservations_enforce_pilot_and_shared_limits(memory_store):
    def reserve(_):
        try:
            memory_store.reserve("chat", 3_000_000, "voice")
            return True
        except ChatError:
            return False
    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sorted(executor.map(reserve, range(2))) == [False, True]
    memory_store.monthly_limits["chat"] = 4_000_000
    memory_store.reserve("chat", 1_000_000)
    with pytest.raises(ChatError, match="presupuesto"):
        memory_store.reserve("chat", 1, "voice")
    assert memory_store.spend_breakdown()["runtimeMicro"] == 4_000_000


def test_voice_pilot_covers_shared_retrieval_and_retains_its_accounting_after_cleanup(memory_store):
    store = memory_store
    old = store.reserve("chat", 20)
    store.settle(old, 20)
    voice = store.reserve("chat", 4_000_000, "voice")
    store.settle(voice, 4_000_000)
    retrieval = store.reserve("chat", 580_000)
    store.settle(retrieval, 580_000)
    with store.pool.connection() as connection:
        connection.execute("UPDATE cc_spend SET created_at=now()-interval '101 days' WHERE id=%s", (old,))
        connection.execute("UPDATE cc_spend SET created_at=now()-interval '100 days' WHERE id=%s", (voice,))
        connection.execute("UPDATE cc_spend SET created_at=now()-interval '99 days' WHERE id=%s", (retrieval,))
    store.cleanup()
    assert store.spend_breakdown()["voicePilotMicro"] == 4_580_000
    assert store.spend_breakdown()["runtimeMicro"] == 0
    request_id = str(uuid4())
    store.begin_request("session", request_id, "input", "network", "voice")
    with pytest.raises(ChatError, match="piloto"):
        store.reserve("chat", 1)  # The private embeddings gateway uses the shared chat channel.
    store.finish_request("session", request_id, {"educational": False}, channel="voice")
    with pytest.raises(ChatError, match="piloto"):
        store.reserve("chat", 1)  # Protect retrieval still finishing after cancellation.
    with store.pool.connection() as connection:
        connection.execute("UPDATE cc_requests SET active_until=now()-interval '31 seconds' WHERE request_id=%s", (request_id,))
    store.reserve("chat", 1)  # Existing chat keeps its independent monthly allowance after the bounded grace period.
    assert not store.available("voice") and store.available("chat")


def test_voice_admission_has_a_bounded_lease_and_shared_quota(memory_store):
    store = memory_store
    for number in range(3):
        request_id = str(uuid4())
        store.begin_request("session", request_id, f"input-{number}", "network", "voice")
        with store.pool.connection() as connection:
            lease = connection.execute("SELECT extract(epoch FROM active_until-created_at)::int AS seconds FROM cc_requests WHERE request_id=%s", (request_id,)).fetchone()
        assert lease["seconds"] == 180
        store.finish_request("session", request_id, {"educational": False}, channel="voice")
    assert store.quota("session", "voice")["minuteRemaining"] == 7
    assert store.quota("session", "voice")["remaining"] == 17
    assert store.quota("session")["minuteRemaining"] == 0
    with pytest.raises(ChatError):
        store.begin_request("session", str(uuid4()), "chat", "network")


def test_voice_settings_are_disabled_by_default_and_fail_closed():
    settings = Settings("postgresql://test/test", "a"*32, "b"*32, "c"*32, "d"*32, "e"*32)
    assert settings.voice_enabled is False and settings.chat_budget_usd == Decimal("50")
    assert settings.voice_pilot_budget_usd == Decimal("4.58")
    for model in VOICE_MODELS:
        replace(settings, voice_enabled=True, voice_model=model).validate()
    for change in ({"voice_enabled": "true"}, {"voice_model": "unreviewed"}, {"voice_pilot_budget_usd": Decimal("4.59")},
                   {"voice_pilot_budget_usd": Decimal("NaN")}, {"voice_pilot_budget_usd": True}, {"chat_budget_usd": Decimal("50.01")}):
        with pytest.raises(ValueError):
            replace(settings, **change).validate()
    replace(settings, chat_budget_usd=Decimal("10"), voice_pilot_budget_usd=Decimal("1")).validate()


@pytest.mark.parametrize("memory_store", [True], indirect=True)
def test_local_pilot_counts_all_runtime_before_voice_and_across_cleanup_and_restart(memory_store):
    store = memory_store
    chat = store.reserve("chat", 4_000_000)
    store.settle(chat, 4_000_000)
    index = store.reserve("index", 7)
    store.settle(index, 7)
    with store.pool.connection() as connection:
        connection.execute("UPDATE cc_spend SET created_at=now()-interval '100 days'")
    store.cleanup()
    assert store.spend_breakdown()["voicePilotMicro"] == 4_000_000
    assert store.spend_breakdown()["runtimeMicro"] == 0
    with store.pool.connection() as connection:
        assert connection.execute("SELECT id FROM cc_spend").fetchall() == [{"id": chat}]
    store.reserve("chat", 580_000, "voice")  # An unsettled reservation remains charged.
    store.clear_history("session")
    restarted = Store(store.pool.conninfo, local_voice_pilot=True)
    restarted.open()
    try:
        assert restarted.spend_breakdown()["voicePilotMicro"] == 4_580_000
        assert restarted.spend_breakdown()["runtimeMicro"] == 580_000
        for channel in ("chat", "voice"):
            assert not restarted.available(channel)
            with pytest.raises(ChatError) as error:
                restarted.reserve("chat", 1, channel)
            assert error.value.code == "voice_budget_exhausted"
        restarted.reserve("index", 1)  # Index accounting retains its independent purpose.
    finally:
        restarted.close()


@pytest.mark.parametrize("memory_store", [True], indirect=True)
def test_local_pilot_serializes_chat_and_voice_reservations_against_one_total(memory_store):
    def reserve(channel):
        try:
            memory_store.reserve("chat", 3_000_000, channel)
            return True
        except ChatError:
            return False
    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sorted(executor.map(reserve, ("chat", "voice"))) == [False, True]
    assert memory_store.spend_breakdown()["voicePilotMicro"] == 3_000_000

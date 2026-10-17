"""Pinned speaker, billing and admission regressions without paid inference."""
import asyncio
import base64
import json
from uuid import uuid4

import httpx
import pytest

from app.security import ChatError
from app.speech import MODEL, VOICE, SPEECH
from test_voice import run, Ledger
from test_api import clients, database_url, session, ORIGIN

MP3 = b"ID3" + bytes(50)
GENERATION = "gen-fish-test"


def speech_response(request, cost=.00001):
    if request.method == "GET":
        assert request.url.path == "/api/v1/generation" and request.url.params["id"] == GENERATION
        return httpx.Response(200, json={"data": {"id": GENERATION, "model": "fish-audio/drama-3-20261013", "total_cost": cost}})
    payload = json.loads(request.content)
    assert request.url.path == "/api/v1/audio/speech"
    assert payload["model"] == MODEL and payload["voice"] == VOICE
    assert payload["response_format"] == "mp3" and payload["provider"] == {"data_collection": "deny"}
    return httpx.Response(200, content=MP3, headers={"Content-Type": "audio/mpeg", "X-Generation-Id": GENERATION})


def test_sheila_keeps_mixed_language_text_and_accounts_utf8_bytes():
    text = "Oracle estima el tenancy. SaaS, IaaS, São Paulo y español."
    def handler(request):
        if request.method == "POST":
            assert json.loads(request.content)["input"] == text
        return speech_response(request)
    audio, ledger = run(handler, lambda p: p.speak(text))
    assert audio == {"format": "mp3", "data": base64.b64encode(MP3).decode(), **SPEECH}
    assert ledger.reservations == [("chat", len(text.encode())*10, "voice")]
    assert ledger.settlements == [(1, 10)]


@pytest.mark.parametrize("failure", ["identity", "mp3", "upstream", "limit"])
def test_rejected_audio_or_unknown_bill_never_switches_model_or_retries_post(failure):
    calls = []
    def handler(request):
        calls.append(request.method)
        if failure == "upstream":
            return httpx.Response(503)
        if failure == "metadata" and request.method == "GET": return httpx.Response(200,json={"data":None})
        result = speech_response(request, cost=None if failure == "cost" else .00001)
        if request.method == "POST":
            if failure == "identity": result.headers.pop("x-generation-id")
            if failure == "mp3": return httpx.Response(200, content=b"not mp3", headers=result.headers)
            if failure == "limit": return httpx.Response(200, content=bytes(8000001), headers=result.headers)
        return result
    async def operation(p):
        with pytest.raises(ChatError): await p.speak("Texto válido")
    _, ledger = run(handler, operation)
    assert calls.count("POST") == 1 and len(ledger.reservations) == 1
    assert not ledger.settlements


def test_usage_read_can_lag_but_synthesis_is_not_repeated():
    calls = []
    def handler(request):
        calls.append(request.method)
        if calls == ["POST", "GET"]: return httpx.Response(404)
        return speech_response(request)
    _, ledger = run(handler, lambda p: p.speak("Una explicación"))
    assert calls == ["POST", "GET", "GET"] and ledger.settlements == [(1,10)]


@pytest.mark.parametrize("failure", ["cost", "metadata"])
def test_uncertain_billing_keeps_reservation_without_hiding_valid_audio(failure):
    def handler(request):
        if failure == "metadata" and request.method == "GET": return httpx.Response(200,json={"data":None})
        return speech_response(request, cost=None if failure == "cost" else .00001)
    audio, ledger = run(handler, lambda p:p.speak("Texto válido"))
    assert audio["format"] == "mp3" and ledger.reservations and not ledger.settlements


def test_price_change_is_settled_then_blocks_the_next_paid_call():
    calls=[]
    def handler(request):
        calls.append(request.method)
        return speech_response(request, .01)
    async def operation(p):
        await p.speak("Texto")
        await asyncio.gather(*p.speech_tasks)
        await asyncio.sleep(0)
        with pytest.raises(ChatError): await p.speak("Otra frase")
    _, ledger = run(handler, operation)
    assert ledger.settlements == [(1,10000)] and calls.count("POST")==1


def test_delayed_billing_never_delays_audio_and_shutdown_preserves_reservation():
    ledger=Ledger()
    async def operation():
        reached=asyncio.Event()
        async def handler(request):
            if request.method=="GET":
                reached.set()
                await asyncio.Event().wait()
            return speech_response(request)
        from app.voice import VoiceProvider
        from types import SimpleNamespace
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            p=VoiceProvider(SimpleNamespace(openrouter_api_key="fake",site_url="https://site.test/"),ledger,client)
            audio=await asyncio.wait_for(p.speak("Texto válido"),1)
            assert audio["format"]=="mp3"
            await reached.wait()
            await p.close()
            assert not p.speech_tasks and not ledger.settlements
    asyncio.run(operation())


def test_database_settlement_failure_keeps_the_full_reservation():
    import psycopg
    async def operation(p):
        def failed(*_): raise psycopg.OperationalError("Unavailable")
        p.store.settle=failed
        return await p.speak("Texto válido")
    audio, ledger=run(speech_response,operation)
    assert audio["format"]=="mp3" and ledger.reservations and not ledger.settlements


@pytest.mark.parametrize("text", ["", "  ", "x"*5001, "bad\x00text"])
def test_invalid_text_never_reserves_or_contacts_provider(text):
    async def operation(p):
        with pytest.raises(ChatError): await p.speak(text)
    _, ledger = run(lambda _: pytest.fail("Unexpected inference"), operation)
    assert not ledger.reservations


@pytest.mark.parametrize("clients", [{"public_origin": ORIGIN, "voice_enabled": True}], indirect=True)
def test_speech_endpoint_is_verified_idempotent_and_does_not_consume_questions_or_history(clients):
    make, app, calls, _, _ = clients
    app.state.voice.client = httpx.AsyncClient(transport=httpx.MockTransport(speech_response))
    data = {"requestId": str(uuid4()), "text": "Oracle estima el tenancy para el equipo"}
    assert make().post("/api/speech", json=data).status_code == 401
    client = session(make)
    before = client.get("/api/session").json()
    assert before["voice"]["tts"] == SPEECH
    response = client.post("/api/speech", json=data)
    assert response.status_code == 200, response.text
    assert response.json()["audio"]["voice"] == VOICE
    assert client.post("/api/speech", json=data).json() == response.json()
    assert client.post("/api/speech", json={**data, "text": "Otro texto"}).status_code == 409
    after = client.get("/api/session").json()
    assert before["quota"]["remaining"] == after["quota"]["remaining"]
    from app.security import token_digest, COOKIE
    assert app.state.store.history(token_digest(client.cookies[COOKIE])) == []
    with app.state.store.pool.connection() as connection:
        assert connection.execute("SELECT count(*) AS n FROM cc_spend").fetchone()["n"] == 1
    for invalid in ["", "x"*5001, "bad\x00text"]:
        assert client.post("/api/speech", json={"requestId":str(uuid4()),"text":invalid}).status_code == 422


@pytest.mark.parametrize("clients", [{"public_origin": ORIGIN, "voice_enabled": True}], indirect=True)
def test_last_answer_can_be_narrated_at_zero_question_quota_but_budget_still_blocks(clients):
    make, app, *_ = clients
    client = session(make)
    app.state.voice.client = httpx.AsyncClient(transport=httpx.MockTransport(speech_response))
    from app.security import token_digest, COOKIE
    key = token_digest(client.cookies[COOKIE])
    with app.state.store.pool.connection() as connection:
        connection.execute("INSERT INTO cc_rate_limits(bucket,hits,expires_at) VALUES (%s,20,now()+interval '1 hour')", ("chat:"+key,))
    assert client.get("/api/session").json()["quota"]["remaining"] == 0
    response = client.post("/api/speech", json={"requestId":str(uuid4()),"text":"La última respuesta"})
    assert response.status_code == 200, response.text
    def exhausted(*_): raise ChatError("Budget", 429)
    app.state.store.reserve = exhausted
    assert client.post("/api/speech", json={"requestId":str(uuid4()),"text":"Otra respuesta"}).status_code == 429

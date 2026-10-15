import asyncio
import copy
import json
from contextlib import contextmanager
from types import SimpleNamespace

import pytest
import httpx

from app.provider import CHAT_MODEL, DECISION_MODEL, prepare_request
from evaluate_knowledge import (COACHING, assessment_request, coach_request, comparison,
                                paired_p, parse_assessment, prepare_answer)
from evaluate_jev import check_finance
from app.store import Store

FRAGMENTS = [{"id": "canonical-question", "title": "Práctica", "url": "https://site.test/practice/",
              "text": "Opción incorrecta: todos tienen acceso. Respuesta correcta: aplicar permisos."}]


@pytest.mark.parametrize("locale,language", [("es", "español"), ("en", "inglés"), ("pt", "portugués de Brasil"), ("it", "italiano")])
def test_same_locale_evidence_history_and_citations_survive_both_experiment_arms(locale, language):
    case = {"question": "¿Qué respuesta es correcta?", "history": [{"question": "IAM", "answer": "No circular."}],
            "fragments": FRAGMENTS, "locale": locale, "gold": {"points": ["PRIVATE GOLD LABEL"]}}
    prepared = asyncio.run(prepare_answer(SimpleNamespace(site_url="https://site.test/"), case))
    original = copy.deepcopy(prepared)
    request = assessment_request(prepared, locale)
    assert request["state"]["locale"] == locale
    assert request["state"]["history"] == [{"question": "IAM"}]
    assert "PRIVATE GOLD LABEL" not in json.dumps(request) and "No circular." not in json.dumps(request)
    assert prepared["model"] == CHAT_MODEL and "Responde en " + language in prepared["messages"][0]["content"]
    for advice in (None, {"possibly_incomplete": True, "possible_conflict_ids": ["S1"]}):
        changed = coach_request(prepared, advice)
        before = json.loads(prepared["messages"][-1]["content"])
        after = json.loads(changed["messages"][-1]["content"])
        assert all(before[key] == after[key] for key in ("question", "history", "fragments"))
        assert COACHING in changed["messages"][0]["content"]
        payload, _ = prepare_request("chat/completions", changed, "chat")
        assert payload["reasoning"]["effort"] == "medium" and payload["max_tokens"] == 8192
    assert prepared == original and FRAGMENTS[0]["id"] == "canonical-question"


def response(request, sufficient=1, role="support", p=1):
    answers = {"sufficient": {"type": "noul", "noul": sufficient}}
    for name, question in request["questions"].items():
        if name == "sufficient":continue
        answers[name] = {"type": "choice", "choice": role,
                         "probabilities": {k: p if k == role else (1-p)/3 for k in question["criteria"]}}
    return {"model": DECISION_MODEL + "-20261014", "answers": answers}


@pytest.mark.parametrize("sufficient,role,p,expected", [(1,"support",1,False),(.5,"conflict",.7,False),
    (0,"support",1,True),(1,"conflict",.99,True)])
def test_only_strong_signals_are_actionable_and_nine_questions_fit(sufficient, role, p, expected):
    case = {"question": "¿Todos tienen acceso?", "history": [], "locale": "es", "fragments": FRAGMENTS*8}
    prepared = asyncio.run(prepare_answer(SimpleNamespace(site_url="https://site.test/"),case))
    request = assessment_request(prepared,"es")
    assert len(request["questions"]) == 9
    parsed = parse_assessment(response(request,sufficient,role,p),request)
    assert bool(parsed["advice"]) == expected


@pytest.mark.parametrize("bad", [True,float("nan"),-1,1.1,".9"])
def test_malformed_probabilities_and_unknown_source_ids_are_never_used(bad):
    prepared = asyncio.run(prepare_answer(SimpleNamespace(site_url="https://site.test/"),
        {"question":"IAM", "history":[], "locale":"es", "fragments":FRAGMENTS}))
    request=assessment_request(prepared,"es")
    with pytest.raises(ValueError):parse_assessment(response(request,sufficient=bad),request)
    with pytest.raises(ValueError):coach_request(prepared,{"possibly_incomplete":True,"possible_conflict_ids":["S99"]})


def test_paired_improvement_is_not_an_increase_in_answer_length_or_a_critical_regression():
    assert paired_p(0,0)==1 and paired_p(6,0)==.03125 and paired_p(3,3)==1
    rows=[{"id":str(i),"category":str(i%4),"current":{"correct":i>=6,"critical_error":False},
           "coaching":{"correct":True,"critical_error":False}} for i in range(120)]
    assert comparison(rows,"coaching")["passed"]
    rows[0]["coaching"]["critical_error"]=True
    assert not comparison(rows,"coaching")["passed"]
    assert not comparison(rows[:119],"coaching")["passed"]


@pytest.mark.parametrize("actual,expected,allowed", [(50,50,True),(60,60,True),(60,50,False),(50,60,False)])
def test_budget_check_requires_the_exact_approved_key_limit(monkeypatch, actual, expected, allowed):
    @contextmanager
    def connection():yield None
    monkeypatch.setattr(Store,"spending",lambda *_:{"purpose":0})
    ledger=SimpleNamespace(pool=SimpleNamespace(connection=connection),monthly_limits={"chat":1000000})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request:httpx.Response(200,
            json={"data":{"limit":actual,"limit_remaining":1,"usage_monthly":0}}))) as client:
            call=check_finance(client,SimpleNamespace(openrouter_api_key="dummy"),ledger,100,key_limit=expected)
            if allowed:assert (await call)["key"]["limit"]==expected
            else:
                with pytest.raises(ValueError):await call
    asyncio.run(run())

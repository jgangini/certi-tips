"""Pilot accounting and acceptance checks without real keys, databases or model calls."""
import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest

from app.provider import DECISION_MODEL
from app.security import ChatError
from evaluate_jev import (LIMIT_MICRO, QUESTIONS, PilotProvider, accepted, choose_threshold,
                          decision_input, gate, metrics, probabilities)
from test_provider import Ledger


def verdict(value, adequate=1):
    return {"coverage": value, "support": value, "resource": value, "evidence_sufficient": adequate}


def test_typed_probabilities_never_accept_a_wrong_model_or_missing_criterion():
    result = {"model": DECISION_MODEL, "answers": {k: {"type": "noul", "noul": 0.75} for k in QUESTIONS}}
    assert probabilities(result) == verdict(0.75, 0.75)
    for bad in (True, float("nan"), 1.01, -0.1, "0.8"):
        result["answers"]["support"]["noul"] = bad
        with pytest.raises(ValueError):
            probabilities(result)
    result["model"] = "typesafe/jev-1.13"
    with pytest.raises(ValueError):
        probabilities(result)


def test_honest_missing_evidence_is_not_a_bad_answer_or_a_probability_of_joint_success():
    assert accepted(verdict(0.9, 0.1), 0.8)
    assert not accepted({**verdict(0.9), "coverage": 0.1}, 0.8)


def test_holdout_needs_all_critical_errors_and_at_most_one_false_rejection():
    rows = [{"id": str(i), "expected_acceptable": i < 8, "critical": i >= 8,
             "probabilities": verdict(0.9 if i < 8 else 0.1)} for i in range(16)]
    threshold = choose_threshold(rows[:4])
    assert threshold == 0.5 and gate(rows, threshold)
    rows[0]["probabilities"] = verdict(0.1)
    assert gate(rows, threshold) and metrics(rows, threshold)["correct"] == 15
    rows[8]["probabilities"] = verdict(0.9)
    assert not gate(rows, threshold)
    assert not gate(rows[:15], threshold)


def test_expanded_gate_keeps_the_frozen_threshold_and_critical_checks():
    rows = [{"id": str(i), "expected_acceptable": i < 50, "critical": i >= 50,
             "probabilities": verdict(0.9 if i < 50 else 0.1)} for i in range(100)]
    assert gate(rows, 0.5, expected=100)
    rows[-1]["probabilities"] = verdict(0.9)
    assert not gate(rows, 0.5, expected=100)


def test_labels_and_review_notes_never_reach_the_judge():
    case = {"question": "hola", "history": [], "fragments": [], "response": {},
            "expected_acceptable": True, "rationale": "secret label"}
    state = decision_input(case)["state"]
    assert set(state) == {"question", "history", "fragments", "response"}
    assert "secret label" not in json.dumps(state)


def test_pilot_journals_uncertain_reservations_and_stops_at_fifty_cents(tmp_path):
    ledger = Ledger()
    report = {"attempts": []}
    output = tmp_path / "report.json"

    async def run():
        def handler(_):
            assert json.loads(output.read_text())["attempts"][-1]["status"] == "pending"
            return httpx.Response(200, json={"model": DECISION_MODEL, "answers": {}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = PilotProvider(SimpleNamespace(openrouter_api_key="test", site_url="https://site.test/"), ledger, client, report, output)
            data = {"model": DECISION_MODEL, "state": {}, "questions": QUESTIONS}
            await provider.request("alpha/decisions", data, "chat")
            assert report["attempts"][0]["at_risk_micro"] > 0 and not ledger.settlements
            report["preparation_at_risk_micro"] = LIMIT_MICRO
            with pytest.raises(ChatError, match="límite de gasto"):
                await provider.request("alpha/decisions", data, "chat")
    asyncio.run(run())
    assert len(ledger.reservations) == 1


def test_repair_uses_exactly_the_same_evidence_and_history(tmp_path):
    case = {"question": "Qué es DAMA", "history": [],
            "fragments": [{"id": "S1", "title": "DAMA", "resource_type": "text", "text": "Gestión de datos."}],
            "response": {"kind": "grounded", "answer": "Borrador", "citations": ["S1"]}}
    provider = PilotProvider(None, None, None, {"attempts": []}, tmp_path / "unused.json")
    provider.repair = (case, ["coverage"])
    data = {"messages": [{"role": "system", "content": "Reglas"},
                         {"role": "user", "content": json.dumps(decision_input(case)["state"])}]}
    revised = provider.repair_request(data)
    sent = json.loads(revised["messages"][1]["content"])
    assert sent["fragments"] == case["fragments"] and sent["history"] == []
    assert sent["draft_to_revise"] == case["response"] and sent["failed_checks"] == ["coverage"]
    changed = {**sent, "fragments": [{**sent["fragments"][0], "text": "Otro contenido"}]}
    data["messages"][1]["content"] = json.dumps(changed)
    with pytest.raises(AssertionError, match="Repair context changed"):
        provider.repair_request(data)

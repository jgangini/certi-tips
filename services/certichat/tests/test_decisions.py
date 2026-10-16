"""Closed choices cannot invent sources or silently replace the GPT fallback."""

import asyncio
import copy
from types import SimpleNamespace

import pytest

from app.decisions import answer_with_decisions, decision_request, parse_decisions, select_fragments, video_lookup_candidate
from app.provider import DECISION_MODEL, prepare_request
from app.security import ChatError

SITE = "https://site.test/"
FRAGMENTS = [{"id": "guide", "title": "Agentes", "url": SITE + "agents/", "text": "Guía de agentes."},
             {"id": "video", "title": "AIDP", "url": SITE + "certitube/abcdefghijk/#t-14", "text": "Demo de AIDP."}]


def result(request, route="video", resource="R2", p=1):
    answers = {}
    for name, question in request["questions"].items():
        if question["type"] == "choice":
            selected = route if name == "route" else resource
            others = (1-p)/(len(question["criteria"])-1)
            answers[name] = {"type": "choice", "choice": selected,
                             "probabilities": {k: p if k == selected else others for k in question["criteria"]}}
        else:
            answers[name] = {"type": "noul", "noul": 0 if name == "relevant_S1" else 1}
    return {"model": DECISION_MODEL, "answers": answers}


def test_batched_input_is_bounded_and_history_never_reuses_assistant_prose():
    request = decision_request("Un video", FRAGMENTS * 4, [{"question": "AIDP", "answer": "Unverified."}], SITE)
    payload, _ = prepare_request("alpha/decisions", request, "chat")
    assert len(payload["questions"]) == 10 and request["state"]["history"] == [{"question": "AIDP"}]
    assert [f["resource_type"] for f in request["state"]["fragments"]][:2] == ["text", "video"]
    assert request["questions"]["resource"]["criteria"]["none"]


@pytest.mark.parametrize("route,resource,p,expected", [
    ("video", "R2", 1, ["video"]), ("video", "R1", 1, []), ("generate", "R2", 1, []),
    ("generate", "R1", 1, []), ("video", "R2", 0.6, []), ("video", "none", 1, []),
])
def test_selection_preserves_verified_format_and_uncertainty(route, resource, p, expected):
    request = decision_request("Material", FRAGMENTS, [], SITE)
    plan = parse_decisions(result(request, route, resource, p), request)
    resources, context = select_fragments(plan, FRAGMENTS, SITE)
    assert [f["id"] for f in resources] == expected and context == FRAGMENTS[1:]
    assert FRAGMENTS[0]["id"] == "guide"


@pytest.mark.parametrize("mutation", ["model", "missing", "nan", "bool", "sum", "unknown", "distribution_type"])
def test_untrusted_decision_schema_is_rejected(mutation):
    request = decision_request("Un video", FRAGMENTS, [], SITE)
    response = result(request)
    if mutation == "model": response["model"] = "typesafe/jev-latest"
    if mutation == "missing": del response["answers"]["relevant_S1"]
    if mutation == "nan": response["answers"]["relevant_S1"]["noul"] = float("nan")
    if mutation == "bool": response["answers"]["relevant_S1"]["noul"] = True
    if mutation == "sum": response["answers"]["route"]["probabilities"]["generate"] = 0.5
    if mutation == "unknown": response["answers"]["resource"]["choice"] = "S999"
    if mutation == "distribution_type": response["answers"]["route"]["probabilities"] = list(response["answers"]["route"]["probabilities"])
    with pytest.raises((ValueError, KeyError)):
        parse_decisions(response, request)


@pytest.mark.parametrize("failure", [None, "malformed", "timeout", "budget"])
def test_direct_lookup_or_one_unchanged_gpt_fallback(failure):
    calls = []
    history = [{"question": "AIDP", "answer": "No debe circular."}]

    class Stub:
        settings = SimpleNamespace(site_url=SITE, jev_video_enabled=True)

        async def request(self, kind, data, purpose):
            calls.append(kind)
            if failure == "timeout": raise TimeoutError()
            if failure == "budget": raise ChatError("Budget")
            return {} if failure == "malformed" else result(data)

        async def answer(self, message, fragments, received_history, locale):
            calls.append("gpt")
            assert fragments == FRAGMENTS and received_history == history and locale == "es"
            return "GPT", []

    before = copy.deepcopy(FRAGMENTS)
    answer, sources = asyncio.run(answer_with_decisions(Stub(), "Un video", FRAGMENTS, history))
    assert FRAGMENTS == before
    assert calls == (["alpha/decisions", "gpt"] if failure else ["alpha/decisions"])
    assert (answer, sources) == (("GPT", []) if failure else (
        "Puedes consultar estos recursos publicados:", [{k: FRAGMENTS[1][k] for k in ("id", "title", "url")}]))


def test_empty_context_filter_keeps_baseline_evidence():
    request = decision_request("Explica", FRAGMENTS, [], SITE)
    response = result(request, route="generate", resource="none")
    response["answers"]["relevant_S2"]["noul"] = 0
    assert select_fragments(parse_decisions(response, request), FRAGMENTS, SITE)[1] == FRAGMENTS


def test_openrouter_dated_revision_is_still_pinned_to_jev_114():
    request = decision_request("Un video", FRAGMENTS, [], SITE)
    response = result(request)
    response["model"] += "-20261014"
    assert parse_decisions(response, request)["route"] == "video"
    response["model"] = "typesafe/jev-1.15-20261014"
    with pytest.raises(ValueError):
        parse_decisions(response, request)


def test_chapters_share_one_resource_option_and_cite_a_retrieved_page():
    fragments = [FRAGMENTS[1], {**FRAGMENTS[1], "id": "page", "url": FRAGMENTS[1]["url"].split("#")[0]}]
    request = decision_request("Un video", fragments, [], SITE)
    assert set(request["questions"]["resource"]["criteria"]) == {"R1", "none"}
    plan = parse_decisions(result(request, resource="R1"), request)
    assert select_fragments(plan, fragments, SITE)[0] == [fragments[1]]


@pytest.mark.parametrize("message,history,expected", [
    ("Un vídeo de AIDP", [], True), ("Show me a video", [], True),
    ("Dame el enlace", [{"question": "Un video de AIDP"}], True),
    ("Dame el enlace", [{"question": "Explica IAM"}], False),
    ("Explica IAM", [{"question": "Un video"}], False), ("Gracias", [], False),
])
def test_prefilter_only_skips_optimization_without_classifying_the_answer(message, history, expected):
    assert video_lookup_candidate(message, history) is expected


def test_general_knowledge_does_not_pay_or_wait_for_a_decision():
    class Stub:
        settings = SimpleNamespace(jev_video_enabled=True)
        async def request(self, *_):
            pytest.fail("Ordinary knowledge must not call Jev")

        async def answer(self, message, fragments, history, locale):
            assert message == "Explica IAM" and fragments == FRAGMENTS
            return "GPT", []

    assert asyncio.run(answer_with_decisions(Stub(), "Explica IAM", FRAGMENTS, [])) == ("GPT", [])


def test_ordered_historical_sources_bypass_the_question_only_video_shortcut():
    history = [{"question": "Recomienda materiales", "answer": "Primero una guía, luego un video.",
                "sources": [{key: fragment[key] for key in ("id", "title", "url")} for fragment in FRAGMENTS]}]

    class Stub:
        settings = SimpleNamespace(jev_video_enabled=True)

        async def request(self, *_):
            pytest.fail("The question-only shortcut cannot resolve ordered historical citations")

        async def answer(self, message, fragments, received_history, locale):
            assert message == "Muéstrame el segundo video" and received_history == history
            assert fragments == FRAGMENTS and locale == "es"
            return "GPT", []

    assert asyncio.run(answer_with_decisions(Stub(), "Muéstrame el segundo video", FRAGMENTS, history)) == ("GPT", [])


def test_video_path_asks_only_the_two_decisions_it_uses():
    request = decision_request("Un video", FRAGMENTS, [], SITE, context_checks=False)
    assert set(request["questions"]) == {"route", "resource"}
    plan = parse_decisions(result(request), request)
    resources, context = select_fragments(plan, FRAGMENTS, SITE)
    assert resources == [FRAGMENTS[1]] and context == FRAGMENTS


@pytest.mark.parametrize("enabled,locale", [(False, "es"), (True, "en"), (True, "pt"), (True, "it")])
def test_disabled_or_unevaluated_language_keeps_gpt(enabled, locale):
    class Stub:
        settings = SimpleNamespace(jev_video_enabled=enabled)

        async def request(self, *_):
            pytest.fail("Disabled or unevaluated route must not call Jev")

        async def answer(self, message, fragments, history, received_locale):
            assert received_locale == locale and fragments == FRAGMENTS
            return "GPT", []

    assert asyncio.run(answer_with_decisions(Stub(), "Un video", FRAGMENTS, [], locale)) == ("GPT", [])

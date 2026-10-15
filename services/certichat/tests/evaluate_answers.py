"""Opt-in live evaluation; uses synthetic questions and the persisted spending guard.

Run in the API environment with --live --output /tmp/evaluation.json. This is not
a unit test: retrieval and generation can incur charges. No automatic retries.
Automated checks establish support/provenance and named scenario coverage; full
semantic answer correctness still needs review of the saved responses.
"""

import argparse
import asyncio
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import json
from pathlib import Path
import re
import time
from types import SimpleNamespace
from uuid import uuid4

import httpx

from app.corpus import (CORPUS_URL, MANIFEST_URL, download, public_url, segments,
                        validate_corpus, validate_manifest)
from app.main import ChatBody, retrieve
from app.provider import Provider, REFUSAL
from app.security import ChatError
from app.settings import Settings
from app.store import Store


CASES = [
    ("conversation_then_study", [("hola", "conversation"), ("¿Qué es DAMA?", True),
                                 ("gracias", "conversation"), ("¿Dónde profundizo en ese tema?", True)]),
    ("greeting_with_question", [("Hola, ¿qué es DAMA?", True)]),
    ("thanks_without_support", [("Gracias, ahora dame una receta de pastel de chocolate", False)]),
    ("simple_dama", [("¿Qué es DAMA?", True)]),
    ("simple_oci", [("¿Qué es OCI?", True)]),
    ("compound_reported", [("De qué trata dama y OCI", True)]),
    ("compound_alternate", [("Qué sabes de OCI y dama", True)]),
    ("compound_relation", [("¿Qué relación hay entre DAMA y Oracle Cloud Infrastructure?", True)]),
    ("simple_region", [("¿Qué es una región de OCI?", True)]),
    ("compound_availability", [("¿Qué diferencia hay entre una región, un dominio de disponibilidad y un dominio de fallo?", True)]),
    ("compound_roles", [("¿Qué hacen el data owner y el data steward y en qué se diferencian?", True)]),
    ("compound_ai", [("¿En qué se diferencian un modelo de lenguaje y un agente de IA?", True)]),
    ("simple_courses", [("¿Qué cursos incluye Foundation?", True)]),
    ("unsupported_weather", [("¿Qué tiempo hará mañana en Lima?", False)]),
    ("unsupported_recipe", [("Dame una receta de pastel de chocolate", False)]),
    ("followup_references", [("que sabes de dama y oci", True),
                             ("en donde puedo investigar mas sobre este tema o relacion", True)]),
    ("topic_switch", [("¿Qué es DAMA?", True), ("¿Qué es una región de OCI?", True)]),
    ("topic_switch_certifications", [("que sabes de dama y oci", True),
                                     ("donde buscar mas informacion", True),
                                     ("dame en enlace", True),
                                     ("me referia al enlace en estas guias", True),
                                     ("cuales son las certificaciones de oci que tienes", True)]),
    ("partial_support", [("¿Qué es DAMA y qué tiempo hará mañana en Lima?", True)]),
    ("repeated_variants", [("De qué trata dama y OCI", True),
                            ("¿De qué tratan OCI y DAMA?", True),
                            ("De qué trata dama y OCI", True)]),
]


class ObservedProvider(Provider):
    async def request(self, kind, data, purpose):
        self.input = data
        self.output = await super().request(kind, data, purpose)
        return self.output


def fragment_summary(fragment):
    return {**{key: fragment[key] for key in ("id", "title")},
            "chars": len(fragment["text"]), "bytes": len(fragment["text"].encode("utf-8"))}


def response_observation(provider):
    sent = json.loads(provider.input["messages"][1]["content"]) if provider.input else {}
    output = provider.output or {}
    try:
        cost = Decimal(str(output.get("usage", {}).get("cost")))
        cost = str(cost) if cost.is_finite() and cost >= 0 else None
    except (InvalidOperation, TypeError, AttributeError):
        cost = None
    return {"selected": [fragment_summary(fragment) for fragment in sent.get("fragments", [])],
            "selected_history_turns": len(sent.get("history", [])),
            "answer_reported_cost_usd": cost,
            "raw_model": {key: output[key] for key in ("model", "choices", "usage") if key in output}}


def sources_are_published(sources, fragments, published):
    retrieved = {fragment["id"] for fragment in fragments}
    return all(public_url(source["url"]) and source["id"] in retrieved and source["id"] in published
               and all(source[key] == published[source["id"]][key] for key in ("title", "url"))
               for source in sources)


def citation_ids_are_hidden(answer, selected):
    return not selected or not re.search(r"\b(?:" + "|".join(re.escape(item["id"]) for item in selected) + r")\b", answer)


async def evaluate_turn(application, provider, question, expected, history, published, content_version):
    provider.input, provider.output = None, None
    start = time.monotonic()
    result = {"question": question, "expected_supported": expected is True,
              "expected_conversation": expected == "conversation", "input_history_turns": len(history)}
    try:
        body = ChatBody(requestId=str(uuid4()), message=question, pageUrl=application.state.settings.site_url + "certichat/")
        version, fragments, trace = await retrieve(application, body, history)
        current_history = [{"question": row["question"], "answer": row["answer"]}
                           for row in history if row["version"] == version]
        answer, sources = await provider.answer(question, fragments, current_history)
        provenance = version == content_version and sources_are_published(sources, fragments, published)
        reply_matches = (bool(sources) if expected is True else
                         not sources and bool(answer.strip()) and (answer != REFUSAL if expected == "conversation" else answer == REFUSAL))
        result.update(answer=answer, supported=bool(sources), sources=sources, graph_trace=trace,
                      fragments=[fragment_summary(fragment) for fragment in fragments],
                      provenance_valid=provenance, passed=reply_matches and provenance)
        history = [*history, {"question": question, "answer": answer, "version": version}][-4:]
    except Exception as error:
        # Never serialize arbitrary exception text: it may contain deployment details.
        result.update(error=type(error).__name__, status=None, detail="Evaluation step failed.", passed=False)
        if isinstance(error, ChatError):
            result.update(error=error.code or ("provider" if "proveedor" in str(error) else "service"),
                          status=error.status, detail=str(error))
    result.update(response_observation(provider), seconds=round(time.monotonic() - start, 2))
    result["citation_ids_hidden"] = citation_ids_are_hidden(result.get("answer", ""), result["selected"])
    result["passed"] = result["passed"] and result["citation_ids_hidden"]
    return result, history


def certification_coverage(answer, navigation):
    checks = {name: bool(re.search(pattern, answer, re.IGNORECASE)) for name, pattern in {
        "foundations": r"(?:OCI|Oracle Cloud Infrastructure)\s+Foundations",
        "ai_foundations": r"(?:OCI|Oracle Cloud Infrastructure)\s+AI Foundations",
        "agentic_foundations": r"(?:Oracle\s+|OCI\s+)?Agentic AI Foundations",
    }.items()}
    upcoming = [line.split(":", 1)[0] for line in navigation.splitlines() if "guía próximamente" in line]
    checks["upcoming_guides_labeled"] = (not any(title.casefold() in answer.casefold() for title in upcoming)
                                        or bool(re.search(r"próximamente|pendiente|aún no|todavía no", answer, re.IGNORECASE)))
    # Scenario assertion: an OCI certification list must not include the catalog's Governance offering.
    governance = next((group for group in navigation.split("\n\n") if group.startswith("Governance\n")), "")
    outside_scope = [line.split(":", 1)[0] for line in governance.splitlines()[2:] if ":" in line]
    checks["only_requested_category"] = bool(outside_scope) and not any(
        title.casefold() in answer.casefold() for title in outside_scope)
    return checks


def reference_attribution(answer, sources, published):
    # Explicit regression fixture for this scenario, not a general semantic entailment claim.
    describes_matrix = all(re.search(r"\b" + term + r"\b", answer, re.IGNORECASE)
                           for term in ("matriz", "DAMA", "Oracle"))
    expected_documents = {"data-governance/oracle-map", "data-governance/oracle-map#matriz-de-decisiones-y-evidencia"}
    return {"matrix_claim_uses_matrix_source": not describes_matrix or any(
        published.get(source["id"], {}).get("id") in expected_documents for source in sources)}


def followup_reference_coverage(answer, sources, published):
    # This scenario keeps DAMA and OCI as its subject until turn 5; other relevant sources remain allowed.
    denies_links = re.search(
        r"\bno\s+(?:puedo|podemos|aparece[n]?|proporciona[n]?|se\s+(?:puede|proporciona[n]?|muestra[n]?))\b"
        r"[^.!?\n]{0,100}\b(?:enlaces?|urls?)\b", answer, re.IGNORECASE)
    return {"followup_keeps_dama_source": any(
        published.get(source["id"], {}).get("courseId") == "data-governance" for source in sources),
            "does_not_deny_reference_links": not denies_links}


async def evaluate(output_path, case=None):
    settings = Settings.from_env()
    settings.validate()
    manifest = validate_manifest(json.loads(await download(MANIFEST_URL, 2_000_000)))
    documents = validate_corpus(await download(CORPUS_URL, 16_000_000), manifest)
    navigation = "\n".join(doc["text"] for doc in documents if doc["id"] == "home")
    published = {name.removesuffix(".txt"): source for name, source in segments(documents).items()}
    report = {"started_at": datetime.now(timezone.utc).isoformat(), "corpus_version": manifest["contentHash"],
              "cost_scope": "Reported answer generation only; retrieval embeddings also use the persisted budget but are not included here.",
              "semantic_review": "Pending human inspection of answers, especially topic coverage, topic switches and partial support.",
              "results": []}
    store = Store(settings.database_url, settings.refresh_hours, settings.questions,
                  index_budget_usd=settings.index_budget_usd, chat_budget_usd=settings.chat_budget_usd)
    store.open()
    try:
        failures = []

        async def observe_failure(response):
            if response.status_code >= 400:
                failures.append({"host": response.request.url.host, "status": response.status_code})

        async with httpx.AsyncClient(trust_env=False, event_hooks={"response": [observe_failure]}) as client:
            provider = ObservedProvider(settings, store, client, client)
            application = SimpleNamespace(state=SimpleNamespace(settings=settings, client=client))
            for name, turns in CASES:
                if case and name != case:
                    continue
                history = []
                for turn_index, (question, expected) in enumerate(turns):
                    # Repeated variants are independent fresh conversations, not automatic retries.
                    if name == "repeated_variants":
                        history = []
                    failures.clear()
                    result, history = await evaluate_turn(application, provider, question, expected,
                                                          history, published, manifest["contentHash"])
                    result.update(case=name, turn=turn_index + 1, http_failures=list(failures))
                    if name == "topic_switch_certifications" and turn_index == len(turns) - 1:
                        result["required_topic_coverage"] = certification_coverage(result.get("answer", ""), navigation)
                        result["passed"] = result["passed"] and all(result["required_topic_coverage"].values())
                    elif name == "topic_switch_certifications":
                        result["required_source_attribution"] = reference_attribution(
                            result.get("answer", ""), result.get("sources", []), published)
                        if 1 <= turn_index <= 3:
                            result["required_source_attribution"].update(followup_reference_coverage(
                                result.get("answer", ""), result.get("sources", []), published))
                        result["passed"] = result["passed"] and all(result["required_source_attribution"].values())
                    report["results"].append(result)
                    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
                    print(json.dumps({key: result[key] for key in ("case", "turn", "passed", "seconds", "error")
                                      if key in result}, ensure_ascii=False), flush=True)
    finally:
        store.close()
    return all(result["passed"] for result in report["results"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", required=True, help="Authorize paid calls for these synthetic evaluation cases.")
    parser.add_argument("--output", type=Path, required=True, help="Private JSON report destination, for example /tmp/evaluation.json.")
    parser.add_argument("--case", choices=[name for name, _ in CASES], help="Run just this scenario to bound paid diagnostic calls.")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    raise SystemExit(0 if asyncio.run(evaluate(args.output, args.case)) else 1)

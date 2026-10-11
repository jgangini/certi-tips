"""Opt-in live evaluation; uses synthetic questions and the persisted spending guard.

Run in the API environment with --live --output /tmp/evaluation.json. This is not
a unit test: retrieval and generation can incur charges. No automatic retries.
Automated checks establish support/provenance, not semantic answer correctness.
"""

import argparse
import asyncio
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import json
from pathlib import Path
import time
from types import SimpleNamespace
from uuid import uuid4

import httpx

from app.corpus import (CORPUS_URL, MANIFEST_URL, download, public_url, segments,
                        validate_corpus, validate_manifest)
from app.main import ChatBody, retrieve
from app.provider import Provider
from app.security import ChatError
from app.settings import Settings
from app.store import Store


CASES = [
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


async def evaluate_turn(application, provider, question, expected, history, published, content_version):
    provider.input, provider.output = None, None
    start = time.monotonic()
    result = {"question": question, "expected_supported": expected, "input_history_turns": len(history)}
    try:
        body = ChatBody(requestId=str(uuid4()), message=question, pageUrl=application.state.settings.site_url)
        version, fragments, trace = await retrieve(application, body, history)
        current_history = [{"question": row["question"], "answer": row["answer"]}
                           for row in history if row["version"] == version]
        answer, sources = await provider.answer(question, fragments, current_history)
        provenance = version == content_version and sources_are_published(sources, fragments, published)
        result.update(answer=answer, supported=bool(sources), sources=sources, graph_trace=trace,
                      fragments=[fragment_summary(fragment) for fragment in fragments],
                      provenance_valid=provenance, passed=bool(sources) == expected and provenance)
        history = [*history, {"question": question, "answer": answer, "version": version}][-4:]
    except Exception as error:
        # Never serialize arbitrary exception text: it may contain deployment details.
        result.update(error=type(error).__name__, status=None, detail="Evaluation step failed.", passed=False)
        if isinstance(error, ChatError):
            result.update(error=error.code or ("provider" if "proveedor" in str(error) else "service"),
                          status=error.status, detail=str(error))
    result.update(response_observation(provider), seconds=round(time.monotonic() - start, 2))
    return result, history


async def evaluate(output_path):
    settings = Settings.from_env()
    settings.validate()
    manifest = validate_manifest(json.loads(await download(MANIFEST_URL, 2_000_000)))
    documents = validate_corpus(await download(CORPUS_URL, 16_000_000), manifest)
    published = {name.removesuffix(".txt"): source for name, source in segments(documents).items()}
    report = {"started_at": datetime.now(timezone.utc).isoformat(), "corpus_version": manifest["contentHash"],
              "cost_scope": "Reported answer generation only; retrieval embeddings also use the persisted budget but are not included here.",
              "semantic_review": "Pending human inspection of answers, especially topic coverage, topic switches and partial support.",
              "results": []}
    store = Store(settings.database_url, settings.refresh_hours, settings.questions)
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
                history = []
                for turn_index, (question, expected) in enumerate(turns):
                    # Repeated variants are independent fresh conversations, not automatic retries.
                    if name == "repeated_variants":
                        history = []
                    failures.clear()
                    result, history = await evaluate_turn(application, provider, question, expected,
                                                          history, published, manifest["contentHash"])
                    result.update(case=name, turn=turn_index + 1, http_failures=list(failures))
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
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    raise SystemExit(0 if asyncio.run(evaluate(args.output)) else 1)

"""Run in the knowledge image with --network none --add-host api:127.0.0.1.

Uses a local OpenAI-compatible stub; never calls a paid provider.
"""
import asyncio
import base64
import json
import os
import struct
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from app.corpus import DATASET, SITE, digest, segments, supported_fragments
from app.knowledge import close_cognee, configure_cognee, retrieve_evidence
from app.provider import prepare_request

REQUESTS = []


def structured(schema, root):
    if "$ref" in schema:
        return structured(root["$defs"][schema["$ref"].split("/")[-1]], root)
    if "enum" in schema:
        return schema["enum"][0]
    if "anyOf" in schema:
        return structured(next(v for v in schema["anyOf"] if v.get("type") != "null"), root)
    if "nodes" in schema.get("properties", {}):
        return {"nodes": [{"id": "CertiTips", "name": "CertiTips", "type": "Site", "description": "CertiTips publica guías."},
                          {"id": "guías", "name": "guías", "type": "Material", "description": "Guías de estudio."}],
                "edges": [{"source_node_id": "CertiTips", "target_node_id": "guías",
                           "relationship_name": "publica", "description": "CertiTips publica guías."}]}
    kind = schema.get("type")
    if kind == "object":
        return {key: structured(value, root) for key, value in schema.get("properties", {}).items()}
    if kind == "array":
        return [structured(schema["items"], root)]
    if kind in ("number", "integer"):
        return 1
    if kind == "boolean":
        return True
    return "CertiTips publica guías de estudio."


class Stub(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        assert self.headers["Authorization"] == "Bearer " + "i" * 64
        prepare_request(self.path.removeprefix("/internal/llm/v1/"), payload, "index")
        REQUESTS.append(self.path)
        if self.path.endswith("/embeddings"):
            texts = payload["input"]
            if isinstance(texts, str):
                texts = [texts]
            vector = [0.1] * 1536
            if payload.get("encoding_format") == "base64":
                vector = base64.b64encode(struct.pack("<1536f", *vector)).decode()
            result = {"object": "list", "data": [{"object": "embedding", "index": i, "embedding": vector}
                                                   for i, _ in enumerate(texts)],
                      "model": payload["model"], "usage": {"prompt_tokens": 10, "total_tokens": 10}}
        else:
            response_format = payload.get("response_format", {})
            schema = response_format.get("json_schema", {}).get("schema")
            if schema is None:
                # The custom model uses LiteLLM's prompted JSON fallback.
                text = "\n".join(str(item.get("content", "")) for item in payload["messages"])
                for start, character in enumerate(text):
                    if character != "{":
                        continue
                    try:
                        candidate, _ = json.JSONDecoder().raw_decode(text[start:])
                    except json.JSONDecodeError:
                        continue
                    if isinstance(candidate, dict) and "properties" in candidate:
                        schema = candidate
                        break
                if schema is None:
                    raise AssertionError("Structured-output schema was not supplied: " + text[:1000])
            content = json.dumps(structured(schema, schema))
            result = {"id": "stub", "object": "chat.completion", "created": 1, "model": payload["model"],
                      "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
                      "usage": {"prompt_tokens": 10, "completion_tokens": 10, "total_tokens": 20}}
        raw = json.dumps(result).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


async def check(root):
    configure_cognee(root, "i" * 64)
    import cognee
    doc = {"id": "guide", "title": "CertiTips", "courseId": "course", "url": SITE + "guide/",
           "text": "CertiTips publica guías de estudio para preparar certificaciones."}
    docs = [{**doc, "id": f"guide-{i}", "text": doc["text"] + f" Lección {i}."} for i in range(4)]
    source_map = segments(docs)
    (root / "sources").mkdir(parents=True)
    try:
        for filename, source in source_map.items():
            path = root / "sources" / filename
            path.write_text(source["text"], encoding="utf-8")
            await cognee.add(str(path), dataset_name=DATASET, data_per_batch=1, skip_connection_test=True)
        await cognee.cognify(datasets=[DATASET], data_per_batch=4, chunk_size=1000,
                             chunks_per_batch=1, extractor="llm", raise_on_error=True)
        evidence = await retrieve_evidence("¿Qué publica CertiTips?")
        latest = {"documents": [{**item, "hash": digest(item["text"])} for item in docs]}
        fragments = supported_fragments(evidence, source_map, latest)
        assert fragments and all(item["text"] in {doc["text"] for doc in docs} for item in fragments), evidence
        from cognee.infrastructure.databases.relational import get_relational_engine
        from sqlalchemy import text
        async with get_relational_engine().get_async_session() as session:
            statuses = (await session.execute(text("SELECT pipeline_status FROM data"))).scalars().all()
        assert len(statuses) == 4 and all("DATA_ITEM_PROCESSING_COMPLETED" in status for status in statuses), statuses
        for item in latest["documents"]:
            item["hash"] = "0" * 64
        assert not supported_fragments(evidence, source_map, latest)
        assert any(path.endswith("/embeddings") for path in REQUESTS)
        assert any(path.endswith("/chat/completions") for path in REQUESTS)
        print(f"Cognee 1.6.1 four concurrent documents, graph provenance, stale filtering passed; {len(REQUESTS)} local stub calls.")
    finally:
        await close_cognee()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", 8000), Stub)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with tempfile.TemporaryDirectory() as directory:
            asyncio.run(check(Path(directory)))
    finally:
        server.shutdown()

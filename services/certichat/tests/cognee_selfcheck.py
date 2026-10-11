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
from app.security import ChatError

REQUESTS = []
REJECTIONS = []


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
        REQUESTS.append(self.path)
        try:
            prepare_request(self.path.removeprefix("/internal/llm/v1/"), payload, "index")
        except ChatError as error:
            values = payload["input"]
            REJECTIONS.append((len(values), max(len(value.encode("utf-8")) for value in values)))
            self.reply(error.status, {"detail": str(error)})
            return
        if self.path.endswith("/embeddings"):
            texts = payload["input"]
            if isinstance(texts, str):
                texts = [texts]
            vectors = []
            for text in texts:
                vector = [len(text.encode("utf-8")) / 10000] * 1536
                if payload.get("encoding_format") == "base64":
                    vector = base64.b64encode(struct.pack("<1536f", *vector)).decode()
                vectors.append(vector)
            result = {"object": "list", "data": [{"object": "embedding", "index": i, "embedding": vector}
                                                   for i, vector in enumerate(vectors)],
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
        self.reply(200, result)

    def reply(self, status, result):
        raw = json.dumps(result).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


async def check(root):
    configure_cognee(root, "i" * 64)
    import cognee
    doc = {"id": "guide", "title": "CertiTips", "courseId": "course", "url": SITE + "guide/",
           "text": "CertiTips publica guías de estudio para preparar certificaciones."}
    docs = [{**doc, "id": f"guide-{i}", "text": doc["text"] + f" Lección {i}."} for i in range(16)]
    source_map = segments(docs)
    (root / "sources").mkdir(parents=True)
    try:
        for filename, source in source_map.items():
            path = root / "sources" / filename
            path.write_text(source["text"], encoding="utf-8")
            await cognee.add(str(path), dataset_name=DATASET, data_per_batch=1, skip_connection_test=True)
        await cognee.cognify(datasets=[DATASET], data_per_batch=16, chunk_size=1000,
                             chunks_per_batch=1, extractor="llm", raise_on_error=True)
        from cognee.context_global_variables import set_database_global_context_variables
        from cognee.modules.users.methods import get_default_user
        from cognee.modules.data.methods import get_authorized_existing_datasets
        from cognee.infrastructure.databases.graph import get_graph_engine
        from cognee.infrastructure.databases.vector import get_vector_engine_async
        from cognee.infrastructure.databases.utils.closing_lru_cache import evict_and_close_idle_all
        user = await get_default_user()
        datasets = await get_authorized_existing_datasets([DATASET], "read", user, strict=True)
        before_warmup = len(REQUESTS)
        async with set_database_global_context_variables(datasets[0].id, user.id):
            graph = await get_graph_engine()
            vector = await get_vector_engine_async()
            assert not await graph.is_empty()
            assert await vector.has_collection("Entity_name")
            # Force every idle engine eligible now; a live dataset pin must protect both.
            assert evict_and_close_idle_all(0) == 0
            assert not await graph.is_empty() and await vector.has_collection("Entity_name")
            assert len(REQUESTS) == before_warmup, "Metadata warmup called the provider"
        assert evict_and_close_idle_all(0) >= 2, "Released subprocesses remained pinned"
        await close_cognee()
        evidence = await retrieve_evidence("¿Qué publica CertiTips?")
        latest = {"documents": [{**item, "hash": digest(item["text"])} for item in docs]}
        fragments = supported_fragments(evidence, source_map, latest)
        assert fragments and all(item["text"] in {doc["text"] for doc in docs} for item in fragments), evidence
        from cognee.infrastructure.databases.relational import get_relational_engine
        from sqlalchemy import text
        async with get_relational_engine().get_async_session() as session:
            statuses = (await session.execute(text("SELECT pipeline_status FROM data"))).scalars().all()
        assert len(statuses) == 16 and all("DATA_ITEM_PROCESSING_COMPLETED" in
            (json.loads(status).get("cognify_pipeline") or {}).values() for status in statuses), statuses
        for item in latest["documents"]:
            item["hash"] = "0" * 64
        assert not supported_fragments(evidence, source_map, latest)
        assert any(path.endswith("/embeddings") for path in REQUESTS)
        assert any(path.endswith("/chat/completions") for path in REQUESTS)
        from cognee.infrastructure.databases.vector.embeddings.LiteLLMEmbeddingEngine import LiteLLMEmbeddingEngine
        engine = LiteLLMEmbeddingEngine(model="openai/text-embedding-3-small", dimensions=1536,
            api_key="i" * 64, endpoint="http://api:8000/internal/llm/v1", batch_size=8)
        single = await engine.embed_text(["á" * 3001])
        assert len(single) == 1 and len(single[0]) == 1536
        # Native overlap splitting yields 4000-byte and 4002-byte pieces, then averages vectors.
        assert all(abs(value - 0.4001) < 0.000001 for value in single[0]), single[0][:2]
        batch = await engine.embed_text(["b" * 4500] * 8)
        assert len(batch) == 8 and all(len(vector) == 1536 for vector in batch)
        assert all(abs(value - 0.45) < 0.000001 for vector in batch for value in vector)
        assert (1, 6002) in REJECTIONS and (8, 4500) in REJECTIONS, REJECTIONS
        print(f"Cognee 1.6.1 idle pin/release, sixteen concurrent documents, provenance, stale filtering and native oversized-embedding split/pool passed; {len(REQUESTS)} local stub calls.")
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

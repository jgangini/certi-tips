"""A public projection of the private Cognee graph, without source bodies or metadata."""

import re
from datetime import datetime, timezone
from uuid import UUID

from .corpus import public_url

TRACE_NODES = 512
TRACE_EDGES = 1024
TRACE_SOURCES = 512


def label(value):
    if (not isinstance(value, str) or not value.strip() or len(value) > 160
            or any(ord(character) < 32 for character in value)
            or re.search(r"[<>\\]|https?://|(?:Bearer|sk-|sk_)[\w-]{8,}|[A-Za-z]:[/\\]", value, re.I)):
        return None
    return value.strip()


def public_graph(nodes, edges, version):
    selected = {}
    for node_id, props in nodes:
        try:
            UUID(str(node_id))
        except (ValueError, TypeError):
            continue
        if not isinstance(props, dict) or props.get("type") not in ("Entity", "EntityType"):
            continue
        name = label(props.get("name"))
        if name:
            selected[str(node_id)] = {"id": str(node_id), "label": name, "type": props["type"]}
    relationships = set()
    for source, target, name, _props in edges:
        name = label(name)
        if name and str(source) in selected and str(target) in selected:
            relationships.add((str(source), str(target), name))
    return {"version": version, "generatedAt": datetime.now(timezone.utc).isoformat(),
            "nodes": sorted(selected.values(), key=lambda node: node["id"]),
            "edges": [{"source": source, "target": target, "label": name}
                      for source, target, name in sorted(relationships)]}


def sanitize_graph(value):
    if (not isinstance(value, dict) or not isinstance(value.get("version"), str)
            or not re.fullmatch(r"[a-f0-9]{64}", value["version"])
            or not isinstance(value.get("nodes"), list) or len(value["nodes"]) > 50000
            or not isinstance(value.get("edges"), list) or len(value["edges"]) > 150000):
        raise ValueError("Invalid public graph")
    stamp = datetime.fromisoformat(value["generatedAt"])
    if stamp.tzinfo is None:
        raise ValueError("Invalid graph timestamp")
    result = public_graph([(node["id"], {"type": node["type"], "name": node["label"]}) for node in value["nodes"]],
                          [(edge["source"], edge["target"], edge["label"], {}) for edge in value["edges"]], value["version"])
    result["generatedAt"] = stamp.astimezone(timezone.utc).isoformat()
    return result


def source_title(value):
    return (isinstance(value, str) and 1 <= len(value) <= 200 and value == value.strip()
            and not any(ord(character) < 32 for character in value))


def node_documents(nodes, edges):
    # Private provenance only: Cognee's native contains edge points from a chunk to its entity.
    chunks = {str(node): props["document_name"] for node, props in nodes
              if isinstance(props, dict) and props.get("type") == "DocumentChunk"
              and isinstance(props.get("document_name"), str)}
    documents = {}
    for source, target, relation, _props in edges:
        if relation == "contains" and str(source) in chunks:
            documents.setdefault(str(target), set()).add(chunks[str(source)])
    return documents


def current_evidence(evidence, fragments, documents):
    """Keep native provenance only for fragments accepted against the latest manifest."""
    current = {fragment["id"] for fragment in fragments}
    segments = [item for item in evidence if item.get("kind") == "segment"
                and isinstance(item.get("document_name"), str)
                and item["document_name"].removesuffix(".txt") in current]
    assertions = {item["assertion_id"] for item in segments
                  if item.get("role") == "supports_assertion" and isinstance(item.get("assertion_id"), str)}
    retrieved = {item["document_name"].removesuffix(".txt") for item in segments}
    supported = {node for node, names in documents.items()
                 if any(name.removesuffix(".txt") in current for name in names)}
    # A RAG-only lane still has real chunk -> contains -> entity provenance.
    nodes = {node for node in supported
             if any(name.removesuffix(".txt") in retrieved for name in documents[node])}
    nodes.update(item["artifact_id"] for item in evidence
                 if item.get("kind") == "graph_node" and item.get("artifact_id") in supported)
    return (segments + [{"kind": "graph_node", "artifact_id": node} for node in sorted(nodes)]
            + [item for item in evidence if item.get("kind") == "graph_edge"
               and item.get("artifact_id") in assertions])


def trace_sources(evidence, assertions, selected_edges, fragments, documents):
    # Cognee's segment assertion_id names the exact recovered edge; labels are not provenance.
    current = {fragment["id"]: fragment for fragment in fragments}
    retained_edges = set(selected_edges)
    links = {(node, name) for node, names in documents.items() for name in names}
    for reference in evidence:
        name, assertion = reference.get("document_name"), reference.get("assertion_id")
        if (reference.get("kind") != "segment" or reference.get("role") != "supports_assertion"
                or not isinstance(name, str) or not isinstance(assertion, str)):
            continue
        edge = assertions.get(assertion)
        if edge in retained_edges:
            links.update((node, name) for node in edge[:2])
    sources = {}
    for node, name in links:
        fragment = current.get(name.removesuffix(".txt"))
        if (not fragment or not isinstance(fragment.get("title"), str)
                or not public_url(fragment.get("url")) or len(fragment["url"]) > 1024):
            continue
        title = fragment["title"][:200].strip()
        if source_title(title):
            sources[(node, fragment["url"])] = title
    return [{"nodeId": node, "title": sources[(node, url)], "url": url} for node, url in sorted(sources)]


def graph_trace(evidence, graph, fragments=(), documents=None):
    public_nodes = {node["id"] for node in graph["nodes"]}
    public_edges = {(edge["source"], edge["target"], edge["label"]) for edge in graph["edges"]}
    nodes, edges, assertions = set(), set(), {}
    for reference in evidence:
        if reference.get("kind") == "graph_node" and reference.get("artifact_id") in public_nodes:
            nodes.add(reference["artifact_id"])
        elif reference.get("kind") == "graph_edge":
            edge = (reference.get("source_node_id"), reference.get("target_node_id"), reference.get("relationship_name"))
            if edge in public_edges:
                edges.add(edge)
                nodes.update(edge[:2])
                if isinstance(reference.get("artifact_id"), str):
                    assertions[reference["artifact_id"]] = edge
    selected_nodes = sorted(nodes)[:TRACE_NODES]
    selected = set(selected_nodes)
    selected_edges = sorted(edge for edge in edges if edge[0] in selected and edge[1] in selected)[:TRACE_EDGES]
    selected_documents = {node: documents.get(node, ()) for node in selected_nodes} if documents else {}
    sources = trace_sources(evidence, assertions, selected_edges, fragments, selected_documents)
    selected_sources = sources[:TRACE_SOURCES]
    return {"version": graph["version"], "nodes": selected_nodes,
            "edges": [{"source": source, "target": target, "label": name} for source, target, name in selected_edges],
            "truncated": (len(nodes) > len(selected_nodes) or len(edges) > len(selected_edges)
                          or len(sources) > len(selected_sources)),
            **({"sources": selected_sources} if selected_sources else {})}


def validate_sources(sources, nodes):
    if not isinstance(sources, list) or len(sources) > TRACE_SOURCES:
        raise ValueError("Invalid graph trace sources")
    seen = set()
    for source in sources:
        if (not isinstance(source, dict) or set(source) != {"nodeId", "title", "url"}
                or not isinstance(source["nodeId"], str) or source["nodeId"] not in nodes
                or not source_title(source["title"]) or not public_url(source["url"])
                or len(source["url"]) > 1024):
            raise ValueError("Invalid graph trace source")
        key = (source["nodeId"], source["url"])
        if key in seen:
            raise ValueError("Duplicate graph trace source")
        seen.add(key)


def validate_trace(trace):
    if (not isinstance(trace, dict) or set(trace) - {"sources"} != {"version", "nodes", "edges", "truncated"}
            or not isinstance(trace["version"], str) or not re.fullmatch(r"[a-f0-9]{64}", trace["version"])
            or not isinstance(trace["truncated"], bool)
            or not isinstance(trace["nodes"], list) or len(trace["nodes"]) > TRACE_NODES
            or not isinstance(trace["edges"], list) or len(trace["edges"]) > TRACE_EDGES):
        raise ValueError("Invalid graph trace")
    nodes = set()
    for node in trace["nodes"]:
        if not isinstance(node, str) or str(UUID(node)) != node or node in nodes:
            raise ValueError("Invalid graph trace node")
        nodes.add(node)
    edges = set()
    for edge in trace["edges"]:
        if (not isinstance(edge, dict) or set(edge) != {"source", "target", "label"}
                or not isinstance(edge["source"], str) or edge["source"] not in nodes
                or not isinstance(edge["target"], str) or edge["target"] not in nodes
                or not isinstance(edge["label"], str)
                or label(edge["label"]) != edge["label"]):
            raise ValueError("Invalid graph trace edge")
        key = (edge["source"], edge["target"], edge["label"])
        if key in edges:
            raise ValueError("Duplicate graph trace edge")
        edges.add(key)
    validate_sources(trace.get("sources", []), nodes)
    return trace


async def read_graph():
    from cognee.context_global_variables import set_database_global_context_variables
    from cognee.modules.users.methods import get_default_user
    from cognee.modules.data.methods import get_authorized_existing_datasets
    from cognee.infrastructure.databases.graph import get_graph_engine
    from .corpus import DATASET
    user = await get_default_user()
    datasets = await get_authorized_existing_datasets([DATASET], "read", user, strict=True)
    async with set_database_global_context_variables(datasets[0].id, user.id):
        return await (await get_graph_engine()).get_graph_data()

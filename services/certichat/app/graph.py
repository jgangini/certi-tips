"""A public projection of the private Cognee graph, without source bodies or metadata."""

import re
from datetime import datetime, timezone
from uuid import UUID

TRACE_NODES = 512
TRACE_EDGES = 1024


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


def graph_trace(evidence, graph):
    public_nodes = {node["id"] for node in graph["nodes"]}
    public_edges = {(edge["source"], edge["target"], edge["label"]) for edge in graph["edges"]}
    nodes, edges = set(), set()
    for reference in evidence:
        if reference.get("kind") == "graph_node" and reference.get("artifact_id") in public_nodes:
            nodes.add(reference["artifact_id"])
        elif reference.get("kind") == "graph_edge":
            edge = (reference.get("source_node_id"), reference.get("target_node_id"), reference.get("relationship_name"))
            if edge in public_edges:
                edges.add(edge)
                nodes.update(edge[:2])
    selected_nodes = sorted(nodes)[:TRACE_NODES]
    selected = set(selected_nodes)
    selected_edges = sorted(edge for edge in edges if edge[0] in selected and edge[1] in selected)[:TRACE_EDGES]
    return {"version": graph["version"], "nodes": selected_nodes,
            "edges": [{"source": source, "target": target, "label": name} for source, target, name in selected_edges],
            "truncated": len(nodes) > len(selected_nodes) or len(edges) > len(selected_edges)}


def validate_trace(trace):
    if (not isinstance(trace, dict) or set(trace) != {"version", "nodes", "edges", "truncated"}
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

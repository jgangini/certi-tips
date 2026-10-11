"""A public projection of the private Cognee graph, without source bodies or metadata."""

import re
from datetime import datetime, timezone
from uuid import UUID


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

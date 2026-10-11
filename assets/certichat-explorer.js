const terms = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function indexGraph(data) {
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw new Error("Invalid knowledge graph");
  const byId = new Map(), neighbors = new Map(), edges = [];
  for (const node of data.nodes) {
    if (typeof node?.id !== "string" || !node.id || typeof node.label !== "string" || !node.label.trim() || byId.has(node.id)) continue;
    byId.set(node.id, { id: node.id, label: node.label, type: typeof node.type === "string" ? node.type : "Concepto", terms: terms(node.label) });
    neighbors.set(node.id, new Map());
  }
  for (const edge of data.edges) {
    if (!byId.has(edge?.source) || !byId.has(edge?.target) || typeof edge.label !== "string") continue;
    edges.push({ source: edge.source, target: edge.target, label: edge.label });
    for (const [from, to] of edge.source === edge.target ? [[edge.source, edge.target]] : [[edge.source, edge.target], [edge.target, edge.source]]) {
      const links = neighbors.get(from);
      if (!links.has(to)) links.set(to, []);
      links.get(to).push(edges.at(-1));
    }
  }
  return { byId, neighbors, edges, nodes: [...byId.values()].sort((a, b) => a.label.localeCompare(b.label, "es")) };
}

export function findConcepts(graph, query) {
  const words = terms(query.trim()).split(/\s+/);
  return graph.nodes.filter(node => words.every(word => node.terms.includes(word)));
}

const root = typeof document === "undefined" ? null : document.querySelector("[data-knowledge-graph]");
if (root?.dataset.knowledgeGraph) {
  const status = root.querySelector("[data-graph-status]"), workspace = root.querySelector("[data-graph-workspace]");
  const query = root.querySelector("#chat-concept-search"), results = root.querySelector("#chat-concept-results"), count = root.querySelector("#chat-concept-count");
  const title = root.querySelector("[data-concept-title]"), summary = root.querySelector("[data-concept-summary]"), canvas = root.querySelector("[data-graph-canvas]");
  const relations = root.querySelector("[data-graph-relations]"), pageLabel = root.querySelector("[data-relations-page]");
  const previous = root.querySelector("[data-relations-previous]"), next = root.querySelector("[data-relations-next]");
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const svgElement = (tag, attributes = {}, text) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  let graph, selected, related = [], offset = 0;

  function draw() {
    if (!selected) return;
    // ponytail: render six adjacent concepts, with paging, instead of laying out thousands of nodes.
    const visible = related.slice(offset, offset + 6), width = Math.max(260, canvas.clientWidth), cardWidth = Math.min(230, (width - 36) / 2);
    const height = 135 + Math.ceil(visible.length / 2) * 96;
    const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "group", "aria-label": `Conexiones de ${selected.label}` });
    svg.append(svgElement("title", {}, `Concepto seleccionado: ${selected.label}`));
    function node(label, x, y, id, active = false) {
      const group = svgElement("g", { class: active ? "graph-node is-selected" : "graph-node", transform: `translate(${x},${y})`, ...(active ? {} : { role: "button", tabindex: "0", "aria-label": `Explorar ${label}` }) });
      group.append(svgElement("title", {}, label), svgElement("rect", { x: -cardWidth / 2, y: -32, width: cardWidth, height: 64, rx: 9 }));
      const max = Math.max(12, Math.floor((cardWidth - 22) / 7.5)), words = label.split(/\s+/), lines = [""];
      for (const word of words) {
        if (lines.at(-1) && `${lines.at(-1)} ${word}`.length > max && lines.length < 2) lines.push("");
        lines[lines.length - 1] += `${lines.at(-1) ? " " : ""}${word}`;
      }
      const text = svgElement("text", { "text-anchor": "middle" });
      lines.forEach((line, index) => text.append(svgElement("tspan", { x: 0, y: lines.length === 1 ? 5 : -4 + index * 19 }, line.length > max ? `${line.slice(0, max - 1)}…` : line)));
      group.append(text);
      if (!active) {
        group.addEventListener("click", () => select(id));
        group.addEventListener("keydown", event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); select(id); title.focus({ preventScroll: true }); } });
      }
      return group;
    }
    const positions = visible.map(([id], index) => ({ id, x: index % 2 ? width * 0.75 : width * 0.25, y: 160 + Math.floor(index / 2) * 96 }));
    positions.forEach(({ x, y }) => svg.append(svgElement("path", { class: "graph-edge", d: `M${width / 2},87 V110 H${x} V${y - 32}` })));
    svg.append(node(selected.label, width / 2, 55, selected.id, true));
    positions.forEach(({ id, x, y }) => svg.append(node(graph.byId.get(id).label, x, y, id)));
    canvas.replaceChildren(svg);
    relations.replaceChildren();
    for (const [id, links] of visible) {
      const item = element("li"), button = element("button", graph.byId.get(id).label);
      button.type = "button";
      button.addEventListener("click", () => { select(id); title.focus({ preventScroll: true }); });
      item.append(button);
      for (const edge of links) item.append(element("p", `${graph.byId.get(edge.source).label} → ${edge.label || "relacionado con"} → ${graph.byId.get(edge.target).label}`));
      relations.append(item);
    }
    pageLabel.textContent = related.length ? `${offset + 1}–${Math.min(offset + 6, related.length)} de ${related.length} conexiones` : "Sin conexiones registradas";
    previous.disabled = offset === 0;
    next.disabled = offset + 6 >= related.length;
  }

  function search() {
    const matches = findConcepts(graph, query.value);
    count.textContent = `${matches.length.toLocaleString("es")} conceptos${matches.length > 30 ? " · se muestran los primeros 30" : ""}`;
    results.replaceChildren();
    for (const item of matches.slice(0, 30)) {
      const li = element("li"), button = element("button", item.label);
      button.type = "button"; button.dataset.concept = item.id;
      button.setAttribute("aria-pressed", String(selected?.id === item.id));
      button.addEventListener("click", () => select(item.id));
      li.append(button); results.append(li);
    }
    if (!matches.length) results.append(element("li", "No encontramos ese concepto. Prueba con otra palabra.", "chat-graph-empty"));
  }

  function select(id) {
    selected = graph.byId.get(id);
    related = [...graph.neighbors.get(id)].sort(([a], [b]) => graph.byId.get(a).label.localeCompare(graph.byId.get(b).label, "es"));
    offset = 0;
    title.textContent = selected.label;
    title.tabIndex = -1;
    const type = { Entity: "Concepto", EntityType: "Tipo de concepto" }[selected.type] || selected.type;
    summary.textContent = `${type} · ${related.length.toLocaleString("es")} conceptos conectados`;
    for (const button of results.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.concept === id));
    draw();
  }

  async function load() {
    try {
      const response = await fetch(root.dataset.knowledgeGraph, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Graph unavailable");
      const data = await response.json();
      graph = indexGraph(data);
      if (!graph.nodes.length) throw new Error("Empty graph");
      const date = new Date(data.generatedAt), version = typeof data.version === "string" ? data.version.slice(0, 12) : "sin versión";
      const when = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("es", { dateStyle: "long", timeStyle: "short" }).format(date) : "fecha no disponible";
      root.querySelector("[data-graph-meta]").textContent = `Fuente: Cognee · Instantánea del ${when} · Versión ${version} · ${graph.nodes.length.toLocaleString("es")} conceptos y ${graph.edges.length.toLocaleString("es")} relaciones`;
      status.hidden = true; workspace.hidden = false;
      search();
      select((graph.nodes.find(node => node.terms === "oracle cloud infrastructure") || graph.nodes[0]).id);
      query.addEventListener("input", search);
      previous.addEventListener("click", () => { offset = Math.max(0, offset - 6); draw(); });
      next.addEventListener("click", () => { offset += 6; draw(); });
      new ResizeObserver(draw).observe(canvas);
    } catch {
      status.textContent = "No se pudo cargar la instantánea del mapa. Actualiza la página para volver a intentarlo.";
      status.hidden = false;
    }
  }
  load();
}

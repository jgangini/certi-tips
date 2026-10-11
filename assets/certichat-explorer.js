import { createNetwork } from "./certichat-network.js";
import { normalizeTrace, readTrace } from "./certichat-trace.js";

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
  const title = root.querySelector("[data-concept-title]"), summary = root.querySelector("[data-concept-summary]");
  const relations = root.querySelector("[data-graph-relations]"), pageLabel = root.querySelector("[data-relations-page]");
  const previous = root.querySelector("[data-relations-previous]"), next = root.querySelector("[data-relations-next]");
  const notice = root.querySelector("[data-graph-trace]"), active = root.querySelector("[data-graph-active]");
  const activeFit = root.querySelector("[data-graph-active-fit]"), inspector = root.querySelector(".chat-graph-inspector");
  const siteRoot = document.querySelector("[data-certichat]")?.dataset.siteRoot;
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  let graph, network, version, selected, related = [], offset = 0;
  let latest = { status: "idle", trace: readTrace(siteRoot) };
  if (latest.trace) latest.status = "ready";

  function conceptButton(id) {
    const button = element("button", graph.byId.get(id).label);
    button.type = "button"; button.dataset.concept = id;
    button.addEventListener("click", () => select(id));
    return button;
  }

  function drawRelations() {
    relations.replaceChildren();
    for (const [id, links] of related.slice(offset, offset + 6)) {
      const item = element("li");
      item.append(conceptButton(id));
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
      const li = element("li"), button = conceptButton(item.id);
      button.setAttribute("aria-pressed", String(selected?.id === item.id));
      li.append(button); results.append(li);
    }
    if (!matches.length) results.append(element("li", "No encontramos ese concepto. Prueba con otra palabra.", "chat-graph-empty"));
  }

  function select(id) {
    selected = graph.byId.get(id);
    if (!selected) return;
    related = [...graph.neighbors.get(id)].sort(([a], [b]) => graph.byId.get(a).label.localeCompare(graph.byId.get(b).label, "es"));
    offset = 0;
    title.textContent = selected.label;
    const type = { Entity: "Concepto", EntityType: "Tipo de concepto" }[selected.type] || selected.type;
    summary.textContent = `${type} · ${related.length.toLocaleString("es")} conceptos conectados`;
    for (const button of results.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.concept === id));
    inspector.open = true;
    network.select(id);
    drawRelations();
  }

  function updateTrace() {
    if (!graph) return;
    let trace = normalizeTrace(latest.trace);
    const mismatch = trace && trace.version !== version;
    if (mismatch) trace = null;
    if (trace) {
      const nodes = trace.nodes.filter(id => graph.byId.has(id)), ids = new Set(nodes);
      const edges = trace.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target) && graph.neighbors.get(edge.source)?.get(edge.target)?.some(link => link.source === edge.source && link.target === edge.target && link.label === edge.label));
      trace = { ...trace, nodes, edges };
    }
    network.setTrace(trace);
    active.replaceChildren();
    for (const id of trace?.nodes || []) {
      const item = element("li"); item.append(conceptButton(id)); active.append(item);
    }
    activeFit.disabled = !trace?.nodes.length;
    const messages = {
      idle: "Haz una consulta para ver qué conceptos se recuperan.",
      loading: "Consultando las guías… El mapa se iluminará al recibir la respuesta.",
      error: "La consulta no se completó. No hay información que resaltar.",
      ready: "Esta respuesta no incluye conceptos recuperados que se puedan mostrar en el mapa.",
    };
    notice.textContent = mismatch ? "El mapa y la consulta corresponden a versiones distintas. Actualiza la página para cargar el mapa publicado más reciente." : trace?.nodes.length ? `${trace.nodes.length} conceptos y ${trace.edges.length} relaciones recuperados para tu última consulta.${trace.truncated ? " Se muestra una selección acotada." : ""}` : messages[latest.status] || messages.idle;
    root.dataset.traceStatus = mismatch ? "version-mismatch" : latest.status;
  }

  window.addEventListener("certichat:trace", event => { latest = event.detail; updateTrace(); });
  document.querySelector("[data-explorer-chat]")?.addEventListener("click", () => {
    const launcher = document.querySelector("[data-chat-open]");
    if (launcher?.getAttribute("aria-expanded") !== "true") launcher?.click();
    else document.querySelector("[data-chat-close]")?.focus();
  });

  async function load() {
    try {
      const response = await fetch(root.dataset.knowledgeGraph, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Graph unavailable");
      const data = await response.json();
      graph = indexGraph(data); version = data.version;
      if (!graph.nodes.length) throw new Error("Empty graph");
      const date = new Date(data.generatedAt), when = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("es", { dateStyle: "long", timeStyle: "short" }).format(date) : "fecha no disponible";
      root.querySelector("[data-graph-meta]").textContent = `Fuente: Cognee · Instantánea del ${when} · ${graph.nodes.length.toLocaleString("es")} conceptos y ${graph.edges.length.toLocaleString("es")} relaciones · Versión ${String(version).slice(0, 12)}`;
      status.hidden = true; workspace.hidden = false;
      network = createNetwork(root.querySelector("[data-graph-canvas]"), graph, select);
      search(); updateTrace();
      query.addEventListener("input", search);
      previous.addEventListener("click", () => { offset = Math.max(0, offset - 6); drawRelations(); });
      next.addEventListener("click", () => { offset += 6; drawRelations(); });
      root.querySelector("[data-graph-zoom-in]").addEventListener("click", () => network.zoom(1.4));
      root.querySelector("[data-graph-zoom-out]").addEventListener("click", () => network.zoom(1 / 1.4));
      root.querySelector("[data-graph-fit]").addEventListener("click", () => network.fit());
      activeFit.addEventListener("click", () => network.fit(true));
    } catch {
      status.textContent = "No se pudo cargar la instantánea del mapa. Actualiza la página para volver a intentarlo.";
      status.hidden = false; workspace.hidden = true;
    }
  }
  load();
}

import { createNetwork } from "./certichat-network.js";
import { normalizeTrace, readTrace } from "./certichat-trace.js";

export function indexGraph(data) {
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw new Error("Invalid knowledge graph");
  const byId = new Map(), neighbors = new Map(), edges = [];
  for (const node of data.nodes) {
    if (typeof node?.id !== "string" || !node.id || typeof node.label !== "string" || !node.label.trim() || byId.has(node.id)) continue;
    byId.set(node.id, { id: node.id, label: node.label, type: typeof node.type === "string" ? node.type : "Concepto" });
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

const root = typeof document === "undefined" ? null : document.querySelector("[data-knowledge-graph]");
if (root?.dataset.knowledgeGraph) {
  const status = root.querySelector("[data-graph-status]"), workspace = root.querySelector("[data-graph-workspace]");
  const notice = root.querySelector("[data-graph-trace]"), active = root.querySelector("[data-graph-active]");
  const selection = root.querySelector("[data-graph-selection]"), activeRelations = root.querySelector("[data-graph-active-relations]");
  const activeFit = root.querySelector("[data-graph-active-fit]");
  const card = root.querySelector("[data-graph-card]"), cardTitle = root.querySelector("[data-graph-card-title]"), cardSources = root.querySelector("[data-graph-card-sources]");
  const siteRoot = document.querySelector("[data-certichat]")?.dataset.siteRoot;
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  let graph, network, version, currentTrace;
  let latest = { status: "idle", trace: readTrace(siteRoot) };
  if (latest.trace) latest.status = "ready";

  function conceptButton(id) {
    const button = element("button", graph.byId.get(id).label);
    button.type = "button"; button.dataset.concept = id;
    button.addEventListener("click", () => select(id, true));
    return button;
  }

  function select(id, center = false) {
    network.select(id, center);
    selection.textContent = `${graph.byId.get(id).label}. ${graph.neighbors.get(id).size} conceptos relacionados.`;
    cardTitle.textContent = graph.byId.get(id).label;
    cardSources.replaceChildren();
    const sources = currentTrace?.sources?.filter(source => source.nodeId === id) || [];
    if (!sources.length) cardSources.append(element("p", "Sin referencia asociada a esta consulta."));
    for (const source of sources) {
      const link = element("a", source.title); link.href = source.url;
      link.setAttribute("aria-label", `Profundizar: ${source.title}`);
      link.addEventListener("click", event => {
        if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
          try { sessionStorage.setItem(`certichat:${siteRoot}:reference`, link.href); } catch { /* Guide navigation also works without storage. */ }
        }
      });
      cardSources.append(link);
    }
  }

  function anchorCard(anchor) {
    card.hidden = !anchor;
    if (!anchor) return;
    card.style.left = `${Math.max(8, Math.min(anchor.x - card.offsetWidth / 2, anchor.width - card.offsetWidth - 8))}px`;
    card.style.top = `${Math.max(8, Math.min(anchor.y - card.offsetHeight, anchor.height - card.offsetHeight - 8))}px`;
  }

  function updateTrace() {
    if (!graph) return;
    let trace = normalizeTrace(latest.trace, siteRoot);
    const mismatch = trace && trace.version !== version;
    if (mismatch) trace = null;
    if (trace) {
      const nodes = trace.nodes.filter(id => graph.byId.has(id)), ids = new Set(nodes);
      const edges = trace.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target) && graph.neighbors.get(edge.source)?.get(edge.target)?.some(link => link.source === edge.source && link.target === edge.target && link.label === edge.label));
      trace = { ...trace, nodes, edges };
    }
    currentTrace = trace;
    card.hidden = true;
    network.setTrace(trace);
    active.replaceChildren();
    for (const id of trace?.nodes || []) {
      const item = element("li"); item.append(conceptButton(id)); active.append(item);
    }
    activeRelations.replaceChildren();
    for (const edge of trace?.edges || []) activeRelations.append(element("li", `${graph.byId.get(edge.source).label} → ${edge.label || "relacionado con"} → ${graph.byId.get(edge.target).label}`));
    activeFit.disabled = !trace?.nodes.length;
    const messages = {
      idle: "Haz una consulta para ver qué conceptos se recuperan.",
      loading: "",
      error: "La consulta no se completó. No hay información que resaltar.",
      ready: "Esta respuesta no incluye conceptos recuperados que se puedan mostrar en el mapa.",
    };
    notice.textContent = mismatch ? "El mapa y la consulta corresponden a versiones distintas. Actualiza la página para cargar el mapa publicado más reciente." : trace?.nodes.length ? `${trace.nodes.length} conceptos y ${trace.edges.length} relaciones recuperados para esta respuesta.${trace.truncated ? " Se muestra una selección acotada." : ""}` : messages[latest.status] ?? messages.idle;
    notice.hidden = !notice.textContent;
    root.dataset.traceStatus = mismatch ? "version-mismatch" : latest.status;
  }

  window.addEventListener("certichat:trace", event => { latest = event.detail; updateTrace(); });
  window.addEventListener("certichat:focus", event => {
    latest = { status: "ready", trace: event.detail }; updateTrace();
    if (currentTrace?.nodes.length) { network.fit(true); network.pulse(); }
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
      network = createNetwork(root.querySelector("[data-graph-canvas]"), graph, select, anchorCard);
      updateTrace();
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

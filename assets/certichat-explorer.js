import { t, locale, language, localizedURL, canonicalURL, siteBase } from "./i18n.js";
import { createNetwork, videoEvidence } from "./certichat-network.js";
import { normalizeTrace, readTrace, sourcePath } from "./certichat-trace.js";

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
  return { byId, neighbors, edges, nodes: [...byId.values()].sort((a, b) => a.label.localeCompare(b.label, language, { numeric: true, sensitivity: "base" })) };
}

const root = typeof document === "undefined" ? null : document.querySelector("[data-knowledge-graph]");
if (root?.dataset.knowledgeGraph) {
  const status = root.querySelector("[data-graph-status]"), workspace = root.querySelector("[data-graph-workspace]");
  const notice = root.querySelector("[data-graph-trace]"), active = root.querySelector("[data-graph-active]");
  const scrollButtons = root.querySelectorAll("[data-graph-scroll]"), zoom = root.querySelector("[data-graph-zoom]");
  const selection = root.querySelector("[data-graph-selection]"), activeRelations = root.querySelector("[data-graph-active-relations]");
  const activeFit = root.querySelector("[data-graph-active-fit]");
  const card = root.querySelector("[data-graph-card]"), cardTitle = root.querySelector("[data-graph-card-title]"), cardSources = root.querySelector("[data-graph-card-sources]");
  const connector = root.querySelector("[data-graph-card-connector]"), connectorLine = connector.querySelector("line");
  const siteRoot = document.querySelector("[data-certichat]")?.dataset.siteRoot;
  const apiOrigin = document.querySelector("[data-certichat]")?.dataset.api;
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = t(text);
    if (className) node.className = className;
    return node;
  };
  const timestampFormat = new Intl.DateTimeFormat(language, { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  let graph, network, version, generatedWhen, currentTrace, refreshing, hoveredTrace, focusAfterRefresh = false, lastGraphCheck = 0;
  let latest = { status: "idle", trace: readTrace(siteRoot) };
  if (latest.trace) latest.status = "ready";
  const updating = element("span", undefined, "certichat-spinner chat-graph-updating");
  updating.hidden = true; updating.setAttribute("role", "status"); updating.setAttribute("aria-label", t("Actualizando el índice de conocimiento"));

  function updateScroll() {
    const { scrollLeft, scrollWidth, clientWidth } = active;
    scrollButtons[0].disabled = scrollLeft <= 4;
    scrollButtons[1].disabled = scrollLeft >= scrollWidth - clientWidth - 4;
  }
  for (const button of scrollButtons) button.addEventListener("click", () => active.scrollBy({ left: Number(button.dataset.graphScroll) * active.clientWidth * .8, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }));
  active.addEventListener("scroll", updateScroll, { passive: true });
  new ResizeObserver(updateScroll).observe(active);

  async function refreshVersionStatus() {
    if (!apiOrigin || document.hidden) return;
    let indexing = false;
    try {
      const response = await fetch(`${apiOrigin}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const knowledge = (await response.json()).knowledge;
        indexing = knowledge?.indexing === true;
        if (knowledge?.version && knowledge.version !== version) await refreshGraph();
        const date = typeof knowledge?.checkedAt === "string" ? new Date(knowledge.checkedAt) : null;
        if (date && Number.isFinite(date.getTime())) {
          const stamp = root.querySelector(".chat-graph-stamp dd");
          stamp.textContent = timestampFormat.format(date).replaceAll("/", "-").replace(",", "");
          stamp.title = t('Última sincronización con el repositorio (hora de Perú, UTC−5). Índice generado el {when}.', {when: generatedWhen});
        }
      }
    } catch { /* An unverified update must not keep the spinner running. */ }
    updating.hidden = !indexing;
    updating.parentElement?.setAttribute("aria-busy", String(indexing));
  }

  function conceptButton(id, position, source) {
    const label = t(graph.byId.get(id).label), button = element("button");
    button.append(element("span", position, "chat-graph-number"), element("span", label, "chat-graph-label"));
    button.type = "button"; button.dataset.concept = id;
    button.dataset.source = source;
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", `${position}. ${label}`);
    button.addEventListener("click", () => select(id, true));
    return button;
  }

  function select(id, center = false) {
    network.select(id, center);
    active.querySelectorAll("button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.concept === id)));
    const selected = active.querySelector('[aria-pressed="true"]');
    if (selected) active.scrollTo({ left: active.scrollLeft + selected.getBoundingClientRect().left - active.getBoundingClientRect().left - (active.clientWidth - selected.offsetWidth) / 2, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    selection.textContent = t('{label}. {count} conceptos relacionados.', {label: t(graph.byId.get(id).label), count: graph.neighbors.get(id).size});
    cardTitle.textContent = t(graph.byId.get(id).label);
    cardSources.replaceChildren();
    const sources = currentTrace?.sources?.filter(source => source.nodeId === id) || [];
    if (!sources.length) cardSources.append(element("p", t("Sin referencia asociada a esta consulta.")));
    for (const source of sources) {
      const link = element("a", source.title); link.href = localizedURL(sourcePath(source.url, siteRoot));
      link.title = t(source.title);
      link.dataset.source = new URL(source.url).pathname.startsWith(new URL("certitube/", siteRoot).pathname) ? "tube" : "tips";
      link.setAttribute("aria-label", t('Profundizar: {title}', {title: t(source.title)}));
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
    connector.toggleAttribute("hidden", !anchor);
    if (!anchor) return;
    card.dataset.source = connector.dataset.source = anchor.source;
    const left = Math.max(8, Math.min(anchor.x - card.offsetWidth / 2, anchor.width - card.offsetWidth - 8));
    const top = Math.max(8, Math.min(anchor.y - card.offsetHeight, anchor.height - card.offsetHeight - 8));
    card.style.left = `${left}px`; card.style.top = `${top}px`;
    connectorLine.setAttribute("x1", Math.max(left + 8, Math.min(anchor.x, left + card.offsetWidth - 8)));
    connectorLine.setAttribute("y1", top + card.offsetHeight);
    connectorLine.setAttribute("x2", anchor.x); connectorLine.setAttribute("y2", anchor.nodeY);
  }

  function updateTrace() {
    if (!graph) return;
    let trace = normalizeTrace(latest.trace, siteRoot);
    const mismatch = trace && trace.version !== version;
    if (mismatch) trace = null;
    if (trace) {
      const retrieved = new Set(trace.nodes), nodes = graph.nodes.filter(node => retrieved.has(node.id)).map(node => node.id), ids = new Set(nodes);
      const edges = trace.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target) && graph.neighbors.get(edge.source)?.get(edge.target)?.some(link => link.source === edge.source && link.target === edge.target && link.label === edge.label));
      trace = { ...trace, nodes, edges };
    }
    currentTrace = trace;
    const { nodes = [], edges = [] } = trace || {};
    const [concepts, relations] = root.querySelectorAll("[data-graph-meta] dd");
    concepts.textContent = `${nodes.length}/${graph.nodes.length.toLocaleString(language)}`;
    relations.textContent = `${edges.length}/${graph.edges.length.toLocaleString(language)}`;
    card.hidden = true;
    connector.setAttribute("hidden", "");
    network.setTrace(trace);
    active.replaceChildren();
    const videoNodes = videoEvidence(trace).nodes;
    for (const [index, id] of nodes.entries()) {
      const item = element("li"); item.append(conceptButton(id, index + 1, videoNodes.has(id) ? "tube" : "tips")); active.append(item);
    }
    active.scrollTo({ left: 0, behavior: "instant" }); updateScroll();
    activeRelations.replaceChildren();
    for (const edge of edges) activeRelations.append(element("li", `${t(graph.byId.get(edge.source).label)} → ${t(edge.label || "relacionado con")} → ${t(graph.byId.get(edge.target).label)}`));
    activeFit.disabled = !nodes.length;
    const messages = {
      idle: "",
      loading: "",
      error: t("La consulta no se completó. No hay información que resaltar."),
    };
    notice.textContent = mismatch ? t("El mapa y la consulta corresponden a versiones distintas. Actualiza la página para cargar el mapa publicado más reciente.") : messages[latest.status] ?? messages.idle;
    concepts.title = relations.title = trace?.truncated ? t("Recuperados/total del mapa. Se muestra una selección acotada.") : t("Recuperados/total del mapa.");
    notice.hidden = !notice.textContent;
    root.dataset.traceStatus = mismatch ? "version-mismatch" : latest.status;
    if (mismatch) refreshGraph();
  }

  window.addEventListener("certichat:trace", event => { latest = event.detail; updateTrace(); });
  window.addEventListener("certichat:hover", event => {
    hoveredTrace = event.detail;
    if (!hoveredTrace) { network?.stopPulse(); return; }
    focusAfterRefresh = false;
    latest = { status: "ready", trace: hoveredTrace }; updateTrace();
    if (currentTrace?.nodes.length) network.pulse(true);
  });
  window.addEventListener("certichat:focus", event => {
    focusAfterRefresh = true;
    latest = { status: "ready", trace: event.detail }; updateTrace();
    if (currentTrace?.nodes.length) { network.fit(true); network.pulse(Boolean(hoveredTrace && hoveredTrace === event.detail)); focusAfterRefresh = false; }
  });

  function showGraph(data) {
    const indexed = indexGraph(data);
    if (!indexed.nodes.length || !/^[a-f0-9]{64}$/.test(data.version)) throw new Error("Invalid graph");
    network?.destroy();
    graph = indexed; version = data.version;
    const date = new Date(data.generatedAt), when = Number.isFinite(date.getTime()) ? timestampFormat.format(date).replaceAll("/", "-").replace(",", "") : t("fecha no disponible");
    generatedWhen = when;
    const metadata = root.querySelector("[data-graph-meta]");
    metadata.replaceChildren();
    for (const [label, value] of [[t("Conceptos"), graph.nodes.length.toLocaleString(language)], [t("Relaciones"), graph.edges.length.toLocaleString(language)], [t("Actualización"), when], [t("Versión"), String(version).slice(0, 12)]]) {
      const item = element("div"); item.append(element("dt", label), element("dd", value)); metadata.append(item);
      if (label === t("Actualización")) { item.className = "chat-graph-stamp"; item.lastElementChild.title = t('Índice generado el {when} (hora de Perú, UTC−5). Sincronización del repositorio pendiente de comprobar.', {when}); }
      if (label === t("Versión")) item.lastElementChild.append(updating);
    }
    status.hidden = true; workspace.hidden = false;
    network = createNetwork(root.querySelector("[data-graph-canvas]"), graph, select, anchorCard, percent => { zoom.value = `${percent}%`; });
    updateTrace();
    if (focusAfterRefresh && currentTrace?.nodes.length) { network.fit(true); network.pulse(Boolean(hoveredTrace && hoveredTrace === latest.trace)); focusAfterRefresh = false; }
    else if (hoveredTrace && hoveredTrace === latest.trace && currentTrace?.nodes.length) network.pulse(true);
  }

  async function refreshGraph() {
    if (refreshing) return refreshing;
    if (!apiOrigin || Date.now() - lastGraphCheck < 5000) return;
    lastGraphCheck = Date.now();
    refreshing = (async () => {
      try {
        const response = await fetch(`${apiOrigin}/api/graph`, { headers: { "X-CertiChat": "1" }, cache: "no-store", signal: AbortSignal.timeout(15000) });
        if (!response.ok) return;
        const data = await response.json();
        if (data.version !== version) showGraph(data);
      } catch { /* Keep the available snapshot and its version checks during a refresh outage. */ }
    })();
    try { await refreshing; } finally { refreshing = null; }
  }

  async function load() {
    try {
      const response = await fetch(root.dataset.knowledgeGraph, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Graph unavailable");
      showGraph(await response.json());
      root.querySelector("[data-graph-zoom-in]").addEventListener("click", () => network.zoom(1.4));
      root.querySelector("[data-graph-zoom-out]").addEventListener("click", () => network.zoom(1 / 1.4));
      root.querySelector("[data-graph-fit]").addEventListener("click", () => network.fit());
      activeFit.addEventListener("click", () => network.fit(true));
      refreshVersionStatus();
      setInterval(refreshVersionStatus, 30000);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) { hoveredTrace = null; network.stopPulse(); }
        else refreshVersionStatus();
      });
    } catch {
      status.classList.remove("is-loading"); status.removeAttribute("aria-label");
      status.textContent = t("No se pudo cargar la instantánea del mapa. Actualiza la página para volver a intentarlo.");
      status.hidden = false; workspace.hidden = true;
    }
  }
  load();
}

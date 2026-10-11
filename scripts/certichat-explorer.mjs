import { escapeHtml } from "./layout.mjs";

export function certichatExplorerBody(base, hasGraph) {
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="${escapeHtml(base)}assets/icons/certichat-controls.svg#${name}"/></svg>`;
  return `<div class="chat-explorer-page">
<section class="chat-explorer-section" id="conocimiento" aria-labelledby="chat-graph-title" data-knowledge-graph="${hasGraph ? `${escapeHtml(base)}assets/certichat/graph.json` : ""}">
<header class="certichat-heading chat-graph-heading"><div class="certichat-brand"><div><h1 id="chat-graph-title">Cognee</h1><small>GRAFO DE CONOCIMIENTO</small></div></div></header>
<p class="chat-graph-status" data-graph-status role="status">${hasGraph ? "Cargando el mapa de conocimiento…" : "La instantánea del grafo todavía no está publicada."}</p>
<div data-graph-workspace hidden>
<div class="chat-graph-network"><canvas data-graph-canvas tabindex="0" role="img" aria-label="Grafo de conceptos y relaciones de CertiTips" aria-keyshortcuts="+ - ArrowLeft ArrowRight ArrowUp ArrowDown Home f"></canvas>
<div class="chat-graph-toolbar" role="group" aria-label="Controles del mapa"><button class="button button-secondary" type="button" data-graph-zoom-in aria-label="Acercar mapa" title="Acercar mapa">${icon("zoom-in")}</button><button class="button button-secondary" type="button" data-graph-zoom-out aria-label="Alejar mapa" title="Alejar mapa">${icon("zoom-out")}</button><button class="button button-secondary" type="button" data-graph-fit aria-label="Ver todo" title="Ver todo">${icon("maximize")}</button><button class="button button-secondary" type="button" data-graph-active-fit aria-label="Ver consulta" title="Ver consulta" disabled>${icon("locate-fixed")}</button></div></div>
<footer class="chat-graph-footer">
<p class="chat-graph-trace" data-graph-trace role="status">Haz una consulta para ver qué conceptos se recuperan.</p>
<ul class="chat-graph-active" data-graph-active aria-label="Conceptos recuperados para esta consulta"></ul>
<p class="visually-hidden" data-graph-selection role="status"></p><ul class="visually-hidden" data-graph-active-relations aria-label="Relaciones recuperadas para esta consulta"></ul>
<p class="chat-graph-meta" data-graph-meta></p></footer></div><noscript><p>Activa JavaScript para explorar el mapa y ver las consultas.</p></noscript></section>
<div data-explorer-chat-slot></div>
</div>`;
}

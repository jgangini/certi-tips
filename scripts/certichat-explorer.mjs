import { escapeHtml } from "./layout.mjs";

export function certichatExplorerBody(base, hasGraph) {
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="${escapeHtml(base)}assets/icons/certichat-controls.svg#${name}"/></svg>`;
  return `<div class="chat-explorer-page">
<section class="chat-explorer-section" id="conocimiento" aria-labelledby="chat-graph-title" data-knowledge-graph="${hasGraph ? `${escapeHtml(base)}assets/certichat/graph.json` : ""}">
<header class="certichat-heading chat-graph-heading"><div class="certichat-brand"><div><h1 id="chat-graph-title">Cognee</h1><small>BASE DE CONOCIMIENTO</small></div></div></header>
<p class="chat-graph-status${hasGraph ? ' is-loading' : ''}" data-graph-status role="status"${hasGraph ? ' aria-label="Cargando el mapa de conocimiento"' : ''}>${hasGraph ? '<span class="certichat-spinner" aria-hidden="true"></span>' : "La instantánea del grafo todavía no está publicada."}</p>
<div data-graph-workspace hidden>
<div class="chat-graph-network"><canvas data-graph-canvas tabindex="0" role="img" aria-label="Grafo de conceptos y relaciones de CertiTips y CertiTube" aria-keyshortcuts="+ - ArrowLeft ArrowRight ArrowUp ArrowDown Home f"></canvas>
<aside class="chat-graph-card" data-graph-card aria-label="Información del concepto" hidden><strong data-graph-card-title></strong><div data-graph-card-sources></div></aside>
<div class="chat-graph-legend" aria-label="Leyenda de fuentes"><span class="chat-graph-zoom" data-source="tips">CertiTips</span><span class="chat-graph-zoom" data-source="tube">CertiTube</span></div>
<div class="chat-graph-toolbar" role="group" aria-label="Controles del mapa"><output class="chat-graph-zoom" data-graph-zoom aria-label="Nivel de zoom" aria-live="off">100%</output><button class="button button-secondary" type="button" data-graph-zoom-in aria-label="Acercar mapa" title="Acercar mapa">${icon("zoom-in")}</button><button class="button button-secondary" type="button" data-graph-zoom-out aria-label="Alejar mapa" title="Alejar mapa">${icon("zoom-out")}</button><button class="button button-secondary" type="button" data-graph-fit aria-label="Ver todo" title="Ver todo">${icon("maximize")}</button><button class="button button-secondary" type="button" data-graph-active-fit aria-label="Ver consulta" title="Ver consulta" disabled>${icon("locate-fixed")}</button></div></div>
<div class="chat-graph-evidence">
<p class="visually-hidden" data-graph-trace role="status" hidden></p>
<button class="button button-secondary chat-graph-scroll" type="button" data-graph-scroll="-1" aria-label="Desplazar conceptos a la izquierda" aria-controls="chat-graph-concepts" title="Desplazar a la izquierda" disabled><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16 4 4 12 16 20Z" fill="currentColor"/></svg></button>
<ul class="chat-graph-active" id="chat-graph-concepts" data-graph-active aria-label="Conceptos recuperados para esta consulta"></ul>
<button class="button button-secondary chat-graph-scroll" type="button" data-graph-scroll="1" aria-label="Desplazar conceptos a la derecha" aria-controls="chat-graph-concepts" title="Desplazar a la derecha" disabled><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 4 20 12 8 20Z" fill="currentColor"/></svg></button>
<p class="visually-hidden" data-graph-selection role="status"></p><ul class="visually-hidden" data-graph-active-relations aria-label="Relaciones recuperadas para esta consulta"></ul>
</div><footer class="chat-graph-footer"><dl class="chat-graph-meta" data-graph-meta></dl></footer></div><noscript><p>Activa JavaScript para explorar el mapa y ver las consultas.</p></noscript></section>
<div data-explorer-chat-slot></div>
</div>`;
}

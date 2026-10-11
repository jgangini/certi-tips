import { escapeHtml } from "./layout.mjs";

export function certichatExplorerBody(base, hasGraph) {
  return `<div class="chat-explorer-page">
<section class="chat-explorer-section" id="conocimiento" aria-labelledby="chat-graph-title" data-knowledge-graph="${hasGraph ? `${escapeHtml(base)}assets/certichat/graph.json` : ""}">
<header class="certichat-heading chat-graph-heading"><div class="certichat-brand"><div><h1 id="chat-graph-title">Mapa de conocimiento</h1><small>CONCEPTOS Y RELACIONES</small></div></div></header>
<p class="chat-graph-status" data-graph-status role="status">${hasGraph ? "Cargando el mapa de conocimiento…" : "La instantánea del grafo todavía no está publicada."}</p>
<div data-graph-workspace hidden>
<p class="chat-graph-legend"><span>Gris · conocimiento disponible</span><span>Rojo · recuperado para tu consulta</span></p>
<div class="chat-graph-toolbar" role="group" aria-label="Controles del mapa"><button class="button button-secondary" type="button" data-graph-zoom-in aria-label="Acercar mapa">+</button><button class="button button-secondary" type="button" data-graph-zoom-out aria-label="Alejar mapa">−</button><button class="button button-secondary" type="button" data-graph-fit>Ver todo</button><button class="button button-secondary" type="button" data-graph-active-fit disabled>Ver consulta</button></div>
<div class="chat-graph-network"><canvas data-graph-canvas tabindex="0" role="img" aria-label="Grafo de conceptos y relaciones de CertiTips" aria-describedby="chat-graph-help"></canvas></div>
<footer class="chat-graph-footer"><p id="chat-graph-help" class="chat-graph-help">Arrastra para recorrer el mapa. Usa + y − para acercar o alejar; las flechas desplazan la vista.</p>
<p class="chat-graph-trace" data-graph-trace role="status">Haz una consulta para ver qué conceptos se recuperan.</p>
<ul class="chat-graph-active" data-graph-active aria-label="Conceptos recuperados para esta consulta"></ul>
<p class="visually-hidden" data-graph-selection role="status"></p><ul class="visually-hidden" data-graph-active-relations aria-label="Relaciones recuperadas para esta consulta"></ul>
<p class="chat-graph-meta" data-graph-meta></p></footer></div><noscript><p>Activa JavaScript para explorar el mapa y ver las consultas.</p></noscript></section>
<div data-explorer-chat-slot></div>
</div>`;
}

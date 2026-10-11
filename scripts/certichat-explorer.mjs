import { escapeHtml } from "./layout.mjs";

export function certichatExplorerBody(base, hasGraph) {
  const steps = [
    ["Acceso", "Verifica tu acceso y el cupo disponible."],
    ["Recuperación", "Cognee recupera información relacionada con tu consulta."],
    ["Evidencia", "Selecciona fragmentos de las guías que siguen publicados."],
    ["Respuesta", "El modelo redacta la respuesta a partir de esa información."],
    ["Validación", "Comprueba la respuesta y sus referencias antes de mostrarla."],
    ["Mapa", "Resalta los conceptos y relaciones recuperados para esta consulta."],
  ];
  const flow = items => `<ol class="chat-flow">${items.map(([title, detail], index) => `<li><span class="chat-flow-number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p></div></li>`).join("")}</ol>`;
  return `<div class="chat-explorer-page">
<nav class="chat-explorer-breadcrumb" aria-label="Ruta de navegación"><a href="${escapeHtml(base)}">Home</a><span aria-hidden="true">/</span><span aria-current="page">CertiChat</span></nav>
<header class="chat-explorer-intro" id="consulta"><span class="eyebrow">CONCEPTOS Y CONEXIONES</span><h1>Certi<span class="brand-accent">Chat</span> en acción</h1><p>Haz una pregunta y descubre qué información recupera el asistente para responder.</p><button class="button" type="button" data-explorer-chat aria-controls="certichat-panel">Conversar con CertiChat</button></header>
<section class="chat-explorer-section" id="conocimiento" aria-labelledby="chat-graph-title" data-knowledge-graph="${hasGraph ? `${escapeHtml(base)}assets/certichat/graph.json` : ""}">
<header class="chat-graph-heading"><h2 id="chat-graph-title">Mapa de conocimiento</h2><p class="chat-graph-legend"><span>Gris · conocimiento disponible</span><span>Rojo · recuperado para tu consulta</span></p></header>
<p class="chat-graph-status" data-graph-status role="status">${hasGraph ? "Cargando el mapa de conocimiento…" : "La instantánea del grafo todavía no está publicada."}</p>
<div data-graph-workspace hidden>
<div class="chat-graph-toolbar" role="group" aria-label="Controles del mapa"><button class="button button-secondary" type="button" data-graph-zoom-in aria-label="Acercar mapa">+</button><button class="button button-secondary" type="button" data-graph-zoom-out aria-label="Alejar mapa">−</button><button class="button button-secondary" type="button" data-graph-fit>Ver todo</button><button class="button button-secondary" type="button" data-graph-active-fit disabled>Ver consulta</button></div>
<div class="chat-graph-network"><canvas data-graph-canvas tabindex="0" role="img" aria-label="Grafo de conceptos y relaciones de CertiTips" aria-describedby="chat-graph-help"></canvas></div>
<p id="chat-graph-help" class="chat-graph-help">Arrastra para recorrer el mapa. Usa + y − para acercar o alejar; las flechas desplazan la vista. También puedes buscar un concepto en la lista.</p>
<p class="chat-graph-trace" data-graph-trace role="status">Haz una consulta para ver qué conceptos se recuperan.</p>
<ul class="chat-graph-active" data-graph-active aria-label="Conceptos recuperados para esta consulta"></ul>
<details class="chat-graph-inspector"><summary>Explorar conceptos y relaciones</summary><div class="chat-graph-workspace"><aside class="chat-graph-search"><label for="chat-concept-search">Buscar un concepto</label><input id="chat-concept-search" type="search" placeholder="Por ejemplo, OCI o agentes" autocomplete="off" aria-controls="chat-concept-results" aria-describedby="chat-concept-count"><p id="chat-concept-count" role="status"></p><ul id="chat-concept-results" aria-label="Conceptos encontrados"></ul></aside><div class="chat-graph-detail"><div class="chat-graph-selection"><span class="eyebrow">CONCEPTO SELECCIONADO</span><h3 data-concept-title>Selecciona un concepto</h3><p data-concept-summary></p></div><div class="chat-graph-relations"><h4>Relaciones del concepto</h4><ul data-graph-relations></ul><nav class="chat-graph-pager" aria-label="Más relaciones"><button class="button button-secondary" type="button" data-relations-previous disabled>Anterior</button><span data-relations-page role="status"></span><button class="button button-secondary" type="button" data-relations-next disabled>Siguiente</button></nav></div></div></div></details>
<p class="chat-graph-meta" data-graph-meta></p></div><noscript><p>Activa JavaScript para explorar el mapa y ver las consultas.</p></noscript></section>
<details class="chat-explorer-section chat-explorer-flow"><summary>Cómo se prepara una respuesta</summary>${flow(steps)}<p class="chat-explorer-note">El rojo representa información recuperada, no el razonamiento interno del modelo. El mapa se actualiza al recibir cada respuesta y muestra únicamente tu última consulta.</p></details>
</div>`;
}

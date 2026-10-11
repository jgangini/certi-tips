import { escapeHtml } from "./layout.mjs";

export function certichatExplorerBody(base, hasGraph) {
  const steps = [
    ["Acceso", "Verifica tu acceso antes de aceptar la consulta."],
    ["Límites de uso", "Comprueba el cupo y la disponibilidad del servicio."],
    ["Recuperación con Cognee", "Busca contenido relacionado y considera la página que estás leyendo."],
    ["Evidencia vigente", "Selecciona fragmentos de las guías y comprueba que sigan publicados."],
    ["Respuesta con OpenRouter", "El modelo redacta una respuesta estructurada a partir de la evidencia."],
    ["Validación", "Comprueba la respuesta y sus referencias antes de mostrarla."],
  ];
  const updates = [
    ["GitHub", "Se publican cambios en las guías."],
    ["Manifiesto", "Identifica los documentos y sus versiones."],
    ["Cognee", "Prepara un índice candidato con el contenido actualizado."],
    ["Activación", "Valida el índice antes de usarlo en nuevas consultas."],
  ];
  const flow = items => `<ol class="chat-flow">${items.map(([title, detail], index) => `<li><span class="chat-flow-number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p></div></li>`).join("")}</ol>`;
  return `<div class="chat-explorer-page">
<nav class="chat-explorer-breadcrumb" aria-label="Ruta de navegación"><a href="${escapeHtml(base)}">Home</a><span aria-hidden="true">/</span><span aria-current="page">CertiChat</span></nav>
<header class="chat-explorer-intro"><span class="eyebrow">ASISTENTE DE ESTUDIO</span><h1>Cómo funciona Certi<span class="brand-accent">Chat</span></h1><p>Conoce el recorrido de una consulta y explora las conexiones entre los conceptos de las guías.</p><nav aria-label="Contenido de esta página"><a href="#consulta">Tu consulta</a><a href="#conocimiento">Mapa de conocimiento</a><a href="#actualizacion">Actualización</a></nav></header>
<section class="chat-explorer-section" id="consulta" aria-labelledby="chat-flow-title"><header><span class="eyebrow">01 / DE LA PREGUNTA A LA RESPUESTA</span><h2 id="chat-flow-title">Respuestas apoyadas en el sitio</h2><p>El asistente consulta el material disponible antes de responder.</p></header>${flow(steps)}<div class="chat-flow-outcomes"><p><strong>Con respaldo suficiente</strong><span>Recibes una respuesta. Si pides dónde profundizar, incluye enlaces a las guías.</span></p><p><strong>Sin respaldo suficiente</strong><span>El asistente indica que el contenido del sitio no permite responder esa consulta.</span></p></div></section>
<section class="chat-explorer-section" id="conocimiento" aria-labelledby="chat-graph-title" data-knowledge-graph="${hasGraph ? `${escapeHtml(base)}assets/certichat/graph.json` : ""}"><header><span class="eyebrow">02 / CONCEPTOS Y RELACIONES</span><h2 id="chat-graph-title">Explora el mapa de conocimiento</h2><p>Busca un concepto y selecciona sus conexiones para recorrer el grafo generado por Cognee.</p><p class="chat-graph-meta" data-graph-meta>Fuente: Cognee · Instantánea del índice de conocimiento.</p></header>
<p class="chat-graph-status" data-graph-status role="status">${hasGraph ? "Cargando el mapa de conocimiento…" : "La instantánea del grafo todavía no está publicada. Puedes consultar arriba cómo se prepara cada respuesta."}</p>
<div class="chat-graph-workspace" data-graph-workspace hidden><aside class="chat-graph-search"><label for="chat-concept-search">Buscar un concepto</label><input id="chat-concept-search" type="search" placeholder="Por ejemplo, OCI o agentes" autocomplete="off" aria-controls="chat-concept-results" aria-describedby="chat-concept-count"><p id="chat-concept-count" role="status"></p><ul id="chat-concept-results" aria-label="Conceptos encontrados"></ul></aside><div class="chat-graph-detail"><div class="chat-graph-selection"><span class="eyebrow">CONCEPTO SELECCIONADO</span><h3 data-concept-title></h3><p data-concept-summary></p></div><div class="chat-graph-canvas" data-graph-canvas></div><div class="chat-graph-relations"><h4>Relaciones del concepto</h4><ul data-graph-relations></ul><nav class="chat-graph-pager" aria-label="Más relaciones"><button class="button button-secondary" type="button" data-relations-previous>Anterior</button><span data-relations-page role="status"></span><button class="button button-secondary" type="button" data-relations-next>Siguiente</button></nav></div></div></div><noscript><p>Activa JavaScript para buscar conceptos y recorrer sus conexiones.</p></noscript></section>
<section class="chat-explorer-section" id="actualizacion" aria-labelledby="chat-update-title"><header><span class="eyebrow">03 / CONTENIDO ACTUALIZADO</span><h2 id="chat-update-title">De las guías al índice</h2><p>Cuando cambia el contenido publicado, se prepara una nueva versión del conocimiento.</p></header>${flow(updates)}<p class="chat-explorer-note">El mapa de esta página es una instantánea del índice, no una vista en tiempo real. Muestra conceptos del contenido publicado; no incluye conversaciones de participantes.</p></section>
</div>`;
}

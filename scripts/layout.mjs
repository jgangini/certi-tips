export const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

export function sidebar(site, course, active) {
  const link = (page, index) =>
    `<a class="nav-link ${active === page.slug ? "is-active" : ""}" href="${site.base}${course.id}/${page.slug}/" ${active === page.slug ? 'aria-current="page"' : ""}><span class="nav-number">${index === undefined ? "↗" : String(index).padStart(2, "0")}</span><span>${escapeHtml(page.short)}</span><span class="completion-dot" data-completion="${page.slug}" aria-hidden="true"></span></a>`;
  return `<aside class="sidebar" id="course-navigation" aria-label="Navegación del curso"><div class="sidebar-heading"><span class="eyebrow">TU RUTA DE APRENDIZAJE</span><strong>Agentic AI<br>Foundations <span>2026</span></strong><span class="exam-code">${course.exam.code}</span></div><div class="course-progress"><div><span>Tu avance</span><strong data-progress-label>0 de 7</strong></div><progress max="7" value="0" data-progress aria-label="Módulos completados"></progress></div><nav aria-label="Módulos"><span class="nav-label">APRENDE</span>${course.modules.map((page, i) => link(page, i)).join("")}<span class="nav-label">PREPÁRATE</span>${course.resources.map((page) => link(page)).join("")}</nav><a class="sidebar-source" href="https://mylearn.oracle.com/ou/learning-path/become-an-oci-agentic-ai-foundations-associate/163239">Abrir ruta oficial de Oracle <span aria-hidden="true">↗</span></a></aside>`;
}

export function layout({
  site,
  course,
  page,
  body,
  toc = [],
  previous,
  next,
  home = false,
}) {
  const courseRoot = `${site.base}${course.id}/`;
  const title = home
    ? "CertiTips · Entiende, practica, prepárate"
    : `${page.title} · CertiTips`;
  const canonical = `${site.origin}${home ? site.base : `${courseRoot}${page.slug}/`}`;
  const moduleNumber = course.modules.findIndex(
    (item) => item.slug === page.slug,
  );
  const isLesson = moduleNumber >= 0;
  const pager = !isLesson
    ? ""
    : `<nav class="page-navigation" aria-label="Continuar aprendizaje">${previous ? `<a href="${courseRoot}${previous.slug}/"><small>ANTERIOR</small>${escapeHtml(previous.short)} <span aria-hidden="true">←</span></a>` : "<span></span>"}${next ? `<a href="${courseRoot}${next.slug}/"><small>SIGUIENTE</small>${escapeHtml(next.short)} <span aria-hidden="true">→</span></a>` : `<a href="${courseRoot}practice/"><small>SIGUIENTE</small>Práctica explicada <span aria-hidden="true">→</span></a>`}</nav>`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escapeHtml(page.description || course.description)}"><meta name="theme-color" content="#b43d32"><title>${escapeHtml(title)}</title><link rel="canonical" href="${canonical}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(page.description || course.description)}"><meta property="og:type" content="website"><link rel="icon" href="${site.base}assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${site.base}assets/site.css"><script type="module" src="${site.base}assets/site.js"></script>${page.slug === "practice" ? `<script type="module" src="${site.base}assets/quiz.js"></script>` : ""}</head>
<body data-course="${course.id}" data-page="${page.slug || "home"}" data-base="${site.base}" class="${home ? "home-page" : "course-page"}"><a class="skip-link" href="#main">Saltar al contenido</a>
<header class="site-header"><a class="brand" href="${site.base}" aria-label="CertiTips, inicio"><img src="${site.base}assets/favicon.svg" width="36" height="36" alt=""><span>Certi<span class="brand-accent">Tips</span><small>APRENDE CON CRITERIO</small></span></a><nav class="header-links" aria-label="Principal"><a href="${courseRoot}overview/">La guía</a><a href="${courseRoot}talk/">Para tu charla</a><a class="button button-small" href="${courseRoot}practice/">Practicar <span aria-hidden="true">↗</span></a><a class="github-link" href="${site.repository}" aria-label="Repositorio en GitHub">GitHub <span aria-hidden="true">↗</span></a></nav>${home ? "" : '<button class="menu-toggle" type="button" aria-expanded="false" aria-controls="course-navigation">Menú</button>'}</header>
${home ? "" : sidebar(site, course, page.slug)}
<main id="main" class="${home ? "home-main" : "course-main"}" tabindex="-1">${home ? body : `<div class="breadcrumb"><a href="${site.base}">CertiTips</a><span aria-hidden="true">/</span><span>Agentic AI Foundations</span></div><div class="page-heading"><div class="eyebrow">${isLesson ? (moduleNumber ? `MÓDULO ${String(moduleNumber).padStart(2, "0")} / 06` : "ORIENTACIÓN") : "RECURSO DE ESTUDIO"} ${page.minutes ? `<span class="reading-time">LECTURA · ${page.minutes} MIN</span>` : ""}</div><h1>${escapeHtml(page.title)}</h1><p class="page-lead">${escapeHtml(page.description)}</p>${isLesson ? `<button type="button" class="complete-button" data-mark-complete="${page.slug}" aria-pressed="false">○ Marcar como completado</button>` : ""}</div>${toc.length ? `<details class="contents"><summary>En este apartado <span>${toc.length} secciones</span></summary><ol>${toc.map((item) => `<li><a href="#${item.id}">${escapeHtml(item.title)}</a></li>`).join("")}</ol></details>` : ""}<article class="prose">${body}</article>${pager}`}</main>
<footer class="site-footer"><span><strong>CertiTips</strong> · Por jgangini</span><span>Guía de estudio independiente · Edición 2026</span><a href="${site.repository}">Mejorar esta guía ↗</a></footer>
<dialog id="diagram-viewer" aria-labelledby="diagram-caption"><div class="dialog-toolbar"><p id="diagram-caption"></p><button type="button" data-close-diagram aria-label="Cerrar diagrama">Cerrar <kbd>Esc</kbd></button></div><div class="dialog-content"><img alt=""></div></dialog>
<noscript><p class="noscript-note">La guía se puede leer sin JavaScript. Actívalo para guardar tu progreso y usar la práctica interactiva.</p></noscript></body></html>`;
}

export function homeBody(site, course) {
  const root = `${site.base}${course.id}/`;
  return `<section class="home-hero"><div><div class="eyebrow"><span class="live-dot"></span> TU PRÓXIMA CERTIFICACIÓN EMPIEZA AQUÍ</div><h1>Entiende.<br>Practica.<br><em>Da el siguiente paso.</em></h1><p>Las ideas claras se quedan. Aprende con diagramas, conecta los conceptos y descubre qué necesitas repasar antes de tu examen.</p><div class="hero-actions"><a class="button" href="${root}overview/">Empezar la ruta <span aria-hidden="true">→</span></a><a class="text-link" href="${root}talk/">¿Vas a dar una charla? ↗</a></div><div class="hero-proof"><span>EN ESPAÑOL</span><span>ACCESO LIBRE</span><span>SIN REGISTRO</span></div></div><div class="hero-visual"><div class="visual-heading"><span>EL APRENDIZAJE, PASO A PASO</span><span>01 — 03</span></div><div class="learning-step"><span>01</span><div><strong>Construye tu base</strong><p>Seis temas. Un mapa claro.</p></div><i aria-hidden="true">↗</i></div><div class="learning-step"><span>02</span><div><strong>Conecta las piezas</strong><p>Diagramas y casos que explican el porqué.</p></div><i aria-hidden="true">↗</i></div><div class="learning-step accent-step"><span>03</span><div><strong>Practica con intención</strong><p>Cada respuesta es una oportunidad de aprender.</p></div><i aria-hidden="true">✓</i></div><div class="visual-foot"><span class="live-dot"></span>Tu progreso se guarda en este navegador.</div></div></section>
<section class="course-catalog" aria-labelledby="available-routes"><div class="section-heading"><div><div class="eyebrow">LA PRIMERA RUTA</div><h2 id="available-routes">De la idea al agente.</h2></div><span class="subtle">Más claridad. Mejor preparación.</span></div><div class="featured-course"><div class="course-card-intro"><span class="tag">ORACLE · ASSOCIATE · 2026</span><h3>${course.title}</h3><p>${course.description}</p><a class="button button-light" href="${root}overview/">Explorar la guía →</a><span class="course-card-code">${course.exam.code}</span></div><div class="course-card-details"><div class="course-metrics"><div><strong>06</strong><span>módulos técnicos</span></div><div><strong>10</strong><span>diagramas visuales</span></div><div><strong>36</strong><span>preguntas originales</span></div></div><ol class="topic-list">${course.modules
    .filter((item) => item.type === "module")
    .map(
      (item) =>
        `<li><a href="${root}${item.slug}/">${escapeHtml(item.short)} <span aria-hidden="true">↗</span></a></li>`,
    )
    .join("")}</ol></div></div></section>
<section class="approach-grid" aria-label="Cómo usar CertiTips"><a href="${root}study-path/"><span class="eyebrow">A TU RITMO</span><h2>Siete sesiones.<br>Un objetivo concreto.</h2><p>Un plan para estudiar, practicar y volver sobre lo que cuesta.</p><span class="text-link">Ver plan de estudio →</span></a><a href="${root}practice/"><span class="eyebrow">PRACTICA PARA ENTENDER</span><h2>La respuesta importa.<br>El porqué, también.</h2><p>12 preguntas por intento, con explicación y un enlace para repasar.</p><span class="text-link">Empezar práctica →</span></a><a href="${root}exam-checklist/"><span class="eyebrow">EL SIGUIENTE PASO</span><h2>Llega con un plan<br>al examen oficial.</h2><p>Revisa los requisitos, completa la ruta de Oracle y evalúa tu preparación.</p><span class="text-link">Ver checklist →</span></a></section>`;
}

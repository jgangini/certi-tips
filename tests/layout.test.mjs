import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import MarkdownIt from "markdown-it";
import { layout, sidebar, homeBody } from "../scripts/layout.mjs";

const site = {
  base: "/certi-tips/", origin: "https://example.test", repository: "https://example.test/repo",
  paths: [
    { id: "foundation-sprint", label: "Foundation Sprint", items: [{ id: "course", title: "Course", guide: "course", officialUrl: "https://mylearn.oracle.com/example" }, { id: "pending", title: "Pending course", officialUrl: "https://mylearn.oracle.com/pending" }] },
    { id: "ai-first", label: "AI & Agents", items: [] },
    { id: "ai-data-layer", label: "Data & AI", items: [] },
    { id: "oci-enablers", label: "Architecture", items: [] },
  ],
};
const course = {
  id: "course",
  title: "Curso de prueba", edition: "2026",
  description: "A study guide",
  exam: { code: "EXAM-1" },
  modules: [
    { slug: "overview", short: "Empieza aquí", title: "Introducción", description: "Orientación" },
    { slug: "agents", short: "Agentes de IA", title: "Agentes", description: "Aprende agentes" },
  ],
  resources: [{ slug: "review", short: "Repaso final", title: "Repaso", description: "Prepara el examen" }],
};
const tocByPage = new Map([
  ["overview", [{ id: "primeros-pasos", title: "Primeros pasos" }]],
  ["agents", [{ id: "conceptos-clave", title: "Conceptos <clave> & seguridad" }]],
  ["review", [{ id: "practicar", title: "Antes de practicar" }]],
]);

test("sidebar has native module and resource disclosures with only the active branch open", () => {
  const html = sidebar(site, course, "agents", tocByPage);
  const branches = [...html.matchAll(/<details\b([^>]*)>(.*?)<\/details>/gs)];
  assert.equal(branches.length, 3);
  assert.equal(branches.filter(([, attributes]) => /\sopen(?:\s|$)/.test(attributes)).length, 1);
  assert.match(branches[1][1], /data-nav-page="agents" open/);
  assert.equal((html.match(/<summary class="nav-toggle"/g) || []).length, 3);
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(html, /<a class="nav-link" href="\/certi-tips\/EXAM-1\/agents\/" aria-current="page">/);
  assert.match(branches[1][2], /<summary class="nav-toggle" aria-label="Secciones de Agentes de IA"><\/summary>/);
  assert.doesNotMatch(html, /Ver módulo/);
  assert.match(html, /href="\/certi-tips\/EXAM-1\/review\/"/);
  assert.match(branches[2][2], /href="\/certi-tips\/EXAM-1\/review\/#practicar">Antes de practicar/);
  assert.doesNotMatch(html, /role="tree(?:item)?"/);
  assert.doesNotMatch(html, /sidebar-all-paths|Ver todas las certificaciones/);
  assert.doesNotMatch(html, /sidebar-source|Abrir ruta oficial de Oracle/);
  assert.doesNotMatch(html, /TU RUTA DE APRENDIZAJE/);
  assert.match(html, /<span class="exam-code">EXAM-1<\/span><strong>Curso de prueba 2026<\/strong>/);
  assert.match(html, /<nav aria-label="Contenido de la guía" tabindex="0">/);
  assert.match(html, /data-completion="agents"/);
});

test("retired resources stay unpublished and overview contains only its retained sections", () => {
  const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
  const actualCourse = catalog.courses.find((item) => item.id === "agentic-ai-foundations-2026");
  assert.deepEqual(actualCourse.resources.map((item) => item.slug), ["glossary", "exam-checklist", "practice"]);
  const overview = readFileSync(new URL("../content/overview.md", import.meta.url), "utf8");
  assert.doesNotMatch(overview, /certification-roadmap/);
  const headings = [...overview.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  assert.deepEqual(headings, ["Objetivos y examen", "Antes de comenzar", "Acceso al recorrido oficial"]);
  const retained = ["objetivos-y-examen", "antes-de-comenzar", "acceso-al-recorrido-oficial"];
  const toc = new Map([["overview", retained.map((id, index) => ({ id, title: headings[index] }))]]);
  const html = sidebar(catalog, actualCourse, "overview", toc);
  for (const slug of ["study-path", "review"]) assert.doesNotMatch(html, new RegExp(`data-nav-page="${slug}"`));
  for (const id of retained) assert.match(html, new RegExp(`overview/#${id}`));
});

test("hero animation follows the catalog's Foundation Sprint order and levels", () => {
  const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
  const animation = readFileSync(new URL("../videos/certification-path-motion/compositions/hw-pipeline.html", import.meta.url), "utf8");
  const host = readFileSync(new URL("../videos/certification-path-motion/index.html", import.meta.url), "utf8");
  const base = animation.match(/const base = \[([\s\S]*?)\];/)?.[1];
  assert.ok(base);
  assert.deepEqual([...base.matchAll(/title: "([^"]+)"/g)].map((match) => match[1]), catalog.paths[0].items.map((item) => item.title));
  assert.match(animation, /label\(baseLabels,[^\n]+"Nivel 1"/);
  assert.equal((animation.match(/level: "Niveles 2–3"/g) || []).length, 2);
  assert.match(animation, /title: "Architecture", level: "Nivel 2"/);
  assert.doesNotMatch(animation, /OCI Architecture/);
  assert.match(animation, /strokeDashoffset: length, opacity: 0/);
  assert.match(animation, /tl\.set\(element, \{ opacity: 1 \}, start\)/);
  assert.match(animation, /#hw-pl-headline, #hw-pl-route-heading \{/);
  assert.doesNotMatch(animation, /hw-pl-footnote|Tres rutas opcionales/);
  assert.match(animation, /data-duration="15\.5"/);
  assert.match(host, /data-duration="15\.5"/);
  assert.match(animation, /14\.75\);/);
});

test("every technical section has a captioned local graphic and exercise solutions stay hidden", () => {
  const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
  const modules = catalog.courses[0].modules.filter((module) => module.type === "module");
  assert.equal(modules.length, 6);
  const markdown = new MarkdownIt({ html: true });
  for (const module of modules) {
    const source = readFileSync(new URL(`../content/${module.slug}.md`, import.meta.url), "utf8");
    const tokens = markdown.parse(source, {});
    const sections = [];
    let section;
    let detailsDepth = 0;
    for (const [index, token] of tokens.entries()) {
      if (token.type === "heading_open" && token.tag === "h2") {
        section = { title: tokens[index + 1].content, images: [] };
        sections.push(section);
      }
      if (token.type === "html_block") {
        for (const tag of token.content.matchAll(/<\/?details\b[^>]*>/gi)) detailsDepth += tag[0].startsWith("</") ? -1 : 1;
      }
      for (const image of token.children?.filter((child) => child.type === "image") || []) {
        if (section) section.images.push({ image, hidden: detailsDepth > 0 });
      }
    }
    assert.ok(sections.length, `${module.slug} has no technical sections`);
    for (const { title, images } of sections) {
      const label = `${module.slug} / ${title}`;
      assert.ok(images.length, `${label} needs an explanatory graphic`);
      for (const { image, hidden } of images) {
        assert.match(decodeURIComponent(image.attrGet("src")), /^\{\{base\}\}assets\/(?:diagrams|illustrations)\/.+\.(?:svg|png|jpe?g|webp)$/i, `${label} needs a local image`);
        const caption = (image.attrGet("title") || image.content).trim();
        assert.ok(caption && caption.length <= 140 && !/ampliar diagrama/i.test(caption), `${label} needs a brief descriptive caption`);
        if (/^Ejercicio\b/i.test(title)) assert.ok(hidden, `${label} must keep its solution graphic inside details`);
      }
    }
  }
});

test("every sidebar branch links to its own rendered headings with a full base path", () => {
  const html = sidebar(site, course, "agents", tocByPage);
  for (const [slug, sections] of tocByPage) {
    assert.ok(html.includes(`href="/certi-tips/EXAM-1/${slug}/"`));
    for (const section of sections) assert.ok(html.includes(`href="/certi-tips/EXAM-1/${slug}/#${section.id}"`));
  }
  const css = readFileSync(new URL("../assets/site.css", import.meta.url), "utf8");
  assert.match(css, /\.nav-toggle\s*\{[^}]*width:\s*44px;\s*height:\s*44px;/);
  assert.ok(html.includes("Conceptos &lt;clave&gt; &amp; seguridad"));
  assert.doesNotMatch(html, /href="#/);
  assert.ok(sidebar(site, course, "review").includes('<a class="nav-link" href="/certi-tips/EXAM-1/review/" aria-current="page">'));
});

test("practice in Prepárate opens the simulator landing directly", () => {
  const practiceCourse = { ...course, resources: [...course.resources, { slug: "practice", short: "Práctica" }] };
  const practice = sidebar(site, practiceCourse, "practice");
  assert.match(practice, /PREPÁRATE[^]*<a class="nav-link nav-direct" href="\/certi-tips\/EXAM-1\/practice\/" aria-current="page">[^]*<span class="nav-title">Práctica<\/span><\/a>/);
  assert.match(practice, /href="\/certi-tips\/EXAM-1\/practice\/" aria-current="page"/);
  assert.doesNotMatch(practice, /data-nav-page="practice"|Ver recurso<span class="visually-hidden">: Práctica|Práctica explicada/);
});

test("layout moves the contents into the sidebar while preserving reading and site controls", () => {
  const html = layout({ site, course, page: course.modules[1], tocByPage, body: '<h2 id="conceptos-clave">Conceptos</h2>' });
  assert.match(html, /<nav class="breadcrumb" aria-label="Ruta de navegación"><a href="\/certi-tips\/EXAM-1\/overview\/">Curso de prueba 2026<\/a><span aria-hidden="true">\/<\/span><span aria-current="page">Agentes de IA<\/span><\/nav>/);
  assert.doesNotMatch(html, /Todas las certificaciones/);
  assert.doesNotMatch(html, /class="contents"|En este apartado/);
  assert.match(html, /<aside[^]*href="\/certi-tips\/EXAM-1\/agents\/#conceptos-clave"[^]*<\/aside>/);
  assert.match(html, /<article class="prose"><h2 id="conceptos-clave">Conceptos<\/h2><\/article>/);
  assert.match(html, /class="site-footer"/);
  assert.match(html, /Made with .* at CertiTips .* Developed by <a href="https:\/\/www\.linkedin\.com\/in\/jgangini\/"[^>]*>Joel Gangini<\/a>/);
  assert.doesNotMatch(html, /Mejorar esta guía/);
  assert.match(html, /id="diagram-viewer"/);
  assert.match(html, /data-mark-complete="agents"/);
  assert.doesNotMatch(html, /MÓDULO 01 \/ 06|LECTURA ·/);
  assert.match(html, /<article class="prose">[^]*<\/article><div data-completion-trigger aria-hidden="true"><\/div><button[^>]+data-mark-complete="agents"[^>]+hidden>/);
  assert.match(html, /<summary>Foundation Sprint<\/summary>/);
  assert.doesNotMatch(html, /Ver grupo completo/);
  assert.match(html, /href="\/certi-tips\/course\/overview\/">Course<\/a>/);
  assert.match(html, /href="https:\/\/mylearn\.oracle\.com\/pending" target="_blank" rel="noopener noreferrer"[^>]*>Pending course<span class="coming-soon"/);
  assert.doesNotMatch(html, /href="\/certi-tips\/#(?:course|pending)"/);
  assert.match(html, /data-theme-toggle aria-pressed="false"/);
  assert.doesNotMatch(html, /data-theme-label|>Dark mode<\/span>/);
  assert.match(html, /data-search-open aria-keyshortcuts="Control\+K Meta\+K"/);
  assert.doesNotMatch(html, /<a[^>]+>La guía<\/a>|>Practicar <span/);
});

test("lesson completion floats above the next-page navigation", () => {
  const html = layout({ site, course, page: course.modules[1], body: "" });
  const buttonAt = html.indexOf('data-mark-complete="agents"');
  assert.ok(buttonAt >= 0 && html.indexOf('<nav class="page-navigation"') > buttonAt);
  const css = readFileSync(new URL("../assets/site.css", import.meta.url), "utf8");
  const rule = css.match(/\.complete-button\s*\{([^}]*)\}/)?.[1];
  assert.match(rule, /position:\s*sticky;/);
  assert.match(rule, /margin:\s*24px 0 0 auto;/);
  assert.match(css, /\.course-main\.lesson-main\s*\{\s*padding-bottom:\s*40px;/);
});

test("selected navigation uses contrasting gray in both themes and keeps blue-gray section hover", () => {
  const css = readFileSync(new URL("../assets/site.css", import.meta.url), "utf8");
  assert.match(css, /--selected-surface:\s*#59616e;\s*--selected-ink:\s*#fff;/);
  assert.match(css, /html\[data-theme="dark"\]\s*\{[^}]*--selected-surface:\s*#414653;/);
  assert.match(css, /\.path-group summary:hover,\s*\.path-group\[open\] summary\s*\{\s*background:\s*var\(--selected-surface\);\s*color:\s*var\(--selected-ink\);/);
  assert.match(css, /\.path-group-panel a:is\(:hover, :focus-visible\)\s*\{\s*background:\s*var\(--selected-surface\);\s*color:\s*var\(--selected-ink\);/);
  assert.match(css, /\.nav-link\[aria-current="page"\]\s*\{\s*background:\s*var\(--selected-surface\);\s*color:\s*var\(--selected-ink\);/);
  assert.match(css, /\.nav-section-link:hover\s*\{\s*color:\s*var\(--ink\);\s*background:\s*var\(--hover\);/);
});

test("the certification breadcrumb identifies LangChain by its module label", () => {
  const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
  const currentCourse = catalog.courses[0];
  assert.equal(`${currentCourse.title} ${currentCourse.edition}`, catalog.paths[0].items.find((item) => item.guide === currentCourse.id).title);
  const html = layout({ site: catalog, course: currentCourse, page: currentCourse.modules.find((item) => item.slug === "langchain"), body: "" });
  assert.match(html, /<nav class="breadcrumb"[^>]*><a href="\/certi-tips\/1Z0-1157-26\/overview\/">Oracle Agentic AI Foundations Associate 2026<\/a><span aria-hidden="true">\/<\/span><span aria-current="page">LangChain<\/span>/);
  assert.match(html, /<body data-course="agentic-ai-foundations-2026"/);
});

test("search lists certifications before typing and keeps study topics available for filtering", () => {
  const html = layout({ site, course, page: course.modules[0], body: "" });
  const search = html.match(/<dialog id="site-search"[\s\S]*?<\/dialog>/)[0];
  assert.equal((search.match(/data-search-kind="certification"/g) || []).length, 2);
  assert.equal((search.match(/data-search-kind="topic"[^>]* hidden/g) || []).length, 3);
  assert.match(search, /aria-controls="search-results"/);
  assert.match(search, /data-search-empty hidden/);
  assert.doesNotMatch(search, /Escribe para buscar certificaciones/);
});

test("home shows each FY27 certification once and links only the available guide locally", () => {
  const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
  const items = catalog.paths.flatMap((path) => path.items);
  assert.deepEqual(catalog.paths.map((path) => path.id), ["foundation-sprint", "ai-first", "ai-data-layer", "oci-enablers"]);
  assert.equal(catalog.paths[0].title, "Foundation");
  assert.equal(items.length, 11);
  assert.equal(new Set(items.map((item) => item.title)).size, items.length);
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  assert.deepEqual(catalog.paths[0].items.map((item) => item.level), [1, 1, 1, 1]);
  assert.ok(catalog.paths.slice(1).every((path) => path.items.every((item, index) => item.level >= 2 && (index === 0 || item.level >= path.items[index - 1].level))));
  assert.equal(items.filter((item) => item.level === 3).length, 2);
  assert.deepEqual(items.filter((item) => item.guide).map((item) => item.guide), ["agentic-ai-foundations-2026"]);
  assert.ok(items.every((item) => item.officialUrl.startsWith("https://mylearn.oracle.com/")));
  const html = homeBody(catalog);
  assert.equal((html.match(/class="certification-item/g) || []).length, 11);
  assert.equal((html.match(/class="button button-small certitips-button" href=/g) || []).length, 1);
  assert.equal((html.match(/class="button button-small certitips-button" type="button" disabled/g) || []).length, 10);
  assert.equal((html.match(/<section class="path-section/g) || []).length, 4);
  assert.match(html, /data-group-carousel/);
  assert.match(html, /data-group-next/);
  assert.match(html, /data-group-carousel><section[^]*?<nav class="group-carousel-controls"/);
  assert.doesNotMatch(html, /data-group-carousel><nav class="group-carousel-controls"/);
  assert.equal((html.match(/class="group-carousel-controls"/g) || []).length, 1);
  assert.match(html, /class="path-section path-foundation is-active"/);
  assert.match(html, /<h2 id="foundation-sprint-title">Foundation<\/h2>/);
  assert.match(html, /Foundation reúne cuatro certificaciones de nivel 1/);
  assert.match(html, /Foundation · 1 de 4/);
  assert.match(html, /<svg viewBox="0 0 16 16"[^>]*fill="currentColor"/);
  assert.match(html, /href="\/certi-tips\/1Z0-1157-26\/overview\/"/);
  assert.match(html, /id="oci-enablers"/);
  assert.match(html, /ORACLE CLOUD INFRASTRUCTURE/);
  assert.match(html, /class="hero-copy"/);
  assert.match(html, /class="hero-flow is-unavailable"/);
  assert.doesNotMatch(html, /assets\/motion\/certification-path\.mp4/);
  const withMotion = homeBody(catalog, true);
  assert.match(withMotion, /assets\/motion\/certification-path\.mp4/);
  assert.match(withMotion, /data-hero-flow autoplay loop muted playsinline/);
  assert.doesNotMatch(withMotion, /data-hero-replay|Repetir animación/);
  assert.match(withMotion, /Cuatro certificaciones de nivel 1/);
  assert.match(html, /OCI AI Foundations Associate 2026/);
  assert.match(html, /class="button github-link"[^>]*>.*?GitHub<\/a>/);
  assert.doesNotMatch(html, /View on GitHub|button-secondary github-link/);
  assert.doesNotMatch(html, /Ver el recorrido|30 de septiembre de 2026|catalog-disclaimer/);
  assert.equal(catalog.paths[3].label, "Architecture");
  assert.equal(catalog.paths[0].label, "Foundation");
  assert.match(catalog.paths[0].items[1].officialUrl, /associate-2026\/163544$/);
  const navigation = layout({ site: catalog, course, page: course.modules[0], body: html, home: true }).match(/<nav class="path-nav"[^>]*>(.*?)<\/nav>/s)[1];
  assert.match(navigation, /<summary>Foundation<\/summary>/);
  for (const item of items) {
    const destination = item.guide ? `${catalog.base}${catalog.courses.find((course) => course.id === item.guide).exam.code}/overview/` : item.officialUrl;
    assert.ok(navigation.includes(`href="${destination}"`), `${item.title} does not link directly to its certification`);
  }
  assert.equal((navigation.match(/class="coming-soon"/g) || []).length, 10);
});

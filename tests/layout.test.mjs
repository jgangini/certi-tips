import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import MarkdownIt from "markdown-it";
import { layout, sidebar, homeBody, certiquizBody } from "../scripts/layout.mjs";

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
site.courses = [course];

test("sharing uses an English Oracle overview and a public PNG icon on every page type", () => {
  const home = layout({ site, course, page: course.modules[0], body: "", home: true });
  assert.match(home, /<title>CertiTips · Oracle Certification Paths<\/title>/);
  assert.match(home, /<meta name="description" content="Explore Oracle certification paths with visual study guides in Spanish, explained practice questions, and CertiQuiz team quizzes\."/);
  assert.doesNotMatch(home, /Ruta de certificaciones en Data e IA|Foundation Sprint y rutas/);
  for (const html of [home, layout({ site, course, page: course.modules[0], body: "" }), layout({ site, course, page: { slug: "certiquiz", title: "CertiQuiz" }, body: "" })]) {
    assert.match(html, /<meta property="og:image" content="https:\/\/example\.test\/certi-tips\/assets\/favicon\.png">/);
    assert.match(html, /<meta property="og:image:type" content="image\/png">/);
    assert.match(html, /<meta property="og:image:width" content="512"><meta property="og:image:height" content="512">/);
    assert.match(html, /<meta property="og:image:alt" content="CertiTips logo">/);
    assert.match(html, /<meta property="og:url" content="https:\/\/example\.test\/certi-tips\//);
    assert.match(html, /<link rel="icon" href="\/certi-tips\/assets\/favicon\.png" type="image\/png" sizes="512x512">/);
  }
  const icon = readFileSync(new URL("../assets/favicon.png", import.meta.url));
  assert.equal(icon.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(icon.readUInt32BE(16), 512);
  assert.equal(icon.readUInt32BE(20), 512);
});
test("home keeps CertiQuiz beside GitHub inside the site in the same tab", () => {
  const html = homeBody(site);
  const css = readFileSync(new URL("../assets/site.css", import.meta.url), "utf8");
  assert.match(html, /class="hero-actions"><a class="button github-link"[^]*?<a class="button button-secondary certiquiz-link" href="\/certi-tips\/certiquiz\/">/);
  assert.match(html, /certiquiz-link"[^>]*><svg viewBox="0 0 1920 1920" width="20" height="20" fill="currentColor"[^]*?m746\.255 1466\.764/);
  assert.doesNotMatch(html.match(/<a class="button button-secondary certiquiz-link"[^>]*>/)[0], /target=/);
  assert.match(css, /\.hero-actions \.certiquiz-link\s*\{[^}]*border:\s*1px solid var\(--red\);/);
});
test("CertiQuiz role choices are full-card buttons without duplicate actions", () => {
  const script = readFileSync(new URL("../assets/certiquiz.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../assets/certiquiz.css", import.meta.url), "utf8");
  const siteCss = readFileSync(new URL("../assets/site.css", import.meta.url), "utf8");
  assert.match(script, /<button class="card join-card role-card" type="button" data-role="host" aria-label="Crear una partida como anfitrión">/);
  assert.match(script, /<button class="card join-card role-card" type="button" data-role="player" aria-label="Unirme a una partida como participante">/);
  assert.match(script, /const hostRoleIcon = '<svg viewBox="0 0 31\.381 31\.381" fill="currentColor" aria-hidden="true" focusable="false">/);
  assert.match(script, /const playerRoleIcon = '<svg viewBox="0 0 297 297" fill="currentColor" aria-hidden="true" focusable="false">/);
  assert.match(script, /<span class="role-icon" aria-hidden="true">\${hostRoleIcon}<\/span><span class="role-copy">/);
  assert.match(script, /<span class="role-icon" aria-hidden="true">\${playerRoleIcon}<\/span><span class="role-copy">/);
  assert.doesNotMatch(script, /role-action/);
  assert.doesNotMatch(script, /ORGANIZA LA PARTIDA|APRENDE CON TU EQUIPO/);
  assert.match(script, /const welcome = role => `[^`]*<nav class="certiquiz-breadcrumb" aria-label="Ruta de navegación"><a href="\$\{siteBase\}">Home<\/a><span aria-hidden="true">\/<\/span>\$\{role \? `<a href="\$\{siteBase\}certiquiz\/">CertiQuiz<\/a><span aria-hidden="true">\/<\/span><span aria-current="page">\$\{role === 'host' \? 'Anfitrión' : 'Participante'\}<\/span>` : '<span aria-current="page">CertiQuiz<\/span>'\}/);
  assert.doesNotMatch(script, /data-change-role|Cambiar rol/);
  assert.match(css, /\.certiquiz-app \.role-card\s*\{[^}]*width:\s*100%;[^}]*cursor:\s*pointer;/);
  assert.match(css, /\.certiquiz-app \.role-icon\s*\{[^}]*flex:\s*0 0 64px;[^}]*width:\s*64px;[^}]*height:\s*64px;/);
  assert.match(css, /\.certiquiz-app \.role-icon svg\s*\{[^}]*width:\s*52px;[^}]*height:\s*52px;/);
  assert.match(css, /\.certiquiz-app \.role-card:is\(:hover, :focus-visible\)\s*\{[^}]*border-color:\s*var\(--accent\);/);
  assert.match(css, /\.certiquiz-app \.certiquiz-breadcrumb\s*\{[^}]*border-top:\s*1px solid var\(--line\);/);
  assert.match(siteCss, /\.search-toggle\s*\{[^}]*background:\s*var\(--paper\);/);
  assert.match(siteCss, /\.search-toggle kbd\s*\{[^}]*display:\s*inline-flex;[^}]*padding:\s*3px 6px;[^}]*border:\s*1px solid var\(--line\);[^}]*border-radius:\s*999px;[^}]*background:\s*var\(--hover\);/);
});
test("CertiQuiz host setup labels the room step and aligns its submit control", () => {
  const script = readFileSync(new URL("../assets/certiquiz.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../assets/certiquiz.css", import.meta.url), "utf8");
  assert.match(script, /<li class="certification-item setup-actions"><div><span class="certification-number" aria-hidden="true"><\/span><span class="setup-label">Generar Sala<\/span><p class="hint">Hasta \$\{limits\.maxPlayers\}/);
  assert.match(script, /<button class="button" type="submit" \$\{catalog\.courses\.length \? '' : 'disabled'\}>Comenzar<\/button>/);
  assert.doesNotMatch(script, /\$\{roomIcon\} Generar Sala/);
  assert.match(css, /\.certiquiz-app \.host-entry \.setup-actions \.button\s*\{\s*width:\s*140px;\s*justify-self:\s*end;/);
  assert.match(css, /@media \(max-width: 720px\) \{ \.certiquiz-app \.host-entry \.setup-actions \.button \{ width: 100%; \} \}/);
});
test("CertiQuiz shares site navigation and theme without a course sidebar", () => {
  const html = layout({ site, course, page: { slug: 'certiquiz', title: 'CertiQuiz', description: 'Practica en equipo.' }, body: certiquizBody('https://api.example.test') });
  assert.match(html, /<title>CertiQuiz · CertiTips<\/title>/);
  assert.match(html, /rel="canonical" href="https:\/\/example\.test\/certi-tips\/certiquiz\/"/);
  assert.match(html, /class="home-page certiquiz-page"/);
  assert.match(html, /class="site-header"/);
  assert.match(html, /class="site-footer"/);
  assert.match(html, /data-theme-toggle/);
  assert.match(html, /src="\/certi-tips\/assets\/site\.js"/);
  assert.match(html, /src="\/certi-tips\/assets\/qrcode-generator\.js"/);
  assert.match(html, /src="\/certi-tips\/assets\/certiquiz\.js"/);
  assert.match(html, /href="\/certi-tips\/assets\/certiquiz\.css"/);
  assert.match(html, /data-api-origin="https:\/\/api\.example\.test"/);
  assert.match(html, /<div id="app" aria-busy="true"><section class="loading loading-full"><h1>Preparando tu próxima partida…<\/h1><p role="status">Conectando con la sala de práctica\.<\/p><\/section>/);
  const certiquizCss = readFileSync(new URL("../assets/certiquiz.css", import.meta.url), "utf8");
  assert.match(certiquizCss, /\.certiquiz-app \.loading-full\s*\{[^}]*width:\s*100%;[^}]*min-height:\s*calc\(100dvh - var\(--header\) - var\(--footer-height\)\);[^}]*border:\s*0;/);
  assert.doesNotMatch(certiquizBody('https://api.example.test'), /id="(?:error|connection|announcement)"/);
  const errorRocket = certiquizBody('https://api.example.test').match(/<template id="certiquiz-rocket">([^]*?)<\/template>/)[1];
  const homeRocket = homeBody(site).match(/certiquiz-link"[^>]*>(<svg[^]*?<\/svg>)/)[1];
  assert.deepEqual([...errorRocket.matchAll(/<path d="([^"]+)"/g)].map(match => match[1]), [...homeRocket.matchAll(/<path d="([^"]+)"/g)].map(match => match[1]));
  assert.doesNotMatch(html, /id="course-navigation"|class="menu-toggle"|src="[^\"]*\/quiz\.js"/);
});
test("CertiQuiz renders a plain local invitation QR", () => {
  const script = readFileSync(new URL("../assets/certiquiz.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../assets/certiquiz.css", import.meta.url), "utf8");
  const build = readFileSync(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  assert.match(script, /window\.qrcode\(0, 'H'\)/);
  assert.match(script, /class="invite-qr-code"/);
  assert.doesNotMatch(script, /invite-qr-logo|Escanea para unirte|assets\/favicon\.svg/);
  assert.match(css, /\.certiquiz-app \.invite-overview\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 166px;/);
  assert.match(css, /\.certiquiz-app \.invite-qr svg\s*\{[^}]*display:\s*block;[^}]*width:\s*100%;[^}]*background:\s*#fff;/);
  assert.doesNotMatch(css, /invite-qr-logo|\.invite-qr figcaption/);
  assert.match(build, /node_modules", "qrcode-generator", "qrcode\.js"/);
});
test("the local QR generator encodes an invitation URL as SVG", () => {
  const context = {};
  vm.runInNewContext(readFileSync(new URL("../node_modules/qrcode-generator/qrcode.js", import.meta.url), "utf8"), context);
  const qr = context.qrcode(0, "H");
  qr.addData("https://example.test/certi-tips/certiquiz/?room=601518");
  qr.make();
  assert.match(qr.createSvgTag({ scalable: true, title: "Código QR", alt: "Invitación" }), /<svg[^>]*role="img"[^>]*><title[^>]*>Código QR<\/title>/);
});
test("CertiQuiz host lobby keeps facts beside its actions and uses a compact confirmation dialog", () => {
  const script = readFileSync(new URL("../assets/certiquiz.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../assets/certiquiz.css", import.meta.url), "utf8");
  assert.doesNotMatch(script, /500–1000 puntos por acierto/);
  assert.match(script, /const hostFooter = `<div class="lobby-footer">\$\{facts\}<div class="actions game-actions">/);
  assert.match(script, /room\.status !== 'lobby' && !document\.querySelector\('\[data-confirm\]\[open\]'\)/);
  assert.match(css, /\.certiquiz-app \.lobby-footer\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*space-between;/);
  assert.match(css, /\.certiquiz-app \.confirmation\s*\{[^}]*width: min\(400px, calc\(100vw - 32px\)\);/);
  assert.match(css, /\.certiquiz-app \.confirmation-icon\s*\{[^}]*width: 76px;[^}]*height: 76px;/);
  assert.match(css, /\.certiquiz-app \.confirmation-actions \.button\s*\{[^}]*min-height: 52px;/);
});
const tocByPage = new Map([
  ["overview", [{ id: "primeros-pasos", title: "Primeros pasos" }]],
  ["agents", [{ id: "conceptos-clave", title: "Conceptos <clave> & seguridad" }]],
  ["review", [{ id: "practicar", title: "Antes de practicar" }]],
]);

test("mobile path navigation uses a menu icon and a responsive panel below the header", () => {
  const html = layout({ site, course, page: course.modules[0], body: "", home: true });
  const css = readFileSync(new URL("../assets/site.css", import.meta.url), "utf8");
  assert.match(html, /<details class="path-nav-mobile"><summary aria-label="Abrir grupos de certificaciones"><svg[^>]*width="22" height="22"[^>]*><path d="M4 6h16M4 12h10M4 18h5"\/><\/svg><span class="visually-hidden">Grupos de certificaciones<\/span><\/summary><div class="path-nav-mobile-panel"><nav aria-label="Grupos de certificaciones">/);
  assert.doesNotMatch(html, /<summary>Paths<\/summary>/);
  assert.match(html, /<g class="theme-sun"><circle cx="12" cy="12" r="3\.5"\/><path d="M12 5V3M12 21v-2/);
  assert.doesNotMatch(html, /M12 2v2m0 16v2/);
  assert.match(css, /\.path-nav-mobile summary \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/);
  assert.match(css, /\.path-nav-mobile-panel \{[\s\S]*?top: 100%;[\s\S]*?left: 0;[\s\S]*?width: 100%;[\s\S]*?max-height: calc\(100dvh - var\(--header\) - var\(--footer-height\)\);[\s\S]*?background: var\(--sidebar-bg\);[\s\S]*?border-radius: 0;/);
  assert.match(css, /\.path-nav-mobile \.path-group-panel \{[\s\S]*?background: transparent;/);
  assert.match(css, /\.path-nav-mobile \.path-group-panel a:is\(:hover, :focus-visible\)\s*\{\s*background: transparent;\s*color: var\(--ink\);\s*text-decoration: none;/);
  assert.match(css, /\.path-nav-mobile \.path-group-panel a:is\(:hover, :focus-visible\) \.path-title\s*\{\s*text-decoration: underline;/);
  assert.match(css, /html\[data-theme="dark"\] \.path-nav-mobile \.path-group-panel a:is\(:hover, :focus-visible\)\s*\{\s*background: var\(--hover\);/);
  assert.match(css, /\.path-nav-mobile \.path-group summary:is\(:hover, :focus-visible\)\s*\{\s*background: var\(--selected-surface\);\s*color: var\(--selected-ink\);/);
});

test("mobile course navigation keeps the grid icon next to the certification menu", () => {
  const html = layout({ site, course, page: course.modules[0], body: "" });
  const css = readFileSync(new URL("../assets/site.css", import.meta.url), "utf8");
  const courseMenu = html.indexOf('class="menu-toggle"');
  const pathMenu = html.indexOf('class="path-nav-mobile"');
  assert.ok(courseMenu > 0 && courseMenu < pathMenu);
  assert.match(html, /<button class="menu-toggle" type="button" aria-expanded="false" aria-controls="course-navigation" aria-label="Contenido del curso"><svg viewBox="0 0 21 21" width="21" height="21"[^>]*><rect x="2\.5" y="2\.5" width="6" height="6" rx="1"\/><rect x="12\.5" y="2\.5" width="6" height="6" rx="1"\/><rect x="2\.5" y="12\.5" width="6" height="6" rx="1"\/><rect x="12\.5" y="12\.5" width="6" height="6" rx="1"\/><\/svg><span class="visually-hidden">Contenido del curso<\/span><\/button>/);
  assert.doesNotMatch(html, /aria-controls="course-navigation">Menú<\/button>/);
  assert.match(css, /\.menu-toggle \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/);
  assert.match(css, /\.menu-toggle:is\(:hover, \[aria-expanded="true"\]\)\s*\{\s*background: var\(--selected-surface\);\s*color: var\(--selected-ink\);/);
  assert.match(css, /@media \(max-width: 800px\) \{[\s\S]*?\.menu-toggle \{\s*display: inline-flex;\s*margin-left: auto;\s*\}[\s\S]*?\.path-nav-mobile \{\s*margin-left: 0;\s*\}/);
});

test("mobile home groups header controls and hides the suggested certification flow", () => {
  const css = readFileSync(new URL("../assets/site.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 800px\) \{[\s\S]*?\.home-page \.path-nav-mobile \{\s*margin-left: auto;\s*\}[\s\S]*?\.hero-flow \{\s*display: none;\s*\}/);
});

test("desktop path navigation opens the category reached by a pointing device", () => {
  const script = readFileSync(new URL("../assets/site.js", import.meta.url), "utf8");
  assert.match(script, /const desktopPathNav = document\.querySelector\("\.path-nav"\);/);
  assert.match(script, /desktopPathNav\?\.addEventListener\("pointerover", \(event\) => \{[\s\S]*?group\?\.parentElement === desktopPathNav\) group\.open = true;/);
  assert.doesNotMatch(script, /desktopPathNav\?\.addEventListener\("pointerleave"/);
});

test("course navigation keeps its scrollbar within the narrower sidebar padding", () => {
  const css = readFileSync(new URL("../assets/site.css", import.meta.url), "utf8");
  assert.match(css, /\.sidebar > nav \{[\s\S]*?margin-right: -18px;[\s\S]*?padding-right: 18px;[\s\S]*?scrollbar-color: var\(--line\) transparent;[\s\S]*?scrollbar-width: thin;/);
  assert.match(css, /@media \(max-width: 1100px\) \{[\s\S]*?\.sidebar \{\s*padding: 22px 12px 0;\s*\}[\s\S]*?\.sidebar > nav \{\s*margin-right: -12px;\s*padding-right: 12px;\s*\}/);
});

test("sidebar has native module and resource disclosures with only the active branch open", () => {
  const html = sidebar(site, course, "agents", tocByPage);
  const branches = [...html.matchAll(/<details\b([^>]*)>(.*?)<\/details>/gs)];
  assert.equal(branches.length, 3);
  assert.equal(branches.filter(([, attributes]) => /\sopen(?:\s|$)/.test(attributes)).length, 1);
  assert.match(branches[1][1], /data-nav-page="agents" open/);
  assert.equal((html.match(/<summary class="nav-toggle"/g) || []).length, 3);
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(html, /<a class="nav-link" href="\/certi-tips\/EXAM-1\/agents\/" data-completion="agents" aria-current="page">/);
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
  assert.match(html, /<a class="nav-link"[^>]*data-completion="agents"/);
  assert.doesNotMatch(html, /completion-dot/);
  assert.doesNotMatch(branches[2][0], /data-completion=/);
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
  const modules = catalog.courses.flatMap((entry) => entry.modules.filter((module) => module.type === "module").map((module) => ({ ...module, contentDir: entry.contentDir || "" })));
  assert.equal(modules.length, 22);
  const markdown = new MarkdownIt({ html: true });
  for (const module of modules) {
    const source = readFileSync(new URL(`../content/${module.contentDir}/${module.slug}.md`, import.meta.url), "utf8");
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
  assert.match(html, /Made with .* at Certi<span class="brand-accent">Tips<\/span> .* Developed by <a href="https:\/\/www\.linkedin\.com\/in\/jgangini\/"[^>]*>Joel Gangini<\/a>/);
  assert.doesNotMatch(html, /Mejorar esta guía/);
  assert.match(html, /id="diagram-viewer"/);
  assert.match(html, /data-mark-complete="agents"/);
  assert.doesNotMatch(html, /MÓDULO 01 \/ 06|LECTURA ·/);
  assert.match(html, /<article class="prose">[^]*<\/article><div data-completion-trigger aria-hidden="true"><\/div><button[^>]+data-mark-complete="agents"[^>]+hidden>/);
  assert.match(html, /<summary>Foundation Sprint<\/summary>/);
  assert.doesNotMatch(html, /Ver grupo completo/);
  assert.match(html, /href="\/certi-tips\/EXAM-1\/overview\/"><span class="path-title">Course<\/span><\/a>/);
  assert.match(html, /href="https:\/\/mylearn\.oracle\.com\/pending" target="_blank" rel="noopener noreferrer"[^>]*><span class="path-title">Pending course<\/span><span class="coming-soon"/);
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

test("path menu headings change on interaction without retaining an open-state fill", () => {
  const css = readFileSync(new URL("../assets/site.css", import.meta.url), "utf8");
  assert.match(css, /--selected-surface:\s*#59616e;\s*--selected-ink:\s*#fff;/);
  assert.match(css, /html\[data-theme="dark"\]\s*\{[^}]*--selected-surface:\s*#414653;/);
  assert.match(css, /\.path-group summary:hover\s*\{\s*background:\s*var\(--selected-surface\);\s*color:\s*var\(--selected-ink\);/);
  assert.match(css, /\.path-nav \.path-group\[open\] > summary\s*\{\s*background:\s*var\(--selected-surface\);\s*color:\s*var\(--selected-ink\);/);
  assert.doesNotMatch(css, /\.path-group\[open\] summary\s*\{\s*background:/);
  assert.match(css, /\.path-nav-mobile \.path-group summary\s*\{[\s\S]*?justify-content:\s*flex-start;[\s\S]*?text-align:\s*left;/);
  assert.match(css, /\.path-nav-mobile \.path-group-panel\s*\{[\s\S]*?padding:\s*6px 0 6px 12px;[\s\S]*?margin:\s*6px 12px 8px;/);
  assert.match(css, /\.path-group-panel a:is\(:hover, :focus-visible\)\s*\{\s*background:\s*var\(--selected-surface\);\s*color:\s*var\(--selected-ink\);/);
  assert.match(css, /\.nav-link\[aria-current="page"\]\s*\{\s*background:\s*var\(--selected-surface\);\s*color:\s*var\(--selected-ink\);/);
  assert.match(css, /\.nav-section-link:hover\s*\{\s*color:\s*var\(--ink\);\s*background:\s*var\(--hover\);/);
});

test("the certification breadcrumb identifies LangChain by its module label", () => {
  const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
  const currentCourse = catalog.courses[0];
  assert.equal(`${currentCourse.title} ${currentCourse.edition}`, catalog.paths[0].items.find((item) => item.guide === currentCourse.id).title);
  const html = layout({ site: catalog, course: currentCourse, page: currentCourse.modules.find((item) => item.slug === "langchain"), body: "" });
  assert.match(html, /<nav class="breadcrumb"[^>]*><a href="\/certi-tips\/1Z0-1157-26\/overview\/">Oracle Agentic AI Foundations Associate<\/a><span aria-hidden="true">\/<\/span><span aria-current="page">LangChain<\/span>/);
  assert.match(html, /<body[^>]* data-course="agentic-ai-foundations-2026"/);
});

test("completed modules use a blue block without adding a width-consuming badge", () => {
  const css = readFileSync(new URL("../assets/site.css", import.meta.url), "utf8");
  const script = readFileSync(new URL("../assets/site.js", import.meta.url), "utf8");
  assert.match(css, /\.nav-link\.is-complete\s*\{\s*background:\s*var\(--completed-surface\);\s*color:\s*#fff;/);
  assert.match(script, /link\.classList\.toggle\("is-complete", done\)/);
  assert.match(script, /aria-description/);
  assert.doesNotMatch(css, /completion-dot/);
});

test("search lists certifications before typing and keeps study topics available for filtering", () => {
  const css = readFileSync(new URL("../assets/site.css", import.meta.url), "utf8");
  const html = layout({ site, course, page: course.modules[0], body: "" });
  const search = html.match(/<dialog id="site-search"[\s\S]*?<\/dialog>/)[0];
  assert.doesNotMatch(css, /\.search-heading:focus-within/);
  assert.equal((search.match(/data-search-kind="certification"/g) || []).length, 2);
  assert.equal((search.match(/data-search-kind="topic"[^>]* hidden/g) || []).length, 3);
  assert.match(search, /aria-controls="search-results"/);
  assert.match(search, /data-search-empty hidden/);
  assert.doesNotMatch(search, /Escribe para buscar certificaciones/);
});

test("home shows each FY27 certification once and links all three available guides locally", () => {
  const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
  const items = catalog.paths.flatMap((path) => path.items);
  assert.deepEqual(catalog.paths.map((path) => path.id), ["foundation-sprint", "ai-first", "ai-data-layer", "oci-enablers"]);
  assert.equal(catalog.paths[0].title, "Foundation");
  assert.equal(items.length, 11);
  assert.equal(new Set(items.map((item) => item.title)).size, items.length);
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  assert.deepEqual(catalog.paths[0].items.map((item) => item.level), [1, 1, 1]);
  assert.ok(catalog.paths.slice(1).every((path) => path.items.every((item, index) => item.level >= 2 && (index === 0 || item.level >= path.items[index - 1].level))));
  assert.equal(items.filter((item) => item.level === 3).length, 3);
  assert.ok(items.every((item) => !/\b20\d{2}\b/.test(item.title)));
  assert.ok(catalog.courses.every((item) => !/\b20\d{2}\b/.test(`${item.title} ${item.edition}`)));
  assert.ok(items.every((item) => !/Essentials/i.test(item.title)));
  const platform = catalog.paths.find((path) => path.id === "ai-data-layer").items.find((item) => item.id === "ai-data-platform-professional");
  assert.equal(platform.title, "Oracle AI Data Platform Professional");
  assert.equal(platform.level, 3);
  assert.match(platform.description, /1Z0-1154-26/);
  assert.equal(platform.officialUrl, "https://mylearn.oracle.com/ou/learning-path/become-an-oracle-ai-data-platform-professional/164914");
  assert.deepEqual(items.filter((item) => item.guide).map((item) => item.guide).sort(), ["agentic-ai-foundations-2026", "oci-ai-foundations-2026", "oci-foundations-2026"]);
  assert.ok(items.every((item) => item.officialUrl.startsWith("https://mylearn.oracle.com/")));
  const html = homeBody(catalog);
  assert.equal((html.match(/class="certification-item/g) || []).length, 11);
  assert.equal((html.match(/class="button button-small certitips-button" href=/g) || []).length, 3);
  assert.equal((html.match(/class="button button-small certitips-button" type="button" disabled/g) || []).length, 8);
  assert.equal((html.match(/<section class="path-section/g) || []).length, 4);
  assert.match(html, /data-group-carousel/);
  assert.match(html, /data-group-next/);
  assert.match(html, /data-group-carousel><section[^]*?<nav class="group-carousel-controls"/);
  assert.doesNotMatch(html, /data-group-carousel><nav class="group-carousel-controls"/);
  assert.equal((html.match(/class="group-carousel-controls"/g) || []).length, 1);
  assert.match(html, /data-group-prev[^>]*><svg viewBox="0 0 24 24" width="22" height="22"[^]*?<path d="M6 12H18M6 12L11 7M6 12L11 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"\/><\/svg><\/button>/);
  assert.match(html, /data-group-next[^>]*><svg viewBox="0 0 24 24" width="22" height="22"[^]*?<path d="M6 12H18M18 12L13 7M18 12L13 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"\/><\/svg><\/button>/);
  assert.doesNotMatch(html, /data-group-(?:prev|next)[^>]*>[←→]</);
  const carouselCss = readFileSync(new URL("../assets/site.css", import.meta.url), "utf8");
  assert.match(carouselCss, /\.group-carousel-controls button\s*\{[^}]*display:\s*grid;[^}]*place-items:\s*center;[^}]*padding:\s*0;[^}]*line-height:\s*0;/);
  assert.match(carouselCss, /\.group-carousel-controls button svg\s*\{\s*display:\s*block;/);
  assert.match(html, /class="path-section path-foundation is-active"/);
  assert.match(html, /<h2 id="foundation-sprint-title">Foundation<\/h2>/);
  assert.match(html, /Foundation reúne tres certificaciones de nivel 1/);
  assert.match(html, /Foundation · 1 de 4/);
  assert.match(html, /<svg viewBox="0 0 16 16"[^>]*fill="currentColor"/);
  assert.match(html, /href="\/certi-tips\/1Z0-1157-26\/overview\/"/);
  assert.match(html, /id="oci-enablers"/);
  assert.match(html, /class="oracle-badge"><svg viewBox="0 0 32 32" fill="currentColor"[^>]*><path d="M21\.272 22\.141h-10\.538/);
  assert.match(html, /<span>Oracle Cloud Infrastructure<\/span><\/div><h1><span>De los Fundamentos<\/span><span>a tu Especialidad<\/span><\/h1>/);
  assert.match(html, /class="hero-copy"/);
  assert.match(html, /class="hero-flow is-unavailable"/);
  const siteCss = readFileSync(new URL("../assets/site.css", import.meta.url), "utf8");
  assert.match(siteCss, /\.home-hero\s*\{[^}]*align-items:\s*stretch;/);
  assert.match(siteCss, /\.home-hero \.hero-copy\s*\{[^}]*align-self:\s*stretch;[^}]*justify-content:\s*center;/);
  assert.match(siteCss, /\.home-hero \.oracle-badge\s*\{[^}]*display:\s*inline-flex;[^}]*border:\s*1px solid rgba\(199, 70, 52, \.45\);[^}]*backdrop-filter:\s*blur\(16px\) saturate\(160%\);/);
  assert.match(siteCss, /\.home-hero \.oracle-badge svg\s*\{[^}]*color:\s*var\(--red\);/);
  assert.match(siteCss, /\.home-hero h1\s*\{[^}]*font-size:\s*clamp\(2\.4rem, 3\.5vw, 3rem\);/);
  assert.match(siteCss, /\.home-hero h1 span\s*\{\s*display:\s*block;/);
  assert.match(siteCss, /\.hero-flow\s*\{[^}]*border:\s*1px solid var\(--line\);/);
  assert.doesNotMatch(html, /assets\/motion\/certification-path\.mp4/);
  const withMotion = homeBody(catalog, true);
  assert.match(withMotion, /assets\/motion\/certification-path\.mp4/);
  assert.match(withMotion, /data-hero-flow autoplay loop muted playsinline/);
  assert.doesNotMatch(withMotion, /data-hero-replay|Repetir animación/);
  assert.match(withMotion, /3 certificaciones de nivel 1/);
  assert.match(html, /OCI AI Foundations Associate/);
  assert.doesNotMatch(html, /Essentials|AI → AI Data Platform/);
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
  assert.equal((navigation.match(/class="coming-soon"/g) || []).length, 8);
});

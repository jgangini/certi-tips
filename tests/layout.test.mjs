import test from "node:test";
import assert from "node:assert/strict";
import { layout, sidebar } from "../scripts/layout.mjs";

const site = { base: "/certi-tips/", origin: "https://example.test", repository: "https://example.test/repo" };
const course = {
  id: "course",
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
  assert.equal((html.match(/<summary class="nav-link">/g) || []).length, 3);
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(branches[1][2], /href="\/certi-tips\/course\/agents\/" aria-current="page">Ver módulo/);
  assert.match(branches[2][2], /href="\/certi-tips\/course\/review\/">Ver recurso/);
  assert.doesNotMatch(html, /role="tree(?:item)?"/);
  assert.match(html, /data-completion="agents"/);
});

test("every sidebar branch links to its own rendered headings with a full base path", () => {
  const html = sidebar(site, course, "agents", tocByPage);
  for (const [slug, sections] of tocByPage) {
    for (const section of sections) assert.ok(html.includes(`href="/certi-tips/course/${slug}/#${section.id}"`));
  }
  assert.ok(html.includes("Conceptos &lt;clave&gt; &amp; seguridad"));
  assert.doesNotMatch(html, /href="#/);
  assert.ok(sidebar(site, course, "review").includes('href="/certi-tips/course/review/" aria-current="page"'));
});

test("layout moves the contents into the sidebar while preserving reading and site controls", () => {
  const html = layout({ site, course, page: course.modules[1], tocByPage, body: '<h2 id="conceptos-clave">Conceptos</h2>' });
  assert.doesNotMatch(html, /class="contents"|En este apartado/);
  assert.match(html, /<aside[^]*href="\/certi-tips\/course\/agents\/#conceptos-clave"[^]*<\/aside>/);
  assert.match(html, /<article class="prose"><h2 id="conceptos-clave">Conceptos<\/h2><\/article>/);
  assert.match(html, /class="site-footer"/);
  assert.match(html, /id="diagram-viewer"/);
  assert.match(html, /data-mark-complete="agents"/);
});

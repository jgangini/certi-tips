import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { indexGraph } from "../assets/certichat-explorer.js";
import { certichatExplorerBody } from "../scripts/certichat-explorer.mjs";
import { layout } from "../scripts/layout.mjs";

test("knowledge exploration indexes real directions, self-links and labels without dangling nodes", () => {
  const graph = indexGraph({ nodes: [
    { id: "a", label: "Región de OCI", type: "Entity" },
    { id: "b", label: "Agentes", type: "Entity" },
    { id: "c", label: '<img src=x onerror="alert(1)">' },
    { id: "a", label: "Duplicate" }, null, { id: "bad", label: " " },
  ], edges: [
    { source: "a", target: "b", label: "relación directa" },
    { source: "b", target: "a", label: "relación inversa" },
    { source: "b", target: "b", label: "reflexiva" },
    { source: "missing", target: "a", label: "no publicar" }, null,
  ] });
  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.edges.length, 3);
  assert.equal(graph.byId.get("a").label, "Región de OCI");
  assert.equal(graph.neighbors.get("a").get("b").length, 2);
  assert.equal(graph.neighbors.get("b").get("b").length, 1);
  assert.equal(graph.neighbors.get("c").size, 0);
  assert.throws(() => indexGraph({ nodes: [] }), /Invalid knowledge graph/);
});

test("the explorer is a standalone site page and offers an honest missing-snapshot state", () => {
  const site = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url)));
  site.certichat = { apiOrigin: "http://127.0.0.1:18741" };
  const body = certichatExplorerBody(site.base, false);
  const html = layout({ site, course: site.courses[0], page: { slug: "certichat", title: "Cómo funciona CertiChat" }, body });
  assert.match(html, /rel="canonical" href="https:\/\/jgangini.github.io\/certitips\/certichat\/"/);
  assert.match(html, /class="home-main certichat-main"/);
  assert.match(html, /href="\/certitips\/assets\/certichat-explorer.css"/);
  assert.match(html, /href="\/certitips\/certichat\/" aria-label="Ver el grafo de CertiChat"/);
  assert.doesNotMatch(html, /<aside class="sidebar"|data-mark-complete=/);
  assert.match(body, /data-knowledge-graph=""/);
  assert.match(body, /instantánea del grafo todavía no está publicada/);
  assert.doesNotMatch(body, /certichat-spinner|is-loading|Haz una consulta/);
  assert.doesNotMatch(body, /id="consulta"|data-explorer-chat(?=[\s=>])|chat-explorer-flow|chat-graph-inspector|Cómo se prepara una respuesta|Explorar conceptos y relaciones/);
  assert.match(body, /<canvas data-graph-canvas tabindex="0"[^>]+role="img"[^>]+aria-label="[^"]+"/);
  assert.doesNotMatch(body, /chat-graph-help|chat-graph-legend/);
  assert.match(body, /data-graph-active aria-label="Conceptos recuperados para esta consulta"/);
  const loading = certichatExplorerBody(site.base, true);
  assert.match(loading, /data-knowledge-graph="\/certitips\/assets\/certichat\/graph.json"/);
  assert.match(loading, /role="status" aria-label="Cargando el mapa de conocimiento"><span class="certichat-spinner" aria-hidden="true"><\/span>/);
  assert.match(loading, /data-graph-trace role="status" hidden><\/p>/);
});

test("the published graph is a faithful static copy of the exported snapshot", () => {
  const source = readFileSync(new URL("../data/certichat-graph.json", import.meta.url), "utf8");
  assert.equal(readFileSync(new URL("../dist/assets/certichat/graph.json", import.meta.url), "utf8"), source);
  const data = JSON.parse(source), graph = indexGraph(data);
  assert.ok(graph.nodes.length > 0 && graph.edges.length > 0);
  assert.equal(graph.nodes.length, data.nodes.length);
  assert.equal(graph.edges.length, data.edges.length);
  assert.ok(Number.isFinite(Date.parse(data.generatedAt)));
  assert.ok(data.version);
});

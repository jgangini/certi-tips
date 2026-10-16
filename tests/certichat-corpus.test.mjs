import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import MarkdownIt from "markdown-it";
import { annotateHeadings, pageDocuments, diagramEvidence, corpusArtifacts, contentHash } from "../scripts/certichat-corpus.mjs";

const svg = '<svg><title>Modelo &amp; aplicación</title><desc>La aplicación valida la llamada.</desc><style>text { fill: red }</style><defs><text>Definición sin presentar</text></defs><text x="10"><tspan>Modelo</tspan><tspan>propone &#x2192; acción</tspan></text><text>Ruta C:\\tmp &amp;lt;literal&amp;gt;</text><path d="M1 2L3 4"/><!-- <text>Comentario</text> --></svg>';
const metadata = { id: "course/lesson", title: "Lección", url: "https://example.test/lesson/", courseId: "course" };
function tokensFor(markdown) {
  const tokens = new MarkdownIt().parse(markdown, {});
  annotateHeadings(tokens);
  return tokens;
}

test("diagram evidence reads authored text and entities without interpreting geometry or executing XML", () => {
  const evidence = diagramEvidence(svg);
  assert.equal(evidence.title, "Modelo & aplicación");
  assert.equal(evidence.text, "Modelo & aplicación\nLa aplicación valida la llamada.\nModelo propone → acción\nRuta C:\\tmp &lt;literal&gt;");
  assert.equal(evidence.hash, contentHash(svg));
  assert.doesNotMatch(evidence.text, /Definición|Comentario|red|M1 2/);
  assert.equal(diagramEvidence(svg.replace('x="10"', 'x="100"')).text, evidence.text);
  assert.notEqual(diagramEvidence(svg.replace('x="10"', 'x="100"')).hash, evidence.hash);
  for (const source of [undefined, "", "x".repeat(1000001), svg.replace(/<desc>.*?<\/desc>/, ""), '<!DOCTYPE svg SYSTEM "https://example.test/private">' + svg, '<!ENTITY secret "private">' + svg, svg.replace("</svg>", '<script>execute()</script></svg>')]) {
    assert.throws(() => diagramEvidence(source), /diagram evidence|Diagram evidence/i);
  }
});

test("diagram sources retain stable canonical identity, heading provenance and content hashes", () => {
  const tokens = tokensFor('Introducción\n\n## Ciclo\nPrimera sección.\n\n## Ciclo\n![Texto alternativo](img/loop.svg "Leyenda del ciclo")');
  const originals = pageDocuments(tokens, metadata);
  const documents = pageDocuments(tokens, { ...metadata, diagramSources: new Map([["img/loop.svg", svg]]) });
  assert.deepEqual(documents.filter(doc => doc.kind !== "diagram"), originals);
  const diagram = documents.find(doc => doc.kind === "diagram");
  assert.equal(diagram.id, "course/lesson#diagram-loop.svg");
  assert.equal(diagram.url, "https://example.test/lesson/#diagram-loop.svg");
  assert.equal(diagram.pageId, "course/lesson");
  assert.equal(diagram.sectionId, "course/lesson#ciclo-2");
  assert.equal(diagram.imageUrl, "https://example.test/lesson/img/loop.svg");
  assert.equal(diagram.svgHash, contentHash(svg));
  assert.match(diagram.text, /Lección · Ciclo\nTexto alternativo\nLeyenda del ciclo/);
  assert.ok(diagram.text.includes(diagramEvidence(svg).text));
  const manifest = JSON.parse(corpusArtifacts(documents, "https://example.test/corpus.json").manifest);
  const entry = manifest.documents.find(doc => doc.id === diagram.id);
  const { text, ...expected } = diagram;
  assert.deepEqual(entry, { ...expected, hash: contentHash(text) });
});

test("diagram context only accepts registered local source names and preserves page introductions", () => {
  const diagramSources = new Map([["img/loop.svg", svg]]);
  const diagram = pageDocuments(tokensFor('![Ciclo](img/loop.svg)'), { ...metadata, diagramSources }).find(doc => doc.kind === "diagram");
  assert.equal(diagram.sectionId, metadata.id);
  for (const reference of ["img/missing.svg", "../loop.svg", "https://example.test/loop.svg"]) {
    assert.throws(() => pageDocuments(tokensFor(`![Ciclo](${reference})`), { ...metadata, diagramSources }), /Unregistered diagram/);
  }
});

test("registered Spanish agent diagram supplies its explicit explanation without generated visual claims", () => {
  const source = readFileSync(new URL("../data/es/1Z0-1157-26/01_agentes_de_ia/img/agent-loop.svg", import.meta.url), "utf8");
  const evidence = diagramEvidence(source);
  assert.match(evidence.title, /ciclo de un agente/);
  assert.match(evidence.text, /la aplicación valida argumentos, permisos y aprobación/);
  assert.match(evidence.text, /tool call/);
  assert.doesNotMatch(evidence.text, /stroke|marker-end|linearGradient/);
});

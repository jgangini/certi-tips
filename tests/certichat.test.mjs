import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import MarkdownIt from "markdown-it";
import { annotateHeadings, pageDocuments, corpusArtifacts, contentHash } from "../scripts/certichat-corpus.mjs";
import { plainChatHTML, safeSourceURL, quotaText } from "../assets/certichat.js";

test("CertiChat renders untrusted messages as inert text and sources stay inside the published site", () => {
  const attack = '<img src="https://attacker.test/leak" onerror="alert(1)">\n![leak](https://attacker.test/) [click](javascript:alert(1))';
  assert.doesNotMatch(plainChatHTML(attack), /<img|<a |onerror="/);
  assert.match(plainChatHTML(attack), /&lt;img/);
  const site = "https://jgangini.github.io/certi-tips/";
  assert.equal(safeSourceURL(`${site}1Z0-1157-26/agents/#conceptos-clave`, site), `${site}1Z0-1157-26/agents/#conceptos-clave`);
  for (const url of ["javascript:alert(1)", "https://attacker.test/certi-tips/", "https://jgangini.github.io/another/", `${site}?secret=1`, "https://user:pass@jgangini.github.io/certi-tips/", `${site}../another/`]) assert.equal(safeSourceURL(url, site), null, url);
  assert.match(quotaText({ dayRemaining: 19, hourRemaining: 9, retryAfter: 10.3 }), /19.*9.*11 segundos/);
});

test("CertiChat uses the rendered heading resolver and deterministic knowledge-only hashes", () => {
  const md = new MarkdownIt({ html: true });
  const tokens = md.parse("Introducción\n\n## Qué es OCI\nPrimero.\n\n## Qué es OCI\nSegundo.", {});
  annotateHeadings(tokens);
  const documents = pageDocuments(tokens, { id: "course/lesson", title: "Lección", url: "https://example.test/lesson/", courseId: "course" });
  assert.equal(documents[1].url, "https://example.test/lesson/#que-es-oci");
  assert.equal(documents[2].url, "https://example.test/lesson/#que-es-oci-2");
  assert.match(md.renderer.render(tokens, md.options, {}), /id="que-es-oci-2"/);
  const artifacts = corpusArtifacts(documents, "https://example.test/corpus.json");
  assert.equal(JSON.parse(artifacts.manifest).contentHash, contentHash(artifacts.corpus));
  assert.equal(corpusArtifacts([...documents].reverse(), "https://example.test/corpus.json").corpus, artifacts.corpus);
  assert.notEqual(corpusArtifacts(documents.map((item, index) => index === 0 ? { ...item, text: `${item.text} Updated` } : item), "https://example.test/corpus.json").manifest, artifacts.manifest);
});

test("published corpus covers catalog pages and questions with live canonical anchors and exact hashes", () => {
  const read = relative => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
  const catalog = JSON.parse(read("data/catalog.json"));
  const manifest = JSON.parse(read("dist/assets/certichat/manifest.json"));
  const corpusBytes = read("dist/assets/certichat/corpus.json"), corpus = JSON.parse(corpusBytes);
  assert.equal(manifest.contentHash, contentHash(corpusBytes));
  assert.equal(manifest.documents.length, corpus.documents.length);
  const entries = new Map(corpus.documents.map(item => [item.id, item]));
  for (const course of catalog.courses) {
    for (const page of [...course.modules, ...course.resources]) assert.ok(entries.has(`${course.id}/${page.slug}`));
    for (const question of JSON.parse(read(`data/${course.questionBank}.json`))) {
      const entry = entries.get(`${course.id}/questions/${question.id}`);
      assert.ok(entry);
      assert.ok(entry.text.includes(question.options.find(option => option.id === question.correctOption).explanation));
    }
  }
  for (const source of manifest.documents) {
    const document = entries.get(source.id);
    assert.equal(source.hash, contentHash(document.text));
    const url = new URL(source.url);
    assert.equal(url.origin, catalog.origin);
    assert.ok(url.pathname.startsWith(catalog.base));
    const html = read(`dist/${url.pathname.slice(catalog.base.length)}index.html`);
    if (url.hash) assert.ok(html.includes(`id="${url.hash.slice(1)}"`), source.url);
    assert.doesNotMatch(source.id, /\.private|AGENTS\.md|transcript|^services\//i);
  }
});

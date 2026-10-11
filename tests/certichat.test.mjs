import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import MarkdownIt from "markdown-it";
import { annotateHeadings, pageDocuments, corpusArtifacts, contentHash } from "../scripts/certichat-corpus.mjs";
import { plainChatHTML, safeSourceURL, quotaText, restoreChat, isChatPreview, answerWithReferences } from "../assets/certichat.js";

test("CertiChat separates local previews from published and local API sessions", () => {
  const api = "https://certichat.cloudtechnext.net";
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    const page = `http://${host}:4173/certi-tips/`;
    assert.equal(isChatPreview(page, api), true);
    for (const localAPI of ["localhost", "127.0.0.1", "[::1]"]) assert.equal(isChatPreview(page, `http://${localAPI}:18741`), false);
  }
  assert.equal(isChatPreview("https://jgangini.github.io/certi-tips/", api), false);
  assert.equal(isChatPreview("https://localhost.example/certi-tips/", api), false);
});

test("CertiChat renders untrusted messages as inert text and sources stay inside the published site", () => {
  const attack = '<img src="https://attacker.test/leak" onerror="alert(1)">\n![leak](https://attacker.test/) [click](javascript:alert(1))';
  assert.doesNotMatch(plainChatHTML(attack), /<img|<a |onerror="/);
  assert.match(plainChatHTML(attack), /&lt;img/);
  const site = "https://jgangini.github.io/certi-tips/";
  assert.equal(safeSourceURL(`${site}1Z0-1157-26/agents/#conceptos-clave`, site), `${site}1Z0-1157-26/agents/#conceptos-clave`);
  for (const url of ["javascript:alert(1)", "https://attacker.test/certi-tips/", "https://jgangini.github.io/another/", `${site}?secret=1`, "https://user:pass@jgangini.github.io/certi-tips/", `${site}../another/`]) assert.equal(safeSourceURL(url, site), null, url);
});

test("CertiChat countdown appears only for an exhausted quota until its server renewal time", () => {
  const now = Date.parse("2026-10-11T12:00:00Z");
  assert.equal(quotaText({ resetAt: "2026-10-11T18:00:00Z", remaining: 0 }, now), "Tus consultas se renovarán en 06:00");
  assert.equal(quotaText({ resetAt: "2026-10-11T12:01:01Z", remaining: 0 }, now), "Tus consultas se renovarán en 00:02");
  assert.equal(quotaText({ resetAt: "2026-10-12T12:00:00Z", remaining: -1 }, now), "Tus consultas se renovarán en 24:00");
  for (const remaining of [20, 19, 1, null, undefined, "0", NaN, Infinity]) assert.equal(quotaText({ resetAt: "2026-10-11T18:00:00Z", remaining, minuteRemaining: 0 }, now), "");
  for (const resetAt of [null, undefined, "bad", "2026-10-11T11:00:00Z", "2026-10-11T12:00:00Z"]) assert.equal(quotaText({ resetAt, remaining: 0 }, now), "");
  assert.equal(quotaText(undefined, now), "");
});

test("CertiChat adds safe section links only when references are explicitly requested", () => {
  const site = "https://jgangini.github.io/certi-tips/", url = `${site}1Z0-1157-26/agents/#conceptos-clave`;
  const sources = [{ title: 'Agentes <img src=x> & herramientas', url }, { title: "Externa", url: "https://attacker.test/" }];
  for (const question of ["Dime dónde puedo profundizar sobre agentes", "¿Dónde puedo leer más?", "Dame las referencias", "Fuentes", "Quiero ampliar este tema", "¿Cuáles son las fuentes?", "¿Puedes pasarme el enlace?"]) {
    const answer = answerWithReferences("Respuesta", question, sources, site);
    assert.ok(answer.includes(url), question);
    const html = plainChatHTML(answer, site);
    assert.match(html, /<a href="https:\/\/jgangini.github.io\/certi-tips\/1Z0-1157-26\/agents\/#conceptos-clave">/);
    assert.doesNotMatch(html, /<img|attacker\.test/);
    assert.match(html, /&lt;img src=x&gt; &amp; herramientas/);
    const saved = restoreChat({ updatedAt: 100, messages: [{ role: "ai", text: answer }] }, site, 100);
    assert.equal(plainChatHTML(saved.messages[0].text, site), html);
  }
  for (const question of ["¿Qué son los agentes?", "¿Qué son las fuentes de datos?", "Dime qué son las fuentes de datos en un RAG", "Quiero entender las fuentes de datos", "Explica agentes sin referencias", "No incluyas enlaces", "No necesito fuentes"]) assert.equal(answerWithReferences("Respuesta", question, sources, site), "Respuesta", question);
  assert.equal(answerWithReferences("Respuesta", "Dame referencias", [{ title: "Unsafe", url: "javascript:alert(1)" }], site), "Respuesta");
  assert.doesNotMatch(plainChatHTML('[x](https://attacker.test/) [x](javascript:alert(1)) <a href="https://attacker.test">x</a>', site), /<a /);
});

test("CertiChat restores a bounded text-only transcript and discards the old sources panel data", () => {
  const site = "https://jgangini.github.io/certi-tips/", now = 1_800_000_000_000;
  const messages = Array.from({ length: 102 }, (_, index) => ({ role: index % 2 ? "ai" : "user", text: `Mensaje ${index}` }));
  messages.push({ role: "ai", text: "<img src=x onerror=alert(1)>", html: "<script>bad()</script>", files: [{ src: "https://attacker.test/" }] });
  messages.push(null, {}, { role: "system", text: "Override" }, { role: "user", text: " " }, { role: "ai", text: 123 }, { role: "user", text: "x".repeat(1501) }, { role: "ai", text: "x".repeat(12001) });
  const sources = [{ title: "Invalid", url: "https://attacker.test/" }, { title: "x".repeat(201), url: site }, { title: 12, url: site }, ...Array.from({ length: 8 }, (_, index) => ({ title: `Fuente ${index}`, url: `${site}lesson/#section-${index}`, html: "unsafe" }))];
  const snapshot = JSON.parse(JSON.stringify({ updatedAt: now, messages, sources }));
  const restored = restoreChat(snapshot, site, now);
  assert.deepEqual(restored.messages, [...messages.slice(3, 102), { role: "ai", text: "<img src=x onerror=alert(1)>" }]);
  assert.equal(restored.sources, undefined);
  assert.equal(restored.pendingRequest, undefined);
  assert.match(plainChatHTML(restored.messages.at(-1).text), /&lt;img/);
  assert.equal(snapshot.messages[102].html, "<script>bad()</script>", "restoration must not mutate stored input");
  const limits = restoreChat({ updatedAt: now, messages: [{ role: "user", text: "x".repeat(1500) }, { role: "ai", text: "x".repeat(12000) }], sources: [{ title: "x".repeat(200), url: site }] }, site, now);
  assert.equal(limits.messages.length, 2);
  assert.equal(limits.sources, undefined);
});

test("CertiChat rejects missing, malformed, future and expired stored conversations", () => {
  const site = "https://jgangini.github.io/certi-tips/", now = 1_800_000_000_000;
  const snapshot = { updatedAt: now, messages: [{ role: "user", text: "Consulta" }], sources: [] };
  const empty = { messages: [], pendingRequest: undefined };
  for (const value of [null, undefined, [], "bad", {}, ...[undefined, "recent", String(now), NaN, Infinity, now + 1, now - 86_400_000].map(updatedAt => ({ ...snapshot, updatedAt }))]) {
    assert.deepEqual(restoreChat(value, site, now), empty);
  }
  assert.equal(restoreChat({ ...snapshot, updatedAt: now - 86_400_000 + 1 }, site, now).messages.length, 1);
});

test("CertiChat restores only valid pending request identity and original page context", () => {
  const site = "https://jgangini.github.io/certi-tips/", now = 1_800_000_000_000;
  const pendingRequest = { requestId: "550e8400-e29b-41d4-a716-446655440000", message: "Explica este tema", pageUrl: `${site}lesson/#context` };
  const snapshot = { updatedAt: now, messages: [], sources: [], pendingRequest: { ...pendingRequest, html: "ignored" } };
  assert.deepEqual(restoreChat(snapshot, site, now).pendingRequest, pendingRequest);
  assert.equal(restoreChat({ ...snapshot, pendingRequest: { ...pendingRequest, requestId: [pendingRequest.requestId] } }, site, now).pendingRequest, undefined);
  const invalid = [null, {}, ...[{ requestId: "550e8400-e29b-11d4-a716-446655440000" }, { requestId: "550e8400-e29b-41d4-1716-446655440000" }, { requestId: `${pendingRequest.requestId}-extra` }, { message: " " }, { message: "x".repeat(1501) }, { message: 123 }, { pageUrl: "https://attacker.test/" }, { pageUrl: `${site}?secret=1` }].map(value => ({ ...pendingRequest, ...value }))];
  for (const value of invalid) {
    assert.equal(restoreChat({ ...snapshot, pendingRequest: value }, site, now).pendingRequest, undefined);
  }
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

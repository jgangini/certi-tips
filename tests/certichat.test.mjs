import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import MarkdownIt from "markdown-it";
import { Remarkable } from "remarkable";
import { annotateHeadings, pageDocuments, corpusArtifacts, contentHash } from "../scripts/certichat-corpus.mjs";
import { configureChatMarkdown, safeSourceURL, quotaText, restoreChat, isChatPreview, answerWithReferences } from "../assets/certichat.js";
const plainChatHTML = (text, siteRoot) => configureChatMarkdown(new Remarkable(), siteRoot).render(text);

test("CertiChat separates local previews from published and local API sessions", () => {
  const api = "https://certichat.cloudtechnext.net";
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    const page = `http://${host}:4173/certitips/`;
    assert.equal(isChatPreview(page, api), true);
    for (const localAPI of ["localhost", "127.0.0.1", "[::1]"]) assert.equal(isChatPreview(page, `http://${localAPI}:18741`), false);
  }
  assert.equal(isChatPreview("https://jgangini.github.io/certitips/", api), false);
  assert.equal(isChatPreview("https://localhost.example/certitips/", api), false);
});

test("CertiChat renders Markdown while keeping HTML inert and sources inside the published site", () => {
  const attack = '<img src="https://attacker.test/leak" onerror="alert(1)">\n![leak](https://attacker.test/) [click](javascript:alert(1))';
  assert.doesNotMatch(plainChatHTML(attack), /<img|<a |onerror="/);
  assert.match(plainChatHTML(attack), /&lt;img/);
  const site = "https://jgangini.github.io/certitips/";
  assert.equal(safeSourceURL(`${site}1Z0-1157-26/agents/#conceptos-clave`, site), `${site}1Z0-1157-26/agents/#conceptos-clave`);
  for (const url of ["javascript:alert(1)", "https://attacker.test/certitips/", "https://jgangini.github.io/another/", `${site}?secret=1`, "https://user:pass@jgangini.github.io/certitips/", `${site}../another/`]) assert.equal(safeSourceURL(url, site), null, url);
});

test("chat Markdown formats emphasis, lists, quotes and code in current and restored answers", () => {
  const site = "https://jgangini.github.io/certitips/";
  const text = '***Conceptos***\n\n1. **DAMA** y *Oracle*\n2. `OCI`\n\n- Gobierno\n- Calidad\n\n> Una evidencia\n\n```html\n<script>alert(1)</script>\n```';
  const html = plainChatHTML(text, site);
  for (const tag of ["strong", "em", "ol", "ul", "blockquote", "code"]) assert.ok(html.includes(`<${tag}>`), tag);
  assert.match(html, /<pre><code class="language-html">&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /\*\*Conceptos|<script>/);
  const saved = restoreChat({ updatedAt: 100, messages: [{ role: "ai", text }] }, site, 100);
  assert.equal(plainChatHTML(saved.messages[0].text, site), html);
  for (const attack of [`![image](${site}assets/icons/favicon.svg)`, '[x](//attacker.test)', '[x](data:text/html,attack)', '<svg onload="alert(1)">']) {
    const markdown = configureChatMarkdown(new Remarkable(), site);
    markdown.inline.validateLink = () => true;
    assert.doesNotMatch(markdown.render(attack), /<(?:img|svg|script|a)\b/);
  }
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

test("CertiChat includes unique verified section links with every sourced answer", () => {
  const site = "https://jgangini.github.io/certitips/", url = `${site}1Z0-1157-26/agents/#conceptos-clave`;
  const sources = [{ title: 'Agentes <img src=x> & herramientas', url }, { title: "Misma sección", url }, { title: "Externa", url: "https://attacker.test/" }];
  for (const text of ["Explicación del concepto", "Puedes consultar esta guía", "Las certificaciones del sitio son…"]) {
    const answer = answerWithReferences(text, sources, site);
    assert.ok(answer.startsWith(text) && answer.includes(url));
    const html = plainChatHTML(answer, site);
    assert.match(html, /<span class="chat-resource-heading">Recursos Relacionados:<\/span><br>\s*<a /);
    assert.equal(plainChatHTML(answer.replace("Recursos Relacionados:", "Para profundizar:"), site), html, "saved answers must show the current resource heading without another request");
    assert.match(html, /<a href="\/certitips\/es\/1Z0-1157-26\/agents\/#conceptos-clave" data-source-url="https:\/\/jgangini.github.io\/certitips\/1Z0-1157-26\/agents\/#conceptos-clave" data-link-kind="certitips" title="[^"]+">/);
    assert.doesNotMatch(html, /<img|attacker\.test/);
    assert.match(html, /&lt;img src=x&gt; &amp; herramientas/);
    assert.equal((html.match(/<a /g) || []).length, 1);
    const saved = restoreChat({ updatedAt: 100, messages: [{ role: "ai", text: answer }] }, site, 100);
    assert.equal(plainChatHTML(saved.messages[0].text, site), html);
  }
  for (const invalid of [undefined, [], {}, [null, { title: " ", url }, { title: "Unsafe", url: "javascript:alert(1)" }]]) assert.equal(answerWithReferences("Respuesta", invalid, site), "Respuesta");
  assert.doesNotMatch(plainChatHTML('[x](https://attacker.test/) [x](javascript:alert(1)) <a href="https://attacker.test">x</a>', site), /<a /);
});

test("chat link icons use the validated URL path, including restored video timestamps", () => {
  const site = "https://jgangini.github.io/certitips/";
  for (const [path, kind] of [["", "certitips"], ["CDMP-DMF/overview/#certitube", "certitips"], ["certitube/", "certitube"], ["certitube/Ha74VhpQwQo/#t-61", "certitube"], ["certitube-lookalike/", "certitips"]]) {
    const text = `[Material](${site}${path})`;
    const restored = restoreChat({updatedAt: 100, messages: [{role: "ai", text}]}, site, 100);
    const html = plainChatHTML(restored.messages[0].text, site);
    assert.ok(html.includes(`data-link-kind="${kind}"`));
    assert.ok(html.includes(`href="${new URL(site + "es/" + path).pathname + new URL(site + path).hash}"`));
    assert.equal(html, plainChatHTML(text, site));
  }
  for (const url of ["https://attacker.test/certitips/certitube/", `${site}certitube/?token=private`, "javascript:alert(1)"]) {
    assert.doesNotMatch(plainChatHTML(`[CertiTube](${url})`, site), /<a |data-link-kind/);
  }
});

test("guide references navigate on the current origin while retaining canonical evidence and transcript", () => {
  const site = "https://jgangini.github.io/certitips/", url = `${site}CDMP-DMF/oracle-map/#arquitectura-conceptual-y-tecnologica`;
  const text = answerWithReferences("Puedes aplicar DAMA con Oracle.", [{ title: "De DAMA a las Capacidades Oracle", url }], site);
  const saved = { updatedAt: 100, messages: [{ role: "user", text: "¿Se puede aplicar DAMA y OCI?" }, { role: "ai", text }] };
  const restored = restoreChat(saved, site, 100), html = plainChatHTML(restored.messages[1].text, site);
  const path = html.match(/href="([^"]+)"/)[1];
  assert.equal(path, new URL(url).pathname.replace("/certitips/", "/certitips/es/") + new URL(url).hash);
  assert.ok(html.includes(`data-source-url="${url}"`));
  for (const origin of ["http://127.0.0.1:4173", "http://localhost:4173", "http://[::1]:4173", new URL(site).origin]) {
    const destination = new URL(path, `${origin}/certitips/certichat/`);
    assert.equal(destination.origin, origin);
    assert.equal(destination.pathname + destination.hash, path);
    assert.deepEqual(restoreChat(saved, site, 100).messages, saved.messages);
  }
  assert.equal(safeSourceURL(path, site), null, "Relative navigation must not weaken canonical source validation");
});

test("CertiChat restores bounded message text and discards the old sources panel data", () => {
  const site = "https://jgangini.github.io/certitips/", now = 1_800_000_000_000;
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

test("CertiChat restores evidence by response position, validates sources and bounds its storage", () => {
  const site = "https://jgangini.github.io/certitips/", now = 100;
  const id = "550e8400-e29b-41d4-a716-446655440000";
  const trace = { version: "a".repeat(64), nodes: [id], edges: [], truncated: false };
  const second = { ...trace, version: "b".repeat(64) };
  const messages = [
    { role: "user", text: "Consulta", graphTrace: trace },
    { role: "ai", text: "Respuesta repetida", graphTrace: trace },
    { role: "ai", text: "Respuesta repetida", graphTrace: second },
    { role: "ai", text: "Sin evidencia", graphTrace: { ...trace, version: "invalid" } },
  ];
  const restored = restoreChat({ updatedAt: now, messages }, site, now).messages;
  assert.equal(restored[0].graphTrace, undefined);
  assert.deepEqual(restored[1].graphTrace, trace);
  assert.deepEqual(restored[2].graphTrace, second);
  assert.equal(restored[3].graphTrace, undefined);
  const sources = Array.from({ length: 200 }, (_, index) => ({ nodeId: id, title: "x".repeat(200), url: `${site}lesson/#${index}` }));
  sources.push({ nodeId: id, title: "Unsafe", url: "https://attacker.test/" });
  const large = Array.from({ length: 100 }, () => ({ role: "ai", text: "Respuesta", graphTrace: { ...trace, sources } }));
  const bounded = restoreChat({ updatedAt: now, messages: large }, site, now).messages;
  const kept = bounded.filter(message => message.graphTrace);
  assert.equal(bounded.length, 100);
  assert.ok(kept.length > 0 && kept.length < 100);
  assert.equal(bounded[0].graphTrace, undefined);
  assert.equal(bounded.at(-1).graphTrace.sources.length, 200);
  assert.ok(kept.reduce((bytes, message) => bytes + JSON.stringify(message.graphTrace).length * 2, 0) <= 512000);
});

test("CertiChat rejects missing, malformed, future and expired stored conversations", () => {
  const site = "https://jgangini.github.io/certitips/", now = 1_800_000_000_000;
  const snapshot = { updatedAt: now, messages: [{ role: "user", text: "Consulta" }], sources: [] };
  const empty = { messages: [], pendingRequest: undefined };
  for (const value of [null, undefined, [], "bad", {}, ...[undefined, "recent", String(now), NaN, Infinity, now + 1, now - 86_400_000].map(updatedAt => ({ ...snapshot, updatedAt }))]) {
    assert.deepEqual(restoreChat(value, site, now), empty);
  }
  assert.equal(restoreChat({ ...snapshot, updatedAt: now - 86_400_000 + 1 }, site, now).messages.length, 1);
});

test("CertiChat restores only valid pending request identity and original page context", () => {
  const site = "https://jgangini.github.io/certitips/", now = 1_800_000_000_000;
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

test("published entries and shared modules use the same cache version, including dynamic imports", () => {
  const read = name => readFileSync(new URL(`../dist/${name}`, import.meta.url), "utf8");
  const html = read("certichat/index.html"), version = html.match(/assets\/certichat\.js\?v=([a-f0-9]{12})/)[1];
  for (const asset of ["site.js", "site.css", "certichat.js", "certichat.css", "certichat-explorer.js", "certichat-explorer.css"]) assert.ok(html.includes(`/assets/${asset}?v=${version}"`), asset);
  for (const [name, imports] of [["certichat", ["storage", "certichat-trace", "deep-chat"]], ["certichat-explorer", ["certichat-trace", "certichat-network"]]]) {
    const code = read(`assets/${name}.js`);
    for (const dependency of imports) assert.ok(code.includes(`./${dependency}.js?v=${version}`), `${name} → ${dependency}`);
  }
  assert.ok(read("assets/certichat-trace.js").includes("export function sourcePath"));
});

test("published corpus covers catalog pages and questions with live canonical anchors and exact hashes", () => {
  const read = relative => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
  const catalog = JSON.parse(read("data/es/catalog.json"));
  const manifest = JSON.parse(read("dist/assets/certichat/manifest.json"));
  const corpusBytes = read("dist/assets/certichat/corpus.json"), corpus = JSON.parse(corpusBytes);
  assert.equal(manifest.contentHash, contentHash(corpusBytes));
  assert.equal(manifest.documents.length, corpus.documents.length);
  const entries = new Map(corpus.documents.map(item => [item.id, item]));
  for (const course of catalog.courses) {
    for (const page of [...course.modules, ...course.resources]) assert.ok(entries.has(`${course.id}/${page.slug}`));
    const hasPractice = course.resources.some(page => page.slug === 'practice');
    for (const question of JSON.parse(read(`data/es/${course.questionBank}.json`))) {
      const entry = entries.get(`${course.id}/questions/${question.id}`);
      if (!hasPractice) { assert.equal(entry, undefined); continue; }
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

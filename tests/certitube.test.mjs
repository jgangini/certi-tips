import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import MarkdownIt from "markdown-it";
import { Remarkable } from "remarkable";
import { parseVideo, loadVideos, chapterTime, videoDocuments, videoBody, videoCarousel } from "../scripts/certitube.mjs";
import { layout } from "../scripts/layout.mjs";
import { selectedMoment, playbackMoment, mountPlayer } from "../assets/certitube.js";
import { answerWithReferences, configureChatMarkdown, restoreChat } from "../assets/certichat.js";
import { corpusArtifacts } from "../scripts/certichat-corpus.mjs";

test("unsegmented videos hide duplicate controls while retaining their registered citation", () => {
  const video = parseVideo(readFileSync(new URL("../data/certitube/MWASexQNDVU/MWASexQNDVU.md", import.meta.url), "utf8"), "MWASexQNDVU");
  const html = videoBody(video, new MarkdownIt(), site);
  assert.equal(video.title, "AI Data Platform Workbench for VS Code Community Edition");
  assert.match(html, /class="tube-chapters" hidden/);
  assert.match(html, /class="tube-description" hidden/);
  assert.match(html, /href="#t-0" data-tube-time="0"/);
  assert.ok(videoDocuments(video, site).some(doc => doc.id.endsWith("#t-0")));
  assert.doesNotMatch(html, /<\/a>\.\s*<\/li>/);
  assert.doesNotMatch(videoCarousel([video], video.publicPath, site.base).split("<ol>")[1], /<small>/);
});

const id = "sSQAGSs23uY", site = { origin: "https://jgangini.github.io", base: "/certitips/" };
// Controlled sample: independent of the published video collection.
const source = `\`\`\`json
{
  "title": "Despliegue automatizado con OCI Resource Manager",
  "videoId": "sSQAGSs23uY",
  "channelUrl": "https://www.youtube.com/@jgangini",
  "publishedAt": "2025-07-24",
  "addedAt": "2026-10-13T22:50:04-05:00",
  "reviewedAt": "2026-10-13",
  "durationSeconds": 450,
  "status": "published",
  "topics": ["Oracle Cloud", "Resource Manager", "Automatización", "Oracle AI Accelerator"]
}
\`\`\`

## Resumen

Conoce el despliegue automatizado de Oracle AI Accelerator en Oracle Cloud mediante Resource Manager y una instancia Linux. El caso conecta la preparación del entorno con la ejecución de una aplicación Streamlit.

## Capítulos

### 00:00 — Introducción

Presentación del despliegue automatizado de Oracle AI Accelerator sobre Linux con Resource Manager.

### 00:49 — Crear el compartimento

El video introduce la creación del compartimento para el proyecto. Es el punto de entrada para seguir la preparación del entorno de la demostración.

### 01:14 — Configurar las políticas de identidad

Este segmento aborda las políticas de identidad del laboratorio. La documentación enlazada utiliza permisos amplios para pruebas; ese ejemplo no define una política mínima para producción.

### 03:06 — Generar la Clave de API

El capítulo muestra la preparación de la clave de API. La documentación del proyecto relaciona esa clave con los archivos de configuración utilizados para el despliegue.

### 05:32 — Conectarse a la instancia de Oracle Linux

Este capítulo permite localizar la conexión a la instancia Linux del ejemplo. Consulta el repositorio para los detalles de configuración y acceso de esa versión del proyecto.

## Recursos relacionados

- [Video completo en AI CloudTech](https://www.youtube.com/watch?v=sSQAGSs23uY).
- [Documentación del despliegue del proyecto](https://github.com/jganggini/oracle-ai-accelerator/blob/main/docs/4-automated-deployment-on-oci-resource-manager-linux.md).
- [Repositorio Oracle AI Accelerator](https://github.com/jganggini/oracle-ai-accelerator).
- [Guía de identidad y acceso de CertiTips]({{base}}1Z0-1085-26/iam/).
`;

test("CertiTube omits the fixed sidebar and keeps the ordered video carousel", () => {
  const video = parseVideo(source, id);
  const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
  const course = { id: "site", route: "certitube", modules: [], resources: [] };
  for (const slug of [video.publicPath]) {
    const navigation = videoCarousel([video], slug, site.base);
    const html = layout({ site: { ...catalog, videos: [video] }, course, page: { slug, title: "CertiTube", description: video.summary }, body: videoBody(video, new MarkdownIt(), site) });
    assert.match(html, /class="course-page"/);
    assert.match(html, /<main id="main" class="course-main"/);
    assert.doesNotMatch(html, /<aside class="sidebar" id="course-navigation"/);
    assert.match(html, /aria-label="Videos de CertiTube"/);
    assert.match(html, new RegExp(`<link rel="canonical" href="${site.origin}${site.base}${slug}/"`));
    assert.doesNotMatch(html, /data-progress|data-completion=|data-mark-complete|tube-grid|tube-card|class="tube-nav"|Biblioteca|tube-search/);
    assert.match(navigation, new RegExp(`href="${site.base}${slug}/" title="[^"]+" aria-current="page"`));
    assert.match(navigation, /i.ytimg.com\/vi\/sSQAGSs23uY\/mqdefault.jpg/);
    assert.doesNotMatch(navigation, /\d\d:\d\d —/);
    assert.match(html, /search-result-icon-video/);
    assert.match(html, /assets\/icons\/certitube.svg#certitube/);
    assert.doesNotMatch(html, /class="page-heading|class="page-lead"|class="tube-meta"|tube-player-actions|data-tube-play[\s>]|sidebar-heading/);
    assert.match(html, /class="certichat-heading tube-heading"[^]*?class="tube-screen"[^]*?class="tube-chapters"/);
    assert.doesNotMatch(html.match(/<header class="site-header">[^]*?<\/header>/)[0], /class="menu-toggle"/);
    const header = html.match(/<header class="site-header">[^]*?<\/header>/)[0];
    assert.match(header, /aria-label="CertiTips"[^]*?aria-label="CertiQuiz"[^]*?aria-label="CertiTube"[^]*?aria-label="CertiChat"[^]*?class="search-toggle"/);
  }
});

test("summary paragraph breaks retain the complete description and accessible link titles", () => {
  const original = parseVideo(source, id);
  const video = parseVideo(source.replace("## Capítulos", "Otro párrafo que explica el video.\n\n## Capítulos"), id);
  assert.equal(video.summary, `${original.summary} Otro párrafo que explica el video.`);
  const html = videoBody(video, new MarkdownIt(), site);
  assert.match(html, /<p>Otro párrafo que explica el video\.<\/p>/);
  assert.match(html, /<a [^>]*title="[^"]+"/);
});

test("published video produces matching safe pages, timed evidence and chat references", () => {
  const video = parseVideo(source, id), docs = videoDocuments(video, site);
  const html = videoBody(video, new MarkdownIt(), site);
  assert.match(html, /id="t-332"/);
  assert.match(html, /data-tube-description="332" aria-labelledby="t-332" hidden/);
  assert.match(html, /<h2 id="resumen">Resumen<\/h2>/);
  assert.match(html, /class="tube-resources"[^]*?<h2 id="recursos-relacionados">Recursos relacionados<\/h2>/);
  assert.doesNotMatch(html, /id="capitulos"|Reproducir desde|Caso de uso/);
  assert.doesNotMatch(html, /"status":|"reviewedAt":/);
  assert.ok(docs.every(doc => doc.courseId === "site" && doc.text.includes("2025-07-24")));
  assert.ok(!docs.some(doc => doc.id.endsWith("#capitulos") || doc.id.endsWith("#resumen")));
  assert.ok(!docs.some(doc => doc.text.includes("Reproducir desde") || doc.text.includes("data-tube-")));
  const moment = docs.find(doc => doc.url.endsWith("#t-332"));
  assert.match(moment.text, /05:32 — Conectarse/);
  assert.match(moment.text, /conexión a la instancia Linux/);
  const answer = answerWithReferences("Consulta este momento.", [moment], site.origin + site.base);
  const restored = restoreChat({ updatedAt: 100, messages: [{ role: "ai", text: answer }] }, site.origin + site.base, 100);
  assert.match(configureChatMarkdown(new Remarkable(), site.origin + site.base).render(restored.messages[0].text), /href="\/certitips\/certitube\/sSQAGSs23uY\/#t-332"/);
  assert.deepEqual(corpusArtifacts(docs, "unused"), corpusArtifacts(videoDocuments(parseVideo(source, id), site), "unused"));
});

test("drafts disappear and incomplete published cards fail before publication", () => {
  assert.equal(parseVideo(source.replace('"published"', '"draft"').replace('"reviewedAt": "2026-10-13"', '"reviewedAt": null'), id), null);
  for (const changed of [source.replace('"reviewedAt": "2026-10-13"', '"reviewedAt": null'), source.replace("Conoce el despliegue", "<Completar resumen>"), source.replace("## Resumen", "## Otra sección"), source.replace('"videoId": "sSQAGSs23uY"', '"videoId": "../unsafe"')]) assert.throws(() => parseVideo(changed, id));
  assert.throws(() => parseVideo(source.replace(/## Capítulos[\s\S]*?## Recursos relacionados/, "## Recursos relacionados"), id));
  assert.throws(() => parseVideo(source.replace(/## Resumen[\s\S]*?## Capítulos/, "## Resumen\n\n---\n\n## Capítulos"), id));
  assert.throws(() => parseVideo(source + "\n## Resumen\n\nDuplicado.", id));
  assert.throws(() => parseVideo(source.replace('"2025-07-24"', '"2025-02-30"'), id));
  assert.throws(() => parseVideo(source.replace('"2025-07-24"', '"2025-99-99"'), id));
  assert.throws(() => parseVideo(source.replace('"2026-10-13T22:50:04-05:00"', '"2026-10-13T22:50:04"'), id), /addedAt/);
});

test("timestamps support hours, reject invalid order and retain identity after renaming", () => {
  assert.equal(chapterTime("01:05:32 — Ejemplo").seconds, 3932);
  assert.equal(chapterTime("65:32 — Ejemplo").seconds, 3932);
  for (const value of ["05:60 — Error", "00:99:00 — Error", "-1:00 — Error", "1.2 — Error", "05:32"]) assert.throws(() => chapterTime(value));
  for (const time of ["00:49", "00:20", "07:30"]) assert.throws(() => parseVideo(source.replace("05:32", time), id));
  const renamed = parseVideo(source.replace("Conectarse a la instancia de Oracle Linux", "Abrir la conexión"), id);
  assert.ok(videoDocuments(renamed, site).some(doc => doc.url.endsWith("#t-332")));
});

test("published evidence cannot lose its date or time through downstream chunking", () => {
  const oversized = parseVideo(source.replace("Este capítulo permite", `${"Explicación extensa. ".repeat(200)} Este capítulo permite`), id);
  assert.throws(() => videoDocuments(oversized, site), /3000-character evidence limit/);
});

test("the latest incorporation comes first even for an older video; drafts stay excluded", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "certitube-test-")), draftId = "abcdefghijk", latestId = "zyxwvutsrqp";
  try {
    for (const videoId of [id, draftId, latestId]) {
      const dir = path.join(root, "data", "certitube", videoId);
      await mkdir(dir, { recursive: true });
      let content = source.replaceAll(id, videoId);
      if (videoId === draftId) content = content.replace('"published"', '"draft"');
      if (videoId === latestId) content = content.replace('"2025-07-24"', '"2020-01-01"').replace('"2026-10-13T22:50:04-05:00"', '"2026-10-14T04:50:04Z"');
      await writeFile(path.join(dir, `${videoId}.md`), content);
    }
    const videos = await loadVideos(root, site.base);
    assert.deepEqual(videos.map(video => video.videoId), [latestId, id]);
    assert.doesNotMatch(videoCarousel(videos, latestId, site.base), new RegExp(draftId));
    assert.ok(videos.flatMap(video => videoDocuments(video, site)).every(doc => !doc.id.includes(draftId)));
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith("certitube-test-"));
    await rm(root, { recursive: true, force: true });
  }
});

test("unsafe Markdown cannot inject a player or executable links", () => {
  const malicious = source.replace("Conoce el despliegue", "[Ejemplo](javascript:alert(1)) ![Imagen](https://example.test/a.png) Conoce el despliegue");
  const html = videoBody(parseVideo(malicious, id), new MarkdownIt(), site);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.doesNotMatch(videoCarousel([], "", site.base), /Biblioteca/);
});

test("only registered canonical times can control playback", () => {
  const moments = new Map([[0, { seconds: 0 }], [332, { seconds: 332 }]]);
  assert.equal(selectedMoment("#t-332", moments).seconds, 332);
  assert.equal(selectedMoment("#t-0", moments).seconds, 0);
  for (const hash of ["#t-0332", "#t--1", "#t-333", "#t-3.32", "#t-NaN", "#t-332&evil", "#other"]) assert.equal(selectedMoment(hash, moments), undefined);
});

test("playback selects the chapter interval, including exact boundaries and backward seeking", () => {
  const moments = new Map([0, 49, 74, 186, 332].map(seconds => [seconds, { seconds }]));
  for (const [time, expected] of [[0, 0], [48.99, 0], [49, 49], [73.99, 49], [74, 74], [331.99, 186], [332, 332], [450, 332]]) assert.equal(playbackMoment(time, moments, 450)?.seconds, expected);
  for (const time of [-1, NaN, Infinity, "74", 451]) assert.equal(playbackMoment(time, moments, 450), undefined);
});

function playerFixture(hash = "#t-332") {
  const calls = [], handlers = {};
  const timers = new Map(); let timerId = 0, scrolls = 0;
  const external = { hidden: true }, status = { hidden: true }, message = {}, spinner = { hidden: false };
  const strip = { getBoundingClientRect: () => ({ left: 0, right: 100 }), scrollBy() {} };
  const links = [0, 49, 332].map(seconds => ({ dataset: { tubeTime: String(seconds) }, querySelector: () => ({ textContent: String(seconds) }), setAttribute() {}, removeAttribute() {}, parentElement: strip, getBoundingClientRect: () => ({ left: 0, right: 10 }) }));
  const panels = [0, 49, 332].map(seconds => ({ dataset: { tubeDescription: String(seconds) }, hidden: true }));
  const root = { dataset: { duration: "450", videoId: id }, querySelector: name => ({ "[data-tube-external]": external, "[data-tube-status]": status, "[data-tube-message]": message, "[data-tube-loading]": spinner })[name], querySelectorAll: name => name === "[data-tube-time]" ? links : panels, scrollIntoView() { scrolls++; }, focus() {} };
  const location = new URL(`https://jgangini.github.io/certitips/certitube/${id}/${hash}`);
  const frame = {};
  const player = { time: 0, state: 5, getCurrentTime() { return this.time; }, getPlayerState() { return this.state; }, getDuration: () => 450, seekTo(seconds) { this.time = seconds; calls.push(["seek", seconds]); }, playVideo() { this.state = 1; calls.push(["play"]); }, pauseVideo() { this.state = 2; calls.push(["pause"]); }, getIframe: () => frame };
  let options;
  const window = { matchMedia: () => ({ matches: true }), setInterval: fn => { timers.set(++timerId, fn); return timerId; }, clearInterval: id => timers.delete(id), requestAnimationFrame: fn => fn(), addEventListener: (type, fn) => { handlers[type] = fn; }, YT: { Player: function (_id, opts) { options = opts; return player; } } };
  const document = { querySelectorAll: () => links, addEventListener: (type, fn) => { handlers[type] = fn; } };
  const history = { pushState(_a, _b, hash) { location.hash = hash; } };
  return { root, location, window, document, history, handlers, calls, external, status, message, spinner, panels, player, timers, get scrolls() { return scrolls; }, get options() { return options; } };
}

async function withPlayer(hash, check) {
  const fixture = playerFixture(hash), saved = {};
  for (const key of ["window", "document", "location", "history"]) { saved[key] = globalThis[key]; globalThis[key] = fixture[key]; }
  try { mountPlayer(fixture.root); await Promise.resolve(); await check(fixture); }
  finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
}

test("loading keeps the latest selection; repeated clicks and history seek the same player", async () => {
  await withPlayer("#t-49", async f => {
    assert.equal(f.spinner.hidden, false); assert.equal(f.status.hidden, true);
    f.location.hash = "#t-332"; f.handlers.hashchange();
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.panels.filter(panel => !panel.hidden).map(panel => panel.dataset.tubeDescription), ["332"]);
    f.options.events.onReady({ target: f.player });
    assert.equal(f.spinner.hidden, true);
    assert.deepEqual(f.calls, [["seek", 332], ["play"]]);
    const click = { button: 0, composedPath: () => [{ tagName: "A", href: f.location.href }], preventDefault() {} };
    f.handlers.click(click); f.handlers.click(click);
    assert.equal(f.calls.filter(call => call[0] === "seek").length, 3);
    f.location.hash = "#t-49"; f.handlers.hashchange();
    assert.deepEqual(f.calls.at(-2), ["seek", 49]);
    assert.deepEqual(f.panels.filter(panel => !panel.hidden).map(panel => panel.dataset.tubeDescription), ["49"]);
    f.handlers.pageshow({ persisted: true });
    assert.deepEqual(f.calls.at(-2), ["seek", 49]);
    assert.match(f.external.href, /t=49s$/);
    f.location.hash = "#t-999"; f.handlers.hashchange();
    assert.deepEqual(f.calls.at(-1), ["pause"]);
  });
});

test("player failure before readiness replaces the loading indicator with the external fallback", async () => {
  await withPlayer("#t-49", async f => {
    f.options.events.onError();
    assert.equal(f.spinner.hidden, true);
    assert.equal(f.status.hidden, false); assert.equal(f.external.hidden, false);
    assert.match(f.external.href, /t=49s$/);
  });
});

test("ordinary visits stay paused and browser/player failures preserve the external fallback", async () => {
  await withPlayer("", async f => {
    f.options.events.onReady({ target: f.player }); assert.deepEqual(f.calls, []);
    assert.deepEqual(f.panels.filter(panel => !panel.hidden).map(panel => panel.dataset.tubeDescription), ["0"]);
    assert.equal(f.status.hidden, true); assert.equal(f.external.hidden, true);
    f.location.hash = "#t-49"; f.handlers.hashchange();
    f.options.events.onAutoplayBlocked(); assert.match(f.message.textContent, /Pulsa reproducir en el video/);
    assert.equal(f.external.hidden, true);
    f.options.events.onStateChange({ data: 1 }); assert.equal(f.status.hidden, true);
    f.options.events.onError({ data: 101 }); assert.match(f.message.textContent, /YouTube/); assert.equal(f.external.hidden, false);
    f.location.hash = "#t-332"; f.handlers.hashchange(); assert.match(f.external.href, /t=332s$/);
  });
});

test("removed moments never start a shortened video", async () => {
  await withPlayer("#t-332", async f => {
    f.player.getDuration = () => 120;
    f.options.events.onReady({ target: f.player });
    assert.deepEqual(f.calls, [["pause"]]); assert.match(f.message.textContent, /ya no está disponible/);
  });
});

test("playback follows native time without seeking or scrolling the page, and stops polling when idle", async () => {
  await withPlayer("#t-49", async f => {
    f.options.events.onReady({ target: f.player });
    const scrolls = f.scrolls, seeks = f.calls.filter(call => call[0] === "seek").length;
    f.options.events.onStateChange({ data: 1 }); assert.equal(f.timers.size, 1);
    f.player.time = 340; [...f.timers.values()][0]();
    assert.equal(f.root.dataset.activeMoment, "332");
    assert.deepEqual(f.panels.filter(panel => !panel.hidden).map(panel => panel.dataset.tubeDescription), ["332"]);
    assert.equal(f.scrolls, scrolls); assert.equal(f.location.hash, "#t-49");
    assert.equal(f.calls.filter(call => call[0] === "seek").length, seeks);
    f.player.time = 50; f.player.state = 2; f.options.events.onStateChange({ data: 2 });
    assert.equal(f.root.dataset.activeMoment, "49"); assert.equal(f.timers.size, 0);
    f.player.state = 1; f.options.events.onStateChange({ data: 1 }); assert.equal(f.timers.size, 1);
    f.document.hidden = true; f.handlers.visibilitychange(); assert.equal(f.timers.size, 0);
    f.document.hidden = false; f.handlers.visibilitychange(); assert.equal(f.timers.size, 1);
    f.options.events.onStateChange({ data: 0 }); assert.equal(f.timers.size, 0);
    f.options.events.onStateChange({ data: 1 }); f.handlers.pagehide(); assert.equal(f.timers.size, 0);
    f.options.events.onStateChange({ data: 1 }); f.options.events.onError(); assert.equal(f.timers.size, 0);
  });
});

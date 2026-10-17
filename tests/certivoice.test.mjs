import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { animateVoiceEdge, encodeVoiceWav, heardCharacters, nativePronunciation, preferredNativeVoice, restoreVoicePlayback, voiceMemoryFresh, VoiceActivity } from "../assets/certivoice-audio.js";
import { validVoiceNavigation, pendingNavigation, shouldResumeNavigation, performVoiceAction, voiceContext, voicePageURL } from "../assets/certivoice-actions.js";
import { mountPlayer } from "../assets/certitube.js";
import { practiceTargets, performPracticeAction, guardPracticeNavigation } from "../assets/certivoice-practice.js";
import { practiceReturnURL, rememberPracticeReturn, highlightPhrase } from "../assets/certivoice-study.js";
import { installVoiceChatControls } from "../assets/certivoice-chat.js";

test("voice WAV is mono PCM16 at 16 kHz, bounded and clipped", () => {
  const encoded = encodeVoiceWav([new Float32Array(48000).fill(.5)], 48000);
  const buffer = Buffer.from(encoded, "base64");
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WAVE");
  assert.equal(buffer.readUInt16LE(22), 1);
  assert.equal(buffer.readUInt32LE(24), 16000);
  assert.equal(buffer.length, 32044);
  assert.equal(buffer.readInt16LE(44), 16384);
  const clipped = Buffer.from(encodeVoiceWav([Float32Array.of(-2, 2, NaN)], 16000), "base64");
  assert.equal(clipped.readInt16LE(44), -32768);
  assert.equal(clipped.readInt16LE(46), 32767);
  assert.equal(clipped.readInt16LE(48), 0);
  assert.throws(() => encodeVoiceWav([new Float32Array(16000 * 31)], 16000));
  assert.throws(() => encodeVoiceWav([], 16000));
});

test("VAD ignores silence and brief clicks, preserves a turn, and cuts at 30 seconds", () => {
  const vad = new VoiceActivity(16000), silence = new Float32Array(1600), voice = new Float32Array(1600).fill(.1);
  for (let i = 0; i < 10; i++) assert.deepEqual(vad.push(silence), {});
  assert.deepEqual(vad.push(voice), {});
  assert.deepEqual(vad.push(silence), {});
  vad.push(voice); assert.equal(vad.push(voice).started, true);
  let result;
  for (let i = 0; i < 10; i++) { const next = vad.push(silence); if (next.chunks) result = next; }
  assert(result.chunks.length > 2); assert.equal(vad.active, false);
  vad.reset();
  for (let i = 0; i < 310; i++) { const next = vad.push(voice); if (next.chunks) { result = next; break; } }
  assert.equal(result.chunks.reduce((sum, chunk) => sum + chunk.length, 0), 480000);
});

test("playback progress is a bounded estimate, including invalid durations", () => {
  assert.equal(heardCharacters("abcdefghij", 3, 10), 3);
  assert.equal(heardCharacters("abcdefghij", 12, 10), 10);
  assert.equal(heardCharacters("abcdefghij", -1, 10), 0);
  assert.equal(heardCharacters("abcdefghij", 1, 0), 0);
});

test("native voice keeps the UI language and prioritizes explicit multilingual then natural voices", () => {
  const legacy = { name: "Microsoft Sabina", lang: "es-MX" }, natural = { name: "Microsoft Elvira Online (Natural)", lang: "es-ES" };
  const multilingual = { name: "Microsoft Dalia Multilingual", lang: "es-MX" }, english = { name: "Microsoft Jenny Multilingual", lang: "en-US" };
  assert.equal(preferredNativeVoice([legacy, natural, english, multilingual], "es"), multilingual);
  assert.equal(preferredNativeVoice([legacy, natural, english], "es-MX"), natural);
  assert.equal(preferredNativeVoice([legacy, english], "es"), legacy);
  assert.equal(preferredNativeVoice([english], "es"), undefined);
});

test("the reported Oracle AI pronunciation changes only speech and maps interruption back to original text", () => {
  const voice = { name: "Microsoft Sabina", lang: "es-MX" }, original = "Abre Oracle AI. Luego explica Oracle AI con ejemplos.";
  const spoken = nativePronunciation(original, voice);
  assert.equal(spoken.text, "Abre Órakol éi ái. Luego explica Órakol éi ái con ejemplos.");
  assert.equal(original, "Abre Oracle AI. Luego explica Oracle AI con ejemplos.");
  assert.equal(spoken.sourceIndex(spoken.text.indexOf("éi")), original.indexOf("Oracle"), "An interrupted alias resumes conservatively from its original start");
  const resumedAt = spoken.sourceIndex(spoken.text.indexOf("Luego"));
  assert.equal(original.slice(resumedAt), "Luego explica Oracle AI con ejemplos.");
  const resumed = nativePronunciation(original.slice(resumedAt), voice);
  assert.equal(resumedAt + resumed.sourceIndex(resumed.text.indexOf("con ejemplos")), original.indexOf("con ejemplos"));
  assert.equal(spoken.sourceIndex(spoken.text.length), original.length);
  for (const other of [{ name: "Microsoft Zira", lang: "en-US" }, { ...voice, name: "Microsoft Elvira Online (Natural)" }, { ...voice, name: "Microsoft Dalia Multilingual" }, { ...voice, name: "Monica" }]) assert.equal(nativePronunciation(original, other).text, original);
  assert.equal(nativePronunciation("AI, OpenAI, Oracle Database y myOracle AI2.", voice).text, "AI, OpenAI, Oracle Database y myOracle AI2.");
});

test("speech edge follows decoded amplitude, decays in silence and cleans up for stop or reduced motion", () => {
  const names = ["matchMedia", "requestAnimationFrame", "cancelAnimationFrame"], original = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const motion = { matches: false }, frames = new Map(), styles = new Map(), context = { currentTime: 0 };
  let nextFrame = 0;
  globalThis.matchMedia = () => motion;
  globalThis.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const samples = new Float32Array(2048); samples.fill(.2, 0, 512);
  const buffer = { sampleRate: 1024, getChannelData: () => samples };
  const edge = { style: { setProperty: (name, value) => styles.set(name, value), removeProperty: name => styles.delete(name) } };
  const draw = () => { const [id, callback] = frames.entries().next().value; frames.delete(id); callback(); };
  try {
    const stop = animateVoiceEdge(context, buffer, edge);
    draw(); const attack = Number(styles.get("--voice-level"));
    draw(); const louder = Number(styles.get("--voice-level"));
    assert(attack > 0 && louder > attack && louder <= 1, "Speech should brighten with bounded, smoothed amplitude");
    context.currentTime = 1; draw();
    assert(Number(styles.get("--voice-level")) < louder, "Silence should smoothly reduce the glow");
    stop(); assert.equal(frames.size, 0); assert.equal(styles.has("--voice-level"), false);
    animateVoiceEdge(context, buffer, edge); motion.matches = true; draw();
    assert.equal(frames.size, 0); assert.equal(styles.has("--voice-level"), false);
    animateVoiceEdge(context, { getChannelData() { throw new Error("Reduced motion must skip sampling"); } }, edge)();
    assert.equal(frames.size, 0);
  } finally {
    names.forEach((name, index) => original[index] ? Object.defineProperty(globalThis, name, original[index]) : delete globalThis[name]);
  }
});

test("voice navigation only accepts same-site destinations and expires after 24 hours", () => {
  const current = "https://site.test/certitips/es/course/overview/", base = "/certitips/";
  for (const value of [undefined, "", "javascript:alert(1)", "https://other.test/certitips/", "https://user:pass@site.test/certitips/", "/outside/", "/certitips/?secret=1"]) assert.equal(validVoiceNavigation(value, current, base), null);
  assert.equal(validVoiceNavigation("/certitips/es/course/next/", current, base).pathname, "/certitips/es/course/next/");
  assert(pendingNavigation({ url: current, createdAt: 500 }, current, base, 1000));
  assert.equal(pendingNavigation({ url: current, createdAt: 1001 }, current, base, 1000), null);
  assert.equal(pendingNavigation({ url: current, createdAt: 500 }, current, base, 86400500), null);
  assert.equal(pendingNavigation({ url: "/certitips/es/different/", createdAt: 500 }, current, base, 1000), null);
});

test("voice session continuity spans site pages without weakening URL or original lifetime checks", () => {
  const current = "https://site.test/certitips/en/certitube/", base = "/certitips/";
  const saved = { url: "https://site.test/certitips/en/course/", createdAt: 500, session: true, pending: true };
  assert.deepEqual(pendingNavigation(saved, current, base, 1000), saved);
  for (const session of [undefined, false, "true", 1]) assert.equal(pendingNavigation({ ...saved, session }, current, base, 1000), null);
  for (const url of ["javascript:alert(1)", "https://other.test/certitips/", "https://user:pass@site.test/certitips/", "/outside/", "/certitips/?secret=1"])
    assert.equal(pendingNavigation({ ...saved, url }, current, base, 1000), null);
  assert.equal(pendingNavigation({ ...saved, createdAt: 1001 }, current, base, 1000), null);
  assert.equal(pendingNavigation(saved, current, base, 86400500), null);
  assert.equal(pendingNavigation(saved, current, base, 86400499).createdAt, 500);
});

test("automatic voice handoff requires a fresh explicit marker and its exact same-site destination", () => {
  const current = "https://site.test/certitips/en/course/next/#section", base = "/certitips/", now = 100000;
  const saved = { url: current, createdAt: 500, session: true, pending: true, autoResume: true, resumeAt: now - 30000 };
  assert.equal(shouldResumeNavigation(saved, current, base, now), true);
  assert.equal(shouldResumeNavigation({ ...saved, resumeAt: now }, current, base, now), true);
  for (const key of ["session", "pending", "autoResume"]) for (const value of [undefined, false, "true", 1])
    assert.equal(shouldResumeNavigation({ ...saved, [key]: value }, current, base, now), false);
  for (const resumeAt of [undefined, NaN, Infinity, "100000", 499, now + 1, now - 30001])
    assert.equal(shouldResumeNavigation({ ...saved, resumeAt }, current, base, now), false);
  for (const url of ["https://other.test/certitips/en/course/next/#section", "https://site.test:444/certitips/en/course/next/#section", "/outside/", current.replace("next/", "other/"), current.replace("#section", "#other"), `${current.split("#")[0]}?x=1#section`])
    assert.equal(shouldResumeNavigation({ ...saved, url }, current, base, now), false);
  assert.equal(shouldResumeNavigation(saved, "invalid URL", base, now), false);
  assert.equal(shouldResumeNavigation({ ...saved, resumeAt: 86400500 }, current, base, 86400500), false);
  assert.equal(shouldResumeNavigation(pendingNavigation(saved, current, base, now), current, base, now), false,
    "Persisting the validated continuity record consumes the handoff marker before permission or capture awaits");
  assert.equal(saved.autoResume, true, "The predicate does not mutate storage; the controller owns one-use consumption");
});

test("voice playback keeps only bounded text progress for 24 hours, never audio", () => {
  const saved = { requestId: '12345678-1234-4234-8234-123456789abc', answer: 'Explicación', heardCharacters: 3, createdAt: 500, audio: 'private audio' };
  assert.deepEqual(restoreVoicePlayback(saved, 1000), { requestId: saved.requestId, answer: saved.answer, heardCharacters: 3, createdAt: 500 });
  for (const value of [{ ...saved, heardCharacters: -1 }, { ...saved, heardCharacters: 5001 }, { ...saved, requestId: 'invalid' }, { ...saved, createdAt: 1001 }, { ...saved, answer: 'x'.repeat(12001) }]) assert.equal(restoreVoicePlayback(value, 1000), null);
  assert.equal(restoreVoicePlayback(saved, 86400500), null);
  assert.equal(voiceMemoryFresh(500, 86400499), true);
  assert.equal(voiceMemoryFresh(500, 86400500), false);
  assert.equal(voiceMemoryFresh(1001, 1000), false);
});

test("actions never accept arbitrary model URLs or selectors, and unavailable navigation fails", async () => {
  const oldMedia = globalThis.matchMedia, oldLocation = globalThis.location;
  globalThis.matchMedia = () => ({ matches: true }); globalThis.location = new URL("https://site.test/certitips/es/course/overview/");
  const doc = { querySelector: () => null, querySelectorAll: () => [] };
  try {
    assert((await performVoiceAction({ name: "navigate", url: "https://evil.test" }, doc)).error);
    assert((await performVoiceAction({ name: "next_page", targetId: "https://evil.test" }, doc)).error);
    assert((await performVoiceAction({ name: "videos", url: "https://evil.test", targetId: "a[href]" }, doc)).error);
    assert((await performVoiceAction({ name: "home", url: "https://evil.test", targetId: "a[href]" }, doc)).error);
    assert((await performVoiceAction({ name: "open_diagram", targetId: "button" }, doc)).error);
    assert.deepEqual(await performVoiceAction({ name: "stop" }, doc), { control: "stop" });
  } finally { globalThis.matchMedia = oldMedia; globalThis.location = oldLocation; }
});

test("home, catalog and videos follow their distinct valid header destinations in all four languages", async () => {
  const oldMedia = globalThis.matchMedia, oldLocation = globalThis.location;
  globalThis.matchMedia = () => ({ matches: true });
  try {
    for (const locale of ["es", "en", "pt", "it"]) for (const [name, route] of [["home", ""], ["catalog", "courses/"], ["videos", "certitube/"], ["quiz", "certiquiz/"], ["chat", "certichat/"]]) {
      globalThis.location = new URL(`https://site.test/certitips/${locale}/course/overview/`);
      const href = `https://site.test/certitips/${locale}/${route}`;
      const invalid = ["http://[", "javascript:alert(1)", `https://other.test/certitips/${route}`, `https://user:pass@site.test/certitips/${route}`, `${href}?secret=1`, "https://site.test/outside/"];
      const links = invalid.map(href => ({ href }));
      const doc = { querySelector: () => null, querySelectorAll(selector) { assert.equal(selector, name === "home" ? ".site-header a.brand[href]" : ".header-app-link[href]"); return links; } };
      assert((await performVoiceAction({ name }, doc)).error, "Invalid links cannot create a destination");
      links.push({ href: `https://site.test/certitips/${locale}/${name === "home" ? "courses/" : ""}` });
      assert((await performVoiceAction({ name }, doc)).error, "Home and catalog cannot substitute for each other");
      links.push({ href });
      assert.deepEqual(await performVoiceAction({ name, url: "https://evil.test", targetId: "a[href]" }, doc), { navigation: href });
      assert((await performVoiceAction({ name: "invented_action", url: href }, doc)).error);
    }
  } finally { globalThis.matchMedia = oldMedia; globalThis.location = oldLocation; }
});

test("an already open home, catalog or videos page confirms without a header link or reload", async () => {
  const oldMedia = globalThis.matchMedia, oldLocation = globalThis.location;
  globalThis.matchMedia = () => ({ matches: true });
  const doc = { title: "Current page", querySelector: () => ({ textContent: "Current heading" }), querySelectorAll: () => [] };
  try {
    for (const locale of ["es", "en", "pt", "it"]) for (const [name, route] of [["home", ""], ["catalog", "courses/"], ["videos", "certitube/"], ["quiz", "certiquiz/"], ["chat", "certichat/"]]) {
      globalThis.location = new URL(`https://site.test/certitips/${locale}/${route}`);
      assert.deepEqual(await performVoiceAction({ name }, doc), { confirmation: "Página abierta: Current heading" });
    }
  } finally { globalThis.matchMedia = oldMedia; globalThis.location = oldLocation; }
});

test("deferred actions survive only their exact destination, original lifetime and closed schema", () => {
  const url = "https://site.test/certitips/es/course/agents/#diagram-one.svg", base = "/certitips/";
  const saved = { url, createdAt: 500, session: true, pending: true, afterNavigation: { name: "start_presentation", targetId: "course/agents#diagram-one.svg" } };
  assert.deepEqual(pendingNavigation(saved, url, base, 1000), saved);
  assert.equal(pendingNavigation(saved, url.replace("agents/", "overview/"), base, 1000).afterNavigation, undefined);
  for (const afterNavigation of [{ name: "navigate", targetId: "https://evil.test" }, { name: "start_presentation", targetId: "" }, { name: "start_presentation", targetId: "x".repeat(201) }, { name: "catalog_menu", targetId: "a" }])
    assert.equal(pendingNavigation({ ...saved, afterNavigation }, url, base, 1000).afterNavigation, undefined);
  assert.equal(pendingNavigation({ ...saved, pending: false }, url, base, 1000).afterNavigation, undefined);
  assert.equal(pendingNavigation(saved, url, base, 86400500), null);
  assert.deepEqual(pendingNavigation({ ...saved, afterNavigation: { name: "catalog_menu", url: "https://evil.test" } }, url, base, 1000).afterNavigation, { name: "catalog_menu" });
});

test("registered controls expose bounded IDs and reuse only real course, language, theme, search and video controls", async () => {
  const names = ["location", "matchMedia", "innerHeight", "fetch", "CustomEvent"], originals = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const all = new Map(), one = new Map(), calls = [];
  const doc = { body: { dataset: { base: "/certitips/it/", courseRoute: "COURSE" } }, documentElement: { dataset: { theme: "light" } }, querySelector: selector => one.get(selector) || null, querySelectorAll: selector => all.get(selector) || [] };
  globalThis.location = new URL("https://site.test/certitips/it/COURSE/overview/");
  globalThis.matchMedia = () => ({ matches: true }); globalThis.innerHeight = 900;
  globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
  const course = { href: "https://site.test/certitips/it/COURSE/overview/", querySelector: () => ({ textContent: "Real published course" }) };
  all.set('#site-search [data-search-kind="certification"] a[href]', [course, { ...course, href: "https://evil.test/certitips/it/BAD/overview/" }]);
  all.set("#course-section-list .nav-link[href]", [{ href: "https://site.test/certitips/it/COURSE/agents/", querySelector: () => ({ textContent: "Real module" }) }]);
  const language = { href: "https://site.test/certitips/en/COURSE/overview/", dataset: { languageLink: "en" }, textContent: "English", click: () => calls.push("language") };
  all.set("[data-language-link]", [language]);
  one.set("[data-theme-toggle]", { click() { calls.push("theme"); doc.documentElement.dataset.theme = "dark"; } });
  const search = { open: false }, input = { value: "", dispatchEvent: event => calls.push(event.type) };
  one.set("#site-search", search); one.set("#search-query", input); one.set("[data-search-open]", { click() { search.open = true; } });
  const player = { dataset: { videoId: "abcdefghijk", duration: "100" }, dispatchEvent(event) { calls.push(event.detail); event.detail.accepted = true; } };
  one.set("[data-tube-player]", player);
  all.set("[data-tube-time]", [{ dataset: { tubeTime: "32" }, textContent: "00:32 Real chapter" }, { dataset: { tubeTime: "101" }, textContent: "Outside duration" }]);
  try {
    const context = voiceContext(doc);
    assert(context.targets.some(item => item.id === "course:COURSE" && item.action === "course_presentation"));
    assert(context.targets.every(item => Object.keys(item).sort().join() === "action,id,label"));
    assert(!context.targets.some(item => item.id.includes("BAD") || item.id.endsWith(":101") || item.action === "video_play"));
    assert((await performVoiceAction({ name: "open_course", targetId: "course:BAD" }, doc)).error);
    assert.deepEqual(await performVoiceAction({ name: "open_course", targetId: "course:COURSE" }, doc), { confirmation: "Real published course" });
    assert.deepEqual(await performVoiceAction({ name: "open_module", targetId: "module:COURSE/agents" }, doc), { navigation: "https://site.test/certitips/it/COURSE/agents/" });
    assert((await performVoiceAction({ name: "open_module", targetId: "module:COURSE/invented" }, doc)).error);
    assert.deepEqual(await performVoiceAction({ name: "start_presentation" }, doc), { error: "Este módulo no contiene imágenes para presentar. Puedes elegir otro módulo." });
    const changeLanguage = await performVoiceAction({ name: "set_language", targetId: "language:en" }, doc);
    assert.equal(changeLanguage.navigation, language.href); assert.equal(calls.length, 0); changeLanguage.activate();
    await performVoiceAction({ name: "set_theme", targetId: "theme:dark" }, doc);
    await performVoiceAction({ name: "set_theme", targetId: "theme:dark" }, doc);
    assert.equal(calls.filter(item => item === "theme").length, 1, "Setting the current theme never toggles it back");
    assert((await performVoiceAction({ name: "set_theme", targetId: "theme:system" }, doc)).error);
    await performVoiceAction({ name: "search", text: "<script>literal query</script>" }, doc);
    assert.equal(input.value, "<script>literal query</script>"); assert.equal(search.open, true); assert(calls.includes("input"));
    assert((await performVoiceAction({ name: "search", text: "x".repeat(201) }, doc)).error);
    assert((await performVoiceAction({ name: "video_play", targetId: "video:abcdefghijk" }, doc)).error);
    player.dataset.voiceConfirm = "true";
    assert.deepEqual(await performVoiceAction({ name: "video_play", targetId: "video:abcdefghijk" }, doc), { video: { name: "play", videoId: "abcdefghijk" } });
    assert.deepEqual((await performVoiceAction({ name: "video_chapter", targetId: "chapter:abcdefghijk:32" }, doc)).video, { name: "chapter", videoId: "abcdefghijk", seconds: 32 });
    let gallery = [{ src: "/certitips/it/COURSE/agents/img/one.svg", sourceId: "actual-course/agents#diagram-one.svg" }];
    globalThis.fetch = async url => { assert.equal(url.href, "https://site.test/certitips/it/COURSE/gallery.json"); return { ok: true, json: async () => gallery }; };
    assert.deepEqual(await performVoiceAction({ name: "course_presentation", targetId: "course:COURSE" }, doc), { navigation: "https://site.test/certitips/it/COURSE/agents/#diagram-one.svg", afterNavigation: { name: "start_presentation", targetId: gallery[0].sourceId } });
    for (const src of ["https://evil.test/certitips/it/COURSE/agents/img/one.svg", "/certitips/it/OTHER/agents/img/one.svg", "/certitips/it/COURSE/agents/img/one.svg?x=1"]) {
      gallery = [{ ...gallery[0], src }]; assert((await performVoiceAction({ name: "course_presentation", targetId: "course:COURSE" }, doc)).error);
    }
    all.set(".prose :is(h2,h3)[id]", Array.from({ length: 80 }, (_, index) => ({ id: `h${index}`, dataset: { sourceId: `course/agents#h${index}` }, textContent: "x".repeat(300), getBoundingClientRect: () => ({ top: 1 }) })));
    all.set("[data-diagram][data-source-id], .diagram-presentation-nav [data-source-id]", Array.from({ length: 80 }, (_, index) => ({ dataset: { sourceId: `course/agents#diagram-${index}.svg`, voiceLabel: "A diagram" } })));
    const bounded = voiceContext(doc).targets;
    assert.equal(bounded.length, 64); assert(bounded.every(item => item.label.length <= 120 && item.id.length <= 200));
    one.set("#diagram-viewer[open] .dialog-content img", { src: "https://site.test/certitips/it/COURSE/agents/img/one.svg" });
    assert.equal(voicePageURL(doc), "https://site.test/certitips/COURSE/agents/");
    one.set('link[rel="canonical"]', { href: "https://jgangini.github.io/certitips/it/COURSE/overview/" });
    assert.equal(voicePageURL(doc), "https://jgangini.github.io/certitips/COURSE/agents/", "The local SVG changes the module path, never the public corpus origin");
    one.set("#diagram-viewer[open] .dialog-content img", { src: "https://evil.test/certitips/it/COURSE/agents/img/one.svg" });
    assert.equal(voicePageURL(doc), "https://jgangini.github.io/certitips/COURSE/overview/");
    one.delete('link[rel="canonical"]'); one.set("[data-certichat]", { dataset: { siteRoot: "https://jgangini.github.io/certitips/" } });
    assert.equal(voicePageURL(doc), "https://jgangini.github.io/certitips/COURSE/overview/", "Configured site root also keeps preview requests public");
  } finally { names.forEach((name, index) => originals[index] ? Object.defineProperty(globalThis, name, originals[index]) : delete globalThis[name]); }
});

test("completed presentation context prioritizes the next registered slide without replacing or wrapping the current diagram", () => {
  let current = 70, presenting = true;
  const groups = [{ className: "diagram-presentation-group" }, { className: "diagram-presentation-group" }];
  const slides = Array.from({ length: 80 }, (_, index) => ({ parentElement: groups[index <= 70 ? 0 : 1], getAttribute: name => name === "aria-current" ? String(index === current) : null,
    dataset: { sourceId: `course/module#diagram-${index}.svg`, voiceLabel: `Slide ${index + 1}`, slideNumber: String(index + 1) } }));
  const viewer = { open: true, get dataset() { return slides[current].dataset; } };
  const doc = {
    querySelector(selector) {
      if (selector === "#diagram-viewer[data-source-id]" || selector === "#diagram-viewer[open][data-source-id]" && viewer.open) return viewer;
      if (selector === "#diagram-caption") return { textContent: slides[current].dataset.voiceLabel };
      return null;
    },
    querySelectorAll: selector => selector === "[data-diagram][data-source-id], .diagram-presentation-nav [data-source-id]" || selector === '#diagram-viewer[open].is-presenting .diagram-presentation-nav button[data-slide-number][data-source-id]' && viewer.open && presenting ? slides : [],
  };
  const context = voiceContext(doc, slides[current].dataset.sourceId);
  assert.equal(context.diagramId, slides[current].dataset.sourceId);
  assert.equal(context.completedDiagramId, context.diagramId);
  assert.equal(context.nextDiagramId, slides[current + 1].dataset.sourceId);
  assert.notEqual(slides[current].parentElement, slides[current + 1].parentElement, "Continuation crosses the module group boundary");
  assert.equal(context.targets.length, 64);
  assert(context.targets.slice(0, 4).some(target => target.action === "lecture_start" && target.id === context.nextDiagramId));
  assert.equal(voiceContext(doc).completedDiagramId, undefined);
  assert.equal(voiceContext(doc, slides[current - 1].dataset.sourceId).nextDiagramId, undefined);
  presenting = false; assert.equal(voiceContext(doc, context.diagramId).nextDiagramId, undefined); presenting = true;
  current = slides.length - 1;
  const last = voiceContext(doc, slides[current].dataset.sourceId);
  assert.equal(last.completedDiagramId, last.diagramId); assert.equal(last.nextDiagramId, undefined);
  viewer.open = false; assert.equal(voiceContext(doc, last.diagramId).completedDiagramId, undefined);
});

test("diagram context chooses the largest visible area while keeping viewer and keyboard focus priority", () => {
  const names = ["innerWidth", "innerHeight"], original = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  globalThis.innerWidth = 1000; globalThis.innerHeight = 800;
  let viewer;
  const card = (id, box) => ({ dataset: { sourceId: id }, getBoundingClientRect: () => box });
  const sliver = card("course/module#diagram-sliver.svg", { left: 0, right: 900, top: 740, bottom: 1300 });
  const principal = card("course/module#diagram-main.svg", { left: 200, right: 800, top: 100, bottom: 700 });
  let diagrams = [sliver, principal];
  const doc = { querySelector: selector => selector === "#diagram-viewer[open][data-source-id]" ? viewer : null,
    querySelectorAll: selector => selector === "[data-diagram][data-source-id]" ? diagrams : [] };
  try {
    assert.equal(voiceContext(doc).diagramId, principal.dataset.sourceId, "A strip of the following diagram cannot erase the main visible diagram");
    diagrams = [card("outside", { left: -2000, right: -1, top: 0, bottom: 800 }), principal];
    assert.equal(voiceContext(doc).diagramId, principal.dataset.sourceId);
    diagrams = [principal, card("equal", principal.getBoundingClientRect())];
    assert.equal(voiceContext(doc).diagramId, undefined, "An exact area tie remains ambiguous");
    doc.activeElement = { closest: () => sliver };
    assert.equal(voiceContext(doc).diagramId, sliver.dataset.sourceId);
    viewer = { dataset: { sourceId: "course/module#diagram-open.svg" } };
    assert.equal(voiceContext(doc).diagramId, viewer.dataset.sourceId);
  } finally { names.forEach((name, index) => original[index] ? Object.defineProperty(globalThis, name, original[index]) : delete globalThis[name]); }
});

test("a voice chapter seeks paused even before player readiness; denied fullscreen never plays", async () => {
  const names = ["window", "document", "location", "history", "CustomEvent", "setTimeout", "clearTimeout"], originals = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const listeners = new Map(), states = [], calls = [];
  let events, denyFullscreen = true;
  const watch = { focus() {}, scrollIntoView() {}, async requestFullscreen() { if (denyFullscreen) throw new Error("Gesture required"); globalThis.document.fullscreenElement = watch; } };
  const node = { hidden: false, textContent: "", href: "" };
  const root = { dataset: { videoId: "abcdefghijk", duration: "100" }, querySelector: selector => selector === ".tube-watch" ? watch : node, querySelectorAll: () => [], addEventListener: (name, handler) => listeners.set(name, handler), focus() {}, scrollIntoView() {}, contains: item => item === watch };
  const player = { getDuration: () => 100, getCurrentTime: () => 32, getIframe: () => ({}), seekTo: value => calls.push(["seek", value]), playVideo: () => calls.push(["play"]), pauseVideo: () => calls.push(["pause"]) };
  globalThis.document = { hidden: false, fullscreenElement: null, querySelectorAll: () => [0, 32].map(seconds => ({ dataset: { tubeTime: String(seconds) }, querySelector: () => ({ textContent: "Chapter" }) })), addEventListener() {}, async exitFullscreen() { this.fullscreenElement = null; } };
  globalThis.window = { YT: { Player: class { constructor(_id, options) { events = options.events; } } }, matchMedia: () => ({ matches: true }), addEventListener() {}, dispatchEvent: event => states.push(event.detail), clearInterval() {}, setInterval() {} };
  globalThis.location = new URL("https://site.test/certitips/es/certitube/"); globalThis.history = { state: null, replaceState(_state, _title, hash) { location.hash = hash; } };
  globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } }; globalThis.setTimeout = () => 1; globalThis.clearTimeout = () => {};
  const command = detail => { listeners.get("certitube:command")({ detail }); return detail; };
  try {
    mountPlayer(root); await Promise.resolve();
    assert.equal(command({ name: "chapter", seconds: 99 }).accepted, undefined);
    assert.equal(command({ name: "chapter", seconds: 32 }).accepted, true);
    assert.equal(root.dataset.activeMoment, "32"); assert.equal(calls.length, 0);
    events.onReady({ target: player });
    assert.deepEqual(calls, [["seek", 32], ["pause"]]);
    assert.equal(await command({ name: "play" }).completion, false);
    assert(!calls.some(call => call[0] === "play"));
    denyFullscreen = false;
    assert.equal(await command({ name: "play" }).completion, true);
    assert.equal(calls.filter(call => call[0] === "play").length, 1);
    assert.equal(states.at(-1).playing, true);
    events.onStateChange({ data: 2 });
    assert.equal(states.at(-1).playing, false); assert.equal(document.fullscreenElement, null);
    assert.equal(await command({ name: "play" }).completion, true);
    command({ name: "close" });
    assert.equal(states.at(-1).playing, false); assert.equal(document.fullscreenElement, null);
  } finally { names.forEach((name, index) => originals[index] ? Object.defineProperty(globalThis, name, originals[index]) : delete globalThis[name]); }
});

test("practice uses current visible choices, confirms before native submit and rejects stale forms or hidden dialogs", async () => {
  let form, feedback, dialog, submitted = 0, accepted = 0;
  const followups = [];
  const question = { textContent: "What does this visible question ask?" };
  const inputs = ["a", "b"].map(value => {
    const label = { querySelector: selector => selector === ".option-letter" ? { textContent: value.toUpperCase() } : { firstChild: { textContent: `Visible option ${value}` }, textContent: `Visible option ${value} HIDDEN_CORRECT_HINT` } };
    return { value, checked: false, disabled: false, closest: () => label, click() { inputs.forEach(input => { input.checked = input === this; }); submit.disabled = false; }, dispatchEvent() { submit.disabled = true; } };
  });
  const submit = { disabled: true, click() { submitted++; feedback = { textContent: "Explanation from the native practice.", querySelector: () => ({ textContent: "Explicación" }) }; } };
  const newForm = () => ({ querySelectorAll: () => inputs.filter(input => !input.disabled), querySelector: selector => selector === 'button[type="submit"]' ? submit : inputs.find(input => input.checked && !input.disabled) || null });
  form = newForm();
  const finish = { disabled: false, getAttribute: () => "Finalizar la práctica", click() { dialog = makeDialog(); } };
  const root = {
    querySelector: selector => ({ "dialog.confirmation[open]": dialog, "dialog.confirmation[open][data-finish-confirm]": dialog, "#question-form": form, ".quiz-question": question, ".quiz-meta > span": { textContent: "Pregunta 1 de 2" }, ".feedback": feedback, "[data-finish]": finish })[selector] || null,
    querySelectorAll: () => inputs,
  };
  const makeDialog = () => {
    const message = { textContent: "Sólo se guardan las respuestas confirmadas." }, handlers = [];
    const result = { hasAttribute: name => name === "data-finish-confirm", addEventListener(_type, handler) { handlers.push(handler); }, getAnimations: () => [], querySelector(selector) {
      if (selector === ".confirmation-body") return { textContent: "¿Finalizar la práctica? Sólo se guardan las respuestas confirmadas." };
      if (selector === "#finish-confirm-message") return message;
      if (selector === "[data-finish-yes]") return { textContent: "Aceptar", click() { accepted++; result.returnValue = "finish"; form = null; dialog = null; handlers.forEach(handler => handler()); } };
      if (selector === "[data-finish-no]") return { textContent: "Cancelar", click() { dialog = null; handlers.forEach(handler => handler()); } };
      return null;
    } };
    return result;
  };
  const doc = { defaultView: { dispatchEvent: event => followups.push(event.detail) }, querySelector: selector => selector === "#quiz" ? root : selector === "dialog[open]" ? dialog : null };
  const command = name => { const target = practiceTargets(doc).find(target => target.action === name); assert(target, `Missing ${name}`); return { name, targetId: target.id }; };
  assert(!practiceTargets(doc).some(target => target.action === "practice_confirm"));
  const spoken = await performPracticeAction(command("practice_read"), doc);
  assert.match(spoken.confirmation, /A\. Visible option a/); assert.doesNotMatch(spoken.confirmation, /HIDDEN_CORRECT_HINT/);
  const select = command("practice_select");
  assert.match((await performPracticeAction(select, doc)).confirmation, /¿Confirmas esta respuesta\?/);
  assert.equal(submitted, 0, "Selecting a radio cannot submit its answer");
  const confirm = command("practice_confirm");
  form = newForm();
  assert((await performPracticeAction(confirm, doc)).error, "An old form cannot authorize the replacement question");
  await performPracticeAction(command("practice_select"), doc);
  const explained = await performPracticeAction(command("practice_confirm"), doc);
  assert.equal(submitted, 1); assert.equal(explained.confirmation, "Explanation from the native practice. ¿Quieres continuar?");
  assert((await performPracticeAction(confirm, doc)).error);
  const opened = await performPracticeAction(command("practice_finish"), doc);
  assert.match(opened.confirmation, /¿Finalizar la práctica\?/); assert.equal(accepted, 0);
  assert(practiceTargets(doc).every(target => ["practice_read", "practice_accept", "practice_cancel"].includes(target.action)));
  const cancel = command("practice_cancel"); await performPracticeAction(cancel, doc);
  assert.equal(accepted, 0); assert((await performPracticeAction(cancel, doc)).error, "A closed dialog offers no confirmation capability");
  await performPracticeAction(command("practice_finish"), doc);
  await performPracticeAction(command("practice_accept"), doc);
  assert.equal(accepted, 1);
  form = newForm();
  const destination = { name: "open_module", targetId: "module:COURSE/agents", url: "https://evil.test" };
  const guarded = guardPracticeNavigation(destination, "Módulo de agentes", doc);
  assert(guarded.confirmation); assert.equal(accepted, 1, "Opening the guard cannot finish the attempt");
  assert.match(dialog.querySelector("#finish-confirm-message").textContent, /Módulo de agentes/);
  await performPracticeAction(command("practice_cancel"), doc);
  await performPracticeAction(command("practice_finish"), doc);
  assert.equal((await performPracticeAction(command("practice_accept"), doc)).followUpAction, undefined, "Cancelling discards the old navigation intent");
  assert.equal(followups.length, 0);
  form = newForm(); guardPracticeNavigation(destination, "Módulo de agentes", doc);
  assert.equal((await performPracticeAction(command("practice_accept"), doc)).followUpAction, undefined);
  assert.deepEqual(followups, [{ action: { name: "open_module", targetId: "module:COURSE/agents" } }]);
  assert.equal(guardPracticeNavigation(destination, "Módulo de agentes", doc), null, "Finishing permits the separately revalidated navigation");
  form = newForm(); guardPracticeNavigation(destination, "Módulo de agentes", doc);
  dialog.querySelector("[data-finish-yes]").click(); await Promise.resolve();
  assert.equal(followups.length, 2, "Native mouse acceptance emits the same single follow-up event");
  form = newForm();
  assert.equal(guardPracticeNavigation({ name: "set_language", targetId: "language:en" }, "English", doc), null);
  assert.equal(guardPracticeNavigation({ name: "study_concept", text: "Oracle Cloud" }, "Oracle Cloud", doc), null);
  for (const name of ["next_page", "previous_page", "course_presentation"]) {
    assert(guardPracticeNavigation({ name, targetId: "course:COURSE" }, "Destino nativo", doc).confirmation, `${name} must not bypass an active attempt`);
    await performPracticeAction(command("practice_cancel"), doc);
  }
});

test("study return expires without renewal and exact highlighting preserves inline text without accepting markup", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage"), storage = new Map();
  globalThis.sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  try {
    const url = "https://site.test/certitips/es/COURSE/practice/";
    assert.equal(rememberPracticeReturn(url, 500), true);
    assert.equal(rememberPracticeReturn(url, 1000), true);
    assert.equal(practiceReturnURL(86400499), url);
    assert.equal(practiceReturnURL(86400500), null);
    assert.equal(storage.size, 0);
    rememberPracticeReturn(url, 1000); assert.equal(practiceReturnURL(999), null);
  } finally { original ? Object.defineProperty(globalThis, "sessionStorage", original) : delete globalThis.sessionStorage; }
  const ranges = [], highlights = new Map(), styles = [], parent = { closest: () => null, getClientRects: () => [{}], scrollIntoView() {} };
  const nodes = [{ textContent: "Oracle ", parentElement: parent }, { textContent: "Cloud", parentElement: parent }, { textContent: " hidden secret", parentElement: { ...parent, closest: () => ({}) } }];
  const activity = [], headings = ["first", "second", "after"].map((id, index) => ({ dataset: { sourceId: `course/lesson#${id}` }, compareDocumentPosition: () => index === 2 ? 2 : 4 }));
  const prose = { querySelectorAll: selector => selector === ":is(h2,h3)[data-source-id]" ? headings : [] };
  const doc = {
    querySelector: selector => selector === ".prose" ? prose : null, getElementById: () => styles[0], head: { append: style => styles.push(style) }, createElement: () => ({}),
    createTreeWalker() { let index = 0; return { nextNode: () => nodes[index++] }; },
    createRange() { const range = { setStart(node, offset) { this.start = [node, offset]; }, setEnd(node, offset) { this.end = [node, offset]; } }; ranges.push(range); return range; },
    defaultView: { CSS: { highlights }, Highlight: class { constructor(range) { this.range = range; } }, dispatchEvent: event => activity.push(event.detail) },
  };
  assert.equal(highlightPhrase("Oracle Cloud", doc), true);
  assert.equal(highlights.get("certivoice-phrase").range.start[0], nodes[0]);
  assert.deepEqual(ranges[0].end, [nodes[1], 5]);
  assert.equal(styles.length, 1); assert.match(styles[0].textContent, /background:#ffd54f/);
  assert.equal(highlightPhrase("oracle cloud", doc), false);
  assert.equal(highlightPhrase("hidden secret", doc), false);
  assert.equal(highlightPhrase("<img onerror=alert(1)>", doc), false);
  assert.equal(nodes[0].textContent + nodes[1].textContent, "Oracle Cloud");
  assert.deepEqual(activity, [{ kind: "section", state: "highlighted", targetId: "course/lesson#second" }], "Only the successful highlight records its actual preceding section, never the phrase");
});

// ponytail: run the browser controller with deferred session requests; no browser, network or audio hardware is needed.
function voiceController(api = "http://127.0.0.1:18741", options = {}) {
  const listeners = new Map(), observers = new Map(), requests = [], states = [], notices = [], state = { microphones: 0, stopped: 0 };
  const storage = options.storage || new Map(), intervals = [], permissions = [], clock = { now: options.now ?? Date.now() };
  const element = () => ({ hidden: false, dataset: {}, attributes: {}, textContent: "", parentElement: { hidden: true }, addEventListener() {}, setAttribute(name, value) { this.attributes[name] = value; } });
  const children = new Map();
  const root = { ...element(), querySelector(selector) { if (!children.has(selector)) children.set(selector, element()); return children.get(selector); } };
  const config = { ...element(), dataset: { siteRoot: "https://site.test/", api } }, edge = element(), indicator = element();
  root.hidden = true; indicator.hidden = true;
  const window = {
    addEventListener(name, handler) { const list = listeners.get(name) || []; list.push(handler); listeners.set(name, list); },
    dispatchEvent(event) { for (const handler of listeners.get(event.type) || []) handler(event); },
    AudioContext: class { constructor() { this.state = "running"; this.sampleRate = 16000; } async resume() { this.state = "running"; } async suspend() { this.state = "suspended"; } },
    AudioWorkletNode: class {},
  };
  const context = {
    window, document: { title: "Current page", hidden: Boolean(options.hidden), body: { append() {} }, querySelector: selector => selector === "[data-certivoice]" ? root : selector === "[data-certichat]" ? config : selector === "[data-voice-edge]" ? edge : selector === "[data-voice-unavailable]" ? indicator : null, querySelectorAll: () => [], addEventListener: window.addEventListener },
    navigator: { mediaDevices: { getUserMedia() {} }, ...(options.permission ? { permissions: { query() { return options.deferPermission ? new Promise(resolve => permissions.push(resolve)) : Promise.resolve({ state: options.permission }); } } } : {}) }, location: new URL(options.url || "http://127.0.0.1/"), URL, Date: class extends Date { static now() { return clock.now; } }, Math, Number, String, Boolean, JSON, Error, Promise,
    AbortSignal: { timeout() {} }, CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    MutationObserver: class { constructor(callback) { this.callback = callback; } observe(target) { observers.set(target, this.callback); } },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    setInterval: callback => intervals.push(callback), setTimeout() {}, clearTimeout() {},
    voiceDiagnostics: () => ({ record() {}, headers: () => ({}), enable() {}, flush() {} }),
    t: text => text, locale: "es", siteBase: "/", voiceContext: () => ({}), restoreVoicePlayback: value => restoreVoicePlayback(value, clock.now),
    pendingNavigation: (value, current, base) => pendingNavigation(value, current, base, clock.now), shouldResumeNavigation: (value, current, base) => shouldResumeNavigation(value, current, base, clock.now), validVoiceNavigation, voiceMemoryFresh: value => voiceMemoryFresh(value, clock.now), VoiceActivity,
    captureVoice: async (_, onChunk, onDisconnect) => { state.microphones++; state.disconnect = onDisconnect; return { stop() { state.stopped++; }, setMuted() {} }; },
    fetch: () => new Promise(resolve => requests.push(value => resolve({ ok: true, json: async () => value }))),
  };
  window.addEventListener("certivoice:state", event => states.push(event.detail));
  window.addEventListener("certivoice:error", event => notices.push(event.detail));
  const source = readFileSync(new URL("../assets/certivoice.js", import.meta.url), "utf8").replace(/^import .*\r?\n/gm, "");
  vm.runInNewContext(source, context);
  return {
    requests, permissions, states, notices, state, root, config, indicator, storage, status: children.get("[data-voice-status]"),
    command: detail => window.dispatchEvent(new context.CustomEvent("certivoice:command", { detail })),
    session: detail => window.dispatchEvent(new context.CustomEvent("certichat:session", { detail })),
    refresh: () => window.dispatchEvent(new context.CustomEvent("certivoice:state-request")),
    pagehide: () => window.dispatchEvent(new context.CustomEvent("pagehide")),
    navigateLink: href => window.dispatchEvent({ type: "click", button: 0, target: { closest: () => ({ href, hasAttribute: () => false }) } }),
    activity: () => window.dispatchEvent(new context.CustomEvent("certichat:activity")),
    advance(milliseconds) { clock.now += milliseconds; intervals.forEach(callback => callback()); },
    lock() { config.hidden = true; observers.get(config)(); },
  };
}
const settleVoice = () => new Promise(setImmediate);
const unavailableVoice = { authenticated: true, available: true };
const enabledVoice = { ...unavailableVoice, voice: { enabled: true } };

test("microphone mute preserves narration, scheduled lecture and subsequent slides", async () => {
  const source = readFileSync(new URL("../assets/certivoice.js", import.meta.url), "utf8");
  const mute = source.slice(source.indexOf("  function toggleMute("), source.indexOf('  window.addEventListener("certichat:activity"'));
  const finish = source.slice(source.indexOf("  async function finishSpeech("), source.indexOf("  async function lectureTurn("));
  const turn = source.slice(source.indexOf("  async function lectureTurn("), source.indexOf("  async function say("));
  const calls = [], timers = [], lecture = { running: true, consent: true, moduleId: "course/module", requestId: "previous" }, narration = {};
  const context = {
    lecture, active: true, muted: false, videoLocked: false, starting: false, controller: null, output: narration, utterance: null,
    release: { setMuted: value => calls.push(["mic", value]) }, detector: { reset() {} }, lastActivity: 0,
    diagnostics: { record: (name, fields) => calls.push([name, fields.action]) }, t: text => text, setStatus() {},
    lectureTimer: "existing", clearTimeout: value => calls.push(["clear", value]), setTimeout: fn => timers.push(fn),
    nativeStartTimer: null, stopEdge: null, speech: {}, playback: null, savePlayback() {}, separateCapture: false,
    quotaBlocked: () => false, epoch: 1, pending: null, pendingSince: 0, pendingExpiry: null, expireMemory() {},
    crypto, locale: "es", voicePageURL: () => "https://site.test/course/module/", activityTrail: () => [],
    document: { querySelector: () => ({ dataset: { sourceId: "course/module#first" }, querySelectorAll: () => [
      { getAttribute: () => "true" }, { dataset: { sourceId: "course/module#second" } },
    ] }) },
    performVoiceAction: async action => { calls.push(["slide", action.name]); return {}; },
    clearPending() {}, voiceContext: () => ({ diagramId: "course/module#second" }), nativeVoice: {},
    submitPending: async () => calls.push(["submit"]),
  };
  vm.createContext(context);
  vm.runInContext(`${mute}\ntoggleMute()`, context);
  assert.equal(context.muted, true); assert.equal(context.output, narration); assert.equal(lecture.running, true);
  assert.equal(context.lectureTimer, "existing"); assert(!calls.some(([name]) => name === "clear"));
  await vm.runInContext(`${finish}\n${turn}\nfinishSpeech(0, "complete")`, context);
  assert.equal(timers.length, 1, "A muted microphone must not prevent the next lecture segment");
  await timers.shift()();
  assert(calls.some(([name]) => name === "submit")); assert(calls.some(([name]) => name === "slide"));
  assert.equal(context.pending.mode, "lecture");
  vm.runInContext("toggleMute()", context);
  assert.equal(context.muted, false); assert.equal(lecture.running, true);
  assert.deepEqual(calls.filter(([name]) => name === "mic"), [["mic", true], ["mic", false]]);
});

test("an exhausted lecture pauses before advancing or requesting another segment", async () => {
  const source = readFileSync(new URL("../assets/certivoice.js", import.meta.url), "utf8");
  const lectureTurn = source.slice(source.indexOf("  async function lectureTurn("), source.indexOf("  async function say("));
  const pauses = [], actions = [];
  await vm.runInNewContext(`${lectureTurn}\nlectureTurn(true)`, {
    lecture: { running: true, consent: true }, active: true, muted: false, controller: null, videoLocked: false,
    quotaBlocked: () => true, t: text => text, pause: message => pauses.push(message),
    performVoiceAction: action => actions.push(action),
  });
  assert.deepEqual(pauses, ["Se alcanzó un límite de uso. Inténtalo más tarde."]);
  assert.deepEqual(actions, []);
});

test("a granted navigation handoff is consumed before permission awaits and resumes only once", async () => {
  const key = "certivoice:https://site.test/:navigation", now = 1000000, url = "http://127.0.0.1/course/";
  const storage = new Map([[key, JSON.stringify({ url, createdAt: now - 60000, session: true, pending: true, autoResume: true, resumeAt: now })]]);
  const view = voiceController(undefined, { storage, now, url, permission: "granted", deferPermission: true });
  view.requests[0](enabledVoice); await settleVoice();
  assert.equal(view.permissions.length, 1);
  assert.equal(JSON.parse(storage.get(key)).autoResume, undefined);
  assert.equal(JSON.parse(storage.get(key)).resumeAt, undefined);
  assert.equal(view.state.microphones, 0);
  view.permissions[0]({ state: "granted" }); await settleVoice();
  view.requests[1](enabledVoice); await settleVoice();
  assert.equal(view.state.microphones, 1); assert.equal(view.states.at(-1).active, true);
  assert.equal(JSON.parse(storage.get(key)).createdAt, now - 60000);
  view.pagehide(); await settleVoice();
  const reload = voiceController(undefined, { storage, now, url, permission: "granted" });
  reload.requests[0](enabledVoice); await settleVoice();
  assert.equal(reload.state.microphones, 0); assert.equal(reload.states.at(-1).phase, "paused");
});

test("automatic handoff never prompts, overrides muted handoff, starts hidden or bypasses session verification", async () => {
  const key = "certivoice:https://site.test/:navigation", now = 1000000, url = "http://127.0.0.1/course/";
  for (const options of [{}, { permission: "prompt" }, { permission: "denied" }, { permission: "granted", hidden: true }, { permission: "granted", authenticated: false }, { permission: "granted", verificationRequired: true }, { permission: "granted", autoResume: false }]) {
    const storage = new Map([[key, JSON.stringify({ url, createdAt: now - 1000, session: true, pending: true, autoResume: options.autoResume ?? true, resumeAt: now })]]);
    const view = voiceController(undefined, { ...options, storage, now, url });
    view.requests[0]({ ...enabledVoice, authenticated: options.authenticated ?? true, verificationRequired: options.verificationRequired ?? false }); await settleVoice();
    assert.equal(view.state.microphones, 0, JSON.stringify(options));
    assert.equal(view.states.at(-1).active, false); assert.equal(view.states.at(-1).phase, "paused");
    assert.equal(view.requests.length, 1, "A rejected handoff cannot start verification or a new session request");
  }
});

test("a handoff that expires during permission lookup cannot start capture", async () => {
  const key = "certivoice:https://site.test/:navigation", now = 1000000, url = "http://127.0.0.1/course/";
  const storage = new Map([[key, JSON.stringify({ url, createdAt: now - 1000, session: true, pending: true, autoResume: true, resumeAt: now })]]);
  const view = voiceController(undefined, { storage, now, url, permission: "granted", deferPermission: true });
  view.requests[0](enabledVoice); await settleVoice();
  view.advance(31000); view.permissions[0]({ state: "granted" }); await settleVoice();
  assert.equal(view.state.microphones, 0); assert.equal(view.requests.length, 1);
  assert.equal(view.states.at(-1).phase, "paused");
  assert.equal(JSON.parse(storage.get(key)).autoResume, undefined);
});

test("exit cancels a handoff while permission is pending, and muted navigation cannot reactivate capture", async () => {
  const key = "certivoice:https://site.test/:navigation", now = 1000000, url = "http://127.0.0.1/course/";
  const storage = new Map([[key, JSON.stringify({ url, createdAt: now - 1000, session: true, pending: true, autoResume: true, resumeAt: now })]]);
  const pending = voiceController(undefined, { storage, now, url, permission: "granted", deferPermission: true });
  pending.requests[0](enabledVoice); await settleVoice();
  pending.command("exit"); pending.permissions[0]({ state: "granted" }); await settleVoice();
  assert.equal(pending.state.microphones, 0); assert.equal(storage.has(key), false);
  const active = voiceController(undefined, { storage, now });
  active.requests[0](enabledVoice); await settleVoice(); active.command("start"); await settleVoice();
  active.requests[1](enabledVoice); await settleVoice(); active.command("mute"); active.navigateLink(url);
  assert.equal(JSON.parse(storage.get(key)).autoResume, false);
  active.pagehide(); await settleVoice();
  const destination = voiceController(undefined, { storage, now, url, permission: "granted" });
  destination.requests[0](enabledVoice); await settleVoice();
  assert.equal(destination.state.microphones, 0); assert.equal(destination.states.at(-1).phase, "paused");
});

test("a continuous session stays active after silence and operational failure retains its compact paused mode", async () => {
  const view = voiceController(undefined, { now: 1000000 });
  view.requests[0](enabledVoice); await settleVoice(); view.command("start"); await settleVoice();
  view.requests[1](enabledVoice); await settleVoice();
  view.advance(61000); assert.equal(view.states.at(-1).active, true); assert.equal(view.state.stopped, 0);
  view.state.disconnect(); await settleVoice();
  assert.equal(view.states.at(-1).active, false); assert.equal(view.states.at(-1).phase, "paused");
  assert.equal(view.states.at(-1).resume, true); assert(view.states.at(-1).error);
  assert.equal(view.config.dataset.voiceMode, "true"); assert.equal(view.state.stopped, 1);
  view.command("exit"); assert.equal(view.states.at(-1).phase, "off"); assert.equal(view.config.dataset.voiceMode, "false");
});

test("reload restores voice paused without capture and resuming never renews its original 24-hour lifetime", async () => {
  const key = "certivoice:https://site.test/:navigation", now = 1000000, createdAt = now - 60000;
  const storage = new Map([[key, JSON.stringify({ url: "http://127.0.0.1/course/", createdAt, session: true })]]);
  const view = voiceController(undefined, { storage, now, url: "http://127.0.0.1/certitube/" });
  view.requests[0](enabledVoice); await settleVoice();
  assert.equal(view.states.at(-1).resume, true);
  assert.equal(view.states.at(-1).phase, "paused");
  assert.equal(view.states.at(-1).active, false);
  assert.equal(view.state.microphones, 0, "Restoring continuity cannot acquire the microphone");
  view.command("start"); await settleVoice();
  view.requests[1](enabledVoice); await settleVoice();
  assert.equal(view.state.microphones, 1);
  assert.equal(view.states.at(-1).active, true);
  assert.equal(JSON.parse(storage.get(key)).createdAt, createdAt);
  assert.equal(JSON.parse(storage.get(key)).url, "http://127.0.0.1/certitube/");
  view.pagehide(); await settleVoice();
  assert.equal(view.state.stopped, 1);
  assert.equal(view.states.at(-1).active, false);
  assert.equal(JSON.parse(storage.get(key)).createdAt, createdAt);
  const restored = voiceController(undefined, { storage, now, url: "http://127.0.0.1/certitube/" });
  restored.requests[0](enabledVoice); await settleVoice();
  assert.equal(restored.states.at(-1).resume, true);
  assert.equal(restored.state.microphones, 0);
  restored.advance(86400000 - 60000);
  assert.equal(restored.states.at(-1).resume, false);
  assert.equal(restored.states.at(-1).active, false);
  assert.equal(storage.has(key), false, "Expiration must remove the old continuity record");
});

test("exit, typing and unavailable voice cancel restored continuity without clearing unrelated state", async () => {
  const key = "certivoice:https://site.test/:navigation", now = 1000000;
  for (const cancel of [view => view.command("exit"), view => view.activity(), view => view.session(unavailableVoice)]) {
    const storage = new Map([[key, JSON.stringify({ url: "http://127.0.0.1/", createdAt: now - 1000, session: true })], ["unrelated", "retained"]]);
    const view = voiceController(undefined, { storage, now });
    view.requests[0](enabledVoice); await settleVoice();
    assert.equal(view.states.at(-1).resume, true);
    cancel(view); view.pagehide(); await settleVoice();
    assert.equal(view.states.at(-1).resume, false);
    assert.equal(view.states.at(-1).active, false);
    assert.equal(view.state.microphones, 0);
    assert.equal(storage.has(key), false);
    assert.equal(storage.get("unrelated"), "retained");
  }
});

test("a concurrent session refresh keeps missing-capability errors in accessible voice status, while quiz lock still cancels", async () => {
  const view = voiceController();
  view.command("start"); await settleVoice();
  assert.equal(view.requests.length, 2);
  view.requests[0](unavailableVoice); await settleVoice();
  view.requests[1](unavailableVoice); await settleVoice();
  assert.deepEqual(view.notices, []);
  assert.equal(view.status.textContent, "El modo voz todavía no está habilitado. Puedes seguir usando el chat.");
  assert.equal(view.root.hidden, true);
  assert.equal(view.indicator.hidden, false);
  assert.equal(view.indicator.attributes["aria-label"], view.status.textContent);
  assert.equal(view.state.microphones, 0);
  assert.equal(view.states.at(-1).active, false);

  view.command("start"); await settleVoice();
  view.lock();
  view.requests[2](enabledVoice); await settleVoice();
  assert.equal(view.state.microphones, 0, "Quiz lock must cancel even while session revalidation is pending");
  assert.equal(view.states.at(-1).active, false);
  assert.equal(view.indicator.hidden, true, "Quiz lock must hide the voice availability warning");
});

test("a cancelled session request cannot replace a newer enabled voice session", async () => {
  const view = voiceController();
  view.requests[0](unavailableVoice); await settleVoice();
  view.command("start"); await settleVoice();
  view.command("exit");
  view.command("start"); await settleVoice();
  assert.equal(view.requests.length, 3);
  view.requests[2](enabledVoice); await settleVoice();
  assert.equal(view.state.microphones, 1);
  view.requests[1](unavailableVoice); await settleVoice();
  view.refresh();
  assert.equal(view.states.at(-1).enabled, true);
  assert.equal(view.states.at(-1).active, true);
  assert.equal(view.state.microphones, 1);
  assert.deepEqual(view.notices, []);
});

test("API unavailability suspends capture and a session update restores voice availability without reloading", async () => {
  const view = voiceController();
  view.refresh();
  assert.equal(view.indicator.hidden, true, "Unknown bootstrap capability must not warn");
  view.requests[0](enabledVoice); await settleVoice();
  view.command("start"); await settleVoice();
  view.requests[1](enabledVoice); await settleVoice();
  assert.equal(view.states.at(-1).active, true);
  view.session({ ...enabledVoice, available: false });
  assert.equal(view.states.at(-1).enabled, false);
  assert.equal(view.states.at(-1).active, false);
  assert.equal(view.state.stopped, 1);
  assert.equal(view.status.textContent, "La voz no está disponible en este momento.");
  assert.equal(view.root.hidden, true);
  assert.equal(view.indicator.hidden, false);
  assert.deepEqual(view.notices, []);
  view.session(enabledVoice);
  assert.equal(view.states.at(-1).enabled, true);
  assert.equal(view.states.at(-1).active, false);
  assert.equal(view.root.hidden, false);
  assert.equal(view.indicator.hidden, true);
});

test("a local preview pointed at VPS keeps the unavailable voice warning hidden", () => {
  const view = voiceController("https://certichat.example.test");
  view.session(unavailableVoice);
  assert.equal(view.requests.length, 0);
  assert.equal(view.indicator.hidden, true);
});

test("chat shows native send when voice is unavailable and never stores voice errors as assistant messages", () => {
  const originalWindow = globalThis.window, originalEvent = globalThis.CustomEvent, listeners = new Map(), commands = [], messages = [];
  globalThis.CustomEvent = class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } };
  globalThis.window = {
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    addEventListener(name, handler) { const handlers = listeners.get(name) || []; handlers.push(handler); listeners.set(name, handlers); },
    dispatchEvent(event) { for (const handler of listeners.get(event.type) || []) handler(event); },
  };
  const emit = (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail }));
  window.addEventListener("certivoice:command", event => commands.push(event.detail));
  const input = { textContent: "", style: {}, attributes: {}, getAttribute(name) { return this.attributes[name]; }, setAttribute(name, value) { this.attributes[name] = value; } }, submit = { style: {} };
  const buttons = Object.fromEntries(["start", "mute", "exit"].map(name => [name, { style: {}, dataset: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, addEventListener() {} }]));
  const chat = {
    dataset: {},
    addEventListener() {},
    attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute(name) { delete this.attributes[name]; },
    getMessages: () => messages, addMessage: value => messages.push(value),
    shadowRoot: { querySelector(selector) {
      if (selector === '[role="textbox"]') return input;
      if (selector.includes(":not(.custom-button)")) return submit;
      const name = selector.match(/data-certivoice-icon="(\w+)"/)?.[1];
      return name ? { closest: () => buttons[name] } : null;
    } },
  };
  try {
    const refresh = installVoiceChatControls(chat);
    for (const control of chat.customButtons) for (const state of ["default", "active"]) {
      const { container, svg } = control.styles.button[state];
      assert.equal(container.default.width, "44px");
      assert.equal(container.default.height, "44px");
      assert.equal(container.default.backgroundColor, "transparent");
      assert.equal(container.default.border, "none");
      assert.equal(container.default.borderRadius, "0");
      assert.equal(svg.styles.default.width, "24px");
      assert.equal(svg.styles.default.height, "24px");
    }
    chat.customButtons.forEach((control, index) => { control.setState = value => { buttons[["start", "mute", "exit"][index]].style.display = value === "disabled" ? "none" : "flex"; }; });
    refresh();
    assert.equal(submit.style.display, "");
    assert.equal(buttons.start.style.display, "none");
    chat.customButtons[0].onClick("default");
    assert.deepEqual(commands, []);
    emit("certivoice:error", "La voz no está disponible.");
    assert.deepEqual(messages, []);
    emit("certivoice:state", { enabled: true });
    assert.equal(submit.style.display, "none");
    assert.equal(buttons.start.style.display, "flex");
    input.textContent = "Consulta escrita"; refresh();
    assert.equal(submit.style.display, "");
    assert.equal(buttons.start.style.display, "none");
    input.textContent = ""; refresh(true);
    assert.equal(submit.style.display, "");
    emit("certivoice:state", { enabled: true, active: true, muted: true });
    assert.equal(submit.style.display, "none");
    assert.equal(buttons.start.style.display, "none");
    assert.equal(buttons.mute.style.display, "flex", "Mute must remain available during voice processing");
    assert.equal(buttons.exit.style.display, "flex", "Exit must remain available during voice processing");
    assert.equal(buttons.mute.attributes["aria-pressed"], "true");
    refresh(); emit("certivoice:state", { enabled: false, active: true });
    assert.equal(submit.style.display, "");
    assert(Object.values(buttons).every(button => button.style.display === "none"));
    emit("certivoice:state", { enabled: true });
    assert.equal(buttons.start.style.display, "flex");
    emit("certivoice:state", { enabled: true, retry: true });
    assert.equal(buttons.start.attributes["aria-label"], "Reintentar");
    emit("certivoice:state", { enabled: true, resume: true });
    assert.equal(buttons.start.attributes["aria-label"], "Reanudar voz");
    emit("certivoice:state", { enabled: true, active: true, phase: "listening" });
    assert.equal(input.contentEditable, "false");
    assert.equal(input.attributes["aria-readonly"], "true");
    emit("certivoice:state", { enabled: true, phase: "off" });
    assert.equal(input.contentEditable, "true");
    assert.equal(input.attributes["aria-readonly"], "false");
    input.setAttribute("aria-disabled", "true"); refresh();
    assert.equal(input.contentEditable, "false", "Leaving voice cannot unlock an exhausted quota");
  } finally {
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if (originalEvent === undefined) delete globalThis.CustomEvent; else globalThis.CustomEvent = originalEvent;
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = name => readFileSync(new URL(`../assets/${name}.js`, import.meta.url), "utf8");
const script = name => source(name).replace(/^import[^\n]*\n/gm, "").replace(/^export /gm, "");
const storage = () => {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};

test("clear removes stored activity and the prior diagram observation without changing current UI", () => {
  const site = "https://jgangini.github.io/certitips/", url = `${site}1Z0-1157-26/agents/`;
  const image = Object.assign(new EventTarget(), { complete: true, naturalWidth: 100 });
  const viewer = { open: true, dataset: { sourceId: "agentic-ai-foundations-2026/agents#diagram-agent-loop.svg" },
    classList: { contains: () => true }, querySelector: () => image };
  const callbacks = [], window = new EventTarget(), sessionStorage = storage();
  const document = Object.assign(new EventTarget(), { readyState: "complete", querySelector: selector =>
    selector === "[data-certichat]" ? { dataset: { siteRoot: site } } : selector === "#diagram-viewer" ? viewer : selector === 'link[rel="canonical"]' ? { href: url } : null });
  const context = { window, document, sessionStorage, siteBase: "/certitips/", TextEncoder,
    safeSourceURL: value => value.startsWith(site), voicePageURL: () => url,
    MutationObserver: class { constructor(callback) { callbacks.push(callback); } observe() {} } };
  runInNewContext(script("certichat-activity"), context);
  assert.equal(context.activityTrail().length, 2);
  window.dispatchEvent(new Event("certichat:cleared"));
  assert.equal(context.activityTrail().length, 0);
  assert.equal(viewer.open, true, "Clearing memory must not change the visible diagram");
  viewer.open = false; callbacks[0]();
  assert.equal(context.activityTrail().length, 0, "A stale diagram observation restored an erased action");
  viewer.open = true; callbacks[0]();
  assert.equal(context.activityTrail().length, 1, "A new observation must remain usable after clear");
});

test("clear removes practice and presentation return memory without resetting practice progress", () => {
  const window = new EventTarget(), sessionStorage = storage(), dialog = { dataset: { voiceReturn: "course/lesson#diagram-one.svg", sourceId: "course/lesson#diagram-two.svg" } };
  const context = { window, sessionStorage, dialog, signal: new AbortController().signal, siteBase: "/certitips/" };
  sessionStorage.setItem("certitips:quiz:v1:course", "preserved-attempt");
  runInNewContext(script("certivoice-study"), context);
  runInNewContext(source("site").split("\n").find(line => line.includes('window.addEventListener("certichat:cleared"')), context);
  const url = "https://jgangini.github.io/certitips/1Z0-1157-26/practice/";
  assert.equal(context.rememberPracticeReturn(url), true);
  assert.equal(context.practiceReturnURL(), url);
  window.dispatchEvent(new Event("certichat:cleared"));
  assert.equal(context.practiceReturnURL(), null);
  assert.equal(dialog.dataset.voiceReturn, undefined);
  assert.equal(dialog.dataset.sourceId, "course/lesson#diagram-two.svg");
  assert.equal(sessionStorage.getItem("certitips:quiz:v1:course"), "preserved-attempt");
});

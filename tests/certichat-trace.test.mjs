import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTrace, readTrace, publishTrace, sourcePath } from "../assets/certichat-trace.js";

const a = "00000000-0000-4000-8000-000000000001", b = "00000000-0000-4000-8000-000000000002";
const trace = { version: "a".repeat(64), nodes: [a, b], edges: [{ source: a, target: b, label: "relacionado" }], truncated: false };

test("source paths preserve guide anchors and reject untrusted destinations", () => {
  const root = "https://jgangini.github.io/certitips/";
  assert.equal(sourcePath(`${root}CDMP-DMF/oracle-map/#aplicacion`, root), "/certitips/CDMP-DMF/oracle-map/#aplicacion");
  assert.equal(sourcePath(root, root), "/certitips/");
  for (const value of [undefined, "/certitips/", "javascript:alert(1)", "https://attacker.test/certitips/", `${root}?secret=1`, `${root}../escape/`]) assert.equal(sourcePath(value, root), null);
});

test("trace accepts bounded identifiers and edges, never a fragment ID or dangling relationship", () => {
  assert.deepEqual(normalizeTrace(trace), trace);
  assert.equal(normalizeTrace(null), null);
  assert.equal(normalizeTrace({ ...trace, version: [trace.version] }), null);
  assert.equal(normalizeTrace({ ...trace, nodes: ["fragment-1"] }), null);
  assert.equal(normalizeTrace({ ...trace, nodes: [a] }), null);
  assert.equal(normalizeTrace({ ...trace, edges: [{ source: a, target: b, label: {} }] }), null);
  assert.equal(normalizeTrace({ ...trace, nodes: Array(513).fill(a) }), null);
  assert.equal(normalizeTrace({ ...trace, edges: Array(1025).fill(trace.edges[0]) }), null);
});

test("trace remains tab-local, expires after 24 hours and clears on new query, failure or conversation reset", t => {
  const storage = new Map(), events = [], siteRoot = "https://example.com/guides/";
  t.mock.method(Date, "now", () => 100000000);
  const originals = Object.fromEntries(["sessionStorage", "window"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
  } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { dispatchEvent: event => events.push(event) } });
  publishTrace(siteRoot, "ready", trace);
  assert.deepEqual(readTrace(siteRoot), trace);
  const sourced = { ...trace, sources: [{ nodeId: a, title: "Guía · Sección", url: `${siteRoot}concepto/#detalle` }] };
  publishTrace(siteRoot, "ready", sourced);
  assert.deepEqual(readTrace(siteRoot), sourced, "source associations survive tab-local navigation");
  assert.equal(readTrace("https://another.example/"), null);
  assert.equal(readTrace(siteRoot, Date.now() + 86400000), null);
  for (const status of ["loading", "error", "idle"]) {
    publishTrace(siteRoot, "ready", trace);
    publishTrace(siteRoot, status);
    assert.equal(readTrace(siteRoot), null);
    assert.equal(events.at(-1).detail.status, status);
    assert.equal(events.at(-1).detail.trace, null);
  }
  publishTrace(siteRoot, "ready", trace);
  assert.equal(readTrace(siteRoot, Date.now() - 1), null);
  t.mock.method(sessionStorage, "setItem", () => { throw new Error("Storage denied"); });
  publishTrace(siteRoot, "ready", trace);
  assert.deepEqual(events.at(-1).detail.trace, trace);
});

test("concept references remain tied to current trace nodes and trusted published guide URLs", () => {
  const site = "https://example.com/guides/", source = { nodeId: a, title: "Origen del concepto · Sección", url: `${site}concepto/#detalle` };
  const sources = [source, source, { ...source, nodeId: "00000000-0000-4000-8000-000000000003" }, { ...source, url: "javascript:alert(1)" }, { ...source, url: "https://evil.example/guides/" }, { ...source, url: "https://example.com/private/" }, { ...source, url: `${site}concepto/?secret=x#detalle` }, { ...source, title: "" }, { ...source, title: "x".repeat(201) }, null];
  assert.deepEqual(normalizeTrace({ ...trace, sources }, site).sources, [source]);
  assert.deepEqual(normalizeTrace({ ...trace, sources }, "https://another.example/").sources, []);
  assert.equal(normalizeTrace({ ...trace, sources: Array(513).fill(source) }, site).sources, undefined);
  assert.deepEqual(normalizeTrace({ ...trace, sources: [{ ...source, title: '<img src=x onerror="alert(1)">' }] }, site).sources[0].title, '<img src=x onerror="alert(1)">', "labels remain plain text for DOM rendering");
});

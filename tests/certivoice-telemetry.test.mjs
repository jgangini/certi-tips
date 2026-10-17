import test from "node:test";
import assert from "node:assert/strict";
import { voiceDiagnostics } from "../assets/certivoice-telemetry.js";

test("voice diagnostics correlate navigation, expire absolutely, bound batches and exclude spoken content", async () => {
  const names = ["sessionStorage", "location", "fetch", "setTimeout", "clearTimeout"], originals = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const saved = new Map(), calls = [], timers = new Map(); let next = 0;
  try {
    globalThis.sessionStorage = { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) };
    globalThis.location = { pathname: "/certitips/es/certitube/" };
    globalThis.setTimeout = fn => { timers.set(++next, fn); return next; };
    globalThis.clearTimeout = id => timers.delete(id);
    globalThis.fetch = async (url, options) => { calls.push({ url, ...options, body: JSON.parse(options.body) }); return { ok: true }; };
    const config = { dataset: { api: "https://api.test", siteRoot: "https://site.test/certitips/" } };
    const events = voiceDiagnostics(config), trace = config.dataset.voiceTrace;
    events.record("state", { phase: "listening" }); await events.flush(); assert.equal(calls.length, 0, "Unauthenticated sessions must not send diagnostics");
    events.enable(true);
    const id = crypto.randomUUID();
    assert.equal(events.headers(id)["X-Request-ID"], id);
    assert.match(events.headers().traceparent, new RegExp(`^00-${trace}-[a-f0-9]{16}-01$`));
    for (let i = 0; i < 100; i++) events.record("state", { phase: "listening", message: "SECRET SPOKEN TEXT", audio: "PRIVATE PCM", cookie: "SECRET TOKEN" });
    await events.flush(); await events.flush(); await events.flush();
    assert.equal(calls.length, 2); assert(calls.every(call => call.body.events.length === 12 && call.keepalive && call.credentials === "include"));
    assert(!JSON.stringify(calls).includes("SECRET") && !JSON.stringify(calls).includes("PRIVATE"));
    const key = [...saved.keys()][0], originalTime = JSON.parse(saved.get(key)).at;
    voiceDiagnostics(config); assert.equal(config.dataset.voiceTrace, trace); assert.equal(JSON.parse(saved.get(key)).at, originalTime);
    saved.set(key, JSON.stringify({ id: trace, at: Date.now() - 86400001 })); voiceDiagnostics(config); assert.notEqual(config.dataset.voiceTrace, trace);
    globalThis.fetch = async () => ({ ok: false });
    const failed = voiceDiagnostics(config); failed.enable(true); failed.record("state", { phase: "paused" }); await failed.flush();
    assert.equal(failed.record("state", { phase: "listening" }), undefined, "A rejected diagnostic must stop without retries or breaking voice");
  } finally { names.forEach((name, i) => originals[i] ? Object.defineProperty(globalThis, name, originals[i]) : delete globalThis[name]); }
});

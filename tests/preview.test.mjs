import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));

async function preview(t, upstreamPort = "") {
  const child = spawn(process.execPath, ["scripts/serve.mjs"], {
    cwd: repo, windowsHide: true,
    env: { ...process.env, PORT: "0", CERTICHAT_PREVIEW_PROXY_PORT: String(upstreamPort) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
  });
  return new Promise((resolve, reject) => {
    let output = "", errors = "";
    const timer = setTimeout(() => reject(new Error(`Preview did not start: ${errors}`)), 10000);
    child.stderr.on("data", chunk => { errors += chunk; });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`Preview exited ${code}: ${errors}`)); });
    child.stdout.on("data", chunk => {
      output += chunk;
      const match = output.match(/CertiTips preview: (http:\/\/127\.0\.0\.1:\d+\/\S*)/);
      if (match) { clearTimeout(timer); resolve(new URL(match[1])); }
    });
  });
}

function request(origin, pathname, { method = "GET", headers = {}, chunks = [] } = {}) {
  if (chunks.length && !Object.keys(headers).some(name => ["content-length", "transfer-encoding"].includes(name.toLowerCase())))
    headers = { ...headers, "Content-Length": chunks.reduce((size, chunk) => size + Buffer.byteLength(chunk), 0) };
  return new Promise((resolve, reject) => {
    const outgoing = http.request(new URL(pathname, origin), { method, headers, agent: false }, incoming => {
      const body = [];
      incoming.on("data", chunk => body.push(chunk));
      incoming.on("error", reject);
      incoming.on("end", () => resolve({ status: incoming.statusCode, headers: incoming.headers, body: Buffer.concat(body).toString() }));
    });
    outgoing.setTimeout(5000, () => outgoing.destroy(new Error("Test request timed out")));
    outgoing.on("error", reject);
    for (const chunk of chunks) outgoing.write(chunk);
    outgoing.end();
  });
}

test("the opt-in preview proxy preserves local sessions and rejects other callers and routes", { timeout: 25000 }, async t => {
  const started = [], completed = [];
  const cookies = ["certichat-local=preview-session; Path=/; HttpOnly; SameSite=Lax", "preview-check=second; Expires=Wed, 21 Oct 2037 07:28:00 GMT; Path=/"];
  const upstream = http.createServer((incoming, response) => {
    started.push(incoming.url);
    const chunks = [];
    incoming.on("data", chunk => chunks.push(chunk));
    incoming.on("error", () => {}); // A rejected chunked upload is intentionally disconnected.
    incoming.on("end", () => {
      completed.push({ path: incoming.url, method: incoming.method, headers: incoming.headers, body: Buffer.concat(chunks).toString() });
      response.setHeader("Content-Type", "application/json");
      for (const name of ["traceparent", "x-request-id"]) if (incoming.headers[name]) response.setHeader(name, incoming.headers[name]);
      if (incoming.url === "/api/chat") {
        response.writeHead(429, { "Retry-After": "17" }).end('{"detail":"mock quota"}');
      } else if (incoming.url === "/api/session") {
        if (incoming.method === "POST") response.setHeader("Set-Cookie", cookies);
        response.end(JSON.stringify({ mode: "LOCAL", authenticated: incoming.method === "POST" || incoming.headers.cookie?.includes("certichat-local=preview-session") === true }));
      } else response.end('{"ok":true}');
    });
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  t.after(() => { upstream.closeAllConnections(); return new Promise(resolve => upstream.close(resolve)); });
  const page = await preview(t, upstream.address().port);
  const valid = { Origin: page.origin, "X-CertiChat": "1" };
  const get = { "Sec-Fetch-Site": "same-origin", "X-CertiChat": "1" };

  await t.test("same-origin GET, session cookies, statuses and minimal upstream headers", async () => {
    const first = await request(page, "/api/session", { headers: get });
    assert.equal(first.status, 200);
    assert.equal(JSON.parse(first.body).authenticated, false);
    const session = await request(page, "/api/session", {
      method: "POST", headers: { ...valid, "Content-Type": "application/json", "Content-Length": "2", Authorization: "Bearer must-not-forward", "X-Forwarded-For": "192.0.2.1" }, chunks: ["{}"],
    });
    assert.equal(session.status, 200);
    assert.deepEqual(session.headers["set-cookie"], cookies);
    const cookie = session.headers["set-cookie"].map(value => value.split(";")[0]).join("; ");
    const authenticated = await request(page, "/api/session", { headers: { ...get, Cookie: cookie } });
    assert.equal(JSON.parse(authenticated.body).authenticated, true);
    assert.equal(completed.at(-1).headers.cookie, cookie);
    const sent = completed.find(value => value.method === "POST");
    assert.equal(sent.body, "{}");
    assert.equal(sent.headers.origin, "http://127.0.0.1:4173");
    assert.equal(sent.headers["x-certichat"], "1");
    assert.equal(sent.headers.authorization, undefined);
    assert.equal(sent.headers["x-forwarded-for"], undefined);
    assert.equal(sent.headers.host, `127.0.0.1:${upstream.address().port}`);
    const limited = await request(page, "/api/chat", { method: "POST", headers: { ...valid, "Content-Type": "application/json" }, chunks: ["{}"] });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers["retry-after"], "17");
    assert.equal(limited.headers["cache-control"], "no-store");
    assert.deepEqual(JSON.parse(limited.body), { detail: "mock quota" });
    for (const [pathname, method] of [["/api/health", "GET"], ["/api/graph", "GET"], ["/api/voice", "POST"], ["/api/speech", "POST"], ["/api/conversation", "DELETE"]]) {
      const result = await request(page, pathname, { method, headers: method === "GET" ? pathname.endsWith("health") ? { "Sec-Fetch-Site": "same-origin" } : get : { ...valid, "Content-Type": "application/json" }, chunks: method === "GET" ? [] : ["{}"] });
      assert.equal(result.status, 200, pathname);
    }
    const traceHeaders = { traceparent: "00-1234567890abcdef1234567890abcdef-1234567890abcdef-01", "X-Request-ID": "12345678-1234-4234-8234-1234567890ab" };
    const events = await request(page, "/api/events", { method: "POST", headers: { ...valid, ...traceHeaders, "Content-Type": "application/json" }, chunks: ['{"events":[]}'] });
    assert.equal(events.status, 200);
    for (const [name, value] of Object.entries(traceHeaders)) {
      assert.equal(events.headers[name.toLowerCase()], value);
      assert.equal(completed.at(-1).headers[name.toLowerCase()], value);
    }
    assert.equal((await request(page, "/api/events", { method: "POST", headers: { ...valid, "Content-Type": "application/json" }, chunks: ["x".repeat(8193)] })).status, 413);
    const chunkedDelete = await request(page, "/api/conversation", { method: "DELETE", headers: { ...valid, "Content-Type": "application/json", "Transfer-Encoding": "chunked" }, chunks: ["{", "}"] });
    assert.equal(chunkedDelete.status, 200, "chunked JSON DELETE preserves body framing");
    assert.equal(completed.at(-1).body, "{}");
  });

  await t.test("chat accepts a bounded activity snapshot while session keeps its smaller ceiling", async () => {
    const headers = { ...valid, "Content-Type": "application/json" };
    const body = JSON.stringify({ activity: "x".repeat(16369) });
    assert.equal(Buffer.byteLength(body), 16384);
    const chat = await request(page, "/api/chat", { method: "POST", headers, chunks: [body] });
    assert.equal(chat.status, 429, "upstream quota response proves the full chat body arrived");
    assert.equal(completed.at(-1).body, body);
    const before = started.length;
    assert.equal((await request(page, "/api/session", { method: "POST", headers, chunks: ["x".repeat(8193)] })).status, 413);
    assert.equal(started.length, before);
  });

  await t.test("untrusted headers, unknown routes, queries and oversized declared bodies never reach upstream", async () => {
    const before = started.length;
    const cases = [
      ["/api/session", { headers: { ...valid, Host: "attacker.test" } }, 403],
      ["/api/session", { headers: { ...valid, Origin: "https://attacker.test" } }, 403],
      ["/api/session", { headers: { ...valid, Origin: "null" } }, 403],
      ["/api/session", { headers: { Origin: page.origin } }, 403],
      ["/api/session", { headers: { "X-CertiChat": "1" } }, 403],
      ["/api/session", { headers: { ...get, "Sec-Fetch-Site": "cross-site" } }, 403],
      ["/api/session", { method: "POST", headers: { ...get, "Content-Type": "application/json" }, chunks: ["{}"] }, 403],
      ["/api/session", { method: "POST", headers: { ...valid, "Content-Type": "text/plain" }, chunks: ["{}"] }, 415],
      ["/internal/llm/v1/chat/completions", { method: "POST", headers: valid }, 404],
      ["/api/unknown", { headers: valid }, 404],
      ["/api/session?target=http://attacker.test", { headers: valid }, 404],
      ["/api/chat", { headers: valid }, 404],
      ["/api/session", { method: "PATCH", headers: valid }, 404],
      // ponytail: reject declared sizes before uploading; chunked tests below exercise actual bytes.
      ["/api/chat", { method: "POST", headers: { ...valid, "Content-Type": "application/json", "Content-Length": "16385" } }, 413],
      ["/api/speech", { method: "POST", headers: { ...valid, "Content-Type": "application/json", "Content-Length": "32769" } }, 413],
      ["/api/voice", { method: "POST", headers: { ...valid, "Content-Type": "application/json", "Content-Length": "1350001" } }, 413],
    ];
    for (const [pathname, options, expected] of cases) assert.equal((await request(page, pathname, options)).status, expected, `${options.method || "GET"} ${pathname} ${JSON.stringify(options.headers)}`);
    assert.equal(started.length, before);
  });

  await t.test("a chunked body cannot bypass the byte ceiling or complete an upstream request", async () => {
    const before = completed.length;
    const result = await request(page, "/api/chat", { method: "POST", headers: { ...valid, "Content-Type": "application/json", "Transfer-Encoding": "chunked" }, chunks: ["x".repeat(8192), "x".repeat(8193)] });
    assert.equal(result.status, 413);
    assert.equal(completed.length, before);
    assert.equal((await request(page, "/api/session", { headers: get })).status, 200);
  });

  await t.test("only local CertiChat HTML changes; CertiQuiz and the disabled proxy keep their existing behavior", async () => {
    const home = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
    const proxied = await request(page, page.pathname);
    assert.equal(proxied.status, 200);
    assert.equal(proxied.body, home.replaceAll('data-api="http://127.0.0.1:18741"', `data-api="${page.origin}"`));
    const quiz = await readFile(new URL("../dist/certiquiz/index.html", import.meta.url), "utf8");
    const quizExpected = quiz.replace(/data-api-origin="[^"]*"/, 'data-api-origin="http://127.0.0.1:18740"');
    assert.equal((await request(page, `${page.pathname}certiquiz/`)).body, quizExpected);
    const disabled = await preview(t);
    assert.equal((await request(disabled, disabled.pathname)).body, home);
    assert.equal((await request(disabled, `${disabled.pathname}certiquiz/`)).body, quizExpected);
    const before = started.length;
    assert.equal((await request(disabled, "/api/session", { headers: { Origin: disabled.origin, "X-CertiChat": "1" } })).status, 404);
    assert.equal(started.length, before);
  });
});

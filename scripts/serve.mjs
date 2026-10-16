import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../dist");
// ponytail: the local preview and its API are paired by certiquiz-local.ps1.
const previewApiOrigin = "http://127.0.0.1:18740";
const { base } = JSON.parse(
  await readFile(new URL("../data/es/catalog.json", import.meta.url), "utf8"),
);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp4": "video/mp4",
};
const port = Number(process.env.PORT || 4173);
const chatProxyPort = Number(process.env.CERTICHAT_PREVIEW_PROXY_PORT || 0);
if (!Number.isInteger(chatProxyPort) || chatProxyPort < 0 || chatProxyPort > 65535)
  throw new Error("CERTICHAT_PREVIEW_PROXY_PORT must be a loopback API port.");
const chatRoutes = {
  "/api/health": ["GET"], "/api/session": ["GET", "POST"],
  "/api/graph": ["GET"], "/api/chat": ["POST"],
  "/api/voice": ["POST"], "/api/conversation": ["DELETE"],
};

function proxyChat(request, response, url, origin) {
  if (url.search || !chatRoutes[url.pathname]?.includes(request.method)) {
    response.writeHead(404).end("Not found");
    return;
  }
  const fromPage = request.headers.origin === origin || (
    request.method === "GET" && request.headers.origin === undefined && request.headers["sec-fetch-site"] === "same-origin"
  );
  if (request.headers.host !== new URL(origin).host || !fromPage ||
      (url.pathname !== "/api/health" && request.headers["x-certichat"] !== "1")) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  if (request.method !== "GET" && !/^application\/json(?:;|$)/i.test(request.headers["content-type"] || "")) {
    response.writeHead(415).end("JSON required");
    return;
  }
  const limit = url.pathname === "/api/voice" ? 1350000 : url.pathname === "/api/chat" ? 16384 : 8192;
  if (Number(request.headers["content-length"] || 0) > limit) {
    response.writeHead(413).end("Request too large");
    return;
  }
  // ponytail: opt-in loopback bridge for isolated previews; the shared API keeps its 4173 origin policy.
  const headers = { Origin: "http://127.0.0.1:4173", "X-CertiChat": "1" };
  for (const name of ["content-type", "content-length", "cookie"])
    if (request.headers[name]) headers[name] = request.headers[name];
  if (request.headers["transfer-encoding"] === "chunked") headers["Transfer-Encoding"] = "chunked";
  const upstream = http.request({ hostname: "127.0.0.1", port: chatProxyPort, path: url.pathname, method: request.method, headers }, incoming => {
    if (response.writableEnded || response.destroyed) { incoming.destroy(); return; }
    const forwarded = { "Cache-Control": "no-store" };
    for (const name of ["content-type", "content-encoding", "set-cookie", "retry-after"])
      if (incoming.headers[name]) forwarded[name] = incoming.headers[name];
    response.writeHead(incoming.statusCode, forwarded);
    incoming.on("error", () => response.destroy());
    incoming.pipe(response);
  });
  upstream.setTimeout(130000, () => upstream.destroy(new Error("Preview API timeout")));
  upstream.on("error", () => {
    if (!response.headersSent && !response.destroyed) response.writeHead(502).end("CertiChat API unavailable");
  });
  let size = 0;
  request.on("data", chunk => {
    size += chunk.length;
    if (size > limit && !response.headersSent) {
      request.unpipe(upstream);
      response.writeHead(413).end("Request too large");
      upstream.destroy();
      request.resume();
    }
  });
  request.on("aborted", () => upstream.destroy());
  response.on("close", () => upstream.destroy());
  request.pipe(upstream);
}

const server = http
  .createServer(async (request, response) => {
    let url;
    try {
      url = new URL(request.url, "http://localhost");
      const origin = `http://127.0.0.1:${request.socket.localPort}`;
      if (chatProxyPort && url.pathname.startsWith("/api/")) {
        proxyChat(request, response, url, origin);
        return;
      }
      if (url.pathname === "/") {
        response.writeHead(302, { Location: base });
        response.end();
        return;
      }
      if (!url.pathname.startsWith(base)) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      let file = path.resolve(
        root,
        decodeURIComponent(url.pathname.slice(base.length)),
      );
      if (file !== root && !file.startsWith(root + path.sep)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      if ((await stat(file)).isDirectory())
        file = path.join(file, "index.html");
      let content = await readFile(file);
      if (chatProxyPort && path.extname(file) === ".html") {
        content = Buffer.from(content.toString("utf8").replaceAll(
          'data-api="http://127.0.0.1:18741"', `data-api="${origin}"`,
        ));
      }
      if (/^(?:(?:es|en|pt|it)[\\/])?certiquiz[\\/]index\.html$/.test(path.relative(root, file))) {
        content = Buffer.from(
          content
            .toString("utf8")
            .replace(
              /data-api-origin="[^"]*"/,
              `data-api-origin="${previewApiOrigin}"`,
            ),
        );
      }
      response.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(content);
    } catch {
      const locale = url?.pathname.slice(base.length).match(/^(es|en|pt|it)\//)?.[1];
      try {
        const content = await readFile(path.join(root, locale || '', '404.html'));
        response.writeHead(404, { "Content-Type": types['.html'], "Cache-Control": "no-store" });
        response.end(content);
      } catch {
        response.writeHead(404);
        response.end("Not found");
      }
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`CertiTips preview: http://127.0.0.1:${server.address().port}${base}`),
  );

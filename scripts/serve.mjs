import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../dist");
const { base } = JSON.parse(
  await readFile(new URL("../data/catalog.json", import.meta.url), "utf8"),
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
http
  .createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
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
      const content = await readFile(file);
      response.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(content);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`CertiTips preview: http://127.0.0.1:${port}${base}`),
  );

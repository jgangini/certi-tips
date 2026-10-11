import { readFile, readdir, mkdir, writeFile, cp, realpath, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import MarkdownIt from "markdown-it";
import { layout, homeBody, certiquizBody, escapeHtml, courseRoute } from "./layout.mjs";
import { annotateHeadings, pageDocuments, corpusArtifacts, contentHash } from "./certichat-corpus.mjs";
import { certichatExplorerBody } from "./certichat-explorer.mjs";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "dist");
const site = JSON.parse(
  await readFile(path.join(root, "data/catalog.json"), "utf8"),
);
const certiquizApi = new URL(process.env.CERTIQUIZ_API_ORIGIN || "https://certiquiz.cloudtechnext.net");
if ((certiquizApi.protocol !== "https:" && !(certiquizApi.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(certiquizApi.hostname))) || certiquizApi.username || certiquizApi.password || certiquizApi.pathname !== "/" || certiquizApi.search || certiquizApi.hash)
  throw new Error("CERTIQUIZ_API_ORIGIN must be an HTTPS origin (HTTP only on loopback), without credentials, path, query, or fragment.");
const chatEnvFile = path.join(root, ".private/certichat.env");
const certichatMode = process.env.CERTICHAT_MODE || (existsSync(chatEnvFile) ? parseEnv(await readFile(chatEnvFile, "utf8")).CERTICHAT_MODE : undefined) || "VPS";
if (!["LOCAL", "VPS"].includes(certichatMode)) throw new Error("CERTICHAT_MODE must be LOCAL or VPS.");
const certichatApi = new URL(process.env.CERTICHAT_API_ORIGIN || (certichatMode === "LOCAL" ? "http://127.0.0.1:18741" : "https://certichat.cloudtechnext.net"));
if ((certichatApi.protocol !== "https:" && !(certichatApi.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(certichatApi.hostname))) || certichatApi.username || certichatApi.password || certichatApi.pathname !== "/" || certichatApi.search || certichatApi.hash)
  throw new Error("CERTICHAT_API_ORIGIN must be an HTTPS origin (HTTP only on loopback), without credentials, path, query, or fragment.");
if ((certichatMode === "LOCAL") !== ["localhost", "127.0.0.1", "[::1]"].includes(certichatApi.hostname))
  throw new Error("LOCAL requires a loopback API; VPS requires a public HTTPS API.");
site.certichat = { apiOrigin: certichatApi.origin, siteKey: process.env.CERTICHAT_TURNSTILE_SITE_KEY || "" };
site.certichat.version = contentHash((await Promise.all(["js", "css"].map(extension => readFile(path.join(root, `assets/certichat.${extension}`), "utf8")))).join("\n")).slice(0, 12);
const knowledge = [];
const imageSizes = new Map();
const md = new MarkdownIt({ html: true, linkify: true });

md.renderer.rules.table_open = () => '<div class="table-scroll" role="region" aria-label="Tabla de referencia" tabindex="0"><table>\n';
md.renderer.rules.table_close = () => "</table></div>\n";

md.renderer.rules.image = (tokens, index) => {
  const token = tokens[index];
  const src = escapeHtml(token.attrGet("src"));
  const alt = escapeHtml(token.content);
  const caption = escapeHtml(token.attrGet("title") || token.content);
  const size = imageSizes.get(token.attrGet("src"));
  if (!size?.every(value => Number.isFinite(value) && value > 0)) throw new Error(`Missing image dimensions: ${src}`);
  return `<button class="diagram" type="button" data-diagram="${src}" aria-label="Ampliar: ${alt}"><img src="${src}" alt="${alt}" width="${size[0]}" height="${size[1]}" loading="lazy"><span>${caption} <span aria-hidden="true">↗</span></span></button>`;
};

function renderMarkdown(source) {
  const tokens = md.parse(source.replaceAll("{{base}}", site.base), {});
  const toc = annotateHeadings(tokens);
  return { html: md.renderer.render(tokens, md.options, {}), toc, tokens };
}

async function save(relative, html) {
  const destination = path.join(output, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, html);
}

try {
  const existing = await realpath(output);
  if (existing !== path.join(await realpath(root), "dist"))
    throw new Error("Refusing to clean a redirected dist directory.");
  await rm(existing, { recursive: true, force: true });
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await mkdir(output, { recursive: true });
await cp(path.join(root, "assets"), path.join(output, "assets"), {
  recursive: true,
});
await cp(path.join(root, "node_modules", "qrcode-generator", "qrcode.js"), path.join(output, "assets", "qrcode-generator.js"));
await cp(path.join(root, "node_modules", "deep-chat", "dist", "deepChat.js"), path.join(output, "assets", "deep-chat.js"));
await cp(path.join(root, "node_modules", "deep-chat", "LICENSE"), path.join(output, "assets", "deep-chat.LICENSE.txt"));
// SVGs loaded through <img> cannot fetch sibling images; embed local PNG illustrations at build time.
const diagramDirectory = path.join(output, "assets/diagrams");
for (const file of await readdir(diagramDirectory)) {
  if (!file.endsWith(".svg")) continue;
  const destination = path.join(diagramDirectory, file);
  const source = await readFile(destination, "utf8");
  // Reserve the SVG's native ratio before lazy loading, so document anchors do not shift.
  const viewBox = source.match(/\bviewBox="([^"]+)"/)?.[1].trim().split(/[\s,]+/).map(Number);
  if (viewBox?.length === 4) imageSizes.set(`${site.base}assets/diagrams/${file}`, viewBox.slice(2));
  let embedded = source;
  for (const [reference, name] of source.matchAll(/href="\.\.\/illustrations\/([a-z0-9-]+\.png)"/g)) {
    const png = await readFile(path.join(root, "assets/illustrations", name));
    embedded = embedded.replace(reference, `href="data:image/png;base64,${png.toString("base64")}"`);
  }
  if (embedded !== source) await writeFile(destination, embedded);
}
for (const file of await readdir(path.join(root, "assets/illustrations"))) {
  if (!file.endsWith(".png")) continue;
  const png = await readFile(path.join(root, "assets/illustrations", file));
  if (png.length < 24 || png.toString("hex", 0, 8) !== "89504e470d0a1a0a" || png.toString("ascii", 12, 16) !== "IHDR") throw new Error(`Invalid PNG: ${file}`);
  imageSizes.set(`${site.base}assets/illustrations/${file}`, [png.readUInt32BE(16), png.readUInt32BE(20)]);
}
for (const course of site.courses) {
  await cp(path.join(root, "data", `${course.questionBank}.json`), path.join(output, "assets", `${course.questionBank}.json`));
  const publicPath = courseRoute(course);
  const pages = [...course.modules, ...course.resources];
  const rendered = new Map(await Promise.all(pages.map(async (page) => [
    page.slug,
    renderMarkdown(await readFile(path.join(root, "content", course.contentDir || "", `${page.slug}.md`), "utf8")),
  ])));
  const tocByPage = new Map([...rendered].map(([slug, { toc }]) => [slug, toc]));
  for (const page of pages) {
    const { html, tokens } = rendered.get(page.slug);
    knowledge.push(...pageDocuments(tokens, { id: `${course.id}/${page.slug}`, title: page.title, description: page.description, courseId: course.id, url: `${site.origin}${site.base}${publicPath}/${page.slug}/` }));
    const index = course.modules.indexOf(page);
    await save(
      `${publicPath}/${page.slug}/index.html`,
      layout({
        site,
        course,
        page,
        body: html,
        tocByPage,
        previous: course.modules[index - 1],
        next: course.modules[index + 1],
      }),
    );
    if (publicPath !== course.id) {
      const destination = `${site.base}${publicPath}/${page.slug}/`;
      // ponytail: static aliases keep old bookmarks; script preserves fragments, meta refresh covers no-JS.
      await save(`${course.id}/${page.slug}/index.html`, `<!doctype html><html lang="es"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${destination}"><link rel="canonical" href="${site.origin}${destination}"><script>location.replace(${JSON.stringify(destination)}+location.hash)</script><a href="${destination}">Continuar en la guía</a></html>`);
    }
  }
  const questions = JSON.parse(await readFile(path.join(root, "data", `${course.questionBank}.json`), "utf8"));
  for (const question of questions) knowledge.push({
    id: `${course.id}/questions/${question.id}`, title: `${course.title} · Práctica: ${question.id}`,
    url: `${site.origin}${site.base}${publicPath}/practice/`, courseId: course.id,
    text: `${course.title}\n${question.question}\n${question.options.map(option => `${option.id === question.correctOption ? "Respuesta correcta" : "Opción incorrecta"}: ${option.text}\nExplicación: ${option.explanation}`).join("\n")}`,
  });
  const redirect = `${site.base}${publicPath}/overview/`;
  // ponytail: keep the former workshop URL working without a second learning mode.
  await save(`${course.id}/talk/index.html`, `<!doctype html><html lang="es"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${redirect}"><title>CertiTips</title><link rel="canonical" href="${site.origin}${redirect}"><a href="${redirect}">Continuar en la guía</a></html>`);
  await save(
    `${publicPath}/index.html`,
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${redirect}"><title>${escapeHtml(course.title)}</title><link rel="canonical" href="${site.origin}${redirect}"></head><body><a href="${redirect}">Abrir la guía</a></body></html>`,
  );
  if (publicPath !== course.id) await save(`${course.id}/index.html`, `<!doctype html><html lang="es"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${redirect}"><link rel="canonical" href="${site.origin}${redirect}"><a href="${redirect}">Abrir la guía</a></html>`);
}
knowledge.push({ id: "home", title: "CertiTips · Rutas de aprendizaje", url: `${site.origin}${site.base}`, courseId: "site", text: site.paths.map(group => `${group.title}\n${group.description}\n${group.items.map(item => `${item.title}: ${item.description}${item.guide ? "" : " (guía próximamente)"}`).join("\n")}`).join("\n\n") });
const { corpus, manifest } = corpusArtifacts(knowledge, `${site.origin}${site.base}assets/certichat/corpus.json`);
await save("assets/certichat/corpus.json", corpus);
await save("assets/certichat/manifest.json", manifest);
const graphFile = path.join(root, "data/certichat-graph.json");
const hasGraph = existsSync(graphFile);
if (hasGraph) await cp(graphFile, path.join(output, "assets/certichat/graph.json"));
await save(
  "index.html",
  layout({
    site,
    course: site.courses[0],
    page: { slug: "home" },
    home: true,
    body: homeBody(site, existsSync(path.join(root, "assets/motion/certification-path.mp4"))),
  }),
);
await save(
  "certiquiz/index.html",
  layout({
    site,
    course: site.courses[0],
    page: { slug: "certiquiz", title: "CertiQuiz · Aprende en equipo", description: "Practica en grupo: crea una sala, comparte el código y aprende con cada respuesta." },
    body: certiquizBody(certiquizApi.origin),
  }),
);
await save(
  "certichat/index.html",
  layout({
    site,
    course: site.courses[0],
    page: { slug: "certichat", title: "CertiChat en acción", description: "Explora el grafo de conocimiento y descubre qué conceptos recupera CertiChat para responder a tus preguntas." },
    body: certichatExplorerBody(site.base, hasGraph),
  }),
);
await save(
  "404.html",
  `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Página no encontrada · CertiTips</title><link rel="stylesheet" href="${site.base}assets/site.css"><main class="home-main"><h1>No encontramos ese apartado.</h1><p>Vuelve a la ruta de aprendizaje para continuar.</p><a class="button" href="${site.base}">Ir a CertiTips</a></main></html>`,
);
await save(".nojekyll", "");
console.log(`Built ${site.courses.length} course(s) at ${site.base} in dist/.`);

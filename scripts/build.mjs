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
site.certiquizApi = certiquizApi.origin;
const chatEnvFile = path.join(root, ".private/certichat.env");
const certichatMode = process.env.CERTICHAT_MODE || (existsSync(chatEnvFile) ? parseEnv(await readFile(chatEnvFile, "utf8")).CERTICHAT_MODE : undefined) || "VPS";
if (!["LOCAL", "VPS"].includes(certichatMode)) throw new Error("CERTICHAT_MODE must be LOCAL or VPS.");
const certichatApi = new URL(process.env.CERTICHAT_API_ORIGIN || (certichatMode === "LOCAL" ? "http://127.0.0.1:18741" : "https://certichat.cloudtechnext.net"));
if ((certichatApi.protocol !== "https:" && !(certichatApi.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(certichatApi.hostname))) || certichatApi.username || certichatApi.password || certichatApi.pathname !== "/" || certichatApi.search || certichatApi.hash)
  throw new Error("CERTICHAT_API_ORIGIN must be an HTTPS origin (HTTP only on loopback), without credentials, path, query, or fragment.");
if ((certichatMode === "LOCAL") !== ["localhost", "127.0.0.1", "[::1]"].includes(certichatApi.hostname))
  throw new Error("LOCAL requires a loopback API; VPS requires a public HTTPS API.");
site.certichat = { apiOrigin: certichatApi.origin, siteKey: process.env.CERTICHAT_TURNSTILE_SITE_KEY || "" };
const assetSources = new Map(await Promise.all((await readdir(path.join(root, "assets"))).filter(name => /\.(js|css)$/.test(name)).sort().map(async name => [name, await readFile(path.join(root, "assets", name), "utf8")])));
site.certichat.version = contentHash([...assetSources].flat().join("\n") + await readFile(path.join(root, "package-lock.json"), "utf8")).slice(0, 12);
const knowledge = [];
const imageSizes = new Map();
const md = new MarkdownIt({ html: true, linkify: true });

md.renderer.rules.table_open = () => '<div class="table-scroll" role="region" aria-label="Tabla de referencia" tabindex="0"><table>\n';
md.renderer.rules.table_close = () => "</table></div>\n";
md.renderer.rules.heading_open = (tokens, index, options, env, renderer) => {
  env.heading = tokens[index + 1].children.filter(token => ["text", "code_inline"].includes(token.type)).map(token => token.content).join("");
  return renderer.renderToken(tokens, index, options);
};

md.renderer.rules.image = (tokens, index, _options, env) => {
  const token = tokens[index];
  const reference = token.attrGet("src");
  if (!/^img\/[a-z0-9-]+\.(?:svg|png)$/.test(reference)) throw new Error(`Invalid module image: ${reference}`);
  const imageUrl = `${site.base}${env.publicPath}/${reference}`;
  const src = escapeHtml(imageUrl);
  const alt = escapeHtml(token.content);
  const caption = escapeHtml(token.attrGet("title") || token.content);
  const heading = env.heading || token.content;
  env.gallery.push({ src: imageUrl, alt: token.content, caption: token.attrGet("title") || token.content, module: env.pageTitle, heading });
  const size = imageSizes.get(imageUrl);
  if (!size?.every(value => Number.isFinite(value) && value > 0)) throw new Error(`Missing image dimensions: ${src}`);
  return `<button class="diagram" id="diagram-${reference.slice(4)}" type="button" data-diagram="${src}" data-diagram-heading="${escapeHtml(heading)}" aria-label="Ampliar: ${alt}"><img src="${src}" alt="${alt}" width="${size[0]}" height="${size[1]}" loading="lazy"><span>${caption} <span aria-hidden="true">↗</span></span></button>`;
};

function renderMarkdown(source, publicPath, pageTitle) {
  const tokens = md.parse(source.replaceAll("{{base}}", site.base), {});
  const toc = annotateHeadings(tokens);
  const env = { publicPath, pageTitle, gallery: [] };
  return { html: md.renderer.render(tokens, md.options, env), toc, tokens, gallery: env.gallery };
}

async function save(relative, html) {
  const destination = path.join(output, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  if (relative.endsWith(".html")) html = html.replace(/((?:href|src)=")([^"?]+\.(?:js|css))"/g, (match, prefix, url) => url.startsWith(`${site.base}assets/`) ? `${prefix}${url}?v=${site.certichat.version}"` : match);
  await writeFile(destination, html);
}

async function publishImages(directory, publicPath) {
  if (!existsSync(path.join(directory, "img"))) return;
  const images = await realpath(path.join(directory, "img"));
  if (!images.startsWith(`${directory}${path.sep}`)) throw new Error("Module images must stay inside their source directory.");
  const files = await readdir(images, { withFileTypes: true });
  if (files.some(file => !file.isFile() || !/^[a-z0-9-]+\.(?:svg|png)$/.test(file.name))) throw new Error(`Invalid module image directory: ${images}`);
  for (const { name } of files) {
    let contents = await readFile(path.join(images, name));
    let size;
    if (name.endsWith(".svg")) {
      contents = contents.toString("utf8");
      const viewBox = contents.match(/\bviewBox="([^"]+)"/)?.[1].trim().split(/[\s,]+/).map(Number);
      if (viewBox?.length === 4) size = viewBox.slice(2);
      // SVGs loaded through <img> cannot fetch siblings; embed only module-local PNG files.
      for (const [reference, png] of contents.matchAll(/href="([a-z0-9-]+\.png)"/g)) {
        if (!files.some(file => file.name === png)) throw new Error(`Missing module illustration: ${png}`);
        contents = contents.replace(reference, `href="data:image/png;base64,${(await readFile(path.join(images, png))).toString("base64")}"`);
      }
    } else {
      if (contents.length < 24 || contents.toString("hex", 0, 8) !== "89504e470d0a1a0a" || contents.toString("ascii", 12, 16) !== "IHDR") throw new Error(`Invalid PNG: ${name}`);
      size = [contents.readUInt32BE(16), contents.readUInt32BE(20)];
    }
    if (!size?.every(value => Number.isFinite(value) && value > 0)) throw new Error(`Missing image dimensions: ${name}`);
    imageSizes.set(`${site.base}${publicPath}/img/${name}`, size);
    await save(`${publicPath}/img/${name}`, contents);
  }
}

async function renderPage(course, page) {
  const contentRoot = await realpath(path.join(root, "data"));
  const source = await realpath(path.resolve(contentRoot, course.contentDir, page.file));
  if (!source.startsWith(`${contentRoot}${path.sep}`)) throw new Error("Course source must stay inside data/.");
  const publicPath = `${courseRoute(course)}/${page.slug}`;
  await publishImages(path.dirname(source), publicPath);
  return renderMarkdown(await readFile(source, "utf8"), publicPath, page.title);
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
// ponytail: our flat browser modules use literal relative imports; keep their cache version with the entry points.
for (const [name, source] of assetSources) if (name.endsWith(".js")) {
  await save(`assets/${name}`, source.replace(/((?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'])(\.\/[\w-]+\.js)(["'])/g, `$1$2?v=${site.certichat.version}$3`));
}
for (const course of site.courses) {
  await save(`assets/${course.questionBank}.json`, await readFile(path.join(root, "data", `${course.questionBank}.json`)));
  const publicPath = courseRoute(course);
  const pages = [...course.modules, ...course.resources];
  const rendered = new Map(await Promise.all(pages.map(async (page) => [
    page.slug,
    await renderPage(course, page),
  ])));
  await save(`${publicPath}/gallery.json`, JSON.stringify(pages.flatMap(page => rendered.get(page.slug).gallery)));
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
  }
  if (course.resources.some(page => page.slug === "practice")) {
    const questions = JSON.parse(await readFile(path.join(root, "data", `${course.questionBank}.json`), "utf8"));
    for (const question of questions) knowledge.push({
      id: `${course.id}/questions/${question.id}`, title: `${course.title} · Práctica: ${question.id}`,
      url: `${site.origin}${site.base}${publicPath}/practice/`, courseId: course.id,
      text: `${course.title}\n${question.question}\n${question.options.map(option => `${option.id === question.correctOption ? "Respuesta correcta" : "Opción incorrecta"}: ${option.text}${option.explanation ? `\nExplicación: ${option.explanation}` : ""}`).join("\n")}`,
    });
  }
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

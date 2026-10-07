import { readFile, readdir, mkdir, writeFile, cp, realpath, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import MarkdownIt from "markdown-it";
import { layout, homeBody, certiquizBody, escapeHtml } from "./layout.mjs";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "dist");
const site = JSON.parse(
  await readFile(path.join(root, "data/catalog.json"), "utf8"),
);
const certiquizApi = new URL(process.env.CERTIQUIZ_API_ORIGIN || "https://certiquiz.cloudtechnext.net");
if ((certiquizApi.protocol !== "https:" && !(certiquizApi.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(certiquizApi.hostname))) || certiquizApi.username || certiquizApi.password || certiquizApi.pathname !== "/" || certiquizApi.search || certiquizApi.hash)
  throw new Error("CERTIQUIZ_API_ORIGIN must be an HTTPS origin (HTTP only on loopback), without credentials, path, query, or fragment.");
const md = new MarkdownIt({ html: true, linkify: true });
const slug = (text) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

md.renderer.rules.table_open = () => '<div class="table-scroll" role="region" aria-label="Tabla de referencia" tabindex="0"><table>\n';
md.renderer.rules.table_close = () => "</table></div>\n";

md.renderer.rules.image = (tokens, index) => {
  const token = tokens[index];
  const src = escapeHtml(token.attrGet("src"));
  const alt = escapeHtml(token.content);
  const caption = escapeHtml(token.attrGet("title") || token.content);
  return `<button class="diagram" type="button" data-diagram="${src}" aria-label="Ampliar: ${alt}"><img src="${src}" alt="${alt}" loading="lazy"><span>${caption} <span aria-hidden="true">↗</span></span></button>`;
};

function renderMarkdown(source) {
  const tokens = md.parse(source.replaceAll("{{base}}", site.base), {});
  const toc = [];
  const used = new Map();
  for (const [index, token] of tokens.entries()) {
    if (token.type !== "heading_open") continue;
    const title = tokens[index + 1].content;
    const raw = slug(title);
    const count = used.get(raw) || 0;
    used.set(raw, count + 1);
    const id = count ? `${raw}-${count + 1}` : raw;
    token.attrSet("id", id);
    if (token.tag === "h2") toc.push({ id, title });
  }
  return { html: md.renderer.render(tokens, md.options, {}), toc };
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
// SVGs loaded through <img> cannot fetch sibling images; embed local PNG illustrations at build time.
const diagramDirectory = path.join(output, "assets/diagrams");
for (const file of await readdir(diagramDirectory)) {
  if (!file.endsWith(".svg")) continue;
  const destination = path.join(diagramDirectory, file);
  const source = await readFile(destination, "utf8");
  let embedded = source;
  for (const [reference, name] of source.matchAll(/href="\.\.\/illustrations\/([a-z0-9-]+\.png)"/g)) {
    const png = await readFile(path.join(root, "assets/illustrations", name));
    embedded = embedded.replace(reference, `href="data:image/png;base64,${png.toString("base64")}"`);
  }
  if (embedded !== source) await writeFile(destination, embedded);
}
for (const course of site.courses) {
  await cp(path.join(root, "data", `${course.questionBank}.json`), path.join(output, "assets", `${course.questionBank}.json`));
  const publicPath = course.exam.code;
  const pages = [...course.modules, ...course.resources];
  const rendered = new Map(await Promise.all(pages.map(async (page) => [
    page.slug,
    renderMarkdown(await readFile(path.join(root, "content", course.contentDir || "", `${page.slug}.md`), "utf8")),
  ])));
  const tocByPage = new Map([...rendered].map(([slug, { toc }]) => [slug, toc]));
  for (const page of pages) {
    const { html } = rendered.get(page.slug);
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
  const redirect = `${site.base}${publicPath}/overview/`;
  // ponytail: keep the former workshop URL working without a second learning mode.
  await save(`${course.id}/talk/index.html`, `<!doctype html><html lang="es"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${redirect}"><title>CertiTips</title><link rel="canonical" href="${site.origin}${redirect}"><a href="${redirect}">Continuar en la guía</a></html>`);
  await save(
    `${publicPath}/index.html`,
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${redirect}"><title>${escapeHtml(course.title)}</title><link rel="canonical" href="${site.origin}${redirect}"></head><body><a href="${redirect}">Abrir la guía</a></body></html>`,
  );
  if (publicPath !== course.id) await save(`${course.id}/index.html`, `<!doctype html><html lang="es"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${redirect}"><link rel="canonical" href="${site.origin}${redirect}"><a href="${redirect}">Abrir la guía</a></html>`);
}
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
  "404.html",
  `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Página no encontrada · CertiTips</title><link rel="stylesheet" href="${site.base}assets/site.css"><main class="home-main"><h1>No encontramos ese apartado.</h1><p>Vuelve a la ruta de aprendizaje para continuar.</p><a class="button" href="${site.base}">Ir a CertiTips</a></main></html>`,
);
await save(".nojekyll", "");
console.log(`Built ${site.courses.length} course(s) at ${site.base} in dist/.`);

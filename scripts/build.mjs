import { readFile, mkdir, writeFile, cp, realpath, rm } from "node:fs/promises";
import path from "node:path";
import MarkdownIt from "markdown-it";
import { layout, homeBody, escapeHtml } from "./layout.mjs";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "dist");
const site = JSON.parse(
  await readFile(path.join(root, "data/catalog.json"), "utf8"),
);
const md = new MarkdownIt({ html: true, linkify: true });
const slug = (text) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

md.renderer.rules.image = (tokens, index) => {
  const token = tokens[index];
  const src = escapeHtml(token.attrGet("src"));
  const alt = escapeHtml(token.content);
  return `<button class="diagram" type="button" data-diagram="${src}" aria-label="Ampliar: ${alt}"><img src="${src}" alt="${alt}" loading="lazy"><span>Ampliar diagrama <span aria-hidden="true">↗</span></span></button>`;
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
await cp(
  path.join(root, "data/questions.json"),
  path.join(output, "assets/questions.json"),
);
for (const course of site.courses) {
  for (const page of [...course.modules, ...course.resources]) {
    const source = await readFile(
      path.join(root, "content", `${page.slug}.md`),
      "utf8",
    );
    const { html, toc } = renderMarkdown(source);
    const index = course.modules.indexOf(page);
    await save(
      `${course.id}/${page.slug}/index.html`,
      layout({
        site,
        course,
        page,
        body: html,
        toc,
        previous: course.modules[index - 1],
        next: course.modules[index + 1],
      }),
    );
  }
  const redirect = `${site.base}${course.id}/overview/`;
  await save(
    `${course.id}/index.html`,
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${redirect}"><title>${escapeHtml(course.title)}</title><link rel="canonical" href="${site.origin}${redirect}"></head><body><a href="${redirect}">Abrir la guía</a></body></html>`,
  );
}
await save(
  "index.html",
  layout({
    site,
    course: site.courses[0],
    page: { slug: "home" },
    home: true,
    body: homeBody(site, site.courses[0]),
  }),
);
await save(
  "404.html",
  `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Página no encontrada · CertiTips</title><link rel="stylesheet" href="${site.base}assets/site.css"><main class="home-main"><h1>No encontramos ese apartado.</h1><p>Vuelve a la ruta de aprendizaje para continuar.</p><a class="button" href="${site.base}">Ir a CertiTips</a></main></html>`,
);
await save(".nojekyll", "");
console.log(`Built ${site.courses.length} course(s) at ${site.base} in dist/.`);

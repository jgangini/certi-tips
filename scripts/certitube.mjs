import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import MarkdownIt from "markdown-it";
import { annotateHeadings, pageDocuments } from "./certichat-corpus.mjs";
import { escapeHtml } from "./layout.mjs";

const markdown = new MarkdownIt({ html: false, linkify: true });
const videoID = /^[A-Za-z0-9_-]{11}$/;
const date = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const timestamp = value => typeof value === "string" && date(value.slice(0, 10)) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const text = value => typeof value === "string" && value.trim().length > 0 && value.length <= 180;
const unfinished = value => /<[^>]+>|\b(?:TODO|TBD|FIXME)\b|\{\{|^\s*(?:pendiente|por completar)\s*[.!]?\s*$/i.test(value);

function validateMetadata(value, id) {
  if (!value || Array.isArray(value) || !videoID.test(id) || value.videoId !== id) throw new Error("Invalid CertiTube video ID");
  if (!text(value.title) || value.channelUrl !== "https://www.youtube.com/@jgangini") throw new Error(`${id}: invalid title or channel`);
  if (!date(value.publishedAt) || !Number.isSafeInteger(value.durationSeconds) || value.durationSeconds <= 0) throw new Error(`${id}: invalid date or duration`);
  if (!Array.isArray(value.topics) || !value.topics.length || value.topics.length > 12 || !value.topics.every(text)) throw new Error(`${id}: invalid topics`);
}

export function chapterTime(title) {
  const match = /^(\d{2,}:\d{2}(?::\d{2})?)\s+[—–-]\s+(.+)$/.exec(title);
  if (!match) throw new Error(`Invalid chapter heading: ${title}`);
  const parts = match[1].split(":").map(Number);
  if (parts.slice(1).some(part => part > 59)) throw new Error(`Invalid chapter time: ${title}`);
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  if (!Number.isSafeInteger(seconds)) throw new Error(`Invalid chapter time: ${title}`);
  return { seconds, label: match[1], title: match[2], anchor: `t-${seconds}` };
}

function videoSections(tokens, duration) {
  let section = "", previous = -1;
  const chapters = [], headings = new Map();
  for (const [index, token] of tokens.entries()) {
    if (token.type !== "heading_open") continue;
    const title = tokens[index + 1].content;
    if (token.tag === "h2") {
      if (headings.has(title)) throw new Error(`Duplicate section: ${title}`);
      section = title; headings.set(title, index); continue;
    }
    if (token.tag !== "h3" || section !== "Capítulos") throw new Error(`Use H2 sections and H3 timed chapters: ${title}`);
    const chapter = chapterTime(title);
    if (chapter.seconds <= previous || chapter.seconds >= duration) throw new Error(`Chapter times must increase within video duration: ${title}`);
    previous = chapter.seconds;
    token.attrSet("id", chapter.anchor);
    chapters.push(chapter);
  }
  return { chapters, headings };
}

function assertComplete(tokens, headings) {
  for (const name of ["Resumen", "Recursos relacionados"]) {
    const index = headings.get(name);
    if (index === undefined || !hasContent(tokens, index)) throw new Error(`Missing content: ${name}`);
  }
  for (const [index, token] of tokens.entries()) {
    if (token.type === "heading_open" && token.tag === "h3" && !hasContent(tokens, index)) throw new Error("Empty chapter");
    if (token.type !== "inline") continue;
    const prose = token.children.filter(child => child.type === "text").map(child => child.content).join(" ");
    if (unfinished(prose)) throw new Error("Unfinished CertiTube content");
  }
}

function hasContent(tokens, heading) {
  const start = heading + 3, next = tokens.findIndex((token, index) => index >= start && token.type === "heading_open");
  return tokens.slice(start, next < 0 ? tokens.length : next).some(token => token.type === "inline" && token.content.trim());
}

export function parseVideo(source, id, base = "/certitips/") {
  if (source.length > 100000) throw new Error(`${id}: CertiTube source exceeds 100000 characters`);
  const tokens = markdown.parse(source.replaceAll("{{base}}", base), {});
  const header = tokens.shift();
  if (header?.type !== "fence" || header.info !== "json") throw new Error(`${id}: first block must be JSON metadata`);
  const metadata = JSON.parse(header.content);
  validateMetadata(metadata, id);
  if (!["draft", "published"].includes(metadata.status)) throw new Error(`${id}: invalid publication status`);
  if (metadata.status === "draft") return null;
  if (!date(metadata.reviewedAt)) throw new Error(`${id}: published video needs a review date`);
  if (!timestamp(metadata.addedAt)) throw new Error(`${id}: addedAt needs an ISO timestamp with timezone`);
  if ([metadata.title, ...metadata.topics].some(unfinished)) throw new Error(`${id}: unfinished metadata`);
  annotateHeadings(tokens);
  const { chapters, headings } = videoSections(tokens, metadata.durationSeconds);
  if (!chapters.length) throw new Error(`${id}: at least one verified chapter is required`);
  assertComplete(tokens, headings);
  const summaryStart = headings.get("Resumen") + 3;
  const summaryEnd = tokens.findIndex((token, index) => index >= summaryStart && token.type === "heading_open");
  const summary = tokens.slice(summaryStart, summaryEnd < 0 ? tokens.length : summaryEnd).filter(token => token.type === "inline").map(token => token.content).join(" ");
  if (!summary || summary.length > 1500) throw new Error(`${id}: Resumen needs short introductory text`);
  return { ...metadata, tokens, chapters, summary, publicPath: `certitube/${id}` };
}

export async function loadVideos(root, base) {
  const directory = path.join(await realpath(root), "data/es", "certitube");
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  if (await realpath(directory) !== directory) throw new Error("CertiTube directory must not be redirected");
  const videos = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || !videoID.test(entry.name)) throw new Error(`Invalid CertiTube directory: ${entry.name}`);
    const source = path.join(directory, entry.name, `${entry.name}.md`);
    if (await realpath(source) !== source) throw new Error("CertiTube source must not be redirected");
    const video = parseVideo(await readFile(source, "utf8"), entry.name, base);
    if (video) videos.push(video);
  }
  return videos.sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt) || a.videoId.localeCompare(b.videoId));
}

export function videoDocuments(video, site) {
  const title = `CertiTube · ${video.title}`;
  const documents = pageDocuments(video.tokens, { id: video.publicPath, title, url: `${site.origin}${site.base}${video.publicPath}/`, courseId: "site", description: video.summary });
  return documents.filter(doc => doc.id !== `${video.publicPath}#resumen` && doc.text !== `${title}\n${doc.title.slice(title.length + 3)}`).map(doc => {
    const text = `${doc.text}\nVideo de AI CloudTech publicado el ${video.publishedAt}. Ficha revisada el ${video.reviewedAt}. Temas: ${video.topics.join(", ")}.`;
    // Keep each reviewed section inside one existing Cognee segment, including its date and timestamp.
    if (text.length > 3000) throw new Error(`${doc.id}: condense this section to fit the 3000-character evidence limit`);
    return { ...doc, text };
  });
}

function chapterPanels(video, view, env) {
  return video.chapters.map((chapter, index) => {
    const opening = video.tokens.findIndex(token => token.type === "heading_open" && token.attrGet("id") === chapter.anchor);
    const closing = video.tokens.findIndex((token, position) => position > opening && token.type === "heading_open");
    const content = view.renderer.render(video.tokens.slice(opening + 3, closing < 0 ? video.tokens.length : closing), view.options, env);
    return `<section class="tube-chapter-description" data-tube-description="${chapter.seconds}" aria-labelledby="${chapter.anchor}"${index ? " hidden" : ""}><h3 id="${chapter.anchor}">${escapeHtml(chapter.title)}</h3>${content}</section>`;
  }).join("");
}

function takeSection(tokens, id, view, env) {
  const start = tokens.findIndex(token => token.type === "heading_open" && token.attrGet("id") === id);
  const next = tokens.findIndex((token, index) => index > start && token.type === "heading_open" && token.tag === "h2");
  return view.renderer.render(tokens.splice(start, (next < 0 ? tokens.length : next) - start), view.options, env);
}

export function videoBody(video, renderer, site) {
  const env = { publicPath: video.publicPath, pageTitle: video.title, gallery: [] };
  // Render the same safe tokens used for evidence; playback controls never enter the corpus.
  const view = new MarkdownIt({ html: false, linkify: true });
  view.renderer.rules = { ...renderer.renderer.rules };
  view.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const end = tokens.findIndex((token, position) => position > index && token.type === "link_close");
    tokens[index].attrSet("title", tokens.slice(index + 1, end).map(token => token.content).join(""));
    tokens[index].attrSet("target", "_blank");
    tokens[index].attrSet("rel", "noopener noreferrer");
    return self.renderToken(tokens, index, options);
  };
  const start = video.tokens.findIndex(token => token.type === "heading_open" && token.attrGet("id") === "capitulos");
  const next = video.tokens.findIndex((token, index) => index > start && token.type === "heading_open" && token.tag === "h2");
  const end = next < 0 ? video.tokens.length : next;
  const body = [...video.tokens.slice(0, start), ...video.tokens.slice(end)];
  const summary = takeSection(body, "resumen", view, env);
  const resourceIcon = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><use href="${site.base}assets/icons/resource-link.svg#resource-link"/></svg>`;
  const resources = takeSection(body, "recursos-relacionados", view, env).replace(/(<a\b[^>]*>)([\s\S]*?)(<\/a>)/g, `$1${resourceIcon}<span>$2</span>$3`).replace(/<\/a>\.\s*<\/li>/g, "</a></li>");
  const html = view.renderer.render(body, view.options, env);
  const panels = chapterPanels(video, view, env);
  return `<div class="tube-detail"><section class="tube-player" data-tube-player data-video-id="${video.videoId}" data-duration="${video.durationSeconds}" aria-label="Reproductor del caso" tabindex="-1"><div class="tube-watch" tabindex="-1"><header class="certichat-heading tube-heading"><div class="certichat-brand"><div><strong>${escapeHtml(video.title)}</strong><small>CERTITUBE</small></div></div></header><div class="tube-screen"><div id="tube-youtube"></div><div class="tube-loading" data-tube-loading role="status" aria-label="Cargando video"><span class="certichat-spinner" aria-hidden="true"></span></div></div></div><section class="tube-summary" aria-labelledby="resumen">${summary}</section><nav class="tube-chapters"${video.chapters.length === 1 ? " hidden" : ""} aria-label="Momentos del video"><button type="button" class="button button-secondary tube-scroll" data-tube-scroll="-1" aria-label="Capítulos anteriores" aria-controls="tube-chapter-list" title="Desplazar a la izquierda" disabled><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16 4 4 12 16 20Z" fill="currentColor"/></svg></button><div class="tube-chapter-list" id="tube-chapter-list">${video.chapters.map(item => `<a href="#${item.anchor}" data-tube-time="${item.seconds}"><span class="tube-time">${escapeHtml(item.label)}</span><span class="tube-chapter-title">${escapeHtml(item.title)}</span></a>`).join("")}</div><button type="button" class="button button-secondary tube-scroll" data-tube-scroll="1" aria-label="Capítulos siguientes" aria-controls="tube-chapter-list" title="Desplazar a la derecha" disabled><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 4 20 12 8 20Z" fill="currentColor"/></svg></button></nav><div class="tube-description"${video.chapters.length === 1 ? " hidden" : ""}>${panels}</div><section class="tube-resources" aria-labelledby="recursos-relacionados">${resources}</section><p data-tube-status role="status" aria-live="polite" hidden><span data-tube-message></span> <a data-tube-external href="https://www.youtube.com/watch?v=${video.videoId}" target="_blank" rel="noopener noreferrer" hidden>Abrir en YouTube</a></p></section>${videoCarousel(site.videos ?? [video], video.publicPath, site.base)}${html}</div>`;
}

export function videoCarousel(videos, active, base) {
  return `<nav class="tube-videos" aria-label="Videos de CertiTube"><header class="certichat-heading"><div class="certichat-brand"><div><strong>Certi<span class="brand-accent">Tube</span></strong><small>VIDEOTECA</small></div></div></header><ol>${videos.filter(video => video.publicPath !== active).map(video => `<li><a href="${base}${video.publicPath}/" title="${escapeHtml(video.title)}"><img src="https://i.ytimg.com/vi/${video.videoId}/maxresdefault.jpg" width="1280" height="720" alt="" loading="lazy"><span><strong>${escapeHtml(video.title)}</strong><span class="tube-video-summary">${escapeHtml(video.summary)}</span></span></a></li>`).join("")}</ol></nav>`;
}

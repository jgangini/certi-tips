import { createHash } from "node:crypto";

export const contentHash = (value) => createHash("sha256").update(value, "utf8").digest("hex");

// Shared by the page renderer and corpus: duplicate headings must cite the rendered anchor.
export function annotateHeadings(tokens) {
  const used = new Map(), toc = [];
  for (const [index, token] of tokens.entries()) {
    if (token.type !== "heading_open") continue;
    const title = tokens[index + 1].content;
    const raw = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const count = used.get(raw) || 0;
    used.set(raw, count + 1);
    const id = count ? `${raw}-${count + 1}` : raw;
    token.attrSet("id", id);
    if (token.tag === "h2") toc.push({ id, title });
  }
  return toc;
}

const plainHTML = (value) => value.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<[^>]*>/g, " ").replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, entity => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " })[entity]);

export function pageDocuments(tokens, { id, title, url, courseId, description = "" }) {
  const documents = [];
  let current = { id, title, url, courseId, text: `${title}\n${description}` };
  const flush = () => {
    current.text = current.text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (current.text) documents.push(current);
  };
  for (const [index, token] of tokens.entries()) {
    if (token.type === "heading_open") {
      flush();
      const anchor = token.attrGet("id");
      current = { id: `${id}#${anchor}`, title: `${title} · ${tokens[index + 1].content}`, url: `${url}#${anchor}`, courseId, text: title };
    }
    if (token.type === "inline") {
      const text = token.children.map(child => ["text", "code_inline", "image"].includes(child.type) ? child.content : child.type === "softbreak" || child.type === "hardbreak" ? "\n" : "").join("");
      current.text += `\n${text}`;
    } else if (["html_block", "fence", "code_block"].includes(token.type)) current.text += `\n${token.type === "html_block" ? plainHTML(token.content) : token.content}`;
  }
  flush();
  return documents;
}

export function corpusArtifacts(documents, corpusUrl) {
  documents.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (new Set(documents.map(item => item.id)).size !== documents.length) throw new Error("Duplicate CertiChat source ID");
  const corpus = JSON.stringify({ schemaVersion: 1, documents });
  const manifest = JSON.stringify({
    schemaVersion: 1, contentHash: contentHash(corpus), corpusUrl,
    documents: documents.map(({ text, ...metadata }) => ({ ...metadata, hash: contentHash(text) })),
  });
  return { corpus, manifest };
}

import { sourcePath } from "./certichat-trace.js";

const normalize = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const words = value => new Set(normalize(value).split(/\s+/).filter(Boolean));
const ignored = new Set("a al el en la las lo los de del y o un una que como para por con usar utilizar puedo quiero necesito sobre".split(" "));

export function indexSearchEntry(entry) {
  const heading = entry.heading ?? entry.title;
  return { ...entry, phrase: normalize(heading), fields: [words(heading), words(entry.terms ?? entry.title), words(entry.text ?? "")] };
}

function nearWord(term, word) {
  if (term.length < 5 || Math.abs(term.length - word.length) > 1) return false;
  let index = 0;
  while (index < term.length && term[index] === word[index]) index++;
  if (term.length !== word.length) {
    return term.length > word.length ? term.slice(index + 1) === word.slice(index) : term.slice(index) === word.slice(index + 1);
  }
  if (term.slice(index + 1) === word.slice(index + 1)) return true;
  return term[index] === word[index + 1] && term[index + 1] === word[index] && term.slice(index + 2) === word.slice(index + 2);
}

function wordScore(term, field) {
  const variants = ["ia", "ai"].includes(term) ? ["ia", "ai"] : [term];
  if (variants.some(value => field.has(value))) return 3;
  if (term.length < 4) return 0;
  if (term.length >= 4 && [...field].some(word => word.startsWith(term))) return 2;
  return [...field].some(word => nearWord(term, word)) ? 1 : 0;
}

export function searchContent(entries, query) {
  const terms = [...words(query)].filter(term => !ignored.has(term));
  if (!terms.length) return [];
  const matches = [];
  // ponytail: scan this small public corpus; use an inverted index if measured input latency grows.
  for (const entry of entries) {
    const scores = terms.map(term => Math.max(...entry.fields.map((field, index) => wordScore(term, field) * [9, 5, 2][index])));
    if (scores.includes(0)) continue;
    const phraseBonus = entry.phrase.includes(terms.join(" ")) ? 30 : 0;
    matches.push({ entry, score: scores.reduce((sum, score) => sum + score, phraseBonus) });
  }
  matches.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, "es"));
  // One useful section per page keeps repeated chapter/page titles out of the result list.
  const pages = new Set();
  return matches.filter(({ entry }) => {
    const page = entry.url.split("#")[0];
    if (pages.has(page)) return false;
    pages.add(page); return true;
  }).slice(0, 50).map(({ entry }) => entry);
}

export function corpusSearchEntries(corpus, siteRoot) {
  if (corpus?.schemaVersion !== 1 || !Array.isArray(corpus.documents) || corpus.documents.length > 10000) throw new Error("Invalid search corpus");
  const videoPrefix = `${new URL(siteRoot).pathname}certitube/`;
  return corpus.documents.flatMap(doc => {
    if (typeof doc?.title !== "string" || doc.title.length > 1500 || typeof doc.text !== "string" || doc.text.length > 100000) return [];
    const url = sourcePath(doc.url, siteRoot);
    if (!url) return [];
    return [indexSearchEntry({ title: doc.title, heading: doc.title.split(" · ").at(-1), terms: doc.title, text: doc.text, url, kind: url.startsWith(videoPrefix) ? "video" : "topic" })];
  });
}

export function searchExcerpt(text, query) {
  const terms = [...words(query)].filter(term => !ignored.has(term));
  const lines = text.split(/\n+/).filter(Boolean);
  const line = lines.slice(2).find(value => terms.some(term => wordScore(term, words(value)))) ?? lines.at(-1) ?? "";
  const match = [...line.matchAll(/[\p{L}\p{N}]+/gu)].find(token => terms.some(term => wordScore(term, words(token[0]))));
  const start = Math.max(0, (match?.index ?? 0) - 50);
  return `${start ? "…" : ""}${line.slice(start, start + 180)}${line.length > start + 180 ? "…" : ""}`;
}

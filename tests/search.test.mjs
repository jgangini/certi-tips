import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { indexSearchEntry, searchContent, corpusSearchEntries, searchExcerpt } from "../assets/site-search.js";

const root = "https://jgangini.github.io/certitips/";
const entry = (title, text = "", terms = title) => indexSearchEntry({ title, text, terms, url: `/certitips/${title.replaceAll(" ", "-")}/` });

test("ranking prioritizes titles, tolerates accents/prefixes/one typo, and keeps all meaningful terms", () => {
  const entries = [entry("Otras herramientas", "Resource Manager"), entry("Resource Manager", "Automatización en Oracle Cloud")];
  assert.equal(searchContent(entries, "Resource Manager")[0].title, "Resource Manager");
  for (const query of ["resource manag", "resorce manager", "resoruce manager", "cómo usar automatizacion"]) assert.equal(searchContent(entries, query)[0]?.title, "Resource Manager", query);
  assert.deepEqual(searchContent(entries, "resource inexistente"), []);
  assert.deepEqual(searchContent(entries, ""), []);
});

test("short acronyms match words rather than unrelated substrings", () => {
  const entries = [entry("Guía de identidad"), entry("AI Foundations")];
  assert.deepEqual(searchContent(entries, "IA").map(item => item.title), ["AI Foundations"]);
  assert.deepEqual(searchContent(entries, "OCI"), []);
});

test("real Markdown content is searchable and returns its section and video timestamp", () => {
  const corpus = JSON.parse(readFileSync(new URL("../dist/assets/certichat/corpus.json", import.meta.url), "utf8"));
  const index = corpusSearchEntries(corpus, root);
  const video = searchContent(index, "precipitaciones").find(item => item.kind === "video");
  assert.equal(video.url, "/certitips/certitube/Ha74VhpQwQo/#t-61");
  const chapter = searchContent(index, "28 publicaciones").find(item => item.kind === "video");
  assert.equal(chapter.url, "/certitips/certitube/Ha74VhpQwQo/#t-243");
  const guide = searchContent(index, "agrupaciones de hardware").find(item => item.url.includes("/1Z0-1085-26/"));
  assert.equal(guide.url, "/certitips/1Z0-1085-26/oci-architecture/#regiones-y-dominios-de-fallo");
  assert.match(searchExcerpt(guide.text, "agrupaciones hardware"), /agrupaciones de hardware/);
});

test("duplicate page hits choose one useful section and unsafe corpus links are rejected", () => {
  const docs = [
    { title: "Video · Wallet", text: "Video\nWallet\nDescarga del wallet", url: `${root}certitube/sSQAGSs23uY/#t-49` },
    { title: "Video · Otra sección", text: "wallet", url: `${root}certitube/sSQAGSs23uY/#otra` },
    { title: "Injected", text: "wallet", url: "https://evil.test/certitips/leak/" },
    { title: "Query", text: "wallet", url: `${root}course/?unsafe=1` },
  ];
  const index = corpusSearchEntries({ schemaVersion: 1, documents: docs }, root);
  assert.equal(index.length, 2);
  assert.deepEqual(searchContent(index, "wallet").map(item => item.url), ["/certitips/certitube/sSQAGSs23uY/#t-49"]);
  assert.throws(() => corpusSearchEntries({ schemaVersion: 2, documents: [] }, root));
});

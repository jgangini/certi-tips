import { siteBase } from "./i18n.js";

const returnKey = `certivoice:${siteBase}:practice-return`;
export function practiceReturnURL(now = Date.now()) {
  try {
    const value = JSON.parse(sessionStorage.getItem(returnKey));
    if (typeof value?.url === "string" && value.url.length <= 1500 && Number.isFinite(value.createdAt) && value.createdAt <= now && now - value.createdAt < 86400000) return value.url;
    sessionStorage.removeItem(returnKey);
  } catch { /* Invalid or unavailable storage does not authorize navigation. */ }
  return null;
}

export function rememberPracticeReturn(url, now = Date.now()) {
  try {
    if (practiceReturnURL(now) === url) return true;
    sessionStorage.setItem(returnKey, JSON.stringify({ url, createdAt: now }));
    return true;
  } catch { return false; }
}

export async function studyResults(query, doc = document) {
  const button = doc.querySelector("[data-search-open]"), input = doc.querySelector("#search-query"), dialog = doc.querySelector("#site-search");
  if (!button || !input || !dialog) return [];
  button.click();
  if (!dialog.open) return [];
  input.value = query; input.dispatchEvent(new Event("input", { bubbles: true }));
  if (dialog.getAttribute("aria-busy") === "true") await new Promise(resolve => {
    const observer = new MutationObserver(() => { if (dialog.getAttribute("aria-busy") !== "true") finish(); });
    const finish = () => { observer.disconnect(); clearTimeout(timer); resolve(); };
    const timer = setTimeout(finish, 8000);
    observer.observe(dialog, { attributes: true, attributeFilter: ["aria-busy"] });
  });
  return dialog.open && dialog.getAttribute("aria-busy") !== "true" ? [...dialog.querySelectorAll('#search-results [data-search-kind="topic"]:not([hidden]) a[href]')] : [];
}

export function highlightPhrase(phrase, doc = document) {
  const prose = doc.querySelector(".prose");
  if (!prose || doc.querySelector("dialog[open]") || typeof phrase !== "string" || !phrase.trim() || phrase.length > 200 || /[\u0000-\u001f]/.test(phrase)) return false;
  for (const mark of prose.querySelectorAll("mark[data-voice-highlight]")) mark.replaceWith(...mark.childNodes);
  const view = doc.defaultView || window;
  view.CSS?.highlights?.delete("certivoice-phrase");
  const walker = doc.createTreeWalker(prose, 4), nodes = [];
  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (parent?.closest('script,style,textarea,[hidden],[aria-hidden="true"],.visually-hidden') || !parent?.getClientRects().length || view.getComputedStyle?.(parent).visibility === "hidden") continue;
    nodes.push({ node, start: nodes.at(-1)?.end || 0, end: (nodes.at(-1)?.end || 0) + node.textContent.length });
  }
  const index = nodes.map(item => item.node.textContent).join("").indexOf(phrase);
  if (index < 0) return false;
  const matching = nodes.filter(item => item.end > index && item.start < index + phrase.length);
  if (!matching.length) return false;
  const first = matching[0], last = matching.at(-1), range = doc.createRange(), scrollTarget = first.node.parentElement;
  range.setStart(first.node, index - first.start); range.setEnd(last.node, index + phrase.length - last.start);
  if (view.CSS?.highlights && view.Highlight) {
    if (!doc.getElementById("certivoice-highlight-style")) {
      const style = doc.createElement("style"); style.id = "certivoice-highlight-style";
      style.textContent = "::highlight(certivoice-phrase){background:#ffd54f;color:#111}"; doc.head.append(style);
    }
    view.CSS.highlights.set("certivoice-phrase", new view.Highlight(range));
  } else {
    // Keep inline markup and its listeners: wrap only each matching text segment.
    for (const item of matching.reverse()) {
      const part = doc.createRange(); part.setStart(item.node, Math.max(0, index - item.start)); part.setEnd(item.node, Math.min(item.node.textContent.length, index + phrase.length - item.start));
      const mark = doc.createElement("mark"); mark.dataset.voiceHighlight = ""; mark.style.backgroundColor = "#ffd54f"; mark.style.color = "#111"; part.surroundContents(mark);
    }
  }
  scrollTarget?.scrollIntoView({ block: "center", behavior: "instant" });
  const heading = [...prose.querySelectorAll(":is(h2,h3)[data-source-id]")].filter(element => element.compareDocumentPosition(first.node) & 4).at(-1);
  if (heading) view.dispatchEvent(new CustomEvent("certichat:activity-result", { detail: { kind: "section", state: "highlighted", targetId: heading.dataset.sourceId } }));
  return true;
}

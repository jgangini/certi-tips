import { siteBase } from "./i18n.js";
import { safeSourceURL } from "./certichat-trace.js";
import { voicePageURL } from "./certivoice-actions.js";

const key = `certichat:${siteBase}:activity`;
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
const sourceId = value => typeof value === "string" && value.length <= 200 && /^[\w.-]+\/[\w.-]+#[\w./-]+$/.test(value);
const signature = value => JSON.stringify({ ...value, at: 0 });

export function validActivityTrail(value, siteRoot) {
  if (!Array.isArray(value) || value.length > 12 || bytes(value) > 8192) return false;
  return value.every((item, index) => {
    if (!item || Object.keys(item).some(name => !["at", "pageUrl", "kind", "state", "targetId", "position"].includes(name))
      || !Number.isSafeInteger(item.at) || item.at < 1 || index && item.at < value[index - 1].at
      || typeof item.pageUrl !== "string" || item.pageUrl.length > 1024 || !safeSourceURL(item.pageUrl, siteRoot)) return false;
    if (item.kind === "page") return item.state === "arrived" && item.targetId === undefined && item.position === undefined;
    if (item.kind === "diagram") return ["image", "presentation", "closed"].includes(item.state) && sourceId(item.targetId) && item.position === undefined;
    if (item.kind === "section") return item.state === "highlighted" && sourceId(item.targetId) && item.position === undefined;
    if (item.kind === "practice_dialog") return ["opened", "cancelled", "accepted"].includes(item.state) && ["finish", "reset", "exit"].includes(item.targetId) && item.position === undefined;
    return item.kind === "practice" && item.targetId === undefined && (["intro", "summary"].includes(item.state) ? item.position === undefined
      : ["question", "feedback"].includes(item.state) && Number.isInteger(item.position) && item.position >= 1 && item.position <= 1000);
  });
}

function save(trail) {
  try { if (trail.length) sessionStorage.setItem(key, JSON.stringify(trail)); else sessionStorage.removeItem(key); } catch { /* Activity is optional when tab storage is blocked. */ }
}

export function activityTrail(now = Date.now()) {
  try {
    const raw = sessionStorage.getItem(key), value = raw?.length <= 8192 ? JSON.parse(raw) : null;
    const siteRoot = document.querySelector("[data-certichat]")?.dataset.siteRoot;
    const trail = validActivityTrail(value, siteRoot) ? value.filter(item => item.at <= now && now - item.at < 86400000) : [];
    if (raw && JSON.stringify(trail) !== raw) save(trail);
    return trail;
  } catch { return []; }
}

function record(value) {
  const entry = { at: Date.now(), ...value }, trail = activityTrail();
  const siteRoot = document.querySelector("[data-certichat]")?.dataset.siteRoot;
  if (!validActivityTrail([entry], siteRoot) || trail.length && signature(trail.at(-1)) === signature(entry)) return;
  trail.push(entry);
  while (trail.length > 12 || bytes(trail) > 8192) trail.shift();
  save(trail);
}

const doc = typeof document === "undefined" ? null : document;
if (doc?.querySelector("[data-certichat]")) {
  let previousDiagram, practiceSignature = "";
  const captureDiagram = () => {
    const viewer = doc.querySelector("#diagram-viewer"), image = viewer?.querySelector(".dialog-content img");
    if (viewer?.open && image?.complete && image.naturalWidth > 0 && sourceId(viewer.dataset.sourceId)) {
      const value = { kind: "diagram", state: viewer.classList.contains("is-presenting") ? "presentation" : "image", pageUrl: voicePageURL(doc), targetId: viewer.dataset.sourceId };
      if (!previousDiagram || signature(previousDiagram) !== signature(value)) record(value);
      previousDiagram = value;
    } else if (!viewer?.open && previousDiagram) { record({ ...previousDiagram, state: "closed" }); previousDiagram = undefined; }
  };
  const capturePractice = () => {
    const quiz = doc.querySelector("#quiz"), dialog = quiz?.querySelector("dialog.confirmation[open]");
    const targetId = dialog && ["finish", "reset", "exit"].find(name => dialog.hasAttribute(`data-${name}-confirm`));
    const state = quiz?.querySelector(".quiz-summary") ? "summary" : quiz?.querySelector(".feedback") ? "feedback" : quiz?.querySelector("#question-form") ? "question" : quiz?.querySelector(".quiz-intro") ? "intro" : null;
    if (!state && !targetId) return;
    const value = targetId ? { kind: "practice_dialog", state: "opened", targetId } : { kind: "practice", state,
      ...(["question", "feedback"].includes(state) ? { position: Number.parseInt(quiz.querySelector(".quiz-question")?.dataset.questionNumber, 10) } : {}) };
    const current = signature(value);
    if (current !== practiceSignature) record({ ...value, pageUrl: voicePageURL(doc) });
    practiceSignature = current;
  };
  const ready = () => {
    const viewer = doc.querySelector("#diagram-viewer"), quiz = doc.querySelector("#quiz");
    if (viewer) {
      new MutationObserver(captureDiagram).observe(viewer, { attributes: true, attributeFilter: ["open", "class", "data-source-id"] });
      viewer.querySelector(".dialog-content img")?.addEventListener("load", captureDiagram);
    }
    if (quiz) new MutationObserver(capturePractice).observe(quiz, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
    record({ kind: "page", state: "arrived", pageUrl: doc.querySelector('link[rel="canonical"]')?.href });
    captureDiagram(); capturePractice();
  };
  // ponytail: observe completed native UI states, not clicks, scrolling, answer text or option selections.
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", ready, { once: true }); else ready();
  window.addEventListener("pageshow", event => { if (event.persisted) record({ kind: "page", state: "arrived", pageUrl: doc.querySelector('link[rel="canonical"]')?.href }); });
  doc.addEventListener("close", event => {
    const dialog = event.target;
    if (!dialog.matches?.("#quiz dialog.confirmation")) return;
    const targetId = ["finish", "reset", "exit"].find(name => dialog.hasAttribute(`data-${name}-confirm`));
    if (targetId) record({ kind: "practice_dialog", state: dialog.returnValue === targetId ? "accepted" : "cancelled", targetId, pageUrl: voicePageURL(doc) });
  }, true);
  window.addEventListener("certichat:activity-result", event => {
    if (event.detail?.kind !== "section" || event.detail.state !== "highlighted") return;
    const heading = [...doc.querySelectorAll(".prose :is(h2,h3)[data-source-id]")].find(element => element.dataset.sourceId === event.detail.targetId);
    if (heading) { captureDiagram(); record({ kind: "section", state: "highlighted", targetId: heading.dataset.sourceId, pageUrl: voicePageURL(doc) }); }
  });
  window.addEventListener("certichat:cleared", () => save([]));
}

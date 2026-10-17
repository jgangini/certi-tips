import { t, canonicalURL, localizedURL, siteBase } from "./i18n.js";
import { practiceTargets, performPracticeAction, guardPracticeNavigation } from "./certivoice-practice.js";
import { studyResults, practiceReturnURL, rememberPracticeReturn, highlightPhrase, explanationHighlights } from "./certivoice-study.js";

function nextPresentationSlide(doc) {
  const slides = [...doc.querySelectorAll('#diagram-viewer[open].is-presenting .diagram-presentation-nav button[data-slide-number][data-source-id]')];
  const current = slides.findIndex(button => button.getAttribute("aria-current") === "true");
  return current < 0 ? undefined : slides[current + 1];
}

function actionTargets(doc) {
  const targets = [], seen = new Set();
  const add = (action, id, label, element) => {
    label = String(label || "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (targets.length >= 64 || !/^[\w][\w.:/#-]{0,199}$/.test(id || "") || !label || seen.has(`${action}:${id}`)) return;
    seen.add(`${action}:${id}`); targets.push({ action, id, label, element });
  };
  for (const target of practiceTargets(doc)) add(target.action, target.id, target.label, target.element);
  const viewer = doc.querySelector("#diagram-viewer[data-source-id]");
  if (viewer) for (const action of ["start_presentation", "open_diagram", "lecture_start"]) add(action, viewer.dataset.sourceId, doc.querySelector("#diagram-caption")?.textContent, viewer);
  const nextSlide = nextPresentationSlide(doc);
  if (nextSlide) add("lecture_start", nextSlide.dataset.sourceId, nextSlide.dataset.voiceLabel, nextSlide);
  if (viewer?.dataset.voiceReturn && !viewer.open) add("return_presentation", viewer.dataset.voiceReturn, doc.querySelector("#diagram-caption")?.textContent, viewer);
  for (const link of doc.querySelectorAll('#site-search [data-search-kind="certification"] a[href]')) {
    const url = validVoiceNavigation(link.href, location.href, siteBase);
    const route = url && new URL(canonicalURL(url.href)).pathname.slice(siteBase.length).match(/^([\w-]+)\/overview\/$/);
    if (route) for (const action of ["open_course", "course_presentation"]) add(action, `course:${route[1]}`, link.querySelector("strong")?.textContent, link);
  }
  for (const section of doc.querySelectorAll("[data-group-carousel] .path-section[id]")) add("catalog_group", `group:${section.id}`, section.querySelector("h2")?.textContent, section);
  const overview = [...doc.querySelectorAll("#course-section-list .nav-link[href]")].find(link => new URL(canonicalURL(link.href)).pathname === `${siteBase}${doc.body?.dataset.courseRoute}/overview/`);
  if (overview) add("course_presentation", `course:${doc.body.dataset.courseRoute}`, doc.querySelector("h1")?.textContent || overview.textContent, overview);
  for (const link of doc.querySelectorAll("#course-section-list .nav-link[href]")) {
    const url = validVoiceNavigation(link.href, location.href, siteBase);
    const route = url && new URL(canonicalURL(url.href)).pathname.slice(siteBase.length).match(/^([\w-]+\/[\w-]+)\/$/);
    if (route) add("open_module", `module:${route[1]}`, link.querySelector(".nav-title")?.textContent || link.textContent, link);
  }
  for (const link of doc.querySelectorAll("[data-language-link]")) {
    const url = validVoiceNavigation(link.href, location.href, siteBase), locale = link.dataset.languageLink;
    if (["es", "en", "pt", "it"].includes(locale) && url && url.pathname.startsWith(`${siteBase}${locale}/`)) add("set_language", `language:${locale}`, link.textContent, link);
  }
  const theme = doc.querySelector("[data-theme-toggle]");
  if (theme) for (const value of ["dark", "light"]) add("set_theme", `theme:${value}`, value, theme);
  const player = doc.querySelector("[data-tube-player]");
  if (player && /^[\w-]{11}$/.test(player.dataset.videoId)) {
    for (const action of player.dataset.voiceConfirm === "true" ? ["video_play", "video_close"] : ["video_close"]) add(action, `video:${player.dataset.videoId}`, doc.querySelector(".tube-heading strong")?.textContent || player.dataset.videoId, player);
    for (const link of [...doc.querySelectorAll("[data-tube-time]")].slice(0, 24)) {
      const seconds = Number(link.dataset.tubeTime);
      if (/^(0|[1-9]\d*)$/.test(link.dataset.tubeTime) && seconds < Number(player.dataset.duration)) add("video_chapter", `chapter:${player.dataset.videoId}:${seconds}`, link.textContent, link);
    }
  }
  for (const heading of [...doc.querySelectorAll(".prose :is(h2,h3)[id]")].slice(0, 16)) add("highlight_section", heading.dataset.sourceId, heading.textContent, heading);
  // ponytail: expose at most 64 real controls; larger galleries need a deliberate page/slide change, not another index.
  for (const button of doc.querySelectorAll("[data-diagram][data-source-id], .diagram-presentation-nav [data-source-id]")) {
    const label = button.dataset.voiceLabel || [button.dataset.diagramHeading, button.querySelector("img")?.alt].filter(Boolean).join(": ");
    for (const action of ["open_diagram", "start_presentation", "lecture_start"]) add(action, button.dataset.sourceId, label, button);
  }
  return targets;
}

export function voicePageURL(doc = document) {
  const image = doc.querySelector("#diagram-viewer[open] .dialog-content img");
  const course = doc.body?.dataset.courseRoute, base = doc.body?.dataset.base;
  const url = course && base && validVoiceNavigation(image?.src, location.href, `${base}${course}/`);
  const page = doc.querySelector('link[rel="canonical"]')?.href;
  const publicRoot = page || doc.querySelector("[data-certichat]")?.dataset.siteRoot;
  const path = url && /^[\w-]+\/img\/[\w.-]+\.svg$/.test(url.pathname.slice(`${base}${course}/`.length))
    ? new URL(canonicalURL(new URL("../", url).href)).pathname : new URL(canonicalURL(page || location.href)).pathname;
  return new URL(path, publicRoot || location.href).href;
}

export function voiceContext(doc = document, completedDiagramId) {
  const visible = [...doc.querySelectorAll("[data-diagram][data-source-id]")].map(item => {
    const box = item.getBoundingClientRect();
    return { item, area: Math.max(0, Math.min(box.right, innerWidth) - Math.max(box.left, 0)) * Math.max(0, Math.min(box.bottom, innerHeight) - Math.max(box.top, 0)) };
  }).filter(item => item.area > 0).sort((a, b) => b.area - a.area);
  const diagram = doc.querySelector("#diagram-viewer[open][data-source-id]") || doc.activeElement?.closest?.("[data-diagram][data-source-id]") || (visible[0]?.area > (visible[1]?.area || 0) ? visible[0].item : null);
  const headings = [...doc.querySelectorAll(".prose :is(h2,h3)[id]")];
  const heading = headings.filter(item => item.getBoundingClientRect().top <= 160).at(-1) || headings[0];
  const targets = actionTargets(doc).map(({ element, ...target }) => target);
  const completed = completedDiagramId && diagram?.dataset.sourceId === completedDiagramId;
  const nextDiagramId = completed && nextPresentationSlide(doc)?.dataset.sourceId;
  return { ...(heading?.dataset.sourceId ? { sectionId: heading.dataset.sourceId } : {}), ...(diagram?.dataset.sourceId ? { diagramId: diagram.dataset.sourceId } : {}),
    ...(completed ? { completedDiagramId } : {}), ...(nextDiagramId && targets.some(target => target.action === "lecture_start" && target.id === nextDiagramId) ? { nextDiagramId } : {}), targets };
}

async function activateDiagram(button) {
  if (!button || button.hidden || button.disabled) return false;
  const detail = {};
  button.dispatchEvent(new CustomEvent("certivoice:activate", { detail }));
  return detail.completion ? Boolean(await detail.completion) : false;
}

async function coursePresentation(link, doc = document, nearest = false) {
  const overview = validVoiceNavigation(link.href, location.href, siteBase);
  if (!overview) return null;
  const prefix = new URL("../", overview).pathname;
  try {
    const response = await fetch(new URL("../gallery.json", overview), { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const items = await response.json();
    if (!Array.isArray(items) || items.length > 1000) return null;
    if (nearest) {
      const modules = [...doc.querySelectorAll("#course-section-list .nav-link[href]")].map(link => new URL(link.href).pathname);
      const current = modules.indexOf(location.pathname);
      // ponytail: use the real course order; at equal distance prefer the following module.
      const distance = item => { try { const index = modules.indexOf(new URL("../", new URL(item?.src, overview)).pathname); return index < 0 || current < 0 ? Infinity : Math.abs(index - current) * 2 + Number(index < current); } catch { return Infinity; } };
      items.sort((a, b) => distance(a) - distance(b));
    }
    for (const item of items) {
      const image = validVoiceNavigation(item?.src, location.href, prefix);
      const relative = image?.pathname.slice(prefix.length).match(/^([\w-]+)\/img\/([\w.-]+\.svg)$/);
      const source = typeof item?.sourceId === "string" && item.sourceId.match(/^([\w-]+)\/([\w-]+)#diagram-([\w.-]+\.svg)$/);
      if (!relative || !source || source[2] !== relative[1] || source[3] !== relative[2] || item.sourceId.length > 200) continue;
      const destination = new URL("../", image); destination.hash = `diagram-${relative[2]}`;
      return { navigation: destination.href, afterNavigation: { name: "start_presentation", targetId: item.sourceId } };
    }
  } catch { /* The published catalog remains usable when its gallery is unavailable. */ }
  return null;
}

export function explanationSource(sources, doc = document) {
  const course = doc.body?.dataset.courseRoute, page = new URL(voicePageURL(doc));
  if (!/^[\w-]+$/.test(course || "") || !Array.isArray(sources)) return;
  const prefix = `${siteBase}${course}/`;
  // Prefer an actual guide citation; SVG citations fall back to their containing section.
  const candidates = sources.slice(0, 8).map(source => {
    try {
      const url = new URL(source.url, page);
      if (url.origin !== page.origin || url.username || url.password || url.search) return;
      url.pathname = new URL(canonicalURL(url.href)).pathname;
      const relative = url.pathname.slice(prefix.length);
      if (!url.pathname.startsWith(prefix) || !/^[\w-]+\/(?:img\/[\w.-]+\.svg)?$/.test(relative) || relative.startsWith("practice/")) return;
      const image = relative.includes("/img/"), svg = image || url.hash.startsWith("#diagram-");
      const target = image ? new URL("../", url) : url;
      if (image) target.hash = `diagram-${relative.split("/").at(-1)}`;
      const local = new URL(localizedURL(target.href)); local.host = location.host; local.protocol = location.protocol;
      return { navigation: local.href, svg };
    } catch { return; }
  }).filter(Boolean).sort((a, b) => Number(a.svg) - Number(b.svg));
  const target = candidates[0];
  if (!target) return;
  return { navigation: target.navigation, reveal(answer) {
    const viewer = doc.querySelector("#diagram-viewer[open]");
    viewer?.dispatchEvent(new CustomEvent("certivoice:visibility", { detail: { name: "suspend" } }));
    const follow = explanationHighlights(answer, doc); follow(0); return follow;
  } };
}

export function validVoiceNavigation(value, current, base) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, current), origin = new URL(current);
    return url.origin === origin.origin && url.pathname.startsWith(base) && !url.username && !url.password && !url.search ? url : null;
  } catch { return null; }
}

export function pendingNavigation(value, current, base, now = Date.now()) {
  const url = validVoiceNavigation(value?.url, current, base), page = validVoiceNavigation(current, current, base);
  const next = value?.afterNavigation;
  const afterNavigation = value?.pending === true && url?.pathname === page?.pathname && (next?.name === "catalog_menu" && !next.targetId || next?.name === "start_presentation" && /^[\w][\w.:/#-]{0,199}$/.test(next.targetId || ""))
    ? { name: next.name, ...(next.name === "start_presentation" ? { targetId: next.targetId } : {}) } : undefined;
  return url && page && Number.isFinite(value?.createdAt) && value.createdAt <= now && now - value.createdAt < 86400000 && (value.session === true || url.pathname === page.pathname)
    ? { url: url.href, createdAt: value.createdAt, ...(value.session === true ? { session: true } : {}), ...(value.pending === true ? { pending: true } : {}), ...(afterNavigation ? { afterNavigation } : {}) } : null;
}

export function shouldResumeNavigation(value, current, base, now = Date.now()) {
  const pending = pendingNavigation(value, current, base, now);
  return Boolean(pending?.session && pending.pending && value.autoResume === true && Number.isFinite(value.resumeAt)
    && value.resumeAt >= pending.createdAt && value.resumeAt <= now && now - value.resumeAt <= 30000
    && pending.url === new URL(current).href);
}

export async function performVoiceAction(action, doc = document) {
  if (!action) return {};
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (["stop", "continue"].includes(action.name)) return { control: action.name };
  if (action.name === "return_practice") {
    const url = validVoiceNavigation(practiceReturnURL(), location.href, siteBase);
    return url && /^[\w-]+\/practice\/$/.test(new URL(canonicalURL(url.href)).pathname.slice(siteBase.length)) ? { navigation: url.href } : { error: t("No hay una práctica guardada a la que volver.") };
  }
  if (["study_concept", "highlight_phrase"].includes(action.name)) {
    if (typeof action.text !== "string" || !action.text.trim() || action.text.length > 200 || /[\u0000-\u001f]/.test(action.text)) return { error: t("No hay un destino disponible para esa acción.") };
    if (action.name === "highlight_phrase") {
      doc.querySelector("#diagram-viewer[open]")?.dispatchEvent(new CustomEvent("certivoice:visibility", { detail: { name: "suspend" } }));
      return highlightPhrase(action.text, doc) ? { confirmation: action.text } : { error: t("No encontré esa frase exacta en el contenido visible.") };
    }
    const course = doc.body?.dataset.courseRoute;
    if (!/^[\w-]+$/.test(course || "")) return { error: t("No hay un destino disponible para esa acción.") };
    const prefix = `${siteBase}${course}/`;
    const link = (await studyResults(action.text, doc)).find(item => {
      const url = validVoiceNavigation(item.href, location.href, siteBase);
      const path = url && new URL(canonicalURL(url.href)).pathname;
      return path?.startsWith(prefix) && /^[\w-]+\/$/.test(path.slice(prefix.length)) && !path.endsWith("/practice/");
    });
    const url = validVoiceNavigation(link?.href, location.href, siteBase);
    if (!url) return { error: t("No encontré contenido de este curso para esa consulta.") };
    const current = validVoiceNavigation(location.href, location.href, siteBase);
    const practice = current && new URL(canonicalURL(current.href)).pathname === `${prefix}practice/`;
    if (practice && !rememberPracticeReturn(current.href)) return { error: t("No se pudo guardar el retorno a la práctica.") };
    return { navigation: url.href, confirmation: practice ? t("Pausaré la práctica para consultar este contenido. Tu intento se conserva y puedes volver después.") : link.textContent.trim() };
  }
  if (action.name?.startsWith("practice_")) return performPracticeAction(action, doc);
  if (action.name === "practice") {
    const link = [...doc.querySelectorAll("#course-section-list .nav-link[href]")].find(item => {
      const url = validVoiceNavigation(item.href, location.href, siteBase);
      return url && new URL(canonicalURL(url.href)).pathname === `${siteBase}${doc.body?.dataset.courseRoute}/practice/`;
    });
    const url = validVoiceNavigation(link?.href, location.href, siteBase);
    return !url ? { error: t("No hay un destino disponible para esa acción.") } : url.pathname === location.pathname ? { confirmation: link.textContent.trim() } : guardPracticeNavigation(action, link.textContent.trim(), doc) || { navigation: url.href };
  }
  if (action.name === "catalog_menu") {
    const menu = doc.querySelector(".path-nav-mobile"), nav = doc.querySelector(".course-groups .path-nav");
    if (!menu && !nav) {
      const destination = await performVoiceAction({ name: "catalog" }, doc);
      return destination.navigation ? { ...destination, afterNavigation: { name: "catalog_menu" } } : destination;
    }
    if (menu?.getBoundingClientRect().width) { if (!menu.open) menu.querySelector("summary")?.click(); }
    else { nav?.scrollIntoView({ block: "nearest" }); nav?.querySelector("summary")?.focus(); }
    return { confirmation: t("Grupos de cursos") };
  }
  if (["home", "catalog", "videos", "quiz", "chat", "next_page", "previous_page"].includes(action.name)) {
    const path = { home: siteBase, catalog: `${siteBase}courses/`, videos: `${siteBase}certitube/`, quiz: `${siteBase}certiquiz/`, chat: `${siteBase}certichat/` }[action.name];
    const current = validVoiceNavigation(location.href, location.href, siteBase);
    if (path && current && new URL(canonicalURL(current.href)).pathname === path) return { confirmation: t("Página abierta: {title}", { title: doc.querySelector("h1")?.textContent || doc.title }) };
    const link = path ? [...doc.querySelectorAll(action.name === "home" ? ".site-header a.brand[href]" : ".header-app-link[href]")].find(item => {
      const target = validVoiceNavigation(item.href, location.href, siteBase);
      return target && new URL(canonicalURL(target.href)).pathname === path;
    })
      : doc.querySelector(`[data-voice-page="${action.name === "next_page" ? "next" : "previous"}"]`);
    const url = validVoiceNavigation(link?.href, location.href, siteBase);
    if (!url || url.pathname === location.pathname) return { error: t("No hay un destino disponible para esa acción.") };
    return guardPracticeNavigation(action, link.textContent?.trim() || link.getAttribute?.("aria-label") || action.name, doc) || { navigation: url.href };
  }
  if (["next_section", "previous_section"].includes(action.name)) {
    const headings = [...doc.querySelectorAll(".prose :is(h2,h3)[id]")], current = voiceContext(doc).sectionId;
    const target = headings[headings.findIndex(item => item.dataset.sourceId === current) + (action.name === "next_section" ? 1 : -1)];
    if (!target) return { error: t("No hay otra sección en esta página.") };
    target.scrollIntoView({ behavior: reduced ? "instant" : "smooth", block: "start" });
    history.replaceState(history.state, "", `#${encodeURIComponent(target.id)}`);
    return { confirmation: target.textContent.trim() };
  }
  if (action.name === "search") {
    if (typeof action.text !== "string" || action.text.length > 200 || /[\u0000-\u001f]/.test(action.text)) return { error: t("No hay un destino disponible para esa acción.") };
    const button = doc.querySelector("[data-search-open]"), input = doc.querySelector("#search-query"), dialog = doc.querySelector("#site-search");
    if (!button || !input || !dialog) return { error: t("No hay un destino disponible para esa acción.") };
    button.click();
    if (!dialog.open) return { error: t("No hay un destino disponible para esa acción.") };
    input.value = action.text; input.dispatchEvent(new Event("input", { bubbles: true }));
    return { confirmation: action.text || button.getAttribute("aria-label") };
  }
  if (action.name === "start_presentation" && !action.targetId) {
    const first = doc.querySelector("[data-diagram][data-source-id]");
    const current = doc.querySelector("#diagram-viewer[open][data-source-id]");
    const targetId = current?.dataset.sourceId || first?.dataset.sourceId;
    if (targetId) return performVoiceAction({ ...action, targetId }, doc);
    const overview = [...doc.querySelectorAll("#course-section-list .nav-link[href]")].find(link => new URL(canonicalURL(link.href)).pathname === `${siteBase}${doc.body?.dataset.courseRoute}/overview/`);
    return overview && await coursePresentation(overview, doc, true) || { error: t("Este módulo no contiene imágenes para presentar. Puedes elegir otro módulo.") };
  }
  const target = ["open_course", "open_module", "course_presentation", "catalog_group", "set_language", "set_theme", "highlight_section", "video_chapter", "video_play", "video_close", "open_diagram", "start_presentation", "lecture_start", "return_presentation"].includes(action.name)
    ? actionTargets(doc).find(item => item.action === action.name && item.id === action.targetId) : undefined;
  if (action.name === "catalog_group") {
    if (!target) return { error: t("No hay un destino disponible para esa acción.") };
    await performVoiceAction({ name: "catalog_menu" }, doc);
    const index = [...doc.querySelectorAll("[data-group-carousel] .path-section[id]")].indexOf(target.element);
    const mobile = doc.querySelector(".path-nav-mobile"), nav = mobile?.getBoundingClientRect().width ? mobile : doc.querySelector(".course-groups .path-nav");
    const group = nav?.querySelectorAll(".path-group")[index];
    if (group && !group.open) group.querySelector("summary")?.click();
    location.hash = encodeURIComponent(target.element.id);
    return { confirmation: target.label };
  }
  if (["open_course", "open_module", "course_presentation", "set_language"].includes(action.name)) {
    if (!target) return { error: t("No hay un destino disponible para esa acción.") };
    if (action.name === "course_presentation") {
      const destination = await coursePresentation(target.element, doc);
      return destination ? guardPracticeNavigation(action, target.label, doc) || destination : { error: t("No se pudo abrir ese diagrama.") };
    }
    const url = validVoiceNavigation(target.element.href, location.href, siteBase);
    if (!url) return { error: t("No hay un destino disponible para esa acción.") };
    if (url.pathname === location.pathname) return { confirmation: target.label };
    return guardPracticeNavigation(action, target.label, doc) || { navigation: url.href, ...(action.name === "set_language" ? { activate: () => target.element.click() } : {}) };
  }
  if (action.name === "set_theme") {
    if (!target) return { error: t("No hay un destino disponible para esa acción.") };
    if (doc.documentElement.dataset.theme !== target.id.slice(6)) target.element.click();
    return { confirmation: target.label };
  }
  if (action.name === "highlight_section") {
    if (!target) return { error: t("No hay otra sección en esta página.") };
    const viewer = doc.querySelector("#diagram-viewer");
    if (viewer?.open) viewer.dispatchEvent(new CustomEvent("certivoice:visibility", { detail: { name: "suspend" } }));
    target.element.scrollIntoView({ behavior: reduced ? "instant" : "smooth", block: "start" });
    history.replaceState(history.state, "", `#${encodeURIComponent(target.element.id)}`);
    const highlighted = target.element.animate?.([{ backgroundColor: "rgba(255, 213, 79, .65)" }, { backgroundColor: "rgba(255, 213, 79, .65)" }], { duration: 3000 });
    if (highlighted) doc.defaultView?.dispatchEvent(new CustomEvent("certichat:activity-result", { detail: { kind: "section", state: "highlighted", targetId: target.id } }));
    return { confirmation: target.label };
  }
  if (["video_chapter", "video_play", "video_close"].includes(action.name)) {
    if (!target) return { error: t("No hay un destino disponible para esa acción.") };
    const player = doc.querySelector("[data-tube-player]"), videoId = player.dataset.videoId;
    if (action.name !== "video_chapter") return { video: { name: action.name === "video_play" ? "play" : "close", videoId } };
    const seconds = Number(target.element.dataset.tubeTime), detail = { name: "chapter", seconds, accepted: false };
    player.dispatchEvent(new CustomEvent("certitube:command", { detail }));
    return detail.accepted ? { video: { name: "chapter", videoId, seconds }, confirmation: target.label } : { error: t("No hay un destino disponible para esa acción.") };
  }
  const viewer = doc.querySelector("#diagram-viewer");
  if (action.name === "return_presentation") {
    if (!target) return { error: t("No hay un diagrama abierto.") };
    const detail = { name: "resume", targetId: target.id };
    viewer.dispatchEvent(new CustomEvent("certivoice:visibility", { detail }));
    return await detail.completion ? { confirmation: target.label } : { error: t("No se pudo abrir ese diagrama.") };
  }
  if (["open_diagram", "start_presentation", "lecture_start"].includes(action.name)) {
    if (!target || !viewer) return { error: t("No se pudo abrir ese diagrama.") };
    if (viewer.open && viewer.dataset.sourceId !== target.id) {
      const slide = [...viewer.querySelectorAll("[data-slide-number][data-source-id]")].find(item => item.dataset.sourceId === target.id);
      if (!viewer.classList.contains("is-presenting") || !await activateDiagram(slide)) return { error: t("No se pudo abrir ese diagrama.") };
    } else if (!viewer.open) {
      const button = [...doc.querySelectorAll("[data-diagram][data-source-id]")].find(item => item.dataset.sourceId === target.id);
      if (!button) return { error: t("No se pudo abrir ese diagrama.") };
      button.click();
    }
    if (!viewer.open) return { error: t("No se pudo abrir ese diagrama.") };
    if (action.name !== "open_diagram" && !viewer.classList.contains("is-presenting") && !await activateDiagram(viewer.querySelector("[data-diagram-present]"))) return { error: t("No se pudo abrir ese diagrama.") };
    return { confirmation: doc.querySelector("#diagram-caption")?.textContent || target.label, ...(action.name === "lecture_start" ? { control: "lecture_start" } : {}) };
  }
  if (["next_slide", "previous_slide", "exit_presentation"].includes(action.name)) {
    if (!viewer?.open || !viewer.classList.contains("is-presenting")) return { error: t("No hay un diagrama abierto.") };
    if (action.name === "exit_presentation") {
      await activateDiagram(viewer.querySelector("[data-diagram-present]"));
      return !viewer.classList.contains("is-presenting") ? { confirmation: t("Salir del modo presentación") } : { error: t("No se pudo cerrar el diagrama.") };
    }
    const slides = [...viewer.querySelectorAll("[data-slide-number]")], current = slides.findIndex(item => item.getAttribute("aria-current") === "true");
    const next = slides[(current + (action.name === "next_slide" ? 1 : -1) + slides.length) % slides.length];
    return current >= 0 && await activateDiagram(next) ? { confirmation: doc.querySelector("#diagram-caption")?.textContent || t("Diagrama abierto.") } : { error: t("No se pudo abrir ese diagrama.") };
  }
  if (action.name === "close_diagram") {
    if (!viewer?.open) return { error: t("No hay un diagrama abierto.") };
    if (viewer.classList.contains("is-presenting")) viewer.querySelector("[data-close-diagram]")?.click();
    viewer.querySelector("[data-close-diagram]")?.click();
    if (viewer.open) await new Promise(resolve => { const timer = setTimeout(resolve, 700); viewer.addEventListener("close", () => { clearTimeout(timer); resolve(); }, { once: true }); });
    return viewer.open ? { error: t("No se pudo cerrar el diagrama.") } : { confirmation: t("Diagrama cerrado.") };
  }
  return { error: t("Acción desconocida.") };
}

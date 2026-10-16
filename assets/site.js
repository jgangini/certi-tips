import { t, locale, localizedURL, siteBase } from "./i18n.js";
import { readStored, writeStored } from "./storage.js";
import { indexSearchEntry, searchContent, corpusSearchEntries, searchExcerpt } from "./site-search.js";

// Explicit locale paths take priority; legacy entry links can recall the last choice.
if (!/^(?:es|en|pt|it)\//.test(location.pathname.slice(siteBase.length))) {
  try {
    const preferred = localStorage.getItem('certitips:locale');
    if (['es', 'en', 'pt', 'it'].includes(preferred)) location.replace(localizedURL(location.href, preferred));
  } catch { /* URLs remain usable without storage. */ }
}

const languageMenu = document.querySelector('.language-menu');
const languageTransition = document.getElementById('language-transition');
let languageTransitionTimer;
languageTransition?.addEventListener('cancel', event => event.preventDefault());
function showLanguageTransition(value) {
  const target = new URL(value, location.href);
  if (!languageTransition || target.origin !== location.origin || !target.pathname.startsWith(siteBase) || !/\/$|\.html$/.test(target.pathname) || target.pathname === location.pathname && target.search === location.search) return false;
  clearTimeout(languageTransitionTimer);
  if (!languageTransition.open) languageTransition.showModal();
  try { sessionStorage.setItem('certitips:language-transition', target.href); } catch { /* Navigation works without storage. */ }
  languageTransitionTimer = setTimeout(clearLanguageTransition, 8000);
  return true;
}
function clearLanguageTransition() {
  clearTimeout(languageTransitionTimer);
  languageTransition?.close();
  try { sessionStorage.removeItem('certitips:language-transition'); } catch { /* Navigation works without storage. */ }
}
if (languageTransition?.open) {
  const ready = () => {
    if (document.readyState === 'loading' || document.querySelector('main [aria-busy="true"]')) return;
    observer.disconnect();
    // ponytail: navigation timing includes loading; only pad fast transitions.
    languageTransitionTimer = setTimeout(clearLanguageTransition, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : Math.max(0, 700 - performance.now()));
  };
  const observer = new MutationObserver(ready);
  observer.observe(document.querySelector('main'), { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-busy'] });
  document.addEventListener('DOMContentLoaded', ready, { once: true });
  ready();
}
addEventListener('pageshow', event => { if (event.persisted) clearLanguageTransition(); });
function updateLanguageLink(link) {
  const target = new URL(link.href);
  if (document.body.dataset.page === '404') target.pathname = new URL(localizedURL(location.href, link.dataset.languageLink)).pathname;
  target.search = location.search;
  target.hash = location.hash;
  link.href = target.href;
}
for (const link of document.querySelectorAll('[data-language-link]')) {
  updateLanguageLink(link);
  link.addEventListener('click', event => {
    updateLanguageLink(link);
    try { localStorage.setItem('certitips:locale', link.dataset.languageLink); } catch { /* Navigation works without storage. */ }
  });
}
// The same glass covers normal links and native programmatic navigation; no client router.
window.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const link = event.composedPath().find(node => node.matches?.('a[href]'));
  if (!link || link.hasAttribute('download') || link.target && link.target.toLowerCase() !== '_self' || !showLanguageTransition(link.href)) return;
  event.preventDefault();
  if (languageMenu) languageMenu.open = false;
  requestAnimationFrame(() => requestAnimationFrame(() => location.assign(link.href)));
});
window.navigation?.addEventListener('navigate', event => {
  if (event.defaultPrevented || event.destination.sameDocument || event.hashChange || event.downloadRequest !== null || event.formData || !showLanguageTransition(event.destination.url)) return;
  event.signal.addEventListener('abort', clearLanguageTransition, { once: true });
});
languageMenu?.addEventListener('toggle', () => {
  if (languageMenu.open) {
    for (const link of languageMenu.querySelectorAll('[data-language-link]')) updateLanguageLink(link);
    for (const group of document.querySelectorAll(".path-group")) group.open = false;
  }
});
document.addEventListener('click', event => { if (languageMenu?.open && !languageMenu.contains(event.target)) languageMenu.open = false; });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && languageMenu?.open) { languageMenu.open = false; languageMenu.querySelector('summary').focus(); } });


let resizeTimer;
addEventListener("resize", () => {
  document.documentElement.classList.add("is-resizing");
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => document.documentElement.classList.remove("is-resizing"), 120);
});

const footer = document.querySelector(".site-footer");
const footerCredit = footer?.querySelector(".footer-credit");
// Measure one line before hiding the credit; its visibility cannot resize the footer.
if (footer) new ResizeObserver(() => {
  if (footerCredit) {
    footerCredit.hidden = false;
    footerCredit.hidden = footerCredit.parentElement.scrollWidth > footerCredit.parentElement.clientWidth;
  }
  document.documentElement.style.setProperty("--footer-height", `${footer.getBoundingClientRect().height}px`);
}).observe(footer, { box: "border-box" });

const courseGroups = document.querySelector(".course-groups");
if (courseGroups) new ResizeObserver(() => {
  courseGroups.classList.toggle("is-compact-groups", courseGroups.getBoundingClientRect().width <= 800);
  document.documentElement.style.setProperty("--course-groups-height", `${courseGroups.getBoundingClientRect().height + 44}px`);
}).observe(courseGroups, { box: "border-box" });

const course = document.body.dataset.course;
const heroFlow = document.querySelector("[data-hero-flow]");
const syncHeroFlowTheme = () => {
  const source = heroFlow?.querySelector("source");
  const src = document.documentElement.dataset.theme === "dark" ? heroFlow?.dataset.darkSrc : heroFlow?.dataset.lightSrc;
  if (!source || !src || source.getAttribute("src") === src) return;
  source.setAttribute("src", src);
  heroFlow.load();
};
if (heroFlow) {
  syncHeroFlowTheme();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  if (reducedMotion.matches) heroFlow.removeAttribute("autoplay");
  heroFlow.addEventListener("loadedmetadata", () => {
    if (reducedMotion.matches) heroFlow.currentTime = Math.max(0, heroFlow.duration - 0.1);
  });
  heroFlow.addEventListener("error", () => heroFlow.closest(".hero-flow").classList.add("is-unavailable"));
  heroFlow.querySelector("source")?.addEventListener("error", () => heroFlow.closest(".hero-flow").classList.add("is-unavailable"));
}
const key = `certitips:progress:v1:${course}`;
const stored = readStored(key, []);
const completed = new Set(
  Array.isArray(stored)
    ? stored.filter((value) => typeof value === "string")
    : [],
);
const lessonSlugs = [...document.querySelectorAll('[data-completion]')].map(link => link.dataset.completion);

function showProgress() {
  const count = lessonSlugs.filter((slug) => completed.has(slug)).length;
  document.querySelectorAll("[data-progress-label]").forEach((label) => {
    label.textContent = t('{count} de {total}', { count, total: lessonSlugs.length });
  });
  document.querySelectorAll("[data-progress]").forEach((bar) => {
    bar.value = count;
  });
  document.querySelectorAll("[data-completion]").forEach((link) => {
    const done = completed.has(link.dataset.completion);
    link.classList.toggle("is-complete", done);
    link.setAttribute("aria-description", done ? t("Módulo completado") : t("Módulo pendiente"));
  });
  document.querySelectorAll("[data-mark-complete]").forEach((button) => {
    const done = completed.has(button.dataset.markComplete);
    button.setAttribute("aria-checked", String(done));
    button.querySelector("[data-completion-label]").textContent = done ? t("Completado") : t("Sin Completar");
  });
}

document
  .querySelector("[data-mark-complete]")
  ?.addEventListener("click", (event) => {
    const slug = event.currentTarget.dataset.markComplete;
    if (completed.has(slug)) completed.delete(slug);
    else completed.add(slug);
    writeStored(key, [...completed]);
    showProgress();
  });
showProgress();

const toggle = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".sidebar");
const menuName = navigation?.dataset.menuName || t("del curso");
const courseNavMedia = matchMedia("(max-width: 800px)");
function syncCourseMenu() {
  if (!toggle || !navigation) return;
  const mobile = courseNavMedia.matches;
  const compact = document.body.classList.contains("is-compact-nav");
  toggle.setAttribute("aria-expanded", String(mobile ? navigation.classList.contains("is-open") : !compact));
  toggle.setAttribute("aria-label", mobile ? t('Contenido {name}', {name: menuName}) : compact ? t('Expandir menú {name}', {name: menuName}) : t('Contraer menú {name}', {name: menuName}));
  toggle.title = (mobile ? navigation.classList.contains("is-open") : !compact) ? "Ocultar contenido del curso" : "Mostrar contenido del curso";
}
if (toggle && navigation) {
  syncCourseMenu();
  courseNavMedia.addEventListener("change", () => { navigation.classList.remove("is-open"); syncCourseMenu(); });
  const main = document.querySelector(".course-main"), chat = document.querySelector("#certichat-panel");
  if (main && chat) {
    const observer = new ResizeObserver(() => requestAnimationFrame(() => {
      if (!courseNavMedia.matches && !chat.hidden && !document.body.classList.contains("is-compact-nav") && main.getBoundingClientRect().width < chat.offsetWidth) setDesktopCourseMenu(true);
    }));
    observer.observe(main);
    observer.observe(chat);
  }
}
const pathMenu = document.querySelector(".path-nav-mobile");
const themeToggle = document.querySelector("[data-theme-toggle]");
function syncTheme() {
  const dark = document.documentElement.dataset.theme === "dark";
  themeToggle?.setAttribute("aria-pressed", String(dark));
  themeToggle?.setAttribute("aria-label", dark ? t("Activar modo claro") : t("Activar modo oscuro"));
  syncHeroFlowTheme();
}
themeToggle?.addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  if (dark) document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem("certitips:theme", dark ? "dark" : "light"); } catch { /* Session still works if storage is blocked. */ }
  syncTheme();
});
syncTheme();

const searchDialog = document.querySelector("#site-search");
const searchButton = document.querySelector("[data-search-open]");
const searchInput = searchDialog?.querySelector("#search-query");
const searchEntries = [...(searchDialog?.querySelectorAll("[data-search-term]") || [])];
const searchCount = searchDialog?.querySelector("[data-search-count]");
const searchEmpty = searchDialog?.querySelector("[data-search-empty]");
const searchClose = searchDialog?.querySelector("[data-search-close]");
const searchList = searchDialog?.querySelector("#search-results");
const catalogSearch = searchEntries.map(row => indexSearchEntry({
  title: row.querySelector("strong").textContent, terms: row.dataset.searchTerm, text: row.querySelector(".search-result-description").textContent,
  kind: row.dataset.searchKind, url: row.querySelector("a").getAttribute("href"), detail: row.querySelector("small").textContent, row,
}));
const searchIcons = new Map(searchEntries.map(row => [row.dataset.searchKind, row.querySelector(".search-result-icon")]));
searchIcons.set("video", searchDialog.querySelector("#search-video-icon").content.firstElementChild);
let contentSearch = [], searchLoading, searchError = false;

function contentResult(entry, query) {
  const row = searchEntries[0].cloneNode(true), link = row.querySelector("a");
  row.hidden = false; row.dataset.searchKind = entry.kind;
  link.href = entry.url; link.removeAttribute("target"); link.removeAttribute("rel");
  row.querySelector("strong").textContent = entry.title;
  row.querySelector("small").textContent = entry.kind === "video" ? t("Video · CertiTube") : t("Contenido de la guía");
  row.querySelector(".search-result-description").textContent = searchExcerpt(entry.text, query);
  row.querySelector(".search-result-icon").replaceWith(searchIcons.get(entry.kind).cloneNode(true));
  return row;
}

function updateSearch() {
  const query = searchInput.value.trim(), searching = query.length > 0;
  const focusedLink = searchDialog.querySelector("a:focus")?.getAttribute("href");
  const results = searching ? searchContent([...catalogSearch, ...contentSearch], query) : catalogSearch.filter(entry => entry.kind !== "topic");
  const rows = results.map(entry => {
    if (!entry.row) return contentResult(entry, query);
    entry.row.hidden = false; return entry.row;
  });
  searchList.replaceChildren(...rows, searchEmpty);
  if (focusedLink) ([...searchList.querySelectorAll("a")].find(link => link.getAttribute("href") === focusedLink) ?? searchInput).focus();
  const total = rows.length;
  searchDialog.classList.toggle("has-query", searching);
  searchEmpty.hidden = total !== 0;
  searchClose.setAttribute("aria-label", searchInput.value ? t("Limpiar búsqueda") : t("Cerrar búsqueda"));
  searchCount.textContent = !searching ? t('{total} cursos y videos disponibles.', {total})
    : total ? t(total === 1 ? '{total} resultado.' : '{total} resultados.', {total})
    : t("No se encontraron resultados. Prueba con otro término.");
  if (searchError) searchCount.textContent += t(" No se pudieron cargar las secciones. Vuelve a abrir el buscador para reintentar; puedes buscar por título y tema.");
  searchCount.classList.toggle("visually-hidden", !searchError);
}

async function loadSearchContent() {
  if (searchLoading) return;
  searchError = false; searchDialog.setAttribute("aria-busy", "true");
  searchLoading = fetch(`${document.body.dataset.base}assets/certichat/search.json`, { cache: "no-store" });
  try {
    const response = await searchLoading;
    if (!response.ok) throw new Error("Search content unavailable");
    const siteRoot = new URL(document.body.dataset.base, document.querySelector('link[rel="canonical"]').href).href;
    contentSearch = corpusSearchEntries(await response.json(), siteRoot);
  } catch { searchError = true; searchLoading = undefined; }
  finally { searchDialog.setAttribute("aria-busy", "false"); updateSearch(); }
}
function openSearch() {
  if (!searchDialog.open) {
    searchInput.value = "";
    searchDialog.showModal();
  }
  updateSearch();
  searchInput.focus();
  loadSearchContent();
}
searchButton?.addEventListener("click", openSearch);
searchClose?.addEventListener("click", () => {
  if (!searchInput.value) return searchDialog.close();
  searchInput.value = "";
  updateSearch();
  searchInput.focus();
});
searchDialog?.addEventListener("close", () => {
  if (searchDialog.open) return;
  searchInput.value = "";
  updateSearch();
  searchButton.focus();
});
searchDialog?.addEventListener("click", (event) => { if (event.target === searchDialog) searchDialog.close(); });
searchDialog?.addEventListener("click", (event) => { if (event.target.closest(".search-results a")) searchDialog.close(); });
searchDialog?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { event.preventDefault(); searchDialog.close(); }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const current = event.target.closest(".search-results a");
  if (!current) return;
  const links = [...searchDialog.querySelectorAll(".search-results li:not([hidden]) a")];
  const next = links[links.indexOf(current) + (event.key === "ArrowDown" ? 1 : -1)];
  if (next || event.key === "ArrowUp") {
    event.preventDefault();
    (next || searchInput).focus();
  }
});
searchInput?.addEventListener("input", updateSearch);
searchInput?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    const first = searchDialog.querySelector(".search-results li:not([hidden]) a");
    if (first) { event.preventDefault(); first.focus(); }
  }
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openSearch();
  }
});

const pathGroups = [...document.querySelectorAll(".path-group")];
for (const group of pathGroups) group.addEventListener("toggle", () => {
  if (group.open) for (const other of pathGroups) if (other !== group && other.parentElement === group.parentElement) other.open = false;
});
pathMenu?.addEventListener("click", (event) => {
  if (event.target.closest("a")) pathMenu.open = false;
});
function setDesktopCourseMenu(compact) {
  if (!navigation) return;
  if (compact && navigation.contains(document.activeElement)) toggle?.focus({ preventScroll: true });
  document.body.classList.toggle("is-compact-nav", compact);
  try { sessionStorage.setItem("certitips:course-nav:compact", String(compact)); } catch { /* Keep the current page usable without storage. */ }
  syncCourseMenu();
}
function closeMenu() {
  navigation?.classList.remove("is-open");
  syncCourseMenu();
}
toggle?.addEventListener("click", () => {
  if (courseNavMedia.matches) navigation.classList.toggle("is-open");
  else setDesktopCourseMenu(!document.body.classList.contains("is-compact-nav"));
  syncCourseMenu();
});
navigation?.addEventListener("click", (event) => {
  if (event.target.closest("a") && navigation.classList.contains("is-open")) {
    closeMenu();
    document.querySelector("#main").focus({ preventScroll: true });
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") for (const group of pathGroups) if (group.open) {
    group.open = false;
    group.querySelector("summary").focus();
  }
  if (event.key === "Escape" && pathMenu?.open) {
    pathMenu.open = false;
    pathMenu.querySelector("summary").focus();
  }
  if (event.key === "Escape" && navigation?.classList.contains("is-open")) {
    closeMenu();
    toggle.focus();
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".path-nav, .path-nav-mobile")) {
    for (const group of pathGroups) group.open = false;
    if (pathMenu) pathMenu.open = false;
  }
  if (!navigation?.contains(event.target) && !toggle?.contains(event.target))
    closeMenu();
});

const groupCarousel = document.querySelector("[data-group-carousel]");
if (groupCarousel) {
  const groups = [...groupCarousel.querySelectorAll(":scope > .path-section")];
  const controls = groupCarousel.querySelector(".group-carousel-controls");
  const previous = document.querySelector("[data-group-prev]");
  const next = document.querySelector("[data-group-next]");
  const status = document.querySelector("[data-group-status]");
  let index = 0;
  const activate = (target, scroll = false) => {
    index = Math.max(0, Math.min(groups.length - 1, target));
    const focusedControl = controls.contains(document.activeElement) ? document.activeElement : null;
    groups[index].querySelector(".path-section-heading").prepend(controls);
    groups.forEach((group, position) => group.classList.toggle("is-active", position === index));
    previous.disabled = index === 0;
    next.disabled = index === groups.length - 1;
    (focusedControl?.disabled ? (focusedControl === next ? previous : next) : focusedControl)?.focus({ preventScroll: true });
    status.textContent = t('{name} · {current} de {total}', {name: groups[index].querySelector('h2').textContent, current: index + 1, total: groups.length});
    if (scroll) groups[index].scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  const move = (step) => {
    activate(index + step, true);
    history.replaceState(null, "", `#${groups[index].id}`);
  };
  previous.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  const fromHash = () => {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    const group = target?.closest(".path-section");
    if (!group) return;
    activate(groups.indexOf(group));
    requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
  };
  window.addEventListener("hashchange", fromHash);
  fromHash();
  let touchStart;
  groupCarousel.addEventListener("touchstart", (event) => {
    touchStart = { x: event.changedTouches[0].screenX, y: event.changedTouches[0].screenY };
  }, { passive: true });
  groupCarousel.addEventListener("touchend", (event) => {
    if (!touchStart) return;
    const dx = event.changedTouches[0].screenX - touchStart.x;
    const dy = event.changedTouches[0].screenY - touchStart.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      event.preventDefault();
      move(dx < 0 ? 1 : -1);
    }
    touchStart = undefined;
  }, { passive: false });
}

const dialog = document.querySelector("#diagram-viewer");
let opener;
let viewerAnimation;
const reduceViewerMotion = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
const present = dialog.querySelector("[data-diagram-present]");
const filmstrip = dialog.querySelector(".diagram-presentation-nav");
const menu = dialog.querySelector("[data-diagram-menu]");
const slideCount = dialog.querySelector(".diagram-slide-count");
let galleryPromise, gallery = [], slideIndex = 0, slideToken = 0, countTimer;
const moduleLinkForImage = src => [...document.querySelectorAll(".sidebar .nav-link")].find(link => new URL(src, location.href).pathname.startsWith(`${link.pathname}img/`));
const moduleCaptionForImage = (src, fallback) => {
  const link = moduleLinkForImage(src);
  return link ? `${link.querySelector(".nav-number").textContent.trim()} ${link.querySelector(".nav-title").textContent.trim()}` : fallback;
};
const diagramIdForImage = src => `diagram-${new URL(src, location.href).pathname.split("/").pop()}`;
function setPresentationMenu(open) {
  filmstrip.classList.toggle("is-open", open);
  filmstrip.inert = !open;
  menu.setAttribute("aria-expanded", String(open));
  menu.setAttribute("aria-label", open ? t("Ocultar imágenes") : t("Mostrar imágenes"));
  if (dialog.classList.contains("is-presenting")) dialog.querySelector(".dialog-content").setAttribute("aria-label", open ? t("Diagrama en presentación; haz clic para ocultar imágenes") : t("Diagrama en presentación; haz clic para avanzar"));
}
menu.addEventListener("click", () => setPresentationMenu(!filmstrip.classList.contains("is-open")));
function restoreDiagram() {
  dialog.dataset.sourceId = opener.dataset.sourceId || "";
  const image = opener.querySelector("img"), enlarged = dialog.querySelector(".dialog-content img");
  enlarged.src = image.src;
  enlarged.alt = image.alt;
  document.querySelector("#diagram-group").textContent = moduleCaptionForImage(image.getAttribute("src"), "");
  document.querySelector("#diagram-caption").textContent = opener.dataset.diagramHeading || image.alt;
  const description = dialog.querySelector("#diagram-description");
  if (description) description.textContent = opener.querySelector("span").firstChild.textContent.trim();
}
function leavePresentation() {
  if (!dialog.classList.contains("is-presenting")) return;
  slideToken++;
  clearTimeout(countTimer);
  slideCount.classList.remove("is-visible");
  setPresentationMenu(false);
  dialog.classList.remove("is-presenting");
  dialog.querySelector(".dialog-content").setAttribute("aria-label", t("Diagrama ampliado; desplázate para ver el contenido"));
  present.setAttribute("aria-pressed", "false");
  present.setAttribute("aria-label", t("Activar modo presentación"));
}
async function showSlide(index) {
  if (!gallery.length) return;
  const token = ++slideToken;
  index = (index + gallery.length) % gallery.length;
  const item = gallery[index], preload = new Image();
  preload.src = item.src;
  try { await preload.decode(); } catch { return; }
  if (token !== slideToken || !dialog.open || !dialog.classList.contains("is-presenting")) return;
  slideIndex = index;
  dialog.dataset.sourceId = typeof item.sourceId === "string" ? item.sourceId : "";
  const image = dialog.querySelector(".dialog-content img");
  image.src = item.src;
  image.alt = item.alt;
  document.querySelector("#diagram-group").textContent = moduleCaptionForImage(item.src, item.module);
  document.querySelector("#diagram-caption").textContent = typeof item.heading === "string" ? item.heading : item.alt;
  const description = dialog.querySelector("#diagram-description");
  if (description) description.textContent = item.caption;
  filmstrip.querySelectorAll("button").forEach((button, position) => button.setAttribute("aria-current", String(position === index)));
  const selected = filmstrip.querySelector('[aria-current="true"]');
  if (selected) filmstrip.scrollTo({ top: selected.offsetTop - filmstrip.offsetTop - (filmstrip.clientHeight - selected.clientHeight) / 2, behavior: reduceViewerMotion.matches ? "instant" : "smooth" });
  if (!reduceViewerMotion.matches && image.animate) image.animate([{ opacity: 0, transform: "translateX(18px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "ease-out" });
  slideCount.textContent = `${index + 1}/${gallery.length}`;
  slideCount.classList.add("is-visible");
  clearTimeout(countTimer);
  countTimer = setTimeout(() => slideCount.classList.remove("is-visible"), 2200);
  return true;
}
async function togglePresentation() {
  if (dialog.classList.contains("is-presenting")) { leavePresentation(); return true; }
  const prefix = `${document.body.dataset.base}${document.body.dataset.courseRoute}/`;
  try {
    galleryPromise ||= fetch(`${prefix}gallery.json`, { signal: AbortSignal.timeout(8000) }).then(response => {
      if (!response.ok) throw new Error("Gallery unavailable");
      return response.json();
    }).then(items => {
      if (!Array.isArray(items)) throw new Error("Invalid gallery");
      return items.filter(item => typeof item.src === "string" && typeof item.alt === "string" && typeof item.caption === "string" && typeof item.module === "string" && new URL(item.src, location.href).origin === location.origin && new URL(item.src, location.href).pathname.startsWith(prefix));
    });
    gallery = await galleryPromise;
    if (!gallery.length) throw new Error("Empty gallery");
  } catch {
    galleryPromise = undefined;
    const description = dialog.querySelector("#diagram-description");
    if (description) description.textContent = t("No se pudieron cargar los diagramas del curso. Inténtalo de nuevo.");
    return;
  }
  if (!dialog.open || dialog.classList.contains("is-presenting")) return;
  const groups = [];
  let group, module;
  gallery.forEach((item, index) => {
    if (item.module !== module) {
      module = item.module;
      group = document.createElement("section");
      group.className = "diagram-presentation-group";
      const heading = document.createElement("h3");
      const link = moduleLinkForImage(item.src);
      if (link) heading.append(link.querySelector(".nav-number").cloneNode(true), " ", link.querySelector(".nav-title").textContent.trim());
      else heading.textContent = module;
      heading.title = heading.textContent.trim().replace(/\s+/g, " ");
      group.append(heading);
      groups.push(group);
    }
    const button = document.createElement("button"), image = document.createElement("img");
    button.type = "button";
    button.dataset.slideNumber = String(index + 1);
    button.dataset.sourceId = typeof item.sourceId === "string" ? item.sourceId : "";
    button.dataset.voiceLabel = `${item.module}: ${item.heading || item.alt}`;
    button.setAttribute("aria-label", t('Imagen {current} de {total}: {module}: {alt}', {current: index + 1, total: gallery.length, module: item.module, alt: item.alt}));
    image.src = item.src; image.alt = ""; image.loading = "lazy";
    button.append(image);
    button.addEventListener("click", () => showSlide(index));
    button.addEventListener("certivoice:activate", event => { event.detail.completion = showSlide(index); });
    group.append(button);
  });
  filmstrip.replaceChildren(...groups);
  setPresentationMenu(false);
  viewerAnimation?.cancel();
  dialog.classList.add("is-presenting");
  dialog.querySelector(".dialog-content").setAttribute("aria-label", t("Diagrama en presentación; haz clic para avanzar"));
  present.setAttribute("aria-pressed", "true");
  present.setAttribute("aria-label", t("Salir del modo presentación"));
  const current = gallery.findIndex(item => new URL(item.src, location.href).href === dialog.querySelector(".dialog-content img").src);
  return await showSlide(Math.max(0, current));
}
present.addEventListener("click", togglePresentation);
present.addEventListener("certivoice:activate", event => { event.detail.completion = togglePresentation(); });
window.addEventListener("certichat:cleared", () => { delete dialog.dataset.voiceReturn; });
dialog.addEventListener("certivoice:visibility", event => {
  const request = event.detail;
  if (request?.name === "suspend" && dialog.open) {
    dialog.dataset.voiceReturn = dialog.dataset.sourceId;
    leavePresentation(); dialog.close();
  } else if (request?.name === "resume" && !dialog.open && request.targetId === dialog.dataset.voiceReturn && (gallery.some(item => item.sourceId === request.targetId) || [...document.querySelectorAll("[data-diagram][data-source-id]")].some(item => item.dataset.sourceId === request.targetId))) {
    delete dialog.dataset.voiceReturn;
    dialog.showModal(); request.completion = togglePresentation();
  }
});
dialog.querySelector(".dialog-content").addEventListener("click", () => {
  if (dialog.classList.contains("is-presenting")) {
    if (filmstrip.classList.contains("is-open")) { slideToken++; setPresentationMenu(false); }
    else showSlide(slideIndex + 1);
  }
  else if (!present.hidden) present.click();
});
dialog.addEventListener("keydown", event => {
  if (!dialog.classList.contains("is-presenting") || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  if (event.defaultPrevented || event.composedPath().some(node => node.matches?.("[data-certichat], .certivoice, input, textarea, [contenteditable]"))) return;
  event.preventDefault();
  showSlide(slideIndex + (event.key === "ArrowRight" ? 1 : -1));
});
function animateViewer(closing = false, from) {
  if (reduceViewerMotion.matches || !dialog.animate || !from && !opener?.getBoundingClientRect) return;
  const source = from || opener.getBoundingClientRect(), target = dialog.getBoundingClientRect();
  if (!source.width || !target.width) return;
  // ponytail: scale the real dialog from its thumbnail; no cloned image or second overlay to keep in sync.
  const small = `translate(${source.left - target.left}px, ${source.top - target.top}px) scale(${source.width / target.width}, ${source.height / target.height})`;
  viewerAnimation?.cancel();
  viewerAnimation = dialog.animate(closing ? [{ transform: "none", opacity: 1 }, { transform: small, opacity: 0 }] : [{ transform: small, opacity: from ? 1 : 0 }, { transform: "none", opacity: 1 }], {
    duration: 300, easing: "cubic-bezier(.22, 1, .36, 1)", fill: closing ? "forwards" : "none",
  });
  return viewerAnimation;
}
function closeViewer() {
  if (!dialog.open || dialog.classList.contains("is-closing")) return;
  if (dialog.classList.contains("is-presenting") && !matchMedia("(max-width: 800px)").matches) {
    const from = dialog.getBoundingClientRect();
    leavePresentation(); animateViewer(false, from); return;
  }
  const src = dialog.querySelector(".dialog-content img").src;
  const target = [...document.querySelectorAll("[data-diagram]")].find(button => new URL(button.dataset.diagram, location.href).href === src);
  const page = target ? null : moduleLinkForImage(src);
  if (target) opener = target;
  const finish = () => {
    leavePresentation();
    dialog.close();
    dialog.classList.remove("is-closing");
    viewerAnimation?.cancel();
    viewerAnimation = undefined;
    if (target) {
      target.scrollIntoView({ block: "center" });
      target.focus({ preventScroll: true });
    } else if (page) location.assign(`${page.href}#${diagramIdForImage(src)}`);
    else opener?.focus();
  };
  const animation = target ? animateViewer(true) : undefined;
  if (!animation) return finish();
  dialog.classList.add("is-closing");
  animation.finished.then(finish, finish);
}
document.querySelectorAll("[data-diagram]").forEach((button) =>
  button.addEventListener("click", async () => {
    delete dialog.dataset.voiceReturn;
    opener = button;
    restoreDiagram();
    dialog.showModal();
    if (!present.hidden && matchMedia("(max-width: 800px)").matches) await togglePresentation();
    animateViewer();
    dialog.querySelector("[data-close-diagram]").focus();
  }),
);
dialog
  .querySelector("[data-close-diagram]")
  .addEventListener("click", closeViewer);
dialog.addEventListener("click", (event) => {
  if (event.target !== dialog) return;
  if (filmstrip.classList.contains("is-open")) { slideToken++; setPresentationMenu(false); }
  else closeViewer();
});
dialog.addEventListener("cancel", event => {
  if (event.target !== dialog) return;
  event.preventDefault();
  const chatClose = dialog.querySelector("#certichat-panel:not([hidden]) [data-chat-close]");
  if (chatClose) chatClose.click();
  else closeViewer();
});

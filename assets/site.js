import { readStored, writeStored } from "./storage.js";

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
    label.textContent = `${count} de ${lessonSlugs.length}`;
  });
  document.querySelectorAll("[data-progress]").forEach((bar) => {
    bar.value = count;
  });
  document.querySelectorAll("[data-completion]").forEach((link) => {
    const done = completed.has(link.dataset.completion);
    link.classList.toggle("is-complete", done);
    link.setAttribute("aria-description", done ? "Módulo completado" : "Módulo pendiente");
  });
  document.querySelectorAll("[data-mark-complete]").forEach((button) => {
    const done = completed.has(button.dataset.markComplete);
    button.setAttribute("aria-pressed", String(done));
    button.textContent = done
      ? "✓ Completado · Desmarcar"
      : "○ Marcar como completado";
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

const completionButton = document.querySelector("[data-mark-complete]");
const completionTrigger = document.querySelector("[data-completion-trigger]");
if (completionButton && completionTrigger) {
  const showCompletionAtEnd = () => {
    const readableBottom = innerHeight - (footer?.getBoundingClientRect().height || 0) - 16;
    completionButton.hidden = completionTrigger.getBoundingClientRect().top > readableBottom;
  };
  addEventListener("scroll", showCompletionAtEnd, { passive: true });
  addEventListener("resize", showCompletionAtEnd);
  showCompletionAtEnd();
}

const toggle = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".sidebar");
const pathMenu = document.querySelector(".path-nav-mobile");
const themeToggle = document.querySelector("[data-theme-toggle]");
function syncTheme() {
  const dark = document.documentElement.dataset.theme === "dark";
  themeToggle?.setAttribute("aria-pressed", String(dark));
  themeToggle?.setAttribute("aria-label", dark ? "Activar modo claro" : "Activar modo oscuro");
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
const normalizeSearch = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function updateSearch() {
  const terms = normalizeSearch(searchInput.value.trim()).split(/\s+/).filter(Boolean);
  const searching = terms.length > 0;
  let total = 0;
  for (const entry of searchEntries) {
    const matches = searching
      ? terms.every((term) => normalizeSearch(entry.dataset.searchTerm).includes(term))
      : entry.dataset.searchKind === "certification";
    if (matches) total++;
    entry.hidden = !matches;
  }
  searchDialog.classList.toggle("has-query", searching);
  searchEmpty.hidden = total !== 0;
  searchClose.setAttribute("aria-label", searchInput.value ? "Limpiar búsqueda" : "Cerrar búsqueda");
  searchCount.textContent = !searching ? `${total} cursos disponibles.`
    : total ? `${total} resultado${total === 1 ? "" : "s"}.`
    : "No se encontraron resultados. Prueba con otro término.";
}
function openSearch() {
  if (!searchDialog.open) {
    searchInput.value = "";
    searchDialog.showModal();
  }
  updateSearch();
  searchInput.focus();
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
const desktopPathNav = document.querySelector(".path-nav");
const canHoverPathNav = () => matchMedia("(hover: hover) and (min-width: 1101px)").matches;
desktopPathNav?.addEventListener("pointerover", (event) => {
  if (!canHoverPathNav() || event.pointerType === "touch") return;
  const group = event.target.closest(".path-group");
  if (group?.parentElement === desktopPathNav) group.open = true;
});
desktopPathNav?.addEventListener("click", (event) => {
  if (!canHoverPathNav() || event.detail === 0) return;
  const summary = event.target.closest("summary");
  if (summary?.parentElement?.parentElement !== desktopPathNav) return;
  event.preventDefault();
  summary.parentElement.open = true;
});
pathMenu?.addEventListener("click", (event) => {
  if (event.target.closest("a")) pathMenu.open = false;
});
function closeMenu() {
  navigation?.classList.remove("is-open");
  toggle?.setAttribute("aria-expanded", "false");
}
toggle?.addEventListener("click", () => {
  const open = navigation.classList.toggle("is-open");
  toggle.setAttribute("aria-expanded", String(open));
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
    groups[index].querySelector(".certification-list").before(controls);
    groups.forEach((group, position) => group.classList.toggle("is-active", position === index));
    previous.disabled = index === 0;
    next.disabled = index === groups.length - 1;
    (focusedControl?.disabled ? (focusedControl === next ? previous : next) : focusedControl)?.focus({ preventScroll: true });
    status.textContent = `${groups[index].querySelector("h2").textContent} · ${index + 1} de ${groups.length}`;
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
const slideCount = dialog.querySelector(".diagram-slide-count");
let galleryPromise, gallery = [], slideIndex = 0, slideToken = 0, countTimer;
function restoreDiagram() {
  const image = opener.querySelector("img"), enlarged = dialog.querySelector(".dialog-content img");
  enlarged.src = image.src;
  enlarged.alt = image.alt;
  document.querySelector("#diagram-caption").textContent = image.alt;
  const description = dialog.querySelector("#diagram-description");
  if (description) description.textContent = opener.querySelector("span").firstChild.textContent.trim();
}
function leavePresentation() {
  if (!dialog.classList.contains("is-presenting")) return;
  slideToken++;
  clearTimeout(countTimer);
  slideCount.classList.remove("is-visible");
  dialog.classList.remove("is-presenting");
  present.setAttribute("aria-pressed", "false");
  present.setAttribute("aria-label", "Activar modo presentación");
  restoreDiagram();
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
  const image = dialog.querySelector(".dialog-content img");
  image.src = item.src;
  image.alt = item.alt;
  document.querySelector("#diagram-caption").textContent = item.alt;
  const description = dialog.querySelector("#diagram-description");
  if (description) description.textContent = item.caption;
  filmstrip.querySelectorAll("button").forEach((button, position) => button.setAttribute("aria-current", String(position === index)));
  filmstrip.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  if (!reduceViewerMotion.matches && image.animate) image.animate([{ opacity: 0, transform: "translateX(18px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "ease-out" });
  slideCount.textContent = `${index + 1}/${gallery.length}`;
  slideCount.classList.add("is-visible");
  clearTimeout(countTimer);
  countTimer = setTimeout(() => slideCount.classList.remove("is-visible"), 2200);
}
present.addEventListener("click", async () => {
  if (dialog.classList.contains("is-presenting")) return leavePresentation();
  const prefix = `${document.body.dataset.base}${document.body.dataset.courseRoute}/`;
  try {
    galleryPromise ||= fetch(`${prefix}gallery.json`).then(response => {
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
    if (description) description.textContent = "No se pudieron cargar los diagramas del curso. Inténtalo de nuevo.";
    return;
  }
  if (!dialog.open || dialog.classList.contains("is-presenting")) return;
  filmstrip.replaceChildren(...gallery.map((item, index) => {
    const button = document.createElement("button"), image = document.createElement("img"), label = document.createElement("span");
    button.type = "button";
    button.setAttribute("aria-label", `${item.module}: ${item.alt}`);
    image.src = item.src; image.alt = ""; image.loading = "lazy";
    label.textContent = item.module;
    button.append(image, label);
    button.addEventListener("click", () => showSlide(index));
    return button;
  }));
  viewerAnimation?.cancel();
  dialog.classList.add("is-presenting");
  present.setAttribute("aria-pressed", "true");
  present.setAttribute("aria-label", "Salir del modo presentación");
  const current = gallery.findIndex(item => new URL(item.src, location.href).href === dialog.querySelector(".dialog-content img").src);
  await showSlide(Math.max(0, current));
});
dialog.querySelector(".dialog-content img").addEventListener("click", () => {
  if (dialog.classList.contains("is-presenting")) showSlide(slideIndex + 1);
});
dialog.addEventListener("keydown", event => {
  if (!dialog.classList.contains("is-presenting") || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  showSlide(slideIndex + (event.key === "ArrowRight" ? 1 : -1));
});
function animateViewer(closing = false) {
  if (reduceViewerMotion.matches || !dialog.animate || !opener?.getBoundingClientRect) return;
  const source = opener.getBoundingClientRect(), target = dialog.getBoundingClientRect();
  if (!source.width || !target.width) return;
  // ponytail: scale the real dialog from its thumbnail; no cloned image or second overlay to keep in sync.
  const small = `translate(${source.left - target.left}px, ${source.top - target.top}px) scale(${source.width / target.width}, ${source.height / target.height})`;
  viewerAnimation?.cancel();
  viewerAnimation = dialog.animate(closing ? [{ transform: "none", opacity: 1 }, { transform: small, opacity: 0 }] : [{ transform: small, opacity: 0 }, { transform: "none", opacity: 1 }], {
    duration: 300, easing: "cubic-bezier(.22, 1, .36, 1)", fill: closing ? "forwards" : "none",
  });
  return viewerAnimation;
}
function closeViewer() {
  if (!dialog.open || dialog.classList.contains("is-closing")) return;
  const finish = () => { leavePresentation(); dialog.close(); dialog.classList.remove("is-closing"); viewerAnimation?.cancel(); viewerAnimation = undefined; };
  const animation = animateViewer(true);
  if (!animation) return finish();
  dialog.classList.add("is-closing");
  animation.finished.then(finish, finish);
}
document.querySelectorAll("[data-diagram]").forEach((button) =>
  button.addEventListener("click", () => {
    opener = button;
    restoreDiagram();
    dialog.showModal();
    animateViewer();
    dialog.querySelector("[data-close-diagram]").focus();
  }),
);
dialog
  .querySelector("[data-close-diagram]")
  .addEventListener("click", closeViewer);
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) closeViewer();
});
dialog.addEventListener("cancel", event => { event.preventDefault(); closeViewer(); });
dialog.addEventListener("close", () => opener?.focus());

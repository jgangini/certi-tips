import { readStored, writeStored } from "./storage.js";

const footer = document.querySelector(".site-footer");
// Reserve the wrapped height, including zoom and mobile safe-area padding.
if (footer) new ResizeObserver(() => {
  document.documentElement.style.setProperty("--footer-height", `${footer.getBoundingClientRect().height}px`);
}).observe(footer);

const course = document.body.dataset.course;
const heroFlow = document.querySelector("[data-hero-flow]");
if (heroFlow) {
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
const lessonSlugs = [
  "overview",
  "agents",
  "langchain",
  "mcp",
  "openai",
  "oci-enterprise",
  "oracle-database",
];

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
  searchCount.textContent = !searching ? `${total} certificaciones disponibles.`
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
document.querySelectorAll("[data-diagram]").forEach((button) =>
  button.addEventListener("click", () => {
    opener = button;
    const image = button.querySelector("img");
    const enlarged = dialog.querySelector("img");
    enlarged.src = image.src;
    enlarged.alt = image.alt;
    document.querySelector("#diagram-caption").textContent = image.alt;
    dialog.showModal();
    dialog.querySelector("button").focus();
  }),
);
dialog
  .querySelector("[data-close-diagram]")
  .addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
dialog.addEventListener("close", () => opener?.focus());

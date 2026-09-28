import { readStored, writeStored } from "./storage.js";

const course = document.body.dataset.course;
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
  document.querySelectorAll("[data-completion]").forEach((dot) => {
    dot.textContent = completed.has(dot.dataset.completion) ? "✓" : "";
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

const toggle = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".sidebar");
function closeMenu() {
  navigation?.classList.remove("is-open");
  toggle?.setAttribute("aria-expanded", "false");
}
toggle?.addEventListener("click", () => {
  const open = navigation.classList.toggle("is-open");
  toggle.setAttribute("aria-expanded", String(open));
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && navigation?.classList.contains("is-open")) {
    closeMenu();
    toggle.focus();
  }
});
document.addEventListener("click", (event) => {
  if (!navigation?.contains(event.target) && !toggle?.contains(event.target))
    closeMenu();
});

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

document
  .querySelector("[data-talk-mode]")
  ?.addEventListener("click", (event) => {
    const enabled = document.body.classList.toggle("talk-mode");
    event.currentTarget.setAttribute("aria-pressed", String(enabled));
    event.currentTarget.textContent = enabled
      ? "Volver al tamaño normal"
      : "Aumentar texto para proyectar";
  });

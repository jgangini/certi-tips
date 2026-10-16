import { t } from "./i18n.js";

// A native rerender creates a new form/dialog: an old voice choice cannot authorize its replacement.
const identities = new WeakMap(), selections = new WeakMap(), departures = new WeakMap();
function identity(element) {
  if (!identities.has(element)) identities.set(element, crypto.randomUUID());
  return identities.get(element);
}
const text = element => element?.textContent?.replace(/\s+/g, " ").trim() || "";
const optionText = input => {
  const label = input.closest("label"), copy = label?.querySelector("span:last-child");
  return `${text(label?.querySelector(".option-letter"))}. ${copy?.firstChild?.textContent?.trim() || ""}`;
};

function readPractice(root) {
  const dialog = root.querySelector("dialog.confirmation[open]");
  if (dialog) return text(dialog.querySelector(".confirmation-body"));
  const question = root.querySelector(".quiz-question");
  if (question) return [text(root.querySelector(".quiz-meta > span")), text(question), ...[...root.querySelectorAll('#question-form input[name="answer"]')].map(optionText)].filter(Boolean).join(". ");
  const summary = root.querySelector(".quiz-summary");
  if (summary) return [text(summary.querySelector("#results-title")), text(summary.querySelector(".quiz-score")), ...[...summary.querySelectorAll(":scope > p")].map(text)].filter(Boolean).join(". ");
  return text(root.querySelector(".quiz-intro"));
}

export function guardPracticeNavigation(action, destination, doc = document) {
  // A locale change restores the same persisted attempt; only study_concept is a deliberate study detour.
  if (!["home", "catalog", "videos", "quiz", "chat", "open_course", "open_module", "course_presentation", "next_page", "previous_page", "practice"].includes(action.name)) return null;
  const root = doc.querySelector("#quiz"), form = root?.querySelector("#question-form"), finish = root?.querySelector("[data-finish]");
  if (!form || !finish || finish.disabled) return null;
  const existing = root.querySelector("dialog.confirmation[open]");
  if (existing) return { confirmation: readPractice(root) };
  finish.click();
  const dialog = root.querySelector("dialog.confirmation[open][data-finish-confirm]");
  if (!dialog) return { error: t("Esa acción ya no está disponible en la práctica.") };
  const pending = { dialog, action: { name: action.name, ...(action.targetId ? { targetId: action.targetId } : {}) } };
  departures.set(form, pending);
  dialog.querySelector("#finish-confirm-message").textContent = t("Estás en una práctica. Para ir a {destination}, finalizaré este intento y conservaré el resultado de las respuestas confirmadas. ¿Deseas continuar?", { destination });
  dialog.addEventListener("close", () => {
    const accepted = dialog.returnValue === "finish" && departures.get(form) === pending;
    departures.delete(form);
    if (accepted) Promise.allSettled(dialog.getAnimations().map(animation => animation.finished)).then(() => {
      doc.defaultView?.dispatchEvent(new CustomEvent("certivoice:practice-followup", { detail: { action: pending.action } }));
    });
  }, { once: true });
  return { confirmation: readPractice(root) };
}

export function practiceTargets(doc = document) {
  const root = doc.querySelector("#quiz");
  if (!root || root.hidden) return [];
  const dialog = root.querySelector("dialog.confirmation[open]"), modal = doc.querySelector("dialog[open]");
  if (modal && modal !== dialog) return [];
  const targets = [];
  const add = (action, id, label, element) => { if (element && !element.disabled) targets.push({ action, id, label, element }); };
  if (dialog) {
    const kind = ["finish", "reset", "exit"].find(value => dialog.hasAttribute(`data-${value}-confirm`));
    if (!kind) return [];
    const id = `practice:dialog:${identity(dialog)}`;
    add("practice_read", `${id}:read`, text(dialog.querySelector(".confirmation-body")), dialog);
    for (const [action, suffix] of [["practice_accept", "yes"], ["practice_cancel", "no"]]) {
      const button = dialog.querySelector(`[data-${kind}-${suffix}]`);
      add(action, `${id}:${suffix}`, text(button), button);
    }
    return targets;
  }
  for (const action of ["start", "next", "finish", "reset", "exit"]) {
    const button = root.querySelector(`[data-${action}]`);
    if (button) add(`practice_${action}`, `practice:${identity(button)}:${action}`, text(button) || button.getAttribute("aria-label"), button);
  }
  const form = root.querySelector("#question-form");
  if (!form) return targets;
  const id = `practice:question:${identity(form)}`;
  add("practice_read", `${id}:read`, text(root.querySelector(".quiz-question")), form);
  for (const input of form.querySelectorAll('input[name="answer"]:not(:disabled)')) {
    if (/^[\w-]{1,20}$/.test(input.value)) add("practice_select", `${id}:option:${input.value}`, optionText(input), input);
  }
  const selected = form.querySelector('input[name="answer"]:checked:not(:disabled)');
  if (selected && selections.get(form) === selected) {
    add("practice_confirm", `${id}:confirm:${selected.value}`, t("Confirmar: {option}", { option: optionText(selected) }), form.querySelector('button[type="submit"]'));
    add("practice_cancel", `${id}:cancel:${selected.value}`, t("Cancelar"), selected);
  } else selections.delete(form);
  const feedback = root.querySelector(".feedback");
  if (feedback) add("practice_explanation", `${id}:explanation`, text(feedback.querySelector("h2")), feedback);
  return targets;
}

export async function performPracticeAction(action, doc = document) {
  const target = practiceTargets(doc).find(item => item.action === action.name && item.id === action.targetId);
  if (!target) return { error: t("Esa acción ya no está disponible en la práctica.") };
  const root = doc.querySelector("#quiz"), dialog = root.querySelector("dialog.confirmation[open]");
  if (action.name === "practice_read") return { confirmation: readPractice(root) };
  if (dialog) {
    target.element.click();
    await Promise.allSettled(dialog.getAnimations().map(animation => animation.finished));
    return { confirmation: action.name === "practice_cancel" ? t("Cancelado.") : readPractice(root) };
  }
  const form = root.querySelector("#question-form");
  if (action.name === "practice_select") {
    target.element.click(); selections.set(form, target.element);
    return { confirmation: t("Has seleccionado {option}. ¿Confirmas esta respuesta?", { option: optionText(target.element) }) };
  }
  if (action.name === "practice_cancel") {
    selections.delete(form); target.element.checked = false;
    target.element.dispatchEvent(new Event("change", { bubbles: true }));
    return { confirmation: t("Cancelado.") };
  }
  if (action.name === "practice_confirm") selections.delete(form);
  if (action.name !== "practice_explanation") target.element.click();
  if (["practice_confirm", "practice_explanation"].includes(action.name)) {
    const feedback = root.querySelector(".feedback");
    const label = root.querySelector('input[name="answer"]:checked')?.closest("label");
    const result = label?.classList?.contains("is-correct") ? t("Correcta") : label?.classList?.contains("is-wrong") ? t("Incorrecta") : "";
    return feedback ? { confirmation: `${result ? `${result}. ` : ""}${text(feedback)} ${t("¿Quieres continuar?")}` } : { error: t("Esa acción ya no está disponible en la práctica.") };
  }
  return { confirmation: readPractice(root) };
}

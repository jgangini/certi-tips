import { t } from './i18n.js';
import { newAttempt, confirmAnswer, advance, previous, finishAttempt, results, restoreAttempt } from './quiz-core.js';
import { readStored, writeStored } from './storage.js';

const root = document.querySelector('#quiz');
const course = document.body.dataset.course;
const base = document.body.dataset.base;
const domainLabels = JSON.parse(document.body.dataset.quizDomains);
const domains = Object.keys(domainLabels);
const questionCount = domains.length * 2;
const key = `certitips:quiz:v1:${course}`;
const escape = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const resetButton = `<button class="quiz-reset" type="button" data-reset aria-label="${escape(t("Reiniciar"))}" title="${escape(t("Reiniciar"))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 21C16.9706 21 21 16.9706 21 12C21 9.69494 20.1334 7.59227 18.7083 6L16 3M12 3C7.02944 3 3 7.02944 3 12C3 14.3051 3.86656 16.4077 5.29168 18L8 21M21 3H16M16 3V8M3 21H8M8 21V16"/></svg></button>`;
const closeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg>';
let bank;
let attempt;
let resultIndex = null;
let persisted = true;

function save() { persisted = writeStored(key, attempt); }
function notice() { return persisted ? '' : `<p class="quiz-notice" role="status">${escape(t("El almacenamiento está bloqueado. Puedes continuar, pero el avance se perderá al cerrar o recargar."))}</p>`; }

function intro(moveFocus = false) {
  root.innerHTML = `<div class="quiz-shell quiz-intro"><div class="quiz-heading"><div class="eyebrow">${escape(t("PRÁCTICA"))}</div><h2>${escape(t("Un paso más cerca de tenerlo claro."))}</h2></div><p>${escape(t("Selecciona una alternativa y pulsa"))} <strong>${escape(t("Siguiente"))}</strong> ${escape(t("para ver la explicación. Pulsa otra vez para continuar."))}</p><div class="quiz-facts"><div><strong>${questionCount}</strong><span>${escape(t("preguntas por intento"))}</span></div><div><strong>${String(domains.length).padStart(2, "0")}</strong><span>${escape(t("áreas de estudio"))}</span></div><div><strong>∞</strong><span>${escape(t("sin límite de tiempo"))}</span></div></div><div class="quiz-start-action"><button class="button" data-start>${escape(t("Comenzar"))}</button></div></div>`;
  root.querySelector('[data-start]').addEventListener('click', start);
  if (!persisted) root.insertAdjacentHTML('beforeend', `<p class="quiz-notice" role="status">${escape(t("El test se reinició en esta sesión, pero no se pudo borrar el avance guardado. Al recargar podría reaparecer el intento anterior."))}</p>`);
  if (moveFocus) root.querySelector('[data-start]').focus();
}

function confirmAction(action) {
  if (root.querySelector('dialog.confirmation')) return;
  const [title, message] = {
    finish: [t("¿Finalizar la práctica?"), t("Verás los resultados de las respuestas confirmadas. Las preguntas sin responder no contarán como errores.")],
    reset: [t("¿Reiniciar la práctica?"), t("Se borrarán las respuestas de este intento para que puedas comenzar de nuevo.")],
    exit: [t("¿Salir de la práctica?"), t("Se cerrarán los resultados de este intento y volverás al inicio de la práctica.")],
  }[action];
  const dialog = document.createElement('dialog');
  dialog.className = 'confirmation'; dialog.setAttribute(`data-${action}-confirm`, '');
  dialog.setAttribute('aria-labelledby', `${action}-confirm-title`); dialog.setAttribute('aria-describedby', `${action}-confirm-message`);
  dialog.innerHTML = `<div class="confirmation-body"><h2 id="${action}-confirm-title" tabindex="-1" autofocus>${escape(title)}</h2><p id="${action}-confirm-message">${escape(message)}</p></div><div class="confirmation-actions"><button class="button button-secondary" type="button" data-${action}-no>${escape(t("Cancelar"))}</button><button class="button" type="button" data-${action}-yes>${escape(t("Aceptar"))}</button></div>`;
  root.append(dialog);
  dialog.querySelector(`[data-${action}-no]`).addEventListener('click', () => dialog.close());
  dialog.querySelector(`[data-${action}-yes]`).addEventListener('click', () => dialog.close(action));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    const accepted = dialog.returnValue === action;
    Promise.allSettled(dialog.getAnimations().map(animation => animation.finished)).then(() => {
      dialog.remove();
      if (!accepted) return;
      if (action === 'finish') { attempt = finishAttempt(attempt); save(); render(true); }
      else reset(true);
    });
    if (!accepted) root.querySelector(`[data-${action}]`)?.focus();
  });
  dialog.showModal();
}

function reset(confirmed = false) {
  if (confirmed !== true) return confirmAction('reset');
  attempt = null;
  resultIndex = null;
  try {
    globalThis.localStorage.removeItem(key);
    persisted = true;
  } catch {
    persisted = writeStored(key, null);
  }
  intro(true);
}

function start() {
  attempt = newAttempt(bank, Math.random, domains);
  resultIndex = null;
  save();
  render(true);
}

function questionView(question, selected, index, reviewing) {
  const locked = reviewing || Boolean(selected);
  const closeLabel = reviewing ? t("Salir") : t("Finalizar la práctica");
  const actions = `<div class="quiz-actions quiz-next-action"><button class="button button-secondary" type="button" data-previous ${index === 0 ? 'disabled' : ''}>${escape(t("Anterior"))}</button><span class="quiz-next-controls">${reviewing ? `<button class="button button-secondary" type="button" data-results>${escape(t("Resumen"))}</button>` : ''}<button class="button" type="${locked ? 'button' : 'submit'}" ${locked ? 'data-next' : ''} ${!locked || reviewing && index === attempt.ids.length - 1 ? 'disabled' : ''}>${escape(t("Siguiente"))}</button></span></div>`;
  return `<div class="quiz-meta"><span>${escape(t(attempt.mode === 'review' ? 'Repaso {number} de {total}' : 'Pregunta {number} de {total}', { number: index + 1, total: attempt.ids.length }))}</span><span class="quiz-meta-actions">${resetButton}<button class="quiz-close" type="button" data-${reviewing ? 'exit' : 'finish'} aria-label="${escape(closeLabel)}" title="${escape(closeLabel)}">${closeIcon}</button></span></div><progress class="quiz-meter" value="${Object.keys(attempt.answers).length}" max="${attempt.ids.length}" aria-label="${escape(t(attempt.mode === 'review' ? 'Progreso del repaso' : 'Progreso de la práctica'))}"></progress><form id="question-form"><fieldset class="quiz-options"><legend class="quiz-question" tabindex="-1" data-question-number="${index + 1}. ">${escape(question.question)}</legend>${question.options.map(option => `<label class="quiz-option ${locked && option.id === question.correctOption ? 'is-correct' : ''} ${locked && option.id === selected && selected !== question.correctOption ? 'is-wrong' : ''}"><input type="radio" name="answer" value="${option.id}" required ${selected === option.id ? 'checked' : ''} ${locked ? 'disabled' : ''}><span class="option-letter">${option.id.toUpperCase()}</span><span>${escape(option.text)}${locked && option.id === question.correctOption ? `<span class="visually-hidden">${escape(t("Respuesta correcta"))}</span>` : ''}${locked && option.id === selected && selected !== question.correctOption ? `<span class="visually-hidden">${escape(t("Tu respuesta"))}</span>` : ''}</span></label>`).join('')}</fieldset>${!locked ? actions : ''}</form>${locked ? `${feedback(question)}${actions}` : ''}${notice()}`;
}

function feedback(question) {
  const option = question.options.find(item => item.id === question.correctOption);
  return `<section class="feedback" aria-labelledby="feedback-title"><h2 id="feedback-title" tabindex="-1">${escape(t("Explicación"))}</h2><p>${escape(option.explanation)}</p></section>`;
}

function questionResults() {
  return `<table class="quiz-results" aria-label="${escape(t("Resultados por pregunta"))}"><thead><tr><th scope="col">${escape(t("ESTADO"))}</th><th scope="col">${escape(t("PREGUNTA"))}</th></tr></thead><tbody>${attempt.ids.map((id, index) => {
    const question = bank.find(item => item.id === id);
    const answer = attempt.answers[id];
    const status = !answer ? 'pending' : answer === question.correctOption ? 'correct' : 'wrong';
    const label = { pending: t("Sin responder"), correct: t("Correcta"), wrong: t("Incorrecta") }[status];
    return `<tr><td><span class="quiz-result-status is-${status}">${escape(label)}</span></td><td><button type="button" class="text-link" data-question-index="${index}" title="${index + 1}. ${escape(question.question)}">${index + 1}. ${escape(question.question)}</button></td></tr>`;
  }).join('')}</tbody></table>`;
}

function summary() {
  const report = results(attempt, bank);
  const previous = attempt.mode === 'review' ? results(attempt.original, bank) : null;
  const partial = report.total < attempt.ids.length;
  root.innerHTML = `<div class="quiz-shell quiz-summary"><div class="quiz-summary-header"><div class="quiz-heading"><div class="eyebrow">${escape(t("PRÁCTICA"))}</div><h2 tabindex="-1" id="results-title">${escape(t("Resumen"))}</h2></div><span class="quiz-meta-actions">${resetButton}<button class="quiz-close" type="button" data-exit aria-label="${escape(t("Salir"))}" title="${escape(t("Salir"))}">${closeIcon}</button></span></div>
  ${report.total ? `<div class="quiz-score"><div class="score-number">${report.correct}<small> / ${report.total}</small></div></div>` : ''}
  ${partial ? `<p>${escape(t('Respondiste {answered} de {total} preguntas. El resultado considera solo las respuestas confirmadas.', { answered: report.total, total: attempt.ids.length }))}</p>` : ''}
  ${previous ? `<p class="quiz-notice">${escape(t('Tu práctica anterior se mantiene en {correct}/{total}.', { correct: previous.correct, total: previous.total }))}</p>` : ''}
  ${questionResults()}
  ${report.total ? `<h3>${escape(t("Resultado por área"))}</h3><ul class="domain-results">${Object.entries(report.domains).map(([domain, score]) => `<li><span>${escape(domainLabels[domain])}</span><strong>${score.correct} / ${score.total}</strong></li>`).join('')}</ul>` : ''}
  ${notice()}</div>`;
}

function render(moveFocus = false) {
  const completed = attempt.finished || attempt.index >= attempt.ids.length;
  if (completed && resultIndex === null) {
    summary();
    if (moveFocus) root.querySelector('#results-title').focus();
    return;
  }
  const index = resultIndex ?? attempt.index;
  const question = bank.find(item => item.id === attempt.ids[index]);
  const selected = attempt.answers[question.id];
  root.innerHTML = `<div class="quiz-shell">${questionView(question, selected, index, completed)}</div>`;
  const form = root.querySelector('#question-form');
  form.addEventListener('change', () => {
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = !form.querySelector('input[name="answer"]:checked');
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (completed) return;
    const answer = new FormData(event.currentTarget).get('answer');
    attempt = confirmAnswer(attempt, bank, answer);
    save(); render(); root.querySelector('#feedback-title')?.focus();
  });
  root.querySelector('[data-next]')?.addEventListener('click', () => {
    if (completed) resultIndex = Math.min(index + 1, attempt.ids.length - 1);
    else { attempt = advance(attempt); save(); }
    render(true);
  });
  root.querySelector('[data-previous]').addEventListener('click', () => {
    if (completed) resultIndex = Math.max(index - 1, 0);
    else { attempt = previous(attempt); save(); }
    render(true);
  });
  if (moveFocus) root.querySelector('.quiz-question').focus();
}

async function load() {
  try {
    const response = await fetch(`${base}assets/${document.body.dataset.questionBank}.json`);
    if (!response.ok) throw new Error(t("No se pudo cargar el banco."));
    bank = await response.json();
    attempt = restoreAttempt(readStored(key, null), bank, domains);
    if (attempt) render(); else intro();
  } catch {
    root.innerHTML = `<div class="quiz-error"><h2>${escape(t("No pudimos cargar la práctica."))}</h2><p>${escape(t("Comprueba tu conexión y vuelve a intentarlo. La guía sigue disponible."))}</p><button class="button button-secondary" data-retry>${escape(t("Volver a cargar"))}</button></div>`;
    root.querySelector('[data-retry]').addEventListener('click', load);
  }
}
load();
root.addEventListener('click', event => {
  if (event.target.closest('[data-reset]')) reset();
  if (event.target.closest('[data-finish]')) confirmAction('finish');
  if (event.target.closest('[data-exit]')) confirmAction('exit');
  if (event.target.closest('[data-results]')) { resultIndex = null; render(true); }
  const question = event.target.closest('[data-question-index]');
  if (question) { resultIndex = Number(question.dataset.questionIndex); render(true); }
});

import { newAttempt, confirmAnswer, advance, results, reviewAttempt, restoreAttempt } from './quiz-core.js';
import { readStored, writeStored } from './storage.js';

const root = document.querySelector('#quiz');
const course = document.body.dataset.course;
const courseRoute = document.body.dataset.courseRoute || course;
const hasExam = document.body.dataset.courseHasExam !== 'false';
const base = document.body.dataset.base;
const domainLabels = JSON.parse(document.body.dataset.quizDomains);
const domains = Object.keys(domainLabels);
const questionCount = domains.length * 2;
const target = Math.ceil(questionCount * 0.8);
const key = `certitips:quiz:v1:${course}`;
const resetButton = '<button class="button button-secondary" type="button" data-reset>Reiniciar test</button>';
const escape = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let bank;
let attempt;
let persisted = true;

function save() { persisted = writeStored(key, attempt); }
function reference(question) { return `${base}${courseRoute}/${question.reference.module}/#${question.reference.anchor}`; }
function notice() { return `<p class="quiz-notice">${attempt?.mode === 'review' ? 'Repaso de errores: este resultado no modifica tu intento de práctica anterior.' : `Práctica educativa · Meta orientativa: ${target}/${questionCount}${hasExam ? ' · No equivale al examen oficial.' : ' · Aplica lo aprendido en el caso integrador.'}`}${persisted ? '' : '<br>El almacenamiento está bloqueado. Puedes continuar, pero el avance se perderá al cerrar o recargar.'}</p>`; }

function intro(moveFocus = false) {
  root.innerHTML = `<div class="quiz-shell quiz-intro"><div class="eyebrow">PRACTICA PARA ENTENDER</div><h2>Un paso más cerca de tenerlo claro.</h2><p>Selecciona una alternativa y pulsa <strong>Comprobar</strong>. Verás el resultado, el porqué y qué repasar antes de continuar.</p><div class="quiz-facts"><div><strong>${questionCount}</strong><span>preguntas por intento</span></div><div><strong>${String(domains.length).padStart(2, "0")}</strong><span>áreas de estudio</span></div><div><strong>∞</strong><span>sin límite de tiempo</span></div></div><button class="button" data-start>Entrar</button></div>`;
  root.querySelector('[data-start]').addEventListener('click', start);
  if (!persisted) root.insertAdjacentHTML('beforeend', '<p class="quiz-notice" role="status">El test se reinició en esta sesión, pero no se pudo borrar el avance guardado. Al recargar podría reaparecer el intento anterior.</p>');
  if (moveFocus) root.querySelector('[data-start]').focus();
}

function reset() {
  if (attempt.index < attempt.ids.length && !globalThis.confirm('¿Reiniciar el test? Se borrarán las respuestas de este intento. Tu progreso de estudio no cambiará.')) return;
  attempt = null;
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
  save();
  render(true);
}

function questionView(question, selected) {
  const locked = Boolean(selected);
  return `<div class="quiz-meta"><span class="tag">${escape(domainLabels[question.domain])}</span><span>${attempt.mode === 'review' ? 'Repaso' : 'Pregunta'} ${attempt.index + 1} de ${attempt.ids.length}</span>${resetButton}</div><div class="quiz-meter" aria-hidden="true"><span style="width:${100 * attempt.index / attempt.ids.length}%"></span></div><form id="question-form"><fieldset class="quiz-options"><legend class="quiz-question" tabindex="-1">${escape(question.question)}</legend>${question.options.map(option => `<label class="quiz-option ${locked && option.id === question.correctOption ? 'is-correct' : ''} ${locked && option.id === selected && selected !== question.correctOption ? 'is-wrong' : ''}"><input type="radio" name="answer" value="${option.id}" required ${selected === option.id ? 'checked' : ''} ${locked ? 'disabled' : ''}><span><span class="option-letter">${option.id.toUpperCase()}.</span>${escape(option.text)}${locked && option.id === question.correctOption ? '<span class="option-status">✓ Respuesta correcta</span>' : ''}${locked && option.id === selected && selected !== question.correctOption ? '<span class="option-status">Tu respuesta</span>' : ''}</span></label>`).join('')}</fieldset>${!locked ? '<div class="quiz-actions"><button class="button" type="submit">Comprobar respuesta</button></div>' : ''}</form>${locked ? feedback(question, selected) : ''}${notice()}`;
}

function feedback(question, selected) {
  const correct = selected === question.correctOption;
  const option = question.options.find(item => item.id === question.correctOption);
  return `<section class="feedback" aria-labelledby="feedback-title"><h2 id="feedback-title" tabindex="-1" class="${correct ? 'feedback-correct' : 'feedback-wrong'}">${correct ? '✓ Correcto. Estas son las razones.' : 'Vamos a aclararlo.'}</h2><p>${correct ? 'La respuesta es' : 'La respuesta correcta es'} <strong>${option.id.toUpperCase()}. ${escape(option.text)}</strong></p><ol type="A">${question.options.map(item => `<li><strong>${item.id === question.correctOption ? 'Correcta' : 'Por qué no'}:</strong> ${escape(item.explanation)}</li>`).join('')}</ol><a class="review-link" href="${reference(question)}">${escape(question.reference.label)} →</a><div class="quiz-actions"><button class="button" data-next>${attempt.index === attempt.ids.length - 1 ? 'Ver mis resultados' : 'Siguiente pregunta'} →</button></div></section>`;
}

function summary() {
  const report = results(attempt, bank);
  const previous = attempt.mode === 'review' ? results(attempt.original, bank) : null;
  const pending = [...new Set(report.wrong.map(id => bank.find(question => question.id === id).domain))];
  root.innerHTML = `<div class="quiz-shell"><div class="eyebrow">${attempt.mode === 'review' ? 'REPASO COMPLETADO' : 'PRÁCTICA COMPLETADA'}</div><h2 tabindex="-1" id="results-title">${report.correct === report.total ? 'Las piezas están conectadas.' : 'Ya sabes dónde enfocar tu repaso.'}</h2><div class="quiz-score"><div class="score-number">${report.correct}<small> / ${report.total}</small></div><p>${Math.round(100 * report.correct / report.total)}% de aciertos<br><span class="subtle">${attempt.mode === 'practice' && report.correct >= target ? 'Alcanzaste la meta orientativa de esta práctica.' : 'Cada intento es una fotografía de tu aprendizaje.'}</span></p></div>${previous ? `<p class="quiz-notice">Tu práctica anterior se mantiene en ${previous.correct}/${previous.total}.</p>` : ''}<h3>Resultado por área</h3><ul class="domain-results">${Object.entries(report.domains).map(([domain, score]) => `<li><span>${escape(domainLabels[domain])}</span><strong>${score.correct} / ${score.total}</strong></li>`).join('')}</ul><p class="quiz-notice">Dos preguntas por área no bastan para medir dominio completo. Usa estos resultados como orientación.</p>${pending.length ? `<h3>Vuelve a estos conceptos</h3><ul>${pending.map(domain => `<li><a href="${base}${courseRoute}/${domain}/#conceptos-clave">${escape(domainLabels[domain])}</a></li>`).join('')}</ul>` : `<p>${hasExam ? 'Continúa con la práctica oficial de Oracle y comprueba que también puedes explicar las respuestas sin ver las alternativas.' : 'Aplica lo aprendido en el caso integrador y justifica tus decisiones con evidencias.'}</p>`}<div class="quiz-actions">${report.wrong.length ? '<button class="button" data-review>Repasar mis errores</button>' : ''}<button class="button button-secondary" data-restart>Nuevo intento de ${questionCount}</button>${resetButton}<a class="text-link" href="${base}${courseRoute}/${hasExam ? 'exam-checklist' : 'case-study'}/">${hasExam ? 'Ruta al examen oficial' : 'Caso integrador'} →</a></div>${notice()}</div>`;
  root.querySelector('[data-review]')?.addEventListener('click', () => { attempt = reviewAttempt(attempt, bank, domains); save(); render(true); });
  root.querySelector('[data-restart]').addEventListener('click', start);
}

function render(moveFocus = false) {
  if (attempt.index >= attempt.ids.length) {
    summary();
    if (moveFocus) root.querySelector('#results-title').focus();
    return;
  }
  const question = bank.find(item => item.id === attempt.ids[attempt.index]);
  const selected = attempt.answers[question.id];
  root.innerHTML = `<div class="quiz-shell">${questionView(question, selected)}</div>`;
  root.querySelector('#question-form').addEventListener('submit', event => {
    event.preventDefault();
    const answer = new FormData(event.currentTarget).get('answer');
    attempt = confirmAnswer(attempt, bank, answer);
    save(); render(); root.querySelector('#feedback-title')?.focus();
  });
  root.querySelector('[data-next]')?.addEventListener('click', () => { attempt = advance(attempt); save(); render(true); });
  if (moveFocus) root.querySelector('.quiz-question').focus();
}

async function load() {
  try {
    const response = await fetch(`${base}assets/${document.body.dataset.questionBank}.json`);
    if (!response.ok) throw new Error('No se pudo cargar el banco.');
    bank = await response.json();
    attempt = restoreAttempt(readStored(key, null), bank, domains);
    if (attempt) render(); else intro();
  } catch {
    root.innerHTML = '<div class="quiz-error"><h2>No pudimos cargar la práctica.</h2><p>Comprueba tu conexión y vuelve a intentarlo. La guía sigue disponible.</p><button class="button button-secondary" data-retry>Volver a cargar</button></div>';
    root.querySelector('[data-retry]').addEventListener('click', load);
  }
}
load();
root.addEventListener('click', event => { if (event.target.closest('[data-reset]')) reset(); });

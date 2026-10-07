export const domains = ['agents', 'langchain', 'mcp', 'openai', 'oci-enterprise', 'oracle-database'];

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function newAttempt(bank, random = Math.random, areas = domains) {
  const selected = areas.flatMap(domain => shuffle(bank.filter(question => question.domain === domain), random).slice(0, 2));
  if (!areas.length || selected.length !== areas.length * 2 || new Set(selected.map(question => question.id)).size !== selected.length) throw new Error('El banco de preguntas está incompleto.');
  return { version: 1, mode: 'practice', ids: shuffle(selected.map(question => question.id), random), answers: {}, index: 0 };
}

export function confirmAnswer(attempt, bank, option) {
  const id = attempt.ids[attempt.index];
  const question = bank.find(item => item.id === id);
  if (!question || Object.hasOwn(attempt.answers, id) || !question.options.some(item => item.id === option)) return attempt;
  return { ...attempt, answers: { ...attempt.answers, [id]: option } };
}

export function advance(attempt) {
  if (!Object.hasOwn(attempt.answers, attempt.ids[attempt.index])) return attempt;
  return { ...attempt, index: Math.min(attempt.index + 1, attempt.ids.length) };
}

export function results(attempt, bank) {
  const report = { correct: 0, total: attempt.ids.length, wrong: [], domains: {} };
  for (const id of attempt.ids) {
    const question = bank.find(item => item.id === id);
    const correct = attempt.answers[id] === question.correctOption;
    const tally = report.domains[question.domain] ||= { correct: 0, total: 0 };
    tally.total++;
    if (correct) { report.correct++; tally.correct++; }
    else report.wrong.push(id);
  }
  return report;
}

export function reviewAttempt(attempt, bank, areas = domains) {
  const original = restoreAttempt(attempt.mode === 'practice' ? attempt : attempt.original, bank, areas);
  if (!original || original.mode !== 'practice' || original.index !== original.ids.length || attempt.index !== attempt.ids.length) throw new Error('Completa la práctica antes de repasar sus errores.');
  return { version: 1, mode: 'review', ids: results(attempt, bank).wrong, answers: {}, index: 0, original };
}

export function restoreAttempt(value, bank, areas = domains) {
  if (!value || value.version !== 1 || !['practice', 'review'].includes(value.mode)) return null;
  if (!Array.isArray(value.ids) || !value.ids.length || value.ids.length > areas.length * 2 || new Set(value.ids).size !== value.ids.length) return null;
  if (!Number.isInteger(value.index) || value.index < 0 || value.index > value.ids.length || !value.answers || typeof value.answers !== 'object' || Array.isArray(value.answers)) return null;
  const questions = new Map(bank.map(question => [question.id, question]));
  if (value.ids.some(id => !questions.has(id))) return null;
  if (value.mode === 'practice' && (value.ids.length !== areas.length * 2 || areas.some(domain => value.ids.filter(id => questions.get(id).domain === domain).length !== 2))) return null;
  if (Object.keys(value.answers).some(id => !value.ids.includes(id) || !questions.get(id).options.some(option => option.id === value.answers[id]))) return null;
  // ponytail: only the current question may be answered ahead; no arbitrary navigation/history engine.
  if (value.ids.some((id, i) => (i < value.index && !Object.hasOwn(value.answers, id)) || (i > value.index && Object.hasOwn(value.answers, id)))) return null;
  const restored = { version: 1, mode: value.mode, ids: [...value.ids], answers: { ...value.answers }, index: value.index };
  if (value.mode === 'review') {
    if (value.original?.mode !== 'practice') return null;
    const original = restoreAttempt(value.original, bank, areas);
    if (!original || original.index !== original.ids.length) return null;
    const wrong = results(original, bank).wrong;
    if (value.ids.some(id => !wrong.includes(id))) return null;
    restored.original = original;
  }
  return restored;
}

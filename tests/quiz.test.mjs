import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { advance, confirmAnswer, domains, finishAttempt, newAttempt, previous, restoreAttempt, results, reviewAttempt, shuffle } from '../assets/quiz-core.js';
import { getStorage, readStored, writeStored } from '../assets/storage.js';

const bank = JSON.parse(readFileSync(new URL('../data/1Z0-1157-26/questions.json', import.meta.url), 'utf8'));
const questionFor = id => bank.find(question => question.id === id);
const wrongOption = question => question.options.find(option => option.id !== question.correctOption).id;
const attempt = () => newAttempt(bank, () => 0.25);

const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
for (const { id: courseId, questionBank: bankFile, modules } of catalog.courses.filter(course => course.id !== 'agentic-ai-foundations-2026')) test(`${courseId} selects balanced questions and restores review without mixing course banks`, () => {
  const aiBank = JSON.parse(readFileSync(new URL(`../data/${bankFile}.json`, import.meta.url), 'utf8'));
  const areas = modules.filter(module => module.type === 'module').map(module => module.slug);
  const count = areas.length * 2;
  let current = newAttempt(aiBank, () => 0.25, areas);
  assert.equal(current.ids.length, count);
  assert.equal(new Set(current.ids).size, count);
  for (const domain of areas) assert.equal(current.ids.filter(id => aiBank.find(question => question.id === id).domain === domain).length, 2);
  assert.equal(restoreAttempt(current, bank), null);
  assert.equal(restoreAttempt(attempt(), aiBank, areas), null);
  assert.throws(() => newAttempt(aiBank.filter(question => question.domain !== areas[0]), Math.random, areas), /incompleto/);
  while (current.index < current.ids.length) {
    const question = aiBank.find(item => item.id === current.ids[current.index]);
    current = advance(confirmAnswer(current, aiBank, current.index % 3 ? question.correctOption : wrongOption(question)));
  }
  assert.equal(results(current, aiBank).correct, count - Math.ceil(count / 3));
  assert.deepEqual(restoreAttempt(JSON.parse(JSON.stringify(current)), aiBank, areas), current);
  const review = reviewAttempt(current, aiBank, areas);
  assert.equal(review.ids.length, Math.ceil(count / 3));
  assert.deepEqual(restoreAttempt(JSON.parse(JSON.stringify(review)), aiBank, areas)?.original, current);
  assert.equal(restoreAttempt(review, bank), null);
});

function finish(initial, isCorrect = () => true) {
  let current = initial;
  while (current.index < current.ids.length) {
    const question = questionFor(current.ids[current.index]);
    current = advance(confirmAnswer(current, bank, isCorrect(question, current.index) ? question.correctOption : wrongOption(question)));
  }
  return current;
}

test('practice keeps storage identity and presents the concise intro and result controls for every course', async () => {
  const script = readFileSync(new URL('../assets/quiz.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^load\(\);$/m, 'globalThis.loaded = load();');
  for (const hasExam of [true, false]) {
    for (const saved of [null, finish(attempt()), finish(attempt(), () => false), finishAttempt(attempt())]) {
      const courseRoute = hasExam ? 'EXAM-1' : 'data-governance';
      const storageKeys = [];
      const root = { innerHTML: '', addEventListener() {}, querySelector: () => ({ addEventListener() {}, focus() {} }) };
      const context = vm.createContext({
        document: { body: { dataset: { course: 'saved-course-id', courseRoute, courseHasExam: String(hasExam), base: '/certitips/', questionBank: 'questions', quizDomains: JSON.stringify(Object.fromEntries(domains.map(domain => [domain, domain]))) } }, querySelector: () => root, querySelectorAll: () => [] },
        fetch: async () => ({ ok: true, json: async () => bank }),
        newAttempt, confirmAnswer, advance, previous, finishAttempt, results, reviewAttempt, restoreAttempt,
        readStored: key => { storageKeys.push(key); return saved; }, writeStored: () => true,
      });
      vm.runInContext(script, context);
      await context.loaded;
      assert.deepEqual(storageKeys, ['certitips:quiz:v1:saved-course-id']);
      if (saved) {
        assert.match(root.innerHTML, /class="quiz-shell quiz-summary"/);
        assert.match(root.innerHTML, /class="quiz-summary-header"/);
        assert.match(root.innerHTML, /data-reset/);
        assert.match(root.innerHTML, /data-exit/);
        assert.match(root.innerHTML, /aria-label="Reiniciar" title="Reiniciar"/);
        assert.match(root.innerHTML, /aria-label="Salir" title="Salir"/);
        assert.match(root.innerHTML, /<table class="quiz-results" aria-label="[^"]+">/);
        assert.match(root.innerHTML, /<th scope="col">ESTADO<\/th><th scope="col">PREGUNTA<\/th>/);
        assert.equal((root.innerHTML.match(/data-question-index=/g) || []).length, saved.ids.length);
        const escapedQuestion = `1. ${questionFor(saved.ids[0]).question}`.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
        assert.ok(root.innerHTML.includes(`title="${escapedQuestion}"`), 'question tooltip must preserve the full numbered question');
        assert.doesNotMatch(root.innerHTML, /<caption>|data-review|data-restart|Ruta al examen oficial|Caso integrador|Vuelve a estos conceptos|Cada intento es una fotografía|Usa estos resultados|% de aciertos/);
      } else {
        assert.match(root.innerHTML, /data-start>Comenzar/);
        assert.match(root.innerHTML, /class="quiz-facts"/);
        assert.match(root.innerHTML, /class="quiz-start-action"/);
        assert.doesNotMatch(root.innerHTML, /Dos preguntas de cada área|No necesitas una cuenta|Las preguntas son originales|quiz-notice/);
      }
      assert.match(root.innerHTML, /class="quiz-heading"><div class="eyebrow">PRÁCTICA<\/div>/);
      assert.doesNotMatch(root.innerHTML, /examen|práctica oficial|exam-checklist|PRACTICA PARA ENTENDER|PRÁCTICA COMPLETADA/);
    }
  }
});

function replaceStorage(t, descriptor) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, ...descriptor });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  });
}

test('a new attempt contains 12 distinct questions and exactly two per domain', () => {
  const original = JSON.stringify(bank);
  const current = attempt();
  assert.equal(current.mode, 'practice');
  assert.equal(current.index, 0);
  assert.deepEqual(current.answers, {});
  assert.equal(current.ids.length, 12);
  assert.equal(new Set(current.ids).size, 12);
  for (const domain of domains) assert.equal(current.ids.filter(id => questionFor(id).domain === domain).length, 2);
  assert.equal(JSON.stringify(bank), original, 'selection must not mutate the shared bank');
});

test('an injected RNG makes selection reproducible while different choices change the selection', () => {
  assert.deepEqual(attempt(), attempt());
  assert.notDeepEqual(newAttempt(bank, () => 0).ids, newAttempt(bank, () => 0.999).ids);
  const source = ['a', 'b', 'c'];
  assert.deepEqual(shuffle(source, () => 0), ['b', 'c', 'a']);
  assert.deepEqual(source, ['a', 'b', 'c']);
});

test('an incomplete bank or duplicate selected IDs cannot start an attempt', () => {
  assert.throws(() => newAttempt(bank.filter(question => question.domain !== 'mcp')), /incompleto/);
  const repeated = domains.flatMap(domain => {
    const question = bank.find(item => item.domain === domain);
    return [question, question];
  });
  assert.throws(() => newAttempt(repeated), /incompleto/);
});

test('invalid answers and attempts to change a confirmed answer are rejected', () => {
  const original = attempt();
  const question = questionFor(original.ids[0]);
  for (const invalid of [undefined, null, '', 'z', '__proto__', question.options[0]]) {
    assert.strictEqual(confirmAnswer(original, bank, invalid), original);
  }
  const confirmed = confirmAnswer(original, bank, question.correctOption);
  assert.notStrictEqual(confirmed, original);
  assert.deepEqual(original.answers, {}, 'confirmation must preserve the previous state');
  assert.equal(confirmed.answers[question.id], question.correctOption);
  assert.strictEqual(confirmAnswer(confirmed, bank, wrongOption(question)), confirmed);
});

test('navigation waits for an answer and stops after the final question', () => {
  const initial = attempt();
  assert.strictEqual(advance(initial), initial);
  const first = questionFor(initial.ids[0]);
  const answered = confirmAnswer(initial, bank, first.correctOption);
  const second = advance(answered);
  assert.equal(second.index, 1);
  assert.strictEqual(advance(second), second, 'the next question also requires an answer');
  const completed = finish(second);
  assert.equal(completed.index, 12);
  assert.equal(Object.keys(completed.answers).length, 12);
  assert.strictEqual(advance(completed), completed);
  assert.strictEqual(confirmAnswer(completed, bank, 'a'), completed);
  assert.strictEqual(previous(completed), completed);
  assert.strictEqual(finishAttempt(completed), completed);
});

test('backward navigation preserves confirmed answers and restores the cursor in practice and review', () => {
  for (const initial of [attempt(), reviewAttempt(finish(attempt(), (_, index) => index % 2 === 0), bank)]) {
    assert.strictEqual(previous(initial), initial);
    let current = initial;
    for (let index = 0; index < 2; index++) {
      const question = questionFor(current.ids[current.index]);
      current = advance(confirmAnswer(current, bank, index ? wrongOption(question) : question.correctOption));
    }
    const saved = structuredClone(current);
    const back = previous(previous(current));
    assert.equal(back.index, 0);
    assert.deepEqual(back.answers, saved.answers);
    assert.deepEqual(back.ids, saved.ids);
    assert.deepEqual(back.original, saved.original);
    assert.deepEqual(results(back, bank), results(saved, bank));
    const restored = restoreAttempt(JSON.parse(JSON.stringify(back)), bank);
    assert.deepEqual(restored, back);
    assert.strictEqual(confirmAnswer(restored, bank, wrongOption(questionFor(restored.ids[0]))), restored);
    const resumed = advance(advance(restored));
    assert.deepEqual(resumed, saved);
    assert.strictEqual(advance(resumed), resumed, 'the next unanswered question still requires confirmation');
    assert.deepEqual(current, saved, 'backward navigation must not mutate its starting state');
  }
});

test('early finish preserves the cursor and scores only confirmed answers, including zero answers', () => {
  let current = attempt();
  const empty = finishAttempt(current);
  assert.deepEqual(results(empty, bank), { correct: 0, total: 0, wrong: [], domains: {} });
  assert.equal(empty.index, 0);
  assert.deepEqual(empty.ids, current.ids);
  assert.equal(current.finished, undefined);
  assert.deepEqual(restoreAttempt(JSON.parse(JSON.stringify(empty)), bank), empty);
  for (let index = 0; index < 2; index++) {
    const question = questionFor(current.ids[current.index]);
    current = advance(confirmAnswer(current, bank, index ? wrongOption(question) : question.correctOption));
  }
  for (const value of [current, previous(previous(current))]) {
    const ended = finishAttempt(value);
    assert.equal(ended.finished, true);
    assert.equal(ended.index, value.index);
    assert.deepEqual(ended.ids, value.ids);
    assert.deepEqual(ended.answers, value.answers);
    assert.deepEqual(restoreAttempt(JSON.parse(JSON.stringify(ended)), bank), ended);
    const report = results(ended, bank);
    assert.equal(report.correct, 1);
    assert.equal(report.total, 2);
    assert.deepEqual(report.wrong, [value.ids[1]]);
    assert.equal(Object.values(report.domains).reduce((total, domain) => total + domain.total, 0), 2);
    assert.strictEqual(finishAttempt(ended), ended);
    assert.strictEqual(previous(ended), ended);
    assert.strictEqual(advance(ended), ended);
    assert.strictEqual(confirmAnswer(ended, bank, questionFor(ended.ids[ended.index]).correctOption), ended);
  }
});

test('reviews of early finished attempts include actual mistakes and preserve the original partial result', () => {
  let current = attempt();
  for (let index = 0; index < 3; index++) {
    const question = questionFor(current.ids[current.index]);
    current = advance(confirmAnswer(current, bank, index === 1 ? question.correctOption : wrongOption(question)));
  }
  const original = finishAttempt(previous(current));
  const snapshot = structuredClone(original);
  const review = reviewAttempt(original, bank);
  assert.deepEqual(review.ids, [original.ids[0], original.ids[2]]);
  assert.deepEqual(review.original, snapshot);
  assert.deepEqual(restoreAttempt(JSON.parse(JSON.stringify(review)), bank), review);
  const first = questionFor(review.ids[0]);
  const endedReview = finishAttempt(advance(confirmAnswer(review, bank, wrongOption(first))));
  const repeated = reviewAttempt(endedReview, bank);
  assert.deepEqual(repeated.ids, [first.id], 'an unanswered review question is not a mistake');
  assert.deepEqual(repeated.original, snapshot);
  assert.equal(Object.hasOwn(repeated.original, 'original'), false);
  assert.deepEqual(restoreAttempt(JSON.parse(JSON.stringify(repeated)), bank), repeated);
  assert.deepEqual(results(repeated.original, bank), results(snapshot, bank));
  assert.equal(results(repeated.original, bank).total, 3);
  assert.deepEqual(original, snapshot);
});

test('scoring tracks correct, incorrect and per-domain totals', () => {
  const visited = new Set();
  const completed = finish(attempt(), question => {
    if (visited.has(question.domain)) return false;
    visited.add(question.domain);
    return true;
  });
  const report = results(completed, bank);
  assert.equal(report.correct, 6);
  assert.equal(report.total, 12);
  assert.equal(report.wrong.length, 6);
  for (const domain of domains) assert.deepEqual(report.domains[domain], { correct: 1, total: 2 });
  for (const id of report.wrong) assert.notEqual(completed.answers[id], questionFor(id).correctOption);
  assert.equal(results(finish(attempt()), bank).correct, 12);
  assert.equal(results(finish(attempt(), () => false), bank).correct, 0);
});

test('review includes only mistakes and keeps its score separate from the original attempt', () => {
  const original = finish(attempt(), (_, index) => index % 3 !== 0);
  const snapshot = structuredClone(original);
  const originalReport = results(original, bank);
  const review = reviewAttempt(original, bank);
  assert.equal(review.mode, 'review');
  assert.deepEqual(review.ids, originalReport.wrong);
  assert.deepEqual(review.answers, {});
  assert.equal(review.index, 0);
  assert.deepEqual(review.original, snapshot);
  assert.notStrictEqual(review.original, original);
  assert.notStrictEqual(review.original.answers, original.answers);
  assert.notStrictEqual(review.original.ids, original.ids);
  const completedReview = finish(review);
  const reviewReport = results(completedReview, bank);
  assert.equal(reviewReport.correct, 4);
  assert.equal(reviewReport.total, 4);
  assert.deepEqual(original, snapshot);
  assert.deepEqual(results(original, bank), originalReport);
  assert.equal(originalReport.correct, 8);
  assert.equal(reviewAttempt(finish(attempt()), bank).ids.length, 0);
});

test('repeated reviews preserve the same original practice after JSON restoration', () => {
  const original = finish(attempt(), (_, index) => index % 2 === 0);
  const firstReview = finish(reviewAttempt(original, bank), (_, index) => index !== 0);
  const repeated = reviewAttempt(firstReview, bank);
  assert.equal(repeated.ids.length, 1);
  assert.deepEqual(repeated.original, original);
  assert.equal(Object.hasOwn(repeated.original, 'original'), false, 'the snapshot must not create a chain of reviews');
  const restored = restoreAttempt(JSON.parse(JSON.stringify(repeated)), bank);
  assert.deepEqual(restored, repeated);
  const completed = finish(restored);
  assert.equal(results(completed, bank).correct, 1);
  assert.equal(results(completed.original, bank).correct, 6);
  original.answers[original.ids[0]] = wrongOption(questionFor(original.ids[0]));
  assert.equal(results(completed.original, bank).correct, 6, 'the saved snapshot must not alias the original answers');
});

test('a review rejects missing, incomplete, recursive or unrelated original practice', () => {
  const original = finish(attempt(), (_, index) => index % 2 === 0);
  const valid = reviewAttempt(original, bank);
  const missingAnswer = structuredClone(original);
  delete missingAnswer.answers[missingAnswer.ids[0]];
  for (const invalid of [undefined, null, {}, attempt(), missingAnswer, { ...original, version: 2 }, { ...original, mode: 'review' }, valid]) {
    assert.equal(restoreAttempt({ ...valid, original: invalid }, bank), null);
  }
  const recursive = { ...valid };
  recursive.original = recursive;
  assert.equal(restoreAttempt(recursive, bank), null, 'a review cannot recursively refer to another review');
  const originallyCorrect = original.ids.find(id => original.answers[id] === questionFor(id).correctOption);
  assert.equal(restoreAttempt({ ...valid, ids: [originallyCorrect] }, bank), null);
  const outsideOriginal = bank.find(question => !original.ids.includes(question.id)).id;
  assert.equal(restoreAttempt({ ...valid, ids: [outsideOriginal] }, bank), null);
  assert.equal(restoreAttempt({ ...valid, original: finish(attempt()) }, bank), null);
  assert.throws(() => reviewAttempt(attempt(), bank), /Completa/);
  assert.throws(() => reviewAttempt(valid, bank), /Completa/, 'an unfinished review cannot be reviewed again');
});

test('quota failures and another tab cannot replace the practice associated with a review', t => {
  const values = new Map();
  let quotaExceeded = false;
  replaceStorage(t, { value: {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { if (quotaExceeded) throw new Error('quota exceeded'); values.set(key, value); }
  }, writable: true });
  const tabA = reviewAttempt(finish(attempt(), (_, index) => index < 7), bank);
  assert.equal(writeStored('attempt', tabA), true);
  const restoredA = restoreAttempt(readStored('attempt', null), bank);
  const tabB = reviewAttempt(finish(newAttempt(bank, () => 0.999), (_, index) => index < 3), bank);
  assert.equal(writeStored('attempt', tabB), true);
  assert.equal(results(restoredA.original, bank).correct, 7, 'a different tab must not affect the active snapshot');
  const restoredB = restoreAttempt(readStored('attempt', null), bank);
  assert.equal(results(restoredB.original, bank).correct, 3, 'the stored review must remain paired with its own practice');
  quotaExceeded = true;
  const completedA = finish(restoredA);
  assert.equal(writeStored('attempt', completedA), false);
  assert.equal(results(completedA, bank).correct, 5);
  assert.equal(results(completedA.original, bank).correct, 7, 'the in-memory result must survive a failed save');
  assert.equal(results(restoreAttempt(readStored('attempt', null), bank).original, bank).correct, 3);
});

test('valid saved attempts restore before and after confirmation, at completion and in review mode', () => {
  const initial = attempt();
  const question = questionFor(initial.ids[0]);
  const confirmed = confirmAnswer(initial, bank, question.correctOption);
  const completed = finish(attempt(), (_, index) => index !== 2);
  const review = reviewAttempt(completed, bank);
  for (const value of [initial, confirmed, advance(confirmed), completed, review, finish(review)]) {
    const restored = restoreAttempt(JSON.parse(JSON.stringify(value)), bank);
    assert.deepEqual(restored, value);
    assert.notStrictEqual(restored, value);
    assert.notStrictEqual(restored.ids, value.ids);
    assert.notStrictEqual(restored.answers, value.answers);
  }
});

test('invalid, stale and malformed saved state is discarded', () => {
  const valid = attempt();
  const invalidValues = [
    null, false, 'corrupt', [], {},
    { ...valid, version: 0 },
    { ...valid, version: 2 },
    { ...valid, mode: 'exam' },
    { ...valid, ids: null },
    { ...valid, ids: [] },
    { ...valid, ids: [...valid.ids, valid.ids[0]] },
    { ...valid, ids: [valid.ids[0], ...valid.ids.slice(0, -1)] },
    { ...valid, ids: ['removed-question', ...valid.ids.slice(1)] },
    { ...valid, ids: valid.ids.slice(0, -1) },
    { ...valid, index: -1 },
    { ...valid, index: 13 },
    { ...valid, index: 0.5 },
    { ...valid, index: '0' },
    { ...valid, answers: null },
    { ...valid, answers: [] },
    { ...valid, answers: 'a' },
    { ...valid, answers: { [valid.ids[0]]: 'z' } },
    { ...valid, answers: { 'removed-question': 'a' } }
  ];
  for (const value of invalidValues) assert.equal(restoreAttempt(value, bank), null, JSON.stringify(value));
  const unavailableBank = bank.filter(question => question.id !== valid.ids[0]);
  assert.equal(restoreAttempt(valid, unavailableBank), null, 'a removed bank question invalidates saved progress');
  const unbalanced = structuredClone(valid);
  const replacement = bank.find(question => question.domain !== questionFor(valid.ids[0]).domain && !valid.ids.includes(question.id));
  unbalanced.ids[0] = replacement.id;
  assert.equal(restoreAttempt(unbalanced, bank), null, 'practice cannot restore a changed domain balance');
});

test('restoration rejects skipped questions, noncontiguous answers and false completion', () => {
  const valid = attempt();
  const first = valid.ids[0];
  const second = valid.ids[1];
  const third = valid.ids[2];
  assert.equal(restoreAttempt({ ...valid, index: 1 }, bank), null);
  assert.equal(restoreAttempt({ ...valid, index: 12 }, bank), null);
  assert.equal(restoreAttempt({ ...valid, answers: { [second]: 'a' } }, bank), null);
  assert.equal(restoreAttempt({ ...valid, index: 1, answers: { [first]: 'a', [third]: 'a' } }, bank), null);
  const completed = finish(valid);
  delete completed.answers[first];
  assert.equal(restoreAttempt(completed, bank), null);
});

test('finished state requires a boolean and never bypasses cursor or answer-prefix validation', () => {
  const valid = attempt();
  for (const finished of [undefined, null, 0, 1, 'true', [], {}]) {
    assert.equal(restoreAttempt({ ...valid, finished }, bank), null);
  }
  for (const finished of [true, false]) {
    const value = { ...valid, finished };
    assert.deepEqual(restoreAttempt(JSON.parse(JSON.stringify(value)), bank), value);
    assert.equal(restoreAttempt({ ...value, index: value.ids.length }, bank), null);
    assert.equal(restoreAttempt({ ...value, answers: { [value.ids[1]]: 'a' } }, bank), null);
    assert.equal(restoreAttempt({ ...value, answers: { [value.ids[0]]: 'a', [value.ids[2]]: 'a' } }, bank), null);
  }
  const inherited = Object.assign(Object.create({ finished: true }), valid);
  assert.deepEqual(restoreAttempt(inherited, bank), valid);
});

test('prototype-like answer keys cannot enter a restored attempt or satisfy previous answers', () => {
  const valid = attempt();
  for (const name of ['__proto__', 'constructor', 'prototype']) {
    const answers = JSON.parse(`{"${name}":"a"}`);
    assert.equal(restoreAttempt({ ...valid, answers }, bank), null);
  }
  const inheritedAnswer = Object.create({ [valid.ids[0]]: 'a' });
  assert.equal(restoreAttempt({ ...valid, index: 1, answers: inheritedAnswer }, bank), null);
  const extraMetadata = JSON.parse(JSON.stringify(valid).replace('"version":1', '"version":1,"__proto__":{"polluted":true}'));
  const restored = restoreAttempt(extraMetadata, bank);
  assert.deepEqual(restored, valid);
  assert.equal(Object.hasOwn(restored, '__proto__'), false);
  assert.equal(Object.prototype.polluted, undefined);
});

test('storage reads return fallback for missing, corrupt or inaccessible values', () => {
  const fallback = { available: false };
  for (const raw of [null, 'null', '{broken', undefined]) {
    assert.strictEqual(readStored('attempt', fallback, { getItem: () => raw }), fallback);
  }
  assert.strictEqual(readStored('attempt', fallback, { getItem() { throw new Error('blocked'); } }), fallback);
  assert.strictEqual(readStored('attempt', fallback, null), fallback);
  assert.deepEqual(readStored('attempt', fallback, { getItem: () => '{"index":3}' }), { index: 3 });
  assert.equal(readStored('flag', true, { getItem: () => 'false' }), false);
  assert.equal(readStored('count', 1, { getItem: () => '0' }), 0);
});

test('a saved attempt round-trips through storage and restoration', t => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  replaceStorage(t, { value: storage, writable: true });
  const initial = attempt();
  const confirmed = confirmAnswer(initial, bank, questionFor(initial.ids[0]).correctOption);
  assert.equal(writeStored('attempt', confirmed), true);
  assert.strictEqual(getStorage(), storage);
  assert.deepEqual(restoreAttempt(readStored('attempt', null), bank), confirmed);
  assert.equal(values.size, 1);
});

test('storage quota failures return false and an in-memory attempt still works', t => {
  replaceStorage(t, { value: { setItem() { throw new Error('quota exceeded'); }, getItem: () => null }, writable: true });
  const current = attempt();
  assert.equal(writeStored('attempt', current), false);
  assert.equal(results(finish(current), bank).correct, 12);
});

test('a blocked localStorage property getter is caught by both reads and writes', t => {
  replaceStorage(t, { get() { throw new Error('SecurityError'); } });
  const fallback = { mode: 'memory' };
  assert.strictEqual(readStored('attempt', fallback), fallback);
  assert.equal(getStorage().getItem('attempt'), null);
  assert.equal(writeStored('attempt', attempt()), false);
});

test('missing localStorage and serialization failure do not crash the quiz', t => {
  replaceStorage(t, { value: undefined, writable: true });
  assert.equal(readStored('attempt', null), null);
  assert.equal(writeStored('attempt', attempt()), false);
  globalThis.localStorage = { setItem() { assert.fail('invalid JSON must never reach storage'); } };
  const circular = {};
  circular.self = circular;
  assert.equal(writeStored('attempt', circular), false);
});

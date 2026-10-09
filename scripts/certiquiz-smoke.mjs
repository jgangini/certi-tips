// Local load check: node scripts/certiquiz-smoke.mjs --players=500
// Add --poll-mode=fixed for the former fixed-cadence stress test.
// Public room creation issues an opaque host session; no host key is needed.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

const argumentsByName = Object.fromEntries(process.argv.slice(2).map(value => value.replace(/^--/, '').split(/=(.*)/s, 2)));
const origin = argumentsByName.origin || 'http://127.0.0.1:18740';
const frontendOrigin = argumentsByName['frontend-origin'] || (new URL(origin).protocol === 'http:' ? 'http://127.0.0.1:4173' : 'https://jgangini.github.io');
const players = Number(argumentsByName.players || 2);
const pollMode = argumentsByName['poll-mode'] || 'browser';
assert(['browser', 'fixed'].includes(pollMode), 'Choose poll mode browser or fixed.');
assert(Number.isInteger(players) && players >= 2 && players <= 500, 'Choose 2–500 participants.');
assert(players <= 100 || ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname), 'Load checks above 100 participants are restricted to loopback.');
const waveSize = 64;
const samples = [];
const pollGaps = [];
const started = performance.now();
const report = { ok: false, players, answerConcurrency: waveSize, phases: {}, polling: { mode: pollMode, intervalMs: 1000, jitterMs: pollMode === 'fixed' ? 100 : 0, requests: 0, notModified: 0, byStatus: { lobby: 0, question: 0, reveal: 0, ranking: 0, finished: 0 }, skippedCadences: 0, busyDeferrals: 0, maxInFlight: 0 } };
let activePolls = 0;
function client() {
  const cookies = new Map();
  return async (path, body, expected = 200, kind = 'control') => {
    const start = performance.now();
    const sample = { kind, status: null, ok: false, ms: 0 };
    if (kind === 'poll') report.polling.maxInFlight = Math.max(report.polling.maxInFlight, ++activePolls);
    try {
      const response = await fetch(origin + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Origin: frontendOrigin, 'X-CertiQuiz': '1', 'Content-Type': 'application/json', Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15000),
      });
      sample.status = response.status;
      for (const cookie of response.headers.getSetCookie()) {
        const [name, ...value] = cookie.split(';')[0].split('=');
        cookies.set(name, value.join('='));
      }
      const payload = await response.text();
      assert([expected].flat().includes(response.status), `${kind} ${path}: unexpected HTTP ${response.status}`);
      const data = response.status === 204 ? null : JSON.parse(payload);
      sample.ok = true;
      return data;
    } finally {
      sample.ms = performance.now() - start;
      samples.push(sample);
      if (kind === 'poll') activePolls -= 1;
    }
  };
}
async function batches(items, operation) {
  // ponytail: bound join/answer waves to 64; polling remains one independent loop per participant.
  for (let offset = 0; offset < items.length; offset += waveSize) {
    const results = await Promise.allSettled(items.slice(offset, offset + waveSize).map(operation));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
  }
}

const host = client();
const guest = client();
const participants = Array.from({ length: players }, (_, index) => ({ request: client(), nickname: `Prueba ${String(index + 1).padStart(3, '0')}`, polls: 0, busy: false, snapshot: null, questions: new Map() }));
let code;
let polling = [];
let pollingStarted;
let stopPolling = false;
let pollFailure;
try {
  assert.equal((await host('/api/health')).ok, true);
  const catalog = await host('/api/catalog');
  assert.equal(catalog.limits.maxPlayers, 500, 'Rebuild the API with the 500-player limit before this check.');
  const course = catalog.courses[0];
  const sourceCatalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  const sourceCourse = sourceCatalog.courses.find(item => item.id === course.id);
  const questionBank = JSON.parse(await readFile(new URL(`../data/${sourceCourse.questionBank || 'questions'}.json`, import.meta.url), 'utf8'));
  report.questionCount = players === 500 ? Math.min(catalog.limits.maxQuestions, course.questionCount) : 2;
  const room = await host('/api/rooms', { courseId: course.id, questionCount: report.questionCount, secondsPerQuestion: 10 }, 201);
  code = room.code;
  assert.equal((await host('/api/session')).host, true);
  const route = `/api/rooms/${code}`;
  await guest(route, undefined, 403, 'access-denied');
  const joining = performance.now();
  await batches(participants, async player => { await player.request(`${route}/join`, { nickname: player.nickname }, 200, 'join'); });
  report.phases.joinMs = Math.round(performance.now() - joining);
  assert.equal((await host(route)).players.length, players);
  if (players === 500) {
    const full = await guest(`${route}/join`, { nickname: 'Participante-501' }, 409, 'capacity-denied');
    assert.match(full.detail, /completa/i);
    assert.equal((await host(route)).playerCount, 500);
    report.capacity501Rejected = true;
  }
  pollingStarted = performance.now();
  polling = participants.map(async (player, index) => {
    // Browser mode follows schedulePoll: one second after completion, deferred while answering.
    let next = pollingStarted + (index + Math.random()) * 1000 / players;
    let previousStart;
    while (!stopPolling) {
      await delay(Math.max(0, next - performance.now()));
      if (stopPolling) break;
      if (pollMode === 'browser' && player.busy) { next = performance.now() + 1000; report.polling.busyDeferrals += 1; continue; }
      const pollStart = performance.now();
      if (previousStart !== undefined) pollGaps.push(pollStart - previousStart);
      previousStart = pollStart;
      try {
        const updated = await player.request(route + (player.snapshot ? `?version=${player.snapshot.version}` : ''), undefined, [200, 204], 'poll');
        if (updated && (!player.snapshot || updated.version >= player.snapshot.version)) player.snapshot = updated;
        const snapshot = player.snapshot;
        assert(snapshot, 'A first poll must return a full snapshot.');
        assert.equal(snapshot.code, code);
        assert.equal(snapshot.playerCount, players);
        player.polls += 1;
        report.polling.requests += 1;
        report.polling.notModified += Number(updated === null);
        report.polling.byStatus[snapshot.status] += 1;
        if (updated?.status === 'question' && !player.questions.has(updated.question.id)) player.questions.set(updated.question.id, performance.now());
      } catch (error) { pollFailure ||= error; stopPolling = true; }
      if (pollMode === 'browser') next = performance.now() + 1000;
      else {
        next += 950 + Math.random() * 100;
        while (next < performance.now()) { next += 1000; report.polling.skippedCadences += 1; }
      }
    }
  });
  await delay(3000);
  report.phases.lobbyPollMs = Math.round(performance.now() - pollingStarted);
  if (pollFailure) throw pollFailure;
  let dispatchedAt = performance.now();
  let question = await host(`${route}/start`, {});
  let totalPoints = 0;
  for (let index = 0; index < 2; index += 1) {
    const questionStarted = performance.now();
    assert.equal(question.status, 'question');
    assert.equal(question.question.correctOption, undefined);
    const source = questionBank.find(item => item.id === question.question.id);
    assert(source, 'The service question is absent from the source bank.');
    const wrong = question.question.options.find(option => option.id !== source.correctOption).id;
    await delay(1500);
    if (pollFailure) throw pollFailure;
    const answering = performance.now();
    // Leave the last participant unanswered so each question exercises its full
    // server deadline while all participants keep polling.
    await batches(participants.slice(0, -1), async player => {
      const optionId = player === participants[0] ? source.correctOption : wrong;
      player.busy = true;
      try {
        const result = await player.request(`${route}/answers`, { questionId: question.question.id, optionId }, 200, 'answer');
        if (!player.snapshot || result.version >= player.snapshot.version) player.snapshot = result;
        assert.equal(result.me.answer, optionId);
      } finally { player.busy = false; }
    });
    const answerMs = Math.round(performance.now() - answering);
    await delay(Math.max(0, question.deadline - question.serverNow + 250 - (performance.now() - questionStarted)));
    const revealed = await host(route);
    if (pollFailure) throw pollFailure;
    assert.equal(revealed.status, 'reveal');
    assert.equal(revealed.answeredCount, players - 1);
    assert.equal(revealed.leaderboard[0].nickname, 'Prueba 001');
    const score = revealed.leaderboard[0].score;
    assert(Number.isInteger(score) && score - totalPoints >= 500 && score - totalPoints <= 1000);
    totalPoints = score;
    assert.equal(revealed.leaderboard[1].score, 0);
    assert(participants.every(player => player.questions.has(question.question.id)), 'A participant never received the open question while polling.');
    const arrivals = participants.map(player => player.questions.get(question.question.id) - dispatchedAt).sort((a, b) => a - b);
    report.phases[`question${index + 1}`] = { durationMs: Math.round(performance.now() - questionStarted), answerWaveMs: answerMs, answered: players - 1, synchronizedPlayers: players, arrivalP95Ms: Math.round(arrivals[Math.ceil(players * .95) - 1]), arrivalMaxMs: Math.round(arrivals.at(-1)) };
    if (pollMode === 'browser') assert(arrivals.at(-1) <= 2000, 'Question delivery exceeds 2000ms.');
    await participants[0].request(`${route}/answers`, { questionId: question.question.id, optionId: source.correctOption }, 200, 'replay');
    assert.equal((await participants[0].request(route)).me.score, totalPoints, 'Replay changed the score.');
    if (index === 0) {
      const revealPolling = performance.now();
      await delay(3000);
      report.phases.revealPollMs = Math.round(performance.now() - revealPolling);
      if (pollFailure) throw pollFailure;
      await participants[0].request(`${route}/next`, {}, 401, 'access-denied');
      const previous = question.question.id;
      const ranking = await host(`${route}/next`, {});
      assert.equal(ranking.status, 'ranking');
      assert.equal(ranking.deadline, null);
      assert.equal(ranking.question, null);
      assert.deepEqual(ranking.leaderboard, revealed.leaderboard);
      await delay(1500);
      assert(participants.every(player => player.snapshot.status === 'ranking'), 'A participant missed the shared ranking stage.');
      dispatchedAt = performance.now();
      question = await host(`${route}/next`, {});
      await participants[0].request(`${route}/answers`, { questionId: previous, optionId: source.correctOption }, 409, 'stale-denied');
    }
  }
  const final = await host(`${route}/finish`, {});
  assert.equal(final.status, 'finished');
  assert.equal(final.leaderboard[0].score, totalPoints);
  report.winner = final.leaderboard[0].nickname;
  report.checks = ['private rooms', '500-player ceiling when requested', 'lobby and reveal polling', 'answers during polling', 'two server deadlines', 'server ranking', 'idempotent replay', 'host authorization', 'stale answer', 'all players receive both questions'];
  report.ok = true;
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  stopPolling = true;
  await Promise.all(polling);
  report.polling.durationMs = pollingStarted ? Math.round(performance.now() - pollingStarted) : 0;
  pollGaps.sort((a, b) => a - b);
  const gapP95 = pollGaps[Math.max(0, Math.ceil(pollGaps.length * .95) - 1)] || 0;
  report.polling.requestsPerSecond = Number((report.polling.requests / Math.max(1, report.polling.durationMs) * 1000).toFixed(2));
  report.polling.startGapP95Ms = Math.round(gapP95);
  report.polling.startGapMaxMs = Math.round(pollGaps.at(-1) || 0);
  if (code) await host(`/api/rooms/${code}/finish`, {}, 200, 'cleanup').catch(() => {});
  await host('/api/logout', {}, 200, 'cleanup').catch(() => {});
  if (pollFailure) { report.ok = false; report.error ||= pollFailure.message; process.exitCode = 1; }
  report.elapsedMs = Math.round(performance.now() - started);
  report.polling.minPerPlayer = Math.min(...participants.map(player => player.polls));
  report.polling.maxPerPlayer = Math.max(...participants.map(player => player.polls));
  const groups = { all: samples };
  for (const sample of samples) (groups[sample.kind] ||= []).push(sample);
  report.requests = Object.fromEntries(Object.entries(groups).map(([kind, records]) => {
    const times = records.map(record => record.ms).sort((a, b) => a - b);
    return [kind, { count: records.length, errors: records.filter(record => !record.ok).length, p95Ms: Math.round(times[Math.max(0, Math.ceil(times.length * .95) - 1)] || 0), maxMs: Math.round(times.at(-1) || 0) }];
  }));
  const skippedFraction = report.polling.skippedCadences / Math.max(1, report.polling.requests + report.polling.skippedCadences);
  report.polling.skippedPercent = Number((skippedFraction * 100).toFixed(2));
  if (players === 500) {
    const failures = [];
    if ((report.requests.poll?.p95Ms ?? Infinity) > 1000) failures.push('Polling p95 exceeds 1000ms.');
    if ((report.requests.answer?.p95Ms ?? Infinity) > 1000) failures.push('Answer p95 exceeds 1000ms.');
    if (report.requests.all.maxMs >= 10000) failures.push('A request reached the frontend timeout of 10000ms.');
    if (pollMode === 'fixed' && skippedFraction > .05) failures.push('More than 5% of polling cadences were skipped.');
    if (pollMode === 'browser' && gapP95 > 2000) failures.push('Polling start-gap p95 exceeds 2000ms.');
    report.acceptance = { pollP95AtMostMs: 1000, answerP95AtMostMs: 1000, requestMaxBelowMs: 10000, ...(pollMode === 'fixed' ? { skippedCadencesAtMostPercent: 5 } : { startGapP95AtMostMs: 2000, questionArrivalMaxAtMostMs: 2000 }), failures };
    if (failures.length) { report.ok = false; report.error ||= failures.join(' '); process.exitCode = 1; }
  }
  if (report.requests.all.errors) { report.ok = false; process.exitCode = 1; }
  console.log(JSON.stringify(report));
}

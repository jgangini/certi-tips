import test from 'node:test';
import assert from 'node:assert/strict';
import { globSync, readFileSync } from 'node:fs';
import { validateSite } from '../scripts/check-site.mjs';
import { courseRoute } from '../scripts/layout.mjs';
import { loadVideos } from '../scripts/certitube.mjs';
import { fileURLToPath } from 'node:url';

test('publishes only current pages without course aliases or redirects', async () => {
  const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  const dist = new URL('../dist/', import.meta.url);
  const pages = globSync('**/*.html', { cwd: dist }).map(file => file.replaceAll('\\', '/'));
  const videos = await loadVideos(fileURLToPath(new URL('../', import.meta.url)), catalog.base);
  const expected = ['index.html', '404.html', 'certichat/index.html', 'certiquiz/index.html', 'certitube/index.html', 'cursos/index.html',
    ...videos.map(video => `${video.publicPath}/index.html`),
    ...catalog.courses.flatMap(course => [...course.modules, ...course.resources].map(page => `${courseRoute(course)}/${page.slug}/index.html`))];
  assert.deepEqual(pages.sort(), expected.sort());
  if (videos.length) assert.equal(readFileSync(new URL('certitube/index.html', dist), 'utf8'), readFileSync(new URL(`${videos[0].publicPath}/index.html`, dist), 'utf8'));
  for (const file of pages) assert.doesNotMatch(readFileSync(new URL(file, dist), 'utf8'), /http-equiv=["']refresh["']/i, file);
});

function fixture() {
  const slugs = ['overview', 'agents', 'langchain', 'mcp', 'openai', 'oci-enterprise', 'oracle-database'];
  const catalog = { base: '/certitips/', origin: 'https://example.test', courses: [{ id: 'course', questionBank: 'questions', coverage: 'coverage', lessonCounts: [1, 7, 8, 8, 11, 9, 9], exam: { code: 'course' }, modules: slugs.map((slug, i) => ({ slug, type: i ? 'module' : 'orientation' })), resources: [{ slug: 'practice' }] }] };
  const files = new Map([['index.html', '<main id="main"><a href="/certitips/course/agents/#conceptos-clave">Guide</a><img src="/certitips/assets/logo.svg"><script type="module" src="/certitips/assets/main.js"></script></main>'], ['assets/logo.svg', '<svg></svg>'], ['assets/main.js', 'import { ready } from "./helper.js";'], ['assets/helper.js', 'export const ready = true;']]);
  for (const slug of [...slugs, 'practice']) files.set(`course/${slug}/index.html`, '<main id="conceptos-clave"><a href="#conceptos-clave">Section</a></main>');
  const diagrams = ['agent-loop', 'guardrails', 'langchain-flow', 'mcp-architecture', 'openai-stack', 'handoffs', 'oci-runtime', 'vector-search', 'database-capabilities'];
  for (const diagram of diagrams) {
    files.set(`course/agents/img/${diagram}.svg`, '<svg xmlns="http://www.w3.org/2000/svg"><title>Concept</title><desc>An explanation.</desc><defs><marker id="arrow"/></defs><path marker-end="url(#arrow)"/></svg>');
    files.set('index.html', `${files.get('index.html')}<img src="/certitips/course/agents/img/${diagram}.svg" alt="Concept">`);
  }
  const questions = slugs.slice(1).flatMap(domain => Array.from({ length: 6 }, (_, i) => ({ id: `${domain}-${i + 1}`, domain, question: 'Which choice works?', options: ['a', 'b', 'c', 'd'].map(id => ({ id, text: `Choice ${id}`, explanation: `Reason ${id}` })), correctOption: 'b', reference: { module: domain, anchor: 'conceptos-clave', label: 'Review this concept' } })));
  files.set('assets/questions.json', JSON.stringify(questions));
  const coverage = [1, 7, 8, 8, 11, 9, 9].flatMap((count, group) => Array.from({ length: count }, (_, i) => ({ lesson: `01-${String(group + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}-lesson.md`, module: slugs[group], anchor: 'conceptos-clave' })));
  return { files, catalog, questions: { course: questions }, coverage: { course: coverage } };
}

const includesIssue = (issues, pattern) => assert.ok(issues.some(issue => pattern.test(issue)), `Expected ${pattern}; got:\n${issues.join('\n')}`);

test('accepts a self-contained course under the GitHub Pages base path', () => {
  assert.deepEqual(validateSite(fixture()), []);
});

test('validates an applied course and its question references without an exam code', () => {
  const input = fixture();
  delete input.catalog.courses[0].exam;
  assert.deepEqual(validateSite(input), []);
  input.files.delete('course/agents/index.html');
  const issues = validateSite(input);
  includesIssue(issues, /missing published page course\/agents\/index\.html/);
  includesIssue(issues, /data\/questions\.json\[0\].*missing target.*course\/agents/);
});

test('validates a second course with independent coverage and bank, including its failures', () => {
  const input = fixture();
  const second = { ...input.catalog.courses[0], id: 'second', exam: { code: 'EXAM-2' }, questionBank: 'second-questions', coverage: 'second-coverage', lessonCounts: [1, 2], modules: input.catalog.courses[0].modules.slice(0, 2) };
  input.catalog.courses.push(second);
  input.questions.second = structuredClone(input.questions.course.slice(0, 6));
  input.coverage.second = structuredClone(input.coverage.course.slice(0, 3));
  for (const page of [...second.modules, ...second.resources]) input.files.set(`EXAM-2/${page.slug}/index.html`, '<main id="conceptos-clave"></main>');
  input.files.set('assets/second-questions.json', JSON.stringify(input.questions.second));
  assert.deepEqual(validateSite(input), []);
  input.coverage.second[2].anchor = 'missing';
  input.questions.second[0].options[1].explanation = '';
  const issues = validateSite(input);
  includesIssue(issues, /data\/second-coverage\.json\[2\].*missing anchor #missing/);
  includesIssue(issues, /data\/second-questions\.json\[0\].*correct alternative needs a nonempty explanation/);
  includesIssue(issues, /assets\/second-questions\.json: published question bank differs/);
  assert.ok(!issues.some(issue => /data\/(?:questions|coverage)\.json/.test(issue)));
});

test('reports broken assets and exact-case route mismatches', () => {
  const input = fixture();
  input.files.delete('assets/logo.svg');
  input.files.set('index.html', `${input.files.get('index.html')}<a href="/certitips/course/Agents/index.html">Bad case</a>`);
  const issues = validateSite(input);
  includesIssue(issues, /index\.html: missing target .*assets\/logo\.svg/);
  includesIssue(issues, /case mismatch; actual: course\/agents\/index\.html/);
});

test('checks local anchors, encoded fragments and links escaping the base', () => {
  const input = fixture();
  input.files.set('course/agents/index.html', '<main id="conceptos-clave"><a href="#CONCEPTOS">bad</a><a href="#conceptos%2Dclave">good</a><a href="/course/agents/">outside</a></main>');
  const issues = validateSite(input);
  includesIssue(issues, /missing anchor #CONCEPTOS/);
  includesIssue(issues, /internal URL is outside \/certitips\//);
  assert.ok(!issues.some(issue => issue.includes('conceptos%2Dclave')));
});

test('forbids external assets while allowing external source links', () => {
  const input = fixture();
  input.files.set('index.html', `${input.files.get('index.html')}<a href="https://docs.oracle.com/">Source</a><img src="https://remote.test/image.svg"><script src="//remote.test/app.js"></script><link rel="stylesheet" href="https://remote.test/style.css">`);
  const issues = validateSite(input);
  assert.equal(issues.filter(issue => issue.includes('external asset')).length, 3);
  assert.ok(!issues.some(issue => issue.includes('docs.oracle.com')));
});

test('checks CSS resources, JavaScript imports and unresolved build tokens', () => {
  const input = fixture();
  input.files.set('assets/main.js', 'import "./missing.js";');
  input.files.set('assets/site.css', '.hero { background-image: url("./missing.svg"); } /* {{base}} */');
  const issues = validateSite(input);
  includesIssue(issues, /assets\/main\.js: missing target \.\/missing\.js/);
  includesIssue(issues, /assets\/site\.css: missing target \.\/missing\.svg/);
  includesIssue(issues, /unresolved \{\{base\}\}/);
});

test('module references ignore quoted vendor examples and still check static and lazy imports', () => {
  const input = fixture();
  input.files.set('assets/vendor.js', `console.warn("import Remarkable from 'remarkable';\\nimport linkify from 'remarkable/linkify'");
    const options = { key: 'from', method: '_import' };
    // import './comment.js';
    /* export { value } from './example.js'; */
    import { value } from './static.js';
    export { other } from './reexport.js';
    await import('./lazy.js');`);
  const issues = validateSite(input).filter(issue => issue.startsWith('assets/vendor.js:'));
  assert.equal(issues.length, 3);
  for (const file of ['static', 'reexport', 'lazy']) includesIssue(issues, new RegExp(`missing target \\./${file}\\.js`));
});

test('rejects copied transcripts, local source paths and box-drawing schematics', () => {
  const input = fixture();
  input.files.set('sources/01-01-01-original.md', 'Original notes');
  input.files.set('assets/transcript.json', '{}');
  input.files.set('index.html', `${input.files.get('index.html')}<p>D:\\Desktop\\oci_mylearn\\original.md</p><pre>+-----+\n| box |\n+-----+</pre>`);
  const issues = validateSite(input);
  assert.equal(issues.filter(issue => issue.includes('transcript must not be deployed')).length, 2);
  includesIssue(issues, /absolute Desktop source path/);
  includesIssue(issues, /ASCII\/box-drawing schematic/);
});

test('requires diagram use, accessible descriptions and self-contained SVG content', () => {
  const input = fixture();
  input.files.set('course/agents/img/agent-loop.svg', '<svg><title>Loop</title><script>alert(1)</script><use href="https://remote.test/icon.svg"/></svg>');
  input.files.set('index.html', input.files.get('index.html').replace('<img src="/certitips/course/agents/img/guardrails.svg" alt="Concept">', ''));
  const issues = validateSite(input);
  includesIssue(issues, /agent-loop\.svg: missing nonempty SVG desc/);
  includesIssue(issues, /<script> is not allowed/);
  includesIssue(issues, /external SVG resource/);
  includesIssue(issues, /guardrails\.svg: diagram is not used/);
});

test('requires a complete bank with unique questions and four valid choices', () => {
  const input = fixture();
  input.questions.course[1].id = input.questions.course[0].id;
  input.questions.course[0].correctOption = 'e';
  delete input.questions.course[0].options[0].explanation;
  input.questions.course[2].options.pop();
  input.questions.course.pop();
  const issues = validateSite(input);
  includesIssue(issues, /expected 36 questions, received 35/);
  includesIssue(issues, /question id must be nonempty and unique/);
  includesIssue(issues, /correctOption does not identify an alternative/);
  includesIssue(issues, /every alternative needs text and an explanation/);
  includesIssue(issues, /exactly four alternatives/);
  includesIssue(issues, /oracle-database: expected 6 questions, received 5/);
});

test('accepts source-sized banks without inventing explanations for distractors', () => {
  const input = fixture();
  const course = input.catalog.courses[0];
  course.questionCounts = Object.fromEntries(course.modules.slice(1).map((module, index) => [module.slug, index ? 6 : 2]));
  input.questions.course = input.questions.course.filter(question => question.domain !== 'agents' || /-[12]$/.test(question.id));
  for (const question of input.questions.course) for (const option of question.options) {
    if (option.id !== question.correctOption) option.explanation = '';
  }
  input.files.set('assets/questions.json', JSON.stringify(input.questions.course));
  assert.deepEqual(validateSite(input), []);
  input.questions.course[0].options[1].explanation = '';
  includesIssue(validateSite(input), /correct alternative needs a nonempty explanation/);
  for (const invalid of [null, [], 'six', { ...course.questionCounts, agents: 1 }, { ...course.questionCounts, agents: '2' }, { ...course.questionCounts, unknown: 2 }]) {
    course.questionCounts = invalid;
    includesIssue(validateSite(input), /questionCounts must declare at least two questions for every domain/);
  }
});

test('SVG illustrations allow inline PNG only and still reject active or external content', () => {
  const input = fixture();
  const file = 'course/agents/img/oci-runtime.svg';
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=';
  const diagram = image => `<svg><title>Runtime</title><desc>Illustrated runtime.</desc>${image}</svg>`;
  input.files.set(file, diagram(`<image href="${png}"/>`));
  assert.deepEqual(validateSite(input), []);
  for (const href of ['https://remote.test/image.png', '../image.png', 'data:image/png;base64,not-a-png', 'data:image/svg+xml;base64,PHN2Zz4=']) {
    input.files.set(file, diagram(`<image href="${href}"/>`));
    includesIssue(validateSite(input), /embedded SVG element <image> is not allowed/);
  }
  input.files.set(file, diagram(`<image href="${png}" onload="alert(1)"/>`));
  includesIssue(validateSite(input), /SVG event handler onload is not allowed/);
});

test('validates newly added diagrams as well as the required originals', () => {
  const input = fixture();
  const file = 'course/agents/img/new-concept.svg';
  input.files.set('index.html', `${input.files.get('index.html')}<img src="/certitips/${file}" alt="New concept">`);
  input.files.set(file, '<svg><title>New concept</title><desc>A useful explanation.</desc></svg>');
  assert.deepEqual(validateSite(input), []);
  input.files.set(file, '<svg onload="alert(1)"><title>New concept</title><script>alert(1)</script></svg>');
  const issues = validateSite(input);
  includesIssue(issues, /new-concept\.svg: missing nonempty SVG desc/);
  includesIssue(issues, /new-concept\.svg: SVG event handler onload is not allowed/);
  includesIssue(issues, /new-concept\.svg: active or embedded SVG element <script> is not allowed/);
});

test('checks study references against actual published module anchors', () => {
  const input = fixture();
  input.questions.course[0].reference.anchor = 'missing-topic';
  input.coverage.course[0].anchor = 'missing-intro';
  input.coverage.course[1].module = 'unknown-module';
  const issues = validateSite(input);
  includesIssue(issues, /data\/questions\.json\[0\].*missing anchor #missing-topic/);
  includesIssue(issues, /data\/coverage\.json\[0\].*missing anchor #missing-intro/);
  includesIssue(issues, /reference needs a known module/);
});

test('rejects a stale published bank even when the source bank is valid', () => {
  const input = fixture();
  input.files.set('assets/questions.json', JSON.stringify(input.questions.course.slice(1)));
  includesIssue(validateSite(input), /published question bank differs from source/);
});

test('checks all 53 lesson ids, filenames and their module mapping', () => {
  const input = fixture();
  input.coverage.course[1].lesson = '01-01-01-another-name.md';
  input.coverage.course[2].lesson = '01-02-02-Bad-Case.md';
  input.coverage.course[3].module = 'overview';
  const issues = validateSite(input);
  includesIssue(issues, /duplicate lesson id 01-01-01/);
  includesIssue(issues, /missing lesson 01-02-01/);
  includesIssue(issues, /lowercase hyphenated filename/);
  includesIssue(issues, /lesson must map to module agents/);
});


test('only published CertiTube cards may embed the official fixed thumbnail URL', () => {
  const input = fixture(), file = 'certitube/Ha74VhpQwQo/index.html';
  const thumbnail = 'https://i.ytimg.com/vi/Ha74VhpQwQo/mqdefault.jpg';
  input.files.set(file, `<main id="main"><img src="${thumbnail}"></main>`);
  assert.deepEqual(validateSite(input), []);
  for (const src of [thumbnail + '?tracking=1', thumbnail.replace('https:', 'http:'), thumbnail.replace('Ha74VhpQwQo', 'abcdefghijk'), thumbnail.replace('i.ytimg.com', 'evil.test')]) {
    input.files.set(file, `<main id="main"><img src="${src}"></main>`);
    includesIssue(validateSite(input), /external asset/);
  }
  input.files.set(file, `<main id="main"><script src="${thumbnail}"></script></main>`);
  includesIssue(validateSite(input), /external asset/);
});

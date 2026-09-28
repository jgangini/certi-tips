import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSite } from '../scripts/check-site.mjs';

function fixture() {
  const slugs = ['overview', 'agents', 'langchain', 'mcp', 'openai', 'oci-enterprise', 'oracle-database'];
  const catalog = { base: '/certi-tips/', origin: 'https://example.test', courses: [{ id: 'course', modules: slugs.map((slug, i) => ({ slug, type: i ? 'module' : 'orientation' })), resources: [{ slug: 'practice' }] }] };
  const files = new Map([['index.html', '<main id="main"><a href="/certi-tips/course/agents/#conceptos-clave">Guide</a><img src="/certi-tips/assets/logo.svg"><script type="module" src="/certi-tips/assets/main.js"></script></main>'], ['assets/logo.svg', '<svg></svg>'], ['assets/main.js', 'import { ready } from "./helper.js";'], ['assets/helper.js', 'export const ready = true;']]);
  for (const slug of [...slugs, 'practice']) files.set(`course/${slug}/index.html`, '<main id="conceptos-clave"><a href="#conceptos-clave">Section</a></main>');
  const diagrams = ['certification-roadmap', 'agent-loop', 'guardrails', 'langchain-flow', 'mcp-architecture', 'openai-stack', 'handoffs', 'oci-runtime', 'vector-search', 'database-capabilities'];
  for (const diagram of diagrams) {
    files.set(`assets/diagrams/${diagram}.svg`, '<svg xmlns="http://www.w3.org/2000/svg"><title>Concept</title><desc>An explanation.</desc><defs><marker id="arrow"/></defs><path marker-end="url(#arrow)"/></svg>');
    files.set('index.html', `${files.get('index.html')}<img src="/certi-tips/assets/diagrams/${diagram}.svg" alt="Concept">`);
  }
  const questions = slugs.slice(1).flatMap(domain => Array.from({ length: 6 }, (_, i) => ({ id: `${domain}-${i + 1}`, domain, question: 'Which choice works?', options: ['a', 'b', 'c', 'd'].map(id => ({ id, text: `Choice ${id}`, explanation: `Reason ${id}` })), correctOption: 'b', reference: { module: domain, anchor: 'conceptos-clave', label: 'Review this concept' } })));
  files.set('assets/questions.json', JSON.stringify(questions));
  const coverage = [1, 7, 8, 8, 11, 9, 9].flatMap((count, group) => Array.from({ length: count }, (_, i) => ({ lesson: `01-${String(group + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}-lesson.md`, module: slugs[group], anchor: 'conceptos-clave' })));
  return { files, catalog, questions, coverage };
}

const includesIssue = (issues, pattern) => assert.ok(issues.some(issue => pattern.test(issue)), `Expected ${pattern}; got:\n${issues.join('\n')}`);

test('accepts a self-contained course under the GitHub Pages base path', () => {
  assert.deepEqual(validateSite(fixture()), []);
});

test('reports broken assets and exact-case route mismatches', () => {
  const input = fixture();
  input.files.delete('assets/logo.svg');
  input.files.set('index.html', `${input.files.get('index.html')}<a href="/certi-tips/course/Agents/index.html">Bad case</a>`);
  const issues = validateSite(input);
  includesIssue(issues, /index\.html: missing target .*assets\/logo\.svg/);
  includesIssue(issues, /case mismatch; actual: course\/agents\/index\.html/);
});

test('checks local anchors, encoded fragments and links escaping the base', () => {
  const input = fixture();
  input.files.set('course/agents/index.html', '<main id="conceptos-clave"><a href="#CONCEPTOS">bad</a><a href="#conceptos%2Dclave">good</a><a href="/course/agents/">outside</a></main>');
  const issues = validateSite(input);
  includesIssue(issues, /missing anchor #CONCEPTOS/);
  includesIssue(issues, /internal URL is outside \/certi-tips\//);
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
  input.files.set('assets/diagrams/agent-loop.svg', '<svg><title>Loop</title><script>alert(1)</script><use href="https://remote.test/icon.svg"/></svg>');
  input.files.set('index.html', input.files.get('index.html').replace('<img src="/certi-tips/assets/diagrams/guardrails.svg" alt="Concept">', ''));
  const issues = validateSite(input);
  includesIssue(issues, /agent-loop\.svg: missing nonempty SVG desc/);
  includesIssue(issues, /<script> is not allowed/);
  includesIssue(issues, /external SVG resource/);
  includesIssue(issues, /guardrails\.svg: diagram is not used/);
});

test('requires a complete bank with unique questions and four explained choices', () => {
  const input = fixture();
  input.questions[1].id = input.questions[0].id;
  input.questions[0].correctOption = 'e';
  input.questions[0].options[0].explanation = '';
  input.questions[2].options.pop();
  input.questions.pop();
  const issues = validateSite(input);
  includesIssue(issues, /expected 36 questions, received 35/);
  includesIssue(issues, /question id must be nonempty and unique/);
  includesIssue(issues, /correctOption does not identify an alternative/);
  includesIssue(issues, /every alternative needs text and an explanation/);
  includesIssue(issues, /exactly four alternatives/);
  includesIssue(issues, /oracle-database: expected 6 questions, received 5/);
});

test('checks study references against actual published module anchors', () => {
  const input = fixture();
  input.questions[0].reference.anchor = 'missing-topic';
  input.coverage[0].anchor = 'missing-intro';
  input.coverage[1].module = 'unknown-module';
  const issues = validateSite(input);
  includesIssue(issues, /data\/questions\.json\[0\].*missing anchor #missing-topic/);
  includesIssue(issues, /data\/coverage\.json\[0\].*missing anchor #missing-intro/);
  includesIssue(issues, /reference needs a known module/);
});

test('rejects a stale published bank even when the source bank is valid', () => {
  const input = fixture();
  input.files.set('assets/questions.json', JSON.stringify(input.questions.slice(1)));
  includesIssue(validateSite(input), /published question bank differs from source/);
});

test('checks all 53 lesson ids, filenames and their module mapping', () => {
  const input = fixture();
  input.coverage[1].lesson = '01-01-01-another-name.md';
  input.coverage[2].lesson = '01-02-02-Bad-Case.md';
  input.coverage[3].module = 'overview';
  const issues = validateSite(input);
  includesIssue(issues, /duplicate lesson id 01-01-01/);
  includesIssue(issues, /missing lesson 01-02-01/);
  includesIssue(issues, /lowercase hyphenated filename/);
  includesIssue(issues, /lesson must map to module agents/);
});

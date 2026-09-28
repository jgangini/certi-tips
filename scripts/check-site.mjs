import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const diagramNames = ['certification-roadmap', 'agent-loop', 'guardrails', 'langchain-flow', 'mcp-architecture', 'openai-stack', 'handoffs', 'oci-runtime', 'vector-search', 'database-capabilities'];
const lessonCounts = [1, 7, 8, 8, 11, 9, 9];
const textFile = /\.(?:html|css|m?js|json|svg|md|txt)$/i;
const present = value => typeof value === 'string' && value.trim().length > 0;
const decode = value => value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
  const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
  if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
  const code = entity[2].toLowerCase() === 'x' ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1));
  return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
});

function tags(source) {
  // ponytail: these generated documents use quoted attributes, not arbitrary browser HTML;
  // use an HTML parser if the build begins accepting third-party HTML documents.
  return [...source.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<([a-z][\w:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)].map(match => ({
    tag: match[1].toLowerCase(),
    attributes: Object.fromEntries([...match[2].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)].map(attr => [attr[1].toLowerCase(), decode(attr[2] ?? attr[3] ?? attr[4])]))
  }));
}

function validateReference(context, file, value, asset = false) {
  const { origin, catalog, error } = context;
  if (!value) { error(file, 'empty resource reference'); return; }
  let url;
  try { url = new URL(value, `${origin}${catalog.base}${file}`); } catch { error(file, `invalid URL ${value}`); return; }
  if (!['http:', 'https:'].includes(url.protocol)) {
    if (!asset && ['mailto:', 'tel:'].includes(url.protocol)) return;
    error(file, `unsupported ${asset ? 'asset' : 'link'} URL ${value}`);
    return;
  }
  if (url.origin !== origin) {
    if (asset) error(file, `external asset is not allowed: ${value}`);
    return;
  }
  validateLocalReference(context, file, value, asset, url);
}

function validateLocalReference(context, file, value, asset, url) {
  const { files, catalog, error, ids, caseNames, usedDiagrams } = context;
  if (!url.pathname.startsWith(catalog.base)) {
    error(file, `internal URL is outside ${catalog.base}: ${value}`);
    return;
  }
  let target;
  let fragment;
  try {
    target = decodeURIComponent(url.pathname.slice(catalog.base.length));
    fragment = decodeURIComponent(url.hash.slice(1));
  } catch { error(file, `malformed URL encoding: ${value}`); return; }
  if (!target || target.endsWith('/')) target += 'index.html';
  if (!files.has(target) && !path.posix.extname(target) && files.has(`${target}/index.html`)) target += '/index.html';
  if (!files.has(target)) {
    const actual = caseNames.get(target.toLowerCase());
    error(file, `missing target ${value}${actual ? ` (case mismatch; actual: ${actual})` : ''}`);
    return;
  }
  if (fragment && !ids.get(target)?.has(fragment)) error(file, `missing anchor #${fragment} in ${target} (from ${value})`);
  if (asset && target.startsWith('assets/diagrams/')) usedDiagrams.add(target);
}

function validateHtmlLinks(context, file, tag, attributes) {
  if ('href' in attributes) validateReference(context, file, attributes.href, tag === 'link' && attributes.rel !== 'canonical');
  if ('src' in attributes) validateReference(context, file, attributes.src, true);
  if ('data-diagram' in attributes) validateReference(context, file, attributes['data-diagram'], true);
  if ('srcset' in attributes) for (const entry of attributes.srcset.split(',')) validateReference(context, file, entry.trim().split(/\s+/)[0], true);
}

function validateHtml(context, file, source) {
  const { parsed, error } = context;
  const seen = new Set();
  for (const { tag, attributes } of parsed.get(file)) {
    if (attributes.id && seen.has(attributes.id)) error(file, `duplicate id #${attributes.id}`);
    seen.add(attributes.id);
    validateHtmlLinks(context, file, tag, attributes);
  }
  for (const block of source.matchAll(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi)) {
    if (/[┌┐└┘├┤┬┴│─═╔╗╚╝║]/.test(block[0]) || /[+|]\s*[-=]{3,}\s*[+|]/.test(block[0])) error(file, 'ASCII/box-drawing schematic found; use an explanatory SVG');
  }
}

function validateFiles(context) {
  const { files, error } = context;
  for (const [file, source] of files) {
    if (/(?:^|\/)01-\d{2}-\d{2}-.+\.md$/i.test(file) || /(?:^|[\/_.-])transcripts?(?:[\/_.-]|$)/i.test(file)) error(file, 'source transcript must not be deployed');
    if (!textFile.test(file)) continue;
    if (source.includes('{{base}}')) error(file, 'unresolved {{base}} placeholder');
    if (/[a-z]:[\\/](?:[^\r\n<>"']*[\\/])?desktop[\\/]/i.test(source.replaceAll('\\\\', '\\'))) error(file, 'absolute Desktop source path is exposed');
    if (/file:\/\//i.test(source)) error(file, 'local file URL is exposed');
    if (/\.html$/i.test(file)) validateHtml(context, file, source);
    if (/\.css$/i.test(file)) for (const match of source.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi)) validateReference(context, file, match[1], true);
    if (/\.m?js$/i.test(file)) for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g)) validateReference(context, file, match[1], true);
  }
}

function validateSvgElement(file, tag, attributes, error) {
  if (['script', 'foreignobject', 'image', 'iframe'].includes(tag)) error(file, `active or embedded SVG element <${tag}> is not allowed`);
  for (const [key, value] of Object.entries(attributes)) {
    if (/^on/i.test(key)) error(file, `SVG event handler ${key} is not allowed`);
    if ((key === 'href' || key === 'xlink:href') && !value.startsWith('#')) error(file, `external SVG resource ${value}`);
  }
}

function validateDiagrams(context) {
  const { files, parsed, usedDiagrams, error } = context;
  for (const name of diagramNames) {
    const file = `assets/diagrams/${name}.svg`;
    const source = files.get(file);
    if (source === undefined) { error(file, 'required diagram is missing'); continue; }
    if (!usedDiagrams.has(file)) error(file, 'diagram is not used by a page');
    if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(source) || !/<\/svg>\s*$/i.test(source)) error(file, 'missing SVG root');
    for (const element of ['title', 'desc']) if (!new RegExp(`<${element}\\b[^>]*>\\s*[^<\\s][\\s\\S]*?<\\/${element}>`, 'i').test(source)) error(file, `missing nonempty SVG ${element}`);
    for (const { tag, attributes } of parsed.get(file) || []) validateSvgElement(file, tag, attributes, error);
    if (/@import\b/i.test(source) || /url\(\s*["']?(?!#)[^\s"')]+/i.test(source)) error(file, 'external SVG stylesheet or resource');
  }
}

function validatePublishedPages(context) {
  const { course, files, error } = context;
  for (const page of [...course.modules, ...(course.resources || [])]) {
    const file = `${course.id}/${page.slug}/index.html`;
    if (!files.has(file)) error('data/catalog.json', `missing published page ${file}`);
  }
}

function validateStudyReference(context, file, ref) {
  const { course, modules, catalog, error } = context;
  if (!ref || !modules.has(ref.module) || !present(ref.anchor)) { error(file, 'reference needs a known module and nonempty anchor'); return; }
  validateReference(context, file, `${catalog.base}${course.id}/${ref.module}/#${ref.anchor}`);
}

function validateOptions(file, question, error) {
  const options = question?.options;
  if (!Array.isArray(options) || options.length !== 4) error(file, 'exactly four alternatives are required');
  else {
    const optionIds = new Set();
    for (const option of options) {
      if (!present(option?.id) || optionIds.has(option.id)) error(file, 'alternative ids must be nonempty and unique');
      optionIds.add(option?.id);
      if (!present(option?.text) || !present(option?.explanation)) error(file, 'every alternative needs text and an explanation');
    }
    if (!present(question.correctOption) || !optionIds.has(question.correctOption)) error(file, 'correctOption does not identify an alternative');
  }
}

function validateQuestion(context, question, index, seen) {
  const { domains, error } = context;
  const file = `data/questions.json[${index}] (${question?.id || 'no id'})`;
  if (!question || !present(question.id) || seen.has(question.id)) error(file, 'question id must be nonempty and unique');
  seen.add(question?.id);
  if (!present(question?.question)) error(file, 'question text is empty');
  if (!domains.includes(question?.domain)) error(file, `unknown domain ${question?.domain}`);
  validateOptions(file, question, error);
  if (!present(question?.reference?.label)) error(file, 'study reference label is empty');
  validateStudyReference(context, file, question?.reference);
}

function validateQuestions(context, questions) {
  const { files, domains, error } = context;
  if (!Array.isArray(questions)) { error('data/questions.json', 'question bank must be an array'); return; }
  try {
    if (JSON.stringify(JSON.parse(files.get('assets/questions.json'))) !== JSON.stringify(questions)) error('assets/questions.json', 'published question bank differs from source; rebuild the site');
  } catch { error('assets/questions.json', 'published question bank is missing or invalid JSON'); }
  if (questions.length !== 36) error('data/questions.json', `expected 36 questions, received ${questions.length}`);
  const seen = new Set();
  for (const [index, question] of questions.entries()) validateQuestion(context, question, index, seen);
  for (const domain of domains) {
    const count = questions.filter(question => question?.domain === domain).length;
    if (count !== 6) error('data/questions.json', `${domain}: expected 6 questions, received ${count}`);
  }
  if (domains.length !== 6) error('data/catalog.json', `expected six technical domains, received ${domains.length}`);
}

function validateCoverageEntry(context, entry, index, expected, seen) {
  const { error } = context;
  const file = `data/coverage.json[${index}] (${entry?.lesson || 'no lesson'})`;
  const match = present(entry?.lesson) ? entry.lesson.match(/^(01-\d{2}-\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/) : null;
  if (!match || !expected.has(match[1])) error(file, 'lesson id or lowercase hyphenated filename is not in the expected 53-lesson sequence');
  else {
    if (seen.has(match[1])) error(file, `duplicate lesson id ${match[1]}`);
    seen.add(match[1]);
    if (entry.module !== expected.get(match[1])) error(file, `lesson must map to module ${expected.get(match[1])}`);
  }
  validateStudyReference(context, file, entry);
}

function validateCoverage(context, coverage) {
  const { course, error } = context;
  if (!Array.isArray(coverage)) { error('data/coverage.json', 'coverage must be an array'); return; }
  if (coverage.length !== 53) error('data/coverage.json', `expected 53 lessons, received ${coverage.length}`);
  const expected = new Map(lessonCounts.flatMap((count, module) => Array.from({ length: count }, (_, lesson) => [`01-${String(module + 1).padStart(2, '0')}-${String(lesson + 1).padStart(2, '0')}`, course.modules[module]?.slug])));
  const seen = new Set();
  for (const [index, entry] of coverage.entries()) validateCoverageEntry(context, entry, index, expected, seen);
  for (const lesson of expected.keys()) if (!seen.has(lesson)) error('data/coverage.json', `missing lesson ${lesson}`);
}

/** Validate the deployable files, plus the course's editorial and practice data. */
export function validateSite({ files, catalog, questions, coverage }) {
  const issues = [];
  const error = (file, message) => issues.push(`${file}: ${message}`);
  if (!catalog?.base?.startsWith('/') || !catalog.base.endsWith('/') || !present(catalog.origin)) {
    return ['data/catalog.json: base must start/end with / and origin must be provided'];
  }
  let origin;
  try { origin = new URL(catalog.origin).origin; } catch { return ['data/catalog.json: origin is not a valid URL']; }
  const parsed = new Map([...files].filter(([file]) => /\.(?:html|svg)$/i.test(file)).map(([file, source]) => [file, tags(source)]));
  const ids = new Map([...parsed].map(([file, elements]) => [file, new Set(elements.map(element => element.attributes.id).filter(Boolean))]));
  const usedDiagrams = new Set();
  const caseNames = new Map([...files.keys()].map(file => [file.toLowerCase(), file]));

  const context = { files, catalog, origin, parsed, ids, usedDiagrams, caseNames, error };
  validateFiles(context);
  validateDiagrams(context);
  const course = catalog.courses?.[0];
  if (!course?.id || !Array.isArray(course.modules)) return [...issues, 'data/catalog.json: first course needs an id and modules'];
  context.course = course;
  context.modules = new Set(course.modules.map(module => module.slug));
  context.domains = course.modules.filter(module => module.type === 'module').map(module => module.slug);
  validatePublishedPages(context);
  validateQuestions(context, questions);
  validateCoverage(context, coverage);
  return issues;
}

async function main() {
  const root = path.resolve(import.meta.dirname, '..');
  const files = new Map();
  async function collect(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await collect(path.join(directory, entry.name), `${relative}/`);
      else files.set(relative, textFile.test(entry.name) ? await readFile(path.join(directory, entry.name), 'utf8') : '');
    }
  }
  try {
    await collect(path.join(root, 'dist'));
    const [catalog, questions, coverage] = await Promise.all(['catalog', 'questions', 'coverage'].map(async name => JSON.parse(await readFile(path.join(root, 'data', `${name}.json`), 'utf8'))));
    const issues = validateSite({ files, catalog, questions, coverage });
    if (issues.length) {
      console.error(`Site validation failed (${issues.length} issues):\n${issues.map(issue => `- ${issue}`).join('\n')}`);
      process.exitCode = 1;
    } else console.log(`Site validation passed: ${files.size} deployed files, 53 lessons, 36 questions and 10 linked diagrams.`);
  } catch (error) {
    console.error(`Site validation failed: ${error.message}. Run npm run build first and check data/*.json.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();

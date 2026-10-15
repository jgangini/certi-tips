import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { translateHTML, localizeSite } from '../scripts/localize.mjs';
import { contentHash, corpusArtifacts } from '../scripts/certichat-corpus.mjs';
import { sourceDigest, engineDigest } from '../scripts/i18n.mjs';
import { localizedURL, canonicalURL } from '../assets/i18n.js';

test('public Quiz error messages have stable entries in the UI translation source', async () => {
  const directory = new URL('../services/certiquiz/app/', import.meta.url);
  const ui = JSON.parse(await readFile(new URL('../data/es/ui.json', import.meta.url), 'utf8'));
  const files = await Promise.all((await readdir(directory)).filter(name => name.endsWith('.py')).map(async name => [name, await readFile(new URL(name, directory), 'utf8')]));
  let checked = 0;
  for (const [name, source] of files) {
    // ponytail: public messages use plain single-line Python literals; fail if interpolation or escapes need a structured error contract.
    for (const [, prefix, , message] of source.matchAll(/(?:\bHTTPException\(\s*\d+\s*,|\bGameError\(|["']detail["']\s*:)\s*([fru]*)(["'])((?:\\.|(?!\2)[^\r\n])*)\2/gu)) {
      assert.ok(!prefix && !message.includes('\\'), `${name}: use a stable public error message: ${message}`);
      assert.ok(Object.hasOwn(ui, message), `${name}: missing UI translation key: ${message}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 30, 'The public error scan did not cover the Quiz handlers');
});

test('HTML translation escapes output and preserves code, attributes, URLs and canonical identifiers', () => {
  const source = '<!doctype html><!-- Hola --><h2 id="seccion">Hola &amp; nube</h2><a href="/certitips/guide/#seccion" title="Ver fuente">Ver</a><img src="data:image/svg+xml,test" alt="Diagrama"><p data-quiz-domains="{&quot;stable-id&quot;:&quot;Área&quot;}">Texto</p><pre><code>response.output_text &amp; OCI</code></pre><script>const value = "Hola";</script><style>.Hola{color:red}</style><kbd>Ctrl+K</kbd><span translate="no">OCI Foundations</span>';
  const visited = [];
  const result = translateHTML(source, value => { visited.push(value); return `<unsafe>${value}</unsafe>`; });
  assert.ok(result.includes('id="seccion"') && result.includes('href="/certitips/guide/#seccion"'));
  assert.ok(result.includes('src="data:image/svg+xml,test"'));
  assert.ok(result.includes('&lt;unsafe&gt;Hola &amp; nube&lt;/unsafe&gt;'));
  assert.ok(result.includes('title="&lt;unsafe&gt;Ver fuente&lt;/unsafe&gt;"'));
  assert.ok(result.includes('&quot;stable-id&quot;:&quot;&lt;unsafe&gt;Área&lt;/unsafe&gt;&quot;'));
  for (const literal of ['<!-- Hola -->', '<code>response.output_text &amp; OCI</code>', '<script>const value = "Hola";</script>', '<style>.Hola{color:red}</style>', '<kbd>Ctrl+K</kbd>', '<span translate="no">OCI Foundations</span>']) assert.ok(result.includes(literal), literal);
  assert.ok(!result.includes('<unsafe>') && !visited.includes('stable-id') && !visited.includes('OCI Foundations'));
});

test('locale URLs replace one prefix, preserve query and hash, and retain canonical evidence URLs', () => {
  const base = '/certitips/', suffix = 'CODE/guide/?room=123456&label=uno%20dos#seccion';
  for (const source of ['', 'es/', 'en/', 'pt/', 'it/']) for (const target of ['es', 'en', 'pt', 'it']) {
    assert.equal(localizedURL(base + source + suffix, target), base + target + '/' + suffix);
    assert.equal(localizedURL('https://jgangini.github.io' + base + source + suffix, target), 'https://jgangini.github.io' + base + target + '/' + suffix);
    assert.equal(canonicalURL(base + source + suffix), base + suffix);
  }
  for (const value of ['https://outside.test/?next=/certitips/es/', '/other/es/guide/', '/certitips/assets/site.js?next=/certitips/es/', 'data:text/plain,/certitips/es/', 'mailto:example@example.test']) {
    assert.equal(localizedURL(value, 'pt'), value);
    assert.equal(canonicalURL(value), value);
  }
  assert.throws(() => localizedURL(base, 'xx'), /Unsupported locale/);
  const previous = globalThis.location;
  try {
    globalThis.location = { origin: 'http://127.0.0.1:4173' };
    assert.equal(localizedURL('http://127.0.0.1:4173/certitips/es/guide/?q=1#x', 'it'), 'http://127.0.0.1:4173/certitips/it/guide/?q=1#x');
    assert.equal(canonicalURL('https://jgangini.github.io/certitips/pt/guide/'), 'https://jgangini.github.io/certitips/guide/');
  } finally { if (previous === undefined) delete globalThis.location; else globalThis.location = previous; }
});

test('the generated package retains source identities, publishes shared dictionaries and hashes multilingual artifacts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'certitips-site-i18n-'));
  const output = path.join(root, 'dist'), base = '/certitips/', origin = 'https://jgangini.github.io';
  const save = async (filename, value) => { const file = path.join(root, filename); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); };
  const read = filename => readFile(path.join(output, filename), 'utf8');
  const json = async filename => JSON.parse(await read(filename));
  const question = { id: 'q1', domain: 'domain-id', question: 'Pregunta de prueba', correctOption: 'a', reference: { module: 'guide', anchor: 'seccion', label: 'Leer explicación' }, options: [{ id: 'a', text: 'Correcta', explanation: 'Explicación' }, { id: 'b', text: 'Incorrecta', explanation: '' }] };
  const site = { base, origin, courses: [{ id: 'course-id', title: 'Curso de prueba', questionBank: 'CODE/questions', route: 'CODE', contentDir: 'CODE', modules: [{ slug: 'guide', file: 'lesson/guide.md' }], resources: [] }] };
  const svgPath = 'CODE/lesson/img/diagram.svg', svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="10" y="20">Hola</text></svg>';
  const document = { id: 'course-id/guide#seccion', title: 'Título canónico', courseId: 'course-id', url: origin + base + 'CODE/guide/#seccion', text: 'Información ' + '🙂'.repeat(3000) };
  const canonical = corpusArtifacts([document], origin + base + 'assets/certichat/corpus.json');
  const links = ['es', 'en', 'pt', 'it'].map(locale => `<a data-language-link="${locale}" href="${base}${locale}/" translate="no">${locale}</a>`).join('');
  try {
    await save('data/es/CODE/questions.json', [question]);
    await save(`data/es/${svgPath}`, svg);
    await save('dist/CODE/guide/img/diagram.svg', svg);
    await save('data/es/ui.json', { 'Hola {name}': 'Hola {name}' });
    await save('data/i18n.json', { version: 1 });
    await save('requirements-i18n.txt', 'fixture==1');
    await save('dist/CODE/guide/index.html', `<html lang="es"><head><link rel="canonical" href="${origin}${base}CODE/guide/"><script type="module" src="${base}assets/site.js"></script></head><body data-base="${base}" data-question-bank="CODE/questions" data-course="course-id"><h2 id="seccion">Título canónico</h2>${links}<aside data-site-root="${origin}${base}"></aside></body></html>`);
    await save('dist/assets/certichat/corpus.json', canonical.corpus);
    await save('dist/assets/certichat/manifest.json', canonical.manifest);
    await localizeSite(root, output, site, true);
    const manifest = JSON.parse(await readFile(path.join(root, '.cache/i18n/manifest.json'), 'utf8'));
    for (const locale of ['en', 'pt', 'it']) {
      const translations = Object.fromEntries(manifest.segments.map(({ id, text }) => [id, `${locale}: ${text}`]));
      const localizedSVG = svg.replace('Hola', locale);
      await save(`data/${locale}/${svgPath}`, localizedSVG);
      await save(`data/${locale}/translations.json`, { version: 1, locale, sourceDigest: sourceDigest(manifest), engineDigest: await engineDigest(root), translations, svg: { [svgPath]: { sourceHash: contentHash(svg), outputHash: contentHash(localizedSVG) } }, translationDigest: contentHash(JSON.stringify(Object.entries(translations).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) });
    }
    await localizeSite(root, output, site);
    for (const locale of ['es', 'en', 'pt', 'it']) {
      const html = await read(`${locale}/CODE/guide/index.html`);
      assert.ok(html.includes(`<html lang="${locale === 'pt' ? 'pt-BR' : locale}"`));
      assert.ok(html.includes(`data-locale="${locale}"`) && html.includes(`data-base="${base}${locale}/"`));
      assert.ok(html.includes(`data-site-root="${origin}${base}"`) && html.includes('data-course="course-id"'));
      assert.ok(html.includes(`rel="canonical" href="${origin}${base}${locale}/CODE/guide/"`));
      assert.ok(html.includes(`src="${base}assets/site.js"`) && !html.includes('site-translations'));
      for (const target of ['es', 'en', 'pt', 'it']) assert.match(html, new RegExp(`data-language-link="${target}"[^>]*href="${base}${target}/CODE/guide/"`));
      const bank = await json(`${locale}/assets/CODE/questions.json`);
      assert.equal(bank[0].id, question.id);
      assert.equal(bank[0].correctOption, question.correctOption);
      assert.deepEqual(bank[0].options.map(option => option.id), ['a', 'b']);
      assert.equal(bank[0].reference.module, 'guide'); assert.equal(bank[0].reference.anchor, 'seccion');
      assert.equal(bank[0].reference.label, (locale === 'es' ? '' : locale + ': ') + question.reference.label);
      const dictionaryVersion = html.match(/data-i18n-version="([a-f0-9]{16})"/)?.[1];
      assert.ok(dictionaryVersion, 'Dictionary URL needs its content hash');
      const dictionaryBytes = await read(`assets/i18n/${locale}-${dictionaryVersion}.json`);
      assert.equal(contentHash(dictionaryBytes).slice(0, 16), dictionaryVersion);
      assert.ok(JSON.parse(dictionaryBytes)['Hola {name}']);
      await assert.rejects(stat(path.join(output, locale, 'assets/site.js')), { code: 'ENOENT' });
      const search = await json(`${locale}/assets/certichat/search.json`);
      assert.equal(search.documents[0].id, document.id);
      assert.equal(search.documents[0].url, origin + base + locale + '/CODE/guide/#seccion');
      assert.equal(await read(`${locale}/CODE/guide/img/diagram.svg`), locale === 'es' ? svg : svg.replace('Hola', locale));
    }
    assert.equal(await read('CODE/guide/index.html'), await read('es/CODE/guide/index.html'));
    assert.equal(await read('assets/certichat/corpus.json'), canonical.corpus);
    assert.equal(await read('assets/certichat/manifest.json'), canonical.manifest);
    const quizCatalog = await json('assets/certiquiz/catalog.json'), bankBytes = await read('assets/certiquiz/CODE/questions.json');
    assert.equal(quizCatalog.courses[0].sha256, contentHash(bankBytes));
    const runtimeQuestion = JSON.parse(bankBytes)[0];
    assert.equal(runtimeQuestion.correctOption, 'a');
    assert.deepEqual(Object.keys(runtimeQuestion.translations), ['en', 'pt', 'it']);
    const projectionManifest = await json('assets/certichat/i18n/manifest.json');
    assert.equal(projectionManifest.contentHash, JSON.parse(canonical.manifest).contentHash);
    for (const locale of ['en', 'pt', 'it']) {
      const projectionBytes = await read(`assets/certichat/i18n/${locale}.json`), projection = JSON.parse(projectionBytes);
      assert.equal(projectionManifest.locales[locale], contentHash(projectionBytes));
      assert.equal(projection.contentHash, projectionManifest.contentHash);
      assert.deepEqual(projection.segments.map(segment => segment.name), [0, 1].map(index => contentHash(document.id) + `-000${index}.txt`));
      assert.ok(projection.segments.every(segment => segment.sourceHash === contentHash(document.text)));
      assert.ok(!projection.segments.some(segment => /\uFFFD/.test(segment.text)));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

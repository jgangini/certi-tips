import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const course = JSON.parse(read('data/catalog.json')).courses.find(course => course.id === 'data-governance');
const bank = JSON.parse(read('data/questions-governance.json'));
const coverage = JSON.parse(read('data/coverage-governance.json'));
const anchor = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

test('Governance graphics use readable widescreen slides with accessible descriptions', () => {
  const names = readdirSync(new URL('../assets/diagrams/', import.meta.url)).filter(name => name.startsWith('gov-') && name.endsWith('.svg'));
  assert.equal(names.length, 84);
  for (const name of names) {
    const svg = read(`assets/diagrams/${name}`);
    assert.match(svg, /viewBox="0 0 1920 1080"/, name);
    assert.match(svg, /<rect x="0" y="0" width="1920" height="1080"[^>]*fill="#F1EFED"/, `${name}: reference canvas background`);
    assert.match(svg, /<title\b[^>]*>[^<]+<\/title>/, name);
    assert.match(svg, /<desc\b[^>]*>[^<]+<\/desc>/, name);
    assert.doesNotMatch(svg, /<linearGradient|<radialGradient/, name);
    // The supplied pyramid retains native 10/12px type at a uniform 1.72 scale.
    if (name === 'gov-overview-map.svg') {
      const supplied = read('data/diagram-sources/dama.svg');
      assert.match(svg, /data-source-viewbox="0 0 1154\.55 841\.89"/);
      assert.match(svg, /transform="translate\(960 1000\) scale\(1\.72\) translate\(-530\.886 -566\.32\)"/);
      const normalize = value => value.replace(/\s+/g, ' ').trim();
      const paths = [...svg.matchAll(/<path\b[^>]*d="([^"]+)"/g)].map(match => normalize(match[1]));
      for (const [, path] of supplied.matchAll(/<path\b[^>]*d="([^"]+)"/g)) assert.ok(paths.includes(normalize(path)), 'Supplied pyramid path changed');
      for (const [, transform] of supplied.matchAll(/\btransform="([^"]+)"/g)) assert.ok(svg.includes(`transform="${transform}"`), 'Supplied shape transform changed');
      assert.match(svg, /<rect x="0" y="742\.677" width="73\.8426" height="99\.2126" class="st1"/);
      for (const [, label] of supplied.matchAll(/<desc>([^<]+)<\/desc>/g)) assert.ok(svg.includes(label.replaceAll('&#38;', '&amp;')), 'Supplied label lost');
      for (const color of ['#c06d30', '#00b0f0', '#2e5c70', '#749b6b', '#fbfbe7']) assert.ok(svg.includes(color), color);
      assert.equal([...svg.matchAll(/<text\b/g)].length, 13, 'Title plus twelve original labels');
      assert.match(svg, /font-size:12px/);
      assert.doesNotMatch(svg, /<script|<v:|SVGExtensions|<!DOCTYPE|<image\b|\bhref=/);
    }
    // Module 02 onward uses the caption-sized type approved in modules 00 and 01.
    const minimum = 25.5;
    if (!name.startsWith('gov-overview-') && !name.startsWith('gov-governance-')) {
      const sizes = [...svg.matchAll(/<text\b[^>]*font-size="([\d.]+)"/g)].map(match => Number(match[1]));
      assert.equal(sizes[0], 56, `${name}: title size`);
      assert.deepEqual(sizes.slice(1), Array(sizes.length - 1).fill(25.5), `${name}: reference body size`);
    }
    if (name === 'gov-overview-contract.svg') {
      assert.match(svg, /x="650" y="272" width="630" height="516"[^>]*stroke="#59616E"/);
      assert.match(svg, /<tspan[^>]*>Ingeniería y Seguridad<\/tspan>/);
      assert.match(svg, /x="96" y="832" width="1728" height="88"[^>]*stroke="#59616E"/);
      assert.deepEqual([...svg.matchAll(/<text\b[^>]*font-size="([\d.]+)"/g)].slice(1).map(match => Number(match[1])), Array(26).fill(25.5));
      assert.deepEqual([...new Set([...svg.matchAll(/\bstroke="(#[\da-f]+)"/gi)].map(match => match[1]))], ['#59616E']);
    }
    for (const [, size] of svg.matchAll(/font-size="([\d.]+)"/g)) assert.ok(Number(size) >= minimum, `${name}: small text ${size}`);
  }
});

test('Governance evidence maps eleven areas, original diagrams and all assessment references', () => {
  assert.equal(course.modules.filter(page => page.type === 'module').length, 11);
  assert.equal(bank.length, 66);
  assert.equal(coverage.length, 77);
  assert.equal(course.exam, undefined);
  const used = new Set();
  for (const entry of coverage) {
    const source = read(`content/data-governance/${entry.module}.md`);
    assert.ok([...source.matchAll(/^## (.+)$/gm)].some(match => anchor(match[1]) === entry.anchor) || source.includes(`id="${entry.anchor}"`), entry.anchor);
    assert.equal(entry.source, 'original-editorial');
    assert.ok(entry.objective && entry.publicSources.length);
    assert.equal(entry.dama, undefined, 'Book source mapping belongs in the private preparation record');
    assert.ok(entry.publicSources.every(url => url.startsWith('https://') && !url.includes('slack.com')));
    // These sections retain their text after the requested graphics were removed.
    const textOnly = (entry.module === 'governance' && ['errores-frecuentes', 'fuentes-y-repaso'].includes(entry.anchor)) || (entry.module === 'data-architecture' && entry.anchor === 'errores-frecuentes');
    assert.ok(entry.diagrams.length > 0 || textOnly);
    if (textOnly) assert.equal(entry.diagrams.length, 0);
    for (const diagram of entry.diagrams) assert.ok(existsSync(new URL(`../${diagram}`, import.meta.url)), diagram);
    for (const id of entry.questionIds) {
      const question = bank.find(q => q.id === id);
      assert.ok(question, id);
      assert.equal(question.reference.module, entry.module);
      assert.equal(question.reference.anchor, entry.anchor);
      used.add(id);
    }
  }
  assert.equal(used.size, 66, 'Every question must trace to a covered learning unit');
  for (const page of [...course.modules, ...course.resources]) {
    const source = read(`content/data-governance/${page.slug}.md`);
    assert.doesNotMatch(source, /oracle\.enterprise\.slack\.com|[A-Z]:\\Desktop|DAMA-DMBOK|capítulo\s+\d|página impresa\s+\d/i);
    for (const section of source.split(/^## /m).slice(1)) {
      // ponytail: official access links resources; teaching sections still require graphics.
      if (page.slug === 'overview' && section.startsWith('Acceso al Recorrido Oficial\n')) {
        assert.match(section, /\]\(https:\/\/dama\.org\/certification\/certification-pathway\/\)/);
        continue;
      }
      if (['governance', 'data-architecture'].includes(page.slug) && /^Errores Frecuentes\r?\n/.test(section)) {
        assert.equal([...section.matchAll(/^- \*\*/gm)].length, 3);
        assert.doesNotMatch(section, /!\[/);
        continue;
      }
      assert.match(section, /!\[[^\]]+\]\(\{\{base\}\}assets\/diagrams\/gov-[\w-]+\.svg "[^"]+"\)/, `${page.slug}: section must have an explained original graphic`);
    }
  }
});

test('Governance includes operational Preview and distinguishes new catalogs and extensions', () => {
  const metadata = read('content/data-governance/metadata.md');
  const map = read('content/data-governance/oracle-map.md');
  assert.match(metadata, /linaje de Oracle AI Data Platform en Preview/i);
  assert.match(metadata, /último linaje capturado/);
  assert.match(map, /Master Catalog/);
  assert.match(map, /DBMS_CATALOG/);
  assert.match(map, /Oracle AI Data Catalog/);
  assert.match(map, /AI Assistant.*Preview/);
  assert.match(map, /Extensión implementada/);
  assert.match(map, /Anunciada/);
  assert.match(map, /survivorship|Survivorship/);
});

test('Governance uses full product names in lessons, questions, catalog and diagram labels', () => {
  const legacy = /\b(?:AIDP|OAC|EDM|OCI|ALH|ADW|IAM|Vault)\b|DAMA-DMBOK|Base conceptual:/;
  const prose = text => text.replace(/\]\([^)]*\)/g, ']').replace(/`[^`]*`/g, '');
  for (const page of [...course.modules, ...course.resources]) {
    assert.doesNotMatch(prose(read(`content/data-governance/${page.slug}.md`)), legacy, page.slug);
  }
  assert.doesNotMatch(JSON.stringify(course), legacy);
  assert.doesNotMatch(JSON.stringify(bank), legacy);
  for (const name of readdirSync(new URL('../assets/diagrams/', import.meta.url)).filter(name => name.startsWith('gov-') && name.endsWith('.svg'))) {
    const labels = read(`assets/diagrams/${name}`).replace(/<[^>]+>/g, ' ');
    // The user requested AIDP only in this diagram's compact detail rows.
    const fullNames = name === 'gov-governance-oracle.svg' ? labels.replace(/\bAIDP\b/g, 'Oracle AI Data Platform') : labels;
    assert.doesNotMatch(fullNames, legacy, name);
  }
});

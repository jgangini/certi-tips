import { readFile, writeFile, mkdir, readdir, cp } from 'node:fs/promises';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import { contentHash } from './certichat-corpus.mjs';
import { segmentId, loadTranslations } from './i18n.mjs';

const md = new MarkdownIt();
const languages = { es: 'es', en: 'en', pt: 'pt-BR', it: 'it' };
const textAttributes = new Set(['alt', 'title', 'aria-label', 'aria-description', 'placeholder', 'data-diagram-heading', 'data-menu-name', 'data-search-term']);
const voidTags = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const escape = value => md.utils.escapeHtml(String(value));
const decode = value => md.utils.unescapeAll(value);

// ponytail: tokenize only HTML emitted by our own renderer; this is not an HTML sanitizer.
export function translateHTML(html, translate) {
  const stack = [];
  return html.replace(/<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z](?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+|</g, token => {
    if (token.startsWith('<!--') || token.startsWith('<!')) return token;
    const close = token.match(/^<\/([\w:-]+)/);
    if (close) { const at = stack.findLastIndex(item => item.tag === close[1].toLowerCase()); if (at >= 0) stack.length = at; return token; }
    const open = token.match(/^<([\w:-]+)/);
    if (open) {
      const tag = open[1].toLowerCase();
      const skip = stack.some(item => item.skip) || ['script', 'style', 'pre', 'code', 'kbd'].includes(tag) || /\btranslate=["']no["']/.test(token);
      if (!voidTags.has(tag) && !token.endsWith('/>')) stack.push({ tag, skip });
      if (skip) return token;
      return token.replace(/([\w:-]+)="([^"]*)"/g, (attribute, name, value) => {
        if (textAttributes.has(name) || (tag === 'meta' && name === 'content' && /(?:name="description"|property="og:(?:title|description|image:alt)")/.test(token))) return `${name}="${escape(translate(decode(value)))}"`;
        if (name === 'data-quiz-domains') return `${name}="${escape(JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(decode(value))).map(([key, text]) => [key, translate(text)]))))}"`;
        return attribute;
      });
    }
    if (stack.some(item => item.skip) || !token.trim()) return token;
    const match = token.match(/^(\s*)([\s\S]*?)(\s*)$/);
    return match[1] + escape(translate(decode(match[2]))) + match[3];
  });
}

async function filesBelow(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const name = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await filesBelow(directory, name));
    else result.push(name);
  }
  return result;
}

function localURL(url, base, locale, origin) {
  const prefix = `${base}${locale}/`;
  const absolute = url.startsWith(origin + base);
  const value = absolute ? url.slice(origin.length) : url;
  if (!value.startsWith(base)) return url;
  const relative = value.slice(base.length);
  if (relative.startsWith('assets/') && !/^assets\/(?:[\w-]+\/questions\.json|certichat\/search\.json)/.test(relative)) return url;
  return (absolute ? origin : '') + prefix + relative;
}

function translateBank(bank, translate) {
  return bank.map(question => ({ ...question, question: translate(question.question), ...(question.reference ? { reference: { ...question.reference, label: translate(question.reference.label) } } : {}), options: question.options.map(option => ({ ...option, text: translate(option.text), explanation: option.explanation ? translate(option.explanation) : '' })) }));
}

function visitGallery(gallery, translate, url) {
  return gallery.map(item => ({ ...item, src: url(item.src), ...Object.fromEntries(['alt', 'caption', 'module', 'heading'].map(key => [key, translate(item[key])])) }));
}

async function translationSource(root, output, site) {
  const files = await filesBelow(output);
  const segments = new Map();
  const register = text => {
    if (typeof text !== 'string' || !/\p{L}/u.test(text) || text.length < 2) return text;
    const id = segmentId(text, 'text');
    segments.set(id, { id, text, context: 'text' });
    return text;
  };
  const html = new Map(await Promise.all(files.filter(file => file.endsWith('.html')).map(async file => [file, await readFile(path.join(output, file), 'utf8')])));
  for (const source of html.values()) translateHTML(source, register);
  const galleries = new Map(await Promise.all(files.filter(file => file.endsWith('/gallery.json')).map(async file => [file, JSON.parse(await readFile(path.join(output, file), 'utf8'))])));
  for (const gallery of galleries.values()) visitGallery(gallery, register, value => value);
  const banks = new Map(await Promise.all(site.courses.map(async course => [course.questionBank, JSON.parse(await readFile(path.join(root, 'data/es', `${course.questionBank}.json`), 'utf8'))])));
  for (const bank of banks.values()) translateBank(bank, register);
  const ui = JSON.parse(await readFile(path.join(root, 'data/es/ui.json'), 'utf8'));
  for (const text of Object.values(ui)) register(text);
  const corpus = JSON.parse(await readFile(path.join(output, 'assets/certichat/corpus.json'), 'utf8'));
  const corpusManifest = JSON.parse(await readFile(path.join(output, 'assets/certichat/manifest.json'), 'utf8'));
  const sourceSegments = corpus.documents.flatMap(doc => {
    register(doc.title);
    const characters = [...doc.text];
    const entries = [];
    for (let offset = 0; offset < characters.length; offset += 3000) {
      const text = characters.slice(offset, offset + 3000).join('');
      register(text);
      entries.push({ name: `${contentHash(doc.id)}-${String(offset / 3000).padStart(4, '0')}.txt`, sourceHash: contentHash(doc.text), title: doc.title, text, id: doc.id, url: doc.url });
    }
    return entries;
  });
  const graphFile = files.includes('assets/certichat/graph.json') ? JSON.parse(await readFile(path.join(output, 'assets/certichat/graph.json'), 'utf8')) : null;
  const labels = [...(graphFile?.nodes ?? []).flatMap(node => [node.label, node.description]), ...(graphFile?.edges ?? []).map(edge => edge.label), ...corpus.documents.map(doc => doc.title)].filter(Boolean);
  for (const label of labels) register(label);
  for (const course of site.courses) register(course.title);
  const manifest = { version: 1, sourceRoot: 'data/es', segments: [...segments.values()].sort((a, b) => a.id.localeCompare(b.id)) };
  return { files, html, galleries, banks, ui, corpus, corpusManifest, sourceSegments, labels, manifest };
}

async function publishImages(root, output, site, files, locale) {
  for (const file of files.filter(file => file.endsWith('.svg') && !file.startsWith('assets/'))) {
    const parts = file.split('/'), code = parts.shift(), slug = parts.shift();
    const course = site.courses.find(item => (item.route || item.exam?.code || item.id) === code);
    const page = [...(course?.modules ?? []), ...(course?.resources ?? [])].find(item => item.slug === slug);
    const sourcePath = course && page ? path.join(root, 'data', locale, course.contentDir, path.dirname(page.file), ...parts) : path.join(root, 'data', locale, file);
    const destination = path.join(output, locale, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(sourcePath, destination);
  }
}

export async function localizeSite(root, output, site, prepare = false) {
  const { files, html, galleries, banks, ui, corpus, corpusManifest, sourceSegments, labels, manifest } = await translationSource(root, output, site);
  const manifestPath = path.join(root, '.cache/i18n/manifest.json');
  await mkdir(path.dirname(manifestPath), { recursive: true });
  if (prepare) {
    await writeFile(manifestPath, JSON.stringify(manifest));
    console.log(`Prepared ${manifest.segments.length} translation segments from Spanish sources.`);
    return;
  }
  const dictionaries = await loadTranslations(root, manifest);
  const save = async (file, data) => { const target = path.join(output, file); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, typeof data === 'string' ? data : JSON.stringify(data)); };
  const translateFor = locale => text => {
    if (locale === 'es' || typeof text !== 'string' || !/\p{L}/u.test(text) || text.length < 2) return text;
    const value = dictionaries[locale][segmentId(text, 'text')];
    if (typeof value !== 'string') throw new Error(`Missing ${locale} translation: ${text.slice(0, 100)}`);
    return value;
  };
  const translationManifest = { schemaVersion: 1, contentHash: corpusManifest.contentHash, locales: {} };
  for (const [locale, language] of Object.entries(languages)) {
    const translate = translateFor(locale);
    const prefix = `${locale}/`;
    const url = value => localURL(value, site.base, locale, site.origin);
    const dictionary = Object.fromEntries([...Object.entries(ui).map(([key, value]) => [key, translate(value)]), ...labels.map(label => [label, translate(label)])]);
    // One cached dictionary per language, not a copy in every generated page.
    const dictionaryJSON = JSON.stringify(dictionary);
    const dictionaryVersion = contentHash(dictionaryJSON).slice(0, 16);
    await save(`assets/i18n/${locale}-${dictionaryVersion}.json`, dictionaryJSON);
    for (const [file, source] of html) {
      let rendered = translateHTML(source, translate);
      rendered = rendered.replace(/\b(href|src|data-diagram|data-poster|data-base)="([^"]*)"/g, (match, key, value) => `${key}="${url(value)}"`);
      // Selector destinations are canonical and must not receive a second locale prefix.
      rendered = rendered.replace(/(<a\b[^>]*data-language-link="(es|en|pt|it)"[^>]*href=")[^"]*(")/g, (_, before, target, after) => before + site.base + `${target}/` + file.replace(/index\.html$/, '') + after);
      const canonical = decode(source.match(/<link rel="canonical" href="([^"]+)"/)?.[1] || site.origin + site.base + file.replace(/index\.html$/, ''));
      const pageURL = url(canonical);
      const alternates = Object.entries(languages).map(([key, lang]) => `<link rel="alternate" hreflang="${lang}" href="${localURL(canonical, site.base, key, site.origin)}">`).join('');
      rendered = rendered.replace('<html lang="es"', `<html lang="${language}"`).replace('<body ', `<body data-locale="${locale}" data-i18n-version="${dictionaryVersion}" data-site-base="${site.base}" `)
        .replace(/(<link rel="canonical" href=")[^"]+/, `$1${pageURL}`).replace(/(<meta property="og:url" content=")[^"]+/, `$1${pageURL}`)
        .replace('</head>', `${alternates}<link rel="alternate" hreflang="x-default" href="${canonical}"></head>`);
      rendered = rendered.replace(new RegExp(`(data-language-link="${locale}")`, 'g'), '$1 aria-current="true"');
      await save(prefix + file, rendered);
      if (locale === 'es') await save(file, rendered); // Keep existing Spanish links as aliases.
    }
    for (const [file, gallery] of galleries) await save(prefix + file, visitGallery(gallery, translate, url));
    for (const [bank, questions] of banks) await save(`${prefix}assets/${bank}.json`, translateBank(questions, translate));
    await publishImages(root, output, site, files, locale);
    if (locale !== 'es') {
      const localized = sourceSegments.map(({ name, sourceHash, title, text }) => ({ name, sourceHash, title: translate(title), text: translate(text) }));
      const data = JSON.stringify({ schemaVersion: 1, locale, contentHash: corpusManifest.contentHash, segments: localized });
      translationManifest.locales[locale] = contentHash(data);
      await save(`assets/certichat/i18n/${locale}.json`, data);
    }
    const documents = corpus.documents.map(doc => ({ ...doc, title: translate(doc.title), url: url(doc.url), text: sourceSegments.filter(segment => segment.id === doc.id).map(segment => translate(segment.text)).join('') }));
    await save(`${prefix}assets/certichat/search.json`, { schemaVersion: 1, documents });
  }
  await save('assets/certichat/i18n/manifest.json', translationManifest);
  const runtimeCourses = [];
  for (const course of site.courses) {
    const bank = banks.get(course.questionBank).map(question => ({ ...question, translations: Object.fromEntries(['en', 'pt', 'it'].map(locale => { const t = translateFor(locale); return [locale, { question: t(question.question), options: Object.fromEntries(question.options.map(option => [option.id, { text: t(option.text), explanation: option.explanation ? t(option.explanation) : '' }])) }]; })) }));
    const data = JSON.stringify(bank);
    if (Buffer.byteLength(data) > 2 * 1024 * 1024) throw new Error('Translated question bank exceeds API limit.');
    await save(`assets/certiquiz/${course.questionBank}.json`, data);
    runtimeCourses.push({ id: course.id, title: course.title, questionBank: course.questionBank, sha256: contentHash(data), titleTranslations: Object.fromEntries(['en', 'pt', 'it'].map(locale => [locale, translateFor(locale)(course.title)])) });
  }
  await save('assets/certiquiz/catalog.json', { courses: runtimeCourses });
}

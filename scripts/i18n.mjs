import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const locales = ['en', 'pt', 'it'];
const digest = text => createHash('sha256').update(text).digest('hex');
export const segmentId = (text, context = '') => digest(`${context}\0${text}`);
export const sourceDigest = manifest => digest(JSON.stringify(manifest.segments.map(({ id, text, context = '' }) => [id, text, context]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));

export function validateManifest(manifest) {
  if (manifest?.version !== 1 || !Array.isArray(manifest.segments) || manifest.segments.length > 250_000) throw new Error('Invalid translation manifest');
  if (manifest.sourceRoot !== undefined && manifest.sourceRoot !== 'data/es') throw new Error('Translation source must be data/es');
  const ids = new Set();
  for (const { id, text, context = '' } of manifest.segments) {
    if (typeof text !== 'string' || text.length > 32768 || typeof context !== 'string' || context.length > 1024 || id !== segmentId(text, context) || ids.has(id)) throw new Error(`Invalid or duplicated translation segment: ${id}`);
    ids.add(id);
  }
  return ids;
}

export async function engineDigest(root) {
  const parts = await Promise.all(['data/i18n.json', 'requirements-i18n.txt'].map(file => readFile(path.join(root, file))));
  return digest(Buffer.concat(parts));
}

async function svgSourceHashes(directory, prefix = '') {
  const entries = await readdir(path.join(directory, prefix), { withFileTypes: true });
  const result = {};
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error('Symlinks are not translation sources');
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory() && entry.name !== 'diagram-sources') Object.assign(result, await svgSourceHashes(directory, relative));
    else if (entry.isFile() && relative.endsWith('.svg')) result[relative] = digest(await readFile(path.join(directory, relative)));
  }
  return result;
}

async function checkSVG(root, locale, document, sources) {
  if (!document.svg || Object.keys(document.svg).length !== Object.keys(sources).length) throw new Error(`Incomplete ${locale} SVG coverage`);
  for (const [relative, sourceHash] of Object.entries(sources)) {
    const record = document.svg[relative];
    if (!record || record.sourceHash !== sourceHash) throw new Error(`Stale ${locale} SVG: ${relative}`);
    const filename = path.join(root, 'data', locale, relative);
    if (record.outputHash !== digest(await readFile(filename))) throw new Error(`Corrupt ${locale} SVG: ${relative}`);
  }
}

export async function loadTranslations(root, manifest) {
  const ids = validateManifest(manifest);
  const expectedSource = sourceDigest(manifest), expectedEngine = await engineDigest(root);
  const svgSources = await svgSourceHashes(path.join(root, 'data/es'));
  return Object.fromEntries(await Promise.all(locales.map(async locale => {
    const filename = path.join(root, 'data', locale, 'translations.json');
    let document;
    try { document = JSON.parse(await readFile(filename, 'utf8')); }
    catch { throw new Error(`Missing/invalid ${locale} translations. Run npm run i18n:generate.`); }
    if (document.version !== 1 || document.locale !== locale || document.sourceDigest !== expectedSource || document.engineDigest !== expectedEngine) throw new Error(`Stale ${locale} translations. Run npm run i18n:generate.`);
    const translations = document.translations;
    if (!translations || Object.keys(translations).length !== ids.size || [...ids].some(id => typeof translations[id] !== 'string' || !translations[id].trim() || translations[id].length > 131072)) throw new Error(`Incomplete ${locale} translation coverage`);
    if (document.translationDigest !== digest(JSON.stringify(Object.entries(translations).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)))) throw new Error(`Corrupt ${locale} translation dictionary`);
    await checkSVG(root, locale, document, svgSources);
    return [locale, translations];
  })));
}

async function pythonCommand(root) {
  if (process.env.I18N_PYTHON) return process.env.I18N_PYTHON;
  const candidate = path.join(root, 'output/i18n-venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  try { await stat(candidate); return candidate; } catch { return 'python'; }
}

export async function runTranslationCommand(command, args = [], root = process.cwd()) {
  if (!['generate', 'check', 'models', 'pilot'].includes(command)) throw new Error('Usage: node scripts/i18n.mjs generate|check|models|pilot [--manifest path]');
  const python = await pythonCommand(root);
  await new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(root, 'scripts/i18n.py'), command, ...args], { cwd: root, stdio: 'inherit', env: { ...process.env, PYTHONUTF8: '1' } });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Translation ${command} failed (${code})`)));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runTranslationCommand(process.argv[2], process.argv.slice(3)).catch(error => { console.error(error.message); process.exitCode = 1; });
}

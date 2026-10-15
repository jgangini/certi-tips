// Uses an existing Playwright installation; PLAYWRIGHT_MODULE may point to a bundled runtime.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { withDiagramFonts } from './diagram-fonts.mjs';

const locales = (process.argv[2] || 'es').split(',');
if (locales.some(locale => !['es', 'en', 'pt', 'it'].includes(locale))) throw new Error('Use es,en,pt,it locale codes');
const output = resolve(process.argv[3] || 'output/diagram-geometry.json');
const expected = readdirSync(resolve('data/es'), { recursive: true }).filter(file => file.endsWith('.svg')).sort();
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const check = runInNewContext(`(${readFileSync(new URL('./diagram-check.cjs', import.meta.url), 'utf8')})`);
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
const reports = {};
try {
  const page = await browser.newPage();
  for (const locale of new Set(['es', ...locales])) {
    const directory = resolve('data', locale);
    const files = readdirSync(directory, { recursive: true }).filter(file => file.endsWith('.svg')).sort();
    if (JSON.stringify(files) !== JSON.stringify(expected)) throw new Error(`${locale}: SVG paths differ from the Spanish source (${files.length}/${expected.length})`);
    const sources = files.map(file => {
      const target = resolve(dirname(output), 'diagram-fonts', locale, file);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, withDiagramFonts(readFileSync(resolve(directory, file), 'utf8')));
      return pathToFileURL(target).href;
    });
    reports[locale] = await check(page, { sources, reference: locale === 'es' ? undefined : reports.es.diagrams, failOnIssues: false, onProgress: (count, total) => { if (count % 50 === 0 || count === total) console.log(`${locale}: ${count}/${total} SVG measured`); } });
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(reports, null, 2) + '\n');
    console.log(`${locale}: ${reports[locale].issues.length} diagrams with geometry findings`);
  }
} finally { await browser.close(); }
if (Object.values(reports).some(report => report.issues.length)) process.exitCode = 1;

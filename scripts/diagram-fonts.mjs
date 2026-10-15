import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../assets/fonts/didact-gothic-latin-400-normal.woff2', import.meta.url)).toString('base64');
const mono = readFileSync(new URL('../assets/fonts/jetbrains-mono-latin-400-normal.woff2', import.meta.url)).toString('base64');
// ponytail: these existing Latin subsets cover es/en/pt/it; add a subset before introducing other scripts.
const families = [['Didact Gothic', ui], ['Segoe UI', ui], ['Oracle Sans', ui], ['JetBrains Mono', mono], ['Consolas', mono]];

export const isDiagramFontData = data => data === ui || data === mono;

export function withDiagramFonts(source) {
  if (source.includes('data-diagram-fonts')) return source;
  const css = families.filter(([family]) => source.includes(family)).map(([family, data]) => `@font-face{font-family:'${family}';font-style:normal;font-weight:400;src:url(data:font/woff2;base64,${data}) format('woff2')}`).join('');
  return css ? source.replace(/<svg\b(?:[^>"']|"[^"]*"|'[^']*')*>/, root => `${root}<style data-diagram-fonts="">${css}</style>`) : source;
}

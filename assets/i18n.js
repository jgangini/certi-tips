const document = globalThis.document;
export const locale = document?.body?.dataset.locale || 'es';
export const language = { es: 'es', en: 'en', pt: 'pt-BR', it: 'it' }[locale] || 'es';
export const siteBase = document?.body?.dataset.siteBase || document?.body?.dataset.base || '/certitips/';
let messages = {};
if (document) {
  try {
    const response = await fetch(new URL(`./i18n/${locale}${document.body.dataset.i18nVersion ? "-" + document.body.dataset.i18nVersion : ""}.json`, import.meta.url), { signal: AbortSignal.timeout(8000) });
    if (response.ok) messages = await response.json();
  } catch { /* Static translated pages remain readable during an asset outage. */ }
}

export function t(source, values = {}) {
  return String(messages[source] ?? source).replace(/\{([\w]+)\}/g, (token, key) => Object.hasOwn(values, key) ? String(values[key]) : token);
}

function routeURL(value, target, base) {
  const origin = globalThis.location?.origin || 'https://jgangini.github.io';
  const url = new URL(value, origin);
  if (url.origin !== origin && url.origin !== 'https://jgangini.github.io') return value;
  if (!url.pathname.startsWith(base)) return value;
  const relative = url.pathname.slice(base.length).replace(/^(?:es|en|pt|it)\//, '');
  if (relative.startsWith('assets/')) return value;
  url.pathname = base + (target ? target + '/' : '') + relative;
  return /^https?:/.test(value) ? url.href : url.pathname + url.search + url.hash;
}

export function localizedURL(value, target = locale, base = siteBase) {
  if (!['es', 'en', 'pt', 'it'].includes(target)) throw new Error('Unsupported locale');
  return routeURL(value, target, base);
}

export function canonicalURL(value) { return routeURL(value, '', siteBase); }

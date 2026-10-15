// Pages serves the root 404 for every missing path; keep that URL and its language.
const base = document.body.dataset.siteBase;
const locale = location.pathname.slice(base.length).match(/^(es|en|pt|it)\//)?.[1];
if (locale && locale !== document.body.dataset.locale) {
  try {
    const response = await fetch(`${base}${locale}/404.html`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Missing localized error page');
    const translated = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (translated.body.dataset.page !== '404' || translated.body.dataset.locale !== locale) throw new Error('Invalid localized error page');
    document.documentElement.lang = translated.documentElement.lang;
    document.head.replaceChildren(...translated.head.childNodes);
    document.body.replaceWith(translated.body);
  } catch { /* The original error remains readable if the localized file is unavailable. */ }
}
await import('./site.js');

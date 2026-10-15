async (page) => {
  const origin = new URL(page.url()).origin;
  const root = `${origin}/certitips/`;
  const failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const fallback = await (await page.request.get(`${root}404.html`)).text();
  let cases = 0;
  for (const pagesFallback of [false, true]) {
    const missing = url => url.pathname.includes('/missing-status-check/');
    if (pagesFallback) await page.route(missing, route => route.fulfill({ status: 404, contentType: 'text/html', body: fallback }));
    for (const locale of ['es', 'en', 'pt', 'it']) {
      for (const width of [375, 1315]) {
        for (const theme of ['light', 'dark']) {
          await page.setViewportSize({ width, height: 1019 });
          await page.evaluate(theme => { localStorage.setItem('certitips:theme', theme); localStorage.removeItem('certitips:locale'); }, theme);
          const url = `${root}${locale}/missing-status-check/nested/?room=ABC123#section`;
          await page.goto('about:blank');
          const response = await page.goto(url);
          await page.waitForFunction(locale => document.body.dataset.locale === locale && [...document.querySelectorAll('[data-language-link]')].every(link => link.href.includes('missing-status-check')), locale);
          await page.locator('.status-page h1 svg').waitFor();
          await page.waitForFunction(() => Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--footer-height')) - document.querySelector('.site-footer').getBoundingClientRect().height) < 1);
          const state = await page.evaluate(() => {
            const card = document.querySelector('.status-page .loading-full');
            const heading = card.querySelector('h1');
            const bounds = card.getBoundingClientRect();
            const header = document.querySelector('.site-header').getBoundingClientRect();
            const footer = document.querySelector('.site-footer').getBoundingClientRect();
            return {
              lang: document.documentElement.lang,
              theme: document.documentElement.dataset.theme || 'light',
              title: heading.querySelector("span").textContent,
              extraLink: Boolean(card.querySelector("a")),
              centered: getComputedStyle(card).justifyContent === 'center' && Math.abs((bounds.top + bounds.bottom) / 2 - (header.bottom + footer.top) / 2) < 3,
              overflow: document.documentElement.scrollWidth > innerWidth,
              f5: card.querySelector('kbd')?.textContent,
              robots: document.querySelector('meta[name="robots"]')?.content,
              sidebar: Boolean(document.querySelector('.sidebar')),
              game: Boolean(document.querySelector('script[src*="/certiquiz.js"]')),
              links: [...document.querySelectorAll('[data-language-link]')].map(link => ({ locale: link.dataset.languageLink, href: link.href })),
            };
          });
          const label = `${pagesFallback ? 'Pages' : 'preview'}/${locale}/${width}/${theme}`;
          check(response.status() === 404 && page.url() === url, `${label}: HTTP 404 and original URL`);
          check(state.lang === (locale === 'pt' ? 'pt-BR' : locale) && state.theme === theme, `${label}: language/theme`);
          check(state.centered && !state.overflow, `${label}: centered responsive layout`);
          check(state.f5 === 'F5' && state.robots === 'noindex' && !state.sidebar && !state.game, `${label}: error semantics`);
          check(state.links.every(link => link.href === `${root}${link.locale}/missing-status-check/nested/?room=ABC123#section`), `${label}: equivalent language links`);
          check(state.title === { es: 'Página no encontrada', en: 'Page not found', pt: 'Página não encontrada', it: 'Pagina non trovata' }[locale] && !state.extraLink, `${label}: standard heading without extra link`);
          if (width === 375 && theme === 'dark') {
            await page.reload();
            await page.waitForURL(`${root}${locale}/`);
            check(await page.locator('.home-hero').count() === 1, `${label}: reload returns to localized home`);
          }
          cases++;
        }
      }
    }
    if (pagesFallback) {
      for (const locale of ['es', 'en', 'pt', 'it']) {
        await page.goto(`${root}/${locale}/missing-status-check/?room=ABC123#section`);
        await page.waitForFunction(locale => document.body.dataset.locale === locale, locale);
        await page.reload();
        await page.waitForURL(`${root}${locale}/`);
        check(await page.locator('.home-hero').count() === 1, `Pages/${locale}: extra slash still returns to localized home`);
        cases++;
      }
      await page.unroute(missing);
    }
  }
  for (const locale of ['es', 'en', 'pt', 'it']) {
    for (const width of [375, 1315]) {
      for (const theme of ['light', 'dark']) {
        await page.setViewportSize({ width, height: 1019 });
        await page.evaluate(theme => localStorage.setItem('certitips:theme', theme), theme);
        await page.goto('about:blank');
        await page.goto(`${root}${locale}/certiquiz/`);
        await page.locator('.loading-error kbd').waitFor();
        const centered = await page.evaluate(() => {
          const card = document.querySelector('.loading-error');
          const bounds = card.getBoundingClientRect();
          const header = document.querySelector('.site-header').getBoundingClientRect();
          const footer = document.querySelector('.site-footer').getBoundingClientRect();
          return getComputedStyle(card).margin === '0px' && Math.abs((bounds.top + bounds.bottom) / 2 - (header.bottom + footer.top) / 2) < 3;
        });
        check(centered, `CertiQuiz/${locale}/${width}/${theme}: full-height centered error without margins`);
        check(await page.locator('.loading-error h1 svg').count() === 1, `CertiQuiz/${locale}/${theme}: rocket remains present on service failure`);
        check(await page.locator('.loading-error kbd').textContent() === 'F5', `CertiQuiz/${locale}/${theme}: reload hint`);
        cases++;
      }
    }
  }
  check(!errors.length, `Browser errors: ${errors.join('; ')}`);
  if (failures.length) throw new Error(failures.join('\n'));
  return { cases, errors, screenshots: 0 };
}

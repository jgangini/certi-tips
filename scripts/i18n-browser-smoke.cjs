// playwright-cli -s=i18n open http://127.0.0.1:4173/certitips/es/
// playwright-cli -s=i18n run-code --filename scripts/i18n-browser-smoke.cjs
// Isolated browser context; DOM, keyboard and geometry only. External/API requests are blocked.
async (page) => {
  const origin = new URL(page.url()).origin;
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Use the local static preview.');
  const base = origin + '/certitips/', languages = ['es', 'en', 'pt', 'it'];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const context = await page.context().browser().newContext({ reducedMotion: 'reduce' });
  const tab = await context.newPage(), errors = [], checked = [];
  tab.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort();
  });
  const ready = async (locale, route = '') => {
    const response = await tab.goto(`${base}${locale}/${route}?i18n-check=1#i18n-anchor`);
    assert(!response || response.status() === 200, `Page missing: ${locale}/${route}`);
    await tab.waitForFunction(() => document.querySelector('[data-language-link]')?.search.includes('i18n-check=1'));
    assert(await tab.locator('body').getAttribute('data-locale') === locale, `Explicit URL lost language: ${locale}/${route}`);
    assert(await tab.locator('html').getAttribute('lang') === (locale === 'pt' ? 'pt-BR' : locale), `Wrong document lang: ${locale}`);
  };
  const dropdownAppearance = async details => {
    const style = await details.locator('.language-panel').evaluate(panel => {
      const css = getComputedStyle(panel);
      return { shared: panel.classList.contains('path-group-panel'), width: panel.getBoundingClientRect().width,
        padding: css.padding, radius: css.borderRadius, shadow: css.boxShadow,
        decoration: [...panel.querySelectorAll('a')].map(link => getComputedStyle(link, '::after').content) };
    });
    assert(style.shared && style.width === 160 && style.padding === '9px' && style.radius === '9px' && style.shadow !== 'none', `Dropdown lost the compact course-panel style: ${JSON.stringify(style)}`);
    assert(style.decoration.every(value => value === 'none' || value === 'normal'), 'Language selection still has a decorative check');
    const appearance = async (link, state) => {
      const matches = await link.evaluate(node => {
        const probe = document.createElement('span');
        probe.style.cssText = node.getAttribute('aria-current') === 'true'
          ? 'color:var(--on-red);background:var(--red);display:none'
          : 'color:var(--ink);background:var(--hover);display:none';
        node.append(probe);
        const expected = getComputedStyle(probe), actual = getComputedStyle(node);
        const result = actual.color === expected.color && actual.backgroundColor === expected.backgroundColor;
        probe.remove(); return result;
      });
      assert(matches, `Language ${state} must use the gray course hover, with red reserved for the selected language`);
    };
    await appearance(details.locator('[aria-current="true"]'), 'selected');
    await tab.keyboard.press('Tab');
    assert(await details.locator('[data-language-link="es"]').evaluate(node => node === document.activeElement), 'Tab did not reach the first language');
    await appearance(details.locator('[data-language-link="es"]'), 'keyboard focus');
    await tab.keyboard.press('Tab');
    await appearance(details.locator('[data-language-link="en"]'), 'keyboard focus');
    const hovered = details.locator('[data-language-link]:not([aria-current="true"])').last();
    await hovered.hover();
    await appearance(hovered, 'hover');
  };
  const menu = async (locale, route, theme, width) => {
    const summary = tab.locator('.language-toggle'), details = tab.locator('.language-menu');
    if ((await tab.locator('html').getAttribute('data-theme') === 'dark') !== (theme === 'dark')) await tab.locator('[data-theme-toggle]').click();
    const geometry = await tab.locator('.site-header').evaluate(header => {
      const box = selector => header.querySelector(selector).getBoundingClientRect();
      const globe = box('.language-toggle'), moon = box('.theme-toggle'), logo = box('.brand > img');
      const minimum = innerWidth <= 480 ? 31 : 44;
      const controls = [...header.children].filter(node => getComputedStyle(node).display !== 'none').map(node => node.getBoundingClientRect()).filter(rect => rect.width && rect.height);
      return { overflow: document.documentElement.scrollWidth > innerWidth + 1,
        leftOfMoon: globe.right <= moon.left + 1, aligned: Math.abs(globe.top - moon.top) < 1,
        size: globe.width >= minimum && globe.height >= minimum && Math.abs(globe.width - moon.width) < 1 && Math.abs(globe.height - moon.height) < 1,
        logo: Math.abs(logo.width - 36) < 1 && Math.abs(logo.height - 36) < 1,
        overlap: controls.some((a, index) => controls.slice(index + 1).some(b => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1)) };
    });
    assert(!geometry.overflow && !geometry.overlap && geometry.leftOfMoon && geometry.aligned && geometry.size && geometry.logo, `${locale}/${route} ${width}px ${theme}: header ${JSON.stringify(geometry)}`);
    await summary.focus(); await tab.keyboard.press('Enter');
    assert(await details.evaluate(node => node.open), 'Enter did not open the language menu');
    const links = await details.locator('[data-language-link]').evaluateAll(nodes => nodes.map(node => ({ locale: node.dataset.languageLink, path: new URL(node.href).pathname, search: node.search, hash: node.hash, current: node.getAttribute('aria-current') })));
    assert(links.length === 4 && links.filter(link => link.current === 'true').length === 1, 'Language options/selection are incomplete');
    for (const link of links) {
      assert(link.path === `/certitips/${link.locale}/${route}` && link.search === '?i18n-check=1' && link.hash === '#i18n-anchor', `Language link loses route/query/hash: ${JSON.stringify(link)}`);
      assert((link.current === 'true') === (link.locale === locale), 'Wrong selected language');
    }
    assert(await details.locator('.language-panel').evaluate(panel => { const box = panel.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0 && box.bottom <= innerHeight; }), `Language menu escapes viewport: ${width}px`);
    await dropdownAppearance(details);
    await tab.keyboard.press('Escape');
    assert(await details.evaluate(node => !node.open) && await summary.evaluate(node => node === document.activeElement), 'Escape did not close the menu and restore focus');
    await summary.click(); await tab.locator('main').click({ position: { x: 5, y: 5 } });
    assert(await details.evaluate(node => !node.open), 'Outside click left the language menu open');
    checked.push(`${locale}/${route} ${width}px ${theme}`);
  };
  const choose = async locale => {
    await tab.locator('.language-toggle').click();
    const href = await tab.locator(`[data-language-link="${locale}"]`).getAttribute('href');
    await tab.locator(`[data-language-link="${locale}"]`).click();
    await tab.waitForURL(href);
    await tab.waitForFunction(value => document.body.dataset.locale === value && document.querySelector('[data-language-link]')?.search.includes('i18n-check=1'), locale);
  };
  const persistentStudyState = async () => {
    // A real completed lesson retains its canonical storage key across the four URLs.
    await tab.setViewportSize({ width: 1364, height: 1000 });
    await ready('es', '1Z0-1122-26/overview/');
    const completion = tab.locator('[data-mark-complete]');
    await completion.waitFor();
    if (await completion.getAttribute('aria-checked') !== 'true') await completion.click();
    const progress = await tab.evaluate(() => { const key = `certitips:progress:v1:${document.body.dataset.course}`; return { key, value: localStorage.getItem(key) }; });
    assert(progress.value, 'Lesson completion was not persisted');
    for (const locale of ['en', 'pt', 'it', 'es']) {
      await choose(locale);
      await tab.waitForFunction(() => document.querySelector('[data-mark-complete]')?.getAttribute('aria-checked') === 'true');
      assert(await tab.evaluate(key => localStorage.getItem(key), progress.key) === progress.value, 'Language switch changed lesson progress');
    }

    // Practice resumes the same question IDs and chosen answer using the translated bank.
    await ready('es', '1Z0-1122-26/practice/');
    await tab.locator('[data-start]').click();
    await tab.locator('input[name="answer"]').first().check();
    await tab.locator('#question-form button[type="submit"]').click();
    await tab.locator('.feedback').waitFor();
    const attempt = await tab.evaluate(() => { const key = `certitips:quiz:v1:${document.body.dataset.course}`; return { key, value: localStorage.getItem(key) }; });
    const originalText = await tab.locator('.quiz-question').textContent();
    for (const locale of ['en', 'pt', 'it', 'es']) {
      await choose(locale);
      await tab.locator('.feedback').waitFor();
      assert(await tab.evaluate(key => localStorage.getItem(key), attempt.key) === attempt.value, 'Language switch changed practice IDs/answers');
      if (locale !== 'es') assert(await tab.locator('.quiz-question').textContent() !== originalText, `Practice did not use ${locale} text`);
    }
  };
  const equivalentSearches = async () => {
    const queries = { es: 'gobierno de datos', en: 'data governance', pt: 'governança de dados', it: 'governo dei dati' };
    const matches = {};
    for (const [locale, query] of Object.entries(queries)) {
      await ready(locale, 'courses/');
      await tab.locator('[data-search-open]').click();
      await tab.waitForFunction(() => document.querySelector('#site-search').getAttribute('aria-busy') === 'false');
      await tab.locator('#search-query').fill(query);
      const links = await tab.locator('#search-results li:not([hidden]) a').evaluateAll(nodes => nodes.map(node => new URL(node.href).pathname));
      matches[locale] = links.filter(value => value.startsWith(`/certitips/${locale}/CDMP-DMF/`));
      assert(matches[locale].length, `Equivalent search has no CDMP-DMF result for ${locale}: ${query}`);
      assert(links.filter(value => value.startsWith('/certitips/')).every(value => value.startsWith(`/certitips/${locale}/`)), `Search links use another locale: ${locale}`);
      await tab.keyboard.press('Escape');
    }
    return matches;
  };
  try {
    for (const locale of languages) for (const width of [320, 360, 480, 800, 1364]) {
      await tab.setViewportSize({ width, height: 1000 });
      await ready(locale);
      for (const theme of ['light', 'dark']) await menu(locale, '', theme, width);
    }
    for (const [index, route] of ['courses/', '1Z0-1122-26/overview/', '1Z0-1122-26/practice/', 'certiquiz/', 'certitube/', 'certichat/'].entries()) {
      const locale = languages[index % languages.length];
      for (const width of [320, 360, 361, 481, 681, 701, 800, 1364]) {
        await tab.setViewportSize({ width, height: 1000 });
        await ready(locale, route);
        await menu(locale, route, width === 360 ? 'light' : 'dark', width);
      }
    }
    // A conflicting saved preference must never override an explicit language URL.
    await tab.evaluate(() => localStorage.setItem('certitips:locale', 'it'));
    for (const locale of languages) await ready(locale, 'courses/');
    await tab.goto(`${base}courses/?i18n-check=1#i18n-anchor`);
    await tab.waitForURL(`${base}it/courses/?i18n-check=1#i18n-anchor`);
    await tab.evaluate(() => { location.hash = 'updated-anchor'; });
    await choose('en');
    assert(tab.url() === `${base}en/courses/?i18n-check=1#updated-anchor`, 'Language switch lost a changed fragment');
    await tab.evaluate(() => history.replaceState(null, '', '?i18n-check=1&updated=1#updated-anchor'));
    await choose('pt');
    assert(tab.url() === `${base}pt/courses/?i18n-check=1&updated=1#updated-anchor`, 'Language switch lost a query changed by history.replaceState');
    await persistentStudyState();
    const searchMatches = await equivalentSearches();
    assert(!errors.length, `Browser exceptions: ${errors.join('; ')}`);
    return { passed: checked.length, checks: 'Four languages, header widths/themes, keyboard/outside click, equivalent routes/query/hash, preference precedence and persistent lesson/practice state', searchMatches, screenshots: 0, externalAPICalls: 0 };
  } finally { await context.close(); }
}

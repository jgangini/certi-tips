// Run with playwright-cli run-code --filename scripts/home-search-mobile-smoke.cjs.
async (page) => {
  const origin = new URL(page.url()).origin;
  if (origin !== 'http://127.0.0.1:4173') throw new Error('Use the local preview.');
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const context = await page.context().browser().newContext({ reducedMotion: 'reduce' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const tab = await context.newPage(), checks = [];
  const settle = () => tab.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const closeStyle = () => tab.locator('[data-search-close]').evaluate(element => {
    const box = element.getBoundingClientRect(), css = getComputedStyle(element);
    return { top: box.top, right: box.right, width: box.width, height: box.height, border: css.border, radius: css.borderRadius, icon: element.querySelector('svg').getBoundingClientRect().width };
  });
  try {
    for (const width of [320, 394, 480, 800, 801]) {
      await tab.setViewportSize({ width, height: 852 });
      await tab.goto(`${origin}/certitips/`);
      await tab.locator('[data-chat-close]').waitFor({ state: 'attached' });
      await tab.evaluate(() => document.fonts.ready);
      for (const theme of ['light', 'dark']) {
        const dark = await tab.locator('html').getAttribute('data-theme') === 'dark';
        if (dark !== (theme === 'dark')) await tab.locator('.theme-toggle').click();
        await settle();
        if (width <= 800) {
          await tab.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
          await settle();
          const spacing = await tab.evaluate(() => {
            const card = document.querySelector('.hero-actions').getBoundingClientRect();
            const button = document.querySelector('.certichat-launcher').getBoundingClientRect();
            const footer = document.querySelector('.site-footer').getBoundingClientRect();
            const ambient = document.querySelector('.hero-ambient').getBoundingClientRect();
            return { above: button.top - card.bottom, below: footer.top - button.bottom, right: Math.abs(button.right - card.right), backgroundGap: footer.top - ambient.bottom };
          });
          assert(spacing.above >= 23 && Math.abs(spacing.below - 24) < 1 && spacing.right < 1 && spacing.backgroundGap <= 1, `${width}/${theme}: launcher spacing ${JSON.stringify(spacing)}`);
          await tab.locator('[data-chat-open]').click();
          await settle();
          const chat = await tab.locator('[data-chat-close]').evaluate(e => {
            const r = e.getBoundingClientRect(), s = getComputedStyle(e);
            return { top: r.top, right: r.right, width: r.width, height: r.height, border: s.border, radius: s.borderRadius, icon: e.querySelector('svg').getBoundingClientRect().width };
          });
          await tab.locator('[data-chat-close]').click();
          await tab.locator('.search-toggle').click();
          await settle();
          const search = await closeStyle();
          for (const key of Object.keys(chat)) assert(typeof chat[key] === 'number' ? Math.abs(chat[key] - search[key]) < 1 : chat[key] === search[key], `${width}/${theme}: close ${key} differs`);
          const fits = await tab.locator('#site-search').evaluate(e => {
            const r = e.getBoundingClientRect();
            return Math.abs(r.top) < 1 && Math.abs(r.left) < 1 && Math.abs(r.width - innerWidth) < 1 && Math.abs(r.height - innerHeight) < 1 && e.scrollHeight <= e.clientHeight + 1 && document.documentElement.scrollWidth <= innerWidth;
          });
          assert(fits, `${width}/${theme}: search is not fullscreen or overflows`);
        } else {
          await tab.locator('.search-toggle').click();
          assert(await tab.locator('#site-search').evaluate(e => e.getBoundingClientRect().width < innerWidth), 'Desktop search became fullscreen');
        }
        await tab.locator('#search-query').fill('DAMA');
        await tab.locator('#search-query').press('Escape');
        assert(await tab.locator('.search-toggle').evaluate(e => e === document.activeElement), 'Search did not return keyboard focus');
        checks.push(`${width}/${theme}`);
      }
      await tab.goto(`${origin}/certitips/courses/`);
      await settle();
      assert(await tab.locator('.course-groups').isVisible() === (width > 800), `${width}: catalog navigation visibility`);
      if (width <= 800) {
        for (const theme of ['light', 'dark']) {
          const dark = await tab.locator('html').getAttribute('data-theme') === 'dark';
          if (dark !== (theme === 'dark')) await tab.locator('.theme-toggle').click();
          for (let group = 0; group < 5; group++) {
            await settle();
            const fit = await tab.evaluate(() => {
              const panel = document.querySelector('.path-section.is-active').getBoundingClientRect();
              const header = document.querySelector('.site-header').getBoundingClientRect();
              const footer = document.querySelector('.site-footer').getBoundingClientRect();
              const css = getComputedStyle(document.querySelector('.path-section.is-active'));
              return Math.abs(panel.top - header.bottom) < 1 && Math.abs(panel.bottom - footer.top) < 1 && Math.abs(panel.left) < 1 && Math.abs(panel.right - innerWidth) < 1 && css.borderRadius === '0px' && document.documentElement.scrollWidth <= innerWidth;
            });
            assert(fit, `${width}/${theme}/${group}: catalog does not fill available height`);
            if (group < 4) await tab.locator('[data-group-next]').click();
          }
          for (let group = 0; group < 4; group++) await tab.locator('[data-group-prev]').click();
        }
      }
    }
    return { checks, screenshots: 0 };
  } finally { await context.close(); }
}

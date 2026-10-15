// playwright-cli run-code --filename scripts/certichat-page-layout-smoke.cjs
// Isolated local history; no messages are sent to an API.
async page => {
  const origin = new URL(page.url()).origin;
  if (origin !== 'http://127.0.0.1:4173') throw new Error('Use the local preview.');
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const context = await page.context().browser().newContext({ reducedMotion: 'reduce' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const tab = await context.newPage(), checks = [];
  try {
    await tab.goto(`${origin}/certitips/`);
    const key = await tab.locator('[data-certichat]').getAttribute('data-site-root').then(value => `certichat:${value}`);
    await tab.evaluate(key => localStorage.setItem(key, JSON.stringify({ updatedAt: Date.now(), messages: [{ role: 'ai', text: 'Mensaje de comprobación' }] })), key);
    for (const width of [394, 1280]) {
      await tab.setViewportSize({ width, height: 852 });
      for (const theme of ['light', 'dark']) {
        for (const target of ['CertiTips', 'CertiQuiz', 'CertiTube', 'CertiTips, inicio']) {
          await tab.goto(`${origin}/certitips/certichat/`);
          await tab.waitForFunction(() => document.querySelector('deep-chat')?.shadowRoot?.textContent.includes('Mensaje de comprobación'));
          const dark = await tab.locator('html').getAttribute('data-theme') === 'dark';
          if (dark !== (theme === 'dark')) await tab.locator('.theme-toggle').click();
          await tab.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          if (width <= 800) {
            const fits = await tab.locator('#certichat-panel').evaluate(e => {
              const r = e.getBoundingClientRect(), css = getComputedStyle(e);
              return Math.abs(r.left) < 1 && Math.abs(r.right - innerWidth) < 1 && Math.abs(r.top - document.querySelector('.site-header').getBoundingClientRect().bottom) < 1 && Math.abs(r.bottom - document.querySelector('.site-footer').getBoundingClientRect().top) < 1 && css.borderTopWidth === '0px' && css.borderRadius === '0px';
            });
            assert(fits, `${width}/${theme}: dedicated chat has outer margins or borders`);
          }
          const link = tab.locator(`.site-header a[aria-label="${target}"]`), destination = await link.getAttribute('href');
          await link.click();
          await tab.waitForURL(new URL(destination, origin).href);
          await tab.waitForFunction(() => !document.documentElement.classList.contains('chat-restoring'));
          const state = await tab.evaluate(key => ({ open: sessionStorage.getItem(`${key}:open`), reference: sessionStorage.getItem(`${key}:reference`), hidden: document.querySelector('#certichat-panel')?.hidden ?? true, history: localStorage.getItem(key) }), key);
          assert(state.open !== 'true' && !state.reference && state.hidden, `${width}/${theme}/${target}: destination chat is open`);
          assert(state.history.includes('Mensaje de comprobación'), 'Module navigation lost conversation history');
          checks.push(`${width}/${theme}/${target}`);
        }
      }
    }
    return { checks: checks.length, screenshots: 0 };
  } finally { await context.close(); }
}

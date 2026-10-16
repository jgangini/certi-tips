// playwright-cli run-code --filename scripts/language-transition-smoke.cjs
// Local navigation, held responses and DOM assertions; no screenshots or real API calls.
async page => {
  const origin = new URL(page.url()).origin;
  if (origin !== 'http://127.0.0.1:4173') throw new Error('Use the local preview.');
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const checks = [];
  for (const [route, from, to, theme, width, motion, fast] of [
    ['', 'es', 'en', 'light', 1146, 'no-preference'],
    ['1Z0-1085-26/overview/', 'en', 'pt', 'dark', 928, 'no-preference'],
    ['certitube/', 'pt', 'it', 'light', 394, 'no-preference'],
    ['certichat/', 'it', 'es', 'dark', 1280, 'no-preference'],
    ['certiquiz/', 'es', 'it', 'dark', 1146, 'no-preference'],
    ['certiquiz/', 'it', 'en', 'light', 394, 'reduce'],
    ['', 'it', 'es', 'light', 1275, 'no-preference', true],
  ]) {
    const context = await page.context().browser().newContext({ viewport: { width, height: 926 }, reducedMotion: motion });
    let changing = false;
    let releaseDictionary, releaseCatalog, sawDictionary, sawCatalog;
    const dictionaryRequested = new Promise(resolve => { sawDictionary = resolve; });
    const catalogRequested = new Promise(resolve => { sawCatalog = resolve; });
    const dictionaryGate = new Promise(resolve => { releaseDictionary = resolve; });
    const catalogGate = new Promise(resolve => { releaseCatalog = resolve; });
    await context.addInitScript(theme => localStorage.setItem('certitips:theme', theme), theme);
    await context.route('**/*', async request => {
      const url = new URL(request.request().url());
      if (url.pathname === '/api/catalog') {
        if (changing) { sawCatalog(); await catalogGate; }
        return request.fulfill({ json: { courses: [], limits: { maxQuestions: 20, minSeconds: 5, maxSeconds: 60, maxPlayers: 50 } } });
      }
      if (url.pathname === '/api/session') return request.fulfill({ json: { host: false, roomCode: null } });
      if (url.origin !== origin) return request.abort();
      if (changing && !fast && url.pathname.includes(`/assets/i18n/${to}-`)) { sawDictionary(); await dictionaryGate; }
      return request.continue();
    });
    const tab = await context.newPage();
    try {
      const suffix = '?transition-check=1#' + (route === 'certiquiz/' ? 'participant' : 'transition-check');
      await tab.goto(`${origin}/certitips/${from}/${route}${suffix}`);
      await tab.waitForFunction(() => document.querySelector('[data-language-link]')?.hash === location.hash && !document.querySelector('main [aria-busy="true"]'));
      assert(!await tab.locator('#language-transition').evaluate(e => e.open), 'Ordinary entry was blocked');
      await tab.locator('.language-toggle').click();
      await tab.evaluate(() => document.addEventListener('click', event => {
        if (!event.target.closest('[data-language-link]')) return;
        const e = document.querySelector('#language-transition');
        const cancel = new Event('cancel', { cancelable: true });
        e.dispatchEvent(cancel);
        document.querySelector('.theme-toggle').focus();
        sessionStorage.setItem('qa:language-glass', JSON.stringify({
          modal: e.matches(':modal'), blur: getComputedStyle(e, '::backdrop').backdropFilter,
          opacity: getComputedStyle(e, '::backdrop').opacity, scroll: getComputedStyle(document.documentElement).overflowY,
          outline: getComputedStyle(e).outlineStyle,
          blocked: cancel.defaultPrevented && e.contains(document.activeElement),
        }));
      }, { once: true }));
      const destination = tab.url().replace(`/certitips/${from}/`, `/certitips/${to}/`);
      changing = true;
      await tab.locator(`[data-language-link="${to}"]`).click({ noWaitAfter: true });
      await tab.waitForURL(destination, { waitUntil: 'commit' });
      await tab.locator('#language-transition[open]').waitFor({ state: 'attached' });
      await tab.waitForFunction(() => document.readyState !== 'loading');
      if (!fast) await dictionaryRequested;
      const glass = await tab.evaluate(() => JSON.parse(sessionStorage.getItem('qa:language-glass')));
      assert(glass?.modal && glass.blur === 'blur(3px)' && glass.opacity === '1' && glass.scroll === 'hidden' && glass.blocked, `Missing full-screen glass or keyboard blocking: ${JSON.stringify(glass)}`);
      assert(glass.outline === 'none', 'Source loading dialog has a square focus outline');
      assert(await tab.locator('#language-transition').evaluate(e => e.matches(':modal')), 'The destination lost the blocking layer while loading');
      assert(await tab.locator('#language-transition').evaluate(e => {
        const css = getComputedStyle(e), spinner = getComputedStyle(e.querySelector('.certichat-spinner'));
        return e === document.activeElement && css.outlineStyle === 'none' && css.borderTopWidth === '0px' && spinner.borderRadius === '50%';
      }), 'Focused loading indicator has a square border or outline');
      await tab.locator('#language-transition').evaluate(e => {
        window.transitionFaded = false;
        window.transitionTiming = { closedAt: 0, hiddenAt: 0 };
        e.addEventListener('close', () => {
          window.transitionTiming.closedAt = performance.now();
          requestAnimationFrame(function sample() {
            const opacity = Number(getComputedStyle(e, '::backdrop').opacity);
            if (opacity > 0 && opacity < 1) window.transitionFaded = true;
            if (getComputedStyle(e).display !== 'none') requestAnimationFrame(sample);
            else window.transitionTiming.hiddenAt = performance.now();
          });
        }, { once: true });
      });
      releaseDictionary();
      if (route === 'certiquiz/') {
        await tab.waitForFunction(() => document.querySelector('#app')?.getAttribute('aria-busy') === 'true');
        await tab.waitForFunction(() => document.querySelector('[data-language-link]')?.hash === location.hash);
        await catalogRequested;
        await tab.waitForFunction(() => performance.now() >= 900);
        assert(await tab.locator('#language-transition').evaluate(e => e.open), 'Quiz loading was exposed before the form was ready');
      }
      const releasedAt = await tab.evaluate(() => performance.now());
      releaseCatalog();
      await tab.waitForFunction(() => window.transitionTiming?.hiddenAt > 0);
      const timing = await tab.evaluate(() => window.transitionTiming);
      assert(timing.closedAt >= 680, `Glass flashed too briefly: ${JSON.stringify(timing)}`);
      if (route === 'certiquiz/') assert(timing.closedAt - releasedAt < 250, 'Slow page received an extra loading delay');
      if (motion !== 'reduce') assert(timing.hiddenAt - timing.closedAt >= 400, `Glass faded too fast: ${JSON.stringify(timing)}`);
      assert(await tab.evaluate(() => sessionStorage.getItem('certitips:language-transition') === null), 'Transition marker leaked into later navigation');
      assert(await tab.evaluate(() => window.transitionFaded) === (motion !== 'reduce'), 'Fade does not respect the motion preference');
      assert(await tab.locator('body').getAttribute('data-locale') === to, 'Language switch lost its destination');
      await tab.locator('.theme-toggle').focus();
      assert(await tab.locator('.theme-toggle').evaluate(e => e === document.activeElement), 'Page remains blocked after the fade');
      await tab.keyboard.press('Shift+Tab'); await tab.keyboard.press('Tab');
      assert(await tab.locator('.theme-toggle').evaluate(e => e.matches(':focus-visible') && getComputedStyle(e).outlineStyle !== 'none'), 'Keyboard focus disappeared from interactive controls');
      await tab.goBack();
      await tab.waitForFunction(() => !document.querySelector('#language-transition')?.open && !document.querySelector('main [aria-busy="true"]'));
      checks.push(`${route || 'home'}/${from}-${to}/${theme}/${width}/${motion}`);
    } finally {
      releaseDictionary(); releaseCatalog();
      await context.close();
    }
  }
  return { checks, screenshots: 0, externalRequests: 0 };
}

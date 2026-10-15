// playwright-cli -s=catalog-chat run-code --filename scripts/catalog-chat-smoke.cjs
// Checks catalog/chat geometry and menu states in an isolated browser, with API calls mocked.
async page => {
  const base = new URL('/certitips/', page.url());
  const browser = page.context().browser();
  const context = await browser.newContext({ viewport: { width: 1428, height: 1004 }, reducedMotion: 'reduce' });
  const tab = await context.newPage();
  const reference = await context.newPage();
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const samples = [];
  const errors = [];
  tab.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: url.pathname.endsWith('/health') ? { knowledge: {} } : { mode: 'LOCAL', authenticated: true, available: true, verificationRequired: false, messages: [], quota: { remaining: 20, limit: 20, refreshHours: 6, minuteRemaining: 1, retryAfter: 0 } } });
    if (url.origin !== base.origin) return route.abort('blockedbyclient');
    if (!route.request().isNavigationRequest()) return route.continue();
    const response = await route.fetch();
    return route.fulfill({ response, body: (await response.text()).replace(/data-api="[^"]*"/, `data-api="${base.origin}"`) });
  });
  const measure = async () => {
    await tab.waitForFunction(() => {
      const bar = document.querySelector('.course-groups');
      return bar.classList.contains('is-compact-groups') === (bar.getBoundingClientRect().width <= 800);
    });
    return tab.evaluate(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
    const active = document.querySelector('.path-section.is-active');
    const row = active.querySelector('.certification-item:last-child');
    const launcher = document.querySelector('.certichat-launcher');
    return {
      bar: rect('.course-groups'), card: active.getBoundingClientRect().toJSON(), panel: rect('.certichat-panel'),
      launcher: launcher.getBoundingClientRect().toJSON(), labelVisible: getComputedStyle(launcher.querySelector('span')).clipPath === 'none',
      bottomGap: active.getBoundingClientRect().bottom - row.getBoundingClientRect().bottom,
      transform: getComputedStyle(active).transform, scrollX: document.documentElement.scrollWidth - innerWidth,
      compact: document.querySelector('.course-groups').classList.contains('is-compact-groups'),
      desktopVisible: getComputedStyle(document.querySelector('.path-nav')).display !== 'none',
    };
    });
  };
  const motionSamples = selector => tab.evaluate(async selector => {
    const samples = [], started = performance.now();
    while (performance.now() - started < 320) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const bar = document.querySelector('.course-groups').getBoundingClientRect(), card = document.querySelector('.path-section.is-active').getBoundingClientRect(), chat = document.querySelector('#certichat-panel').getBoundingClientRect();
      samples.push({ height: parseFloat(getComputedStyle(document.querySelector(selector), '::details-content').blockSize), barRight: bar.right, cardRight: card.right, gap: card.top - bar.bottom, chatLeft: chat.left, chatWidth: chat.width, overflow: document.documentElement.scrollWidth - innerWidth });
    }
    return samples;
  }, selector);
  try {
    await tab.goto(new URL('courses/', base).href);
    await tab.bringToFront();
    for (const theme of ['light', 'dark']) {
      if ((await tab.locator('html').getAttribute('data-theme') === 'dark') !== (theme === 'dark')) await tab.locator('[data-theme-toggle]').click();
      for (const width of [1428, 1360, 1296, 1240, 900, 801]) {
        await tab.setViewportSize({ width, height: 1004 });
        await tab.waitForTimeout(420);
        const closed = await measure();
        assert(closed.compact === (closed.bar.width <= 800) && closed.desktopVisible !== closed.compact, `${width}: closed menu ignores its container width`);
        assert(closed.labelVisible && closed.launcher.width > 100, `${theme} ${width}: CertiChat label hidden`);
        assert(Math.abs(closed.bar.left - closed.card.left) < 1 && Math.abs(closed.bar.right - closed.card.right) < 1, `${theme} ${width}: closed bar/card misaligned ${JSON.stringify(closed)}`);
        assert(closed.bottomGap < 2, `${theme} ${width}: card has excess bottom padding ${closed.bottomGap}`);
        await tab.locator('[data-chat-open]').click();
        await tab.waitForTimeout(800);
        const open = await measure();
        assert(open.compact === (open.bar.width <= 800) && open.desktopVisible !== open.compact, `${width}: open-chat menu ignores its container width`);
        assert(open.panel.width === 420, `${width}: desktop chat width changes`);
        assert(Math.abs(open.bar.left - open.card.left) < 1 && Math.abs(open.bar.right - open.card.right) < 1, `${theme} ${width}: open bar/card misaligned ${JSON.stringify(open)}`);
        assert(open.card.width < closed.card.width - 100, `${theme} ${width}: content did not make room for chat`);
        assert(open.card.right <= open.panel.left - 20 && open.bar.right <= open.panel.left - 20, `${theme} ${width}: chat overlaps content ${JSON.stringify(open)}`);
        assert(open.scrollX <= 1, `${theme} ${width}: horizontal overflow ${open.scrollX}`);
        if (width >= 1024) {
          await reference.setViewportSize({ width, height: 1004 });
          await reference.goto(new URL('certitube/ZjfQUwUdpbI/', base).href);
          if (await reference.locator('#certichat-panel').getAttribute('hidden') !== null) await reference.locator('[data-chat-open]').click();
          const detail = await reference.locator('.tube-detail').evaluate(node => node.getBoundingClientRect().toJSON());
          assert(Math.abs(open.bar.left - detail.left) < 1 && Math.abs(open.bar.right - detail.right) < 1, `${theme} ${width}: catalog differs from CertiTube combined width ${JSON.stringify({ bar: open.bar, detail })}`);
        }
        await tab.locator('[data-chat-close]').click();
        await tab.waitForTimeout(420);
        samples.push({ theme, width, closed: [closed.card.left, closed.card.right], open: [open.card.left, open.card.right], panelLeft: open.panel.left });
      }
      await tab.setViewportSize({ width: 1428, height: 1004 });
      await tab.locator('.path-nav .path-group > summary').first().click();
      const link = tab.locator('.path-nav .path-group-panel a').first();
      await link.hover();
      const colors = await link.evaluate(node => ({ color: getComputedStyle(node).color, border: getComputedStyle(node).borderColor, background: getComputedStyle(node).backgroundColor, ink: getComputedStyle(document.body).color, gray: getComputedStyle(document.querySelector('deep-chat').shadowRoot.querySelector('.ai-message')).backgroundColor }));
      assert(colors.color === colors.ink && colors.border === 'rgba(0, 0, 0, 0)' && colors.background === colors.gray, `${theme}: menu hover colors ${JSON.stringify(colors)}`);
      await tab.locator('.path-nav .path-group > summary').first().click();
    }
    for (const width of [798, 390]) {
      await tab.setViewportSize({ width, height: 1004 });
      const bar = tab.locator('.course-groups'), menu = tab.locator('.path-nav-mobile');
      const closedBar = await bar.boundingBox();
      await bar.click({ position: { x: closedBar.width / 2, y: 20 } });
      await tab.waitForFunction(() => document.querySelector('.path-nav-mobile').open && document.querySelector('.path-section.is-active').getBoundingClientRect().top >= document.querySelector('.course-groups').getBoundingClientRect().bottom + 23);
      const expanded = await bar.evaluate(node => {
        const bar = node.getBoundingClientRect(), panel = node.querySelector('.path-nav-mobile-panel').getBoundingClientRect();
        const summary = node.querySelector('.path-nav-mobile > summary');
        return { height: bar.height, contains: panel.left >= bar.left && panel.right <= bar.right && panel.bottom <= bar.bottom, border: getComputedStyle(summary).borderTopWidth, svgRight: summary.querySelector('svg').getBoundingClientRect().right, right: bar.right };
      });
      assert(expanded.contains && expanded.height > closedBar.height + 100 && expanded.border === '0px' && expanded.right - expanded.svgRight < 30, `${width}: menu is not contained in the expanding bar ${JSON.stringify(expanded)}`);
      await bar.click({ position: { x: closedBar.width / 2, y: 20 } });
      assert(!await menu.evaluate(node => node.open), `${width}: second bar click does not close the menu`);
      await menu.locator(':scope > summary').focus();
      await tab.keyboard.press('Enter');
      assert(await menu.evaluate(node => node.open), `${width}: keyboard does not open the bar`);
      await tab.keyboard.press('Escape');
    }
    await tab.setViewportSize({ width: 798, height: 1004 });
    await tab.emulateMedia({ reducedMotion: 'no-preference' });
    await tab.bringToFront();
    await tab.waitForFunction(() => !document.documentElement.classList.contains('is-resizing'));
    for (const selector of ['.path-nav-mobile', '.path-nav-mobile .path-group:nth-child(1)', '.path-nav-mobile .path-group:nth-child(2)', '.path-nav-mobile .path-group:nth-child(2)', '.path-nav-mobile']) {
      const initialHeight = await tab.locator(selector).evaluate(node => getComputedStyle(node, '::details-content').blockSize);
      await tab.locator(`${selector} > summary`).click();
      const frames = await motionSamples(selector);
      assert(new Set(frames.map(frame => frame.height)).size > 2, `Disclosure jumps without intermediate heights: ${selector} ${initialHeight} -> ${JSON.stringify(frames.map(frame => frame.height))}`);
      assert(Math.abs(frames.at(-1).gap - 24) < 1, `Content does not follow the expanded bar: ${selector}`);
    }
    await tab.locator('[data-chat-open]').click();
    await tab.waitForTimeout(420);
    for (const width of [1030, 1026, 1023, 900, 803, 801, 799, 803, 1671]) {
      await tab.setViewportSize({ width, height: 1004 });
      const frames = await motionSamples('.path-nav-mobile');
      assert(frames.every(frame => frame.chatWidth === (width > 800 ? 420 : width) && frame.overflow <= 1), `Chat changes width or page overflows while resizing: ${width}`);
      if (width > 800) assert(frames.every(frame => Math.abs(frame.barRight - frame.cardRight) < 1 && frame.barRight <= frame.chatLeft - 23), `Groups cross the chat during resize: ${width}`);
      if (width === 1030) {
        const gap = await tab.locator('.certification-item').first().evaluate(row => row.lastElementChild.getBoundingClientRect().left - row.firstElementChild.getBoundingClientRect().right);
        assert(Math.abs(gap - 20) < 1, `Catalog text leaves unused space before actions: ${gap}`);
      }
    }
    await tab.locator('[data-chat-close]').click();
    await tab.waitForTimeout(420);
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    assert(await tab.locator('.path-nav-mobile').evaluate(node => getComputedStyle(node, '::details-content').transitionDuration) === '0s', 'Disclosure ignores reduced motion');
    for (const width of [800, 390]) {
      await tab.setViewportSize({ width, height: 1004 });
      const closed = await measure();
      assert(closed.launcher.width <= 48 && closed.scrollX <= 1, `${width}: mobile launcher or catalog overflows`);
      await tab.locator('[data-chat-open]').click();
      assert(await tab.locator('#certichat-panel').isVisible(), `${width}: mobile chat did not open`);
      await tab.locator('[data-chat-close]').click();
    }
    await tab.setViewportSize({ width: 1428, height: 1004 });
    const before = await measure();
    await tab.locator('[data-group-next]').click();
    const immediate = await measure();
    await tab.waitForTimeout(260);
    const after = await measure();
    assert(immediate.transform === 'none' && after.transform === 'none', `Carousel still translates: ${immediate.transform}, ${after.transform}`);
    assert(Math.abs(before.card.top - after.card.top) < 1, `Carousel moved vertically: ${before.card.top} -> ${after.card.top}`);
    await tab.locator('[data-chat-open]').click();
    await tab.waitForTimeout(800);
    const beforeReload = await measure();
    let resumeChatScript;
    const chatScriptGate = new Promise(resolve => { resumeChatScript = resolve; });
    await tab.route('**/assets/certichat.js*', async route => { await chatScriptGate; await route.continue(); });
    try {
      await tab.reload({ waitUntil: 'commit' });
      await tab.waitForFunction(() => document.querySelector('.path-section.is-active') && getComputedStyle(document.querySelector('.course-groups')).position === 'fixed');
      const beforeRestore = await measure();
      assert(await tab.locator('html').evaluate(node => node.classList.contains('chat-restoring')) && beforeRestore.panel.width === 0, 'Reload did not reserve the open-chat layout before the chat script');
      assert(Math.abs(beforeRestore.bar.left - beforeReload.bar.left) < 1 && Math.abs(beforeRestore.bar.right - beforeReload.bar.right) < 1 && Math.abs(beforeRestore.card.left - beforeReload.card.left) < 1 && Math.abs(beforeRestore.card.right - beforeReload.card.right) < 1, 'Catalog resized before CertiChat restored');
      resumeChatScript();
      await tab.waitForFunction(() => !document.querySelector('#certichat-panel').hidden && !document.documentElement.classList.contains('chat-restoring'));
      const afterRestore = await measure();
      assert(Math.abs(afterRestore.bar.left - beforeReload.bar.left) < 1 && Math.abs(afterRestore.bar.right - beforeReload.bar.right) < 1 && Math.abs(afterRestore.card.left - beforeReload.card.left) < 1 && Math.abs(afterRestore.card.right - beforeReload.card.right) < 1, 'Catalog resized after CertiChat restored');
    } finally { resumeChatScript(); await tab.unrouteAll({ behavior: 'wait' }); }
    assert(!errors.length, `Browser errors: ${errors.join('; ')}`);
    return { samples, carouselTop: [before.card.top, immediate.card.top, after.card.top], colors: 'gray hover background in light/dark', expandingBar: 'click/keyboard, smooth nested disclosures and reduced motion', resize: 'fixed 420px chat, full screen at 800px, no bar overlap' };
  } finally { await context.close(); }
}

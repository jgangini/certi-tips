// playwright-cli run-code --filename scripts/certitube-mobile-layout-smoke.cjs
// YouTube is simulated; no screenshots or external requests.
async page => {
  const origin = new URL(page.url()).origin;
  if (origin !== 'http://127.0.0.1:4173') throw new Error('Use the local preview.');
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const context = await page.context().browser().newContext({ reducedMotion: 'reduce' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await context.addInitScript(() => {
    window.YT = { Player: function(id, options) {
      const frame = document.createElement('iframe'); frame.id = id;
      document.getElementById(id).replaceWith(frame);
      const player = { seeks: [], getIframe: () => frame, getDuration: () => 9999, getCurrentTime: () => 0, getPlayerState: () => 2, seekTo(time) { this.seeks.push(time); }, playVideo() {}, pauseVideo() {} };
      window.__tube = player;
      queueMicrotask(() => options.events.onReady({ target: player }));
      return player;
    } };
  });
  const tab = await context.newPage(), errors = [], checks = [];
  tab.on('pageerror', error => errors.push(error.message));
  const settle = () => tab.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  try {
    for (const [width, height] of [[320,844], [394,852], [480,852], [800,900], [800,390], [801,900], [1280,900]]) {
      const scroller = width <= 800 ? '.tube-browse' : '.tube-detail';
      await tab.setViewportSize({ width, height });
      await tab.goto(`${origin}/certitips/certitube/`);
      await tab.waitForFunction(() => window.__tube && document.querySelector('[data-tube-loading]').hidden);
      await tab.evaluate(() => document.fonts.ready);
      for (const theme of ['light', 'dark']) {
        const dark = await tab.locator('html').getAttribute('data-theme') === 'dark';
        if (dark !== (theme === 'dark')) await tab.locator('.theme-toggle').click();
        await tab.locator(scroller).evaluate(e => { e.scrollTop = 0; });
        await settle();
        const state = await tab.evaluate(() => {
          const box = s => document.querySelector(s).getBoundingClientRect();
          const main = box('main'), watch = box('.tube-watch'), screen = box('.tube-screen');
          const list = document.querySelector('.tube-videos ol');
          return { main: {left:main.left, right:main.right, top:main.top, bottom:main.bottom}, watchTop:watch.top, screenHeight:screen.height, headerBottom:box('.site-header').bottom, footerTop:box('.site-footer').top, overflow:document.documentElement.scrollWidth > innerWidth, nestedScroll:list.scrollHeight > list.clientHeight + 1 || list.scrollWidth > list.clientWidth + 1 };
        });
        assert(!state.overflow && state.screenHeight > 0, `${width}/${height}: player is missing or overflows`);
        if (width <= 800) {
          assert(Math.abs(state.main.left) < 1 && Math.abs(state.main.right - width) < 1 && Math.abs(state.main.top - state.headerBottom) < 1 && Math.abs(state.main.bottom - state.footerTop) < 1, `${width}/${height}: mobile content has outer margins`);
          assert(!state.nestedScroll, `${width}/${height}: library has its own scrollbar`);
          assert(!await tab.locator('.tube-videos > header').isVisible(), 'Mobile library heading remains');
          const belowVideo = await tab.locator('.tube-browse').evaluate(e => Math.abs(e.getBoundingClientRect().top - document.querySelector('.tube-watch').getBoundingClientRect().bottom) < 1);
          assert(belowVideo, 'Scrollbar does not start below the pinned video');
          const cards = await tab.locator('.tube-videos a').evaluateAll(links => links.every(link => {
            const image = link.querySelector('img').getBoundingClientRect(), title = link.querySelector('strong').getBoundingClientRect();
            return image.width >= innerWidth * .94 && title.top >= image.bottom + 8;
          }));
          assert(cards, `${width}/${height}: thumbnails are small or titles are beside images`);
          await tab.locator(scroller).evaluate(e => { e.scrollTop = 600; });
          await settle();
          const pinned = await tab.locator('.tube-watch').evaluate(e => e.getBoundingClientRect().top);
          assert(Math.abs(pinned - state.watchTop) < 1, `${width}/${height}: video moved while browsing`);
          const chaptersPinned = await tab.locator('.tube-chapters').evaluate(e => Math.abs(e.getBoundingClientRect().top - document.querySelector('.tube-browse').getBoundingClientRect().top) < 1);
          assert(chaptersPinned, 'Chapters did not stick beneath the video');
          assert(await tab.evaluate(() => scrollY === 0 && window.__tube.seeks.length === 0), 'Scrolling restarted playback or moved the outer page');
          await tab.locator(scroller).evaluate(e => { e.scrollTop = e.scrollHeight; });
          const lastFits = await tab.evaluate(() => ({ last: document.querySelector('.tube-videos li:last-child').getBoundingClientRect().bottom, button: document.querySelector('.certichat-launcher').getBoundingClientRect().top, browse: document.querySelector('.tube-browse').getBoundingClientRect().toJSON() }));
          assert(lastFits.last + 23 <= lastFits.button, `${width}/${height}: chat covers the final video ${JSON.stringify(lastFits)}`);
        } else {
          assert(await tab.locator('.tube-player').evaluate(e => e.getBoundingClientRect().height > 400), 'Desktop player layout changed');
        }
        checks.push(`${width}x${height}/${theme}`);
      }
      if (width === 394) {
        await tab.locator('[data-tube-time]').first().click();
        assert(await tab.locator('.tube-watch').evaluate(e => e === document.activeElement), 'Mobile chapter did not focus the pinned player');
        const player = await tab.evaluateHandle(() => window.__tube);
        await tab.setViewportSize({ width: 1280, height });
        assert(await tab.locator('.tube-player > .tube-summary').count() === 1 && await tab.locator('.tube-detail > .tube-videos').count() === 1, 'Desktop structure was not restored');
        await tab.setViewportSize({ width, height });
        assert(await tab.evaluate(value => value === window.__tube, player), 'Responsive layout recreated the video');
        await player.dispose();
      }
    }
    assert(!errors.length, errors.join('; '));
    return { checks, screenshots: 0 };
  } finally { await context.close(); }
}

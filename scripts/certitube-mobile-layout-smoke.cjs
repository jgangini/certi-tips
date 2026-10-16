// playwright-cli run-code --filename scripts/certitube-mobile-layout-smoke.cjs
// YouTube is simulated; no screenshots or external requests.
async page => {
  const origin = new URL(page.url()).origin;
  const base = new URL(page.url()).pathname.match(/^\/certitips\/(?:es|en|pt|it)\//)?.[0] || '/certitips/';
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
    for (const [width, height] of [[320,844], [394,852], [480,852], [800,900], [800,390], [801,900], [882,830], [928,926], [963,830], [963,926], [963,480], [995,926], [1000,900], [1001,900], [1280,900]]) {
      const pageScroll = width > 800 && width <= 1000;
      const scroller = pageScroll ? 'html' : width <= 800 ? '.tube-browse' : '.tube-detail';
      await tab.setViewportSize({ width, height });
      await tab.goto(`${origin}${base}certitube/`);
      await tab.waitForFunction(() => window.__tube && document.querySelector('[data-tube-loading]').hidden);
      await tab.evaluate(() => document.fonts.ready);
      for (const theme of ['light', 'dark']) {
        const dark = await tab.locator('html').getAttribute('data-theme') === 'dark';
        if (dark !== (theme === 'dark')) await tab.locator('.theme-toggle').click();
        await tab.locator(scroller).evaluate(e => e.scrollTo({ top: 0, behavior: 'instant' }));
        await settle();
        const state = await tab.evaluate(() => {
          const box = s => document.querySelector(s).getBoundingClientRect();
          const main = box('main'), watch = box('.tube-watch'), screen = box('.tube-screen');
          const list = document.querySelector('.tube-videos ol');
          return { main: {left:main.left, right:main.right, top:main.top, bottom:main.bottom}, watchTop:watch.top, screenHeight:screen.height, headerBottom:box('.site-header').bottom, footerTop:box('.site-footer').top, overflow:document.documentElement.scrollWidth > innerWidth, nestedScroll:list.scrollHeight > list.clientHeight + 1 || list.scrollWidth > list.clientWidth + 1 };
        });
        assert(!state.overflow && state.screenHeight > 0, `${width}/${height}: player is missing or overflows`);
        const recommendations = await tab.locator('.tube-videos').evaluate(list => {
          const active = document.querySelector('[data-video-id]').dataset.videoId;
          return !list.querySelector(`a[href$="/${active}/"]`) && [...list.querySelectorAll('img')].every(image => image.src.endsWith('/maxresdefault.jpg') && image.getAttribute('width') === '1280' && image.getAttribute('height') === '720');
        });
        assert(recommendations, 'Recommendations repeat the active video or use small thumbnails');
        const descriptions = await tab.locator('.tube-video-summary').evaluateAll((nodes, pageScroll) => nodes.length > 0 && nodes.every(node => node.textContent.trim() && (getComputedStyle(node).display !== 'none') === pageScroll), pageScroll);
        assert(descriptions, 'Recommendation descriptions do not match the requested viewport');
        if (width <= 1000) {
          if (width <= 800) {
            assert(Math.abs(state.main.left) < 1 && Math.abs(state.main.right - width) < 1 && Math.abs(state.main.top - state.headerBottom) < 1 && Math.abs(state.main.bottom - state.footerTop) < 1, `${width}/${height}: mobile content has outer margins`);
          } else {
            const contained = await tab.locator('.tube-player').evaluate(e => {
              const frame = e.getBoundingClientRect(), main = document.querySelector('main').getBoundingClientRect(), css = getComputedStyle(e);
              return frame.left > 0 && frame.right < innerWidth && Math.abs(frame.left - main.left) < 1 && Math.abs(frame.right - main.right) < 1 && Math.abs(frame.top - main.top - 20) < 1 && css.borderTopWidth === '4px' && css.borderRadius !== '0px';
            });
            assert(contained, `${width}/${height}: stacked layout lost its outer container`);
          }
          assert(!state.nestedScroll, `${width}/${height}: library has its own scrollbar`);
          assert(!await tab.locator('.tube-videos > header').isVisible(), 'Mobile library heading remains');
          const belowVideo = await tab.locator('.tube-browse').evaluate(e => Math.abs(e.getBoundingClientRect().top - document.querySelector('.tube-watch').getBoundingClientRect().bottom) < 1);
          assert(belowVideo, 'Scrollbar does not start below the pinned video');
          const fillsContent = await tab.locator('.tube-browse').evaluate((e, pageScroll) => pageScroll
            ? getComputedStyle(e).overflowY === 'visible' && e.scrollHeight <= e.clientHeight + 1 && document.querySelector('.tube-player').clientHeight > innerHeight && document.documentElement.scrollHeight > innerHeight
            : Math.abs(document.querySelector('.site-footer').getBoundingClientRect().top - e.getBoundingClientRect().bottom) < 1, pageScroll);
          assert(fillsContent, `${width}/${height}: the list is constrained instead of growing with its content`);
          const cards = await tab.locator('.tube-videos a').evaluateAll((links, pageScroll) => links.every(link => {
            const image = link.querySelector('img').getBoundingClientRect(), title = link.querySelector('strong').getBoundingClientRect(), summary = link.querySelector('.tube-video-summary').getBoundingClientRect();
            return pageScroll
              ? image.width >= link.clientWidth * .3 && image.right + 20 <= title.left && Math.abs(summary.left - title.left) < 1 && summary.top >= title.bottom + 7 && title.top < image.bottom
              : image.width >= document.querySelector('.tube-browse').clientWidth - 2 && title.top >= image.bottom + 8;
          }), pageScroll);
          assert(cards, `${width}/${height}: recommendation images and text have the wrong arrangement`);
          if (pageScroll) {
            const titleSizes = await tab.locator('.tube-videos a strong').evaluateAll(titles => {
              const heading = getComputedStyle(document.querySelector('.tube-heading strong'));
              return titles.every(title => getComputedStyle(title).fontSize === heading.fontSize && getComputedStyle(title).lineHeight === heading.lineHeight);
            });
            assert(titleSizes, 'Recommendation titles do not match the player title size');
          }
          await tab.locator(scroller).evaluate(e => e.scrollTo({ top: 600, behavior: 'instant' }));
          await settle();
          const pinned = await tab.locator('.tube-watch').evaluate(e => e.getBoundingClientRect().top);
          assert(Math.abs(pinned - (pageScroll ? state.headerBottom : state.watchTop)) < 1, `${width}/${height}: video moved while browsing`);
          const chaptersPinned = await tab.locator('.tube-chapters').evaluate((e, pageScroll) => Math.abs(e.getBoundingClientRect().top - (pageScroll ? document.querySelector('.tube-watch').getBoundingClientRect().bottom : document.querySelector('.tube-browse').getBoundingClientRect().top)) < 1, pageScroll);
          assert(chaptersPinned, 'Chapters did not stick beneath the video');
          assert(await tab.evaluate(pageScroll => (pageScroll ? scrollY > 0 : scrollY === 0) && window.__tube.seeks.length === 0, pageScroll), 'Scrolling restarted playback or used the wrong scroll container');
          await tab.locator(scroller).evaluate(e => e.scrollTo({ top: e.scrollHeight, behavior: 'instant' }));
          const lastFits = await tab.evaluate(() => ({ last: document.querySelector('.tube-videos li:last-child').getBoundingClientRect().bottom, button: document.querySelector('.certichat-launcher').getBoundingClientRect().top, browse: document.querySelector('.tube-browse').getBoundingClientRect().toJSON() }));
          assert(lastFits.last + 23 <= lastFits.button, `${width}/${height}: chat covers the final video ${JSON.stringify(lastFits)}`);
          if (pageScroll) {
            const frameEnd = await tab.locator('.tube-player').evaluate(e => e.getBoundingClientRect().bottom);
            assert(Math.abs(frameEnd - lastFits.last - 9) < 1, `${width}/${height}: the frame loses its small inner border clearance`);
            assert(Math.abs(lastFits.button - frameEnd - 24) < 1, `${width}/${height}: chat is not separated from the frame by 24px`);
            const lastLink = tab.locator('.tube-videos li:last-child a');
            const linkHeight = await lastLink.evaluate(e => e.getBoundingClientRect().height);
            await lastLink.hover({ position: { x: 8, y: linkHeight - 4 } });
            const borderFits = await lastLink.evaluate(e => {
              const box = e.getBoundingClientRect(), frame = e.closest('.tube-player'), bounds = frame.getBoundingClientRect(), style = getComputedStyle(e), red = getComputedStyle(frame).borderTopColor;
              return box.left >= bounds.left + 8 && box.right <= bounds.right - 8 && box.bottom <= bounds.bottom - 8 && parseFloat(style.borderRadius) > 0 && ['Top','Right','Bottom','Left'].every(side => style[`border${side}Color`] === red);
            });
            assert(borderFits, `${width}/${height}: the last recommendation's red border is clipped`);
          }
        } else {
          assert(await tab.locator('.tube-player').evaluate(e => e.getBoundingClientRect().height > 400), 'Desktop player layout changed');
        }
        checks.push(`${width}x${height}/${theme}`);
      }
      if (width === 963 && height === 926) {
        const before = await tab.evaluate(() => scrollY);
        await tab.locator('[data-tube-time]').first().click();
        assert(await tab.evaluate(previous => Math.abs(scrollY - previous) < 1 && document.activeElement === document.querySelector('.tube-watch'), before), 'Selecting a chapter jumped away from the recommendations');
      }
      if (width === 394) {
        await tab.locator('[data-tube-time]').first().click();
        assert(await tab.locator('.tube-watch').evaluate(e => e === document.activeElement), 'Mobile chapter did not focus the pinned player');
        const player = await tab.evaluateHandle(() => window.__tube);
        await tab.setViewportSize({ width: 1280, height });
        await tab.locator('.tube-player > .tube-summary').waitFor({ state: 'attached' });
        assert(await tab.locator('.tube-player > .tube-summary').count() === 1 && await tab.locator('.tube-detail > .tube-videos').count() === 1, 'Desktop structure was not restored');
        await tab.setViewportSize({ width: 963, height });
        await tab.locator('.tube-player > .tube-browse > .tube-videos').waitFor({ state: 'attached' });
        assert(await tab.locator('.tube-player > .tube-browse > .tube-videos').count() === 1, 'Narrow desktop did not reuse the vertical library');
        await tab.setViewportSize({ width, height });
        await tab.locator('.tube-player > .tube-browse > .tube-videos').waitFor({ state: 'attached' });
        assert(await tab.evaluate(value => value === window.__tube, player), 'Responsive layout recreated the video');
        await player.dispose();
      }
    }
    const paths = await tab.locator('.tube-videos a').evaluateAll(links => links.map(link => link.getAttribute('href')));
    for (const path of paths) {
      await tab.goto(new URL(path, origin).href);
      await tab.waitForFunction(() => window.__tube && document.querySelector('[data-tube-loading]').hidden);
      assert(await tab.locator('.tube-videos a').evaluateAll((links, count) => links.length === count && links.every(link => !link.href.includes(document.querySelector('[data-video-id]').dataset.videoId)), paths.length), 'Changing video did not refresh recommendations');
    }
    assert(!errors.length, errors.join('; '));
    return { checks, recommendationPages: paths.length + 1, screenshots: 0 };
  } finally { await context.close(); }
}

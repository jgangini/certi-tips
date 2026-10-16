// playwright-cli -s=shared-layout run-code --filename scripts/shared-layout-smoke.cjs
// DOM geometry only, isolated storage and mocked API; no screenshots or paid calls.
// Add ?motion-check to run only the native course transition regression.
async page => {
  const base = new URL('/certitips/', page.url());
  const context = await page.context().browser().newContext({ reducedMotion: 'reduce' });
  const tab = await context.newPage(), samples = [], errors = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  tab.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base.origin) return route.abort('blockedbyclient');
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { mode: 'LOCAL', authenticated: true, available: true, verificationRequired: false, host: false, roomCode: null, courses: [], limits: {}, knowledge: {}, quota: { remaining: 20, limit: 20, minuteRemaining: 1, refreshHours: 6 } } });
    if (!request.isNavigationRequest()) return route.continue();
    const response = await route.fetch();
    return route.fulfill({ response, body: (await response.text()).replace(/(data-api(?:-origin)?=")[^"]*/g, `$1${base.origin}`) });
  });
  const cases = [
    ['certitube/', '.tube-detail'], ['certitube/ZjfQUwUdpbI/', '.tube-detail'],
    ['courses/', '.course-groups'], ['1Z0-1085-26/overview/', '#main'],
    ['', '.home-hero'], ['certiquiz/', '.certiquiz-breadcrumb'], ['certichat/', '.chat-explorer-section'],
  ];
  const measure = selector => tab.evaluate(selector => {
    const rect = node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, width: r.width, height: r.height }; };
    const header = document.querySelector('.site-header'), panel = document.querySelector('#certichat-panel');
    const boxes = [...header.children].map(rect);
    const accent = getComputedStyle(document.querySelector(selector));
    const frame = rect(document.querySelector(selector));
    if (selector === '#main') {
      if (document.querySelector('.course-groups') || document.body.classList.contains('has-course-groups')) throw new Error('Course groups remain on a lesson');
      frame.left = document.body.classList.contains('is-compact-nav') ? frame.left : rect(document.querySelector('.sidebar')).left;
      frame.width = frame.right - frame.left;
    }
    return { frame, border: accent.borderTopWidth, borderColor: accent.borderTopColor, shadow: accent.boxShadow, cardShadows: [...document.querySelectorAll('.role-card, .certitips-page .path-section.is-active')].map(node => getComputedStyle(node).boxShadow), brand: rect(header.querySelector('.brand')), edge: rect(header.querySelector('.theme-toggle')).right, panel: panel && !panel.hidden ? rect(panel) : null, panelShadow: panel && getComputedStyle(panel).boxShadow, overflow: document.documentElement.scrollWidth - innerWidth, overlap: boxes.some((box, index) => index && box.left < boxes[index - 1].right - 1) };
  }, selector);
  const closeTo = (a, b) => Math.abs(a - b) < 1;
  try {
    if (new URL(page.url()).searchParams.has('motion-check')) {
      await tab.emulateMedia({ reducedMotion: 'no-preference' });
      await tab.addInitScript(() => {
        const start = document.startViewTransition.bind(document);
        window.__transitions = [];
        document.startViewTransition = change => {
          const info = { frames: [], done: false, error: null }, transition = start(change);
          window.__transitions.push(info);
          transition.ready.then(() => {
            const tick = () => {
              const group = name => {
                const style = getComputedStyle(document.documentElement, `::view-transition-group(${name})`), matrix = new DOMMatrixReadOnly(style.transform);
                return { width: parseFloat(style.width), height: parseFloat(style.height), top: matrix.m42, z: parseInt(style.zIndex) || 0 };
              };
              info.frames.push({ diagram: group('course-diagram'), reading: group('course-reading'), header: group('course-header'), footer: group('course-footer'),
                headerBottom: document.querySelector('.site-header').getBoundingClientRect().bottom, footerTop: document.querySelector('.site-footer').getBoundingClientRect().top,
                image: document.querySelector('[style*="course-diagram"]')?.getBoundingClientRect().toJSON() });
              if (!info.done) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }, error => { info.error = String(error); });
          transition.finished.finally(() => { info.done = true; });
          return transition;
        };
      });
      const settle = () => tab.waitForFunction(() => !document.documentElement.classList.contains('is-chat-layout-transition') && !document.documentElement.classList.contains('is-resizing'));
      for (const width of [1440, 1200, 1024]) for (const edge of ['header', 'footer']) {
        await tab.setViewportSize({ width, height: 700 });
        await tab.goto(new URL('es/1Z0-1085-26/governance/', base).href);
        await tab.locator('[data-chat-open]').waitFor(); await settle();
        await tab.evaluate(async edge => {
          await document.fonts.ready;
          const image = document.querySelectorAll('.diagram img')[1] || document.querySelector('.diagram img');
          image.loading = 'eager';
          image.scrollIntoView({ block: 'center', behavior: 'instant' });
          await image.decode().catch(error => { throw new Error(`${error.message}: ${image.currentSrc} complete=${image.complete} width=${image.naturalWidth}`); });
          const box = image.closest('.diagram').getBoundingClientRect(), header = document.querySelector('.site-header').getBoundingClientRect(), footer = document.querySelector('.site-footer').getBoundingClientRect();
          scrollBy({ top: edge === 'header' ? box.top - header.bottom + 60 : box.bottom - footer.top - 60, behavior: 'instant' });
        }, edge);
        for (const [index, action] of ['open', 'close'].entries()) {
          await tab.locator(action === 'open' ? '[data-chat-open]' : '[data-chat-close]').click();
          await tab.waitForFunction(count => window.__transitions.length === count && window.__transitions.at(-1).done, index + 1);
          await settle();
          const info = await tab.evaluate(() => window.__transitions.at(-1)), frames = info.frames.filter(frame => frame.image && frame.diagram.width > 0);
          assert(!info.error && frames.length >= 3, `Native transition did not animate: ${JSON.stringify(info)}`);
          assert(frames[0].diagram.width !== frames.at(-1).diagram.width, 'Diagram width must interpolate');
          assert(frames.some(frame => edge === 'header' ? frame.diagram.top < frame.headerBottom : frame.diagram.top + frame.diagram.height > frame.footerTop), `Fixture does not reach ${edge}`);
          assert(frames.every(frame => [frame.header, frame.footer].every(chrome => chrome.width >= width - 1 && chrome.height > 0 && chrome.z > Math.max(frame.diagram.z, frame.reading.z))), `Transition content covers ${edge}: ${JSON.stringify(frames[0])}`);
          assert(frames.every(frame => Math.abs(frame.header.top) < 1 && Math.abs(frame.footer.top + frame.footer.height - 700) < 1), 'Transition chrome leaves viewport edges');
          assert(frames.every(frame => Math.abs(frame.image.width - frames[0].image.width) < 1), 'Live image must remain at its final layout during animation');
          assert(await tab.evaluate(() => [...document.querySelectorAll('.site-header,.site-footer,.course-main,.diagram')].every(node => getComputedStyle(node).viewTransitionName === 'none')), 'Transition names survive cleanup');
          samples.push({ width, edge, action, frames: frames.length });
        }
      }
      await tab.emulateMedia({ reducedMotion: 'reduce' });
      await tab.locator('[data-chat-open]').click(); await tab.locator('#certichat-panel').waitFor({ state: 'visible' });
      await tab.locator('[data-chat-close]').click(); await tab.locator('#certichat-panel').waitFor({ state: 'hidden' });
      assert(await tab.evaluate(() => window.__transitions.length === 2), 'Reduced motion starts a transition');
      assert(!errors.length, errors.join('; '));
      return { passed: true, transitions: samples, reducedMotion: true };
    }
    for (const width of [2560, 1992, 1671, 1510, 1307, 1296, 1239, 1024]) {
      await tab.setViewportSize({ width, height: 1004 });
      for (const theme of ['light', 'dark']) {
        let referenceChat, referenceClosed, referenceOpen, referenceShadow;
        for (const [route, selector] of cases) {
          if (tab.url().startsWith(base.href)) await tab.evaluate(() => sessionStorage.clear());
          await tab.goto(new URL(route, base).href);
          await tab.locator(selector).waitFor({ state: 'visible' });
          await tab.waitForFunction(() => Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--footer-height')) - document.querySelector('.site-footer').getBoundingClientRect().height) < 1);
          await tab.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
          const pinned = route === 'certichat/', hasChat = route !== 'certiquiz/';
          for (const open of pinned ? [true] : hasChat ? [false, true, false] : [false]) {
            if (hasChat && await tab.locator('#certichat-panel').isVisible() !== open) await tab.locator(open ? '[data-chat-open]' : '[data-chat-close]').click();
            const state = await measure(selector), label = `${width}px ${theme} ${route || 'home'} chat=${open}`;
            assert(closeTo(state.brand.left, state.frame.left), `Logo/content misaligned: ${label} ${JSON.stringify(state)}`);
            assert(state.overflow <= 1 && !state.overlap, `Layout overflows: ${label} ${JSON.stringify(state)}`);
            if (selector === '.course-groups' || selector === '.certiquiz-breadcrumb') assert(state.border === '4px' && state.borderColor === 'rgb(199, 70, 52)', `Navigation top border differs from CertiChat: ${label}`);
            assert(closeTo(state.edge, (state.panel || state.frame).right), `Header actions leave the right edge: ${label}`);
            if (route === 'certitube/') {
              if (open) { referenceChat = state.panel; referenceOpen = state.frame; referenceShadow = state.panelShadow; }
              else referenceClosed = state.frame;
            }
            const reference = open ? referenceOpen : referenceClosed;
            if (['.course-groups', '.certiquiz-breadcrumb', '.chat-explorer-section'].includes(selector)) assert(state.shadow === referenceShadow && state.cardShadows.every(shadow => shadow === referenceShadow), `Panel shadow differs: ${label}`);
            assert(closeTo(state.frame.left, reference.left) && closeTo(state.frame.width, reference.width), `Module frame differs: ${label} ${JSON.stringify(state)}`);
            if (open) {
              assert(['left', 'top', 'width', 'height'].every(key => closeTo(state.panel[key], referenceChat[key])), `Chat rectangle differs: ${label} ${JSON.stringify(state.panel)}`);
              assert(closeTo(state.panel.left - state.frame.right, 24), `Chat gap differs: ${label}`);
            }
            if (pinned) assert(await tab.locator('[data-chat-close]').isHidden(), `Cognee chat can close: ${label}`);
            samples.push({ width, theme, route, open, left: state.frame.left, chatLeft: state.panel?.left });
          }
        }
      }
    }
    await tab.emulateMedia({ reducedMotion: 'no-preference' });
    await tab.setViewportSize({ width: 1671, height: 1004 });
    for (const [route, selector] of [['courses/', '.course-groups'], ['certitube/', '.tube-detail']]) {
      await tab.evaluate(() => sessionStorage.clear());
      await tab.goto(new URL(route, base).href);
      for (const control of ['data-chat-open', 'data-chat-close']) {
        await tab.locator(`[${control}]`).click();
        await tab.waitForTimeout(80);
        const moving = await measure(selector);
        assert(closeTo(moving.brand.left, moving.frame.left), `Logo leaves its content during ${route} ${control}`);
        assert(closeTo(moving.edge, 1671 - moving.brand.left), `Header controls do not follow the logo during ${route} ${control}`);
        await tab.waitForTimeout(400);
      }
    }
    await tab.locator('[data-chat-open]').click();
    await tab.waitForTimeout(420);
    const beforeVideo = await measure('.tube-detail');
    await tab.locator('.tube-videos a').nth(1).click();
    await tab.locator('#certichat-panel:not([hidden])').waitFor();
    const afterVideo = await measure('.tube-detail');
    assert(closeTo(beforeVideo.frame.left, afterVideo.frame.left) && closeTo(beforeVideo.frame.width, afterVideo.frame.width) && await tab.locator('#main').evaluate(main => main.getAnimations().length === 0), 'Video navigation resizes the restored open-chat layout');
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    await tab.setViewportSize({ width: 1428, height: 600 });
    for (const route of ['certitube/Wf5fisusQOc/', 'certitube/Ha74VhpQwQo/']) {
      await tab.goto(new URL(route, base).href);
      for (const theme of ['light', 'dark']) {
        const reading = await tab.locator('.tube-summary').evaluate((node, theme) => {
          document.documentElement.dataset.theme = theme;
          node.scrollTop = 0;
          const heading = node.querySelector('h2'), range = document.createRange();
          range.selectNodeContents(node.querySelector('p'));
          const firstLine = range.getClientRects()[0], title = heading.getBoundingClientRect(), fade = getComputedStyle(heading, '::after');
          const state = { gap: firstLine.top - title.bottom, mask: getComputedStyle(node).maskImage, fade: fade.backgroundImage, pointer: fade.pointerEvents };
          node.scrollTop = node.scrollHeight;
          return { ...state, titleShift: heading.getBoundingClientRect().top - title.top, endGap: node.getBoundingClientRect().bottom - node.lastElementChild.getBoundingClientRect().bottom, scroll: node.scrollTop };
        }, theme);
        assert(reading.gap >= 12 && reading.endGap >= 14 && Math.abs(reading.titleShift) < 1 && reading.scroll > 0, `Summary text is clipped by its fixed heading or bottom fade: ${route} ${theme} ${JSON.stringify(reading)}`);
        assert(reading.mask.includes('linear-gradient') && reading.fade.includes('linear-gradient') && reading.pointer === 'none', `Summary edges do not fade without blocking interaction: ${route} ${theme}`);
      }
    }
    assert(!errors.length, errors.join('; '));
    return { states: samples.length, widths: 8, themes: 2, modules: cases.length, motion: 'logo follows content during open and close', samples: samples.filter(item => item.width === 1239 && item.theme === 'light') };
  } finally { await context.close(); }
}

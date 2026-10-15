// playwright-cli -s=course-layout run-code --filename scripts/course-layout-smoke.cjs
// Isolated DOM checks with a mocked chat session; no screenshots or paid calls.
// ponytail: one integration matrix reuses the isolated browser; Sentrux counts one
// additional complex test function. Split scenarios if this check grows further.
async page => {
  const base = new URL('/certitips/', page.url()), samples = [], errors = [];
  const widths = new URL(page.url()).searchParams.has('compact-check') ? [1576, 601, 481, 320] : [1992, 1576, 1361, 1360, 1100, 1024, 801, 800, 619, 601, 481, 480, 390, 320];
  const context = await page.context().browser().newContext({ viewport: { width: 1576, height: 1004 }, reducedMotion: 'reduce' });
  context.setDefaultTimeout(12000);
  const tab = await context.newPage(), reference = await context.newPage();
  tab.on('pageerror', error => errors.push(error.message));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: url.pathname.endsWith('/health') ? { knowledge: {} } : { mode: 'LOCAL', authenticated: true, available: true, verificationRequired: false, messages: [], quota: { remaining: 20, limit: 20, refreshHours: 6, minuteRemaining: 1, retryAfter: 0 } } });
    if (url.origin !== base.origin) return route.abort('blockedbyclient');
    if (!route.request().isNavigationRequest()) return route.continue();
    const response = await route.fetch();
    return route.fulfill({ response, body: (await response.text()).replace(/data-api="[^"]*"/, `data-api="${base.origin}"`) });
  });
  const headerState = () => {
    const header = document.querySelector('.site-header'), brand = header.querySelector('.brand');
    const boxes = [...header.children].filter(node => getComputedStyle(node).display !== 'none').map(node => node.getBoundingClientRect().toJSON());
    const text = brand.querySelector('span');
    if (getComputedStyle(text).display !== 'none') boxes[0].right = Math.max(boxes[0].right, text.getBoundingClientRect().right);
    return { brandLeft: brand.getBoundingClientRect().left, overflow: document.documentElement.scrollWidth > innerWidth + 1, overlap: boxes.some((box, index) => index && box.left < boxes[index - 1].right - 1) };
  };
  try {
    await reference.goto(base.href);
    const homeBrands = {};
    for (const width of widths) { await reference.setViewportSize({ width, height: 1004 }); homeBrands[width] = (await reference.evaluate(headerState)).brandLeft; }
    await reference.locator('.header-app-link[aria-label="CertiTips"]').click();
    await reference.waitForURL(new URL('cursos/', base).href);
    assert(await reference.locator('#foundation-sprint .certification-item').count() === 3, 'Independent catalog lost the Foundation block');
    assert(JSON.stringify(await reference.locator('.header-app-link').evaluateAll(links => links.map(link => link.getAttribute('aria-label')))) === JSON.stringify(['CertiTips', 'CertiQuiz', 'CertiTube', 'CertiChat']), 'Header module order differs');
    const cap = await reference.locator('.header-app-link[aria-label="CertiTips"] path').getAttribute('d');
    assert(cap === await reference.locator('#foundation-sprint .certitips-button path').first().getAttribute('d'), 'Header does not use the reference SVG');
    const frames = {};
    for (const width of widths) {
      await reference.setViewportSize({ width, height: 1004 });
      frames[width] = await reference.locator('#foundation-sprint').evaluate(node => node.getBoundingClientRect().toJSON());
      const state = await reference.evaluate(headerState);
      assert([state.overflow, state.overlap].every(flag => !flag), `Catalog header does not fit at ${width}: ${JSON.stringify(state)}`);
    }
    await reference.setViewportSize({ width: 798, height: 1004 });
    const compactPreference = await reference.evaluate(() => sessionStorage.getItem('certitips:course-nav:compact'));
    await reference.locator('.path-nav-mobile > summary').click();
    await reference.keyboard.press('Escape');
    assert(!await reference.locator('body').evaluate(body => body.classList.contains('is-compact-nav')) && compactPreference === await reference.evaluate(() => sessionStorage.getItem('certitips:course-nav:compact')), 'Catalog groups change the unrelated lesson sidebar preference');
    await reference.setViewportSize({ width: 1576, height: 1004 });
    const groupIds = await reference.locator('.path-section').evaluateAll(nodes => nodes.map(node => node.id));
    for (let index = 1; index < groupIds.length; index++) {
      await reference.locator('[data-group-next]').click();
      assert(await reference.locator('.path-section.is-active').getAttribute('id') === groupIds[index], 'Catalog carousel skips a group');
    }
    for (let index = groupIds.length - 2; index >= 0; index--) {
      await reference.locator('[data-group-prev]').click();
      assert(await reference.locator('.path-section.is-active').getAttribute('id') === groupIds[index], 'Catalog carousel does not return to Foundation');
    }
    await reference.locator('.path-nav summary').first().click();
    await reference.locator('.path-nav a[href$="/1Z0-1085-26/overview/"]').click();
    await reference.waitForURL(new URL('1Z0-1085-26/overview/', base).href);
    await reference.goto(new URL('certitube/ZjfQUwUdpbI/', base).href);
    await reference.locator('[data-chat-open]').click();
    const tubeFrames = {};
    for (const width of widths.filter(value => value >= 1024)) {
      await reference.setViewportSize({ width, height: 1004 });
      tubeFrames[width] = await reference.locator('.tube-detail').evaluate(node => node.getBoundingClientRect().toJSON());
    }
    for (const route of ['1Z0-1085-26/overview/', 'CDMP-DMF/overview/']) {
      await tab.goto(new URL(route, base).href);
      for (const theme of ['light', 'dark']) {
        if ((await tab.locator('html').getAttribute('data-theme') === 'dark') !== (theme === 'dark')) await tab.locator('[data-theme-toggle]').click();
        for (const width of widths) {
          await tab.setViewportSize({ width, height: 1004 });
          await tab.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
          const states = width > 800 ? [[false, false], [true, false], [false, true], [true, true]] : [[true, false]];
          for (const [folded, chatOpen] of states) {
            if (await tab.locator('#certichat-panel').isVisible() !== chatOpen) await tab.locator(chatOpen ? '[data-chat-open]' : '[data-chat-close]').click();
              if (width > 800 && await tab.locator('body').evaluate(body => body.classList.contains('is-compact-nav')) !== folded) await tab.locator('.menu-toggle').click();
              const state = await tab.evaluate(() => {
                const main = document.querySelector('#main'), brand = document.querySelector('.brand'), header = document.querySelector('.site-header'), style = getComputedStyle(main);
                const boxes = [...header.children].filter(node => getComputedStyle(node).display !== 'none').map(node => node.getBoundingClientRect().toJSON());
                const text = brand.querySelector('span');
                if (getComputedStyle(text).display !== 'none') boxes[0].right = Math.max(boxes[0].right, text.getBoundingClientRect().right);
                const sidebar = document.querySelector('#course-navigation');
                const frame = { left: document.body.classList.contains('is-compact-nav') ? main.getBoundingClientRect().left : sidebar.getBoundingClientRect().left, right: main.getBoundingClientRect().right };
                const readingEdges = [...main.querySelectorAll('.page-heading, .prose, .page-navigation')].map(node => node.getBoundingClientRect());
                if (innerWidth > 800 && !readingEdges.every(box => Math.abs(box.right - frame.right) < 1 && Math.abs(box.left - main.getBoundingClientRect().left) < 1)) throw new Error(`Lesson contents do not follow the shared edges: ${JSON.stringify(readingEdges)}`);
                return { main: main.getBoundingClientRect().toJSON(), sidebar: sidebar.getBoundingClientRect().toJSON(), headingLeft: sidebar.querySelector('.sidebar-heading strong').getBoundingClientRect().left, sidebarColor: getComputedStyle(sidebar).backgroundColor, gutter: getComputedStyle(document.body).backgroundImage, frame, groupsAbsent: !document.querySelector('.course-groups') && !document.body.classList.contains('has-course-groups'), headerBottom: header.getBoundingClientRect().bottom, brandLeft: brand.getBoundingClientRect().left, background: style.backgroundColor, image: style.backgroundImage, radius: style.borderRadius, shadow: style.boxShadow, blur: style.backdropFilter, borders: ['Top', 'Right', 'Bottom', 'Left'].map(side => style[`border${side}Width`]), overflow: document.documentElement.scrollWidth > innerWidth + 1, overlap: boxes.some((box, index) => index && box.left < boxes[index - 1].right - 1) };
              });
              const label = `${route} ${theme} ${width}px folded=${folded} chat=${chatOpen}`;
              assert(JSON.stringify([state.background, state.image, state.radius, state.shadow, state.blur, ...state.borders]) === JSON.stringify(['rgba(0, 0, 0, 0)', 'none', '0px', 'none', 'none', ...Array(4).fill('0px')]), `Course frame persists: ${label}`);
              assert(!state.overflow && !state.overlap, `Header does not fit: ${label} ${JSON.stringify(state)}`);
              assert(Math.abs(state.brandLeft - (width > 800 ? state.frame.left : homeBrands[width])) < 1, `Course logo differs from its content: ${label}`);
              assert(state.groupsAbsent && Math.abs(state.main.top - state.headerBottom) < 1, `Course groups or their reserved space remain: ${label}`);
              if (chatOpen && tubeFrames[width]) assert(Math.abs(state.frame.left - tubeFrames[width].left) < 1 && Math.abs(state.frame.right - tubeFrames[width].right) < 1, `Course frame differs from the CertiTube pair: ${label}`);
              if (width > 800) {
                if (!chatOpen) {
                  const left = folded ? state.main.left : state.sidebar.left;
                  assert(Math.abs(left - frames[width].left) < 1 && Math.abs(state.main.right - frames[width].right) < 1, `Course menu/content differ from Foundation: ${label} ${JSON.stringify(state)} reference=${JSON.stringify(frames[width])}`);
                }
                if (!folded) {
                  assert(Math.abs(state.main.left - state.sidebar.right - 24) < 1 && state.gutter.includes(state.sidebarColor), `Sidebar gap or left gutter is wrong: ${label}`);
                  assert(Math.abs(state.headingLeft - state.sidebar.left) < 1, `Sidebar heading is inset from sidebar: ${label}`);
                }
              }
              if (width === 1576 && theme === 'light') samples.push({ route, folded, chatOpen, referenceWidth: frames[width].width, totalWidth: state.main.right - (folded ? state.main.left : state.sidebar.left), brandLeft: state.brandLeft });
          }
        }
      }
      await tab.setViewportSize({ width: 1576, height: 1004 });
      const before = await tab.locator('.sidebar').evaluate(node => node.getBoundingClientRect().top);
      await tab.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      assert(before === await tab.locator('.sidebar').evaluate(node => node.getBoundingClientRect().top), 'Sidebar moves when scrolling');
      await tab.setViewportSize({ width: 390, height: 1004 });
      await tab.locator('.menu-toggle').click();
      await tab.keyboard.press('Escape');
      assert(!await tab.locator('.sidebar').evaluate(node => node.classList.contains('is-open')), 'Escape does not close the mobile course menu');
    }
    await tab.bringToFront();
    const transitions = [];
    for (const width of [1992, 1414, 1024]) {
      await tab.emulateMedia({ reducedMotion: 'reduce' });
      await tab.setViewportSize({ width, height: 1004 });
      await tab.waitForFunction(() => !document.documentElement.classList.contains('is-resizing'));
      for (const theme of ['light', 'dark']) for (const chatOpen of [false, true]) {
        await tab.emulateMedia({ reducedMotion: 'reduce' });
        await tab.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
        if (await tab.locator('#certichat-panel').isVisible() !== chatOpen) await tab.locator(chatOpen ? '[data-chat-open]' : '[data-chat-close]').click();
        if (await tab.locator('.menu-toggle').getAttribute('aria-expanded') !== 'true') await tab.locator('.menu-toggle').click();
        await tab.locator('#main').evaluate(node => node.getBoundingClientRect());
        await tab.emulateMedia({ reducedMotion: 'no-preference' });
        const result = await tab.evaluate(async () => {
          const sidebar = document.querySelector('.sidebar'), main = document.querySelector('#main'), button = document.querySelector('.menu-toggle');
          const settle = async () => {
            await new Promise(requestAnimationFrame);
            await Promise.all([document.body, sidebar, main].flatMap(node => node.getAnimations()).map(animation => animation.finished.catch(() => {})));
            await new Promise(requestAnimationFrame);
          };
          if (button.getAttribute('aria-expanded') !== 'true') button.click();
          await settle();
          const frameLeft = document.querySelector('.brand').getBoundingClientRect().left, frameRight = main.getBoundingClientRect().right;
          let frames = 0, moving = 0, maxDrift = 0;
          for (const reverse of [false, false, true]) {
            button.click();
            const start = performance.now();
            let reversed = false;
            await new Promise((resolve, reject) => {
              const sample = now => {
                if (reverse && !reversed && now - start >= 120) { button.click(); reversed = true; }
                const s = sidebar.getBoundingClientRect(), m = main.getBoundingClientRect();
                const progress = (m.left - frameLeft) / (s.width + 24), drift = Math.abs(progress - s.right / (frameLeft + s.width));
                maxDrift = Math.max(maxDrift, drift); frames++;
                if (progress > .01 && progress < .99) moving++;
                if (drift > .015 || m.left < s.right - 1 || Math.abs(m.right - frameRight) > 1 || getComputedStyle(sidebar).opacity !== '1') return reject(new Error(`Sidebar/reading transition diverged: ${JSON.stringify({ s: s.toJSON(), m: m.toJSON(), frameLeft, frameRight, drift, opacity: getComputedStyle(sidebar).opacity })}`));
                if (now - start < 550) requestAnimationFrame(sample); else resolve();
              };
              requestAnimationFrame(sample);
            });
          }
          if (!moving) throw new Error('Desktop menu lost its smooth transition');
          return { frames, moving, maxDrift };
        });
        transitions.push({ width, theme, chatOpen, ...result });
      }
    }
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    await tab.locator('.menu-toggle').click();
    assert(!await tab.locator('.sidebar').evaluate(node => node.getAnimations().length), 'Reduced motion still animates the sidebar');
    await tab.goto(new URL('1Z0-1157-26/mcp/#objetivos-del-modulo', base).href);
    if (await tab.locator('#certichat-panel').isVisible()) await tab.locator('[data-chat-close]').click();
    const sections = [];
    for (const width of [1428, 390]) for (const theme of ['light', 'dark']) {
      await tab.emulateMedia({ reducedMotion: 'reduce' });
      await tab.setViewportSize({ width, height: 1019 });
      await tab.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      if (await tab.locator('.menu-toggle').getAttribute('aria-expanded') !== 'true') await tab.locator('.menu-toggle').click();
      await tab.emulateMedia({ reducedMotion: 'no-preference' });
      const result = await tab.locator('.nav-link[aria-current="page"] + .nav-branch').evaluate(async branch => {
        branch.open = true;
        branch.getBoundingClientRect();
        await Promise.all(branch.getAnimations().map(animation => animation.finished.catch(() => {})));
        const rows = [...branch.querySelectorAll('.nav-section-link')];
        if (rows.length !== 9 || rows.some(node => node.getBoundingClientRect().height !== 36)) throw new Error('Section spacing changed');
        const expanded = branch.getBoundingClientRect().height, samples = [];
        for (const open of [false, true]) {
          branch.querySelector('summary').click();
          const start = performance.now(), heights = [];
          await new Promise(resolve => { const sample = now => { heights.push(branch.getBoundingClientRect().height); if (now - start < 300) requestAnimationFrame(sample); else resolve(); }; requestAnimationFrame(sample); });
          if (branch.open !== open || !heights.some(height => height > 1 && height < expanded - 1) || Math.abs(heights.at(-1) - (open ? expanded : 0)) > 1) throw new Error(`Section expansion is abrupt/incomplete: ${JSON.stringify({ open, expanded, heights })}`);
          samples.push({ open, frames: heights.length });
        }
        return { rows: rows.length, expanded, samples };
      });
      sections.push({ width, theme, ...result });
    }
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    assert(!await tab.locator('.nav-branch').evaluateAll(nodes => nodes.some(node => node.getAnimations().length)), 'Reduced motion still animates the sections');
    assert(!errors.length, `Browser errors: ${errors.join('; ')}`);
    return { checks: 'Independent catalog, reference SVG, all five carousel groups, fixed navigation, Home logo and Foundation/course geometry, synchronized sidebar motion and interrupted reversal, compact animated module sections', courses: 2, themes: 2, widths, chatStates: 2, samples, transitions, sections };
  } finally { await context.close(); }
}

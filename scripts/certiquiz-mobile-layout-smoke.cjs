// playwright-cli run-code --filename scripts/certiquiz-mobile-layout-smoke.cjs
// Layout-only API doubles; never creates, starts or ends a real room.
async page => {
  const origin = new URL(page.url()).origin;
  const base = new URL(page.url()).pathname.match(/^\/certitips\/(?:es|en|pt|it)\//)?.[0] || '/certitips/';
  if (origin !== 'http://127.0.0.1:4173') throw new Error('Use the local preview.');
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const context = await page.context().browser().newContext({ reducedMotion: 'reduce' });
  const lobby = { code: '123456', role: 'host', status: 'lobby', players: [], playerCount: 0, leaderboard: [], questionCount: 12, secondsPerQuestion: 10, serverTime: Date.now(), lobbyDeadline: Date.now() + 900000 };
  let inRoom = false;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/catalog') return route.fulfill({ json: { courses: [{ id: 'test', title: 'Curso de prueba', questionCount: 20 }], limits: { maxQuestions: 20, minSeconds: 5, maxSeconds: 60, maxPlayers: 50 } } });
    if (url.pathname === '/api/session') return route.fulfill({ json: { host: inRoom, hostRoomCode: inRoom ? lobby.code : null, roomCode: null } });
    if (url.pathname === `/api/rooms/${lobby.code}`) return route.fulfill({ json: lobby });
    return url.origin === origin ? route.continue() : route.abort();
  });
  const tab = await context.newPage(), checks = [], participantHeadings = new Map();
  try {
    for (const width of [320, 394, 480, 800, 801, 1146]) {
      await tab.setViewportSize({ width, height: 852 });
      for (const state of ['', '#participant', '#host', '?room=123456']) {
        inRoom = state.startsWith('?');
        await tab.goto(`${origin}${base}certiquiz/${state}`);
        await tab.locator('.welcome').waitFor({ state: 'attached' });
        for (const theme of ['light', 'dark']) {
          const dark = await tab.locator('html').getAttribute('data-theme') === 'dark';
          if (dark !== (theme === 'dark')) await tab.locator('.theme-toggle').click();
          await tab.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          assert(await tab.locator('.welcome').isVisible() === (width > 800), `${width}/${state}: breadcrumb visibility`);
          if (state === '#participant' || state === '#host') {
            const heading = await tab.locator('.entry-card').evaluate(e => {
              const css = getComputedStyle(e.querySelector('h2')), card = getComputedStyle(e);
              return { font: css.fontSize, line: css.lineHeight, margin: css.margin, padding: card.paddingTop, border: card.borderTopWidth === '1px' && card.borderTopColor === card.borderRightColor };
            });
            if (width > 800) assert(heading.border, `${width}/${state}/${theme}: entry retains its red border`);
            if (state === '#participant') {
              assert(await tab.locator('.player-entry > .eyebrow').count() === 0 && await tab.locator('.player-entry > p').isVisible(), 'Participant lacks the host-style title and introduction');
              participantHeadings.set(`${width}/${theme}`, heading);
            } else assert(JSON.stringify(heading) === JSON.stringify(participantHeadings.get(`${width}/${theme}`)), `${width}/${theme}: participant and host heading styles differ`);
          }
          if (width <= 800 && state) {
            const fit = await tab.locator('.join-card:not(.role-card)').evaluate(e => {
              const r = e.getBoundingClientRect(), main = document.querySelector('main').getBoundingClientRect();
              const header = document.querySelector('.site-header').getBoundingClientRect();
              const footer = document.querySelector('.site-footer').getBoundingClientRect();
              const css = getComputedStyle(e);
              return Math.abs(r.top + scrollY - header.bottom) < 1 && Math.abs(r.left) < 1 && Math.abs(r.right - innerWidth) < 1 && r.height >= footer.top - header.bottom - 1 && css.borderRadius === '0px' && css.borderTopWidth === '0px' && document.documentElement.scrollWidth <= innerWidth;
            });
            assert(fit, `${width}/${state}/${theme}: card does not use available content area`);
            await tab.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
            const actionsFit = await tab.locator('.join-card :is(.join-actions, .setup-actions, .lobby-footer)').evaluate(e => e.getBoundingClientRect().bottom <= document.querySelector('.site-footer').getBoundingClientRect().top);
            assert(actionsFit, `${width}/${state}/${theme}: footer covers actions`);
          }
          checks.push(`${width}/${state || 'roles'}/${theme}`);
        }
      }
    }
    return { checks: checks.length, screenshots: 0 };
  } finally { await context.close(); }
}

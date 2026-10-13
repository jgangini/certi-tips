// Run after building with CERTIQUIZ_API_ORIGIN=http://127.0.0.1:18740 and starting the local preview.
// playwright-cli -s=certiquiz-lock open http://127.0.0.1:4173/certitips/
// playwright-cli -s=certiquiz-lock run-code --filename scripts/certiquiz-chat-lock-smoke.cjs
async (page) => {
  const origin = new URL(page.url()).origin;
  if (origin !== 'http://127.0.0.1:4173') throw new Error('Use the local preview on port 4173.');
  const appUrl = `${origin}/certitips/certiquiz/`;
  const contexts = [];
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const create = async width => {
    const context = await page.context().browser().newContext({ viewport: { width, height: 1000 } });
    contexts.push(context);
    return context.newPage();
  };
  try {
    const host = await create(1280);
    const participant = await create(619);
    const otherPage = await participant.context().newPage();
    await otherPage.goto(`${origin}/certitips/`);
    await otherPage.locator('[data-certichat]').waitFor();
    await host.goto(appUrl);
    await host.locator('[data-role="host"]').click();
    await host.locator('.course-picker summary').click();
    await host.locator('.course-picker [data-course]').first().click();
    await host.getByLabel('Número de preguntas', { exact: true }).fill('1');
    await host.getByRole('button', { name: 'Entrar', exact: true }).click();
    await host.locator('[data-start]').waitFor();
    for (const width of [1174, 800, 619, 390, 320]) {
      await host.setViewportSize({ width, height: 1000 });
      const layout = await host.locator('.lobby-footer').evaluate(footer => {
        const facts = footer.querySelector('.fact-row').getBoundingClientRect();
        const action = footer.querySelector('.actions').getBoundingClientRect();
        const controls = [...footer.querySelector('.actions').children].map(node => node.getBoundingClientRect());
        const grid = document.querySelector('.room-grid').getBoundingClientRect();
        const card = document.querySelector('.room-grid .card').getBoundingClientRect();
        return { factsBottom: facts.bottom, factsMiddle: facts.top + facts.height / 2, actionTop: action.top, actionMiddle: action.top + action.height / 2, controls: controls.map(box => box.top), sideDisplay: getComputedStyle(document.querySelector('.room-side')).display, cardRight: card.right, gridRight: grid.right, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      assert(layout.controls.every(top => Math.abs(top - layout.controls[0]) < 2), `Host actions stack at ${width}px: ${JSON.stringify(layout)}`);
      assert((layout.actionTop >= layout.factsBottom - 1 || Math.abs(layout.actionMiddle - layout.factsMiddle) < 2) && !layout.overflow, `Host actions split across rows or overflow at ${width}px: ${JSON.stringify(layout)}`);
      if (width <= 800) assert(layout.sideDisplay === 'none' && Math.abs(layout.cardRight - layout.gridRight) < 1, `Host participant count remains visible or leaves an empty column at ${width}px: ${JSON.stringify(layout)}`);
    }
    await host.setViewportSize({ width: 1280, height: 1000 });
    const code = await host.evaluate(async () => {
      const api = document.querySelector('.certiquiz-app').dataset.apiOrigin;
      const response = await fetch(`${api}/api/session`, { credentials: 'include' });
      return (await response.json()).roomCode;
    });
    assert(/^\d{6}$/.test(code), 'The host did not create a valid room.');
    await participant.goto(`${appUrl}?room=${code}`);
    assert(await participant.locator('[data-certichat]').count() === 0, 'CertiChat is present on CertiQuiz.');
    await participant.getByLabel('Tu nombre o alias').fill('Prueba');
    await participant.getByRole('button', { name: 'Entrar', exact: true }).click();
    await participant.locator('.player-lobby-footer').waitFor();
    const layout = await participant.locator('.player-lobby-footer').evaluate(footer => {
      const facts = footer.querySelector('.fact-row').getBoundingClientRect();
      const button = footer.querySelector('[data-exit]').getBoundingClientRect();
      const side = document.querySelector('.room-side');
      return { direction: getComputedStyle(footer).flexDirection, factsRight: facts.right, factsMiddle: facts.top + facts.height / 2, buttonLeft: button.left, buttonMiddle: button.top + button.height / 2, sideDisplay: getComputedStyle(side).display, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    assert(layout.direction === 'row' && layout.buttonLeft >= layout.factsRight - 1 && Math.abs(layout.buttonMiddle - layout.factsMiddle) < 2, `Participant facts and Salir are not on one line: ${JSON.stringify(layout)}`);
    assert(layout.sideDisplay === 'none' && !layout.overflow, 'The narrow participant view still shows the count or overflows.');
    for (const width of [801, 800, 619]) {
      await participant.setViewportSize({ width, height: 1000 });
      const state = await participant.locator('.room-grid').evaluate(grid => ({ side: getComputedStyle(grid.querySelector('.room-side')).display, cardRight: grid.querySelector('.card').getBoundingClientRect().right, gridRight: grid.getBoundingClientRect().right }));
      assert(width > 800 ? state.side !== 'none' : state.side === 'none' && Math.abs(state.cardRight - state.gridRight) < 1, `Participant counter breakpoint fails at ${width}px: ${JSON.stringify(state)}`);
    }
    await participant.setViewportSize({ width: 320, height: 800 });
    assert(await participant.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && getComputedStyle(document.querySelector('.player-lobby-footer')).flexDirection === 'row' && getComputedStyle(document.querySelector('.room-side')).display === 'none'), 'The smallest participant view overflows, stacks Salir or shows the counter.');
    await otherPage.waitForFunction(() => document.querySelector('[data-certichat]')?.hidden);
    await participant.goto(`${origin}/certitips/CDMP-DMF/overview/`);
    await participant.waitForFunction(() => document.querySelector('[data-certichat]')?.hidden);
    assert(await participant.locator('[data-chat-open]').isHidden(), 'CertiChat can be opened while the challenge is active.');
    await host.locator('[data-exit]').click();
    await host.locator('[data-confirm-yes]').click();
    await host.locator('#create-form').waitFor();
    await otherPage.locator('[data-certichat]:not([hidden])').waitFor({ timeout: 25000 });
    await participant.locator('[data-certichat]:not([hidden])').waitFor({ timeout: 25000 });
    return 'PASS: narrow participant layout; no chat on CertiQuiz; cross-tab and cross-page lock; unlock after host ends room.';
  } finally {
    await Promise.allSettled(contexts.map(context => context.close()));
  }
}

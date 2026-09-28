// Run using: playwright-cli -s=certitips run-code --filename scripts/browser-smoke.cjs
// Uses an isolated CLI browser and its current origin; never takes screenshots.
async (page) => {
  const origin = await page.evaluate(() => location.origin);
  const base = `${origin}/certi-tips/`;
  const course = 'agentic-ai-foundations-2026';
  const quizKey = `certitips:quiz:v1:${course}`;
  const progressKey = `certitips:progress:v1:${course}`;
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const checks = [];
  const errors = [];
  const pageError = error => errors.push(error.message);
  page.on('pageerror', pageError);
  const slugs = ['overview', 'agents', 'langchain', 'mcp', 'openai', 'oci-enterprise', 'oracle-database', 'study-path', 'glossary', 'review', 'exam-checklist', 'practice'];
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const slug of ['', ...slugs]) {
      const response = await page.goto(`${base}${slug ? `${course}/${slug}/` : ''}`);
      assert(response.status() === 200, `HTTP failure: ${slug}`);
      const geometry = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, h1: document.querySelectorAll('h1').length }));
      assert(geometry.document <= geometry.viewport + 1, `Horizontal overflow at ${width}: ${slug} (${geometry.document})`);
      assert(geometry.h1 === 1, `Missing/duplicate h1: ${slug}`);
      assert(await page.locator('main .contents').count() === 0, 'Duplicate in-page contents remains');
      if (slug) assert(await page.locator(`.nav-branch[data-nav-page="${slug}"][open]`).count() === 1, `Active tree branch closed: ${slug}`);
      await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      const layout = await page.evaluate(() => {
        const footer = document.querySelector('.site-footer');
        const box = footer.getBoundingClientRect();
        return { fixed: getComputedStyle(footer).position, bottom: box.bottom, height: innerHeight, clear: document.querySelector('main').getBoundingClientRect().bottom <= box.top + 1,
          tables: [...document.querySelectorAll('table')].every(table => Math.abs(table.getBoundingClientRect().right - table.rows[0].lastElementChild.getBoundingClientRect().right) < 2) };
      });
      assert(layout.fixed === 'fixed' && Math.abs(layout.bottom - layout.height) < 1, `Footer is not fixed: ${slug}`);
      assert(layout.clear, `Footer covers the end of main: ${width}/${slug}`);
      assert(layout.tables, `Table columns leave a blank right strip: ${width}/${slug}`);
    }
    checks.push(`${width}px: 13 pages, no overflow, full-width table rows, fixed footer without content overlap`);
  }
  await page.goto(`${base}${course}/agents/`);
  const menu = page.getByRole('button', { name: 'Menú', exact: true });
  await menu.click();
  assert(await menu.getAttribute('aria-expanded') === 'true', 'Mobile menu did not open');
  await page.keyboard.press('Escape');
  assert(await menu.getAttribute('aria-expanded') === 'false', 'Escape did not close mobile menu');
  await menu.click();
  const mcpBranch = page.locator('[data-nav-page="mcp"]');
  await mcpBranch.locator('summary').waitFor({ state: 'visible' });
  await mcpBranch.locator('summary').focus();
  await page.keyboard.press('Enter');
  assert(await mcpBranch.evaluate(branch => branch.open), 'Keyboard did not expand the module tree');
  await mcpBranch.locator('a[href$="#conceptos-clave"]').click();
  await page.waitForURL(`${base}${course}/mcp/#conceptos-clave`);
  assert(await menu.getAttribute('aria-expanded') === 'false', 'Section navigation did not close mobile menu');
  checks.push('left module/section tree, keyboard disclosure, mobile section navigation and Escape');
  await page.setViewportSize({ width: 1280, height: 900 });
  let visualCount = 0;
  for (const slug of slugs.slice(0, 7)) {
    await page.goto(`${base}${course}/${slug}/`);
    const diagrams = page.locator('[data-diagram]');
    for (const button of await diagrams.all()) {
      visualCount++;
      await button.scrollIntoViewIfNeeded();
      await button.locator('img').evaluate(image => image.decode());
      await button.click();
      assert(await page.locator('#diagram-viewer').evaluate(dialog => dialog.open), `Diagram did not open: ${slug}`);
      await page.keyboard.press('Tab');
      assert(await page.evaluate(() => document.querySelector('#diagram-viewer').contains(document.activeElement)), 'Focus escaped modal');
      await page.keyboard.press('Escape');
      assert(await button.evaluate(element => document.activeElement === element), 'Diagram did not restore focus');
    }
  }
  assert(visualCount === 13, `Expected 10 SVG diagrams and 3 solution images, got ${visualCount}`);
  checks.push('all 10 SVG diagrams and 3 generated solution images, modal keyboard containment and focus return');
  await page.evaluate(key => localStorage.removeItem(key), progressKey);
  await page.reload();
  await page.locator('[data-mark-complete]').click();
  await page.reload();
  assert(await page.locator('[data-mark-complete]').getAttribute('aria-pressed') === 'true', 'Progress did not persist');
  checks.push('lesson progress survives reload');
  await page.goto(`${base}${course}/practice/`);
  await page.evaluate(key => { localStorage.removeItem(key); localStorage.removeItem(`${key}:last-practice`); }, quizKey);
  await page.reload();
  assert(await page.locator('[data-practice-intro]:not([hidden])').count() === 2, 'Initial practice instructions missing');
  await page.getByRole('button', { name: 'Empezar práctica →', exact: true }).click();
  assert(await page.locator('[data-practice-intro]:not([hidden])').count() === 0, 'Instructions repeat during questions');
  const bank = await page.evaluate(async base => (await fetch(`${base}assets/questions.json`)).json(), base);
  const answerCurrent = async (wrong) => {
    const text = await page.locator('.quiz-question').textContent();
    const question = bank.find(item => item.question === text);
    assert(Boolean(question), 'Question not found in published bank');
    const selected = wrong ? question.options.find(item => item.id !== question.correctOption).id : question.correctOption;
    await page.locator(`input[name=answer][value=${selected}]`).check();
    await page.getByRole('button', { name: 'Comprobar respuesta', exact: true }).click();
    assert(await page.locator('.feedback li').count() === 4, 'Expected explanations for all four alternatives');
    assert(await page.locator('input[name=answer]:disabled').count() === 4, 'Confirmed answers must be locked');
    assert(await page.locator('#feedback-title').evaluate(element => document.activeElement === element), 'Feedback did not receive keyboard focus');
    return question;
  };
  await answerCurrent(false);
  const savedProgress = await page.evaluate(key => localStorage.getItem(key), progressKey);
  // CLI reports native dialogs out-of-band; test both decisions synchronously here.
  await page.evaluate(() => { window.confirm = () => false; });
  await page.locator('[data-reset]').click();
  assert(await page.locator('.feedback').count() === 1, 'Cancelled reset discarded the response');
  await page.evaluate(() => { window.confirm = () => true; });
  await page.locator('[data-reset]').click();
  assert(await page.locator('[data-start]').isVisible(), 'Reset did not return to start');
  assert(await page.locator('[data-practice-intro]:not([hidden])').count() === 2, 'Reset did not restore instructions');
  assert(await page.evaluate(key => localStorage.getItem(key), quizKey) === null, 'Reset did not clear saved test');
  assert(await page.evaluate(key => localStorage.getItem(key), progressKey) === savedProgress, 'Reset erased course progress');
  await page.reload();
  await page.locator('[data-start]').click();
  for (let index = 0; index < 12; index++) {
    await answerCurrent(index % 3 === 0);
    if (index === 2) {
      const questionText = await page.locator('.quiz-question').textContent();
      let resumeBank;
      const bankPaused = new Promise(resolve => { resumeBank = resolve; });
      await page.route('**/assets/questions.json', async route => { await bankPaused; await route.continue(); });
      await page.reload({ waitUntil: 'domcontentloaded' });
      assert(await page.locator('[data-practice-intro]:not([hidden])').count() === 0, 'Slow reload flashes practice instructions');
      resumeBank();
      await page.locator('.feedback').waitFor();
      await page.unroute('**/assets/questions.json');
      assert(await page.locator('.quiz-question').textContent() === questionText, 'Question changed after reload');
      assert(await page.locator('input[name=answer]:disabled').count() === 4, 'Locked response lost after reload');
      assert(await page.locator('[data-practice-intro]:not([hidden])').count() === 0, 'Reload repeated practice instructions');
    }
    await page.locator('[data-next]').click();
  }
  assert((await page.locator('.score-number').textContent()).replace(/\s/g, '') === '8/12', 'Expected practice result 8/12');
  assert(await page.locator('.domain-results li').count() === 6, 'Expected six domain results');
  await page.getByRole('button', { name: 'Repasar mis errores', exact: true }).click();
  for (let index = 0; index < 4; index++) { await answerCurrent(false); await page.locator('[data-next]').click(); }
  assert((await page.locator('.score-number').textContent()).replace(/\s/g, '') === '4/4', 'Expected review result 4/4');
  assert((await page.locator('#quiz').textContent()).includes('se mantiene en 8/12'), 'Review overwrote the original practice score');
  checks.push('complete 12-question attempt, explanations, lock, reload, 8/12 score, separate 4/4 review');
  await page.locator('[data-reset]').click();
  assert(await page.locator('[data-start]').isVisible(), 'Completed review cannot be reset');
  await page.locator('[data-start]').click();
  assert((await page.locator('.quiz-meta').textContent()).includes('1 de 12'), 'New attempt did not reset question counter');
  checks.push('reset confirmation/cancellation, cleared saved test, retained course progress, intro-only instructions');
  await page.goto(`${base}${course}/talk/`);
  await page.waitForURL(`${base}${course}/overview/`);
  assert(await page.locator('[data-talk-mode], a[href$="/talk/"]').count() === 0, 'Separate talk mode remains');
  await page.goto(base);
  const homeText = await page.locator('body').innerText();
  for (const removed of ['TU PRÓXIMA CERTIFICACIÓN EMPIEZA AQUÍ', 'EN ESPAÑOL', 'ACCESO LIBRE', 'SIN REGISTRO', '¿Vas a dar una charla?', '90 minutos']) assert(!homeText.includes(removed), `Removed text remains: ${removed}`);
  assert(await page.locator('.hero-visual, .approach-grid, .hero-proof, .course-metrics').count() === 0, 'Removed home panel remains');
  checks.push('new attempt, one learning mode, old talk URL redirects, requested promotional panels removed');

  const context = await page.context().browser().newContext();
  await context.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked for test', 'SecurityError'); } }));
  const blocked = await context.newPage();
  await blocked.goto(`${base}${course}/practice/`);
  await blocked.getByRole('button', { name: 'Empezar práctica →', exact: true }).click();
  await blocked.locator('input[name=answer]').first().check();
  await blocked.getByRole('button', { name: 'Comprobar respuesta', exact: true }).click();
  assert(await blocked.locator('.feedback li').count() === 4, 'Quiz failed with blocked storage');
  assert((await blocked.locator('.quiz-notice').textContent()).includes('almacenamiento está bloqueado'), 'Blocked-storage notice missing');
  await context.close();
  checks.push('blocked storage still permits answering with clear session-only notice');
  await page.evaluate(({ quizKey, progressKey }) => { localStorage.removeItem(quizKey); localStorage.removeItem(`${quizKey}:last-practice`); localStorage.removeItem(progressKey); }, { quizKey, progressKey });
  page.off('pageerror', pageError);
  assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
  await page.goto(base);
  return { origin, checks, pageErrors: errors.length, screenshots: 0 };
}

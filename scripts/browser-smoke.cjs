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
  const slugs = ['overview', 'agents', 'langchain', 'mcp', 'openai', 'oci-enterprise', 'oracle-database', 'study-path', 'glossary', 'review', 'exam-checklist', 'talk', 'practice'];
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const slug of ['', ...slugs]) {
      const response = await page.goto(`${base}${slug ? `${course}/${slug}/` : ''}`);
      assert(response.status() === 200, `HTTP failure: ${slug}`);
      const geometry = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, h1: document.querySelectorAll('h1').length }));
      assert(geometry.document <= geometry.viewport + 1, `Horizontal overflow at ${width}: ${slug} (${geometry.document})`);
      assert(geometry.h1 === 1, `Missing/duplicate h1: ${slug}`);
    }
    checks.push(`${width}px: 14 routes, no document overflow, one H1`);
  }
  await page.goto(`${base}${course}/agents/`);
  const menu = page.getByRole('button', { name: 'Menú', exact: true });
  await menu.click();
  assert(await menu.getAttribute('aria-expanded') === 'true', 'Mobile menu did not open');
  await page.keyboard.press('Escape');
  assert(await menu.getAttribute('aria-expanded') === 'false', 'Escape did not close mobile menu');
  checks.push('mobile menu and Escape');
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const slug of slugs.slice(0, 7)) {
    await page.goto(`${base}${course}/${slug}/`);
    const diagrams = page.locator('[data-diagram]');
    for (const button of await diagrams.all()) {
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
  checks.push('all 10 diagram assets, modal keyboard containment and focus return');
  await page.evaluate(key => localStorage.removeItem(key), progressKey);
  await page.reload();
  await page.locator('[data-mark-complete]').click();
  await page.reload();
  assert(await page.locator('[data-mark-complete]').getAttribute('aria-pressed') === 'true', 'Progress did not persist');
  checks.push('lesson progress survives reload');
  await page.goto(`${base}${course}/practice/`);
  await page.evaluate(key => { localStorage.removeItem(key); localStorage.removeItem(`${key}:last-practice`); }, quizKey);
  await page.reload();
  await page.getByRole('button', { name: 'Empezar práctica →', exact: true }).click();
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
  for (let index = 0; index < 12; index++) {
    await answerCurrent(index % 3 === 0);
    if (index === 2) {
      const questionText = await page.locator('.quiz-question').textContent();
      await page.reload();
      await page.locator('.feedback').waitFor();
      assert(await page.locator('.quiz-question').textContent() === questionText, 'Question changed after reload');
      assert(await page.locator('input[name=answer]:disabled').count() === 4, 'Locked response lost after reload');
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
  await page.getByRole('button', { name: 'Nuevo intento de 12', exact: true }).click();
  assert((await page.locator('.quiz-meta').textContent()).includes('1 de 12'), 'New attempt did not reset question counter');
  await page.goto(`${base}${course}/talk/`);
  await page.locator('[data-talk-mode]').click();
  assert(await page.locator('body').evaluate(body => body.classList.contains('talk-mode')), 'Talk projection control failed');
  checks.push('new attempt and talk projection');

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

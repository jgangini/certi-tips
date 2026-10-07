// Run in an isolated playwright-cli session after opening the local preview. No screenshots.
async (page) => {
  const origin = await page.evaluate(() => location.origin);
  const base = `${origin}/certi-tips/`;
  const route = `${base}1Z0-1122-26/`;
  const quizKey = 'certitips:quiz:v1:oci-ai-foundations-2026';
  const progressKey = 'certitips:progress:v1:oci-ai-foundations-2026';
  const otherQuiz = 'certitips:quiz:v1:agentic-ai-foundations-2026';
  const otherProgress = 'certitips:progress:v1:agentic-ai-foundations-2026';
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  await page.goto(base);
  const pages = await page.locator('[data-search-kind="topic"] a').evaluateAll(links => links.map(link => link.href).filter(url => url.includes('/1Z0-1122-26/')));
  assert(pages.length === 13, 'Search must index all 13 AI Foundations pages');
  assert(await page.locator('#oci-ai-foundations-2026 .certitips-button').getAttribute('href') === '/certi-tips/1Z0-1122-26/overview/', 'Home does not link to new course');
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const url of pages) {
      assert((await page.goto(url)).status() === 200, `Missing page: ${url}`);
      await page.locator('.prose img').evaluateAll(images => Promise.all(images.map(image => { image.loading = 'eager'; return image.decode(); })));
      assert(await page.locator('h1').count() === 1, `Heading count: ${url}`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow at ${width}: ${url}`);
      assert(await page.locator('[data-progress]').getAttribute('max') === '10', 'Expected ten progress items');
      await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      if (await page.locator('[data-mark-complete]').count()) await page.locator('[data-mark-complete]').waitFor({ state: 'visible' });
      await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      assert(await page.evaluate(() => document.querySelector('main').getBoundingClientRect().bottom <= document.querySelector('.site-footer').getBoundingClientRect().top + 1), `Footer covers content: ${url}`);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  let diagrams = 0;
  for (const url of pages.filter(url => !/\/(overview|glossary|exam-checklist|practice)\/$/.test(url))) {
    await page.goto(url);
    for (const summary of await page.locator('.prose details:not([open]) > summary').all()) await summary.click();
    assert(await page.locator('[data-diagram]').count() === 7, `Section diagrams missing: ${url}`);
    for (const button of await page.locator('[data-diagram]').all()) {
      await button.scrollIntoViewIfNeeded();
      await button.locator('img').evaluate(image => image.decode());
      await button.click();
      assert(await page.locator('#diagram-viewer').evaluate(dialog => dialog.open), 'Diagram did not open');
      await page.keyboard.press('Escape');
      assert(await button.evaluate(element => document.activeElement === element), 'Diagram focus not restored');
      diagrams++;
    }
  }
  await page.goto(`${route}ai-basics/`);
  await page.evaluate(({ quizKey, progressKey, otherQuiz, otherProgress }) => {
    localStorage.removeItem(quizKey); localStorage.removeItem(progressKey);
    localStorage.setItem(otherQuiz, 'other-course-sentinel');
    localStorage.setItem(otherProgress, JSON.stringify({ agents: true }));
  }, { quizKey, progressKey, otherQuiz, otherProgress });
  await page.reload();
  await page.locator('.prose img').evaluateAll(images => Promise.all(images.map(image => { image.loading = 'eager'; return image.decode(); })));
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await page.locator('[data-mark-complete]').click();
  await page.reload();
  assert(await page.locator('[data-progress-label]').textContent() === '1 de 10', 'Progress did not persist for new course');
  await page.goto(`${route}practice/`);
  const bank = await page.evaluate(async () => (await fetch(`${document.body.dataset.base}assets/${document.body.dataset.questionBank}.json`)).json());
  assert(bank.length === 54, 'Wrong question bank');
  await page.locator('[data-start]').click();
  const answer = async wrong => {
    const text = await page.locator('.quiz-question').textContent();
    const question = bank.find(item => item.question === text);
    assert(question, 'Question from another bank');
    await page.locator(`input[value="${wrong ? question.options.find(option => option.id !== question.correctOption).id : question.correctOption}"]`).check();
    await page.locator('#question-form button').click();
    assert(await page.locator('.feedback li').count() === 4, 'Explanations missing');
    assert(await page.locator('input:disabled').count() === 4, 'Confirmed answer is not locked');
    return text;
  };
  for (let index = 0; index < 18; index++) {
    const text = await answer(index % 3 === 0);
    if (index === 4) {
      await page.reload();
      await page.locator('.feedback').waitFor();
      assert(await page.locator('.quiz-question').textContent() === text, 'Reload lost current question');
    }
    await page.locator('[data-next]').click();
  }
  assert((await page.locator('.score-number').textContent()).replace(/\s/g, '') === '12/18', 'Wrong score');
  assert(await page.locator('.domain-results li').count() === 9, 'Expected nine study areas');
  await page.locator('[data-review]').click();
  for (let index = 0; index < 6; index++) {
    await answer(false); await page.locator('[data-next]').click();
  }
  assert((await page.locator('.score-number').textContent()).replace(/\s/g, '') === '6/6', 'Wrong review score');
  assert((await page.locator('#quiz').textContent()).includes('se mantiene en 12/18'), 'Review overwrote original score');
  await page.locator('[data-reset]').click();
  assert(await page.locator('[data-start]').isVisible(), 'Reset did not return to intro');
  assert(await page.evaluate(key => localStorage.getItem(key), otherQuiz) === 'other-course-sentinel', 'Quiz state crossed courses');
  assert(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).agents, otherProgress), 'Progress crossed courses');
  assert(await page.locator('[data-progress-label]').textContent() === '1 de 10', 'Reset deleted reading progress');
  await page.goto(`${base}oci-ai-foundations-2026/machine-learning/#conceptos-clave`);
  await page.waitForURL(`${route}machine-learning/#conceptos-clave`);
  await page.locator('[data-search-open]').click();
  await page.locator('#search-query').fill('machine learning');
  assert(await page.locator('[data-search-kind="topic"]:visible a[href*="1Z0-1122-26/machine-learning/"]').count() === 1, 'Search does not find new module');
  await page.keyboard.press('Escape');
  await page.evaluate(keys => keys.forEach(key => localStorage.removeItem(key)), [quizKey, progressKey, otherQuiz, otherProgress]);
  page.off('pageerror', onError);
  assert(!errors.length, errors.join('; '));
  await page.goto(`${route}overview/`);
  return { pages: pages.length, widths: [1280, 390, 320], diagrams, practice: '12/18', review: '6/6', isolatedCourseStorage: true, pageErrors: errors.length, screenshots: 0 };
}

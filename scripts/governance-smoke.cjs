// Run in an isolated CLI session opened at the local preview:
// npx --yes --package @playwright/cli playwright-cli -s=governance run-code --filename scripts/governance-smoke.cjs
// DOM, geometry and interaction checks only; never takes screenshots.
async (page) => {
  const origin = await page.evaluate(() => location.origin);
  const base = `${origin}/certi-tips/`;
  const route = `${base}data-governance/`;
  const modules = ['governance', 'data-architecture', 'data-modeling', 'data-operations', 'data-security', 'data-integration', 'content-management', 'master-reference-data', 'data-warehousing-bi', 'metadata', 'data-quality'];
  const slugs = ['overview', ...modules, 'oracle-map', 'glossary', 'case-study', 'practice'];
  const widths = [1299, 390, 320];
  const quizKey = 'certitips:quiz:v1:data-governance';
  const progressKey = 'certitips:progress:v1:data-governance';
  const otherQuiz = 'certitips:quiz:v1:agentic-ai-foundations-2026';
  const otherProgress = 'certitips:progress:v1:agentic-ai-foundations-2026';
  const keys = [quizKey, progressKey, otherQuiz, otherProgress, 'certitips:theme'];
  const previousStorage = await page.evaluate(keys => keys.map(key => [key, localStorage.getItem(key)]), keys);
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  let diagrams = 0;
  let scrollableTables = 0;
  try {
    await page.evaluate(({ quizKey, progressKey, otherQuiz, otherProgress }) => {
      localStorage.removeItem(quizKey); localStorage.removeItem(progressKey);
      localStorage.setItem(otherQuiz, 'other-course-sentinel');
      localStorage.setItem(otherProgress, JSON.stringify(['agents']));
      localStorage.setItem('certitips:theme', 'light');
    }, { quizKey, progressKey, otherQuiz, otherProgress });
    await page.goto(base);
    const labels = await page.locator('.path-nav .path-group > summary').allTextContents();
    assert(labels.join('|') === 'Foundation|AI & Agents|Data & AI|Architecture|Governance', 'Expected five ordered navigation groups');
    const courseLink = '.path-group-panel a[href="/certi-tips/data-governance/overview/"]';
    assert(await page.locator(`.path-nav ${courseLink}`).count() === 1 && await page.locator(`.path-nav-mobile ${courseLink}`).count() === 1, 'Governance must have desktop and mobile routes');
    const indexed = await page.locator('[data-search-kind="topic"] a').evaluateAll(links => links.map(link => link.href).filter(url => url.includes('/data-governance/')));
    assert(indexed.length === slugs.length && slugs.every(slug => indexed.includes(`${route}${slug}/`)), 'Search must index all sixteen Governance pages');
    for (const width of [1100, 1201, 1299]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.locator('.path-nav').isVisible() === (width > 1200), `Wrong desktop navigation at ${width}px`);
      assert(await page.locator('.path-nav-mobile').isVisible() === (width <= 1200), `Wrong mobile navigation at ${width}px`);
      assert(await page.evaluate(() => {
        const header = document.querySelector('.site-header');
        const boxes = [...header.children].filter(element => getComputedStyle(element).display !== 'none').map(element => element.getBoundingClientRect());
        return boxes.every((box, index) => box.left >= 0 && box.right <= innerWidth + 1 && (!index || boxes[index - 1].right <= box.left + 1));
      }), `Header controls overlap or overflow at ${width}px`);
    }
    await page.goto(`${base}#governance`);
    const card = page.locator('#governance .certification-item');
    assert(await card.count() === 1 && await card.isVisible(), 'Governance carousel group is unavailable');
    assert(await card.locator('.certification-level').textContent() === 'Taller aplicado', 'Workshop must not have an exam level');
    assert(await card.locator('.certification-actions a').count() === 1, 'Workshop must not invent an official certification route');
    await card.locator('.certitips-button').click();
    await page.waitForURL(`${route}overview/`);
    await page.keyboard.press('Control+k');
    await page.locator('#search-query').fill('Governance');
    assert(await page.locator('[data-search-kind="certification"]:visible a[href="/certi-tips/data-governance/overview/"]').count() === 1, 'Search cannot find the Governance course');
    await page.locator('#search-query').fill('metadatos');
    const metadata = page.locator('[data-search-kind="topic"]:visible a[href="/certi-tips/data-governance/metadata/"]');
    assert(await metadata.count() === 1, 'Search cannot find the metadata module');
    await metadata.click();
    await page.waitForURL(`${route}metadata/`);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      for (const slug of slugs) {
        assert((await page.goto(`${route}${slug}/`)).status() === 200, `Missing page: ${slug}`);
        await page.locator('.prose img').evaluateAll(images => Promise.all(images.map(image => { image.loading = 'eager'; return image.decode(); })));
        assert(await page.locator('h1').count() === 1, `Heading count: ${slug}`);
        assert(await page.locator('body').getAttribute('data-course-has-exam') === 'false', `Workshop is marked as an exam: ${slug}`);
        assert(await page.locator('[data-progress]').getAttribute('max') === '12', 'Expected orientation and eleven modules');
        assert(await page.locator('a[href*="/data-governance/exam-checklist/"]').count() === 0, `Broken exam route: ${slug}`);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Page overflow at ${width}px: ${slug}`);
        if (width === 320) scrollableTables += await page.locator('.table-scroll').evaluateAll(tables => tables.filter(table => {
          if (table.scrollWidth <= table.clientWidth + 1) return false;
          table.scrollLeft = table.scrollWidth;
          if (table.scrollLeft <= 0 || table.tabIndex !== 0 || table.getAttribute('role') !== 'region') throw new Error('Table cannot be scrolled accessibly');
          table.scrollLeft = 0;
          return true;
        }).length);
      }
    }
    assert(scrollableTables > 0, 'Mobile tables were not exercised');
    await page.goto(`${route}governance/`);
    const menu = page.getByRole('button', { name: 'Contenido del curso', exact: true });
    await menu.click();
    assert(await menu.getAttribute('aria-expanded') === 'true', 'Mobile course menu did not open');
    await page.locator('.sidebar a.nav-link[href$="/metadata/"]').click();
    await page.waitForURL(`${route}metadata/`);
    assert(await menu.getAttribute('aria-expanded') === 'false', 'Mobile course navigation did not close');
    await page.locator('.path-nav-mobile > summary').click();
    const mobileGovernance = page.locator('.path-nav-mobile .path-group').last();
    await mobileGovernance.locator('summary').focus();
    await page.keyboard.press('Enter');
    await mobileGovernance.locator(courseLink).click();
    await page.waitForURL(`${route}overview/`);
    await page.setViewportSize({ width: 1299, height: 900 });
    for (const slug of modules) {
      await page.goto(`${route}${slug}/`);
      for (const summary of await page.locator('.prose details:not([open]) > summary').all()) {
        await summary.focus(); await page.keyboard.press('Enter');
      }
      assert(await page.locator('[data-diagram]').count() === 7, `Expected seven section diagrams: ${slug}`);
      for (const button of await page.locator('[data-diagram]').all()) {
        await button.scrollIntoViewIfNeeded();
        await button.locator('img').evaluate(image => image.decode());
        await button.focus(); await page.keyboard.press('Enter');
        assert(await page.locator('#diagram-viewer').evaluate(dialog => dialog.open), `Keyboard did not open diagram: ${slug}`);
        await page.keyboard.press('Tab');
        assert(await page.evaluate(() => document.querySelector('#diagram-viewer').contains(document.activeElement)), 'Focus escaped the diagram dialog');
        await page.keyboard.press('Escape');
        assert(await button.evaluate(element => document.activeElement === element), 'Diagram did not restore keyboard focus');
        diagrams++;
      }
    }
    await page.goto(`${route}governance/`);
    const lightBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.locator('[data-theme-toggle]').click();
    assert(await page.locator('[data-theme-toggle]').getAttribute('aria-pressed') === 'true', 'Dark theme did not activate');
    assert(await page.evaluate(() => getComputedStyle(document.body).backgroundColor) !== lightBackground, 'Dark palette did not change');
    await page.reload();
    assert(await page.locator('[data-theme-toggle]').getAttribute('aria-pressed') === 'true', 'Theme did not persist');
    await page.locator('[data-theme-toggle]').click();
    await page.locator('.prose img').evaluateAll(images => Promise.all(images.map(image => { image.loading = 'eager'; return image.decode(); })));
    await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await page.locator('[data-mark-complete]').click();
    await page.reload();
    assert(await page.locator('[data-progress-label]').textContent() === '1 de 12', 'Reading progress did not persist');
    await page.goto(`${route}practice/`);
    const bank = await page.evaluate(async () => (await fetch(`${document.body.dataset.base}assets/${document.body.dataset.questionBank}.json`)).json());
    assert(bank.length === 66, 'Expected 66 Governance questions');
    await page.locator('[data-start]').click();
    const selected = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), quizKey);
    assert(selected.ids.length === 22, 'Expected 22 questions per attempt');
    for (const domain of modules) assert(selected.ids.filter(id => bank.find(question => question.id === id).domain === domain).length === 2, `Unbalanced domain: ${domain}`);
    const answer = async wrong => {
      const text = await page.locator('.quiz-question').textContent();
      const question = bank.find(item => item.question === text);
      assert(question, 'Question from another bank');
      await page.locator(`input[value="${wrong ? question.options.find(option => option.id !== question.correctOption).id : question.correctOption}"]`).check();
      await page.locator('#question-form button').click();
      assert(await page.locator('.feedback li').count() === 4, 'Missing option explanations');
      assert(await page.locator('input[name="answer"]:disabled').count() === 4, 'Confirmed answer is not locked');
      assert((await page.locator('.review-link').getAttribute('href')).startsWith('/certi-tips/data-governance/'), 'Feedback links to another course');
      return text;
    };
    for (let index = 0; index < 22; index++) {
      const text = await answer(index % 4 === 0);
      if (index === 4) {
        await page.reload(); await page.locator('.feedback').waitFor();
        assert(await page.locator('.quiz-question').textContent() === text, 'Reload changed the question');
        assert(await page.locator('input[name="answer"]:disabled').count() === 4, 'Reload unlocked the response');
      }
      await page.locator('[data-next]').click();
    }
    assert((await page.locator('.score-number').textContent()).replace(/\s/g, '') === '16/22', 'Wrong practice score');
    assert(await page.locator('.domain-results li').count() === 11, 'Expected eleven result areas');
    const completed = await page.evaluate(key => localStorage.getItem(key), quizKey);
    await page.reload(); await page.locator('[data-review]').click();
    for (let index = 0; index < 6; index++) { await answer(false); await page.locator('[data-next]').click(); }
    await page.reload();
    assert((await page.locator('.score-number').textContent()).replace(/\s/g, '') === '6/6', 'Wrong review score');
    assert((await page.locator('#quiz').textContent()).includes('se mantiene en 16/22'), 'Review overwrote the original score');
    assert(await page.evaluate(key => JSON.stringify(JSON.parse(localStorage.getItem(key)).original), quizKey) === completed, 'Review changed its original practice snapshot');
    assert(await page.locator('#quiz a[href$="/case-study/"]').count() === 1, 'Completed practice must continue to the case study');
    assert(!/examen|práctica oficial/.test(await page.locator('#quiz').textContent()), 'Workshop offers an exam follow-up');
    await page.locator('#quiz a[href$="/case-study/"]').click();
    await page.waitForURL(`${route}case-study/`);
    await page.goto(`${route}practice/`);
    await page.locator('[data-reset]').click();
    assert(await page.locator('[data-start]').isVisible(), 'Reset did not return to practice intro');
    assert(await page.locator('[data-progress-label]').textContent() === '1 de 12', 'Reset deleted reading progress');
    assert(await page.evaluate(key => localStorage.getItem(key), otherQuiz) === 'other-course-sentinel', 'Quiz storage crossed courses');
    assert(await page.evaluate(key => localStorage.getItem(key), otherProgress) === '["agents"]', 'Reading progress crossed courses');
    assert(!errors.length, errors.join('; '));
    return { pages: slugs.length, widths, headerWidths: [1100, 1201, 1299], diagrams, scrollableTables, practice: '16/22', review: '6/6', isolatedCourseStorage: true, pageErrors: errors.length, screenshots: 0 };
  } finally {
    await page.evaluate(entries => entries.forEach(([key, value]) => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value)), previousStorage);
    page.off('pageerror', onError);
    await page.goto(`${route}overview/`);
  }
}

// Run using: playwright-cli -s=certitips run-code --filename scripts/browser-smoke.cjs
// Uses an isolated CLI browser and its current origin; never takes screenshots.
async (page) => {
  const origin = await page.evaluate(() => location.origin);
  const base = `${origin}/certi-tips/`;
  const course = '1Z0-1157-26';
  const courseId = 'agentic-ai-foundations-2026';
  const quizKey = `certitips:quiz:v1:${courseId}`;
  const progressKey = `certitips:progress:v1:${courseId}`;
  await page.evaluate(keys => keys.forEach(key => localStorage.removeItem(key)), [quizKey, `${quizKey}:last-practice`, progressKey]);
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const checks = [];
  const errors = [];
  const pageError = error => errors.push(error.message);
  page.on('pageerror', pageError);
  const slugs = ['overview', 'agents', 'langchain', 'mcp', 'openai', 'oci-enterprise', 'oracle-database', 'glossary', 'exam-checklist', 'practice'];
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const slug of ['', ...slugs]) {
      const response = await page.goto(`${base}${slug ? `${course}/${slug}/` : ''}`);
      assert(response.status() === 200, `HTTP failure: ${slug}`);
      await page.locator('.prose img').evaluateAll(images => Promise.all(images.map(image => { image.loading = 'eager'; return image.decode(); })));
      const geometry = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, h1: document.querySelectorAll('h1').length }));
      assert(geometry.document <= geometry.viewport + 1, `Horizontal overflow at ${width}: ${slug} (${geometry.document})`);
      assert(geometry.h1 === 1, `Missing/duplicate h1: ${slug}`);
      const solutionsAligned = await page.evaluate(() => {
        const diagram = document.querySelector('.prose > p > .diagram')?.getBoundingClientRect();
        return !diagram || [...document.querySelectorAll('.prose > details')].every(solution => {
          const box = solution.getBoundingClientRect();
          return Math.abs(box.left - diagram.left) < 1 && Math.abs(box.right - diagram.right) < 1;
        });
      });
      assert(solutionsAligned, `Solution panels exceed the diagram column at ${width}px: ${slug}`);
      if (!slug) {
        const controls = await page.evaluate(() => {
          const nav = document.querySelector('.path-section.is-active > .group-carousel-controls').getBoundingClientRect();
          const section = document.querySelector('.path-section.is-active').getBoundingClientRect();
          const heading = document.querySelector('.path-section.is-active .path-section-heading');
          const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
          const textBoxes = [];
          while (walker.nextNode()) {
            if (!walker.currentNode.textContent.trim()) continue;
            const range = document.createRange(); range.selectNodeContents(walker.currentNode);
            textBoxes.push(...range.getClientRects());
          }
          return nav.right <= section.right + 1 && nav.top >= section.top && textBoxes.every(box => nav.left >= box.right || nav.right <= box.left || nav.bottom <= box.top || nav.top >= box.bottom);
        });
        assert(controls, `Group controls overlap or escape active section at ${width}px`);
      }
      assert(await page.locator('main .contents').count() === 0, 'Duplicate in-page contents remains');
      assert(await page.locator('.nav-overview').count() === 0, 'Redundant Ver recurso link remains in the sidebar');
      if (slug === 'practice') assert(await page.locator('.nav-direct[aria-current="page"][href$="/practice/"]').count() === 1, 'Practice entry is not direct and active');
      else if (slug) assert(await page.locator(`.nav-branch[data-nav-page="${slug}"][open]`).count() === 1, `Active tree branch closed: ${slug}`);
      await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      if (await page.locator('[data-mark-complete]').count()) await page.locator('[data-mark-complete]').waitFor({ state: 'visible' });
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
    checks.push(`${width}px: 11 pages, no overflow, full-width table rows, fixed footer without content overlap`);
  }
  await page.goto(`${base}${course}/agents/`);
  const menu = page.getByRole('button', { name: 'Contenido del curso', exact: true });
  await menu.click();
  assert(await menu.getAttribute('aria-expanded') === 'true', 'Mobile menu did not open');
  const sidebarState = await page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar');
    const nav = sidebar.querySelector(':scope > nav');
    const heading = sidebar.querySelector('.sidebar-heading');
    const progress = sidebar.querySelector('.course-progress');
    const before = [heading.getBoundingClientRect().top, progress.getBoundingClientRect().top];
    nav.scrollTop = nav.scrollHeight;
    return { tagFirst: heading.firstElementChild.classList.contains('exam-code'), title: heading.querySelector('strong').textContent,
      navScrollable: nav.scrollHeight > nav.clientHeight && nav.scrollTop > 0, sidebarFixed: sidebar.scrollTop === 0,
      headingFixed: before[0] === heading.getBoundingClientRect().top && before[1] === progress.getBoundingClientRect().top };
  });
  assert(sidebarState.tagFirst && sidebarState.title === 'Oracle Agentic AI Foundations Associate', 'Sidebar title or exam tag order is wrong');
  assert(sidebarState.navScrollable && sidebarState.sidebarFixed && sidebarState.headingFixed, 'Only the sidebar navigation should scroll');
  await page.keyboard.press('Escape');
  assert(await menu.getAttribute('aria-expanded') === 'false', 'Escape did not close mobile menu');
  await menu.click();
  await page.locator('.sidebar a.nav-link[href$="/langchain/"]').click();
  await page.waitForURL(`${base}${course}/langchain/`);
  assert(await menu.getAttribute('aria-expanded') === 'false', 'Module navigation did not close mobile menu');
  await menu.click();
  const mcpBranch = page.locator('[data-nav-page="mcp"]');
  await mcpBranch.locator('summary').waitFor({ state: 'visible' });
  await mcpBranch.locator('summary').focus();
  await page.keyboard.press('Enter');
  assert(await mcpBranch.evaluate(branch => branch.open), 'Keyboard did not expand the module tree');
  await mcpBranch.locator('a[href$="#conceptos-clave"]').click();
  await page.waitForURL(`${base}${course}/mcp/#conceptos-clave`);
  assert(await menu.getAttribute('aria-expanded') === 'false', 'Section navigation did not close mobile menu');
  const routeMenu = page.locator('.path-nav-mobile');
  await routeMenu.locator(':scope > summary').click();
  assert(await routeMenu.evaluate(element => element.open), 'Certification groups did not open on mobile');
  const dataGroup = routeMenu.locator('.path-group').nth(2);
  await dataGroup.locator('summary').click();
  assert(await dataGroup.evaluate(element => element.open), 'Group dropdown did not expand');
  const pendingMobile = dataGroup.locator('.path-group-panel a').filter({ hasText: 'Oracle AI Vector Search Professional' });
  assert((await pendingMobile.getAttribute('href')).startsWith('https://mylearn.oracle.com/'), 'Mobile pending certification does not open Oracle');
  const foundationGroup = routeMenu.locator('.path-group').first();
  await foundationGroup.locator('summary').click();
  await foundationGroup.locator('.path-group-panel a[href$="/1Z0-1157-26/overview/"]').click();
  await page.waitForURL(`${base}${course}/overview/`);
  checks.push('left module tree and nested certification group dropdowns, keyboard and mobile');
  await page.setViewportSize({ width: 1280, height: 900 });
  let visualCount = 0;
  for (const slug of slugs.slice(0, 7)) {
    await page.goto(`${base}${course}/${slug}/`);
    for (const summary of await page.locator('.prose details:not([open]) > summary').all()) await summary.click();
    const diagrams = page.locator('[data-diagram]');
    if (slug !== 'overview') assert(await diagrams.count() >= await page.locator('.prose h2').count(), `Missing section diagrams: ${slug}`);
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
  checks.push(`all ${visualCount} diagrams and solution images, modal keyboard containment and focus return`);
  await page.goto(`${base}${course}/langchain/`);
  assert(await page.locator('.page-heading .eyebrow').count() === 0, 'Lesson heading repeats the module or reading time');
  assert(await page.locator('[data-mark-complete]').isHidden(), 'Completion button appears before the article ends');
  await page.locator('.prose img').evaluateAll(images => Promise.all(images.map(image => { image.loading = 'eager'; return image.decode(); })));
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await page.waitForFunction(() => !document.querySelector('[data-mark-complete]').hidden);
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  const completionPosition = await page.evaluate(() => {
    const button = document.querySelector('[data-mark-complete]').getBoundingClientRect();
    const footer = document.querySelector('.site-footer').getBoundingClientRect();
    const pager = document.querySelector('.page-navigation').getBoundingClientRect();
    return { aboveFooter: button.bottom < footer.top, abovePager: button.bottom + 16 <= pager.top, alignedWithPager: Math.abs(button.right - pager.right) < 1, footerGap: footer.top - pager.bottom };
  });
  assert(completionPosition.aboveFooter && completionPosition.abovePager && completionPosition.alignedWithPager && completionPosition.footerGap >= 24 && completionPosition.footerGap <= 64, 'Completion button must float above the next-page link with a compact footer gap');
  await page.locator('[data-mark-complete]').click();
  await page.reload();
  assert(await page.locator('[data-mark-complete]').getAttribute('aria-pressed') === 'true', 'Progress did not persist');
  checks.push('lesson completion appears only at article end, clears pager/footer and survives reload');
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
  await page.goto(`${base}${courseId}/talk/`);
  await page.waitForURL(`${base}${course}/overview/`);
  assert(await page.locator('[data-talk-mode], a[href$="/talk/"]').count() === 0, 'Separate talk mode remains');
  await page.goto(base);
  const homeText = await page.locator('body').innerText();
  const certificationNames = await page.locator('.certification-item h3, .path-title, [data-search-kind="certification"] strong').allTextContents();
  assert(certificationNames.every(name => !/\b20\d{2}\b|Essentials/.test(name)), 'Outdated certification names remain on home, menus or search');
  assert(await page.locator('#ai-data-platform-essentials').count() === 0, 'Essentials remains in the certification catalog');
  const platform = page.locator('#ai-data-layer #ai-data-platform-professional');
  assert(await platform.locator('.certification-level').textContent() === 'Nivel 3', 'AI Data Platform Professional belongs in Data & AI at level 3');
  assert((await platform.textContent()).includes('1Z0-1154-26'), 'AI Data Platform exam code is missing');
  await page.setViewportSize({ width: 1280, height: 900 });
  const desktopHero = await page.evaluate(() => ({ copy: document.querySelector('.hero-copy').getBoundingClientRect().toJSON(), flow: document.querySelector('.hero-flow').getBoundingClientRect().toJSON() }));
  assert(desktopHero.copy.right < desktopHero.flow.left && desktopHero.flow.width > 350, 'Hero is not split into two readable columns');
  await page.setViewportSize({ width: 390, height: 900 });
  assert(await page.locator('.hero-flow').isHidden(), 'Hero flow should remain hidden on mobile');
  assert(await page.locator('[data-hero-flow]').count() === 1, 'Animated certification path is missing');
  await page.locator('[data-hero-flow]').evaluate(video => new Promise((resolve, reject) => {
    if (video.readyState >= 1) return resolve();
    video.addEventListener('loadedmetadata', resolve, { once: true });
    video.addEventListener('error', reject, { once: true });
  }));
  assert(await page.locator('[data-hero-flow]').evaluate(video => video.duration >= 11 && video.videoWidth === 1920 && video.videoHeight === 1080), 'Animated path has wrong duration or dimensions');
  assert(await page.locator('[data-hero-flow]').evaluate(video => video.loop), 'Animated path does not loop');
  assert(!await page.locator('.hero-flow').evaluate(element => element.classList.contains('is-unavailable')), 'Animated path fell back to static text');
  const palette = await page.evaluate(() => {
    const style = selector => getComputedStyle(document.querySelector(selector));
    return { oracleIcon: style('.home-hero .oracle-badge svg').color, github: style('.github-link').color,
      githubBackground: style('.github-link').backgroundColor,
      githubIcon: style('.github-link svg').color,
      level: style('.certification-level').color,
      guide: style('#agentic-ai-foundations-2026 .certitips-button').color,
      guideIcon: style('#agentic-ai-foundations-2026 .certitips-button svg').color,
      body: style('body').backgroundColor, header: style('.site-header').backgroundColor,
      footer: style('.site-footer').backgroundColor,
      toggleText: document.querySelector('[data-theme-toggle]').textContent.trim() };
  });
  assert(palette.oracleIcon === 'rgb(199, 70, 52)' && palette.level === 'rgb(199, 70, 52)', 'Oracle corporate red is not applied to the badge and levels');
  assert(palette.github === 'rgb(255, 255, 255)' && palette.githubIcon === palette.github && palette.githubBackground === 'rgb(199, 70, 52)' && await page.getByRole('link', { name: 'GitHub', exact: true }).count() === 1, 'GitHub button needs red background, white icon and concise label');
  assert(palette.guide === 'rgb(255, 255, 255)' && palette.guideIcon === palette.guide, 'Red guide button needs white text and icon');
  assert(palette.header === 'rgb(241, 239, 237)' && palette.footer === palette.header && palette.body !== palette.header, 'Header and footer are not differentiated by neutral gray');
  assert(palette.toggleText === '' && await page.locator('[data-theme-toggle]').getAttribute('aria-label') === 'Activar modo oscuro', 'Theme toggle should be icon-only and labelled for assistive technology');
  assert(await page.locator('[data-hero-replay]').count() === 0, 'Replay control should not be shown');
  assert(await page.locator('.path-section.is-active > .group-carousel-controls').count() === 1, 'Group controls must sit inside the active section');
  await page.setViewportSize({ width: 1280, height: 900 });
  assert(await page.locator('.path-section').count() === 4, 'Expected Foundation Sprint and three specializations');
  assert(await page.locator('.certification-item').count() === 11, 'Missing or duplicated FY27 certifications');
  assert(await page.locator('.certification-item.has-guide').count() === 2, 'Expected two available guides');
  assert(await page.locator('.certification-actions a[href^="https://mylearn.oracle.com/"]').count() === 11, 'Every certification needs an Oracle source');
  assert(await page.locator('.path-nav .path-group').count() === 4, 'Header does not expose all groups');
  assert(await page.locator('.certitips-button:not([disabled])').count() === 2, 'Available CertiTips guide button is missing');
  assert(await page.locator('.certitips-button[disabled]').count() === 9, 'Pending guides need disabled gray buttons');
  assert(await page.locator('.certitips-button svg[fill="currentColor"]').count() === 11, 'CertiTips icon is missing');
  assert(await page.locator('.path-section.is-active').count() === 1, 'Exactly one group should be visible');
  assert(await page.locator('#foundation-sprint .certification-item:visible').count() === 3, 'Foundation certifications are not a vertical list');
  await page.locator('[data-group-next]').click();
  assert(await page.locator('#ai-first').isVisible(), 'Group carousel did not advance');
  assert(await page.locator('#ai-first > .group-carousel-controls').count() === 1, 'Controls did not move into the next section');
  assert(!await page.locator('#foundation-sprint').isVisible(), 'Previous group remains visible');
  assert(await page.locator('#ai-first .certification-item:visible').count() === 3, 'Group list has missing items');
  await page.locator('[data-group-prev]').click();
  assert(await page.locator('#foundation-sprint').isVisible(), 'Group carousel did not return');
  assert(await page.locator('#foundation-sprint > .group-carousel-controls').count() === 1, 'Controls did not return to Foundation Sprint');
  const headerGroup = page.locator('.path-nav .path-group').first();
  const nextHeaderGroup = page.locator('.path-nav .path-group').nth(1);
  await headerGroup.hover();
  assert(await headerGroup.evaluate(element => element.open), 'Desktop group dropdown did not open on pointer entry');
  await nextHeaderGroup.hover();
  assert(await nextHeaderGroup.evaluate(element => element.open) && !await headerGroup.evaluate(element => element.open), 'Desktop category change did not show only the new dropdown');
  await headerGroup.hover();
  const pendingMenu = headerGroup.locator('.path-group-panel a').first();
  assert((await pendingMenu.getAttribute('href')).startsWith('https://mylearn.oracle.com/'), 'Pending certification does not open its official route');
  assert(await pendingMenu.getAttribute('target') === '_blank', 'Official route should open in a new tab');
  await pendingMenu.hover();
  assert(await headerGroup.evaluate(element => element.open), 'Desktop dropdown closed before its item could be selected');
  assert(await pendingMenu.locator('.coming-soon').isVisible(), 'Pending certification badge is missing on hover');
  const pendingStyle = await pendingMenu.evaluate(link => {
    const badge = getComputedStyle(link.querySelector('.coming-soon'));
    const row = getComputedStyle(link);
    return { background: row.backgroundColor, color: row.color, badgeBackground: badge.backgroundColor, badgeColor: badge.color, badgeWeight: badge.fontWeight };
  });
  assert(pendingStyle.background === 'rgb(240, 242, 246)' && pendingStyle.color === 'rgb(96, 101, 116)', 'Pending certification hover must be gray, not red');
  assert(pendingStyle.badgeBackground === 'rgb(241, 177, 63)' && pendingStyle.badgeColor === 'rgb(91, 56, 0)' && pendingStyle.badgeWeight === '400', 'Coming soon badge needs regular dark-yellow text');
  const activeMenu = headerGroup.locator('.path-group-panel a[href$="/1Z0-1157-26/overview/"]');
  assert(await activeMenu.count() === 1, 'Available certification does not link directly to its guide');
  await activeMenu.click();
  await page.waitForURL(`${base}${course}/overview/`);
  await page.goto(base);
  await page.locator('.path-nav .path-group').first().locator('summary').click();
  await page.keyboard.press('Escape');
  assert(!await page.locator('.path-nav .path-group').first().evaluate(element => element.open), 'Escape did not close group dropdown');
  await page.evaluate(() => localStorage.setItem('certitips:theme', 'light'));
  await page.reload();
  const lightBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.locator('[data-theme-toggle]').click();
  assert(await page.locator('[data-theme-toggle]').getAttribute('aria-pressed') === 'true', 'Dark toggle did not activate');
  assert(await page.evaluate(() => getComputedStyle(document.body).backgroundColor) !== lightBackground, 'Dark palette did not apply');
  assert(await page.locator('.github-link').evaluate(button => getComputedStyle(button).color === 'rgb(255, 255, 255)' && getComputedStyle(button).backgroundColor === 'rgb(199, 70, 52)'), 'Dark mode lost the GitHub button contrast');
  await page.locator('[data-search-open]').click();
  assert(await page.locator('#site-search').evaluate(dialog => getComputedStyle(dialog).backgroundColor === 'rgb(38, 39, 48)'), 'Search dialog did not adopt the dark surface');
  await page.keyboard.press('Escape');
  await page.reload();
  assert(await page.locator('[data-theme-toggle]').getAttribute('aria-pressed') === 'true', 'Dark mode did not persist');
  await page.locator('[data-theme-toggle]').click();
  assert(await page.evaluate(() => getComputedStyle(document.body).backgroundColor) === lightBackground, 'Light palette did not return');
  await page.evaluate(() => localStorage.removeItem('certitips:theme'));
  await page.locator('[data-search-open]').click();
  assert(await page.locator('#site-search').evaluate(dialog => dialog.open), 'Search did not open');
  assert(await page.locator('[data-search-kind="certification"]:visible').count() === 11, 'Search did not list all certifications by default');
  assert(await page.locator('[data-search-kind="topic"]:visible').count() === 0, 'Topics should appear only when searching');
  assert(await page.locator('.search-results').evaluate(list => list.scrollHeight > list.clientHeight), 'Default certification list should scroll inside the dialog');
  await page.setViewportSize({ width: 320, height: 640 });
  assert(await page.locator('#site-search').evaluate(dialog => {
    const box = dialog.getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
  }), 'Search dialog overflows a small phone');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#search-query').press('ArrowDown');
  assert(await page.locator('[data-search-kind="certification"] a').first().evaluate(link => document.activeElement === link), 'ArrowDown did not focus the first certification');
  await page.keyboard.press('ArrowUp');
  assert(await page.locator('#search-query').evaluate(input => document.activeElement === input), 'ArrowUp did not return focus to search');
  await page.locator('#search-query').fill('vector');
  assert(await page.locator('[data-search-kind="certification"]:visible').count() > 0, 'Search did not find vector certifications');
  assert(await page.locator('[data-search-kind="topic"]:visible').count() > 0, 'Search did not find vector study topics');
  assert(await page.locator('.search-result-description:visible').count() > 0, 'Filtered results do not explain their match');
  await page.locator('[data-search-close]').click();
  assert(await page.locator('#search-query').inputValue() === '', 'Clear search did not clear the query');
  assert(await page.locator('[data-search-kind="certification"]:visible').count() === 11, 'Clearing search did not restore certifications');
  await page.locator('[data-search-close]').click();
  assert(!await page.locator('#site-search').evaluate(dialog => dialog.open), 'Close button did not close an empty search');
  await page.keyboard.press('Control+k');
  await page.locator('#search-query').fill('zzzz-no-such-certification');
  assert(await page.locator('[data-search-empty]').isVisible(), 'Search did not show a helpful empty state');
  await page.keyboard.press('Escape');
  assert(!await page.locator('#site-search').evaluate(dialog => dialog.open), 'Escape did not close search');
  await page.keyboard.press('Control+k');
  assert(await page.locator('#site-search').evaluate(dialog => dialog.open), 'Ctrl+K did not open search');
  assert(await page.locator('[data-search-kind="certification"]:visible').count() === 11, 'Reopening search did not restore default certifications');
  await page.locator('#search-query').fill('Oracle AI Vector Search Professional');
  const pendingSearch = page.locator('.search-results li:visible a').first();
  assert((await pendingSearch.getAttribute('href')).startsWith('https://mylearn.oracle.com/'), 'Search sends pending certification to home instead of Oracle');
  await page.locator('#search-query').fill('1Z0-1154-26');
  const platformSearch = page.locator('[data-search-kind="certification"]:visible');
  assert(await platformSearch.count() === 1 && (await platformSearch.textContent()).includes('Oracle AI Data Platform Professional'), 'Search by exam code does not find AI Data Platform Professional');
  assert((await platformSearch.locator('a').getAttribute('href')).endsWith('/become-an-oracle-ai-data-platform-professional/164914'), 'AI Data Platform search result uses the wrong official route');
  await page.locator('#search-query').fill('Oracle Agentic AI Foundations Associate');
  await page.locator('.search-results li:visible a').first().click();
  await page.waitForURL(`${base}${course}/overview/`);
  for (const removed of ['TU PRÓXIMA CERTIFICACIÓN EMPIEZA AQUÍ', 'EN ESPAÑOL', 'ACCESO LIBRE', 'SIN REGISTRO', '¿Vas a dar una charla?', '90 minutos']) assert(!homeText.includes(removed), `Removed text remains: ${removed}`);
  assert(await page.locator('.hero-visual, .approach-grid, .hero-proof, .course-metrics').count() === 0, 'Removed home panel remains');
  checks.push('11 Oracle routes, two active and nine pending guides, four-group carousel, search, dropdowns, dark-mode persistence');

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

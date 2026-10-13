// Run using: playwright-cli -s=certitips run-code --filename scripts/browser-smoke.cjs
// Uses an isolated CLI browser and its current origin; never takes screenshots.
async (page) => {
  const origin = await page.evaluate(() => location.origin);
  const base = `${origin}/certitips/`;
  const course = '1Z0-1157-26';
  const courseId = 'agentic-ai-foundations-2026';
  const quizKey = `certitips:quiz:v1:${courseId}`;
  const progressKey = `certitips:progress:v1:${courseId}`;
  const practiceCourse = course;
  const practiceQuizKey = quizKey;
  const practiceProgressKey = progressKey;
  await page.evaluate(keys => keys.forEach(key => localStorage.removeItem(key)), [quizKey, `${quizKey}:last-practice`, progressKey, practiceQuizKey, `${practiceQuizKey}:last-practice`, practiceProgressKey]);
  await page.evaluate(() => sessionStorage.removeItem('certitips:course-nav:compact'));
  await page.evaluate(() => document.querySelector('[data-chat-close]')?.click());
  await page.locator('#certichat-panel').waitFor({ state: 'hidden' });
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const checks = [];
  const errors = [];
  const pageError = error => errors.push(error.message);
  page.on('pageerror', pageError);
  const slugs = ['overview', 'agents', 'langchain', 'mcp', 'openai', 'oci-enterprise', 'oracle-database', 'glossary', 'exam-checklist'];
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
      if (slug) assert(await page.locator(`.nav-branch[data-nav-page="${slug}"][open]`).count() === 1, `Active tree branch closed: ${slug}`);
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
    checks.push(`${width}px: 10 pages, no overflow, full-width table rows, fixed footer without content overlap`);
  }
  for (const width of [1098, 1101, 1200]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}CDMP-DMF/overview/`);
    assert(await page.evaluate(() => {
      document.body.classList.remove('is-compact-nav');
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const article = box('.prose'), pager = box('.page-navigation');
      const groups = box('.path-nav-mobile > summary'), menu = box('.menu-toggle'), search = box('.search-toggle');
      const theme = box('.theme-toggle'), chat = box('.certichat-launcher');
      return Math.abs(theme.right - article.right) <= 1 && Math.abs(chat.right - article.right) <= 1 &&
        Math.abs(pager.right - article.right) <= 1 &&
        groups.right < menu.left && menu.right < search.left && search.right < theme.left &&
        menu.left - groups.right <= 14 && search.left - menu.right <= 14 && theme.left - search.right <= 14 &&
        document.documentElement.scrollWidth <= innerWidth + 1;
    }), `Course header controls or CertiChat miss the article edge at ${width}px`);
  }
  checks.push('intermediate course widths: header controls and CertiChat align with the article edge');
  for (const [width, compact, labelVisible] of [
    [1556, false, true], [1556, true, true], [1314, false, false],
    [1314, true, true], [1200, true, false], [1171, true, false], [1170, true, false]
  ]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}CDMP-DMF/overview/`);
    await page.evaluate(compact => document.body.classList.toggle('is-compact-nav', compact), compact);
    await page.waitForFunction(expected => Math.abs(document.querySelector('.course-main').getBoundingClientRect().left - expected) < 1,
      compact ? 64 : 272);
    assert(await page.evaluate(labelVisible => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const launcher = box('.certichat-launcher'), article = box('.prose');
      const visible = getComputedStyle(document.querySelector('.certichat-launcher > span')).clipPath === 'none';
      const nav = box(document.body.classList.contains('is-compact-nav')
        ? (innerWidth <= 1200 ? '.path-nav-mobile > summary' : '.path-nav') : '.menu-toggle');
      const search = box('.search-toggle'), theme = box('.theme-toggle');
      return visible === labelVisible && (!visible || launcher.left - article.right >= 20) &&
        search.left - nav.right >= 11 && search.left - nav.right <= 13 &&
        theme.left - search.right >= 11 && theme.left - search.right <= 13;
    }, labelVisible), `CertiChat label or header spacing is wrong at ${width}px (${compact ? 'compact' : 'expanded'})`);
  }
  checks.push('CertiChat keeps its label until it nears content in each course sidebar state');
  for (const [width, compact] of [[1142, false], [1050, true], [802, false], [800, false], [779, false], [481, false], [480, false], [464, false], [320, false]]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}CDMP-DMF/overview/`);
    await page.evaluate(compact => document.body.classList.toggle('is-compact-nav', compact), compact);
    if (compact) await page.waitForFunction(() => Math.abs(document.querySelector('.course-main').getBoundingClientRect().left - 64) < 1);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    assert(await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const nav = box('.page-navigation'), next = box('.page-navigation a:last-child');
      const chat = box('.certichat-launcher'), footer = box('.site-footer');
      const before = next.top - nav.top, after = chat.top - next.bottom;
      const lowerGap = innerWidth <= 800 ? 30 : before;
      return after >= 20 && Math.abs(lowerGap - after) <= 2 && chat.bottom < footer.top &&
        (innerWidth > 800 || Math.abs(lowerGap - (footer.top - chat.bottom)) <= 1) &&
        document.documentElement.scrollHeight - scrollY <= innerHeight + 1;
    }), `CertiChat must follow the next-page link with balanced lower spacing at ${width}px`);
  }
  checks.push('at narrow widths, scrolling to the end places CertiChat below the next-page link');
  for (const width of [802, 800, 779, 481, 480, 464]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}CDMP-DMF/overview/`);
    assert(await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const size = innerWidth <= 480 ? 31 : 44;
      const selectors = ['.path-nav-mobile > summary', '.menu-toggle', '.search-toggle', '.theme-toggle'];
      const controls = selectors.map(box), chat = box('.certichat-launcher'), pager = box('.page-navigation');
      const iconsFit = innerWidth > 480 || [...selectors.map(selector => `${selector} svg`), '.certichat-launcher > svg']
        .map(box).every(icon => Math.abs(icon.width - 17) <= 1 && Math.abs(icon.height - 17) <= 1);
      return controls.every((control, index) => Math.abs(control.width - (innerWidth > 800 && index === 2 ? 184 : size)) <= 1 && Math.abs(control.height - size) <= 1) &&
        controls.every((control, index) => !index || controls[index - 1].right < control.left) &&
        iconsFit &&
        Math.abs(chat.width - (innerWidth > 800 ? 48 : size)) <= 1 &&
        Math.abs(chat.height - (innerWidth > 800 ? 48 : size)) <= 1 &&
        Math.abs(controls.at(-1).right - pager.right) <= 1 && Math.abs(chat.right - pager.right) <= 1 &&
        document.documentElement.scrollWidth <= innerWidth + 1;
    }), `Header or CertiChat changes size too early or loses its square at ${width}px`);
  }
  checks.push('header and CertiChat stay square across the tablet-to-mobile breakpoint');
  for (const width of [464, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}${course}/overview/`);
    assert(await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const logo = box('.brand img'), pager = box('.page-navigation'), chat = box('[data-chat-open]');
      const controls = ['.path-nav-mobile > summary', '.menu-toggle', '.search-toggle', '.theme-toggle'].map(box);
      return controls.every(control => control.width <= logo.width + 1) && chat.width <= logo.width + 1 &&
        Math.abs(controls.at(-1).right - pager.right) <= 1 && Math.abs(chat.right - pager.right) <= 1 &&
        controls.every((control, index) => !index || controls[index - 1].right < control.left) &&
        document.documentElement.scrollWidth <= innerWidth + 1;
    }), `Mobile header or CertiChat exceeds the logo or misses the content edge at ${width}px`);
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
    return { tagFirst: heading.querySelector('.exam-code').nextElementSibling.matches('strong'), title: heading.querySelector('strong').textContent,
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
  assert(await mcpBranch.evaluate(branch => {
    const number = branch.previousElementSibling.querySelector('.nav-number').getBoundingClientRect();
    const line = branch.querySelector('.nav-sections').getBoundingClientRect();
    return Math.abs((number.left + number.right) / 2 - line.left) <= 1;
  }), 'Section guide is not aligned with the module number');
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
  const compactToggle = page.locator('.menu-toggle');
  await compactToggle.click();
  await page.waitForFunction(() => {
    const sidebar = document.querySelector('.sidebar').getBoundingClientRect();
    const toggleElement = document.querySelector('.menu-toggle');
    const toggle = toggleElement.getBoundingClientRect();
    const firstLink = document.querySelector('.sidebar .nav-link').getBoundingClientRect();
    return Math.abs(sidebar.width - 64) < 1 && Math.abs(document.querySelector('.course-main').getBoundingClientRect().left - 64) < 1 &&
      Math.abs(toggle.left - firstLink.left) <= 1 && Math.abs(toggle.width - firstLink.width) <= 1 &&
      Math.abs(firstLink.top - toggle.bottom - 8) <= 1;
  });
  assert(await compactToggle.getAttribute('aria-expanded') === 'false' && await page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar'), main = document.querySelector('.course-main');
    const toggleElement = document.querySelector('.menu-toggle');
    const toggle = toggleElement.getBoundingClientRect();
    const firstLink = sidebar.querySelector('.nav-link').getBoundingClientRect();
    const search = document.querySelector('.search-toggle').getBoundingClientRect();
    const motion = getComputedStyle(sidebar);
    return document.body.classList.contains('is-compact-nav') && toggleElement.parentElement === sidebar && document.activeElement === toggleElement &&
      Math.abs(sidebar.getBoundingClientRect().width - 64) < 1 &&
      Math.abs(main.getBoundingClientRect().left - 64) < 1 && getComputedStyle(sidebar.querySelector('.nav-title')).clipPath === 'inset(50%)' &&
      getComputedStyle(sidebar.querySelector('.nav-tree:last-child')).display === 'none' &&
      !sidebar.querySelector('.sidebar-compact-toggle') &&
      Math.abs(toggle.left - firstLink.left) <= 1 && Math.abs(toggle.width - firstLink.width) <= 1 &&
      toggle.top >= sidebar.getBoundingClientRect().top && Math.abs(firstLink.top - toggle.bottom - 8) <= 1 && toggle.right < search.left &&
      (matchMedia('(prefers-reduced-motion: reduce)').matches || motion.transitionProperty.includes('width') && parseFloat(motion.transitionDuration) > 0);
  }), 'Compact course navigation did not leave a numbered rail or expand reading space');
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (!document.querySelector('.sidebar')) return;
      window.__courseNavCompactAtParse = document.body.classList.contains('is-compact-nav');
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.locator('.sidebar a.nav-link[href$="/agents/"]').click();
  await page.waitForURL(`${base}${course}/agents/`);
  assert(await page.evaluate(() => window.__courseNavCompactAtParse === true), 'Compact course navigation expanded before the next lesson rendered');
  assert(await page.locator('body').evaluate(body => body.classList.contains('is-compact-nav')), 'Compact course navigation did not persist between lessons');
  await page.locator('.menu-toggle').click();
  assert(await page.locator('.menu-toggle').getAttribute('aria-expanded') === 'true', 'Course navigation did not expand again');
  for (const width of [1280, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction(expected => Math.abs(document.querySelector('.sidebar').getBoundingClientRect().width - expected) < 1,
      width <= 1100 ? 240 : 272);
    assert(await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const groups = box(innerWidth <= 1200 ? '.path-nav-mobile > summary' : '.path-nav');
      const toggle = box('.menu-toggle'), search = box('.search-toggle');
      return groups.right < toggle.left && toggle.right < search.left &&
        Math.abs(search.left - toggle.right - 12) <= 1 &&
        document.querySelector('.menu-toggle').parentElement === document.querySelector('.site-header') &&
        !document.querySelector('.sidebar-compact-toggle');
    }), `Course toggle misses its header position at ${width}px`);
  }
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
      assert(await page.locator('#diagram-viewer').evaluate(dialog => dialog.getAnimations().length > 0), 'Diagram did not animate from its thumbnail');
      await page.keyboard.press('Tab');
      assert(await page.evaluate(() => document.querySelector('#diagram-viewer').contains(document.activeElement)), 'Focus escaped modal');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#diagram-viewer').open);
      assert(await button.evaluate(element => document.activeElement === element), 'Diagram did not restore focus');
    }
  }
  checks.push(`all ${visualCount} diagrams and solution images, modal keyboard containment and focus return`);
  await page.goto(`${base}${course}/langchain/`);
  assert(await page.locator('.page-heading .eyebrow').count() === 0, 'Lesson heading repeats the module or reading time');
  assert(await page.locator('[data-mark-complete]').evaluate(button => {
    const article = button.previousElementSibling.getBoundingClientRect();
    const box = button.getBoundingClientRect();
    return getComputedStyle(button).position === 'static' && box.top >= article.bottom + 20;
  }), 'Completion button must follow the article in document flow');
  await page.locator('.prose img').evaluateAll(images => Promise.all(images.map(image => { image.loading = 'eager'; return image.decode(); })));
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  const completionPosition = await page.evaluate(() => {
    const button = document.querySelector('[data-mark-complete]').getBoundingClientRect();
    const footer = document.querySelector('.site-footer').getBoundingClientRect();
    const pager = document.querySelector('.page-navigation').getBoundingClientRect();
    return { aboveFooter: button.bottom < footer.top, abovePager: button.bottom + 16 <= pager.top, alignedWithPager: Math.abs(button.right - pager.right) < 1, footerGap: footer.top - pager.bottom };
  });
  assert(completionPosition.aboveFooter && completionPosition.abovePager && completionPosition.alignedWithPager && completionPosition.footerGap >= 14 && completionPosition.footerGap <= 18, 'Completion button must float above the next-page link with the pager aligned to CertiChat');
  await page.locator('[data-mark-complete]').click();
  await page.reload();
  assert(await page.locator('[data-mark-complete]').getAttribute('role') === 'switch' && await page.locator('[data-mark-complete]').getAttribute('aria-checked') === 'true', 'Completion switch did not persist');
  assert(await page.locator('[data-completion-label]').textContent() === 'Completado · Desmarcar', 'Completed button did not restore its original action label');
  assert(await page.locator('[data-mark-complete]').evaluate(button => {
    const style = getComputedStyle(button);
    return style.borderRadius === '30px' && style.backgroundColor === getComputedStyle(document.querySelector('.brand-accent')).color;
  }), 'Completion button lost its rounded shape or selected red background');
  checks.push('lesson completion follows article, clears pager/footer and survives reload');
  assert(await page.locator('a[href$="/1Z0-1157-26/practice/"]').count() > 0, 'Agentic course is missing its practice entry');
  assert((await page.request.get(`${base}${course}/practice/`)).status() === 200, 'Agentic practice route is missing');
  await page.goto(`${base}${practiceCourse}/practice/`);
  await page.evaluate(({ quizKey, progressKey }) => {
    localStorage.removeItem(quizKey);
    localStorage.removeItem(`${quizKey}:last-practice`);
    localStorage.setItem(progressKey, JSON.stringify(['overview']));
  }, { quizKey: practiceQuizKey, progressKey: practiceProgressKey });
  await page.reload();
  assert(await page.locator('.nav-direct[aria-current="page"][href$="/practice/"]').count() === 1, 'Practice entry is not direct and active');
  const intro = await page.locator('.quiz-intro').evaluate(node => {
    const heading = node.querySelector('.quiz-heading'), title = heading.querySelector('h2'), eyebrow = heading.querySelector('.eyebrow');
    const action = node.querySelector('.quiz-start-action');
    return { heading: !!document.querySelector('main .page-heading'), gap: title.getBoundingClientRect().top - eyebrow.getBoundingClientRect().bottom,
      titleSize: getComputedStyle(title).fontSize, label: eyebrow.textContent, labelColor: getComputedStyle(eyebrow).color,
      start: node.querySelector('[data-start]').textContent,
      divider: getComputedStyle(action).borderTopStyle === 'solid' && parseFloat(getComputedStyle(action).borderTopWidth) > 0,
      actionGap: node.querySelector('[data-start]').getBoundingClientRect().top - action.getBoundingClientRect().top };
  });
  assert(!intro.heading && intro.gap >= -0.01 && intro.gap <= 8 && intro.titleSize === '24px' && intro.label === 'PRÁCTICA' && intro.labelColor === 'rgb(199, 70, 52)' && intro.start === 'Comenzar' && intro.divider && intro.actionGap >= 16, `Practice intro does not match its compact heading and separated action: ${JSON.stringify(intro)}`);
  assert(await page.locator('[data-practice-intro]:not([hidden])').count() === 0, 'Practice landing must not have surrounding text');
  await page.getByRole('button', { name: 'Comenzar', exact: true }).click();
  assert(await page.locator('[data-practice-intro]:not([hidden])').count() === 0, 'Instructions repeat during questions');
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1);
    assert(await page.waitForFunction(() => {
      const options = [...document.querySelectorAll('.quiz-option')];
      const reset = document.querySelector('.quiz-reset');
      const finish = document.querySelector('[data-finish]');
      const previous = document.querySelector('[data-previous]');
      const next = document.querySelector('#question-form button[type="submit"]');
      const actions = document.querySelector('.quiz-next-action');
      const progress = document.querySelector('.quiz-meter');
      const question = document.querySelector('.quiz-question');
      const shell = document.querySelector('.quiz-shell');
      const bounds = shell.getBoundingClientRect();
      const style = getComputedStyle(shell);
      return options.length === 4 && options.every((option, index) => index === 0 || option.getBoundingClientRect().top >= options[index - 1].getBoundingClientRect().bottom)
        && document.documentElement.scrollWidth <= innerWidth + 1
        && !document.querySelector('.quiz-meta .tag')
        && reset?.getAttribute('aria-label') === 'Reiniciar' && reset.title === 'Reiniciar' && Boolean(reset.querySelector('svg'))
        && reset.getBoundingClientRect().width >= 44
        && finish?.getAttribute('aria-label') === 'Finalizar la práctica' && Boolean(finish.querySelector('svg'))
        && finish.getBoundingClientRect().width >= 44 && finish.getBoundingClientRect().height >= 44
        && finish.getBoundingClientRect().left >= reset.getBoundingClientRect().right
        && previous?.disabled && previous.textContent === 'Anterior' && previous.type === 'button'
        && next.disabled
        && getComputedStyle(actions).borderTopStyle === 'solid' && parseFloat(getComputedStyle(actions).borderTopWidth) > 0
        && Math.abs(previous.getBoundingClientRect().left - bounds.left - parseFloat(style.paddingLeft)) < 2
        && Math.abs(next.getBoundingClientRect().right - bounds.right + parseFloat(style.paddingRight)) < 2
        && Math.abs(previous.getBoundingClientRect().top - next.getBoundingClientRect().top) < 2
        && progress?.tagName === 'PROGRESS' && progress.value === 0
        && getComputedStyle(question, '::before').content.includes('1.')
        && !document.querySelector('.timer');
    }).then(handle => handle.jsonValue()), `Practice question layout, progress or reset control failed at ${width}px`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  const bankUrl = await page.evaluate(() => `${document.body.dataset.base}assets/${document.body.dataset.questionBank}.json`);
  const bank = await page.evaluate(async url => (await fetch(url)).json(), bankUrl);
  const answerCurrent = async (wrong) => {
    const text = await page.locator('.quiz-question').textContent();
    const question = bank.find(item => item.question === text);
    assert(Boolean(question), 'Question not found in published bank');
    assert(await page.locator('#question-form button[type="submit"]').isDisabled(), 'Siguiente is enabled before an answer is selected');
    const selected = wrong ? question.options.find(item => item.id !== question.correctOption).id : question.correctOption;
    await page.locator(`input[name=answer][value=${selected}]`).check();
    assert(await page.locator('#question-form button[type="submit"]').isEnabled(), 'Selecting an answer did not enable Siguiente');
    assert(await page.locator('#question-form button[type="submit"]').evaluate(button => {
      const box = button.getBoundingClientRect();
      const shell = document.querySelector('.quiz-shell');
      return button.textContent === 'Siguiente' && Math.abs(box.right - (shell.getBoundingClientRect().right - parseFloat(getComputedStyle(shell).paddingRight))) < 2;
    }), 'Unanswered question action is not Siguiente on the right');
    await page.locator('#question-form button[type="submit"]').click();
    assert(await page.locator('.quiz-question').textContent() === text, 'The first Siguiente advanced without showing the current explanation');
    assert(await page.locator('.feedback h2').textContent() === 'Explicación', 'Practice feedback needs the concise explanation heading');
    assert(await page.locator('.feedback p').textContent() === question.options.find(item => item.id === question.correctOption).explanation, 'Practice feedback differs from the correct answer explanation');
    assert(await page.locator('.feedback a, .feedback ol, .option-status, .quiz-notice').count() === 0, 'Practice feedback retained its link, option list, visible status or footer notice');
    assert(await page.locator('[data-next]').evaluate(button => {
      const feedback = document.querySelector('.feedback').getBoundingClientRect();
      const next = button.getBoundingClientRect();
      const shell = document.querySelector('.quiz-shell').getBoundingClientRect();
      return button.textContent === 'Siguiente' && !button.closest('.feedback') && next.top >= feedback.bottom && Math.abs(next.right - (shell.right - parseFloat(getComputedStyle(document.querySelector('.quiz-shell')).paddingRight))) < 2;
    }), 'Next action is not aligned at the right outside the explanation');
    assert(await page.locator('input[name=answer]:disabled').count() === 4, 'Confirmed answers must be locked');
    assert(await page.locator('#feedback-title').evaluate(element => document.activeElement === element), 'Feedback did not receive keyboard focus');
    return question;
  };
  await answerCurrent(false);
  assert(await page.evaluate(() => {
    const correct = document.querySelector('.quiz-option.is-correct');
    const progress = document.querySelector('.quiz-meter');
    return correct && getComputedStyle(correct).borderColor === getComputedStyle(correct.querySelector('.option-letter')).backgroundColor
      && progress.value === 1 && document.querySelectorAll('.quiz-option input:disabled').length === 4;
  }), 'Confirmed practice answer lost its correct styling or progress');
  const savedProgress = await page.evaluate(key => localStorage.getItem(key), practiceProgressKey);
  await page.locator('[data-reset]').click();
  const resetDialog = page.locator('[data-reset-confirm]');
  assert(await resetDialog.evaluate(node => node.matches(':modal')), 'Reset did not open a native confirmation modal');
  assert(await page.locator('#reset-confirm-title').textContent() === '¿Reiniciar la práctica?', 'Reset confirmation has the wrong question');
  assert(await page.locator('#reset-confirm-title').evaluate(node => node === document.activeElement), 'Reset confirmation did not focus its heading');
  assert(await resetDialog.locator('.confirmation-body svg').count() === 0, 'Reset confirmation still shows an icon');
  await page.keyboard.press('Tab');
  assert(await page.locator('[data-reset-no]').evaluate(node => node === document.activeElement && node.matches(':focus-visible') && getComputedStyle(node).outlineStyle !== 'none'), 'Reset confirmation lost visible keyboard focus');
  await page.locator('[data-reset-no]').click();
  const resetClosing = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
    const dialog = document.querySelector('[data-reset-confirm]');
    resolve(!CSS.supports('transition-behavior', 'allow-discrete') || Boolean(dialog && !dialog.open && dialog.getAnimations().some(animation => animation.playState === 'running')));
  })));
  assert(resetClosing, 'Reset confirmation is removed before its close transition finishes');
  await resetDialog.waitFor({ state: 'detached' });
  assert(await page.locator('.feedback').count() === 1, 'Cancelled reset discarded the response');
  await page.locator('[data-reset]').click();
  await page.keyboard.press('Escape');
  await resetDialog.waitFor({ state: 'detached' });
  assert(await page.locator('.feedback').count() === 1, 'Escape discarded the response');
  await page.locator('[data-reset]').click();
  await page.locator('[data-reset-yes]').click();
  const acceptedClosing = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
    const dialog = document.querySelector('[data-reset-confirm]');
    resolve(!CSS.supports('transition-behavior', 'allow-discrete') || Boolean(dialog && !dialog.open && dialog.getAnimations().some(animation => animation.playState === 'running')));
  })));
  assert(acceptedClosing, 'Accepted reset removes its confirmation before the close transition finishes');
  await resetDialog.waitFor({ state: 'detached' });
  assert(await page.locator('[data-start]').isVisible(), 'Reset did not return to start');
  assert(await page.locator('[data-practice-intro]:not([hidden])').count() === 0, 'Reset must not restore surrounding text');
  assert(await page.evaluate(key => localStorage.getItem(key), practiceQuizKey) === null, 'Reset did not clear saved test');
  assert(await page.evaluate(key => localStorage.getItem(key), practiceProgressKey) === savedProgress, 'Reset erased course progress');
  await page.locator('[data-start]').click();
  const partialCorrect = await answerCurrent(false);
  await page.locator('[data-next]').click();
  const partialWrong = await answerCurrent(true);
  await page.locator('[data-next]').click();
  const unansweredText = await page.locator('.quiz-question').textContent();
  const partialAnswers = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).answers, practiceQuizKey);
  await page.locator('[data-previous]').click();
  await page.reload();
  await page.locator('.feedback').waitFor();
  assert(await page.locator('.quiz-question').textContent() === partialWrong.question, 'Previous did not restore the second confirmed question after reload');
  assert(await page.locator('input[name=answer]:disabled').count() === 4 && await page.locator('.quiz-option.is-wrong input:checked').count() === 1, 'Previous lost a confirmed incorrect answer or unlocked it');
  assert(await page.locator('.quiz-meter').evaluate(node => node.value) === 2, 'Previous decreased confirmed-answer progress');
  assert(JSON.stringify(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).answers, practiceQuizKey)) === JSON.stringify(partialAnswers), 'Previous changed stored answers');
  await page.locator('[data-previous]').click();
  assert(await page.locator('.quiz-question').textContent() === partialCorrect.question && await page.locator('[data-previous]').isDisabled(), 'Previous did not stop at the first confirmed question');
  await page.locator('[data-next]').click();
  await page.locator('[data-next]').click();
  assert(await page.locator('.quiz-question').textContent() === unansweredText && await page.locator('input[name=answer]:enabled').count() === 4 && await page.locator('.feedback').count() === 0, 'Forward navigation did not return to the unanswered question');
  const beforeFinish = await page.evaluate(key => localStorage.getItem(key), practiceQuizKey);
  await page.locator('[data-finish]').click();
  const finishDialog = page.locator('[data-finish-confirm]');
  assert(await finishDialog.evaluate(node => node.matches(':modal')), 'Finish did not open a native confirmation modal');
  assert(await page.locator('#finish-confirm-title').textContent() === '¿Finalizar la práctica?' && await page.locator('#finish-confirm-title').evaluate(node => node === document.activeElement), 'Finish confirmation has the wrong title or focus');
  assert(await finishDialog.locator('.confirmation-body svg').count() === 0, 'Finish confirmation contains a decorative icon');
  await page.locator('[data-finish-no]').click();
  const finishClosing = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
    const dialog = document.querySelector('[data-finish-confirm]');
    resolve(!CSS.supports('transition-behavior', 'allow-discrete') || Boolean(dialog && !dialog.open && dialog.getAnimations().some(animation => animation.playState === 'running')));
  })));
  assert(finishClosing, 'Finish cancellation removes the dialog before its close transition finishes');
  await finishDialog.waitFor({ state: 'detached' });
  assert(await page.locator('[data-finish]').evaluate(node => node === document.activeElement), 'Finish cancellation did not restore focus');
  await page.locator('[data-finish]').click();
  await page.keyboard.press('Escape');
  await finishDialog.waitFor({ state: 'detached' });
  assert(await page.locator('[data-finish]').evaluate(node => node === document.activeElement), 'Escape did not restore focus to Finish');
  assert(await page.evaluate(key => localStorage.getItem(key), practiceQuizKey) === beforeFinish, 'Cancelling Finish changed the active attempt');
  await page.locator('[data-finish]').click();
  await page.locator('[data-finish-yes]').click();
  await finishDialog.waitFor({ state: 'detached' });
  assert((await page.locator('.score-number').textContent()).replace(/\s/g, '') === '1/2', 'Partial result included unanswered questions in its score');
  assert(await page.locator('.quiz-results tbody tr').count() === 12 && await page.locator('.quiz-result-status.is-correct').count() === 1 && await page.locator('.quiz-result-status.is-wrong').count() === 1 && await page.locator('.quiz-result-status.is-pending').count() === 10, 'Partial results table has incorrect question statuses');
  const finishedAttempt = await page.evaluate(key => localStorage.getItem(key), practiceQuizKey);
  assert(JSON.parse(finishedAttempt).finished === true, 'Confirmed finish was not persisted');
  assert(await page.locator('.quiz-results caption, [data-review], [data-restart], .quiz-summary > .quiz-actions, .quiz-summary a, .quiz-summary .subtle').count() === 0, 'Summary retained removed captions, review/restart actions, links or guidance');
  assert((await page.locator('.quiz-results th').allTextContents()).join('/') === 'ESTADO/PREGUNTA', 'Summary table headers are not uppercase');
  assert(await page.locator('.quiz-results').getAttribute('aria-label'), 'Summary table has no accessible name');
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.waitForFunction(() => {
      const shell = document.querySelector('.quiz-summary'), header = shell.querySelector('.quiz-summary-header');
      const heading = header.querySelector('.quiz-heading'), title = heading.querySelector('h2'), eyebrow = heading.querySelector('.eyebrow');
      const controls = header.querySelector('.quiz-meta-actions'), reset = controls.querySelector('[data-reset]'), exit = controls.querySelector('[data-exit]');
      const gap = title.getBoundingClientRect().top - eyebrow.getBoundingClientRect().bottom;
      const right = shell.getBoundingClientRect().right - parseFloat(getComputedStyle(shell).paddingRight);
      const ink = getComputedStyle(shell).color;
      const lastDomain = shell.querySelector('.domain-results li:last-child');
      const inset = parseFloat(getComputedStyle(shell).paddingLeft);
      return document.documentElement.scrollWidth <= innerWidth + 1 && eyebrow.textContent === 'PRÁCTICA' && gap >= -0.01 && gap <= 8
        && getComputedStyle(title).fontSize === '24px' && getComputedStyle(eyebrow).color === 'rgb(199, 70, 52)'
        && reset.title === 'Reiniciar' && reset.getAttribute('aria-label') === 'Reiniciar'
        && exit.title === 'Salir' && exit.getAttribute('aria-label') === 'Salir'
        && !shell.querySelector('.quiz-score p')
        && Math.abs(shell.getBoundingClientRect().bottom - lastDomain.getBoundingClientRect().bottom - inset) < 2
        && Math.abs(controls.getBoundingClientRect().right - right) < 2
        && Math.abs(controls.getBoundingClientRect().top - header.getBoundingClientRect().top) < 2
        && exit.getBoundingClientRect().left >= reset.getBoundingClientRect().right
        && [...document.querySelectorAll('.quiz-results [data-question-index]')].every(button => {
          const style = getComputedStyle(button);
          return button.title === button.textContent && style.fontWeight === '400' && style.color === ink
            && style.whiteSpace === 'nowrap' && style.textOverflow === 'ellipsis' && style.overflowX === 'hidden';
        })
        && [...document.querySelectorAll('.domain-results strong')].every(score => getComputedStyle(score).color === ink);
    }).then(handle => handle.jsonValue()), `Summary heading, top controls, neutral colors or single-line question links failed at ${width}px`);
    if (width <= 390) assert(await page.locator('.quiz-results [data-question-index]').evaluateAll(buttons => buttons.some(button => button.scrollWidth > button.clientWidth)), 'Narrow result questions must truncate inside their cells');
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('[data-question-index="0"]').click();
  assert(await page.locator('.quiz-question').textContent() === partialCorrect.question && await page.locator('.quiz-option.is-correct input:checked').count() === 1 && await page.locator('[data-previous]').isDisabled(), 'Correct result did not reopen the matching locked question');
  await page.locator('.quiz-meta [data-exit]').click();
  const detailExit = page.locator('[data-exit-confirm]');
  assert(await detailExit.evaluate(node => node.matches(':modal')) && await detailExit.locator('#exit-confirm-title').textContent() === '¿Salir de la práctica?' && (await detailExit.locator('.confirmation-actions button').allTextContents()).join('/') === 'Cancelar/Aceptar', 'Result detail X skipped the exit confirmation');
  await detailExit.locator('[data-exit-no]').click();
  await detailExit.waitFor({ state: 'detached' });
  assert(await page.locator('.quiz-meta [data-exit]').evaluate(node => node === document.activeElement), 'Cancelling result-detail exit lost focus');
  assert(await page.locator('.quiz-next-controls [data-results]').evaluate(button => {
    const summary = button.getBoundingClientRect(), next = button.nextElementSibling.getBoundingClientRect();
    return button.textContent === 'Resumen' && Math.abs(next.left - summary.right - 12) < 0.01 && Math.abs(next.top - summary.top) < 2;
  }), 'Resumen must sit directly to the left of Siguiente');
  assert(await page.locator('.feedback p').textContent() === partialCorrect.options.find(option => option.id === partialCorrect.correctOption).explanation, 'Correct result detail lost its explanation');
  await page.locator('[data-next]').click();
  assert(await page.locator('.quiz-question').textContent() === partialWrong.question && await page.locator('.quiz-option.is-wrong input:checked').count() === 1, 'Result navigation lost the incorrect chosen answer');
  assert(await page.locator('input[name=answer]:disabled').count() === 4 && await page.locator('.feedback p').textContent() === partialWrong.options.find(option => option.id === partialWrong.correctOption).explanation, 'Incorrect result detail is editable or lost its explanation');
  await page.locator('[data-previous]').click();
  assert(await page.locator('.quiz-review-status').count() === 0 && await page.locator('.quiz-next-controls [data-results]').textContent() === 'Resumen', 'Result detail retained its redundant status or lacks the summary action');
  await page.locator('.quiz-next-controls [data-results]').click();
  await page.locator('[data-question-index="11"]').click();
  assert(await page.locator('[data-next]').isDisabled() && await page.locator('input[name=answer]:disabled').count() === 4 && await page.locator('input[name=answer]:checked').count() === 0 && await page.locator('.quiz-option.is-correct').count() === 1, 'Pending final result is editable, lacks the correct answer or permits navigation past the end');
  assert(await page.locator('.quiz-review-status').count() === 0 && await page.locator('.quiz-next-controls [data-results]').textContent() === 'Resumen', 'Pending detail retained redundant status or lost the summary action');
  await page.locator('[data-previous]').click();
  assert((await page.locator('.quiz-meta').textContent()).includes('11 de 12'), 'Result navigation did not move back from the final question');
  await page.locator('.quiz-next-controls [data-results]').click();
  assert(await page.evaluate(key => localStorage.getItem(key), practiceQuizKey) === finishedAttempt, 'Read-only result navigation modified saved answers or attempt position');
  await page.reload();
  await page.locator('.quiz-results').waitFor();
  assert((await page.locator('.score-number').textContent()).replace(/\s/g, '') === '1/2', 'Reload did not restore the finalized partial result');
  await page.locator('[data-exit]').click();
  const exitDialog = page.locator('[data-exit-confirm]');
  assert(await exitDialog.evaluate(node => node.matches(':modal')), 'Results exit did not open a native confirmation');
  assert(await page.locator('#exit-confirm-title').textContent() === '¿Salir de la práctica?' && await page.locator('#exit-confirm-title').evaluate(node => node === document.activeElement), 'Results exit confirmation has the wrong heading or focus');
  await page.locator('[data-exit-no]').click();
  await exitDialog.waitFor({ state: 'detached' });
  assert(await page.locator('[data-exit]').evaluate(node => node === document.activeElement), 'Cancelling results exit did not restore focus');
  assert(await page.evaluate(key => localStorage.getItem(key), practiceQuizKey) === finishedAttempt, 'Cancelling results exit changed the saved result');
  await page.locator('[data-exit]').click();
  await page.keyboard.press('Escape');
  await exitDialog.waitFor({ state: 'detached' });
  assert(await page.locator('[data-exit]').evaluate(node => node === document.activeElement) && await page.locator('.quiz-results').isVisible(), 'Escape discarded results or failed to restore focus');
  await page.locator('[data-exit]').click();
  await page.locator('[data-exit-yes]').click();
  await exitDialog.waitFor({ state: 'detached' });
  assert(await page.locator('[data-start]').isVisible() && await page.evaluate(key => localStorage.getItem(key), practiceQuizKey) === null, 'Confirmed results exit did not clear the attempt and return to the intro');
  assert(await page.evaluate(key => localStorage.getItem(key), practiceProgressKey) === savedProgress, 'Results exit erased reading progress');
  await page.reload();
  await page.locator('[data-start]').click();
  await page.locator('[data-finish]').click();
  await page.locator('[data-finish-yes]').click();
  await finishDialog.waitFor({ state: 'detached' });
  assert(await page.locator('.score-number, [data-review]').count() === 0 && await page.locator('.quiz-result-status.is-pending').count() === 12 && !/NaN|Infinity|0\s*\/\s*0/.test(await page.locator('#quiz').textContent()), 'Finishing with zero answers produced an invalid score or an errors review');
  await page.locator('[data-reset]').click();
  assert(await page.locator('[data-reset-confirm]').evaluate(node => node.matches(':modal')), 'Resetting an empty completed attempt needs confirmation');
  await page.locator('[data-reset-yes]').click();
  await page.locator('[data-reset-confirm]').waitFor({ state: 'detached' });
  assert(await page.locator('[data-start]').isVisible(), 'Finalized empty attempt did not return to the start after reset');
  checks.push('responsive practice heading, disabled Next, compact results table, immutable question browsing and confirmed results exit');
  await page.reload();
  await page.locator('[data-start]').click();
  for (let index = 0; index < 12; index++) {
    await answerCurrent(index % 3 === 0);
    if (index === 2) {
      const questionText = await page.locator('.quiz-question').textContent();
      let resumeBank;
      const bankPaused = new Promise(resolve => { resumeBank = resolve; });
      await page.route(`**${bankUrl}`, async route => { await bankPaused; await route.continue(); });
      await page.reload({ waitUntil: 'domcontentloaded' });
      assert(await page.locator('[data-practice-intro]:not([hidden])').count() === 0, 'Slow reload flashes practice instructions');
      resumeBank();
      await page.locator('.feedback').waitFor();
      await page.unroute(`**${bankUrl}`);
      assert(await page.locator('.quiz-question').textContent() === questionText, 'Question changed after reload');
      assert(await page.locator('input[name=answer]:disabled').count() === 4, 'Locked response lost after reload');
      assert(await page.locator('[data-practice-intro]:not([hidden])').count() === 0, 'Reload repeated practice instructions');
    }
    await page.locator('[data-next]').click();
  }
  assert((await page.locator('.score-number').textContent()).replace(/\s/g, '') === '8/12', 'Expected practice result 8/12');
  assert(await page.locator('.domain-results li').count() === 6, 'Expected six domain results');
  await page.locator('[data-question-index="0"]').click();
  assert(await page.locator('.quiz-option.is-wrong input:checked').count() === 1 && await page.locator('.quiz-option.is-correct').count() === 1, 'Completed result did not expose the selected mistake and correct answer');
  await page.locator('.quiz-next-controls [data-results]').click();
  assert((await page.locator('.score-number').textContent()).replace(/\s/g, '') === '8/12', 'Read-only review changed the completed score');
  checks.push('complete 12-question Agentic attempt, explanations, lock, reload, 8/12 score and read-only answer review');
  await page.locator('[data-reset]').click();
  assert(await page.locator('[data-reset-confirm]').evaluate(node => node.matches(':modal')), 'Completed practice reset needs confirmation');
  await page.locator('[data-reset-no]').click();
  await page.locator('[data-reset-confirm]').waitFor({ state: 'detached' });
  assert(await page.locator('.quiz-results').isVisible(), 'Cancelled completed reset discarded results');
  await page.locator('[data-reset]').click();
  await page.locator('[data-reset-yes]').click();
  await page.locator('[data-reset-confirm]').waitFor({ state: 'detached' });
  assert(await page.locator('[data-start]').isVisible(), 'Completed practice cannot be reset');
  await page.locator('[data-start]').click();
  assert((await page.locator('.quiz-meta').textContent()).includes('1 de 12'), 'New attempt did not reset question counter');
  checks.push('reset confirmation/cancellation, cleared saved test, retained course progress, intro-only instructions');
  await page.goto(`${base}${course}/overview/`);
  assert(await page.locator('[data-talk-mode], a[href$="/talk/"]').count() === 0, 'Separate talk mode remains');
  await page.goto(base);
  const homeText = await page.locator('body').innerText();
  const certificationNames = await page.locator('.certification-item h3, .path-title, [data-search-kind="certification"] strong').allTextContents();
  assert(certificationNames.every(name => !/\b20\d{2}\b|Essentials/.test(name)), 'Outdated certification names remain on home, menus or search');
  assert(await page.locator('#ai-data-platform-essentials').count() === 0, 'Essentials remains in the certification catalog');
  const platform = page.locator('#ai-data-layer #ai-data-platform-professional');
  assert(await platform.locator('.certification-level').textContent() === 'Nivel 3', 'AI Data Platform Professional belongs in Data & AI at level 3');
  assert((await platform.textContent()).includes('1Z0-1154-26'), 'AI Data Platform exam code is missing');
  for (const width of [1671, 1551, 1335]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(() => {
      const card = document.querySelector('.path-section.is-active').getBoundingClientRect(), launcher = document.querySelector('[data-chat-open]').getBoundingClientRect();
      return card.bottom < innerHeight - 60 && launcher.top > 0;
    });
    const placement = await page.evaluate(() => {
      const card = document.querySelector('.path-section.is-active').getBoundingClientRect(), launcher = document.querySelector('[data-chat-open]').getBoundingClientRect();
      const footer = document.querySelector('.site-footer').getBoundingClientRect();
      return { beside: launcher.left - card.right, rightInset: document.documentElement.clientWidth - launcher.right, bottom: launcher.bottom - card.bottom, below: launcher.top - card.bottom, footer: footer.top - launcher.bottom,
        launcherWidth: launcher.width, textClip: getComputedStyle(document.querySelector('[data-chat-open] > span')).clipPath };
    });
    assert(width === 1671 ? placement.beside >= 20 && Math.abs(placement.rightInset - 20) <= 1 && Math.abs(placement.bottom) <= 1 && placement.textClip === 'none'
      : width === 1551 ? placement.beside >= 20 && Math.abs(placement.launcherWidth - 48) < 0.01 && placement.textClip === 'inset(50%)'
      : placement.below >= 16 && placement.below <= 24 && placement.footer >= 12 && Math.abs(placement.launcherWidth - 48) < 0.01,
    `Incorrect home CertiChat placement at ${width}px`);
  }
  await page.setViewportSize({ width: 1308, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.scrollbarGutter = 'stable';
    scrollTo(0, document.documentElement.scrollHeight);
    dispatchEvent(new Event('resize'));
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert(await page.evaluate(() => {
    const card = document.querySelector('.path-section.is-active').getBoundingClientRect();
    const launcher = document.querySelector('.certichat-launcher').getBoundingClientRect();
    return innerWidth - document.documentElement.getBoundingClientRect().width >= 10 &&
      Math.abs(card.right - launcher.right) <= 1;
  }), 'Home CertiChat misses the card edge when a scrollbar reserves width');
  await page.evaluate(() => { document.documentElement.style.scrollbarGutter = ''; });
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
  assert(await page.locator('.path-section').count() === 5, 'Expected Foundation, three certification specializations and Governance');
  assert(await page.locator('.certification-item').count() === 12, 'Missing or duplicated courses');
  assert(await page.locator('.certification-item.has-guide').count() === 4, 'Expected four available guides');
  assert(await page.locator('.certification-actions a[href^="https://mylearn.oracle.com/"]').count() === 11, 'Every certification needs an Oracle source');
  assert(await page.locator('.path-nav .path-group').count() === 5, 'Header does not expose all groups');
  assert(await page.locator('.certitips-button:not([disabled])').count() === 4, 'Available CertiTips guide button is missing');
  assert(await page.locator('.certitips-button[disabled]').count() === 8, 'Pending guides need disabled gray buttons');
  assert(await page.locator('.certitips-button svg[fill="currentColor"]').count() === 12, 'CertiTips icon is missing');
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
  await page.setViewportSize({ width: 1671, height: 900 });
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  assert(await page.evaluate(() => {
    const gap = document.querySelector('.site-footer').getBoundingClientRect().top -
      document.querySelector('#foundation-sprint').getBoundingClientRect().bottom;
    return gap >= 16 && gap <= 48;
  }), 'Home leaves excessive empty space below Foundation');
  await page.setViewportSize({ width: 1280, height: 900 });
  const headerGroup = page.locator('.path-nav .path-group').first();
  const nextHeaderGroup = page.locator('.path-nav .path-group').nth(1);
  await headerGroup.hover();
  assert(await headerGroup.evaluate(element => element.open), 'Desktop group dropdown did not open on pointer entry');
  await nextHeaderGroup.hover();
  assert(await nextHeaderGroup.evaluate(element => element.open) && !await headerGroup.evaluate(element => element.open), 'Desktop category change did not show only the new dropdown');
  const pendingMenu = nextHeaderGroup.locator('.path-group-panel a[target="_blank"]').first();
  assert((await pendingMenu.getAttribute('href')).startsWith('https://mylearn.oracle.com/'), 'Pending certification does not open its official route');
  assert(await pendingMenu.getAttribute('target') === '_blank', 'Official route should open in a new tab');
  await pendingMenu.hover();
  assert(await nextHeaderGroup.evaluate(element => element.open), 'Desktop dropdown closed before its item could be selected');
  assert(await pendingMenu.locator('.coming-soon').isVisible(), 'Pending certification badge is missing on hover');
  const pendingStyle = await pendingMenu.evaluate(link => {
    const badge = getComputedStyle(link.querySelector('.coming-soon'));
    const row = getComputedStyle(link);
    return { background: row.backgroundColor, color: row.color, badgeBackground: badge.backgroundColor, badgeColor: badge.color, badgeWeight: badge.fontWeight };
  });
  assert(pendingStyle.background === 'rgb(240, 242, 246)' && pendingStyle.color === 'rgb(96, 101, 116)', 'Pending certification hover must be gray, not red');
  assert(pendingStyle.badgeBackground === 'rgb(241, 177, 63)' && pendingStyle.badgeColor === 'rgb(91, 56, 0)' && pendingStyle.badgeWeight === '400', 'Coming soon badge needs regular dark-yellow text');
  await headerGroup.hover();
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
  assert(await page.evaluate(() => {
    const backdrop = selector => getComputedStyle(document.querySelector(selector), '::backdrop');
    const reference = backdrop('.certichat .confirmation');
    return ['#site-search', '#diagram-viewer'].every(selector => {
      const style = backdrop(selector);
      return style.backgroundColor === reference.backgroundColor && style.backdropFilter === reference.backdropFilter && style.backdropFilter === 'blur(3px)';
    });
  }), 'Search and diagram backdrops must match the confirmation glass');
  assert(await page.evaluate(() => {
    const dialog = document.querySelector('.search-dialog');
    const box = selector => dialog.querySelector(selector).getBoundingClientRect();
    const row = box('.search-results li:not([hidden]) a'), icon = box('.search-result-icon');
    const category = box('.search-result-copy small'), title = box('.search-result-copy strong');
    const transition = getComputedStyle(dialog).transitionProperty;
    const backdropTransition = getComputedStyle(dialog, '::backdrop').transitionProperty;
    return row.height <= 70 && row.bottom - icon.bottom <= 16 &&
      Math.abs((category.top + title.bottom - icon.top - icon.bottom) / 2) <= 1 &&
      title.top - category.bottom <= 3 &&
      (matchMedia('(prefers-reduced-motion: reduce)').matches
        ? getComputedStyle(dialog).transitionDuration === '0s' && getComputedStyle(dialog, '::backdrop').transitionDuration === '0s'
        : transition.includes('opacity') && transition.includes('display') && backdropTransition.includes('opacity') && backdropTransition.includes('overlay'));
  }), 'Search results need compact centered rows and a reduced-motion-safe dialog transition');
  assert(await page.locator('[data-search-kind="certification"]:visible').count() === 12, 'Search did not list all courses by default');
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
  assert(await page.locator('[data-search-kind="certification"]:visible').count() === 12, 'Clearing search did not restore courses');
  await page.locator('[data-search-close]').click();
  assert(!await page.locator('#site-search').evaluate(dialog => dialog.open), 'Close button did not close an empty search');
  await page.keyboard.press('Control+k');
  await page.locator('#search-query').fill('zzzz-no-such-certification');
  assert(await page.locator('[data-search-empty]').isVisible(), 'Search did not show a helpful empty state');
  await page.keyboard.press('Escape');
  assert(!await page.locator('#site-search').evaluate(dialog => dialog.open), 'Escape did not close search');
  await page.keyboard.press('Control+k');
  assert(await page.locator('#site-search').evaluate(dialog => dialog.open), 'Ctrl+K did not open search');
  assert(await page.locator('[data-search-kind="certification"]:visible').count() === 12, 'Reopening search did not restore default courses');
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
  checks.push('10 Agentic routes, four active and eight pending guides, five-group carousel, search, dropdowns, dark-mode persistence');

  const context = await page.context().browser().newContext();
  await context.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked for test', 'SecurityError'); } }));
  const blocked = await context.newPage();
  await blocked.goto(`${base}${practiceCourse}/practice/`);
  await blocked.getByRole('button', { name: 'Comenzar', exact: true }).click();
  await blocked.locator('input[name=answer]').first().check();
  await blocked.locator('#question-form button[type="submit"]').click();
  assert(await blocked.locator('.feedback p').count() === 1, 'Quiz failed with blocked storage');
  assert((await blocked.locator('.quiz-notice').textContent()).includes('almacenamiento está bloqueado'), 'Blocked-storage notice missing');
  await context.close();
  checks.push('blocked storage still permits answering with clear session-only notice');
  await page.evaluate(keys => keys.forEach(key => localStorage.removeItem(key)), [quizKey, `${quizKey}:last-practice`, progressKey, practiceQuizKey, `${practiceQuizKey}:last-practice`, practiceProgressKey]);
  page.off('pageerror', pageError);
  assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
  await page.goto(base);
  return { origin, checks, pageErrors: errors.length, screenshots: 0 };
}

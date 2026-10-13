// Run in an isolated CLI session opened at the local preview:
// npx --yes --package @playwright/cli playwright-cli -s=governance run-code --filename scripts/governance-smoke.cjs
// DOM, geometry and interaction checks only; never takes screenshots.
async (page) => {
  const origin = await page.evaluate(() => location.origin);
  const base = `${origin}/certitips/`;
  const route = `${base}CDMP-DMF/`;
  const modules = ['governance', 'data-architecture', 'data-modeling', 'data-operations', 'data-security', 'data-integration', 'content-management', 'master-reference-data', 'data-warehousing-bi', 'metadata', 'data-quality'];
  const slugs = ['overview', ...modules, 'oracle-map', 'glossary', 'case-study'];
  const widths = [1299, 390, 320];
  const progressKey = 'certitips:progress:v1:data-governance';
  const otherProgress = 'certitips:progress:v1:agentic-ai-foundations-2026';
  const keys = [progressKey, otherProgress, 'certitips:theme'];
  const previousStorage = await page.evaluate(keys => keys.map(key => [key, localStorage.getItem(key)]), keys);
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  let diagrams = 0;
  let scrollableTables = 0;
  try {
    await page.evaluate(({ progressKey, otherProgress }) => {
      localStorage.removeItem(progressKey);
      localStorage.setItem(otherProgress, JSON.stringify(['agents']));
      localStorage.setItem('certitips:theme', 'light');
    }, { progressKey, otherProgress });
    await page.goto(base);
    const labels = await page.locator('.path-nav .path-group > summary').allTextContents();
    assert(labels.join('|') === 'Foundation|AI & Agents|Data & AI|Architecture|Governance', 'Expected five ordered navigation groups');
    const courseLink = '.path-group-panel a[href="/certitips/CDMP-DMF/overview/"]';
    assert(await page.locator(`.path-nav ${courseLink}`).count() === 1 && await page.locator(`.path-nav-mobile ${courseLink}`).count() === 1, 'Governance must have desktop and mobile routes');
    const indexed = await page.locator('[data-search-kind="topic"] a').evaluateAll(links => links.map(link => link.href).filter(url => url.includes('/CDMP-DMF/')));
    assert(indexed.length === slugs.length && slugs.every(slug => indexed.includes(`${route}${slug}/`)), 'Search must index all fifteen Governance pages');
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
    await page.locator('[data-search-open]').focus();
    await page.keyboard.press('Control+k');
    await page.locator('#search-query').fill('Governance');
    assert(await page.locator('[data-search-kind="certification"]:visible a[href="/certitips/CDMP-DMF/overview/"]').count() === 1, 'Search cannot find the Governance course');
    await page.locator('#search-query').fill('metadatos');
    const metadata = page.locator('[data-search-kind="topic"]:visible a[href="/certitips/CDMP-DMF/metadata/"]');
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
        assert(await page.locator('a[href*="/CDMP-DMF/exam-checklist/"]').count() === 0, `Broken exam route: ${slug}`);
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
      assert(await page.locator('[data-diagram]').count() === 5, `Expected five section diagrams: ${slug}`);
      for (const button of await page.locator('[data-diagram]').all()) {
        await button.scrollIntoViewIfNeeded();
        await button.locator('img').evaluate(image => image.decode());
        await button.focus(); await page.keyboard.press('Enter');
        assert(await page.locator('#diagram-viewer').evaluate(dialog => dialog.open), `Keyboard did not open diagram: ${slug}`);
        await page.keyboard.press('Tab');
        assert(await page.evaluate(() => document.querySelector('#diagram-viewer').contains(document.activeElement)), 'Focus escaped the diagram dialog');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('#diagram-viewer').open);
        assert(await button.evaluate(element => document.activeElement === element), 'Diagram did not restore keyboard focus');
        diagrams++;
      }
    }
    await page.goto(`${route}governance/`);
    const diagram = page.locator('[data-diagram]').first();
    await diagram.scrollIntoViewIfNeeded();
    await diagram.click();
    const viewer = page.locator('#diagram-viewer');
    assert(await viewer.evaluate(element => getComputedStyle(element, '::backdrop').backdropFilter.includes('blur(')), 'Diagram backdrop has no glass blur');
    assert(await viewer.evaluate(element => {
      const image = element.querySelector('.dialog-content img'), link = [...document.querySelectorAll('.sidebar .nav-link')].find(link => image.src.includes(`${link.pathname}img/`));
      const source = [...document.querySelectorAll('[data-diagram]')].find(button => button.querySelector('img').src === image.src);
      return !element.querySelector('.dialog-brand') &&
        element.querySelector('#diagram-group').textContent === `${link.querySelector('.nav-number').textContent.trim()} ${link.querySelector('.nav-title').textContent.trim()}` &&
        element.querySelector('#diagram-caption').textContent === source.dataset.diagramHeading &&
        getComputedStyle(element.querySelector('#diagram-group')).color === 'rgb(199, 70, 52)';
    }), 'Diagram toolbar does not show the numbered red group above the source heading');
    await viewer.locator('.dialog-content img').click();
    await page.waitForFunction(() => document.querySelector('#diagram-viewer').classList.contains('is-presenting') && document.querySelector('.diagram-slide-count').textContent.includes('/'));
    const gallery = await page.evaluate(async () => (await (await fetch('/certitips/CDMP-DMF/gallery.json')).json()));
    const galleryLength = gallery.length;
    const rail = viewer.locator('.diagram-presentation-nav');
    assert(await rail.locator('button').count() === galleryLength && galleryLength > 5, 'Presentation does not contain every course diagram');
    assert(await rail.locator('.diagram-presentation-group h3').count() > 5 && await rail.locator('button span').count() === 0, 'Presentation thumbnails are not grouped image-only controls');
    assert(await rail.locator('button').evaluateAll(buttons => buttons.every((button, index) => {
      const tag = getComputedStyle(button, '::after'), count = getComputedStyle(document.querySelector('.diagram-slide-count'));
      return button.dataset.slideNumber === String(index + 1) && tag.position === 'absolute' &&
        tag.width === '20px' && tag.height === '20px' && tag.backgroundColor === 'rgb(17, 17, 17)' && tag.color === 'rgb(255, 255, 255)' &&
        tag.backgroundColor === count.backgroundColor && tag.color === count.color;
    })), 'Presentation number tags must be small black blocks with white text');
    assert(await rail.evaluate(element => {
      const style = getComputedStyle(element), sidebar = document.querySelector('.sidebar');
      return style.backgroundColor === getComputedStyle(sidebar).backgroundColor && Number.parseFloat(style.width) >= 180 &&
        [...element.querySelectorAll('.diagram-presentation-group')].every(group => {
          const source = group.querySelector('img').getAttribute('src');
          const number = [...sidebar.querySelectorAll('.nav-link')].find(link => source.startsWith(`${link.pathname}img/`))?.querySelector('.nav-number')?.textContent;
          const heading = group.querySelector('h3');
          return number && heading.querySelector('.nav-number')?.textContent === number && getComputedStyle(heading).color === 'rgb(199, 70, 52)';
        });
    }), 'Presentation filmstrip does not match course navigation background, width or numbered red groups');
    assert(await page.evaluate(() => {
      const viewer = document.querySelector('#diagram-viewer'), toolbar = viewer.querySelector('.dialog-toolbar');
      const present = toolbar.querySelector('[data-diagram-present]').getBoundingClientRect(), close = toolbar.querySelector('[data-close-diagram]').getBoundingClientRect();
      const content = viewer.querySelector('.dialog-content'), box = content.getBoundingClientRect(), frame = viewer.getBoundingClientRect();
      const description = viewer.querySelector('#diagram-description').getBoundingClientRect();
      const badge = viewer.querySelector('.diagram-slide-count').getBoundingClientRect();
      const image = content.querySelector('img').getBoundingClientRect();
      return present.right <= close.left && close.left - present.right <= 12 &&
        Math.abs(box.left - frame.left) <= 1 && Math.abs(box.right - frame.right) <= 1 && Math.abs(box.bottom - description.top) <= 1 && Math.abs(description.bottom - frame.bottom) <= 1 &&
        Math.abs(image.width - box.width) <= 1 && Math.abs(image.height - box.height) <= 1 && getComputedStyle(content).overflowX === 'hidden' &&
        Math.abs(badge.right - close.right) <= 1 && Math.abs(badge.width - close.width) <= 2 && Math.abs(badge.height - close.height) <= 2 && description.height > 20 && getComputedStyle(viewer.querySelector('#diagram-description')).visibility === 'visible';
    }), 'Presentation toolbar or image does not use the full viewer');
    const menuButton = viewer.locator('[data-diagram-menu]');
    assert(await menuButton.isVisible() && await menuButton.getAttribute('aria-expanded') === 'false' && await rail.evaluate(element => element.inert && getComputedStyle(element).opacity === '0'), 'Presentation filmstrip does not start hidden');
    assert(await page.evaluate(() => {
      const source = document.querySelector('.site-header .menu-toggle'), target = document.querySelector('#diagram-viewer [data-diagram-menu]');
      const sourceStyle = getComputedStyle(source), targetStyle = getComputedStyle(target), box = target.getBoundingClientRect();
      const projector = document.querySelector('#diagram-viewer [data-diagram-present]').getBoundingClientRect(), icon = target.querySelector('svg').getBoundingClientRect();
      return source.querySelector('svg').outerHTML === target.querySelector('svg').outerHTML &&
        box.width === projector.width && box.height === projector.height && icon.width === 18 && icon.height === 18 &&
        sourceStyle.borderRadius === targetStyle.borderRadius && sourceStyle.borderColor === targetStyle.borderColor &&
        sourceStyle.backgroundColor === targetStyle.backgroundColor;
    }), 'Presentation menu does not match the projector size or course menu icon');
    await page.mouse.move(8, 100);
    assert(await rail.evaluate(element => getComputedStyle(element).opacity === '0'), 'Left-edge hover opened the filmstrip');
    await menuButton.click();
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.diagram-presentation-nav')).opacity) > .95);
    assert(await menuButton.getAttribute('aria-expanded') === 'true' && await menuButton.getAttribute('aria-label') === 'Ocultar imágenes' && await rail.evaluate(element => !element.inert), 'Presentation menu button did not open the filmstrip');
    assert(await rail.evaluate(element => getComputedStyle(element).scrollbarColor.includes('89, 97, 110')), 'Filmstrip scrollbar differs from course navigation');
    const firstCount = await viewer.locator('.diagram-slide-count').textContent();
    const firstDescription = await viewer.locator('#diagram-description').textContent();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(previous => document.querySelector('.diagram-slide-count').textContent !== previous, firstCount);
    assert((await viewer.locator('#diagram-description').textContent()) !== firstDescription, 'Presentation did not update the visible image description');
    const secondCount = await viewer.locator('.diagram-slide-count').textContent();
    const secondSrc = await viewer.locator('.dialog-content img').getAttribute('src');
    await viewer.locator('.dialog-content img').click();
    assert(await menuButton.getAttribute('aria-expanded') === 'false' && await rail.evaluate(element => element.inert) &&
      await viewer.locator('.diagram-slide-count').textContent() === secondCount && await viewer.locator('.dialog-content img').getAttribute('src') === secondSrc,
      'First image click must hide the filmstrip without changing slides');
    await viewer.locator('.dialog-content img').click();
    await page.waitForFunction(previous => document.querySelector('.diagram-slide-count').textContent !== previous, secondCount);
    await menuButton.click();
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.diagram-presentation-nav')).opacity) > .95);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('#diagram-viewer').scrollWidth <= innerWidth), 'Slide transition created horizontal page overflow');
    await page.setViewportSize({ width: 1671, height: 1000 });
    assert(await page.evaluate(() => Math.abs(document.querySelector('.site-header .theme-toggle').getBoundingClientRect().right -
      document.querySelector('.certichat-launcher').getBoundingClientRect().right) <= 1), 'Header controls do not align with the CertiChat right margin');
    await rail.locator('button:has(img[src$="gov-data-architecture-oracle.svg"])').click();
    assert(await viewer.evaluate(element => {
      const content = element.querySelector('.dialog-content'), image = content.querySelector('img'), description = element.querySelector('#diagram-description');
      return content.scrollHeight <= content.clientHeight + 1 &&
        image.getBoundingClientRect().bottom <= content.getBoundingClientRect().bottom + 1 &&
        Math.abs(content.getBoundingClientRect().bottom - description.getBoundingClientRect().top) <= 1;
    }), 'Presentation image is clipped behind its description at wide viewport');
    await page.setViewportSize({ width: 1299, height: 900 });
    await rail.locator('button').last().click();
    await page.waitForFunction(total => document.querySelector('.diagram-slide-count').textContent === `${total}/${total}`, galleryLength);
    await menuButton.click();
    assert(await menuButton.getAttribute('aria-expanded') === 'false' && await rail.evaluate(element => element.inert), 'Presentation menu button did not close the filmstrip');
    await page.waitForFunction(() => !document.querySelector('.diagram-slide-count').classList.contains('is-visible'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#diagram-viewer').open && !document.querySelector('#diagram-viewer').classList.contains('is-presenting'));
    assert(await viewer.locator('.dialog-content img').evaluate((image, src) => image.getAttribute('src') === src, gallery.at(-1).src), 'First Escape did not retain the selected image in standard view');
    const destination = await page.evaluate(src => {
      const link = [...document.querySelectorAll('.sidebar .nav-link')].find(link => src.startsWith(`${link.pathname}img/`));
      return `${link.href}#diagram-${src.split('/').pop()}`;
    }, gallery.at(-1).src);
    await page.keyboard.press('Escape');
    await page.waitForURL(destination);
    await page.waitForFunction(src => {
      const target = [...document.querySelectorAll('[data-diagram]')].find(button => button.dataset.diagram === src);
      const rect = target?.getBoundingClientRect();
      return rect && rect.bottom > 0 && rect.top < innerHeight;
    }, gallery.at(-1).src);
    assert(await page.evaluate(src => {
      const target = [...document.querySelectorAll('[data-diagram]')].find(button => button.dataset.diagram === src);
      const rect = target?.getBoundingClientRect();
      return rect && rect.bottom > 0 && rect.top < innerHeight;
    }, gallery.at(-1).src), 'Second Escape did not locate the selected image in its source page');
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
    assert(await page.locator('a[href$="/CDMP-DMF/practice/"]').count() === 0, 'Governance still links to its retired practice');
    assert((await page.request.get(`${route}practice/`)).status() === 404, 'Governance practice route is still published');
    assert(await page.evaluate(key => localStorage.getItem(key), otherProgress) === '["agents"]', 'Reading progress crossed courses');
    assert(!errors.length, errors.join('; '));
    return { pages: slugs.length, widths, headerWidths: [1100, 1201, 1299], diagrams, scrollableTables, isolatedCourseStorage: true, pageErrors: errors.length, screenshots: 0 };
  } finally {
    await page.evaluate(entries => entries.forEach(([key, value]) => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value)), previousStorage);
    page.off('pageerror', onError);
    await page.goto(`${route}overview/`);
  }
}

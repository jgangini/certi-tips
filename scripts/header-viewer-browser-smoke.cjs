// playwright-cli -s=header-viewer open http://127.0.0.1:4173/certitips/
// playwright-cli -s=header-viewer run-code --filename scripts/header-viewer-browser-smoke.cjs
// DOM checks only; no screenshots.
async (page) => {
  const base = `${new URL(page.url()).origin}/certitips/`;
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const viewerOnly = new URL(page.url()).searchParams.has('viewer-check');
  await page.addInitScript(() => sessionStorage.clear());
  const routes = ['certiquiz/', '', 'courses/', '1Z0-1122-26/practice/', 'certitube/', 'certichat/'];
  if (!viewerOnly) for (const width of [1576, 1280, 1195, 900, 798, 619, 480, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const positions = [];
    for (const route of routes) {
      await page.goto(`${base}${route}`);
      if (route === 'certiquiz/') {
        await page.locator('.certiquiz-breadcrumb').waitFor();
        assert(await page.locator('[data-role="player"] .muted').textContent() === 'Ingresa el código de la sala y participa.', `CertiQuiz participant copy differs at ${width}px`);
      }
      const geometry = await page.locator('.site-header').evaluate(header => {
        const headerBox = header.getBoundingClientRect();
        const theme = header.querySelector('.theme-toggle').getBoundingClientRect();
        const panel = document.querySelector('#certichat-panel');
        const logo = header.querySelector('.brand img').getBoundingClientRect(), launcher = document.querySelector('[data-chat-open]')?.getBoundingClientRect();
        if (logo.width !== 36 || logo.height !== 36) throw new Error(`Logo shrinks at ${innerWidth}px: ${logo.width}x${logo.height}`);
        if (innerWidth <= 800 && launcher?.width && (launcher.width !== theme.width || launcher.height !== theme.height)) throw new Error(`Chat button differs from header controls at ${innerWidth}px`);
        return { right: headerBox.right - theme.right, edgeRight: theme.right, chatRight: innerWidth > 800 && panel && !panel.hidden ? panel.getBoundingClientRect().right : null, padRight: parseFloat(getComputedStyle(header).paddingRight), overflow: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      assert(!geometry.overflow && Math.abs(geometry.right - geometry.padRight) < 1, `Header exceeds the viewport or right padding at ${width}px ${route}: ${JSON.stringify(geometry)}`);
      if (route === 'certiquiz/') {
        const edges = await page.locator('.certiquiz-breadcrumb').evaluate(node => ({ breadcrumb: node.getBoundingClientRect().right, theme: document.querySelector('.site-header .theme-toggle').getBoundingClientRect().right }));
        assert(Math.abs(edges.breadcrumb - edges.theme) < 1, `CertiQuiz breadcrumb and theme button differ at ${width}px: ${JSON.stringify(edges)}`);
      }
      positions.push(geometry);
      if (await page.locator('.path-nav-mobile > summary').isVisible()) {
        const menu = page.locator('.path-nav-mobile');
        await page.locator('.path-nav-mobile > summary').click();
        assert(await menu.evaluate(node => node.open), `Course groups do not open at ${width}px ${route}`);
        await page.locator('.path-nav-mobile > summary').click();
      }
      await page.locator('[data-search-open]').click();
      assert(await page.locator('#site-search').evaluate(node => node.open), `Search does not open at ${width}px ${route}`);
      await page.keyboard.press('Escape');
    }
    assert(positions.every(item => Math.abs(item.edgeRight - (item.chatRight ?? positions[0].edgeRight)) < 1), `Header geometry differs from content/chat at ${width}px: ${JSON.stringify(positions)}`);
  }
  for (const route of ['1Z0-1122-26/generative-ai/', 'CDMP-DMF/overview/']) {
    for (const [theme, background] of [['light', 'rgb(255, 255, 255)'], ['dark', 'rgb(0, 0, 0)']]) for (const width of [1280, 900, 694, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${base}${route}`);
      if ((await page.locator('html').getAttribute('data-theme') === 'dark') !== (theme === 'dark')) await page.locator('[data-theme-toggle]').click();
      await page.locator('[data-diagram]').first().click();
      const viewer = page.locator('#diagram-viewer');
      await viewer.waitFor();
      await viewer.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {}))));
      for (const control of ['[data-diagram-present]', '[data-close-diagram]']) {
        await viewer.locator(control).hover();
        assert(await viewer.locator(control).evaluate(button => {
          const red = getComputedStyle(document.documentElement).getPropertyValue('--red').trim(), probe = document.createElement('span');
          probe.style.color = red; document.body.append(probe);
          const expected = getComputedStyle(probe).color; probe.remove();
          return getComputedStyle(button).borderTopColor === expected && getComputedStyle(button).color === expected && (!button.querySelector('svg') || getComputedStyle(button.querySelector('svg')).fill === expected);
        }), `Viewer control does not use red hover: ${control} ${theme}`);
      }
      const fits = await viewer.locator('.dialog-content').evaluate(async content => {
        const image = content.querySelector('img');
        await image.decode();
        return content.scrollWidth <= content.clientWidth + 1 && image.getBoundingClientRect().width <= content.clientWidth + 1;
      });
      assert(fits, `Diagram does not fit its viewer at ${width}px ${theme} ${route}`);
      const colors = await viewer.evaluate(node => ({ canvas: getComputedStyle(node.querySelector('.dialog-content')).backgroundColor, image: getComputedStyle(node.querySelector('.dialog-content img')).backgroundColor }));
      assert(colors.canvas === background && colors.image === background, `The shared viewer background does not match ${theme} mode for ${route}: ${JSON.stringify(colors)}`);
      const present = viewer.locator('[data-diagram-present]');
      if (await present.isVisible()) {
        await present.click();
        await page.waitForFunction(() => document.querySelector('#diagram-viewer').classList.contains('is-presenting'));
        assert(await viewer.locator('.dialog-content').evaluate(node => getComputedStyle(node).backgroundColor) === background, `Presentation background does not match ${theme} mode for ${route}`);
        await viewer.locator('[data-diagram-menu]').hover();
        assert(await viewer.locator('[data-diagram-menu]').evaluate(button => getComputedStyle(button).borderTopColor === 'rgb(199, 70, 52)' && getComputedStyle(button.querySelector('svg')).color === 'rgb(199, 70, 52)' && getComputedStyle(button).backgroundColor === 'rgba(0, 0, 0, 0)'), 'Thumbnail menu hover uses a gray fill instead of red border and SVG');
        await viewer.locator('[data-diagram-menu]').click();
        assert(await viewer.locator('[data-diagram-menu]').evaluate(button => getComputedStyle(button).backgroundColor === 'rgb(199, 70, 52)' && getComputedStyle(button).borderTopColor === 'rgb(199, 70, 52)' && getComputedStyle(button.querySelector('svg')).color === 'rgb(255, 255, 255)'), 'Opened thumbnail menu is not red with a white icon');
        await page.waitForFunction(() => getComputedStyle(document.querySelector('#diagram-viewer'), '::after').opacity === '1');
        const rail = await viewer.locator('.diagram-presentation-nav').evaluate(nav => ({ width: nav.offsetWidth, padding: getComputedStyle(nav).paddingLeft, thumbnail: nav.querySelector('img').offsetWidth }));
        assert(rail.width === 220 && rail.padding === '12px' && rail.thumbnail >= 180, `Thumbnail navigation shrinks at ${width}px ${JSON.stringify(rail)}`);
        const before = await viewer.locator('.dialog-content img').getAttribute('src');
        for (const region of ['.dialog-content', '#diagram-description']) {
        if (region === '#diagram-description') {
          await viewer.locator('[data-diagram-menu]').click();
          await page.waitForFunction(() => getComputedStyle(document.querySelector('#diagram-viewer'), '::after').opacity === '1');
        }
        const point = await viewer.locator(region).evaluate(content => {
          const box = content.getBoundingClientRect(), dialog = document.querySelector('#diagram-viewer'), style = getComputedStyle(dialog, '::after'), popup = getComputedStyle(document.querySelector('#site-search'), '::backdrop');
          if (style.backgroundColor !== popup.backgroundColor || style.backdropFilter !== popup.backdropFilter || style.pointerEvents !== 'auto') throw new Error('Presentation glass does not match the popup backdrop');
          const point = { x: box.right - 20, y: box.top + Math.min(30, box.height / 2) };
          if (document.elementFromPoint(point.x, point.y) !== dialog) throw new Error('Glass does not cover the image and caption');
          return point;
        });
        await page.mouse.click(point.x, point.y);
        assert(await viewer.locator('[data-diagram-menu]').getAttribute('aria-expanded') === 'false' && await viewer.locator('.dialog-content img').getAttribute('src') === before && await viewer.evaluate(node => node.open && node.classList.contains('is-presenting')), 'Presentation backdrop advances the image, exits presentation or leaves thumbnails open');
        }
      }
    }
  }
  return 'PASS: shared header edges, fixed logo and mobile chat button; responsive diagrams without horizontal scroll; standard thumbnails and dismissible glass in both themes.';
}

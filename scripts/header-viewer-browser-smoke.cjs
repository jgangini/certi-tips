// playwright-cli -s=header-viewer open http://127.0.0.1:4173/certitips/
// playwright-cli -s=header-viewer run-code --filename scripts/header-viewer-browser-smoke.cjs
// DOM checks only; no screenshots.
async (page) => {
  const base = `${new URL(page.url()).origin}/certitips/`;
  const assert = (value, message) => { if (!value) throw new Error(message); };
  await page.addInitScript(() => sessionStorage.clear());
  const routes = ['certiquiz/', '', 'cursos/', '1Z0-1122-26/practice/', 'certitube/', 'certichat/'];
  for (const width of [1576, 1280, 1195, 900, 798, 619, 480, 320]) {
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
  for (const route of ['1Z0-1122-26/generative-ai/', 'CDMP-DMF/governance/']) {
    for (const [theme, background] of [['light', 'rgb(255, 255, 255)'], ['dark', 'rgb(0, 0, 0)']]) {
      await page.goto(`${base}${route}`);
      if ((await page.locator('html').getAttribute('data-theme') === 'dark') !== (theme === 'dark')) await page.locator('[data-theme-toggle]').click();
      await page.locator('[data-diagram]').first().click();
      const viewer = page.locator('#diagram-viewer');
      await viewer.waitFor();
      const colors = await viewer.evaluate(node => ({ canvas: getComputedStyle(node.querySelector('.dialog-content')).backgroundColor, image: getComputedStyle(node.querySelector('.dialog-content img')).backgroundColor }));
      assert(colors.canvas === background && colors.image === background, `The shared viewer background does not match ${theme} mode for ${route}: ${JSON.stringify(colors)}`);
      const present = viewer.locator('[data-diagram-present]');
      if (await present.isVisible()) {
        await present.click();
        assert(await viewer.locator('.dialog-content').evaluate(node => getComputedStyle(node).backgroundColor) === background, `Presentation background does not match ${theme} mode for ${route}`);
      }
    }
  }
  return 'PASS: shared header edges, 36px logo and matching mobile chat button across six page types at eight widths; CertiQuiz breadcrumb aligns with theme button; diagram viewer backgrounds match both themes.';
}

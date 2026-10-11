// Run with playwright-cli -s=chatexplorer run-code --filename scripts/certichat-explorer-smoke.cjs.
// Uses the public graph snapshot and isolated browser state; no screenshots or paid requests.
async page => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const browser = page.context().browser(), context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const tab = await context.newPage(), base = new URL('/certi-tips/', page.url()).href, requests = [], errors = [];
  tab.on('request', request => requests.push(request.url()));
  tab.on('pageerror', error => errors.push(error.message));
  try {
    await tab.goto(`${base}certichat/`);
    await tab.locator('[data-graph-workspace]').waitFor({ state: 'visible' });
    const initial = await tab.locator('[data-concept-title]').textContent();
    assert(initial === 'oracle cloud infrastructure', 'Real OCI concept was not selected');
    assert((await tab.locator('[data-graph-meta]').textContent()).includes('Instantánea del'), 'Missing snapshot provenance');
    assert(await tab.locator('.chat-flow li').count() === 10, 'Query or index update flow is incomplete');
    assert(await tab.locator('.sidebar').count() === 0, 'Standalone page inherits a course sidebar');
    const geometry = [];
    for (const width of [1280, 800, 360, 320]) {
      await tab.setViewportSize({ width, height: 900 });
      await tab.waitForFunction(() => {
        const canvas = document.querySelector('[data-graph-canvas]'), svg = canvas.querySelector('svg');
        return Math.abs(Math.max(260, canvas.clientWidth) - svg.viewBox.baseVal.width) < 1;
      });
      const measured = await tab.evaluate(() => {
        const canvas = document.querySelector('[data-graph-canvas]'), svg = canvas.querySelector('svg');
        const overflow = [...document.querySelectorAll('.chat-explorer-page *')].filter(element => {
          const box = element.getBoundingClientRect();
          return box.width && (box.left < -1 || box.right > innerWidth + 1);
        }).map(element => element.tagName + '.' + element.className);
        return { width: innerWidth, page: document.documentElement.scrollWidth, overflow, renderedFont: parseFloat(getComputedStyle(svg.querySelector('text')).fontSize) * svg.getBoundingClientRect().width / svg.viewBox.baseVal.width, nodes: svg.querySelectorAll('.graph-node').length };
      });
      assert(measured.page <= width + 1 && !measured.overflow.length, `Explorer overflows at ${width}: ${measured.overflow}`);
      assert(measured.renderedFont >= 13.8 && measured.nodes <= 7, `Graph becomes unreadable or renders too many nodes at ${width}`);
      geometry.push(measured);
    }
    await tab.setViewportSize({ width: 1280, height: 900 });
    const search = tab.getByRole('searchbox', { name: 'Buscar un concepto' });
    await search.fill('agent');
    assert(await tab.locator('#chat-concept-results button').count() > 0, 'Search missed real agent concepts');
    await search.press('Tab');
    assert(await tab.locator('#chat-concept-results button').first().evaluate(element => document.activeElement === element), 'Search results are not keyboard accessible');
    const expected = await tab.locator('#chat-concept-results button').first().textContent();
    await tab.keyboard.press('Enter');
    assert(await tab.locator('[data-concept-title]').textContent() === expected, 'Keyboard result selection did not change the graph');
    await search.fill('oracle cloud infrastructure');
    await tab.locator('#chat-concept-results').getByRole('button', { name: initial, exact: true }).click();
    const next = tab.getByRole('button', { name: 'Siguiente', exact: true });
    assert(await next.isEnabled(), 'Real OCI concept lacks paged neighbors');
    await next.click();
    assert((await tab.locator('[data-relations-page]').textContent()).startsWith('7–'), 'Next relationship page did not update');
    await tab.getByRole('button', { name: 'Anterior', exact: true }).click();
    const graphNode = tab.locator('.graph-node[role="button"]').first();
    const graphLabel = (await graphNode.getAttribute('aria-label')).replace('Explorar ', '');
    await graphNode.focus();
    await graphNode.press('Enter');
    assert(await tab.locator('[data-concept-title]').textContent() === graphLabel, 'SVG neighbor cannot be selected with the keyboard');
    await search.fill('zzzz-no-such-concept');
    assert(await tab.locator('.chat-graph-empty').isVisible(), 'Empty search has no feedback');
    for (const theme of ['dark', 'light']) {
      await tab.evaluate(value => document.documentElement.dataset.theme = value, theme);
      const colors = await tab.locator('.graph-node.is-selected').evaluate(element => ({ text: getComputedStyle(element.querySelector('text')).fill, background: getComputedStyle(element.querySelector('rect')).fill }));
      assert(colors.text === 'rgb(255, 255, 255)' && colors.background === 'rgb(199, 70, 52)', `${theme} graph lost its selected-node contrast`);
    }
    assert(await tab.getByRole('link', { name: 'Tu consulta', exact: true }).getAttribute('href') === '#consulta', 'Query flow navigation is missing');
    assert(!requests.some(url => /18741|cloudtechnext|openrouter|turnstile/.test(url)), 'Informational page contacted a private or paid API');
    await tab.route('**/assets/certichat/graph.json', route => route.fulfill({ json: { version: 'test', generatedAt: new Date().toISOString(), nodes: [{ id: 'a', label: '<img src="https://evil.invalid/x" onerror="alert(1)">', type: 'Entity' }], edges: [] } }));
    await tab.reload();
    await tab.locator('[data-graph-workspace]').waitFor({ state: 'visible' });
    assert(await tab.locator('[data-concept-title] img, [data-graph-canvas] img, #chat-concept-results img').count() === 0, 'Graph label activated HTML');
    assert(!requests.some(url => url.includes('evil.invalid')), 'Graph label made an external request');
    assert((await tab.locator('[data-relations-page]').textContent()) === 'Sin conexiones registradas', 'Isolated concept has no accessible explanation');
    await tab.unroute('**/assets/certichat/graph.json');
    await tab.route('**/assets/certichat/graph.json', route => route.fulfill({ status: 503, body: '{}' }));
    await tab.reload();
    await tab.getByRole('status').filter({ hasText: 'No se pudo cargar la instantánea' }).waitFor();
    assert(await tab.locator('[data-graph-workspace]').isHidden(), 'Unavailable graph exposes broken controls');
    assert(!errors.length, `Page errors: ${errors.join('; ')}`);
    return { checks: ['real snapshot', 'query and update flows', '1280/800/360/320 geometry', 'readable bounded SVG', 'search and keyboard selection', 'paged neighbors', 'SVG keyboard navigation', 'empty state', 'dark and light contrast', 'no private or paid API', 'inert graph labels', 'isolated nodes', 'fetch failure'], geometry, errors };
  } finally { await context.close(); }
}

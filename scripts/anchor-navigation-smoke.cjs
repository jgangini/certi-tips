// playwright-cli -s=anchors run-code --filename scripts/anchor-navigation-smoke.cjs
// Real browser navigation with delayed local images and a mocked chat; no screenshots or paid calls.
async page => {
  const base = new URL('/certitips/', page.url());
  if (base.origin !== 'http://127.0.0.1:4173') throw new Error('Run against the local preview on 127.0.0.1:4173.');
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const context = await page.context().browser().newContext({ reducedMotion: 'reduce' });
  const errors = [], checks = [], publicBase = new URL('https://jgangini.github.io/certitips/');
  const route = '1Z0-1157-26/oci-enterprise/';
  const target = 'primeros-pasos-verificados';
  let releaseImages, waitForImages;
  const graph = { version: 'a'.repeat(64), nodes: [{ id: '00000000-0000-4000-8000-000000000001', label: 'administrador de oci' }], edges: [] };
  await context.route('**/*', async request => {
    const url = new URL(request.request().url());
    if (![base.origin, publicBase.origin].includes(url.origin)) return request.abort('blockedbyclient');
    if (url.pathname.startsWith('/api/')) return request.fulfill({ json: { mode: 'LOCAL', authenticated: true, verificationRequired: false, available: true, quota: { remaining: 20, limit: 20, refreshHours: 6, resetAt: null, minuteRemaining: 2, retryAfter: 0 } } });
    if (url.pathname.endsWith('/assets/certichat/graph.json')) return request.fulfill({ json: graph });
    if (/\/assets\/(diagrams|illustrations)\//.test(url.pathname) && waitForImages) await waitForImages;
    const response = await request.fetch({ url: `${base.origin}${url.pathname}${url.search}` });
    if (!request.request().isNavigationRequest()) return request.fulfill({ response });
    return request.fulfill({ response, body: (await response.text()).replace(/data-api="[^"]+"/, `data-api="${publicBase.origin}"`) });
  });
  const tab = await context.newPage();
  tab.on('pageerror', error => errors.push(error.message));
  const aligned = async id => {
    await tab.waitForFunction(id => {
      const heading = document.getElementById(id), expected = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
      return heading && Math.abs(heading.getBoundingClientRect().top - expected) <= 2;
    }, id);
    return tab.locator(`#${id}`).evaluate(element => element.getBoundingClientRect().top);
  };
  try {
    for (const width of [1280, 390]) for (const id of [target, 'desplegar-y-escalar']) {
      await tab.setViewportSize({ width, height: 900 });
      waitForImages = new Promise(resolve => { releaseImages = resolve; });
      await tab.goto(`${publicBase.href}${route}#${id}`, { waitUntil: 'domcontentloaded' });
      const before = await aligned(id);
      assert(await tab.locator('.diagram img').evaluateAll(images => images.every(image => Number(image.getAttribute('width')) > 0 && Number(image.getAttribute('height')) > 0)), 'A lazy diagram has no reserved native dimensions');
      const complete = tab.locator('.diagram img').evaluateAll(images => Promise.all(images.map(image => { image.loading = 'eager'; return image.decode(); })));
      releaseImages(); waitForImages = null;
      await complete;
      const after = await aligned(id);
      assert(Math.abs(before - after) <= 2, `Lazy images shifted ${id} at ${width}px: ${before} → ${after}`);
      checks.push({ width, id, before, after });
      await tab.reload();
      await aligned(id);
      if (width < 800) await tab.getByRole('button', { name: 'Contenido del curso', exact: true }).click();
      await tab.locator('.nav-section-link').filter({ hasText: /^Primeros pasos verificados$/ }).click();
      await aligned(target);
    }
    await tab.setViewportSize({ width: 1280, height: 900 });
    await tab.goto(`${publicBase.href}certichat/`);
    await tab.waitForFunction(() => Number(document.querySelector('[data-graph-canvas]')?.dataset.drawCount) > 0);
    const source = { nodeId: graph.nodes[0].id, title: 'Agentes en OCI Enterprise AI · Primeros pasos verificados', url: `${publicBase.href}${route}#${target}` };
    await tab.evaluate(({ graph, source }) => window.dispatchEvent(new CustomEvent('certichat:trace', { detail: { status: 'ready', trace: { version: graph.version, nodes: graph.nodes.map(node => node.id), edges: [], sources: [source], truncated: false } } })), { graph, source });
    await tab.locator('[data-graph-active] button').click();
    const link = tab.getByRole('link', { name: `Profundizar: ${source.title}`, exact: true });
    await link.waitFor({ state: 'visible' });
    await Promise.all([tab.waitForURL(source.url), link.click()]);
    await tab.locator('#certichat-panel').waitFor({ state: 'visible' });
    await aligned(target);
    assert(await tab.evaluate(() => sessionStorage.getItem(`certichat:${document.querySelector('[data-certichat]').dataset.siteRoot}:reference`) === null), 'The reference marker was not consumed');
    checks.push('graph card click opens the actual guide anchor and retains the chat');
    await tab.goBack();
    assert(new URL(tab.url()).pathname === `${base.pathname}certichat/`, 'Back does not return to the graph');
    await tab.goForward();
    await aligned(target);
    checks.push('browser back/forward preserves the guide anchor');
    assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
    return { checks, errors };
  } finally {
    releaseImages?.();
    await context.close();
  }
}

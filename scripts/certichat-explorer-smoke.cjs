// Run with playwright-cli -s=chatexplorer run-code --filename scripts/certichat-explorer-smoke.cjs.
// DOM and accessible-state checks, isolated mocked API, real public graph; no screenshots or paid calls.
async page => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const base = new URL('/certi-tips/', page.url()), context = await page.context().browser().newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const tab = await context.newPage(), requests = [], calls = [], errors = [], checks = [], geometry = [];
  let snapshot, graphOverride, reply = {}, releaseReply, pendingReply;
  const quota = { remaining: 20, limit: 20, refreshHours: 6, resetAt: null, minuteRemaining: 2, retryAfter: 0 };
  const session = { mode: 'LOCAL', authenticated: true, verificationRequired: false, available: true, quota };
  tab.on('request', request => requests.push(request.url()));
  tab.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base.origin) return route.abort('blockedbyclient');
    if (url.pathname.startsWith('/api/')) {
      calls.push({ path: url.pathname, method: request.method(), body: request.postDataJSON() });
      if (url.pathname !== '/api/chat') return route.fulfill({ json: session });
      const response = reply;
      if (pendingReply) await pendingReply;
      return route.fulfill({ status: response.status || 200, json: response.status ? { detail: 'simulated failure' } : { answer: response.answer, graphTrace: response.trace, sources: [], quota, contentVersion: 'different-manifest-version' } });
    }
    if (url.pathname.endsWith('/assets/certichat/graph.json')) {
      if (graphOverride === 'error') return route.fulfill({ status: 503, body: '{}' });
      if (graphOverride) return route.fulfill({ json: graphOverride });
      const response = await route.fetch();
      snapshot = await response.json();
      return route.fulfill({ response });
    }
    if (!request.isNavigationRequest()) return route.continue();
    const response = await route.fetch();
    return route.fulfill({ response, body: (await response.text()).replace(/data-api="[^"]+"/, `data-api="${base.origin}"`) });
  });
  const canvas = tab.locator('canvas[data-graph-canvas]');
  const ready = () => tab.waitForFunction(() => Number(document.querySelector('canvas[data-graph-canvas]')?.dataset.drawCount) > 0);
  const state = () => canvas.evaluate(element => ({ nodes: Number(element.dataset.nodeCount), edges: Number(element.dataset.edgeCount), activeNodes: Number(element.dataset.activeNodeCount), activeEdges: Number(element.dataset.activeEdgeCount), scale: Number(element.dataset.scale), panX: Number(element.dataset.panX), panY: Number(element.dataset.panY) }));
  const active = async (ids, edges = []) => {
    await tab.waitForFunction(({ ids, edges }) => {
      const data = document.querySelector('canvas[data-graph-canvas]')?.dataset;
      const actual = [...document.querySelectorAll('[data-graph-active] button[data-concept]')].map(item => item.dataset.concept).sort();
      return Number(data?.activeNodeCount) === ids.length && Number(data?.activeEdgeCount) === edges && JSON.stringify(actual) === JSON.stringify([...ids].sort());
    }, { ids, edges: edges.length });
    const labels = await tab.locator('[data-graph-active] button[data-concept]').evaluateAll(items => items.map(item => ({ id: item.dataset.concept, label: item.textContent })));
    assert(labels.every(item => snapshot.nodes.some(node => node.id === item.id && node.label === item.label)), 'Active concepts fabricated names absent from the public graph');
    const names = new Map(snapshot.nodes.map(node => [node.id, node.label]));
    const expectedRelations = edges.map(edge => `${names.get(edge.source)} → ${edge.label || 'relacionado con'} → ${names.get(edge.target)}`).sort();
    const actualRelations = (await tab.locator('[data-graph-active-relations] li').allTextContents()).sort();
    assert(JSON.stringify(actualRelations) === JSON.stringify(expectedRelations), 'Accessible relationships do not match the actual trace');
  };
  const openChat = async () => {
    await tab.locator('#certichat-panel').waitFor({ state: 'visible' });
    await tab.waitForFunction(() => document.querySelector('deep-chat')?.validateInput('Prueba') && !document.querySelector('[data-chat-clear]').disabled);
  };
  const send = async (question, trace, status = 0) => {
    await openChat();
    reply = { answer: `Respuesta: ${question}.`, trace, status };
    const input = tab.getByRole('textbox', { name: 'Escribe tu consulta', exact: true });
    await input.fill('');
    await input.click();
    await input.pressSequentially(question);
    assert(await input.innerText() === question, 'Typing did not reach the editable chat input');
    await input.press('Enter');
  };
  const answered = expected => tab.waitForFunction(expected => {
    const chat = document.querySelector('deep-chat'), message = chat?.getMessages().at(-1);
    return message?.role === 'ai' && message.text.includes(expected) && chat.validateInput('Siguiente');
  }, expected);
  try {
    const start = Date.now();
    await tab.goto(`${base.href}certichat/`);
    await ready();
    const loadMs = Date.now() - start, initial = await state();
    assert(snapshot.nodes.length >= 4000 && snapshot.edges.length >= 10000, 'Smoke requires the real published graph, not a reduced fixture');
    assert(initial.nodes === snapshot.nodes.length && initial.edges === snapshot.edges.length, 'Network omitted public graph nodes or edges');
    assert(loadMs < 15000, `Real graph startup took ${loadMs} ms`);
    await active([]);
    assert(await tab.locator('[data-graph-active-fit]').isDisabled(), 'Empty map offers a nonexistent active trace');
    const provenance = await tab.locator('[data-graph-meta]').textContent();
    assert(provenance.includes('Instantánea del') && provenance.includes('Fuente: Cognee') && provenance.includes(snapshot.version.slice(0, 12)), 'Missing graph source, snapshot date or version');
    assert(await tab.locator('.sidebar').count() === 0, 'Standalone page inherits a course sidebar');
    assert(await tab.locator('#consulta, .chat-explorer-intro, .chat-explorer-breadcrumb, .chat-explorer-flow, .chat-graph-inspector, [data-explorer-chat]').count() === 0, 'Removed introductory or exploration sections returned');
    await openChat();
    assert(await tab.locator('[data-chat-close]').isDisabled(), 'Explorer permits closing its persistent chat');
    assert(await tab.locator('[data-chat-open]').isHidden(), 'Auto-opened chat leaves a redundant launcher');
    await tab.getByRole('textbox', { name: 'Escribe tu consulta', exact: true }).press('Escape');
    assert(await tab.locator('#certichat-panel').isVisible(), 'Escape closes the persistent explorer chat');
    checks.push('real 4k/10k graph initialized within 15s', 'initial graph has no active trace', 'snapshot provenance');
    checks.push('removed intro/sections stay absent', 'chat opens automatically with disabled X and ignores Escape');
    const beforeZoom = await state();
    await tab.locator('[data-graph-zoom-in]').click();
    await tab.waitForFunction(scale => Number(document.querySelector('canvas[data-graph-canvas]').dataset.scale) > scale, beforeZoom.scale);
    await tab.locator('[data-graph-zoom-out]').click();
    await canvas.focus();
    assert(await canvas.evaluate(element => document.activeElement === element), 'Network canvas is not keyboard focusable');
    const beforePan = await state();
    await canvas.press('ArrowRight');
    await tab.waitForFunction(x => Number(document.querySelector('canvas[data-graph-canvas]').dataset.panX) !== x, beforePan.panX);
    await canvas.press('+');
    await canvas.press('Home');
    await tab.locator('[data-graph-fit]').click();
    checks.push('zoom and keyboard pan/fit');

    const first = snapshot.edges.find(edge => edge.source !== edge.target);
    const firstIds = [first.source, first.target];
    const second = snapshot.edges.find(edge => edge.source !== edge.target && !firstIds.includes(edge.source) && !firstIds.includes(edge.target));
    assert(second, 'Real graph lacks disjoint trace candidates');
    const makeTrace = edge => ({ version: snapshot.version, nodes: [edge.source, edge.target], edges: [edge], truncated: false });
    const trace1 = makeTrace(first), trace2 = makeTrace(second), empty = { version: snapshot.version, nodes: [], edges: [], truncated: false };
    await send('Consulta uno', trace1);
    await answered('Respuesta: Consulta uno.');
    await active(trace1.nodes, trace1.edges);
    assert(await tab.locator('[data-graph-active-fit]').isEnabled(), 'Received trace cannot be fitted');
    await tab.locator('[data-graph-active-fit]').click();
    await tab.getByRole('link', { name: 'Ver mapa de conocimiento', exact: true }).click();
    assert(await canvas.evaluate(element => document.activeElement === element) && await tab.locator('#certichat-panel').isVisible(), 'Brain control does not focus the map while keeping chat open');
    await active(trace1.nodes, trace1.edges);
    assert(calls.at(-1).path === '/api/chat' && calls.at(-1).body.message === 'Consulta uno', 'Real chat UI did not send the question');
    checks.push('real textbox Enter publishes matching-version graphTrace');

    pendingReply = new Promise(resolve => releaseReply = resolve);
    await send('Consulta dos', trace2);
    await tab.waitForFunction(() => !document.querySelector('deep-chat').validateInput('Mientras espera'));
    await active([]);
    releaseReply(); pendingReply = undefined;
    await answered('Respuesta: Consulta dos.');
    await active(trace2.nodes, trace2.edges);
    checks.push('new query clears prior highlights while pending', 'second trace replaces first IDs, never accumulates');

    const countBeforeReload = calls.filter(call => call.path === '/api/chat').length;
    await tab.reload(); await ready(); await active(trace2.nodes, trace2.edges);
    assert(calls.filter(call => call.path === '/api/chat').length === countBeforeReload, 'Restoring trace submits a paid query');
    await tab.evaluate(() => {
      const key = `certichat:${document.querySelector('[data-certichat]').dataset.siteRoot}:graph`, saved = JSON.parse(sessionStorage.getItem(key));
      saved.updatedAt = Date.now() - 86400001; sessionStorage.setItem(key, JSON.stringify(saved));
    });
    await tab.reload(); await ready(); await active([]);
    checks.push('same-tab reload restores trace without another query', '24-hour expired trace stays gray');

    await send('Consulta antes del error', trace1); await answered('Respuesta: Consulta antes del error.'); await active(trace1.nodes, trace1.edges);
    await send('Consulta fallida', undefined, 503); await answered('El servicio no está disponible'); await active([]);
    await send('Consulta antes del rechazo', trace1); await answered('Respuesta: Consulta antes del rechazo.'); await active(trace1.nodes, trace1.edges);
    await send('Consulta sin evidencia', empty); await answered('Respuesta: Consulta sin evidencia.'); await active([]);
    await send('Consulta con otra versión', { ...trace2, version: 'f'.repeat(64) }); await answered('Respuesta: Consulta con otra versión.'); await active([]);
    assert(/versi[oó]n/i.test(await tab.locator('[data-graph-trace]').textContent()), 'Version mismatch has no accessible explanation');
    await send('Respuesta antigua sin traza'); await answered('Respuesta: Respuesta antigua sin traza.'); await active([]);
    checks.push('API errors and empty evidence clear trace', 'version mismatch stays gray', 'legacy response without trace stays gray');

    await send('Consulta antes de borrar', trace1); await answered('Respuesta: Consulta antes de borrar.'); await active(trace1.nodes, trace1.edges);
    await tab.locator('[data-chat-clear]').click();
    await tab.locator('[data-chat-confirm-yes]').click();
    await tab.locator('[data-chat-confirm]').waitFor({ state: 'hidden' });
    await active([]);
    assert(calls.some(call => call.path === '/api/conversation' && call.method === 'DELETE'), 'Clear confirmation did not use the conversation API');
    await tab.reload(); await ready(); await active([]);
    checks.push('confirmed clear removes active and persisted trace');

    for (const width of [1440, 1280, 1024, 800, 360, 320]) {
      await tab.setViewportSize({ width, height: 900 });
      await tab.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await tab.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await openChat();
      const measured = await tab.evaluate(() => {
        const box = element => { const b = element.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
        const map = document.querySelector('[data-knowledge-graph]'), chat = document.querySelector('#certichat-panel');
        const style = element => { const s = getComputedStyle(element); return { border: s.borderTopWidth, color: s.borderTopColor, position: s.position }; };
        return { width: innerWidth, page: document.documentElement.scrollWidth, map: box(map), chat: box(chat), canvas: box(map.querySelector('canvas')), mapHeading: box(map.querySelector('header')), chatHeading: box(chat.querySelector('header')), mapStyle: style(map), chatStyle: style(chat), bodyOverflow: getComputedStyle(document.body).overflow };
      });
      assert(measured.page <= width + 1 && measured.canvas.left >= -1 && measured.canvas.right <= width + 1 && measured.canvas.height >= 200, `Map overflows or collapses at ${width}: ${JSON.stringify(measured)}`);
      assert(measured.mapStyle.border === '4px' && measured.chatStyle.border === '4px' && measured.mapStyle.color === measured.chatStyle.color, `Map and chat lost their matching red top borders at ${width}`);
      assert(Math.abs(measured.mapHeading.height - measured.chatHeading.height) <= 1, `Map/chat header heights diverge at ${width}`);
      if (width >= 1024) {
        assert(measured.map.right <= measured.chat.left && Math.abs(measured.map.top - measured.chat.top) <= 1 && Math.abs(measured.map.height - measured.chat.height) <= 1, `Desktop panels are not aligned side by side at ${width}`);
      } else {
        assert(measured.map.bottom <= measured.chat.top && Math.abs(measured.map.left - measured.chat.left) <= 1 && Math.abs(measured.map.width - measured.chat.width) <= 1, `Mobile panels do not stack with matching widths at ${width}`);
        assert(measured.chatStyle.position !== 'fixed' && measured.bodyOverflow !== 'hidden', `Mobile explorer still uses a fullscreen overlay at ${width}`);
      }
      assert(await tab.locator('[data-chat-close]').isDisabled() && await tab.locator('#certichat-panel').isVisible(), `Chat can be closed at ${width}`);
      geometry.push(measured);
    }
    checks.push('aligned desktop map/chat and in-page mobile stack at 1440/1280/1024/800/360/320');
    for (const theme of ['dark', 'light']) {
      await tab.evaluate(value => document.documentElement.dataset.theme = value, theme);
      await tab.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert((await state()).nodes === snapshot.nodes.length, `${theme}: theme change dropped the graph`);
    }
    checks.push('both themes retain the complete network');

    graphOverride = { version: snapshot.version, generatedAt: new Date().toISOString(), nodes: [{ id: first.source, label: '<img src="https://evil.invalid/x" onerror="alert(1)">', type: 'Entity' }], edges: [] };
    await tab.reload(); await ready();
    await send('Consulta de etiqueta', { version: snapshot.version, nodes: [first.source], edges: [], truncated: false });
    await answered('Respuesta: Consulta de etiqueta.');
    await tab.waitForFunction(() => Number(document.querySelector('canvas[data-graph-canvas]').dataset.activeNodeCount) === 1);
    const labelButton = tab.locator('[data-graph-active] button[data-concept]');
    assert(await labelButton.textContent() === graphOverride.nodes[0].label && await labelButton.locator('img').count() === 0, 'Graph label activated HTML');
    await labelButton.focus(); await labelButton.press('Enter');
    const selection = tab.locator('[data-graph-selection]');
    assert(await selection.textContent() === `${graphOverride.nodes[0].label}. 0 conceptos relacionados.` && await selection.locator('img').count() === 0, 'Selected concept announcement loses its safe label or relation count');
    assert(!requests.some(url => url.includes('evil.invalid')), 'Graph label made an external request');
    assert((await state()).nodes === 1 && (await state()).edges === 0, 'Isolated concept could not be rendered');
    graphOverride = 'error';
    await tab.reload();
    await tab.locator('[data-graph-status]').filter({ hasText: 'No se pudo cargar la instantánea' }).waitFor();
    assert(await tab.locator('[data-graph-workspace]').isHidden(), 'Unavailable graph exposes broken controls');
    checks.push('inert labels, isolated concept and snapshot failure');
    assert(!requests.some(url => new URL(url).origin !== base.origin), 'QA attempted a private or external API');
    assert(!errors.length, `Page errors: ${errors.join('; ')}`);
    return { checks, loadMs, graph: { nodes: snapshot.nodes.length, edges: snapshot.edges.length }, geometry, apiCalls: calls.length, errors };
  } catch (error) {
    const chat = await tab.evaluate(() => { const element = document.querySelector('deep-chat'), input = element?.shadowRoot?.querySelector('[role="textbox"]'); return { messages: element?.getMessages(), valid: element?.validateInput('Prueba'), text: input?.innerText, editable: input?.contentEditable, clearDisabled: document.querySelector('[data-chat-clear]')?.disabled, status: document.querySelector('[data-chat-status]')?.textContent }; }).catch(() => null);
    throw new Error(`${error.message}; passed=${JSON.stringify(checks)}; state=${JSON.stringify(await state().catch(() => null))}; calls=${JSON.stringify(calls.map(call => ({ path: call.path, question: call.body?.message })))}; chat=${JSON.stringify(chat)}; pageErrors=${JSON.stringify(errors)}`);
  } finally { releaseReply?.(); await context.close(); }
}

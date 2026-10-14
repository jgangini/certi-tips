// Run with playwright-cli -s=chatexplorer run-code --filename scripts/certichat-explorer-smoke.cjs.
// DOM and accessible-state checks, isolated mocked API, real public graph; no screenshots or paid calls.
async page => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const base = new URL('/certitips/', page.url()), context = await page.context().browser().newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', timezoneId: 'UTC' });
  const tab = await context.newPage(), requests = [], calls = [], errors = [], checks = [], geometry = [];
  let snapshot, graphOverride, reply = {}, releaseReply, pendingReply, releaseGraph, pendingGraph;
  let indexing = true, healthAvailable = true, serverGraph, graphAvailable = true, checkedAt = '2026-10-13T16:00:00+00:00';
  const quota = { remaining: 20, limit: 20, refreshHours: 6, resetAt: null, minuteRemaining: 2, retryAfter: 0 };
  const session = { mode: 'LOCAL', authenticated: true, verificationRequired: false, available: true, quota };
  tab.on('request', request => requests.push(request.url()));
  tab.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base.origin) return route.abort('blockedbyclient');
    if (url.pathname.startsWith('/api/')) {
      calls.push({ path: url.pathname, method: request.method(), body: request.postDataJSON() });
      if (url.pathname === '/api/health') return route.fulfill({ status: healthAvailable ? 200 : 503, json: { ok: healthAvailable, knowledge: { version: (serverGraph || snapshot)?.version, indexing, checkedAt } } });
      if (url.pathname === '/api/graph') return route.fulfill({ status: graphAvailable ? 200 : 503, json: serverGraph || snapshot });
      if (url.pathname !== '/api/chat') return route.fulfill({ json: session });
      const response = reply;
      if (pendingReply) await pendingReply;
      return route.fulfill({ status: response.status || 200, json: response.status ? { detail: 'simulated failure' } : { answer: response.answer, graphTrace: response.trace, sources: response.trace?.sources || [], quota, contentVersion: 'different-manifest-version' } });
    }
    if (url.pathname.endsWith('/assets/certichat/graph.json')) {
      if (pendingGraph) await pendingGraph;
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
    const totals = await state(), counts = await tab.locator('[data-graph-meta] dd').allTextContents();
    assert(counts[0] === `${ids.length}/${totals.nodes.toLocaleString('es')}` && counts[1] === `${edges.length}/${totals.edges.toLocaleString('es')}`, 'Footer counts do not match validated retrieved concepts/relationships and map totals');
    if (ids.length) assert(!(await tab.locator('[data-graph-trace]').textContent()).trim(), 'Retrieved counts still appear above the tags');
    const labels = await tab.locator('[data-graph-active] button[data-concept]').evaluateAll(items => items.map(item => ({ id: item.dataset.concept, label: item.querySelector('.chat-graph-label').textContent, number: item.querySelector('.chat-graph-number').textContent })));
    assert(labels.every((item, index) => item.number === String(index + 1)), 'Concept numbers are not consecutive in their visible order');
    assert(labels.every(item => snapshot.nodes.some(node => node.id === item.id && node.label === item.label)), 'Active concepts fabricated names absent from the public graph');
    assert(labels.every((item, index) => !index || labels[index - 1].label.localeCompare(item.label, 'es', { numeric: true, sensitivity: 'base' }) <= 0), 'Retrieved concepts are not alphabetically ordered');
    const stripState = await tab.locator('.chat-graph-evidence').evaluate(element => {
      const strip = element.querySelector('[data-graph-active]'), buttons = [...strip.querySelectorAll('button')], style = getComputedStyle(strip);
      const row = buttons[0]?.getBoundingClientRect().top;
      const controls = [...element.querySelectorAll('[data-graph-scroll]')], box = strip.getBoundingClientRect();
      return { overflowX: style.overflowX, overflowY: style.overflowY, scrollbar: style.scrollbarWidth,
        controls: controls.map(button => { const b = button.getBoundingClientRect(); return { left: b.left, right: b.right, width: b.width, disabled: button.disabled }; }), left: box.left, right: box.right,
        singleRow: buttons.every(button => Math.abs(button.getBoundingClientRect().top - row) <= 1), page: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth };
    });
    assert(stripState.overflowX === 'auto' && stripState.overflowY === 'hidden' && stripState.scrollbar === 'none', 'Concept strip does not hide its native scrollbar');
    assert(stripState.singleRow && stripState.page <= stripState.viewport, 'Concepts wrap or overflow the page');
    assert(stripState.controls.length === 2, 'Concept strip lacks its two triangular controls');
    assert(stripState.controls.every(control => !control.disabled || control.width === 0), 'Hidden arrows reserve blank space');
    if (stripState.controls[0].width) assert(stripState.controls[0].right <= stripState.left, 'Left triangle does not flank the concept strip');
    if (stripState.controls[1].width) assert(stripState.controls[1].left >= stripState.right, 'Right triangle does not flank the concept strip');
    const names = new Map(snapshot.nodes.map(node => [node.id, node.label]));
    const expectedRelations = edges.map(edge => `${names.get(edge.source)} → ${edge.label || 'relacionado con'} → ${names.get(edge.target)}`).sort();
    const actualRelations = (await tab.locator('[data-graph-active-relations] li').allTextContents()).sort();
    assert(JSON.stringify(actualRelations) === JSON.stringify(expectedRelations), 'Accessible relationships do not match the actual trace');
  };
  const openChat = async () => {
    await tab.locator('#certichat-panel').waitFor({ state: 'visible' });
    await tab.waitForFunction(() => document.querySelector('deep-chat')?.validateInput('Prueba') && !document.querySelector('[data-chat-clear]').disabled);
  };
  const fixedFooter = () => tab.waitForFunction(() => Math.abs(document.querySelector('.chat-graph-footer').getBoundingClientRect().height - 46) <= 1);
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
    return message?.role === 'ai' && message.text.includes(expected) && chat.validateInput('Siguiente') && !document.querySelector('[data-chat-clear]').disabled;
  }, expected);
  try {
    const start = Date.now();
    pendingGraph = new Promise(resolve => releaseGraph = resolve);
    await tab.goto(`${base.href}certichat/`);
    const loading = tab.getByRole('status', { name: 'Cargando el mapa de conocimiento', exact: true });
    await loading.waitFor();
    const spinner = loading.locator('.certichat-spinner');
    assert(!(await loading.innerText()).trim() && await spinner.getAttribute('aria-hidden') === 'true', 'Graph loader displays text or duplicates its accessible label');
    assert(await spinner.evaluate(element => {
      const circle = element.getBoundingClientRect(), panel = element.closest('[data-knowledge-graph]'), frame = panel.getBoundingClientRect(), heading = panel.querySelector('header').getBoundingClientRect();
      return Math.abs(circle.width - 32) <= 1 && Math.abs(circle.height - 32) <= 1 && Math.abs(circle.left + circle.right - frame.left - frame.right) <= 2 && Math.abs(circle.top + circle.bottom - heading.bottom - frame.bottom) <= 2 && getComputedStyle(element).animationName === 'none';
    }), 'Graph loader is not centered in the remaining panel or ignores reduced motion');
    await tab.emulateMedia({ reducedMotion: 'no-preference' });
    assert(await spinner.evaluate(element => getComputedStyle(element).animationName !== 'none'), 'Graph loader does not rotate');
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    releaseGraph(); pendingGraph = undefined;
    await ready();
    assert(await loading.isHidden() && await tab.locator('[data-graph-trace]').isHidden() && !(await tab.locator('[data-graph-trace]').textContent()).trim(), 'Graph startup leaves a loader or idle instructions visible');
    checks.push('centered accessible graph spinner rotates, respects reduced motion, and yields to graph without idle text');
    const loadMs = Date.now() - start, initial = await state();
    assert(snapshot.nodes.length >= 3000 && snapshot.edges.length >= 8000, 'Smoke requires the real published graph, not a reduced fixture');
    assert(initial.nodes === snapshot.nodes.length && initial.edges === snapshot.edges.length, 'Network omitted public graph nodes or edges');
    assert(loadMs < 15000, `Real graph startup took ${loadMs} ms`);
    await active([]);
    assert(await tab.locator('[data-graph-active-fit]').isDisabled(), 'Empty map offers a nonexistent active trace');
    const provenance = await tab.locator('[data-graph-meta]').textContent();
    const metadata = tab.locator('[data-graph-meta]');
    assert(JSON.stringify(await metadata.locator('dt').allTextContents()) === JSON.stringify(['Conceptos', 'Relaciones', 'Actualización', 'Versión']), 'Graph metadata lost its individual labels or requested order');
    assert(/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}$/.test(await metadata.locator('dd').nth(2).textContent()) && !/[|·]|Fuente:/.test(provenance) && provenance.includes(snapshot.version.slice(0, 12)), 'Graph metadata lacks its full date/time/version or retains text separators/source');
    assert(await metadata.evaluate(element => {
      const stamp = element.querySelector('.chat-graph-stamp'), version = element.lastElementChild, frame = element.getBoundingClientRect();
      return stamp.nextElementSibling === version && Math.abs(version.getBoundingClientRect().right - frame.right) <= 1 && stamp.getBoundingClientRect().right <= version.getBoundingClientRect().left + 1;
    }), 'Update date and version are not grouped on the right');
    assert(await metadata.evaluate(element => [...element.querySelectorAll('dd')].every(cell => getComputedStyle(cell).borderLeftWidth === '1px' && getComputedStyle(cell).color !== getComputedStyle(cell.previousElementSibling).color)), 'Graph cells lack real dividing borders or distinct label/value colors');
    await tab.waitForFunction(() => document.querySelector('.chat-graph-stamp dd')?.title.startsWith('Última sincronización'));
    assert(await metadata.locator('dd').nth(2).textContent() === '13-10-2026 11:00:00', 'The timestamp must use Peru UTC−5 even when the browser uses UTC');
    const priorStamp = await metadata.locator('dd').nth(2).textContent(), priorCamera = await state();
    const priorGraphCalls = calls.filter(call => call.path === '/api/graph').length;
    checkedAt = '2026-10-13T16:05:00+00:00';
    await tab.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await tab.waitForFunction(previous => document.querySelector('.chat-graph-stamp dd')?.textContent !== previous, priorStamp);
    const refreshedCamera = await state();
    assert(calls.filter(call => call.path === '/api/graph').length === priorGraphCalls && priorCamera.scale === refreshedCamera.scale && priorCamera.panX === refreshedCamera.panX && priorCamera.panY === refreshedCamera.panY, 'A metadata-only synchronization reloaded or moved the graph');
    assert((await metadata.locator('dd').nth(2).getAttribute('title')).includes('Índice generado el'), 'Synchronization hides the original index creation time');
    checks.push('successful synchronization updates the timestamp with the same index version and preserves the camera');
    const versionSpinner = tab.getByRole('status', { name: 'Actualizando el índice de conocimiento', exact: true });
    await versionSpinner.waitFor();
    assert(await metadata.locator('dd').last().getAttribute('aria-busy') === 'true' && await versionSpinner.evaluate(element => getComputedStyle(element).animationName === 'none'), 'Indexing status is not accessible or ignores reduced motion');
    await tab.emulateMedia({ reducedMotion: 'no-preference' });
    assert(await versionSpinner.evaluate(element => getComputedStyle(element).animationName === 'certichat-spin'), 'Version spinner does not rotate during confirmed indexing');
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    healthAvailable = false;
    await tab.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await versionSpinner.waitFor({ state: 'hidden' });
    healthAvailable = true; indexing = true;
    await tab.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await versionSpinner.waitFor();
    indexing = false;
    await tab.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await versionSpinner.waitFor({ state: 'hidden' });
    assert(await metadata.locator('dd').last().getAttribute('aria-busy') === 'false', 'Completed indexing leaves a busy version cell');
    checks.push('real metadata cells with muted labels/ink values; version spinner tracks confirmed indexing and stops on unavailable status');
    const heading = tab.locator('[data-knowledge-graph] .certichat-heading');
    assert(await heading.locator('h1').textContent() === 'Cognee' && (await heading.textContent()).includes('BASE DE CONOCIMIENTO'), 'Map header does not identify Cognee and its knowledge graph');
    assert(await tab.locator('.sidebar').count() === 0, 'Standalone page inherits a course sidebar');
    assert(await tab.locator('#consulta, .chat-explorer-intro, .chat-explorer-breadcrumb, .chat-explorer-flow, .chat-graph-inspector, [data-explorer-chat], #chat-graph-help').count() === 0, 'Removed introductory sections, map help or legend returned');
    const controls = tab.locator('.chat-graph-network .chat-graph-toolbar button');
    assert(await controls.count() === 4, 'Map controls are not all inside the network container');
    for (const control of await controls.all()) {
      const name = await control.getAttribute('aria-label');
      assert(name?.trim() && (await control.getAttribute('title'))?.trim(), 'Icon control has no accessible name or tooltip');
      assert(!(await control.innerText()).trim(), 'Map control still displays text');
      assert(await control.locator('svg[aria-hidden="true"]').count() === 1, 'Map control has no decorative SVG');
      assert(await tab.getByRole('button', { name, exact: true }).count() === 1, 'Map control accessible name is ambiguous');
    }
    await openChat();
    await fixedFooter();
    assert(await tab.locator('.chat-graph-evidence').evaluate(element => element.getBoundingClientRect().height) === 0, 'Idle evidence leaves an empty row above graph metadata');
    const composer = tab.getByRole('textbox', { name: 'Escribe tu consulta', exact: true });
    await composer.fill('Primera línea\nSegunda línea\nTercera línea');
    await tab.waitForFunction(() => document.querySelector('deep-chat').shadowRoot.querySelector('#input').getBoundingClientRect().height > 46);
    await fixedFooter();
    await composer.fill('Una consulta larga sin enviar.\n'.repeat(30));
    await tab.waitForFunction(() => { const input = document.querySelector('deep-chat').shadowRoot.querySelector('#text-input'); return input.scrollHeight > input.clientHeight; });
    await fixedFooter();
    await composer.fill(''); await fixedFooter();
    checks.push('metadata stays 46 px high with a multiline or scrolling composer');
    const governance = tab.locator('.path-nav .path-group').filter({ hasText: 'Governance' });
    await governance.locator('summary').click();
    assert(await governance.locator('.path-group-panel a').first().evaluate(link => {
      const menu = link.getBoundingClientRect(), chat = document.querySelector('#certichat-panel').getBoundingClientRect();
      const left = Math.max(menu.left, chat.left), right = Math.min(menu.right, chat.right), top = Math.max(menu.top, chat.top), bottom = Math.min(menu.bottom, chat.bottom);
      return right > left && bottom > top && link.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2));
    }), 'Governance menu is covered by the overlapping chat panel');
    await governance.locator('summary').click();
    checks.push('graph footer aligns with empty and multiline composer; Governance menu receives pointer above chat');
    assert(await tab.locator('[data-chat-close]').isHidden() && await tab.locator('.certichat-actions > a').isHidden(), 'Explorer displays its redundant close or graph control');
    assert(await tab.locator('[data-chat-open]').isHidden(), 'Auto-opened chat leaves a redundant launcher');
    await tab.getByRole('textbox', { name: 'Escribe tu consulta', exact: true }).press('Escape');
    assert(await tab.locator('#certichat-panel').isVisible(), 'Escape closes the persistent explorer chat');
    checks.push('real published graph initialized within 15s', 'initial graph has no active trace', 'snapshot provenance');
    checks.push('removed intro/sections stay absent', 'chat opens automatically with hidden close/graph controls and ignores Escape');
    const beforeZoom = await state();
    await tab.locator('[data-graph-zoom-in]').click();
    await tab.waitForFunction(scale => Number(document.querySelector('canvas[data-graph-canvas]').dataset.scale) > scale, beforeZoom.scale);
    assert(await tab.locator('[data-graph-zoom]').textContent() === `${Math.round((await state()).scale * 100)}%`, 'Zoom badge differs from the actual camera scale');
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
    const siteRoot = await tab.locator('[data-certichat]').getAttribute('data-site-root');
    trace1.sources = [{ nodeId: first.source, title: 'Guía de la primera consulta · Concepto', url: `${siteRoot}CDMP-DMF/overview/` }];
    const source = new URL(trace1.sources[0].url), guidePath = source.pathname + source.hash, guideURL = new URL(guidePath, base).href;
    await send('Consulta uno', trace1);
    await answered('Respuesta: Consulta uno.');
    await active(trace1.nodes, trace1.edges);
    const card = tab.locator('[data-graph-card]');
    await tab.emulateMedia({ reducedMotion: 'no-preference' });
    await tab.locator(`[data-graph-active] button[data-concept="${first.source}"]`).click();
    await tab.waitForFunction(() => document.querySelector('canvas[data-graph-canvas]').dataset.cameraMoving === 'true');
    const flight = await canvas.evaluate(element => new Promise(resolve => {
      const samples = [], deadline = performance.now() + 2200;
      const sample = () => {
        samples.push(Number(element.dataset.scale));
        if (element.dataset.cameraMoving === 'false' || performance.now() > deadline) resolve(samples);
        else requestAnimationFrame(sample);
      }; sample();
    }));
    assert(flight.length > 2 && Math.min(...flight) < flight[0] && flight.at(-1) >= 2 && await canvas.getAttribute('data-camera-moving') === 'false', 'Concept navigation did not pull back and then zoom in');
    await card.waitFor({ state: 'visible' });
    const selectedWaves = await canvas.evaluate(element => new Promise(resolve => {
      const frames = [], start = performance.now();
      const sample = () => {
        frames.push({ active: element.dataset.pulseActive, draw: Number(element.dataset.drawCount) });
        if (performance.now() - start >= 1500) resolve(frames);
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }));
    assert(selectedWaves.length > 2 && selectedWaves.every(frame => frame.active === 'true') && selectedWaves.at(-1).draw > selectedWaves[0].draw, 'Selected concept displays a fixed ring or stops after one wave');
    const cardGeometry = await card.evaluate(element => {
      const a = element.getBoundingClientRect(), b = element.parentElement.getBoundingClientRect();
      return { centerX: (a.left + a.right) / 2, nodeX: (b.left + b.right) / 2, bottom: a.bottom, nodeY: (b.top + b.bottom) / 2, left: a.left, right: a.right, minX: b.left, maxX: b.right };
    });
    assert(Math.abs(cardGeometry.centerX - cardGeometry.nodeX) <= 1 && cardGeometry.bottom < cardGeometry.nodeY - 8 && cardGeometry.left >= cardGeometry.minX && cardGeometry.right <= cardGeometry.maxX, `Concept card did not float centered above the selected node: ${JSON.stringify(cardGeometry)}`);
    assert(await card.locator('strong').textContent() === snapshot.nodes.find(node => node.id === first.source).label, 'Card title does not match the selected concept');
    assert(await tab.locator('[data-graph-active] button[aria-pressed="true"]').count() === 1 && await tab.locator('[data-graph-active] button[aria-pressed="true"]').getAttribute('data-concept') === first.source, 'Selected concept tag is not uniquely marked');
    assert(await card.locator('strong').evaluate(element => getComputedStyle(element).borderBottomWidth) === '1px', 'Concept card has no separator between title and sources');
    const reference = card.getByRole('link', { name: `Profundizar: ${trace1.sources[0].title}` });
    assert(await reference.getAttribute('href') === guidePath && await card.locator('a').count() === 1, 'Card reference was not restricted to current-query source evidence');
    await reference.evaluate(link => link.addEventListener('click', event => event.preventDefault(), { once: true }));
    await reference.click();
    assert(await tab.evaluate(root => sessionStorage.getItem(`certichat:${root}:reference`), siteRoot) === guideURL, 'Card source navigation loses the open-chat reference marker');
    await tab.evaluate(root => sessionStorage.removeItem(`certichat:${root}:reference`), siteRoot);
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    await tab.locator(`[data-graph-active] button[data-concept="${first.target}"]`).click();
    await card.getByText('Sin referencia asociada a esta consulta.', { exact: true }).waitFor();
    assert(await card.locator('a').count() === 0, 'Concept without current evidence inherited an unrelated guide link');
    checks.push('concept tags center smoothly, floating cards show only matching query evidence, guide links retain chat');
    for (const theme of ['dark', 'light']) {
      await tab.evaluate(value => document.documentElement.dataset.theme = value, theme);
      assert(await tab.locator('[data-graph-meta]').evaluate(element => {
        const bubble = document.querySelector('deep-chat').shadowRoot.querySelector('.ai-message'), reference = getComputedStyle(bubble);
        return [...element.querySelectorAll('dd')].every(cell => getComputedStyle(cell).backgroundColor === reference.backgroundColor && getComputedStyle(cell).color === reference.color);
      }), `${theme}: graph values do not share the answer bubble colors`);
      const tags = await tab.locator('[data-graph-active] button').evaluateAll(items => items.map(element => {
        const s = getComputedStyle(element);
        return { pressed: element.getAttribute("aria-pressed") === "true", selectedColor: getComputedStyle(document.querySelector("[data-source=tips]")).color, background: s.backgroundColor, border: s.borderTopColor, borderWidth: s.borderTopWidth, radius: s.borderRadius, fontSize: parseFloat(s.fontSize), paddingY: parseFloat(s.paddingTop) + parseFloat(s.paddingBottom) };
      }));
      assert(tags.length === trace1.nodes.length && tags.every(tag => {
        const neutral = color => { const rgb = color.match(/[\d.]+/g)?.slice(0, 3).map(Number); return rgb?.length === 3 && Math.max(...rgb) - Math.min(...rgb) <= 20; };
        return tag.radius === '4px' && tag.borderWidth === '1px' && (tag.pressed ? tag.background === tag.selectedColor && tag.border === tag.selectedColor : neutral(tag.background) && neutral(tag.border)) && tag.fontSize <= 13 && tag.paddingY <= 8;
      }), `${theme}: active concepts are not compact neutral rectangular tags: ${JSON.stringify(tags)}`);
    }
    checks.push('compact gray reference tags in both themes');
    for (const theme of ['light', 'dark']) {
      await tab.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      const red = await tab.locator('[data-source="tips"]').evaluate(node => getComputedStyle(node).color);
      const blue = await tab.locator('[data-source="tube"]').evaluate(node => getComputedStyle(node).color);
      assert(red !== blue, 'Legend has no distinct evidence colors');
      for (const control of await tab.locator('.chat-graph-toolbar button:enabled, [data-graph-scroll]:enabled').all()) {
        await control.hover();
        assert(await control.evaluate(button => ({ border: getComputedStyle(button).borderTopColor, icon: getComputedStyle(button.querySelector('svg')).color })).then(style => style.border === red && style.icon === red), 'Graph control border/icon is not red on hover');
      }
      const tag = tab.locator('[data-graph-active] button:not([aria-pressed="true"])').first();
      await tag.hover();
      assert(await tag.evaluate(button => ({ border: getComputedStyle(button).borderTopColor, divider: getComputedStyle(button.querySelector('.chat-graph-number')).borderRightColor })).then(style => style.border === red && style.divider === red), 'Concept tag lines are not red on hover');
      await composer.fill('Sólo borrador');
      const submit = tab.locator('deep-chat .input-button.inside-end');
      await submit.hover();
      assert(await submit.locator('svg').evaluate(svg => getComputedStyle(svg).fill) === red, 'Composer send icon is not red on hover');
      await composer.fill(''); await tab.mouse.move(0, 0);
      const badge = await tab.locator('[data-graph-zoom]').evaluate(node => { const s = getComputedStyle(node); return [s.borderRadius, s.borderTopWidth, s.fontSize, s.padding]; });
      for (const label of await tab.locator('.chat-graph-legend span').all()) assert(JSON.stringify(await label.evaluate(node => { const s = getComputedStyle(node); return [s.borderRadius, s.borderTopWidth, s.fontSize, s.padding]; })) === JSON.stringify(badge), 'Legend does not match zoom badge format');
    }
    const videoTrace = { ...trace1, sources: trace1.nodes.map(nodeId => ({ nodeId, title: 'CertiTube · Sensores', url: `${siteRoot}certitube/Ha74VhpQwQo/#t-61` })) };
    await tab.evaluate(trace => window.dispatchEvent(new CustomEvent('certichat:trace', { detail: { status: 'ready', trace } })), videoTrace);
    await tab.waitForFunction(() => document.querySelector('[data-graph-canvas]').dataset.videoNodeCount === '2' && document.querySelector('[data-graph-canvas]').dataset.videoEdgeCount === '1');
    await tab.emulateMedia({ reducedMotion: 'no-preference' });
    await tab.evaluate(trace => window.dispatchEvent(new CustomEvent('certichat:hover', { detail: trace })), videoTrace);
    await tab.waitForFunction(() => document.querySelector('[data-graph-canvas]').dataset.pulseActive === 'true');
    await tab.evaluate(() => window.dispatchEvent(new CustomEvent('certichat:hover', { detail: null })));
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    await tab.evaluate(trace => window.dispatchEvent(new CustomEvent('certichat:trace', { detail: { status: 'ready', trace } })), trace1);
    await tab.waitForFunction(() => document.querySelector('[data-graph-canvas]').dataset.videoNodeCount === '0');
    checks.push('graph controls, concept borders and send SVG hover red in both themes; zoom-style legend; verified video nodes/edges/waves blue and guide evidence red');

    assert(await tab.locator('[data-graph-active-fit]').isEnabled(), 'Received trace cannot be fitted');
    await tab.locator('[data-graph-fit]').click();
    await canvas.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const wholeGraph = await state();
    await tab.emulateMedia({ reducedMotion: 'no-preference' });
    await tab.locator('[data-graph-active-fit]').click();
    await tab.waitForFunction(() => document.querySelector('canvas[data-graph-canvas]').dataset.cameraMoving === 'true');
    const frames = await canvas.evaluate(element => new Promise(resolve => {
      const samples = [], deadline = performance.now() + 2000;
      const sample = () => {
        const data = element.dataset;
        samples.push({ scale: Number(data.scale), x: Number(data.panX), y: Number(data.panY), moving: data.cameraMoving });
        if (data.cameraMoving === 'false' || performance.now() > deadline) resolve(samples);
        else requestAnimationFrame(sample);
      };
      sample();
    }));
    const finalFrame = frames.at(-1);
    assert(frames.length >= 3 && finalFrame.moving === 'false' && frames.slice(0, -1).some(frame => frame.moving === 'true' && (frame.scale !== wholeGraph.scale || frame.x !== wholeGraph.panX || frame.y !== wholeGraph.panY) && (frame.scale !== finalFrame.scale || frame.x !== finalFrame.x || frame.y !== finalFrame.y)), 'Active fit did not animate through intermediate camera positions');
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    checks.push('active fit animates through intermediate camera positions and finishes');
    await active(trace1.nodes, trace1.edges);
    assert(calls.at(-1).path === '/api/chat' && calls.at(-1).body.message === 'Consulta uno', 'Real chat UI did not send the question');
    checks.push('real textbox Enter publishes matching-version graphTrace');

    pendingReply = new Promise(resolve => releaseReply = resolve);
    await send('Consulta dos', trace2);
    await tab.waitForFunction(() => !document.querySelector('deep-chat').validateInput('Mientras espera'));
    await active([]);
    assert(await card.isHidden(), 'New query left the previous concept card visible');
    assert(await tab.locator('[data-graph-trace]').isHidden() && !(await tab.locator('[data-graph-trace]').textContent()).trim(), 'Removed graph loading message is still shown');
    const responses = tab.locator('deep-chat .outer-message-container:not(.deep-chat-intro) .ai-message:not(.deep-chat-loading-message-bubble)');
    await responses.first().hover(); await active([]);
    await responses.first().click({ position: { x: 5, y: 5 } }); await active([]);
    releaseReply(); pendingReply = undefined;
    await answered('Respuesta: Consulta dos.');
    await active(trace2.nodes, trace2.edges);
    checks.push('new query clears prior highlights while pending', 'second trace replaces first IDs, never accumulates');

    const countBeforeReload = calls.filter(call => call.path === '/api/chat').length;
    await tab.locator('[data-graph-fit]').click();
    await tab.emulateMedia({ reducedMotion: 'no-preference' });
    await tab.mouse.move(0, 0);
    await tab.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const beforeHover = await state();
    await responses.first().hover();
    await active(trace1.nodes, trace1.edges);
    const hoverPose = await state();
    assert(hoverPose.scale === beforeHover.scale && hoverPose.panX === beforeHover.panX && hoverPose.panY === beforeHover.panY, 'Hover moved the camera');
    const hoverFrames = await canvas.evaluate(element => new Promise(resolve => {
      const frames = [], start = performance.now();
      const sample = () => {
        frames.push(element.dataset.pulseActive);
        if (performance.now() - start >= 2600) resolve(frames);
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }));
    assert(hoverFrames.length > 2 && hoverFrames.every(active => active === 'true'), 'Hover pulse stopped after one cycle');
    assert(await responses.first().evaluate(element => {
      const style = getComputedStyle(element), reference = document.createElement('span');
      reference.style.color = 'var(--red)'; element.append(reference);
      const red = getComputedStyle(reference).color; reference.remove();
      return style.borderTopWidth === '1px' && style.borderTopColor === red;
    }), 'Explorer answer hover does not have the theme red border');
    await tab.mouse.move(0, 0);
    await tab.waitForFunction(() => document.querySelector('canvas[data-graph-canvas]').dataset.pulseActive === 'false');
    await responses.first().focus();
    assert(JSON.stringify(await state()) === JSON.stringify(beforeHover), 'Keyboard focus moved the camera before activation');
    await responses.first().click({ position: { x: 5, y: 5 } });
    await active(trace1.nodes, trace1.edges);
    const clickFrames = await canvas.evaluate(element => new Promise(resolve => {
      const frames = [];
      const sample = () => {
        frames.push({ ...element.dataset });
        if (element.dataset.cameraMoving === 'false' || frames.length > 120) resolve(frames);
        else requestAnimationFrame(sample);
      };
      sample();
    }));
    assert(clickFrames.length >= 3 && clickFrames.at(-1).cameraMoving === 'false' && new Set(clickFrames.map(frame => `${frame.scale}:${frame.panX}:${frame.panY}`)).size >= 3, 'Click did not use smooth intermediate camera positions');
    assert(await canvas.getAttribute('data-pulse-active') === 'true', 'Click did not start the concept pulse');
    await tab.mouse.move(0, 0);
    await tab.waitForFunction(() => document.querySelector('canvas[data-graph-canvas]').dataset.pulseActive === 'false');
    const idleDraws = await canvas.getAttribute('data-draw-count');
    await canvas.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert(await canvas.getAttribute('data-draw-count') === idleDraws, 'Concept pulse kept drawing after finishing');
    await tab.locator(`[data-graph-active] button[data-concept="${first.source}"]`).click();
    await card.waitFor({ state: 'visible' });
    assert(await card.locator('a').getAttribute('href') === guidePath, 'Click restored concepts with the wrong response source');
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    await tab.waitForFunction(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    await responses.nth(1).focus(); await active(trace1.nodes, trace1.edges);
    await responses.nth(1).press('Enter'); await active(trace2.nodes, trace2.edges);
    await canvas.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert(await canvas.getAttribute('data-camera-moving') === 'false' && await canvas.getAttribute('data-pulse-active') === 'false', 'Keyboard activation ignored reduced motion');
    await responses.first().focus(); await responses.first().press('Space'); await active(trace1.nodes, trace1.edges);
    await responses.nth(1).click({ position: { x: 5, y: 5 } }); await active(trace2.nodes, trace2.edges);
    const guideLink = responses.first().locator('a');
    await guideLink.hover(); await active(trace1.nodes, trace1.edges);
    const beforeLink = await state();
    await guideLink.evaluate(link => link.addEventListener('click', event => event.preventDefault(), { once: true }));
    await guideLink.click();
    assert(JSON.stringify(await state()) === JSON.stringify(beforeLink), 'Reference click also selected the answer graph');
    assert(await tab.evaluate(root => sessionStorage.getItem(`certichat:${root}:reference`), siteRoot) === guideURL, 'Reference click lost its navigation marker');
    assert(calls.filter(call => call.path === '/api/chat').length === countBeforeReload, 'Response interaction made an API request');
    checks.push('answer hover selects historical evidence without moving the camera and repeats the pulse until exit; click centers it smoothly', 'Enter and Space activate responses, focus alone and reference clicks do not; reduced motion skips animation');

    await tab.reload(); await ready(); await active(trace2.nodes, trace2.edges);
    await openChat();
    await responses.first().click({ position: { x: 5, y: 5 } }); await active(trace1.nodes, trace1.edges);
    await responses.nth(1).click({ position: { x: 5, y: 5 } }); await active(trace2.nodes, trace2.edges);
    assert(calls.filter(call => call.path === '/api/chat').length === countBeforeReload, 'Restoring trace submits a paid query');
    checks.push('restored answers retain distinct traces; clicking history does not overwrite the latest saved trace');
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
    assert(await tab.locator('[data-graph-trace]').isHidden(), 'Empty evidence shows an unnecessary message');
    assert(await tab.locator('.chat-graph-evidence').evaluate(node => node.getBoundingClientRect().height) === 0, 'Empty evidence leaves a blank row below the graph');
    await send('Consulta con otra versión', { ...trace2, version: 'f'.repeat(64) }); await answered('Respuesta: Consulta con otra versión.'); await active([]);
    assert(/versi[oó]n/i.test(await tab.locator('[data-graph-trace]').textContent()), 'Version mismatch has no accessible explanation');
    await send('Respuesta antigua sin traza'); await answered('Respuesta: Respuesta antigua sin traza.'); await active([]);
    assert(await tab.locator('.chat-graph-evidence').evaluate(node => node.getBoundingClientRect().height) === 0, 'Legacy response without trace leaves a blank evidence row');
    await responses.first().click({ position: { x: 5, y: 5 } }); await active(trace1.nodes, trace1.edges);
    await responses.last().click({ position: { x: 5, y: 5 } }); await active([]);
    await responses.first().click({ position: { x: 5, y: 5 } }); await active(trace1.nodes, trace1.edges);
    await responses.filter({ hasText: 'El servicio no está disponible' }).click({ position: { x: 5, y: 5 } }); await active([]);
    checks.push('API errors and empty evidence clear trace', 'version mismatch stays gray', 'legacy response without trace stays gray');

    await send('Consulta antes de borrar', trace1); await answered('Respuesta: Consulta antes de borrar.'); await active(trace1.nodes, trace1.edges);
    await tab.locator('[data-chat-clear]').click();
    await tab.locator('[data-chat-confirm-yes]').click();
    await tab.locator('[data-chat-confirm]').waitFor({ state: 'hidden' });
    await active([]);
    assert(calls.some(call => call.path === '/api/conversation' && call.method === 'DELETE'), 'Clear confirmation did not use the conversation API');
    await tab.emulateMedia({ reducedMotion: 'no-preference' });
    await tab.reload(); await ready(); await active([]);
    checks.push('confirmed clear removes active and persisted trace');
    await send('Consulta después de borrar', trace2); await answered('Respuesta: Consulta después de borrar.');
    checks.push('first streamed response completed');
    await tab.locator('[data-graph-fit]').click();
    await responses.first().click({ position: { x: 5, y: 5 } }); await active(trace2.nodes, trace2.edges);
    await send('Consulta después de borrar', trace1); await answered('Respuesta: Consulta después de borrar.');
    await tab.waitForFunction(() => {
      const chat = document.querySelector('deep-chat');
      return chat.getMessages().length === 4 && chat.validateInput('Siguiente');
    });
    checks.push('duplicate streamed response completed');
    await responses.first().click({ position: { x: 5, y: 5 } }); await active(trace2.nodes, trace2.edges);
    await responses.nth(1).click({ position: { x: 5, y: 5 } }); await active(trace1.nodes, trace1.edges);
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    checks.push('simulated streaming and clearing keep response evidence aligned');
    for (const question of ['donde buscar mas informacion', 'dame en enlace', 'me referia al enlace en estas guias']) {
      await send(question, trace1); await answered(`Respuesta: ${question}.`);
      const links = responses.last().locator('a');
      assert(await links.count() === 1 && await links.getAttribute('href') === guidePath, `Follow-up did not show its verified guide link: ${question}`);
    }
    checks.push('source links appear for paraphrased follow-ups and typos, without intent matching');

    for (const width of [1440, 1280, 1024, 800, 360, 320]) {
      await tab.setViewportSize({ width, height: 900 });
      await tab.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await tab.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await openChat();
      const measured = await tab.evaluate(() => {
        const box = element => { const b = element.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
        const map = document.querySelector('[data-knowledge-graph]'), chat = document.querySelector('#certichat-panel');
        const style = element => { const s = getComputedStyle(element); return { border: s.borderTopWidth, color: s.borderTopColor, position: s.position }; };
        const network = map.querySelector('.chat-graph-network'), toolbar = map.querySelector('.chat-graph-toolbar');
        const controls = [...toolbar.querySelectorAll('button')].map(button => {
          const svg = button.querySelector('svg'), bounds = svg.getBBox(), s = getComputedStyle(button);
          return { ...box(button), svg: box(svg), hasDrawing: bounds.width > 0 && bounds.height > 0, backgroundImage: s.backgroundImage, opacity: s.opacity, disabled: button.disabled };
        });
        return { width: innerWidth, page: document.documentElement.scrollWidth, map: box(map), chat: box(chat), canvas: box(map.querySelector('canvas')), mapHeading: box(map.querySelector('header')), chatHeading: box(chat.querySelector('header')), mapFooter: box(map.querySelector('.chat-graph-footer')), composer: box(chat.querySelector('deep-chat').shadowRoot.querySelector('#input')), meta: box(map.querySelector('[data-graph-meta]')), mapStyle: style(map), chatStyle: style(chat), bodyOverflow: getComputedStyle(document.body).overflow, network: box(network), toolbar: box(toolbar), controls };
      });
      assert(measured.page <= width + 1 && measured.canvas.left >= -1 && measured.canvas.right <= width + 1 && measured.canvas.height >= 200, `Map overflows or collapses at ${width}: ${JSON.stringify(measured)}`);
      assert(measured.mapStyle.border === '4px' && measured.chatStyle.border === '4px' && measured.mapStyle.color === measured.chatStyle.color, `Map and chat lost their matching red top borders at ${width}`);
      assert(Math.abs(measured.mapHeading.height - measured.chatHeading.height) <= 1, `Map/chat header heights diverge at ${width}`);
      assert(Math.abs(measured.canvas.top - measured.mapHeading.bottom) <= 1, `Unwanted gap remains between Cognee header and graph at ${width}`);
      if (width >= 1024) {
        assert(measured.map.right <= measured.chat.left && Math.abs(measured.map.top - measured.chat.top) <= 1 && Math.abs(measured.map.height - measured.chat.height) <= 1, `Desktop panels are not aligned side by side at ${width}`);
        assert(Math.abs(measured.mapFooter.height - 46) <= 1 && measured.meta.top >= measured.mapFooter.top && measured.meta.bottom <= measured.mapFooter.bottom, `Graph metadata grows or is clipped at ${width}`);
      } else {
        assert(measured.map.bottom <= measured.chat.top && Math.abs(measured.map.left - measured.chat.left) <= 1 && Math.abs(measured.map.width - measured.chat.width) <= 1, `Mobile panels do not stack with matching widths at ${width}`);
        assert(measured.chatStyle.position !== 'fixed' && measured.bodyOverflow !== 'hidden', `Mobile explorer still uses a fullscreen overlay at ${width}`);
      }
      assert(await tab.locator('[data-chat-close]').isHidden() && await tab.locator('.certichat-actions > a').isHidden() && await tab.locator('#certichat-panel').isVisible(), `Explorer displays its redundant close/graph controls at ${width}`);
      assert(Math.abs(measured.network.right - measured.toolbar.right - 12) <= 1 && Math.abs(measured.network.bottom - measured.toolbar.bottom - 12) <= 1, `Map controls lost their bottom/right inset at ${width}`);
      assert(measured.controls.every((control, index, all) => Math.abs(control.width - 36) <= 1 && Math.abs(control.height - 36) <= 1 && Math.abs(control.left - all[0].left) <= 1 && (!index || Math.abs(control.top - all[index - 1].bottom - 6) <= 1) && control.hasDrawing && control.backgroundImage === 'none' && (control.disabled || control.opacity === '1') && Math.abs((control.svg.left + control.svg.right - control.left - control.right) / 2) <= 1 && Math.abs((control.svg.top + control.svg.bottom - control.top - control.bottom) / 2) <= 1), `Map controls are not centered flat icons in a 36 px vertical column at ${width}: ${JSON.stringify(measured.controls)}`);
      geometry.push(measured);
    }
    checks.push('aligned desktop map/chat and in-page mobile stack at 1440/1280/1024/800/360/320');
    checks.push('four named SVG controls float in a 36 px vertical column with 6 px gaps and 12 px inset');
    const many = { version: snapshot.version, nodes: snapshot.nodes.slice(0, 80).map(node => node.id), edges: [], truncated: false };
    await send('Consulta para desplazar conceptos', many); await answered('Respuesta: Consulta para desplazar conceptos.'); await active(many.nodes);
    const strip = tab.locator('[data-graph-active]'), left = tab.locator('[data-graph-scroll="-1"]'), right = tab.locator('[data-graph-scroll="1"]');
    assert(await left.isHidden() && await right.isVisible(), 'Scroll controls do not hide at the initial boundary');
    await right.hover();
    assert(await right.evaluate(button => getComputedStyle(button).color === getComputedStyle(document.querySelector('[data-source="tips"]')).color && getComputedStyle(button).borderTopColor === getComputedStyle(button).color), 'Concept scroll arrow border/icon is not red on hover');
    await right.click();
    await tab.waitForFunction(() => document.querySelector('[data-graph-active]').scrollLeft > 4 && !document.querySelector('[data-graph-scroll="-1"]').disabled);
    assert(await left.isVisible(), 'Left control remains hidden after scrolling right');
    for (let attempt = 0; attempt < 4 && await left.isVisible(); attempt++) {
      await left.click();
      await tab.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    await tab.waitForFunction(() => document.querySelector('[data-graph-active]').scrollLeft <= 4 && document.querySelector('[data-graph-scroll="-1"]').disabled);
    assert(await left.isHidden(), 'Left control remains visible at the beginning');
    await strip.locator('button').last().focus();
    await tab.waitForFunction(() => document.querySelector('[data-graph-scroll="1"]').disabled);
    assert(await right.isHidden(), 'Right control remains visible at the end');
    checks.push('triangle controls scroll both directions, hide at boundaries, and retain keyboard access to every tag');
    for (const theme of ['dark', 'light']) {
      await tab.evaluate(value => document.documentElement.dataset.theme = value, theme);
      await tab.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert((await state()).nodes === snapshot.nodes.length, `${theme}: theme change dropped the graph`);
    }
    checks.push('both themes retain the complete network');

    const paidBeforePromotion = calls.filter(call => call.path === '/api/chat').length;
    serverGraph = { ...snapshot, version: 'e'.repeat(64), generatedAt: '2026-10-13T12:34:56Z' };
    await tab.reload(); await ready();
    await tab.waitForFunction(() => document.querySelector('[data-graph-meta]').textContent.includes('eeeeeeeeeeee'));
    assert((await state()).nodes === snapshot.nodes.length, 'Promoted graph loses concepts');
    assert(calls.filter(call => call.path === '/api/chat').length === paidBeforePromotion, 'Graph synchronization submits a paid query');
    await send('Consulta con índice actualizado', { ...trace1, version: serverGraph.version });
    await answered('Respuesta: Consulta con índice actualizado.'); await active(trace1.nodes, trace1.edges);
    await responses.last().click({ position: { x: 5, y: 5 } }); await active(trace1.nodes, trace1.edges);
    graphAvailable = false;
    await Promise.all([tab.waitForResponse(response => response.url().endsWith('/api/graph')), tab.reload()]); await ready();
    assert((await state()).nodes === snapshot.nodes.length && (await metadata.textContent()).includes(snapshot.version.slice(0, 12)), 'Graph API outage removes the available published snapshot');
    serverGraph = undefined; graphAvailable = true;
    checks.push('active snapshot promotion refreshes graph and answer highlights without a paid query; unavailable graph API retains published fallback');

    graphOverride = { version: snapshot.version, generatedAt: new Date().toISOString(), nodes: [{ id: first.source, label: '<img src="https://evil.invalid/x" onerror="alert(1)">', type: 'Entity' }], edges: [] };
    await tab.reload(); await ready();
    await send('Consulta de etiqueta', { version: snapshot.version, nodes: [first.source], edges: [], sources: [{ nodeId: first.source, title: '<img src="https://evil.invalid/x" onerror="alert(1)">', url: `${siteRoot}CDMP-DMF/overview/` }, { nodeId: first.source, title: 'Unsafe URL', url: 'javascript:alert(1)' }], truncated: false });
    await answered('Respuesta: Consulta de etiqueta.');
    await tab.waitForFunction(() => Number(document.querySelector('canvas[data-graph-canvas]').dataset.activeNodeCount) === 1);
    const labelButton = tab.locator('[data-graph-active] button[data-concept]');
    assert(await labelButton.locator('.chat-graph-label').textContent() === graphOverride.nodes[0].label && await labelButton.locator('img').count() === 0, 'Graph label activated HTML');
    await tab.mouse.move(0, 0);
    await labelButton.focus(); await labelButton.press('Enter');
    await card.waitFor({ state: 'visible' });
    assert(await card.locator('img').count() === 0 && await card.locator('a').count() === 1 && await card.locator('a').textContent() === graphOverride.nodes[0].label, 'Card activated HTML or an unsafe URL');
    const selection = tab.locator('[data-graph-selection]');
    assert(await selection.textContent() === `${graphOverride.nodes[0].label}. 0 conceptos relacionados.` && await selection.locator('img').count() === 0, 'Selected concept announcement loses its safe label or relation count');
    assert(!requests.some(url => url.includes('evil.invalid')), 'Graph label made an external request');
    assert((await state()).nodes === 1 && (await state()).edges === 0, 'Isolated concept could not be rendered');
    graphOverride = 'error';
    await tab.reload();
    await tab.locator('[data-graph-status]').filter({ hasText: 'No se pudo cargar la instantánea' }).waitFor();
    assert(await tab.locator('[data-graph-status] .certichat-spinner').count() === 0 && await tab.locator('[data-graph-status]').getAttribute('aria-label') === null, 'Failed graph keeps the loading spinner or stale accessible name');
    assert(await tab.locator('[data-graph-workspace]').isHidden(), 'Unavailable graph exposes broken controls');
    checks.push('inert labels, isolated concept and snapshot failure');
    assert(!requests.some(url => new URL(url).origin !== base.origin), 'QA attempted a private or external API');
    assert(!errors.length, `Page errors: ${errors.join('; ')}`);
    return { checks, loadMs, graph: { nodes: snapshot.nodes.length, edges: snapshot.edges.length }, geometry, apiCalls: calls.length, errors };
  } catch (error) {
    const chat = await tab.evaluate(() => { const element = document.querySelector('deep-chat'), input = element?.shadowRoot?.querySelector('[role="textbox"]'); return { messages: element?.getMessages(), bubbles: [...element.shadowRoot.querySelectorAll('.ai-message')].map(node => ({ className: node.className, text: node.textContent })), saved: JSON.parse(localStorage.getItem(`certichat:${document.querySelector('[data-certichat]').dataset.siteRoot}`)), activeIds: [...document.querySelectorAll('[data-concept]')].map(node => node.dataset.concept), valid: element?.validateInput('Prueba'), text: input?.innerText, editable: input?.contentEditable, clearDisabled: document.querySelector('[data-chat-clear]')?.disabled, status: document.querySelector('[data-chat-status]')?.textContent }; }).catch(() => null);
    throw new Error(`${error.message}; passed=${JSON.stringify(checks)}; state=${JSON.stringify(await state().catch(() => null))}; calls=${JSON.stringify(calls.map(call => ({ path: call.path, question: call.body?.message })))}; chat=${JSON.stringify(chat)}; pageErrors=${JSON.stringify(errors)}`);
  } finally { releaseReply?.(); releaseGraph?.(); await context.close(); }
}

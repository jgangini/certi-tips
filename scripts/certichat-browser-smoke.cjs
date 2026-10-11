// Run with playwright-cli -s=certichatqa run-code --filename scripts/certichat-browser-smoke.cjs
// Isolated local browser, mocked API, DOM/network assertions; no screenshots or paid calls.
async (page) => {
  const base = new URL('/certi-tips/', page.url()).href;
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const calls = [], requests = [], errors = [];
  let quota = { dayRemaining: 20, hourRemaining: 10, minuteRemaining: 2, retryAfter: 0 };
  let authenticated = true, rateLimited = false, loseResponse = false, failOnce = 0;
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://certichat.cloudtechnext.net/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const headers = { 'access-control-allow-origin': new URL(base).origin, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS', 'access-control-allow-headers': 'x-certichat,content-type' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    calls.push({ path, method: request.method(), body: request.postDataJSON(), headers: request.headers() });
    if (path === '/api/chat') {
      if (loseResponse) { loseResponse = false; return route.abort('failed'); }
      if (failOnce) { const status = failOnce; failOnce = 0; return route.fulfill({ status, headers, json: { detail: 'previous failure', code: status === 409 ? 'request_failed' : undefined } }); }
      if (rateLimited) return route.fulfill({ status: 429, headers: { ...headers, 'retry-after': '31', 'access-control-expose-headers': 'retry-after' }, json: { detail: 'rate_limit' } });
      quota = { dayRemaining: 19, hourRemaining: 9, minuteRemaining: 1, retryAfter: 0 };
      return route.fulfill({ headers, json: { answer: '<img src="https://evil.invalid/leak" onerror="alert(1)">\n![imagen](https://evil.invalid/) [enlace](javascript:alert(1))\nLos agentes utilizan herramientas.', sources: [{ id: 'agents', title: 'Agentes · Conceptos clave', url: 'https://jgangini.github.io/certi-tips/1Z0-1157-26/agents/#conceptos-clave' }, { title: 'External', url: 'https://evil.invalid/' }], quota, contentVersion: 'test' } });
    }
    if (path === '/api/session' && request.method() === 'POST') authenticated = true;
    return route.fulfill({ headers, json: { authenticated, verificationRequired: !authenticated, quota, available: true } });
  });
  await page.goto(base);
  assert(!requests.some(url => /deep-chat\.js|turnstile|certichat\.cloudtechnext/.test(url)), 'Chat network loaded before opening');
  await page.getByRole('button', { name: 'CertiChat', exact: true }).click();
  await page.getByRole('textbox', { name: 'Pregunta a CertiChat' }).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-chat-status]').textContent.includes('20 consultas'));
  assert(requests.some(url => url.endsWith('/assets/deep-chat.js')), 'Missing local Deep Chat');
  await page.getByRole('textbox', { name: 'Pregunta a CertiChat' }).fill('¿Qué son los agentes?');
  await page.getByRole('textbox', { name: 'Pregunta a CertiChat' }).press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-chat-status]').textContent.includes('19 consultas'));
  assert(await page.locator('[data-chat-sources] a').count() === 1, 'Unsafe source URL shown');
  assert(!(await page.locator('deep-chat img, deep-chat a, deep-chat script').count()), 'Messages rendered active content');
  assert(!requests.some(url => url.includes('evil.invalid')), 'Message caused external resource request');
  const sent = calls.find(item => item.path === '/api/chat');
  assert(sent.body.message === '¿Qué son los agentes?' && /^[\da-f-]{36}$/.test(sent.body.requestId), 'Wrong API request');
  assert(sent.headers['x-certichat'] === '1', 'Missing mutation header');
  assert(sent.body.pageUrl === 'https://jgangini.github.io/certi-tips/', 'Missing canonical page context');
  await page.getByRole('button', { name: 'Borrar conversación', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-chat-clear]').disabled === false);
  assert(calls.some(item => item.path === '/api/conversation' && item.method === 'DELETE'), 'No server conversation deletion');
  assert((await page.locator('[data-chat-status]').textContent()).includes('19 consultas'), 'Clear reset quota');
  rateLimited = true;
  await page.getByRole('textbox', { name: 'Pregunta a CertiChat' }).fill('Otra consulta');
  await page.getByRole('textbox', { name: 'Pregunta a CertiChat' }).press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-chat-status]').textContent.includes('31 segundos'));
  rateLimited = false;
  loseResponse = true;
  await page.getByRole('textbox', { name: 'Pregunta a CertiChat' }).fill('Consulta con conexión interrumpida');
  await page.getByRole('textbox', { name: 'Pregunta a CertiChat' }).press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-chat-status]').textContent.includes('fetch'));
  await page.getByRole('textbox', { name: 'Pregunta a CertiChat' }).fill('Consulta con conexión interrumpida');
  await page.getByRole('textbox', { name: 'Pregunta a CertiChat' }).press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-chat-status]').textContent.includes('19 consultas'));
  const retried = calls.filter(item => item.body?.message === 'Consulta con conexión interrumpida');
  assert(retried.length === 2 && retried[0].body.requestId === retried[1].body.requestId, 'Transport retry creates another billable UUID');
  for (const code of [503, 409]) {
    failOnce = code;
    const question = `Consulta fallida ${code}`;
    await page.getByRole('textbox', { name: 'Pregunta a CertiChat' }).fill(question);
    await page.getByRole('textbox', { name: 'Pregunta a CertiChat' }).press('Enter');
    await page.waitForFunction(() => /no está disponible|no tiene un resultado/.test(document.querySelector('[data-chat-status]').textContent));
    await page.getByRole('textbox', { name: 'Pregunta a CertiChat' }).fill(question);
    await page.getByRole('textbox', { name: 'Pregunta a CertiChat' }).press('Enter');
    await page.waitForFunction(() => document.querySelector('[data-chat-status]').textContent.includes('19 consultas'));
    const retried = calls.filter(item => item.body?.message === question);
    assert(retried.length === 2 && retried[0].body.requestId !== retried[1].body.requestId, `Definitive ${code} failure traps the same question`);
  }
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 740 });
    const geometry = await page.locator('#certichat-panel').evaluate(element => { const box = element.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, viewport: innerWidth, footer: document.querySelector('.site-footer').getBoundingClientRect().top }; });
    assert(geometry.left >= 0 && geometry.right <= width && geometry.top >= 0 && geometry.bottom < geometry.footer, `Panel escapes viewport/footer at ${width}`);
  }
  await page.getByRole('button', { name: 'Cerrar CertiChat', exact: true }).press('Escape');
  assert(await page.locator('#certichat-panel').isHidden(), 'Escape did not close');
  assert(await page.getByRole('button', { name: 'CertiChat', exact: true }).evaluate(element => document.activeElement === element), 'Focus not restored');
  authenticated = false;
  await page.goto(base);
  await page.locator('[data-certichat]').evaluate(element => { element.dataset.siteKey = ''; });
  await page.getByRole('button', { name: 'CertiChat', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-chat-status]').textContent.includes('en preparación'));
  assert(!requests.some(url => url.includes('challenges.cloudflare.com')), 'Turnstile loaded with no site key');
  await page.evaluate(() => {
    document.querySelector('[data-certichat]').dataset.siteKey = 'test-site-key';
    window.turnstile = { render: (element, options) => { if (options.action !== 'certichat_session') throw new Error('Wrong Turnstile action'); queueMicrotask(() => options.callback('test-single-use-token')); return 'test-widget'; }, remove() {} };
  });
  await page.getByRole('button', { name: 'Reintentar conexión' }).click();
  await page.waitForFunction(() => document.querySelector('[data-chat-status]').textContent.includes('19 consultas'));
  assert(calls.some(item => item.path === '/api/session' && item.body?.turnstileToken === 'test-single-use-token'), 'Turnstile token not verified by server');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  const darkColors = await page.locator('deep-chat').evaluate(element => ({ background: getComputedStyle(element).backgroundColor, text: getComputedStyle(element).color }));
  assert(darkColors.background === 'rgb(14, 17, 23)' && darkColors.text === 'rgb(250, 250, 250)', 'Deep Chat does not follow dark theme');
  await page.goto(`${base}1Z0-1157-26/agents/`);
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await page.locator('[data-mark-complete]').waitFor({ state: 'visible' });
  const controlsSeparate = await page.evaluate(() => {
    const launcher = document.querySelector('[data-chat-open]').getBoundingClientRect(), completion = document.querySelector('[data-mark-complete]').getBoundingClientRect();
    return launcher.bottom <= completion.top || launcher.top >= completion.bottom || launcher.right <= completion.left || launcher.left >= completion.right;
  });
  assert(controlsSeparate, 'Chat launcher overlaps lesson completion');
  assert(errors.length === 0, `Page errors: ${errors.join('; ')}`);
  return { checks: ['lazy local bundle', 'safe plaintext', 'sources', 'API contract', 'quotas', 'clear preserves quota', 'rate retry', 'idempotent transport retry', 'definitive failure retry', 'mobile geometry', 'Escape focus', 'missing Turnstile fails closed', 'Turnstile server handshake', 'dark theme', 'completion control coexistence'], requests: calls.length, errors };
}

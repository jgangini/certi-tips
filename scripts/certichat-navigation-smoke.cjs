// Run with the isolated local-preview runner. APIs are mocked; no microphone or screenshots.
async page => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const origin = new URL(page.url()).origin, base = `${origin}/certitips/`, calls = [], documents = [], checks = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(request.url()); });
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.route('http://127.0.0.1:18741/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS', 'access-control-allow-headers': 'x-certichat,content-type' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    calls.push({ path, body: request.postDataJSON() });
    if (path === '/api/chat') return route.fulfill({ headers, json: { answer: 'Respuesta educativa simulada.', sources: [], quota: { remaining: 20 } } });
    if (path === '/api/voice') throw new Error('Text navigation must not request voice inference');
    return route.fulfill({ headers, json: { mode: 'LOCAL', authenticated: true, available: true, voice: { enabled: false }, quota: { remaining: 20 } } });
  });
  await page.goto(`${base}es/courses/`);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  const openChat = async () => {
    await page.waitForFunction(() => {
      const panel = document.querySelector('#certichat-panel');
      if (panel?.hidden) document.querySelector('[data-chat-open]').click();
      return Boolean(document.querySelector('deep-chat'));
    });
    await page.locator('deep-chat [role="textbox"]').waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-chat-clear]').disabled);
  };
  const open = async path => { await page.goto(new URL(path, base).href); await openChat(); };
  const history = () => page.locator('deep-chat').evaluate(chat => chat.getMessages().map(({ role, text }) => ({ role, text })));
  const send = async text => {
    await page.waitForFunction(() => !document.querySelector('#language-transition[open]'));
    const input = page.locator('deep-chat [role="textbox"]');
    const count = (await history()).length;
    await input.click(); await input.fill(text);
    await page.waitForFunction(() => document.querySelector('deep-chat').shadowRoot.querySelector('.input-button.inside-end:not(.custom-button)')?.getAttribute('aria-disabled') !== 'true');
    await input.press('Enter');
    await page.waitForFunction(count => document.querySelector('deep-chat')?.getMessages().length > count, count).catch(async error => { throw new Error(`${error.message}; text=${text}; count=${count}; url=${page.url()}; history=${JSON.stringify(await history())}`); });
  };
  const completed = () => page.waitForFunction(() => !document.querySelector('[data-chat-clear]').disabled && document.querySelector('deep-chat').getMessages().at(-1)?.role === 'ai');
  await open('es/courses/');
  for (const text of ['¿Qué es CertiQuiz?', 'No abras CertiQuiz', 'abre CertiQuiz y explica OCI']) {
    await send(text); await completed();
    assert(page.url() === `${base}es/courses/`, 'A question, negation or mixed request navigated');
  }
  assert(calls.filter(call => call.path === '/api/chat').length === 3, `Ambiguous text did not stay on the existing tutor path: ${JSON.stringify(calls)}`);
  checks.push('questions, negations and compound requests stay with the tutor');
  const previous = await history(), count = documents.length;
  const storageKey = await page.locator('[data-certichat]').evaluate(root => `certichat:${root.dataset.siteRoot}`);
  await send('navegar hasta CertiQuiz');
  await page.waitForURL(`${base}es/certiquiz/`);
  const retained = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
  assert(JSON.stringify(retained.messages.slice(0, previous.length).map(({ role, text }) => ({ role, text }))) === JSON.stringify(previous), 'Navigation lost earlier messages');
  assert(retained.messages.at(-2)?.text === 'navegar hasta CertiQuiz' && retained.messages.at(-1)?.text === 'Abriendo la página…', 'Navigation occurred before the local answer completed and persisted');
  assert(documents.length === count + 1 && calls.filter(call => call.path === '/api/chat').length === 3, 'Brand command navigated twice or reached RAG');
  checks.push('CertiQuiz goes to its application once after the complete local answer is stored');
  for (const [locale, command, destination] of [['en', 'open CertiTube', 'certitube/'], ['pt', 'abra CertiChat', 'certichat/'], ['it', 'vai a CertiTips', 'courses/'], ['es', 've a inicio', '']]) {
    await open(`${locale}/1Z0-1157-26/agents/`); await send(command);
    await page.waitForURL(`${base}${locale}/${destination}`);
    await page.waitForFunction(() => document.querySelector('deep-chat') && !document.querySelector('#certichat-panel').hidden);
    await completed();
    assert((await history()).some(message => message.text === command), `The ${locale} destination lost the command/history`);
  }
  checks.push('brand/home destinations preserve locale, open panel and transcript');
  await send('abre inicio'); await completed();
  assert(page.url() === `${base}es/` && (await history()).at(-1).text.includes('Página abierta:'), 'Already-open destination did not give its existing confirmation');
  checks.push('already-open destination confirms without a reload');

  await open('es/1Z0-1157-26/agents/');
  await page.locator('[data-diagram]').first().click();
  await page.locator('#diagram-viewer [data-diagram-present]').click();
  await page.waitForFunction(() => document.querySelector('#diagram-viewer.is-presenting [data-certichat]'));
  await openChat();
  const diagramId = await page.locator('#diagram-viewer').getAttribute('data-source-id');
  await send('Explícame esta lámina'); await completed();
  const diagramQuery = calls.filter(call => call.path === '/api/chat').at(-1).body;
  assert(diagramQuery.contextIds[0] === diagramId && diagramQuery.contextIds.length <= 2 && diagramQuery.pageUrl.startsWith('https://jgangini.github.io/certitips/'), 'Typed explanation lost the selected diagram or public canonical page');
  checks.push('typed explanation includes the selected presentation source and its public page');

  for (const early of [false, true]) {
    await page.goto(`${base}es/1Z0-1157-26/practice/`);
    await page.evaluate(() => localStorage.removeItem(`certitips:quiz:v1:${document.body.dataset.course}`));
    await page.reload();
    await page.locator('#quiz [data-start]').click(); await page.locator('#question-form').waitFor();
    await openChat();
    const attempt = await page.evaluate(() => localStorage.getItem(`certitips:quiz:v1:${document.body.dataset.course}`));
    const before = documents.length;
    await send('navegar hasta CertiQuiz');
    await page.locator('#quiz [data-finish-confirm][open]').waitFor();
    assert(page.url().endsWith('/practice/') && documents.length === before, 'Practice navigation bypassed the native confirmation');
    await page.locator('#quiz [data-finish-no]').click(); await completed();
    assert(await page.evaluate(() => localStorage.getItem(`certitips:quiz:v1:${document.body.dataset.course}`)) === attempt, 'Cancel changed the practice attempt');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('certivoice:practice-followup', { detail: { action: { name: 'quiz' } } })));
    assert(documents.length === before, 'A canceled text command retained its followup');
    await send('navegar hasta CertiQuiz'); await page.locator('#quiz [data-finish-confirm][open]').waitFor();
    if (!early) await completed();
    await page.locator('#quiz [data-finish-yes]').click();
    await page.waitForURL(`${base}es/certiquiz/`);
    assert(documents.length === before + 1, 'Accepted practice navigation ran more than once');
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
    assert(saved.messages.at(-1).text.includes('¿Deseas continuar?'), 'Early acceptance lost the simulated response/history');
  }
  checks.push('practice cancel preserves the attempt; normal and immediate mouse acceptance navigate exactly once after the answer');
  assert(calls.filter(call => call.path === '/api/chat').length === 4 && !calls.some(call => call.path === '/api/voice'), 'Local commands called inference');
  assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
  return { passed: checks.length, checks, chatRequests: 4, voiceRequests: 0, paidCalls: 0, screenshots: 0 };
}

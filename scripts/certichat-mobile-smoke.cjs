// Open http://127.0.0.1:4173/certitips/ in an isolated playwright-cli session, then:
// npx playwright-cli run-code --filename scripts/certichat-mobile-smoke.cjs
// Mocked API and synthetic visualViewport events; no screenshots or paid calls.
async (page) => {
  const base = new URL('/certitips/', page.url());
  if (base.origin !== 'http://127.0.0.1:4173') throw new Error('Run this check against the local preview on 127.0.0.1:4173.');
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const context = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => route.abort('blockedbyclient'));
  const tab = await context.newPage(), errors = [], requests = [], checks = [];
  let diagnosticTab = tab, phase = 'setup';
  let releaseReply;
  const pendingReply = new Promise(resolve => { releaseReply = resolve; });
  tab.on('pageerror', error => errors.push(error.message));
  const quota = { remaining: 19, limit: 20, refreshHours: 6, resetAt: new Date(Date.now() + 21600000).toISOString(), minuteRemaining: 1, retryAfter: 0 };
  const ready = () => tab.waitForFunction(() => document.querySelector('deep-chat')?.shadowRoot?.querySelector('#certichat-quota') && document.querySelector('[data-chat-clear]')?.disabled === false);
  const settle = () => tab.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const metrics = () => tab.evaluate(() => {
    const panel = document.querySelector('#certichat-panel'), shadow = document.querySelector('deep-chat').shadowRoot;
    const box = element => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const inside = [panel, document.querySelector('deep-chat'), shadow.querySelector('#messages'), shadow.querySelector('#input'), shadow.querySelector('#text-input-container')];
    return {
      panel: box(panel), heading: box(document.querySelector('.certichat-heading')), input: box(shadow.querySelector('#text-input')),
      submit: box(shadow.querySelector('[aria-label="Enviar consulta"]')), quota: box(shadow.querySelector('#certichat-quota')),
      quotaVisible: !shadow.querySelector('#certichat-quota').hidden,
      fontSize: parseFloat(getComputedStyle(shadow.querySelector('#text-input')).fontSize), bodyOverflow: getComputedStyle(document.body).overflow,
      overflow: inside.map(element => ({ id: element.id || element.tagName, extraWidth: element.scrollWidth - element.clientWidth })),
      panelExtraHeight: panel.scrollHeight - panel.clientHeight, messagesExtraHeight: shadow.querySelector('#messages').scrollHeight - shadow.querySelector('#messages').clientHeight,
      bubbles: [...shadow.querySelectorAll('.message-bubble')].map(box), border: getComputedStyle(panel).borderTopWidth, radius: getComputedStyle(panel).borderRadius,
    };
  });
  const fits = async (width, height, top = 0) => {
    await settle();
    const m = await metrics(), label = `${width}×${height}, top ${top}`;
    assert(m.panel.left >= -1 && m.panel.right <= width + 1 && m.panel.top >= top - 1 && m.panel.bottom <= top + height + 1, `${label}: panel escapes visible viewport`);
    for (const name of ['heading', 'input', 'submit', 'quota']) {
      if (name === 'quota' && !m.quotaVisible) continue;
      const r = m[name];
      assert(r.left >= m.panel.left - 1 && r.right <= m.panel.right + 1 && r.top >= m.panel.top - 1 && r.bottom <= m.panel.bottom + 1, `${label}: ${name} is clipped`);
    }
    assert(m.fontSize >= 16, `${label}: input is smaller than 16px (${m.fontSize})`);
    assert(m.overflow.every(item => item.extraWidth <= 1), `${label}: horizontal overflow ${JSON.stringify(m.overflow)}`);
    assert(m.bubbles.every(r => r.left >= m.panel.left - 1 && r.right <= m.panel.right + 1), `${label}: long message escapes the panel`);
    assert(m.messagesExtraHeight > 0 && m.panelExtraHeight <= 1, `${label}: transcript scrolls the panel instead of the message area`);
    if (width <= 800) {
      assert(Math.abs(m.panel.width - width) <= 1 && Math.abs(m.panel.height - height) <= 1 && Math.abs(m.panel.top - top) <= 1, `${label}: mobile panel is not fullscreen`);
      assert(m.border === '0px' && m.radius === '0px' && m.bodyOverflow === 'hidden', `${label}: mobile border or page scroll remains`);
    }
    return m;
  };
  try {
    // Replace the API origin in the served HTML, so both LOCAL and VPS builds use this isolated mock.
    await tab.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== base.origin) return route.abort('blockedbyclient');
      if (url.pathname.startsWith('/api/')) {
        requests.push({ path: url.pathname, method: request.method() });
        if (url.pathname === '/api/session') return route.fulfill({ json: { mode: 'LOCAL', authenticated: true, verificationRequired: false, available: true, quota } });
        if (url.pathname === '/api/chat') {
          await pendingReply;
          return route.fulfill({ json: { answer: 'Respuesta simulada para comprobar el envío.', sources: [], quota } });
        }
        throw new Error(`Unexpected API route: ${url.pathname}`);
      }
      if (!request.isNavigationRequest()) return route.continue();
      const response = await route.fetch();
      return route.fulfill({ response, body: (await response.text()).replace(/data-api="[^"]*"/, `data-api="${base.origin}"`) });
    });
    await tab.goto(base.href);
    await tab.evaluate(() => {
      const root = document.querySelector('[data-certichat]');
      const messages = Array.from({ length: 48 }, (_, index) => ({ role: index % 2 ? 'ai' : 'user', text: `Mensaje ${index + 1}. ${'Contenido de prueba para una conversación extensa. '.repeat(5)}` }));
      messages.push({ role: 'user', text: 'ConsultaSinEspacios'.repeat(60) });
      messages.push({ role: 'ai', text: `Respuesta con un identificador largo: ${'identificador'.repeat(80)}\n${'Línea de explicación adicional.\n'.repeat(12)}` });
      localStorage.setItem(`certichat:${root.dataset.siteRoot}`, JSON.stringify({ updatedAt: Date.now(), messages }));
    });
    await tab.reload();
    for (const width of [320, 390, 430, 642, 800, 1280]) {
      phase = `viewport ${width}`;
      await tab.setViewportSize({ width, height: 844 });
      await settle();
      const launcher = tab.getByRole('button', { name: 'CertiChat', exact: true });
      assert(await launcher.isVisible(), `${width}: launcher has no accessible name or is hidden`);
      const launch = await launcher.evaluate(element => {
        const r = element.getBoundingClientRect(), label = element.querySelector('span'), style = getComputedStyle(label), text = label.getBoundingClientRect();
        return { width: r.width, height: r.height, labelShown: style.display !== 'none' && style.visibility !== 'hidden' && text.width > 2 && text.height > 2 && !['inset(50%)', 'inset(100%)'].includes(style.clipPath) };
      });
      assert(width <= 800 ? Math.abs(launch.width - launch.height) <= 1 && launch.width >= 44 && !launch.labelShown : launch.labelShown, `${width}: incorrect launcher shape or text visibility`);
      if (width <= 800) {
        assert(await tab.locator('.footer-credit').isHidden(), `${width}: developer credit remains visible on mobile`);
        const footerPosition = () => tab.evaluate(() => {
          const footer = document.querySelector('.site-footer').getBoundingClientRect(), button = document.querySelector('[data-chat-open]').getBoundingClientRect();
          return { top: button.top, gap: footer.top - button.bottom, actual: footer.height, measured: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--footer-height')) };
        });
        const start = await footerPosition();
        await tab.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
        await settle();
        const end = await footerPosition();
        assert(start.gap >= 9 && end.gap >= 9 && Math.abs(start.top - end.top) <= 1, `${width}: scrolling moves the launcher or makes it overlap the footer`);
        // iOS safe-area changes resize footer padding without changing its content box.
        await tab.locator('.site-footer').evaluate(element => { element.style.paddingBottom = `${parseFloat(getComputedStyle(element).paddingBottom) + 34}px`; });
        await tab.waitForFunction(() => Math.abs(document.querySelector('.site-footer').getBoundingClientRect().height - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--footer-height'))) <= 1);
        const inset = await footerPosition();
        assert(inset.actual >= end.actual + 33 && inset.gap >= 9, `${width}: safe-area padding leaves the launcher over the footer`);
        await tab.locator('.site-footer').evaluate(element => element.style.removeProperty('padding-bottom'));
        await tab.waitForFunction(() => Math.abs(document.querySelector('.site-footer').getBoundingClientRect().height - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--footer-height'))) <= 1);
        await tab.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      }
      await launcher.click();
      await ready();
      const before = await fits(width, 844);
      await tab.locator('deep-chat #messages').evaluate(element => { element.scrollTop = 0; });
      await settle();
      const after = await metrics();
      assert(Math.abs(before.heading.top - after.heading.top) <= 1 && Math.abs(before.input.bottom - after.input.bottom) <= 1, `${width}: scrolling messages moves header or input`);
      const input = tab.getByRole('textbox', { name: 'Escribe tu consulta' });
      // Establish a real caret: WebKit can retain focus without a selection after viewport changes.
      await input.click();
      await input.pressSequentially('TextoSinEspacios'.repeat(30));
      assert((await input.innerText()).trim() === 'TextoSinEspacios'.repeat(30), `${width}: long input was not inserted`);
      await fits(width, 844);
      await input.press('ControlOrMeta+A');
      await input.press('Backspace');
      assert((await input.innerText()).trim() === '', `${width}: input was not cleared`);
      if (width === 390) {
        // Geometry simulation only; this does not claim to reproduce the real iOS keyboard or browser zoom.
        await tab.evaluate(() => {
          const viewport = window.visualViewport;
          window.__certichatSmokeViewport = Object.fromEntries(['height', 'offsetTop'].map(key => [key, Object.getOwnPropertyDescriptor(viewport, key)]));
          Object.defineProperty(viewport, 'height', { configurable: true, get: () => 400 });
          Object.defineProperty(viewport, 'offsetTop', { configurable: true, get: () => 0 });
          viewport.dispatchEvent(new Event('resize'));
        });
        await fits(width, 400);
        await tab.evaluate(() => {
          Object.defineProperty(window.visualViewport, 'offsetTop', { configurable: true, get: () => 80 });
          window.visualViewport.dispatchEvent(new Event('scroll'));
        });
        await fits(width, 400, 80);
        await tab.evaluate(() => {
          for (const [key, descriptor] of Object.entries(window.__certichatSmokeViewport)) {
            if (descriptor) Object.defineProperty(window.visualViewport, key, descriptor); else delete window.visualViewport[key];
          }
          delete window.__certichatSmokeViewport;
          window.visualViewport.dispatchEvent(new Event('resize'));
          window.visualViewport.dispatchEvent(new Event('scroll'));
        });
        await fits(width, 844);
        phase = 'Enter and loading indicator';
        await input.click();
        await input.pressSequentially('Consulta de prueba');
        assert((await input.innerText()).trim() === 'Consulta de prueba', 'Keyboard did not insert the query before Enter');
        await input.press('Enter');
        const loading = tab.locator('deep-chat .deep-chat-loading-message-dots-container');
        await loading.waitFor({ state: 'visible' });
        const dots = await loading.evaluate(bubble => {
          const b = bubble.getBoundingClientRect(), dot = bubble.querySelector('.loading-message-dots'), d = dot.getBoundingClientRect();
          const points = [d, ...['::before', '::after'].map(pseudo => {
            const style = getComputedStyle(dot, pseudo), left = d.left + parseFloat(style.left), top = d.top + parseFloat(style.top);
            return { left, top, right: left + parseFloat(style.width), bottom: top + parseFloat(style.height) };
          })];
          const left = Math.min(...points.map(p => p.left)), right = Math.max(...points.map(p => p.right));
          const top = Math.min(...points.map(p => p.top)), bottom = Math.max(...points.map(p => p.bottom));
          return { centered: Math.abs((left + right) / 2 - (b.left + b.right) / 2) <= 1 && Math.abs((top + bottom) / 2 - (b.top + b.bottom) / 2) <= 1, contained: points.every(p => p.left >= b.left && p.right <= b.right && p.top >= b.top && p.bottom <= b.bottom), visible: right > left && bottom > top };
        });
        assert(dots.visible && dots.centered && dots.contained, `Loading dots are off-center or clipped: ${JSON.stringify(dots)}`);
        releaseReply();
        await tab.waitForFunction(() => document.querySelector('deep-chat').getMessages().at(-1)?.text === 'Respuesta simulada para comprobar el envío.');
        await fits(width, 844);
        checks.push('synthetic visualViewport resize, scroll and restoration; mocked Enter submission; three loading dots centered and contained');
      }
      await tab.getByRole('button', { name: 'Cerrar CertiChat', exact: true }).click();
      assert(await tab.locator('#certichat-panel').isHidden() && await launcher.isVisible(), `${width}: close does not restore launcher`);
      assert(await launcher.evaluate(element => document.activeElement === element), `${width}: close does not restore focus`);
      assert(await tab.locator('body').evaluate(element => getComputedStyle(element).overflow !== 'hidden'), `${width}: close leaves page scrolling locked`);
      checks.push(`${width}px: launcher, input font, bounded panel, long transcript and input, inner scrolling, close`);
    }
    assert(requests.filter(request => request.path === '/api/chat').length === 1, 'Unexpected chat submissions');
    phase = 'reference navigation';
    const publicBase = new URL('https://jgangini.github.io/certitips/');
    const guide = new URL('1Z0-1085-26/oci-architecture/#regiones-y-dominios-de-fallo', publicBase).href;
    const referenceTab = await context.newPage();
    diagnosticTab = referenceTab;
    referenceTab.on('pageerror', error => errors.push(error.message));
    await referenceTab.setViewportSize({ width: 1280, height: 844 });
    await referenceTab.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== publicBase.origin) return route.abort('blockedbyclient');
      if (url.pathname === '/api/session') return route.fulfill({ json: { mode: 'LOCAL', authenticated: true, verificationRequired: false, available: true, quota } });
      if (url.pathname.startsWith('/api/')) { requests.push({ path: url.pathname, method: request.method() }); return route.abort('blockedbyclient'); }
      // Preserve public-origin navigation semantics while obtaining every byte from the local preview.
      const response = await route.fetch({ url: new URL(`${url.pathname}${url.search}`, base.origin).href });
      return request.isNavigationRequest() ? route.fulfill({ response, body: (await response.text()).replace(/data-api="[^"]*"/, `data-api="${publicBase.origin}"`) }) : route.fulfill({ response });
    });
    await referenceTab.goto(publicBase.href);
    await referenceTab.evaluate(guideURL => {
      const root = document.querySelector('[data-certichat]');
      localStorage.setItem(`certichat:${root.dataset.siteRoot}`, JSON.stringify({ updatedAt: Date.now(), messages: [{ role: 'user', text: '¿Dónde puedo profundizar sobre regiones?' }, { role: 'ai', text: `Consulta [Regiones y dominios de fallo](${guideURL})` }] }));
    }, guide);
    await referenceTab.reload();
    await referenceTab.getByRole('button', { name: 'CertiChat', exact: true }).click();
    const reference = referenceTab.locator('deep-chat').getByRole('link', { name: 'Regiones y dominios de fallo', exact: true });
    await reference.waitFor();
    const transcript = await referenceTab.locator('deep-chat').evaluate(element => JSON.stringify(element.getMessages()));
    await Promise.all([referenceTab.waitForURL(guide), reference.click()]);
    await referenceTab.getByRole('textbox', { name: 'Escribe tu consulta' }).waitFor();
    assert(await referenceTab.locator('#certichat-panel').isVisible(), 'Following a guide closes the chat');
    assert(await referenceTab.locator('deep-chat').evaluate(element => JSON.stringify(element.getMessages())) === transcript, 'Reference navigation loses conversation history');
    assert(await referenceTab.locator('#regiones-y-dominios-de-fallo').count() === 1 && new URL(referenceTab.url()).hash === '#regiones-y-dominios-de-fallo', 'Reference does not open the requested document section');
    assert(await referenceTab.evaluate(() => sessionStorage.getItem(`certichat:${document.querySelector('[data-certichat]').dataset.siteRoot}:reference`) === null), 'Reference marker was not consumed');
    await reference.click();
    assert(await referenceTab.locator('#certichat-panel').isVisible(), 'Following the current anchor closes the chat');
    await referenceTab.getByRole('button', { name: 'Cerrar CertiChat', exact: true }).click();
    assert(await referenceTab.locator('#certichat-panel').isHidden(), 'Manual close stopped working after reference navigation');
    await referenceTab.reload();
    assert(await referenceTab.locator('#certichat-panel').isHidden(), 'A stale reference marker reopens manually closed chat');
    assert(requests.filter(request => request.path === '/api/chat').length === 1, 'Reference navigation submitted an extra chat query');
    checks.push('real document and anchor navigation through local response mapping preserves open chat and history; manual close stays closed');
    assert(errors.length === 0, `Page errors: ${errors.join('; ')}`);
    return { checks, mockRequests: requests.length, errors, screenshots: false, realIOSKeyboardTested: false };
  } catch (error) {
    const state = await diagnosticTab.evaluate(() => {
      const chat = document.querySelector('deep-chat'), shadow = chat?.shadowRoot, input = shadow?.querySelector('#text-input');
      return { url: location.href, viewport: { width: innerWidth, height: innerHeight, visualHeight: visualViewport?.height, visualTop: visualViewport?.offsetTop }, input: input && { text: input.innerText, editable: input.contentEditable, disabled: input.getAttribute('aria-disabled'), fontSize: getComputedStyle(input).fontSize }, activeElement: shadow?.activeElement?.id, canSubmit: chat?.validateInput('Diagnóstico'), clearDisabled: document.querySelector('[data-chat-clear]')?.disabled, status: document.querySelector('[data-chat-status]')?.textContent, messages: chat?.getMessages()?.slice(-2), loading: [...(shadow?.querySelectorAll('.deep-chat-loading-message-dots-container') || [])].map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, display: getComputedStyle(element).display })) };
    }).catch(() => ({ unavailable: true }));
    throw new Error(`${error.message}\nMobile check diagnostics: ${JSON.stringify({ phase, requests, state, errors })}`);
  } finally {
    releaseReply();
    // Keep the context alive until mapped local fetches finish; the context route blocks late requests.
    await Promise.all(context.pages().map(openPage => openPage.unrouteAll({ behavior: 'wait' })));
    await context.close();
  }
}

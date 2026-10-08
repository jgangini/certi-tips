// Run against the local Docker service only:
// Run the CertiTips preview on 4173. The check overrides only the DOM's public
// API origin to 18740, so concurrent production builds cannot change the test target.
// npx --yes --package @playwright/cli playwright-cli -s=certiquiz open http://127.0.0.1:4173/certi-tips/certiquiz/
// npx --yes --package @playwright/cli playwright-cli -s=certiquiz run-code --filename scripts/certiquiz-browser-smoke.cjs
// Guests create their own rooms without a host key or account.
// No screenshots, tracing, videos, or persistent browser profiles.
async (page) => {
  const origin = new URL(page.url()).origin;
  const appUrl = `${origin}/certi-tips/certiquiz/`;
  const apiOrigin = 'http://127.0.0.1:18740';
  if (origin !== 'http://127.0.0.1:4173') throw new Error('This check requires the local CertiTips preview on 4173 and CertiQuiz API on 18740.');
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const browser = page.context().browser();
  const contexts = [];
  const errors = [];
  const loadingErrors = [];
  const checks = [];
  let currentRoomCode;
  const createPage = async viewport => {
    const context = await browser.newContext({ viewport, colorScheme: 'light' });
    contexts.push(context);
    // Keep the real network response: synthetic HTML responses can trigger Chrome's
    // local-network protection. Set only public config before the deferred app module.
    await context.addInitScript(({ apiOrigin }) => {
      const override = () => {
        const root = document.querySelector('.certiquiz-app');
        if (root) { root.dataset.apiOrigin = apiOrigin; observer.disconnect(); }
      };
      const observer = new MutationObserver(override);
      observer.observe(document, { childList: true, subtree: true });
      override();
    }, { apiOrigin });
    const tab = await context.newPage();
    tab.on('pageerror', error => errors.push(error.message));
    tab.on('console', message => { if (message.type() === 'error') loadingErrors.push(message.text()); });
    return tab;
  };
  const api = (tab, route, body) => tab.evaluate(async ({ apiOrigin, route, body }) => {
    const response = await fetch(`${apiOrigin}${route}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'include', headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-CertiQuiz': '1' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { ok: response.ok, status: response.status, data: await response.json() };
  }, { apiOrigin, route, body });
  const snapshot = async (tab, code) => {
    const response = await api(tab, `/api/rooms/${code}`);
    assert(response.ok, `Room snapshot failed with HTTP ${response.status}`);
    return response.data;
  };
  const post = (tab, route, data) => api(tab, route, data);
  const geometry = async (tab, label) => {
    const dimensions = await tab.evaluate(async () => {
      // Let the shared footer's ResizeObserver refresh its reserved height after a viewport change.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const previous = scrollY;
      scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      const mainBottom = document.querySelector('main').getBoundingClientRect().bottom;
      const footerTop = document.querySelector('.site-footer').getBoundingClientRect().top;
      scrollTo({ top: previous, behavior: 'instant' });
      return { width: innerWidth, scroll: document.documentElement.scrollWidth, headings: document.querySelectorAll('h1').length, activeStage: Boolean(document.querySelector('#question-title, .ranking-card #stage-title')), mainBottom, footerTop };
    });
    assert(dimensions.scroll <= dimensions.width + 1, `${label}: horizontal overflow ${dimensions.scroll}/${dimensions.width}`);
    assert(dimensions.headings === (dimensions.activeStage ? 0 : 1), `${label}: unexpected welcome heading for the current stage`);
    assert(dimensions.mainBottom <= dimensions.footerTop + 1, `${label}: content bottom ${dimensions.mainBottom} extends below footer top ${dimensions.footerTop}`);
  };
  const accentFocus = async (tab, control, label) => {
    await tab.keyboard.press('Tab'); await control.focus();
    const focus = await control.evaluate(node => {
      const probe = document.createElement('span'); probe.style.color = 'var(--accent)'; node.parentElement.append(probe);
      const accent = getComputedStyle(probe).color; probe.remove();
      const style = getComputedStyle(node);
      return { visible: node.matches(':focus-visible'), color: style.outlineColor, width: style.outlineWidth, accent };
    });
    assert(focus.visible && focus.color === focus.accent && focus.width === '3px', `${label}: keyboard focus does not use the site's accent outline`);
  };
  const inkFocus = async (tab, control, label) => {
    await tab.keyboard.press('Tab'); await control.focus();
    const focus = await control.evaluate(node => {
      const probe = document.createElement('span'); probe.style.color = 'var(--ink)'; node.parentElement.append(probe);
      const ink = getComputedStyle(probe).color; probe.remove();
      const style = getComputedStyle(node);
      return { visible: node.matches(':focus-visible'), color: style.outlineColor, width: style.outlineWidth, ink };
    });
    assert(focus.visible && focus.color === focus.ink && focus.width === '3px', `${label}: keyboard focus does not use the site's ink outline`);
  };
  const join = async (tab, code, nickname) => {
    await tab.goto(`${appUrl}?room=${code}`);
    await tab.getByLabel('Tu nombre o alias').waitFor();
    assert(await tab.getByLabel('Código de la sala').inputValue() === code, 'Invitation code was not prefilled');
    assert(await tab.locator('#join-form').count() === 1 && await tab.locator('#create-form, [data-role]').count() === 0, 'Invitation did not open only the participant form');
    await tab.getByLabel('Tu nombre o alias').fill(nickname);
    await tab.getByLabel('Tu nombre o alias').press('Enter');
    await tab.locator('[data-players]').waitFor();
  };
  const createRoom = async (host, count, seconds) => {
    await host.getByLabel('Número de preguntas', { exact: true }).fill(String(count));
    await host.getByLabel('Segundos por pregunta').fill(String(seconds));
    await host.getByRole('button', { name: 'Comenzar', exact: true }).click();
    await host.locator('[data-start]').waitFor();
    assert(await host.locator('.room-header, [data-player-count]').count() === 0, 'Lobby still shows the secondary heading or team count');
    assert(await host.locator('[data-players]').evaluate(node => !node.closest('.card') && node.childElementCount === 0 && !node.textContent.trim()), 'Empty roster still shows a card or waiting message');
    const response = await api(host, '/api/session');
    currentRoomCode = response.data.roomCode;
    return currentRoomCode;
  };
  try {
    const opening = await createPage({ width: 1280, height: 900 });
    await opening.route(`${apiOrigin}/api/catalog`, async route => {
      await new Promise(resolve => setTimeout(resolve, 250));
      await route.continue();
    });
    const openingLoad = opening.goto(appUrl);
    const loading = opening.locator('.loading-full');
    await loading.waitFor();
    const loadingLayout = await loading.evaluate(async node => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = node.getBoundingClientRect();
      const footer = document.querySelector('.site-footer').getBoundingClientRect();
      const header = document.querySelector('.site-header').getBoundingClientRect();
      const style = getComputedStyle(node);
      return { border: style.borderTopWidth, textAlign: style.textAlign, eyebrow: node.querySelector('.eyebrow'), width: rect.width, viewport: innerWidth, top: rect.top, headerBottom: header.bottom, bottom: rect.bottom, footerTop: footer.top };
    });
    assert(loadingLayout.border === '0px' && loadingLayout.textAlign === 'center' && !loadingLayout.eyebrow && loadingLayout.width === loadingLayout.viewport && Math.abs(loadingLayout.top - loadingLayout.headerBottom) < 1 && Math.abs(loadingLayout.bottom - loadingLayout.footerTop) < 1, 'Initial loading does not fill the centered borderless view');
    await openingLoad;
    await opening.locator('[data-role="host"]').waitFor();
    checks.push('Initial loading: centered full view without a card, border or eyebrow');

    const host = await createPage({ width: 1280, height: 900 });
    const first = await createPage({ width: 390, height: 844 });
    const second = await createPage({ width: 320, height: 800 });
    await host.route(`${apiOrigin}/api/catalog`, route => route.abort('connectionfailed'));
    await host.goto(appUrl);
    await host.getByRole('heading', { name: 'Volvamos a intentarlo' }).waitFor();
    const failureCard = host.locator('.loading-error');
    assert(await failureCard.locator('[role="alert"]').count() === 1 && await host.locator('#app [role="alert"]').count() === 1, 'Initial failure has a duplicate/global error banner');
    assert(await failureCard.locator('.eyebrow').count() === 0, 'Initial failure retains the CertiQuiz eyebrow');
    assert(await failureCard.getByRole('alert').textContent() === 'CertiQuiz no se pudo cargar. Revisa tu conexión e inténtalo de nuevo.', 'Initial failure does not identify CertiQuiz clearly');
    assert(await failureCard.locator('button').count() === 0 && await failureCard.locator('kbd').textContent() === 'F5', 'Initial failure should explain reload instead of offering another connect button');
    const failureLayout = await failureCard.evaluate(node => {
      const style = getComputedStyle(node);
      return { border: style.borderTopWidth, width: node.getBoundingClientRect().width, viewport: innerWidth, textAlign: style.textAlign };
    });
    assert(failureLayout.border === '0px' && failureLayout.width === failureLayout.viewport && failureLayout.textAlign === 'center', 'Initial failure does not fill the view cleanly without a border');
    const failureRocket = failureCard.locator('h1 svg');
    const rocketPaths = await failureRocket.locator('path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')));
    assert(await failureRocket.getAttribute('viewBox') === '0 0 1920 1920' && await failureRocket.getAttribute('aria-hidden') === 'true', 'Initial failure is missing the decorative rocket');
    assert(await failureRocket.evaluate(node => getComputedStyle(node).animationName) !== 'none', 'Rocket has no subtle animation');
    await host.emulateMedia({ reducedMotion: 'reduce' });
    assert(await failureRocket.evaluate(node => getComputedStyle(node).animationName) === 'none', 'Rocket ignores reduced-motion preference');
    await host.emulateMedia({ reducedMotion: 'no-preference' });
    for (const width of [1280, 390, 320]) { await host.setViewportSize({ width, height: 900 }); await geometry(host, `Initial failure ${width}px`); }
    await host.setViewportSize({ width: 1280, height: 900 });
    await host.unroute(`${apiOrigin}/api/catalog`);
    checks.push('Initial connection failure: centered card, one inline error, exact rocket, reload/F5 guidance and reduced motion');
    await host.goto(appUrl);
    await host.locator('[data-role="host"]').waitFor({ timeout: 8000 }).catch(async () => {
      throw new Error(`Entry did not load with API ${await host.locator('.certiquiz-app').getAttribute('data-api-origin')}: ${await host.locator('main').innerText()} ${loadingErrors.join('; ')}`);
    });
    assert(await host.locator('script[src$="/certiquiz.js"]').getAttribute('src') === '/certi-tips/assets/certiquiz.js', 'CertiQuiz JavaScript is not hosted by CertiTips');
    assert(await host.locator('link[href$="/certiquiz.css"]').getAttribute('href') === '/certi-tips/assets/certiquiz.css', 'CertiQuiz CSS is not hosted by CertiTips');
    assert(await host.locator('.welcome > :is(h1, .lead, .eyebrow)').count() === 0, 'Entry retains removed CertiQuiz heading, lead or eyebrow');
    const breadcrumb = host.getByRole('navigation', { name: 'Ruta de navegación' });
    assert(await breadcrumb.getByRole('link', { name: 'Home' }).getAttribute('href') === '/certi-tips/' && await breadcrumb.locator('[aria-current="page"]').textContent() === 'CertiQuiz', 'CertiQuiz lacks its home breadcrumb');
    const roleCards = host.locator('.role-options > .role-card');
    assert(await roleCards.count() === 2 && await roleCards.evaluateAll(nodes => nodes.every(node => node.tagName === 'BUTTON' && node.getAttribute('data-role'))), 'Role choices are not full-card buttons');
    assert(await host.locator('.role-card .role-action').count() === 0, 'Role cards retain duplicate action buttons');
    assert(await host.locator('.role-card > .eyebrow').count() === 0, 'Role cards still display their removed eyebrows');
    const search = host.locator('.search-toggle');
    assert(await search.evaluate(node => getComputedStyle(node).backgroundColor) === 'rgb(255, 255, 255)', 'Search control does not have a white background in the light theme');
    const shortcut = search.locator('kbd');
    const shortcutStyle = await shortcut.evaluate(node => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, header: getComputedStyle(document.querySelector('.site-header')).backgroundColor, radius: style.borderRadius, smaller: Number.parseFloat(style.fontSize) < Number.parseFloat(getComputedStyle(node.parentElement).fontSize) };
    });
    assert(shortcutStyle.background === shortcutStyle.header && shortcutStyle.radius === '4px' && shortcutStyle.smaller, 'Search shortcut does not match the compact rectangular header treatment');
    const apiSurface = await host.evaluate(async apiOrigin => {
      const root = await fetch(`${apiOrigin}/`, { credentials: 'include' });
      const oldAsset = await fetch(`${apiOrigin}/app.js`, { credentials: 'include' });
      return { rootStatus: root.status, rootType: root.headers.get('content-type'), oldAssetStatus: oldAsset.status };
    }, apiOrigin);
    assert(apiSurface.rootStatus === 404 && apiSurface.oldAssetStatus === 404 && !apiSurface.rootType?.includes('text/html'), 'The API still hosts the former standalone interface');
    checks.push('CertiQuiz UI/assets hosted by CertiTips; VPS origin exposes API only');
    for (const width of [1280, 390, 320]) { await host.setViewportSize({ width, height: 900 }); await geometry(host, `Entry ${width}px`); }
    await host.setViewportSize({ width: 1280, height: 900 });
    await host.getByRole('button', { name: 'Activar modo oscuro' }).click();
    assert(await host.locator('html').getAttribute('data-theme') === 'dark', 'Dark theme did not activate');
    await host.reload();
    await host.locator('[data-role="host"]').waitFor();
    assert(await host.locator('html').getAttribute('data-theme') === 'dark', 'Theme did not survive reload');
    checks.push('Entry: 1280/390/320px without overflow; dark theme persists');

    assert(await host.locator('#app form').count() === 0, 'Role selection should not expose both forms');
    assert((await api(host, '/api/session')).data.host === false, 'Fresh visitor unexpectedly has host permissions');
    await host.locator('[data-role="player"]').focus(); await host.keyboard.press('Enter');
    await host.getByLabel('Código de la sala').waitFor();
    assert(await host.locator('#create-form').count() === 0 && await host.locator('#join-form').count() === 1, 'Participant role does not isolate its form');
    assert(new URL(host.url()).hash === '#participant', 'Participant role does not have a shareable URL fragment');
    assert(await host.getByRole('heading', { name: 'Sala', exact: true }).count() === 1 && await host.locator('.player-entry > .eyebrow').textContent() === 'INGRESAR', 'Participant form does not use the room heading and entry eyebrow');
    assert(await host.locator('#join-form .hint').count() === 1, 'Participant form retains the removed alias hint');
    const participantAction = await host.locator('#join-form .join-actions').evaluate(node => {
      const button = node.querySelector('.button');
      const action = node.getBoundingClientRect();
      const buttonBox = button.getBoundingClientRect();
      return { aligned: Math.abs(action.right - buttonBox.right) < 1, border: getComputedStyle(node).borderTopWidth, buttonWidth: buttonBox.width, wide: button.classList.contains('wide') };
    });
    assert(participantAction.aligned && participantAction.border === '1px' && participantAction.buttonWidth === 140 && !participantAction.wide, 'Participant action does not match the compact right-aligned lobby footer');
    await inkFocus(host, host.getByLabel('Código de la sala'), 'Participant room code');
    await host.getByLabel('Código de la sala').fill('000000');
    await host.getByLabel('Tu nombre o alias').fill('QA Código inválido');
    await host.getByRole('button', { name: 'Entrar', exact: true }).click();
    await host.locator('#join-form [data-error]').waitFor({ state: 'visible' });
    assert(await host.locator('[data-error]').evaluate(node => Boolean(node.closest('#join-form') && node.closest('.card'))), 'Invalid PIN error appeared outside its form/card');
    assert(await host.locator('.certiquiz-app > [role="alert"]').count() === 0, 'A global error banner remains');
    await host.goto(appUrl);
    await host.locator('[data-role="host"]').waitFor();
    await host.locator('[data-role="host"]').focus(); await host.keyboard.press('Enter');
    const coursePicker = host.locator('.course-picker');
    const courseSummary = coursePicker.locator('summary#course');
    await courseSummary.waitFor();
    assert(await host.locator('#join-form').count() === 0 && await host.locator('#create-form').count() === 1, 'Host role does not isolate its form');
    assert(new URL(host.url()).hash === '#host', 'Host role does not have a shareable URL fragment');
    const certiQuizBreadcrumb = host.getByRole('navigation', { name: 'Ruta de navegación' }).getByRole('link', { name: 'CertiQuiz' });
    assert(await host.locator('.certiquiz-breadcrumb').innerText() === 'Home / CertiQuiz / Anfitrión' && await certiQuizBreadcrumb.getAttribute('href') === '/certi-tips/certiquiz/', 'Host breadcrumb does not provide the CertiQuiz base route');
    await certiQuizBreadcrumb.click();
    await host.waitForURL(url => new URL(url).pathname === '/certi-tips/certiquiz/' && new URL(url).hash === '');
    await host.locator('[data-role="host"]').waitFor();
    assert(await host.locator('#app form').count() === 0, 'CertiQuiz breadcrumb did not return to role selection');
    await host.evaluate(() => { location.hash = 'host'; });
    await host.locator('#create-form').waitFor();
    assert(new URL(host.url()).hash === '#host', 'Changing the host fragment did not update the form');
    assert(await host.locator('[type="password"]').count() === 0, 'Guest hosting still asks for a private key');
    assert(await host.getByLabel('Segundos por pregunta').inputValue() === '10', 'Host duration is not ten seconds by default');
    assert((await host.locator('#create-form .hint').innerText()).includes('Hasta 500 participantes'), 'Host hint does not advertise the 500-participant limit');
    assert(await host.locator('#create-form > ol > li.certification-item').count() === 4 && await host.locator('#create-form > ol > li:last-child.setup-actions .certification-number').count() === 1, 'Generate action is not the fourth numbered setup step');
    const setupAction = host.locator('#create-form .setup-actions');
    assert(await setupAction.locator('.setup-label').textContent() === 'Generar Sala' && await setupAction.getByRole('button', { name: 'Comenzar', exact: true }).locator('svg').count() === 0, 'Host setup action lacks its title or retains the room icon');
    const setupWidth = await setupAction.evaluate(node => ({ button: node.querySelector('button').getBoundingClientRect().width, input: document.querySelector('#seconds').getBoundingClientRect().width }));
    assert(Math.abs(setupWidth.button - setupWidth.input) < 1, 'Host setup action button does not match the numeric input width');
    await accentFocus(host, host.getByLabel('Número de preguntas', { exact: true }), 'Dark host form');
    checks.push('Keyboard role selection, one form, inline PIN error, no key, default ten seconds, limit500 and standard accent focus');

    const bankResponse = await host.request.get('http://127.0.0.1:4173/certi-tips/assets/questions.json');
    assert(bankResponse.ok(), 'Start/rebuild the CertiTips preview on port 4173 before running this check');
    const bank = await bankResponse.json();
    await host.getByLabel('Número de preguntas', { exact: true }).fill('999');
    await courseSummary.click();
    await coursePicker.locator('[data-course="agentic-ai-foundations-2026"]').click();
    assert(await host.locator('#create-form').evaluate(form => new FormData(form).get('courseId')) === 'agentic-ai-foundations-2026', 'Picker selection is missing from FormData');
    assert(await coursePicker.evaluate(node => !node.open) && await courseSummary.evaluate(node => node === document.activeElement), 'Selecting a course did not close the panel and restore focus');
    assert(await host.getByLabel('Número de preguntas', { exact: true }).evaluate(node => node.value === node.max), 'Course selection did not clamp an excessive question count');
    await host.getByLabel('Número de preguntas', { exact: true }).fill('0');
    assert(await host.getByLabel('Número de preguntas', { exact: true }).evaluate(node => node.validity.rangeUnderflow), 'Host question count allows zero');
    const duration = host.getByLabel('Segundos por pregunta');
    await duration.fill(String(Number(await duration.getAttribute('max')) + 1));
    assert(await duration.evaluate(node => node.validity.rangeOverflow), 'Host duration allows values beyond the service limit');
    const code = await createRoom(host, 2, 10);
    assert(await host.locator('.welcome .certiquiz-mark').innerText() === 'CertiQuiz', 'Room creation lost the CertiQuiz breadcrumb mark');
    const created = await snapshot(host, code);
    assert(created.role === 'host' && created.questionCount === 2 && created.secondsPerQuestion === 10 && /^\d{6}$/.test(code), 'Guest room did not preserve host settings or generate a PIN');
    assert(await host.locator('#stage-title').evaluate(node => node !== document.activeElement), 'Lobby title unexpectedly receives focus when entering the room');
    const sessionCookies = (await host.context().cookies()).filter(cookie => cookie.name.startsWith('cq_'));
    assert(sessionCookies.length >= 2 && sessionCookies.every(cookie => cookie.httpOnly && cookie.sameSite === 'Strict'), 'Guest host cookies lack HttpOnly/SameSite protections');
    assert(!/cq_(?:host|room)=/.test(await host.evaluate(() => document.cookie)), 'Session cookie is visible to JavaScript');
    await host.reload(); await host.locator('[data-start]').waitFor();
    assert((await snapshot(host, code)).role === 'host', 'Host room was not restored after refresh');
    const exitRoom = host.locator('[data-exit]');
    assert(await exitRoom.evaluate(node => node.closest('.actions') && node.nextElementSibling?.hasAttribute('data-start') && node.textContent === 'Finalizar' && node.nextElementSibling.textContent === 'Comenzar'), 'Finish action is not before Comenzar in the lobby actions');
    await exitRoom.click();
    const confirmation = host.locator('dialog[data-confirm]');
    assert(await confirmation.evaluate(node => node.open && node.matches(':modal')), 'Room exit did not open a native modal');
    assert(await confirmation.locator('[data-confirm-no]').evaluate(node => node === document.activeElement), 'Destructive confirmation did not focus Cancel');
    const confirmationSize = await confirmation.evaluate(node => ({
      width: node.getBoundingClientRect().width,
      icon: node.querySelector('.confirmation-icon').getBoundingClientRect().width,
      action: node.querySelector('.confirmation-actions .button').getBoundingClientRect().height
    }));
    assert(confirmationSize.width <= 400 && confirmationSize.icon <= 76 && confirmationSize.action >= 44, 'Room exit confirmation is too large or loses a usable action target');
    await confirmation.locator('[data-confirm-no]').click(); await confirmation.waitFor({ state: 'hidden' });
    assert(await exitRoom.evaluate(node => node === document.activeElement), 'Cancelling room exit did not restore focus');
    checks.push('Anonymous room creation, generated PIN/settings, HttpOnly cookies, host refresh and Salir before Comenzar with cancellable native modal');
    const invite = `${appUrl}?room=${code}`;
    const address = host.getByLabel('Enlace de invitación', { exact: true });
    const copyButton = host.locator('.invite-link [data-copy]');
    assert(await address.inputValue() === invite && await address.evaluate(node => node.readOnly), 'Invitation field is not readonly or has the wrong site URL');
    assert(await host.locator('.room-code').count() === 0 && await host.locator('.pin').textContent() === code, 'The header repeats the PIN or the primary PIN disappeared');
    const invitationCodeLayout = await host.locator('.invite-code').evaluate(node => {
      const pin = node.querySelector('.pin');
      const qr = node.querySelector('.invite-qr');
      const pinBox = pin.getBoundingClientRect();
      const qrBox = qr.getBoundingClientRect();
      const style = getComputedStyle(pin);
      return { centered: Math.abs((pinBox.top + pinBox.height / 2) - (qrBox.top + qrBox.height / 2)) < 1, fontSize: style.fontSize, lineHeight: style.lineHeight };
    });
    assert(invitationCodeLayout.centered && invitationCodeLayout.fontSize === '72px' && invitationCodeLayout.lineHeight === '72px', 'Invitation PIN is not enlarged and aligned with its QR code');
    const invitationQr = host.locator('.invite-qr');
    assert(await invitationQr.locator('svg[role="img"]').count() === 1 && await invitationQr.locator('.invite-qr-logo svg').count() === 1 && await invitationQr.locator('figcaption').count() === 0, 'Invitation QR lacks its CertiTips mark or retains removed copy');
    assert(await host.locator('.lobby-footer').evaluate(node => {
      const facts = node.querySelector('.fact-row').getBoundingClientRect();
      const actions = node.querySelector('.game-actions').getBoundingClientRect();
      return Math.abs(facts.top + facts.height / 2 - (actions.top + actions.height / 2)) <= 1;
    }), 'Lobby facts and actions are not on the same row');
    for (const theme of ['dark', 'light']) {
      if (theme === 'light') await host.getByRole('button', { name: 'Activar modo claro' }).click();
      for (const width of [1280, 390, 320]) {
        await host.setViewportSize({ width, height: 900 }); await geometry(host, `${theme} invitation ${width}px`);
        const bounds = await host.locator('.invite-link').evaluate(node => {
          const field = node.querySelector('input').getBoundingClientRect();
          const button = node.querySelector('button').getBoundingClientRect();
          const container = node.getBoundingClientRect();
          return { integrated: Math.abs(field.right - button.left) <= 1 && Math.abs(field.top - button.top) <= 1, contained: field.left >= container.left && button.right <= container.right, target: button.width >= 44 && button.height >= 44 };
        });
        assert(bounds.integrated && bounds.contained && bounds.target, `${theme}/${width}: invitation copy control is detached, clipped or too small`);
      }
    }
    await host.setViewportSize({ width: 1280, height: 900 });
    await accentFocus(host, address, 'Light readonly invitation');
    await host.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    await copyButton.locator('svg').click();
    await host.waitForFunction(() => document.querySelector('[data-copy]')?.getAttribute('aria-label') === 'Enlace copiado');
    assert(await host.evaluate(() => navigator.clipboard.readText()) === invite, 'Clicking the actual SVG copied the wrong invitation');
    assert(await host.locator('#announcement').textContent() === 'Enlace de invitación copiado.' && await copyButton.locator('svg').count() === 1, 'Copy success lacks accessible feedback or replaced the button incorrectly');
    const cdp = await host.context().newCDPSession(host);
    try {
      await host.context().clearPermissions();
      const { targetInfo } = await cdp.send('Target.getTargetInfo');
      for (const name of ['clipboard-read', 'clipboard-write']) await cdp.send('Browser.setPermission', { permission: { name }, setting: 'denied', origin, browserContextId: targetInfo.browserContextId });
      await copyButton.locator('svg').click();
      await host.locator('.join-card [data-error]').waitFor({ state: 'visible' });
      assert(await host.locator('#app [role="alert"]:visible').count() === 1 && await host.locator('[data-error]').evaluate(node => Boolean(node.closest('.join-card'))), 'Clipboard permission error escaped or duplicated its card');
      await host.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
      await copyButton.locator('svg').click();
      await host.locator('[data-error]').waitFor({ state: 'hidden' });
      assert(await host.evaluate(() => navigator.clipboard.readText()) === invite, 'Copy did not recover after restoring native permission');
    } finally { await cdp.detach(); }
    checks.push('Readonly invitation, integrated SVG copy, native clipboard success/denial/recovery, one PIN, responsive light/dark geometry');
    const xssName = '<b>Jugador Uno</b>';
    await join(first, code, xssName);
    const firstAvatar = host.getByRole('img', { name: xssName, exact: true });
    await firstAvatar.waitFor();
    const retainedAvatar = await firstAvatar.elementHandle();
    const retainedAnimation = await firstAvatar.evaluateHandle(node => node.getAnimations()[0]);
    const avatarColor = await firstAvatar.evaluate(node => getComputedStyle(node).backgroundColor);
    const playerList = host.locator('.player-list');
    const retainedList = await playerList.elementHandle();
    await playerList.focus();
    await second.goto(`${appUrl}?room=${code}`);
    await second.getByLabel('Tu nombre o alias').fill(xssName.toUpperCase());
    await second.getByLabel('Tu nombre o alias').press('Enter');
    const duplicateNameError = second.locator('#join-form [data-error]');
    await duplicateNameError.waitFor({ state: 'visible' });
    assert((await duplicateNameError.innerText()).includes('nombre ya está en uso') && await second.locator('#app [role="alert"]:visible').count() === 1, 'Case-insensitive duplicate name was not rejected inside its form');
    assert((await snapshot(host, code)).playerCount === 1, 'Duplicate name added another participant');
    const unicodeName = 'Ángela María Núñez';
    await second.getByLabel('Tu nombre o alias').fill(unicodeName);
    await second.getByLabel('Tu nombre o alias').press('Enter');
    await second.locator('[data-players]').waitFor();
    await host.waitForFunction(() => document.querySelectorAll('[data-players] .player-avatar').length === 2);
    assert(await host.locator('.team-total').textContent() === '2', 'Central participant count did not update');
    assert(await host.locator('.team-total').evaluate(node => {
      const counter = node.getBoundingClientRect(), card = document.querySelector('.room-grid > .card').getBoundingClientRect();
      const avatar = document.querySelector('.player-avatar').getBoundingClientRect(), style = getComputedStyle(node);
      return Math.abs(counter.y + counter.height / 2 - card.y - card.height / 2) < 1 && Math.abs(counter.top - avatar.bottom - 8) < 7 && style.backgroundColor === getComputedStyle(document.querySelector('.room-grid > .card')).backgroundColor && style.color === getComputedStyle(document.querySelector('.lead')).color && style.borderTopColor === getComputedStyle(document.querySelector('.room-grid > .card')).borderRightColor;
    }), 'Counter is not centered beside the lobby card with nearby avatars and neutral theme colors');
    assert(await retainedAvatar.evaluate(node => node.isConnected && node === document.querySelector('[data-players] .player-avatar')), 'A new participant replaced the existing avatar');
    assert(await retainedList.evaluate(node => node.isConnected && node === document.activeElement && node === document.querySelector('.player-list')), 'A new participant replaced the roster or stole its focus');
    assert(await retainedAvatar.evaluate((node, animation) => node.getAnimations()[0] === animation, retainedAnimation), 'A new participant restarted the existing avatar animation');
    assert(await firstAvatar.getAttribute('aria-label') === xssName && await firstAvatar.locator('.avatar-initials').textContent() === '<U' && await firstAvatar.locator('.avatar-name').textContent() === xssName, 'Literal alias is missing from its accessible avatar, initials or expanded name');
    const unicodeAvatar = host.getByRole('img', { name: unicodeName, exact: true });
    assert(await unicodeAvatar.getAttribute('aria-label') === unicodeName && await unicodeAvatar.locator('.avatar-initials').textContent() === 'ÁN' && await unicodeAvatar.locator('.avatar-name').textContent() === unicodeName, 'Unicode first/last initials or complete expanded name are incorrect');
    assert(await host.locator('[data-players] b').count() === 0, 'Alias created HTML elements');
    const avatars = host.locator('[data-players] .player-avatar');
    assert(await avatars.evaluateAll(nodes => nodes.length === 2 && nodes.every(node => {
      const style = getComputedStyle(node);
      return node.tabIndex < 0 && style.width === '56px' && style.height === '56px' && style.borderRadius === '50%' && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.animationName !== 'none' && Number.parseFloat(style.animationDuration) >= 4;
    })), 'Avatars are not colored 56px circles with subtle motion, or create unnecessary tab stops');
    assert(await avatars.evaluateAll(nodes => nodes.every(node => {
      const r = node.getBoundingClientRect(), name = node.querySelector('.avatar-name');
      const hit = (x, y) => document.elementsFromPoint(r.left + x, r.top + y).some(element => element === name || name.contains(element));
      return [[7, 7], [49, 7], [7, 49], [49, 49]].every(([x, y]) => !hit(x, y)) && [[28, 28], [12, 12], [44, 44]].every(([x, y]) => hit(x, y));
    })), 'The name overlay changes the resting circle into a rounded rectangle');
    assert(await playerList.evaluate(node => node.tabIndex === 0), 'The roster lacks a keyboard scroll target');
    assert(await avatars.evaluateAll(nodes => nodes.every(node => getComputedStyle(node).animationPlayState === 'paused')), 'Roster keyboard focus did not pause every avatar');
    await host.keyboard.press('Tab');
    assert(await playerList.evaluate(node => !node.contains(document.activeElement)), 'Tab became trapped in individual avatars');
    await host.keyboard.press('Shift+Tab');
    assert(await playerList.evaluate(node => node === document.activeElement), 'Keyboard cannot return to the roster');
    await host.locator('[data-start]').focus();
    // The avatar intentionally moves forever; use the pointer instead of waiting for a stable box.
    const avatarBounds = await firstAvatar.boundingBox();
    await host.mouse.move(avatarBounds.x + avatarBounds.width / 2, avatarBounds.y + avatarBounds.height / 2);
    assert(await firstAvatar.evaluate(node => getComputedStyle(node).animationPlayState) === 'paused' && await unicodeAvatar.evaluate(node => getComputedStyle(node).animationPlayState) === 'running', 'Hover did not pause only the target avatar');
    await host.waitForFunction(() => getComputedStyle(document.querySelector('.avatar-name > span')).opacity === '1' && getComputedStyle(document.querySelector('.avatar-name')).clipPath === 'inset(0px round 8px)');
    assert(await firstAvatar.locator('.avatar-name').evaluate(node => { const style = getComputedStyle(node); return style.clipPath === 'inset(0px round 8px)' && node.getBoundingClientRect().width > 56 && Number.parseFloat(style.transitionDuration) > 0; }), 'Hovered avatar did not smoothly expand into a rounded rectangle');
    await host.locator('[data-start]').focus(); await host.mouse.move(0, 0);
    assert(await firstAvatar.evaluate(node => getComputedStyle(node).animationPlayState) === 'running', 'Avatar motion did not resume after hover/focus');
    await host.emulateMedia({ reducedMotion: 'reduce' });
    assert(await avatars.evaluateAll(nodes => nodes.every(node => getComputedStyle(node).animationName === 'none')), 'Avatars ignore reduced-motion preference');
    await host.emulateMedia({ reducedMotion: 'no-preference' });
    await host.getByRole('button', { name: 'Activar modo oscuro' }).click();
    for (const width of [1280, 390, 320]) {
      await host.setViewportSize({ width, height: 900 }); await geometry(host, `Dark avatars ${width}px`);
      if (width === 320) {
        // CSS-only capacity fixture: no API joins; append, measure and remove atomically before polling resumes.
        const capacity = await host.locator('.player-list').evaluate(list => {
          const clones = [];
          try {
            while (list.querySelectorAll('.player-avatar').length < 500) { const clone = list.querySelector('[data-player-id]').cloneNode(true); clones.push(clone); list.append(clone); }
            return { count: list.querySelectorAll('.player-avatar').length, height: list.getBoundingClientRect().height, scroll: list.scrollHeight, client: list.clientHeight, page: document.documentElement.scrollWidth, width: innerWidth, tabStops: [list, ...list.querySelectorAll('[tabindex]')].filter(node => node.tabIndex >= 0).length };
          } finally { clones.forEach(node => node.remove()); }
        });
        assert(capacity.count === 500 && capacity.height <= 360 && capacity.scroll > capacity.client && capacity.page <= capacity.width + 1 && capacity.tabStops === 1, '500-avatar DOM fixture exceeds its scroll panel, overflows at 320px or creates extra tab stops');
      }
    }
    assert(await firstAvatar.evaluate(node => getComputedStyle(node).backgroundColor) === avatarColor, 'Avatar color changed across roster updates/theme');
    await host.setViewportSize({ width: 1280, height: 900 });
    await host.getByRole('button', { name: 'Activar modo claro' }).click();
    assert(!/Zoom|Conectado a la sala/.test(await host.locator('#app').innerText()), 'The lobby still shows removed projection/connection messages');
    await geometry(host, 'Host lobby'); await geometry(first, '390px lobby'); await geometry(second, '320px lobby');
    await first.reload();
    await first.locator('[data-players]').waitFor();
    assert((await snapshot(first, code)).role === 'player', 'Player membership was not restored after invitation-page reload');
    await first.context().setOffline(true);
    await first.waitForFunction(() => document.querySelector('#connection')?.textContent.includes('Reconectando'), null, { timeout: 7000 });
    await first.context().setOffline(false);
    await first.waitForFunction(() => document.querySelector('#connection')?.textContent === '', null, { timeout: 7000 });
    assert(await first.locator('#connection, #announcement').evaluateAll(nodes => nodes.every(node => node.closest('.card'))), 'Connection/announcements escaped the active card');
    assert((await snapshot(first, code)).me.nickname === xssName, 'Reconnection lost participant membership');
    const forbidden = await post(first, `/api/rooms/${code}/start`, {});
    assert([401, 403].includes(forbidden.status), `Participant start should be denied, received HTTP ${forbidden.status}`);
    checks.push('PIN invitation, inline duplicate rejection, stable Unicode avatars, accessible tooltips, focus/hover/reduced motion, bounded 500-avatar DOM fixture, cookie restoration, quiet reconnection, host-only start');

    await host.locator('[data-start]').click();
    await first.locator('[data-send]').waitFor(); await second.locator('[data-send]').waitFor();
    for (const tab of [host, first, second]) assert(await tab.locator('.welcome, .room-header').count() === 0, 'Active question still shows the welcome or room heading');
    let current = await snapshot(first, code);
    assert(!Object.hasOwn(current.question, 'correctOption') && !Object.hasOwn(current.question, 'explanation'), 'The open question exposed its answer');
    const source = bank.find(question => question.id === current.question.id);
    assert(source, 'Question id is absent from the reused CertiTips bank');
    const correct = first.locator(`input[name="optionId"][value="${source.correctOption}"]`);
    await correct.check(); await correct.focus();
    await accentFocus(first, correct, 'Light answer option');
    const timerBefore = Number.parseInt(await first.locator('[data-timer]').textContent(), 10);
    const [unchanged] = await Promise.all([
      first.waitForResponse(response => response.status() === 204 && response.request().method() === 'GET' && new URL(response.url()).pathname === `/api/rooms/${code}` && new URL(response.url()).searchParams.has('version'), { timeout: 5000 }),
      first.waitForTimeout(2200),
    ]);
    // Chromium does not retain HTTP204 bodies in CDP; inspect the same conditional GET with native fetch.
    const empty = await first.evaluate(async url => {
      const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
      return { status: response.status, body: await response.text() };
    }, unchanged.url());
    assert(empty.status === 204 && empty.body === '', 'Unchanged polling response unexpectedly contains a body');
    const timerAfter = Number.parseInt(await first.locator('[data-timer]').textContent(), 10);
    assert(timerAfter < timerBefore && timerAfter > 0, 'The timer stopped or reset after HTTP204 polling');
    assert(await correct.isChecked(), 'Polling lost the selected option');
    assert(await correct.evaluate(input => input === document.activeElement), 'Polling stole focus from the selected option');
    const wrong = source.options.find(option => option.id !== source.correctOption).id;
    await second.locator(`input[name="optionId"][value="${wrong}"]`).check();
    await first.locator('[data-send]').click();
    await second.locator('[data-send]').click();
    await host.locator('[data-next]').waitFor();
    await first.locator('.explanation').waitFor(); await second.locator('.explanation').waitFor();
    for (const tab of [host, first, second]) assert(await tab.locator('.welcome, .room-header').count() === 0, 'Answer reveal restored the welcome or room heading');
    assert(await host.locator('.ranking-card, [data-answer-note]').count() === 0 && await host.locator('.explanation strong').textContent() === 'Explicación', 'Reveal still shows its ranking/instruction or the old explanation heading');
    assert(await host.locator('[data-finish]').evaluate(node => node.textContent === 'Finalizar' && node.nextElementSibling?.hasAttribute('data-next') && node.nextElementSibling.textContent === 'Siguiente' && node.parentElement.classList.contains('game-actions')), 'Finalizar and Siguiente are not together in the game actions');
    await host.locator('[data-finish]').click();
    await confirmation.waitFor({ state: 'visible' });
    assert(await confirmation.getByRole('heading').textContent() === '¿Finalizar la partida?' && await confirmation.locator('[data-confirm-no]').evaluate(node => node === document.activeElement), 'Finalizar lacks a focused confirmation popup');
    await confirmation.locator('[data-confirm-no]').click();
    assert(await host.locator('[data-finish]').evaluate(node => node === document.activeElement), 'Cancelling Finalizar lost its trigger focus');
    current = await snapshot(first, code);
    const firstPoints = current.me.score;
    assert(current.status === 'reveal' && current.me.correct === true && Number.isInteger(firstPoints) && firstPoints >= 500 && firstPoints <= 1000, 'Correct answer did not earn integer speed points');
    assert((await snapshot(second, code)).me.score === 0, 'Wrong answer scored');
    const duplicate = await post(first, `/api/rooms/${code}/answers`, { questionId: current.question.id, optionId: source.correctOption });
    assert([200, 409].includes(duplicate.status), 'Unexpected duplicate-answer response');
    assert((await snapshot(first, code)).me.score === firstPoints, 'Duplicate answer increased score');
    await geometry(first, '390px reveal'); await geometry(second, '320px reveal');
    checks.push('Shared question, hidden answer until reveal, real empty HTTP204 keeps timer/selection/focus, correct scoring, duplicate safe');

    await host.locator('[data-next]').click();
    await first.locator('.ranking-card').waitFor(); await second.locator('.ranking-card').waitFor();
    assert(await host.locator('#question-title').count() === 0 && (await snapshot(first, code)).status === 'ranking' && (await snapshot(first, code)).deadline === null, 'Siguiente skipped the shared ranking or started its timer');
    await host.locator('[data-next]').click();
    await first.locator('[data-send]').waitFor();
    const deadlineQuestion = (await snapshot(first, code)).question.id;
    await first.reload();
    await first.locator('[data-send]').waitFor();
    assert((await snapshot(first, code)).question.id === deadlineQuestion, 'Reload lost the current question');
    await first.waitForFunction(() => document.querySelector('.explanation'), null, { timeout: 18000 });
    await host.locator('[data-next]').waitFor();
    current = await snapshot(first, code);
    assert(current.status === 'reveal' && current.me.answer === null, 'Deadline did not close unanswered question');
    const late = await post(first, `/api/rooms/${code}/answers`, { questionId: deadlineQuestion, optionId: 'a' });
    assert(late.status === 409, 'Late answer was accepted');
    await host.locator('[data-next]').click();
    await first.locator('.ranking-card').waitFor();
    await host.locator('[data-next]').click();
    await first.locator('[data-exit]').waitFor(); await second.locator('[data-exit]').waitFor();
    const final = await snapshot(first, code);
    assert(final.status === 'finished' && final.leaderboard[0].nickname === xssName && final.leaderboard[0].score === firstPoints && final.leaderboard[1].score === 0, 'Final winner/ranking is incorrect');
    assert(new URL(first.url()).origin === origin && new URL(first.url()).pathname === '/certi-tips/certiquiz/', 'The game navigated outside CertiTips');
    await geometry(first, '390px results'); await geometry(second, '320px results');
    checks.push('Server deadline, unanswered question, late-answer rejection, active refresh, final winner');

    await host.locator('[data-exit]').click();
    await host.locator('[data-role="host"]').waitFor();
    assert(new URL(host.url()).search === '' && (await api(host, '/api/session')).data.roomCode === null, 'Exit did not clear the room and return to CertiQuiz');
    await host.locator('[data-role="host"]').click();
    const speedCode = await createRoom(host, 1, 10);
    await join(first, speedCode, 'Equipo A'); await join(second, speedCode, 'Equipo B');
    await host.waitForFunction(() => document.querySelectorAll('[data-players] .player-avatar').length === 2);
    await host.locator('[data-start]').click();
    await first.locator('[data-send]').waitFor(); await second.locator('[data-send]').waitFor();
    current = await snapshot(first, speedCode);
    const speedCorrect = bank.find(question => question.id === current.question.id).correctOption;
    await first.locator(`input[name="optionId"][value="${speedCorrect}"]`).check();
    await second.locator(`input[name="optionId"][value="${speedCorrect}"]`).check();
    await first.locator('[data-send]').click();
    await second.waitForTimeout(1000);
    await second.locator('[data-send]').click();
    await host.locator('[data-next]').waitFor(); await host.locator('[data-next]').click();
    await first.locator('.ranking-card').waitFor(); await host.locator('[data-next]').click();
    await first.locator('[data-exit]').waitFor();
    const speed = await snapshot(first, speedCode);
    assert(speed.leaderboard.length === 2 && speed.leaderboard.every(player => Number.isInteger(player.score) && player.score >= 500 && player.score <= 1000), 'Speed points are not bounded integers');
    assert(speed.leaderboard[0].nickname === 'Equipo A' && speed.leaderboard[0].score > speed.leaderboard[1].score && speed.leaderboard[0].rank === 1 && speed.leaderboard[1].rank === 2, 'Faster correct answer did not rank first');
    assert(await first.locator('.leaderboard thead th').last().textContent() === 'Puntos', 'Leaderboard still labels scores as correct-answer counts');
    checks.push('Second room: faster correct answer earns more integer points and ranks first');

    await host.goto('http://127.0.0.1:4173/certi-tips/');
    const link = host.getByRole('link', { name: 'CertiQuiz', exact: true });
    await link.waitFor();
    assert(await link.getAttribute('href') === '/certi-tips/certiquiz/', 'Home link does not stay inside CertiTips');
    assert(await link.getAttribute('target') === null, 'CertiQuiz opens an unwanted second tab');
    assert(await link.locator('svg').getAttribute('viewBox') === '0 0 1920 1920', 'Home button is missing the requested rocket');
    assert(JSON.stringify(await link.locator('svg path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')))) === JSON.stringify(rocketPaths), 'Initial failure changed the requested rocket paths');
    const homeDetails = await host.evaluate(() => {
      const flow = document.querySelector('.hero-flow');
      const previous = document.querySelector('[data-group-prev] svg path');
      const next = document.querySelector('[data-group-next] svg path');
      const quizLink = document.querySelector('.certiquiz-link');
      const probe = document.createElement('i'); probe.style.color = 'var(--red)'; document.body.append(probe);
      const red = getComputedStyle(probe).color; probe.remove();
      return { flowBorder: getComputedStyle(flow).borderTopWidth, previous: previous?.getAttribute('d'), next: next?.getAttribute('d'), quizBorder: getComputedStyle(quizLink).borderTopColor, red };
    });
    assert(homeDetails.flowBorder === '1px', 'Suggested certification flow lacks the section-style border');
    assert(homeDetails.previous === 'M6 12H18M6 12L11 7M6 12L11 17' && homeDetails.next === 'M6 12H18M18 12L13 7M18 12L13 17', 'Carousel arrows do not use the requested arrow paths');
    assert(homeDetails.quizBorder === homeDetails.red, 'CertiQuiz home button border is not visible in the accent color');
    for (const width of [1280, 390, 320]) { await host.setViewportSize({ width, height: 900 }); await geometry(host, `Home actions ${width}px`); }
    await link.click();
    await host.waitForURL(appUrl);
    await host.locator('.certiquiz-app').waitFor();
    assert(await host.locator('.site-header .brand').getAttribute('href') === '/certi-tips/', 'CertiQuiz lost the shared CertiTips header');
    assert(await host.locator('#course-navigation').count() === 0, 'CertiQuiz incorrectly shows a course sidebar');
    checks.push('CertiTips home: internal rocket link, same tab, common header, responsive geometry');
    assert(errors.length === 0, `Browser JavaScript errors: ${errors.join('; ')}`);
    return { ok: true, checks, apiOriginOverride: apiOrigin, javascriptErrors: errors.length, screenshots: 0 };
  } catch (error) {
    if (currentRoomCode) error.message = `Local QA room ${currentRoomCode}: ${error.message}`;
    throw error;
  } finally { await Promise.all(contexts.map(context => context.close())); }
}

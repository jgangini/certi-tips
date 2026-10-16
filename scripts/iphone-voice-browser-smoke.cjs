// Local, zero-cost regression: model Safari's separate speech gesture gate and mobile input.
async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const base = new URL('/certitips/', page.url()).href, origin = new URL(base).origin, calls = [], errors = [], results = [];
  const context = await page.context().browser().newContext({ viewport: { width: 394, height: 852 }, isMobile: true, hasTouch: true });
  const phone = await context.newPage();
  phone.on('pageerror', error => errors.push(error.message));
  await phone.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await phone.route('http://127.0.0.1:18741/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS', 'access-control-allow-headers': 'x-certichat,content-type' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const body = request.postDataJSON(); calls.push({ path, body });
    const quota = { remaining: 20, resetAt: null };
    if (path === '/api/voice') {
      // The real answer arrives after network/permission work, outside the original tap.
      await new Promise(resolve => setTimeout(resolve, 40));
      return route.fulfill({ headers, json: { requestId: body.requestId, answer: 'Respuesta de audio después de la red.', transcript: 'Explica este tema.', educational: true, sources: [], contentVersion: 'test', quota } });
    }
    return route.fulfill({ headers, json: { mode: 'LOCAL', authenticated: true, verificationRequired: false, available: true, voice: { enabled: true, maxSeconds: 30 }, quota } });
  });
  await phone.addInitScript(() => {
    sessionStorage.clear();
    localStorage.setItem('certichat:https://jgangini.github.io/certitips/', JSON.stringify({ updatedAt: Date.now(), messages: [{ role: 'user', text: 'Pregunta conservada antes de la presentación.' }, { role: 'ai', text: 'Respuesta conservada del historial.' }] }));
    window.__speechUnlocked = false; window.__warmups = []; window.__spoken = []; window.__microphones = 0;
    window.addEventListener('click', event => { if (event.isTrusted) window.__speechGesture = true; }, true);
    window.addEventListener('certivoice:state', event => { window.__voiceState = event.detail; });
    class AudioEngine {
      constructor() { this.sampleRate = 16000; this.currentTime = 0; this.destination = {}; this.audioWorklet = { addModule: async () => {} }; }
      resume() { window.__speechGesture = false; this.state = 'running'; return Promise.resolve(); }
      suspend() { this.state = 'suspended'; return Promise.resolve(); }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createGain() { return { gain: {}, connect() {}, disconnect() {} }; }
    }
    window.AudioContext = AudioEngine;
    window.AudioWorkletNode = class { constructor() { this.port = {}; window.__voicePort = this.port; } connect() {} disconnect() {} };
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: 'prompt' }) } });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      window.__microphones++;
      const track = { enabled: true, stop() { this.stopped = true; } }; window.__voiceTrack = track;
      return { getTracks: () => [track], getAudioTracks: () => [track] };
    } } });
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; this.volume = 1; } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [{ name: 'Mónica', lang: 'es-ES' }],
      speak(utterance) {
        if (window.__speechGesture) window.__speechUnlocked = true;
        if (!window.__speechUnlocked) return; // WebKit silently ignores speech before the first gesture.
        if (!utterance.text) window.__warmups.push({ volume: utterance.volume, gesture: window.__speechGesture });
        else { window.__utterance = utterance; window.__spoken.push(utterance.text); }
      }, cancel() { window.__utterance = null; },
    } });
    window.__speakTurn = () => {
      const emit = value => window.__voicePort.onmessage?.({ data: new Float32Array(2048).fill(value) });
      for (let i = 0; i < 3; i++) emit(.1);
      for (let i = 0; i < 8; i++) emit(0);
    };
  });
  const measure = async (presentation = false) => {
    await phone.locator('#certichat-panel').evaluate(panel => Promise.all(panel.getAnimations().filter(animation => Number.isFinite(animation.effect.getComputedTiming().endTime)).map(animation => animation.finished.catch(() => {}))));
    const geometry = await phone.locator('#certichat-panel').evaluate(panel => {
      const rect = panel.getBoundingClientRect(), footer = document.querySelector('#diagram-viewer[open] #diagram-description') || document.querySelector('.site-footer');
      const hints = panel.querySelector('deep-chat').shadowRoot.querySelector('[data-voice-hints]');
      return { x: rect.x, right: rect.right, width: rect.width, center: (rect.left + rect.right) / 2, viewport: innerWidth, bottom: rect.bottom, footer: footer.getBoundingClientRect().top, hints: hints?.dataset.open || 'false' };
    });
    assert(Math.abs(geometry.center - geometry.viewport / 2) < 1 && geometry.x >= 0 && geometry.right <= geometry.viewport, `Voice composer is not centered: ${JSON.stringify(geometry)}`);
    assert(geometry.bottom <= geometry.footer - 15 && geometry.bottom >= geometry.footer - 30, `Voice composer does not sit above the footer: ${JSON.stringify(geometry)}`);
    assert(geometry.hints === 'false', 'Touch-only device displayed hover hints');
    if (presentation) assert(await phone.locator('#diagram-viewer').evaluate(node => node.classList.contains('is-presenting')), 'Voice left the presentation');
    return geometry;
  };
  try {
    for (const route of ['es/', 'es/courses/', 'es/certitube/', 'es/certichat/', 'es/1Z0-1085-26/overview/']) {
      await phone.goto(base + route);
      await phone.waitForFunction(() => window.__voiceState?.enabled);
      const logo = await phone.locator('.site-header').evaluate(header => { const a = header.querySelector('.brand img').getBoundingClientRect(), b = header.querySelector('.theme-toggle').getBoundingClientRect(); return [a.width, a.height, b.width, b.height]; });
      assert(logo[0] === logo[2] && logo[1] === logo[3], `Mobile logo differs from the header controls: ${logo}`);
      if (await phone.locator('[data-chat-open]').isVisible()) await phone.locator('[data-chat-open]').tap();
      await phone.locator('deep-chat [data-voice-command="start"]').tap();
      await phone.waitForFunction(() => window.__voiceState?.phase === 'listening');
      await phone.locator('deep-chat [data-voice-command="mute"]').focus();
      await phone.locator('deep-chat').dispatchEvent('pointermove', { pointerType: 'touch' });
      for (const width of [320, 394, 768]) for (const theme of ['light', 'dark']) {
        await phone.setViewportSize({ width, height: 852 });
        await phone.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
        results.push({ route, width, theme, ...(await measure()) });
        assert(await phone.locator('.site-header').evaluate(header => { const a = header.querySelector('.brand img').getBoundingClientRect(), b = header.querySelector('.theme-toggle').getBoundingClientRect(); return a.width === b.width && a.height === b.height; }), 'Mobile logo changed size across responsive widths');
      }
      await phone.setViewportSize({ width: 394, height: 852 });
      assert(await phone.evaluate(() => window.__warmups.length === 1 && window.__warmups[0].gesture && window.__warmups[0].volume === 0), 'Speech was not silently unlocked within the initial tap');
      await phone.evaluate(() => window.__speakTurn());
      await phone.waitForFunction(() => window.__spoken.length === 1);
      assert(await phone.evaluate(() => window.__utterance.volume === 1 && window.__utterance.voice.name === 'Mónica'), 'The delayed answer was muted or changed the selected voice');
      assert(calls.at(-1).body.audioOutput === 'browser', 'Native speech unexpectedly requested paid output');
      await phone.evaluate(() => window.__utterance.onend());
      await phone.locator('deep-chat [data-voice-command="mute"]').tap();
      await phone.waitForFunction(() => window.__voiceState?.phase === 'paused');
      await measure();
      await phone.locator('deep-chat [data-voice-command="exit"]').tap();
      assert(await phone.evaluate(() => window.__voiceTrack.stopped), 'Exiting voice leaked a microphone track');
    }
    await phone.goto(base + 'es/1Z0-1085-26/oci-architecture/');
    await phone.waitForFunction(() => window.__voiceState?.enabled);
    await phone.locator('[data-diagram]').first().tap();
    await phone.waitForFunction(() => document.querySelector('#diagram-viewer').classList.contains('is-presenting'));
    const viewer = phone.locator('#diagram-viewer');
    await viewer.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {}))));
    assert((await viewer.boundingBox()).height === 852 && (await viewer.boundingBox()).width === 394, 'Mobile image did not open a full-screen presentation');
    assert((await viewer.locator('.dialog-toolbar').boundingBox()).height < 60, 'Mobile presentation toolbar wastes vertical space');
    const launcher = viewer.locator('[data-chat-open]');
    assert(await launcher.getAttribute('aria-label') === 'Activar voz' && await launcher.locator('svg').evaluate(icon => getComputedStyle(icon).maskImage.includes('voice-wave.svg')), 'Mobile presentation launcher is not the accessible audio waveform');
    await launcher.tap();
    await phone.waitForFunction(() => window.__voiceState?.phase === 'listening' && document.querySelector('#certichat-panel').dataset.voiceMode === 'true');
    assert(await phone.locator('.certichat-heading').isHidden() && await phone.evaluate(() => window.__microphones === 1), 'Presentation audio opened the text chat or captured twice');
    const imageBeforeExit = await viewer.locator('.dialog-content img').getAttribute('src');
    await phone.waitForFunction(() => document.querySelector('deep-chat')?.getMessages?.()?.some(message => message.text === 'Respuesta conservada del historial.'));
    const historyBeforeExit = await phone.locator('deep-chat').evaluate(chat => JSON.stringify(chat.getMessages().map(({ role, text }) => ({ role, text }))));
    for (const width of [320, 394, 768]) for (const theme of ['light', 'dark']) {
      await phone.setViewportSize({ width, height: 852 });
      await phone.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      results.push({ route: 'mobile presentation', width, theme, ...(await measure(true)) });
      await phone.locator('deep-chat [data-voice-command="exit"]').tap();
      await phone.locator('#certichat-panel').waitFor({ state: 'hidden' });
      assert(await viewer.evaluate(node => node.open && node.classList.contains('is-presenting')) && await viewer.locator('.dialog-content img').getAttribute('src') === imageBeforeExit, 'Exiting voice closed or changed the presented slide');
      assert(await launcher.isVisible() && await launcher.getAttribute('aria-expanded') === 'false' && await launcher.evaluate(node => document.activeElement === node), 'Voice exit did not restore the audio launcher and focus');
      assert(await phone.evaluate(() => !window.__voiceState.active && !window.__voiceState.resume && window.__voiceTrack.stopped), 'Voice exit kept the microphone active or resumable');
      assert(await phone.locator('deep-chat').evaluate(chat => JSON.stringify(chat.getMessages().map(({ role, text }) => ({ role, text })))) === historyBeforeExit, 'Voice exit changed the shared conversation');
      assert((await viewer.locator('.dialog-content').boundingBox()).height > 700, 'Voice exit left space reserved for text chat');
      await launcher.tap();
      await phone.waitForFunction(() => window.__voiceState?.phase === 'listening' && document.querySelector('#certichat-panel').dataset.voiceMode === 'true');
    }
    await phone.setViewportSize({ width: 394, height: 852 });
    await phone.evaluate(() => window.__speakTurn());
    await phone.waitForFunction(() => window.__spoken.length === 1);
    await phone.locator('deep-chat [data-voice-command="exit"]').tap();
    await phone.locator('#certichat-panel').waitFor({ state: 'hidden' });
    assert(await phone.evaluate(() => window.__utterance === null && window.__voiceTrack.stopped), 'Exiting during narration left speech or capture running');
    assert(await viewer.locator('.dialog-content img').getAttribute('src') === imageBeforeExit, 'Exiting during narration changed the slide');
    await viewer.locator('[data-close-diagram]').tap();
    await viewer.waitFor({ state: 'hidden' });
    assert(await phone.locator('[data-diagram]').first().evaluate(node => document.activeElement === node), 'Closing mobile presentation did not restore focus to its image');
    assert(errors.length === 0, errors.join('\n'));
    return { passed: true, routes: results, delayedNativeSpeechAfterGesture: true, touchHintsDisabled: true, directPresentationAudio: true, mobileVoiceExitFoldsChat: true, screenshots: 0, paidCalls: 0 };
  } finally { await context.close(); }
}

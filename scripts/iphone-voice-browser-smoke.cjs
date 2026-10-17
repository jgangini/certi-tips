// Local, zero-cost regression: model Safari's separate speech gesture gate and mobile input.
async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const base = new URL('/certitips/', page.url()).href, origin = new URL(base).origin, calls = [], errors = [], results = [];
  const context = await page.context().browser().newContext({ viewport: { width: 394, height: 852 }, isMobile: true, hasTouch: true, userAgent: "iPhone Safari (isolated audio regression)" });
  const phone = await context.newPage();
  phone.on('pageerror', error => errors.push(error.message));
  await phone.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await phone.route('http://127.0.0.1:18741/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS', 'access-control-allow-headers': 'x-certichat,content-type,traceparent,x-request-id' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/api/events') return route.fulfill({ status: 204, headers });
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
    if (!sessionStorage.getItem("__keepVoiceNavigation")) sessionStorage.clear();
    localStorage.setItem('certichat:https://jgangini.github.io/certitips/', JSON.stringify({ updatedAt: Date.now(), messages: [{ role: 'user', text: 'Pregunta conservada antes de la presentación.' }, { role: 'ai', text: 'Respuesta conservada del historial.' }] }));
    window.__speechUnlocked = false; window.__warmups = []; window.__spoken = []; window.__microphones = 0; window.__tracks = []; window.__outputProfiles = [];
    window.addEventListener('click', event => { if (event.isTrusted) window.__speechGesture = true; }, true);
    window.addEventListener('certivoice:state', event => { window.__voiceState = event.detail; });
    Object.defineProperty(navigator, 'audioSession', { configurable: true, value: { type: 'auto' } });
    class AudioEngine {
      constructor() { window.__voiceContext = this; this.sampleRate = 16000; this.currentTime = 0; this.destination = {}; this.audioWorklet = { addModule: async () => {} }; }
      resume() { window.__speechGesture = false; this.state = window.__blockAudioResume ? 'interrupted' : 'running'; return Promise.resolve(); }
      suspend() { this.state = 'suspended'; return Promise.resolve(); }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createGain() { return { gain: {}, connect() {}, disconnect() {} }; }
    }
    window.AudioContext = AudioEngine;
    window.AudioWorkletNode = class { constructor() { this.port = {}; window.__voicePort = this.port; } connect() {} disconnect() {} };
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: 'granted' }) } });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      window.__microphones++;
      if (window.__deferCapture) await new Promise(resolve => { window.__releaseCapture = resolve; });
      if (window.__denyCapture) throw new DOMException('Denied', 'NotAllowedError');
      const track = Object.assign(new EventTarget(), { enabled: true, muted: false, readyState: 'live', stop() { this.stopped = true; this.readyState = 'ended'; } });
      window.__voiceTrack = track; window.__tracks.push(track);
      return { getTracks: () => [track], getAudioTracks: () => [track] };
    } } });
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; this.volume = 1; } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => window.__noNative ? [] : [{ name: 'Mónica', lang: 'es-ES' }],
      get speaking() { return Boolean(window.__warmupPending || window.__utterance); },
      speak(utterance) {
        if (window.__speechGesture) window.__speechUnlocked = true;
        if (!window.__speechUnlocked) return; // WebKit silently ignores speech before the first gesture.
        if (!utterance.text) {
          window.__warmups.push({ volume: utterance.volume, gesture: window.__speechGesture });
          window.__warmupPending = true; // A silent primer can occupy WebKit's native queue until canceled.
        } else if (!window.__warmupPending) {
          const liveCapture = window.__tracks.find(track => !track.stopped);
          if (liveCapture) { liveCapture.muted = true; liveCapture.dispatchEvent(new Event('mute')); }
          window.__outputProfiles.push({ type: navigator.audioSession.type, concurrentCapture: Boolean(liveCapture) });
          window.__utterance = utterance;
          const started = utterance.onstart;
          window.__startNative = () => { window.__spoken.push(utterance.text); started?.(); };
          if (!window.__holdNativeStart) queueMicrotask(window.__startNative);
        }
      }, cancel() { if (!window.__warmupPending && !window.__utterance) window.__idleCancels = (window.__idleCancels || 0) + 1; window.__warmupPending = false; window.__utterance = null; },
    } });
    window.__speakTurn = () => {
      if (!window.__voiceTrack?.enabled || window.__voiceTrack.stopped || window.__voiceTrack.muted) return;
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
      return { x: rect.x, right: rect.right, width: rect.width, center: (rect.left + rect.right) / 2, viewport: innerWidth, bottom: rect.bottom, top: rect.top, viewHeight: innerHeight, edgeBottom: document.querySelector('[data-voice-edge]').getBoundingClientRect().bottom, footerHidden: getComputedStyle(document.querySelector('.site-footer')).visibility === 'hidden', controls: [...panel.querySelector('deep-chat').shadowRoot.querySelectorAll('[data-voice-command]:not([aria-disabled="true"])')].filter(node => node.getBoundingClientRect().width).map(node => node.getBoundingClientRect().width), reference: document.querySelector('.theme-toggle').getBoundingClientRect().width, hints: hints?.dataset.open || 'false' };
    });
    assert(Math.abs(geometry.center - geometry.viewport / 2) < 1 && geometry.x >= 0 && geometry.right <= geometry.viewport, `Voice composer is not centered: ${JSON.stringify(geometry)}`);
    assert(geometry.x === 0 && Math.abs(geometry.width - geometry.viewport) < 1 && Math.abs(geometry.bottom - geometry.viewHeight) < 1 && geometry.footerHidden && geometry.edgeBottom <= geometry.top + 1, `Mobile voice dock does not replace footer outside the light border: ${JSON.stringify(geometry)}`);
    assert(geometry.controls.length === 2 && geometry.controls.every(size => Math.abs(size - geometry.reference) < 1), `Mobile voice controls do not match header buttons: ${JSON.stringify(geometry)}`);
    assert(geometry.hints === 'false', 'Touch-only device displayed hover hints');
    assert(await phone.locator('deep-chat').evaluate(chat => {
      const shadow = chat.shadowRoot, exit = shadow.querySelector('[data-voice-command="exit"]'), mic = shadow.querySelector('[data-voice-command="mute"]');
      const a = mic.getBoundingClientRect(), b = exit.getBoundingClientRect(), e = getComputedStyle(exit), m = getComputedStyle(mic), phase = shadow.querySelector('#certivoice-phase').getBoundingClientRect(), edge = getComputedStyle(document.querySelector('[data-voice-edge]'));
      return b.left - a.right >= 23 && phase.right <= a.left && e.backgroundColor === 'rgb(255, 255, 255)' && e.borderRadius === '50%' && getComputedStyle(exit.querySelector('svg')).color === 'rgb(17, 24, 39)' && (mic.getAttribute('aria-pressed') !== 'true' || m.borderRadius === '50%' && m.borderTopWidth === '1px' && getComputedStyle(mic.querySelector('svg')).color === getComputedStyle(document.querySelector('.brand-accent')).color) && edge.maskImage.includes('#voice-edge-mask') && parseFloat(getComputedStyle(document.querySelector('.voice-edge-cutout')).rx) >= 52 && document.querySelector('.voice-edge-cutout').getBBox().width > 0 && Math.abs(document.querySelector('.voice-edge-cutout').getBBox().x - 18.2) < .1 && document.querySelector('feGaussianBlur').getAttribute('stdDeviation') === '4.9';
    }), 'Mobile voice controls or the continuous full-edge mask are incorrect');
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
        assert(await phone.locator('.site-header').evaluate(header => { const style = node => { const s = getComputedStyle(node); return [s.backgroundColor, s.borderColor, s.borderRadius].join('|'); }; return ['.theme-toggle', '.language-toggle'].every(selector => style(header.querySelector(selector)) === style(header.querySelector('.search-toggle'))); }), 'Theme/language controls do not share Search styling');
        assert(await phone.locator('.site-footer').evaluate(footer => { const heart = footer.querySelector('.footer-heart'); return heart.localName === 'svg' && heart.querySelector('path').getAttribute('fill') === 'currentColor' && getComputedStyle(heart).color === getComputedStyle(document.querySelector('.site-header .brand-accent')).color; }), 'Footer SVG heart does not use the Tips red');
        assert(await phone.locator('.footer-brand').evaluate(name => name.textContent === 'CertiTips' && !name.children.length && getComputedStyle(name).color === getComputedStyle(document.querySelector('.site-header .brand')).color), 'Footer brand is split or does not use the theme text color');
      }
      await phone.setViewportSize({ width: 394, height: 852 });
      assert(await phone.evaluate(() => { const edge = document.querySelector('[data-voice-edge]'); edge.style.setProperty('--voice-level', '1'); const peak = document.querySelector('.voice-edge-cutout').getBBox().x; edge.style.removeProperty('--voice-level'); return Math.abs(peak - 42) < .1; }), 'Peak voice edge did not shrink by 30 percent');
      assert(await phone.evaluate(() => window.__warmups.length === 1 && window.__warmups[0].gesture && window.__warmups[0].volume === 0), 'Speech was not silently unlocked within the initial tap');
      assert(await phone.evaluate(() => !window.__warmupPending), 'The silent Safari primer still blocks the native speech queue after activation');
      await phone.evaluate(() => { window.__holdNativeStart = true; window.__speakTurn(); });
      await phone.waitForFunction(() => window.__utterance);
      assert(await phone.evaluate(() => !window.__idleCancels), 'Canceling an idle native queue immediately before speak risks WebKit dropping the answer');
      assert(await phone.evaluate(() => window.__voiceState.phase === 'thinking' && !window.__spoken.length), 'The UI claimed Speaking before the native start event');
      await phone.evaluate(() => { window.__holdNativeStart = false; window.__startNative(); });
      await phone.waitForFunction(() => window.__spoken.length === 1 && window.__voiceState.phase === 'speaking');
      assert(await phone.evaluate(() => window.__utterance.volume === 1 && window.__utterance.voice.name === 'Mónica'), 'The delayed answer was muted or changed the selected voice');
      assert(calls.at(-1).body.audioOutput === 'browser', 'Native speech unexpectedly requested paid output');
      assert(await phone.evaluate(() => window.__outputProfiles.every(profile => profile.type === 'playback' && !profile.concurrentCapture)), 'Native iPhone speech kept a live microphone or failed to request the playback profile');
      await phone.evaluate(() => window.__utterance.onend());
      await phone.waitForFunction(() => window.__voiceState.phase === 'listening' && window.__microphones === 2);
      for (let turn = 0; turn < 2; turn++) {
        await phone.evaluate(() => { window.__utterance = null; window.__speakTurn(); });
        await phone.waitForFunction(() => window.__utterance && window.__voiceState.phase === 'speaking');
        await phone.evaluate(() => window.__utterance.onend());
        await phone.waitForFunction(expected => window.__voiceState.phase === 'listening' && window.__microphones === expected, turn + 3);
      }
      assert(await phone.evaluate(() => window.__spoken.length === 3 && window.__outputProfiles.every(profile => profile.type === 'playback' && !profile.concurrentCapture) && navigator.audioSession.type === 'play-and-record'), 'Second/third voice turns did not renew iPhone capture');
      await phone.locator('deep-chat [data-voice-command="mute"]').tap();
      await phone.waitForFunction(() => window.__voiceState?.phase === 'paused');
      await measure();
      if (route === 'es/') {
        await phone.locator('deep-chat [data-voice-command="mute"]').tap();
        await phone.evaluate(() => { window.__holdNativeStart = true; window.__utterance = null; window.__speakTurn(); });
        await phone.waitForFunction(() => window.__utterance && window.__voiceState.phase === 'thinking');
        await phone.waitForFunction(() => window.__voiceState.phase === 'paused' && window.__voiceState.error);
        assert(await phone.evaluate(() => window.__voiceTrack.stopped && !window.__utterance), 'Missing native start left a false Speaking state or live capture');
        await phone.evaluate(() => window.__startNative());
        assert(await phone.evaluate(() => window.__voiceState.phase === 'paused' && !window.__voiceState.active), 'A late native start revived canceled speech');
      }
      await phone.locator('deep-chat [data-voice-command="exit"]').tap();
      assert(await phone.evaluate(() => window.__voiceTrack.stopped), 'Exiting voice leaked a microphone track');
      await phone.locator('#certichat-panel').waitFor({ state: 'hidden' });
      assert(await phone.locator('[data-chat-open]').isVisible() && await phone.locator('.site-footer').evaluate(node => getComputedStyle(node).visibility === 'visible'), 'Global voice Exit opened the text chat or kept the footer hidden');
      if (route === 'es/certichat/') assert(await phone.locator('.chat-explorer-section').isVisible(), 'Closing voice hid the graph');
    }
    for (const failure of ['no-output', 'capture-mute', 'context-interrupted', 'capture-denied', 'context-resume-failed', 'late-capture-exit']) {
      await phone.goto(base + 'es/');
      await phone.waitForFunction(() => window.__voiceState?.enabled);
      if (await phone.locator('[data-chat-open]').isVisible()) await phone.locator('[data-chat-open]').tap();
      if (failure === 'no-output') await phone.evaluate(() => { window.__noNative = true; });
      await phone.locator('deep-chat [data-voice-command="start"]').tap();
      await phone.waitForFunction(() => window.__voiceState.phase === 'listening');
      if (failure === 'no-output') {
        await phone.evaluate(() => window.__speakTurn());
        await phone.waitForFunction(() => window.__voiceState.phase === 'listening' && window.__microphones === 2 && !window.__voiceTrack.stopped);
        await phone.locator('deep-chat [data-voice-command="exit"]').tap();
        continue;
      }
      if (failure === 'capture-mute') await phone.evaluate(() => { window.__voiceTrack.muted = true; window.__voiceTrack.dispatchEvent(new Event('mute')); });
      else if (failure === 'context-interrupted') await phone.evaluate(() => { window.__voiceContext.state = 'interrupted'; window.__voiceContext.onstatechange(); });
      else {
        await phone.evaluate(() => window.__speakTurn());
        await phone.waitForFunction(() => window.__voiceState.phase === 'speaking');
        await phone.evaluate(failure => { window.__denyCapture = failure === 'capture-denied'; window.__blockAudioResume = failure === 'context-resume-failed'; window.__deferCapture = failure === 'late-capture-exit'; window.__utterance.onend(); }, failure);
      }
      if (failure === 'late-capture-exit') {
        await phone.waitForFunction(() => window.__voiceState.phase === 'connecting' && window.__releaseCapture);
        await phone.locator('deep-chat [data-voice-command="exit"]').tap();
        await phone.evaluate(() => window.__releaseCapture());
        await phone.waitForFunction(() => window.__tracks.every(track => track.stopped));
        assert(await phone.evaluate(() => window.__voiceState.phase === 'off' && !window.__voiceState.active && document.querySelector('#certichat-panel').hidden), 'A late microphone acquisition revived a closed chat');
      } else {
        await phone.waitForFunction(() => window.__voiceState.phase === 'paused' && !window.__voiceState.active && window.__voiceState.error);
        assert(await phone.evaluate(() => window.__tracks.every(track => track.stopped)), `Audio failure leaked capture: ${failure}`);
        await phone.locator('deep-chat [data-voice-command="exit"]').tap();
      }
    }
    await phone.goto(base + 'es/');
    await phone.waitForFunction(() => window.__voiceState?.enabled);
    if (await phone.locator('[data-chat-open]').isVisible()) await phone.locator('[data-chat-open]').tap();
    await phone.locator('deep-chat [data-voice-command="start"]').tap();
    await phone.waitForFunction(() => window.__voiceState.phase === 'listening');
    const traceBeforeNavigation = await phone.locator('[data-certichat]').getAttribute('data-voice-trace');
    await phone.evaluate(() => {
      sessionStorage.setItem('__keepVoiceNavigation', '1');
      sessionStorage.setItem('certivoice:https://jgangini.github.io/certitips/:navigation', JSON.stringify({ url: new URL('/certitips/es/courses/', location.href).href, createdAt: Date.now(), session: true, pending: true, autoResume: true, resumeAt: Date.now() }));
    });
    await phone.goto(base + 'es/courses/');
    await phone.waitForFunction(() => window.__voiceState?.resume && !window.__voiceState.active && window.__voiceState.phase === 'paused');
    assert(await phone.evaluate(() => !window.__microphones && !window.__voiceState.error && document.querySelector('[data-voice-unavailable]').hidden), 'An iPhone navigation attempted gesture-free audio or displayed a false unavailable warning');
    assert(await phone.locator('[data-certichat]').getAttribute('data-voice-trace') === traceBeforeNavigation, 'Navigation lost its diagnostic trace');
    if (await phone.locator('[data-chat-open]').isVisible()) await phone.locator('[data-chat-open]').tap();
    await phone.locator('deep-chat [data-voice-command="start"]').tap();
    await phone.waitForFunction(() => window.__voiceState.phase === 'speaking');
    await phone.evaluate(() => window.__utterance.onend());
    await phone.waitForFunction(() => window.__voiceState.phase === 'listening');
    await phone.locator('deep-chat [data-voice-command="exit"]').tap();
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
    return { passed: true, routes: results, delayedNativeSpeechAfterGesture: true, silentPrimerCanceled: true, truthfulNativeStartAndTimeout: true, threeSequentialIPhoneTurns: true, captureMuteAndContextRecovery: true, missingOutputRestoresCapture: true, lateCaptureAfterExitStopped: true, globalVoiceExitClosesChat: true, continuousEdgeMask: true, navigationRequiresExplicitIPhoneResume: true, diagnosticTraceSurvivesNavigation: true, exclusivePlaybackProfile: true, footerDockOutsideLightBorder: true, compactHeaderSizedControls: true, touchHintsDisabled: true, directPresentationAudio: true, mobileVoiceExitFoldsChat: true, screenshots: 0, paidCalls: 0 };
  } finally { await context.close(); }
}

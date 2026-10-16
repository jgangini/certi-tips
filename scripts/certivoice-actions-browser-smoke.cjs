// Evaluate with the same isolated local-preview runner as certivoice-browser-smoke.cjs.
// Network, inference, microphone, speech output and YouTube are simulated; no screenshots.
async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const base = new URL('/certitips/', page.url()).href, origin = new URL(base).origin;
  const calls = [], errors = [], blocked = [], checks = [], replies = [], documents = [], registries = {}, outputRegistry = {}, moduleRegistry = { slides: [], contexts: {} }, visitedModules = [];
  const wave = page.locator('deep-chat [data-certivoice-icon="start"]').locator('..');
  const exit = page.locator('deep-chat [data-certivoice-icon="exit"]').locator('..');
  const mute = page.locator('deep-chat [data-certivoice-icon="mute"]').locator('..');
  const voices = () => calls.filter(call => call.path === '/api/voice');
  const activityKey = `certichat:${new URL(base).pathname}:activity`;
  const activity = () => page.evaluate(key => JSON.parse(sessionStorage.getItem(key) || '[]'), activityKey);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(request.url()); });
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    blocked.push(route.request().url()); return route.abort();
  });
  await page.route('http://127.0.0.1:18741/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS', 'access-control-allow-headers': 'x-certichat,content-type' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const body = request.postDataJSON(); calls.push({ path, method: request.method(), body });
    if (path === '/api/voice') {
      const result = replies.shift();
      if (!result) { errors.push('Unplanned voice request'); return route.fulfill({ status: 409, headers, json: { code: 'request_failed' } }); }
      return route.fulfill({ headers, json: { ...result, requestId: body.requestId, quota: { remaining: 20 } } });
    }
    if (path === '/api/chat') return route.fulfill({ headers, json: { answer: 'Respuesta educativa simulada sobre la actividad reciente.', sources: [], quota: { remaining: 20 } } });
    return route.fulfill({ headers, json: { mode: 'LOCAL', authenticated: true, verificationRequired: false, available: true, voice: { enabled: true, maxSeconds: 30 }, quota: { remaining: 20 } } });
  });
  await page.addInitScript(() => {
    window.__voiceMicRequests = 0; window.__voiceStops = 0; window.__voiceOutputs = []; window.__spoken = []; window.__utterances = [];
    window.addEventListener('certivoice:state', event => { window.__voiceState = event.detail; });
    window.addEventListener('certivoice:practice-followup', () => sessionStorage.setItem('__practiceFollowups', String(Number(sessionStorage.getItem('__practiceFollowups') || 0) + 1)));
    class AudioEngine {
      constructor() { this.sampleRate = 16000; this.currentTime = 0; this.state = 'running'; this.destination = {}; this.audioWorklet = { addModule: async () => {} }; }
      resume() { this.state = 'running'; return Promise.resolve(); }
      suspend() { this.state = 'suspended'; return Promise.resolve(); }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createGain() { return { gain: {}, connect() {}, disconnect() {} }; }
      async decodeAudioData() { return { duration: 2, sampleRate: 16000, getChannelData: () => new Float32Array(32000).fill(.1) }; }
      createBufferSource() { const source = { connect() {}, start() { window.__voiceOutputs.push(source); }, stop() { source.stopped = true; } }; return source; }
    }
    window.AudioContext = AudioEngine;
    window.AudioWorkletNode = class { constructor() { this.port = {}; window.__voicePort = this.port; } connect() {} disconnect() {} };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      window.__voiceMicRequests++; const track = { enabled: true, stop() { this.stopped = true; window.__voiceStops++; } };
      window.__voiceTrack = track; return { getTracks: () => [track], getAudioTracks: () => [track] };
    } } });
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: 'prompt' }) } });
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => ['es', 'en', 'pt', 'it'].map(lang => ({ name: 'Microsoft Sabina', lang })),
      speak: value => { window.__spoken.push(value.text); window.__utterance = value; window.__utterances.push(value); if (!window.__holdSpeech) queueMicrotask(() => value.onend?.()); }, cancel() { if (window.__utterance) window.__utterance.canceled = true; },
    } });
    window.__speakTurn = () => {
      const emit = value => window.__voicePort.onmessage?.({ data: new Float32Array(2048).fill(value) });
      for (let i = 0; i < 3; i++) emit(.1);
      for (let i = 0; i < 8; i++) emit(0);
    };
    window.__ytCalls = [];
    let fullscreen;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreen || null });
    Element.prototype.requestFullscreen = async function () {
      if (window.__denyFullscreen) throw new DOMException('Gesture required', 'NotAllowedError');
      fullscreen = this; document.dispatchEvent(new Event('fullscreenchange'));
    };
    document.exitFullscreen = async () => { fullscreen = null; document.dispatchEvent(new Event('fullscreenchange')); };
    window.YT = { Player: class {
      constructor(id, config) {
        this.time = 0; this.state = 2; this.config = config;
        this.iframe = document.createElement('iframe'); this.iframe.id = id; this.iframe.src = 'about:blank';
        document.getElementById(id).replaceWith(this.iframe); window.__youtube = this;
        window.__readyYouTube = () => config.events.onReady({ target: this });
        if (sessionStorage.getItem('__holdYT') !== '1') queueMicrotask(window.__readyYouTube);
      }
      getDuration() { return 10000; } getCurrentTime() { return this.time; } getPlayerState() { return this.state; } getIframe() { return this.iframe; }
      seekTo(seconds) { this.time = seconds; window.__ytCalls.push(['seek', seconds]); }
      playVideo() { this.state = 1; window.__ytCalls.push(['play']); this.config.events.onStateChange({ data: 1 }); }
      pauseVideo() { this.state = 2; window.__ytCalls.push(['pause']); this.config.events.onStateChange({ data: 2 }); }
    } };
  });
  const phase = value => page.waitForFunction(expected => window.__voiceState?.phase === expected, value);
  const history = () => page.locator('deep-chat').evaluate(chat => JSON.stringify(chat.getMessages()));
  const snapshot = async name => {
    registries[name] = await page.evaluate(async () => { const module = await import('/certitips/assets/certivoice-actions.js'); return { pageUrl: module.voicePageURL(), targets: module.voiceContext().targets }; });
    assert(registries[name].pageUrl.startsWith('https://jgangini.github.io/certitips/') && !/\/certitips\/(es|en|pt|it)\//.test(registries[name].pageUrl), 'DOM registry has a local or localized page URL that the backend rejects');
    await require('node:fs/promises').writeFile('output/voice-api-registry.json', JSON.stringify(registries, null, 2));
  };
  const checkPhrase = async phrase => {
    const highlight = await page.evaluate(() => {
      const ranges = window.CSS?.highlights?.get('certivoice-phrase');
      if (ranges) return { text: [...ranges].map(range => range.toString()).join(''), yellow: document.querySelector('#certivoice-highlight-style')?.textContent.includes('background:#ffd54f') };
      const marks = [...document.querySelectorAll('mark[data-voice-highlight]')];
      return { text: marks.map(mark => mark.textContent).join(''), yellow: marks.length > 0 && marks.every(mark => getComputedStyle(mark).backgroundColor === 'rgb(255, 213, 79)') };
    });
    assert(highlight.text === phrase && highlight.yellow, `Exact yellow phrase highlight missing: ${JSON.stringify(highlight)}`);
  };
  const open = async path => {
    await page.goto(new URL(path, base).href);
    await page.waitForFunction(() => window.__voiceState?.enabled === true);
    if (await page.locator('#certichat-panel').isHidden()) await page.locator('[data-chat-open]').click();
    await wave.waitFor({ state: 'visible' });
  };
  const listen = async () => { await wave.click(); await phase('listening'); };
  const turn = async (action, extra = {}, followups = []) => {
    replies.push({ answer: '', transcript: 'Una orden de navegación.', educational: false, sources: [], contentVersion: 'test', action, ...extra }, ...followups);
    const response = page.waitForResponse(value => new URL(value.url()).pathname === '/api/voice');
    await page.evaluate(() => window.__speakTurn()); await response;
  };
  const paused = async () => {
    await phase('paused');
    await wave.waitFor({ state: 'visible' }); await exit.waitFor({ state: 'visible' });
    assert(await page.evaluate(() => window.__voiceState.resume && !window.__voiceState.active && window.__voiceMicRequests === 0), 'Navigation restarted microphone without a gesture');
    assert(await wave.isVisible() && await exit.isVisible() && await mute.isHidden(), 'Navigation lost Resume/Exit');
    assert(await page.locator('[data-voice-edge]').getAttribute('data-state') === 'paused', 'Navigation lost its voice edge');
  };
  const navigation = async (action, target) => { await turn(action); await page.waitForURL(target); await paused(); };

  await open('es/1Z0-1157-26/agents/'); await listen();
  await snapshot('module');
  const emptyHistory = await history();
  const courses = new URL(await page.locator('.header-app-link[href$="/courses/"]').getAttribute('href'), base).href;
  await navigation({ name: 'catalog' }, courses); assert(await history() === emptyHistory, 'Catalog command became a chat turn');
  await snapshot('catalog');
  await listen();
  await turn({ name: 'catalog_menu' }); await phase('listening');
  const groupId = await page.locator('[data-group-carousel] .path-section[id]').nth(1).getAttribute('id');
  await turn({ name: 'catalog_group', targetId: `group:${groupId}` });
  await page.waitForFunction(id => document.getElementById(id)?.classList.contains('is-active'), groupId);
  await phase('listening');
  checks.push('catalog menu and registered group use the existing carousel');
  await navigation({ name: 'home' }, new URL('es/', base).href);
  await listen();
  await navigation({ name: 'videos' }, new URL('es/certitube/', base).href);
  checks.push('localized catalog, home and videos preserve paused voice without command messages');

  await listen();
  await navigation({ name: 'open_course', targetId: 'course:1Z0-1157-26' }, new URL('es/1Z0-1157-26/overview/', base).href);
  await listen();
  const overviewURL = page.url();
  await turn({ name: 'start_presentation' }); await phase('listening');
  assert(page.url() === overviewURL && !await page.locator('#diagram-viewer').evaluate(dialog => dialog.open), 'A module without images silently selected a different module');
  await navigation({ name: 'open_module', targetId: 'module:1Z0-1157-26/langchain' }, new URL('es/1Z0-1157-26/langchain/', base).href);
  await listen();
  await turn({ name: 'course_presentation', targetId: 'course:1Z0-1157-26' });
  await page.waitForURL(new URL('es/1Z0-1157-26/agents/#diagram-agent-loop.svg', base).href);
  await paused(); await listen();
  await page.waitForFunction(() => document.querySelector('#diagram-viewer')?.classList.contains('is-presenting'));
  const firstSlide = await page.locator('#diagram-viewer').getAttribute('data-source-id');
  assert(firstSlide, 'Presentation has no registered source ID');
  await page.locator('deep-chat').evaluate(chat => { window.__sameChat = chat; });
  const moduleSlides = await page.locator('#diagram-viewer .diagram-presentation-nav [aria-current="true"]').evaluate(button => [...button.closest('.diagram-presentation-group').querySelectorAll('button[data-source-id]')].map(item => item.dataset.sourceId));
  assert(moduleSlides.length === 10, 'The requested agents module must exercise all ten published SVGs');
  for (let index = 0; index < moduleSlides.length; index++) {
    const sourceId = moduleSlides[index];
    if (index) { await turn({ name: 'next_slide' }); await phase('listening'); }
    await page.waitForFunction(id => document.querySelector('#diagram-viewer').dataset.sourceId === id, sourceId);
    await page.locator('#diagram-viewer .dialog-content img').evaluate(image => image.decode());
    const registered = await page.evaluate(async id => {
      const actions = await import('/certitips/assets/certivoice-actions.js');
      const image = document.querySelector('#diagram-viewer .dialog-content img');
      return { sourceId: id, title: document.querySelector('#diagram-caption').textContent, pageUrl: actions.voicePageURL(), context: actions.voiceContext(), completed: actions.voiceContext(document, id), decoded: image.complete && image.naturalWidth > 0 };
    }, sourceId);
    assert(registered.decoded && registered.context.diagramId === sourceId && registered.pageUrl.endsWith('/1Z0-1157-26/agents/'), `A module slide lost its decoded image or canonical context: ${JSON.stringify({ sourceId, decoded: registered.decoded, actual: registered.context.diagramId, pageUrl: registered.pageUrl })}`);
    moduleRegistry.slides.push({ sourceId, title: registered.title, pageUrl: registered.pageUrl });
    if (index === 0) { moduleRegistry.contexts.first = registered.context; moduleRegistry.contexts.completedFirst = registered.completed; }
    if (index === moduleSlides.length - 1) moduleRegistry.contexts.last = registered.completed;
    await turn(null, { transcript: `Explica la imagen ${index + 1}.`, educational: true, answer: `Explicación simulada ${index + 1}: ${registered.title}.`, sources: [{ id: sourceId, title: registered.title, url: registered.pageUrl }] });
    await phase('listening');
    assert(voices().at(-1).body.context.diagramId === sourceId, 'A whole-module explanation requested a different visible diagram');
  }
  await turn({ name: 'stop' }); await phase('off'); await listen();
  await turn({ name: 'start_presentation', targetId: firstSlide }); await phase('listening');
  await page.waitForFunction(id => document.querySelector('#diagram-viewer').dataset.sourceId === id, firstSlide);
  checks.push('all ten SVGs of the agents module decode, preserve canonical context and accept a simulated explanation before explicit Stop');
  await turn({ name: 'next_slide' });
  await page.waitForFunction(first => document.querySelector('#diagram-viewer').dataset.sourceId !== first, firstSlide);
  await phase('listening'); await turn({ name: 'previous_slide' });
  await page.waitForFunction(first => document.querySelector('#diagram-viewer').dataset.sourceId === first, firstSlide);
  await phase('listening');
  const section = await page.locator('.prose :is(h2,h3)[data-source-id]').first().evaluate(heading => ({ id: heading.id, sourceId: heading.dataset.sourceId }));
  await turn({ name: 'highlight_section', targetId: section.sourceId });
  await page.waitForFunction(id => !document.querySelector('#diagram-viewer').open && location.hash === `#${encodeURIComponent(id)}`, section.id);
  await page.waitForFunction(({ key, id }) => JSON.parse(sessionStorage.getItem(key) || '[]').some(item => item.kind === 'section' && item.state === 'highlighted' && item.targetId === id), { key: activityKey, id: section.sourceId });
  moduleRegistry.contexts.highlight = await page.evaluate(async () => (await import('/certitips/assets/certivoice-actions.js')).voiceContext());
  assert(await page.locator('.prose :is(h2,h3)[data-source-id]').first().evaluate(heading => heading.getBoundingClientRect().top < innerHeight && heading.getAnimations().some(animation => animation.effect.getKeyframes().some(frame => frame.backgroundColor?.includes('255, 213, 79')))), 'Voice highlight did not reveal a yellow-highlighted registered heading');
  await phase('listening'); await turn({ name: 'return_presentation', targetId: firstSlide });
  await page.waitForFunction(id => document.querySelector('#diagram-viewer').open && document.querySelector('#diagram-viewer').classList.contains('is-presenting') && document.querySelector('#diagram-viewer').dataset.sourceId === id, firstSlide);
  await phase('listening');
  moduleRegistry.contexts.returned = await page.evaluate(async () => (await import('/certitips/assets/certivoice-actions.js')).voiceContext());
  assert(voices().at(-1).body.activityTrail.some(item => item.kind === 'section' && item.state === 'highlighted' && item.targetId === section.sourceId), 'The next voice turn lost the real highlighted section');
  const modulePageUrl = moduleRegistry.slides[0].pageUrl;
  const moduleEvidence = { module: { courseId: 'agentic-ai-foundations-2026', locale: 'es', pageUrl: modulePageUrl, slides: moduleRegistry.slides }, highlightTargetId: section.sourceId,
    ...Object.fromEntries([['first', 'first'], ['highlighted', 'highlight'], ['returned', 'returned'], ['completed', 'completedFirst'], ['last', 'last']].map(([name, key]) => [name, { pageUrl: modulePageUrl, context: moduleRegistry.contexts[key] }])) };
  await require('node:fs/promises').writeFile('output/voice-module-registry.json', JSON.stringify(moduleEvidence, null, 2));
  checks.push('highlight reveals the real section and returns to the same presentation source');
  const phrase = await page.locator('.prose p').first().evaluate(element => element.textContent.trim().split('\n')[0].slice(0, 60));
  await turn({ name: 'highlight_phrase', text: phrase }); await phase('listening');
  assert(!await page.locator('#diagram-viewer').evaluate(dialog => dialog.open), 'Phrase highlight stayed behind the diagram modal');
  await checkPhrase(phrase);
  await turn({ name: 'highlight_phrase', text: phrase }); await phase('listening'); await checkPhrase(phrase);
  await turn({ name: 'return_presentation', targetId: firstSlide });
  await page.waitForFunction(id => document.querySelector('#diagram-viewer').open && document.querySelector('#diagram-viewer').dataset.sourceId === id, firstSlide);
  await phase('listening');
  checks.push('literal yellow phrase highlight works from a viewer and text, then restores the same SVG');
  await page.evaluate(() => { window.__holdSpeech = true; });
  const completedAnswer = 'Explicación completa de la lámina actual.';
  await turn(null, { educational: true, transcript: 'Explica esta lámina.', answer: completedAnswer, audio: { format: 'wav', data: 'UklGRg==' } });
  await page.waitForFunction(text => window.__utterance?.text === text, completedAnswer);
  assert(await page.evaluate(() => window.__utterance.voice.name === 'Microsoft Sabina' && window.__voiceOutputs.length === 0), 'Educational answer did not prefer the same native female voice as navigation');
  await page.evaluate(() => window.__utterance.onend()); await phase('listening');
  const nextSlide = await page.locator('#diagram-viewer .diagram-presentation-nav').evaluate(nav => { const buttons = [...nav.querySelectorAll('button[data-source-id]')]; return buttons[buttons.findIndex(button => button.getAttribute('aria-current') === 'true') + 1].dataset.sourceId; });
  const previousTitle = await page.locator('#diagram-caption').textContent();
  const startedAt = Math.floor(Date.now() / 1000), courseId = 'agentic-ai-foundations-2026';
  const segment = step => ({ answer: `Contenido educativo del segmento ${step}.`, transcript: '', educational: true, sources: [{ id: nextSlide, title: 'Conceptos clave', url: 'https://jgangini.github.io/certitips/1Z0-1157-26/agents/#conceptos-clave' }], contentVersion: 'test', action: null, lecture: { step, startedAt, courseId, done: step === 2 } });
  await turn({ name: 'lecture_start', targetId: nextSlide }, { transcript: 'Continúa con toda la presentación.', lecture: { step: 0, startedAt, courseId, done: false } }, [segment(1)]);
  await phase('speaking');
  const requestStart = voices().at(-1).body, transition = await page.evaluate(() => window.__utterance.text), nextTitle = await page.locator('#diagram-caption').textContent();
  outputRegistry.presentationCompleted = { pageUrl: requestStart.pageUrl, context: requestStart.context };
  await require('node:fs/promises').writeFile('output/voice-browser-output-registry.json', JSON.stringify(outputRegistry, null, 2));
  assert(requestStart.context.completedDiagramId === firstSlide && requestStart.context.nextDiagramId === nextSlide && requestStart.audioOutput === 'browser', 'Whole-presentation request omitted completion, next diagram or native-output preference');
  assert(transition.includes(previousTitle) && transition.includes(nextTitle) && await page.locator('#diagram-viewer').getAttribute('data-source-id') === nextSlide, 'Lecture did not explain its transition to the next registered diagram');
  assert(voices().at(-1).body.mode !== 'lecture' && replies.length === 1 && await page.locator('[data-voice-lecture-start]').count() === 0, 'Spoken lecture consent repeated an extra button or generated before its transition ended');
  await page.evaluate(() => window.__utterance.onend());
  await page.waitForFunction(() => window.__utterance?.text === 'Contenido educativo del segmento 1.');
  await phase('speaking');
  const firstLecture = voices().at(-1).body, lectureCount = voices().length;
  assert(firstLecture.mode === 'lecture' && firstLecture.audioOutput === 'browser' && !firstLecture.audio && firstLecture.previousRequestId === voices().at(-2).body.requestId && firstLecture.context.diagramId === nextSlide && Object.keys(firstLecture.context).every(key => ['sectionId', 'diagramId'].includes(key)), 'First lecture segment did not use its authorized next diagram, previous request and browser speech');
  assert(replies.length === 0, 'Lecture response was not consumed');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert(voices().length === lectureCount, 'Lecture advanced before audio ended');
  await page.evaluate(() => { window.__firstLectureUtterance = window.__utterance; });
  await turn(null, { educational: true, transcript: '¿Qué significa este concepto?', answer: 'Respuesta educativa a la pregunta intermedia.', audio: { format: 'wav', data: 'UklGRg==' } });
  await page.waitForFunction(() => window.__utterance?.text === 'Respuesta educativa a la pregunta intermedia.');
  assert(await page.evaluate(() => window.__firstLectureUtterance.canceled), 'Question did not interrupt the current lecture speech');
  await page.evaluate(() => window.__utterance.onend()); await phase('listening');
  assert(voices().length === lectureCount + 1 && await page.locator('#diagram-viewer').getAttribute('data-source-id') === nextSlide, 'Answering a question advanced the interrupted lecture');
  await turn(null, { educational: true, transcript: 'Amplía esta explicación con un ejemplo.', answer: 'Ampliación simulada del concepto de esta misma lámina.' });
  await page.waitForFunction(() => window.__utterance?.text === 'Ampliación simulada del concepto de esta misma lámina.');
  assert(voices().at(-1).body.context.diagramId === nextSlide && await page.locator('#diagram-viewer').getAttribute('data-source-id') === nextSlide, 'Asking for more detail lost the current slide');
  await page.evaluate(() => window.__utterance.onend()); await phase('listening');
  await turn({ name: 'continue' }, { answer: 'Resto validado del primer segmento.', playbackRequestId: firstLecture.requestId, playbackOffset: 0, audio: { format: 'wav', data: 'UklGRg==' } });
  await page.waitForFunction(() => window.__utterance?.text === 'Resto validado del primer segmento.');
  assert(voices().at(-1).body.playback?.requestId === firstLecture.requestId && await page.locator('#diagram-viewer').getAttribute('data-source-id') === nextSlide, 'Continue lost the original lecture playback or advanced before its remaining speech');
  replies.push(segment(2));
  await page.evaluate(() => window.__utterance.onend());
  await page.waitForFunction(() => window.__utterance?.text === 'Contenido educativo del segmento 2.');
  const secondLecture = voices().at(-1).body;
  assert(secondLecture.mode === 'lecture' && secondLecture.previousRequestId === firstLecture.requestId && secondLecture.context.diagramId !== nextSlide, 'Lecture did not move once to the next registered slide');
  await page.evaluate(() => window.__utterance.onend());
  await phase('listening');
  assert(voices().length === lectureCount + 4, 'Finished lecture started another segment');
  assert(await page.locator('deep-chat').evaluate(chat => chat.getMessages().filter(message => /Contenido educativo del segmento/.test(message.text)).length === 2 && !chat.getMessages().some(message => message.role === 'user' && !message.text)), 'Lecture lost content or invented an empty user transcript');
  checks.push('completed diagram advances to the next registered lecture target after its spoken transition without repeating it');
  checks.push('a question interrupts lecture, more detail keeps the same SVG, and Continue resumes original audio before advancing');
  const currentSlide = await page.locator('#diagram-viewer').getAttribute('data-source-id');
  await turn({ name: 'lecture_start', targetId: currentSlide }, { lecture: { step: 0, startedAt, courseId, done: false } }, [segment(1)]);
  await phase('speaking'); await page.evaluate(() => window.__utterance.onend());
  await page.waitForFunction(() => window.__utterance?.text === 'Contenido educativo del segmento 1.');
  const beforeCancel = voices().length;
  await page.evaluate(() => { window.__canceledAudio = window.__utterance; window.__canceledEnd = window.__utterance.onend; });
  await exit.click();
  await page.waitForFunction(() => !window.__voiceState.active);
  await page.evaluate(() => { window.__canceledEnd?.(); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  assert(voices().length === beforeCancel && await page.evaluate(() => window.__canceledAudio.canceled && window.__voiceTrack.stopped), 'Exiting a lecture allowed a late speech callback to submit another segment');
  checks.push('lecture Exit releases capture and prevents late completion from generating another segment');
  await listen();
  const lastModuleSlide = moduleSlides.at(-1), moduleId = lastModuleSlide.split('#')[0];
  for (const scope of ['presentation', 'module']) {
    const menu = page.locator('[data-diagram-menu]');
    if (await menu.getAttribute('aria-expanded') !== 'true') await menu.click();
    await page.locator(`#diagram-viewer .diagram-presentation-nav button[data-source-id="${lastModuleSlide}"]`).click();
    await page.waitForFunction(id => document.querySelector('#diagram-viewer').dataset.sourceId === id, lastModuleSlide);
    if (await menu.getAttribute('aria-expanded') === 'true') await menu.click();
    const outsideSlide = await page.locator('#diagram-viewer .diagram-presentation-nav').evaluate(nav => { const buttons = [...nav.querySelectorAll('button[data-source-id]')]; return buttons[buttons.findIndex(button => button.getAttribute('aria-current') === 'true') + 1].dataset.sourceId; });
    assert(outsideSlide.split('#')[0] !== moduleId, 'Boundary fixture must end at the next module, not the next image of agents');
    const metadata = { startedAt, courseId, done: false, ...(scope === 'module' ? { moduleId } : {}) };
    const finalAnswer = `Última lámina de agents en modo ${scope}.`;
    await turn({ name: 'lecture_start', targetId: lastModuleSlide, text: scope }, { lecture: { ...metadata, step: 0 } }, [{ ...segment(1), answer: finalAnswer, sources: [{ id: lastModuleSlide, title: 'Última lámina de agents', url: modulePageUrl }], lecture: { ...metadata, step: 1 } }]);
    await phase('speaking'); await page.evaluate(() => window.__utterance.onend());
    await page.waitForFunction(text => window.__utterance?.text === text, finalAnswer);
    const beforeBoundary = voices().length;
    if (scope === 'presentation') replies.push({ ...segment(2), answer: 'Primera lámina del siguiente módulo.', sources: [{ id: outsideSlide, title: 'LangChain', url: 'https://jgangini.github.io/certitips/1Z0-1157-26/langchain/' }], lecture: { ...metadata, step: 2, done: true } });
    await page.evaluate(() => window.__utterance.onend());
    if (scope === 'presentation') {
      await page.waitForFunction(() => window.__utterance?.text === 'Primera lámina del siguiente módulo.');
      assert(voices().length === beforeBoundary + 1 && voices().at(-1).body.mode === 'lecture' && voices().at(-1).body.context.diagramId === outsideSlide, 'A full presentation did not continue across the native gallery group boundary');
      await page.evaluate(() => window.__utterance.onend());
    }
    await phase('listening');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert(voices().length === beforeBoundary + (scope === 'presentation' ? 1 : 0) && await page.locator('#diagram-viewer').getAttribute('data-source-id') === (scope === 'presentation' ? outsideSlide : lastModuleSlide), 'Module scope crossed its final SVG or emitted an extra billed request');
  }
  checks.push('module lecture stops Listening at its last SVG with zero extra POSTs; full presentation continues across gallery groups');
  await page.evaluate(() => { window.__holdSpeech = false; });
  await turn({ name: 'exit_presentation' });
  await page.waitForFunction(() => !document.querySelector('#diagram-viewer').classList.contains('is-presenting'));
  assert(await page.evaluate(() => document.querySelector('deep-chat') === window.__sameChat), 'Presentation rebuilt the chat instance');
  checks.push('registered course resolves overview, deferred presentation and reversible slide controls');

  // Continue below with the same browser/controller; the root integration owns modal relocation.
  await open('es/1Z0-1157-26/agents/'); if (await exit.isVisible()) await exit.click(); await listen();
  await turn({ name: 'set_theme', targetId: 'theme:dark' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark'); await phase('listening');
  await turn({ name: 'set_theme', targetId: 'theme:light' });
  await page.waitForFunction(() => document.documentElement.dataset.theme !== 'dark'); await phase('listening');
  await navigation({ name: 'set_language', targetId: 'language:en' }, new URL('en/1Z0-1157-26/agents/', base).href);
  assert(voices().at(-1).body.locale === 'es', 'Language command did not originate in its current locale');
  checks.push('native theme toggle and language route preserve voice controls');

  await listen(); await turn({ name: 'search', text: 'LangChain' });
  await page.locator('#site-search[open]').waitFor();
  assert(await page.locator('#search-query').inputValue() === 'LangChain', 'Voice search lost its query');
  await page.locator('#search-results a').first().waitFor({ state: 'visible' });
  assert((await page.locator('#search-results a').first().getAttribute('href')).includes('/certitips/'), 'Search did not resolve an existing site result');
  await page.locator('#site-search').evaluate(dialog => dialog.close());
  checks.push('voice query reaches the existing searchable content UI');

  await open('es/certitube/'); if (await exit.isVisible()) await exit.click();
  await page.evaluate(() => sessionStorage.setItem('__holdYT', '1')); await page.reload();
  await page.waitForFunction(() => window.__voiceState?.enabled && window.__youtube);
  if (await page.locator('#certichat-panel').isHidden()) await page.locator('[data-chat-open]').click();
  await listen();
  const chapter = await page.locator('[data-tube-time]').nth(1).evaluate(link => ({ seconds: Number(link.dataset.tubeTime), video: document.querySelector('[data-tube-player]').dataset.videoId }));
  await turn({ name: 'video_chapter', targetId: `chapter:${chapter.video}:${chapter.seconds}` });
  await page.waitForFunction(seconds => document.querySelector('[data-tube-player]').dataset.activeMoment === String(seconds), chapter.seconds);
  assert(await page.evaluate(() => !window.__ytCalls.some(call => call[0] === 'play')), 'Voice chapter played before player readiness');
  await page.evaluate(() => { sessionStorage.removeItem('__holdYT'); window.__readyYouTube(); });
  await page.waitForFunction(seconds => window.__ytCalls.some(call => call[0] === 'seek' && call[1] === seconds), chapter.seconds);
  assert(await page.evaluate(() => window.__youtube.getPlayerState() === 2 && !window.__ytCalls.some(call => call[0] === 'play')), 'Voice chapter autoplayed after player readiness');
  checks.push('registered video chapter selects before readiness and remains paused after seek');
  await page.locator('[data-voice-video-confirm]').waitFor({ state: 'visible' });
  await phase('listening');
  await page.evaluate(() => { window.__denyFullscreen = true; });
  await turn({ name: 'video_play', targetId: `video:${chapter.video}` });
  await page.waitForFunction(() => window.__voiceState?.muted && !window.__voiceState.locked);
  assert(await page.locator('[data-voice-video-confirm]').isVisible() && await page.evaluate(() => !window.__voiceTrack.enabled && window.__youtube.getPlayerState() === 2), 'Denied fullscreen lost confirmation or enabled the microphone');
  await page.evaluate(() => { window.__denyFullscreen = false; });
  await page.locator('[data-voice-video-play]').click();
  await page.waitForFunction(() => window.__voiceState?.locked && window.__youtube.getPlayerState() === 1);
  assert(await page.locator('[data-voice-video-confirm]').count() === 0 && await page.evaluate(() => !window.__voiceTrack.enabled && Boolean(document.fullscreenElement)), 'Confirmed video did not suppress microphone during fullscreen playback');
  assert(await mute.getAttribute('aria-disabled') === 'true', 'Video playback did not expose the locked microphone state');
  await mute.evaluate(button => button.click());
  assert(await page.evaluate(() => !window.__voiceTrack.enabled && window.__voiceState.muted), 'Locked video allowed the microphone to resume');
  await page.evaluate(() => window.__youtube.pauseVideo());
  await page.waitForFunction(() => !window.__voiceState.locked && window.__voiceState.muted);
  await page.waitForFunction(() => !document.fullscreenElement);
  assert(await page.evaluate(() => !window.__voiceTrack.enabled), 'Pausing video automatically reopened the microphone');
  await mute.click(); await phase('listening');
  assert(await page.evaluate(() => window.__voiceTrack.enabled), 'Explicit microphone activation after video pause failed');
  await turn({ name: 'video_close', targetId: `video:${chapter.video}` });
  await page.waitForFunction(() => !document.fullscreenElement && window.__youtube.getPlayerState() === 2);
  checks.push('video confirmation, denied fullscreen fallback, locked microphone and explicit activation after pause');

  await open('es/1Z0-1157-26/agents/'); if (await exit.isVisible()) await exit.click(); await listen();
  await navigation({ name: 'chat' }, new URL('es/certichat/', base).href);
  await listen(); await turn({ name: 'quiz' });
  await page.waitForURL(new URL('es/certiquiz/', base).href);
  assert(await page.locator('deep-chat').count() === 0 && await page.evaluate(() => window.__voiceMicRequests === 0), 'CertiQuiz unexpectedly mounted the tutor or microphone');
  checks.push('chat navigation and quiz destination respect the tutor exclusion');

  await open('es/1Z0-1157-26/agents/'); if (await exit.isVisible()) await exit.click(); await listen();
  await navigation({ name: 'practice' }, new URL('es/1Z0-1157-26/practice/', base).href); await listen();
  await page.locator('#quiz [data-start]').waitFor({ state: 'visible' });
  const practiceHistory = await history();
  const practice = async (name, wait = true) => {
    const targetId = await page.evaluate(async name => (await import('/certitips/assets/certivoice-actions.js')).voiceContext().targets.find(target => target.action === name)?.id, name);
    assert(targetId, `Native practice target missing: ${name}`);
    await turn({ name, targetId }); if (wait) await phase('listening');
    return targetId;
  };
  await practice('practice_start'); await page.locator('#question-form').waitFor();
  await snapshot('practiceQuestion'); await snapshot('practiceReset');
  const question = await page.locator('.quiz-question').textContent();
  await practice('practice_read');
  assert(await page.evaluate(text => window.__spoken.at(-1).includes(text), question), 'Practice reading did not use the visible question');
  await practice('practice_select');
  await snapshot('practiceSelected');
  assert(await page.locator('#question-form input:checked').count() === 1 && await page.locator('#quiz .feedback').count() === 0, 'Selecting an option submitted without confirmation');
  await practice('practice_cancel');
  assert(await page.locator('#question-form input:checked').count() === 0 && await page.locator('#question-form button[type="submit"]').isDisabled(), 'Cancel did not clear the unconfirmed answer');
  const staleOption = await practice('practice_select');
  await practice('practice_confirm'); await page.locator('#quiz .feedback').waitFor({ state: 'visible' });
  const feedback = (await page.locator('#quiz .feedback p').textContent()).replace(/\s+/g, ' ').trim();
  assert(await page.evaluate(text => window.__spoken.at(-1).includes(text), feedback), 'Practice confirmation did not read native feedback');
  const attempt = await page.evaluate(() => localStorage.getItem(`certitips:quiz:v1:${document.body.dataset.course}`));
  await turn({ name: 'practice_select', targetId: staleOption }); await phase('listening');
  assert(await page.evaluate(() => localStorage.getItem(`certitips:quiz:v1:${document.body.dataset.course}`)) === attempt, 'A stale practice nonce changed the recorded answer');
  await practice('practice_explanation');
  assert(await page.evaluate(text => window.__spoken.at(-1).includes(text) && window.__spoken.at(-1).includes('¿Quieres continuar?'), feedback), 'Practice explanation diverged from the existing feedback');
  await practice('practice_next');
  assert(await page.locator('.quiz-question').getAttribute('data-question-number') === '2. ', 'Practice did not advance to the next native question');
  const practiceURL = page.url();
  const beforeDetour = await page.evaluate(() => localStorage.getItem(`certitips:quiz:v1:${document.body.dataset.course}`));
  await turn({ name: 'home' }); await phase('listening');
  await page.locator('#quiz [data-finish-confirm][open]').waitFor();
  assert(page.url() === practiceURL && await page.evaluate(() => localStorage.getItem(`certitips:quiz:v1:${document.body.dataset.course}`)) === beforeDetour, 'Home left or finished the practice before confirmation');
  await page.locator('#quiz [data-finish-confirm][open] [data-finish-no]').click(); await phase('listening');
  assert(page.url() === practiceURL && await page.evaluate(() => localStorage.getItem(`certitips:quiz:v1:${document.body.dataset.course}`)) === beforeDetour, 'Canceling Home changed the practice attempt');
  await page.waitForFunction(key => JSON.parse(sessionStorage.getItem(key) || '[]').some(item => item.kind === 'practice_dialog' && item.state === 'cancelled' && item.targetId === 'finish'), activityKey);
  const cancelledTrail = await activity();
  assert(cancelledTrail.at(-1).pageUrl.endsWith('/1Z0-1157-26/practice/') && !cancelledTrail.some(item => item.kind === 'page' && item.state === 'arrived' && item.pageUrl === 'https://jgangini.github.io/certitips/'), 'Canceled Home was remembered as an arrival at its destination');
  await page.evaluate(() => { window.__holdSpeech = true; });
  await turn({ name: 'study_concept', text: 'LangChain' }); await phase('speaking');
  assert(page.url() === practiceURL && await page.evaluate(() => window.__spoken.at(-1) === 'Pausaré la práctica para consultar este contenido. Tu intento se conserva y puedes volver después.'), 'Study detour did not finish explaining how to preserve and return to practice');
  await page.evaluate(() => { window.__holdSpeech = false; window.__utterance.onend(); });
  await page.waitForURL(url => url.pathname.startsWith('/certitips/es/1Z0-1157-26/') && !url.pathname.endsWith('/practice/'));
  await paused();
  assert(await page.evaluate(() => localStorage.getItem(`certitips:quiz:v1:${document.body.dataset.course}`)) === beforeDetour, 'Study detour changed the unfinished attempt');
  await listen(); await navigation({ name: 'return_practice' }, practiceURL); await listen();
  assert(await page.locator('.quiz-question').getAttribute('data-question-number') === '2. ' && await page.evaluate(() => localStorage.getItem(`certitips:quiz:v1:${document.body.dataset.course}`)) === beforeDetour, 'Returning from study did not preserve the same question and answers');
  checks.push('Home requires confirmation and study detour returns to the unchanged practice attempt');
  await practice('practice_finish');
  await page.locator('#quiz dialog.confirmation[open]').waitFor();
  assert(await page.evaluate(() => document.querySelector('#quiz dialog[open]').contains(document.querySelector('[data-certichat]'))) && await exit.isVisible(), 'Practice confirmation stranded voice outside its modal');
  await practice('practice_cancel');
  assert(await page.locator('#quiz dialog[open]').count() === 0 && await page.locator('#question-form').count() === 1, 'Canceling finish lost the active practice');
  const beforeResetCancel = await page.evaluate(() => localStorage.getItem(`certitips:quiz:v1:${document.body.dataset.course}`));
  await practice('practice_reset'); await practice('practice_cancel');
  assert(await page.locator('#question-form').count() === 1 && await page.evaluate(() => localStorage.getItem(`certitips:quiz:v1:${document.body.dataset.course}`)) === beforeResetCancel, 'Canceling reset altered the native attempt');
  await practice('practice_reset'); await snapshot('practiceResetDialog'); await practice('practice_accept');
  await page.locator('#quiz [data-start]').waitFor({ state: 'visible' });
  assert(await page.evaluate(() => localStorage.getItem(`certitips:quiz:v1:${document.body.dataset.course}`)) === null, 'Confirmed reset retained the old attempt');
  await practice('practice_start'); await practice('practice_select'); await practice('practice_confirm');
  await practice('practice_finish'); await practice('practice_accept');
  await page.locator('#quiz .quiz-summary').waitFor({ state: 'visible' });
  await practice('practice_exit'); await practice('practice_cancel');
  assert(await page.locator('#quiz .quiz-summary').isVisible(), 'Canceling Exit removed the native results');
  await practice('practice_exit'); await practice('practice_accept');
  await page.locator('#quiz [data-start]').waitFor({ state: 'visible' });
  assert(await history() === practiceHistory, 'Practice commands polluted educational chat history');
  checks.push('practice reads native question and feedback, confirms choices, rejects stale IDs and preserves dialog controls');
  checks.push('practice finish, reset and exit use explicit native accept/cancel without changing chat history');
  const homeURL = new URL('es/', base).href;
  for (const method of ['voice', 'mouse']) {
    await practice('practice_start'); await practice('practice_select'); await practice('practice_confirm');
    const followups = await page.evaluate(() => Number(sessionStorage.getItem('__practiceFollowups') || 0));
    const homeLoads = documents.filter(url => url === homeURL).length;
    await turn({ name: 'home' }); await phase('listening');
    assert(page.url() === practiceURL, `${method} Home confirmation navigated before acceptance`);
    const callsBeforeAccept = voices().length;
    if (method === 'voice') await practice('practice_accept', false);
    else await page.locator('#quiz [data-finish-confirm][open] [data-finish-yes]').click();
    await page.waitForURL(homeURL); await paused();
    assert(documents.filter(url => url === homeURL).length === homeLoads + 1 && await page.evaluate(() => Number(sessionStorage.getItem('__practiceFollowups') || 0)) === followups + 1, `${method} acceptance did not navigate exactly once`);
    assert(voices().length === callsBeforeAccept + (method === 'voice' ? 1 : 0), `${method} acceptance triggered an extra inference`);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('certitips:quiz:v1:agentic-ai-foundations-2026')));
    assert(saved.finished === true && Object.keys(saved.answers).length === 1, `${method} departure did not preserve the confirmed result`);
    if (method === 'voice') {
      await open('es/1Z0-1157-26/practice/'); await listen();
      await practice('practice_reset'); await practice('practice_accept');
    }
  }
  checks.push('Home acceptance by voice and mouse emits one followup and one navigation, preserving results');

  await open('es/1Z0-1085-26/overview/'); await listen();
  const moduleRoutes = await page.locator('#course-section-list .nav-link[data-completion]').evaluateAll(links => links.map(link => ({ url: link.href, slug: link.dataset.completion })));
  assert(moduleRoutes.length === 8, 'The complete OCI Foundations route must include overview and all seven modules');
  for (const module of moduleRoutes.filter(item => item.slug !== 'overview')) {
    await navigation({ name: 'open_module', targetId: `module:1Z0-1085-26/${module.slug}` }, module.url);
    assert(await page.locator('body').getAttribute('data-page') === module.slug && (await page.locator('h1').textContent()).trim(), 'Module navigation did not load its native heading');
    visitedModules.push(module.slug); await listen();
  }
  await navigation({ name: 'open_module', targetId: 'module:1Z0-1085-26/overview' }, new URL('es/1Z0-1085-26/overview/', base).href); await listen();
  await turn({ name: 'start_presentation' }); await phase('listening');
  assert(await page.locator('[data-diagram]').count() === 0 && !await page.locator('#diagram-viewer').evaluate(dialog => dialog.open), 'Overview without diagrams opened a presentation');
  assert(await page.evaluate(() => window.__spoken.some(text => text.includes('Este módulo no contiene imágenes para presentar.'))), 'Overview omitted its deterministic no-images explanation');
  visitedModules.push('overview');
  checks.push('all eight OCI Foundations module pages load, and overview reports no images without leaving its route');

  await open('en/1Z0-1085-26/overview/');
  outputRegistry.overviewEn = await page.evaluate(async () => { const module = await import('/certitips/assets/certivoice-actions.js'); return { pageUrl: module.voicePageURL(), context: module.voiceContext() }; });
  await require('node:fs/promises').writeFile('output/voice-browser-output-registry.json', JSON.stringify(outputRegistry, null, 2));

  await open('es/1Z0-1157-26/agents/'); if (await exit.isVisible()) await exit.click();
  const clearConversation = async () => {
    await page.waitForFunction(() => !document.querySelector('[data-chat-clear]').disabled);
    await page.locator('[data-chat-clear]').click(); await page.locator('[data-chat-confirm-yes]').click();
    await page.waitForFunction(() => !document.querySelector('[data-chat-confirm-yes]').closest('dialog').open);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert((await activity()).length === 0, 'Clear retained or immediately reinserted the current activity');
  };
  const sendChat = async text => {
    const input = page.locator('deep-chat [role="textbox"]');
    await input.fill(text);
    await page.waitForFunction(() => document.querySelector('deep-chat').shadowRoot.querySelector('.input-button.inside-end:not(.custom-button)')?.getAttribute('aria-disabled') !== 'true');
    const response = page.waitForResponse(value => new URL(value.url()).pathname === '/api/chat');
    await input.press('Enter'); await response;
    await page.waitForFunction(() => !document.querySelector('[data-chat-clear]').disabled && document.querySelector('deep-chat').getMessages().at(-1)?.role === 'ai');
    return calls.filter(call => call.path === '/api/chat').at(-1).body;
  };
  await clearConversation();
  await page.locator('[data-chat-close]').click();
  if (await page.locator('.menu-toggle').getAttribute('aria-expanded') !== 'true') await page.locator('.menu-toggle').click();
  const manualModule = page.locator('#course-section-list .nav-link[data-completion="langchain"]');
  if (!await manualModule.isVisible()) await manualModule.locator('xpath=ancestor::details').locator('summary').click();
  await manualModule.click(); await page.waitForURL(new URL('es/1Z0-1157-26/langchain/', base).href);
  await page.waitForFunction(key => JSON.parse(sessionStorage.getItem(key) || '[]').some(item => item.kind === 'page' && item.state === 'arrived' && item.pageUrl.endsWith('/1Z0-1157-26/langchain/')), activityKey);
  await page.locator('[data-diagram]').first().click();
  await page.locator('#diagram-viewer [data-diagram-present]').click();
  const manualDiagram = await page.locator('#diagram-viewer').getAttribute('data-source-id');
  await page.waitForFunction(({ key, id }) => JSON.parse(sessionStorage.getItem(key) || '[]').at(-1)?.targetId === id && JSON.parse(sessionStorage.getItem(key) || '[]').at(-1)?.state === 'presentation', { key: activityKey, id: manualDiagram });
  const manualTrail = await activity();
  await page.locator('#diagram-viewer .dialog-content img').evaluate(image => { image.dispatchEvent(new Event('load')); image.dispatchEvent(new Event('load')); });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert(JSON.stringify(await activity()) === JSON.stringify(manualTrail), 'Repeated observations duplicated or refreshed an activity timestamp');
  await page.locator('#diagram-viewer [data-chat-open]').click();
  await page.locator('deep-chat [role="textbox"]').waitFor();
  const chatSnapshot = (await sendChat('¿Qué imagen seleccioné?')).activityTrail;
  assert(JSON.stringify(chatSnapshot) === JSON.stringify(manualTrail), 'Chat did not receive the observed manual navigation and diagram selection');
  await listen(); await turn({ name: 'next_slide' }); await phase('listening');
  assert(JSON.stringify(voices().at(-1).body.activityTrail) === JSON.stringify(chatSnapshot), 'Chat and voice used different shared activity before an action');
  const agentDiagram = await page.locator('#diagram-viewer').getAttribute('data-source-id');
  await page.waitForFunction(({ key, id }) => JSON.parse(sessionStorage.getItem(key) || '[]').at(-1)?.targetId === id, { key: activityKey, id: agentDiagram });
  const agentTrail = await activity();
  assert(agentDiagram !== manualDiagram && agentTrail.at(-1).state === 'presentation', 'Voice selection did not record its actual visible result');
  await turn(null, { transcript: 'Explica la imagen actual.', educational: true, answer: 'Explicación simulada de la imagen seleccionada.' }); await phase('listening');
  const voiceSnapshot = voices().at(-1).body.activityTrail;
  await exit.click();
  assert(JSON.stringify((await sendChat('¿Qué imagen acabamos de ver?')).activityTrail) === JSON.stringify(voiceSnapshot) && JSON.stringify(voiceSnapshot) === JSON.stringify(agentTrail), 'Voice activity was lost or changed when returning to chat');
  checks.push('manual navigation and SVG selection share the same observed trail across chat and voice without duplicate timestamps');
  await clearConversation();
  assert((await sendChat('¿Queda actividad anterior?')).activityTrail.length === 0, 'A cleared conversation sent old activity to the tutor');
  const expiredAt = Date.now() - 86400001, retainedAt = Date.now() - 60000;
  await page.evaluate(({ key, entries }) => sessionStorage.setItem(key, JSON.stringify(entries)), { key: activityKey, entries: [{ ...agentTrail.at(-1), at: expiredAt }, { ...manualTrail[0], at: retainedAt }] });
  const freshTrail = (await sendChat('¿Qué actividad sigue vigente?')).activityTrail;
  assert(freshTrail.length === 1 && freshTrail[0].at === retainedAt && JSON.stringify(await activity()) === JSON.stringify(freshTrail), 'Activity expiry retained stale data or extended a valid entry lifetime');
  await clearConversation();
  checks.push('canceled practice navigation records cancellation; clear and per-entry24-hour expiry remove shared activity without renewing it');

  assert(replies.length === 0 && errors.length === 0, `Unconsumed responses or browser errors: ${JSON.stringify({ remaining: replies.length, errors })}`);
  assert(voices().every(call => call.body.pageUrl.startsWith('https://jgangini.github.io/certitips/') && !/\/certitips\/(es|en|pt|it)\//.test(call.body.pageUrl)), 'Voice or lecture sent a nonpublic page URL');
  assert(!blocked.some(url => /openrouter|api\.openai/i.test(url)), 'Application attempted a provider request directly');
  return { checks, visitedModules, completeModule: { route: '1Z0-1157-26/agents', diagrams: moduleRegistry.slides.length }, voiceRequests: voices().length, chatRequests: calls.filter(call => call.path === '/api/chat').length, blockedExternalRequests: blocked.length, paidCalls: 0, screenshots: 0 };
}

// playwright-cli -s=certitubeqa run-code --filename scripts/certitube-browser-smoke.cjs
// Preview only; API and YouTube simulated, no paid calls or screenshots.
async (page) => {
  const origin = 'http://127.0.0.1:4173', base = `${origin}/certitips/`, path = 'certitube/Ha74VhpQwQo/';
  if (!page.url().startsWith(base)) throw new Error('Open the local preview first.');
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => route.abort('blockedbyclient'));
  const tab = await context.newPage(), errors = [], calls = [], checks = [];
  let corpusRequests = 0, failCorpus = false;
  let releaseCorpus;
  const corpusGate = new Promise(resolve => { releaseCorpus = resolve; });
  let phase = 'setup';
  tab.on('pageerror', error => errors.push(error.message));
  const quota = { remaining: 19, limit: 20, refreshHours: 6, resetAt: null, minuteRemaining: 1, retryAfter: 0 };
  const source = { id: 'certitube/Ha74VhpQwQo#t-243', title: 'CertiTube · Respuesta del asistente y evidencias del evento · 04:03', url: 'https://jgangini.github.io/certitips/certitube/Ha74VhpQwQo/#t-243' };
  await tab.route('**/*', async route => {
    const request = route.request(), url = request.url();
    if (!url.startsWith(`${origin}/`)) return route.abort('blockedbyclient');
    if (url.includes('/assets/certichat/corpus.json')) {
      corpusRequests++; await corpusGate;
      if (failCorpus) return route.fulfill({ status: 503, body: 'Unavailable' });
    }
    if (url.startsWith(`${origin}/api/`)) {
      calls.push(url);
      if (url.endsWith('/session')) return route.fulfill({ json: { mode: 'LOCAL', authenticated: true, verificationRequired: false, available: true, quota } });
      if (url.endsWith('/health')) return route.fulfill({ json: { knowledge: {} } });
      if (url.endsWith('/chat')) return route.fulfill({ json: { answer: 'El capítulo explica las evidencias del evento.', sources: [source], quota } });
      throw new Error(`Unexpected API request: ${url}`);
    }
    if (!request.isNavigationRequest()) return route.continue();
    const response = await route.fetch();
    return route.fulfill({ response, body: (await response.text()).replace(/data-api="[^"]*"/, `data-api="${origin}"`) });
  });
  await tab.addInitScript(() => {
    if (location.hash === '#network-failure') return;
    window.YT = { Player: function (id, options) {
      const frame = document.createElement('iframe'); frame.id = id; document.getElementById(id).replaceWith(frame);
      const player = {
        calls: [], options, time: 0, state: 5, getIframe: () => frame, getDuration: () => Number(document.querySelector("[data-tube-player]").dataset.duration),
        getCurrentTime() { return this.time; }, getPlayerState() { return this.state; },
        seekTo(seconds) { this.time = seconds; this.calls.push(['seek', seconds]); },
        playVideo() { this.state = 1; this.calls.push(['play']); }, pauseVideo() { this.state = 2; this.calls.push(['pause']); },
        ready() { options.events.onReady({ target: this }); },
      };
      window.__tube = player; return player;
    } };
  });
  const readyPlayer = async () => { await tab.waitForFunction(() => window.__tube); await tab.evaluate(() => window.__tube.ready()); };
  const lastSeek = () => tab.evaluate(() => window.__tube.calls.filter(call => call[0] === 'seek').at(-1)?.[1]);
  const chatReady = () => tab.waitForFunction(() => document.querySelector('deep-chat')?.shadowRoot?.querySelector('#certichat-quota') && !document.querySelector('[data-chat-clear]').disabled);
  try {
    await tab.goto(base);
    const sharing = await tab.evaluate(async () => {
      const url = document.querySelector('meta[property="og:image"]').content;
      const pixels = async path => {
        const image = new Image(); image.src = path; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
        const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, 512, 512).data;
      };
      const [current, original] = await Promise.all([pixels(new URL(url).pathname), pixels('/certitips/assets/icons/favicon.png')]);
      return {path: new URL(url).pathname, corners: [0, 511, 511 * 512, 512 * 512 - 1].map(pixel => [...current.slice(pixel * 4, pixel * 4 + 4)]), opaque: current.every((value, index) => index % 4 !== 3 || value === 255), preserved: original.every((value, index) => original[index - index % 4 + 3] !== 255 || value === current[index])};
    });
    assert(sharing.path.endsWith('/share-logo-square.png') && sharing.opaque && sharing.preserved && sharing.corners.every(pixel => JSON.stringify(pixel) === '[199,70,52,255]'), `Shared image has empty corners or changed original logo pixels: ${JSON.stringify(sharing)}`);
    const appLinks = tab.locator('.header-app-link');
    assert(await appLinks.count() === 3, 'Header navigation icons are missing');
    assert(await appLinks.allTextContents().then(values => values.every(text => !text.trim())), 'Header icons have visible text');
    assert(await tab.locator('.header-app-link[aria-label="CertiTube"] + .header-app-link[aria-label="CertiChat"] + [data-search-open]').count() === 1, 'CertiChat is not between CertiTube and Search');
    assert(await tab.locator('.header-app-link[aria-label="CertiChat"]').getAttribute('href') === '/certitips/certichat/' && (await tab.locator('.header-app-link[aria-label="CertiChat"] use').getAttribute('href')).endsWith('certichat-brain.svg#certichat-brain'), 'CertiChat header link does not reuse the graph action');
    assert(await tab.locator('.hero-actions .certiquiz-link + .certitube-link').count() === 1, 'Home button is not after CertiQuiz');
    const homeButtons = await tab.locator('.hero-actions').evaluate(row => [...row.children].map(link => ({ label: link.textContent.trim(), left: link.getBoundingClientRect().left })));
    assert(homeButtons[2].left > homeButtons[1].left, 'CertiTube is not to the right of CertiQuiz on desktop');
    await tab.locator('.hero-actions .certitube-link').click();
    await tab.waitForURL(`${base}certitube/`);
    await readyPlayer(); assert(await lastSeek() === undefined, 'Default entry auto-started');
    assert(await tab.locator('#course-navigation, .menu-toggle').count() === 0, 'Removed fixed menu remains');
    const videoOrder = await tab.locator('.tube-videos a').evaluateAll(links => links.map(link => link.pathname.split('/').filter(Boolean).at(-1)));
    assert(JSON.stringify(videoOrder) === JSON.stringify(['Ha74VhpQwQo','MWASexQNDVU','Wf5fisusQOc','2qdNyl76opY','ZjfQUwUdpbI']), 'Video carousel is not in the requested order');
    assert(await tab.locator('#tube-search, .tube-video, .tube-player-actions, .tube-meta, .page-lead').count() === 0, 'Removed library or introductory blocks remain');
    assert(await tab.locator('.page-heading, #course-navigation .sidebar-heading, #caso-de-uso, #capitulos').count() === 0, 'Removed titles or long chapter list remain');
    assert(await tab.locator('h2#resumen').textContent() === 'Resumen', 'Summary heading differs');
    assert(await tab.locator('.tube-summary > p').count() === 2, 'The opening question is not its own paragraph');
    const videoBlocks = await tab.evaluate(() => {
      const player = document.querySelector('.tube-player'), videos = document.querySelector('.tube-videos');
      const title = getComputedStyle(videos.querySelector('header strong')), chatTitle = getComputedStyle(document.querySelector('#certichat-title'));
      return { player: player.getBoundingClientRect().toJSON(), videos: videos.getBoundingClientRect().toJSON(), image: videos.querySelector('img').getBoundingClientRect().toJSON(), border: getComputedStyle(videos).borderTopWidth, radius: getComputedStyle(videos).borderRadius, playerRadius: getComputedStyle(player).borderRadius, titleMatches: ['fontSize','fontWeight','letterSpacing','lineHeight'].every(key => title[key] === chatTitle[key]) };
    });
    assert(Math.abs(videoBlocks.player.height - videoBlocks.videos.height) < 1 && Math.abs(videoBlocks.player.top - videoBlocks.videos.top) < 1, 'Video playlist does not align with the player height');
    assert(videoBlocks.border === '4px' && videoBlocks.radius === videoBlocks.playerRadius, 'Video playlist does not match the player card');
    assert(videoBlocks.videos.width > 300 && videoBlocks.image.width > 120 && videoBlocks.player.width < 876, 'Wider videoteca/larger thumbnails did not reduce the player width');
    assert(videoBlocks.titleMatches && await tab.locator('.tube-videos header strong').textContent() === 'CertiTube' && await tab.locator('.tube-videos header small').textContent() === 'VIDEOTECA', 'Videoteca heading does not match the shared CertiChat format');
    assert(await tab.locator('.tube-heading small').textContent() === 'CERTITUBE', 'Player heading still repeats the channel');
    assert(await tab.locator('.tube-videos li small').count() === 0, 'Playlist repeats ordinal/channel metadata');
    const playlistTitle = tab.locator('.tube-videos li').nth(1).locator('strong');
    assert(await playlistTitle.evaluate(node => getComputedStyle(node).webkitLineClamp === '3' && node.clientHeight <= 3 * parseFloat(getComputedStyle(node).lineHeight) + 1 && node.closest('a').title === node.textContent), 'Playlist names exceed three lines or lose their full title');
    const playlistCard = tab.locator('.tube-videos li').nth(1).locator('a');
    const beforeHover = await playlistCard.evaluate(node => ({background: getComputedStyle(node).backgroundColor, border: getComputedStyle(node).borderTopColor}));
    assert(beforeHover.border === 'rgba(0, 0, 0, 0)', 'Playlist default border is visible');
    await playlistCard.hover();
    assert(await playlistCard.evaluate((node, background) => getComputedStyle(node).borderTopColor === getComputedStyle(document.querySelector('.brand-accent')).color && getComputedStyle(node).backgroundColor === background, beforeHover.background), 'Playlist hover changes the background or uses a non-red border');
    assert(await tab.locator('.tube-resources h2#recursos-relacionados').textContent() === 'Recursos relacionados', 'Resource heading differs');
    assert(await tab.locator('[data-tube-description]:visible').count() === 1, 'Default chapter description is missing or duplicated');
    assert(await tab.locator('[data-tube-player][data-video-id="Ha74VhpQwQo"]').count() === 1, 'Entry does not show the latest incorporated video');
    assert(await tab.locator('[data-progress], [data-mark-complete]').count() === 0, 'Video navigation shows progress');
    await tab.goto(`${base}1Z0-1085-26/overview/`);
    phase = 'course chat motion';
    await tab.emulateMedia({ reducedMotion: 'no-preference' });
    const closedRight = await tab.locator('#main').evaluate(main => main.getBoundingClientRect().right);
    const transition = await tab.locator('#main').evaluate(main => getComputedStyle(main).transitionDuration);
    assert(transition.includes('0.36s'), 'Course content has no smooth accommodation');
    await tab.locator('[data-chat-open]').click(); await chatReady();
    await tab.waitForFunction(() => document.querySelector('#main').getBoundingClientRect().right < document.querySelector('#certichat-panel').getBoundingClientRect().left);
    await tab.waitForFunction(() => Math.abs(parseFloat(getComputedStyle(document.querySelector('#main')).marginRight) - (Math.min(420, innerWidth * .3) + 40)) < .1);
    const openRight = await tab.locator('#main').evaluate(main => main.getBoundingClientRect().right);
    assert(openRight < closedRight - 100, 'Course content did not accommodate chat');
    await tab.locator('[data-chat-close]').evaluate(button => button.click());
    await tab.waitForFunction(() => document.querySelector('#certichat-panel').hidden);
    const frames = await tab.evaluate(async () => {
      const values = [];
      for (let i = 0; i < 6; i++) { await new Promise(requestAnimationFrame); values.push(document.querySelector('#main').getBoundingClientRect().right); }
      return values;
    });
    assert(frames.some(right => right > openRight + 1 && right < closedRight - 1), 'Course layout jumps instead of animating');
    await tab.waitForFunction(right => Math.abs(document.querySelector('#main').getBoundingClientRect().right - right) < .1, closedRight);
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    assert(await tab.locator('#main').evaluate(main => getComputedStyle(main).transitionDuration) === '0s', 'Reduced motion is ignored');
    await tab.emulateMedia({ reducedMotion: 'no-preference' });
    await tab.goto(`${base}certitube/`);
    phase = 'content search';
    assert(corpusRequests === 0, 'Search content was not loaded lazily');
    await tab.locator('[data-search-open]').click();
    assert(await tab.locator('#site-search [data-search-kind="certification"]').first().isVisible(), 'Default course listing was lost');
    assert(await tab.locator('#site-search [data-search-kind="video"]').first().isVisible(), 'Default listing omits video');
    await tab.locator('#search-query').fill('precipitaciones');
    releaseCorpus();
    await tab.waitForFunction(() => document.querySelector('#site-search').getAttribute('aria-busy') === 'false');
    const wallet = tab.locator(`#site-search a[href="/certitips/${path}#t-61"]`);
    assert(await wallet.isVisible(), 'Real video content is not searchable');
    assert((await wallet.innerText()).includes('precipitaciones'), 'Result does not explain the content match');
    assert(await wallet.locator('use').getAttribute('href') === '/certitips/assets/icons/certitube.svg#certitube', 'Video result has the wrong icon');
    assert(await wallet.locator('svg').evaluate(svg => svg.getBBox().width > 0), 'Video SVG is empty');
    await tab.locator('#search-query').fill("god's eye pltaform");
    assert(await tab.locator(`#site-search a[href="/certitips/${path}"]`).isVisible(), 'Typo-tolerant video search failed');
    await tab.locator('#search-query').fill('agrupaciones hardware');
    assert(await tab.locator('#site-search a[href$="/oci-architecture/#regiones-y-dominios-de-fallo"]').isVisible(), 'Real course Markdown is not searchable');
    await tab.locator('#search-query').fill('zxzsincoincidencias');
    assert(await tab.locator('[data-search-empty]').isVisible(), 'No-result state failed');
    await tab.locator('#search-query').fill('28 publicaciones');
    assert(await tab.locator(`#site-search a[href="/certitips/${path}#t-243"]`).isVisible(), 'Temporal section search failed');
    await tab.keyboard.press('ArrowDown'); await tab.keyboard.press('Enter');
    await tab.waitForURL(`${base}${path}#t-243`); await readyPlayer();
    assert(await lastSeek() === 243, 'Keyboard search result lost its time');
    failCorpus = true; await tab.reload();
    await tab.locator('[data-search-open]').click();
    await tab.waitForFunction(() => !document.querySelector('#search-count').classList.contains('visually-hidden'));
    assert((await tab.locator('#search-count').innerText()).includes('reintentar'), 'Content failure has no retry guidance');
    await tab.locator('#search-query').fill("God's Eye");
    assert(await tab.locator(`#site-search a[href="/certitips/${path}"]`).isVisible(), 'Content failure removed metadata search');
    await tab.keyboard.press('Escape');
    failCorpus = false; await tab.locator('[data-search-open]').click();
    await tab.waitForFunction(() => document.querySelector('#site-search').getAttribute('aria-busy') === 'false' && document.querySelector('#search-count').classList.contains('visually-hidden'));
    await tab.locator('#search-query').fill('precipitaciones'); assert(await wallet.isVisible(), 'Search retry failed');
    const loadedRequests = corpusRequests;
    await tab.keyboard.press('Escape'); await tab.locator('[data-search-open]').click(); await tab.keyboard.press('Escape');
    assert(corpusRequests === loadedRequests, 'Search content reloads on every query/open');
    checks.push('latest video entry, retained hero buttons + header icons, ordered responsive carousel, shared smooth chat layout and reduced motion');
    checks.push('course + video listing, real Markdown snippets/anchors, typo/accent handling, SVG, keyboard, loading race and failed fetch/retry');

    await tab.locator('[data-chat-open]').click(); await chatReady();
    const currentVideo = await tab.locator('.tube-videos a[aria-current="page"]').getAttribute('href');
    const alternateHref = await tab.locator('.tube-videos a').evaluateAll((links, current) => links.find(link => link.getAttribute('href') !== current)?.getAttribute('href'), currentVideo);
    assert(alternateHref, 'No alternate video is available for CertiTube navigation');
    await tab.locator(`.tube-videos a[href="${alternateHref}"]`).click(); await tab.waitForURL(new URL(alternateHref, origin).href); await readyPlayer(); await chatReady();
    assert(await tab.locator('#main').evaluate(main => getComputedStyle(main).transitionProperty === 'none'), 'CertiTube shifts smoothly while CertiChat is open');
    const input = tab.getByRole('textbox', { name: 'Escribe tu consulta' });
    await input.fill('¿Cómo me conecto a la instancia?'); await input.press('Enter');
    const reference = tab.locator(`deep-chat a[href="/certitips/${path}#t-243"]`);
    await reference.waitFor(); await reference.click();
    await tab.waitForURL(`${base}${path}#t-243`); await chatReady();
    assert(await tab.locator('#certichat-panel').isVisible(), 'Chat did not stay open');
    assert((await tab.locator('deep-chat').evaluate(chat => chat.getMessages())).length === 2, 'Conversation was lost');
    await readyPlayer(); assert(await lastSeek() === 243, 'Chat citation did not request its time');
    assert(await tab.locator('.tube-videos a[aria-current="page"]').getAttribute('href') === `/certitips/${path}`, 'Selected video missing from carousel');
    assert(await tab.locator('h1').count() === 1, 'Video title is duplicated');
    assert(await tab.locator('#tube-youtube').count() === 1, 'More than one player');
    checks.push('chat answer → same-tab citation → preserved conversation and requested second');

    const before = await tab.evaluate(() => window.__tube.calls.length);
    await tab.locator(`deep-chat a[href="/certitips/${path}#t-243"]`).click();
    assert(await tab.evaluate(() => window.__tube.calls.length) > before && await lastSeek() === 243, 'Repeated chat citation did not seek');
    await tab.locator('[data-chat-close]').click();
    await tab.locator('[data-tube-time="32"]').click(); assert(await lastSeek() === 32, 'Chapter navigation failed');
    assert(await tab.locator('[data-tube-description="32"]').isVisible(), 'Chapter selection does not show its description');
    assert(await tab.locator('[data-tube-description]:visible').count() === 1, 'Previous chapter description remains visible');
    await tab.goBack(); assert(await lastSeek() === 243, 'Back did not restore time');
    await tab.goForward(); assert(await lastSeek() === 32, 'Forward did not restore time');
    await tab.locator('[data-tube-time="32"]').focus(); await tab.keyboard.press('Enter');
    assert(await lastSeek() === 32, 'Keyboard chapter control failed');
    await tab.goto(`${base}${path}#t-32`);
    await tab.reload();
    await tab.waitForFunction(() => window.__tube);
    await tab.waitForFunction(() => {
      const top = document.querySelector('[data-tube-player]').getBoundingClientRect().top;
      return top >= 0 && top <= 180;
    });
    await tab.locator('[data-tube-time="243"]').click();
    assert(await lastSeek() === undefined, 'Playback occurred before ready');
    await readyPlayer(); assert(await lastSeek() === 243, 'Ready lost the latest selected time');
    await tab.evaluate(() => window.__tube.options.events.onAutoplayBlocked());
    assert((await tab.locator('[data-tube-status]').innerText()).includes('Pulsa'), 'Autoplay failure is not actionable');
    assert(await tab.locator('[data-tube-external]').isHidden(), 'Normal playback shows an external action block');
    assert(await lastSeek() === 243, 'Blocked autoplay lost the selected time');
    await tab.evaluate(() => window.__tube.options.events.onStateChange({ data: 1 }));
    assert(await tab.locator('[data-tube-status]').isHidden(), 'Playback leaves a status/action block');
    checks.push('repeated click, keyboard, back/forward, delayed readiness and autoplay recovery');

    phase = 'automatic chapters';
    const scrollBeforePlayback = await tab.evaluate(() => scrollY), hashBeforePlayback = await tab.evaluate(() => location.hash);
    const callsBeforePlayback = await tab.evaluate(() => window.__tube.calls.length);
    for (const [time, expected] of [[13.9, '0'], [14, '14'], [32, '32'], [60.9, '32'], [61, '61'], [242.9, '223'], [243, '243'], [40, '32']]) {
      await tab.evaluate(time => { window.__tube.time = time; window.__tube.state = 1; }, time);
      await tab.waitForFunction(seconds => document.querySelector('[data-tube-player]').dataset.activeMoment === seconds, expected);
      assert(await tab.locator(`[data-tube-time="${expected}"]`).getAttribute('aria-current') === 'true', 'Playback did not mark its chapter');
      assert(await tab.locator(`[data-tube-description="${expected}"]`).isVisible(), 'Playback did not replace its description');
      assert(await tab.evaluate(() => scrollY) === scrollBeforePlayback, 'Playback moved the page');
    }
    assert(await tab.evaluate(() => location.hash) === hashBeforePlayback, 'Automatic chapters polluted navigation history');
    assert(await tab.evaluate(() => window.__tube.calls.length) === callsBeforePlayback, 'Chapter tracking seeks or restarts the video');
    await tab.evaluate(() => { window.__tube.time = 243; window.__tube.state = 2; window.__tube.options.events.onStateChange({ data: 2 }); });
    checks.push('native playback/seek follows exact chapter boundaries and descriptions without scrolling the page, restarting or changing history');

    for (const width of [1280, 820, 390, 320]) {
      phase = `geometry ${width}`;
      await tab.setViewportSize({ width, height: 844 });
      await tab.locator('[data-chat-open]').click(); await chatReady();
      await tab.locator(`deep-chat a[href="/certitips/${path}#t-243"]`).click();
      await tab.waitForFunction(() => {
        const video = document.querySelector('.tube-screen').getBoundingClientRect(), chat = document.querySelector('#certichat-panel').getBoundingClientRect();
        return innerWidth <= 800 ? video.bottom <= chat.top : video.right <= chat.left;
      });
      const geometry = await tab.evaluate(() => {
        const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { width: r.width, height: r.height, top: r.top, bottom: r.bottom }; };
        return { player: rect('#tube-youtube'), panel: rect('#certichat-panel'), visible: getComputedStyle(document.querySelector('#main')).visibility, overflow: document.documentElement.scrollWidth - innerWidth };
      });
      assert(geometry.player.width >= 200 && geometry.player.height >= 199 && geometry.player.top >= 0, `Player clipped at ${width}: ${JSON.stringify(geometry)}`);
      assert(geometry.overflow <= 1 && geometry.visible === 'visible', `Page hidden or overflowing at ${width}`);
      assert(geometry.panel.bottom <= 844, `Chat escapes viewport at ${width}`);
      const strip = await tab.locator('.tube-chapters').evaluate(nav => ({ height: nav.getBoundingClientRect().height, top: nav.getBoundingClientRect().top, summaryTop: document.querySelector('.tube-summary').getBoundingClientRect().top, summaryBottom: document.querySelector('.tube-summary').getBoundingClientRect().bottom, screenBottom: document.querySelector('.tube-screen').getBoundingClientRect().bottom, rows: new Set([...nav.querySelectorAll('a')].map(a => a.getBoundingClientRect().top)).size }));
      assert(strip.rows === 1 && strip.height < 55 && Math.abs(strip.top - strip.summaryBottom) < 1 && Math.abs(strip.summaryTop - strip.screenBottom) < 1, 'Summary and chapter row are not attached below the video');
      assert(await tab.locator('[data-tube-time="243"]').getAttribute('aria-current') === 'true', 'Selected chapter is not marked');
      if (width === 390) {
        await tab.evaluate(() => {
          Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => 400 });
          Object.defineProperty(visualViewport, 'offsetTop', { configurable: true, get: () => 80 });
          visualViewport.dispatchEvent(new Event('resize'));
        });
        await tab.waitForFunction(() => {
          const panel = document.querySelector('#certichat-panel').getBoundingClientRect();
          return panel.top >= 80 && panel.bottom <= 480;
        });
        await tab.evaluate(() => {
          delete visualViewport.height; delete visualViewport.offsetTop;
          visualViewport.dispatchEvent(new Event('resize'));
        });
      }
      await tab.locator('[data-chat-close]').click();
    }
    checks.push('320/390/820/1280 layouts: visible player, accessible chat, simulated keyboard and no horizontal overflow');

    phase = 'player errors';
    for (const code of [100, 101, 150]) {
      await tab.goto(`${base}${path}#t-243`); await tab.reload(); await readyPlayer();
      await tab.evaluate(code => window.__tube.options.events.onError({ data: code }), code);
      assert(await tab.locator('[data-tube-external]').isVisible(), `No external recovery for ${code}`);
      assert((await tab.locator('[data-tube-external]').getAttribute('href')).endsWith('&t=243s'), `Fallback lost time for ${code}`);
    }
    for (const hash of ['', '#t-333', '#t--1', '#t-450']) {
      await tab.goto(`${base}${path}${hash}`); await tab.reload(); await readyPlayer();
      assert(await lastSeek() === undefined, `Invalid/unselected time auto-started: ${hash}`);
    }
    await tab.goto(`${base}${path}#network-failure`);
    await tab.reload();
    await tab.locator('[data-tube-external]').waitFor({ state: 'visible' });
    await tab.locator('[data-tube-time="243"]').click();
    assert((await tab.locator('[data-tube-external]').getAttribute('href')).endsWith('&t=243s'), 'Network failure lost selected fallback');
    checks.push('deleted/disabled video, missing and invalid fragments, network failure');
    phase = 'header icons';
    for (const width of [1992, 1422, 1361, 1360, 1280, 1210, 1206, 1174, 820, 601, 600, 525, 481, 480, 390, 320]) {
      await tab.setViewportSize({ width, height: 844 });
      await tab.goto(`${base}1Z0-1085-26/overview/`);
      await tab.mouse.move(0, 0);
      const header = await tab.locator('.site-header').evaluate(node => {
        const controls = [...node.children].filter(child => getComputedStyle(child).display !== 'none');
        const boxes = controls.map(child => child.getBoundingClientRect().toJSON());
        const brandText = node.querySelector('.brand > span');
        if (getComputedStyle(brandText).display !== 'none') boxes[0].right = Math.max(boxes[0].right, brandText.getBoundingClientRect().right);
        const apps = [...node.querySelectorAll('.header-app-link')].map(link => ({ label: link.getAttribute('aria-label'), title: link.title, text: link.textContent.trim(), width: link.getBoundingClientRect().width, height: link.getBoundingClientRect().height }));
        const menu = getComputedStyle(node.querySelector('.menu-toggle')), app = getComputedStyle(node.querySelector('.header-app-link'));
        const menuMatches = ['borderTopColor', 'borderTopWidth', 'borderRadius', 'padding'].every(key => menu[key] === app[key]) && (node.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'true' || menu.backgroundColor === app.backgroundColor);
        return { apps, menuMatches, compactGroups: getComputedStyle(node.querySelector('.path-nav')).display === 'none' && getComputedStyle(node.querySelector('.path-nav-mobile')).display !== 'none', overflow: document.documentElement.scrollWidth - innerWidth, overlap: boxes.some((box, i) => i && box.left < boxes[i - 1].right - 1), right: boxes.at(-1).right, viewport: innerWidth };
      });
      assert(header.overflow <= 1 && !header.overlap && header.right <= header.viewport, `Header does not fit at ${width}: ${JSON.stringify(header)}`);
      assert(header.apps.every(app => app.label && app.title && !app.text && app.width === app.height), `Header buttons are not accessible square icons at ${width}`);
      assert(header.menuMatches, `Menu format differs from the adjacent app icon at ${width}`);
      assert(header.compactGroups === (width <= 1360), `Course groups switch too late at ${width}`);
    }
    checks.push('square accessible header icons; course groups collapse at 1360px; brand text and controls do not overlap at sixteen widths');
    phase = 'complete course-menu folding';
    await tab.setViewportSize({width:1355,height:900});
    await tab.evaluate(() => sessionStorage.removeItem('certitips:course-nav:compact'));
    await tab.goto(`${base}1Z0-1085-26/overview/`);
    const courseToggle = tab.locator('.menu-toggle'), courseSidebar = tab.locator('#course-navigation');
    assert(await courseToggle.getAttribute('aria-expanded') === 'true' && await courseSidebar.isVisible(), 'Course menu is not expanded by default');
    assert(await tab.locator('#main').evaluate(main => getComputedStyle(main).backdropFilter.includes('blur')), 'Course content lacks the requested glass treatment');
    await tab.locator('.path-nav-mobile > summary').click();
    await tab.waitForFunction(() => document.querySelector('.path-nav-mobile').open && document.body.classList.contains('is-compact-nav') && getComputedStyle(document.querySelector('#course-navigation')).visibility === 'hidden');
    const courseMotion = await tab.evaluate(() => ({ sidebar: getComputedStyle(document.querySelector('#course-navigation')).transitionProperty, main: getComputedStyle(document.querySelector('#main')).transitionProperty }));
    assert(courseMotion.sidebar.includes('transform') && courseMotion.main.includes('margin-left') && courseMotion.main.includes('margin-right'), `Course menu does not transition smoothly: ${JSON.stringify(courseMotion)}`);
    await courseToggle.click(); await courseSidebar.waitFor({state:'visible'});
    await tab.locator('#main').click();
    await tab.waitForFunction(() => document.body.classList.contains('is-compact-nav') && getComputedStyle(document.querySelector('#course-navigation')).visibility === 'hidden');
    await courseToggle.click(); await courseSidebar.waitFor({state:'visible'});
    checks.push('course menu starts expanded, groups or content fold it, and the sidebar/content transitions are smooth');
    await tab.setViewportSize({width:1671,height:900}); await tab.goto(`${base}1Z0-1085-26/overview/`);
    await tab.locator('#main').click();
    assert(await tab.locator('body').evaluate(body => !body.classList.contains('is-compact-nav')) && await courseSidebar.isVisible(), 'Wide course content click unexpectedly folds the menu');
    await tab.goto(`${base}1Z0-1085-26/oci-architecture/`);
    const lessonReading = await tab.locator('#main').evaluate(main => {
      const heading = document.querySelector('.page-heading.lesson-heading'), prose = document.querySelector('.prose');
      const mainBox = main.getBoundingClientRect(), headingBox = heading.getBoundingClientRect(), proseBox = prose.getBoundingClientRect(), style = getComputedStyle(main);
      const centered = box => Math.abs(box.left + box.width / 2 - (mainBox.left + mainBox.width / 2)) < 1;
      return {mainWidth:mainBox.width, headingWidth:headingBox.width, proseWidth:proseBox.width, centered: centered(headingBox) && centered(proseBox), glass:{backgroundImage:style.backgroundImage, backdropFilter:style.backdropFilter, borderRadius:style.borderRadius, borderTopWidth:style.borderTopWidth, boxShadow:style.boxShadow}};
    });
    assert(Math.abs(lessonReading.mainWidth - 980) < 1 && Math.abs(lessonReading.headingWidth - 900) < 1 && Math.abs(lessonReading.proseWidth - 900) < 1 && lessonReading.centered, `Whole lesson does not use the 900px centered reading width: ${JSON.stringify(lessonReading)}`);
    assert(lessonReading.glass.backgroundImage !== 'none' && lessonReading.glass.backdropFilter.includes('blur') && lessonReading.glass.borderRadius === '16px' && lessonReading.glass.borderTopWidth === '0px' && lessonReading.glass.boxShadow !== 'none', `Course glass is not visible or has an unwanted border: ${JSON.stringify(lessonReading.glass)}`);
    assert(await tab.evaluate(() => {
      const sidebar = document.querySelector('#course-navigation').getBoundingClientRect(), main = document.querySelector('#main').getBoundingClientRect();
      return Math.abs(sidebar.width - 272) < 1 && sidebar.left > 0 && Math.abs(main.left - sidebar.right - 24) < 2;
    }), 'Desktop sidebar does not keep its previous width or sit 24px before the reading frame');
    const courseChrome = await tab.evaluate(() => {
      const sidebar = document.querySelector('#course-navigation'), title = sidebar.querySelector('.sidebar-heading strong'), brand = document.querySelector('.site-header .brand'), footer = document.querySelector('.site-footer');
      const sidebarColor = getComputedStyle(sidebar).backgroundColor, gutter = getComputedStyle(document.body).backgroundImage;
      return {brandOffset: brand.getBoundingClientRect().left - title.getBoundingClientRect().left, footerLeft: footer.getBoundingClientRect().left, footerRight: footer.getBoundingClientRect().right, viewport: innerWidth, gutterMatchesSidebar: gutter.includes(sidebarColor)};
    });
    assert(Math.abs(courseChrome.brandOffset) < 1, `Brand does not align with the course title: ${JSON.stringify(courseChrome)}`);
    assert(courseChrome.footerLeft === 0 && Math.abs(courseChrome.footerRight - courseChrome.viewport) < 1, `Course footer does not cover the viewport: ${JSON.stringify(courseChrome)}`);
    assert(courseChrome.gutterMatchesSidebar, 'The left gutter does not use the sidebar reference color');
    for (const width of [1556,1280,1158,801,800,678,320]) {
      await tab.setViewportSize({width,height:900}); await tab.goto(`${base}1Z0-1085-26/overview/`);
      const toggle = tab.locator('.menu-toggle'), sidebar = tab.locator('#course-navigation');
      const expanded = await toggle.getAttribute('aria-expanded') === 'true';
      await toggle.click();
      if (expanded) await sidebar.waitFor({state:'hidden'}); else await sidebar.waitFor({state:'visible'});
      assert(await toggle.isVisible() && await toggle.evaluate(button => button.parentElement.matches('.site-header')) && await toggle.getAttribute('aria-expanded') === String(!expanded), `Course toggle moved or disappeared at ${width}`);
      await toggle.click();
      if (expanded) await sidebar.waitFor({state:'visible'}); else await sidebar.waitFor({state:'hidden'});
      assert(await toggle.getAttribute('aria-expanded') === String(expanded), `Second click did not restore the menu at ${width}`);
    }
    await tab.setViewportSize({width:1158,height:900}); await tab.goto(`${base}1Z0-1085-26/overview/`);
    await tab.locator('.menu-toggle').click();
    await tab.waitForFunction(() => {
      const expectedLeft = Math.max(0, (innerWidth - 980) / 2);
      return getComputedStyle(document.querySelector('#course-navigation')).visibility === 'hidden' && Math.abs(parseFloat(getComputedStyle(document.querySelector('#main')).marginLeft) - expectedLeft) < 1;
    });
    await tab.goto(`${base}1Z0-1085-26/oci-architecture/`);
    assert(await tab.locator('#course-navigation').isHidden() && await tab.locator('.site-header > .menu-toggle').isVisible(), 'Fully folded menu did not persist across lessons');
    await tab.locator('.menu-toggle').click(); await tab.locator('#course-navigation').waitFor({state:'visible'});
    checks.push('course menu folds completely, keeps its header button, toggles twice at seven desktop/mobile widths and persists across lessons');
    phase = 'unsegmented player';
    await tab.setViewportSize({ width: 1174, height: 600 });
    await tab.goto(`${base}certitube/MWASexQNDVU/#t-0`); await readyPlayer();
    assert(await lastSeek() === 0 && await tab.locator('.tube-chapters').isHidden() && await tab.locator('.tube-description').isHidden(), 'Unsegmented video lost its citation or still repeats the summary');
    await tab.locator('[data-chat-open]').click(); await chatReady();
    await tab.waitForFunction(() => document.querySelector('.tube-player').getBoundingClientRect().right <= document.querySelector('#certichat-panel').getBoundingClientRect().left);
    const playerLayout = await tab.evaluate(() => {
      const player = document.querySelector('.tube-player'), chat = document.querySelector('#certichat-panel'), summary = document.querySelector('.tube-summary'), menu = getComputedStyle(document.querySelector('.path-nav-mobile > summary')), app = getComputedStyle(document.querySelector('.header-app-link'));
      const message = document.querySelector('deep-chat').shadowRoot.querySelector('.ai-message');
      const resources = document.querySelector('.tube-resources');
      return { height: player.clientHeight, chatHeight: chat.clientHeight, stickySummaryTitle: getComputedStyle(summary.querySelector('h2')).position === 'sticky', summaryGrows: getComputedStyle(summary).flexGrow === '1' && getComputedStyle(summary).maxHeight === 'none', resourcesFollowSummary: getComputedStyle(resources).flexGrow === '0', menuMatches: ['backgroundColor','borderTopColor','borderTopWidth','borderRadius','padding','width','height'].every(key => menu[key] === app[key]), bubbleMatches: getComputedStyle(message).backgroundColor === getComputedStyle(document.querySelector('.tube-videos a')).backgroundColor, punctuation: [...resources.querySelectorAll('li')].every(row => row.textContent.trim() === row.querySelector('a').textContent) };
    });
    assert(Math.abs(playerLayout.height - playerLayout.chatHeight) < 1 && playerLayout.stickySummaryTitle && playerLayout.summaryGrows && playerLayout.resourcesFollowSummary && playerLayout.menuMatches && playerLayout.bubbleMatches && playerLayout.punctuation, `Player/menu/resource layout mismatch: ${JSON.stringify(playerLayout)}`);
    const summary = tab.locator('.tube-summary');
    await summary.evaluate(node => node.scrollTop = node.scrollHeight);
    assert(await summary.evaluate(node => node.scrollTop) > 0, 'Summary cannot scroll vertically');
    await tab.locator('[data-chat-close]').click();
    await tab.setViewportSize({ width: 1280, height: 900 });
    await tab.goto(`${base}certitube/MWASexQNDVU/#t-0`); await readyPlayer();
    const unsegmentedSpace = await tab.evaluate(() => {
      const player = document.querySelector('.tube-player'), summary = document.querySelector('.tube-summary'), resources = document.querySelector('.tube-resources');
      return {summaryOverflow: summary.scrollHeight - summary.clientHeight, resourcesAtBottom: Math.abs(resources.getBoundingClientRect().bottom - player.getBoundingClientRect().bottom + 1) < 1};
    });
    assert(unsegmentedSpace.summaryOverflow < 2 && unsegmentedSpace.resourcesAtBottom, `Unsegmented summary scrolls despite available resources space: ${JSON.stringify(unsegmentedSpace)}`);
    await tab.goto(`${base}certitube/ZjfQUwUdpbI/#t-30`); await readyPlayer();
    assert(await tab.locator('.tube-chapter-title').nth(1).evaluate(item => getComputedStyle(item).textTransform === 'none' && item.textContent === 'OCI Deploy Studio y selección del proyecto'), 'Chapter names do not preserve their Markdown sentence case');
    const compactSummary = await tab.evaluate(() => {
      const player = document.querySelector('.tube-player'), summary = document.querySelector('.tube-summary'), resources = document.querySelector('.tube-resources');
      const box = summary.getBoundingClientRect(), last = summary.lastElementChild.getBoundingClientRect();
      return { outline: getComputedStyle(player).outlineStyle, extraSummarySpace: box.bottom - last.bottom - parseFloat(getComputedStyle(summary).paddingBottom), resourceOverflow: resources.scrollHeight - resources.clientHeight, resourcesFill: Math.abs(resources.getBoundingClientRect().bottom - player.getBoundingClientRect().bottom + 1) < 1 };
    });
    assert(compactSummary.outline === 'none' && compactSummary.extraSummarySpace < 2 && compactSummary.resourceOverflow < 2 && compactSummary.resourcesFill, `Citation focus or summary/resources sizing is wrong: ${JSON.stringify(compactSummary)}`);
    await tab.locator('[data-tube-time="30"]').focus();
    await tab.keyboard.press('Tab');
    assert(await tab.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'), 'Removing citation-card outline also removed keyboard focus from controls');
    phase = 'Cognee and CertiQuiz reference geometry';
    const referencePage = await context.newPage();
    await referencePage.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort('blockedbyclient'));
    await referencePage.goto(`${base}certichat/`);
    const quizReference = await context.newPage();
    await quizReference.route('**/*', async route => {
      const request = route.request(), url = request.url();
      if (!url.startsWith(`${origin}/`)) return route.abort('blockedbyclient');
      if (url === `${origin}/api/catalog`) return route.fulfill({json:{courses:[],limits:{}}});
      if (url === `${origin}/api/session`) return route.fulfill({json:{host:false,roomCode:null}});
      if (url.startsWith(`${origin}/api/`)) throw new Error(`Unexpected reference API request: ${url}`);
      if (!request.isNavigationRequest()) return route.continue();
      const response = await route.fetch();
      return route.fulfill({response,body:(await response.text()).replace(/data-api-origin="[^"]*"/, `data-api-origin="${origin}"`)});
    });
    await quizReference.goto(`${base}certiquiz/`);
    await quizReference.locator('.certiquiz-breadcrumb').waitFor();
    const referenceGeometry = [];
    for (const viewport of [{width:2560,height:1004},{width:1992,height:1004},{width:1671,height:1004},{width:1379,height:1004},{width:1280,height:900},{width:1174,height:600},{width:1024,height:900}]) {
      await referencePage.setViewportSize(viewport); await quizReference.setViewportSize(viewport); await tab.setViewportSize(viewport);
      await referencePage.evaluate(() => document.fonts.ready);
      await quizReference.evaluate(() => document.fonts.ready);
      const reference = await referencePage.locator('#conocimiento').evaluate(node => node.getBoundingClientRect().toJSON());
      const breadcrumb = await quizReference.locator('.certiquiz-breadcrumb').evaluate(node => node.getBoundingClientRect().toJSON());
      assert(reference.width <= 1200 && Math.abs(breadcrumb.top - reference.top) < 1, `Cognee exceeds the width limit or Quiz starts too low at ${viewport.width}`);
      const roleCards = await quizReference.locator('.role-card').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().toJSON()));
      assert(Math.abs(roleCards[0].top - breadcrumb.bottom - (roleCards[1].left - roleCards[0].right)) < 1, `Quiz vertical/horizontal spacing differs at ${viewport.width}`);
      const destination = `${base}certitube/ZjfQUwUdpbI/#t-30`;
      if (tab.url() === destination) await tab.reload(); else await tab.goto(destination);
      await readyPlayer();
      for (const open of [false, true]) {
        if (await tab.locator('#certichat-panel').isVisible() !== open) await tab.locator(open ? '[data-chat-open]' : '[data-chat-close]').click();
        const expected = {...reference, ...(!open && {left:breadcrumb.left,width:breadcrumb.width})};
        await tab.waitForFunction(expected => {
          const box = document.querySelector('.tube-detail').getBoundingClientRect();
          return ['left','top','width','height'].every(key => Math.abs(box[key] - expected[key]) < 1);
        }, expected, {timeout:5000}).catch(async () => {
          throw new Error(`Reference mismatch: expected ${JSON.stringify(expected)}, actual ${JSON.stringify(await tab.locator('.tube-detail').evaluate(node => ({box:node.getBoundingClientRect().toJSON(), scroll:scrollY, height:innerHeight})))}; open=${open}`);
        });
        if (open) {
          const referenceChat = await referencePage.locator('#certichat-panel').evaluate(node => node.getBoundingClientRect().toJSON());
          assert(await tab.locator('#certichat-panel').evaluate((node, expected) => ['left','top','width','height'].every(key => Math.abs(node.getBoundingClientRect()[key] - expected[key]) < 1), referenceChat), `Chat geometry differs from Cognee at ${viewport.width}`);
        }
      }
      referenceGeometry.push({viewport, closed:{left:breadcrumb.left,width:breadcrumb.width}, open:{left:reference.left,width:reference.width}, top:reference.top,height:reference.height});
      await tab.goto(`${base}1Z0-1085-26/overview/`);
      for (const folded of [false,true]) {
        if (await tab.locator('body').evaluate(body => body.classList.contains('is-compact-nav')) !== folded) await tab.locator('.menu-toggle').click();
        for (const open of [false,true]) {
          if (await tab.locator('#certichat-panel').isVisible() !== open) await tab.locator(open ? '[data-chat-open]' : '[data-chat-close]').click();
          if (open) await chatReady();
          await tab.waitForFunction(() => {
            const main = document.querySelector('#main'), prose = main.querySelector('.prose'), sidebar = document.querySelector('#course-navigation'), chat = document.querySelector('#certichat-panel');
            const box = prose.getBoundingClientRect(), style = getComputedStyle(main), start = getComputedStyle(sidebar).visibility === 'hidden' ? 0 : sidebar.getBoundingClientRect().width;
            const end = document.body.getBoundingClientRect().width - (chat.hidden ? 0 : chat.getBoundingClientRect().width + 40);
            return box.width <= 1200 && Math.abs(box.left + box.width / 2 - ((start + end) / 2 + (parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) / 2)) < 1;
          });
          const reading = await tab.locator('.prose').evaluate(prose => {
            const box = prose.getBoundingClientRect();
            return {left:box.left,width:box.width,filled:[document.querySelector('.page-heading'),prose.querySelector('p'),prose.querySelector('.table-scroll')].every(element => Math.abs(element.getBoundingClientRect().left-box.left)<1 && Math.abs(element.getBoundingClientRect().width-box.width)<1)};
          });
          assert(reading.filled, `Course heading, text and table do not fill the reading width at ${viewport.width}; folded=${folded}, chat=${open}`);
          if (folded && !open) assert(Math.abs(reading.left-breadcrumb.left)<1 && Math.abs(reading.width-breadcrumb.width)<1, `Folded course does not match Quiz standard at ${viewport.width}`);
          if (!open) {
            await tab.evaluate(() => scrollTo(0,document.documentElement.scrollHeight));
            await tab.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            assert(await tab.evaluate(() => {
              const pager=document.querySelector('.page-navigation').getBoundingClientRect(), chat=document.querySelector('.certichat-launcher').getBoundingClientRect();
              return !(chat.left<pager.right && chat.right>pager.left && chat.top<pager.bottom && chat.bottom>pager.top);
            }), `Floating chat covers course navigation at ${viewport.width}; folded=${folded}`);
            await tab.evaluate(() => scrollTo(0,0));
          }
        }
      }
    }
    await referencePage.close(); await quizReference.close();
    checks.push('opaque sharing image; at seven desktop sizes Tube and Cognee cap their content at 1200px, open panels stay aligned/centered, and Quiz breadcrumb starts at Cognee height');
    checks.push('Quiz uses equal vertical/horizontal card spacing; courses match its 1200px reading standard with centered full-width headings/text/tables in four menu/chat states');
    checks.push('unsegmented citations retained without duplicate panels; player height matches chat; summary scrolls; playlist gray matches chat and mobile menu matches app buttons');
    phase = 'chapter arrow reference';
    await tab.setViewportSize({ width: 1280, height: 900 });
    const arrowStyle = selector => tab.locator(selector).evaluate(button => {
      const style = getComputedStyle(button), svg = button.querySelector('svg');
      return { styles: Object.fromEntries(['width', 'height', 'minHeight', 'padding', 'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderRadius', 'backgroundColor', 'color', 'boxShadow'].map(key => [key, style[key]])), svgWidth: getComputedStyle(svg).width, svgHeight: getComputedStyle(svg).height, path: svg.querySelector('path').getAttribute('d') };
    });
    await tab.goto(`${base}certichat/`);
    const referenceArrow = await arrowStyle('[data-graph-scroll="1"]');
    await tab.goto(`${base}${path}`); await readyPlayer();
    await tab.locator('[data-chat-close]').click();
    await tab.locator('[data-tube-time="0"]').click();
    await tab.waitForFunction(() => !document.querySelector('[data-tube-scroll="1"]').disabled);
    assert(JSON.stringify(await arrowStyle('[data-tube-scroll="1"]')) === JSON.stringify(referenceArrow), 'Chapter arrow differs from the Cognee reference');
    await tab.locator('[data-tube-scroll="1"]').click();
    await tab.waitForFunction(() => document.querySelector('.tube-chapter-list').scrollLeft > 4 && !document.querySelector('[data-tube-scroll="-1"]').disabled);
    assert(await tab.locator('[data-tube-scroll="-1"]').isVisible(), 'Previous arrow is not available after scrolling');
    for (let attempt = 0; attempt < 4 && await tab.locator('[data-tube-scroll="-1"]').isVisible(); attempt++) {
      await tab.locator('[data-tube-scroll="-1"]').click();
      await tab.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    await tab.waitForFunction(() => document.querySelector('.tube-chapter-list').scrollLeft <= 4);
    assert(await tab.locator('[data-tube-scroll="-1"]').isHidden(), 'Previous arrow wastes space at the beginning');
    checks.push('chapter arrows match the actual Cognee SVG/styles; both directions scroll and hide at their ends');
    phase = 'card details and transitions';
    assert(await tab.locator('#arquitectura').count() === 0, 'Removed architecture remains');
    assert(await tab.locator('.tube-heading strong').textContent() === "AI Data Platform for God's Eye View", 'Compact card title is wrong');
    assert(await tab.locator('.tube-chapter-title').evaluateAll(items => items.every(item => getComputedStyle(item).textTransform === 'none')), 'Chapter names are transformed instead of retaining Markdown sentence case');
    assert(await tab.locator('.tube-resources li svg').count() === await tab.locator('.tube-resources li').count(), 'Resource links lack the supplied SVG');
    for (const theme of ['light', 'dark']) {
      await tab.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      assert(await tab.locator('.tube-resources ul').evaluate(list => getComputedStyle(list).paddingLeft === '0px' && getComputedStyle(list).listStyleType === 'none'), 'Resources still have indented bullets');
      assert(await tab.locator('.tube-resources a').first().evaluate(link => getComputedStyle(link).color === getComputedStyle(document.querySelector('.tube-heading strong')).color), 'Resource text differs from theme foreground');
      await tab.locator('[data-search-open]').click();
      assert(await tab.locator('.search-result-icon-video').first().evaluate(icon => {
        const swatch = document.createElement('span'); swatch.style.color = 'var(--blue)'; icon.append(swatch);
        const matches = getComputedStyle(icon).backgroundColor === getComputedStyle(swatch).color;
        swatch.remove(); return matches;
      }), 'Video search icon is not blue');
      await tab.keyboard.press('Escape');
    }
    const reduced = await tab.evaluate(() => { document.querySelector('[data-tube-time="32"]').click(); return document.querySelector('.tube-description').getAnimations({ subtree: true }).length; });
    assert(reduced === 0, 'Reduced motion still animates chapter changes');
    await tab.emulateMedia({ reducedMotion: 'no-preference' });
    const samples = await tab.evaluate(async () => {
      const wrapper = document.querySelector('.tube-description');
      const startHeight = wrapper.getBoundingClientRect().height;
      document.querySelector('[data-tube-time="243"]').click();
      const active = wrapper.getAnimations({ subtree: true });
      const target = wrapper.querySelector('[data-tube-description="243"]'), targetHeight = target.getBoundingClientRect().height;
      const samples = [], opacity = [];
      for (let i = 0; i < 8; i++) { await new Promise(requestAnimationFrame); samples.push(wrapper.getBoundingClientRect().height); opacity.push(getComputedStyle(target).opacity); }
      document.querySelector('[data-tube-time="14"]').click();
      const latest = wrapper.getAnimations({ subtree: true });
      await Promise.all(latest.map(animation => animation.finished.catch(() => {})));
      return { active: active.length, startHeight, targetHeight, samples, opacity, latest: document.querySelector('[data-tube-player]').dataset.activeMoment, remaining: wrapper.getAnimations({ subtree: true }).length };
    });
    assert(samples.active === 2 && samples.latest === '14' && samples.remaining === 0 && new Set(samples.opacity).size > 2 && (Math.abs(samples.startHeight - samples.targetHeight) < 1 || new Set(samples.samples).size > 2), `Chapter height/text transition jumps or retains an old animation: ${JSON.stringify(samples)}`);
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    await tab.locator('.tube-videos a').last().click(); await readyPlayer();
    assert(await tab.locator('[data-tube-player]').getAttribute('data-video-id') === 'ZjfQUwUdpbI', 'Carousel cannot open the oldest video');
    assert(await tab.locator('[data-tube-time]').count() === 13, 'Verified migration chapters are missing');
    const previousViewport = tab.viewportSize();
    await tab.setViewportSize({width: 390, height: 844});
    await tab.waitForFunction(() => innerWidth === 390 && document.querySelector('.tube-videos').getBoundingClientRect().top >= document.querySelector('.tube-player').getBoundingClientRect().bottom);
    const longResource = await tab.locator('.tube-resources a').nth(1).evaluate(link => ({ellipsis: getComputedStyle(link).textOverflow, nowrap: getComputedStyle(link).whiteSpace, truncated: link.scrollWidth > link.clientWidth, title: link.title, text: link.textContent}));
    assert(longResource.ellipsis === 'ellipsis' && longResource.nowrap === 'nowrap' && longResource.truncated && longResource.title === longResource.text, 'Long resource link lacks ellipsis or its complete tooltip');
    await tab.setViewportSize(previousViewport);
    await tab.waitForFunction(width => innerWidth === width, previousViewport.width);
    await tab.locator('.tube-videos a').first().click(); await readyPlayer();
    checks.push('compact video header, sentence-case chapters, foreground resource links/SVG, blue search icons, smooth cancellable chapter transitions and reduced motion; ordered carousel navigation');
    phase = 'chat action hover';
    await tab.locator('[data-chat-open]').click(); await chatReady();
    for (const theme of ['light', 'dark']) {
      if ((await tab.locator('html').getAttribute('data-theme') === 'dark') !== (theme === 'dark')) await tab.locator('[data-theme-toggle]').click();
      await tab.locator('[data-theme-toggle]').hover();
      const referenceBorder = await tab.locator('[data-theme-toggle]').evaluate(button => getComputedStyle(button).borderTopColor);
      const referenceColor = await tab.locator('[data-theme-toggle]').evaluate(button => getComputedStyle(button).color);
      await tab.locator('.header-app-link[aria-label="CertiTube"]').hover();
      assert(await tab.locator('.header-app-link[aria-label="CertiTube"]').evaluate(link => getComputedStyle(link).color) === referenceColor, 'Theme icon hover differs from CertiTube');
      for (const button of await tab.locator('.certichat-actions > :is(a, button:enabled):visible').all()) {
        await button.hover();
        assert(await button.evaluate(node => getComputedStyle(node).borderTopColor) === referenceBorder, `Chat action hover differs from the theme border in ${theme}`);
        assert(await button.evaluate(node => getComputedStyle(node.querySelector('svg')).color) === referenceColor, `Chat icon hover differs from CertiTube in ${theme}`);
      }
    }
    checks.push('theme and chat header actions match the CertiTube red border/icon hover in light and dark modes');
    assert(calls.filter(url => url.endsWith('/chat')).length === 1, 'Navigation sent another chat request');
    assert(errors.length === 0, errors.join('\n'));
    return { passed: true, checks, referenceGeometry, paidCalls: 0, screenshots: 0 };
  } catch (error) {
    const state = await tab.evaluate(() => ({ url: location.href, scroll: scrollY, width: innerWidth, boxes: ['.tube-screen', '#certichat-panel'].map(selector => document.querySelector(selector)?.getBoundingClientRect().toJSON()), errors: document.querySelector('[data-tube-status]')?.textContent }));
    throw new Error(`${phase}: ${error.message}\n${JSON.stringify({ state, checks, errors })}`);
  } finally {
    await tab.unrouteAll({ behavior: 'wait' }); await context.close();
  }
}

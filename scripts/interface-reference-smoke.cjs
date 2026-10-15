// playwright-cli -s=interface-reference run-code --filename scripts/interface-reference-smoke.cjs
// DOM checks with a mocked API: local fonts, home cards, launcher placement and chat reading position.
async page => {
  const base = new URL('/certitips/', page.url()), site = 'https://jgangini.github.io/certitips/';
  if (base.origin !== 'http://127.0.0.1:4173') throw new Error('Run against the local preview.');
  const context = await page.context().browser().newContext({ reducedMotion: 'reduce' }), tab = await context.newPage();
  const assert = (value, message, state) => { if (!value) throw new Error(`${message}: ${JSON.stringify(state)}`); };
  const errors = [], samples = [], quota = { remaining: 20 };
  let releaseReply;
  tab.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base.origin) return route.abort();
    if (url.pathname === '/api/chat') {
      await new Promise(resolve => { releaseReply = resolve; });
      return route.fulfill({ json: { answer: 'Respuesta simulada.', sources: [], quota } });
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { mode: 'LOCAL', authenticated: true, available: true, verificationRequired: false, quota } });
    if (!request.isNavigationRequest()) return route.continue();
    const response = await route.fetch();
    return route.fulfill({ response, body: (await response.text()).replace(/(data-api(?:-origin)?=")[^"]*/g, `$1${base.origin}`) });
  });
  const setTheme = async theme => { if ((await tab.locator('html').getAttribute('data-theme') === 'dark') !== (theme === 'dark')) await tab.locator('[data-theme-toggle]').click(); };
  const ready = () => tab.waitForFunction(() => document.querySelector('deep-chat')?.shadowRoot?.querySelector('#messages') && document.querySelector('.certichat-connecting').hidden);
  try {
    for (const width of [320, 474, 758, 801, 810, 1178, 1238, 1383, 1647, 1686, 1992]) for (const theme of ['light', 'dark']) {
      await tab.setViewportSize({ width, height: 1019 }); await tab.goto(base.href); await setTheme(theme);
      await tab.evaluate(() => document.fonts.ready);
      const home = await tab.locator('.hero-copy').evaluate(copy => {
        const cards = [...copy.querySelectorAll('.hero-action')], rect = node => node.getBoundingClientRect().toJSON(), style = node => getComputedStyle(node);
        return { copy: rect(copy), badge: rect(copy.querySelector('.oracle-badge')), badgeColor: style(copy.querySelector('.oracle-badge')).backgroundColor, cardColor: style(cards[0]).backgroundColor, titleFont: style(copy.querySelector('h1')).fontFamily, titleWeight: style(copy.querySelector('h1')).fontWeight, brandFont: style(document.querySelector('.brand')).fontFamily, brandWeight: style(document.querySelector('.brand')).fontWeight, bodyFont: style(copy).fontFamily, labelFont: style(cards[0].querySelector('span')).fontFamily, fonts: [...document.fonts].filter(font => font.status === 'loaded').map(font => font.family), overflow: document.documentElement.scrollWidth - innerWidth,
          cards: cards.map(card => ({ ...rect(card), label: card.querySelector('span').textContent.trim(), description: card.querySelector('strong').textContent, overflow: card.scrollWidth - card.clientWidth, hit: document.elementFromPoint(card.getBoundingClientRect().x + 20, card.getBoundingClientRect().y + 20)?.closest('a') === card, icon: rect(card.querySelector('svg')).width })) };
      });
      assert(home.titleFont === home.brandFont && home.titleWeight === home.brandWeight && home.bodyFont.startsWith('"Didact Gothic"') && home.labelFont.startsWith('"JetBrains Mono"') && home.fonts.length === 2, 'Reference fonts', home);
      if (theme === 'light') assert(home.badgeColor === home.cardColor, 'Light badge and card gray differ', home);
      assert(home.badge.height === 36 && home.overflow <= 1 && home.cards.every(card => card.hit && card.overflow <= 1 && card.icon === 14 && card.description), 'Home card fit', { width, theme, ...home });
      const ambient = await tab.locator('.hero-ambient').evaluate(node => ({ background: getComputedStyle(node).backgroundColor, header: getComputedStyle(document.querySelector('.site-header')).backgroundColor, filter: getComputedStyle(node, '::before').filter }));
      assert(theme === 'light' ? ambient.background === ambient.header && ambient.filter.includes('grayscale(1)') : !ambient.filter.includes('grayscale'), 'Home motion palette follows the theme', ambient);
      assert(home.cards.map(card => card.label).join(',') === 'CertiTips,CertiQuiz,CertiTube', 'Home card order', home.cards);
      assert(home.cards.every(card => card.description.split(' ').every(word => word[0] === word[0].toLocaleUpperCase('es'))), 'Card descriptions use title case', home.cards);
      assert(home.copy.width > 440 ? home.cards.every(card => Math.abs(card.top - home.cards[0].top) < 1) : home.cards.every(card => Math.abs(card.left - home.cards[0].left) < 1 && Math.abs(card.width - home.copy.width) < 1), 'Responsive card layout', home);
      const brandWrap = await tab.locator('.home-hero h1').evaluate(node => {
        const range = document.createRange(), text = node.firstChild;
        range.setStart(text, text.textContent.indexOf('Oracle')); range.setEnd(text, text.length);
        return { lines: range.getClientRects().length, font: parseFloat(getComputedStyle(node).fontSize) };
      });
      assert(brandWrap.lines === 1, 'Oracle AI must stay together in the title', { width, theme, ...brandWrap });
      if (width > 800) {
        const flowWidth = await tab.locator('.hero-flow').evaluate(node => node.getBoundingClientRect().width);
        assert(Math.abs(flowWidth - home.copy.width) < 1, 'Home columns split the available width equally', { flowWidth, copyWidth: home.copy.width });
      }
      for (const card of await tab.locator('.hero-action').all()) {
        const label = card.locator('strong'), normal = await label.evaluate(node => getComputedStyle(node).color);
        await card.hover();
        assert(await label.evaluate(node => getComputedStyle(node).color) === normal, 'Hover changes card description color', { width, theme });
        await card.focus();
        assert(await label.evaluate(node => getComputedStyle(node).color) === normal, 'Focus changes card description color', { width, theme });
      }
      samples.push({ page: 'home', width, theme });
    }
    await setTheme('light'); await tab.emulateMedia({ reducedMotion: 'no-preference' });
    const transform = await tab.locator('.hero-ambient').evaluate(node => getComputedStyle(node, '::before').transform);
    await tab.waitForFunction(previous => getComputedStyle(document.querySelector('.hero-ambient'), '::before').transform !== previous, transform);
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    assert(await tab.locator('.hero-ambient').evaluate(node => getComputedStyle(node, '::before').animationName) === 'none', 'Home effect ignores reduced motion');
    for (const path of ['courses/', 'certitube/', '1Z0-1085-26/overview/', '1Z0-1122-26/practice/']) for (const width of [1992, 1686, 1581, 1556, 1519, 1428, 1344, 1330, 1242, 1238, 1178, 801, 800, 480]) for (const theme of ['light', 'dark']) {
      await tab.setViewportSize({ width, height: 1019 }); await tab.goto(new URL(path, base).href); await setTheme(theme); await tab.mouse.move(0, 0);
      await tab.waitForFunction(() => {
        const root = document.querySelector('[data-certichat]'), button = root.querySelector('[data-chat-open]'), content = document.querySelector('.path-section.is-active, .tube-detail') || document.querySelector('.course-main');
        const expected = innerWidth > 800 && content.getBoundingClientRect().right + button.offsetWidth + 20 + parseFloat(getComputedStyle(root).getPropertyValue('--layout-gap')) <= document.documentElement.clientWidth;
        return root.classList.contains('is-beside-content') === expected;
      });
      const state = await tab.locator('[data-certichat]').evaluate(root => {
        const button = root.querySelector('[data-chat-open]').getBoundingClientRect(), content = (document.querySelector('.path-section.is-active, .tube-detail') || document.querySelector('.course-main')).getBoundingClientRect();
        return { beside: root.classList.contains('is-beside-content'), rightGap: document.documentElement.clientWidth - button.right, overlap: button.left < content.right, bottomGap: content.bottom - button.bottom, width: button.width, overflow: document.documentElement.scrollWidth - innerWidth };
      });
      assert(state.overflow <= 1 && (!state.beside || Math.abs(state.rightGap - 20) < 1 && !state.overlap), 'Launcher uses the free margin', { path, width, theme, ...state });
      if (path === 'certitube/' && state.beside) {
        await tab.waitForFunction(() => Math.abs((document.querySelector('.path-section.is-active, .tube-player').getBoundingClientRect().bottom - document.querySelector('[data-chat-open]').getBoundingClientRect().bottom)) < 1);
      }
      if (path === 'courses/') {
        const gap = await tab.locator('[data-chat-open]').evaluate(button => document.querySelector('.site-footer').getBoundingClientRect().top - button.getBoundingClientRect().bottom);
        assert(Math.abs(gap - 24) < 1, 'Catalog launcher leaves its lower corner', { width, theme, gap });
      }
      if (path === 'certitube/') {
        const resourceLinks = tab.locator('.tube-resources a');
        assert(await resourceLinks.evaluateAll(items => items.length > 0 && items.every(link => link.target === '_blank' && link.rel.includes('noopener') && link.rel.includes('noreferrer'))), 'Tube resources must open a new tab');
        const resource = tab.locator('.tube-resources li').first();
        for (const target of [resource.locator('svg'), resource.locator('a')]) {
          await target.hover();
          assert(await resource.evaluate(node => getComputedStyle(node.querySelector('svg')).color === getComputedStyle(node.querySelector('a')).color && getComputedStyle(node.querySelector('svg')).color === 'rgb(199, 70, 52)'), 'Resource icon and text must hover red together');
        }
        if (width === 1992 && theme === 'light') {
          const original = tab.url(), opened = tab.waitForEvent('popup');
          await resource.locator('a').click();
          const popup = await opened;
          assert(tab.url() === original, 'Opening a resource replaced the video page');
          await popup.close();
        }
        const selected = tab.locator('.tube-videos a[aria-current="page"]');
        const palette = await selected.evaluate(node => {
          const style = getComputedStyle(node), neutral = getComputedStyle(document.querySelector('.tube-videos a:not([aria-current])'));
          return { background: style.backgroundColor, color: style.color, border: style.borderColor, neutralBackground: neutral.backgroundColor, neutralColor: neutral.color };
        });
        assert(palette.background === palette.neutralBackground && palette.color === palette.neutralColor && palette.border === 'rgb(199, 70, 52)', 'Only the selected video border is red', palette);
        await selected.hover(); await selected.focus();
        assert(await selected.evaluate(node => getComputedStyle(node).color) === palette.color, 'Selected video changes text on focus');
        if (!state.beside && width > 1000) {
          const fit = await tab.locator('.tube-videos').evaluate(library => {
            const box = library.getBoundingClientRect(), button = document.querySelector('[data-chat-open]').getBoundingClientRect();
            return { gap: button.top - box.bottom, alignment: button.right - box.right };
          });
          assert(Math.abs(fit.gap - 24) < 1 && Math.abs(fit.alignment) < 1, 'Tube launcher must sit below the library with a 24px gap', { width, theme, ...fit });
        }
      }
      if (path === '1Z0-1085-26/overview/') {
        await tab.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
        await tab.waitForFunction(() => {
          const root = document.querySelector('[data-certichat]'), button = root.querySelector('[data-chat-open]');
          if (!root.classList.contains('is-beside-content')) return button.style.top === '';
          const b = button.getBoundingClientRect(), last = document.querySelector('.page-navigation a:last-of-type').getBoundingClientRect();
          return Math.abs(b.bottom - last.bottom) < 1;
        });
        if (state.beside) {
          const gap = await tab.locator('.page-navigation a:last-of-type').evaluate(last => document.querySelector('.site-footer').getBoundingClientRect().top - last.getBoundingClientRect().bottom);
          assert(Math.abs(gap - 24) < 1, 'Beside launcher leaves unnecessary space below the pager', { width, theme, gap });
        }
        if (!state.beside) {
          const gap = await tab.locator('[data-chat-open]').evaluate(button => document.querySelector('.site-footer').getBoundingClientRect().top - button.getBoundingClientRect().bottom);
          assert(Math.abs(gap - 24) < 1, 'Narrow launcher leaves its approved corner', { width, theme, gap });
        }
      }
      samples.push({ page: path, width, theme, beside: state.beside });
    }
    await tab.setViewportSize({ width: 1591, height: 1019 });
    await tab.evaluate(site => {
      const key = `certichat:${site}`;
      localStorage.setItem(key, JSON.stringify({ updatedAt: Date.now(), messages: Array.from({ length: 16 }, (_, index) => ({ role: 'ai', text: `Respuesta ${index}. ${'Este párrafo conserva el contexto de estudio. '.repeat(18)}\n\nSi quieres entrar directo a partes concretas:\n\n- Presentación de la demo y mapa por capas.\n- Análisis geográfico de publicaciones e incidencias.\n\n[CertiTube · Momento ${index}](${site}certitube/Ha74VhpQwQo/#t-14)` })) }));
      sessionStorage.setItem(`${key}:open`, 'true');
    }, site);
    await tab.goto(new URL('certitube/ZjfQUwUdpbI/', base).href); await ready();
    assert(await tab.locator('.tube-videos').evaluate(node => getComputedStyle(node).maxHeight === 'none'), 'Open chat must release the library launcher reservation');
    const messageSpacing = await tab.locator('deep-chat .ai-message').last().evaluate(node => ({ font: parseFloat(getComputedStyle(node).fontSize), line: parseFloat(getComputedStyle(node).lineHeight), blocks: [...node.querySelectorAll('p, ul, ol')].map(block => ({ tag: block.tagName, top: parseFloat(getComputedStyle(block).marginTop), bottom: parseFloat(getComputedStyle(block).marginBottom) })) }));
    assert(messageSpacing.font === 14 && Math.abs(messageSpacing.line - 20.3) < .05 && messageSpacing.blocks.some(block => block.tag === 'UL') && messageSpacing.blocks.every(block => block.top <= 7 && block.bottom <= 7), 'Chat paragraphs and lists need compact spacing at the existing font size', messageSpacing);
    const link = tab.locator('deep-chat .ai-message a').nth(8);
    await link.evaluate(node => node.scrollIntoView({ block: 'center' }));
    const before = await tab.locator('deep-chat').evaluate(chat => chat.shadowRoot.querySelector('#messages').scrollTop);
    await link.click(); await tab.waitForURL('**/certitube/Ha74VhpQwQo/#t-14'); await ready();
    await tab.waitForFunction(expected => Math.abs(document.querySelector('deep-chat').shadowRoot.querySelector('#messages').scrollTop - expected) < 1, before);
    assert(before > 100, 'Reading position test needs a scrolled conversation', before);
    await tab.locator('deep-chat .ai-message a').nth(8).click();
    const after = await tab.locator('deep-chat').evaluate(chat => chat.shadowRoot.querySelector('#messages').scrollTop);
    assert(Math.abs(before - after) < 1, 'Same-page timestamp changed chat scroll', { before, after });
    const input = tab.getByRole('textbox', { name: 'Escribe tu consulta' });
    await input.fill('Consulta simulada'); await input.press('Enter');
    const loading = tab.locator('deep-chat .deep-chat-loading-message-bubble'); await loading.waitFor();
    const loadingColors = [];
    for (const theme of ['light', 'dark']) {
      await setTheme(theme);
      const color = await loading.evaluate(node => ({ actual: getComputedStyle(node).backgroundColor, expected: getComputedStyle(node.getRootNode().querySelector('.ai-message:not(.deep-chat-loading-message-bubble)')).backgroundColor }));
      assert(color.actual === color.expected, 'Loading bubble ignores theme', color); loadingColors.push({ theme, ...color });
    }
    releaseReply(); releaseReply = undefined;
    await tab.waitForFunction(() => document.querySelector('deep-chat').getMessages().at(-1)?.text === 'Respuesta simulada.');
    await tab.locator('[data-chat-close]').click();
    await tab.locator('[data-chat-open]').waitFor();
    await tab.goto(base.href); await tab.emulateMedia({ reducedMotion: 'no-preference' });
    const closeSamples = [];
    for (const theme of ['light', 'dark']) {
      await setTheme(theme); await tab.locator('[data-chat-open]').click(); await ready();
      await tab.waitForFunction(() => [...document.querySelector('.home-main').getAnimations(), ...document.querySelector('#certichat-panel').getAnimations()].every(animation => animation.playState !== 'running'));
      const sampling = tab.evaluate(async () => {
        const samples = [], start = performance.now();
        while (performance.now() - start < 850) {
          await new Promise(resolve => requestAnimationFrame(resolve));
          samples.push({ gap: document.documentElement.clientWidth - document.querySelector('.hero-ambient').getBoundingClientRect().right, overflow: document.documentElement.scrollWidth - innerWidth });
        }
        return samples;
      });
      await tab.locator('[data-chat-close]').click();
      const frames = await sampling;
      assert(frames.every(frame => frame.gap <= 1 && frame.overflow <= 1), 'Closing chat exposes a right-hand gap', { theme, frames });
      closeSamples.push({ theme, frames: frames.length, maxGap: Math.max(...frames.map(frame => frame.gap)) });
    }
    const compactTitles = [];
    for (const width of [801, 1018, 1178, 1362, 1428, 1686]) for (const theme of ['light', 'dark']) {
      await tab.setViewportSize({ width, height: 1019 }); await setTheme(theme);
      const normal = await tab.locator('.home-hero h1').evaluate(node => parseFloat(getComputedStyle(node).fontSize));
      await tab.locator('[data-chat-open]').click(); await ready();
      await tab.waitForFunction(() => document.querySelector('.home-main').getAnimations().every(animation => animation.playState !== 'running'));
      const title = await tab.locator('.home-hero h1').evaluate(node => ({ font: parseFloat(getComputedStyle(node).fontSize), overflow: document.documentElement.scrollWidth - innerWidth, textOverflow: node.scrollWidth - node.clientWidth, available: document.querySelector('.home-main').clientWidth, video: getComputedStyle(document.querySelector('.hero-flow')).display !== 'none', copy: document.querySelector('.hero-copy').getBoundingClientRect().width }));
      assert(title.overflow <= 1 && title.textOverflow <= 1 && title.video === (title.available > 896) && (title.available > 896 && title.copy > 440 || title.font < normal && title.font <= 40), 'Home hides the video and reduces the title when chat leaves insufficient room', { width, theme, normal, ...title });
      compactTitles.push({ width, theme, ...title });
      await tab.locator('[data-chat-close]').click();
      await tab.locator('#certichat-panel').waitFor({ state: 'hidden' });
      await tab.waitForFunction(() => document.querySelector('.home-main').getAnimations().every(animation => animation.playState !== 'running'));
    }
    // Observe drawing commands, never canvas pixels or screenshots.
    await context.addInitScript(() => {
      if (!location.pathname.endsWith('/certichat/')) return;
      for (const method of ['beginPath', 'arc', 'fill', 'stroke']) {
        const original = CanvasRenderingContext2D.prototype[method];
        CanvasRenderingContext2D.prototype[method] = function (...args) {
          if (method === 'beginPath') this.referenceArcs = 0;
          if (method === 'arc') this.referenceArcs++;
          if (method === 'fill' || method === 'stroke') {
            const calls = this.canvas.referenceDraws ??= [];
            calls.push({ method, arcs: this.referenceArcs, color: this[`${method}Style`], alpha: this.globalAlpha });
            if (calls.length > 80) calls.shift();
          }
          return original.apply(this, args);
        };
      }
    });
    await tab.goto(new URL('certichat/', base).href); await tab.emulateMedia({ reducedMotion: 'reduce' });
    const canvas = tab.locator('[data-graph-canvas]'), card = tab.locator('[data-graph-card]');
    await tab.waitForFunction(() => Number(document.querySelector('[data-graph-canvas]').dataset.nodeCount) > 0);
    const trace = await tab.locator('[data-knowledge-graph]').evaluate(async root => {
      const graph = await (await fetch(root.dataset.knowledgeGraph)).json(), edge = graph.edges.find(edge => edge.source !== edge.target), videoNodes = [edge.source, edge.target];
      const nodes = [...videoNodes, ...graph.nodes.filter(node => !videoNodes.includes(node.id)).slice(0, 66).map(node => node.id)];
      return { version: graph.version, nodes, edges: [edge], sources: videoNodes.map(nodeId => ({ nodeId, title: 'CertiTube · Referencia', url: 'https://jgangini.github.io/certitips/certitube/Ha74VhpQwQo/#t-61' })) };
    });
    await tab.evaluate(trace => dispatchEvent(new CustomEvent('certichat:trace', { detail: { status: 'ready', trace } })), trace);
    await tab.locator(`[data-graph-active] button[data-concept="${trace.nodes[0]}"]`).click();
    await card.waitFor();
    const graphColors = [];
    for (const theme of ['light', 'dark']) {
      await setTheme(theme);
      await tab.waitForFunction(() => {
        const canvas = document.querySelector('[data-graph-canvas]'), blue = getComputedStyle(canvas).getPropertyValue('--video-accent').trim();
        return canvas.referenceDraws?.some(call => call.method === 'fill' && call.color === blue && call.arcs === 2);
      });
      const colors = await card.evaluate(node => {
        const canvas = document.querySelector('[data-graph-canvas]'), style = getComputedStyle(node), blue = getComputedStyle(document.querySelector('.chat-graph-legend [data-source="tube"]')).backgroundColor;
        return { blue, border: style.borderColor, connector: getComputedStyle(document.querySelector('[data-graph-card-connector]')).stroke, draws: canvas.referenceDraws.slice(-12) };
      });
      assert(colors.border === colors.blue && colors.connector === colors.blue && colors.draws.some(call => call.method === 'stroke' && call.color === '#0d65ad' && call.alpha === .95), 'Video nodes, edges, card and connector share the legend blue', colors);
      graphColors.push({ theme, blue: colors.blue, border: colors.border, connector: colors.connector });
      const selection = await tab.locator('[data-graph-active] [aria-pressed="true"]').evaluate(node => ({ background: getComputedStyle(node).backgroundColor, border: getComputedStyle(node).borderColor, color: getComputedStyle(node).color }));
      assert(selection.background === colors.blue && selection.border === colors.blue && selection.color === 'rgb(255, 255, 255)', 'Video concept selection must share the legend blue', selection);
    }
    await tab.emulateMedia({ reducedMotion: 'no-preference' });
    const lastConcept = await tab.locator('[data-graph-active] button').last().getAttribute('data-concept');
    await tab.locator('[data-graph-active] button').last().evaluate(button => button.click());
    await tab.waitForFunction(() => document.querySelector('[data-graph-canvas]').dataset.cameraMoving === 'true');
    await tab.waitForFunction(() => document.querySelector('[data-graph-canvas]').dataset.cameraMoving === 'false');
    await tab.locator('[data-graph-active]').evaluate(node => node.scrollTo({ left: 0, behavior: 'instant' }));
    const barTravel = tab.locator('[data-graph-active]').evaluate(async node => {
      const samples = [], start = performance.now();
      let stable = 0;
      while (performance.now() - start < 5000 && stable < 12) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        stable = node.scrollLeft > 0 && node.scrollLeft === samples.at(-1) ? stable + 1 : 0;
        samples.push(node.scrollLeft);
      }
      const selected = node.querySelector('[aria-pressed="true"]'), box = selected.getBoundingClientRect(), bar = node.getBoundingClientRect();
      return { samples, visible: box.left >= bar.left - 1 && box.right <= bar.right + 1, selected: selected.dataset.concept, left: box.left, right: box.right, barLeft: bar.left, barRight: bar.right };
    });
    const center = await canvas.evaluate(node => ({ x: node.clientWidth / 2, y: node.clientHeight / 2 }));
    await canvas.click({ position: center });
    const conceptTravel = await barTravel, finalScroll = conceptTravel.samples.at(-1);
    assert(conceptTravel.selected === lastConcept && conceptTravel.visible && finalScroll > 0 && conceptTravel.samples.some(value => value > 0 && value < finalScroll), 'Graph click must smoothly reveal the selected concept tag', { ...conceptTravel, expected: lastConcept, samples: conceptTravel.samples.length });
    await tab.locator(`[data-graph-active] button[data-concept="${trace.nodes[0]}"]`).click();
    await tab.waitForFunction(() => document.querySelector('[data-graph-canvas]').dataset.cameraMoving === 'true');
    await tab.waitForFunction(() => document.querySelector('[data-graph-canvas]').dataset.cameraMoving === 'false' && document.querySelector('[data-graph-canvas]').dataset.pulseActive === 'true');
    const selectedId = () => tab.locator('[data-graph-active] [aria-pressed="true"]').evaluateAll(items => items[0]?.dataset.concept);
    const waveStages = [await selectedId()];
    await canvas.hover({ position: { x: 30, y: 30 } });
    await tab.mouse.down(); await tab.mouse.move(80, 190); await tab.mouse.up();
    waveStages.push(await selectedId());
    assert(waveStages.every(id => id === trace.nodes[0]), 'Pan changed the selected node', { waveStages, expected: trace.nodes[0] });
    const emptyPoint = await canvas.evaluate(async node => {
      const graph = await (await fetch(document.querySelector('[data-knowledge-graph]').dataset.knowledgeGraph)).json();
      const { layoutNetwork } = await import('/certitips/assets/certichat-network.js');
      const { indexGraph } = await import(document.querySelector('script[src*="/certichat-explorer.js"]').src);
      const points = layoutNetwork(indexGraph(graph)).nodes, scale = Number(node.dataset.scale), px = Number(node.dataset.panX), py = Number(node.dataset.panY);
      for (let y = 10; y < node.clientHeight - 10; y += 20) for (let x = 10; x < node.clientWidth - 10; x += 20) {
        if (points.every(point => Math.hypot(point.x * scale + px - x, point.y * scale + py - y) > Math.max(14, point.radius * 1.25 + 4))) return { x, y };
      }
      throw new Error('No empty graph coordinate available for the click check.');
    });
    await canvas.click({ position: emptyPoint });
    waveStages.push(await selectedId());
    await tab.locator('[data-graph-zoom-in]').click();
    const movingWaves = await canvas.evaluate(async node => {
      const before = Number(node.dataset.drawCount);
      while (Number(node.dataset.drawCount) < before + 3) await new Promise(resolve => requestAnimationFrame(resolve));
      return { active: node.dataset.pulseActive, selected: document.querySelector('[data-graph-active] [aria-pressed="true"]')?.dataset.concept, draws: node.referenceDraws.slice(-24) };
    });
    assert(movingWaves.active === 'true' && movingWaves.selected === trace.nodes[0] && movingWaves.draws.some(call => call.method === 'stroke' && call.color === '#0d65ad' && call.arcs === 1 && call.alpha > 0 && call.alpha <= .38), 'Selected blue waves survive pan, empty click and zoom', { ...movingWaves, waveStages, emptyPoint, expected: trace.nodes[0] });
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    await tab.waitForFunction(() => document.querySelector('[data-graph-canvas]').dataset.pulseActive === 'false');
    assert(!errors.length, 'Browser errors', errors);
    return { passed: true, scenarios: samples.length, readingPosition: { before, after }, messageSpacing, loadingColors, closeSamples, compactTitles, graphColors, selectionWaves: movingWaves.active === 'true', conceptScroll: { visible: conceptTravel.visible, frames: conceptTravel.samples.length, finalScroll }, errors };
  } finally { releaseReply?.(); await context.close(); }
}

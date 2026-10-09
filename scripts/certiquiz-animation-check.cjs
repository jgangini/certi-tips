// Run with Playwright available through NODE_PATH: node scripts/certiquiz-animation-check.cjs
// Isolated DOM fixture: no room, API, screenshots, tracing, or browser profile.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const source = readFileSync(path.join(root, 'assets/certiquiz.js'), 'utf8');
  const functions = ['rosterRays', 'layoutRoster', 'updatePlayers'].map(name => {
    const body = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0];
    assert.ok(body, `Missing production function ${name}`);
    return body;
  }).join('\n');
  const motionListener = source.match(/^matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.addEventListener\('change',[\s\S]*?^\}\);/m)?.[0];
  assert.ok(motionListener, 'Missing production reduced-motion listener');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1538, height: 1003 }, reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.abort());
    await page.setContent('<main class="certiquiz-app" style="width:min(1200px,calc(100% - 32px));margin:auto"><div class="room-grid"><section class="card" style="height:420px"></section><div class="room-side"><div data-players></div></div></div></main>');
    for (const name of ['site.css', 'certiquiz.css']) await page.addStyleTag({ content: readFileSync(path.join(root, 'assets', name), 'utf8') });
    await page.addScriptTag({ content: `
      let room = { code: 'fixture', players: [], playerCount: 0 };
      let rankingOrder = [], rankingCode, rosterObserver;
      ${source.match(/^const escape = .*$/m)[0]}
      ${functions}
      ${motionListener}
      window.fixture = {
        setCount(count) {
          room.players = Array.from({ length: count }, (_, index) => ({ id: (index + 1).toString(16).padStart(4, '0'), nickname: 'Participante ' + (index + 1) }));
          room.playerCount = count;
          updatePlayers(document.querySelector('[data-players]'));
          document.querySelector('.team-total')?.getAnimations().forEach(animation => animation.finish());
        },
        progress(fraction) {
          document.querySelectorAll('[data-player-id]:not([data-absorbed])').forEach(node => node.getAnimations({ subtree: true }).forEach(animation => {
            animation.pause();
            const timing = animation.effect.getTiming();
            animation.currentTime = Number(timing.delay) + Number(timing.duration) * fraction;
          }));
        },
        sample() {
          const core = document.querySelector('.team-count').getBoundingClientRect();
          return [...document.querySelectorAll('.player-avatar')].map(node => {
            const box = node.getBoundingClientRect(), style = getComputedStyle(node);
            const x = box.x + box.width / 2 - core.x - core.width / 2;
            const y = box.y + box.height / 2 - core.y - core.height / 2;
            return { radius: Math.hypot(x, y), angle: Math.atan2(y, x), width: box.width, opacity: Number(style.opacity) * Number(getComputedStyle(node.parentElement).opacity), color: style.backgroundColor };
          });
        },
        state() {
          return { size: Number.parseFloat(document.querySelector('.player-list').style.getPropertyValue('--total-size')), absorbed: document.querySelectorAll('[data-absorbed]').length, count: Number(document.querySelector('.team-count').textContent) };
        }
      };
      fixture.setCount(12);
    ` });
    const initial = await page.evaluate(() => {
      fixture.nodes = [...document.querySelectorAll('[data-player-id]')];
      fixture.animations = fixture.nodes.map(node => node.getAnimations({ subtree: true }));
      fixture.ends = [];
      document.querySelector('.player-list').addEventListener('animationend', event => fixture.ends.push(event.animationName));
      fixture.progress(.2);
      return { state: fixture.state(), samples: fixture.sample(), rays: document.querySelectorAll('.energy-rays line').length, names: [...document.querySelectorAll('.player-avatar')].map(node => node.getAttribute('aria-label')) };
    });
    assert.equal(initial.rays, 96, 'The core needs its radial line halo');
    assert.equal(initial.names.length, 12);
    assert.ok(initial.names.every(name => name?.startsWith('Participante ')), 'Absorbed participants retain accessible names');
    assert.ok(new Set(initial.samples.map(item => item.color)).size >= 4, 'The arriving spheres must have several colors');
    assert.deepEqual(initial.state, { size: 84, absorbed: 0, count: 12 }, 'Arrivals update the count immediately without enlarging the core');
    const orbit = await page.evaluate(() => { fixture.progress(.45); return fixture.sample(); });
    assert.ok(orbit.some((item, index) => Math.abs(item.angle - initial.samples[index].angle) > .2), 'Spheres must orbit around the center');
    assert.deepEqual(await page.evaluate(() => { fixture.setCount(12); return fixture.state(); }), initial.state, 'Polling while spheres float must not enlarge the core');
    await page.evaluate(() => { document.querySelector('.room-grid > .card').style.height = '640px'; });
    await page.waitForFunction(() => Math.abs(document.querySelector('.player-list').getBoundingClientRect().height - 640) < 1);
    assert.deepEqual(await page.evaluate(() => fixture.state()), initial.state, 'Resizing while spheres float must not absorb them');
    await page.evaluate(() => fixture.nodes[0].getAnimations().forEach(animation => animation.finish()));
    await page.waitForFunction(() => fixture.ends.includes('certiquiz-orbit'));
    assert.deepEqual(await page.evaluate(() => fixture.state()), initial.state, 'Orbit completion must not be mistaken for absorption');
    const inward = await page.evaluate(() => { fixture.progress(.9); return fixture.sample(); });
    assert.ok(inward.every((item, index) => item.radius < initial.samples[index].radius && item.width < initial.samples[index].width), 'The actual participant spheres must move inward and shrink');
    await page.evaluate(() => fixture.nodes[0].querySelector('.player-avatar').getAnimations()[0].finish());
    await page.waitForFunction(() => document.querySelectorAll('[data-absorbed]').length === 1);
    const firstAbsorption = await page.evaluate(() => fixture.state());
    assert.ok(firstAbsorption.size > initial.state.size && firstAbsorption.count === 12, 'A native absorption completion must enlarge the core without changing the real count');
    await page.waitForFunction(() => Math.abs(document.querySelector('.team-total').getBoundingClientRect().width - fixture.state().size) < .1);
    assert.ok(await page.evaluate(() => document.querySelector('.team-count').getAnimations().length === 0), 'The core must not breathe or grow independently of absorption');
    await page.evaluate(async () => {
      const animation = fixture.nodes[0].querySelector('.player-avatar').getAnimations()[0], timing = animation.effect.getTiming();
      animation.currentTime = Number(timing.delay) + Number(timing.duration) * .5;
      animation.pause();
      await new Promise(requestAnimationFrame);
      animation.finish();
    });
    await page.waitForFunction(() => fixture.ends.filter(name => name === 'certiquiz-absorb').length >= 2);
    assert.deepEqual(await page.evaluate(() => fixture.state()), firstAbsorption, 'Repeated native completion must not count the same sphere twice');
    await page.evaluate(() => document.querySelectorAll('[data-player-id]:not([data-absorbed])').forEach(node => node.getAnimations({ subtree: true }).forEach(animation => animation.finish())));
    await page.waitForFunction(() => document.querySelectorAll('[data-absorbed]').length === 12);
    assert.ok((await page.evaluate(() => fixture.sample())).every(item => item.opacity === 0), 'Participant spheres remain visible after absorption');
    const retained = await page.evaluate(() => {
      fixture.setCount(12);
      return fixture.nodes.every((node, index) => node === document.querySelectorAll('[data-player-id]')[index] && fixture.animations[index].every(animation => node.getAnimations({ subtree: true }).includes(animation))) && fixture.sample().every(item => item.opacity === 0);
    });
    assert.ok(retained, 'Polling must preserve nodes and completed animations instead of replaying arrivals');
    const joined = await page.evaluate(() => {
      const before = fixture.state().size;
      fixture.setCount(22);
      return { before, after: fixture.state().size, total: document.querySelector('.team-count').textContent, samples: fixture.sample(), oldRetained: fixture.nodes.every(node => node.isConnected), newAnimations: [...document.querySelectorAll('[data-player-id]')].slice(12).every(node => node.getAnimations({ subtree: true }).length >= 2) };
    });
    assert.equal(joined.total, '22');
    assert.ok(joined.after === joined.before && joined.oldRetained && joined.newAnimations, 'New participants must animate without enlarging the core before absorption');
    assert.ok(joined.samples.slice(0, 12).every(item => item.opacity === 0), 'A new arrival must not resurrect absorbed spheres');
    const rays = await page.evaluate(() => {
      const lines = [...document.querySelectorAll('.energy-rays line')];
      const lengths = lines.map(line => Math.hypot(line.x2.baseVal.value - line.x1.baseVal.value, line.y2.baseVal.value - line.y1.baseVal.value));
      const line = lines.find(node => node.getAnimations().length), animation = line?.getAnimations()[0];
      if (!animation) return { lengths, moving: false };
      const timing = animation.effect.getTiming(); animation.pause();
      animation.currentTime = Number(timing.delay) + Number(timing.duration) * .1;
      const first = getComputedStyle(line).transform;
      animation.currentTime = Number(timing.delay) + Number(timing.duration) * .6;
      return { lengths, moving: first !== getComputedStyle(line).transform };
    });
    assert.ok(new Set(rays.lengths.map(value => value.toFixed(2))).size > 12 && rays.moving, 'Radial lines must have irregular, moving lengths');
    assert.ok(await page.evaluate(() => Number(getComputedStyle(document.querySelector('.player-total')).zIndex) > Number(getComputedStyle(document.querySelector('[data-player-id]')).zIndex)), 'The center must cover spheres passing behind it');
    assert.ok(await page.evaluate(() => {
      const list = document.querySelector('.player-list').getBoundingClientRect(), core = document.querySelector('.team-total').getBoundingClientRect();
      return Math.abs(core.y + core.height / 2 - list.y - list.height / 2) < 1;
    }), 'The core must stay centered when the invitation card changes height');
    const floatingLeft = await page.evaluate(() => {
      const removed = document.querySelector('[data-player-id]:not([data-absorbed])'), before = fixture.state();
      room.players = room.players.filter(player => player.id !== removed.dataset.playerId); room.playerCount = room.players.length;
      updatePlayers(document.querySelector('[data-players]'));
      return { before, after: fixture.state(), removed: !removed.isConnected };
    });
    assert.ok(floatingLeft.removed && floatingLeft.after.count === 21 && floatingLeft.after.size === floatingLeft.before.size && floatingLeft.after.absorbed === 12, 'Leaving during orbit must not add energy or change the absorbed size');
    const absorbedLeft = await page.evaluate(() => {
      const removed = document.querySelector('[data-absorbed]'), before = fixture.state();
      room.players = room.players.filter(player => player.id !== removed.dataset.playerId); room.playerCount = room.players.length;
      updatePlayers(document.querySelector('[data-players]'));
      return { before, after: fixture.state(), removed: !removed.isConnected };
    });
    assert.ok(absorbedLeft.removed && absorbedLeft.after.count === 20 && absorbedLeft.after.absorbed === 11 && absorbedLeft.after.size < absorbedLeft.before.size, 'Leaving after absorption must remove exactly that sphere from the core size');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelectorAll('[data-absorbed]').length === 20);
    const reduced = await page.evaluate(() => fixture.state());
    assert.ok(reduced.size > absorbedLeft.after.size, 'Enabling reduced motion during flight must settle pending spheres without waiting for animationend');
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('[data-player-id], .player-avatar, .energy-rays, .energy-rays line')].every(node => node.getAnimations().length === 0)), 'Reduced motion must stop spheres and radial lines');
    await page.evaluate(() => { fixture.setCount(0); fixture.setCount(3); });
    const initiallyReduced = await page.evaluate(() => fixture.state());
    assert.ok(initiallyReduced.count === 3 && initiallyReduced.absorbed === 3 && initiallyReduced.size > initial.state.size, 'A reduced-motion lobby must settle immediately even though no animation starts');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    assert.ok(await page.evaluate(() => {
      document.querySelectorAll('[data-player-id]').forEach(node => node.getAnimations({ subtree: true }).forEach(animation => {
        animation.pause(); const timing = animation.effect.getTiming();
        animation.currentTime = Number(timing.delay) + Number(timing.duration) * .3;
      }));
      return fixture.sample().every(item => item.opacity === 0) && fixture.state().absorbed === 3;
    }), 'Returning to motion must not make settled spheres reappear');
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => fixture.setCount(500));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelectorAll('[data-player-id]').length === 500), 'A room of 500 participants must fit the mobile viewport');
    assert.deepEqual(errors, [], 'Browser runtime errors');
    console.log('CertiQuiz animation: native absorption-only growth, duplicate completion, polling/resize, arrivals/leaves, reduced motion transitions, orbit, palette, moving rays, layering and mobile 500 passed.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

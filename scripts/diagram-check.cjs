// Run in an isolated playwright-cli session; measures real SVG text, no screenshots.
async (page) => {
  const origin = await page.evaluate(() => location.origin);
  const sources = new Set();
  await page.goto(`${origin}/certi-tips/`);
  const pages = await page.locator('[data-search-kind="topic"] a').evaluateAll(links => links.map(link => link.href));
  for (const url of pages) {
    await page.goto(url);
    for (const source of await page.locator('.prose img[src$=".svg"]').evaluateAll(images => images.map(image => image.src))) sources.add(source);
  }
  if (!sources.size) throw new Error('No course SVG diagrams found');
  const reports = [];
  await page.setViewportSize({ width: 1200, height: 760 });
  for (const source of sources) {
    const name = source.split('/').pop();
    const response = await page.goto(source);
    if (response.status() !== 200) throw new Error(`Missing diagram: ${name}`);
    reports.push(await page.evaluate(name => {
      const root = document.querySelector('svg');
      if (!root || document.querySelector('parsererror')) throw new Error(`Invalid SVG: ${name}`);
      const canvas = root.getBoundingClientRect();
      const nodes = [...root.querySelectorAll('text')];
      const boxes = nodes.map(node => ({ text: node.textContent, box: node.getBoundingClientRect(), size: parseFloat(getComputedStyle(node).fontSize) }));
      const outside = boxes.filter(({ box }) => box.left < canvas.left || box.right > canvas.right || box.top < canvas.top || box.bottom > canvas.bottom).map(item => item.text);
      const overlaps = [];
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i].box, b = boxes[j].box;
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlaps.push([boxes[i].text, boxes[j].text]);
        }
      }
      const scale = canvas.width / Number(root.getAttribute('viewBox').split(/\s+/)[2]);
      const alignment = [];
      for (const card of root.querySelectorAll('[data-layout="centered-card"]')) {
        const frame = card.querySelector('rect').getBoundingClientRect();
        const content = card.querySelector('[data-card-content]').getBoundingClientRect();
        const dx = Math.abs(content.left + content.width / 2 - frame.left - frame.width / 2) / scale;
        const dy = Math.abs(content.top + content.height / 2 - frame.top - frame.height / 2) / scale;
        const padding = Math.min(content.left - frame.left, frame.right - content.right, content.top - frame.top, frame.bottom - content.bottom) / scale;
        if (dx > 2 || dy > 2 || padding < 12) alignment.push({ text: card.textContent, dx, dy, padding });
      }
      const proximity = [];
      for (const group of root.querySelectorAll('[data-card-content], [data-layout="caption"]')) {
        const labels = [...group.querySelectorAll('text')];
        if (labels.length < 2) continue;
        const gap = (labels[1].getBoundingClientRect().top - labels[0].getBoundingClientRect().bottom) / scale;
        if (gap < 8 || gap > 16) proximity.push({ text: group.textContent, gap });
      }
      const iconSpacing = [];
      for (const group of root.querySelectorAll('[data-layout="icon-label"]')) {
        const artwork = group.querySelector('[data-artwork]').getBoundingClientRect();
        const label = group.querySelector('text');
        const text = label.getBoundingClientRect();
        const horizontal = group.getAttribute('data-axis') === 'horizontal';
        const gap = (horizontal ? Math.max(text.left - artwork.right, artwork.left - text.right) : Math.max(text.top - artwork.bottom, artwork.top - text.bottom)) / scale;
        const offset = (horizontal ? Math.abs(text.top + text.height / 2 - artwork.top - artwork.height / 2) : Math.abs(text.left + text.width / 2 - artwork.left - artwork.width / 2)) / scale;
        if (gap < 8 || gap > 24 || offset > 4) iconSpacing.push({ text: label.textContent, gap, offset });
      }
      const borderCrossings = [];
      // The OCI compositions keep labels inside frames. Other courses also use labels across frame boundaries.
      const frames = name.startsWith('ocif-') ? [...root.querySelectorAll('rect')].filter(node => !node.closest('defs') && Number(node.getAttribute('width')) >= 120 && Number(node.getAttribute('height')) >= 63).map(node => node.getBoundingClientRect()) : [];
      for (const { text, box: a } of boxes) {
        for (const b of frames) {
          const intersects = Math.min(a.right, b.right) - Math.max(a.left, b.left) > scale && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > scale;
          const contained = a.left >= b.left - scale && a.right <= b.right + scale && a.top >= b.top - scale && a.bottom <= b.bottom + scale;
          if (intersects && !contained) borderCrossings.push(text);
        }
      }
      return { name, labels: boxes.length, minimumFont: Math.min(...boxes.map(item => item.size)), outside, overlaps, alignment, proximity, iconSpacing, borderCrossings };
    }, name));
  }
  await page.goto(`${origin}/certi-tips/`);
  const issues = reports.filter(item => item.outside.length || item.overlaps.length || item.alignment.length || item.proximity.length || item.iconSpacing.length || item.borderCrossings.length || item.minimumFont < 14);
  if (issues.length) throw new Error(JSON.stringify(issues));
  return { diagrams: reports, screenshots: 0 };
}

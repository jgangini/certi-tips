// Run in an isolated playwright-cli session; measures real SVG text, no screenshots.
async (page) => {
  const origin = await page.evaluate(() => location.origin);
  const sources = new Set();
  for (const slug of ['agents', 'langchain', 'mcp', 'openai', 'oci-enterprise', 'oracle-database']) {
    await page.goto(`${origin}/certi-tips/1Z0-1157-26/${slug}/`);
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
      return { name, labels: boxes.length, minimumFont: Math.min(...boxes.map(item => item.size)), outside, overlaps };
    }, name));
  }
  await page.goto(`${origin}/certi-tips/`);
  const issues = reports.filter(item => item.outside.length || item.overlaps.length || item.minimumFont < 14);
  if (issues.length) throw new Error(JSON.stringify(issues));
  return { diagrams: reports, screenshots: 0 };
}

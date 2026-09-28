// Run in an isolated playwright-cli session; measures real SVG text, no screenshots.
async (page) => {
  const origin = await page.evaluate(() => location.origin);
  const names = ['agent-loop', 'certification-roadmap', 'guardrails', 'langchain-flow', 'mcp-architecture', 'openai-stack', 'handoffs', 'oci-runtime', 'vector-search', 'database-capabilities'];
  const reports = [];
  await page.setViewportSize({ width: 1200, height: 760 });
  for (const name of names) {
    const response = await page.goto(`${origin}/certi-tips/assets/diagrams/${name}.svg`);
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

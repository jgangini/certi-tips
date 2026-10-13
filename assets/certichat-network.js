const edgeKey = edge => JSON.stringify([edge.source, edge.target, edge.label]);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function layoutNetwork(graph) {
  const nodes = graph.nodes.map(node => ({ id: node.id, label: node.label, degree: 0, radius: 0, x: 0, y: 0 }));
  const indexes = new Map(nodes.map((node, index) => [node.id, index]));
  const neighbors = nodes.map(() => []), edges = [];
  for (const edge of graph.edges) {
    const a = indexes.get(edge.source), b = indexes.get(edge.target);
    if (a === undefined || b === undefined) continue;
    edges.push({ a, b, key: edgeKey(edge) });
    nodes[a].degree++;
    if (a !== b) nodes[b].degree++;
    if (a !== b) { neighbors[a].push(b); neighbors[b].push(a); }
  }
  // Node area grows with incident relationships; the offset keeps sparse concepts legible.
  for (const node of nodes) node.radius = 0.8 * Math.sqrt(4 + node.degree);
  // Seed around the most connected concepts without imposing rows, columns or concentric rings.
  const seeds = nodes.map((_, i) => i).sort((a, b) => neighbors[b].length - neighbors[a].length || nodes[a].id.localeCompare(nodes[b].id));
  const seen = new Set();
  let position = 0;
  for (const seed of seeds) {
    if (seen.has(seed)) continue;
    const queue = [seed]; seen.add(seed);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor], node = nodes[index];
      const angle = position * 2.399963229728653 + Math.sin(index * 12.9898) * 0.35;
      const radius = 12 * Math.sqrt(position) * (0.9 + Math.sin(index * 78.233) * 0.1);
      node.x = Math.cos(angle) * radius;
      node.y = Math.sin(angle) * radius;
      position++;
      for (const next of neighbors[index]) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  // ponytail: 36 bounded passes, with at most eight repulsion samples per grid cell.
  // Dense cells trade exact force simulation for predictable mobile work; move layout offline if the graph grows.
  for (let pass = 0; pass < 36; pass++) {
    const cells = new Map(), dx = new Float64Array(nodes.length), dy = new Float64Array(nodes.length);
    nodes.forEach((node, index) => {
      const key = `${Math.floor(node.x / 24)},${Math.floor(node.y / 24)}`;
      if (!cells.has(key)) cells.set(key, []);
      const cell = cells.get(key);
      if (cell.length < 8) cell.push(index);
    });
    for (const { a, b } of edges) {
      if (a === b) continue;
      const x = nodes[b].x - nodes[a].x, y = nodes[b].y - nodes[a].y, distance = Math.max(1, Math.hypot(x, y));
      const force = 0.08 * (distance - 32) / distance;
      dx[a] += x * force / Math.max(1, neighbors[a].length); dy[a] += y * force / Math.max(1, neighbors[a].length);
      dx[b] -= x * force / Math.max(1, neighbors[b].length); dy[b] -= y * force / Math.max(1, neighbors[b].length);
    }
    nodes.forEach((node, index) => {
      const cx = Math.floor(node.x / 24), cy = Math.floor(node.y / 24);
      for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) {
        for (const other of cells.get(`${x},${y}`) || []) {
          if (other === index) continue;
          const vx = node.x - nodes[other].x, vy = node.y - nodes[other].y, distance = Math.max(0.1, Math.hypot(vx, vy));
          if (distance < 24) { dx[index] += vx / distance * (24 - distance) * 0.25; dy[index] += vy / distance * (24 - distance) * 0.25; }
        }
      }
    });
    nodes.forEach((node, index) => { node.x += clamp(dx[index], -5, 5); node.y += clamp(dy[index], -5, 5); });
  }
  return { nodes, edges, indexes };
}

export function createNetwork(canvas, graph, onSelect, onAnchor) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  const layout = layoutNetwork(graph), edgeKeys = new Set(layout.edges.map(edge => edge.key));
  const events = new AbortController(), pointers = new Map();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0, height = 0, frame = 0, destroyed = false, moved = false, selected, pressPosition, camera, pulse;
  let activeNodes = new Set(), activeEdges = new Set();
  const view = { scale: 1, x: 0, y: 0 };
  canvas.style.touchAction = "none";
  if (!canvas.hasAttribute("tabindex")) canvas.tabIndex = 0;

  function invalidate() { if (!frame && !destroyed) frame = requestAnimationFrame(draw); }
  function moveTo(target, animate) {
    pulse = undefined;
    camera = animate && !reducedMotion.matches && Object.keys(target).some(key => target[key] !== view[key]) ? { from: { ...view }, target } : undefined;
    if (!camera) Object.assign(view, target);
    invalidate();
  }
  function fit(activeOnly = false) {
    camera = pulse = undefined;
    const points = activeOnly ? layout.nodes.filter(node => activeNodes.has(node.id)) : layout.nodes;
    if (!points.length || !width || !height) return;
    const xs = points.map(node => node.x), ys = points.map(node => node.y);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    const padding = 12 + Math.max(...points.map(node => node.radius * 1.25 + 3));
    const scale = clamp(Math.min((width - padding * 2) / Math.max(80, right - left), (height - padding * 2) / Math.max(80, bottom - top)), 0.04, 4);
    const target = { scale, x: width / 2 - (left + right) / 2 * scale, y: height / 2 - (top + bottom) / 2 * scale };
    moveTo(target, activeOnly);
  }
  function zoomAt(factor, x = width / 2, y = height / 2) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    camera = pulse = undefined;
    const scale = clamp(view.scale * factor, 0.04, 12), ratio = scale / view.scale;
    view.x = x - (x - view.x) * ratio; view.y = y - (y - view.y) * ratio; view.scale = scale;
    invalidate();
  }
  function select(id, center = false) {
    selected = layout.indexes.has(id) ? id : undefined;
    const node = layout.nodes[layout.indexes.get(selected)];
    if (center && node) moveTo({ scale: view.scale, x: width / 2 - node.x * view.scale, y: height / 2 - node.y * view.scale }, true);
    pulse = node && !reducedMotion.matches ? { repeat: true, nodes: [selected] } : undefined;
    invalidate();
  }
  function hit(x, y) {
    let closest, distance = Infinity;
    for (const node of layout.nodes) {
      const candidate = Math.hypot(node.x * view.scale + view.x - x, node.y * view.scale + view.y - y);
      const target = Math.max(14, node.radius * (activeNodes.has(node.id) ? 1.25 : 1) + 4);
      if (candidate <= target && candidate < distance) { closest = node.id; distance = candidate; }
    }
    if (closest !== undefined) { select(closest); onSelect(closest); }
  }
  function drawPulse(time, red) {
    if (!pulse) return;
    pulse.started ??= time;
    const elapsed = time - pulse.started;
    if (reducedMotion.matches || (!pulse.repeat && elapsed >= 1200)) { pulse = undefined; return; }
    context.strokeStyle = red; context.lineWidth = 1.5 / view.scale;
    for (const delay of [0, 240]) {
      const progress = ((elapsed % 1200) - delay) / 960;
      if (progress < 0 || progress >= 1) continue;
      context.beginPath();
      for (const id of pulse.nodes ?? activeNodes) {
        const node = layout.nodes[layout.indexes.get(id)];
        const radius = (node.radius * (activeNodes.has(id) ? 1.25 : 1) + 4 + 28 * progress) / view.scale;
        context.moveTo(node.x + radius, node.y); context.arc(node.x, node.y, radius, 0, Math.PI * 2);
      }
      context.globalAlpha = 0.38 * (1 - progress) ** 2; context.stroke();
    }
  }
  function draw(time) {
    frame = 0;
    if (!width || !height || destroyed) return;
    if (camera) {
      camera.started ??= time;
      const progress = reducedMotion.matches ? 1 : clamp((time - camera.started) / 420, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      for (const key of ["scale", "x", "y"]) view[key] = camera.from[key] + (camera.target[key] - camera.from[key]) * eased;
      if (progress === 1) { Object.assign(view, camera.target); camera = undefined; }
    }
    const style = getComputedStyle(canvas), color = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, width, height);
    context.translate(view.x, view.y); context.scale(view.scale, view.scale);
    const lines = active => {
      context.beginPath();
      for (const edge of layout.edges) {
        if (active && !activeEdges.has(edge.key)) continue;
        const a = layout.nodes[edge.a], b = layout.nodes[edge.b];
        context.moveTo(a.x, a.y);
        if (edge.a === edge.b) {
          const radius = (a.radius * 1.25 + 4) / view.scale;
          context.arc(a.x, a.y - radius, radius, 0, Math.PI * 2);
        }
        else context.lineTo(b.x, b.y);
      }
      context.strokeStyle = active ? color("--red", "#c74634") : color("--muted", "#747680");
      context.globalAlpha = active ? 0.95 : 0.12; context.lineWidth = (active ? 1.6 : 0.55) / view.scale; context.stroke();
    };
    lines(false); lines(true);
    for (const active of [false, true]) {
      context.beginPath();
      for (const node of layout.nodes) {
        if (active && !activeNodes.has(node.id)) continue;
        const radius = node.radius * (active ? 1.25 : 1) / view.scale;
        context.moveTo(node.x + radius, node.y); context.arc(node.x, node.y, radius, 0, Math.PI * 2);
      }
      context.globalAlpha = active ? 1 : 0.5;
      context.fillStyle = active ? color("--red", "#c74634") : color("--muted", "#747680"); context.fill();
    }
    drawPulse(time, color("--red", "#c74634"));
    context.globalAlpha = 1;
    const node = layout.nodes[layout.indexes.get(selected)];
    let anchor = null;
    if (node) {
      const radius = node.radius * (activeNodes.has(node.id) ? 1.25 : 1);
      const screenX = node.x * view.scale + view.x, screenY = node.y * view.scale + view.y;
      if (screenX + radius >= 0 && screenX - radius <= width && screenY + radius >= 0 && screenY - radius <= height) {
        if (reducedMotion.matches) {
          context.beginPath(); context.arc(node.x, node.y, (radius + 3) / view.scale, 0, Math.PI * 2);
          context.strokeStyle = color("--red", "#c74634"); context.lineWidth = 2 / view.scale; context.stroke();
        }
        anchor = { id: selected, x: screenX, y: screenY - radius - 8, width, height };
      }
    }
    onAnchor?.(anchor);
    Object.assign(canvas.dataset, { nodeCount: String(layout.nodes.length), edgeCount: String(layout.edges.length), activeNodeCount: String(activeNodes.size), activeEdgeCount: String(activeEdges.size), drawCount: String(Number(canvas.dataset.drawCount || 0) + 1), scale: String(view.scale), panX: String(view.x), panY: String(view.y), cameraMoving: String(Boolean(camera)), pulseActive: String(Boolean(pulse)) });
    if (camera || pulse) invalidate();
  }
  function resize() {
    camera = pulse = undefined;
    const first = !width || !height, oldWidth = width, oldHeight = height;
    width = canvas.clientWidth; height = canvas.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    if (first) fit();
    else { view.x += (width - oldWidth) / 2; view.y += (height - oldHeight) / 2; invalidate(); }
  }
  const point = event => { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
  const listen = (name, handler, options = {}) => canvas.addEventListener(name, handler, { ...options, signal: events.signal });
  listen("wheel", event => { event.preventDefault(); const p = point(event); zoomAt(Math.exp(clamp(-event.deltaY * 0.002, -0.4, 0.4)), p.x, p.y); }, { passive: false });
  listen("pointerdown", event => {
    if (event.button !== 0) return;
    camera = pulse = undefined;
    invalidate();
    canvas.focus({ preventScroll: true }); canvas.setPointerCapture(event.pointerId);
    if (!pointers.size) pressPosition = point(event);
    pointers.set(event.pointerId, point(event)); moved = pointers.size > 1;
  });
  listen("pointermove", event => {
    if (!pointers.has(event.pointerId)) return;
    const previous = [...pointers.values()], from = pointers.get(event.pointerId), to = point(event);
    pointers.set(event.pointerId, to);
    if (Math.hypot(to.x - pressPosition.x, to.y - pressPosition.y) > 4) moved = true;
    if (pointers.size === 1) { view.x += to.x - from.x; view.y += to.y - from.y; invalidate(); }
    else {
      const current = [...pointers.values()];
      const distance = points => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const x = (current[0].x + current[1].x) / 2, y = (current[0].y + current[1].y) / 2;
      view.x += x - (previous[0].x + previous[1].x) / 2; view.y += y - (previous[0].y + previous[1].y) / 2;
      zoomAt(distance(current) / Math.max(1, distance(previous)), x, y);
    }
  });
  listen("pointerup", event => { const p = point(event); if (pointers.size === 1 && !moved) hit(p.x, p.y); pointers.delete(event.pointerId); });
  listen("pointercancel", event => { pointers.delete(event.pointerId); moved = true; });
  listen("keydown", event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (["+", "=", "-"].includes(event.key)) zoomAt(event.key === "-" ? 0.8 : 1.25);
    else if (event.key === "Home") fit();
    else if (event.key.toLowerCase() === "f") fit(true);
    else if (event.key === "Enter") hit(width / 2, height / 2);
    else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      camera = pulse = undefined;
      view.x += event.key === "ArrowLeft" ? 40 : event.key === "ArrowRight" ? -40 : 0;
      view.y += event.key === "ArrowUp" ? 40 : event.key === "ArrowDown" ? -40 : 0; invalidate();
    } else return;
    event.preventDefault();
  });
  const observer = new ResizeObserver(resize), theme = new MutationObserver(invalidate);
  observer.observe(canvas); theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
  resize();
  return {
    setTrace(trace) {
      camera = pulse = undefined;
      selected = undefined;
      activeNodes = new Set((trace?.nodes || []).filter(id => layout.indexes.has(id)));
      activeEdges = new Set((trace?.edges || []).map(edgeKey).filter(key => edgeKeys.has(key)));
      invalidate();
    },
    pulse(repeat = false) {
      if (destroyed || reducedMotion.matches || !activeNodes.size) return;
      // ponytail: repeat within the existing frame loop; hover exit and camera controls cancel it.
      pulse = { repeat }; invalidate();
    },
    stopPulse() { pulse = undefined; invalidate(); },
    select, fit, zoom: zoomAt,
    destroy() { destroyed = true; camera = pulse = undefined; canvas.dataset.pulseActive = "false"; onAnchor?.(null); cancelAnimationFrame(frame); events.abort(); observer.disconnect(); theme.disconnect(); pointers.clear(); },
  };
}

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { layoutNetwork, createNetwork } from "../assets/certichat-network.js";

test("network layout retains every real concept and edge with deterministic finite positions", () => {
  const graph = JSON.parse(readFileSync(new URL("../data/certichat-graph.json", import.meta.url)));
  const original = JSON.stringify(graph), first = layoutNetwork(graph), second = layoutNetwork(graph);
  assert.deepEqual(first.nodes, second.nodes);
  assert.equal(first.nodes.length, graph.nodes.length);
  assert.equal(first.edges.length, graph.edges.length);
  assert.equal(new Set(first.nodes.map(node => `${node.x},${node.y}`)).size, graph.nodes.length);
  for (const node of first.nodes) assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y) && Math.abs(node.x) < 10000 && Math.abs(node.y) < 10000);
  for (const edge of first.edges) assert.ok(first.nodes[edge.a] && first.nodes[edge.b]);
  const xs = first.nodes.map(node => node.x), ys = first.nodes.map(node => node.y);
  const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
  const center = { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 };
  const corners = first.nodes.filter(node => Math.abs(node.x - center.x) > width * 0.375 && Math.abs(node.y - center.y) > height * 0.375);
  assert.ok(corners.length < first.nodes.length * 0.02, "layout must not retain the rectangular seed's populated corners");
  const hub = first.nodes.reduce((a, b) => a.degree > b.degree ? a : b);
  assert.ok(Math.hypot(hub.x - center.x, hub.y - center.y) < Math.min(width, height) * 0.2, "the main hub must grow near the network center, not a grid corner");
  assert.ok(hub.radius > Math.min(...first.nodes.map(node => node.radius)) * 3, "real relation counts must produce visibly different sizes");
  assert.equal(JSON.stringify(graph), original);
});

test("layout preserves islands and self edges without introducing connections", () => {
  const graph = { nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "island", label: "Isla" }], edges: [{ source: "a", target: "b", label: "link" }, { source: "b", target: "b", label: "self" }] };
  const layout = layoutNetwork(graph);
  assert.equal(layout.nodes.length, 3);
  assert.deepEqual(layout.edges.map(edge => [layout.nodes[edge.a].id, layout.nodes[edge.b].id]), [["a", "b"], ["b", "b"]]);
  const [a, b, island] = layout.nodes;
  assert.deepEqual(layout.nodes.map(node => node.degree), [1, 2, 0], "count each incident relationship once, including a self edge");
  assert.ok(b.radius > a.radius && a.radius > island.radius && island.radius > 0);
  assert.ok(Math.abs((b.radius ** 2 - a.radius ** 2) - (a.radius ** 2 - island.radius ** 2)) < 1e-10, "equal increments of relationships add equal node area");
  assert.equal(layoutNetwork({ nodes: [], edges: [] }).nodes.length, 0);
});

test("Canvas preserves trace membership, camera control and selection styling", () => {
  const keys = ["window", "document", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "ResizeObserver", "MutationObserver"];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const frames = new Map(), fills = [], strokes = [], tags = [], events = new Map(), motion = { matches: true };
  let destroyed = 0, frameId = 0;
  const observer = class { observe() {} disconnect() { destroyed++; } };
  Object.assign(globalThis, { window: { devicePixelRatio: 3, matchMedia: () => motion }, document: { documentElement: {} }, getComputedStyle: () => ({ getPropertyValue: () => "" }), requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame: id => frames.delete(id), ResizeObserver: observer, MutationObserver: observer });
  const step = (time = 0) => { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(time); };
  const flush = () => { for (let count = 0; frames.size; count++) { assert.ok(count < 100, "renderer must stop requesting frames when idle"); step(count * 16); } };
  const context = { setTransform() {}, clearRect() {}, translate() {}, scale(value) { this.zoom = value; }, beginPath() { this.radii = []; }, moveTo() {}, lineTo() {}, arc(x, y, radius) { this.radii.push(radius * this.zoom); }, stroke() { strokes.push({ color: this.strokeStyle, radii: this.radii }); }, fill() { fills.push({ color: this.fillStyle, radii: this.radii }); }, roundRect(x, y, width, height, radius) { tags.push({ x, y, width, height, radius }); }, fillText() {}, measureText: text => ({ width: text.length * 7 }) };
  const canvas = { clientWidth: 390, clientHeight: 400, style: {}, dataset: {}, hasAttribute: () => false, getContext: () => context, addEventListener: (name, handler) => events.set(name, handler), focus() {}, setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  const graph = { nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }], edges: [{ source: "a", target: "b", label: "uses" }, { source: "b", target: "c", label: "contains" }] };
  try {
    const renderer = createNetwork(canvas, graph, () => {});
    flush();
    assert.equal(canvas.width, 780);
    assert.equal(canvas.dataset.nodeCount, "3");
    assert.equal(canvas.dataset.edgeCount, "2");
    assert.equal(canvas.dataset.activeNodeCount, "0");
    const grayRadii = fills.find(fill => fill.color === "#747680").radii;
    assert.ok(grayRadii[1] > grayRadii[0] && grayRadii[0] === grayRadii[2], "gray node sizes must follow their relationship counts");
    renderer.select("a"); flush();
    assert.equal(canvas.dataset.activeNodeCount, "0", "search must not fabricate retrieval evidence");
    const selected = layoutNetwork(graph).nodes[0], tag = tags.at(-1), scale = Number(canvas.dataset.scale);
    assert.ok(Math.abs(tag.x + tag.width / 2 - (selected.x * scale + Number(canvas.dataset.panX))) < 1e-10, "concept tag must center over its node");
    assert.ok(Math.abs(tag.y + tag.height + 8 + selected.radius - (selected.y * scale + Number(canvas.dataset.panY))) < 1e-10, "concept tag must float above the node with a gap");
    assert.equal(tag.height, 24); assert.equal(tag.radius, 4);
    assert.equal(strokes.findLast(stroke => stroke.radii.length === 1).color, "#c74634", "selection ring must be red without changing trace membership");
    assert.equal(fills.at(-1).color, "#f1efed");
    const pointerPan = { button: 0, pointerId: 1, clientX: 0, clientY: 0 };
    const nearEdge = { ...pointerPan, clientX: 12 - (selected.x * scale + Number(canvas.dataset.panX)), clientY: 12 - (selected.y * scale + Number(canvas.dataset.panY)) };
    events.get("pointerdown")(pointerPan); events.get("pointermove")(nearEdge); events.get("pointerup")(nearEdge); flush();
    assert.deepEqual([tags.at(-1).x, tags.at(-1).y], [8, 8], "tag must remain within the viewport for a visible node near the edge");
    const tagCount = tags.length;
    events.get("pointerdown")(pointerPan);
    events.get("pointermove")({ ...pointerPan, clientX: -1000, clientY: -1000 });
    events.get("pointerup")({ ...pointerPan, clientX: -1000, clientY: -1000 }); flush();
    assert.equal(tags.length, tagCount, "offscreen nodes must not leave detached labels pinned to a corner");
    renderer.fit(); flush();
    renderer.setTrace({ nodes: ["a", "b", "missing"], edges: [graph.edges[0], { source: "b", target: "a", label: "uses" }] }); flush();
    assert.equal(canvas.dataset.activeNodeCount, "2");
    assert.equal(canvas.dataset.activeEdgeCount, "1", "edge direction must match the graph");
    const redRadii = fills.findLast(fill => fill.color === "#c74634").radii;
    assert.ok(redRadii[1] > redRadii[0] && redRadii[0] > grayRadii[0], "trace keeps relation-based sizes and highlights both nodes");
    renderer.setTrace({ nodes: ["c"], edges: [] }); flush();
    assert.equal(canvas.dataset.activeNodeCount, "1", "a later query replaces the earlier trace");
    assert.equal(canvas.dataset.activeEdgeCount, "0");
    const before = Number(canvas.dataset.scale);
    renderer.zoom(1.25); flush();
    assert.ok(Number(canvas.dataset.scale) > before);
    assert.deepEqual(fills.findLast(fill => fill.color === "#747680").radii, grayRadii, "zoom must preserve legible relative node sizes");
    renderer.fit(true); flush();
    assert.ok(Number.isFinite(Number(canvas.dataset.panX)));
    renderer.setTrace(null); flush();
    assert.equal(canvas.dataset.activeNodeCount, "0");
    assert.ok(events.has("pointermove") && events.has("wheel") && events.has("keydown"));
    const pose = () => ["scale", "panX", "panY"].map(key => Number(canvas.dataset[key]));
    renderer.setTrace({ nodes: ["c"], edges: [] }); renderer.fit(true); flush();
    const target = pose();
    assert.equal(canvas.dataset.cameraMoving, "false", "reduced motion must fit immediately");
    renderer.fit(); renderer.zoom(0.5); flush();
    const start = pose();
    motion.matches = false;
    renderer.fit(true); step(1000);
    assert.deepEqual(pose(), start, "query fit must begin from the current camera without jumping");
    assert.equal(canvas.dataset.cameraMoving, "true");
    step(1210);
    for (const [index, value] of pose().entries()) assert.ok(Math.abs(value - (start[index] + target[index]) / 2) < 1e-9, "camera must interpolate pan and zoom halfway");
    step(1420);
    assert.deepEqual(pose(), target);
    assert.equal(frames.size, 0, "completed motion must not leave a permanent animation loop");
    let time = 2000;
    const startKeyboardFit = () => {
      renderer.setTrace({ nodes: ["c"], edges: [] }); renderer.fit(); renderer.zoom(0.5); step(time);
      events.get("keydown")({ key: "f", preventDefault() {} }); step(time += 16); step(time += 100);
      assert.equal(canvas.dataset.cameraMoving, "true", "F must use the same animated query fit");
    };
    for (const [name, interrupt] of [
      ["zoom", () => renderer.zoom(1.1)],
      ["keyboard pan", () => events.get("keydown")({ key: "ArrowRight", preventDefault() {} })],
      ["pointer pan", () => { events.get("pointerdown")(pointerPan); events.get("pointermove")({ ...pointerPan, clientX: 20 }); events.get("pointerup")({ ...pointerPan, clientX: 20 }); }],
      ["new trace", () => renderer.setTrace({ nodes: ["a"], edges: [] })],
      ["show all", () => renderer.fit()],
    ]) {
      startKeyboardFit(); interrupt(); step(time += 1000);
      const stopped = pose(); step(time += 1000);
      assert.deepEqual(pose(), stopped, `${name} must prevent the previous camera animation from resuming`);
      assert.equal(canvas.dataset.cameraMoving, "false"); assert.equal(frames.size, 0);
    }
    startKeyboardFit(); motion.matches = true; step(time += 16);
    assert.deepEqual(pose(), target, "enabling reduced motion during travel must finish immediately");
    assert.equal(frames.size, 0);
    motion.matches = false; startKeyboardFit();
    renderer.destroy();
    assert.equal(destroyed, 2);
    assert.equal(frames.size, 0, "destroy must cancel a pending camera frame");
    let picked;
    const hub = createNetwork(canvas, { nodes: [{ id: "hub", label: "Centro" }], edges: Array.from({ length: 400 }, (_, i) => ({ source: "hub", target: "hub", label: String(i) })) }, id => { picked = id; });
    hub.setTrace({ nodes: ["hub"], edges: [] }); flush();
    const radius = fills.findLast(fill => fill.color === "#c74634").radii[0];
    assert.ok(radius > 14);
    const pointer = { button: 0, pointerId: 1, clientX: 195 + radius - 1, clientY: 200 };
    events.get("pointerdown")(pointer); events.get("pointerup")(pointer);
    assert.equal(picked, "hub", "large highlighted nodes must be selectable at their visible edge");
    picked = undefined; pointer.clientX = 195 + radius + 5;
    events.get("pointerdown")(pointer); events.get("pointerup")(pointer);
    assert.equal(picked, undefined, "hit testing must not select outside the node's touch allowance");
    hub.destroy();
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});

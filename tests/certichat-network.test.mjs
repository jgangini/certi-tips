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
  const frames = new Map(), fills = [], strokes = [], anchors = [], zooms = [], events = new Map(), motion = { matches: true };
  let destroyed = 0, frameId = 0;
  const observer = class { observe() {} disconnect() { destroyed++; } };
  Object.assign(globalThis, { window: { devicePixelRatio: 3, matchMedia: () => motion }, document: { documentElement: {} }, getComputedStyle: () => ({ getPropertyValue: () => "" }), requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame: id => frames.delete(id), ResizeObserver: observer, MutationObserver: observer });
  const step = (time = 0) => { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(time); };
  const flush = () => { for (let count = 0; frames.size; count++) { assert.ok(count < 100, "renderer must stop requesting frames when idle"); step(count * 16); } };
  const context = { setTransform() {}, clearRect() {}, translate() {}, scale(value) { this.zoom = value; }, beginPath() { this.radii = []; }, moveTo() {}, lineTo() {}, arc(x, y, radius) { this.radii.push(radius * this.zoom); }, stroke() { strokes.push({ color: this.strokeStyle, radii: this.radii, opacity: this.globalAlpha }); }, fill() { fills.push({ color: this.fillStyle, radii: this.radii, opacity: this.globalAlpha }); } };
  const canvas = { clientWidth: 390, clientHeight: 400, style: {}, dataset: {}, hasAttribute: () => false, getContext: () => context, addEventListener: (name, handler) => events.set(name, handler), focus() {}, setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  const graph = { nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }], edges: [{ source: "a", target: "b", label: "uses" }, { source: "b", target: "c", label: "contains" }] };
  try {
    const renderer = createNetwork(canvas, graph, () => {}, anchor => anchors.push(anchor), percent => zooms.push(percent));
    flush();
    assert.equal(canvas.width, 780);
    assert.equal(canvas.dataset.nodeCount, "3");
    assert.equal(canvas.dataset.edgeCount, "2");
    assert.equal(canvas.dataset.activeNodeCount, "0");
    const grayRadii = fills.find(fill => fill.color === "#747680").radii;
    assert.equal(fills.find(fill => fill.color === "#747680").opacity, 0.5);
    assert.equal(strokes.find(stroke => stroke.color === "#747680").opacity, 0.12);
    assert.ok(grayRadii[1] > grayRadii[0] && grayRadii[0] === grayRadii[2], "gray node sizes must follow their relationship counts");
    renderer.select("a"); flush();
    assert.equal(canvas.dataset.activeNodeCount, "0", "search must not fabricate retrieval evidence");
    const selected = layoutNetwork(graph).nodes[0], anchor = anchors.at(-1), scale = Number(canvas.dataset.scale);
    assert.ok(Math.abs(anchor.x - (selected.x * scale + Number(canvas.dataset.panX))) < 1e-10, "concept card anchor must center over its node");
    assert.ok(Math.abs(anchor.y + 8 + selected.radius - (selected.y * scale + Number(canvas.dataset.panY))) < 1e-10, "concept card anchor must float above the node with a gap");
    assert.equal(anchor.id, "a");
    assert.equal(strokes.findLast(stroke => stroke.radii.length === 1).color, "#c74634", "selection ring must be red without changing trace membership");
    const pointerPan = { button: 0, pointerId: 1, clientX: 0, clientY: 0 };
    const nearEdge = { ...pointerPan, clientX: 12 - (selected.x * scale + Number(canvas.dataset.panX)), clientY: 12 - (selected.y * scale + Number(canvas.dataset.panY)) };
    events.get("pointerdown")(pointerPan); events.get("pointermove")(nearEdge); events.get("pointerup")(nearEdge); flush();
    assert.equal(anchors.at(-1).id, "a", "near-edge nodes retain a card anchor for viewport clamping");
    events.get("pointerdown")(pointerPan);
    events.get("pointermove")({ ...pointerPan, clientX: -1000, clientY: -1000 });
    events.get("pointerup")({ ...pointerPan, clientX: -1000, clientY: -1000 }); flush();
    assert.equal(anchors.at(-1), null, "offscreen nodes must not leave detached labels pinned to a corner");
    renderer.fit(); flush();
    renderer.setTrace({ nodes: ["a", "b", "missing"], edges: [graph.edges[0], { source: "b", target: "a", label: "uses" }] }); flush();
    assert.equal(anchors.at(-1), null, "new evidence clears the previous selected concept");
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
    assert.equal(zooms.at(-1), Math.round(Number(canvas.dataset.scale) * 100), "zoom badge must track the actual camera scale");
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
    renderer.fit(); renderer.zoom(.2); flush();
    const centerStart = pose(), centeredNode = layoutNetwork(graph).nodes[2];
    motion.matches = false; renderer.select("c", true); step(5000);
    assert.deepEqual(pose(), centerStart, "map flight starts from the current camera without jumping");
    step(5350);
    assert.equal(canvas.dataset.cameraMoving, "true", "concept tag selection must use smooth camera motion");
    assert.ok(pose()[0] < centerStart[0], "map flight must first pull back");
    step(5700); const overviewScale = pose()[0];
    step(6050); assert.ok(pose()[0] > overviewScale, "map flight must approach the selected concept after pulling back");
    step(6400);
    assert.equal(pose()[0], 2, "concept navigation must finish at a close zoom");
    assert.equal(zooms.at(-1), 200);
    assert.equal(canvas.dataset.cameraMoving, "false");
    assert.ok(Math.abs(centeredNode.x * pose()[0] + pose()[1] - canvas.clientWidth / 2) < 1e-9);
    assert.ok(Math.abs(centeredNode.y * pose()[0] + pose()[2] - canvas.clientHeight / 2) < 1e-9);
    renderer.select("a", true); step(6420); step(6490); renderer.zoom(1.1); step(6500);
    const interrupted = pose(); step(6600);
    assert.deepEqual(pose(), interrupted, "manual zoom cancels both stages of concept navigation");
    assert.equal(canvas.dataset.cameraMoving, "false");
    assert.equal(frames.size, 0);
    renderer.setTrace({ nodes: ["a", "b"], edges: [] }); flush();
    const pulseStart = strokes.length;
    renderer.pulse(); step(6000);
    const firstWave = strokes.slice(pulseStart).find(stroke => stroke.color === "#c74634" && stroke.opacity === 0.38);
    assert.equal(firstWave.radii.length, 2, "waves must mark only the retrieved nodes");
    assert.equal(canvas.dataset.pulseActive, "true");
    const pulseMiddle = strokes.length;
    step(6480);
    const fadingWave = strokes.slice(pulseMiddle).find(stroke => stroke.color === "#c74634" && stroke.opacity < 0.38);
    assert.ok(fadingWave.radii[0] > firstWave.radii[0] && fadingWave.opacity < firstWave.opacity, "red waves must expand and fade");
    step(7200);
    assert.equal(canvas.dataset.pulseActive, "false");
    assert.equal(frames.size, 0, "pulse must stop requesting frames after 1.2 seconds");
    renderer.pulse(true); step(10000);
    const repeatedWave = strokes.findLast(stroke => stroke.color === "#c74634" && stroke.opacity === 0.38);
    step(11200); step(12400);
    assert.equal(canvas.dataset.pulseActive, "true", "hover must repeat beyond the single-click pulse duration");
    assert.deepEqual(strokes.findLast(stroke => stroke.color === "#c74634" && stroke.opacity === 0.38).radii, repeatedWave.radii, "each hover cycle highlights only the same retrieved nodes");
    renderer.stopPulse(); step(12416);
    assert.equal(canvas.dataset.pulseActive, "false");
    assert.equal(frames.size, 0, "leaving the answer must stop the repeated frame loop");
    const selectedStart = strokes.length;
    renderer.select("c"); step(14000);
    const selectedWave = strokes.slice(selectedStart).find(stroke => stroke.color === "#c74634" && stroke.opacity === 0.38);
    assert.deepEqual(selectedWave.radii, [grayRadii[2] + 4], "selection waves must target only the selected node, without marking it as retrieved");
    assert.equal(canvas.dataset.activeNodeCount, "2");
    assert.ok(!strokes.slice(selectedStart).some(stroke => stroke.color === "#c74634" && stroke.radii.length === 1 && stroke.opacity === 1), "normal motion must not leave a fixed selection ring");
    const selectedMiddle = strokes.length; step(14480);
    assert.ok(strokes.slice(selectedMiddle).some(stroke => stroke.color === "#c74634" && stroke.radii.length === 1 && stroke.radii[0] > selectedWave.radii[0] && stroke.opacity < selectedWave.opacity), "the selected node's waves must expand and fade");
    step(15200); step(16400);
    assert.equal(canvas.dataset.pulseActive, "true", "selected node waves repeat while its card remains selected");
    renderer.select("missing"); step(16416);
    assert.equal(anchors.at(-1), null);
    assert.equal(canvas.dataset.pulseActive, "false");
    assert.equal(frames.size, 0, "invalid selection must not retain an animation loop");
    for (const interrupt of [() => renderer.zoom(1.1), () => renderer.fit(),
      () => events.get("pointerdown")(pointerPan),
      () => events.get("keydown")({ key: "ArrowRight", preventDefault() {} }),
      () => renderer.setTrace({ nodes: ["c"], edges: [] })]) {
      renderer.pulse(true); step(8000); interrupt(); step(8016);
      assert.equal(canvas.dataset.pulseActive, "false", "manual camera controls and new evidence must cancel the pulse");
      assert.equal(frames.size, 0);
    }
    motion.matches = true; renderer.pulse(true);
    assert.equal(frames.size, 0, "reduced motion must not start a pulse");
    motion.matches = false; renderer.pulse(true); step(9000); motion.matches = true; step(9016);
    assert.equal(canvas.dataset.pulseActive, "false", "enabling reduced motion must stop an active pulse");
    assert.equal(frames.size, 0);
    motion.matches = true; renderer.select("a", true); flush();
    assert.equal(canvas.dataset.cameraMoving, "false", "reduced motion centers concepts immediately");
    motion.matches = false; startKeyboardFit(); renderer.pulse(true);
    renderer.destroy();
    assert.equal(canvas.dataset.pulseActive, "false");
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

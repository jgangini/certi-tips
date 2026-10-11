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
  assert.equal(JSON.stringify(graph), original);
});

test("layout preserves islands and self edges without introducing connections", () => {
  const graph = { nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "island", label: "Isla" }], edges: [{ source: "a", target: "b", label: "link" }, { source: "b", target: "b", label: "self" }] };
  const layout = layoutNetwork(graph);
  assert.equal(layout.nodes.length, 3);
  assert.deepEqual(layout.edges.map(edge => [layout.nodes[edge.a].id, layout.nodes[edge.b].id]), [["a", "b"], ["b", "b"]]);
  assert.equal(layoutNetwork({ nodes: [], edges: [] }).nodes.length, 0);
});

test("Canvas highlights only current trace members and leaves search selection independent", () => {
  const keys = ["window", "document", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "ResizeObserver", "MutationObserver"];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const frames = [], fills = [], events = new Map();
  let destroyed = 0;
  const observer = class { observe() {} disconnect() { destroyed++; } };
  Object.assign(globalThis, { window: { devicePixelRatio: 3 }, document: { documentElement: {} }, getComputedStyle: () => ({ getPropertyValue: () => "" }), requestAnimationFrame: fn => { frames.push(fn); return frames.length; }, cancelAnimationFrame() {}, ResizeObserver: observer, MutationObserver: observer });
  const flush = () => { while (frames.length) frames.shift()(); };
  const context = { setTransform() {}, clearRect() {}, translate() {}, scale() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, stroke() {}, fill() { fills.push(this.fillStyle); }, fillRect() {}, fillText() {}, measureText: text => ({ width: text.length * 7 }) };
  const canvas = { clientWidth: 390, clientHeight: 400, style: {}, dataset: {}, hasAttribute: () => false, getContext: () => context, addEventListener: (name, handler) => events.set(name, handler) };
  const graph = { nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }], edges: [{ source: "a", target: "b", label: "uses" }, { source: "b", target: "c", label: "contains" }] };
  try {
    const renderer = createNetwork(canvas, graph, () => {});
    flush();
    assert.equal(canvas.width, 780);
    assert.equal(canvas.dataset.nodeCount, "3");
    assert.equal(canvas.dataset.edgeCount, "2");
    assert.equal(canvas.dataset.activeNodeCount, "0");
    renderer.select("a"); flush();
    assert.equal(canvas.dataset.activeNodeCount, "0", "search must not fabricate retrieval evidence");
    renderer.setTrace({ nodes: ["a", "b", "missing"], edges: [graph.edges[0], { source: "b", target: "a", label: "uses" }] }); flush();
    assert.equal(canvas.dataset.activeNodeCount, "2");
    assert.equal(canvas.dataset.activeEdgeCount, "1", "edge direction must match the graph");
    assert.ok(fills.includes("#c74634"));
    renderer.setTrace({ nodes: ["c"], edges: [] }); flush();
    assert.equal(canvas.dataset.activeNodeCount, "1", "a later query replaces the earlier trace");
    assert.equal(canvas.dataset.activeEdgeCount, "0");
    const before = Number(canvas.dataset.scale);
    renderer.zoom(1.25); flush();
    assert.ok(Number(canvas.dataset.scale) > before);
    renderer.fit(true); flush();
    assert.ok(Number.isFinite(Number(canvas.dataset.panX)));
    renderer.setTrace(null); flush();
    assert.equal(canvas.dataset.activeNodeCount, "0");
    assert.ok(events.has("pointermove") && events.has("wheel") && events.has("keydown"));
    renderer.destroy();
    assert.equal(destroyed, 2);
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});

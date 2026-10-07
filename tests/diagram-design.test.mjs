import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const diagrams = new URL("../assets/diagrams/", import.meta.url);
const readDiagram = (name) => readFileSync(new URL(name, diagrams), "utf8");
const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map(([, key, , value]) => [key, value]));
const declaration = (style, property) => [...(style || "").matchAll(/([\w-]+)\s*:\s*([^;]+)/g)].filter(([, name]) => name === property).at(-1)?.[2].trim();

test("OCI icon badges have a visible border against both their fill and surrounding gradients", () => {
  const luminance = (hex) => {
    assert.match(hex, /^#(?:[\da-f]{3}|[\da-f]{6})$/i, "Badge contrast requires an opaque hex color");
    const expanded = hex.length === 4 ? hex.slice(1).split("").map(c => c + c).join("") : hex.slice(1);
    const rgb = expanded.match(/../g).map(channel => parseInt(channel, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
  assert.equal(contrast("#000", "#fff"), 21);
  let count = 0;
  for (const name of readdirSync(diagrams).filter(name => /^ocif-.*\.svg$/.test(name))) {
    const source = readDiagram(name);
    const backgrounds = [...source.matchAll(/stop-color="([^"]+)"/g)].map(([, color]) => color);
    for (const [, body] of source.matchAll(/<g data-artwork="true" data-badge="true">([\s\S]*?)<\/g>/g)) {
      const circle = attributes(body.match(/<circle\b([^>]*)>/)[1]);
      assert.ok(Number(circle["stroke-width"]) >= 2, `${name}: badge border is too thin`);
      for (const background of [circle.fill, "#f7f8fc", ...backgrounds]) {
        assert.ok(contrast(circle.stroke, background) >= 3, `${name}: badge border merges with ${background}`);
      }
      count++;
    }
  }
  assert.ok(count > 0, "No OCI badges were checked");
});

function properties(source, tag, attrs, inherited = {}, checked = ["marker-end"]) {
  const values = { ...inherited };
  for (const property of checked) {
    if (attrs[property]) values[property] = attrs[property];
    let specificity = -1;
    // ponytail: these native SVGs use tag/class selectors; reject other selectors
    // affecting the checked properties rather than silently pretending to be a CSS engine.
    for (const [, stylesheet] of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) {
      for (const [, selectors, body] of stylesheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const value = declaration(body, property);
        if (!value) continue;
        for (const selector of selectors.split(",").map((item) => item.trim())) {
          const parts = selector.match(/^([a-z][\w-]*)?((?:\.[\w-]+)*)$/i);
          assert.ok(parts, `Unsupported ${property} selector: ${selector}`);
          const classes = parts[2].split(".").filter(Boolean);
          const weight = (parts[1] ? 1 : 0) + classes.length * 10;
          if ((!parts[1] || parts[1] === tag) && classes.every((name) => (attrs.class || "").split(/\s+/).includes(name)) && weight >= specificity) {
            values[property] = value;
            specificity = weight;
          }
        }
      }
    }
    const inline = declaration(attrs.style, property);
    if (inline) values[property] = inline;
  }
  return values;
}

function connectors(source) {
  const stack = [];
  const result = [];
  for (const [, closing, tag, raw] of source.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<(\/?)([\w:-]+)\b([^>]*)>/g)) {
    if (closing) { stack.pop(); continue; }
    const attrs = attributes(raw);
    const style = properties(source, tag, attrs, stack.at(-1)?.style);
    if (tag === "path" && !stack.some((node) => node.tag === "marker") && /url\(/.test(style["marker-end"] || "")) result.push(attrs.d || "");
    if (!/\/\s*$/.test(raw)) stack.push({ tag, style });
  }
  return result;
}

test("each arrow-bearing connector is a single continuous SVG subpath", () => {
  const sample = '<svg><style>.route{marker-end:url(#a)}</style><defs><marker id="a"><path d="M0 0m1 1"/></marker></defs><path class="route" d="M0 0m1 1"/><g marker-end="url(#a)"><path d="M0 0L1 1"/></g><path style="marker-end:url(#a)" d="M1 1m2 2"/></svg>';
  assert.deepEqual(connectors(sample), ["M0 0m1 1", "M0 0L1 1", "M1 1m2 2"]);
  const issues = [];
  let count = 0;
  for (const name of readdirSync(diagrams).filter((name) => name.endsWith(".svg"))) {
    for (const path of connectors(readDiagram(name))) {
      count++;
      if ((path.match(/[Mm]/g) || []).length !== 1) issues.push(`${name}: ${path}`);
    }
  }
  assert.ok(count > 0, "No arrow connectors were checked");
  assert.deepEqual(issues, [], "Separate each connector into its own path so every edge receives an arrowhead");
});

test("OpenAI support step numbers explicitly resolve to white, not the global text fill", () => {
  const source = readDiagram("openai-support-steps.svg");
  const numbers = [...source.matchAll(/<text\b([^>]*)>\s*([1-5])\s*<\/text>/g)];
  assert.deepEqual(numbers.map(([, , value]) => value), ["1", "2", "3", "4", "5"]);
  for (const [, raw, number] of numbers) assert.match(properties(source, "text", attributes(raw), {}, ["fill"]).fill, /^(?:#fff(?:fff)?|white)$/i, `Step ${number} must override the text fill`);
});

test("the worked purchase example consistently uses US dollars", () => {
  const svg = readDiagram("agents-example.svg");
  const lesson = readFileSync(new URL("../content/agents.md", import.meta.url), "utf8");
  assert.match(svg, /USD\s+144/);
  assert.match(lesson, /USD\s+144/);
  assert.doesNotMatch(`${svg}\n${lesson}`, /S\/\s*\d|\bsoles\b/i);
});

test("the support case uses one OCI architecture instead of two competing examples", () => {
  const lesson = readFileSync(new URL("../content/agents.md", import.meta.url), "utf8");
  assert.equal((lesson.match(/assets\/diagrams\/oci-support\.svg/g) || []).length, 1);
  assert.doesNotMatch(lesson, /support-agent\.png/);
});

test("the agent pictogram is a robot, not a loop or a completion check", () => {
  const source = readDiagram("agents-objectives.svg");
  const concepts = [...source.matchAll(/<g\b[^>]*data-concept="([^"]+)"[^>]*data-icon="([^"]+)"[^>]*>(.*?)<\/g>/gs)];
  assert.deepEqual(concepts.map(([, concept, icon]) => [concept, icon]), [
    ["chatbot", "messages-square"], ["workflow", "workflow"], ["agent", "bot"],
  ]);
  for (const [, , icon, body] of concepts) {
    assert.ok(body.includes(`href="#${icon}"`));
    assert.match(body, /width="76" height="76"/);
    assert.ok(source.includes(`<symbol id="${icon}"`));
  }
  assert.doesNotMatch(source, /M-32-16A37|m-15 3 10 10 24-25/);
  assert.match(readDiagram("langchain-objectives.svg"), /data-icon="bot"/);
});

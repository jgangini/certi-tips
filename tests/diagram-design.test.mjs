import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";

const diagrams = new URL("../assets/diagrams/", import.meta.url);
const readDiagram = (name) => readFileSync(new URL(name, diagrams), "utf8");
const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map(([, key, , value]) => [key, value]));
const declaration = (style, property) => [...(style || "").matchAll(/([\w-]+)\s*:\s*([^;]+)/g)].filter(([, name]) => name === property).at(-1)?.[2].trim();

test("Modeling's three result cards align and each note follows its card", () => {
  const svg = readDiagram("gov-data-modeling-oracle.svg");
  const rects = [...svg.matchAll(/<rect\b[^>]*>/g)].map(([tag]) => attributes(tag));
  const firstHeader = rects.find(rect => rect.x === "96" && rect.y === "284" && rect.width === "576" && rect["data-cell-frame"] === "true");
  assert.equal(firstHeader?.height, "96", "The first column's dark fill ends with its header");
  assert.ok(rects.some(rect => rect.x === "96" && rect.y === "284" && rect.width === "1728" && rect.fill === "#FFFFFF"), "The stage body is white");
  for (const x of [128, 704, 1280]) {
    const card = rects.find(rect => Number(rect.x) === x && rect.y === "428" && rect.width === "512" && rect.fill === "none" && rect.stroke === "#59616E");
    const note = rects.find(rect => Number(rect.x) === x && rect.fill === "#F1EFED" && rect.height === "116");
    assert.ok(card && note, `Column ${x} has its card and explanatory block`);
    assert.equal(Number(card.height), 172, `Column ${x} has the common card height`);
    assert.equal(Number(note.y) - Number(card.y) - Number(card.height), 28, `Column ${x} places its note directly beneath the card`);
  }
  assert.doesNotMatch(svg, /<circle\b/, "The tabular result has no circle");
  assert.match(svg, /<tspan x="1536" y="538">1 cliente activo<\/tspan>/, "The single result row identifies the count");
  assert.match(svg, /<tspan x="1536" y="576">C7<\/tspan>/, "The same row identifies the client");
  const connector = [...svg.matchAll(/<line\b[^>]*>/g)].map(([tag]) => attributes(tag)).find(line => line.x1 === "640" && line.x2 === "704");
  assert.ok(connector && !connector["stroke-dasharray"], "The relationship connector is solid");
});

test("consent dates use the architecture timeline while retaining the evidence table", () => {
  const svg = readDiagram("gov-data-modeling-exercise.svg");
  assert.match(svg, /data-timeline="consent"/, "Consent uses a dedicated timeline panel");
  assert.doesNotMatch(svg, /id="consent-period"/, "The former consent band is removed");
  const circles = [...svg.matchAll(/<circle\b[^>]*>/g)].map(([tag]) => attributes(tag));
  assert.deepEqual(circles.map(circle => [circle.cx, circle.cy]), [["330", "480"], ["960", "480"], ["1620", "480"]]);
  for (const label of ["Autoriza", "Campaña", "Retira", "1 de marzo", "15 de abril", "20 de abril", "Cliente C7", "Uso comercial", "Aceptación y retiro"]) {
    assert.ok(svg.includes(`>${label}</tspan>`), `${label} remains readable`);
  }
  assert.match(svg, /d="M206 480 H1760 M1760 480 L1744 464 M1760 480 L1744 496"/, "The timeline is one continuous arrow");
});

test("marked table cells reject excess whitespace, off-center rows and avoidable header wrapping", () => {
  const script = readFileSync(new URL("../scripts/diagram-check.cjs", import.meta.url), "utf8");
  // ponytail: isolate the pure policy from the browser callback; real SVG geometry is measured by the DOM check.
  const start = script.indexOf("function tableCellIssues(cell)");
  const end = script.indexOf("\n      const tableCells =", start);
  assert.ok(start >= 0 && end > start, "Table cell policy must remain available to this regression check");
  const inspect = runInNewContext(`(${script.slice(start, end).trim()})`);
  const row = { kind: "row", height: 54, contentHeight: 34, dx: 90, dy: 0, labelDy: 0, paddingX: 16, paddingY: 10 };
  assert.equal(inspect(row).length, 0, "Left-aligned text is allowed");
  assert.ok(inspect({ ...row, height: 144, paddingY: 55 }).includes("cell-height"), "Centered text cannot justify a tall empty row");
  assert.ok(inspect({ ...row, dy: 7, paddingY: 3 }).includes("vertical-alignment"), "Valid row height cannot hide text displaced toward a border");
  const header = { ...row, kind: "header", height: 64, contentHeight: 40, paddingY: 12, whiteHeader: true, wrappedFits: true };
  assert.ok(inspect(header).includes("avoidable-header-wrap"));
  assert.equal(inspect({ ...header, wrappedFits: false }).length, 0);
  assert.equal(inspect({ ...header, height: 96, paddingY: 28, exception: "Two-line business rule retains the full term" }).length, 0);
  assert.ok(inspect({ ...row, exception: "Intentional layout", dy: 7 }).includes("vertical-alignment"), "An exception does not waive centering");

  const textBox = { left: 40, top: 19, width: 80, height: 34 };
  const label = { localName: "text", textContent: "Vigente", getBoundingClientRect: () => textBox };
  const tag = { nextElementSibling: label, getBoundingClientRect: () => ({ left: 20, top: 12, width: 120, height: 48 }) };
  const labelStart = script.indexOf("const labelDy =");
  const labelEnd = script.indexOf("\n        const wrappedFits =", labelStart);
  const tagStart = script.indexOf("const tagAlignment =");
  const tagEnd = script.indexOf("\n      const proximity =", tagStart);
  assert.ok(labelStart >= 0 && labelEnd > labelStart && tagStart >= 0 && tagEnd > tagStart);
  const measureRow = () => runInNewContext(`(() => { ${script.slice(labelStart, labelEnd)} return labelDy; })()`, {
    kind: "tag-row", frame: { top: 0, height: 72 }, scale: 1,
    labels: [{ getBoundingClientRect: () => ({ top: 19, height: 34 }) }, label],
  });
  const measureTag = () => runInNewContext(`(() => { ${script.slice(tagStart, tagEnd)} return tagAlignment; })()`, {
    root: { querySelectorAll: () => [tag] }, scale: 1,
  });
  const tagRow = { ...row, kind: "tag-row", height: 72, contentHeight: 48, paddingY: 12 };
  assert.equal(inspect({ ...tagRow, labelDy: measureRow() }).length, 0);
  assert.equal(measureTag().length, 0);
  textBox.top += 6;
  assert.ok(inspect({ ...tagRow, labelDy: measureRow() }).includes("vertical-alignment"), "A centered tag background must not hide displaced text in a row");
  assert.equal(measureTag().length, 1, "A tag must check its label independently of the unchanged background");
});

test("Governance icons retain reviewed source geometry and contain no active or external content", () => {
  const root = new URL("../", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("assets/icons/governance/manifest.json", root), "utf8"));
  const geometry = (svg) => [...svg.matchAll(/<(path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*)>/g)].map(([, tag, raw]) => {
    const attrs = attributes(raw);
    return [tag, Object.fromEntries(Object.entries(attrs).filter(([name]) => /^(?:d|points|x|y|x1|x2|y1|y2|width|height|rx|ry|r|cx|cy)$/.test(name)).sort())];
  });
  const sources = new Map();
  for (const icon of manifest.icons) {
    assert.match(icon.localFile, /^assets\/icons\/governance\/[\w-]+\.svg$/);
    assert.match(icon.discoveryUrl, /^https:\/\/www\.svgrepo\.com\//);
    const source = readFileSync(new URL(icon.localFile, root), "utf8").replace(/\r\n/g, "\n");
    assert.equal(createHash("sha256").update(source).digest("hex"), icon.sha256, icon.key);
    assert.doesNotMatch(source, /<(?:script|foreignObject|image|use|style|a)\b|\bon\w+\s*=|\bhref\s*=/i, icon.key);
    sources.set(icon.key, geometry(source));
  }
  let count = 0;
  for (const name of readdirSync(diagrams).filter(name => /^gov-.*\.svg$/.test(name))) {
    for (const [, key, body] of readDiagram(name).matchAll(/<g\b[^>]*data-svgrepo-icon="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g)) {
      assert.ok(sources.has(key), `${name}: undocumented icon ${key}`);
      assert.deepEqual(geometry(body), sources.get(key), `${name}: altered ${key} geometry`);
      count++;
    }
  }
  assert.ok(count > 0, "No sourced Governance icons were checked");
});

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

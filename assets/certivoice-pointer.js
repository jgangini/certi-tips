import { siteBase } from "./i18n.js";

export async function diagramPointer(answer, doc = document) {
  const viewer = doc.querySelector("#diagram-viewer[open].is-presenting[data-source-id]"), image = viewer?.querySelector(".dialog-content img");
  const mobile = matchMedia("(max-width: 800px)");
  if (!image || mobile.matches) return;
  const id = viewer.dataset.sourceId, src = image.currentSrc || image.src, url = new URL(src, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith(siteBase) || !url.pathname.endsWith(".svg")) return;
  let geometry;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return;
    const xml = await response.text();
    if (xml.length > 1000000) return;
    const source = new DOMParser().parseFromString(xml, "image/svg+xml").documentElement;
    const bounds = (source.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
    if (source.localName !== "svg" || bounds.length !== 4 || !bounds.every(Number.isFinite) || bounds[2] <= 0 || bounds[3] <= 0) return;
    // Only inert text geometry enters the page: no SVG markup, CSS, links or external resources.
    const copy = node => {
      const clone = doc.createElementNS("http://www.w3.org/2000/svg", node.localName);
      for (const key of ["x", "y", "dx", "dy", "transform", "font-size", "font-family", "font-weight", "text-anchor", "dominant-baseline"]) {
        if (node.hasAttribute(key)) clone.setAttribute(key, node.getAttribute(key));
      }
      for (const child of node.childNodes) {
        if (child.nodeType === 3) clone.append(doc.createTextNode(child.textContent));
        else if (["g", "text", "tspan"].includes(child.localName)) clone.append(copy(child));
      }
      return clone;
    };
    geometry = copy(source); geometry.setAttribute("viewBox", bounds.join(" "));
    geometry.setAttribute("aria-hidden", "true"); geometry.style.cssText = `position:fixed;left:-100000px;top:0;width:${bounds[2]}px;height:${bounds[3]}px;visibility:hidden;pointer-events:none`;
    doc.body.append(geometry);
    const normalize = text => " " + (text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).join(" ") + " ";
    const labels = [...geometry.querySelectorAll("text")].slice(0, 300).map(label => {
      const box = label.getBBox(), matrix = label.getCTM();
      return { text: normalize(label.textContent), point: matrix && new DOMPoint(box.x + box.width / 2, box.y + box.height + 5).matrixTransform(matrix) };
    }).filter(label => label.text.trim().length >= 3 && label.point && Number.isFinite(label.point.x) && Number.isFinite(label.point.y) && label.point.x >= 0 && label.point.x <= bounds[2] && label.point.y >= 0 && label.point.y <= bounds[3]);
    // ponytail: at most 300 labels, with a bounded O(n²) uniqueness scan; ambiguous duplicates or paraphrases need a verified spatial plan.
    const unique = labels.filter(label => labels.filter(other => other.text === label.text).length === 1);
    const locale = doc.documentElement.lang || "es";
    const words = [...new Intl.Segmenter(locale, { granularity: "word" }).segment(answer)].filter(word => word.isWordLike).map(word => ({ start: word.index, text: normalize(word.segment).trim() }));
    const plan = [...new Intl.Segmenter(locale, { granularity: "sentence" }).segment(answer)].map(sentence => ({ start: sentence.index }));
    words.forEach((word, index) => {
      const label = unique.filter(label => label.text.trim().split(" ").every((part, at) => words[index + at]?.text === part)).sort((a, b) => b.text.length - a.text.length)[0];
      if (label) plan.push({ start: word.start, label });
    });
    plan.sort((a, b) => a.start - b.start);
    if (mobile.matches || !plan.some(item => item.label) || !viewer.open || !viewer.classList.contains("is-presenting") || viewer.dataset.sourceId !== id || image.src !== src) return;
    const dot = doc.createElement("span"); dot.className = "certivoice-pointer"; dot.hidden = true; dot.setAttribute("aria-hidden", "true"); viewer.append(dot);
    let position = 0;
    const stop = () => { dot.remove(); observer.disconnect(); resize.disconnect(); };
    const follow = at => {
      if (mobile.matches) { stop(); return; }
      position = at;
      const label = plan.findLast(item => item.start <= at)?.label;
      dot.hidden = !label;
      if (!label) return;
      const box = image.getBoundingClientRect(), scale = Math.min(box.width / bounds[2], box.height / bounds[3]);
      dot.style.left = `${box.left + (box.width - bounds[2] * scale) / 2 + label.point.x * scale}px`;
      dot.style.top = `${box.top + (box.height - bounds[3] * scale) / 2 + label.point.y * scale}px`;
      dot.dataset.label = label.text.trim();
    };
    const observer = new MutationObserver(() => { if (!viewer.open || !viewer.classList.contains("is-presenting") || viewer.dataset.sourceId !== id || image.src !== src) stop(); });
    observer.observe(viewer, { attributes: true, attributeFilter: ["open", "class", "data-source-id"] }); observer.observe(image, { attributes: true, attributeFilter: ["src"] });
    const resize = new ResizeObserver(() => follow(position)); resize.observe(image); resize.observe(viewer);
    follow.stop = stop;
    return follow;
  } catch { return; } // A missing/unsupported label never blocks narration.
  finally { geometry?.remove(); }
}

const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const key = siteRoot => `certichat:${siteRoot}:graph`;

export function safeSourceURL(value, root) {
  try {
    const url = new URL(value), site = new URL(root);
    return url.protocol === "https:" && url.origin === site.origin && url.pathname.startsWith(site.pathname) && !url.username && !url.password && !url.search ? url.href : null;
  } catch { return null; }
}

function normalizeSources(values, ids, siteRoot) {
  if (!Array.isArray(values) || values.length > 512) return undefined;
  const seen = new Set();
  return values.flatMap(source => {
    if (!ids.has(source?.nodeId) || typeof source.title !== "string" || !source.title.trim() || source.title.length > 200 || typeof source.url !== "string" || source.url.length > 2048) return [];
    const url = safeSourceURL(source.url, siteRoot), key = `${source.nodeId}:${url}`;
    if (!url || seen.has(key)) return [];
    seen.add(key);
    return [{ nodeId: source.nodeId, title: source.title.trim(), url }];
  });
}

export function normalizeTrace(value, siteRoot) {
  if (!value || typeof value.version !== "string" || !/^[a-f0-9]{64}$/.test(value.version) || !Array.isArray(value.nodes) || value.nodes.length > 512 || !Array.isArray(value.edges) || value.edges.length > 1024) return null;
  if (!value.nodes.every(id => typeof id === "string" && uuid.test(id))) return null;
  const nodes = [...new Set(value.nodes)], ids = new Set(nodes);
  if (!value.edges.every(edge => edge && ids.has(edge.source) && ids.has(edge.target) && typeof edge.label === "string" && edge.label.length <= 160)) return null;
  const trace = { version: value.version, nodes, edges: value.edges.map(({ source, target, label }) => ({ source, target, label })), truncated: value.truncated === true };
  const sources = normalizeSources(value.sources, ids, siteRoot);
  if (sources) trace.sources = sources;
  return trace;
}

export function readTrace(siteRoot, now = Date.now()) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key(siteRoot)));
    if (Number.isFinite(saved?.updatedAt) && saved.updatedAt <= now && now - saved.updatedAt < 86400000) return normalizeTrace(saved.trace, siteRoot);
    sessionStorage.removeItem(key(siteRoot));
  } catch { /* The map works without browser storage. */ }
  return null;
}

export function publishTrace(siteRoot, status, value) {
  const trace = status === "ready" ? normalizeTrace(value, siteRoot) : null;
  try {
    if (trace) sessionStorage.setItem(key(siteRoot), JSON.stringify({ updatedAt: Date.now(), trace }));
    else sessionStorage.removeItem(key(siteRoot));
  } catch { /* Keep the live update when browser storage is unavailable. */ }
  window.dispatchEvent(new CustomEvent("certichat:trace", { detail: { status, trace } }));
}

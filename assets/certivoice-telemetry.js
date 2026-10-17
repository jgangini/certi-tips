// Operational metadata only: never record status text, prompts, answers, audio or cookies.
export function voiceDiagnostics(config) {
  const key = `certivoice:${config.dataset.siteRoot}:trace`, now = Date.now();
  let trace, createdAt = now;
  try {
    const saved = JSON.parse(sessionStorage.getItem(key));
    if (/^[0-9a-f]{32}$/.test(saved?.id) && Number.isFinite(saved.at) && saved.at <= now && now - saved.at < 86400000) { trace = saved.id; createdAt = saved.at; }
  } catch { /* Diagnostics also work without storage. */ }
  trace ||= crypto.randomUUID().replaceAll("-", "");
  try { sessionStorage.setItem(key, JSON.stringify({ id: trace, at: createdAt })); } catch { /* Optional continuity. */ }
  config.dataset.voiceTrace = trace;
  const headers = requestId => ({ traceparent: `00-${trace}-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}-01`, "X-Request-ID": requestId || crypto.randomUUID() });
  let queue = [], timer, enabled = false, blocked = false, sending = false;
  async function flush(force = false) {
    clearTimeout(timer); timer = undefined;
    if (sending && !force || blocked || !queue.length) return;
    const events = queue.splice(0, 12); sending = true;
    try {
      const response = await fetch(`${config.dataset.api}/api/events`, { method: "POST", credentials: "include", keepalive: true,
        headers: { "X-CertiChat": "1", "Content-Type": "application/json", ...headers() }, body: JSON.stringify({ events }), signal: AbortSignal.timeout(5000) });
      if (!response.ok) { blocked = true; queue = []; }
    } catch { blocked = true; queue = []; } // No retries or diagnostic failures in the voice flow.
    finally { sending = false; if (queue.length && !blocked) timer = setTimeout(flush, 2000); }
  }
  return {
    headers,
    enable(value) { enabled = value === true; },
    record(name, fields = {}) {
      if (!enabled || blocked) return;
      const allowed = ["phase", "active", "muted", "error", "context_state", "audio_session", "track_state", "track_muted", "native_event", "native_error", "operation", "status", "request_id", "action", "automatic", "platform"];
      queue.push({ name, at: Date.now(), page: location.pathname, ...Object.fromEntries(allowed.filter(key => fields[key] !== undefined).map(key => [key, fields[key]])) });
      if (queue.length > 24) queue.shift();
      if (!timer) timer = setTimeout(flush, 2000);
      return true;
    },
    flush,
  };
}

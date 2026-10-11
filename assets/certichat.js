// Deep Chat's documented Remarkable plugin hook renders both roles as inert text.
// ponytail: plain text avoids a second Markdown sanitizer; verified sources are separate DOM links.
export const plainChatHTML = text => `<p>${String(text).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]).replace(/\n/g, "<br>")}</p>`;

export function safeSourceURL(value, root) {
  try {
    const url = new URL(value), site = new URL(root);
    return url.protocol === "https:" && url.origin === site.origin && url.pathname.startsWith(site.pathname) && !url.username && !url.password && !url.search ? url.href : null;
  } catch { return null; }
}

export function quotaText(quota) {
  if (!quota) return "Consulta únicamente información publicada en CertiTips.";
  return `${Number(quota.dayRemaining) || 0} consultas disponibles / 24 h · ${Number(quota.hourRemaining) || 0} / hora.${quota.retryAfter > 0 ? ` Espera ${Math.ceil(quota.retryAfter)} segundos antes de volver a consultar.` : ""}`;
}

const root = typeof document === "undefined" ? null : document.querySelector("[data-certichat]");
if (root) {
  const panel = root.querySelector("#certichat-panel"), launcher = root.querySelector("[data-chat-open]");
  const status = root.querySelector("[data-chat-status]"), verification = root.querySelector("[data-chat-verification]");
  const sources = root.querySelector("[data-chat-sources]"), clear = root.querySelector("[data-chat-clear]"), retry = root.querySelector("[data-chat-retry]");
  let chat, opening, verifying = false, verified = false, available = false, busy = false, turnstileId, turnstileLoad;
  let pendingRequest;

  async function api(route, body, method = "POST") {
    const response = await fetch(`${root.dataset.api}/api/${route}`, {
      method, credentials: "include", headers: { "X-CertiChat": "1", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(55000),
    });
    const data = await response.json();
    if (!response.ok) {
      const seconds = Number(response.headers.get("Retry-After")) || 0;
      const error = new Error(response.status === 429 ? `Se alcanzó un límite de uso.${seconds ? ` Vuelve a intentarlo en ${Math.ceil(seconds)} segundos.` : " Inténtalo más tarde."}` : response.status === 401 || response.status === 403 ? "Verifica tu acceso para continuar." : "CertiChat no está disponible en este momento. Vuelve a intentarlo más tarde.");
      error.status = response.status;
      error.code = data.code;
      if (response.status === 409) error.message = ["request_failed", "request_expired"].includes(error.code) ? "La consulta anterior no tiene un resultado disponible. Puedes enviarla nuevamente." : "Esta consulta ya fue recibida. Espera unos segundos antes de intentar recuperar su resultado.";
      throw error;
    }
    return data;
  }

  function updateAccess(session) {
    verified = Boolean(session.authenticated && !session.verificationRequired);
    available = session.available !== false;
    status.textContent = session.available === false ? "CertiChat está actualizando su contenido o alcanzó su límite de uso. Inténtalo más tarde." : quotaText(session.quota);
    clear.disabled = !verified || busy;
    retry.hidden = verified && session.available !== false;
    chat?.disableSubmitButton(!verified || session.available === false);
  }

  async function verify() {
    verified = false;
    chat?.disableSubmitButton(true);
    if (!root.dataset.siteKey) {
      status.textContent = "CertiChat está en preparación. La verificación de acceso estará disponible pronto.";
      return;
    }
    status.textContent = "Completa la verificación para consultar las guías.";
    if (!turnstileLoad) turnstileLoad = new Promise((resolve, reject) => {
      if (window.turnstile) return resolve();
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = resolve;
      script.onerror = () => { script.remove(); turnstileLoad = undefined; reject(new Error("No se pudo cargar la verificación. Revisa tu conexión y vuelve a intentarlo.")); };
      document.head.append(script);
    });
    await turnstileLoad;
    if (turnstileId !== undefined) window.turnstile.remove(turnstileId);
    turnstileId = window.turnstile.render(verification, {
      sitekey: root.dataset.siteKey, action: "certichat_session", theme: "auto", size: "flexible",
      callback: async token => {
        if (verifying) return;
        verifying = true;
        try {
          await api("session", { turnstileToken: token });
          const session = await api("session", undefined, "GET");
          if (!session.authenticated) throw new Error("Tu navegador bloquea la cookie de acceso. Permite las cookies de CertiChat para continuar.");
          updateAccess(session);
          window.turnstile.remove(turnstileId); turnstileId = undefined;
          if (!panel.hidden) chat.focusInput();
        } catch (error) { status.textContent = error.message; retry.hidden = false; }
        finally { verifying = false; }
      },
      "expired-callback": () => { verified = false; chat?.disableSubmitButton(true); status.textContent = "La verificación caducó. Pulsa Reintentar conexión."; retry.hidden = false; },
      "error-callback": () => { status.textContent = "No se pudo verificar el acceso. Pulsa Reintentar conexión."; retry.hidden = false; },
    });
  }

  function showSources(items) {
    sources.replaceChildren();
    const list = document.createElement("ul");
    for (const source of (Array.isArray(items) ? items : []).slice(0, 6)) {
      const url = safeSourceURL(source.url, root.dataset.siteRoot);
      if (!url) continue;
      const item = document.createElement("li"), link = document.createElement("a");
      link.href = url; link.textContent = source.title; link.target = "_blank"; link.rel = "noopener noreferrer";
      item.append(link); list.append(item);
    }
    sources.hidden = !list.childElementCount;
    if (!sources.hidden) {
      const title = document.createElement("strong"); title.textContent = "Fuentes de la última respuesta";
      sources.append(title, list);
    }
  }

  async function initialize() {
    if (!chat) {
      await import("./deep-chat.js");
      window.remarkable_plugins = [{ plugin: markdown => { markdown.render = plainChatHTML; } }];
      chat = document.createElement("deep-chat");
      chat.chatStyle = { border: "none", width: "100%", height: "100%", backgroundColor: "var(--paper)", color: "var(--ink)", fontFamily: "inherit" };
      chat.textInput = { characterLimit: 1500, placeholder: { text: "Pregunta sobre las guías…" }, styles: { container: { backgroundColor: "var(--paper)", border: "1px solid var(--line)", borderRadius: "8px" }, text: { color: "var(--ink)" } } };
      chat.messageStyles = { default: { shared: { bubble: { maxWidth: "92%", fontSize: "14px", lineHeight: "1.5" } }, ai: { bubble: { backgroundColor: "var(--hover)", color: "var(--ink)" } }, user: { bubble: { backgroundColor: "var(--tint)", color: "var(--ink)" } } } };
      chat.remarkable = { html: false, applyHTML: false };
      chat.auxiliaryStyle = "* { overflow-wrap: anywhere; } @media(prefers-reduced-motion:reduce) { *,*::before,*::after { animation:none!important; transition:none!important; scroll-behavior:auto!important; } }";
      chat.introMessage = { text: "Hola, soy CertiChat. Puedo ayudarte a comprender las guías y las prácticas publicadas en CertiTips." };
      chat.errorMessages = { displayServiceErrorMessages: true };
      chat.requestBodyLimits = { maxMessages: 1 };
      chat.validateInput = text => verified && available && !busy && Boolean(text?.trim()) && text.length <= 1500;
      chat.onComponentRender = () => {
        chat.shadowRoot.querySelector('[role="textbox"]')?.setAttribute("aria-label", "Pregunta a CertiChat");
        chat.disableSubmitButton(!verified || !available);
      };
      chat.connect = { handler: async (body, signals) => {
        busy = true; clear.disabled = true; status.textContent = "Consultando las guías…";
        const message = body.messages?.at(-1)?.text?.trim() || "";
        // A transport retry reuses the UUID; the server deduplicates any paid generation.
        if (pendingRequest?.message !== message) pendingRequest = { requestId: crypto.randomUUID(), message, pageUrl: document.querySelector('link[rel="canonical"]')?.href || root.dataset.siteRoot };
        try {
          const result = await api("chat", pendingRequest);
          pendingRequest = undefined;
          await signals.onResponse({ text: String(result.answer || "No encontré una respuesta en las guías disponibles.") });
          showSources(result.sources); status.textContent = quotaText(result.quota);
        } catch (error) {
          if (error.status && (error.status !== 409 || ["request_failed", "request_expired"].includes(error.code))) pendingRequest = undefined;
          await signals.onResponse({ error: error.name === "TimeoutError" ? "La consulta tardó demasiado. Puedes repetirla para recuperar su resultado." : error.message });
          status.textContent = error.message; retry.hidden = false;
          if ([401, 403].includes(error.status)) { verified = false; chat.disableSubmitButton(true); }
        } finally { busy = false; clear.disabled = !verified; }
      } };
      root.querySelector("[data-chat-messages]").append(chat);
    }
    const session = await api("session", undefined, "GET");
    updateAccess(session);
    if (!verified && available) await verify();
  }

  async function connect() {
    retry.disabled = true;
    try { await initialize(); }
    catch { status.textContent = "No se pudo conectar con CertiChat. Revisa tu conexión y vuelve a intentarlo."; retry.hidden = false; }
    finally { retry.disabled = false; }
  }
  function closePanel() { panel.hidden = true; launcher.setAttribute("aria-expanded", "false"); launcher.focus(); }
  launcher.addEventListener("click", async () => {
    if (!panel.hidden) return closePanel();
    panel.hidden = false; launcher.setAttribute("aria-expanded", "true");
    root.querySelector("[data-chat-close]").focus();
    if (!opening) { opening = connect(); await opening; opening = undefined; }
  });
  root.querySelector("[data-chat-close]").addEventListener("click", closePanel);
  panel.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); closePanel(); } });
  retry.addEventListener("click", connect);
  clear.addEventListener("click", async () => {
    clear.disabled = true;
    try { await api("conversation", {}, "DELETE"); chat.clearMessages(); showSources([]); pendingRequest = undefined; updateAccess(await api("session", undefined, "GET")); }
    catch { status.textContent = "No se pudo borrar la conversación. Vuelve a intentarlo."; }
    finally { clear.disabled = !verified || busy; }
  });
}

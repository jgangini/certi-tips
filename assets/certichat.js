import { readStored, writeStored } from "./storage.js";
import { normalizeTrace, publishTrace, safeSourceURL } from "./certichat-trace.js";
export { safeSourceURL } from "./certichat-trace.js";

const escapeChat = text => String(text).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// ponytail: support only text and validated guide links, without enabling arbitrary Markdown/HTML.
export function plainChatHTML(text, siteRoot) {
  return `<p>${String(text).split(/(\[[^\[\]\n]+\]\(https:\/\/[^\s()]+\))/g).map(part => {
    const link = part.match(/^\[([^\[\]\n]+)\]\((https:\/\/[^\s()]+)\)$/);
    const url = link && safeSourceURL(link[2], siteRoot);
    return url ? `<a href="${escapeChat(url)}">${escapeChat(link[1])}</a>` : escapeChat(part);
  }).join("").replace(/\n/g, "<br>")}</p>`;
}

export function quotaText(quota, now = Date.now()) {
  const reset = typeof quota?.resetAt === "string" ? Date.parse(quota.resetAt) : NaN;
  if (!Number.isFinite(quota?.remaining) || quota.remaining > 0 || !Number.isFinite(reset) || reset <= now) return "";
  const minutes = Math.ceil((reset - now) / 60000);
  return `Tus consultas se renovarán en ${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function answerWithReferences(answer, sources, siteRoot) {
  const links = new Map();
  for (const source of Array.isArray(sources) ? sources : []) {
    const url = safeSourceURL(source?.url, siteRoot);
    if (url && typeof source?.title === "string" && source.title.trim() && !links.has(url)) links.set(url, `[${source.title.replace(/[\[\]\r\n]/g, " ").slice(0, 200)}](${url})`);
  }
  return links.size ? `${answer}\n\nPara profundizar:\n${[...links.values()].slice(0, 8).join("\n")}` : answer;
}

export function isChatPreview(pageURL, apiURL) {
  const loopback = ["localhost", "127.0.0.1", "[::1]"];
  return loopback.includes(new URL(pageURL).hostname) && !loopback.includes(new URL(apiURL).hostname);
}

export function restoreChat(value, siteRoot, now = Date.now()) {
  const empty = { messages: [], pendingRequest: undefined };
  if (!value || !Number.isFinite(value.updatedAt) || value.updatedAt > now || now - value.updatedAt >= 86400000) return empty;
  let traceBytes = 0;
  const messages = (Array.isArray(value.messages) ? value.messages : []).filter(item => item && ["user", "ai"].includes(item.role) && typeof item.text === "string" && item.text.trim() && item.text.length <= (item.role === "user" ? 1500 : 12000)).slice(-100).reverse().map(({ role, text, graphTrace }) => {
    const trace = role === "ai" && normalizeTrace(graphTrace, siteRoot);
    // ponytail: retain newest graph evidence up to 500 KiB; older answer text remains available.
    if (trace && (traceBytes += JSON.stringify(trace).length * 2) <= 512000) return { role, text, graphTrace: trace };
    return { role, text };
  }).reverse();
  const pending = value.pendingRequest;
  const pendingRequest = pending && typeof pending.requestId === "string" && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(pending.requestId) && typeof pending.message === "string" && pending.message.trim() && pending.message.length <= 1500 && safeSourceURL(pending.pageUrl, siteRoot) ? { requestId: pending.requestId, message: pending.message, pageUrl: pending.pageUrl } : undefined;
  return { messages, pendingRequest };
}

const root = typeof document === "undefined" ? null : document.querySelector("[data-certichat]");
if (root) {
  const panel = root.querySelector("#certichat-panel"), launcher = root.querySelector("[data-chat-open]");
  const dock = document.querySelector("[data-explorer-chat-slot]");
  if (dock) {
    dock.append(root);
    panel.setAttribute("role", "region");
    root.querySelector("[data-chat-close]").disabled = true;
  }
  const mobileChat = matchMedia("(max-width: 800px)");
  function fitMobileViewport() {
    const viewport = window.visualViewport;
    // ponytail: track the keyboard viewport, while preserving deliberate pinch zoom.
    if (dock || panel.hidden || !mobileChat.matches || !viewport || viewport.scale !== 1) return;
    for (const [name, value] of Object.entries({ top: viewport.offsetTop, left: viewport.offsetLeft, width: viewport.width, height: viewport.height })) panel.style.setProperty(`--chat-${name}`, `${value}px`);
  }
  window.visualViewport?.addEventListener("resize", fitMobileViewport);
  window.visualViewport?.addEventListener("scroll", fitMobileViewport);
  mobileChat.addEventListener("change", fitMobileViewport);
  const status = root.querySelector("[data-chat-status]"), verification = root.querySelector("[data-chat-verification]");
  const clear = root.querySelector("[data-chat-clear]"), retry = root.querySelector("[data-chat-retry]");
  const confirmation = root.querySelector("[data-chat-confirm]"), confirmClear = confirmation.querySelector("[data-chat-confirm-yes]"), cancelClear = confirmation.querySelector("[data-chat-confirm-no]");
  const storageKey = `certichat:${root.dataset.siteRoot}`;
  const saved = restoreChat(readStored(storageKey, null), root.dataset.siteRoot);
  const preview = isChatPreview(location.href, root.dataset.api);
  let chat, opening, verifying = false, verified = false, available = false, busy = false, turnstileId, turnstileLoad;
  let pendingRequest = saved.pendingRequest, accessError = "", completedRequest, completedTrace, quota;
  const responseTraces = saved.messages.filter(message => message.role === "ai").map(message => message.graphTrace);
  const responseSelector = ".outer-message-container:not(.deep-chat-intro) .ai-message:not(.deep-chat-loading-message-bubble)";
  const quotaNotice = document.createElement("div");
  quotaNotice.id = "certichat-quota";
  quotaNotice.hidden = true;
  function updateQuota(value = quota) {
    quota = value;
    quotaNotice.textContent = quotaText(quota);
    quotaNotice.hidden = !quotaNotice.textContent;
    const input = chat?.shadowRoot.querySelector('[role="textbox"]');
    if (!input) return;
    const exhausted = !quotaNotice.hidden;
    // ponytail: update the native textbox; changing textInput would recreate the ongoing conversation.
    input.contentEditable = String(!exhausted);
    input.setAttribute("aria-disabled", String(exhausted));
    input.classList.toggle("text-input-disabled", exhausted);
    chat.disableSubmitButton(exhausted);
  }
  setInterval(() => updateQuota(), 30000);

  function persist() {
    // Deep Chat's simulated stream drops custom metadata; keep evidence aligned by response position.
    let index = 0;
    const messages = chat.getMessages().map(message => message.role === "ai" ? { ...message, graphTrace: responseTraces[index++] } : message);
    writeStored(storageKey, { updatedAt: Date.now(), ...restoreChat({ updatedAt: Date.now(), messages, pendingRequest }, root.dataset.siteRoot) });
  }

  function focusResponse(event) {
    if (!dock || busy || event.target.closest?.("a")) return;
    if (event.type === "keydown" && (!["Enter", " "].includes(event.key) || event.repeat)) return;
    const bubble = event.target.closest?.(responseSelector);
    if (!bubble || bubble.classList.contains("streamed-message")) return;
    if (event.type === "keydown") event.preventDefault();
    const index = [...chat.shadowRoot.querySelectorAll(responseSelector)].indexOf(bubble);
    const trace = responseTraces[index];
    window.dispatchEvent(new CustomEvent("certichat:focus", { detail: trace || null }));
  }

  function setStatus(message, error = false) {
    status.querySelector("[data-chat-status-text]").textContent = message;
    status.hidden = error || !message;
    accessError = error ? message : "";
    retry.hidden = preview || !error;
  }

  async function api(route, body, method = "POST") {
    const response = await fetch(`${root.dataset.api}/api/${route}`, {
      method, credentials: "include", headers: { "X-CertiChat": "1", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(55000),
    });
    const data = await response.json();
    if (!response.ok) {
      const seconds = Number(response.headers.get("Retry-After")) || 0;
      const error = new Error(response.status === 429 ? `Se alcanzó un límite de uso.${seconds ? ` Vuelve a intentarlo en ${Math.ceil(seconds)} segundos.` : " Inténtalo más tarde."}` : response.status === 401 || response.status === 403 ? "Verifica tu acceso para continuar." : "El servicio no está disponible en este momento. Vuelve a intentarlo más tarde.");
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
    updateQuota(session.quota);
    setStatus(session.available === false ? "El servicio está actualizando su contenido o alcanzó su límite de uso. Inténtalo más tarde." : "", session.available === false);
    clear.disabled = !verified || busy;
  }

  async function verify() {
    verified = false;
    if (!root.dataset.siteKey) {
      setStatus("La verificación de acceso no está disponible. Inténtalo más tarde.", true);
      return;
    }
    setStatus("Completa la verificación para consultar las guías.");
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
          if (!session.authenticated) throw new Error("Tu navegador bloquea la cookie de acceso. Permite las cookies del asistente para continuar.");
          updateAccess(session);
          window.turnstile.remove(turnstileId); turnstileId = undefined;
          if (!panel.hidden) chat.focusInput();
        } catch (error) { setStatus(error.message, true); }
        finally { verifying = false; }
      },
      "expired-callback": () => { verified = false; setStatus("La verificación caducó. Pulsa Reintentar conexión.", true); },
      "error-callback": () => { setStatus("No se pudo verificar el acceso. Pulsa Reintentar conexión.", true); },
    });
  }

  async function initialize() {
    if (!chat) {
      await import("./deep-chat.js");
      window.remarkable_plugins = [{ plugin: markdown => { markdown.render = text => plainChatHTML(text, root.dataset.siteRoot); } }];
      chat = document.createElement("deep-chat");
      chat.chatStyle = { border: "none", width: "100%", height: "100%", backgroundColor: "var(--paper)", color: "var(--ink)", fontFamily: "inherit" };
      chat.textInput = {
        characterLimit: 1500, placeholder: { text: "Escribe tu consulta", style: { color: "var(--muted)" } },
        styles: {
          container: { width: "100%", boxSizing: "border-box", margin: "0", backgroundColor: "var(--paper)", border: "unset", borderTop: "1px solid var(--line)", borderRadius: "0", boxShadow: "unset" },
          text: { color: "var(--ink)", fontSize: "16px", paddingTop: "11px", paddingBottom: "13px", paddingLeft: "12px", paddingRight: "2.4em" },
        },
      };
      chat.submitButtonStyles = { submit: { container: { default: { transform: "scale(1.21)", marginBottom: "-3px", marginRight: "0.4em" } } } };
      chat.messageStyles = { default: { shared: { bubble: { maxWidth: "92%", fontSize: "14px", lineHeight: "1.5" } }, ai: { bubble: { backgroundColor: "var(--hover)", color: "var(--ink)" } }, user: { bubble: { backgroundColor: "var(--accent)", color: "var(--on-red)" } } } };
      chat.messageStyles.loading = { message: { styles: { bubble: { display: "flex", alignItems: "center", justifyContent: "center", width: "56px", height: "36px", padding: "0", boxSizing: "border-box" } } } };
      chat.remarkable = { html: false, applyHTML: false };
      chat.auxiliaryStyle = "* { overflow-wrap: anywhere; } #chat-view { grid-template-rows: minmax(0, 1fr) auto auto; } #certichat-quota { color: var(--muted); text-align: center; font-size: 12px; line-height: 1.4; padding: 8px 12px; } #certichat-quota[hidden] { display: none; } a { color: var(--blue); text-decoration: underline; } a:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; } @media(prefers-reduced-motion:reduce) { *,*::before,*::after { animation:none!important; transition:none!important; scroll-behavior:auto!important; } }";
      if (dock) chat.auxiliaryStyle += `${responseSelector}:not(.streamed-message) { border: 1px solid transparent; cursor: pointer; } ${responseSelector}:not(.streamed-message):hover { border-color: var(--red); } ${responseSelector}:focus-visible { outline: 2px solid var(--red); outline-offset: 2px; }`;
      chat.introMessage = { text: "Hola. Resuelve tus dudas sobre las guías y prácticas del sitio." };
      chat.history = saved.messages.map(({ role, text }) => ({ role, text }));
      chat.onMessage = ({ isHistory, message }) => {
        if (isHistory) return;
        if (message.role === "ai") {
          responseTraces.push(completedTrace); completedTrace = undefined;
          if (dock) chat.shadowRoot.querySelectorAll(responseSelector).forEach(bubble => { bubble.tabIndex = 0; });
          if (pendingRequest?.requestId === completedRequest) pendingRequest = undefined;
          completedRequest = undefined;
          busy = false; clear.disabled = !verified;
          chat.shadowRoot.querySelector('[aria-label="Detener respuesta"]')?.setAttribute("aria-label", "Enviar consulta");
        }
        persist();
      };
      chat.errorMessages = { displayServiceErrorMessages: true };
      chat.requestBodyLimits = { maxMessages: 1 };
      chat.validateInput = text => !busy && !quotaText(quota) && Boolean(text?.trim()) && text.length <= 1500;
      chat.onComponentRender = () => {
        chat.shadowRoot.querySelector("#input")?.before(quotaNotice);
        const input = chat.shadowRoot.querySelector('[role="textbox"]');
        input?.setAttribute("aria-label", "Escribe tu consulta");
        input?.setAttribute("enterkeyhint", "send");
        chat.shadowRoot.querySelector('.input-button.inside-end')?.setAttribute("aria-label", "Enviar consulta");
        if (dock) {
          chat.shadowRoot.addEventListener("click", focusResponse);
          chat.shadowRoot.addEventListener("keydown", focusResponse);
          chat.shadowRoot.querySelectorAll(responseSelector).forEach(bubble => { bubble.tabIndex = 0; });
        }
        updateQuota();
      };
      chat.addEventListener("keydown", event => {
        const input = event.composedPath()[0];
        if (input.getAttribute?.("role") !== "textbox" || event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (chat.validateInput(input.innerText)) chat.submitUserMessage({ text: input.innerText });
      }, { capture: true });
      chat.addEventListener("click", event => {
        const link = event.composedPath().find(node => node.tagName === "A");
        if (link && safeSourceURL(link.href, root.dataset.siteRoot) && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
          try { sessionStorage.setItem(`${storageKey}:reference`, link.href); } catch { /* The open panel remains usable without storage. */ }
        }
      });
      // ponytail: reveal the validated answer progressively; raw model tokens cannot bypass source validation.
      chat.connect = { stream: matchMedia("(prefers-reduced-motion: reduce)").matches ? undefined : { simulation: 6 }, handler: async (body, signals) => {
        busy = true; clear.disabled = true;
        completedTrace = undefined;
        publishTrace(root.dataset.siteRoot, "loading");
        let answer;
        try {
          if (!verified || !available) {
            answer = accessError || (available ? "Completa la verificación de acceso para enviar tu consulta." : "El servicio no está disponible. Pulsa Reintentar conexión.");
            setStatus(answer, true);
            publishTrace(root.dataset.siteRoot, "error");
          } else {
            setStatus("Consultando las guías…");
            const message = body.messages?.at(-1)?.text?.trim() || "";
            // A transport retry reuses the UUID; the server deduplicates any paid generation.
            if (pendingRequest?.message !== message) pendingRequest = { requestId: crypto.randomUUID(), message, pageUrl: document.querySelector('link[rel="canonical"]')?.href || root.dataset.siteRoot };
            persist();
            const result = await api("chat", pendingRequest);
            completedRequest = pendingRequest.requestId;
            completedTrace = normalizeTrace(result.graphTrace, root.dataset.siteRoot);
            answer = answerWithReferences(String(result.answer || "No encontré una respuesta en las guías disponibles."), result.sources, root.dataset.siteRoot);
            updateQuota(result.quota); setStatus("");
            publishTrace(root.dataset.siteRoot, "ready", result.graphTrace);
          }
        } catch (error) {
          publishTrace(root.dataset.siteRoot, "error");
          if (error.status && (error.status !== 409 || ["request_failed", "request_expired"].includes(error.code))) pendingRequest = undefined;
          answer = error.name === "TimeoutError" ? "La consulta tardó demasiado. Puedes repetirla para recuperar su resultado." : error.status ? error.message : "Sin conexión. Vuelve a intentarlo.";
          setStatus(answer, true);
          if ([401, 403].includes(error.status)) verified = false;
          if (error.status === 429) {
            try { updateQuota((await api("session", undefined, "GET")).quota); } catch { /* Keep the last known renewal time. */ }
          }
        }
        chat.shadowRoot.querySelector('[aria-label="Enviar consulta"]')?.setAttribute("aria-label", "Detener respuesta");
        await signals.onResponse({ text: answer });
        persist();
      } };
      root.querySelector("[data-chat-messages]").append(chat);
    }
    // ponytail: real queries use the published origin; a loopback API remains available for local tests.
    if (preview) {
      const link = document.createElement("a");
      link.href = `${document.querySelector('link[rel="canonical"]')?.href || root.dataset.siteRoot}#certichat`;
      link.textContent = "Abrir chat del sitio publicado"; link.className = "button button-secondary";
      link.target = "_blank"; link.rel = "noopener noreferrer";
      verification.replaceChildren(link);
      setStatus("Esta vista previa no admite consultas. Abre el chat del sitio publicado.", true);
      return;
    }
    let session = await api("session", undefined, "GET");
    if (session.mode === "LOCAL" && (!session.authenticated || session.verificationRequired)) {
      await api("session", {});
      session = await api("session", undefined, "GET");
    }
    updateAccess(session);
    if (!verified && available) await verify();
  }

  async function connect() {
    verified = false; available = false; clear.disabled = true;
    retry.disabled = true;
    setStatus("Conectando con el asistente…");
    try { await initialize(); }
    catch { setStatus("Sin conexión. Vuelve a intentarlo.", true); }
    finally { retry.disabled = false; }
  }
  function closePanel() {
    if (dock) return;
    try { sessionStorage.removeItem(`${storageKey}:reference`); } catch { /* Storage is optional. */ }
    panel.hidden = true; launcher.hidden = false; launcher.setAttribute("aria-expanded", "false"); launcher.focus();
  }
  launcher.addEventListener("click", async () => {
    if (!panel.hidden) return closePanel();
    panel.hidden = false; launcher.hidden = true; launcher.setAttribute("aria-expanded", "true");
    fitMobileViewport();
    if (!dock) root.querySelector("[data-chat-close]").focus();
    if (!opening) { opening = connect(); await opening; opening = undefined; }
  });
  let followedReference = false;
  try {
    followedReference = sessionStorage.getItem(`${storageKey}:reference`) === location.href;
    sessionStorage.removeItem(`${storageKey}:reference`);
  } catch { /* Browsers may disable session storage. */ }
  if (dock || location.hash === "#certichat" || followedReference) launcher.click();
  root.querySelector("[data-chat-close]").addEventListener("click", closePanel);
  if (dock) {
    const map = root.querySelector('a[aria-label="Ver el grafo de CertiChat"]');
    map.dataset.chatMap = "";
    map.setAttribute("aria-label", "Ver mapa de conocimiento");
    map.title = "Ver mapa";
    map.addEventListener("click", event => {
      if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      document.querySelector("[data-graph-canvas]")?.focus();
    });
  }
  panel.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); closePanel(); } });
  retry.addEventListener("click", connect);
  clear.addEventListener("click", () => {
    confirmation.querySelector("[data-chat-clear-error]").hidden = true;
    confirmation.showModal();
  });
  cancelClear.addEventListener("click", () => { if (!busy) confirmation.close(); });
  confirmation.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  confirmation.addEventListener("click", event => {
    if (event.target !== confirmation || busy) return;
    const bounds = confirmation.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) confirmation.close();
  });
  confirmation.addEventListener("close", () => clear.focus());
  confirmClear.addEventListener("click", async () => {
    busy = true; clear.disabled = true; confirmClear.disabled = true; cancelClear.disabled = true;
    confirmation.setAttribute("aria-busy", "true");
    try {
      const result = await api("conversation", {}, "DELETE");
      chat.clearMessages(); responseTraces.length = 0; completedTrace = undefined; pendingRequest = undefined; persist();
      publishTrace(root.dataset.siteRoot, "idle");
      updateQuota(result.quota); setStatus(""); confirmation.close();
    } catch {
      const error = confirmation.querySelector("[data-chat-clear-error]");
      error.textContent = "No se pudo borrar la conversación. Vuelve a intentarlo."; error.hidden = false;
    } finally {
      busy = false; clear.disabled = !verified; confirmClear.disabled = false; cancelClear.disabled = false;
      confirmation.setAttribute("aria-busy", "false");
    }
  });
}

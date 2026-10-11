import { readStored, writeStored } from "./storage.js";

const escapeChat = text => String(text).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// ponytail: support only text and validated guide links, without enabling arbitrary Markdown/HTML.
export function plainChatHTML(text, siteRoot) {
  return `<p>${String(text).split(/(\[[^\[\]\n]+\]\(https:\/\/[^\s()]+\))/g).map(part => {
    const link = part.match(/^\[([^\[\]\n]+)\]\((https:\/\/[^\s()]+)\)$/);
    const url = link && safeSourceURL(link[2], siteRoot);
    return url ? `<a href="${escapeChat(url)}">${escapeChat(link[1])}</a>` : escapeChat(part);
  }).join("").replace(/\n/g, "<br>")}</p>`;
}

export function safeSourceURL(value, root) {
  try {
    const url = new URL(value), site = new URL(root);
    return url.protocol === "https:" && url.origin === site.origin && url.pathname.startsWith(site.pathname) && !url.username && !url.password && !url.search ? url.href : null;
  } catch { return null; }
}

export function quotaText(quota, now = Date.now()) {
  const reset = typeof quota?.resetAt === "string" ? Date.parse(quota.resetAt) : NaN;
  if (!Number.isFinite(reset) || reset <= now) return "";
  const minutes = Math.ceil((reset - now) / 60000);
  return `Tus consultas se renovarán en ${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function answerWithReferences(answer, question, sources, siteRoot) {
  const request = question.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\bfuentes? de datos\b/g, "datos");
  if (/\b(sin|no\s+(?:incluyas|muestres|agregues|quiero|necesito|deseo|compartas))\b.{0,40}\b(referencias?|fuentes?|enlaces?|links?|profundizar|ampliar)\b/.test(request)) return answer;
  // ponytail: explicit Spanish requests only; expand these phrases when real requests need it.
  const explicit = /\b(?:donde|como puedo)\b.{0,70}\b(?:leer|profundizar|ampliar|aprender|consultar|encontrar)\b|\b(?:dime|dame|darme|muestra(?:me)?|mostrarme|comparte|compartirme|recomienda(?:me)?|indica(?:me)?|pasame|pasarme|necesito|quiero|busco|incluye|cuales? son|cual es)\s+(?:(?:ver|consultar)\s+)?(?:(?:el|la|los|las|un|una|unos|unas|algun|algunos|alguna|algunas|tus|sus)\s+)?(?:referencias?|fuentes?|enlaces?|links?|profundizar|ampliar)\b|^\s*(?:referencias?|fuentes?|enlaces?|links?)[\s?.!]*$/.test(request);
  if (!explicit) return answer;
  const links = (Array.isArray(sources) ? sources : []).filter(source => typeof source?.title === "string" && safeSourceURL(source.url, siteRoot)).slice(0, 6).map(source => `[${source.title.replace(/[\[\]\r\n]/g, " ").slice(0, 200)}](${safeSourceURL(source.url, siteRoot)})`);
  return links.length ? `${answer}\n\nPara profundizar:\n${links.join("\n")}` : answer;
}

export function isChatPreview(pageURL, apiURL) {
  const loopback = ["localhost", "127.0.0.1", "[::1]"];
  return loopback.includes(new URL(pageURL).hostname) && !loopback.includes(new URL(apiURL).hostname);
}

export function restoreChat(value, siteRoot, now = Date.now()) {
  const empty = { messages: [], pendingRequest: undefined };
  if (!value || !Number.isFinite(value.updatedAt) || value.updatedAt > now || now - value.updatedAt >= 86400000) return empty;
  const messages = (Array.isArray(value.messages) ? value.messages : []).filter(item => item && ["user", "ai"].includes(item.role) && typeof item.text === "string" && item.text.trim() && item.text.length <= (item.role === "user" ? 1500 : 12000)).slice(-100).map(({ role, text }) => ({ role, text }));
  const pending = value.pendingRequest;
  const pendingRequest = pending && typeof pending.requestId === "string" && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(pending.requestId) && typeof pending.message === "string" && pending.message.trim() && pending.message.length <= 1500 && safeSourceURL(pending.pageUrl, siteRoot) ? { requestId: pending.requestId, message: pending.message, pageUrl: pending.pageUrl } : undefined;
  return { messages, pendingRequest };
}

const root = typeof document === "undefined" ? null : document.querySelector("[data-certichat]");
if (root) {
  const panel = root.querySelector("#certichat-panel"), launcher = root.querySelector("[data-chat-open]");
  const status = root.querySelector("[data-chat-status]"), verification = root.querySelector("[data-chat-verification]");
  const clear = root.querySelector("[data-chat-clear]"), retry = root.querySelector("[data-chat-retry]");
  const confirmation = root.querySelector("[data-chat-confirm]"), confirmClear = confirmation.querySelector("[data-chat-confirm-yes]"), cancelClear = confirmation.querySelector("[data-chat-confirm-no]");
  const storageKey = `certichat:${root.dataset.siteRoot}`;
  const saved = restoreChat(readStored(storageKey, null), root.dataset.siteRoot);
  const preview = isChatPreview(location.href, root.dataset.api);
  let chat, opening, verifying = false, verified = false, available = false, busy = false, turnstileId, turnstileLoad;
  let pendingRequest = saved.pendingRequest, accessError = "", completedRequest, quota;
  const quotaNotice = document.createElement("div");
  quotaNotice.id = "certichat-quota";
  quotaNotice.hidden = true;
  function updateQuota(value = quota) {
    quota = value;
    quotaNotice.textContent = quotaText(quota);
    quotaNotice.hidden = !quotaNotice.textContent;
  }
  setInterval(() => updateQuota(), 30000);

  function persist() {
    // ponytail: one bounded text snapshot; the server remains authoritative for context and quotas.
    writeStored(storageKey, { updatedAt: Date.now(), ...restoreChat({ updatedAt: Date.now(), messages: chat.getMessages(), pendingRequest }, root.dataset.siteRoot) });
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
          container: { width: "100%", margin: "0", backgroundColor: "var(--paper)", border: "unset", borderTop: "1px solid var(--line)", borderRadius: "0", boxShadow: "unset" },
          text: { color: "var(--ink)", fontSize: "1.05em", paddingTop: "11px", paddingBottom: "13px", paddingLeft: "12px", paddingRight: "2.4em" },
        },
      };
      chat.submitButtonStyles = { submit: { container: { default: { transform: "scale(1.21)", marginBottom: "-3px", marginRight: "0.4em" } } } };
      chat.messageStyles = { default: { shared: { bubble: { maxWidth: "92%", fontSize: "14px", lineHeight: "1.5" } }, ai: { bubble: { backgroundColor: "var(--hover)", color: "var(--ink)" } }, user: { bubble: { backgroundColor: "var(--accent)", color: "var(--on-red)" } } } };
      chat.remarkable = { html: false, applyHTML: false };
      chat.auxiliaryStyle = "* { overflow-wrap: anywhere; } #chat-view { grid-template-rows: minmax(0, 1fr) auto auto; } #certichat-quota { color: var(--muted); text-align: center; font-size: 12px; line-height: 1.4; padding: 8px 12px; } #certichat-quota[hidden] { display: none; } a { color: var(--blue); text-decoration: underline; } a:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; } @media(prefers-reduced-motion:reduce) { *,*::before,*::after { animation:none!important; transition:none!important; scroll-behavior:auto!important; } }";
      chat.introMessage = { text: "Hola. Resuelve tus dudas sobre las guías y prácticas del sitio." };
      chat.history = saved.messages;
      chat.onMessage = ({ isHistory, message }) => {
        if (isHistory) return;
        if (message.role === "ai") {
          if (pendingRequest?.requestId === completedRequest) pendingRequest = undefined;
          completedRequest = undefined;
          busy = false; clear.disabled = !verified;
          chat.shadowRoot.querySelector('[aria-label="Detener respuesta"]')?.setAttribute("aria-label", "Enviar consulta");
        }
        persist();
      };
      chat.errorMessages = { displayServiceErrorMessages: true };
      chat.requestBodyLimits = { maxMessages: 1 };
      chat.validateInput = text => !busy && Boolean(text?.trim()) && text.length <= 1500;
      chat.onComponentRender = () => {
        chat.shadowRoot.querySelector("#input")?.before(quotaNotice);
        const input = chat.shadowRoot.querySelector('[role="textbox"]');
        input?.setAttribute("aria-label", "Escribe tu consulta");
        input?.setAttribute("enterkeyhint", "send");
        chat.shadowRoot.querySelector('.input-button.inside-end')?.setAttribute("aria-label", "Enviar consulta");
      };
      chat.addEventListener("keydown", event => {
        const input = event.composedPath()[0];
        if (input.getAttribute?.("role") !== "textbox" || event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (chat.validateInput(input.innerText)) chat.submitUserMessage({ text: input.innerText });
      }, { capture: true });
      chat.addEventListener("click", event => {
        const link = event.composedPath().find(node => node.tagName === "A");
        if (link && safeSourceURL(link.href, root.dataset.siteRoot) && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) closePanel();
      });
      // ponytail: reveal the validated answer progressively; raw model tokens cannot bypass source validation.
      chat.connect = { stream: matchMedia("(prefers-reduced-motion: reduce)").matches ? undefined : { simulation: 6 }, handler: async (body, signals) => {
        busy = true; clear.disabled = true;
        let answer;
        try {
          if (!verified || !available) {
            answer = accessError || (available ? "Completa la verificación de acceso para enviar tu consulta." : "El servicio no está disponible. Pulsa Reintentar conexión.");
            setStatus(answer, true);
          } else {
            setStatus("Consultando las guías…");
            const message = body.messages?.at(-1)?.text?.trim() || "";
            // A transport retry reuses the UUID; the server deduplicates any paid generation.
            if (pendingRequest?.message !== message) pendingRequest = { requestId: crypto.randomUUID(), message, pageUrl: document.querySelector('link[rel="canonical"]')?.href || root.dataset.siteRoot };
            persist();
            const result = await api("chat", pendingRequest);
            completedRequest = pendingRequest.requestId;
            answer = answerWithReferences(String(result.answer || "No encontré una respuesta en las guías disponibles."), message, result.sources, root.dataset.siteRoot);
            updateQuota(result.quota); setStatus("");
          }
        } catch (error) {
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
  function closePanel() { panel.hidden = true; launcher.hidden = false; launcher.setAttribute("aria-expanded", "false"); launcher.focus(); }
  launcher.addEventListener("click", async () => {
    if (!panel.hidden) return closePanel();
    panel.hidden = false; launcher.hidden = true; launcher.setAttribute("aria-expanded", "true");
    root.querySelector("[data-chat-close]").focus();
    if (!opening) { opening = connect(); await opening; opening = undefined; }
  });
  if (location.hash === "#certichat") launcher.click();
  root.querySelector("[data-chat-close]").addEventListener("click", closePanel);
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
      chat.clearMessages(); pendingRequest = undefined; persist();
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

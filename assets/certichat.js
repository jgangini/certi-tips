import { t, locale, language, localizedURL, canonicalURL, siteBase } from "./i18n.js";
import { readStored, writeStored } from "./storage.js";
import { normalizeTrace, publishTrace, safeSourceURL, sourcePath } from "./certichat-trace.js";
export { safeSourceURL } from "./certichat-trace.js";

const escapeChat = text => String(text).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function configureChatMarkdown(markdown, siteRoot) {
  markdown.set({ html: false, breaks: true });
  const render = markdown.render.bind(markdown);
  // Deep Chat replaces the validator after plugins; enforce it at the render boundary.
  markdown.render = (text, environment) => {
    markdown.inline.validateLink = value => Boolean(safeSourceURL(value, siteRoot));
    return render(text, environment);
  };
  markdown.renderer.rules.image = (tokens, index) => escapeChat(tokens[index].alt || "");
  markdown.renderer.rules.text = (tokens, index) => ["Para profundizar:", "Recursos Relacionados:", t("Para profundizar:"), t("Recursos Relacionados:")].includes(tokens[index].content)
    ? `<span class="chat-resource-heading">${escapeChat(t('Recursos Relacionados:'))}</span>` : escapeChat(tokens[index].content);
  markdown.renderer.rules.link_open = (tokens, index) => {
    const url = safeSourceURL(tokens[index].href, siteRoot);
    const kind = new URL(url).pathname.startsWith(new URL("certitube/", siteRoot).pathname) ? "certitube" : "certitips";
    const end = tokens.findIndex((token, position) => position > index && token.type === "link_close");
    const title = tokens.slice(index + 1, end).map(token => token.content || "").join("");
    return `<a href="${escapeChat(localizedURL(sourcePath(url, siteRoot)))}" data-source-url="${escapeChat(url)}" data-link-kind="${kind}" title="${escapeChat(title)}">`;
  };
  return markdown;
}

export function quotaText(quota, now = Date.now()) {
  const reset = typeof quota?.resetAt === "string" ? Date.parse(quota.resetAt) : NaN;
  if (!Number.isFinite(quota?.remaining) || quota.remaining > 0 || !Number.isFinite(reset) || reset <= now) return "";
  const minutes = Math.ceil((reset - now) / 60000);
  return t("Tus consultas se renovarán en {time}", {time: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`});
}

export function answerWithReferences(answer, sources, siteRoot) {
  const links = new Map();
  for (const source of Array.isArray(sources) ? sources : []) {
    const url = safeSourceURL(source?.url, siteRoot);
    if (url && typeof source?.title === "string" && source.title.trim() && !links.has(url)) links.set(url, `[${t(source.title).replace(/[\[\]\r\n]/g, " ").slice(0, 200)}](${url})`);
  }
  return links.size ? `${answer}\n\n${t("Recursos Relacionados:")}\n${[...links.values()].slice(0, 8).join("\n")}` : answer;
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
  const pendingRequest = pending && typeof pending.requestId === "string" && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(pending.requestId) && typeof pending.message === "string" && pending.message.trim() && pending.message.length <= 1500 && safeSourceURL(pending.pageUrl, siteRoot) ? { requestId: pending.requestId, message: pending.message, pageUrl: pending.pageUrl, ...(pending.locale === undefined ? {} : { locale: ['es', 'en', 'pt', 'it'].includes(pending.locale) ? pending.locale : 'es' }) } : undefined;
  return { messages, pendingRequest };
}

const root = typeof document === "undefined" ? null : document.querySelector("[data-certichat]");
if (root) {
  const panel = root.querySelector("#certichat-panel"), launcher = root.querySelector("[data-chat-open]");
  const dock = document.querySelector("[data-explorer-chat-slot]");
  if (dock) {
    dock.append(root);
    panel.setAttribute("role", "region");
    root.querySelector("[data-chat-close]").hidden = true;
    root.querySelector('.certichat-actions a').hidden = true;
  }
  const mobileChat = matchMedia("(max-width: 800px)");
  const launcherContent = document.querySelector(".tube-detail, [data-group-carousel]") || document.querySelector(".course-page .course-main");
  function positionLauncher() {
    if (!launcherContent || !panel.hidden) return;
    const content = launcherContent.querySelector(".path-section.is-active, .tube-player") || launcherContent;
    const box = launcherContent.getBoundingClientRect(), gap = parseFloat(getComputedStyle(root).getPropertyValue("--layout-gap"));
    const beside = !mobileChat.matches && box.right + launcher.offsetWidth + 20 + gap <= document.documentElement.clientWidth;
    root.classList.toggle("is-beside-content", beside);
    const navigation = content.querySelector(".page-navigation a:last-of-type")?.getBoundingClientRect();
    const last = navigation || content.getBoundingClientRect();
    const headerBottom = document.querySelector(".site-header").getBoundingClientRect().bottom;
    if (beside && (navigation || content.matches(".tube-player")) && last.bottom > headerBottom && last.top < innerHeight) {
      const origin = root.getBoundingClientRect();
      const target = last.bottom - launcher.offsetHeight / 2;
      const center = Math.max(headerBottom + 20 + launcher.offsetHeight / 2, target);
      launcher.style.top = `${Math.min(0, center - (origin.top + origin.bottom) / 2)}px`;
    } else launcher.style.removeProperty("top");
  }
  if (launcherContent) {
    let frame;
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; positionLauncher(); }); };
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    mobileChat.addEventListener("change", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(launcherContent);
    const footer = document.querySelector(".site-footer");
    if (footer) observer.observe(footer);
    schedule();
  }
  function fitMobileViewport() {
    const viewport = window.visualViewport;
    // ponytail: track the keyboard viewport, while preserving deliberate pinch zoom.
    if (dock || panel.hidden || !mobileChat.matches || !viewport || viewport.scale !== 1) return;
    for (const [name, value] of Object.entries({ top: viewport.offsetTop, left: viewport.offsetLeft, width: viewport.width, height: viewport.height })) panel.style.setProperty(`--chat-${name}`, `${value}px`);
  }
  window.visualViewport?.addEventListener("resize", fitMobileViewport);
  window.visualViewport?.addEventListener("scroll", fitMobileViewport);
  mobileChat.addEventListener("change", fitMobileViewport);
  const verification = root.querySelector("[data-chat-verification]");
  const messages = root.querySelector("[data-chat-messages]"), connecting = document.createElement("div");
  connecting.className = "certichat-connecting";
  connecting.hidden = true;
  connecting.setAttribute("role", "status");
  connecting.setAttribute("aria-label", t("Conectando con el asistente"));
  connecting.innerHTML = '<span class="certichat-spinner" aria-hidden="true"></span>';
  panel.append(connecting);
  const clear = root.querySelector("[data-chat-clear]"), retry = root.querySelector("[data-chat-retry]");
  const confirmation = root.querySelector("[data-chat-confirm]"), confirmClear = confirmation.querySelector("[data-chat-confirm-yes]"), cancelClear = confirmation.querySelector("[data-chat-confirm-no]");
  const clearError = root.querySelector("[data-chat-clear-error]"), closeClearError = root.querySelector("[data-chat-clear-error-close]");
  const storageKey = `certichat:${root.dataset.siteRoot}`;
  const quizLockKey = "certitips:certiquiz:active-player";
  const quizApi = root.dataset.quizApi;
  function readQuizLock() {
    try {
      const value = localStorage.getItem(quizLockKey);
      if (!value) return null;
      const match = /^(\d{6}):(\d{13})$/.exec(value);
      const now = Date.now();
      if (match && Number(match[2]) > now && Number(match[2]) <= now + 8 * 60 * 60 * 1000) return match[1];
      localStorage.removeItem(quizLockKey);
    } catch { /* The chat remains usable when browser storage is unavailable. */ }
    return null;
  }
  let quizCode = readQuizLock();
  if (quizCode) root.hidden = true;
  const saved = restoreChat(readStored(storageKey, null), root.dataset.siteRoot);
  const preview = isChatPreview(location.href, root.dataset.api);
  let chat, opening, verifying = false, verified = false, available = false, busy = false, turnstileId, turnstileLoad;
  addEventListener("pagehide", () => {
    if (dock) {
      try { sessionStorage.removeItem(`${storageKey}:open`); sessionStorage.removeItem(`${storageKey}:reference`); } catch { /* Navigation also works without session storage. */ }
    }
    const scroller = chat?.shadowRoot?.querySelector("#messages");
    if (scroller && !panel.hidden) {
      try { sessionStorage.setItem(`${storageKey}:scroll`, String(scroller.scrollTop)); } catch { /* Reading position is optional. */ }
    }
  });
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
    const hovering = event.type.startsWith("pointer");
    if (!dock || busy || (!hovering && event.target.closest?.("a"))) return;
    if (hovering && event.pointerType === "touch") return;
    if (event.type === "keydown" && (!["Enter", " "].includes(event.key) || event.repeat)) return;
    const bubble = hovering ? event.target : event.target.closest?.(responseSelector);
    if (!bubble?.matches?.(responseSelector) || bubble.classList.contains("streamed-message")) return;
    if (event.type === "keydown") event.preventDefault();
    const index = [...chat.shadowRoot.querySelectorAll(responseSelector)].indexOf(bubble);
    const trace = event.type === "pointerleave" ? null : responseTraces[index];
    window.dispatchEvent(new CustomEvent(hovering ? "certichat:hover" : "certichat:focus", { detail: trace || null }));
  }

  function bindResponse(bubble) {
    // Non-bubbling pointer events need a listener on the real bubble inside Deep Chat's shadow root.
    bubble.tabIndex = 0; bubble.onpointerenter = focusResponse; bubble.onpointerleave = focusResponse;
  }

  function setStatus(message, error = false) {
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
      const error = new Error(response.status === 429 ? seconds ? t("Se alcanzó un límite de uso. Vuelve a intentarlo en {seconds} segundos.", {seconds: Math.ceil(seconds)}) : t("Se alcanzó un límite de uso. Inténtalo más tarde.") : response.status === 401 || response.status === 403 ? t("Verifica tu acceso para continuar.") : t("El servicio no está disponible en este momento. Vuelve a intentarlo más tarde."));
      error.status = response.status;
      error.code = data.code;
      if (response.status === 409) error.message = ["request_failed", "request_expired"].includes(error.code) ? t("La consulta anterior no tiene un resultado disponible. Puedes enviarla nuevamente.") : t("Esta consulta ya fue recibida. Espera unos segundos antes de intentar recuperar su resultado.");
      throw error;
    }
    return data;
  }

  function updateAccess(session) {
    verified = Boolean(session.authenticated && !session.verificationRequired);
    available = session.available !== false;
    updateQuota(session.quota);
    setStatus(session.available === false ? t("El servicio está actualizando su contenido o alcanzó su límite de uso. Inténtalo más tarde.") : "", session.available === false);
    clear.disabled = busy;
  }

  async function verify() {
    verified = false;
    if (!root.dataset.siteKey) {
      setStatus(t("La verificación de acceso no está disponible. Inténtalo más tarde."), true);
      return;
    }
    setStatus("");
    if (!turnstileLoad) turnstileLoad = new Promise((resolve, reject) => {
      if (window.turnstile) return resolve();
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = resolve;
      script.onerror = () => { script.remove(); turnstileLoad = undefined; reject(new Error(t("No se pudo cargar la verificación. Revisa tu conexión y vuelve a intentarlo."))); };
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
      "expired-callback": () => { verified = false; setStatus(t("La verificación caducó. Pulsa Reintentar conexión."), true); },
      "error-callback": () => { setStatus(t("No se pudo verificar el acceso. Pulsa Reintentar conexión."), true); },
    });
  }

  async function initialize() {
    if (!chat) {
      await import("./deep-chat.js");
      window.remarkable_plugins = [{ plugin: markdown => configureChatMarkdown(markdown, root.dataset.siteRoot) }];
      chat = document.createElement("deep-chat");
      chat.chatStyle = { border: "none", width: "100%", height: "100%", backgroundColor: "var(--paper)", color: "var(--ink)", fontFamily: "inherit" };
      chat.textInput = {
        characterLimit: 1500, placeholder: { text: t("Escribe tu consulta"), style: { color: "var(--muted)" } },
        styles: {
          container: { width: "100%", boxSizing: "border-box", margin: "0", backgroundColor: "var(--paper)", border: "unset", borderTop: "1px solid var(--line)", borderRadius: "0", boxShadow: "unset" },
          text: { color: "var(--ink)", fontSize: "16px", paddingTop: "11px", paddingBottom: "13px", paddingLeft: "12px", paddingRight: "2.4em" },
        },
      };
      chat.submitButtonStyles = { submit: { container: { default: { transform: "scale(1.21)", marginBottom: "-3px", marginRight: "0.4em" } } } };
      chat.messageStyles = { default: { shared: { bubble: { maxWidth: "92%", fontSize: "14px", lineHeight: "1.45" } }, ai: { bubble: { backgroundColor: "var(--hover)", color: "var(--ink)" } }, user: { bubble: { backgroundColor: "var(--accent)", color: "var(--on-red)" } } } };
      chat.messageStyles.loading = { message: { styles: { bubble: { backgroundColor: "var(--hover)", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", width: "56px", height: "36px", padding: "0", boxSizing: "border-box" } } } };
      chat.remarkable = { html: false, applyHTML: false };
      chat.auxiliaryStyle = "* { overflow-wrap: anywhere; } #messages, #text-input { scrollbar-color: var(--scrollbar) transparent; scrollbar-width: thin; } #chat-view { grid-template-rows: minmax(0, 1fr) auto auto; } #certichat-quota { color: var(--muted); text-align: center; font-size: 12px; line-height: 1.4; padding: 8px 12px; } #certichat-quota[hidden] { display: none; } a { color: var(--blue); text-decoration: underline; } a:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; } @media(prefers-reduced-motion:reduce) { *,*::before,*::after { animation:none!important; transition:none!important; scroll-behavior:auto!important; } }";
      // ponytail: the native completion class also covers restored history; no extra render pass or observers.
      // ponytail: override the native disabled filter on hover; the submission guard stays unchanged.
      chat.auxiliaryStyle += `.outer-message-container:last-child { margin-bottom: 10px; }
        #input .input-button:hover #submit-icon { color: var(--red) !important; filter: none !important; }
        .ai-message :is(p, ol, ul) { margin-block: .5em; }
        .ai-message > :first-child { margin-top: 0; }
        .ai-message > :last-child { margin-bottom: 0; }
        .ai-message :is(ol, ul) { padding-inline-start: 1.6em; }
        .chat-resource-heading { color: var(--red); font-size: .75em; font-weight: 750; letter-spacing: 1px; text-transform: uppercase; }
        .ai-message:not(.streamed-message) a { display: inline-block; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; vertical-align: bottom; color: var(--ink); }
        .ai-message:not(.streamed-message) a:hover { color: var(--red); }
        .ai-message:not(.streamed-message) a::before { content: ""; display: inline-block; width: 16px; height: 16px; margin-right: 6px; vertical-align: -3px; background-color: currentColor; mask: url("${new URL("./icons/resource-link.svg", import.meta.url).href}") center / contain no-repeat; }
        .ai-message:not(.streamed-message) a[data-link-kind="certitips"]::before { mask-image: url("${new URL("./icons/certitips-course.svg", import.meta.url).href}"); }
        .ai-message:not(.streamed-message) a[data-link-kind="certitube"]::before { mask-image: url("${new URL("./icons/certitube.svg", import.meta.url).href}"); }`;
      if (dock) chat.auxiliaryStyle += `${responseSelector}:not(.streamed-message) { border: 1px solid transparent; cursor: pointer; } ${responseSelector}:not(.streamed-message):hover { border-color: var(--red); } ${responseSelector}:focus-visible { outline: 2px solid var(--red); outline-offset: 2px; }`;
      chat.introMessage = { text: t("Hola. Resuelve tus dudas sobre las guías y prácticas del sitio.") };
      chat.history = saved.messages.map(({ role, text }) => ({ role, text }));
      chat.onMessage = ({ isHistory, message }) => {
        if (isHistory) return;
        if (message.role === "ai") {
          responseTraces.push(completedTrace); completedTrace = undefined;
          if (dock) chat.shadowRoot.querySelectorAll(responseSelector).forEach(bindResponse);
          if (pendingRequest?.requestId === completedRequest) pendingRequest = undefined;
          completedRequest = undefined;
          busy = false; clear.disabled = false;
          chat.shadowRoot.querySelector('.input-button.inside-end')?.setAttribute("aria-label", t("Enviar consulta"));
        }
        persist();
      };
      chat.errorMessages = { displayServiceErrorMessages: true };
      chat.requestBodyLimits = { maxMessages: 1 };
      chat.validateInput = text => !busy && !quotaText(quota) && Boolean(text?.trim()) && text.length <= 1500;
      chat.onComponentRender = () => {
        chat.shadowRoot.querySelector("#input")?.before(quotaNotice);
        const input = chat.shadowRoot.querySelector('[role="textbox"]');
        input?.setAttribute("aria-label", t("Escribe tu consulta"));
        input?.setAttribute("enterkeyhint", "send");
        chat.shadowRoot.querySelector('.input-button.inside-end')?.setAttribute("aria-label", t("Enviar consulta"));
        if (dock) {
          chat.shadowRoot.addEventListener("click", focusResponse);
          chat.shadowRoot.addEventListener("keydown", focusResponse);
          chat.shadowRoot.querySelectorAll(responseSelector).forEach(bindResponse);
        }
        updateQuota();
        clear.disabled = busy;
      };
      chat.addEventListener("keydown", event => {
        const input = event.composedPath()[0];
        if (input.getAttribute?.("role") !== "textbox" || event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (chat.validateInput(input.innerText)) chat.submitUserMessage({ text: input.innerText });
      }, { capture: true });
      chat.addEventListener("click", event => {
        const link = event.composedPath().find(node => node.tagName === "A");
        if (link && safeSourceURL(link.dataset.sourceUrl, root.dataset.siteRoot) && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
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
            answer = accessError || (available ? t("Completa la verificación de acceso para enviar tu consulta.") : t("El servicio no está disponible. Pulsa Reintentar conexión."));
            setStatus(answer, true);
            publishTrace(root.dataset.siteRoot, "error");
          } else {
            setStatus("");
            const message = body.messages?.at(-1)?.text?.trim() || "";
            // A transport retry reuses the UUID; the server deduplicates any paid generation.
            if (pendingRequest?.message !== message) pendingRequest = { requestId: crypto.randomUUID(), message, pageUrl: canonicalURL(document.querySelector('link[rel="canonical"]')?.href || root.dataset.siteRoot), locale };
            persist();
            const result = await api("chat", pendingRequest);
            completedRequest = pendingRequest.requestId;
            completedTrace = normalizeTrace(result.graphTrace, root.dataset.siteRoot);
            answer = answerWithReferences(String(result.answer || t("No encontré una respuesta en las guías disponibles.")), result.sources, root.dataset.siteRoot);
            updateQuota(result.quota); setStatus("");
            publishTrace(root.dataset.siteRoot, "ready", result.graphTrace);
          }
        } catch (error) {
          publishTrace(root.dataset.siteRoot, "error");
          if (error.status && (error.status !== 409 || ["request_failed", "request_expired"].includes(error.code))) pendingRequest = undefined;
          answer = error.name === "TimeoutError" ? t("La consulta tardó demasiado. Puedes repetirla para recuperar su resultado.") : error.status ? error.message : t("Sin conexión. Vuelve a intentarlo.");
          setStatus(answer, true);
          if ([401, 403].includes(error.status)) verified = false;
          if (error.status === 429) {
            try { updateQuota((await api("session", undefined, "GET")).quota); } catch { /* Keep the last known renewal time. */ }
          }
        }
        chat.shadowRoot.querySelector('.input-button.inside-end')?.setAttribute("aria-label", t("Detener respuesta"));
        await signals.onResponse({ text: answer });
        persist();
      } };
      messages.append(chat);
    }
    // ponytail: real queries use the published origin; a loopback API remains available for local tests.
    if (preview) {
      setStatus("Esta vista previa no admite consultas.", true);
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
    setStatus("");
    connecting.hidden = false; messages.hidden = true;
    try { await initialize(); }
    catch { setStatus(t("Sin conexión. Vuelve a intentarlo."), true); }
    finally {
      connecting.hidden = true; messages.hidden = false; retry.disabled = false; clear.disabled = !chat || busy;
      requestAnimationFrame(() => {
        try {
          const key = `${storageKey}:scroll`, value = sessionStorage.getItem(key), scroller = chat?.shadowRoot?.querySelector("#messages");
          if (value !== null && Number.isFinite(Number(value)) && Number(value) >= 0 && scroller) {
            scroller.scrollTop = Number(value);
            sessionStorage.removeItem(key);
          }
        } catch { /* Reading position is optional. */ }
      });
    }
  }
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let panelAnimation, closing = false;
  function animatePanel(button, fold) {
    if (dock || reducedMotion.matches || !panel.animate) return;
    const box = panel.getBoundingClientRect();
    if (!box.width || !box.height) return;
    // ponytail: fold the real panel briefly; a separate overlay is only needed if scaled content becomes distracting.
    const small = { transform: `translate(${button.right - box.right}px, ${button.bottom - box.bottom}px) scale(${button.width / box.width}, ${button.height / box.height})`, opacity: 0, borderRadius: getComputedStyle(launcher).borderRadius };
    const full = { transform: "none", opacity: 1, borderRadius: getComputedStyle(panel).borderRadius };
    return panel.animate(fold ? [full, small] : [small, full], { duration: 320, easing: "cubic-bezier(.22, 1, .36, 1)", fill: fold ? "forwards" : "none" });
  }
  function closePanel(animate = true) {
    if (dock || panel.hidden || closing) return;
    try { sessionStorage.removeItem(`${storageKey}:open`); sessionStorage.removeItem(`${storageKey}:reference`); } catch { /* Storage is optional. */ }
    panelAnimation?.cancel();
    const finish = () => {
      panel.hidden = true; launcher.hidden = false; launcher.style.removeProperty("visibility");
      launcher.setAttribute("aria-expanded", "false"); launcher.focus({ preventScroll: true });
      panelAnimation?.cancel(); panelAnimation = undefined; closing = false;
      positionLauncher();
    };
    if (!animate || reducedMotion.matches || !panel.animate) return finish();
    launcher.hidden = false; launcher.style.visibility = "hidden";
    panelAnimation = animatePanel(launcher.getBoundingClientRect(), true);
    if (!panelAnimation) return finish();
    closing = true;
    panelAnimation.finished.then(finish, finish);
  }
  function syncQuizLock() {
    quizCode = readQuizLock();
    if (quizCode) {
      const hadFocus = root.contains(document.activeElement);
      if (confirmation.open) confirmation.close();
      panelAnimation?.cancel(); panelAnimation = undefined; closing = false;
      panel.hidden = true; launcher.hidden = false; launcher.setAttribute("aria-expanded", "false");
      root.hidden = true;
      try { sessionStorage.removeItem(`${storageKey}:open`); sessionStorage.removeItem(`${storageKey}:reference`); } catch { /* Storage is optional. */ }
      if (hadFocus) document.querySelector("#main")?.focus({ preventScroll: true });
    } else if (root.hidden) {
      root.hidden = false;
      if (dock) launcher.click();
      positionLauncher();
    }
  }
  let checkingQuiz = false;
  async function refreshQuizLock() {
    const code = readQuizLock();
    if (!code || !quizApi || checkingQuiz) { syncQuizLock(); return; }
    checkingQuiz = true;
    try {
      const options = { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(5000) };
      const sessionResponse = await fetch(`${quizApi}/api/session`, options);
      if (!sessionResponse.ok) return;
      const session = await sessionResponse.json();
      let finished = session.roomCode !== code;
      if (!finished) {
        const roomResponse = await fetch(`${quizApi}/api/rooms/${code}`, options);
        if ([401, 403, 404, 410].includes(roomResponse.status)) finished = true;
        else if (roomResponse.ok) {
          const room = await roomResponse.json();
          finished = room.status === "finished" || room.role !== "player";
        }
      }
      if (finished && readQuizLock() === code) { localStorage.removeItem(quizLockKey); syncQuizLock(); }
    } catch { /* Keep the lock while the room status cannot be verified. */ }
    finally { checkingQuiz = false; }
  }
  syncQuizLock();
  if (quizCode) refreshQuizLock();
  setInterval(() => { if (quizCode) refreshQuizLock(); }, 15000);
  addEventListener("storage", event => { if (event.key === quizLockKey) { syncQuizLock(); if (quizCode) refreshQuizLock(); } });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && quizCode) refreshQuizLock(); });
  launcher.addEventListener("click", async event => {
    if (readQuizLock()) { syncQuizLock(); return; }
    if (!panel.hidden) return closePanel(event.isTrusted);
    const button = launcher.getBoundingClientRect();
    panel.hidden = false; launcher.hidden = true; launcher.setAttribute("aria-expanded", "true");
    try { sessionStorage.setItem(`${storageKey}:open`, "true"); } catch { /* The panel also works when session storage is blocked. */ }
    fitMobileViewport();
    if (event.isTrusted) panelAnimation = animatePanel(button, false);
    if (!dock && event.isTrusted) root.querySelector("[data-chat-close]").focus({ preventScroll: true });
    if (!opening) { opening = connect(); await opening; opening = undefined; }
  });
  let wasOpen = false;
  try {
    wasOpen = sessionStorage.getItem(`${storageKey}:open`) === "true" || sessionStorage.getItem(`${storageKey}:reference`) === location.href;
    sessionStorage.removeItem(`${storageKey}:reference`);
  } catch { /* Browsers may disable session storage. */ }
  if (!quizCode && (dock || location.hash === "#certichat" || wasOpen)) launcher.click();
  document.documentElement.classList.remove("chat-restoring");
  window.addEventListener("pageshow", event => {
    syncQuizLock();
    if (quizCode) refreshQuizLock();
    if (!event.persisted || dock) return;
    try {
      const open = sessionStorage.getItem(`${storageKey}:open`) === "true";
      if (open && panel.hidden && !quizCode) launcher.click();
      if (!open && !panel.hidden) closePanel(false);
    } catch { /* Keep the restored panel state if storage is unavailable. */ }
  });
  root.querySelector("[data-chat-close]").addEventListener("click", () => closePanel());
  panel.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); closePanel(); } });
  retry.addEventListener("click", connect);
  clear.addEventListener("click", () => {
    clearError.hidden = true;
    confirmation.showModal();
  });
  closeClearError.addEventListener("click", () => { clearError.hidden = true; clear.focus({ preventScroll: true }); });
  cancelClear.addEventListener("click", () => { if (!busy) confirmation.close(); });
  confirmation.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  confirmation.addEventListener("click", event => {
    if (event.target !== confirmation || busy) return;
    const bounds = confirmation.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) confirmation.close();
  });
  confirmation.addEventListener("close", () => (quizCode ? document.querySelector("#main") : clear)?.focus({ preventScroll: true }));
  confirmClear.addEventListener("click", async () => {
    busy = true; clear.disabled = true; confirmClear.disabled = true; cancelClear.disabled = true;
    confirmation.setAttribute("aria-busy", "true");
    try {
      const result = preview ? { quota } : await api("conversation", {}, "DELETE");
      chat.clearMessages(); responseTraces.length = 0; completedTrace = undefined; pendingRequest = undefined; persist();
      publishTrace(root.dataset.siteRoot, "idle");
      updateQuota(result.quota); if (!preview) setStatus(""); confirmation.close();
    } catch {
      clearError.querySelector("[data-chat-clear-error-message]").textContent = t("No se pudo borrar la conversación. Vuelve a intentarlo.");
      clearError.hidden = false;
      confirmation.close();
    } finally {
      busy = false; clear.disabled = false; confirmClear.disabled = false; cancelClear.disabled = false;
      confirmation.setAttribute("aria-busy", "false");
    }
  });
}

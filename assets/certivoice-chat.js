import { t } from "./i18n.js";
import { voiceContext } from "./certivoice-actions.js";

export function installVoiceChatControls(chat) {
  let state = { enabled: false, active: false, muted: false }, requestBusy = false;
  const quotaBlocked = () => state.quotaBlocked || chat.shadowRoot?.querySelector('[role="textbox"]')?.getAttribute("aria-disabled") === "true";
  let hints, hideHintsTimer, hintsLifetime;
  const hintsAllowed = () => state.enabled && (state.active || state.resume) && ["listening", "paused"].includes(state.phase) && !state.locked && !quotaBlocked();
  function hideHints() {
    clearTimeout(hideHintsTimer);
    clearTimeout(hintsLifetime);
    if (!hints) return;
    hints.dataset.open = "false"; hints.setAttribute("aria-hidden", "true");
    chat.shadowRoot.querySelectorAll('[aria-describedby="certivoice-hints"]').forEach(button => button.removeAttribute("aria-describedby"));
  }
  function showHints() {
    clearTimeout(hideHintsTimer);
    if (!hintsAllowed()) return;
    if (hints?.dataset.open === "true") {
      if (chat.shadowRoot.activeElement) { hints.dataset.focused = "true"; clearTimeout(hintsLifetime); }
      return;
    }
    const context = voiceContext(), has = action => context.targets.some(target => target.action === action), examples = [];
    const viewer = document.querySelector("#diagram-viewer[open]");
    if (has("practice_read")) examples.push(document.querySelector("#quiz dialog[open]") ? t("Lee la confirmación") : t("Lee la pregunta"));
    if (has("practice_explanation")) examples.push(t("Explícame esta respuesta"));
    if (has("practice_next")) examples.push(t("Siguiente pregunta"));
    if (has("practice_start")) examples.push(t("Comenzar la práctica"));
    if (viewer && context.diagramId) {
      examples.push(t("Explícame esta lámina"), t("Amplía esta explicación"), t("Dame un ejemplo de este diagrama"));
      if (viewer.classList.contains("is-presenting")) {
        if (viewer.querySelectorAll("[data-slide-number]").length > 1) examples.push(t("Siguiente lámina"));
        if (has("lecture_start")) examples.push(t("Continúa con toda la presentación"));
      } else if (has("start_presentation")) examples.push(t("Inicia la presentación"));
    } else if (context.sectionId) {
      examples.push(t("Resume esta sección"), t("Dame un ejemplo de este tema"), t("Explícame los conceptos clave"));
      if (context.diagramId && has("open_diagram")) examples.push(t("Abre este diagrama"));
    }
    if (has("return_presentation")) examples.push(t("Vuelve a la presentación"));
    if (has("video_chapter")) examples.push(t("Resume este capítulo"), t("Explícame este video"));
    if (has("catalog_group")) examples.push(t("Muestra los grupos de cursos"));
    if (examples.length < 3 && has("open_course")) examples.push(t("Abre el catálogo de cursos"));
    if (examples.length < 3 && document.querySelector('.header-app-link[href*="/certitube/"]')) examples.push(t("Abre CertiTube"));
    if (examples.length < 3 && document.querySelector('.header-app-link[href*="/certiquiz/"]')) examples.push(t("Abre CertiQuiz"));
    if (!examples.length) return;
    if (!hints) {
      hints = document.createElement("div"); hints.id = "certivoice-hints"; hints.dataset.voiceHints = "";
      hints.setAttribute("part", "voice-hints"); hints.setAttribute("role", "tooltip"); hints.setAttribute("aria-live", "off");
      chat.shadowRoot.append(hints);
    }
    hints.replaceChildren();
    // ponytail: local examples from the current controls, refreshed only on a new hover/focus.
    for (let index = 0; index < 3 && examples.length; index++) {
      const bubble = document.createElement("span"); bubble.setAttribute("part", index === 1 ? "voice-hint voice-hint-left" : "voice-hint"); bubble.dataset.voiceHint = "";
      bubble.style.setProperty("--hint-order", index); bubble.textContent = examples.splice(Math.floor(Math.random() * examples.length), 1)[0];
      hints.append(bubble);
    }
    hints.dataset.open = "true"; hints.setAttribute("aria-hidden", "false");
    hints.dataset.focused = String(Boolean(chat.shadowRoot.activeElement));
    if (!chat.shadowRoot.activeElement) hintsLifetime = setTimeout(hideHints, 10000);
    chat.shadowRoot.querySelectorAll('.custom-button:not([aria-disabled="true"])').forEach(button => button.setAttribute("aria-describedby", hints.id));
  }
  chat.addEventListener("pointerenter", event => { if (event.pointerType !== "touch") showHints(); });
  chat.addEventListener("pointerleave", () => { if (!chat.shadowRoot?.activeElement) hideHintsTimer = setTimeout(hideHints, 180); });
  chat.addEventListener("focusin", showHints);
  chat.addEventListener("focusout", () => queueMicrotask(() => { if (!chat.shadowRoot?.activeElement) hideHints(); }));
  chat.addEventListener("keydown", event => { if (event.key === "Escape" && hints?.dataset.open === "true") { event.preventDefault(); event.stopPropagation(); hideHints(); } });
  const icons = { start: "wave", mute: "mute", exit: "exit" };
  const controls = Object.keys(icons).map(command => ({
    position: "inside-end", initialState: "disabled",
    styles: { button: {
      default: {
        container: { default: { display: "flex", alignItems: "center", justifyContent: "center", width: "44px", height: "44px", boxSizing: "border-box", borderRadius: "0", border: "none", backgroundColor: "transparent", color: "#64748b", margin: "0", insetInlineEnd: command === "mute" ? "56px" : "8px", insetBlockEnd: "4px" } },
        svg: { content: `<svg xmlns="http://www.w3.org/2000/svg" data-certivoice-icon="${command}" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" fill="currentColor"/></svg>`, styles: { default: { width: "24px", height: "24px", filter: "none", maskImage: `url("${new URL(`./icons/voice-${icons[command]}.svg`, import.meta.url).href}")`, maskPosition: "center", maskSize: "contain", maskRepeat: "no-repeat" } } },
      },
      disabled: { container: { default: { display: "none" } } },
    } },
    onClick: current => {
      // Deep Chat's visual disabled state still needs an availability and busy guard.
      if (current === "disabled" || command === "mute" && state.locked || command === "start" && (!state.enabled || requestBusy || quotaBlocked() && !state.retry)) return;
      window.dispatchEvent(new CustomEvent("certivoice:command", { detail: command }));
      // Deep Chat focuses the textbox after every custom click; voice controls should not open the mobile keyboard.
      queueMicrotask(() => chat.shadowRoot?.querySelector('[role="textbox"]')?.blur());
    },
  }));
  for (const control of controls) {
    const base = control.styles.button.default;
    control.styles.button.active = { ...base, container: { default: { ...base.container.default, color: "var(--red)" } } };
  }
  chat.customButtons = [...(chat.customButtons || []), ...controls];
  chat.submitButtonStyles = { ...chat.submitButtonStyles, position: "inside-end" };
  chat.auxiliaryStyle = (chat.auxiliaryStyle || "") + ' :host([data-voice-mode]) { overflow: visible !important; } #certivoice-hints { opacity: 0; visibility: hidden; pointer-events: none; transform: translateY(6px); transition: opacity 180ms ease, transform 180ms ease, visibility 0s 180ms; } #certivoice-hints[data-open="true"] { opacity: 1; visibility: visible; pointer-events: auto; transform: translateY(0); transition-delay: 0s; } #certivoice-hints[data-focused="true"] [part~="voice-hint"] { animation: none !important; opacity: 1; } @media (prefers-reduced-motion: reduce) { #certivoice-hints { transform: none; transition: none; } }';
  chat.auxiliaryStyle = (chat.auxiliaryStyle || "") + ' :host([data-voice-mode]), :host([data-voice-mode]) :is(#chat-view, #input, #text-input-container) { background: transparent !important; } :host([data-voice-mode]) #input { height: 46px; min-height: 0; } :host([data-voice-mode]) #text-input-container { border-top: 0 !important; height: 100%; min-height: 0; } :host([data-voice-mode]) #text-input { box-sizing: border-box; height: 100%; min-height: 0; padding-block: 0 !important; } :host([data-voice-mode]) .custom-button { color: var(--voice-ink) !important; inset-block-end: 50% !important; transform: translateY(50%) !important; } :host([data-voice-mode]) [data-certivoice-icon] { width: var(--voice-icon-size, 22px) !important; height: var(--voice-icon-size, 22px) !important; } :host([data-voice-mode]) #certivoice-phase { left: 24px; color: var(--voice-ink, var(--ink)); }';
  chat.auxiliaryStyle = (chat.auxiliaryStyle || "") + ' :host([data-voice-resume="true"]) [data-voice-command="start"] { inset-inline-end: 56px !important; } [data-voice-command="mute"] { inset-inline-end: 56px !important; } [data-voice-command="exit"] { inset-inline-end: 8px !important; } #text-input-container { min-height: 52px; } .custom-button[aria-disabled="true"] { opacity: .45; cursor: not-allowed; } .custom-button:focus-visible { outline: 2px solid var(--red); outline-offset: 2px; } [data-voice-command="mute"][aria-pressed="true"] [data-certivoice-icon], .custom-button:not([aria-disabled="true"]):is(:hover, :focus-visible) [data-certivoice-icon] { color: var(--red) !important; } :host([data-voice-mode]) #messages, :host([data-voice-mode]) #certichat-quota { display: none; } :host([data-voice-mode]) #chat-view { grid-template-rows: auto; } :host([data-voice-mode]) #text-input { visibility: hidden; } #certivoice-phase { position: absolute; inset: 0 108px 0 12px; display: flex; align-items: center; justify-content: flex-start; color: var(--ink); pointer-events: none; } #certivoice-phase[hidden] { display: none; } #certivoice-phase .voice-dot { display: inline-block; animation: voice-dot-bounce 1.2s ease-in-out infinite; } #certivoice-phase .voice-dot:nth-child(2) { animation-delay: .15s; } #certivoice-phase .voice-dot:nth-child(3) { animation-delay: .3s; } #certivoice-phase[data-phase="paused"] .voice-dot { animation: none; } @keyframes voice-dot-bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-3px); } } @media (prefers-reduced-motion: reduce) { #certivoice-phase .voice-dot { animation: none; } }';
  const onKeyboard = event => {
    if (![" ", "Enter"].includes(event.key) || event.repeat) return;
    if (event.currentTarget.getAttribute("aria-disabled") === "true") { event.preventDefault(); return; }
    if (event.key === " ") { event.preventDefault(); event.currentTarget.click(); }
    queueMicrotask(() => {
      const target = state.active || state.resume ? chat.shadowRoot?.querySelector(`[data-certivoice-icon="${state.active ? "mute" : "start"}"]`)?.closest(".custom-button") : chat.shadowRoot?.querySelector('[role="textbox"]');
      target?.focus();
    });
  };

  function refresh(busy = false) {
    requestBusy = busy;
    if (!hintsAllowed()) hideHints();
    const shadow = chat.shadowRoot, input = shadow?.querySelector('[role="textbox"]');
    if (!input) return;
    const label = (state.active || state.resume) && { connecting: "Connecting…", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…", paused: "Paused…" }[state.phase];
    const panel = chat.closest?.("#certichat-panel"), heading = panel?.querySelector(".certichat-heading");
    const messages = shadow.querySelector("#messages");
    const moveFocus = label && (messages?.contains(shadow.activeElement) || heading?.contains(document.activeElement));
    for (const element of [chat, panel].filter(Boolean)) {
      if (label) element.setAttribute("data-voice-mode", "true"); else element.removeAttribute("data-voice-mode");
      element.dataset.voiceResume = String(state.resume);
      element.dataset.voicePhase = state.phase || "off";
    }
    input.contentEditable = String(!label && input.getAttribute("aria-disabled") !== "true");
    input.setAttribute("aria-readonly", String(Boolean(label)));
    if (heading) {
      heading.inert = Boolean(label);
      if (label) heading.setAttribute("aria-hidden", "true"); else heading.removeAttribute("aria-hidden");
    }
    if (messages) {
      let phase = shadow.querySelector("#certivoice-phase");
      if (!phase) {
        phase = document.createElement("div"); phase.id = "certivoice-phase";
        phase.setAttribute("role", "status"); phase.setAttribute("aria-live", "polite"); phase.setAttribute("lang", "en");
        shadow.querySelector("#text-input-container").append(phase);
      }
      // The status overlays the readonly input without changing its draft or Deep Chat's live history.
      phase.hidden = !label;
      if (phase.getAttribute("aria-label") !== (label || "")) {
        phase.setAttribute("aria-label", label || ""); phase.setAttribute("aria-atomic", "true");
        phase.innerHTML = label ? `<span>${label.slice(0, -1)}</span><span aria-hidden="true"><span class="voice-dot">.</span><span class="voice-dot">.</span><span class="voice-dot">.</span></span>` : "";
      }
      phase.dataset.phase = state.phase || "off";
      phase.title = state.error || "";
      const launcher = chat.closest(".certichat")?.querySelector("[data-chat-open]");
      phase.style.font = getComputedStyle(launcher || input).font;
      chat.style.setProperty("--voice-icon-size", launcher?.querySelector("svg") ? getComputedStyle(launcher.querySelector("svg")).width : "22px");
      messages.inert = Boolean(label);
      if (label) messages.setAttribute("aria-hidden", "true"); else messages.removeAttribute("aria-hidden");
    }
    const empty = !input.textContent.trim(), show = state.enabled && (empty || label) && (!busy || state.active || state.resume);
    // ponytail: only the native submit is inside-end besides our custom controls in pinned Deep Chat 2.5.1.
    const submit = shadow.querySelector("#input .input-button.inside-end:not(.custom-button)");
    if (submit) submit.style.display = show ? "none" : "";
    input.style.paddingRight = show && (state.active || state.resume) ? "108px" : "56px";
    const labels = { start: t(state.retry ? "Reintentar" : state.resume ? "Reanudar voz" : "Activar voz"), mute: t(state.muted ? "Activar micrófono" : "Silenciar micrófono"), exit: t("Salir del modo voz") };
    Object.keys(icons).forEach((command, index) => {
      const visible = show && (command === "start" ? !state.active : state.active || command === "exit" && state.resume);
      controls[index].setState?.(!visible ? "disabled" : command === "mute" && state.muted ? "active" : "default");
      const button = shadow.querySelector(`[data-certivoice-icon="${command}"]`)?.closest(".custom-button");
      if (!button) return;
      // Deep Chat reapplies state styles on hover; keep positioning in CSS across those transitions.
      button.dataset.voiceCommand = command;
      button.setAttribute("aria-label", labels[command]);
      button.setAttribute("title", command === "start" && state.error || labels[command]);
      const disabled = !visible || command === "mute" && state.locked || command === "start" && (requestBusy || quotaBlocked() && !state.retry);
      button.setAttribute("aria-disabled", String(disabled));
      button.tabIndex = disabled ? -1 : 0;
      if (command === "mute") button.setAttribute("aria-pressed", String(state.muted));
      button.addEventListener("keydown", onKeyboard);
    });
    if (moveFocus) shadow.querySelector(`[data-certivoice-icon="${state.active ? "mute" : "start"}"]`)?.closest(".custom-button")?.focus();
  }
  window.addEventListener("certivoice:state", event => {
    const value = event.detail || {};
    state = { quotaBlocked: value.quotaBlocked === true, enabled: value.enabled === true, active: value.active === true, phase: value.phase, error: typeof value.error === "string" ? value.error : "", muted: value.muted === true, locked: value.locked === true, retry: value.retry === true, resume: value.resume === true };
    refresh(requestBusy);
  });
  window.addEventListener("resize", () => refresh(requestBusy));
  window.dispatchEvent(new CustomEvent("certivoice:state-request"));
  return refresh;
}

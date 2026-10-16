import { t } from "./i18n.js";

export function installVoiceChatControls(chat) {
  let state = { enabled: false, active: false, muted: false }, requestBusy = false;
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
      if (current === "disabled" || command === "mute" && state.locked || command === "start" && (!state.enabled || requestBusy)) return;
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
  chat.auxiliaryStyle = (chat.auxiliaryStyle || "") + ' :host([data-voice-mode]), :host([data-voice-mode]) :is(#chat-view, #input, #text-input-container) { background: transparent !important; } :host([data-voice-mode]) #input { height: 46px; min-height: 0; } :host([data-voice-mode]) #text-input-container { border-top: 0 !important; height: 100%; min-height: 0; } :host([data-voice-mode]) #text-input { box-sizing: border-box; height: 100%; min-height: 0; padding-block: 0 !important; } :host([data-voice-mode]) .custom-button { color: var(--voice-ink) !important; inset-block-end: 50% !important; transform: translateY(50%) !important; } :host([data-voice-mode]) [data-certivoice-icon] { width: var(--voice-icon-size, 22px) !important; height: var(--voice-icon-size, 22px) !important; } :host([data-voice-mode]) #certivoice-phase { left: 24px; color: var(--voice-ink, var(--ink)); }';
  chat.auxiliaryStyle = (chat.auxiliaryStyle || "") + ' :host([data-voice-resume="true"]) [data-voice-command="start"] { inset-inline-end: 56px !important; } [data-voice-command="mute"] { inset-inline-end: 56px !important; } [data-voice-command="exit"] { inset-inline-end: 8px !important; } #text-input-container { min-height: 52px; } [data-voice-command="mute"][aria-disabled="true"] { opacity: .45; cursor: not-allowed; } .custom-button:focus-visible { outline: 2px solid var(--red); outline-offset: 2px; } [data-voice-command="mute"][aria-pressed="true"] [data-certivoice-icon], .custom-button:is(:hover, :focus-visible) [data-certivoice-icon] { color: var(--red) !important; } :host([data-voice-mode]) #messages, :host([data-voice-mode]) #certichat-quota { display: none; } :host([data-voice-mode]) #chat-view { grid-template-rows: auto; } :host([data-voice-mode]) #text-input { visibility: hidden; } #certivoice-phase { position: absolute; inset: 0 108px 0 12px; display: flex; align-items: center; justify-content: flex-start; color: var(--ink); pointer-events: none; } #certivoice-phase[hidden] { display: none; } #certivoice-phase .voice-dot { display: inline-block; animation: voice-dot-bounce 1.2s ease-in-out infinite; } #certivoice-phase .voice-dot:nth-child(2) { animation-delay: .15s; } #certivoice-phase .voice-dot:nth-child(3) { animation-delay: .3s; } #certivoice-phase[data-phase="paused"] .voice-dot { animation: none; } @keyframes voice-dot-bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-3px); } } @media (prefers-reduced-motion: reduce) { #certivoice-phase .voice-dot { animation: none; } }';
  const onKeyboard = event => {
    if (![" ", "Enter"].includes(event.key) || event.repeat) return;
    if (event.key === " ") { event.preventDefault(); event.currentTarget.click(); }
    queueMicrotask(() => {
      const target = state.active || state.resume ? chat.shadowRoot?.querySelector(`[data-certivoice-icon="${state.active ? "mute" : "start"}"]`)?.closest(".custom-button") : chat.shadowRoot?.querySelector('[role="textbox"]');
      target?.focus();
    });
  };

  function refresh(busy = false) {
    requestBusy = busy;
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
      button.setAttribute("aria-disabled", String(!visible || command === "mute" && state.locked));
      if (command === "mute") button.setAttribute("aria-pressed", String(state.muted));
      button.addEventListener("keydown", onKeyboard);
    });
    if (moveFocus) shadow.querySelector(`[data-certivoice-icon="${state.active ? "mute" : "start"}"]`)?.closest(".custom-button")?.focus();
  }
  window.addEventListener("certivoice:state", event => {
    const value = event.detail || {};
    state = { enabled: value.enabled === true, active: value.active === true, phase: value.phase, error: typeof value.error === "string" ? value.error : "", muted: value.muted === true, locked: value.locked === true, retry: value.retry === true, resume: value.resume === true };
    refresh(requestBusy);
  });
  window.addEventListener("resize", () => refresh(requestBusy));
  window.dispatchEvent(new CustomEvent("certivoice:state-request"));
  return refresh;
}

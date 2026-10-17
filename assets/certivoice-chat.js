import { t } from "./i18n.js";
import { voiceContext } from "./certivoice-actions.js";

export function installVoiceChatControls(chat) {
  let state = { enabled: false, active: false, muted: false }, requestBusy = false;
  const quotaBlocked = () => state.quotaBlocked || chat.shadowRoot?.querySelector('[role="textbox"]')?.getAttribute("aria-disabled") === "true";
  let hints, showHintsTimer, hideHintsTimer, hintsTimer, hintSequence = 0, lastHint;
  const hintPointer = window.matchMedia("(min-width: 801px) and (hover: hover) and (pointer: fine)");
  const hintsAllowed = () => hintPointer.matches && state.enabled && (state.active || state.resume) && ["listening", "paused"].includes(state.phase) && !state.muted && !state.locked && !quotaBlocked();
  function hideHints() {
    clearTimeout(showHintsTimer); showHintsTimer = null;
    clearTimeout(hideHintsTimer); hideHintsTimer = null;
    clearTimeout(hintsTimer);
    if (!hints) return;
    hints.querySelectorAll('[data-voice-hint]').forEach(bubble => bubble.getAnimations().forEach(animation => animation.cancel()));
    hints.dataset.open = "false"; hints.setAttribute("aria-hidden", "true");
    chat.shadowRoot.querySelectorAll('[aria-describedby="certivoice-hints"]').forEach(button => button.removeAttribute("aria-describedby"));
  }
  hintPointer.addEventListener("change", () => { if (!hintPointer.matches) hideHints(); });
  function hintExamples() {
    const context = voiceContext(), has = action => context.targets.some(target => target.action === action), examples = [];
    const viewer = document.querySelector("#diagram-viewer[open]");
    if (has("practice_read")) examples.push(document.querySelector("#quiz dialog[open]") ? t("Lee la confirmación") : t("Lee la pregunta"));
    if (has("practice_explanation")) examples.push(t("Explícame esta respuesta"));
    if (has("practice_next")) examples.push(t("Siguiente pregunta"));
    if (has("practice_start")) examples.push(t("Comenzar la práctica"));
    if (viewer && context.diagramId) {
      examples.push(t("Explícame esta lámina"), t("Amplía esta explicación"), t("Dame un ejemplo de este diagrama"), t("Profundiza en este tema"), t("Consulta la documentación para complementar"));
      if (viewer.classList.contains("is-presenting")) {
        if (viewer.querySelectorAll("[data-slide-number]").length > 1) examples.push(t("Siguiente lámina"));
        if (has("lecture_start")) examples.push(t("Da la charla completa de este módulo"), t("Continúa con toda la presentación"));
      } else if (has("start_presentation")) examples.push(t("Inicia la presentación"));
    } else if (context.sectionId) {
      examples.push(t("Resume esta sección"), t("Dame un ejemplo de este tema"), t("Explícame los conceptos clave"));
      if (context.diagramId && has("open_diagram")) examples.push(t("Abre este diagrama"));
    }
    if (!viewer && !document.querySelector("#quiz") && (has("start_presentation") || has("course_presentation"))) examples.push(t("Inicia la presentación"));
    if (has("return_presentation")) examples.push(t("Vuelve a la presentación"));
    if (has("video_chapter")) examples.push(t("Resume este capítulo"), t("Explícame este video"));
    if (has("catalog_group")) examples.push(t("Muestra los grupos de cursos"));
    if (examples.length < 3 && has("open_course")) examples.push(t("Abre el catálogo de cursos"));
    if (examples.length < 3 && document.querySelector('.header-app-link[href*="/certitube/"]')) examples.push(t("Abre CertiTube"));
    if (examples.length < 3 && document.querySelector('.header-app-link[href*="/certiquiz/"]')) examples.push(t("Abre CertiQuiz"));
    return [...new Set(examples)];
  }
  function rotateHints() {
    clearTimeout(hintsTimer);
    if (!hintsAllowed() || hints?.dataset.open !== "true") { hideHints(); return; }
    const examples = hintExamples();
    if (!examples.length) { hideHints(); return; }
    const still = Boolean(chat.shadowRoot.activeElement || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    hints.dataset.focused = String(Boolean(chat.shadowRoot.activeElement));
    const departing = hints.querySelector('[data-leaving="true"]')?.textContent;
    const before = new Map([...hints.children].map(bubble => [bubble, bubble.getBoundingClientRect()]));
    for (const bubble of hints.children) {
      if (still) { bubble.getAnimations().forEach(animation => animation.cancel()); delete bubble.dataset.leaving; }
    }
    for (const bubble of [...hints.children]) if (!examples.includes(bubble.textContent) || bubble.dataset.leaving === "true") bubble.remove();
    if (!still && hints.children.length === Math.min(3, examples.length)) {
      const oldest = hints.lastElementChild;
      oldest.dataset.leaving = "true";
      oldest.animate([{ opacity: 1, translate: "0 0" }, { opacity: 0, translate: "0 -8px" }], { duration: 240, fill: "forwards", easing: "ease-in" });
      hintsTimer = setTimeout(rotateHints, 240);
      return;
    }
    while (hints.children.length < 3) {
      const visible = [...hints.children].map(bubble => bubble.textContent), available = examples.filter(text => !visible.includes(text));
      if (!available.length) break;
      const choices = available.filter(text => text !== lastHint && text !== departing), pool = choices.length ? choices : available;
      const bubble = document.createElement("span"); bubble.dataset.voiceHint = ""; bubble.dataset.hintSequence = String(++hintSequence);
      bubble.textContent = lastHint = pool[Math.floor(Math.random() * pool.length)];
      hints.prepend(bubble);
      if (!still) { bubble.animate([{ opacity: 0, translate: "0 18px" }, { opacity: 1, translate: "0 0" }], { duration: 420, easing: "ease-out" }); break; }
    }
    [...hints.children].forEach((bubble, index) => {
      bubble.setAttribute("part", index === 1 ? "voice-hint voice-hint-left" : "voice-hint");
      bubble.style.setProperty("--hint-order", index);
      if (!still && before.has(bubble)) {
        const previous = before.get(bubble), current = bubble.getBoundingClientRect();
        bubble.animate([{ translate: `${previous.x - current.x}px ${previous.y - current.y}px` }, { translate: "0 0" }], { duration: 420, easing: "ease-out" });
      }
    });
    // ponytail: one local timer, at most three bubbles; every replacement rechecks current controls.
    if (!still) hintsTimer = setTimeout(rotateHints, hints.children.length < Math.min(3, examples.length) ? 650 : 3500);
  }
  function showHints(event) {
    clearTimeout(showHintsTimer); showHintsTimer = null;
    clearTimeout(hideHintsTimer); hideHintsTimer = null;
    if (!hintsAllowed() || event?.type !== "focusin" && chat.shadowRoot.querySelector('[data-voice-command="mute"]:hover, [data-voice-command="exit"]:hover')) { hideHints(); return; }
    if (!hints) {
      hints = document.createElement("div"); hints.id = "certivoice-hints"; hints.dataset.voiceHints = "";
      hints.setAttribute("part", "voice-hints"); hints.setAttribute("role", "tooltip"); hints.setAttribute("aria-live", "off");
      chat.shadowRoot.append(hints);
    }
    if (hints.dataset.open !== "true") hints.replaceChildren();
    hints.dataset.open = "true"; hints.setAttribute("aria-hidden", "false");
    chat.shadowRoot.querySelectorAll('.custom-button:not([aria-disabled="true"])').forEach(button => button.setAttribute("aria-describedby", hints.id));
    rotateHints();
  }
  function drainHints() {
    clearTimeout(showHintsTimer); showHintsTimer = null;
    clearTimeout(hintsTimer);
    clearTimeout(hideHintsTimer);
    const bubble = hints?.lastElementChild;
    if (!bubble || hints.dataset.open !== "true") { hideHints(); return; }
    bubble.getAnimations().filter(animation => animation.effect.getTiming().iterations !== Infinity).forEach(animation => animation.cancel());
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240;
    bubble.animate([{ opacity: 1 }, { opacity: 0 }], { duration, fill: "forwards" });
    hideHintsTimer = setTimeout(() => { bubble.remove(); hideHintsTimer = setTimeout(drainHints, 360); }, duration);
  }
  chat.addEventListener("pointermove", event => {
    if (event.pointerType === "touch") return;
    if (event.composedPath().some(node => node.matches?.('[data-voice-command="mute"], [data-voice-command="exit"]'))) { hideHints(); return; }
    if (!hintsAllowed() || showHintsTimer || hints?.dataset.open === "true" && !hideHintsTimer) return;
    clearTimeout(hideHintsTimer); hideHintsTimer = null;
    hints?.querySelectorAll("[data-voice-hint]").forEach(bubble => bubble.getAnimations().filter(animation => animation.effect.getTiming().iterations !== Infinity).forEach(animation => animation.cancel()));
    showHintsTimer = setTimeout(() => { showHintsTimer = null; if (chat.matches(":hover")) showHints(); }, 3000);
  }, { capture: true });
  chat.addEventListener("pointerleave", drainHints);
  chat.addEventListener("focusin", event => { if (event.composedPath().some(node => node.matches?.(":focus-visible"))) showHints(event); });
  chat.addEventListener("focusout", () => queueMicrotask(() => { if (!chat.shadowRoot?.activeElement) { if (chat.matches(":hover")) rotateHints(); else drainHints(); } }));
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
      hideHints();
      // Deep Chat's visual disabled state still needs an availability and busy guard.
      if (current === "disabled" || command === "mute" && state.locked || command === "start" && (!state.enabled || requestBusy || quotaBlocked() && !state.retry)) return;
      const dispatch = () => window.dispatchEvent(new CustomEvent("certivoice:command", { detail: command }));
      const close = command === "exit" && chat.closest?.(".certichat")?.querySelector("[data-chat-close]");
      if (close) close.click(); else dispatch();
      // Deep Chat focuses the textbox after every custom click; voice controls should not open the mobile keyboard.
      queueMicrotask(() => { chat.shadowRoot?.querySelector('[role="textbox"]')?.blur(); hideHints(); });
    },
  }));
  for (const control of controls) {
    const base = control.styles.button.default;
    control.styles.button.active = { ...base, container: { default: { ...base.container.default, color: "#fff", backgroundColor: "var(--red)", borderRadius: "50%" } } };
  }
  chat.customButtons = [...(chat.customButtons || []), ...controls];
  chat.submitButtonStyles = { ...chat.submitButtonStyles, position: "inside-end" };
  chat.auxiliaryStyle = (chat.auxiliaryStyle || "") + ' :host([data-voice-mode]) { overflow: visible !important; } #certivoice-hints { opacity: 0; visibility: hidden; pointer-events: none; transform: translateY(6px); transition: opacity 180ms ease, transform 180ms ease, visibility 0s 180ms; } #certivoice-hints[data-open="true"] { opacity: 1; visibility: visible; pointer-events: auto; transform: translateY(0); transition-delay: 0s; } #certivoice-hints[data-focused="true"] [part~="voice-hint"] { animation: none !important; opacity: 1; } @media (prefers-reduced-motion: reduce) { #certivoice-hints { transform: none; transition: none; } }';
  chat.auxiliaryStyle = (chat.auxiliaryStyle || "") + ' :host([data-voice-mode]), :host([data-voice-mode]) :is(#chat-view, #input, #text-input-container) { background: transparent !important; } :host([data-voice-mode]) #input { height: 46px; min-height: 0; } :host([data-voice-mode]) #text-input-container { border-top: 0 !important; height: 100%; min-height: 0; } :host([data-voice-mode]) #text-input { box-sizing: border-box; height: 100%; min-height: 0; padding-block: 0 !important; } :host([data-voice-mode]) .custom-button { color: var(--voice-ink) !important; inset-block-end: 50% !important; transform: translateY(50%) !important; } :host([data-voice-mode]) [data-certivoice-icon] { width: var(--voice-icon-size, 22px) !important; height: var(--voice-icon-size, 22px) !important; } :host([data-voice-mode]) #certivoice-phase { left: 24px; color: var(--voice-ink, var(--ink)); }';
  chat.auxiliaryStyle = (chat.auxiliaryStyle || "") + ' :host([data-voice-resume="true"]) [data-voice-command="start"] { inset-inline-end: 56px !important; } [data-voice-command="mute"] { inset-inline-end: 56px !important; } [data-voice-command="exit"] { inset-inline-end: 8px !important; } #text-input-container { min-height: 52px; } .custom-button[aria-disabled="true"] { opacity: .45; cursor: not-allowed; } .custom-button:focus-visible { outline: 2px solid var(--red); outline-offset: 2px; } .custom-button:not([aria-disabled="true"]):is(:hover, :focus-visible) [data-certivoice-icon] { color: var(--red) !important; } :host([data-voice-mode]) [data-voice-command="exit"] { border-radius: 50% !important; background: var(--voice-exit-surface) !important; } :host([data-voice-mode]) [data-voice-command="exit"] [data-certivoice-icon] { color: var(--voice-exit-ink) !important; } :host([data-voice-mode]) [data-voice-command="mute"][aria-pressed="true"], :host([data-voice-mode]) .custom-button:not([aria-disabled="true"]):active { border-radius: 50% !important; background: var(--red) !important; } :host([data-voice-mode]) [data-voice-command="mute"][aria-pressed="true"] [data-certivoice-icon], :host([data-voice-mode]) .custom-button:not([aria-disabled="true"]):active [data-certivoice-icon] { color: #fff !important; } :host([data-voice-mode]) #messages, :host([data-voice-mode]) #certichat-quota { display: none; } :host([data-voice-mode]) #chat-view { grid-template-rows: auto; } :host([data-voice-mode]) #text-input { visibility: hidden; } #certivoice-phase { position: absolute; inset: 0 108px 0 12px; display: flex; align-items: center; justify-content: flex-start; color: var(--ink); pointer-events: none; } #certivoice-phase[hidden] { display: none; } #certivoice-phase .voice-dot { display: inline-block; animation: voice-dot-bounce 1.2s ease-in-out infinite; } #certivoice-phase .voice-dot:nth-child(2) { animation-delay: .15s; } #certivoice-phase .voice-dot:nth-child(3) { animation-delay: .3s; } #certivoice-phase[data-phase="paused"] .voice-dot { animation: none; } @keyframes voice-dot-bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-3px); } } @media (prefers-reduced-motion: reduce) { #certivoice-phase .voice-dot { animation: none; } }';
  // Keep the existing renewal notice visible when the compact voice bar cannot resume.
  chat.auxiliaryStyle += ' :host([data-voice-phase="paused"]) #certichat-quota:not([hidden]) { display: block; position: absolute; inset: auto 8px calc(100% + 8px); box-sizing: border-box; margin: 0; padding: 8px 12px; border: 1px solid var(--red); border-radius: 8px; background: var(--paper); color: var(--ink); font-size: 13px; line-height: 1.4; text-align: center; }';
  const onKeyboard = event => {
    if (![" ", "Enter"].includes(event.key) || event.repeat) return;
    if (event.currentTarget.getAttribute("aria-disabled") === "true") { event.preventDefault(); return; }
    if (event.key === " ") { event.preventDefault(); event.currentTarget.click(); }
    queueMicrotask(() => {
      const target = state.active || state.resume ? chat.shadowRoot?.querySelector(`[data-certivoice-icon="${state.active ? "mute" : "start"}"]`)?.closest(".custom-button") : chat.shadowRoot?.querySelector('[role="textbox"]');
      target?.focus(); hideHints();
    });
  };

  chat.auxiliaryStyle = (chat.auxiliaryStyle || "") + ' @media (max-width: 800px) { :host([data-voice-mode]) #input { height: 52px !important; } :host([data-voice-mode]) #text-input-container { min-height: 0 !important; } :host([data-voice-mode]) .custom-button { width: var(--voice-control-size, 44px) !important; height: var(--voice-control-size, 44px) !important; } :host([data-voice-mode]) [data-voice-command="mute"], :host([data-voice-resume="true"]) [data-voice-command="start"] { inset-inline-end: calc(24px + var(--voice-control-size, 44px)) !important; } :host([data-voice-mode]) [data-voice-command="exit"] { inset-inline-end: 12px !important; } :host([data-voice-mode]) #certivoice-phase { left: 20px; right: calc(44px + 2 * var(--voice-control-size, 44px)); } }';

  function refresh(busy = false) {
    requestBusy = busy;
    if (!hintsAllowed()) hideHints();
    const shadow = chat.shadowRoot, input = shadow?.querySelector('[role="textbox"]');
    if (!input) return;
    const label = (state.active || state.resume) && { connecting: "Connecting…", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…", paused: "Paused…" }[state.phase];
    const panel = chat.closest?.("#certichat-panel"), heading = panel?.querySelector(".certichat-heading");
    const enteringVoice = label && panel && !panel.hasAttribute("data-voice-mode");
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
      const search = document.querySelector(".site-header .search-toggle"), reference = document.querySelector(".site-header .header-app-link svg");
      phase.style.font = getComputedStyle(search || input).font;
      chat.style.setProperty("--voice-icon-size", reference ? getComputedStyle(reference).width : "24px");
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
      button.setAttribute("title", command === "start" && (state.error || quotaBlocked() && !state.retry && (shadow.querySelector("#certichat-quota")?.textContent || t("Se alcanzó un límite de uso. Inténtalo más tarde."))) || labels[command]);
      const disabled = !visible || command === "mute" && state.locked || command === "start" && (requestBusy || quotaBlocked() && !state.retry);
      button.setAttribute("aria-disabled", String(disabled));
      button.tabIndex = disabled ? -1 : 0;
      if (command === "mute") button.setAttribute("aria-pressed", String(state.muted));
      button.addEventListener("keydown", onKeyboard);
    });
    if (enteringVoice && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) panel.animate([{ opacity: 0, translate: "0 8px" }, { opacity: 1, translate: "0 0" }], { duration: 280, easing: "ease-out" });
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

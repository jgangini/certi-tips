import { navigateSite } from "./site-navigation.js";
import { t, locale, language, canonicalURL, localizedURL, siteBase } from "./i18n.js";
import { animateVoiceEdge, captureVoice, encodeVoiceWav, heardCharacters, nativeSpeechSegments, preferredNativeVoice, restoreVoicePlayback, voiceMemoryFresh, VoiceActivity } from "./certivoice-audio.js";
import { performVoiceAction, explanationSource, voiceContext, voicePageURL, pendingNavigation, shouldResumeNavigation, validVoiceNavigation } from "./certivoice-actions.js";
import { clearVoiceHighlight } from "./certivoice-study.js";
import { activityTrail } from "./certichat-activity.js";
import { voiceDiagnostics } from "./certivoice-telemetry.js";

const root = typeof document === "undefined" ? null : document.querySelector("[data-certivoice]");
if (root) {
  const config = document.querySelector("[data-certichat]");
  const diagnostics = voiceDiagnostics(config);
  let reportedPhase;
  const status = root.querySelector("[data-voice-status]"), verification = root.querySelector("[data-voice-verification]");
  const navigationKey = `certivoice:${config.dataset.siteRoot}:navigation`;
  const playbackKey = `certivoice:${config.dataset.siteRoot}:playback`;
  const local = ["localhost", "127.0.0.1", "[::1]"], preview = local.includes(location.hostname) && !local.includes(new URL(config.dataset.api).hostname);
  let session, voiceError = "", active = false, muted = false, context, release, detector, controller, playback = readPlayback(), speech, output, utterance, epoch = 0, widget, pending, pendingSent = false, pendingSince, pendingExpiry, lastActivity = 0, starting = false, checkingSession = false, rejectVerification;
  const edge = document.querySelector("[data-voice-edge]");
  let lecture, lectureTimer, nativeVoice, nativeVoiceLocale = locale, lastExplained, aside;
  let stopEdge, nativeStartTimer, followTimer, videoLocked = false, videoConfirmation, navigating = false;
  const separateCapture = /iPhone|iPad|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const originalAudioType = navigator.audioSession?.type;
  const restoreVoiceHome = () => (document.querySelector("[data-explorer-chat-slot]") || document.body).append(config);
  const quotaBlocked = () => Number.isFinite(session?.quota?.remaining) && session.quota.remaining <= 0;
  const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
  function setStatus(text, error = false) {
    if (error && (active || starting)) { pause(text, true); return; }
    if (error) { voiceError = text; if (lecture) lecture.running = false; }
    const enabled = session?.voice?.enabled === true && session.available !== false && !config.hidden;
    const resume = enabled && !active && !starting && Boolean(pendingNavigation(readNavigation(), location.href, siteBase));
    const phase = starting ? "connecting" : !active ? resume ? "paused" : "off" : navigating ? "thinking" : output || utterance && speech?.started ? "speaking" : controller || utterance ? "thinking" : muted ? "paused" : "listening";
    if ((phase !== reportedPhase || error) && diagnostics.record("state", { phase, active: active || starting, muted, error: Boolean(voiceError), platform: separateCapture ? "ios" : "other" })) reportedPhase = phase;
    status.setAttribute("aria-live", (active || starting || resume) && (!voiceError || starting) ? "off" : "polite");
    status.textContent = text;
    if (edge) edge.dataset.state = resume ? "paused" : active ? phase === "thinking" ? "processing" : phase === "paused" ? "muted" : phase : "off";
    const indicator = document.querySelector("[data-voice-unavailable]");
    if (indicator) {
      indicator.hidden = config.hidden || preview || !(voiceError || session && (session.voice?.enabled !== true || session.available === false));
      const message = voiceError || t("La voz no está disponible en este momento.");
      indicator.setAttribute("title", message); indicator.setAttribute("aria-label", message);
    }
    config.dataset.voiceMode = String(Boolean(active || starting || resume));
    emit("certivoice:state", { enabled, quotaBlocked: quotaBlocked(), active: active || starting, phase, error: voiceError, muted, locked: videoLocked, retry: Boolean(pending && pendingSent), resume });
  }
  function interrupt(reason = "speech_replaced") {
    if (output || utterance) diagnostics.record("action", { action: reason, phase: "speaking", muted });
    if (speech) speech.after = null;
    stopEdge?.(); stopEdge = null;
    if (output && playback && speech?.track) playback.heardCharacters = Math.min(5000, speech.offset + heardCharacters(speech.text, context.currentTime - speech.started, speech.duration));
    if (output) { output.onended = null; try { output.stop(); } catch { /* Already ended. */ } output = null; }
    clearTimeout(nativeStartTimer); clearInterval(followTimer);
    const nativePending = utterance || window.speechSynthesis?.speaking || window.speechSynthesis?.pending;
    if (utterance) { utterance.onstart = null; utterance.onend = null; utterance.onerror = null; utterance.onboundary = null; utterance = null; }
    // Clear the silent iOS primer too; idle WebKit cancellations can swallow the next speak.
    if (nativePending) window.speechSynthesis.cancel();
    savePlayback();
  }
  function pause(message = t("Voz pausada. Pulsa Activar voz para continuar."), error = false, preserveMode = true, reason = "session_pause") {
    if (active || starting) diagnostics.record("action", { action: reason, phase: reportedPhase || "listening", muted });
    clearVoiceHighlight(); aside = null; clearTimeout(lectureTimer); if (lecture) lecture.running = false;
    if (!preserveMode) { clearNavigation(); dismissVideo(); lecture = null; }
    epoch++; active = false; starting = false; checkingSession = false; muted = false; interrupt(error ? "error_pause" : reason); controller?.abort(); controller = null;
    rejectVerification?.(new Error("Cancelled")); rejectVerification = null; verification.hidden = true;
    if (widget !== undefined && window.turnstile) { window.turnstile.remove(widget); widget = undefined; }
    release?.stop(); release = null; detector?.reset();
    if (separateCapture && navigator.audioSession) navigator.audioSession.type = originalAudioType || "auto";
    if (context?.state === "running") context.suspend().catch(() => {});
    setStatus(message, error);
  }
  async function api(route, body, method = "POST", signal) {
    const response = await fetch(`${config.dataset.api}/api/${route}`, { method, credentials: "include", headers: { "X-CertiChat": "1", ...diagnostics.headers(body?.requestId), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: signal || AbortSignal.timeout(15000) });
    diagnostics.record("api", { operation: route, status: response.status, ...(body?.requestId ? { request_id: body.requestId } : {}) });
    const data = await response.json();
    if (!response.ok) {
      const contextError = { voice_context_unindexed: t("No hay fuentes verificadas para este diagrama. Elige otra imagen o consulta."), voice_context_unavailable: t("El contenido del diagrama cambió. Actualiza la página antes de continuar."), voice_stale_playback: t("Las fuentes cambiaron. Pide una explicación actualizada."), voice_contract: t("No pude completar esa acción. Intenta pedírmela de otra forma.") }[data.code];
      const error = new Error(contextError || (response.status === 429 ? t("Se alcanzó un límite de uso. Inténtalo más tarde.") : response.status === 401 || response.status === 403 ? t("Verifica tu acceso para continuar.") : t("No se pudo completar la consulta de voz.")));
      error.status = response.status; error.code = data.code; error.retryAfter = Math.max(0, Number(response.headers.get("Retry-After")) || 0); throw error;
    }
    return data;
  }
  function applySession(value) {
    session = value; voiceError = ""; diagnostics.enable(value.authenticated && value.voice?.enabled);
    root.hidden = value.voice?.enabled !== true || value.available === false || config.hidden;
    if (root.hidden && (!checkingSession || config.hidden)) clearNavigation();
    if (root.hidden && (active || starting && (!checkingSession || config.hidden))) pause(t("La voz no está disponible en este momento."), false, false);
    setStatus(status.textContent);
  }
  async function verifyAccess() {
    if (session.mode === "LOCAL") { await api("session", {}); applySession(await api("session", undefined, "GET")); return; }
    if (!config.dataset.siteKey) throw new Error(t("La verificación de acceso no está disponible. Inténtalo más tarde."));
    setStatus(t("Completa la verificación para activar la voz.")); verification.hidden = false;
    if (!window.turnstile) await new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]');
      const script = existing || document.createElement("script");
      script.addEventListener("load", resolve, { once: true }); script.addEventListener("error", reject, { once: true });
      if (!existing) { script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; script.async = true; document.head.append(script); }
    });
    await new Promise((resolve, reject) => {
      rejectVerification = reject;
      if (widget !== undefined) window.turnstile.remove(widget);
      widget = window.turnstile.render(verification, { sitekey: config.dataset.siteKey, action: "certichat_session", theme: "auto", size: "flexible", callback: async token => {
        try { await api("session", { turnstileToken: token }); applySession(await api("session", undefined, "GET")); verification.hidden = true; rejectVerification = null; resolve(); }
        catch (error) { reject(error); }
      }, "expired-callback": () => reject(new Error(t("La verificación caducó. Vuelve a intentarlo."))), "error-callback": () => reject(new Error(t("No se pudo verificar el acceso."))) });
    });
  }
  function dismissVideo() {
    document.querySelector("[data-tube-player]")?.removeAttribute("data-voice-confirm");
    videoConfirmation?.remove(); videoConfirmation = null;
  }
  async function playVideo() {
    const player = document.querySelector('[data-tube-player][data-voice-confirm="true"]');
    if (!player || !active || videoLocked) return;
    if (lecture) lecture.running = false; clearTimeout(lectureTimer);
    interrupt("video_playback"); muted = true; release?.setMuted(true); detector?.reset();
    const command = { name: "play", accepted: false };
    player.dispatchEvent(new CustomEvent("certitube:command", { detail: command }));
    videoLocked = true; setStatus(t("Micrófono silenciado durante el video."));
    try {
      if (!command.accepted || !await command.completion) throw new Error("Fullscreen gesture required");
      dismissVideo();
    } catch { videoLocked = false; setStatus(t("Pulsa Reproducir para abrir el video en pantalla completa.")); }
  }
  function offerVideo() {
    dismissVideo();
    const player = document.querySelector("[data-tube-player]");
    if (!player) return;
    player.dataset.voiceConfirm = "true";
    videoConfirmation = document.createElement("div"); videoConfirmation.dataset.voiceVideoConfirm = "";
    const question = document.createElement("p"); question.textContent = t("¿Quieres reproducir este fragmento en pantalla completa?");
    const play = document.createElement("button"), cancel = document.createElement("button");
    play.type = cancel.type = "button"; play.dataset.voiceVideoPlay = ""; cancel.dataset.voiceVideoCancel = "";
    play.textContent = t("Reproducir en pantalla completa"); cancel.textContent = t("Ahora no");
    play.addEventListener("click", () => { void playVideo(); }); cancel.addEventListener("click", dismissVideo);
    videoConfirmation.append(question, play, cancel); config.querySelector("#certichat-panel").append(videoConfirmation);
  }
  async function offerLecture(result, token) {
    // An explicit spoken lecture_start requests the bounded presentation, not just one explanation.
    const moduleId = result.lecture.moduleId;
    if (moduleId !== undefined && (typeof moduleId !== "string" || moduleId !== result.action.targetId.split("#")[0])) throw new Error(t("No se pudo identificar el diagrama actual."));
    lecture = { requestId: result.requestId, running: true, consent: true, step: 0, moduleId };
    const title = document.querySelector("#diagram-caption")?.textContent || document.title;
    const message = lastExplained && lastExplained.id !== result.action.targetId
      ? t("Claro. Ya vimos {previous}. Ahora pasamos a {next} y seguiremos con las demás imágenes.", { previous: lastExplained.title, next: title })
      : t("Claro. Recorreremos la presentación empezando por {title}. Puedes interrumpirme cuando quieras.", { title });
    await say(message, null, undefined, token);
    if (token !== epoch || !active || !lecture?.running) return;
    if (output || utterance) speech.after = () => { lectureTimer = setTimeout(() => lectureTurn(), 0); };
    else lectureTimer = setTimeout(() => lectureTurn(), 0);
  }
  async function returnFromAside(saved, token) {
    if (aside !== saved || token !== epoch || !active) return;
    try {
      if (!await navigateSite(saved.url, { source: "voice" }) || token !== epoch || !active || aside !== saved) return;
      const result = await performVoiceAction({ name: "start_presentation", targetId: saved.diagramId });
      if (result.error) throw new Error(result.error);
      if (aside !== saved || token !== epoch || !active) return;
      diagnostics.record("action", { action: "explanation_returned" });
      aside = null; lecture = saved.lecture; lastExplained = saved.lastExplained;
      const previous = restoreVoicePlayback(saved.playback);
      if (nativeVoice && previous && previous.heardCharacters < previous.answer.length) {
        playback = previous;
        await say(previous.answer.slice(previous.heardCharacters), null, { requestId: previous.requestId, answer: previous.answer, offset: previous.heardCharacters }, token);
      } else if (lecture?.running && !quotaBlocked()) await lectureTurn();
      else await finishSpeech(0, "", false);
    } catch (error) { if (token === epoch && active) { aside = null; if (lecture) lecture.running = false; setStatus(error.message, true); } }
  }
  async function explainAside(result, token) {
    const viewer = document.querySelector("#diagram-viewer[open].is-presenting[data-source-id]");
    if (result.expanded === true && viewer && !aside) {
      const target = explanationSource(result.sources);
      if (!target) return;
      const url = new URL(localizedURL(voicePageURL())); url.host = location.host; url.protocol = location.protocol; url.hash = viewer.dataset.sourceId.split("#")[1];
      aside = { url: url.href, diagramId: viewer.dataset.sourceId, lecture: lecture?.interrupted ? { ...lecture, running: true, interrupted: false } : null, playback: speech?.track ? playback && { ...playback } : null, lastExplained };
      const saved = aside;
      try {
        if (!await navigateSite(target.navigation, { source: "voice" }) || token !== epoch || !active || aside !== saved) { if (aside === saved) aside = null; return; }
        saved.source = target;
        diagnostics.record("action", { action: "explanation_document" });
      } catch { if (aside === saved) aside = null; return; }
    }
    if (aside?.source) aside.follow = aside.source.reveal(result.answer);
    return aside;
  }
  async function finishSpeech(offset, text, completed = true) {
    clearTimeout(nativeStartTimer); clearInterval(followTimer);
    stopEdge?.(); stopEdge = null; output = null; utterance = null;
    if (completed && speech?.track && playback) playback.heardCharacters = Math.min(5000, offset + text.length);
    if (completed && speech?.track && speech.diagramId) lastExplained = { id: speech.diagramId, title: speech.title };
    savePlayback(); detector?.reset(); lastActivity = Date.now();
    // Continuations keep the playback profile; reopening iOS capture between lecture segments interrupts audio.
    if (active && speech?.after) { const after = speech.after; speech.after = null; await after(); return; }
    if (active && lecture?.running && lecture.consent && !quotaBlocked()) { lectureTimer = setTimeout(() => lectureTurn(true), 0); return; }
    if (active && !release && !document.hidden && !quotaBlocked()) {
      const token = epoch;
      starting = true; setStatus(t("Activando el micrófono…"));
      try {
        const capture = await openCapture();
        if (token !== epoch || !active || document.hidden) { capture.stop(); if (token === epoch) { starting = false; setStatus(t("Micrófono silenciado.")); } return; }
        release = capture; release.setMuted(muted);
        await context.resume();
        if (token !== epoch || !active) return;
        if (context.state !== "running") throw new Error("Audio context interrupted");
        starting = false;
      } catch { if (token === epoch) pause(t("El micrófono se desconectó. Vuelve a activar la voz."), true); return; }
    }
    setStatus(muted ? t("Micrófono silenciado.") : t("Te escucho…"));
    if (speech?.after) { const after = speech.after; speech.after = null; after(); return; }
    if (quotaBlocked()) { pause(t("Se alcanzó un límite de uso. Inténtalo más tarde.")); return; }
    if (lecture?.running && lecture.consent) lectureTimer = setTimeout(() => lectureTurn(true), 0);
  }
  async function lectureTurn(advance = false) {
    if (!lecture?.running || !lecture.consent || !active || controller || videoLocked) return;
    if (quotaBlocked()) { pause(t("Se alcanzó un límite de uso. Inténtalo más tarde.")); return; }
    const token = epoch;
    try {
      const viewer = document.querySelector("#diagram-viewer.is-presenting[open]");
      if (!viewer) { lecture.running = false; return; }
      const slides = [...viewer.querySelectorAll(".diagram-presentation-nav button")];
      const index = slides.findIndex(button => button.getAttribute("aria-current") === "true");
      const target = advance ? index >= 0 && slides[index + 1]?.dataset.sourceId : viewer.dataset.sourceId;
      if (!target || lecture.moduleId && target.split("#")[0] !== lecture.moduleId) { lecture.running = false; setStatus(t("Charla finalizada. Te escucho…")); return; }
      if (advance) {
        const result = await performVoiceAction({ name: "next_slide" });
        if (result.error) throw new Error(result.error);
      }
      if (token !== epoch || !lecture?.running || !active) return;
      const { sectionId, diagramId } = voiceContext();
      if (!diagramId) throw new Error(t("No se pudo identificar el diagrama actual."));
      clearPending();
      pending = { mode: "lecture", requestId: crypto.randomUUID(), previousRequestId: lecture.requestId, pageUrl: voicePageURL(), locale, audioOutput: nativeVoice ? "browser" : "provider", context: { ...(sectionId ? { sectionId } : {}), diagramId }, activityTrail: activityTrail() };
      pendingSince = Date.now(); pendingExpiry = setTimeout(expireMemory, 86400000);
      await submitPending(token);
    } catch (error) { if (token === epoch) { if (lecture) lecture.running = false; setStatus(error.message, true); } }
  }
  async function say(text, audio, progress, token) {
    const createdAt = progress?.requestId && progress.requestId === playback?.requestId ? playback.createdAt : Date.now();
    expireMemory();
    interrupt();
    if (!text || token !== epoch || !active) return;
    if (!voiceMemoryFresh(createdAt)) { pause(); return; }
    const offset = Number.isInteger(progress?.offset) ? Math.max(0, Math.min(5000, progress.offset)) : 0;
    if (progress?.requestId) playback = { requestId: progress.requestId, answer: progress.answer || text, heardCharacters: offset, createdAt };
    speech = { text, offset, follow: aside?.follow, track: Boolean(progress?.requestId), diagramId: voiceContext().diagramId, title: document.querySelector("#diagram-caption")?.textContent || document.title }; savePlayback();
    diagnostics.record("speech", { native_event: "request", ...(nativeVoice ? {} : { audio_session: navigator.audioSession?.type }) });
    if (separateCapture) {
      // ponytail: iOS speech can permanently mute a live capture; use explicit turn-taking there.
      release?.stop(); release = null;
      if (navigator.audioSession) navigator.audioSession.type = "playback";
      if (!nativeVoice || !document.hidden) await context.resume();
      if (token !== epoch || !active) return;
    }
    if (!nativeVoice && audio?.format === "wav" && typeof audio.data === "string" && audio.data.length <= 14000000) {
      try {
        const bytes = Uint8Array.from(atob(audio.data), character => character.charCodeAt(0));
        if (String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF") throw new Error("Invalid audio");
        const decoded = await context.decodeAudioData(bytes.buffer);
        if (token !== epoch || !active) return;
        output = context.createBufferSource(); output.buffer = decoded; output.connect(context.destination);
        speech.started = context.currentTime; speech.duration = decoded.duration;
        output.onended = () => finishSpeech(offset, text);
        output.start();
        if (speech.follow) { speech.follow(0); followTimer = setInterval(() => speech.follow(heardCharacters(text, context.currentTime - speech.started, speech.duration)), 250); }
        stopEdge = animateVoiceEdge(context, decoded, edge); setStatus(t("Hablando. Puedes interrumpir.")); return;
      } catch { /* A valid text response remains usable if audio decoding fails. */ }
    }
    const textStatus = `${text} ${t("Respuesta disponible como texto. Te escucho…")}`;
    if (!nativeVoice) { if (lecture && progress) lecture.running = false; if (separateCapture) await finishSpeech(offset, text, false); if (token === epoch && active) setStatus(textStatus); return; }
    const parts = nativeSpeechSegments(text, nativeVoice, Boolean(speech.follow));
    function speakPart(index) {
      const part = parts[index];
      if (token !== epoch || !active) return;
      if (!part) return finishSpeech(offset, text);
      const current = utterance = new SpeechSynthesisUtterance(part.text);
      current.voice = part.voice; current.lang = part.voice.lang;
      let started = false;
      const progressAt = position => {
        const at = part.sourceIndex(position);
        if (speech.track && playback) playback.heardCharacters = Math.min(5000, offset + at);
        speech.follow?.(at);
      };
      current.onstart = () => {
        if (utterance !== current || token !== epoch || !active) return;
        diagnostics.record("speech", { native_event: "start", audio_session: navigator.audioSession?.type });
        clearTimeout(nativeStartTimer); started = speech.started = true; progressAt(0); setStatus(t("Hablando. Puedes interrumpir."));
      };
      current.onboundary = event => { if (utterance === current && token === epoch && active && Number.isInteger(event.charIndex)) progressAt(event.charIndex); };
      current.onend = () => {
        if (utterance !== current || token !== epoch || !active) return;
        clearTimeout(nativeStartTimer); diagnostics.record("speech", { native_event: "end" });
        if (speech.track && playback) playback.heardCharacters = Math.min(5000, offset + part.end);
        return speakPart(index + 1);
      };
      current.onerror = event => {
        if (utterance !== current || token !== epoch || !active) return;
        const codes = ["not-allowed", "audio-busy", "audio-hardware", "network", "synthesis-unavailable", "synthesis-failed", "language-unavailable", "voice-unavailable", "text-too-long", "invalid-argument", "canceled", "interrupted"];
        diagnostics.record("speech", { native_event: "error", native_error: codes.includes(event?.error) ? event.error : "unknown" });
        if (separateCapture) pause(t("La respuesta está disponible como texto. El audio no está disponible."), true);
        else { clearTimeout(nativeStartTimer); utterance = null; if (lecture) lecture.running = false; if (speech.after) { const after = speech.after; speech.after = null; after(); } else if (quotaBlocked()) pause(t("Se alcanzó un límite de uso. Inténtalo más tarde.")); else setStatus(textStatus); }
      };
      nativeStartTimer = setTimeout(() => {
        if (utterance === current && !started) { diagnostics.record("speech", { native_event: "timeout" }); pause(t("La respuesta está disponible como texto. El audio no está disponible."), true); }
      }, 5000);
      setStatus(t("Preparando la respuesta…")); speechSynthesis.speak(current);
    }
    speakPart(0);
  }
  async function selectNativeVoice() {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    if (!speechSynthesis.getVoices().length) await new Promise(resolve => {
      const ready = () => { clearTimeout(timer); speechSynthesis.removeEventListener?.("voiceschanged", ready); resolve(); };
      const timer = setTimeout(ready, 700); speechSynthesis.addEventListener?.("voiceschanged", ready, { once: true });
    });
    return preferredNativeVoice(speechSynthesis.getVoices(), language);
  }
  async function send(chunks) {
    if (!active || controller) return;
    expireMemory(); clearPending();
    const token = epoch;
    // A failed transport retains its UUID and audio in memory only, until explicit retry or a new utterance.
    pending = { requestId: crypto.randomUUID(), audio: encodeVoiceWav(chunks, context.sampleRate), pageUrl: voicePageURL(), locale, audioOutput: nativeVoice ? "browser" : "provider", context: voiceContext(document, lastExplained?.id), activityTrail: activityTrail(), ...(playback?.requestId ? { playback: { requestId: playback.requestId, heardCharacters: playback.heardCharacters } } : {}) };
    pendingSince = Date.now(); pendingExpiry = setTimeout(expireMemory, 86400000);
    await submitPending(token);
  }
  async function submitPending(token) {
    expireMemory();
    if (!pending || controller) return;
    if (quotaBlocked() && !pendingSent) { clearPending(); pause(t("Se alcanzó un límite de uso. Inténtalo más tarde.")); return; }
    voiceError = "";
    controller = new AbortController(); const abort = controller, timer = setTimeout(() => abort.abort(), 130000);
    setStatus(t("Preparando la respuesta…")); emit("certivoice:busy", true);
    try {
      pendingSent = true;
      const result = await api("voice", pending, "POST", abort.signal);
      if (token !== epoch || !active) return;
      if (result.requestId !== pending.requestId || typeof result.answer !== "string" || result.answer.length > 12000 || typeof result.transcript !== "string" || result.transcript.length > 1500) throw new Error(t("La respuesta de voz no es válida."));
      clearPending();
      if (result.lecture && lecture?.consent && Number.isInteger(result.lecture.step) && result.lecture.step > 0 && result.lecture.step <= 200) {
        lecture.requestId = result.requestId; lecture.step = result.lecture.step; lecture.running = result.lecture.done !== true;
      }
      if (result.educational === true) emit("certichat:voice-result", result);
      emit("certichat:session", { ...session, quota: result.quota });
      // Practice rerenders remove their dialogs; move the live chat instance out before that happens.
      if (result.action?.name?.startsWith("practice_") && config.closest("#quiz dialog")) {
        restoreVoiceHome(); if (edge) document.body.append(edge);
      }
      diagnostics.record("action", { ...(result.action?.name ? { action: result.action.name } : {}), request_id: result.requestId });
      if (result.action) aside = null;
      const explanation = result.educational === true && !result.action ? await explainAside(result, token) : null;
      const action = await performVoiceAction(result.action);
      if (token !== epoch || !active) return;
      if (action.error && lecture) lecture.running = false;
      if (action.control === "lecture_start" && result.lecture?.step === 0) { await offerLecture(result, token); return; }
      if (action.control === "continue" && lecture?.consent && result.playbackRequestId) lecture.running = true;
      if (action.video?.name === "chapter") offerVideo();
      if (action.video?.name === "play") { await playVideo(); return; }
      if (action.video?.name === "close") {
        const command = { name: "close", accepted: false };
        document.querySelector("[data-tube-player]")?.dispatchEvent(new CustomEvent("certitube:command", { detail: command }));
        dismissVideo();
        if (!command.accepted) throw new Error(t("No se pudo cerrar el video."));
      }
      if (action.navigation) { await navigate(action); return; }
      if (action.control === "stop") { pause(undefined, false, false); return; }
      const text = action.error || action.confirmation || result.answer;
      if (result.audioError && !action.error && !action.confirmation) {
        if (lecture) lecture.running = false;
        if (result.educational && (!lecture?.consent || result.lecture)) { playback = { requestId: result.requestId, answer: result.answer, heardCharacters: 0, createdAt: Date.now() }; savePlayback(); }
        setStatus(t("La respuesta está disponible como texto. El audio no está disponible."), true); return;
      }
      if (result.playbackRequestId && (playback?.requestId !== result.playbackRequestId || !voiceMemoryFresh(playback.createdAt))) throw new Error(t("No se pudo completar la consulta de voz."));
      const progress = action.error || action.confirmation ? null : result.playbackRequestId ? { requestId: result.playbackRequestId, offset: result.playbackOffset, answer: playback.answer } : result.educational && (!lecture?.consent || result.lecture) ? { requestId: result.requestId, answer: result.answer } : null;
      await say(text, action.error || action.confirmation ? null : result.audio, progress, token);
      if (explanation && token === epoch && active) {
        if (output || utterance) speech.after = () => returnFromAside(explanation, token);
        else await returnFromAside(explanation, token);
      }
    } catch (error) {
      if (token !== epoch) return;
      const wait = error.retryAfter ? t(" Vuelve a intentarlo en {seconds} segundos.", { seconds: Math.ceil(error.retryAfter) }) : "";
      if (error.status && !(error.status === 409 && error.code === "request_pending")) clearPending();
      if (error.code === "voice_contract") { voiceError = error.message; await say(error.message, null, undefined, token); return; }
      pause((error.name === "AbortError" ? t("La consulta tardó demasiado. Pulsa Reintentar para recuperar su resultado.") : error.message || t("Sin conexión. Vuelve a intentarlo.")) + wait, true);
      if (error.status === 429) {
        const paused = epoch;
        try { const value = await api("session", undefined, "GET"); if (paused === epoch) emit("certichat:session", value); } catch { /* Keep the server limit error until session recovery succeeds. */ }
      }
    } finally {
      clearTimeout(timer); if (controller === abort) controller = null;
      if (token === epoch) detector?.reset();
      if (!controller) { emit("certivoice:busy", false); if (active && quotaBlocked() && !output && !utterance) pause(t("Se alcanzó un límite de uso. Inténtalo más tarde.")); else setStatus(status.textContent); }
    }
  }
  async function navigate(action) {
    const token = epoch;
    const move = async () => {
      if (token !== epoch || !active) return;
      try {
        if (await navigateSite(action.navigation, { source: "voice" })) {
          if (token !== epoch || !active) return;
          const next = action.afterNavigation && await performVoiceAction(action.afterNavigation);
          await say(next?.error || t("Página abierta: {title}", { title: document.querySelector("h1")?.textContent || document.title }), null, undefined, token);
          return;
        }
      } catch (error) {
        if (token === epoch && active && error.name !== "AbortError") await say(t("Sin conexión. Vuelve a intentarlo."), null, undefined, token);
        return;
      }
      if (token !== epoch || !active) return;
      saveNavigation(action.navigation, action.afterNavigation);
      pause(t("Abriendo la página…"), false, true); if (action.activate) action.activate(); else location.assign(action.navigation);
    };
    if (action.confirmation) await say(action.confirmation, null, undefined, token);
    if (token !== epoch || !active) return;
    if (action.confirmation && (output || utterance)) speech.after = move;
    else await move();
  }
  window.addEventListener("site:will-navigate", event => {
    navigating = true;
    diagnostics.record("navigation", { automatic: true, phase: active ? "thinking" : "off" });
    if (lecture) lecture.running = false; clearTimeout(lectureTimer);
    interrupt("page_navigation"); dismissVideo(); videoLocked = false; lastExplained = null; detector?.reset(); release?.setMuted(true);
    if (quotaBlocked()) { release?.stop(); release = null; }
    if (event.detail.source !== "voice") { aside = null; epoch++; controller?.abort(); controller = null; clearPending(); emit("certivoice:busy", false); }
    setStatus(t("Abriendo la página…"));
  });
  window.addEventListener("site:did-navigate", event => {
    event.detail.completion = (async () => {
      navigating = false;
      diagnostics.record("navigation", { automatic: true, phase: active ? muted ? "paused" : "listening" : "off" });
      const saved = readNavigation();
      if (saved && voiceMemoryFresh(saved.createdAt)) {
        try { sessionStorage.setItem(navigationKey, JSON.stringify({ url: location.href, createdAt: saved.createdAt, session: true, ...(!active ? { pending: true } : {}) })); } catch { /* Optional continuation storage. */ }
      }
      if (nativeVoiceLocale !== locale) { nativeVoice = undefined; nativeVoiceLocale = locale; }
      if (!active) { setStatus(status.textContent); return; }
      const token = epoch;
      nativeVoice ||= await selectNativeVoice();
      if (token !== epoch || !active) return;
      release?.setMuted(muted); detector?.reset();
      if (quotaBlocked()) { release?.stop(); release = null; setStatus(t("Se alcanzó un límite de uso. Inténtalo más tarde.")); return; }
      if (!release && !controller && !aside) await finishSpeech(0, "", false);
      else setStatus(muted ? t("Micrófono silenciado.") : t("Te escucho…"));
    })();
  });
  window.addEventListener("certivoice:practice-followup", async event => {
    if (!active || !event.detail?.action) return;
    const token = epoch, action = await performVoiceAction(event.detail.action);
    if (token !== epoch || !active) return;
    if (action.navigation) await navigate(action);
    else await say(action.error || action.confirmation || "", null, undefined, token);
  });
  function saveNavigation(url, afterNavigation) {
    const saved = pendingNavigation(readNavigation(), location.href, siteBase);
    try { sessionStorage.setItem(navigationKey, JSON.stringify({ url, createdAt: saved?.createdAt ?? Date.now(), session: true, pending: true, autoResume: active && !muted && !videoLocked && !document.hidden && !separateCapture, resumeAt: Date.now(), ...(afterNavigation ? { afterNavigation } : {}) })); } catch { /* Navigation works without continuity storage. */ }
  }
  function openCapture() {
    if (separateCapture && navigator.audioSession) navigator.audioSession.type = "play-and-record";
    diagnostics.record("capture", { audio_session: navigator.audioSession?.type });
    return captureVoice(context, chunk => {
      if (!active || muted || navigating || document.hidden) return;
      const event = detector.push(chunk, Boolean(output || utterance));
      if (event.started) {
        diagnostics.record("action", { action: "speech_detected", phase: output || utterance ? "speaking" : controller ? "thinking" : "listening", muted });
        if (controller) { pause(t("Consulta interrumpida. Pulsa Reintentar para recuperar su resultado."), false, true, "request_interrupted"); return; }
        if (lecture) { lecture.interrupted = lecture.running; lecture.running = false; } clearTimeout(lectureTimer);
        interrupt("microphone_interrupt"); lastActivity = Date.now(); setStatus(t("Te escucho…"));
      }
      if (event.chunks) { lastActivity = Date.now(); send(event.chunks).catch(() => pause(t("No se pudo preparar el audio."), true)); }
    }, event => { diagnostics.record("capture", { track_state: event?.target?.readyState, track_muted: event?.target?.muted }); if (!document.hidden) pause(t("El micrófono se desconectó. Vuelve a activar la voz."), true); });
  }
  async function start(retry = false, automatic = false) {
    if (starting) return;
    if (config.hidden) { pause(t("La voz no está disponible en este momento."), false, false); return; }
    expireMemory();
    const recovery = retry && pending && pendingSent;
    if (quotaBlocked() && !recovery) return;
    starting = true; checkingSession = true; const token = ++epoch;
    setStatus(t("Activando el micrófono…"));
    try {
      const AudioEngine = window.AudioContext || window.webkitAudioContext;
      if (!AudioEngine || !navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) throw new Error(t("La voz no está disponible en este navegador. Puedes usar el chat."));
      // iOS gates speech separately from Web Audio: unlock it within the original tap.
      if (!automatic && window.speechSynthesis && window.SpeechSynthesisUtterance) {
        const warmup = new SpeechSynthesisUtterance(""); warmup.volume = 0; speechSynthesis.speak(warmup);
      }
      context ||= new AudioEngine();
      context.onstatechange = () => { diagnostics.record("context", { context_state: context.state, audio_session: navigator.audioSession?.type }); if (active && release && !starting && !document.hidden && context.state !== "running") pause(t("El micrófono se desconectó. Vuelve a activar la voz."), true); };
      if (!automatic) await context.resume();
      interrupt();
      const currentSession = await api("session", undefined, "GET");
      if (token !== epoch) return;
      checkingSession = false; session = currentSession;
      if (session.voice?.enabled !== true) throw new Error(t("El modo voz todavía no está habilitado. Puedes seguir usando el chat."));
      if (session.available === false || config.hidden) throw new Error(t("La voz no está disponible en este momento."));
      applySession(session);
      if (!automatic && (!session.authenticated || session.verificationRequired)) await verifyAccess();
      emit("certichat:session", session);
      diagnostics.record("navigation", { automatic });
      if (quotaBlocked() && !recovery) throw new Error(t("Se alcanzó un límite de uso. Inténtalo más tarde."));
      if (!session.authenticated || session.verificationRequired) throw new Error(t("Verifica tu acceso para continuar."));
      if (token !== epoch) return;
      nativeVoice ||= await selectNativeVoice();
      if (token !== epoch) return;
      // Recover the already submitted UUID without opening another microphone session.
      if (quotaBlocked() && recovery) { active = true; starting = false; await submitPending(token); return; }
      if (quotaBlocked()) throw new Error(t("Se alcanzó un límite de uso. Inténtalo más tarde."));
      detector = new VoiceActivity(context.sampleRate);
      const stopCapture = await openCapture();
      if (token !== epoch || quotaBlocked()) { stopCapture.stop(); if (token === epoch) pause(t("Se alcanzó un límite de uso. Inténtalo más tarde.")); return; }
      if (document.hidden) { stopCapture.stop(); active = true; starting = false; setStatus(t("Micrófono silenciado.")); return; }
      release = stopCapture;
      if (automatic) {
        // Capture permission is already granted; bound browsers that still require a playback gesture.
        let timer;
        try { await Promise.race([context.resume(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(t("Pulsa Reanudar para continuar con el micrófono."))), 1500); })]); }
        finally { clearTimeout(timer); }
        if (token !== epoch || quotaBlocked()) { stopCapture.stop(); if (token === epoch) pause(t("Se alcanzó un límite de uso. Inténtalo más tarde.")); return; }
      }
      const resume = pendingNavigation(readNavigation(), location.href, siteBase);
      try { sessionStorage.setItem(navigationKey, JSON.stringify({ url: location.href, createdAt: resume?.createdAt ?? Date.now(), session: true })); } catch { /* Voice remains usable without session continuity. */ }
      release = stopCapture; release.setMuted(muted); active = true; starting = false; lastActivity = Date.now();
      setStatus(muted ? t("Micrófono silenciado.") : t("Te escucho…"));
      if (resume && (resume.pending || !resume.session) && new URL(resume.url).pathname === location.pathname) await say(t("Página abierta: {title}", { title: document.querySelector("h1")?.textContent || document.title }), null, undefined, token);
      if (retry && pending) await submitPending(token);
    } catch (error) {
      if (token !== epoch) return;
      const message = error.name === "NotAllowedError" ? t("Permite el micrófono para usar la voz. El chat sigue disponible.") : error.message || t("No se pudo iniciar el micrófono.");
      root.hidden = session?.voice?.enabled !== true || session?.available === false || config.hidden;
      pause(message, true);
    } finally { if (token === epoch) starting = false; }
  }
  function readNavigation() { try { const raw = sessionStorage.getItem(navigationKey); return raw?.length <= 4096 ? JSON.parse(raw) : null; } catch { return null; } }
  function clearNavigation() { try { sessionStorage.removeItem(navigationKey); } catch { /* Optional continuity. */ } }
  function readPlayback() { try { const raw = sessionStorage.getItem(playbackKey); return raw?.length <= 26000 ? restoreVoicePlayback(JSON.parse(raw)) : null; } catch { return null; } }
  function savePlayback() { playback = restoreVoicePlayback(playback); try { if (playback) sessionStorage.setItem(playbackKey, JSON.stringify(playback)); else sessionStorage.removeItem(playbackKey); } catch { /* Playback also works without continuity storage. */ } }
  function clearPending() { pending = null; pendingSent = false; pendingSince = undefined; clearTimeout(pendingExpiry); setStatus(status.textContent); }
  function expireMemory() { const saved = readNavigation(); if (saved && !voiceMemoryFresh(saved.createdAt)) pause(t("Voz pausada por inactividad."), false, false); if (pending && !voiceMemoryFresh(pendingSince)) clearPending(); if (playback && !voiceMemoryFresh(playback.createdAt)) { playback = null; savePlayback(); } }
  function toggleMute() { if (videoLocked || !active && !starting) return; muted = !muted; diagnostics.record("action", { action: muted ? "microphone_muted" : "microphone_unmuted", muted }); release?.setMuted(muted); detector?.reset(); lastActivity = Date.now(); setStatus(muted ? t("Micrófono silenciado.") : t("Te escucho…")); }
  window.addEventListener("certichat:activity", () => { if (active || starting || readNavigation()) pause(t("Voz pausada mientras usas el chat."), false, false); });
  window.addEventListener("certichat:session", event => { if (event.detail) applySession(event.detail); });
  window.addEventListener("certichat:quota", event => {
    if (!session || !event.detail?.quota) return;
    const blocked = quotaBlocked();
    session = { ...session, quota: event.detail.quota };
    if (blocked && !quotaBlocked()) voiceError = "";
    setStatus(status.textContent);
  });
  window.addEventListener("certivoice:state-request", () => setStatus(status.textContent));
  window.addEventListener("certivoice:command", event => { if (event.detail === "exit") pause(undefined, false, false); else if (event.detail === "mute") toggleMute(); else if (event.detail === "interrupt" && active) { if (lecture) lecture.running = false; clearTimeout(lectureTimer); interrupt("explicit_interrupt"); detector?.reset(); void finishSpeech(0, "", false); } else if (event.detail === "start" && !config.hidden && !active && !starting) start(Boolean(pending)); });
  window.addEventListener("certichat:cleared", () => { pause(undefined, false, false); clearPending(); playback = null; speech = null; lastExplained = null; clearNavigation(); try { sessionStorage.removeItem(playbackKey); } catch { /* Optional continuity. */ } });
  document.addEventListener("click", event => {
    if (!active || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.("a[href]");
    if (!link || link.hasAttribute("download") || link.target && link.target !== "_self") return;
    const url = validVoiceNavigation(link.href, location.href, siteBase);
    if (url && new URL(url).pathname !== location.pathname) saveNavigation(url);
  }, true);
  window.addEventListener("pagehide", () => { pause(undefined, false, true, "page_hidden"); void diagnostics.flush(true); });
  document.addEventListener("visibilitychange", () => {
    if (!active && !starting) return;
    diagnostics.record("action", { action: document.hidden ? "background_playback" : "foreground_playback", phase: reportedPhase, muted });
    if (document.hidden) {
      // Keep authorized narration/requests alive; capture resumes only after returning to the visible page.
      const capture = release; release = null; capture?.stop(); detector?.reset();
      if (navigator.audioSession) navigator.audioSession.type = "playback";
      void diagnostics.flush(true);
    } else if (output) void context.resume().catch(() => pause(t("La respuesta está disponible como texto. El audio no está disponible."), true));
    else if (active && !starting && !utterance && !output && !controller && !lecture?.running && !aside && !navigating) void finishSpeech(0, "", false);
  });
  new MutationObserver(() => { if (session) applySession(session); }).observe(config, { attributes: true, attributeFilter: ["hidden"] });
  setInterval(expireMemory, 5000);
  const viewer = document.querySelector("#diagram-viewer");
  document.querySelectorAll("dialog").forEach(dialog => new MutationObserver(() => {
    if (dialog === viewer) { const parent = viewer.open ? viewer : document.body; if (edge) parent.append(edge); if (!viewer.open && lecture) lecture.running = false; }
    else if (dialog.id === "site-search") {
      if (dialog.open && (active || starting)) { dialog.append(config); if (edge) dialog.append(edge); }
      else if (!dialog.open && config.parentNode === dialog) { restoreVoiceHome(); if (edge) document.body.append(edge); }
    } else if (dialog.open && dialog.id !== "language-transition" && !dialog.closest("#quiz") && (active || starting)) pause();
  }).observe(dialog, { attributes: true, attributeFilter: ["open"] }));
  let quizObserver;
  function observePractice() {
    quizObserver?.disconnect();
    const quiz = document.querySelector("#quiz");
  if (quiz) {
    let currentDialog;
    quizObserver = new MutationObserver(() => {
      const dialog = quiz.querySelector('dialog.confirmation[open]:is([data-finish-confirm], [data-reset-confirm], [data-exit-confirm])');
      if (dialog && (active || starting)) {
        if (!dialog.contains(config)) { dialog.append(config); if (edge) dialog.append(edge); }
        if (dialog !== currentDialog && !controller) void say(dialog.querySelector(".confirmation-body")?.textContent || "", null, undefined, epoch);
      } else if (!config.isConnected || config.closest("#quiz dialog")) {
        restoreVoiceHome(); if (edge) document.body.append(edge);
      }
      currentDialog = dialog;
    }); quizObserver.observe(quiz, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
  }
  }
  observePractice();
  window.addEventListener("site:page", observePractice);
  window.addEventListener("certitube:playback", event => {
    videoLocked = event.detail?.playing === true;
    if (videoLocked) { if (lecture) lecture.running = false; clearTimeout(lectureTimer); muted = true; release?.setMuted(true); detector?.reset(); interrupt("video_playback"); }
    setStatus(videoLocked ? t("Micrófono silenciado durante el video.") : t("Video detenido. Activa el micrófono para continuar."));
  });
  expireMemory();
  if (!preview) api("session", undefined, "GET").then(async value => {
    applySession(value);
    const navigation = readNavigation(), resume = pendingNavigation(navigation, location.href, siteBase);
    if (resume?.afterNavigation) {
      const result = await performVoiceAction(resume.afterNavigation);
      if (result.error) { setStatus(result.error); return; }
      try { const saved = readNavigation(); if (saved) { delete saved.afterNavigation; sessionStorage.setItem(navigationKey, JSON.stringify(saved)); } } catch { /* Optional continuity. */ }
    }
    setStatus(resume ? t("Página abierta. Pulsa Reanudar para continuar.") : t("Tutor de voz"));
    if (!separateCapture && shouldResumeNavigation(navigation, location.href, siteBase)) {
      // One navigation handoff, never a permission prompt or a saved recording retry.
      try { const saved = readNavigation(); delete saved.autoResume; delete saved.resumeAt; sessionStorage.setItem(navigationKey, JSON.stringify(saved)); } catch { return; }
      const token = epoch;
      const permission = await navigator.permissions?.query({ name: "microphone" }).catch(() => null);
      if (token === epoch && shouldResumeNavigation(navigation, location.href, siteBase) && permission?.state === "granted" && !document.hidden && session?.authenticated && !session.verificationRequired && !root.hidden) await start(false, true);
    }
  }).catch(() => { if (!session) { root.hidden = true; setStatus(t("La voz no está disponible en este momento."), true); } });
}

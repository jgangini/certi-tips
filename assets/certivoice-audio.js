// PCM is bounded before encoding; no microphone recording is persisted.
export function encodeVoiceWav(chunks, sampleRate) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || !length || length > sampleRate * 30) throw new Error("Invalid recording");
  const input = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) { input.set(chunk, offset); offset += chunk.length; }
  const count = Math.floor(length * 16000 / sampleRate), bytes = new Uint8Array(44 + count * 2), view = new DataView(bytes.buffer);
  for (const [at, text] of [[0, "RIFF"], [8, "WAVE"], [12, "fmt "], [36, "data"]]) for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i);
  view.setUint32(4, bytes.length - 8, true); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * sampleRate / 16000), end = Math.min(length, Math.max(start + 1, Math.floor((i + 1) * sampleRate / 16000)));
    let total = 0;
    for (let j = start; j < end; j++) total += Number.isFinite(input[j]) ? input[j] : 0;
    const value = Math.max(-1, Math.min(1, total / (end - start)));
    view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export function heardCharacters(answer, elapsed, duration) {
  if (typeof answer !== "string" || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(elapsed)) return 0;
  // ponytail: provider audio has no word timings; conservative proportional progress is approximate.
  return Math.floor(answer.length * Math.max(0, Math.min(1, elapsed / duration)));
}

export function preferredNativeVoice(voices, language) {
  // ponytail: catalogs expose no gender or multilingual capability; use explicit names, then pin the choice.
  const candidates = voices.filter(voice => voice.lang.split("-")[0] === language.split("-")[0] && /Sabina|Helena|Paulina|Mónica|Monica|Elvira|Dalia|Zira|Samantha|Victoria|Aria|Jenny|Hazel|Susan|Serena|Karen|Moira|Tessa|Luciana|Francisca|Maria|Elsa|Isabella|Federica/i.test(voice.name));
  return candidates.find(voice => /Multilingual/i.test(voice.name)) || candidates.find(voice => /Natural|Neural/i.test(voice.name)) || candidates[0];
}

export function nativePronunciation(text, voice) {
  const changes = [];
  let shift = 0;
  // ponytail: one reported product alias for legacy Microsoft ES voices, not a general English pronunciation engine.
  const legacySpanish = /^es(?:-|$)/i.test(voice?.lang || "") && /Microsoft/i.test(voice?.name || "") && !/Multilingual|Natural|Neural/i.test(voice.name);
  const english = /^en(?:-|$)/i.test(voice?.lang || "");
  const pattern = english ? /(?<![\p{L}\p{N}_])(?:SaaS|IaaS|PaaS|FaaS)(?![\p{L}\p{N}_])/giu : /(?<![\p{L}\p{N}_])Oracle\s+AI(?![\p{L}\p{N}_])/giu;
  const spoken = legacySpanish || english ? text.replace(pattern, (word, at) => {
    const replacement = english ? { saas: "sass", iaas: "eye ass", paas: "pass", faas: "fass" }[word.toLowerCase()] : "Órakol éi ái", start = at + shift;
    shift += replacement.length - word.length;
    changes.push({ start, end: start + replacement.length, original: at, shift });
    return replacement;
  }) : text;
  return { text: spoken, sourceIndex(position) {
    let difference = 0;
    for (const change of changes) {
      if (position < change.start) break;
      if (position < change.end) return change.original;
      difference = change.shift;
    }
    return Math.max(0, Math.min(text.length, position - difference));
  } };
}

export function nativeSpeechSegments(text, voice, voices, followSentences = false) {
  const english = preferredNativeVoice(voices, "en") || voices.find(item => /^en(?:-|$)/i.test(item.lang));
  // ponytail: reviewed cloud vocabulary only; extend it for new terms rather than guessing a word's language from casing.
  const terms = /(?<![\p{L}\p{N}_])(?:(?:Software|Infrastructure|Platform|Functions?)\s+as\s+a\s+Service|Oracle(?:\s+(?:Cloud(?:\s+Infrastructure)?|AI))?|OpenAI|LangChain|LangGraph|GitHub|YouTube|Docker|Kubernetes|tenancy|tenancies|identity\s+domains?|compartments?|availability\s+domains?|fault\s+domains?|Object\s+Storage|Block\s+Volume|File\s+Storage|load\s+balancer|bare\s+metal|serverless|cloud|compute|storage|networking|buckets?|subnets?|endpoints?|regions?|shapes?|ingress|egress|prompts?|tokens?|embeddings?|fine[- ]tuning|machine\s+learning|deep\s+learning|SaaS|IaaS|PaaS|FaaS|AI|OCI|OCID|API|SDK|MCP|RAG|LLM|IAM|VCN|VNIC|VM|OKE|NLP|OCR|ML|CPU|GPU|HTTP|HTTPS|URL|DNS|CIDR|NAT|DRG|NSG|RPO|RTO|SQL|JSON)(?![\p{L}\p{N}_])/giu;
  const parts = [];
  const append = (start, end, selected) => {
    if (start === end) return;
    const previous = parts.at(-1);
    if (previous && (previous.voice === selected || !/[\p{L}\p{N}]/u.test(text.slice(start, end)))) { previous.end = end; return; }
    parts.push({ start, end, voice: selected });
  };
  let start = 0;
  if (english && !/^en(?:-|$)/i.test(voice.lang)) for (const match of text.matchAll(terms)) {
    append(start, match.index, voice); append(match.index, match.index + match[0].length, english); start = match.index + match[0].length;
  }
  append(start, text.length, voice);
  const sentences = followSentences ? [...new Intl.Segmenter(voice.lang, { granularity: "sentence" }).segment(text)].map(item => item.index) : [];
  return parts.flatMap(part => {
    const boundaries = [part.start, ...sentences.filter(index => index > part.start && index < part.end), part.end];
    return boundaries.slice(0, -1).map((index, i) => {
      const end = boundaries[i + 1], original = text.slice(index, end), pronunciation = nativePronunciation(original, part.voice);
      return { text: pronunciation.text, voice: part.voice, start: index, end, sourceIndex: position => index + pronunciation.sourceIndex(position) };
    }).filter(part => part.text.trim());
  });
}

export function animateVoiceEdge(context, buffer, edge) {
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  if (!edge || motion.matches) return () => {};
  const samples = buffer.getChannelData(0), started = context.currentTime;
  let frame, level = 0;
  const stop = () => { cancelAnimationFrame(frame); edge.style.removeProperty("--voice-level"); };
  function draw() {
    if (motion.matches) { stop(); return; }
    // The decoded mono audio and playback clock give the actual speech envelope without another audio node.
    const start = Math.max(0, Math.floor((context.currentTime - started) * buffer.sampleRate));
    const end = Math.min(samples.length, start + 512);
    let energy = 0;
    for (let index = start; index < end; index++) energy += samples[index] ** 2;
    const volume = Math.min(1, Math.sqrt(energy / Math.max(1, end - start)) * 7);
    level += (volume - level) * .35;
    edge.style.setProperty("--voice-level", level.toFixed(3));
    frame = requestAnimationFrame(draw);
  }
  frame = requestAnimationFrame(draw);
  return stop;
}

export const voiceMemoryFresh = (createdAt, now = Date.now()) => Number.isFinite(createdAt) && createdAt <= now && now - createdAt < 86400000;

export function restoreVoicePlayback(value, now = Date.now()) {
  if (!value || !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value.requestId) || typeof value.answer !== "string" || value.answer.length > 12000 || !Number.isInteger(value.heardCharacters) || value.heardCharacters < 0 || value.heardCharacters > 5000 || !voiceMemoryFresh(value.createdAt, now)) return null;
  return { requestId: value.requestId, answer: value.answer, heardCharacters: value.heardCharacters, createdAt: value.createdAt };
}

export class VoiceActivity {
  constructor(sampleRate) { this.sampleRate = sampleRate; this.reset(); }
  reset() { this.chunks = []; this.preRoll = []; this.samples = 0; this.silence = 0; this.voiced = 0; this.active = false; this.noise = .004; }
  push(chunk, speaking = false) {
    const seconds = chunk.length / this.sampleRate;
    const rms = Math.sqrt(chunk.reduce((sum, value) => sum + value * value, 0) / chunk.length);
    const voiced = rms > Math.max(speaking ? .045 : .018, this.noise * 3);
    if (!voiced && !this.active) this.noise = .95 * this.noise + .05 * rms;
    this.voiced = voiced ? this.voiced + seconds : 0;
    if (!this.active) {
      this.preRoll.push(chunk);
      while (this.preRoll.reduce((sum, item) => sum + item.length, 0) > this.sampleRate * .3) this.preRoll.shift();
      if (this.voiced < .12) return {};
      this.active = true; this.chunks = this.preRoll; this.preRoll = [];
      this.samples = this.chunks.reduce((sum, item) => sum + item.length, 0);
      return { started: true };
    }
    const remaining = this.sampleRate * 30 - this.samples;
    const bounded = chunk.subarray(0, Math.max(0, remaining));
    this.chunks.push(bounded); this.samples += bounded.length;
    this.silence = voiced ? 0 : this.silence + seconds;
    if (this.silence < .9 && this.samples < this.sampleRate * 30) return {};
    const chunks = this.chunks; this.reset();
    return { chunks };
  }
}

export async function captureVoice(context, onSamples, onEnded) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  try {
    stream.getTracks().forEach(track => { track.addEventListener?.("ended", onEnded, { once: true }); track.addEventListener?.("mute", onEnded, { once: true }); });
    const worklet = new URL("./certivoice-capture.js", import.meta.url);
    worklet.search = new URL(import.meta.url).search;
    await context.audioWorklet.addModule(worklet.href);
    const source = context.createMediaStreamSource(stream), node = new AudioWorkletNode(context, "certivoice-capture"), silent = context.createGain();
    silent.gain.value = 0;
    source.connect(node); node.connect(silent); silent.connect(context.destination);
    node.port.onmessage = event => onSamples(event.data);
    return {
      stop() { node.port.onmessage = null; source.disconnect(); node.disconnect(); silent.disconnect(); stream.getTracks().forEach(track => { track.removeEventListener?.("ended", onEnded); track.removeEventListener?.("mute", onEnded); track.stop(); }); },
      setMuted(value) { stream.getAudioTracks().forEach(track => { track.enabled = !value; }); },
    };
  } catch (error) { stream.getTracks().forEach(track => track.stop()); throw error; }
}

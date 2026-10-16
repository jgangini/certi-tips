class VoiceCapture extends AudioWorkletProcessor {
  constructor() { super(); this.samples = new Float32Array(2048); this.offset = 0; }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) for (const value of channel) {
      this.samples[this.offset++] = value;
      if (this.offset === this.samples.length) { this.port.postMessage(this.samples); this.offset = 0; }
    }
    return true;
  }
}
registerProcessor("certivoice-capture", VoiceCapture);

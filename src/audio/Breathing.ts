// Oxygen-mask breathing for the crew and the pilot. A quiet inhale/exhale made from
// band-passed noise with a soft valve click at each inhale. The rate quickens as the
// combat intensity rises. Breaths are scheduled a little ahead on the audio clock so the
// rhythm holds steady even when the main thread stutters; the loop fades out on the menus.

const CALM_PERIOD = 4.8;   // seconds per breath at rest (about 12 a minute)
const COMBAT_PERIOD = 2.3; // seconds per breath under fire (about 26 a minute)
const LOOKAHEAD = 0.6;     // seconds of breaths queued ahead of the audio clock
const TICK_MS = 80;

const rand = () => Math.random() * 2 - 1;

export class Breathing {
  private bus: GainNode;
  private env: GainNode;
  private bp: BiquadFilterNode;
  private clicks: AudioBuffer[];
  private live = new Set<AudioBufferSourceNode>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextAt = 0;
  private target = 0; // requested intensity, 0..1
  private level = 0;  // eased intensity that drives the breathing rate
  private running = false;

  constructor(private ctx: AudioContext, out: AudioNode) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(out);
    // Mask-muffled air: noise -> highpass -> bandpass (swept per breath) -> envelope
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer();
    noise.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 180; hp.Q.value = 0.5;
    this.bp = ctx.createBiquadFilter();
    this.bp.type = 'bandpass'; this.bp.frequency.value = 500; this.bp.Q.value = 0.9;
    this.env = ctx.createGain();
    this.env.gain.value = 0;
    noise.connect(hp).connect(this.bp).connect(this.env).connect(this.bus);
    noise.start(ctx.currentTime + 0.05);
    this.clicks = [this.clickBuffer(1700), this.clickBuffer(2300)];
  }

  // Combat intensity 0..1 from the fighter sound model; eased in tick() so it never snaps.
  setIntensity(x: number) { this.target = Math.min(1, Math.max(0, x)); }

  start() {
    if (this.running) return;
    this.running = true;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(1, t, 0.6);
    this.nextAt = t + 0.8; // let the fade-in lead the first breath
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    const t = this.ctx.currentTime;
    // Drop queued breaths and clicks, then fade the bus so nothing clicks
    this.env.gain.cancelScheduledValues(t);
    this.env.gain.setTargetAtTime(0, t, 0.02);
    this.bp.frequency.cancelScheduledValues(t);
    for (const s of this.live) { try { s.stop(t); } catch { /* already ended */ } }
    this.live.clear();
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(0, t, 0.15);
    this.level = 0;
  }

  private tick() {
    const now = this.ctx.currentTime;
    this.level += (this.target - this.level) * 0.08;
    // After a long stall (background tab, suspended context) restart the queue from now
    if (this.nextAt < now + 0.05) this.nextAt = now + 0.3;
    const horizon = now + LOOKAHEAD;
    while (this.nextAt < horizon) {
      // Slight per-breath jitter keeps it human rather than metronomic
      const period = (CALM_PERIOD + (COMBAT_PERIOD - CALM_PERIOD) * this.level) * (0.92 + Math.random() * 0.16);
      this.breath(this.nextAt, period);
      this.nextAt += period;
    }
  }

  private breath(t0: number, period: number) {
    const k = this.level; // 0 at rest, 1 under fire
    const inhale = period * 0.42;
    const exhale = period - inhale;
    const t1 = t0 + inhale;
    const peak = 0.2 + 0.14 * k; // stays well under the wind bed; a little deeper when working hard
    const e = this.env.gain;
    const f = this.bp.frequency;

    // Inhale: air drawn through the mask, the band opens as the flow builds
    f.setValueAtTime(380, t0);
    f.linearRampToValueAtTime(820 + 200 * k, t0 + inhale * 0.7);
    f.linearRampToValueAtTime(600, t1);
    e.setValueAtTime(0, t0);
    e.linearRampToValueAtTime(peak, t0 + inhale * 0.6);
    e.linearRampToValueAtTime(0, t1);

    // Exhale: softer, longer, the band falls away through the valve
    f.setValueAtTime(600, t1);
    f.linearRampToValueAtTime(340, t1 + exhale * 0.9);
    e.setValueAtTime(0, t1);
    e.linearRampToValueAtTime(peak * 0.7, t1 + 0.12);
    e.linearRampToValueAtTime(peak * 0.45, t1 + exhale * 0.45);
    e.linearRampToValueAtTime(0, t1 + exhale * 0.92);

    // Soft valve tick as the inhale opens, a fainter one on the exhale
    this.click(t0 + 0.02, 0.07 + 0.03 * k);
    this.click(t1 + 0.05, 0.03 + 0.015 * k);
  }

  private click(when: number, gain: number) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.clicks[Math.random() < 0.5 ? 0 : 1];
    const g = ctx.createGain();
    g.gain.value = gain;
    s.connect(g).connect(this.bus);
    s.start(when);
    this.live.add(s);
    s.onended = () => { this.live.delete(s); s.disconnect(); g.disconnect(); };
  }

  // Pre-rendered once: a few milliseconds of tuned tick, decaying fast
  private clickBuffer(freq: number): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const n = Math.floor(0.03 * sr);
    const b = this.ctx.createBuffer(1, n, sr);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      d[i] = (Math.sin(2 * Math.PI * freq * t) * 0.6 + rand() * 0.4) * Math.exp(-t / 0.0035);
    }
    return b;
  }

  // Looping white noise; the bandpass does the colouring
  private noiseBuffer(): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const n = Math.floor(4 * sr);
    const b = this.ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = rand();
    }
    return b;
  }
}

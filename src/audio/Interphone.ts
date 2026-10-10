// Crew interphone feel for radio subtitles. Everything is synthesised at init (no sample
// files): a key-press call-click, a short band-limited static burst (telephone band, with
// sparse crackle), then a click-off HOLD_S later. Played unpositioned on the sfx bus, the
// same way as the old squelch.

// The crewman's line starts this long after the call-click, so the click reads as the cue.
export const INTERPHONE_LEAD_S = 0.3;
// Time from the call-click to the click-off.
const HOLD_S = 2.5;

const rand = () => Math.random() * 2 - 1;

// One-pole filters for offline synthesis (cheap band-limiting of noise)
class LP1 { y = 0; a: number; constructor(fc: number, sr: number) { this.a = 1 - Math.exp(-2 * Math.PI * fc / sr); } run(x: number) { this.y += this.a * (x - this.y); return this.y; } }
class HP1 { y = 0; x1 = 0; a: number; constructor(fc: number, sr: number) { this.a = 1 / (1 + 2 * Math.PI * fc / sr); } run(x: number) { this.y = this.a * (this.y + x - this.x1); this.x1 = x; return this.y; } }

// Band-pass chain: one high-pass, two low-pass poles (about 12 dB/oct on the top end).
function bandpass(lo: number, hi: number, sr: number): (x: number) => number {
  const hp = new HP1(lo, sr), lp1 = new LP1(hi, sr), lp2 = new LP1(hi, sr);
  return (x) => lp2.run(lp1.run(hp.run(x)));
}

export class Interphone {
  private clickOn: AudioBuffer[] = [];
  private clickOff: AudioBuffer[] = [];
  private staticBurst: AudioBuffer;
  // scheduled static/click-off nodes of the current call, so a new call can supersede them
  private pending: AudioBufferSourceNode[] = [];

  constructor(private ctx: AudioContext, private dest: AudioNode) {
    const sr = ctx.sampleRate;
    // call-click: a sharp transient, a small body tone and a thump, two slightly different takes
    for (const v of [0, 1]) {
      const f1 = v ? 1250 : 1500;
      const nz = bandpass(1000, 5000, sr);
      this.clickOn.push(this.render(0.04, (t) =>
        nz(rand()) * Math.exp(-t * 320) * 0.9 +
        Math.sin(2 * Math.PI * f1 * t) * Math.exp(-t * 110) * 0.5 +
        Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 70) * 0.4, 0.7));
    }
    // click-off: a lower, softer click on hang-up
    for (const v of [0, 1]) {
      const f1 = v ? 1000 : 900;
      const nz = bandpass(700, 3000, sr);
      this.clickOff.push(this.render(0.09, (t) =>
        nz(rand()) * Math.exp(-t * 120) * 0.7 +
        Math.sin(2 * Math.PI * f1 * t) * Math.exp(-t * 55) * 0.6 +
        Math.sin(2 * Math.PI * 260 * t) * Math.exp(-t * 40) * 0.4, 0.55));
    }
    // static burst: telephone band (300-3400 Hz), quick attack, fast decay, slight flutter
    // and sparse pops that go through the same filter so they stay band-limited
    const band = bandpass(300, 3400, sr);
    this.staticBurst = this.render(0.36, (t) => {
      const env = Math.min(1, t / 0.012) * Math.exp(-t * 7) * (0.8 + 0.2 * Math.sin(2 * Math.PI * 28 * t));
      const pop = Math.random() < 0.003 ? rand() * 4 : 0;
      return band(rand() + pop) * env;
    }, 0.35);
  }

  // Call-click, static burst, then the click-off `hold` seconds later (recorded voice lines
  // pass their own length). A new call supersedes any static or click-off still pending.
  call(hold = HOLD_S) {
    this.cancel();
    const t = this.ctx.currentTime + 0.01;
    this.one(this.pick(this.clickOn), t, 0.4);
    this.schedule(this.staticBurst, t + 0.02, 0.7);
    this.schedule(this.pick(this.clickOff), t + (Number.isFinite(hold) ? Math.min(30, Math.max(0.3, hold)) : HOLD_S), 0.35);
  }

  // Drop the scheduled static and click-off (e.g. speech cancelled or mission reset)
  cancel() {
    for (const s of this.pending) { try { s.stop(); } catch { /* already ended */ } }
    this.pending = [];
  }

  private pick(a: AudioBuffer[]) { return a[Math.random() < 0.5 ? 0 : a.length - 1]; }

  private one(buf: AudioBuffer, when: number, gain: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.dest);
    src.onended = () => { src.disconnect(); g.disconnect(); };
    src.start(when);
    return src;
  }

  private schedule(buf: AudioBuffer, when: number, gain: number) {
    const src = this.one(buf, when, gain);
    this.pending.push(src);
    const free = src.onended;
    src.onended = (e) => { free?.call(src, e); this.pending = this.pending.filter((s) => s !== src); };
  }

  // Fills a mono buffer from fn(t) (called once per sample, in order, so filters can keep
  // state), then normalises its peak to `peak`.
  private render(seconds: number, fn: (t: number) => number, peak: number): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const n = Math.max(1, Math.floor(seconds * sr));
    const b = this.ctx.createBuffer(1, n, sr);
    const d = b.getChannelData(0);
    let m = 0;
    for (let i = 0; i < n; i++) { d[i] = fn(i / sr); m = Math.max(m, Math.abs(d[i])); }
    if (m > 0) for (let i = 0; i < n; i++) d[i] *= peak / m;
    return b;
  }
}

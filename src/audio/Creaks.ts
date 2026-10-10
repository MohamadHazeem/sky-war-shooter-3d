// Airframe creaks for the B-17 interior: stressed aluminium hinges, ribs and skin
// groaning in the slipstream. Four short synthesised one-shots (no samples), fired at
// random 8-20 s intervals while the gunner is inside, and in a louder burst after the
// bomber takes a hit. Routed to the ambience bus with a little of the interior reverb.

const rnd = () => Math.random();
const rand = () => rnd() * 2 - 1;

// RBJ band-pass (0 dB peak gain): a resonator for metallic rings and the rubbing band of noise.
// Q sets the ring time: tau = Q / (pi * freq).
class Bandpass {
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  private b0 = 0; private a1 = 0; private a2 = 0;
  set(freq: number, q: number, sr: number) {
    const w = 2 * Math.PI * Math.min(freq, sr * 0.45) / sr;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = alpha / a0; this.a1 = -2 * Math.cos(w) / a0; this.a2 = (1 - alpha) / a0;
    return this;
  }
  run(x: number) {
    const y = this.b0 * (x - this.x2) - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

// A voice is a per-channel sample generator; each channel gets its own random detail,
// which gives the stereo spread for free.
type Voice = (sr: number, ch: number) => (t: number) => number;

function build(ctx: AudioContext, sec: number, voice: Voice): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(sec * sr);
  const buf = ctx.createBuffer(2, n, sr);
  let peak = 0;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const f = voice(sr, ch);
    for (let i = 0; i < n; i++) { const v = f(i / sr); d[i] = v; peak = Math.max(peak, Math.abs(v)); }
  }
  if (peak > 0) for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < n; i++) d[i] *= 0.7 / peak; }
  return buf;
}

// Door-hinge creak: a slowly falling, inharmonic stack of sine partials whose level is
// chopped by stick-slip, over a rubbing band of noise.
const hinge: Voice = (sr, ch) => {
  const ratios = [1, 2.73, 4.11], amps = [1, 0.45, 0.2];
  const ph = [0, 0, 0];
  const f0 = 150 + rnd() * 80;
  const slip = 4 + rnd() * 5, wob = 1.2 + rnd() * 0.8;
  const rub = new Bandpass().set(900 + rnd() * 400, 4, sr);
  const dur = 1.4;
  return (t) => {
    const u = t / dur;
    const env = Math.min(1, t / 0.2) * Math.pow(1 - u, 1.5);
    const f = f0 * (1 - 0.3 * u) * (1 + 0.01 * Math.sin(2 * Math.PI * wob * t + ch * 0.8));
    let s = 0;
    for (let k = 0; k < 3; k++) { ph[k] += 2 * Math.PI * f * ratios[k] / sr; s += Math.sin(ph[k]) * amps[k]; }
    const stick = Math.pow(Math.max(0, Math.sin(2 * Math.PI * slip * t + 1.5 * Math.sin(2 * Math.PI * wob * 0.5 * t))), 4);
    return env * (s * (0.3 + 0.7 * stick) + rub.run(rand()) * 0.8 * stick);
  };
};

// Rib and skin knocks as the frame flexes: short noise bursts ringing two sharp resonances.
const ticks: Voice = (sr, ch) => {
  const bands = [
    new Bandpass().set(560 * (1 + ch * 0.01), 52, sr),
    new Bandpass().set(1180 * (1 + ch * 0.01), 70, sr),
  ];
  const hits = Array.from({ length: 3 + Math.floor(rnd() * 3) }, () => ({ t: rnd() * 0.8, a: 0.4 + rnd() * 0.6 }));
  return (t) => {
    let e = 0;
    for (const h of hits) { const dt = t - h.t; if (dt >= 0 && dt < 0.01) e += rand() * h.a; }
    return bands[0].run(e) * 0.9 + bands[1].run(e) * 0.5;
  };
};

// Structural groan under load: a sagging low tone with overtones and a swelling noise band.
const groan: Voice = (sr, ch) => {
  const f0 = 58 + rnd() * 16;
  const sway = 0.5 + rnd() * 0.5;
  const band = new Bandpass().set(210 + rnd() * 80, 40, sr);
  let p1 = 0, p2 = 0, p3 = 0;
  const dur = 2.2;
  return (t) => {
    const u = t / dur;
    const f = f0 * (1 + 0.2 * Math.sin(Math.PI * u)) * (1 - 0.15 * u);
    p1 += 2 * Math.PI * f / sr; p2 += 2 * Math.PI * f * 2 / sr; p3 += 2 * Math.PI * f * 3.02 / sr;
    const swell = 0.6 + 0.4 * Math.sin(2 * Math.PI * sway * t + ch);
    const env = Math.min(1, t / 0.35) * Math.pow(1 - u, 2);
    const s = (Math.sin(p1) + Math.sin(p2) * 0.3 + Math.sin(p3) * 0.12) * swell + band.run(rand()) * 0.3 * swell;
    return env * s;
  };
};

// Loose fittings and shrapnel scars on the skin: a scatter of bright metallic pings.
const rattle: Voice = (sr) => {
  const hits = Array.from({ length: 7 + Math.floor(rnd() * 6) }, () => ({
    t: rnd() * 0.8,
    a: 0.3 + rnd() * 0.7,
    bp: new Bandpass().set(1400 + rnd() * 2600, 60 + rnd() * 50, sr),
  }));
  return (t) => {
    let s = 0;
    for (const h of hits) { const dt = t - h.t; s += h.bp.run(dt >= 0 && dt < 0.002 ? rand() * h.a : 0); }
    return s;
  };
};

const gap = () => 8000 + rnd() * 12000; // ms between random creaks

export class AirframeCreaks {
  private clips: { buf: AudioBuffer; gain: number }[];
  private out: GainNode;
  private ctx: AudioContext;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = false;
  private boostUntil = 0; // ctx time until which creaks are louder after a hit

  constructor(ctx: AudioContext, dest: AudioNode, reverb: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    const send = ctx.createGain(); send.gain.value = 0.5;
    this.out.connect(send).connect(reverb);
    this.clips = [
      { buf: build(ctx, 1.4, hinge), gain: 0.55 },
      { buf: build(ctx, 1.0, ticks), gain: 0.45 },
      { buf: build(ctx, 2.2, groan), gain: 0.6 },
      { buf: build(ctx, 0.9, rattle), gain: 0.35 },
    ];
  }

  // Driven from Sound.setMode: only the gunner's bomber interior creaks.
  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(on ? 1 : 0, t, on ? 0.3 : 0.2);
    if (on) this.schedule(gap()); else this.cancel();
  }

  // A hit on the bomber: a burst of louder creaks, then the random ones come sooner.
  hit(heavy: boolean) {
    if (!this.active) return;
    this.boostUntil = this.ctx.currentTime + 12;
    if (heavy) {
      this.play(2, 1.3, 0.05);
      this.play(0, 1.1, 0.5 + rnd() * 0.4);
      this.play(3, 1.0, 0.9 + rnd() * 0.3);
    } else {
      this.play(0, 0.9, 0.05);
      this.play(1, 0.8, 0.4 + rnd() * 0.3);
    }
    this.schedule(3000 + rnd() * 4000);
  }

  private fire() {
    this.play(Math.floor(rnd() * this.clips.length), 1, 0);
    if (rnd() < 0.3) this.play(Math.floor(rnd() * this.clips.length), 0.7, 0.4 + rnd() * 0.8);
  }

  private play(idx: number, mul: number, delay: number) {
    const ctx = this.ctx;
    const c = this.clips[idx];
    const src = ctx.createBufferSource();
    src.buffer = c.buf;
    src.playbackRate.value = 0.94 + rnd() * 0.12;
    const g = ctx.createGain();
    const boost = ctx.currentTime < this.boostUntil ? 1.3 : 1;
    g.gain.value = c.gain * mul * boost * (0.85 + rnd() * 0.3);
    const p = ctx.createStereoPanner();
    p.pan.value = rand() * 0.4;
    src.connect(g).connect(p).connect(this.out);
    src.start(ctx.currentTime + delay);
  }

  private schedule(ms: number) {
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.active) return;
      this.fire();
      this.schedule(gap());
    }, ms);
  }

  private cancel() {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
  }
}

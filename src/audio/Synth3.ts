// Audio pass 3: synthesised voices for the late-war content (no sample files, no downloads).
// Pure sample generators (Float32Array per channel, seeded so they are deterministic): Sound.ts
// wraps them in AudioBuffers lazily, one step per idle slice after the first mission starts,
// and tools/audio/audio3_report.mjs + tests/audio3.test.ts measure them in Node.
//
// Engines (seamless loops: every tone has a whole number of cycles over the loop, and the
// noise is cross-faded across the seam):
//   jumoTwin     He 111 / Ju 88, two Jumo 211 out of sync: deep drone, the prop thrums 72 vs
//                73.5 Hz beat at 1.5 Hz ("wum-wum"), the firing tones at 3 Hz
//   db603twin    Me 410 / Bf 110, two DB 603: higher, smoother, a slow 0.5 Hz beat
//   pushFront    Do 335 nose engine (DB 603, tractor prop)
//   pushRear     Do 335 rear engine: the pusher prop chops through the fuselage wake, a hard
//                buzzing blade slap (Sound plays it louder from behind: the pass flips from the
//                smooth front engine to the buzz-saw rear one, on top of the Doppler drop)
//   jetRoar      Me 262 Jumo 004 exhaust roar (louder from behind)
//   jetWhine     Jumo 004 compressor whine, ~3.9 kHz blade tone + shaft hum (louder from ahead)
//   rocket       Me 163 Walter rocket: broadband roar, combustion flutter and crackle
// Weapons: bk5 (50 mm BK 5: deep thump with a long tail), mg81 (rear gunner MG 15/81Z: a short
//   fast-cyclic burst per call), flak20 (20 mm Flak 38 report from the ground), flak20burst
//   (a 20 mm shell bursting in the air), flakTower (12.8 cm Flakturm gun firing)
// Blasts: blastCrack (close shock crack), blastBoom (felt low boom), thunder (far rolling
//   rumble, no highs), rumbleLong (a warship's death, ~9 s), whump (dull flak thud),
//   patter (shrapnel on the skin)
// Cabin: windowRoar (buffeting slipstream at an open waist window, loop), rattleBed (loose
//   equipment rattling while the bomber jinks, loop), brassPile (a casing landing on the heap)

export interface PCM { sr: number; ch: Float32Array[] }
type Rng = () => number;

// Deterministic PRNG (mulberry32)
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;
const lpA = (fc: number, sr: number) => 1 - Math.exp(-TAU * fc / sr);
class LP { y = 0; constructor(public a: number) {} run(x: number) { this.y += (x - this.y) * this.a; return this.y; } }
class HP { y = 0; x1 = 0; constructor(public a: number) {} run(x: number) { const y = this.a * (this.y + x - this.x1); this.x1 = x; this.y = y; return y; } }
// RBJ band-pass, 0 dB peak
class BP {
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0; private b0 = 0; private a1 = 0; private a2 = 0;
  constructor(fc: number, q: number, sr: number) {
    const w = TAU * Math.min(fc, sr * 0.45) / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al;
    this.b0 = al / a0; this.a1 = -2 * Math.cos(w) / a0; this.a2 = (1 - al) / a0;
  }
  run(x: number) { const y = this.b0 * (x - this.x2) - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
}

// Render `sec` seconds (stereo) and peak-normalise. loop > 0: render `loop` s extra and
// cross-fade it into the head, so the buffer loops without a seam.
function render(sr: number, sec: number, fn: (t: number, ch: number) => number, opts: { peak?: number; loop?: number; drive?: number; mono?: boolean } = {}): PCM {
  const n = Math.max(1, Math.floor(sec * sr));
  const xf = opts.loop ? Math.floor(opts.loop * sr) : 0;
  const chs = opts.mono ? 1 : 2;
  const out: Float32Array[] = [];
  let m = 0;
  for (let c = 0; c < chs; c++) {
    const d = new Float32Array(n + xf);
    for (let i = 0; i < n + xf; i++) { let v = fn(i / sr, c); if (opts.drive) v = Math.tanh(v * opts.drive); d[i] = Number.isFinite(v) ? v : 0; }
    let o = d;
    if (xf) {
      o = d.subarray(0, n).slice();
      for (let i = 0; i < xf; i++) { const a = i / xf; o[i] = d[i] * a + d[n + i] * (1 - a); }
    } else {
      // short fade-out so a one-shot never ends on a click
      const f = Math.min(n, Math.floor(0.008 * sr));
      for (let i = 0; i < f; i++) o[n - 1 - i] *= i / f;
    }
    for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(o[i]));
    out.push(o);
  }
  const k = m > 0 ? (opts.peak ?? 0.9) / m : 0;
  for (const d of out) for (let i = 0; i < d.length; i++) d[i] *= k;
  return { sr, ch: out };
}

// ---------------------------------------------------------------- piston engines
interface Piston {
  firing: number;     // Hz (firing * loop seconds must be whole)
  blade: number;      // prop blade-pass Hz (blade * loop seconds whole)
  bladeTone: number;  // level of the prop thrum tone (carries the twin-engine beat)
  slap?: number;      // hard blade slap (pusher prop in the wake)
  rough: number;      // cycle-to-cycle variation
  bright: number;     // firing-noise low-pass (Hz)
  banks?: boolean;    // V-12: the two banks alternate in strength (half-order drone)
  pan: number;        // -1 left .. 1 right
}

// One engine's sample generator for a loop of `sec` seconds
function piston(e: Piston, sr: number, sec: number, r: Rng): (t: number, ch: number) => number {
  const pulses = Math.round(e.firing * sec), period = sec / pulses;
  const amps = Array.from({ length: pulses }, (_, i) => 0.75 + r() * 0.5 * e.rough + (e.banks && i % 2 ? -0.22 : 0));
  const st = [0, 1].map(() => ({ lp: new LP(lpA(e.bright, sr)), lp2: new LP(lpA(55, sr)), hp: new HP(0.995), sl: new HP(0.9) }));
  const bperiod = 1 / e.blade, ph = r() * TAU;
  return (t, ch) => {
    const s = st[ch];
    const k = Math.floor(t / period), tp = t - k * period;
    const burst = Math.exp(-tp / (period * 0.22)) * amps[k % pulses];
    const n = r() * 2 - 1;
    const noise = s.lp.run(n) * burst * 1.4;
    const tone = (Math.sin(TAU * e.firing * t) * 0.35 + Math.sin(TAU * 2 * e.firing * t + 0.6) * 0.12) * burst * 0.8;
    const half = e.banks ? Math.sin(TAU * e.firing * 0.5 * t + 0.3) * 0.18 : 0;
    const prop = 1 + 0.32 * Math.sin(TAU * e.blade * t + ch * 0.4 + ph);
    const thrum = Math.sin(TAU * e.blade * t + ph) * e.bladeTone + Math.sin(TAU * 2 * e.blade * t + ph * 2) * e.bladeTone * 0.35;
    let slap = 0;
    if (e.slap) { const tb = t - Math.floor(t / bperiod) * bperiod; slap = s.sl.run(Math.exp(-tb / (bperiod * 0.06))) * e.slap; }
    const rumble = s.lp2.run(n) * 1.6;
    const pan = ch === 0 ? 1 - Math.max(0, e.pan) * 0.6 : 1 + Math.min(0, e.pan) * 0.6;
    return s.hp.run((noise + tone + half + rumble) * prop + thrum + slap) * pan;
  };
}

function engines(sr: number, sec: number, list: Piston[], seed: number): PCM {
  const r = rng(seed);
  const gens = list.map((e) => piston(e, sr, sec, r));
  return render(sr, sec, (t, ch) => { let s = 0; for (const g of gens) s += g(t, ch); return s; }, { loop: 0.08 });
}

const ENGINE_SR = 24000; // engines and rumbles: nothing above ~10 kHz worth the memory

// 2 s loops: every frequency below is a multiple of 0.5 Hz
export const jumoTwin = (seed = 11) => engines(ENGINE_SR, 2, [
  { firing: 240, blade: 72, bladeTone: 0.55, rough: 0.7, bright: 1700, banks: true, pan: -0.4 },
  { firing: 243, blade: 73.5, bladeTone: 0.55, rough: 0.7, bright: 1700, banks: true, pan: 0.4 },
], seed);

export const db603twin = (seed = 12) => engines(ENGINE_SR, 2, [
  { firing: 270, blade: 67.5, bladeTone: 0.3, rough: 0.35, bright: 2800, banks: true, pan: -0.4 },
  { firing: 272, blade: 68, bladeTone: 0.3, rough: 0.35, bright: 2800, banks: true, pan: 0.4 },
], seed);

export const pushFront = (seed = 13) => engines(ENGINE_SR, 2, [
  { firing: 280, blade: 70, bladeTone: 0.35, rough: 0.4, bright: 3000, banks: true, pan: 0 },
], seed);

export const pushRear = (seed = 14) => engines(ENGINE_SR, 2, [
  { firing: 282.5, blade: 71.5, bladeTone: 0.2, slap: 1.1, rough: 0.5, bright: 3600, banks: true, pan: 0 },
], seed);

// ---------------------------------------------------------------- jet and rocket
export function jetRoar(seed = 15): PCM {
  const sr = ENGINE_SR, r = rng(seed);
  const st = [0, 1].map(() => ({ a: new BP(260, 0.7, sr), b: new BP(1150, 0.8, sr), c: new BP(3200, 1.1, sr), lo: new LP(lpA(70, sr)) }));
  return render(sr, 3, (t, ch) => {
    const s = st[ch], n = r() * 2 - 1;
    const flutter = 1 + 0.06 * Math.sin(TAU * (1 / 3) * t * 2 + ch) + 0.04 * Math.sin(TAU * 11 * t);
    return (s.a.run(n) * 1.4 + s.b.run(n) * 1.0 + s.c.run(n) * 0.35 + s.lo.run(n) * 2.2) * flutter;
  }, { loop: 0.1 });
}

export function jetWhine(seed = 16): PCM {
  const sr = ENGINE_SR, r = rng(seed);
  const st = [0, 1].map(() => ({ h: new BP(4200, 3, sr) }));
  // 2 s loop: 3915, 1957.5, 145, 290 Hz all whole cycles; vibrato at 0.5 Hz
  return render(sr, 2, (t, ch) => {
    const v = 0.9 * Math.sin(TAU * 0.5 * t + ch * 0.2);
    const s = Math.sin(TAU * 3915 * t + v * 3) * 0.5 + Math.sin(TAU * 1957.5 * t + v * 1.5) * 0.28
      + Math.sin(TAU * 7830 * t + v * 6) * 0.08 + Math.sin(TAU * 145 * t) * 0.2 + Math.sin(TAU * 290 * t + 0.4) * 0.1;
    return s + st[ch].h.run(r() * 2 - 1) * 0.6;
  }, { loop: 0.05 });
}

export function rocket(seed = 17): PCM {
  const sr = ENGINE_SR, r = rng(seed);
  const st = [0, 1].map(() => ({ hi: new LP(lpA(2600, sr)), mid: new BP(420, 0.6, sr), lo: new LP(lpA(60, sr)), cr: 0 }));
  return render(sr, 2, (t, ch) => {
    const s = st[ch], n = r() * 2 - 1;
    if (r() < 70 / sr) s.cr = 0.4 + r() * r() * 1.6;   // crackle: ~70 pops/s
    s.cr *= 0.93;
    const flutter = 1 + 0.18 * Math.sin(TAU * 23 * t) + 0.1 * Math.sin(TAU * 7.5 * t + ch);
    return (s.hi.run(n) * 0.9 + s.mid.run(n) * 1.3 + s.lo.run(n) * 2.6) * flutter + s.cr * n;
  }, { loop: 0.06 });
}

// ---------------------------------------------------------------- weapons
const FULL_SR = 48000;

export function bk5(seed = 21): PCM {
  const sr = ENGINE_SR, r = rng(seed);
  const st = [0, 1].map(() => ({ b: new BP(160, 0.8, sr), m: new LP(lpA(700, sr)), t: new LP(lpA(160, sr)), ph: 0 }));
  const f0 = 25 + r() * 4;
  return render(sr, 2.8, (t, ch) => {
    const s = st[ch], n = r() * 2 - 1;
    s.ph += TAU * (f0 + 42 * Math.exp(-t * 14)) / sr;
    const atk = 1 - Math.exp(-t * 2500);
    return n * Math.exp(-t * 220) * 1.0 + s.m.run(n) * Math.exp(-t * 10) * 2.2 + s.b.run(n) * atk * Math.exp(-t * 5) * 9
      + (Math.sin(s.ph) * 1.8 + Math.sin(2 * s.ph) * 0.9 + Math.sin(3 * s.ph) * 0.4) * atk * Math.exp(-t * 3) + s.t.run(n) * Math.exp(-t * 1.5) * 3
      + Math.sin(TAU * 380 * t) * Math.exp(-t * 18) * 0.15;
  }, { drive: 1.3, peak: 0.92 });
}

export function mg81(seed = 22): PCM {
  const sr = FULL_SR, r = rng(seed);
  const shots = Array.from({ length: 7 }, (_, k) => ({ t: 0.002 + k * 0.0335 + (r() - 0.5) * 0.006, a: 0.8 + r() * 0.2 }));
  const st = [0, 1].map(() => ({ hp: new HP(0.6), lp: new LP(lpA(1500, sr)), ring: new BP(2400 + r() * 300, 6, sr) }));
  return render(sr, 0.26, (t, ch) => {
    const s = st[ch], n = r() * 2 - 1;
    let e = 0, body = 0, bark = 0;
    for (const h of shots) {
      const dt = t - h.t;
      if (dt < 0 || dt > 0.05) continue;
      e += Math.exp(-dt * 900) * h.a; body += Math.sin(TAU * 210 * dt) * Math.exp(-dt * 70) * h.a; bark += Math.exp(-dt * 110) * h.a;
    }
    return s.hp.run(n) * e + s.ring.run(n * e) * 2 + body * 0.4 + s.lp.run(n) * bark * 0.8;
  }, { peak: 0.9 });
}

export function flak20(seed = 23): PCM {
  const sr = FULL_SR, r = rng(seed);
  const st = [0, 1].map(() => ({ m: new LP(lpA(1800, sr)), t: new LP(lpA(300, sr)) }));
  const ring = 1050 + r() * 150;
  return render(sr, 0.7, (t, ch) => {
    const s = st[ch], n = r() * 2 - 1;
    return n * Math.exp(-t * 400) + s.m.run(n) * Math.exp(-t * 24) * 1.4
      + Math.sin(TAU * (70 * t + 50 * (1 - Math.exp(-t * 30)) / 30)) * Math.exp(-t * 16) * 0.9
      + Math.sin(TAU * ring * t) * Math.exp(-t * 40) * 0.12 + s.t.run(n) * Math.exp(-t * 6) * 1.2;
  }, { peak: 0.9, drive: 1.1 });
}

export function flak20burst(seed = 24): PCM {
  const sr = FULL_SR, r = rng(seed);
  const st = [0, 1].map(() => ({ m: new LP(lpA(3000, sr)), t: new LP(lpA(400, sr)) }));
  return render(sr, 0.6, (t, ch) => {
    const s = st[ch], n = r() * 2 - 1;
    return n * Math.exp(-t * 500) * 1.2 + s.m.run(n) * Math.exp(-t * 35) * 1.1
      + Math.sin(TAU * 140 * t) * Math.exp(-t * 20) * 0.5 + s.t.run(n) * Math.exp(-t * 8) * 1.0;
  }, { peak: 0.9 });
}

export function flakTower(seed = 25): PCM {
  const sr = ENGINE_SR, r = rng(seed);
  const st = [0, 1].map(() => ({ m: new LP(lpA(900, sr)), b: new BP(130, 0.8, sr), t: new LP(lpA(160, sr)), ph: 0 }));
  return render(sr, 3.5, (t, ch) => {
    const s = st[ch], n = r() * 2 - 1;
    s.ph += TAU * (24 + 30 * Math.exp(-t * 8)) / sr;
    const atk = 1 - Math.exp(-t * 900);
    return n * Math.exp(-t * 250) * 0.8 + s.m.run(n) * Math.exp(-t * 6) * 2.4 + s.b.run(n) * atk * Math.exp(-t * 3.5) * 9
      + (Math.sin(s.ph) * 2 + Math.sin(2 * s.ph) * 0.8) * atk * Math.exp(-t * 1.8) + s.t.run(n) * Math.exp(-t * 1.1) * 3;
  }, { peak: 0.92, drive: 1.2 });
}

// ---------------------------------------------------------------- blasts
export function blastCrack(seed = 31): PCM {
  const sr = FULL_SR, r = rng(seed);
  const st = [0, 1].map(() => ({ hp: new HP(0.92), lp: new LP(lpA(3000, sr)) }));
  const T1 = 0.0012 + r() * 0.0006, T2 = T1 + 0.003;
  return render(sr, 0.4, (t, ch) => {
    const s = st[ch], n = r() * 2 - 1, tt = t - ch * 0.0003;
    // N-wave: the shock front (sudden overpressure, linear fall below ambient, recovery)
    const nw = tt < 0 ? 0 : tt < T1 ? tt / T1 : tt < T2 ? 1 - 1.8 * (tt - T1) / (T2 - T1) : tt < T2 + 0.0015 ? -0.8 * (1 - (tt - T2) / 0.0015) : 0;
    return nw * 1.4 + s.hp.run(n) * Math.exp(-t * 70) * 0.9 + s.lp.run(n) * Math.exp(-t * 30) * 0.7;
  }, { peak: 0.92 });
}

export function blastBoom(seed = 32): PCM {
  const sr = ENGINE_SR, r = rng(seed);
  const st = [0, 1].map(() => ({ lo: new LP(lpA(90, sr)), ph: 0 }));
  return render(sr, 2.4, (t, ch) => {
    const s = st[ch], n = r() * 2 - 1;
    s.ph += TAU * (28 + 45 * Math.exp(-t * 5)) / sr;
    const atk = 1 - Math.exp(-t * 900);
    return Math.sin(s.ph) * atk * Math.exp(-t * 2) * 1.4 + s.lo.run(n) * atk * Math.exp(-t * 1.6) * 5;
  }, { peak: 0.92, drive: 1.4 });
}

// Far rolling thunder: several overlapping low swells (echoes off the ground and cloud decks)
// after a dull first thump; nothing above a few hundred Hz survives the distance
export function thunder(seed = 33): PCM {
  const sr = ENGINE_SR, r = rng(seed);
  const rolls = Array.from({ length: 6 + Math.floor(r() * 4) }, () => {
    const t0 = 3.2 * Math.pow(r(), 1.5);
    const fc = 120 + 300 * r();
    // two cascaded one-poles per channel (12 dB/oct): only the lows roll in from far away
    return { t0, a: (0.4 + 0.6 * r()) * (1 - 0.5 * t0 / 3.2), att: 0.08 + 0.3 * r(), dec: 0.5 + 1.2 * r(), lp: [0, 1].map(() => [new LP(lpA(fc, sr)), new LP(lpA(fc, sr))]) };
  });
  const st = [0, 1].map(() => ({ th: new LP(lpA(200, sr)), th2: new LP(lpA(200, sr)) }));
  return render(sr, 6, (t, ch) => {
    const n = r() * 2 - 1;
    let s = Math.sin(TAU * 34 * t) * Math.exp(-t * 3) * Math.min(1, t * 60) * 0.6 + st[ch].th2.run(st[ch].th.run(n)) * Math.exp(-t * 1.2) * 5;
    for (const ro of rolls) {
      const dt = t - ro.t0, x = ro.lp[ch][1].run(ro.lp[ch][0].run(n)) * 2;
      if (dt < 0) continue;
      s += x * ro.a * Math.min(1, dt / ro.att) * Math.exp(-dt / ro.dec) * 3.2;
    }
    return s * Math.min(1, (6 - t) / 0.6);
  }, { peak: 0.9 });
}

// A Luftkreuzer's death: a long deep rumble with groaning metal and secondary booms far inside
export function rumbleLong(seed = 34): PCM {
  const sr = ENGINE_SR, r = rng(seed);
  const booms = Array.from({ length: 5 }, () => ({ t: 0.6 + r() * 6.5, a: 0.5 + r() * 0.5 }));
  const groans = Array.from({ length: 3 }, () => ({ t: 0.8 + r() * 5, f: 62 + r() * 18, d: 1.6 + r() }));
  const st = [0, 1].map(() => ({ lo: new LP(lpA(70, sr)), mid: new BP(140, 1, sr), bl: new LP(lpA(220, sr)) }));
  return render(sr, 9, (t, ch) => {
    const s = st[ch], n = r() * 2 - 1;
    const env = Math.min(1, t / 0.3) * (t < 2 ? 1 : Math.exp(-(t - 2) / 3)) * Math.min(1, (9 - t) / 0.8);
    const am = 0.65 + 0.35 * Math.sin(TAU * 0.37 * t + ch);
    let v = (s.lo.run(n) * 4 + s.mid.run(n) * 0.9) * am * env;
    const b = s.bl.run(n);
    for (const bo of booms) { const dt = t - bo.t; if (dt >= 0 && dt < 2) v += (Math.sin(TAU * 40 * dt) * 0.6 + b * 2) * Math.exp(-dt * 2.5) * bo.a * Math.min(1, dt * 80); }
    for (const g of groans) { const dt = t - g.t; if (dt >= 0 && dt < g.d) { const u = dt / g.d; v += Math.sin(TAU * g.f * (1 - 0.3 * u) * dt) * Math.sin(Math.PI * u) * 0.25; } }
    return v;
  }, { peak: 0.92, drive: 1.1 });
}

// The dull "whump" of a flak shell bursting
export function whump(seed = 35): PCM {
  const sr = ENGINE_SR, r = rng(seed);
  const st = [0, 1].map(() => ({ a: new LP(lpA(300, sr)), m: new BP(180, 0.9, sr), b: new LP(lpA(1200, sr)), ph: 0 }));
  return render(sr, 1.0, (t, ch) => {
    const s = st[ch], n = r() * 2 - 1;
    s.ph += TAU * (55 + 35 * Math.exp(-t * 12)) / sr;
    const atk = 1 - Math.exp(-t * 700);
    return (Math.sin(s.ph) + Math.sin(2 * s.ph) * 0.5) * atk * Math.exp(-t * 6) * 1.1 + s.m.run(n) * atk * Math.exp(-t * 8) * 7
      + s.a.run(n) * atk * Math.exp(-t * 7) * 1.6 + s.b.run(n) * Math.exp(-t * 25) * 0.5;
  }, { peak: 0.9, drive: 1.3 });
}

// Shrapnel peppering the skin: a scatter of tiny bright ticks and a few heavier tonks
export function patter(seed = 36): PCM {
  const sr = FULL_SR, r = rng(seed);
  const ticks = Array.from({ length: 18 + Math.floor(r() * 12) }, () => ({ t: 0.6 * Math.pow(r(), 1.6), f: 2000 + r() * 4500, d: 250 + r() * 250, a: 0.3 + r() * 0.7, ch: r() }));
  const tonks = Array.from({ length: 2 + Math.floor(r() * 3) }, () => ({ t: 0.4 * r(), f: 700 + r() * 700, a: 0.5 + r() * 0.5, ch: r() }));
  return render(sr, 0.8, (t, ch) => {
    let s = 0;
    for (const k of ticks) { const dt = t - k.t; if (dt < 0 || dt > 0.03) continue; const w = ch ? k.ch : 1 - k.ch; s += (Math.sin(TAU * k.f * dt) * Math.exp(-dt * k.d) + (r() * 2 - 1) * Math.exp(-dt * 3000)) * k.a * (0.4 + w); }
    for (const k of tonks) { const dt = t - k.t; if (dt < 0 || dt > 0.12) continue; const w = ch ? k.ch : 1 - k.ch; s += Math.sin(TAU * k.f * dt) * Math.exp(-dt * 60) * k.a * (0.4 + w) * 0.8; }
    return s;
  }, { peak: 0.9 });
}

// ---------------------------------------------------------------- cabin
export function windowRoar(seed = 41): PCM {
  const sr = ENGINE_SR, r = rng(seed);
  const st = [0, 1].map(() => ({ a: new BP(350, 0.6, sr), b: new BP(900, 0.7, sr), c: new BP(2200, 1, sr), p: r() * TAU }));
  return render(sr, 4, (t, ch) => {
    const s = st[ch], n = r() * 2 - 1;
    // buffeting: 0.75, 1.75 and 9 Hz (whole cycles over the 4 s loop)
    const buf = 1 + 0.25 * Math.sin(TAU * 0.75 * t + s.p) + 0.15 * Math.sin(TAU * 1.75 * t + 2 * s.p) + 0.08 * Math.sin(TAU * 9 * t);
    return (s.a.run(n) * 1.0 + s.b.run(n) * 0.7 + s.c.run(n) * 0.35) * buf;
  }, { loop: 0.1 });
}

export function rattleBed(seed = 42): PCM {
  const sr = FULL_SR, r = rng(seed), sec = 3, n = sec * sr;
  const ch = [new Float32Array(n), new Float32Array(n)];
  const tick = (t0: number, f: number, d: number, a: number, pan: number) => {
    const len = Math.min(Math.floor(0.06 * sr), Math.ceil(7 * sr / d));
    const i0 = Math.floor(t0 * sr), w = TAU * f / sr;
    for (let j = 0; j < len; j++) {
      const v = Math.sin(w * j) * Math.exp(-j * d / sr) * a, i = (i0 + j) % n;   // wraps: seamless loop
      ch[0][i] += v * (1 - pan); ch[1][i] += v * pan;
    }
  };
  for (let t = 0; t < sec; t += -Math.log(1 - r()) / 30) {
    const dens = 0.5 + 0.5 * Math.sin(TAU * (2 / sec) * t);   // clusters as the airframe flexes
    if (r() < dens) tick(t, 1200 + r() * 2800, 300 + r() * 300, 0.3 + r() * 0.7, r());
    if (r() < 0.04) tick(t, 500 + r() * 400, 90, 0.8, r());
  }
  let m = 0;
  for (const d of ch) for (const v of d) m = Math.max(m, Math.abs(v));
  for (const d of ch) for (let i = 0; i < n; i++) d[i] *= 0.9 / m;
  return { sr, ch };
}

export function brassPile(seed = 43): PCM {
  const sr = FULL_SR, r = rng(seed);
  const f0 = 2900 + r() * 1300, lp = new LP(lpA(900, sr));
  return render(sr, 0.25, (t) => {
    const n = r() * 2 - 1;
    return Math.sin(TAU * f0 * t) * Math.exp(-t * 45) * 0.6 + Math.sin(TAU * f0 * 1.47 * t) * Math.exp(-t * 70) * 0.35
      + Math.sin(TAU * f0 * 2.09 * t) * Math.exp(-t * 95) * 0.2 + lp.run(n) * Math.exp(-t * 200) * 1.2;
  }, { peak: 0.9, mono: true });
}

// ---------------------------------------------------------------- catalogue
// variants: seeds base, base+1, ...; Sound builds them lazily in this order (engines first)
export const SYNTH3 = {
  eng_jumoTwin: { variants: 1, make: jumoTwin, seed: 11 },
  eng_db603twin: { variants: 1, make: db603twin, seed: 12 },
  eng_pushFront: { variants: 1, make: pushFront, seed: 13 },
  eng_pushRear: { variants: 1, make: pushRear, seed: 14 },
  eng_jetRoar: { variants: 1, make: jetRoar, seed: 15 },
  eng_jetWhine: { variants: 1, make: jetWhine, seed: 16 },
  eng_rocket: { variants: 1, make: rocket, seed: 17 },
  blastCrack: { variants: 3, make: blastCrack, seed: 310 },
  blastBoom: { variants: 2, make: blastBoom, seed: 320 },
  thunder: { variants: 2, make: thunder, seed: 330 },
  whump: { variants: 2, make: whump, seed: 350 },
  patter: { variants: 3, make: patter, seed: 360 },
  bk5: { variants: 2, make: bk5, seed: 210 },
  mg81: { variants: 3, make: mg81, seed: 220 },
  flak20: { variants: 3, make: flak20, seed: 230 },
  flak20burst: { variants: 3, make: flak20burst, seed: 240 },
  flakTower: { variants: 2, make: flakTower, seed: 250 },
  rumbleLong: { variants: 1, make: rumbleLong, seed: 340 },
  windowRoar: { variants: 1, make: windowRoar, seed: 41 },
  rattleBed: { variants: 1, make: rattleBed, seed: 42 },
  brassPile: { variants: 4, make: brassPile, seed: 430 },
} as const;
export type Synth3Name = keyof typeof SYNTH3;

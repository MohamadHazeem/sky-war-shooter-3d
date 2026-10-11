// Airfield sounds for the take-off and landing scenes (Bookends.ts), synthesised like Synth3.ts:
// pure, seeded sample generators (Float32Array per channel), no sample files, no downloads.
// Sound.ts builds them lazily, one buffer per idle slice, as soon as a B-17 briefing opens
// (sound.prepareField()); tools/audio/audio3_report.mjs and tests/audioField.test.ts measure them.
//
// Engines (seamless 2 s loops, every tone a whole number of cycles):
//   eng_cycloneRoar  four Wright R-1820 Cyclones at take-off power (2500 rpm, firing ~188 Hz, the
//                    three-blade props' blade pass ~70 Hz near-transonic at the tips: a hard rasp),
//                    out of sync so they beat; prop roar and exhaust crackle on top
//   eng_cycloneIdle  the same four ticking over at ~1000 rpm while taxiing: lumpy, separate chuffs,
//                    the odd pop and near-misfire
// One-shots: tyreChirp (both main wheels touching down a few hundredths apart, a squeal each),
//   gearThump (the oleos taking the weight), bellyImpact (the belly hitting the runway: boom,
//   buckling skin, the bent props clanging), flarePop (a Very pistol firing)
// Loops for moving emitters (Sound.emitter): flareHiss (the burning star rising: hiss that climbs
//   in pitch, sputter), scrapeGrind / scrapeSparks / scrapeRumble (the belly landing slide, faded
//   by speed), fireBell (a fire tender's hand-rung brass bell; the crash truck rings the second
//   variant), ambulanceBell (a smaller bell, rung in pairs)

import { BP, HP, LP, TAU, lpA, piston, render, rng, ENGINE_SR, FULL_SR, type PCM, type Piston } from './Synth3';

const FIELD_SR = 32000;   // bells, scrape, hiss: content to ~12 kHz

// State-variable band-pass whose centre may move every sample (Chamberlin; stable well below sr/6).
// Output normalised to ~0 dB at the centre.
class SVF {
  private lo = 0; private bd = 0;
  run(x: number, fc: number, q: number, sr: number) {
    const f = 2 * Math.sin(Math.PI * Math.min(fc, sr / 7) / sr), damp = 1 / q;
    this.lo += f * this.bd;
    const hi = x - this.lo - damp * this.bd;
    this.bd += f * hi;
    return this.bd * damp;
  }
}

// Peak-normalise channels in place (for generators that write their own arrays)
function normalise(ch: Float32Array[], peak = 0.9) {
  let m = 0;
  for (const d of ch) for (let i = 0; i < d.length; i++) { if (!Number.isFinite(d[i])) d[i] = 0; m = Math.max(m, Math.abs(d[i])); }
  const k = m > 0 ? peak / m : 0;
  for (const d of ch) for (let i = 0; i < d.length; i++) d[i] *= k;
}

// ---------------------------------------------------------------- B-17 engines (outside)
// Blade pass = firing x 0.375 (nine cylinders: 4.5 firings per crank turn; 0.5625:1 reduction, three blades)
const ROAR: Piston[] = [
  { firing: 186.5, blade: 70, bladeTone: 0.9, slap: 0.35, rough: 0.5, bright: 2600, pan: -0.8 },
  { firing: 188, blade: 70.5, bladeTone: 0.6, slap: 0.5, rough: 0.5, bright: 3400, pan: -0.3 },
  { firing: 189, blade: 71, bladeTone: 0.6, slap: 0.5, rough: 0.5, bright: 3400, pan: 0.3 },
  { firing: 190.5, blade: 71.5, bladeTone: 0.6, slap: 0.5, rough: 0.5, bright: 3400, pan: 0.8 },
];
const IDLE: Piston[] = [
  { firing: 74, blade: 28, bladeTone: 0.3, rough: 1.2, bright: 1300, pan: -0.8, decay: 0.11, pop: 0.12 },
  { firing: 75.5, blade: 28.5, bladeTone: 0.3, rough: 1.2, bright: 1300, pan: -0.3, decay: 0.11, pop: 0.12 },
  { firing: 76.5, blade: 28.5, bladeTone: 0.3, rough: 1.2, bright: 1300, pan: 0.3, decay: 0.11, pop: 0.12 },
  { firing: 78, blade: 29.5, bladeTone: 0.3, rough: 1.2, bright: 1300, pan: 0.8, decay: 0.11, pop: 0.12 },
];
export const ROAR_TONES = ROAR.flatMap((e) => [e.firing, e.blade]).concat([70.5]);
export const IDLE_TONES = IDLE.flatMap((e) => [e.firing, e.blade]);

export function cycloneRoar(seed = 51): PCM {
  const sr = ENGINE_SR, sec = 2, r = rng(seed);
  const gens = ROAR.map((e) => piston(e, sr, sec, r));
  const st = [0, 1].map(() => ({ a: new BP(190, 0.7, sr), b: new BP(850, 0.8, sr), c: new BP(2700, 1.1, sr), lo: new LP(lpA(60, sr)), hp: new HP(0.995), cr: 0 }));
  return render(sr, sec, (t, ch) => {
    let s = 0;
    for (const g of gens) s += g(t, ch);
    const q = st[ch], n = r() * 2 - 1;
    // prop roar: broadband, pulsing at the blade pass
    const pulse = 1 + 0.3 * Math.sin(TAU * 70.5 * t + ch);
    // exhaust crackle (~45 pops/s)
    if (r() < 45 / sr) q.cr = 0.5 + r() * 1.2;
    q.cr *= 0.9;
    const roar = (q.a.run(n) * 1.4 + q.b.run(n) * 0.9 + q.c.run(n) * 0.22 + q.lo.run(n) * 1.6) * pulse;
    return s * 0.5 + q.hp.run(roar * 1.6) + q.cr * n * 0.35;
  }, { loop: 0.08 });
}

export function cycloneIdle(seed = 52): PCM {
  const sr = ENGINE_SR, sec = 2, r = rng(seed);
  const gens = IDLE.map((e) => piston(e, sr, sec, r));
  const st = [0, 1].map(() => ({ sw: new BP(420, 0.8, sr) }));
  return render(sr, sec, (t, ch) => {
    let s = 0;
    for (const g of gens) s += g(t, ch);
    // the props swishing round slowly
    const sw = st[ch].sw.run(r() * 2 - 1) * (1 + 0.6 * Math.sin(TAU * 28.5 * t + ch));
    return s + sw * 0.5;
  }, { loop: 0.08 });
}

// ---------------------------------------------------------------- touchdown
// Main-wheel gap (s) for a seed: 0.035 .. 0.12, either wheel first
export function wheelGap(seed: number): number { const r = rng(seed * 7 + 3); r(); return 0.035 + r() * 0.085; }

export function tyreChirp(seed = 530): PCM {
  const sr = FIELD_SR, r = rng(seed);
  const gap = wheelGap(seed), leftFirst = r() < 0.5;
  const wheels = [0, 1].map((w) => ({
    t0: 0.012 + ((w === 0) === leftFirst ? 0 : gap),
    f0: 780 + r() * 300, dur: 0.15 + r() * 0.12, amp: 0.8 + r() * 0.2, am: 38 + r() * 30,
    ph: 0, jit: new LP(lpA(60, sr)), ring: new BP(2300 + r() * 600, 1.6, sr), hiss: new BP(4200, 0.8, sr), thud: new LP(lpA(250, sr)),
    pan: w === 0 ? [1, 0.42] : [0.42, 1],
  }));
  // one mono render per wheel, panned into the pair
  const n = Math.floor(0.75 * sr), out = [new Float32Array(n), new Float32Array(n)];
  for (const w of wheels) {
    for (let i = 0; i < n; i++) {
      const u = i / sr - w.t0;
      if (u < 0) continue;
      const nz = r() * 2 - 1;
      const atk = 1 - Math.exp(-u / 0.004);
      const env = atk * (u < w.dur ? 1 - 0.4 * u / w.dur : Math.max(0, 0.6 * (1 - (u - w.dur) / 0.03)));
      // stick-slip squeal: a jittery sawtooth-like tone, its pitch sagging as the wheel spins up
      const f = w.f0 * (1 - 0.18 * Math.min(1, u / w.dur)) * (1 + 0.05 * w.jit.run(nz) * 4);
      w.ph += f / sr;
      const p = TAU * w.ph;
      const saw = Math.sin(p) + 0.6 * Math.sin(2 * p + 0.3) + 0.42 * Math.sin(3 * p) + 0.28 * Math.sin(4 * p + 1) + 0.18 * Math.sin(5 * p);
      const rough = 1 + 0.35 * Math.sin(TAU * w.am * u);
      let v = env > 0 ? (saw * 0.45 + w.ring.run(saw) * 1.6) * rough * env + w.hiss.run(nz) * env * 0.5 : 0;
      // the tyre slapping onto the concrete
      v += (Math.sin(TAU * (60 + 40 * Math.exp(-u * 40)) * u) * 0.5 + w.thud.run(nz) * 2.2) * Math.exp(-u * 26) * Math.min(1, u * 800);
      v *= w.amp;
      out[0][i] += v * w.pan[0]; out[1][i] += v * w.pan[1];
    }
  }
  const f = Math.floor(0.008 * sr);
  for (const d of out) for (let i = 0; i < f; i++) d[n - 1 - i] *= i / f;
  normalise(out);
  return { sr, ch: out };
}

export function gearThump(seed = 540): PCM {
  const sr = ENGINE_SR, r = rng(seed);
  const st = [0, 1].map(() => ({ lo: new LP(lpA(300, sr)), cl: new BP(330 + r() * 60, 6, sr), cl2: new BP(760 + r() * 120, 7, sr), ph: 0 }));
  return render(sr, 0.9, (t, ch) => {
    const s = st[ch], n = r() * 2 - 1, tt = Math.max(0, t - ch * 0.004);
    s.ph += TAU * (45 + 28 * Math.exp(-tt * 9)) / sr;
    const atk = Math.min(1, tt * 500);
    return Math.sin(s.ph) * Math.exp(-tt * 6) * atk * 1.2 + s.lo.run(n) * Math.exp(-tt * 10) * atk * 2
      + (s.cl.run(n) + s.cl2.run(n) * 0.7) * Math.exp(-tt * 30) * atk * 9;
  }, { peak: 0.9, drive: 1.2 });
}

// ---------------------------------------------------------------- belly landing
export function bellyImpact(seed = 570): PCM {
  const sr = FIELD_SR, r = rng(seed);
  const clangs = Array.from({ length: 3 }, () => ({ t: 0.05 + r() * 0.3, f: 280 + r() * 240, a: 0.5 + r() * 0.5, pan: r() }));
  const st = [0, 1].map(() => ({ lo: new LP(lpA(120, sr)), cr: new BP(1400, 1.2, sr), hp: new HP(0.7), deb: new LP(lpA(2500, sr)), ph: 0, k: 0 }));
  return render(sr, 2.2, (t, ch) => {
    const s = st[ch], n = r() * 2 - 1;
    s.ph += TAU * (32 + 40 * Math.exp(-t * 7)) / sr;
    const atk = 1 - Math.exp(-t * 900);
    // buckling skin: a dense crunch of clicks over the first ~0.5 s
    if (r() < 900 * Math.exp(-t * 6) / sr) s.k = (0.4 + r()) * (r() < 0.5 ? -1 : 1);
    s.k *= 0.6;
    let v = Math.sin(s.ph) * atk * Math.exp(-t * 2.6) * 1.1 + s.lo.run(n) * atk * Math.exp(-t * 2) * 3.2
      + s.cr.run(s.k * 4 + n * 0.3) * Math.exp(-t * 4) * 5 + s.hp.run(n) * Math.exp(-t * 25) * 0.6
      + s.deb.run(n) * Math.exp(-t * 3) * 0.4 * (0.5 + 0.5 * Math.sin(TAU * 7 * t));
    for (const c of clangs) {
      const dt = t - c.t;
      if (dt < 0) continue;
      const e = Math.exp(-dt * 7) * c.a * (ch ? c.pan : 1 - c.pan) * 3;
      v += (Math.sin(TAU * c.f * dt) + 0.6 * Math.sin(TAU * c.f * 2.71 * dt) + 0.35 * Math.sin(TAU * c.f * 5.13 * dt) * Math.exp(-dt * 8)) * e * 0.5;
    }
    return v;
  }, { peak: 0.92, drive: 1.25 });
}

// Grinding metal on concrete: resonant skin-panel screech, stick-slip judder, abrasive hiss, a rough
// low honk. 4 s loop (judder 15.5 Hz and its 1.25 Hz wobble whole over the loop)
export function scrapeGrind(seed = 580): PCM {
  const sr = FIELD_SR, r = rng(seed);
  const st = [0, 1].map(() => ({
    res: [new BP(610 + r() * 60, 5, sr), new BP(1150 + r() * 90, 6, sr), new BP(1900 + r() * 150, 5, sr), new BP(3100 + r() * 200, 4, sr), new BP(5200 + r() * 300, 3, sr)],
    alt: [new BP(820 + r() * 60, 5, sr), new BP(1480 + r() * 90, 6, sr), new BP(2500 + r() * 150, 5, sr)],
    hp: new HP(0.75), grit: new LP(lpA(11, sr)), jit: new LP(lpA(40, sr)), tone: new LP(lpA(900, sr)), ph: 0,
  }));
  const gR = [1, 0.9, 0.8, 0.55, 0.3], gA = [0.8, 0.8, 0.6];
  return render(sr, 4, (t, ch) => {
    const s = st[ch], n = r() * 2 - 1;
    const judder = 0.55 + 0.45 * Math.abs(Math.sin(TAU * 15.5 * t + 0.4 * Math.sin(TAU * 1.25 * t) + ch));
    const grit = 0.7 + 2.4 * s.grit.run(n);
    const sweep = 0.5 + 0.5 * Math.sin(TAU * 0.5 * t + ch * 0.7);   // which panel set screeches
    let scr = 0;
    for (let k = 0; k < 5; k++) scr += s.res[k].run(n) * gR[k] * (1 - 0.5 * sweep);
    for (let k = 0; k < 3; k++) scr += s.alt[k].run(n) * gA[k] * (0.5 + 0.5 * sweep);
    s.ph += 92 * (1 + 0.6 * s.jit.run(n)) / sr;
    const honk = s.tone.run((s.ph % 1) * 2 - 1);
    return (scr * 3.2 * judder + s.hp.run(n) * 0.35 + honk * 0.5 * judder) * grit;
  }, { loop: 0.1, peak: 0.9 });
}

// Sparks and grit crackling off the slide: sparse sharp clicks, some ringing "tinks", a fizz
export function scrapeSparks(seed = 590): PCM {
  const sr = FIELD_SR, r = rng(seed), sec = 3, xf = Math.floor(0.08 * sr), n = Math.floor(sec * sr) + xf;
  const imp = new Float32Array(n), tink = new Float32Array(n);
  for (let t = 0; t < n / sr; t += -Math.log(1 - r()) / 110) {
    const i = Math.floor(t * sr);
    if (i >= n) break;
    imp[i] += (r() < 0.5 ? -1 : 1) * (0.2 + r() * r() * 1.3);
    if (r() < 0.25) tink[i] += 0.5 + r() * 0.8;
  }
  const st = [0, 1].map(() => ({ hp: new HP(0.45), rg: [new BP(3600 + r() * 800, 14, sr), new BP(5600 + r() * 1200, 16, sr)], fz: new HP(0.6), fzl: new LP(lpA(8000, sr)) }));
  return render(sr, sec, (t, ch) => {
    const s = st[ch], i = Math.min(n - 1, Math.round(t * sr)), j = ch ? Math.min(n - 1, i + 37) : i;
    const fizz = s.fzl.run(s.fz.run(r() * 2 - 1)) * (0.16 + 0.08 * Math.sin(TAU * 2 * t + ch));
    return s.hp.run(imp[j]) * 1.4 + (s.rg[0].run(tink[j]) + s.rg[1].run(tink[j]) * 0.7) * 6 + fizz;
  }, { loop: 0.08, peak: 0.9 });
}

// The airframe dragging and bumping over the ground: deep rumble with random thuds
export function scrapeRumble(seed = 600): PCM {
  const sr = ENGINE_SR, r = rng(seed), sec = 3, n = sec * sr + Math.floor(0.1 * sr);
  const bump = new Float32Array(n);
  for (let t = 0; t < n / sr; t += -Math.log(1 - r()) / 2.8) { const i = Math.floor(t * sr); if (i < n) bump[i] = 0.6 + r() * 0.8; }
  const st = [0, 1].map(() => ({ lo: new LP(lpA(70, sr)), lo2: new LP(lpA(70, sr)), mid: new BP(140, 1, sr), th: new BP(46, 4, sr) }));
  return render(sr, sec, (t, ch) => {
    const s = st[ch], nz = r() * 2 - 1, i = Math.min(n - 1, Math.round(t * sr));
    const am = 0.75 + 0.25 * Math.sin(TAU * (2 / 3) * t + ch);
    return (s.lo2.run(s.lo.run(nz)) * 9 + s.mid.run(nz) * 0.8) * am + s.th.run(bump[i] * 30);
  }, { loop: 0.1, peak: 0.9, drive: 1.1 });
}

// ---------------------------------------------------------------- Very pistol
export function flarePop(seed = 550): PCM {
  const sr = FULL_SR, r = rng(seed);
  const tube = 270 + r() * 70;
  const st = [0, 1].map(() => ({ m: new LP(lpA(2600, sr)), t: new BP(tube, 3, sr), hp: new HP(0.85) }));
  return render(sr, 0.6, (t, ch) => {
    const s = st[ch], n = r() * 2 - 1;
    const click = t < 0.003 ? s.hp.run(n) * (1 - t / 0.003) * 0.5 : s.hp.run(0);   // the hammer falls
    const u = t - 0.009;
    if (u < 0) return click;
    // a big-bore, low-pressure "pok": short overpressure, the barrel ringing hollow, a puff of gas
    const nw = u < 0.0016 ? u / 0.0016 : u < 0.005 ? 1 - 1.6 * (u - 0.0016) / 0.0034 : u < 0.007 ? -0.6 * (1 - (u - 0.005) / 0.002) : 0;
    return click + nw * 1.1 + s.t.run(n) * Math.exp(-u * 30) * 4 + Math.sin(TAU * tube * u) * Math.exp(-u * 40) * 0.5
      + s.m.run(n) * Math.exp(-u * 45) * 1.2;
  }, { peak: 0.9 });
}

// The burning star climbing away: a hiss that rises in pitch over the first second, sputters and
// crackles, then fades as the flare burns out (mono: it is a point source on an emitter)
export function flareHiss(seed = 560): PCM {
  const sr = FIELD_SR, r = rng(seed), sec = 4.5;
  const a = new SVF(), b = new SVF(), hp = new HP(0.8), fl = new LP(lpA(22, sr)), l1 = new LP(lpA(5200, sr)), l2 = new LP(lpA(5200, sr));
  let cr = 0;
  return render(sr, sec, (t) => {
    const n = r() * 2 - 1;
    const rise = 1 - Math.exp(-t / 0.35);
    const fc = 1300 + 2500 * rise + 150 * Math.sin(TAU * 3.1 * t);
    if (r() < 22 / sr) cr = 0.6 + r();
    cr *= 0.95;
    const flicker = 1 + 0.5 * fl.run(n) * 6;
    const env = Math.min(1, t / 0.06) * (0.7 + 0.3 * rise) * (t < 3 ? 1 : Math.max(0, 1 - (t - 3) / 1.5));
    // (two one-poles above: the band-pass skirts would leave too much air)
    return (l2.run(l1.run(a.run(n, fc, 2.2, sr) * 1.4 + b.run(n, fc * 1.6, 3, sr) * 0.3 + cr * n * 0.4)) + hp.run(n) * 0.05) * flicker * env;
  }, { peak: 0.9, mono: true });
}

// ---------------------------------------------------------------- bells
// A struck bell as a bank of damped two-pole resonators (partials as [ratio, level, decay 1/s],
// each with a slightly detuned twin so it shimmers) driven by the strike impulses; the strikes repeat
// with the loop and the bank runs two warm-up loops first, so the tails wrap and the loop is seamless.
type Partial = [number, number, number];
const FIRE_BELL: Partial[] = [[0.5, 0.22, 1.0], [1, 1, 1.4], [1.19, 0.5, 1.9], [1.5, 0.32, 2.4], [2.0, 0.7, 2.1], [2.74, 0.38, 3.4], [3.76, 0.24, 5], [5.4, 0.14, 8]];
const SMALL_BELL: Partial[] = [[1, 1, 3.6], [2.76, 0.62, 6.5], [5.4, 0.36, 10], [8.93, 0.18, 15]];

function bellLoop(sr: number, sec: number, f0: number, partials: Partial[], strikes: { t: number; a: number }[], r: () => number): PCM {
  const n = Math.round(sec * sr);
  const res = partials.flatMap(([ratio, lvl, dec]) => [1, 1.0031 + r() * 0.002].map((dt) => {
    const w = TAU * Math.min(f0 * ratio * dt, sr * 0.45) / sr, rr = Math.exp(-dec / sr);
    // (a two-pole resonator rings at 1 / sin w: scale the drive by sin w)
    return { c1: 2 * rr * Math.cos(w), c2: -rr * rr, g: lvl * (dt === 1 ? 1 : 0.55) * Math.sin(w), y1: 0, y2: 0 };
  }));
  const exc = new Float32Array(n), clk = new Float32Array(n);
  for (const s of strikes) { const i = ((Math.round(s.t * sr) % n) + n) % n; exc[i] += s.a; clk[i] += s.a; }
  const out = new Float32Array(n);
  const hp = new HP(0.55), ring = new BP(Math.min(sr * 0.4, f0 * 4.6), 3, sr);
  let ck = 0;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < n; i++) {
      const x = exc[i];
      let v = 0;
      for (const p of res) { const y = p.c1 * p.y1 + p.c2 * p.y2 + x * p.g; p.y2 = p.y1; p.y1 = y; v += y; }
      // the clapper's hard click on each strike
      if (clk[i]) ck = clk[i];
      const c = hp.run((r() * 2 - 1) * ck);
      ck *= 0.985;
      if (pass === 2) out[i] = v + c * 0.35 + ring.run(c) * 1.2;
    }
  }
  normalise([out]);
  return { sr, ch: [out] };
}

// Strike times for a hand-rung bell: ~`rate` strikes/s, jittered, alternating clapper sides (accented)
export function bellStrikes(sec: number, rate: number, seed: number, pairs = false): { t: number; a: number }[] {
  const r = rng(seed), out: { t: number; a: number }[] = [];
  if (pairs) {
    // rung in pairs: ding-ding ... ding-ding
    const cyc = Math.max(1, Math.round(sec * rate / 2));
    for (let k = 0; k < cyc; k++) {
      const t0 = k * sec / cyc + (r() - 0.5) * 0.03;
      out.push({ t: t0, a: 0.9 + r() * 0.1 }, { t: t0 + 0.12 + r() * 0.025, a: 0.65 + r() * 0.15 });
    }
    return out;
  }
  const cnt = Math.max(1, Math.round(sec * rate)), step = sec / cnt;
  for (let k = 0; k < cnt; k++) {
    out.push({ t: k * step + (r() - 0.5) * step * 0.35, a: (k % 2 ? 0.72 : 1) * (0.85 + r() * 0.3) });
    if (r() < 0.12) out.push({ t: k * step + step * 0.38, a: 0.35 + r() * 0.2 });   // the clapper bouncing
  }
  return out;
}

export function fireBell(seed = 610): PCM {
  const r = rng(seed), sec = 2.4, f0 = 560 + r() * 140, rate = 4.2 + r() * 1.4;
  return bellLoop(FIELD_SR, sec, f0, FIRE_BELL, bellStrikes(sec, rate, seed + 1), r);
}

export function ambulanceBell(seed = 620): PCM {
  const r = rng(seed), sec = 1.6, f0 = 1250 + r() * 250;
  return bellLoop(FIELD_SR, sec, f0, SMALL_BELL, bellStrikes(sec, 2 / 0.8, seed + 1, true), r);
}

// Sea wash and the broad low-frequency slap of a water landing (no concrete scrape).
export function seaWash(seed = 630): PCM {
  const r = rng(seed), sr = ENGINE_SR;
  const filters = [new LP(lpA(1300, sr)), new LP(lpA(1100, sr))];
  return render(sr, 4, (t, ch) => filters[ch].run(r() * 2 - 1) * (0.65 + 0.3 * Math.sin(TAU * t / 4 + ch * 0.2)), { loop: 0.15, peak: 0.9 });
}
export function waterImpact(seed = 640): PCM {
  const r = rng(seed), sr = ENGINE_SR;
  const filters = [new LP(lpA(2000, sr)), new LP(lpA(1800, sr))];
  return render(sr, 3, (t, ch) => {
    const attack = Math.min(1, t * 80);
    return attack * (filters[ch].run(r() * 2 - 1) * Math.exp(-t * 1.6) * 2 + Math.sin(TAU * 42 * t) * Math.exp(-t * 8));
  }, { peak: 0.9 });
}

// ---------------------------------------------------------------- catalogue
// variants: seeds base, base+1, ...; Sound builds them lazily in this order (engines first: the
// take-off needs them; the landing sounds come long after)
export const FIELD = {
  seaWash: { variants: 1, make: seaWash, seed: 630 },
  waterImpact: { variants: 1, make: waterImpact, seed: 640 },
  eng_cycloneRoar: { variants: 1, make: cycloneRoar, seed: 51 },
  eng_cycloneIdle: { variants: 1, make: cycloneIdle, seed: 52 },
  tyreChirp: { variants: 3, make: tyreChirp, seed: 530 },
  gearThump: { variants: 2, make: gearThump, seed: 540 },
  flarePop: { variants: 2, make: flarePop, seed: 550 },
  flareHiss: { variants: 1, make: flareHiss, seed: 560 },
  bellyImpact: { variants: 1, make: bellyImpact, seed: 570 },
  scrapeGrind: { variants: 1, make: scrapeGrind, seed: 580 },
  scrapeSparks: { variants: 1, make: scrapeSparks, seed: 590 },
  scrapeRumble: { variants: 1, make: scrapeRumble, seed: 600 },
  fireBell: { variants: 2, make: fireBell, seed: 610 },
  ambulanceBell: { variants: 2, make: ambulanceBell, seed: 620 },
} as const;
export type FieldName = keyof typeof FIELD;
// Played as positional one-shots through sound.play(); the rest are loops for Sound.emitter()
export const FIELD_SHOTS = ['tyreChirp', 'gearThump', 'flarePop', 'bellyImpact', 'waterImpact'] as const;
export type FieldShot = typeof FIELD_SHOTS[number];
export type FieldLoop = Exclude<FieldName, FieldShot | 'eng_cycloneRoar' | 'eng_cycloneIdle'>;

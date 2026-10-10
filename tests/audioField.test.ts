import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { bellLevel, cycloneMix, scrapeMix, engineKindOf, ENGINE_SPECS, DETAIL } from '../src/audio/Acoustics';
import {
  FIELD, FIELD_SHOTS, ROAR_TONES, IDLE_TONES, bellStrikes, wheelGap, tyreChirp, cycloneRoar, cycloneIdle, flareHiss,
  scrapeGrind, scrapeSparks, scrapeRumble, fireBell, ambulanceBell,
} from '../src/audio/SynthField';

// energy share of x below a frequency (one-pole split)
function lowShare(x: Float32Array, sr: number, fc: number) {
  const a = 1 - Math.exp(-2 * Math.PI * fc / sr);
  let y = 0, lo = 0, tot = 0;
  for (const v of x) { y += (v - y) * a; lo += y * y; tot += v * v; }
  return lo / tot;
}
// strength of a slow amplitude modulation at f Hz (RMS envelope in 10 ms windows, one DFT bin)
function amAt(x: Float32Array, sr: number, f: number) {
  const w = Math.floor(sr * 0.01), m = Math.floor(x.length / w), env: number[] = [];
  for (let i = 0; i < m; i++) { let s = 0; for (let j = 0; j < w; j++) s += x[i * w + j] ** 2; env.push(Math.sqrt(s / w)); }
  const mean = env.reduce((a, b) => a + b, 0) / m;
  let re = 0, im = 0;
  env.forEach((e, i) => { re += (e - mean) * Math.cos(2 * Math.PI * f * i * 0.01); im += (e - mean) * Math.sin(2 * Math.PI * f * i * 0.01); });
  return 2 * Math.hypot(re, im) / m / mean;
}
function tone(x: Float32Array, sr: number, f: number) {
  let re = 0, im = 0;
  for (let i = 0; i < x.length; i++) { re += x[i] * Math.cos(2 * Math.PI * f * i / sr); im += x[i] * Math.sin(2 * Math.PI * f * i / sr); }
  return Math.hypot(re, im) / x.length;
}
// first sample (s) where |x| passes a share of the peak
function onset(x: Float32Array, sr: number, share = 0.25) {
  let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > pk * share) return i / sr;
  return -1;
}
const win = (x: Float32Array, sr: number, a: number, b: number) => x.subarray(Math.floor(a * sr), Math.floor(b * sr));

describe('airfield mix helpers', () => {
  it('B-17 outside: idle loop while taxiing, take-off roar at full power, rates at the right rpm', () => {
    const taxi = cycloneMix(0.32), run = cycloneMix(0.65), full = cycloneMix(1);
    expect(taxi.idle).toBeCloseTo(1, 6);
    expect(taxi.roar).toBeCloseTo(0, 6);
    expect(full.idle).toBe(0);
    expect(full.roar).toBeCloseTo(1, 6);
    expect(full.roarRate).toBeCloseTo(1, 6);          // the roar loop is recorded at take-off rpm
    expect(taxi.idleRate).toBeGreaterThan(0.95);       // the idle loop at ~1000 rpm
    expect(taxi.idleRate).toBeLessThan(1.05);
    expect(run.roar).toBeGreaterThan(0.2);             // the run-up brings the roar in
    expect(run.idle).toBeGreaterThan(0.2);
    expect(full.bright).toBeGreaterThan(taxi.bright);
    let prev = cycloneMix(0);
    for (let t = 0.05; t <= 1.2; t += 0.05) {
      const m = cycloneMix(t);
      expect(m.roar).toBeGreaterThanOrEqual(prev.roar - 1e-9);
      expect(m.idle).toBeLessThanOrEqual(prev.idle + 1e-9);
      expect(m.roarRate).toBeGreaterThanOrEqual(prev.roarRate - 1e-9);
      prev = m;
    }
    const bad = cycloneMix(NaN);
    for (const v of Object.values(bad)) expect(Number.isFinite(v)).toBe(true);
  });

  it('the B-17 gets its own outside voice; reduced detail drops the field layers', () => {
    expect(engineKindOf('b17', 'b17')).toBe('cyclone4');
    expect(engineKindOf('b17')).toBe('cyclone4');
    expect(ENGINE_SPECS.cyclone4.aux).toBeGreaterThan(0);
    expect(ENGINE_SPECS.cyclone4.cutoff).toBeGreaterThan(ENGINE_SPECS.bmw.cutoff);
    expect(DETAIL.normal.fieldLayers).toBe(true);
    expect(DETAIL.reduced.fieldLayers).toBe(false);
  });

  it('belly scrape by speed: silent at rest, sparks die out first, darker and lower as she slows', () => {
    const stop = scrapeMix(0), slow = scrapeMix(3), fast = scrapeMix(46);
    expect(stop.grind + stop.sparks + stop.rumble).toBe(0);
    expect(slow.sparks).toBe(0);
    expect(slow.grind).toBeGreaterThan(0.3);
    expect(slow.rumble).toBeGreaterThan(0.3);
    expect(fast.sparks).toBeCloseTo(1, 6);
    expect(fast.grind).toBeCloseTo(1, 6);
    expect(fast.lp).toBeGreaterThan(slow.lp);
    expect(fast.rate).toBeGreaterThan(slow.rate);
    let prev = scrapeMix(0);
    for (let v = 1; v <= 50; v++) {
      const m = scrapeMix(v);
      expect(m.grind).toBeGreaterThanOrEqual(prev.grind);
      expect(m.sparks).toBeGreaterThanOrEqual(prev.sparks);
      prev = m;
    }
    expect(Number.isFinite(scrapeMix(NaN).grind)).toBe(true);
  });

  it('crash-crew bells ring while racing out, a moment longer, then stop', () => {
    expect(bellLevel(15, 0)).toBe(1);
    expect(bellLevel(0.5, 0.5)).toBe(1);
    expect(bellLevel(0.5, 2)).toBeGreaterThan(0);
    expect(bellLevel(0.5, 2)).toBeLessThan(1);
    expect(bellLevel(0, 3.5)).toBe(0);
    expect(bellLevel(NaN, NaN)).toBe(0);
  });

  it('wheel gap and bell strike patterns', () => {
    for (let s = 0; s < 50; s++) { const g = wheelGap(s); expect(g).toBeGreaterThanOrEqual(0.035); expect(g).toBeLessThanOrEqual(0.12); }
    const hand = bellStrikes(2.4, 5, 3);
    expect(hand.filter((h) => h.a > 0.5).length).toBe(12);
    const pairs = bellStrikes(1.6, 2.5, 4, true);
    expect(pairs.length).toBe(4);
    expect(pairs[1].t - pairs[0].t).toBeGreaterThan(0.1);
    expect(pairs[1].t - pairs[0].t).toBeLessThan(0.16);
  });
});

describe('airfield synthesis', () => {
  it('renders every buffer finite, peak-normalised and deterministic', () => {
    for (const [name, def] of Object.entries(FIELD)) {
      for (let v = 0; v < def.variants; v++) {
        const a = def.make(def.seed + v);
        let pk = 0;
        for (const c of a.ch) for (const x of c) { expect(Number.isFinite(x)).toBe(true); pk = Math.max(pk, Math.abs(x)); }
        expect(pk, name).toBeGreaterThan(0.85);
        expect(pk, name).toBeLessThanOrEqual(0.93);
      }
    }
    expect(Array.from(tyreChirp(7).ch[0].subarray(0, 800))).toEqual(Array.from(tyreChirp(7).ch[0].subarray(0, 800)));
    for (const s of FIELD_SHOTS) expect(FIELD[s]).toBeDefined();
  });

  it('touchdown: the two main wheels chirp a few hundredths of a second apart, a squeal each', () => {
    for (const seed of [530, 531, 532]) {
      const p = tyreChirp(seed), sr = p.sr;
      // each wheel is panned into both channels (1 / 0.42): unmix them
      const L = p.ch[0], R = p.ch[1], a = L.map((v, i) => v - 0.42 * R[i]), b = R.map((v, i) => v - 0.42 * L[i]);
      const gap = Math.abs(onset(a, sr) - onset(b, sr));
      expect(gap).toBeGreaterThan(wheelGap(seed) * 0.6);
      expect(gap).toBeLessThan(wheelGap(seed) * 1.4 + 0.01);
      // the squeal lives in the mid band, not the thud
      expect(lowShare(p.ch[0], sr, 400)).toBeLessThan(0.3);
    }
  });

  it('engines: the roar beats (four Cyclones out of sync) on a blade-pass rasp, the idle is low and lumpy', () => {
    const roar = cycloneRoar(), idle = cycloneIdle();
    for (const f of [...ROAR_TONES, ...IDLE_TONES]) expect(Number.isInteger(f * 2)).toBe(true);   // 2 s loops
    expect(amAt(roar.ch[0], roar.sr, 0.5)).toBeGreaterThan(0.1);
    expect(tone(roar.ch[0], roar.sr, 70.5)).toBeGreaterThan(tone(roar.ch[0], roar.sr, 60) * 3);
    expect(lowShare(idle.ch[0], idle.sr, 150)).toBeGreaterThan(lowShare(roar.ch[0], roar.sr, 150));
    // seam: the loop point jumps no more than an ordinary sample step does
    const x = roar.ch[0];
    let adj = 0; for (let i = 1; i < x.length; i++) adj += Math.abs(x[i] - x[i - 1]);
    expect(Math.abs(x[x.length - 1] - x[0])).toBeLessThan(4 * adj / (x.length - 1));
  });

  it('the flare hiss rises in pitch as it climbs away', () => {
    const h = flareHiss(), x = h.ch[0];
    expect(h.ch.length).toBe(1);
    expect(lowShare(win(x, h.sr, 0.02, 0.15), h.sr, 2500)).toBeGreaterThan(lowShare(win(x, h.sr, 1, 1.5), h.sr, 2500) * 1.3);
  });

  it('belly slide layers: sparks brightest, rumble darkest; bells: the ambulance rings higher', () => {
    const g = scrapeGrind(), s = scrapeSparks(), r = scrapeRumble();
    expect(lowShare(s.ch[0], s.sr, 2000)).toBeLessThan(lowShare(g.ch[0], g.sr, 2000));
    expect(lowShare(r.ch[0], r.sr, 200)).toBeGreaterThan(0.8);
    const fb = fireBell(), ab = ambulanceBell();
    expect(lowShare(ab.ch[0], ab.sr, 1000)).toBeLessThan(lowShare(fb.ch[0], fb.sr, 1000));
    // a hand-rung fire bell: ~4-6 strikes a second
    let best = 0, bestF = 0;
    for (let f = 3; f <= 7; f += 0.25) { const a = amAt(fb.ch[0], fb.sr, f); if (a > best) { best = a; bestF = f; } }
    expect(bestF).toBeGreaterThanOrEqual(3.5);
    expect(bestF).toBeLessThanOrEqual(6.5);
  });
});

describe('airfield sounds without sound', () => {
  it('every call is a safe no-op with no AudioContext (the scenes still run)', async () => {
    const { FieldSounds } = await import('../src/audio/Field');
    const f = new FieldSounds(), p = new THREE.Vector3(1, 2, 3), v = new THREE.Vector3(0, 0, 40);
    expect(() => {
      f.prepare();
      f.touchdown(p, false); f.touchdown(p, false, true); f.touchdown(p, true);
      for (let s = 40; s >= 0; s -= 5) f.scrape(p, v, s);
      f.flarePop(p);
      f.flares([{ p, v, life: 4 }]); f.flares([]);
      f.vehicle({}, 'fire', p, v, 12, 0.016); f.vehicle({}, 'ambulance', p, v, 0, 0.016);
      f.stopAll();
    }).not.toThrow();
  });
});

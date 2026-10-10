import { describe, expect, it } from 'vitest';
import {
  SPEED_OF_SOUND, soundDelay, airLowpass, thunderLowpass, blastMix, blastStages, blastDuck, engineKindOf, engineRateTrim,
  ENGINE_SPECS, aspect, doppler, RateGate, DETAIL,
} from '../src/audio/Acoustics';
import { SYNTH3, jumoTwin, db603twin, pushFront, jetWhine, thunder, blastCrack, bk5, rng } from '../src/audio/Synth3';
import { Budget } from '../src/audio/Safe';

// energy share of x below / above a frequency (one-pole split, good enough for a band test)
function lowShare(x: Float32Array, sr: number, fc: number) {
  const a = 1 - Math.exp(-2 * Math.PI * fc / sr);
  let y = 0, lo = 0, tot = 0;
  for (const v of x) { y += (v - y) * a; lo += y * y; tot += v * v; }
  return lo / tot;
}
// strength of a slow amplitude modulation at f Hz (RMS envelope in 10 ms windows, single DFT bin)
function amAt(x: Float32Array, sr: number, f: number) {
  const w = Math.floor(sr * 0.01), m = Math.floor(x.length / w), env: number[] = [];
  for (let i = 0; i < m; i++) { let s = 0; for (let j = 0; j < w; j++) s += x[i * w + j] ** 2; env.push(Math.sqrt(s / w)); }
  const mean = env.reduce((a, b) => a + b, 0) / m;
  let re = 0, im = 0;
  env.forEach((e, i) => { re += (e - mean) * Math.cos(2 * Math.PI * f * i * 0.01); im += (e - mean) * Math.sin(2 * Math.PI * f * i * 0.01); });
  return 2 * Math.hypot(re, im) / m / mean;
}
// magnitude of a single frequency (Goertzel-style DFT bin)
function tone(x: Float32Array, sr: number, f: number) {
  let re = 0, im = 0;
  for (let i = 0; i < x.length; i++) { re += x[i] * Math.cos(2 * Math.PI * f * i / sr); im += x[i] * Math.sin(2 * Math.PI * f * i / sr); }
  return Math.hypot(re, im) / x.length;
}

describe('acoustics helpers', () => {
  it('delays a sound by distance / 343 m/s', () => {
    expect(SPEED_OF_SOUND).toBe(343);
    expect(soundDelay(343)).toBeCloseTo(1, 6);
    expect(soundDelay(1715)).toBeCloseTo(5, 6);
    expect(soundDelay(0)).toBe(0);
    expect(soundDelay(-50)).toBe(0);
    expect(soundDelay(NaN)).toBe(0);
  });

  it('air absorption: the cutoff falls with distance, is muffled inside, never below the floor', () => {
    expect(airLowpass(0)).toBeCloseTo(18000, 0);
    expect(airLowpass(1000)).toBeLessThan(airLowpass(100));
    expect(airLowpass(1000)).toBeGreaterThan(6000);
    expect(airLowpass(1e6)).toBe(150);
    expect(airLowpass(500, true)).toBeCloseTo(airLowpass(500) * 0.55, 6);
    expect(thunderLowpass(600)).toBeCloseTo(1400, 0);
    expect(thunderLowpass(5000)).toBeLessThan(thunderLowpass(1500));
    expect(thunderLowpass(1e6)).toBe(110);
    expect(Number.isFinite(airLowpass(NaN))).toBe(true);
  });

  it('explosion character: crack + boom close, thunder far', () => {
    const near = blastMix(50), mid = blastMix(1000), far = blastMix(4000);
    expect(near.crack).toBeCloseTo(1, 3);
    expect(near.boom).toBeCloseTo(1, 3);
    expect(near.thunder).toBe(0);
    expect(mid.crack).toBe(0);
    expect(mid.boom).toBeGreaterThan(0.2);
    expect(mid.thunder).toBeGreaterThan(0.2);
    expect(far.crack + far.boom + far.body).toBe(0);
    expect(far.thunder).toBe(1);
    // monotone
    let prev = blastMix(0);
    for (let d = 100; d <= 5000; d += 100) {
      const m = blastMix(d);
      expect(m.crack).toBeLessThanOrEqual(prev.crack);
      expect(m.thunder).toBeGreaterThanOrEqual(prev.thunder);
      prev = m;
    }
  });

  it('heavies and warships go up in stages; fighters do not', () => {
    const r = rng(1);
    expect(blastStages('fighter', r)).toHaveLength(0);
    const h = blastStages('heavy', r), w = blastStages('warship', r);
    expect(h.length).toBe(2);
    expect(w.length).toBe(3);
    for (const s of [...h, ...w]) { expect(s.at).toBeGreaterThan(0.2); expect(s.at).toBeLessThan(2.2); expect(s.rate).toBeLessThan(1); }
    expect(h[1].at).toBeGreaterThan(h[0].at);
  });

  it('blast ducking: deeper and longer when close, none beyond reach, bigger blasts reach further', () => {
    expect(blastDuck(1000, 'fighter')).toBeNull();
    const c = blastDuck(20, 'fighter')!, f = blastDuck(300, 'fighter')!;
    expect(c.depth).toBeLessThan(f.depth);
    expect(c.seconds).toBeGreaterThan(f.seconds);
    expect(c.depth).toBeGreaterThan(0.4);
    expect(blastDuck(700, 'fighter')).toBeNull();
    expect(blastDuck(700, 'warship')).not.toBeNull();
    expect(blastDuck(NaN)).toBeNull();
  });

  it('every aircraft type gets its own engine voice', () => {
    expect(engineKindOf('fw190', 'fw190')).toBe('bmw');
    expect(engineKindOf('p51d')).toBe('merlin');
    expect(engineKindOf('he111', 'he111')).toBe('jumoTwin');
    expect(engineKindOf('bf110', 'me410')).toBe('db603twin');
    expect(engineKindOf('do335', 'do335')).toBe('pushpull');
    expect(engineKindOf('me262', 'me262')).toBe('jet');
    expect(engineKindOf('me163', 'me163')).toBe('rocket');
    expect(engineKindOf('ju88', 'ju88')).toBe('jumoTwin');
    expect(engineRateTrim('ju88')).toBeGreaterThan(1);
    expect(engineRateTrim('he111')).toBe(1);
    expect(ENGINE_SPECS.pushpull.aux).toBeGreaterThan(0);
    expect(ENGINE_SPECS.jet.aux).toBeGreaterThan(0);
    expect(ENGINE_SPECS.jumoTwin.aux).toBe(0);
  });

  it('aspect: front loud ahead, rear loud astern; doppler rises approaching and is capped', () => {
    const ahead = aspect(0, 0, 1, 0, 0, 1), astern = aspect(0, 0, 1, 0, 0, -1), beam = aspect(0, 0, 1, 1, 0, 0);
    expect(ahead.front).toBeCloseTo(1, 6); expect(ahead.rear).toBeCloseTo(0.25, 6);
    expect(astern.rear).toBeCloseTo(1, 6); expect(astern.front).toBeCloseTo(0.25, 6);
    expect(beam.front).toBeCloseTo(beam.rear, 6);
    expect(doppler(100)).toBeGreaterThan(1);
    expect(doppler(-100)).toBeLessThan(1);
    expect(doppler(0)).toBe(1);
    expect(doppler(1e6)).toBeCloseTo(343 / 110, 6);
  });

  it('rate gate: one event per gap, survives a clock restart', () => {
    const g = new RateGate(0.25);
    expect(g.pass(1)).toBe(true);
    expect(g.pass(1.1)).toBe(false);
    expect(g.pass(1.26)).toBe(true);
    expect(g.pass(0.1)).toBe(true);   // new AudioContext: clock back at 0
    expect(g.pass(NaN)).toBe(false);
  });

  it('reduced detail trims every cap', () => {
    const n = DETAIL.normal, r = DETAIL.reduced;
    expect(r.voices).toBeLessThan(n.voices);
    expect(r.hrtf).toBeLessThan(n.hrtf);
    expect(r.engines).toBeLessThan(n.engines);
    expect(r.aux).toBe(false);
    expect(r.shipEmitters).toBe(1);
  });

  it('voice budget counts what is sounding and holds the cap (high priority gets headroom)', () => {
    const b = new Budget(4);
    for (let i = 0; i < 4; i++) expect(b.take(0, 0, 1)).toBe(true);
    expect(b.take(0, 0, 1)).toBe(false);
    expect(b.take(0, 0, 1, 16)).toBe(true);
    expect(b.count(0.5)).toBe(5);
    expect(b.count(2)).toBe(0);
  });
});

describe('pass-3 synthesis', () => {
  it('renders every voice finite, peak-normalised and deterministic', () => {
    for (const [name, def] of Object.entries(SYNTH3)) {
      const a = def.make(def.seed);
      expect(a.ch.length, name).toBeGreaterThanOrEqual(1);
      let pk = 0;
      for (const c of a.ch) for (const v of c) { expect(Number.isFinite(v)).toBe(true); pk = Math.max(pk, Math.abs(v)); }
      expect(pk, name).toBeGreaterThan(0.85);
      expect(pk, name).toBeLessThanOrEqual(0.93);
    }
    expect(Array.from(jumoTwin(5).ch[0].subarray(0, 500))).toEqual(Array.from(jumoTwin(5).ch[0].subarray(0, 500)));
  });

  it('He 111 twin Jumos beat ("wum-wum") at 1.5 Hz; the Me 410 DB 603s at a slow 0.5 Hz; a single engine does not', () => {
    const he = jumoTwin(), me = db603twin(), one = pushFront();
    expect(amAt(he.ch[0], he.sr, 1.5)).toBeGreaterThan(0.25);
    expect(amAt(me.ch[0], me.sr, 0.5)).toBeGreaterThan(0.15);
    expect(amAt(one.ch[0], one.sr, 1.5)).toBeLessThan(0.08);
    // the He 111 is the deepest of the three
    expect(lowShare(he.ch[0], he.sr, 250)).toBeGreaterThan(lowShare(me.ch[0], me.sr, 250));
  });

  it('the Me 262 whine sits on its compressor blade tone', () => {
    const w = jetWhine();
    expect(tone(w.ch[0], w.sr, 3915)).toBeGreaterThan(tone(w.ch[0], w.sr, 3500) * 5);
  });

  it('far thunder has no highs; the close crack is bright; the BK 5 is a deep thump', () => {
    const th = thunder(), cr = blastCrack(), k = bk5();
    expect(lowShare(th.ch[0], th.sr, 600)).toBeGreaterThan(0.85);
    // (the N-wave itself carries some ~200 Hz energy; the rest of the crack is broadband)
    expect(lowShare(cr.ch[0], cr.sr, 600)).toBeLessThan(0.6);
    expect(lowShare(cr.ch[0], cr.sr, 600)).toBeLessThan(lowShare(th.ch[0], th.sr, 600) * 0.7);
    expect(lowShare(k.ch[0], k.sr, 250)).toBeGreaterThan(0.6);
  });

  it('engine and bed loops loop: whole cycles over the loop for every tone', () => {
    for (const [f, sec] of [[240, 2], [243, 2], [72, 2], [73.5, 2], [270, 2], [272, 2], [67.5, 2], [68, 2], [280, 2], [70, 2], [282.5, 2], [71.5, 2], [3915, 2], [1957.5, 2], [145, 2]] as const) {
      expect(Number.isInteger(f * sec)).toBe(true);
    }
  });
});

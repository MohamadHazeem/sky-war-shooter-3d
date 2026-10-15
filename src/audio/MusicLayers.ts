// Procedural intensity layers for the adaptive score, rendered one bar at a time into plain
// Float32Arrays (no AudioContext, so the loudness tool and the tests can render them in Node).
// Music.ts wraps them in AudioBuffers, caches them, and starts one per bar exactly on the
// recorded track's beat grid, so they stay tempo-locked to the track.
//
//   taiko    unpitched war drums: a low heartbeat (tension), a driving pattern (combat),
//            and a fill every fourth bar (climax). Big drum = pitch-dropping membrane +
//            skin slap; small drum = higher, tighter, for the off-beats.
//   brass    low brass on the bar's bass root (root + octave, a fifth on top only over
//            tracks marked pitched), a soft "blat" attack, swelling slightly, re-struck each bar.
//   strings  a spiccato ostinato in 16ths (8ths over fast tracks) around the root.
// Every voice is deterministic for a given seed, peak-normalised to PEAK; levels are set
// by Music.ts (see the loudness report: tools/audio/loudness.mjs).

export const LAYER_SR = 24000;   // the layers are mostly low-frequency: half rate halves memory
export const PEAK = 0.8;
const TAU = Math.PI * 2;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// Seeded PRNG (mulberry32): variants differ, renders are reproducible
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalise(d: Float32Array, peak = PEAK) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m;
  // short fade-out so a cut tail never clicks
  const f = Math.min(d.length, 240);
  for (let i = 0; i < f; i++) d[d.length - 1 - i] *= i / f;
  return d;
}

// Band-limited sawtooth (polyBLEP)
class Saw {
  ph: number;
  constructor(ph = 0) { this.ph = ph; }
  run(f: number, sr: number) {
    const dt = f / sr;
    this.ph += dt;
    if (this.ph >= 1) this.ph -= 1;
    let v = 2 * this.ph - 1;
    const t = this.ph;
    if (t < dt) { const x = t / dt; v -= x + x - x * x - 1; }
    else if (t > 1 - dt) { const x = (t - 1) / dt; v -= x * x + x + x + 1; }
    return v;
  }
}

// Chamberlin state-variable filter (low-pass / band-pass outputs)
class SVF {
  lp = 0; bp = 0;
  run(x: number, fc: number, q: number, sr: number) {
    const f = 2 * Math.sin(Math.PI * Math.min(fc, sr / 6) / sr);
    this.lp += f * this.bp;
    const hp = x - this.lp - this.bp / q;
    this.bp += f * hp;
    return this.lp;
  }
}

// ---------------------------------------------------------------- taiko
export type TaikoPattern = 'heart' | 'drive' | 'fill' | 'hit';

// 16 steps per bar: [step, drum (0 big, 1 small), velocity]
const PATTERNS: Record<TaikoPattern, [number, number, number][]> = {
  // a slow heartbeat: one-two on beat 1, a softer echo on beat 3
  heart: [[0, 0, 1], [2, 0, 0.55], [8, 0, 0.7], [10, 0, 0.35]],
  // march: big drums on the beats, small drums pushing the off-beats
  drive: [[0, 0, 1], [3, 1, 0.45], [4, 0, 0.6], [6, 1, 0.5], [8, 0, 0.9], [11, 1, 0.45], [12, 0, 0.6], [14, 1, 0.55], [15, 1, 0.35]],
  // one big accent (a transition downbeat)
  hit: [[0, 0, 1], [0, 1, 0.5]],
  // fill into the next bar: a crescendo of big hits
  fill: [[0, 0, 1], [4, 0, 0.6], [6, 1, 0.5], [8, 0, 0.75], [10, 0, 0.6], [11, 1, 0.55], [12, 0, 0.8], [13, 0, 0.85], [14, 0, 0.9], [15, 0, 1]],
};
// Over fast tracks (> 120 bpm) a bar is short: thin the pattern to every other step
const fastSteps = (p: [number, number, number][]) => p.filter(([s]) => s % 2 === 0 || s === 15);

export const TAIL_S = 1.0; // ring-out after the bar (overlaps the next one)

// One bar of drums. spb: seconds per beat of the track's grid.
export function taikoBar(spb: number, pattern: TaikoPattern, seed = 1, sr = LAYER_SR): Float32Array {
  const bar = 4 * spb;
  const n = Math.ceil((bar + TAIL_S) * sr);
  const d = new Float32Array(n);
  const r = rng(seed);
  const steps = 60 / spb > 120 ? fastSteps(PATTERNS[pattern]) : PATTERNS[pattern];
  for (const [step, drum, vel] of steps) {
    const t0 = Math.round((step / 16) * bar * sr);
    const v = vel * (0.9 + 0.2 * r());
    const big = drum === 0;
    const f0 = big ? 52 + r() * 8 : 150 + r() * 25;          // settled membrane pitch
    const sweep = big ? 1.9 : 1.5;                             // starts this much higher
    const dec = big ? 4.2 : 11;                                // body decay (1/s)
    const len = Math.min(n - t0, Math.floor((big ? 0.95 : 0.4) * sr));
    const lp = new SVF();
    let ph = r() * TAU;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const f = f0 * (1 + (sweep - 1) * Math.exp(-t * 28));
      ph += TAU * f / sr;
      const body = Math.sin(ph) * Math.exp(-t * dec);
      const over = Math.sin(ph * 1.58 + 0.5) * Math.exp(-t * dec * 2.2) * 0.3;  // drum-head mode
      const slap = lp.run(r() * 2 - 1, big ? 900 : 2600, 0.7, sr) * Math.exp(-t * (big ? 45 : 70)) * (big ? 1.6 : 1.1);
      d[t0 + i] += v * Math.tanh((body + over + slap) * 1.3);
    }
  }
  return normalise(d);
}

// ---------------------------------------------------------------- brass
// Low brass on `root` (pitch class 0-11): the root placed between A1 and G#2 (MIDI 33-44),
// doubled an octave up; with fifth=true a fifth above the upper note too.
export function brassBar(spb: number, root: number, fifth: boolean, seed = 1, sr = LAYER_SR): Float32Array {
  const bar = 4 * spb;
  const rel = 0.45;
  const n = Math.ceil((bar + rel) * sr);
  const d = new Float32Array(n);
  const r = rng(seed);
  const low = 33 + ((((root - 9) % 12) + 12) % 12);
  const notes: [number, number][] = [[low, 1], [low + 12, 0.7]];
  if (fifth) notes.push([low + 19, 0.35]);
  for (const [m, amp] of notes) {
    const voices = [new Saw(r()), new Saw(r()), new Saw(r())];
    const det = [0, 0.0045, -0.004];
    const f = new SVF(), f2 = new SVF();
    const base = mtof(m);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      // envelope: soft swell in, gentle growth through the bar, released after it
      const env = Math.min(1, t / 0.12) * (0.75 + 0.25 * Math.min(1, t / bar)) * (t > bar ? Math.exp(-(t - bar) / (rel * 0.35)) : 1);
      const vib = 1 + 0.0025 * Math.sin(TAU * 4.6 * t) * Math.min(1, t / 0.6);
      let s = 0;
      for (let k = 0; k < 3; k++) s += voices[k].run(base * vib * (1 + det[k]), sr);
      // "blat": the filter opens hard on the attack, then settles; brighter as the bar grows
      const fc = base * (3 + 6 * Math.exp(-t * 9) + 2 * Math.min(1, t / bar));
      d[i] += f2.run(f.run(s / 3, fc, 0.8, sr), fc * 1.4, 0.7, sr) * env * amp;
    }
  }
  return normalise(d);
}

// ---------------------------------------------------------------- strings
// Spiccato ostinato around the root (root in the A2-G#3 octave): 16 notes per bar,
// 8 over fast tracks. Shapes rotate with `variant`; fifths only when `fifth`.
const SHAPES = [
  [0, 0, 12, 0, 7, 0, 12, 0, 0, 0, 12, 0, 7, 0, 12, 7],
  [0, 12, 0, 7, 0, 12, 0, 7, 0, 12, 0, 7, 12, 7, 12, 19],
];
export function stringsBar(spb: number, root: number, fifth: boolean, variant = 0, seed = 1, sr = LAYER_SR): Float32Array {
  const bar = 4 * spb;
  const n = Math.ceil((bar + 0.3) * sr);
  const d = new Float32Array(n);
  const r = rng(seed);
  const low = 45 + ((((root - 9) % 12) + 12) % 12);
  const fast = 60 / spb > 120;
  const count = fast ? 8 : 16;
  const shape = SHAPES[variant % SHAPES.length];
  for (let k = 0; k < count; k++) {
    let iv = shape[fast ? k * 2 : k];
    if (!fifth && iv % 12 === 7) iv = iv === 19 ? 12 : 0;
    const f0 = mtof(low + iv);
    const t0 = Math.round((k / count) * bar * sr);
    const len = Math.min(n - t0, Math.floor(0.22 * sr));
    const acc = k % 4 === 0 ? 1 : 0.7;
    const a = new Saw(r()), b = new Saw(r());
    const lp = new SVF();
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.006) * Math.exp(-t * 16);
      const s = (a.run(f0 * 1.003, sr) + b.run(f0 * 0.997, sr)) * 0.5;
      d[t0 + i] += lp.run(s, 2400 + 1600 * Math.exp(-t * 30), 0.9, sr) * env * acc * (0.92 + 0.16 * r());
    }
  }
  return normalise(d);
}

// ---------------------------------------------------------------- field snare (score 2.0)
// A period field drum (rope-tension snare): a band-passed noise "crack" over a short shell
// tone, ghost notes between the accents. Unpitched, so it may play over any track.
//   march  the bomb-run / combat cadence: accents on 1 and 3, a flam on 4, ghosts between
//   roll   a 32-stroke crescendo roll across the bar (bomb-run countdown, into a climax)
export type SnarePattern = 'march' | 'roll';
const SNARE: Record<'march', [number, number][]> = {
  // [step of 16, velocity]
  march: [[0, 1], [2, 0.3], [3, 0.35], [4, 0.6], [6, 0.3], [8, 0.95], [10, 0.3], [11, 0.4], [12, 0.6], [13.6, 0.45], [14, 0.9]],
};
export function snareBar(spb: number, pattern: SnarePattern, seed = 1, sr = LAYER_SR): Float32Array {
  const bar = 4 * spb;
  const n = Math.ceil((bar + 0.4) * sr);
  const d = new Float32Array(n);
  const r = rng(seed);
  const strokes: [number, number][] = pattern === 'roll'
    ? Array.from({ length: 32 }, (_, k) => [k / 2, 0.25 + 0.75 * Math.pow(k / 31, 1.6)] as [number, number])
    : (60 / spb > 120 ? SNARE.march.filter(([s]) => Number.isInteger(s) && s % 2 === 0) : SNARE.march);
  for (const [step, vel] of strokes) {
    const t0 = Math.round((step / 16) * bar * sr);
    const v = vel * (0.9 + 0.2 * r());
    const len = Math.min(n - t0, Math.floor(0.28 * sr));
    const bp = new SVF(), lp = new SVF();
    let ph = r() * TAU;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      ph += TAU * (185 + 60 * Math.exp(-t * 60)) / sr;
      const shell = Math.sin(ph) * Math.exp(-t * 38) * 0.55;
      // snares: band-passed noise (via the SVF band output), a little low body under it
      const x = r() * 2 - 1;
      bp.run(x, 3200, 1.2, sr);
      const crack = (bp.bp * 1.4 + lp.run(x, 900, 0.7, sr) * 0.4) * Math.exp(-t * 22);
      d[t0 + i] += v * Math.tanh((shell + crack) * 1.6);
    }
  }
  return normalise(d);
}

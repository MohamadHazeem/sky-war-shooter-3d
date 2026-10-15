#!/usr/bin/env node
// Adaptive score 2.0 cues (Phase 11 · 16): the bomb-run bed and six stingers, all original and
// synthesized here (no recordings, no borrowed melodies), with period instrumentation: a
// brass choir, a muted trumpet, a string section, timpani, a field snare, a bass drum,
// a suspended cymbal and a church bell.
//
//   node tools/audio/score2_build.mjs     (ffmpeg on PATH, or macOS afconvert; no npm install)
//
// Writes public/audio/music_bombrun.m4a + sting_*.m4a, tools/audio/score2_meta.json, and merges
// the entries into public/audio/manifest.json (music.*). Levels are calibrated against the
// shipped combat bed: the bomb-run bed matches its in-game loudness, each stinger's momentary
// peak sits at the offset in DEFS (LU against that bed). Deterministic: same input, same PCM.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { encode, decode, measure } from './lib/pcm.mjs';

const OUT = fileURLToPath(new URL('../../public/audio/', import.meta.url));
const SR = 32000, TAU = 2 * Math.PI, KBPS = 64;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

let seed = 1606;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;

// ---------------------------------------------------------------- instruments
// Each adds into `d` (Float32Array) from `at` (s). With `wrap` the tail wraps to the start
// (seamless loops).
function make(seconds, wrap = false) { return { d: new Float32Array(Math.round(seconds * SR)), wrap }; }
function put(buf, i, v) { const n = buf.d.length; if (i < n) buf.d[i] += v; else if (buf.wrap) buf.d[i % n] += v; }

// Brass section: additive, the upper harmonics open with the attack ("blat") and the
// dynamic; a small pitch scoop into each note; three players a few cents apart.
function brass(buf, midi, at, dur, vel, { bright = 0.6, players = 3, rel = 0.25 } = {}) {
  const f = mtof(midi), s0 = Math.round(at * SR), n = Math.round((dur + rel) * SR);
  const H = Math.max(1, Math.min(10, Math.floor(7000 / f)));
  for (let p = 0; p < players; p++) {
    const det = 1 + (p - (players - 1) / 2) * 0.0035, ph0 = p * 1.7;
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const att = Math.min(1, t / 0.07), env = att * (t > dur ? Math.exp(-(t - dur) / (rel * 0.4)) : 1);
      const scoop = 1 - 0.018 * Math.exp(-t * 22);
      const vib = 1 + 0.003 * Math.sin(TAU * 5.1 * t + ph0) * Math.min(1, Math.max(0, t - 0.25) / 0.4);
      ph += TAU * f * det * scoop * vib / SR;
      const b = bright * vel * (0.55 + 0.45 * Math.exp(-t * 7)) * att;
      let s = 0;
      for (let k = 1; k <= H; k++) s += Math.sin(k * ph) * Math.pow(k, -2.2 + 1.6 * b);
      put(buf, s0 + i, Math.tanh(s * 0.8) * env * vel / players);
    }
  }
}

// Muted trumpet: brass with a mid-band "cup" emphasis and a lyrical vibrato
function trumpet(buf, midi, at, dur, vel) {
  const f = mtof(midi), s0 = Math.round(at * SR), n = Math.round((dur + 0.3) * SR);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.05) * (t > dur ? Math.exp(-(t - dur) / 0.1) : 1) * (0.85 + 0.15 * Math.min(1, t / dur));
    const vib = 1 + 0.0045 * Math.sin(TAU * 5.6 * t) * Math.min(1, Math.max(0, t - 0.3) / 0.3);
    ph += TAU * f * vib / SR;
    let s = 0;
    for (let k = 1; k <= 9; k++) { const fk = k * f; s += Math.sin(k * ph) * (1 / k) * (fk > 900 && fk < 2600 ? 1.8 : 0.6); }
    put(buf, s0 + i, s * 0.35 * env * vel);
  }
}

// String section: five desks, slow bow attack, vibrato; `trem` bows a tremolo
function strings(buf, midi, at, dur, vel, { attack = 0.3, trem = 0 } = {}) {
  const f = mtof(midi), s0 = Math.round(at * SR), n = Math.round((dur + 0.5) * SR);
  const H = Math.max(1, Math.min(12, Math.floor(6000 / f)));
  for (let p = 0; p < 5; p++) {
    const det = 1 + (p - 2) * 0.0028, vr = 4.8 + p * 0.23;
    let ph = p;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const env = Math.min(1, t / attack) * (t > dur ? Math.exp(-(t - dur) / 0.18) : 1);
      const tr = trem ? 0.55 + 0.45 * Math.abs(Math.sin(TAU * trem * t + p)) : 1;
      ph += TAU * f * det * (1 + 0.0035 * Math.sin(TAU * vr * t + p)) / SR;
      let s = 0;
      for (let k = 1; k <= H; k++) s += Math.sin(k * ph) / (k * (1 + k * 0.08));
      put(buf, s0 + i, s * env * tr * vel * 0.22);
    }
  }
}

// Timpani: a tuned membrane (inharmonic modes), the pitch settling after the stroke
function timp(buf, midi, at, vel) {
  const f = mtof(midi), s0 = Math.round(at * SR), n = Math.round(2.4 * SR);
  const modes = [[1, 1, 2.2], [1.5, 0.45, 3], [1.99, 0.25, 4], [2.44, 0.12, 5.5]];
  for (const [m, a, dec] of modes) {
    let ph = rand() * TAU;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      ph += TAU * f * m * (1 + 0.04 * Math.exp(-t * 25)) / SR;
      put(buf, s0 + i, Math.sin(ph) * a * Math.exp(-t * dec) * Math.min(1, t / 0.003) * vel * 0.6);
    }
  }
  for (let i = 0; i < 0.05 * SR; i++) put(buf, s0 + i, rand() * Math.exp(-i / SR * 90) * vel * 0.15);
}

function bassDrum(buf, at, vel) {
  const s0 = Math.round(at * SR), n = Math.round(1.6 * SR);
  let ph = 0, lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += TAU * (48 + 40 * Math.exp(-t * 18)) / SR;
    lp += 0.08 * (rand() - lp);
    put(buf, s0 + i, (Math.sin(ph) * Math.exp(-t * 3.2) + lp * 1.5 * Math.exp(-t * 30)) * Math.min(1, t / 0.004) * vel * 0.9);
  }
}

// Field snare: band-limited noise crack + shell tone (as the in-game snare layer)
function snare(buf, at, vel) {
  const s0 = Math.round(at * SR), n = Math.round(0.3 * SR);
  let ph = 0, a = 0, b = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, x = rand();
    ph += TAU * (190 + 60 * Math.exp(-t * 60)) / SR;
    a += 0.55 * (x - a); b += 0.12 * (a - b);           // crude band: low-pass minus lower low-pass
    put(buf, s0 + i, (Math.sin(ph) * 0.5 * Math.exp(-t * 40) + (a - b) * 1.6 * Math.exp(-t * 20)) * vel * 0.7);
  }
}
function roll(buf, at, dur, v0, v1, rate = 18) {
  const k = Math.round(dur * rate);
  for (let i = 0; i < k; i++) snare(buf, at + i / rate, v0 + (v1 - v0) * (i / Math.max(1, k - 1)) ** 1.5);
}

// Suspended cymbal: high-passed noise with a shimmer; `swell` bows it up to `at + dur`
function cymbal(buf, at, vel, { swell = 0, dur = 2.6 } = {}) {
  const s0 = Math.round((at - swell) * SR), n = Math.round((swell + dur) * SR);
  let prev = 0, hp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR - swell, x = rand();
    hp = 0.92 * (hp + x - prev); prev = x;
    const env = t < 0 ? Math.pow(1 + t / swell, 2.5) * 0.7 : Math.exp(-t / (dur * 0.35)) * (1 - Math.exp(-t * 400));
    put(buf, s0 + i, hp * env * vel * 0.35);
  }
}

// Church bell: the classic partials (hum, prime, tierce, quint, nominal...), long decay
function bell(buf, midi, at, vel) {
  const f = mtof(midi), s0 = Math.round(at * SR), n = Math.round(5 * SR);
  const parts = [[0.5, 0.6, 0.35], [1, 1, 0.6], [1.183, 0.5, 0.8], [1.506, 0.35, 1], [2, 0.55, 1.2], [2.514, 0.25, 1.6], [2.662, 0.2, 1.8], [3.011, 0.15, 2.2]];
  for (const [m, a, dec] of parts) {
    const ph0 = rand() * TAU;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      put(buf, s0 + i, Math.sin(TAU * f * m * t + ph0) * a * Math.exp(-t * dec) * Math.min(1, t / 0.002) * vel * 0.3);
    }
  }
}

// A small hall (Schroeder: four combs, two all-passes), mixed in lightly: the game sends the
// music to its own reverb too, this only glues the section together.
function hall(d, wet = 0.16, wrap = false) {
  const n = d.length, out = new Float32Array(n), combs = [1557, 1617, 1491, 1422].map((x) => Math.round(x * SR / 44100));
  const passes = wrap ? 2 : 1;
  for (const L of combs) {
    const line = new Float32Array(L); let k = 0, lp = 0;
    for (let pass = 0; pass < passes; pass++) for (let i = 0; i < n; i++) {
      const y = line[k]; lp = y * 0.8 + lp * 0.2;
      line[k] = d[i] + lp * 0.8; k = (k + 1) % L;
      if (pass === passes - 1) out[i] += y / combs.length;
    }
  }
  for (const L of [225, 556].map((x) => Math.round(x * SR / 44100))) {
    const line = new Float32Array(L); let k = 0;
    for (let i = 0; i < n; i++) { const y = line[k], x = out[i]; line[k] = x + y * 0.5; out[i] = y - x * 0.5; k = (k + 1) % L; }
  }
  for (let i = 0; i < n; i++) d[i] = d[i] * (1 - wet * 0.5) + out[i] * wet;
  return d;
}

// ---------------------------------------------------------------- the cues
const BPM = 100, SPB = 60 / BPM, BAR = 4 * SPB;
const ROOTS = [2, 2, 10, 10, 7, 7, 9, 9];   // Dm Dm Bb Bb Gm Gm A A
const CHORD = { 2: [0, 3, 7], 10: [0, 4, 7], 7: [0, 3, 7], 9: [0, 4, 7] };
const low = (r) => 36 + ((r - 2 + 12) % 12) + 2;   // D2 .. C#3

// The bomb-run bed: straight and level under the flak. Low strings drive eighths on the
// bass, sustained chords above, timpani on the downbeats, a horn line climbing towards the
// leading note of the A chord, and a quiet field snare (the game's snare layer adds the rest).
function bombRun() {
  const b = make(ROOTS.length * BAR, true);
  const ost = [0, 0, 12, 0, 0, 12, 7, 12];
  const horn = [[69, 0, 4], [65, 4, 2], [67, 6, 2], [65, 8, 4], [62, 12, 2], [65, 14, 2], [70, 16, 2], [69, 18, 2], [67, 20, 4], [64, 24, 2], [69, 26, 2], [73, 28, 4]];
  ROOTS.forEach((r, bar) => {
    const at = bar * BAR, bass = low(r);
    ost.forEach((iv, k) => strings(b, bass + iv, at + k * SPB / 2, SPB * 0.42, k === 0 ? 0.75 : 0.5, { attack: 0.012 }));
    for (const iv of CHORD[r]) strings(b, bass + 24 + iv, at, BAR * 0.98, 0.16, { attack: 0.6 });
    timp(b, bass, at, 0.55); timp(b, bass, at + 2 * SPB, 0.3);
    snare(b, at + SPB, 0.18); snare(b, at + 3 * SPB, 0.22); snare(b, at + 3.5 * SPB, 0.1);
  });
  for (const [m, beat, len] of horn) brass(b, m, beat * SPB, len * SPB * 0.94, 0.33, { bright: 0.35, players: 2 });
  return hall(b.d, 0.14, true);
}

// Release: the bass drum and a crash under a low D minor brass chord that swells and falls
function bombsAway() {
  const b = make(4.2);
  bassDrum(b, 0, 1); cymbal(b, 0, 0.9); timp(b, 38, 0, 0.9);
  for (const m of [38, 45, 50, 53, 57]) brass(b, m, 0.02, 2.1, 0.55, { bright: 0.85, rel: 0.6 });
  for (const m of [81, 86]) strings(b, m, 0.05, 2.4, 0.18, { attack: 0.05, trem: 7 });
  return hall(b.d);
}

// Strike confirmed: a timpani roll into a D major brass chord, a trumpet call on top
function strike() {
  const b = make(4.4);
  for (let i = 0; i < 14; i++) timp(b, 38, i * 0.064, 0.18 + 0.4 * (i / 13) ** 2);
  const A = 0.9;
  timp(b, 38, A, 0.8); cymbal(b, A, 0.6); bassDrum(b, A, 0.6);
  for (const m of [50, 54, 57, 62]) brass(b, m, A, 1.9, 0.5, { bright: 0.8, rel: 0.7 });
  trumpet(b, 69, A, 0.28, 0.7); trumpet(b, 74, A + 0.3, 1.6, 0.75);
  return hall(b.d);
}

// A B-17 goes down: a bell toll, the strings swelling in D minor, a muted trumpet falling home
function loss() {
  const b = make(5.8);
  bell(b, 50, 0, 0.9); bell(b, 50, 2.4, 0.5);
  for (const m of [38, 50, 53, 57]) strings(b, m, 0.15, 3.6, m === 38 ? 0.35 : 0.24, { attack: 1.2 });
  for (const [m, t, d] of [[69, 0.45, 0.9], [65, 1.4, 0.75], [64, 2.2, 0.55], [62, 2.8, 1.7]]) trumpet(b, m, t, d, 0.55);
  return hall(b.d, 0.2);
}

// Into the climax: a snare roll and a bowed cymbal rising to one big accent (unpitched)
const RISE_ACCENT = 1.6;
function rise() {
  const b = make(3.4);
  roll(b, 0, RISE_ACCENT - 0.02, 0.12, 0.85, 20);
  cymbal(b, RISE_ACCENT, 0.9, { swell: 1.4, dur: 1.6 });
  bassDrum(b, RISE_ACCENT, 1); timp(b, 33, RISE_ACCENT, 0.7);
  return hall(b.d);
}

// Victory: an original fanfare (a triplet pickup, a leap to the octave) over a D major choir
function win() {
  const b = make(3.8);
  const line = [[62, 0, 0.12], [62, 0.14, 0.12], [62, 0.28, 0.12], [69, 0.42, 0.36], [66, 0.82, 0.18], [69, 1.02, 0.22], [74, 1.27, 1.7]];
  for (const [m, t, d] of line) brass(b, m, t, d, 0.62, { bright: 0.95, players: 2, rel: 0.2 });
  roll(b, 0.42, 0.82, 0.08, 0.35, 16);
  timp(b, 38, 0.42, 0.6); timp(b, 38, 1.27, 0.9); cymbal(b, 1.27, 0.7); bassDrum(b, 1.27, 0.5);
  for (const m of [38, 45, 50, 54, 57]) brass(b, m, 1.27, 1.9, 0.42, { bright: 0.7, rel: 0.6 });
  return hall(b.d);
}

// The empty bunk: a solo horn, very quiet, over a low drone (the room's own music plays on)
function bunk() {
  const b = make(6.6);
  strings(b, 38, 0, 5.2, 0.25, { attack: 1.5 }); strings(b, 45, 0.3, 4.9, 0.15, { attack: 1.5 });
  for (const [m, t, d] of [[57, 0.2, 1.0], [62, 1.25, 0.75], [60, 2.05, 0.55], [57, 2.65, 0.7], [62, 3.45, 2.2]]) brass(b, m, t, d, 0.45, { bright: 0.25, players: 1, rel: 0.5 });
  return hall(b.d, 0.22);
}

// name -> [render, meta, level offset (LU vs the combat bed; the bed itself: 0, integrated)]
const DEFS = {
  bombrun: [bombRun, { loop: true, bpm: BPM, bars: ROOTS.length, root: 2, pitched: true, roots: ROOTS }, 0],
  sting_bombsaway: [bombsAway, { loop: false, root: 2, pitched: true, accent: 0 }, 1],
  sting_strike: [strike, { loop: false, root: 2, pitched: true, accent: 0.9 }, 0],
  sting_loss: [loss, { loop: false, root: 2, pitched: true, accent: 0 }, -2],
  sting_rise: [rise, { loop: false, pitched: false, accent: RISE_ACCENT }, 0],
  sting_win: [win, { loop: false, pitched: false, accent: 0 }, 2],
  sting_bunk: [bunk, { loop: false, root: 2, pitched: false, accent: 0 }, -4],
};

const man = JSON.parse(readFileSync(OUT + 'manifest.json', 'utf8'));
const ref = man.music.combat;
const refM = measure(decode(OUT + ref.file));
const refBed = refM.lufsI + 20 * Math.log10(ref.gain), refPeak = refM.lufsS + 20 * Math.log10(ref.gain);
const meta = {}, report = [];
let total = 0;
for (const [name, [render, m, lu]] of Object.entries(DEFS)) {
  seed = 1606 + name.length * 31;
  const d = render();
  let pk = 0; for (const v of d) pk = Math.max(pk, Math.abs(v));
  for (let i = 0; i < d.length; i++) d[i] *= 0.89 / pk; // -1 dBFS
  const loop = m.loop, pad = loop ? SR / 2 : 0, pcm = new Float32Array(d.length + 2 * pad);
  if (loop) { pcm.set(d.subarray(d.length - pad)); pcm.set(d, pad); pcm.set(d.subarray(0, pad), pad + d.length); } else pcm.set(d);
  const file = name === 'bombrun' ? 'music_bombrun.m4a' : `${name}.m4a`;
  encode([pcm], SR, OUT + file, KBPS);
  // a mono buffer plays on both speakers: measure it as the stereo the listener hears
  const dec = decode(OUT + file), got = measure({ sampleRate: dec.sampleRate, channels: [dec.channels[0], dec.channels[0]] });
  // the bed matches the combat bed's integrated loudness; a stinger's loudest 3 s sits `lu` from the bed's
  const gain = Math.min(1, 10 ** (((loop ? refBed : refPeak) + lu - (loop ? got.lufsI : got.lufsS)) / 20));
  meta[name] = { file, gain: +gain.toFixed(3), ...m, ...(loop ? { loopStart: pad / SR, loopEnd: (pad + d.length) / SR, beat0: 0, frames: pcm.length, sampleRate: SR } : {}) };
  const bytes = statSync(OUT + file).size; total += bytes;
  report.push({ name, seconds: +(d.length / SR).toFixed(2), bytes, gain: meta[name].gain, lufsInGame: +((loop ? got.lufsI : got.lufsS) + 20 * Math.log10(gain)).toFixed(1) });
}
writeFileSync(new URL('./score2_meta.json', import.meta.url), JSON.stringify(meta, null, 1).replace(/\[[\d,\s]+\]/g, (s) => s.replace(/\s+/g, '')) + '\n');
Object.assign(man.music, meta);
writeFileSync(OUT + 'manifest.json', JSON.stringify(man, null, 2).replace(/\[\s*(-?[\d.]+(?:,\s*-?[\d.]+)*)\s*\]/g, (_, v) => '[' + v.replace(/\s+/g, ' ') + ']') + '\n');
console.log(`reference: combat bed ${refBed.toFixed(1)} LUFS in game (loudest 3 s ${refPeak.toFixed(1)})`);
console.table(report);
console.log(`total ${(total / 1024).toFixed(0)} KB (budget 3 MB)`);

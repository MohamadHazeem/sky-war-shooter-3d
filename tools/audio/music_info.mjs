#!/usr/bin/env node
// Musical analysis for the adaptive score: key (chroma + Krumhansl-Kessler profiles), tempo
// (onset autocorrelation) and the beat/bar phase of a loop, so the procedural intensity
// layers (Music.ts / MusicLayers.ts) can be pitched and tempo-locked to a recorded track.
//
//   node tools/audio/music_info.mjs public/audio/music_combat.mp3 [--bpm 164] [--bars 55]
//
// With --bars the beat period is taken from the loop length (exact for the baked loops);
// otherwise from --bpm, otherwise estimated. Prints JSON per file.
import { pathToFileURL } from 'node:url';
import { decode, mono } from './lib/pcm.mjs';

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

const corr = (a, b) => {
  const ma = a.reduce((s, v) => s + v, 0) / a.length, mb = b.reduce((s, v) => s + v, 0) / b.length;
  let n = 0, da = 0, dbb = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; dbb += (b[i] - mb) ** 2; }
  return n / Math.sqrt(da * dbb);
};

const cache = new Map();
// opts: bpm (fixed) | bars (loop length in bars) | refine (search +-refine bpm around the
// estimate / given bpm for the sharpest beat fold) | ss, dur (seconds: analyse a section)
export function analyse(path, { bpm, bars, refine = 0, ss = 0, dur: len } = {}) {
  if (!cache.has(path)) cache.set(path, decode(path));
  const d = cache.get(path);
  const sr = d.sampleRate, full = mono(d);
  const m = full.subarray(Math.floor(ss * sr), len ? Math.floor((ss + len) * sr) : full.length), dur = m.length / sr;
  // ---- chroma (bass-weighted a little: roots matter more than melody for a drone)
  const N = 8192, hop = 4096, win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  const chroma = new Float64Array(12), bassChroma = new Float64Array(12);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let s = 0; s + N <= m.length; s += hop) {
    for (let i = 0; i < N; i++) { re[i] = m[s + i] * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const f = k * sr / N;
      if (f < 55 || f > 2000) continue;
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      const pc = ((Math.round(12 * Math.log2(f / 440)) + 9) % 12 + 12) % 12;
      chroma[pc] += mag;
      if (f < 260) bassChroma[pc] += mag;
    }
  }
  let best = { r: -2, key: '' };
  const scores = [];
  for (let k = 0; k < 12; k++) {
    for (const [mode, prof] of [['major', MAJ], ['minor', MIN]]) {
      const rot = Array.from({ length: 12 }, (_, i) => prof[(i - k + 12) % 12]);
      const r = corr(Array.from(chroma), rot);
      scores.push({ key: `${NAMES[k]} ${mode}`, r: +r.toFixed(3) });
      if (r > best.r) best = { r, key: `${NAMES[k]} ${mode}`, root: k, mode };
    }
  }
  scores.sort((a, b) => b.r - a.r);
  const bassTop = Array.from(bassChroma).map((v, i) => [NAMES[i], v]).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]);
  // ---- onset envelope: log-magnitude spectral flux (STFT 1024 / hop 256), half-wave rectified
  const H = 256, W = 1024, frames = Math.floor((m.length - W) / H);
  const env = new Float32Array(frames);
  const hw = new Float32Array(W).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / W));
  const r2 = new Float64Array(W), i2 = new Float64Array(W);
  let last = new Float64Array(W / 2);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < W; i++) { r2[i] = m[f * H + i] * hw[i]; i2[i] = 0; }
    fft(r2, i2);
    const cur = new Float64Array(W / 2);
    let flux = 0;
    for (let k = 1; k < W / 2; k++) {
      cur[k] = Math.log(1 + 100 * Math.sqrt(r2[k] * r2[k] + i2[k] * i2[k]));
      const dlt = cur[k] - last[k];
      if (dlt > 0) flux += dlt * (k * sr / W < 200 ? 2 : 1); // low drums count double
    }
    env[f] = flux; last = cur;
  }
  // subtract a moving average so sustained loudness does not bias the phase
  { const a = new Float32Array(frames); let acc = 0; const L = 16;
    for (let f = 0; f < frames; f++) { acc += env[f]; if (f >= L) acc -= env[f - L]; a[f] = acc / Math.min(f + 1, L); }
    for (let f = 0; f < frames; f++) env[f] = Math.max(0, env[f] - a[f]); }
  const fps = sr / H;
  // tempo by autocorrelation over 60-180 bpm
  let estBpm = 0, bestAc = -1;
  for (let b = 60; b <= 180; b += 0.25) {
    const lag = fps * 60 / b;
    let ac = 0;
    for (let f = 0; f + lag + 1 < frames; f += 1) { const l = Math.floor(f + lag), w = f + lag - l; ac += env[f] * (env[l] * (1 - w) + env[l + 1] * w); }
    if (ac > bestAc) { bestAc = ac; estBpm = b; }
  }
  let spb = bars ? dur / (bars * 4) : 60 / (bpm || estBpm);
  // beat phase: fold the envelope modulo one beat and one bar
  // offsets are frame centres: frame f covers [f*H, f*H+W)
  const fold = (period, bins, from = 0, to = frames) => {
    const h = new Float64Array(bins);
    for (let f = from; f < to; f++) { const t = (f * H + W / 2) / sr; h[Math.floor(((t % period) / period) * bins) % bins] += env[f]; }
    const s = h.map((_, i) => h[(i - 1 + bins) % bins] * 0.5 + h[i] + h[(i + 1) % bins] * 0.5);
    let bi = 0; for (let i = 1; i < bins; i++) if (s[i] > s[bi]) bi = i;
    return { at: (bi / bins) * period, contrast: s[bi] / (s.reduce((a, b) => a + b, 0) / bins) };
  };
  if (refine) {
    let bestC = -1, bestSpb = spb;
    const b0 = 60 / spb;
    for (let b = b0 - refine; b <= b0 + refine + 1e-9; b += 0.01) {
      const c = fold(60 / b, 96).contrast;
      if (c > bestC) { bestC = c; bestSpb = 60 / b; }
    }
    spb = bestSpb;
  }
  const beat = fold(spb, 96);
  const bar = fold(spb * 4, 192);
  const h1 = fold(spb, 96, 0, frames >> 1), h2 = fold(spb, 96, frames >> 1);
  const beatInBar = Math.round(((bar.at - beat.at) / spb) % 4 + 4) % 4;
  const downbeat = beat.at + beatInBar * spb;
  return {
    file: path.split('/').pop(), seconds: +dur.toFixed(3),
    key: best.key, root: best.root, mode: best.mode, keyR: +best.r.toFixed(3), runnerUp: scores.slice(1, 3), bass: bassTop,
    bpmEstimated: estBpm, bpmUsed: +(60 / spb).toFixed(2), spb: +spb.toFixed(5),
    beatOffset: +beat.at.toFixed(4), beatContrast: +beat.contrast.toFixed(2), halves: [+h1.at.toFixed(3), +h2.at.toFixed(3)], barContrast: +bar.contrast.toFixed(2), downbeatOffset: +(downbeat % (4 * spb)).toFixed(4),
  };
}

// Bass root per bar (pitch class 0-11, C = 0) of a mono signal: chroma of 40-260 Hz over each
// bar, harmonics folded in by subtracting a fifth's share; a bar whose winner is not clear
// (< 1.12x the runner-up) keeps the previous bar's root (or `fallback`).
export function barRoots(m, sr, { start, barDur, bars, fallback }) {
  const N = 8192, re = new Float64Array(N), im = new Float64Array(N);
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  const roots = [], conf = [];
  let prev = fallback;
  for (let b = 0; b < bars; b++) {
    const c = new Float64Array(12);
    const s0 = Math.floor((start + b * barDur) * sr), s1 = Math.floor((start + (b + 1) * barDur) * sr);
    for (let s = s0; s + N <= Math.max(s1, s0 + N) && s + N <= m.length; s += N >> 2) {
      for (let i = 0; i < N; i++) { re[i] = m[s + i] * win[i]; im[i] = 0; }
      fft(re, im);
      for (let k = 1; k < N / 2; k++) {
        const f = k * sr / N;
        if (f < 40 || f > 260) continue;
        const pc = ((Math.round(12 * Math.log2(f / 440)) + 9) % 12 + 12) % 12;
        c[pc] += Math.sqrt(re[k] * re[k] + im[k] * im[k]) / Math.sqrt(f); // favour the lowest notes
      }
    }
    // a strong fifth is often the root's 3rd harmonic: credit some of it back to the root
    const adj = Array.from(c, (v, pc) => v + 0.35 * c[(pc + 7) % 12] - 0.2 * c[(pc + 5) % 12]);
    const order = adj.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const ratio = order[0][0] / Math.max(1e-9, order[1][0]);
    const r = ratio >= 1.12 ? order[0][1] : prev;
    roots.push(r); conf.push(+ratio.toFixed(2)); prev = r;
  }
  return { roots, conf };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = {};
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--bpm') opt.bpm = +args[++i];
    else if (args[i] === '--bars') opt.bars = +args[++i];
    else if (args[i] === '--refine') opt.refine = +args[++i];
    else if (args[i] === '--ss') opt.ss = +args[++i];
    else if (args[i] === '--dur') opt.dur = +args[++i];
    else files.push(args[i]);
  }
  for (const f of files) console.log(JSON.stringify(analyse(f, opt), null, 1));
}

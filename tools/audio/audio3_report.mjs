#!/usr/bin/env node
// Audio pass 3 measurements (no browser): renders every synthesised voice of src/audio/Synth3.ts
// and reports, per buffer: build time, length, peak / RMS (dBFS), the spectrum in bands, the
// spectral centroid, and for the engine loops the dominant slow amplitude modulation (the
// twin-engine beat) with its depth, plus the seam jump of each loop.
//
//   node tools/audio/audio3_report.mjs            # table
//   node tools/audio/audio3_report.mjs --json f   # also write the numbers
import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'sws-a3-'));
const out = join(dir, 'a3.mjs');
await build({ entryPoints: [join(HERE, '../../src/audio/Synth3.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' });
const S = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

// radix-2 FFT magnitude spectrum of the first 2^k samples (Hann window), averaged over frames
function spectrum(x, sr, size = 8192) {
  const n = size, frames = Math.max(1, Math.floor(x.length / n));
  const mag = new Float64Array(n / 2);
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < n; i++) { const v = x[f * n + i] ?? 0; re[i] = v * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1))); im[i] = 0; }
    for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
      const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let j = 0; j < len / 2; j++) {
          const ur = re[i + j], ui = im[i + j], vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
          re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
    for (let k = 0; k < n / 2; k++) mag[k] += (re[k] * re[k] + im[k] * im[k]) / frames;
  }
  return { pow: mag, hz: sr / n };
}
const BANDS = [['sub', 20, 60], ['low', 60, 250], ['mid', 250, 2000], ['high', 2000, 6000], ['air', 6000, 24000]];
function bands(x, sr) {
  const size = x.length >= 8192 ? 8192 : 1 << Math.floor(Math.log2(Math.max(256, x.length)));
  const { pow, hz } = spectrum(x, sr, size);
  let tot = 0, cen = 0;
  const e = Object.fromEntries(BANDS.map(([k]) => [k, 0]));
  for (let k = 1; k < pow.length; k++) {
    const f = k * hz; tot += pow[k]; cen += pow[k] * f;
    for (const [b, lo, hi] of BANDS) if (f >= lo && f < hi) e[b] += pow[k];
  }
  for (const b of Object.keys(e)) e[b] = Math.round(100 * e[b] / tot);
  return { bands: e, centroid: Math.round(cen / tot) };
}
// dominant amplitude modulation in 0.3..6 Hz of a loop: RMS envelope (10 ms), DFT on it
function beat(x, sr) {
  const w = Math.floor(sr * 0.01), m = Math.floor(x.length / w), env = new Float64Array(m);
  for (let i = 0; i < m; i++) { let s = 0; for (let j = 0; j < w; j++) { const v = x[i * w + j]; s += v * v; } env[i] = Math.sqrt(s / w); }
  const mean = env.reduce((a, b) => a + b, 0) / m;
  const T = m * 0.01;
  let best = 0, bestF = 0;
  for (let k = 1; k / T <= 6; k++) {
    const f = k / T; if (f < 0.3) continue;
    let re = 0, im = 0;
    for (let i = 0; i < m; i++) { re += (env[i] - mean) * Math.cos(2 * Math.PI * f * i * 0.01); im += (env[i] - mean) * Math.sin(2 * Math.PI * f * i * 0.01); }
    const a = 2 * Math.hypot(re, im) / m;
    if (a > best) { best = a; bestF = f; }
  }
  return { hz: +bestF.toFixed(2), depth: +(best / mean).toFixed(2) };
}
const db = (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf');

const rows = [];
for (const [name, def] of Object.entries(S.SYNTH3)) {
  const t0 = performance.now();
  const p = def.make(def.seed);
  const ms = performance.now() - t0;
  const x = p.ch[0];
  let pk = 0, ss = 0, nan = 0;
  for (const c of p.ch) for (const v of c) { if (!Number.isFinite(v)) nan++; pk = Math.max(pk, Math.abs(v)); ss += v * v; }
  const rms = Math.sqrt(ss / (x.length * p.ch.length));
  const row = { name, ms: +ms.toFixed(1), sec: +(x.length / p.sr).toFixed(2), sr: p.sr, peakDb: +db(pk), rmsDb: +db(rms), nan, ...bands(x, p.sr) };
  if (name.startsWith('eng_') || name === 'windowRoar' || name === 'rattleBed') {
    row.beat = beat(x, p.sr);
    let adj = 0; for (let i = 1; i < x.length; i++) adj += Math.abs(x[i] - x[i - 1]);
    row.seam = +(Math.abs(x[x.length - 1] - x[0]) / (adj / (x.length - 1))).toFixed(2);   // jump across the loop point / mean sample step
  }
  rows.push(row);
}
console.log('name             ms    sec   sr     peak   rms    sub low mid high air  centroid  beat(Hz,depth)  seam');
for (const r of rows) {
  const b = r.bands;
  console.log(`${r.name.padEnd(15)} ${String(r.ms).padStart(5)} ${String(r.sec).padStart(5)} ${String(r.sr).padStart(6)} ${String(r.peakDb).padStart(6)} ${String(r.rmsDb).padStart(6)}   ${[b.sub, b.low, b.mid, b.high, b.air].map((v) => String(v).padStart(3)).join(' ')}  ${String(r.centroid).padStart(7)}   ${r.beat ? `${r.beat.hz} / ${r.beat.depth}` : ''}${r.seam !== undefined ? `   ${r.seam}` : ''}${r.nan ? `  NaN:${r.nan}` : ''}`);
}
const total = rows.reduce((a, r) => a + r.ms * (S.SYNTH3[r.name].variants), 0);
const bytes = rows.reduce((a, r) => a + r.sec * r.sr * 4 * 2 * S.SYNTH3[r.name].variants, 0);
console.log(`\nall variants: ~${total.toFixed(0)} ms to build, ~${(bytes / 1048576).toFixed(1)} MB of decoded PCM, 0 bytes downloaded`);
const j = process.argv.indexOf('--json');
if (j > 0) writeFileSync(process.argv[j + 1], JSON.stringify(rows, null, 1));

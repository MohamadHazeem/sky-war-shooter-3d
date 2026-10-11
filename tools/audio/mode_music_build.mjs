#!/usr/bin/env node
// Original, deterministic period-style miniatures. No recordings or borrowed melodies.
// node tools/audio/mode_music_build.mjs (macOS afconvert or ffmpeg; no npm install)
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { encode, decode, measure } from './lib/pcm.mjs';
const out = fileURLToPath(new URL('../../public/audio/', import.meta.url));
const sr = 32000, tau = 2 * Math.PI;
const defs = [
  ['night', 72, [2, 2, 10, 9, 2, 5, 7, 9]],
  ['field', 112, [2, 7, 2, 9, 10, 5, 7, 9]],
  ['train', 128, [2, 2, 5, 9, 10, 7, 9, 9]],
  ['boss', 80, [2, 1, 2, 9, 10, 7, 1, 9]],
  ['crew', 64, [2, 10, 5, 9, 2, 7, 10, 9]],
  ['crewLoss', 56, [2, 2, 10, 7, 2, 10, 7, 9]],
  ['breakup', 80, [2]],
];
const meta = {}, report = [];
for (const [name, bpm, roots] of defs) {
  const loop = name !== 'breakup', spb = 60 / bpm;
  const n = Math.round((loop ? roots.length * 4 * spb : 4.5) * sr), d = new Float32Array(n);
  let seed = 12012;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  function note(kind, midi, at, dur, gain) {
    const f = 440 * 2 ** ((midi - 69) / 12), start = Math.round(at * sr), len = Math.round(dur * sr);
    for (let i = 0; i < len; i++) {
      const t = i / sr, u = i / len, p = tau * f * t;
      let wave, env;
      if (kind === 'snare') { wave = random() * 0.65 + Math.sin(tau * 180 * t) * 0.35; env = Math.min(1, t / 0.003) * Math.exp(-t * 28) * (1 - u); }
      else if (kind === 'drum') { wave = Math.sin(p + 2 * (1 - Math.exp(-t * 18))) + 0.25 * Math.sin(p * 1.51); env = Math.min(1, t / 0.006) * Math.exp(-t * 5) * (1 - u); }
      else if (kind === 'piano') { wave = Math.sin(p) + 0.32 * Math.sin(p * 2.002) + 0.13 * Math.sin(p * 3.006); env = Math.min(1, t / 0.006) * Math.exp(-t * 2.1) * (1 - u); }
      else if (kind === 'brass') { wave = Math.sin(p) + 0.42 * Math.sin(2 * p) + 0.22 * Math.sin(3 * p) + 0.09 * Math.sin(4 * p); env = Math.min(1, t / 0.08) * Math.min(1, (dur - t) / 0.16); }
      else { wave = 0.6 * Math.sin(p + 0.02 * Math.sin(tau * 4.6 * t)) + 0.28 * Math.sin(p * 1.003) + 0.12 * Math.sin(3 * p); env = Math.sin(Math.PI * u) ** 1.5; }
      const idx = start + i;
      if (loop || idx < n) d[idx % n] += wave * env * gain;
    }
  }
  if (!loop) {
    for (const m of [26, 38, 45, 50]) note('brass', m, 0, 2.5, 0.09);
    note('drum', 26, 0, 3, 0.22);
    for (let k = 0; k < 4; k++) note('piano', 74 - k * 7, 0.25 + k * 0.18, 3, 0.08);
  } else roots.forEach((root, bar) => {
    const at = bar * 4 * spb, bass = 36 + root, room = name.startsWith('crew'), night = name === 'night', boss = name === 'boss';
    const third = root === 9 ? 4 : 3;
    for (const m of [bass, bass + 7, bass + 12 + third]) note('strings', m, at, spb * 4.4, room ? 0.04 : night ? 0.065 : 0.035);
    if (room) {
      const phrase = name === 'crewLoss' ? [12, 7, third, 0] : [12, third + 12, 7, 14];
      phrase.forEach((v, k) => { if (name !== 'crewLoss' || k % 2 === 0) note('piano', bass + v, at + k * spb, spb * 3, 0.095); });
    } else if (night) {
      note('drum', bass - 12, at, spb * 2, 0.10);
      if (bar % 2) note('strings', bass + 25, at + 2 * spb, spb * 2, 0.025);
    } else {
      const motif = boss ? [0, 1, 7, 0] : name === 'train' ? [7, 12, 7, third, 0, 7, 14, 12] : [0, 7, 12, third + 12, 14, 12, 7, third];
      const unit = boss ? spb : spb / 2;
      motif.forEach((v, k) => note('brass', bass + v, at + k * unit, unit * 0.72, boss ? 0.12 : 0.075));
      for (let k = 0; k < 4; k++) {
        note('drum', bass - 12, at + k * spb, spb, boss ? 0.14 : 0.09);
        if (k % 2) { note('snare', 0, at + k * spb, 0.25, 0.12); note('snare', 0, at + (k + 0.75) * spb, 0.15, 0.045); }
      }
    }
  });
  // Consistent headroom; crew is deliberately quieter than combat before room ducking.
  let pk = 0; for (const v of d) pk = Math.max(pk, Math.abs(v));
  const trim = (name.startsWith('crew') ? 0.22 : 0.42) / pk;
  for (let i = 0; i < n; i++) d[i] *= trim;
  const pad = loop ? sr / 2 : 0, pcm = new Float32Array(n + 2 * pad);
  if (loop) { pcm.set(d.subarray(n - pad)); pcm.set(d, pad); pcm.set(d.subarray(0, pad), pad + n); } else pcm.set(d);
  const file = `music_${name}.m4a`; encode([pcm], sr, out + file, 64);
  meta[name] = { file, gain: name.startsWith('crew') ? 0.32 : 0.42, loop, bpm, bars: roots.length, loopStart: pad / sr, loopEnd: (pad + n) / sr, beat0: 0, frames: pcm.length, sampleRate: sr, root: 2, pitched: !name.startsWith('crew'), roots };
  report.push({ name, seconds: n / sr, bytes: statSync(out + file).size, ...measure(decode(out + file)) });
}
writeFileSync(new URL('./mode_music_meta.json', import.meta.url), JSON.stringify(meta, null, 2) + '\n');
const manifest = JSON.parse(readFileSync(out + 'manifest.json', 'utf8'));
Object.assign(manifest.music, meta);
writeFileSync(out + 'manifest.json', JSON.stringify(manifest, null, 2).replace(/\[\s*(-?[\d.]+(?:,\s*-?[\d.]+)*)\s*\]/g, (_, v) => '[' + v.replace(/\s+/g, ' ') + ']') + '\n');
console.log(JSON.stringify(report, null, 2));

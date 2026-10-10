#!/usr/bin/env node
// Adaptive-score music: bar-exact loops and their musical metadata.
//
//   node tools/audio/music_build.mjs            # build the loops below, then write music_meta.json
//   node tools/audio/music_build.mjs --meta     # only (re)analyse the shipped files
//
// Sources (Kevin MacLeod, incompetech.com, CC BY 4.0) are fetched by fetch.sh into
// work/audio-src/music. Each loop starts on a detected downbeat, is a whole number of bars
// long (so the beat grid continues across the wrap), its last bar is crossfaded into the
// first, and it is padded on both sides with its own wrapped audio: the game loops between
// loopStart and loopEnd, so a decoder that does not trim the AAC priming still loops cleanly.
//
// music_meta.json (read by gen_meta.py into manifest.json) carries, per track: bpm, bars,
// loopStart/loopEnd, beat0 (first beat after loopStart, s), frames/sampleRate (as encoded,
// to detect untrimmed priming at runtime), key, and the bass root of every bar, which the
// procedural intensity layers (src/audio/MusicLayers.ts) follow.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, encode, mono } from './lib/pcm.mjs';
import { analyse, barRoots } from './music_info.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORK = process.env.AUDIO_WORK || join(HERE, 'work');
const MU = join(WORK, 'audio-src/music');
const OUT = join(HERE, '../../public/audio');
const PAD = 0.5; // s of wrapped audio before and after the loop

// file -> how it is built. `downbeat` is a downbeat in the source (s) found with music_info.mjs
// (--bpm <bpm> on the source); the loop starts `startBar` bars after it.
const BUILD = {
  'music_combat.m4a': { src: 'Clenched Teeth.mp3', bpm: 166, downbeat: 0.0151, startBar: 2, bars: 56, kbps: 128 },
  'music_climax.m4a': { src: 'Heroic Age.mp3', bpm: 130, downbeat: 0.9327, startBar: 29, bars: 16, kbps: 128 },
};
// Every looping track in the adaptive score (built above or shipped as-is), with its bar count.
// pitched: whether the drone / ostinato layers may play over it (clear bass line, stable key;
// Clenched Teeth moves between A minor and E major over a G#/A bass, so it only gets drums).
const TRACKS = {
  tension: { file: 'music_tension.mp3', bars: 44, pitched: false },
  combat: { file: 'music_combat.m4a', bars: 56, pitched: false },
  climax: { file: 'music_climax.m4a', bars: 16, pitched: true },
};

function build(name, b) {
  const srcPath = join(MU, b.src);
  if (!existsSync(srcPath)) throw new Error(`missing ${srcPath}: run fetch.sh`);
  const d = decode(srcPath);
  const sr = d.sampleRate, bar = 240 / b.bpm;
  const s0 = Math.round((b.downbeat + b.startBar * bar) * sr);
  const L = Math.round(b.bars * bar * sr), X = Math.round(bar * sr), P = Math.round(PAD * sr);
  const out = d.channels.map((c) => {
    const loop = c.slice(s0, s0 + L);
    // equal-power crossfade: the bar after the loop fades into its first bar
    for (let i = 0; i < X; i++) {
      const t = (i / X) * Math.PI / 2;
      loop[i] = loop[i] * Math.sin(t) + c[s0 + L + i] * Math.cos(t);
    }
    const o = new Float32Array(P + L + P);
    o.set(loop.subarray(L - P), 0); o.set(loop, P); o.set(loop.subarray(0, P), P + L);
    return o;
  });
  let pk = 0;
  for (const c of out) for (const v of c) pk = Math.max(pk, Math.abs(v));
  const g = Math.pow(10, -1 / 20) / pk; // peak -1 dBFS, as build.py does
  for (const c of out) for (let i = 0; i < c.length; i++) c[i] *= g;
  encode(out, sr, join(OUT, name), b.kbps);
  console.log(`built ${name}: ${b.bars} bars at ${b.bpm} bpm from ${b.src} @ ${(s0 / sr).toFixed(3)} s`);
}

function meta() {
  const res = {};
  const prev = existsSync(join(HERE, 'music_meta.json')) ? JSON.parse(readFileSync(join(HERE, 'music_meta.json'), 'utf8')) : {};
  for (const [key, t] of Object.entries(TRACKS)) {
    const path = join(OUT, t.file);
    if (!existsSync(path)) { if (prev[key]) res[key] = prev[key]; continue; }
    const d = decode(path);
    const sr = d.sampleRate, frames = d.channels[0].length;
    const built = BUILD[t.file];
    const loopStart = built ? PAD : 0;
    const loopEnd = built ? frames / sr - PAD : frames / sr;
    const len = loopEnd - loopStart, spb = len / (t.bars * 4);
    const a = analyse(path, { bars: t.bars, ss: loopStart, dur: len });
    // built loops start on a downbeat; a shipped one uses the detected downbeat
    const beat0 = built ? a.beatOffset : a.downbeatOffset;
    const m = mono(d);
    const { roots, conf } = barRoots(m, sr, { start: loopStart + beat0, barDur: 4 * spb, bars: t.bars, fallback: a.root });
    res[key] = {
      file: t.file, bpm: +(60 / spb).toFixed(3), bars: t.bars, loopStart: +loopStart.toFixed(5), loopEnd: +loopEnd.toFixed(5),
      beat0: +beat0.toFixed(4), frames, sampleRate: sr, key: a.key, root: a.root, pitched: t.pitched, roots,
    };
    console.log(`${key}: ${a.key} (r ${a.keyR}), ${res[key].bpm} bpm, beat0 ${beat0.toFixed(3)} s (contrast ${a.beatContrast}, halves ${a.halves})`);
    console.log(`  roots ${roots.map((r) => ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][r]).join(' ')}`);
    console.log(`  conf  ${conf.join(' ')}`);
  }
  writeFileSync(join(HERE, 'music_meta.json'), JSON.stringify(res, null, 1).replace(/\[[\d,\s]+\]/g, (s) => s.replace(/\s+/g, '')) + '\n');
}

if (!process.argv.includes('--meta')) for (const [name, b] of Object.entries(BUILD)) build(name, b);
meta();

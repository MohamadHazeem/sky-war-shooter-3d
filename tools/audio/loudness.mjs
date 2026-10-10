#!/usr/bin/env node
// Loudness report for every sound the game ships or synthesizes.
//
//   node tools/audio/loudness.mjs                 # full report (files + synthesized + in-game mix)
//   node tools/audio/loudness.mjs --mix           # only the in-game mix table
//   node tools/audio/loudness.mjs --json out.json # also write the numbers (for before/after diffs)
//   node tools/audio/loudness.mjs --compare before.json
//
// Files are decoded (ffmpeg, or afconvert on macOS); the synthesized buffers are rendered by
// bundling the game's own audio code (synth_entry.ts, esbuild) against a stub AudioContext.
// Per buffer: sample peak (dBFS), RMS (dBFS), integrated loudness (LUFS, BS.1770-4 gated) and
// max momentary loudness (LUFS-M, 400 ms: the number that matters for one-shots).
//
// The "in-game mix" table renders composites the way the code plays them (manifest gain x the
// gain at the call site x distance attenuation at a typical range) and compares them with the
// target ladder: player guns > explosions > crew voice > engines bed > music > ambience.
// Code-side gains are mirrored in MIX below; keep them in step with the sources named there.
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decode, measure } from './lib/pcm.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const AUD = join(ROOT, 'public/audio');
const SR = 44100;
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const onlyMix = args.includes('--mix');
const man = JSON.parse(readFileSync(join(AUD, 'manifest.json'), 'utf8'));
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '-inf');
const dB = (g) => 20 * Math.log10(g);

// ---------------------------------------------------------------- sources
const cache = new Map();
const file = (f) => { if (!cache.has(f)) cache.set(f, resample(decode(join(AUD, f)), SR)); return cache.get(f); };

// linear-interpolation resample (only used to mix buffers of different rates)
function resample(b, sr) {
  if (b.sampleRate === sr) return b;
  const k = b.sampleRate / sr, n = Math.floor(b.channels[0].length / k);
  return { sampleRate: sr, channels: b.channels.map((c) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * k, j = Math.floor(x), w = x - j; o[i] = c[j] * (1 - w) + (c[j + 1] ?? 0) * w; } return o; }) };
}

async function synth() {
  const { build } = await import('esbuild');
  const dir = mkdtempSync(join(tmpdir(), 'sws-synth-'));
  const out = join(dir, 'synth.mjs');
  await build({
    entryPoints: [join(HERE, 'synth_entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error',
    define: { 'import.meta.env': '{"BASE_URL":"/","DEV":false}' },
  });
  const mod = await import(pathToFileURL(out).href);
  const r = mod.render(SR);
  rmSync(dir, { recursive: true, force: true });
  const m = new Map();
  for (const b of r.bufs) m.set(b.name, resample(b, SR));
  return { bufs: m, layerMix: r.layerMix };
}

// ---------------------------------------------------------------- mixing helpers
// Sum `parts` [{ buf, gain, at (s), rate }] into one stereo buffer (rate by resampling)
function mix(parts, seconds) {
  const n = Math.ceil(seconds * SR);
  const out = [new Float32Array(n), new Float32Array(n)];
  for (const p of parts) {
    const b = p.rate && p.rate !== 1 ? resample({ sampleRate: SR * p.rate, channels: p.buf.channels }, SR) : p.buf;
    const o = Math.round((p.at ?? 0) * SR);
    for (let c = 0; c < 2; c++) {
      const src = b.channels[Math.min(c, b.channels.length - 1)];
      for (let i = 0; i < src.length && o + i < n; i++) out[c][o + i] += src[i] * p.gain;
    }
  }
  return { sampleRate: SR, channels: out };
}
const loopOf = (b, seconds) => mix([{ buf: b, gain: 1 }, ...Array.from({ length: Math.ceil(seconds / (b.channels[0].length / SR)) }, (_, k) => ({ buf: b, gain: 1, at: (k + 1) * b.channels[0].length / SR }))], seconds);

// ---------------------------------------------------------------- report
const rows = [];
function row(group, name, m, extra = {}) { rows.push({ group, name, ...m, ...extra }); }

async function main() {
  const t0 = Date.now();
  const { bufs: S, layerMix } = await synth();
  const g = (k, d = 1) => man.sfx?.[k]?.gain ?? d;
  const L = (k) => man.loops?.[k]?.gain ?? 1;
  const files = (k) => man.sfx[k].files.map(file);

  if (!onlyMix) {
    for (const [k, e] of Object.entries(man.sfx)) for (const f of e.files) row('file:sfx', `${f} (x${e.gain})`, measure(file(f)));
    for (const [k, e] of Object.entries(man.loops)) row('file:loop', `${e.file} (x${e.gain})`, measure(file(e.file)));
    for (const [k, e] of Object.entries(man.music)) {
      const b = file(e.file);
      const s0 = Math.floor((e.loopStart ?? 0) * SR), s1 = e.loopEnd ? Math.floor(e.loopEnd * SR) : b.channels[0].length;
      row('file:music', `${e.file} (x${e.gain})`, measure({ sampleRate: SR, channels: b.channels.map((c) => c.subarray(s0, s1)) }));
    }
    // voices: a sample of the clips (all would take a while)
    const vdir = join(AUD, 'voice');
    const clips = readdirSync(vdir).filter((f) => /\.(m4a|mp3|wav|ogg)$/.test(f)).filter((_, i) => i % 15 === 0);
    for (const f of clips) row('file:voice', f, measure(decode(join(vdir, f))));
    for (const [name, b] of S) row('synth', name, measure(b));
  }

  // --write: per-file trims (dB) inside each sfx category, so every variant sits at the
  // category's median momentary loudness (clamped to +-6 dB); written into manifest.json
  if (args.includes('--write')) {
    for (const [k, e] of Object.entries(man.sfx)) {
      if (e.files.length < 2) { delete e.trim; continue; }
      const lv = e.files.map((f) => measure(file(f)).lufsM);
      const med = [...lv].sort((a, b) => a - b)[Math.floor(lv.length / 2)];
      e.trim = lv.map((v) => +Math.max(-6, Math.min(6, med - v)).toFixed(1));
      for (let i = 0; i < e.files.length; i++) {
        const t = Math.pow(10, e.trim[i] / 20), b = file(e.files[i]);
        cache.set(e.files[i], { sampleRate: SR, channels: b.channels.map((c) => c.map((v) => v * t)) });
      }
    }
    writeFileSync(join(AUD, 'manifest.json'), JSON.stringify(man, null, 2).replace(/\[\s*(-?[\d.]+(?:,\s*-?[\d.]+)*)\s*\]/g, (m, x) => `[${x.split(/,\s*/).join(', ')}]`) + '\n');
    console.error('manifest.json: per-file trims written');
  } else {
    // apply the manifest's trims, as Sound.loadSamples does
    for (const e of Object.values(man.sfx)) (e.trim ?? []).forEach((d, i) => { const t = Math.pow(10, d / 20), b = file(e.files[i]); cache.set(e.files[i], { sampleRate: SR, channels: b.channels.map((c) => c.map((v) => v * t)) }); });
  }


  // ---- in-game mix (gains from the code; distance: inverse model, gain = ref / d for d > ref)
  const pick = (arr, i = 0) => arr[i % arr.length];
  const synthArr = (k) => [...S.keys()].filter((n) => n.startsWith(`synth:${k}#`)).map((n) => S.get(n));
  const at = (ref, d) => Math.min(1, ref / d);
  const vGun = files('mg50_shot'), thump = synthArr('m2thump'), mech = synthArr('m2mech');
  const MIX = [];
  // Sound.playerGun (twin .50s, 13 rounds/s): m2 0.9 x mg50_shot, m2thump 1.15, m2mech 0.28
  MIX.push(['guns', 'player .50 burst (1 s)', mix(Array.from({ length: 13 }, (_, i) => [
    { buf: pick(vGun, i), gain: 0.9 * g('mg50_shot'), at: i / 13 }, { buf: pick(thump, i), gain: 1.15, at: i / 13 }, { buf: pick(mech, i), gain: 0.28, at: i / 13 },
  ]).flat(), 1.6), 'S']);
  // Sound.playerGun(cannon): cannon 1.0 x cannon_shot, m2thump 1.3 @0.72, m2mech 0.35 @0.8 (~10/s)
  MIX.push(['guns', 'player 20 mm burst (1 s)', mix(Array.from({ length: 10 }, (_, i) => [
    { buf: pick(files('cannon_shot'), i), gain: 1.0 * g('cannon_shot'), at: i / 10 }, { buf: pick(thump, i), gain: 1.3, at: i / 10, rate: 0.72 }, { buf: pick(mech, i), gain: 0.35, at: i / 10, rate: 0.8 },
  ]).flat(), 1.8), 'S']);
  // FighterDeath: explosion 1.6 x explosion_air, ref 160, typical kill range 350 m
  MIX.push(['explosions', 'kill explosion @350 m', mix([{ buf: pick(files('explosion_air')), gain: 1.6 * g('explosion_air') * at(160, 350) }], 4), 'M']);
  MIX.push(['explosions', 'flak close @100 m', mix([{ buf: pick(files('flak_burst')), gain: 1.5 * 1.2 * g('flak_burst') * at(60, 100) }], 3), 'M']);
  // HitSounds: body 0.34 + tick 0.2 (+ the positional impact, World: hit 0.35 x impact_metal, ref 60 @300 m)
  MIX.push(['feedback', 'hit feedback', mix([{ buf: S.get('hit:body#0'), gain: 0.34 }, { buf: S.get('hit:tick0'), gain: 0.2 }, { buf: pick(files('impact_metal')), gain: 0.35 * g('impact_metal') * at(60, 300) }], 1), 'M']);
  MIX.push(['feedback', 'kill feedback (HitSounds kill)', mix([{ buf: S.get('hit:kill#0'), gain: 0.55 }], 3), 'M']);
  MIX.push(['feedback', 'incoming hit (playerImpact)', mix([{ buf: pick(files('impact_metal')), gain: 1.0 * g('impact_metal') }], 1), 'M']);
  // Voice.ts: clip x VOICE_GAIN 1.35 through the radio chain (band-pass ~300-3400 Hz, drive): ~ -2 dB on speech
  const vclips = readdirSync(join(AUD, 'voice')).filter((f) => /\.m4a$/.test(f)).filter((_, i) => i % 25 === 0).map((f) => resample(decode(join(AUD, 'voice', f)), SR));
  MIX.push(['voice', 'crew voice (radio chain)', mix(vclips.map((b, i) => ({ buf: b, gain: 1.35 * Math.pow(10, -2 / 20), at: i * 3 })), vclips.length * 3), 'I']);
  // Sound.startAmbience/swapLoops/setMode: b17 cabin 0.8 + 0.45 (detuned copy) x b17 gain, bus 0.62, 4 engines (sputter 1.0)
  const b17 = file(man.loops.b17_interior.file);
  MIX.push(['engines', 'B-17 cabin drone (gunner)', mix([{ buf: b17, gain: 0.8 * L('b17_interior') * 0.62 }, { buf: b17, gain: 0.45 * L('b17_interior') * 0.62, rate: 1.006 }], 6), 'I']);
  // setPlayerEngine: (0.26 + 0.2 x throttle 0.8) x merlin gain, low-passed
  MIX.push(['engines', 'P-51 Merlin (pilot)', mix([{ buf: file(man.loops.merlin.file), gain: (0.26 + 0.16) * L('merlin') }], 6), 'I']);
  // updateFighterVoices: 0.65 x radial gain, ref 70 m, enemy at 250 m
  MIX.push(['engines', 'enemy radial @250 m', mix([{ buf: file(man.loops.radial_exterior.file), gain: 0.65 * L('radial_exterior') * at(70, 250), rate: 2.2 }], 5), 'I']);
  // music: track gain (music bus 1, before ducking); tension also plays at 0.6 when calm
  for (const k of ['menu', 'tension', 'combat', 'climax']) {
    const e = man.music[k];
    if (!e) continue;
    const b = file(e.file);
    const s0 = Math.floor((e.loopStart ?? 0) * SR), s1 = e.loopEnd ? Math.floor(e.loopEnd * SR) : b.channels[0].length;
    MIX.push(['music', `music: ${k}`, mix([{ buf: { sampleRate: SR, channels: b.channels.map((c) => c.subarray(s0, s1)) }, gain: e.gain }], (s1 - s0) / SR), 'I']);
  }
  // Music layers at full level (climax): drums 0.9, brass 0.75-1, strings 0.8 of LAYER_MIX
  const bar130 = 4 * 60 / 130;
  const climaxLayers = mix(Array.from({ length: 8 }, (_, k) => [
    { buf: S.get(k % 4 === 3 ? 'layer:climax:taiko_fill' : 'layer:climax:taiko_drive'), gain: 0.9 * layerMix.drums, at: k * bar130 },
    { buf: S.get(k % 2 ? 'layer:climax:brass_F' : 'layer:climax:brass_A'), gain: 0.85 * layerMix.brass, at: k * bar130 },
    { buf: S.get('layer:climax:strings_A'), gain: 0.8 * layerMix.strings, at: k * bar130 },
  ]).flat(), 8 * bar130);
  MIX.push(['music', 'music layers (climax, full)', climaxLayers, 'I']);
  const climaxPart = (name, mk) => MIX.push(['music', `  ${name}`, mix(Array.from({ length: 8 }, (_, k) => mk(k)), 8 * bar130), 'I']);
  climaxPart('climax drums', (k) => ({ buf: S.get(k % 4 === 3 ? 'layer:climax:taiko_fill' : 'layer:climax:taiko_drive'), gain: 0.9 * layerMix.drums, at: k * bar130 }));
  climaxPart('climax brass', (k) => ({ buf: S.get(k % 2 ? 'layer:climax:brass_F' : 'layer:climax:brass_A'), gain: 0.85 * layerMix.brass, at: k * bar130 }));
  climaxPart('climax strings', (k) => ({ buf: S.get('layer:climax:strings_A'), gain: 0.8 * layerMix.strings, at: k * bar130 }));
  const bar166 = 4 * 60 / 166;
  MIX.push(['music', 'music layers (combat drums 0.7)', mix(Array.from({ length: 8 }, (_, k) => ({ buf: S.get(k % 4 === 3 ? 'layer:combat:taiko_fill' : 'layer:combat:taiko_drive'), gain: 0.7 * layerMix.drums, at: k * bar166 })), 8 * bar166), 'I']);
  const bar83 = 4 * 60 / 83;
  MIX.push(['music', 'music layers (tension drums)', mix(Array.from({ length: 4 }, (_, k) => ({ buf: S.get('layer:tension:taiko_heart'), gain: 0.8 * layerMix.drums, at: k * bar83 })), 4 * bar83), 'I']);
  // ambience: wind loop x 0.3 (bomber), gusts ~1
  MIX.push(['ambience', 'wind (bomber)', mix([{ buf: file(man.loops.wind.file), gain: 0.3 }], 6), 'I']);
  // Creaks: clip gain 0.6 x LEVEL 0.45
  MIX.push(['ambience', 'creaks (groan)', mix([{ buf: S.get('creak:groan'), gain: 0.6 * 0.45 }], 3), 'M']);

  const mixRows = MIX.map(([grp, name, b, kind]) => {
    const m = measure(b);
    return { group: grp, name, kind, level: kind === 'S' ? m.lufsS : kind === 'M' ? m.lufsM : m.lufsI, ...m };
  });

  // ---- print
  const pad = (s, n) => String(s).padEnd(n), lp = (s, n) => String(s).padStart(n);
  if (!onlyMix) {
    console.log(`${pad('group', 11)} ${pad('name', 52)} ${lp('peak', 6)} ${lp('rms', 6)} ${lp('LUFS-I', 7)} ${lp('LUFS-M', 7)}`);
    for (const r of rows) console.log(`${pad(r.group, 11)} ${pad(r.name.slice(0, 52), 52)} ${lp(f1(r.peakDb), 6)} ${lp(f1(r.rmsDb), 6)} ${lp(f1(r.lufsI), 7)} ${lp(f1(r.lufsM), 7)}`);
    console.log('');
  }
  console.log('In-game mix (level: S = short-term max 3 s, M = momentary max 400 ms, I = integrated)');
  console.log(`${pad('group', 11)} ${pad('scenario', 34)} ${lp('peak', 6)} ${lp('level', 6)}`);
  for (const r of mixRows) console.log(`${pad(r.group, 11)} ${pad(r.name, 34)} ${lp(f1(r.peakDb), 6)} ${lp(f1(r.level), 6)} ${r.kind}`);
  const prev = opt('--compare') ? JSON.parse(readFileSync(opt('--compare'), 'utf8')) : null;
  if (prev) {
    console.log('\nBefore -> after (level)');
    for (const r of mixRows) { const p = prev.mix.find((x) => x.name === r.name); console.log(`${pad(r.name, 34)} ${lp(p ? f1(p.level) : 'n/a', 6)} -> ${lp(f1(r.level), 6)}`); }
  }
  if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify({ rows, mix: mixRows.map(({ group, name, kind, level, peakDb }) => ({ group, name, kind, level, peakDb })) }, null, 1));
  console.error(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

main().catch((e) => { console.error(e); process.exit(1); });

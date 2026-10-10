import { ENGINE_SPECS, airLowpass, cycloneMix, doppler, scrapeMix } from './Acoustics';
import { masterChain, type BufName } from './Sound';
import type { FieldName } from './SynthField';

// Dev measurements of the bookends' airfield sounds (swsSound.fieldCheck() in a dev build; no
// listening needed): each scenario is rendered in an OfflineAudioContext through the node types and
// parameters the game uses (the engine voice chain of Sound.updateFighterVoices with cycloneMix,
// the emitters of Field.ts with scrapeMix, the one-shot chain) with the listener at the origin, and
// measured: length, peak and RMS (dBFS), spectral centroid, non-finite samples, and for the passes
// the Doppler pitch ratio (strongest low partial approaching vs receding). The old radial voice
// (the Fw 190 taxi recording, sped up) is rendered next to the new B-17 voice for comparison.

export interface CheckRefs {
  radial: AudioBuffer; radialRate: number; voiceGain: number; recorded: boolean; volume: number;
  field: (n: FieldName) => AudioBuffer[]; gain: (n: BufName) => number;
}
export interface CheckRow { scenario: string; sec: number; peakDb: number; rmsDb: number; centroidHz: number; nonFinite: number; dopplerRatio?: number }

const SR = 48000;
const dB = (v: number) => (v > 0 ? +(20 * Math.log10(v)).toFixed(1) : -200);

// in-place radix-2 FFT
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const k = i + j + len / 2, vr = re[k] * cr - im[k] * ci, vi = re[k] * ci + im[k] * cr;
        re[k] = re[i + j] - vr; im[k] = im[i + j] - vi; re[i + j] += vr; im[i + j] += vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
// averaged power spectrum of the mono mix over [t0, t1)
function power(b: AudioBuffer, t0: number, t1: number, size: number) {
  const a = Math.floor(t0 * b.sampleRate), z = Math.min(b.length, Math.floor(t1 * b.sampleRate));
  const chs = Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));
  const pow = new Float64Array(size / 2), re = new Float64Array(size), im = new Float64Array(size);
  for (let s = a; s + size <= z || s === a; s += size) {
    for (let i = 0; i < size; i++) {
      let v = 0; for (const c of chs) { const x = c[s + i] ?? 0; if (Number.isFinite(x)) v += x; }
      re[i] = v * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1))); im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < size / 2; k++) pow[k] += re[k] * re[k] + im[k] * im[k];
    if (s + 2 * size > z) break;
  }
  return { pow, hz: b.sampleRate / size };
}
function stats(name: string, b: AudioBuffer): CheckRow {
  let pk = 0, ss = 0, bad = 0, n = 0;
  for (let c = 0; c < b.numberOfChannels; c++) for (const v of b.getChannelData(c)) { if (!Number.isFinite(v)) { bad++; continue; } pk = Math.max(pk, Math.abs(v)); ss += v * v; n++; }
  const { pow, hz } = power(b, 0, b.duration, 4096);
  let tot = 0, cen = 0;
  for (let k = 1; k < pow.length; k++) { tot += pow[k]; cen += pow[k] * k * hz; }
  return { scenario: name, sec: +b.duration.toFixed(2), peakDb: dB(pk), rmsDb: dB(Math.sqrt(ss / Math.max(1, n))), centroidHz: Math.round(cen / Math.max(1e-20, tot)), nonFinite: bad };
}
// frequency of the strongest partial in [lo, hi] Hz over [t0, t1)
function peakHz(b: AudioBuffer, t0: number, t1: number, lo: number, hi: number) {
  const { pow, hz } = power(b, t0, t1, 16384);
  let best = 0, f = 0;
  for (let k = Math.ceil(lo / hz); k <= Math.floor(hi / hz) && k < pow.length; k++) if (pow[k] > best) { best = pow[k]; f = k * hz; }
  return f;
}

type Path = (t: number) => [number, number, number, number, number, number];   // x y z vx vy vz
interface LoopSpec { buf: AudioBuffer; rate: (t: number, dop: number) => number; gain: (t: number) => number }
interface MoverSpec { path: Path; loops: LoopSpec[]; cutoff: (d: number, t: number) => number; gain: (t: number, d: number) => number; ref: number; rolloff: number; q?: number; at?: number; dur?: number }

// A moving looped source as the game builds it: loops -> [their gains] -> low-pass -> gain -> panner
function mover(oc: OfflineAudioContext, out: AudioNode, m: MoverSpec) {
  const f = oc.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = m.q ?? 1;
  const g = oc.createGain(); g.gain.value = 0;
  const p = oc.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = m.ref; p.rolloffFactor = m.rolloff; p.maxDistance = 10000;
  f.connect(g).connect(p).connect(out);
  const t0 = m.at ?? 0, t1 = Math.min(oc.length / SR, t0 + (m.dur ?? 1e9));
  const srcs = m.loops.map((l) => {
    const s = oc.createBufferSource(); s.buffer = l.buf; s.loop = true;
    const lg = oc.createGain(); lg.gain.value = 0;
    s.connect(lg).connect(f); s.start(t0, Math.random() * l.buf.duration); s.stop(t1);
    return { s, lg, l };
  });
  for (let t = t0; t < t1; t += 0.02) {
    const [x, y, z, vx, vy, vz] = m.path(t - t0), d = Math.max(0.5, Math.hypot(x, y, z));
    const dop = doppler(-(vx * x + vy * y + vz * z) / d);
    for (const { s, lg, l } of srcs) { s.playbackRate.setValueAtTime(l.rate(t - t0, dop), t); lg.gain.setValueAtTime(l.gain(t - t0), t); }
    f.frequency.setValueAtTime(Math.min(20000, m.cutoff(d, t - t0)), t);
    g.gain.setValueAtTime(m.gain(t - t0, d), t);
    p.positionX.setValueAtTime(x, t); p.positionY.setValueAtTime(y, t); p.positionZ.setValueAtTime(z, t);
  }
}
// A positional one-shot as Sound.shot() plays it
function shot(oc: OfflineAudioContext, out: AudioNode, buf: AudioBuffer | undefined, at: number, pos: [number, number, number], gain: number, ref: number) {
  if (!buf) return;
  const d = Math.hypot(...pos);
  const s = oc.createBufferSource(); s.buffer = buf;
  const f = oc.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = airLowpass(d);
  const g = oc.createGain(); g.gain.value = gain;
  const p = oc.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 1;
  p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2];
  s.connect(f).connect(g).connect(p).connect(out);
  s.start(at + d / 343);
}

async function render(sec: number, build: (oc: OfflineAudioContext, out: AudioNode) => void, master = 0) {
  const oc = new OfflineAudioContext(2, Math.floor(sec * SR), SR);
  let out: AudioNode = oc.destination;
  if (master > 0) { const [inp, o] = masterChain(oc); o.connect(oc.destination); const v = oc.createGain(); v.gain.value = master; v.connect(inp); out = v; }
  build(oc, out);
  return oc.startRendering();
}

export async function fieldCheck(R: CheckRefs) {
  const t0 = performance.now();
  const F = (n: FieldName, i = 0) => { const a = R.field(n); return a[i % Math.max(1, a.length)]; };
  const roar = F('eng_cycloneRoar'), idle = F('eng_cycloneIdle');
  if (!roar || !idle) return { error: 'airfield buffers not built' };
  const rows: CheckRow[] = [];
  const spec = ENGINE_SPECS.cyclone4;
  const engineCut = (base: number) => (d: number) => base * Math.max(0.3, Math.exp(-d / 2200)) + 160;
  // a full-power take-off roll passing 40 m from the runway-edge camera at 40 m/s, and a ship
  // ticking over / running up 30 m away
  const pass: Path = (t) => [-140 + 40 * t, 2, -40, 40, 0, 0];
  const still: Path = () => [20, 2, -22, 0, 0, 0];
  const oldVoice = (path: Path, thr: number): MoverSpec => ({
    path, ref: 70, rolloff: 1.1, q: 1.2, cutoff: engineCut(1600), gain: () => 0.65 * R.voiceGain,
    loops: [{ buf: R.radial, rate: (_t, dop) => (0.82 + thr * 0.22) * R.radialRate * dop, gain: () => 1 }],
  });
  const newVoice = (path: Path, thr: number, reduced = false): MoverSpec => {
    const cy = cycloneMix(thr), idleMain = reduced && thr < 0.6;
    return {
      path, ref: 70, rolloff: 1.1, q: 1.2, cutoff: engineCut(spec.cutoff * cy.bright),
      gain: () => 0.65 * spec.gain * (reduced ? (idleMain ? spec.aux * Math.max(cy.idle, 0.5) : Math.max(cy.roar, 0.3)) : 1),
      loops: reduced ? [{ buf: idleMain ? idle : roar, rate: (_t, dop) => (idleMain ? cy.idleRate : cy.roarRate) * dop, gain: () => 1 }]
        : [{ buf: roar, rate: (_t, dop) => cy.roarRate * dop, gain: () => cy.roar }, { buf: idle, rate: (_t, dop) => cy.idleRate * dop, gain: () => spec.aux * cy.idle }],
    };
  };
  const passRow = async (name: string, m: MoverSpec, band: [number, number]) => {
    const b = await render(7, (oc, out) => mover(oc, out, m));
    const r = stats(name, b);
    r.dopplerRatio = +(peakHz(b, 0.2, 1.6, ...band) / Math.max(1, peakHz(b, 5.4, 6.8, ...band))).toFixed(3);
    rows.push(r);
  };
  await passRow('engines: OLD radial voice, full-power pass at 40 m', oldVoice(pass, 1), [60, 400]);
  await passRow('engines: NEW B-17 voice, full-power pass at 40 m', newVoice(pass, 1), [50, 110]);
  await passRow('engines: NEW B-17 voice (Reduced), full-power pass', newVoice(pass, 1, true), [50, 110]);
  for (const [name, m] of [
    ['engines: OLD radial voice, taxiing at 30 m (thr 0.36)', oldVoice(still, 0.36)],
    ['engines: NEW B-17 voice, taxiing at 30 m (thr 0.36)', newVoice(still, 0.36)],
    ['engines: NEW B-17 voice, run-up at 30 m (thr 0.75)', newVoice(still, 0.75)],
    ['engines: NEW B-17 voice (Reduced), taxiing at 30 m', newVoice(still, 0.36, true)],
  ] as [string, MoverSpec][]) rows.push(stats(name, await render(3, (oc, out) => mover(oc, out, m))));

  // touchdown 60 m away (Field.touchdown gains x SYNTH_GAIN; Normal adds the gear thump)
  const td = (hard: boolean, layers: boolean) => (oc: OfflineAudioContext, out: AudioNode) => {
    shot(oc, out, F('tyreChirp', hard ? 1 : 0), 0.05, [55, 1, -24], (hard ? 1.15 : 0.85) * R.gain('tyreChirp'), 25);
    if (layers) shot(oc, out, F('gearThump'), 0.05, [55, 1, -24], (hard ? 1.1 : 0.65) * R.gain('gearThump'), 30);
  };
  rows.push(stats('touchdown at 60 m: tyre chirps + gear thump', await render(1.2, td(false, true))));
  rows.push(stats('touchdown at 60 m (Reduced): tyre chirps only', await render(1.2, td(false, false))));

  // belly landing: impact, then the slide from 46 m/s at 5 m/s/s, passing ~50 m from the camera
  const vAt = (t: number) => Math.max(0, 46 - 5 * t);
  const xAt = (t: number) => -150 + 46 * Math.min(t, 9.2) - 2.5 * Math.min(t, 9.2) ** 2;
  const slide: Path = (t) => [xAt(t), 1.7, -50, vAt(t), 0, 0];
  const belly = (layers: boolean) => (oc: OfflineAudioContext, out: AudioNode) => {
    shot(oc, out, F('bellyImpact'), 0.02, [-150, 1.7, -50], 0.95 * R.gain('bellyImpact'), 90);
    if (layers) shot(oc, out, F('gearThump'), 0.02, [-150, 1.7, -50], 0.9 * R.gain('gearThump'), 30);
    const em = (n: FieldName, g: (m: ReturnType<typeof scrapeMix>) => number, rate: (m: ReturnType<typeof scrapeMix>) => number, lp: (m: ReturnType<typeof scrapeMix>) => number, ref: number) =>
      mover(oc, out, { path: slide, ref, rolloff: 1, at: 0.05, cutoff: (d, t) => Math.min(lp(scrapeMix(vAt(t))), airLowpass(d)), gain: (t) => g(scrapeMix(vAt(t))), loops: [{ buf: F(n), rate: (t, dop) => rate(scrapeMix(vAt(t))) * dop, gain: () => 1 }] });
    em('scrapeGrind', (m) => 0.85 * m.grind, (m) => m.rate, (m) => m.lp, 45);
    if (layers) {
      em('scrapeSparks', (m) => 0.55 * m.sparks, (m) => 0.9 + 0.2 * m.rate, () => 18000, 30);
      em('scrapeRumble', (m) => 0.75 * m.rumble, (m) => 0.85 + 0.2 * m.rate, () => 18000, 60);
    }
  };
  rows.push(stats('belly landing at ~50 m: impact + grind/sparks/rumble (10 s)', await render(10, belly(true))));
  rows.push(stats('belly landing (Reduced): impact + grind', await render(10, belly(false))));

  // Very pistol: the pop and the flare's hiss climbing away (life 4.2 s), close and from the tower
  const flare = (dist: number) => (oc: OfflineAudioContext, out: AudioNode) => {
    shot(oc, out, F('flarePop'), 0.02, [0, 3, -dist], 1.3 * R.gain('flarePop'), 20);
    const fp: Path = (t) => [9 * t, 3 + 32 * t - 2.45 * t * t, -dist + 40 * t, 9, 32 - 4.9 * t, 40];
    mover(oc, out, { path: fp, ref: 22, rolloff: 1, at: 0.03, dur: 4.2, cutoff: (d) => airLowpass(d), gain: (t) => 1.1 * Math.min(1, Math.max(0, (4.2 - t) / 1.2)), loops: [{ buf: F('flareHiss'), rate: (_t, dop) => dop, gain: () => 1 }] });
  };
  rows.push(stats('Very pistol at 30 m: pop + rising hiss', await render(5, flare(30))));
  rows.push(stats('Very pistol from the tower (~350 m)', await render(5, flare(350))));

  // crash-crew bells racing past 15 m away at 19 m/s
  const bell = (n: FieldName, i: number, g: number, ref: number): ((oc: OfflineAudioContext, out: AudioNode) => void) => (oc, out) =>
    mover(oc, out, { path: (t) => [-57 + 19 * t, 1.5, -15, 19, 0, 0], ref, rolloff: 1, cutoff: (d) => airLowpass(d), gain: () => g, loops: [{ buf: F(n, i), rate: (_t, dop) => dop, gain: () => 1 }] });
  for (const [name, b] of [
    ['fire tender bell passing at 15 m, 19 m/s', bell('fireBell', 0, 1, 22)],
    ['crash truck bell passing at 15 m', bell('fireBell', 1, 1, 22)],
    ['ambulance bell passing at 15 m', bell('ambulanceBell', 0, 0.7, 16)],
  ] as [string, (oc: OfflineAudioContext, out: AudioNode) => void][]) {
    const buf = await render(6, b);
    const r = stats(name, buf);
    r.dopplerRatio = +(peakHz(buf, 0.4, 2, 400, 2000) / Math.max(1, peakHz(buf, 4, 5.8, 400, 2000))).toFixed(3);
    rows.push(r);
  }

  // the whole belly-landing moment through the master chain at the game volume
  const mix = await render(10, (oc, out) => {
    belly(true)(oc, out);
    bell('fireBell', 0, 1, 22)(oc, out); bell('ambulanceBell', 0, 0.7, 16)(oc, out);
    mover(oc, out, newVoice(still, 0.36));
  }, R.volume || 0.8);
  rows.push(stats('belly landing + bells + taxiing B-17, through the master chain', mix));
  return { recordedRadial: R.recorded, ms: Math.round(performance.now() - t0), rows };
}

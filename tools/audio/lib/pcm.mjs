// PCM helpers for the node audio tools: decode any file the game ships (mp3 / wav / m4a)
// to float32, write WAV, encode, and measure peak, RMS and ITU-R BS.1770-4 loudness.
// Decoding uses ffmpeg when it is on PATH (or $FFMPEG), else macOS `afconvert`.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';

const which = (cmd) => {
  try { return execFileSync('/usr/bin/which', [cmd], { encoding: 'utf8' }).trim() || null; } catch { return null; }
};
export const FFMPEG = process.env.FFMPEG || which('ffmpeg');
export const AFCONVERT = existsSync('/usr/bin/afconvert') ? '/usr/bin/afconvert' : null;

let tmp = null;
const tmpFile = (name) => {
  if (!tmp) { tmp = mkdtempSync(join(tmpdir(), 'sws-audio-')); process.on('exit', () => rmSync(tmp, { recursive: true, force: true })); }
  return join(tmp, name);
};

// Parse a RIFF/WAVE file (PCM 16/24/32 or IEEE float 32) into per-channel Float32Arrays
export function parseWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
  let p = 12, fmt = null, data = null;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    const body = p + 8;
    if (id === 'fmt ') {
      let format = buf.readUInt16LE(body);
      const channels = buf.readUInt16LE(body + 2), sampleRate = buf.readUInt32LE(body + 4), bits = buf.readUInt16LE(body + 14);
      if (format === 0xfffe) format = buf.readUInt16LE(body + 24); // WAVE_FORMAT_EXTENSIBLE: sub-format GUID
      fmt = { format, channels, sampleRate, bits };
    } else if (id === 'data') {
      data = buf.subarray(body, Math.min(buf.length, body + size));
    }
    p = body + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('WAV without fmt/data');
  const { format, channels, sampleRate, bits } = fmt;
  const bps = bits / 8, frames = Math.floor(data.length / (bps * channels));
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const o = (i * channels + c) * bps;
      let v;
      if (format === 3 && bits === 32) v = data.readFloatLE(o);
      else if (format === 3 && bits === 64) v = data.readDoubleLE(o);
      else if (bits === 16) v = data.readInt16LE(o) / 32768;
      else if (bits === 24) v = data.readIntLE(o, 3) / 8388608;
      else if (bits === 32) v = data.readInt32LE(o) / 2147483648;
      else throw new Error(`unsupported WAV: format ${format}, ${bits} bit`);
      out[c][i] = v;
    }
  }
  return { sampleRate, channels: out };
}

// Float32 WAV (IEEE float) from per-channel arrays
export function wavBytes(channels, sampleRate) {
  const ch = channels.length, n = channels[0].length;
  const b = Buffer.alloc(44 + n * ch * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * ch * 4, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(ch, 22);
  b.writeUInt32LE(sampleRate, 24); b.writeUInt32LE(sampleRate * ch * 4, 28); b.writeUInt16LE(ch * 4, 32); b.writeUInt16LE(32, 34);
  b.write('data', 36); b.writeUInt32LE(n * ch * 4, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { b.writeFloatLE(channels[c][i], o); o += 4; }
  return b;
}

// Decode any audio file to { sampleRate, channels }
export function decode(path) {
  if (extname(path).toLowerCase() === '.wav') {
    try { return parseWav(readFileSync(path)); } catch { /* compressed WAV: fall through */ }
  }
  const out = tmpFile(`d${Math.random().toString(36).slice(2)}.wav`);
  if (FFMPEG) execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', path, '-c:a', 'pcm_f32le', out]);
  else if (AFCONVERT) execFileSync(AFCONVERT, ['-f', 'WAVE', '-d', 'LEF32', path, out]);
  else throw new Error('no decoder: install ffmpeg (or run on macOS for afconvert)');
  const r = parseWav(readFileSync(out));
  rmSync(out, { force: true });
  return r;
}

// Encode float PCM to a compressed file the browser can decode. .m4a (AAC) via ffmpeg or
// afconvert; .mp3 needs ffmpeg with libmp3lame.
export function encode(channels, sampleRate, path, kbps = 112) {
  const wav = tmpFile(`e${Math.random().toString(36).slice(2)}.wav`);
  writeFileSync(wav, wavBytes(channels, sampleRate));
  const ext = extname(path).toLowerCase();
  if (FFMPEG) {
    const codec = ext === '.mp3' ? ['-c:a', 'libmp3lame', '-b:a', `${kbps}k`] : ['-c:a', 'aac', '-b:a', `${kbps}k`];
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', wav, '-map_metadata', '-1', ...codec, path]);
  } else if (AFCONVERT && ext === '.m4a') {
    execFileSync(AFCONVERT, ['-f', 'm4af', '-d', 'aac', '-b', String(kbps * 1000), '-q', '127', wav, path]);
  } else throw new Error(`cannot encode ${ext} without ffmpeg`);
  rmSync(wav, { force: true });
}

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const lufsOf = (ms) => (ms > 0 ? -0.691 + 10 * Math.log10(ms) : -Infinity);

// BS.1770 K-weighting: high-shelf pre-filter + RLB high-pass, any sample rate
// (the libebur128 derivation, exact at 48 kHz and close at other rates)
function kCoefs(sr) {
  const shelf = (() => {
    const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
    const K = Math.tan(Math.PI * f0 / sr), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
    const a0 = 1 + K / Q + K * K;
    return { b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0],
      a: [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
  })();
  const hp = (() => {
    const f0 = 38.13547087602444, Q = 0.5003270373238773;
    const K = Math.tan(Math.PI * f0 / sr), a0 = 1 + K / Q + K * K;
    return { b: [1, -2, 1], a: [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
  })();
  return [shelf, hp];
}
function biquad(x, { b, a }) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

// Peak (dBFS), RMS (dBFS, all channels), integrated loudness (LUFS, gated), max momentary
// (400 ms) and max short-term (3 s) loudness. Short clips are padded with silence to one block.
export function measure({ sampleRate: sr, channels }) {
  const n = channels[0].length;
  let peak = 0, sq = 0;
  for (const c of channels) for (let i = 0; i < n; i++) { const v = Math.abs(c[i]); if (v > peak) peak = v; sq += c[i] * c[i]; }
  const rms = Math.sqrt(sq / Math.max(1, n * channels.length));
  const [f1, f2] = kCoefs(sr);
  const blk = Math.round(0.4 * sr), hop = Math.round(0.1 * sr);
  const len = Math.max(n, blk);
  // per-channel K-weighted squares, prefix-summed so any window is O(1)
  const cum = new Float64Array(len + 1);
  for (const c of channels) {
    const padded = new Float32Array(len); padded.set(c);
    const k = biquad(biquad(padded, f1), f2);
    let s = 0;
    for (let i = 0; i < len; i++) { s += k[i] * k[i]; cum[i + 1] += s; }
  }
  const win = (a, b) => (cum[b] - cum[a]) / (b - a);
  const blocks = [];
  for (let s = 0; s + blk <= len; s += hop) blocks.push(win(s, s + blk));
  let mMax = -Infinity;
  for (const z of blocks) mMax = Math.max(mMax, lufsOf(z));
  const st = Math.round(3 * sr);
  let sMax = -Infinity;
  if (len >= st) for (let s = 0; s + st <= len; s += hop) sMax = Math.max(sMax, lufsOf(win(s, s + st)));
  else sMax = lufsOf(win(0, len) * len / st);
  // gating: absolute -70 LUFS, then relative -10 LU
  const abs = blocks.filter((z) => lufsOf(z) > -70);
  let lufsI = -Infinity;
  if (abs.length) {
    const rel = lufsOf(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
    const g = abs.filter((z) => lufsOf(z) > rel);
    if (g.length) lufsI = lufsOf(g.reduce((a, b) => a + b, 0) / g.length);
  }
  return { peakDb: db(peak), rmsDb: db(rms), lufsI, lufsM: mMax, lufsS: sMax, seconds: n / sr };
}

// Mono mix-down
export function mono({ channels }) {
  const n = channels[0].length, m = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) m[i] += c[i] / channels.length;
  return m;
}

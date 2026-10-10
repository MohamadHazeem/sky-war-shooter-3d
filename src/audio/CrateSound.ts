// Loot crate sounds, synthesized: wooden knocks while the crate shakes (faster and faster),
// a burst (noise whoosh + low thump) when it breaks open, and a chime whose length and
// brightness grow with the item's rarity; a legendary item adds the medal fanfare.
import type { Sound } from './Sound';
import type { Rarity } from '../game/WeaponMods';
import { playMedalFanfare } from './Fanfare';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function bus(sound: Sound): [AudioContext, AudioNode] | null {
  const ctx = sound.ctx, out = sound.sfxBus();
  if (!ctx || !out || ctx.state === 'closed') return null;
  return [ctx, out];
}

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: AudioContext) {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (noiseBuf = b);
}

function burstNoise(ctx: AudioContext, out: AudioNode, when: number, dur: number, type: BiquadFilterType, f0: number, f1: number, peak: number, q = 1) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, when);
  f.frequency.exponentialRampToValueAtTime(f1, when + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + Math.min(0.01, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(f).connect(g).connect(out);
  src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
  src.start(when, Math.random() * 0.5);
  src.stop(when + dur + 0.02);
}

function tone(ctx: AudioContext, out: AudioNode, type: OscillatorType, freq: number, when: number, dur: number, peak: number, slideTo?: number) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, when);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, when + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g).connect(out);
  o.onended = () => { o.disconnect(); g.disconnect(); };
  o.start(when);
  o.stop(when + dur + 0.02);
}

// Wooden knocks over `dur` seconds, accelerating
export function crateShake(sound: Sound, dur = 1.1) {
  const b = bus(sound); if (!b) return;
  const [ctx, out] = b;
  const t0 = ctx.currentTime + 0.02;
  let t = 0, gap = 0.22;
  while (t < dur) {
    burstNoise(ctx, out, t0 + t, 0.07, 'bandpass', 420 + Math.random() * 260, 240, 0.32 + 0.25 * (t / dur), 3);
    tone(ctx, out, 'triangle', 150 + Math.random() * 40, t0 + t, 0.06, 0.12);
    t += gap; gap = Math.max(0.06, gap * 0.8);
  }
}

export function crateBurst(sound: Sound) {
  const b = bus(sound); if (!b) return;
  const [ctx, out] = b;
  const t = ctx.currentTime + 0.01;
  burstNoise(ctx, out, t, 0.55, 'highpass', 400, 5000, 0.5, 0.7);     // whoosh
  burstNoise(ctx, out, t, 0.18, 'lowpass', 1800, 200, 0.7, 0.8);      // splintering crack
  tone(ctx, out, 'sine', 95, t, 0.45, 0.6, 38);                        // thump
}

// Bell-like chime; rarer items ring longer, higher, with more notes
export function crateReveal(sound: Sound, rarity: Rarity) {
  const b = bus(sound); if (!b) return;
  const [ctx, out] = b;
  const t0 = ctx.currentTime + 0.02;
  const notes: Record<Rarity, number[]> = {
    common: [72, 79],
    rare: [72, 76, 79, 84],
    epic: [71, 74, 78, 83, 86],
    legendary: [72, 76, 79, 84, 88, 91],
  };
  const seq = notes[rarity];
  seq.forEach((m, i) => {
    const t = t0 + i * 0.085, f = mtof(m), d = i === seq.length - 1 ? 1.3 : 0.5;
    tone(ctx, out, 'sine', f, t, d, 0.16);
    tone(ctx, out, 'triangle', f * 2.01, t, d * 0.6, 0.05);
    tone(ctx, out, 'sine', f * 3.98, t, d * 0.3, 0.025);
  });
  if (rarity === 'epic' || rarity === 'legendary') burstNoise(ctx, out, t0 + 0.05, 1.2, 'highpass', 6000, 9000, 0.06, 0.5); // shimmer
  if (rarity === 'legendary') playMedalFanfare(sound, 0.55, 1);
}

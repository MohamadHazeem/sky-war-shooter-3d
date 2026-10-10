// Short synthesised cues for the player's active abilities (src/game/Abilities.ts): one
// crisp, distinct sound per ability when it is used, a soft ping when one comes off
// cooldown and a dull tick when the key is pressed too early. Built on the fly through the
// sfx bus (event-driven, a handful of nodes per cue; every node is freed when it ends).
import { sound } from './Sound';
import { freeOnEnd } from './Safe';

export type AbilityCue = 'mustangs' | 'overdrive' | 'focus';

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const n = Math.floor(ctx.sampleRate * 0.6);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = b;
  return b;
}

// One enveloped oscillator: type, frequency glide f0 -> f1 over dur, peak gain, attack
function tone(ctx: AudioContext, out: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, attack = 0.005) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + dur + 0.02);
  freeOnEnd(o, [g]);
}

// Filtered noise burst (click/whoosh), band-pass sweeping f0 -> f1
function hiss(ctx: AudioContext, out: AudioNode, t: number, f0: number, f1: number, dur: number, peak: number, q = 1.2, attack = 0.003) {
  const s = ctx.createBufferSource();
  s.buffer = noise(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(bp).connect(g).connect(out);
  s.start(t); s.stop(t + dur + 0.02);
  freeOnEnd(s, [bp, g]);
}

function bus(): { ctx: AudioContext; out: GainNode; t: number } | null {
  const ctx = sound.ctx, out = sound.sfxBus();
  if (!ctx || !out || ctx.state !== 'running') return null;
  return { ctx, out, t: ctx.currentTime + 0.01 };
}

export function playAbilityCue(kind: AbilityCue) {
  const b = bus();
  if (!b) return;
  const { ctx, out, t } = b;
  if (kind === 'mustangs') {
    // radio squelch, then a bright rising two-note call (a bugle-like "charge")
    hiss(ctx, out, t, 2600, 1800, 0.07, 0.35, 2);
    tone(ctx, out, t + 0.05, 'triangle', 523, 523, 0.16, 0.3);
    tone(ctx, out, t + 0.05, 'sine', 1046, 1046, 0.12, 0.08);
    tone(ctx, out, t + 0.2, 'triangle', 784, 784, 0.34, 0.32);
    tone(ctx, out, t + 0.2, 'sine', 1568, 1568, 0.26, 0.08);
    hiss(ctx, out, t + 0.5, 3000, 600, 0.6, 0.06, 0.6, 0.2); // distant engines diving in
  } else if (kind === 'overdrive') {
    // metallic bolt slam plus a fast charging whine
    hiss(ctx, out, t, 4200, 2500, 0.05, 0.6, 3);
    tone(ctx, out, t, 'square', 140, 70, 0.09, 0.22);
    tone(ctx, out, t + 0.03, 'sawtooth', 240, 1500, 0.32, 0.12, 0.02);
    tone(ctx, out, t + 0.03, 'sine', 480, 2600, 0.36, 0.08, 0.03);
  } else {
    // focus: a deep "drop" as time slows, and a glassy ping that rings on
    tone(ctx, out, t, 'sine', 180, 45, 0.55, 0.55, 0.01);
    hiss(ctx, out, t, 1600, 200, 0.5, 0.18, 0.8, 0.04);
    tone(ctx, out, t + 0.04, 'sine', 1975, 1975, 1.4, 0.07, 0.01);
    tone(ctx, out, t + 0.04, 'sine', 2963, 2963, 0.9, 0.035, 0.01);
  }
}

// An ability is ready again: soft high double ping
export function playAbilityReady() {
  const b = bus();
  if (!b) return;
  tone(b.ctx, b.out, b.t, 'sine', 1320, 1320, 0.14, 0.07);
  tone(b.ctx, b.out, b.t + 0.09, 'sine', 1980, 1980, 0.22, 0.06);
}

// Pressed while still recharging: a dull low tick
export function playAbilityDenied() {
  const b = bus();
  if (!b) return;
  tone(b.ctx, b.out, b.t, 'square', 110, 90, 0.07, 0.07);
}

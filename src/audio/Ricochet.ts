import * as THREE from 'three';
import { sound } from './Sound';

// Ricochets: a round skipping off airframe skin gives a short falling whine (pitch glides
// from ~2.5 kHz down to ~1.2 kHz as the bullet tumbles away) over a brief noise crack.
// Only some hits ring out, and a small gap stops a burst of rounds from stacking into noise.
const CHANCE = 0.3;
const MIN_GAP = 0.09;      // seconds between ricochets
const SECONDS = 0.42;
const GLIDE = 0.3;         // seconds for the pitch glide

let bufs: AudioBuffer[] | null = null;
let lastAt = -Infinity;

function make(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(SECONDS * sr);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  // slight per-variant detuning so repeated ricochets don't sound identical
  const f0 = 2500 * (1 + (Math.random() * 2 - 1) * 0.05);
  const f1 = 1200 * (1 + (Math.random() * 2 - 1) * 0.05);
  // exponential glide f(t) = f0 * r^(t/GLIDE); its integral gives the phase in closed form
  const r = f1 / f0;
  const k = 2 * Math.PI * f0 * GLIDE / Math.log(r);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const attack = Math.min(1, t * 400);
    const whine = Math.sin(k * (Math.pow(r, t / GLIDE) - 1)) * 0.55 * attack * Math.exp(-t * 7);
    // smoothed noise gives the crack of the strike
    lp += (Math.random() * 2 - 1 - lp) * 0.5;
    const crack = lp * Math.exp(-t * 38) * 0.8;
    d[i] = whine + crack;
  }
  let m = 0;
  for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) for (let i = 0; i < n; i++) d[i] *= 0.9 / m;
  return buf;
}

// Called for each player round that hits an enemy aircraft; rolls the chance itself.
export function playRicochet(pos: THREE.Vector3) {
  if (Math.random() > CHANCE) return;
  const ctx = sound.ctx;
  if (!ctx) return;
  const now = ctx.currentTime;
  if (now >= lastAt && now - lastAt < MIN_GAP) return; // (a rebuilt context restarts its clock at 0)
  lastAt = now;
  if (!bufs) bufs = [make(ctx), make(ctx), make(ctx)];
  sound.playBuffer(bufs[Math.floor(Math.random() * bufs.length)], pos, { gain: 0.3, ref: 60, delay: false });
}

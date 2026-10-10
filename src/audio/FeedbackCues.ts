import { sound } from './Sound';

// Small synthesized UI cues for combat feedback (GameFeel / CombatFeedback): built once on
// first use, not tied to an AudioContext, played un-positioned through Sound's sfx chain.
//   warn     "lining up on you": two short, slightly detuned square-ish pips
//   ignite   going ON FIRE: a rising breathy whoosh over a soft low thump
//   douse    the fire put out by a heavy hit: a short falling hiss

const SR = 44100;
const TAU = Math.PI * 2;
type Cue = 'warn' | 'ignite' | 'douse';
const bufs = new Map<Cue, AudioBuffer>();

function make(seconds: number, fn: (t: number) => number, peak: number): AudioBuffer {
  const n = Math.floor(seconds * SR);
  const b = new AudioBuffer({ length: n, numberOfChannels: 1, sampleRate: SR });
  const d = b.getChannelData(0);
  let m = 0;
  for (let i = 0; i < n; i++) { d[i] = fn(i / SR); m = Math.max(m, Math.abs(d[i])); }
  if (m > 0) for (let i = 0; i < n; i++) d[i] *= peak / m;
  const f = Math.min(n, Math.floor(0.008 * SR));
  for (let i = 0; i < f; i++) d[n - 1 - i] *= i / f;
  return b;
}

function build(c: Cue): AudioBuffer {
  if (c === 'warn') {
    return make(0.26, (t) => {
      // two 70 ms pips, 110 ms apart; soft-clipped sine + third harmonic reads as a buzzer
      const p = t < 0.07 ? t : t >= 0.11 && t < 0.18 ? t - 0.11 : -1;
      if (p < 0) return 0;
      const env = Math.min(1, p / 0.004) * Math.min(1, (0.07 - p) / 0.01);
      const f = t < 0.1 ? 1180 : 1250;
      const s = Math.sin(TAU * f * p) + 0.35 * Math.sin(TAU * f * 3 * p);
      return Math.tanh(s * 1.6) * env;
    }, 0.9);
  }
  if (c === 'ignite') {
    let lp = 0, bp = 0;
    return make(0.9, (t) => {
      // band-passed noise whose centre sweeps up (SVF), plus a low thump at the start
      const fc = 300 + 2600 * Math.pow(t / 0.9, 1.6);
      const f = 2 * Math.sin(Math.PI * fc / SR);
      const hp = (Math.random() * 2 - 1) - lp - 0.9 * bp;
      bp += f * hp; lp += f * bp;
      const env = Math.min(1, t / 0.35) * Math.exp(-Math.max(0, t - 0.55) * 9);
      const thump = Math.sin(TAU * (70 - 30 * t) * t) * Math.exp(-t * 9) * 1.4;
      return bp * env + thump;
    }, 0.85);
  }
  let lp = 0, bp = 0;
  return make(0.5, (t) => {
    const fc = 2400 - 1900 * (t / 0.5);
    const f = 2 * Math.sin(Math.PI * fc / SR);
    const hp = (Math.random() * 2 - 1) - lp - 1.1 * bp;
    bp += f * hp; lp += f * bp;
    return bp * Math.min(1, t / 0.02) * Math.exp(-t * 6);
  }, 0.7);
}

export function playCue(c: Cue, gain: number) {
  if (!sound.ctx) return;
  let b = bufs.get(c);
  if (!b) { b = build(c); bufs.set(c, b); }
  sound.playBuffer(b, null, { gain, delay: false });
}

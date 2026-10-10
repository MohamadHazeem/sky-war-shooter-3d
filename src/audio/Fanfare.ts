// Medal fanfare for the debrief: a short synthesized brass phrase played as each medal
// badge animates in. Two detuned sawtooths and a sine fundamental go through a lowpass
// whose cutoff starts closed and blooms open on each note, which is what makes it read
// as brass rather than a synth lead. The attack is soft (~70 ms) so nothing clicks.
import type { Sound } from './Sound';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// Rising D major figure (D4, A4, D5), the top note held. Times are seconds from the start.
const PHRASE = [
  { m: 62, t: 0, d: 0.2 },
  { m: 69, t: 0.18, d: 0.2 },
  { m: 74, t: 0.36, d: 0.9 },
];

function brassNote(ctx: AudioContext, out: AudioNode, midi: number, when: number, dur: number, peak: number) {
  const f = mtof(midi);
  const end = when + dur;

  // Bloom: the filter opens over the first ~100 ms, then settles to a warm tone
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.1;
  lp.frequency.setValueAtTime(f * 1.5, when);
  lp.frequency.exponentialRampToValueAtTime(f * 7, when + 0.1);
  lp.frequency.setTargetAtTime(f * 3, when + 0.1, 0.3);

  // Envelope: soft attack, slight decay to a sustain level, quick release at the end
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(peak, when + 0.07);
  env.gain.setTargetAtTime(peak * 0.8, when + 0.07, 0.25);
  env.gain.setTargetAtTime(0.0001, end, 0.06);
  lp.connect(env).connect(out);

  // Vibrato that comes in late, as a real player's would
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.5;
  const lfoG = ctx.createGain();
  lfoG.gain.setValueAtTime(0, when);
  lfoG.gain.linearRampToValueAtTime(9, when + 0.35);
  lfo.connect(lfoG);

  const voices: [OscillatorType, number, number][] = [
    ['sawtooth', -8, 0.45],
    ['sawtooth', 8, 0.45],
    ['sine', 0, 0.35],
  ];
  for (const [type, cents, level] of voices) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = cents;
    lfoG.connect(o.detune);
    const g = ctx.createGain();
    g.gain.value = level;
    o.connect(g).connect(lp);
    o.start(when);
    o.stop(end + 0.5);
  }
  lfo.start(when);
  lfo.stop(end + 0.5);
}

/**
 * Plays the fanfare once, `delay` seconds from now. `step` transposes it up a tone per
 * step (capped), so each medal in a debrief sounds a little more triumphant than the last.
 * Silently does nothing before the audio context exists or when the bus is unavailable.
 */
export function playMedalFanfare(sound: Sound, delay: number, step: number) {
  const ctx = sound.ctx;
  const out = sound.sfxBus();
  if (!ctx || !out || ctx.state === 'closed') return;
  const t0 = ctx.currentTime + Math.max(0, delay);
  const shift = Math.min(Math.max(0, step), 4) * 2;
  PHRASE.forEach((n, i) => brassNote(ctx, out, n.m + shift, t0 + n.t, n.d, i === PHRASE.length - 1 ? 0.13 : 0.11));
}

// Spatial audio 2.0 (Phase 11 · 17): the Web Audio pieces Sound.ts owns. The maths is in Spatial2.ts.
//  - HarmonicBank: a few sine partials per engine (blade-pass, its double, firing order) that track
//    the rpm under the recorded engine loops; one stereo position per engine
//  - RumbleBed: the distant flak barrage's low rolling bed (brown noise, low-passed by distance)
//  - RoomChain: pre-delay and damping in front of the interior reverb, re-voiced per compartment
import { FREQ, GAIN, towards } from './Safe';
import { ROOMS, type Compartment } from './Spatial2';

const PARTIALS = 3;

export class HarmonicBank {
  private oscs: OscillatorNode[] = [];
  private gains: GainNode[] = [];
  readonly out: GainNode;
  private on = false;
  // pans: one entry per engine (-1..1); level: overall gain at full load
  constructor(private ctx: AudioContext, dest: AudioNode, pans: readonly number[], private level: number, lp = 900) {
    this.out = ctx.createGain(); this.out.gain.value = 0;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 0.5;
    this.out.connect(f).connect(dest);
    for (const pv of pans) {
      const p = ctx.createStereoPanner(); p.pan.value = pv; p.connect(this.out);
      for (let k = 0; k < PARTIALS; k++) {
        const o = ctx.createOscillator(); o.type = k === 2 ? 'triangle' : 'sine'; o.frequency.value = 60 * (k + 1);
        const g = ctx.createGain(); g.gain.value = 0;
        o.connect(g).connect(p); o.start();
        this.oscs.push(o); this.gains.push(g);
      }
    }
  }
  get engines() { return this.oscs.length / PARTIALS; }
  setActive(on: boolean) {
    if (on === this.on) return;
    this.on = on;
    towards(this.out.gain, on ? this.level : 0, GAIN, this.ctx.currentTime, on ? 0.5 : 0.15);
  }
  // engine i: partial frequencies and gains (0..1), rate: per-engine speed trim (beats between engines)
  set(i: number, freqs: ArrayLike<number>, gains: ArrayLike<number>, rate = 1, tc = 0.25) {
    const t = this.ctx.currentTime, b = i * PARTIALS;
    if (b + PARTIALS > this.oscs.length) return;
    for (let k = 0; k < PARTIALS; k++) {
      towards(this.oscs[b + k].frequency, freqs[k] * rate, FREQ, t, tc);
      towards(this.gains[b + k].gain, gains[k], GAIN, t, tc);
    }
  }
  stop() {
    for (const o of this.oscs) { try { o.stop(); } catch { /* already stopped */ } o.disconnect(); }
    for (const g of this.gains) g.disconnect();
    this.out.disconnect();
    this.oscs.length = 0; this.gains.length = 0;
  }
}

export class RumbleBed {
  private src: AudioBufferSourceNode;
  private f: BiquadFilterNode;
  private g: GainNode;
  constructor(private ctx: AudioContext, noise: AudioBuffer, dest: AudioNode, private max = 0.3) {
    this.src = ctx.createBufferSource(); this.src.buffer = noise; this.src.loop = true;
    this.f = ctx.createBiquadFilter(); this.f.type = 'lowpass'; this.f.frequency.value = 200; this.f.Q.value = 0.7;
    this.g = ctx.createGain(); this.g.gain.value = 0;
    this.src.connect(this.f).connect(this.g).connect(dest);
    this.src.start(ctx.currentTime, Math.random() * noise.duration);
  }
  update(level: number, lp: number, muffle = 1) {
    const t = this.ctx.currentTime;
    towards(this.g.gain, this.max * level, GAIN, t, 0.35);
    towards(this.f.frequency, lp * muffle, FREQ, t, 0.4);
  }
}

// revInSend -> RoomChain.input -> pre-delay -> damping -> out (the interior convolver)
export class RoomChain {
  readonly input: GainNode;
  private delay: DelayNode;
  private damp: BiquadFilterNode;
  room: Compartment = 'waist';
  constructor(private ctx: AudioContext, out: AudioNode) {
    this.input = ctx.createGain();
    this.delay = ctx.createDelay(0.1); this.delay.delayTime.value = ROOMS.waist.predelay;
    this.damp = ctx.createBiquadFilter(); this.damp.type = 'lowpass'; this.damp.frequency.value = ROOMS.waist.damp; this.damp.Q.value = 0.5;
    this.input.connect(this.delay).connect(this.damp).connect(out);
  }
  set(room: Compartment) {
    this.room = room;
    const r = ROOMS[room], t = this.ctx.currentTime;
    towards(this.delay.delayTime, r.predelay, [0, 0.1], t, 0.05);
    towards(this.damp.frequency, r.damp, FREQ, t, 0.1);
  }
}

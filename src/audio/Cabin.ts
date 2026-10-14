// B-17 waist interior beds (audio pass 3), on the ambience bus with a touch of the interior reverb:
//  - wind roar through the two open waist windows: one looping buffeting roar per window,
//    positioned at the window (inverse distance, short reference), so it is loud at your own
//    window, softer from the one across the fuselage and faint at the tail or top turret;
//    it swells and brightens while the bomber jinks
//  - a rattle bed (loose equipment, ammo cans, fittings) that comes up with the jink load
// Sound.ts owns one, rebuilds it with the graph, and feeds it the window positions every frame
// (Sound.setCabin) once the lazy synthesis has made the loops (Synth3 windowRoar / rattleBed).
import { FREQ, GAIN, place, towards } from './Safe';
import { STATIONS } from '../world/B17Layout';

export interface P3 { x: number; y: number; z: number }

// Waist window openings in the B-17 model frame (+X left wing, +Z nose): the gun pivots sit at
// x +-0.84 at their (staggered) z (B17Layout.STATIONS); the opening is at the skin, a little above the pivot
export const WAIST_WINDOWS: readonly [number, number, number][] = [[1.02, 0.35, STATIONS.waistL.pivot.z], [-1.02, 0.35, STATIONS.waistR.pivot.z]];
const ROAR = 0.42;       // window roar level at (or inside) the reference distance
const BED = 0.1;         // rattle bed at full jink load

export class Cabin {
  private roar: { src: AudioBufferSourceNode | null; pan: PannerNode; gain: GainNode; filter: BiquadFilterNode }[] = [];
  private bed: { src: AudioBufferSourceNode | null; gain: GainNode } ;
  private out: GainNode;
  private active = false;
  private leak: AudioBufferSourceNode | null = null;
  private leakBuffer: AudioBuffer | null = null;
  private leakGain: GainNode;
  private roarBuf: AudioBuffer | null = null;
  private bedBuf: AudioBuffer | null = null;

  constructor(private ctx: AudioContext, dest: AudioNode, reverb: AudioNode, hrtf: boolean) {
    this.out = ctx.createGain(); this.out.gain.value = 0;
    this.out.connect(dest);
    this.leakGain = ctx.createGain(); this.leakGain.gain.value = 0; this.leakGain.connect(this.out);
    const send = ctx.createGain(); send.gain.value = 0.25;
    this.out.connect(send).connect(reverb);
    for (let i = 0; i < 2; i++) {
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 2800; filter.Q.value = 0.4;
      const gain = ctx.createGain(); gain.gain.value = ROAR;
      const pan = ctx.createPanner();
      pan.panningModel = hrtf ? 'HRTF' : 'equalpower'; pan.distanceModel = 'inverse';
      pan.refDistance = 0.8; pan.rolloffFactor = 1.6; pan.maxDistance = 60;
      filter.connect(gain).connect(pan).connect(this.out);
      this.roar.push({ src: null, pan, gain, filter });
    }
    const bg = ctx.createGain(); bg.gain.value = 0;
    bg.connect(this.out);
    this.bed = { src: null, gain: bg };
  }

  setDetail(full: boolean) {
    for (const r of this.roar) r.pan.panningModel = full ? 'HRTF' : 'equalpower';
  }

  setLeakBuffer(buf: AudioBuffer | null) {
    if (!buf || this.leakBuffer === buf) return;
    this.leakBuffer = buf;
    if (this.active) this.startSources();
  }

  setBuffers(roar: AudioBuffer | null, bed: AudioBuffer | null) {
    if (roar) this.roarBuf = roar;
    if (bed) this.bedBuf = bed;
    if (this.active) this.startSources();
  }

  // Bomber interior on/off (Sound.setMode); sources only run while active
  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(on ? 1 : 0, t, on ? 0.4 : 0.15);
    if (on) this.startSources();
    else setTimeout(() => { if (!this.active) this.stopSources(); }, 800);
  }

  private loop(buf: AudioBuffer, to: AudioNode) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = true; s.playbackRate.value = 0.97 + Math.random() * 0.06;
    s.connect(to);
    s.start(this.ctx.currentTime + Math.random() * 0.1, Math.random() * buf.duration);
    return s;
  }

  private startSources() {
    if (this.leakBuffer && !this.leak) this.leak = this.loop(this.leakBuffer, this.leakGain);
    if (this.roarBuf) for (const r of this.roar) if (!r.src) r.src = this.loop(this.roarBuf, r.filter);
    if (this.bedBuf && !this.bed.src) this.bed.src = this.loop(this.bedBuf, this.bed.gain);
  }

  stopSources() {
    if (this.leak) { this.leak.stop(); this.leak.disconnect(); this.leak = null; }
    for (const r of this.roar) { if (r.src) { try { r.src.stop(); } catch { /* */ } r.src.disconnect(); r.src = null; } }
    if (this.bed.src) { try { this.bed.src.stop(); } catch { /* */ } this.bed.src.disconnect(); this.bed.src = null; }
  }

  // Per frame while in the bomber: window positions in the world (null: the camera is not in the
  // cabin, e.g. a kill cam: the roar fades), the jink load 0..1, and whether the rattle bed runs
  update(left: P3 | null, right: P3 | null, maneuver: number, bed: boolean, damage = 0) {
    if (!this.active) return;
    const t = this.ctx.currentTime;
    const m = Number.isFinite(maneuver) ? Math.min(1, Math.max(0, maneuver)) : 0;
    const dmg = Number.isFinite(damage) ? Math.min(1, Math.max(0, damage)) : 0;
    towards(this.leakGain.gain, (left || right) ? dmg * .8 : 0, GAIN, t, .3);
    for (let i = 0; i < 2; i++) {
      const p = i === 0 ? left : right;
      const r = this.roar[i];
      if (p) place(r.pan, p.x, p.y, p.z, t);
      towards(r.gain.gain, p ? ROAR * (1 + 0.45 * m) : 0, GAIN, t, 0.25);
      towards(r.filter.frequency, 2600 + 2600 * m, FREQ, t, 0.3);
    }
    towards(this.bed.gain.gain, bed && (left || right) ? BED * Math.pow(m, 1.3) : 0, GAIN, t, 0.2);
  }
}

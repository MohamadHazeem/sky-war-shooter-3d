import { sound } from './Sound';
import type { ShipState } from '../game/BossBattle';

/**
 * The Luftkreuzers' engine drone: the game's own engine loops (radial + BMW) layered at a
 * very low pitch, dark low-pass, one positional voice per warship. Built on Sound's
 * context and sfx bus; rebuilt if Sound recreates its AudioContext.
 */
interface DroneVoice { srcs: AudioBufferSourceNode[]; gain: GainNode; filter: BiquadFilterNode; pan: PannerNode; level: number }

export class BossDrone {
  private ctx: AudioContext | null = null;
  private voices: DroneVoice[] = [];
  private acc = 0;

  private build(): boolean {
    const s = sound as unknown as { ctx: AudioContext | null; sfx?: GainNode; engineBufs?: Record<string, AudioBuffer> };
    const ctx = s.ctx;
    if (!ctx || !s.sfx || !s.engineBufs?.cyclone || !s.engineBufs?.bmw) return false;
    if (ctx === this.ctx && this.voices.length) return true;
    this.voices = [];
    this.ctx = ctx;
    for (let i = 0; i < 4; i++) {
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 340; filter.Q.value = 1.1;
      const gain = ctx.createGain(); gain.gain.value = 0;
      const pan = ctx.createPanner();
      pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = 380; pan.rolloffFactor = 0.9; pan.maxDistance = 12000;
      const srcs: AudioBufferSourceNode[] = [];
      ([['cyclone', 0.43 + i * 0.013, 0.8], ['bmw', 0.3 + i * 0.009, 0.55], ['cyclone', 0.215 + i * 0.006, 0.7]] as const).forEach(([buf, rate, g]) => {
        const src = ctx.createBufferSource();
        src.buffer = s.engineBufs![buf]; src.loop = true; src.playbackRate.value = rate;
        const gg = ctx.createGain(); gg.gain.value = g;
        src.connect(gg).connect(filter);
        src.start(ctx.currentTime + Math.random() * 0.3);
        srcs.push(src);
      });
      filter.connect(gain).connect(pan).connect(s.sfx);
      this.voices.push({ srcs, gain, filter, pan, level: 0 });
    }
    return true;
  }

  update(ships: ShipState[], active: boolean) {
    if (!active && !this.voices.length) return;
    this.acc++;
    if (this.acc % 6) return;                 // ~10 updates a second is plenty for a drone
    if (!this.build()) return;
    const ctx = this.ctx!, t = ctx.currentTime;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i], st = ships[i];
      const on = active && st && st.deathT < 0;
      const level = on ? 1.5 : 0;
      if (st) {
        const p = st.ship.pos;
        if (Number.isFinite(p.x + p.y + p.z)) {
          if (v.pan.positionX) { v.pan.positionX.setTargetAtTime(p.x, t, 0.05); v.pan.positionY.setTargetAtTime(p.y, t, 0.05); v.pan.positionZ.setTargetAtTime(p.z, t, 0.05); }
          else (v.pan as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(p.x, p.y, p.z);
        }
      }
      if (level !== v.level) { v.level = level; v.gain.gain.setTargetAtTime(level, t, on ? 2.5 : 0.8); }
    }
  }

  stop() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const v of this.voices) { v.gain.gain.setTargetAtTime(0, t, 0.3); v.level = 0; }
  }
}

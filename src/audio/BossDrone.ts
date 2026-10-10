import * as THREE from 'three';
import { sound } from './Sound';
import type { ShipState } from '../game/BossBattle';

/**
 * The Luftkreuzers' engine drone, with size: each warship sounds from several points spread
 * along its span (audio pass 3), so a passing ship sweeps across the stereo field instead of
 * droning from one spot:
 *   - a left and a right engine group, each the game's own engine loops (Cyclone + BMW) layered
 *     at a very low pitch behind a dark low-pass, placed on the live engines of that side and as
 *     loud as the share of those engines still running (a shot-out side goes quiet)
 *   - a hull emitter: a felt low-frequency throb (31 Hz sine pulsing at ~1.7 Hz, the beat of the
 *     many unsynchronised engines) under a third, even lower engine layer
 * Reduced audio detail keeps only the hull emitter, carrying all the layers.
 * When a ship starts dying, sound.warshipDeath() rolls a long rumble under the blasts.
 * Built on Sound's context and sfx bus; rebuilt if Sound recreates its AudioContext.
 */
interface Emitter { srcs: AudioScheduledSourceNode[]; gain: GainNode; filter: BiquadFilterNode; pan: PannerNode; level: number }
interface ShipVoice { emitters: Emitter[]; dead: boolean }

const _v = new THREE.Vector3();
const _sum = new THREE.Vector3();

export class BossDrone {
  private ctx: AudioContext | null = null;
  private ships: ShipVoice[] = [];
  private acc = 0;
  private per = 0;     // emitters per ship of the built graph

  private build(): boolean {
    const s = sound as unknown as { ctx: AudioContext | null; sfx?: GainNode; engineBufs?: Record<string, AudioBuffer> };
    const ctx = s.ctx;
    const per = sound.detailCaps.shipEmitters > 1 ? 3 : 1;
    if (!ctx || !s.sfx || !s.engineBufs?.cyclone || !s.engineBufs?.bmw) return false;
    if (ctx === this.ctx && this.ships.length && per === this.per) return true;
    this.teardown();
    this.ctx = ctx; this.per = per;
    const loop = (buf: AudioBuffer, rate: number, g: number, to: AudioNode, list: AudioScheduledSourceNode[]) => {
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true; src.playbackRate.value = rate;
      const gg = ctx.createGain(); gg.gain.value = g;
      src.connect(gg).connect(to);
      src.start(ctx.currentTime + Math.random() * 0.3);
      list.push(src);
    };
    for (let i = 0; i < 4; i++) {
      const emitters: Emitter[] = [];
      for (let e = 0; e < per; e++) {
        const hull = per === 1 || e === 2;
        const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = hull ? 260 : 360; filter.Q.value = 1.1;
        const gain = ctx.createGain(); gain.gain.value = 0;
        const pan = ctx.createPanner();
        pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = 380; pan.rolloffFactor = 0.9; pan.maxDistance = 12000;
        const srcs: AudioScheduledSourceNode[] = [];
        if (!hull || per === 1) {
          loop(s.engineBufs.cyclone, 0.43 + i * 0.013 + e * 0.007, 0.8, filter, srcs);
          loop(s.engineBufs.bmw, 0.3 + i * 0.009 + e * 0.005, 0.55, filter, srcs);
        }
        if (hull) {
          loop(s.engineBufs.cyclone, 0.215 + i * 0.006, 0.7, filter, srcs);
          // felt throb: a 31 Hz sine pulsing at ~1.7 Hz
          const o = ctx.createOscillator(); o.frequency.value = 30 + i * 1.3;
          const am = ctx.createGain(); am.gain.value = 0.5;
          const lfo = ctx.createOscillator(); lfo.frequency.value = 1.6 + i * 0.13;
          const depth = ctx.createGain(); depth.gain.value = 0.35;
          lfo.connect(depth).connect(am.gain);
          const og = ctx.createGain(); og.gain.value = 0.9;
          o.connect(am).connect(og).connect(filter);
          o.start(); lfo.start();
          srcs.push(o, lfo);
        }
        filter.connect(gain).connect(pan).connect(s.sfx);
        emitters.push({ srcs, gain, filter, pan, level: 0 });
      }
      this.ships.push({ emitters, dead: false });
    }
    return true;
  }

  private teardown() {
    for (const sv of this.ships) for (const e of sv.emitters) {
      for (const s of e.srcs) { try { s.stop(); } catch { /* */ } s.disconnect(); }
      e.gain.disconnect(); e.pan.disconnect();
    }
    this.ships = [];
  }

  private place(p: PannerNode, v: THREE.Vector3, t: number) {
    if (!Number.isFinite(v.x + v.y + v.z)) return;
    if (p.positionX) { p.positionX.setTargetAtTime(v.x, t, 0.05); p.positionY.setTargetAtTime(v.y, t, 0.05); p.positionZ.setTargetAtTime(v.z, t, 0.05); }
    else (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(v.x, v.y, v.z);
  }

  update(ships: ShipState[], active: boolean) {
    if (!active && !this.ships.length) return;
    this.acc++;
    if (this.acc % 6) return;                 // ~10 updates a second is plenty for a drone
    if (!this.build()) return;
    const ctx = this.ctx!, t = ctx.currentTime;
    for (let i = 0; i < this.ships.length; i++) {
      const sv = this.ships[i], st = ships[i];
      const on = active && !!st && st.deathT < 0;
      if (st && st.deathT >= 0 && !sv.dead) { sv.dead = true; if (active) sound.warshipDeath(st.ship.pos); }
      if (st && st.deathT < 0) sv.dead = false;   // a new battle reuses the slot
      const sh = st?.ship;
      // engine groups: the live engines of each side (model frame +X is the left wing)
      let lN = 0, rN = 0, lAll = 0, rAll = 0;
      if (sh) {
        sh.root.updateMatrixWorld();
        for (const e of sv.emitters.length > 1 ? [0, 1] : []) {
          _sum.set(0, 0, 0); let n = 0;
          for (const p of sh.parts) {
            if (p.kind !== 'engine' || (e === 0 ? p.local.x <= 0 : p.local.x > 0)) continue;
            if (e === 0) lAll++; else rAll++;
            if (!p.alive) continue;
            _sum.add(sh.root.localToWorld(_v.copy(p.local).multiplyScalar(sh.S)));
            n++;
          }
          if (e === 0) lN = n; else rN = n;
          if (n) this.place(sv.emitters[e].pan, _sum.divideScalar(n), t);
        }
        this.place(sv.emitters[sv.emitters.length - 1].pan, sh.pos, t);
      }
      sv.emitters.forEach((em, e) => {
        const hull = e === sv.emitters.length - 1;
        const share = hull ? 1 : e === 0 ? (lAll ? lN / lAll : 0) : (rAll ? rN / rAll : 0);
        const level = on ? (sv.emitters.length > 1 ? (hull ? 1.1 : 0.95 * share) : 1.5) : 0;
        if (Math.abs(level - em.level) > 0.01) {
          const up = level > em.level;
          em.level = level;
          em.gain.gain.setTargetAtTime(level, t, on ? (up ? 2.5 : 0.6) : 0.8);
        }
      });
    }
  }

  stop() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const sv of this.ships) for (const e of sv.emitters) { e.gain.gain.setTargetAtTime(0, t, 0.3); e.level = 0; }
  }
}

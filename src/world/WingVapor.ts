import * as THREE from 'three';
import { Aircraft, Fighter } from './Aircraft';
import { Effects } from './Effects';

// Wingtip vapour: when a fighter pulls high G the low pressure over the wing condenses
// the moist air at the tips, so thin white streaks trail from both wingtips. Puffs are
// laid along each tip's path so the streak stays continuous at combat speed instead of
// breaking into beads.
const G_ONSET = 4.2;            // gLoad above which the tips vapour
const TIP_X = 5.2;              // half-span in the model frame (m), scaled with the model
const TIP_Z = -0.25;            // wing chord offset in the model frame (m), scaled with the model
const SPACING = 2.0;            // m between puffs along the tip path
const MAX_PUFFS = 6;            // per tip per frame: caps the burst after a long frame
const MAX_JUMP = 80;            // m: a larger step is a teleport or hitch, so restart the streak
const MAX_RANGE2 = 1800 * 1800; // beyond this distance from the camera nobody can see it
const LIFE = 0.8;               // s
const ALPHA = 0.35;
const COL: [number, number, number] = [0.9, 0.91, 0.93]; // unlit white: sun is already in the sky colour

const _cur = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _p = new THREE.Vector3();
const _j = new THREE.Vector3();
const _w = new THREE.Vector3();
const R = () => Math.random() * 2 - 1;

interface Tip { pos: THREE.Vector3; has: boolean }
interface FighterVapor { tips: [Tip, Tip]; strength: number; seen: number }

export class WingVapor {
  private states = new Map<Fighter, FighterVapor>();
  private frame = 0;

  constructor(private effects: Effects) {}

  // Once per world step, after the aircraft have moved this frame.
  update(aircraft: Aircraft[], dt: number, listener: THREE.Vector3 | null) {
    const frame = ++this.frame;
    for (const a of aircraft) {
      if (!(a instanceof Fighter) || a.remove || !a.alive) continue;
      let st = this.states.get(a);
      if (!st) {
        st = { tips: [{ pos: new THREE.Vector3(), has: false }, { pos: new THREE.Vector3(), has: false }], strength: 0, seen: 0 };
        this.states.set(a, st);
      }
      st.seen = frame;
      const on = a.fm.gLoad > G_ONSET;
      // fade the vapour in and out rather than popping on and off
      st.strength += ((on ? 1 : 0) - st.strength) * Math.min(1, dt * 4);
      if (!on || (listener && a.pos.distanceToSquared(listener) > MAX_RANGE2)) {
        st.tips[0].has = st.tips[1].has = false;
        continue;
      }
      const s = a.model.scale.x;
      for (let k = 0; k < 2; k++) {
        _cur.set((k === 0 ? TIP_X : -TIP_X) * s, 0, TIP_Z * s).applyQuaternion(a.root.quaternion).add(a.pos);
        this.emitTip(st.tips[k], _cur, st.strength);
      }
    }
    // drop state for fighters that are gone or dead
    for (const [a, st] of this.states) if (st.seen !== frame) this.states.delete(a);
  }

  // Floating origin: stored tip positions must move with the scene.
  rebase(off: THREE.Vector3) {
    for (const st of this.states.values()) for (const t of st.tips) t.pos.sub(off);
  }

  private emitTip(tip: Tip, cur: THREE.Vector3, strength: number) {
    if (!tip.has) {
      tip.pos.copy(cur); tip.has = true;
      this.puff(cur, strength);
      return;
    }
    _seg.subVectors(cur, tip.pos);
    const len = _seg.length();
    if (len > MAX_JUMP) { tip.pos.copy(cur); this.puff(cur, strength); return; }
    const n = Math.min(MAX_PUFFS, Math.max(1, Math.ceil(len / SPACING)));
    for (let i = 1; i <= n; i++) {
      _p.copy(tip.pos).addScaledVector(_seg, i / n);
      this.puff(_p, strength);
    }
    tip.pos.copy(cur);
  }

  private puff(pos: THREE.Vector3, strength: number) {
    // a little jitter and slow spread keep the streak from looking ruler-straight
    _j.set(R() * 0.3, R() * 0.3, R() * 0.3).add(pos);
    _w.set(R(), R() * 0.2, R()).multiplyScalar(0.6);
    this.effects.smoke.spawn({
      pos: _j, vel: _w, life: LIFE, size0: 0.5, size1: 1.3, color0: COL,
      alpha0: ALPHA * strength, alpha1: 0, drag: 0.5,
    });
  }
}

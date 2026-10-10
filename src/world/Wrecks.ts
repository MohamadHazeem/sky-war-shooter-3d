import * as THREE from 'three';
import type { Fighter } from './Aircraft';
import type { Effects } from './Effects';
import type { ParticleOpts } from '../render/Particles';

// Breaking aircraft apart: the model is cloned once per piece and each clone is cut
// with clipping planes (wing shot off, tail sheared away, or blown into four parts).
// Pieces tumble away under gravity trailing fire and smoke. Every kind uses one or
// three clip planes, the counts World.prewarm compiles.
//
// Piece motion:
//   tumble     constant random spin (detached parts, blown-apart sections)
//   autorotate the fuselage that lost a wing: a fast roll toward the missing side with
//              a lazy yaw, so it corkscrews down instead of tumbling at random
//   dive       the fuselage that lost its tail: the nose drops over into a vertical
//              dive while a roll builds up, the flight path bending after the nose
type Motion = 'tumble' | 'autorotate' | 'dive';

interface Piece {
  root: THREE.Group;
  model: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  local: THREE.Plane[];
  world: THREE.Plane[];
  mats: THREE.Material[];
  fire: number;    // 0 none .. 1 heavy
  smoke: number;
  emit: THREE.Vector3; // local emitter offset
  acc: number;
  age: number;
  main: boolean;   // the main fuselage section: throws a thick black column for its first seconds
  motion: Motion;
  roll: number;    // dive: roll rate it builds up to (rad/s, signed)
}

const R = () => Math.random() * 2 - 1;
const P = (nx: number, ny: number, nz: number, c: number) => new THREE.Plane(new THREE.Vector3(nx, ny, nz), c);
const _at = new THREE.Vector3();
const _sv = new THREE.Vector3();
const _fw = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const DOWN = new THREE.Vector3(0, -1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const COLUMN_TIME = 4; // seconds the fuselage keeps a thick black column
const NOSE_OVER = 1.7; // rad/s, dive: how fast the nose drops

// reusable particle options (no per-tick object literals)
const C_SMOKE: [number, number, number] = [0.12, 0.11, 0.1];
const C_COL0: [number, number, number] = [0.05, 0.045, 0.04];
const C_COL1: [number, number, number] = [0.1, 0.09, 0.085];
const C_EMB0: [number, number, number] = [28, 15, 4];
const C_EMB1: [number, number, number] = [6, 1.5, 0.3];
const O: ParticleOpts = { pos: _at, life: 1, size0: 1, size1: 1, color0: C_SMOKE };
function opts(life: number, s0: number, s1: number, c0: [number, number, number], c1: [number, number, number] | undefined,
  a0: number, drag: number, rise: number, lit: boolean, frame: number) {
  O.pos = _at; O.vel = _sv; O.life = life; O.size0 = s0; O.size1 = s1; O.color0 = c0; O.color1 = c1;
  O.alpha0 = a0; O.alpha1 = 0; O.drag = drag; O.rise = rise; O.lit = lit; O.frame = frame; O.rotVel = undefined;
  return O;
}

export type BreakKind = 'wingL' | 'wingR' | 'tail' | 'blowup';

export class Wrecks {
  private pieces: Piece[] = [];

  constructor(private scene: THREE.Scene, private effects: Effects) {}

  break(f: Fighter, kind: BreakKind) {
    // cut planes in the model's own (unscaled) frame: +X left wing, +Z nose
    const W = 1.05, T = -4.3;
    type Spec = {
      planes: THREE.Plane[]; kick: THREE.Vector3; spin: number; spinVec?: THREE.Vector3; fire: number; smoke: number;
      emit: THREE.Vector3; main?: boolean; motion?: Motion; roll?: number;
    };
    const specs: Spec[] = [];
    const body = (planes: THREE.Plane[], extra: Partial<Spec> = {}): Spec => ({
      planes, kick: new THREE.Vector3(R() * 3, -2, R() * 3), spin: 2.5, fire: 1, smoke: 1, emit: new THREE.Vector3(0, 0, 1.2), main: true, ...extra,
    });
    if (kind === 'wingL' || kind === 'wingR') {
      const s = kind === 'wingL' ? 1 : -1; // model x sign of the lost wing
      specs.push({ planes: [P(s, 0, 0, -W)], kick: new THREE.Vector3(14 * s, 6, -8), spin: 7, fire: Math.random() < 0.5 ? 0.6 : 0, smoke: 0.6, emit: new THREE.Vector3(1.6 * s, 0, 0) });
      // the other wing still lifts: the fuselage rolls hard toward the stump (+z roll
      // raises +x), yaws lazily, and streams burning fuel from the torn wing root
      specs.push(body([P(-s, 0, 0, W)], {
        spinVec: new THREE.Vector3(R() * 0.35, (0.6 + Math.random() * 0.5) * s, -(4 + Math.random() * 2) * s), motion: 'autorotate',
        emit: new THREE.Vector3(W * s, 0, -0.1),
      }));
    } else if (kind === 'tail') {
      specs.push({ planes: [P(0, 0, -1, T)], kick: new THREE.Vector3(R() * 4, 5, -18), spin: 5, fire: 0, smoke: 0.4, emit: new THREE.Vector3(0, 0, -4.5) });
      specs.push(body([P(0, 0, 1, -T)], { motion: 'dive', roll: (Math.random() < 0.5 ? -1 : 1) * (1.6 + Math.random() * 1.4), kick: new THREE.Vector3(R() * 2, 2, R() * 2) }));
    } else {
      // blown apart: every section burns
      specs.push({ planes: [P(1, 0, 0, -W)], kick: new THREE.Vector3(22, 10, R() * 10), spin: 9, fire: 0.75, smoke: 0.8, emit: new THREE.Vector3(1.6, 0, 0) });
      specs.push({ planes: [P(-1, 0, 0, -W)], kick: new THREE.Vector3(-22, 10, R() * 10), spin: 9, fire: 0.6, smoke: 0.8, emit: new THREE.Vector3(-1.6, 0, 0) });
      specs.push({ planes: [P(0, 0, -1, T), P(-1, 0, 0, W), P(1, 0, 0, W)], kick: new THREE.Vector3(R() * 6, 14, -20), spin: 6, fire: 0.45, smoke: 0.6, emit: new THREE.Vector3(0, 0, -4.5) });
      specs.push({ planes: [P(0, 0, 1, -T), P(-1, 0, 0, W), P(1, 0, 0, W)], kick: new THREE.Vector3(R() * 6, -6, 10), spin: 4, fire: 1, smoke: 1, emit: new THREE.Vector3(0, 0, 1.2), main: true });
    }
    f.root.updateMatrixWorld(true);
    for (const sp of specs) {
      const root = new THREE.Group();
      root.position.copy(f.root.position);
      root.quaternion.copy(f.root.quaternion);
      const model = f.model.clone(true);
      const world = sp.planes.map((p) => p.clone());
      const mats: THREE.Material[] = [];
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const src = Array.isArray(m.material) ? m.material : [m.material];
        const cl = src.map((mm) => {
          const c = mm.clone();
          c.clippingPlanes = world;
          c.clipShadows = true;
          c.side = THREE.DoubleSide; // show the inside of the torn skin
          mats.push(c);
          return c;
        });
        m.material = Array.isArray(m.material) ? cl : cl[0];
      });
      // hide prop discs etc. on detached parts
      model.traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry?.type === 'CircleGeometry') o.visible = false; });
      root.add(model);
      this.scene.add(root);
      const kick = sp.kick.clone().applyQuaternion(f.root.quaternion);
      const spin = sp.spinVec ?? new THREE.Vector3(R(), R(), R()).normalize().multiplyScalar(sp.spin);
      this.pieces.push({
        root, model, vel: f.vel.clone().add(kick), spin,
        life: 14, local: sp.planes, world, mats, fire: sp.fire, smoke: sp.smoke, emit: sp.emit.clone().multiplyScalar(f.model.scale.x), acc: 0,
        age: 0, main: sp.main === true, motion: sp.motion ?? 'tumble', roll: sp.roll ?? 0,
      });
    }
  }

  update(dt: number) {
    let n = 0;
    for (const p of this.pieces) {
      p.life -= dt;
      p.age += dt;
      p.vel.y -= 9.81 * dt * 0.85;
      if (p.motion === 'dive') {
        // nose over toward straight down, then a building roll; the path follows the nose
        _fw.copy(Z).applyQuaternion(p.root.quaternion);
        _ax.crossVectors(_fw, DOWN);
        const s = _ax.length();
        const ang = Math.atan2(s, -_fw.y);
        if (s > 1e-4) p.root.quaternion.premultiply(_q.setFromAxisAngle(_ax.divideScalar(s), Math.min(ang, NOSE_OVER * dt)));
        else if (_fw.y > 0) p.root.quaternion.multiply(_q.setFromAxisAngle(_ax.set(1, 0, 0), NOSE_OVER * dt));
        const roll = p.roll * Math.min(1, p.age / 2.5);
        p.root.quaternion.multiply(_q.setFromAxisAngle(Z, roll * dt));
        const sp = p.vel.length();
        _sv.copy(_fw).multiplyScalar(sp);
        p.vel.lerp(_sv, 1 - Math.exp(-1.4 * dt));
        p.vel.multiplyScalar(Math.exp(-0.03 * dt));
      } else {
        p.vel.multiplyScalar(Math.exp((p.motion === 'autorotate' ? -0.2 : -0.12) * dt));
        _e.set(p.spin.x * dt, p.spin.y * dt, p.spin.z * dt);
        p.root.quaternion.multiply(_q.setFromEuler(_e));
      }
      p.root.position.addScaledVector(p.vel, dt);
      p.root.updateMatrixWorld(true);
      for (let i = 0; i < p.local.length; i++) p.world[i].copy(p.local[i]).applyMatrix4(p.model.matrixWorld);
      // burning pieces spit the occasional bright ember that arcs back down
      if (p.fire > 0 && Math.random() < dt * 4 * p.fire) {
        _at.copy(p.emit);
        p.root.localToWorld(_at);
        _sv.set(R(), R(), R()).multiplyScalar(5).add(p.vel);
        this.effects.glow.spawn(opts(0.35 + Math.random() * 0.4, 0.16, 0.04, C_EMB0, C_EMB1, 1, 1.5, -9, false, 1));
      }
      p.acc += dt;
      if (p.acc > 0.05) {
        p.acc = 0;
        _at.copy(p.emit);
        p.root.localToWorld(_at);
        const fade = Math.min(1, p.life / 4);
        if (p.fire > 0) this.effects.trail(_at, p.vel, 1, true, 0.9 * p.fire);
        else if (p.smoke > 0) {
          _sv.copy(p.vel).multiplyScalar(0.2);
          this.effects.smoke.spawn(opts(3, 0.8, 4 * p.smoke, C_SMOKE, undefined, 0.55 * fade, 0.8, 0, true, 0));
        }
        // the main fuselage lays a thick black column behind it for its first seconds
        if (p.main && p.age < COLUMN_TIME) {
          _sv.copy(p.vel).multiplyScalar(0.15);
          this.effects.smoke.spawn(opts(6, 2.6, 8, C_COL0, C_COL1, 0.8, 0.8, 0, true, 0));
        }
      }
      if (p.life <= 0) { p.root.removeFromParent(); for (const m of p.mats) m.dispose(); }
      else this.pieces[n++] = p;
    }
    this.pieces.length = n;
  }

  clear() {
    for (const p of this.pieces) { p.root.removeFromParent(); for (const m of p.mats) m.dispose(); }
    this.pieces = [];
  }
}

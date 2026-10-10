import * as THREE from 'three';
import type { Fighter } from './Aircraft';
import type { Effects } from './Effects';

// Breaking aircraft apart: the model is cloned once per piece and each clone is cut
// with clipping planes (wing shot off, tail sheared away, or blown into four parts).
// Pieces tumble away under gravity trailing fire and smoke.
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
}

const R = () => Math.random() * 2 - 1;
const P = (nx: number, ny: number, nz: number, c: number) => new THREE.Plane(new THREE.Vector3(nx, ny, nz), c);
const _at = new THREE.Vector3();
const _sv = new THREE.Vector3();
const COLUMN_TIME = 4; // seconds the fuselage keeps a thick black column

export type BreakKind = 'wingL' | 'wingR' | 'tail' | 'blowup';

export class Wrecks {
  private pieces: Piece[] = [];

  constructor(private scene: THREE.Scene, private effects: Effects) {}

  break(f: Fighter, kind: BreakKind) {
    // cut planes in the model's own (unscaled) frame: +X left wing, +Z nose
    const W = 1.05, T = -4.3;
    type Spec = { planes: THREE.Plane[]; kick: THREE.Vector3; spin: number; fire: number; smoke: number; emit: THREE.Vector3; main?: boolean };
    const specs: Spec[] = [];
    const body = (planes: THREE.Plane[]): Spec => ({ planes, kick: new THREE.Vector3(R() * 3, -2, R() * 3), spin: 2.5, fire: 1, smoke: 1, emit: new THREE.Vector3(0, 0, 1.2), main: true });
    if (kind === 'wingL') {
      specs.push({ planes: [P(1, 0, 0, -W)], kick: new THREE.Vector3(14, 6, -8), spin: 7, fire: Math.random() < 0.5 ? 0.6 : 0, smoke: 0.6, emit: new THREE.Vector3(1.6, 0, 0) });
      specs.push(body([P(-1, 0, 0, W)]));
    } else if (kind === 'wingR') {
      specs.push({ planes: [P(-1, 0, 0, -W)], kick: new THREE.Vector3(-14, 6, -8), spin: 7, fire: Math.random() < 0.5 ? 0.6 : 0, smoke: 0.6, emit: new THREE.Vector3(-1.6, 0, 0) });
      specs.push(body([P(1, 0, 0, W)]));
    } else if (kind === 'tail') {
      specs.push({ planes: [P(0, 0, -1, T)], kick: new THREE.Vector3(R() * 4, 5, -18), spin: 5, fire: 0, smoke: 0.4, emit: new THREE.Vector3(0, 0, -4.5) });
      specs.push(body([P(0, 0, 1, -T)]));
    } else {
      specs.push({ planes: [P(1, 0, 0, -W)], kick: new THREE.Vector3(22, 10, R() * 10), spin: 9, fire: 0.7, smoke: 0.8, emit: new THREE.Vector3(1.6, 0, 0) });
      specs.push({ planes: [P(-1, 0, 0, -W)], kick: new THREE.Vector3(-22, 10, R() * 10), spin: 9, fire: 0.5, smoke: 0.8, emit: new THREE.Vector3(-1.6, 0, 0) });
      specs.push({ planes: [P(0, 0, -1, T), P(-1, 0, 0, W), P(1, 0, 0, W)], kick: new THREE.Vector3(R() * 6, 14, -20), spin: 6, fire: 0, smoke: 0.5, emit: new THREE.Vector3(0, 0, -4.5) });
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
      this.pieces.push({
        root, model, vel: f.vel.clone().add(kick), spin: new THREE.Vector3(R(), R(), R()).normalize().multiplyScalar(sp.spin),
        life: 14, local: sp.planes, world, mats, fire: sp.fire, smoke: sp.smoke, emit: sp.emit.clone().multiplyScalar(f.model.scale.x), acc: 0,
        age: 0, main: sp.main === true,
      });
    }
  }

  update(dt: number) {
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (const p of this.pieces) {
      p.life -= dt;
      p.age += dt;
      p.vel.y -= 9.81 * dt * 0.85;
      p.vel.multiplyScalar(Math.exp(-0.12 * dt));
      p.root.position.addScaledVector(p.vel, dt);
      e.set(p.spin.x * dt, p.spin.y * dt, p.spin.z * dt);
      p.root.quaternion.multiply(q.setFromEuler(e));
      p.root.updateMatrixWorld(true);
      for (let i = 0; i < p.local.length; i++) p.world[i].copy(p.local[i]).applyMatrix4(p.model.matrixWorld);
      // burning pieces spit the occasional bright ember that arcs back down
      if (p.fire > 0 && Math.random() < dt * 4 * p.fire) {
        _at.copy(p.emit);
        p.root.localToWorld(_at);
        _sv.set(R(), R(), R()).multiplyScalar(5).add(p.vel);
        this.effects.glow.spawn({ pos: _at, vel: _sv, life: 0.35 + Math.random() * 0.4, size0: 0.16, size1: 0.04, color0: [28, 15, 4], color1: [6, 1.5, 0.3], alpha0: 1, alpha1: 0, frame: 1, drag: 1.5, rise: -9 });
      }
      p.acc += dt;
      if (p.acc > 0.05) {
        p.acc = 0;
        const at = p.root.localToWorld(p.emit.clone());
        const fade = Math.min(1, p.life / 4);
        if (p.fire > 0) this.effects.trail(at, p.vel, 1, true, 0.9 * p.fire);
        else if (p.smoke > 0) this.effects.smoke.spawn({ pos: at, vel: p.vel.clone().multiplyScalar(0.2), life: 3, size0: 0.8, size1: 4 * p.smoke, color0: [0.12, 0.11, 0.1], alpha0: 0.55 * fade, alpha1: 0, drag: 0.8, lit: true });
        // the main fuselage lays a thick black column behind it for its first seconds
        if (p.main && p.age < COLUMN_TIME) {
          _sv.copy(p.vel).multiplyScalar(0.15);
          this.effects.smoke.spawn({ pos: at, vel: _sv, life: 6, size0: 2.6, size1: 8, color0: [0.05, 0.045, 0.04], color1: [0.1, 0.09, 0.085], alpha0: 0.8, alpha1: 0, drag: 0.8, lit: true });
        }
      }
      if (p.life <= 0) { p.root.removeFromParent(); for (const m of p.mats) m.dispose(); }
    }
    this.pieces = this.pieces.filter((p) => p.life > 0);
  }

  clear() {
    for (const p of this.pieces) { p.root.removeFromParent(); for (const m of p.mats) m.dispose(); }
    this.pieces = [];
  }
}

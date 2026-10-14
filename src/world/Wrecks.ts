import * as THREE from 'three';
import type { Aircraft, Fighter } from './Aircraft';
import type { Effects } from './Effects';
import type { ParticleOpts } from '../render/Particles';

// Breaking aircraft apart: the model is cloned once per piece and each clone is cut
// with clipping planes (wing shot off, tail sheared away, or blown into four parts).
// Pieces tumble away under gravity trailing fire and smoke. Fighter kinds use one or
// three clip planes, the B-17 kinds (breakBomber) one, two or three: World.prewarm compiles them all.
//
// Piece motion:
//   tumble     constant random spin (detached parts, blown-apart sections)
//   autorotate the fuselage that lost a wing: a fast roll toward the missing side with
//              a lazy yaw, so it corkscrews down instead of tumbling at random
//   dive       the fuselage that lost its tail: the nose drops over into a vertical
//              dive while a roll builds up, the flight path bending after the nose
//   flatspin   the B-17 that lost an outer wing panel: rolls over toward the stump for ~2.5 s,
//              then settles into a slow flat spin, sinking at ~24 m/s
type Motion = 'tumble' | 'autorotate' | 'dive' | 'flatspin';

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
  roll: number;    // dive: roll rate it builds up to (rad/s, signed); flatspin: the roll-over rate
  drag: number;    // < 0: the motion's own drag; otherwise this (a steered chunk flies with 0)
  last: THREE.Vector3;  // emitter world position at the last trail emission
  hasLast: boolean;
  pooled?: boolean;
}

const R = () => Math.random() * 2 - 1;
const P = (nx: number, ny: number, nz: number, c: number) => new THREE.Plane(new THREE.Vector3(nx, ny, nz), c);
const _at = new THREE.Vector3();
const _em = new THREE.Vector3();
const _sv = new THREE.Vector3();
const _fw = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const DOWN = new THREE.Vector3(0, -1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
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
  O.alpha0 = a0; O.alpha1 = 0; O.drag = drag; O.rise = rise; O.lit = lit; O.frame = frame; O.rotVel = undefined; O.age = 0;
  return O;
}

export type BreakKind = 'wingL' | 'wingR' | 'tail' | 'blowup';
// B-17 break-ups staged by the formation set pieces (game/SetPieces.ts):
//   wingFold  a flak hit folds the outer wing panel up and off (outboard of the inner engine);
//             the rest of the ship rolls over toward the stump and settles into a flat spin
//   blowup    a bomb-bay explosion: both wings, the nose section, the tail section and a loose
//             wingtip, which the caller can steer past the player's gun position
export type BomberBreak = 'wingFold' | 'blowup' | 'split';

// A piece handed back to the caller (set pieces track the spinning hulk, steer a chunk).
// drag < 0: the motion's own air drag; 0 lets a steered piece fly a clean ballistic arc.
export interface WreckPiece { readonly root: THREE.Group; readonly vel: THREE.Vector3; readonly spin: THREE.Vector3; life: number; drag: number }

type Spec = {
  planes: THREE.Plane[]; kick: THREE.Vector3; spin: number; spinVec?: THREE.Vector3; fire: number; smoke: number;
  emit: THREE.Vector3; main?: boolean; motion?: Motion; roll?: number; life?: number;
};

const B17_FOLD = 4.6;    // m from the centre line: between the inner and the outer engine
const B17_ROOT = 2.4;    // wing root, just outside the fuselage
const B17_TIP = 9.0;     // the loose wingtip of a blow-up
const B17_SPLIT = -5.0;  // fuselage break behind the wing trailing edge, ahead of the stabilisers

export class Wrecks {
  private pieces: Piece[] = [];
  private warm: Piece[] = [];   // prewarm pieces kept out of the scene: their materials hold the compiled programs

  constructor(private scene: THREE.Scene, private effects: Effects) {}

  break(f: Fighter, kind: BreakKind) {
    // cut planes in the model's own (unscaled) frame: +X left wing, +Z nose
    const W = 1.05, T = -4.3;
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
    this.cut(f, specs);
  }

  // B-17 break-ups (set pieces). side: model x sign (+1 left) of the folding wing / of the loose
  // wingtip. Returns the pieces in spec order: wingFold [outer panel, hulk]; blowup [side wing,
  // side wingtip, other wing, nose section, tail section]. Uses one, two and three clip planes (World.prewarm compiles both
  // kinds on a dummy B-17).
  breakBomber(b: Aircraft, kind: BomberBreak, side: 1 | -1 = 1): WreckPiece[] {
    const specs: Spec[] = [];
    const s = side;
    if (kind === 'split') {
      specs.push({ planes: [P(0, 0, 1, -B17_SPLIT)], kick: new THREE.Vector3(0, -3, 8), spin: 0.25, fire: 0.5, smoke: 0.8, emit: new THREE.Vector3(0, 0, B17_SPLIT), main: true, motion: 'dive', roll: 0.3, life: 26 });
      specs.push({ planes: [P(0, 0, -1, B17_SPLIT)], kick: new THREE.Vector3(0, 4, -14), spin: 1.1, fire: 0, smoke: 0.5, emit: new THREE.Vector3(0, 0, B17_SPLIT), life: 26 });
    } else if (kind === 'wingFold') {
      // the panel folds up and back, then flutters away burning
      specs.push({ planes: [P(s, 0, 0, -B17_FOLD)], kick: new THREE.Vector3(9 * s, 9, -6), spin: 0, spinVec: new THREE.Vector3(R() * 0.8, R() * 0.6, 3.2 * s),
        fire: 0.8, smoke: 0.8, emit: new THREE.Vector3(B17_FOLD * s, 0, 0.2), life: 22 });
      specs.push({ planes: [P(-s, 0, 0, B17_FOLD)], kick: new THREE.Vector3(R() * 1.5, -1.5, R() * 1.5), spin: 0, spinVec: new THREE.Vector3(),
        fire: 1, smoke: 1, emit: new THREE.Vector3(B17_FOLD * s, 0, 0.3), main: true, motion: 'flatspin', roll: -s * 0.85, life: 30 });
    } else {
      // mirrored by side: the loose tip and the two-cut wing are on side s (toward the player)
      const fwd = () => P(0, 0, 1, -B17_SPLIT);   // keeps z >= split
      specs.push({ planes: [P(s, 0, 0, -B17_ROOT), P(-s, 0, 0, B17_TIP), fwd()], kick: new THREE.Vector3(16 * s, 8, R() * 6), spin: 2.2, fire: 0.9, smoke: 0.8, emit: new THREE.Vector3((B17_ROOT + 0.5) * s, 0, 0.5), life: 24 });
      specs.push({ planes: [P(s, 0, 0, -B17_TIP)], kick: new THREE.Vector3(26 * s, 12, R() * 8), spin: 0, spinVec: new THREE.Vector3(7, R() * 1.5, R() * 1.2), fire: 0.35, smoke: 0.6, emit: new THREE.Vector3(B17_TIP * s, 0, -0.5), life: 16 });
      specs.push({ planes: [P(-s, 0, 0, -B17_ROOT), fwd()], kick: new THREE.Vector3(-16 * s, 8, R() * 6), spin: 2.2, fire: 1, smoke: 0.8, emit: new THREE.Vector3(-(B17_ROOT + 0.5) * s, 0, 0.5), life: 24 });
      specs.push({ planes: [fwd(), P(-1, 0, 0, B17_ROOT), P(1, 0, 0, B17_ROOT)], kick: new THREE.Vector3(R() * 4, -6, 9), spin: 1.4, fire: 1, smoke: 1, emit: new THREE.Vector3(0, 0, 1.5), main: true, life: 26 });
      specs.push({ planes: [P(0, 0, -1, B17_SPLIT)], kick: new THREE.Vector3(R() * 4, 6, -12), spin: 1.8, fire: 0.5, smoke: 0.7, emit: new THREE.Vector3(0, 0.3, -5.5), life: 24 });
    }
    return this.cut(b, specs);
  }

  private cut(f: Aircraft, specs: Spec[]): WreckPiece[] {
    const out: WreckPiece[] = [];
    f.root.updateMatrixWorld(true);
    for (const sp of specs) {
      // B-17 models/materials are built and compiled during World.prewarm. Reuse the
      // idle piece with the same clipping-plane count; no model cloning on normal losses.
      let reuse: Piece | undefined;
      if (f.kind === 'b17') for (const p of this.warm) if (p.life <= 0 && p.local.length === sp.planes.length) { reuse = p; break; }
      if (reuse) {
        const p = reuse;
        p.root.position.copy(f.pos); p.root.quaternion.copy(f.quat); p.model.scale.copy(f.model.scale);
        for (let i = 0; i < sp.planes.length; i++) p.local[i].copy(sp.planes[i]);
        p.vel.copy(sp.kick).applyQuaternion(f.quat).add(f.vel);
        if (sp.spinVec) p.spin.copy(sp.spinVec); else p.spin.set(R(), R(), R()).normalize().multiplyScalar(sp.spin);
        p.life = sp.life ?? 14; p.fire = sp.fire; p.smoke = sp.smoke;
        p.emit.copy(sp.emit).multiplyScalar(f.model.scale.x); p.acc = p.age = 0; p.hasLast = false;
        p.main = sp.main === true; p.motion = sp.motion ?? 'tumble'; p.roll = sp.roll ?? 0; p.drag = -1;
        p.root.updateMatrixWorld(true);
        for (let i = 0; i < p.local.length; i++) p.world[i].copy(p.local[i]).applyMatrix4(p.model.matrixWorld);
        this.scene.add(p.root); this.pieces.push(p); out.push(p); continue;
      }
      const root = new THREE.Group();
      root.position.copy(f.root.position);
      root.quaternion.copy(f.root.quaternion);
      const model = f.model.clone(true);
      for (const name of ['formationDamage', 'formationIdentity']) model.getObjectByName(name)?.removeFromParent();
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
      const p: Piece = {
        root, model, vel: f.vel.clone().add(kick), spin,
        life: sp.life ?? 14, local: sp.planes, world, mats, fire: sp.fire, smoke: sp.smoke, emit: sp.emit.clone().multiplyScalar(f.model.scale.x), acc: 0,
        age: 0, main: sp.main === true, motion: sp.motion ?? 'tumble', roll: sp.roll ?? 0, drag: -1,
        last: new THREE.Vector3(), hasLast: false,
      };
      this.pieces.push(p);
      out.push(p);
    }
    return out;
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
      } else if (p.motion === 'flatspin') {
        // roll over toward the stump, then the spin builds about the vertical
        const a = p.age;
        const rollK = a < 1.8 ? 1 : Math.max(0, 1 - (a - 1.8) / 1.2);
        if (rollK > 0) p.root.quaternion.multiply(_q.setFromAxisAngle(Z, p.roll * rollK * dt));
        if (a > 1.2) p.root.quaternion.premultiply(_q.setFromAxisAngle(UP, Math.sign(p.roll || 1) * Math.min(1.35, (a - 1.2) * 0.5) * dt));
        // a flat spin sinks slowly (~24 m/s) and bleeds its forward speed off gently, so it stays
        // in sight of the box for a while
        const k = Math.exp(-0.05 * dt);
        p.vel.x *= k; p.vel.z *= k;
        if (p.vel.y < -24) p.vel.y = -24;
      } else {
        p.vel.multiplyScalar(Math.exp((p.drag >= 0 ? -p.drag : p.motion === 'autorotate' ? -0.2 : -0.12) * dt));
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
        // Every ~3-4 frames: the puffs are spread back along the path flown since the last
        // emission (Effects.trail does the same for the flames), with jitter and varied size, so
        // a falling wreck draws a continuous trail rather than a row of evenly spaced beads.
        const span = p.acc;
        p.acc = -Math.random() * 0.012;
        _em.copy(p.emit);
        p.root.localToWorld(_em);
        const fade = Math.min(1, p.life / 4);
        // the emitter swings round the tumbling piece: the puffs follow its real path since the last emission
        const from = p.hasLast ? p.last : undefined;
        if (p.fire > 0) this.effects.trail(_em, p.vel, 1, true, 0.9 * p.fire, span, from);
        else if (p.smoke > 0) {
          _sv.copy(p.vel).multiplyScalar(0.2);
          for (let i = 0; i < 2; i++) {
            const ago = (span * (i + Math.random())) / 2;
            if (from) _at.lerpVectors(_em, from, ago / span).addScaledVector(p.vel, 0.2 * ago);
            else _at.copy(_em).addScaledVector(p.vel, -0.8 * ago);
            const k = 0.8 + Math.random() * 0.4;
            const o = opts(3, 0.8 * k, 4 * p.smoke * k, C_SMOKE, undefined, 0.55 * fade * 0.75 * (0.8 + Math.random() * 0.4), 0.8, 0, true, 0);
            o.age = ago;
            this.effects.smoke.spawn(o);
          }
        }
        // the main fuselage lays a thick black column behind it for its first seconds
        if (p.main && p.age < COLUMN_TIME) {
          _sv.copy(p.vel).multiplyScalar(0.15);
          for (let i = 0; i < 2; i++) {
            const ago = (span * (i + Math.random())) / 2;
            if (from) _at.lerpVectors(_em, from, ago / span).addScaledVector(p.vel, 0.15 * ago);
            else _at.copy(_em).addScaledVector(p.vel, -0.85 * ago);
            const k = 0.85 + Math.random() * 0.3;
            const o = opts(6, 2.6 * k, 8 * k, C_COL0, C_COL1, 0.8 * 0.7 * (0.85 + Math.random() * 0.3), 0.8, 0, true, 0);
            o.age = ago;
            this.effects.smoke.spawn(o);
          }
        }
        p.last.copy(_em); p.hasLast = true;
      }
      if (p.life <= 0) { p.root.removeFromParent(); if (!p.pooled) for (const m of p.mats) m.dispose(); }
      else this.pieces[n++] = p;
    }
    this.pieces.length = n;
  }

  // World.prewarm: take these pieces out of play but keep their (clipped) materials alive, so the
  // shader programs compiled for them are not released (three.js drops a program when the last
  // material using it is disposed) and the first set piece doesn't compile them again
  keepWarm(list: WreckPiece[]) {
    for (const w of list) {
      const i = this.pieces.indexOf(w as Piece);
      if (i < 0) continue;
      const p = this.pieces[i];
      this.pieces.splice(i, 1);
      p.root.removeFromParent();
      p.life = 0; p.pooled = true; this.warm.push(p);
    }
  }

  clear() {
    for (const p of this.pieces) { p.root.removeFromParent(); p.life = 0; if (!p.pooled) for (const m of p.mats) m.dispose(); }
    this.pieces = [];
  }

  // Shader warm-up: drop the pieces but keep their materials alive. three.js releases a compiled
  // program as soon as no material uses it any more, so disposing the warm-up wrecks threw the
  // freshly compiled wreck shaders away and the first real kill compiled them again.
  clearKeepMaterials(): THREE.Material[] {
    const keep: THREE.Material[] = [];
    for (const p of this.pieces) { p.root.removeFromParent(); keep.push(...p.mats); }
    this.pieces = [];
    return keep;
  }
}

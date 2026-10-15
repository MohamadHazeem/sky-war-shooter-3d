import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { envRef } from '../render/EnvRef';
import type { PortraitLook } from '../render/Portraits';

// Low-poly B-17 crewman for the living interior: sheepskin or leather flight jacket, flak
// vest and harness, leather helmet with goggles and an A-14 oxygen mask. Built from
// primitives with vertex colours, so a whole man shares one material. Twelve parts
// (torso, head, two-bone arms and legs) are posed each frame by a tiny IK; a man who never
// moves (the radio operator, the tail gunner) is baked into a single mesh instead.
//
// Figure frame: origin on the floor between the feet, +Z forward (the way he faces),
// +Y up, +X his left.

export interface FigureLook {
  jacket: THREE.Color; collar: THREE.Color; trousers: THREE.Color;
  helmet: THREE.Color; skin: THREE.Color; vest: boolean;
}

const C = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
const JACKETS: Record<string, [THREE.Color, THREE.Color]> = {
  b3: [C(0.14, 0.078, 0.042), C(0.6, 0.52, 0.38)],   // B-3 sheepskin: dark brown hide, cream fleece
  a2: [C(0.13, 0.075, 0.045), C(0.12, 0.08, 0.05)],   // A-2 horsehide, knit collar
  olive: [C(0.14, 0.14, 0.085), C(0.1, 0.1, 0.06)],   // rookie: olive drab
};

export function lookOf(p: PortraitLook | null | undefined, rookie = false): FigureLook {
  const j = JACKETS[rookie ? 'olive' : (p?.jacket ?? 'b3')] ?? JACKETS.b3;
  const skin = new THREE.Color(p?.skin ?? '#e0b090').convertSRGBToLinear().multiplyScalar(0.7); // cold, windburnt
  return {
    jacket: j[0].clone(), collar: j[1].clone(),
    trousers: rookie ? C(0.12, 0.12, 0.075) : C(0.16, 0.1, 0.06),
    helmet: rookie ? C(0.2, 0.13, 0.07) : C(0.11, 0.065, 0.035),
    skin, vest: !rookie,
  };
}

// Shared by every figure: vertex colours carry the clothing
let figMat: THREE.MeshStandardMaterial | null = null;
export function figureMaterial(): THREE.MeshStandardMaterial {
  figMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, envMap: envRef.tex, envMapIntensity: 0.08 });
  return figMat;
}

// Paint a geometry one colour and move it into place
function part(g: THREE.BufferGeometry, col: THREE.Color, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  g.translate(x, y, z);
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const merge = (gs: THREE.BufferGeometry[]) => { const m = mergeGeometries(gs, false)!; gs.forEach((g) => g.dispose()); return m; };
// capsule standing on its base at the origin, running up +Y
const bone = (r: number, len: number, segs = 7) => new THREE.CapsuleGeometry(r, len, 2, segs).translate(0, len / 2, 0);

// Segment lengths
const UPPER = 0.27, FORE = 0.26, THIGH = 0.36, SHIN = 0.38, SPINE = 0.46;
const DARK = C(0.035, 0.03, 0.025), GLOVE = C(0.06, 0.04, 0.03), WEB = C(0.32, 0.29, 0.2), VEST = C(0.12, 0.13, 0.08);
const RUBBER = C(0.07, 0.085, 0.06), LENS = C(0.02, 0.025, 0.03), BRASSY = C(0.35, 0.28, 0.12);

function buildParts(L: FigureLook) {
  // Torso (origin at the hip joint, spine up +Y, chest facing +Z)
  const torso: THREE.BufferGeometry[] = [
    part(new THREE.BoxGeometry(0.34, 0.17, 0.22), L.trousers, 0, 0.03, 0),
    part(new THREE.CapsuleGeometry(0.16, 0.26, 3, 10).scale(1.15, 1, 0.8), L.jacket, 0, 0.27, 0),
    part(new THREE.SphereGeometry(0.08, 8, 6), L.jacket, 0.19, SPINE - 0.05, 0),
    part(new THREE.SphereGeometry(0.08, 8, 6), L.jacket, -0.19, SPINE - 0.05, 0),
    part(new THREE.TorusGeometry(0.095, 0.045, 6, 12).rotateX(Math.PI / 2), L.collar, 0, SPINE - 0.01, 0),
    // oxygen hose from the mask down the chest to the regulator clip
    part(new THREE.CylinderGeometry(0.016, 0.016, 0.3, 6).rotateZ(0.18), RUBBER, 0.03, 0.33, 0.165),
  ];
  if (L.vest) {
    // M1 flak vest: front and back aprons over the jacket, with a pull-cord tab
    torso.push(part(new THREE.BoxGeometry(0.32, 0.3, 0.04), VEST, 0, 0.27, 0.12));
    torso.push(part(new THREE.BoxGeometry(0.32, 0.3, 0.04), VEST, 0, 0.27, -0.12));
    torso.push(part(new THREE.BoxGeometry(0.05, 0.05, 0.02), C(0.5, 0.06, 0.04), -0.12, 0.13, 0.16));
  } else {
    // parachute harness webbing straight on the jacket
    for (const s of [1, -1]) torso.push(part(new THREE.BoxGeometry(0.04, 0.38, 0.014), WEB, s * 0.09, 0.27, 0.142));
    torso.push(part(new THREE.BoxGeometry(0.26, 0.04, 0.014), WEB, 0, 0.2, 0.145));
  }
  // Head (origin at the neck, face +Z)
  const head = merge([
    part(new THREE.CylinderGeometry(0.05, 0.055, 0.08, 8), L.skin, 0, 0.03, 0),
    part(new THREE.SphereGeometry(0.098, 12, 9), L.skin, 0, 0.14, 0.005),
    part(new THREE.SphereGeometry(0.107, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.4), L.helmet, 0, 0.145, -0.008),
    // sides and back down over the ears, open at the face
    part(new THREE.SphereGeometry(0.107, 12, 4, Math.PI / 2 + 0.8, Math.PI * 2 - 1.6, Math.PI * 0.4, Math.PI * 0.28), L.helmet, 0, 0.145, -0.008),
    part(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 10).rotateZ(Math.PI / 2), L.helmet, 0.1, 0.13, 0),
    part(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 10).rotateZ(Math.PI / 2), L.helmet, -0.1, 0.13, 0),
    part(new THREE.BoxGeometry(0.2, 0.02, 0.04), DARK, 0, 0.175, 0.06),                           // goggle strap
    part(new THREE.CylinderGeometry(0.028, 0.028, 0.026, 10).rotateX(Math.PI / 2), LENS, 0.038, 0.168, 0.092),
    part(new THREE.CylinderGeometry(0.028, 0.028, 0.026, 10).rotateX(Math.PI / 2), LENS, -0.038, 0.168, 0.092),
    part(new THREE.SphereGeometry(0.06, 10, 8).scale(0.9, 1.1, 0.8), RUBBER, 0, 0.085, 0.085),   // A-14 mask
    part(new THREE.CylinderGeometry(0.018, 0.022, 0.03, 8).rotateX(Math.PI / 2), BRASSY, 0, 0.06, 0.135),
  ]);
  const upper = merge([part(bone(0.058, UPPER - 0.06), L.jacket)]);
  const fore = merge([
    part(bone(0.052, FORE - 0.06), L.jacket),
    part(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 8), L.collar, 0, FORE - 0.04, 0),          // knit cuff
    part(new THREE.SphereGeometry(0.05, 8, 6).scale(0.8, 1.15, 1), GLOVE, 0, FORE + 0.02, 0),
  ]);
  const thigh = merge([part(bone(0.075, THIGH - 0.08), L.trousers)]);
  const shin = merge([
    part(bone(0.064, SHIN - 0.07), L.trousers),
    part(new THREE.BoxGeometry(0.115, 0.1, 0.27), DARK, 0, SHIN + 0.0, 0.05),                     // flying boot
  ]);
  return { torso: merge(torso), head, upper, fore, thigh, shin };
}

// ---------- pose ----------
export interface Pose {
  hip: THREE.Vector3;          // hip joint, figure frame
  lean: number;                // spine pitch, + = forward
  roll: number;                // spine roll (slumped against a wall)
  headPitch: number;           // + = chin down
  headYaw: number;
  handL: THREE.Vector3; handR: THREE.Vector3;
  footL: THREE.Vector3; footR: THREE.Vector3;
}
export const newPose = (): Pose => ({ hip: new THREE.Vector3(0, 0.66, 0), lean: 0.3, roll: 0, headPitch: 0, headYaw: 0, handL: new THREE.Vector3(0.2, 0.9, 0.3), handR: new THREE.Vector3(-0.2, 0.9, 0.3), footL: new THREE.Vector3(0.13, 0.08, 0.05), footR: new THREE.Vector3(-0.13, 0.08, -0.05) });
export function lerpPose(a: Pose, b: Pose, k: number, out: Pose): Pose {
  out.hip.lerpVectors(a.hip, b.hip, k);
  out.lean = a.lean + (b.lean - a.lean) * k;
  out.roll = a.roll + (b.roll - a.roll) * k;
  out.headPitch = a.headPitch + (b.headPitch - a.headPitch) * k;
  out.headYaw = a.headYaw + (b.headYaw - a.headYaw) * k;
  out.handL.lerpVectors(a.handL, b.handL, k); out.handR.lerpVectors(a.handR, b.handR, k);
  out.footL.lerpVectors(a.footL, b.footL, k); out.footR.lerpVectors(a.footR, b.footR, k);
  return out;
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _a = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
const _sh = new THREE.Vector3(), _end = new THREE.Vector3(), _mid = new THREE.Vector3();
const POLE_ARM_L = new THREE.Vector3(1, -0.8, -0.4), POLE_ARM_R = new THREE.Vector3(-1, -0.8, -0.4);
const POLE_LEG = new THREE.Vector3(0, 0.15, 1);
const FWD = new THREE.Vector3(0, 0, 1), UP = new THREE.Vector3(0, 1, 0);

// Point a bone mesh (built along +Y) from a to b, keeping its +Z close to `hint`
function orient(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, hint: THREE.Vector3) {
  _y.subVectors(b, a).normalize();
  _z.copy(hint).addScaledVector(_y, -hint.dot(_y));
  if (_z.lengthSq() < 1e-4) _z.copy(UP).addScaledVector(_y, -_y.y);
  _z.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  m.quaternion.setFromRotationMatrix(_m);
  m.position.copy(a);
}

// Two-bone IK: root a, target t, lengths l1/l2, bend toward `pole`. Writes the joint to `mid`
// and the (reach-clamped) end to `end`.
function ik(a: THREE.Vector3, t: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3, mid: THREE.Vector3, end: THREE.Vector3) {
  _d.subVectors(t, a);
  let d = _d.length();
  if (d < 1e-5) { _d.set(0, -1, 0); d = 1e-5; } else _d.divideScalar(d);
  d = THREE.MathUtils.clamp(d, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.002);
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-6) _p.set(0, -1, 0);
  _p.normalize();
  mid.copy(a).addScaledVector(_d, x).addScaledVector(_p, h);
  end.copy(a).addScaledVector(_d, d);
}

export class CrewFigure {
  readonly root = new THREE.Group();
  private torso: THREE.Mesh; private head: THREE.Mesh;
  private upL: THREE.Mesh; private upR: THREE.Mesh; private foL: THREE.Mesh; private foR: THREE.Mesh;
  private thL: THREE.Mesh; private thR: THREE.Mesh; private shL: THREE.Mesh; private shR: THREE.Mesh;
  private geos: THREE.BufferGeometry[];

  constructor(look: FigureLook) {
    const p = buildParts(look);
    this.geos = Object.values(p);
    const mat = figureMaterial();
    const mk = (g: THREE.BufferGeometry) => { const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; this.root.add(m); return m; };
    this.torso = mk(p.torso); this.head = mk(p.head);
    this.upL = mk(p.upper); this.upR = mk(p.upper); this.foL = mk(p.fore); this.foR = mk(p.fore);
    this.thL = mk(p.thigh); this.thR = mk(p.thigh); this.shL = mk(p.shin); this.shR = mk(p.shin);
    this.root.name = 'crewFigure';
  }

  apply(P: Pose) {
    // spine
    this.torso.position.copy(P.hip);
    _e.set(P.lean, 0, P.roll, 'YXZ');
    this.torso.quaternion.setFromEuler(_e);
    _q.copy(this.torso.quaternion);
    const neck = _a.set(0, SPINE, 0).applyQuaternion(_q).add(P.hip);
    this.head.position.copy(neck);
    _e.set(P.headPitch, P.headYaw, 0, 'YXZ');
    this.head.quaternion.copy(_q).multiply(_q2.setFromEuler(_e));
    // arms
    for (const s of [1, -1] as const) {
      _sh.set(s * 0.2, SPINE - 0.07, 0).applyQuaternion(_q).add(P.hip);
      ik(_sh, s > 0 ? P.handL : P.handR, UPPER, FORE, s > 0 ? POLE_ARM_L : POLE_ARM_R, _mid, _end);
      orient(s > 0 ? this.upL : this.upR, _sh, _mid, FWD);
      orient(s > 0 ? this.foL : this.foR, _mid, _end, FWD);
    }
    // legs
    for (const s of [1, -1] as const) {
      _sh.set(s * 0.1, -0.02, 0).applyQuaternion(_q).add(P.hip);
      ik(_sh, s > 0 ? P.footL : P.footR, THIGH, SHIN, POLE_LEG, _mid, _end);
      orient(s > 0 ? this.thL : this.thR, _sh, _mid, FWD);
      orient(s > 0 ? this.shL : this.shR, _mid, _end, FWD);
    }
  }

  // Freeze the current pose into one mesh (one draw call) and drop the parts
  bake(): THREE.Mesh {
    this.root.updateMatrixWorld(true);
    _m.copy(this.root.matrixWorld).invert();
    const gs: THREE.BufferGeometry[] = [];
    for (const c of this.root.children) {
      const m = c as THREE.Mesh;
      gs.push(m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(_m, m.matrixWorld)));
    }
    const mesh = new THREE.Mesh(merge(gs), figureMaterial());
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.dispose();
    return mesh;
  }

  dispose() {
    this.root.removeFromParent();
    this.root.clear();
    for (const g of this.geos) g.dispose();
  }
}

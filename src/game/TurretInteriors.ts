import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SunShafts } from './InteriorFx';
import { figureMaterial, lookOf } from './CrewFigure';

// Gun-frame metres (+Z aft/outward). Static clothing and fittings are vertex-coloured,
// merged into one draw each; the shared crew material is warmed by warmLivingInterior.
export const TAIL_FLOOR = -0.38;
export const TAIL_HALF_WIDTH = 0.42;
export const FREE_LOOK_YAW = { waist: 2.7, turret: 2.8, tail: 2.95 };
export const FREE_LOOK_UP = 1.5;
const OLIVE = new THREE.Color(0.12, 0.135, 0.09);
const METAL = new THREE.Color(0.24, 0.25, 0.22);
const DARK = new THREE.Color(0.032, 0.028, 0.023);
const PAD = new THREE.Color(0.13, 0.075, 0.036);

class Parts {
  private parts: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, c: THREE.Color, x = 0, y = 0, z = 0) {
    g.translate(x, y, z);
    const col = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
  }
  box(w: number, h: number, d: number, x: number, y: number, z: number, c = OLIVE) {
    this.add(new THREE.BoxGeometry(w, h, d), c, x, y, z);
  }
  bone(a: THREE.Vector3, b: THREE.Vector3, r: number, c: THREE.Color) {
    const delta = b.clone().sub(a);
    const geo = new THREE.CapsuleGeometry(r, Math.max(0.01, delta.length() - 2 * r), 3, 10);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    const mid = a.clone().add(b).multiplyScalar(0.5);
    this.add(geo, c, mid.x, mid.y, mid.z);
  }
  mesh(name: string) {
    const m = new THREE.Mesh(mergeGeometries(this.parts, false)!, figureMaterial());
    this.parts.forEach(g => g.dispose());
    m.name = name; m.castShadow = m.receiveShadow = true;
    return m;
  }
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function buildBallDetails() {
  const group = new THREE.Group(); group.name = 'ballLivingInterior';
  const body = new Parts(), kit = new Parts(), clothes = lookOf(null);
  for (const s of [-1, 1]) {
    // Knees drawn up beside the eye; feet rest on the pedals beyond them.
    body.bone(V(s * 0.17, -0.37, -0.24), V(s * 0.31, -0.16, 0.17), 0.092, clothes.trousers);
    body.bone(V(s * 0.31, -0.16, 0.17), V(s * 0.27, -0.40, 0.39), 0.073, clothes.trousers);
    body.add(new THREE.SphereGeometry(1, 12, 8).scale(0.082, 0.062, 0.15), DARK, s * 0.27, -0.43, 0.43);
    kit.box(0.17, 0.018, 0.20, s * 0.27, -0.49, 0.40, METAL);
    kit.box(0.11, 0.20, 0.32, s * 0.46, -0.22, -0.16);
    // Corrugated feed chute beside each breech, leaving the central glass clear.
    for (let i = 0; i < 15; i++) kit.box(0.13, 0.012, 0.025, s * 0.46, -0.075, -0.40 + i * 0.026, METAL);
    kit.bone(V(s * 0.53, -0.28, -0.22), V(s * 0.49, 0.35, -0.21), 0.018, METAL);
    kit.box(0.035, 0.13, 0.08, s * 0.32, -0.1, -0.16, DARK);
  }
  kit.box(0.36, 0.065, 0.32, 0, -0.40, -0.24, PAD);
  kit.box(0.07, 0.055, 0.12, 0, -0.115, 0.30, DARK); // reflector projector between knees
  kit.box(0.015, 0.12, 0.015, 0, -0.18, 0.30, METAL);
  // Open access hatch overhead/back, with hinge, latch and fuselage ribs beyond it.
  kit.add(new THREE.TorusGeometry(0.29, 0.025, 8, 36).rotateX(Math.PI / 2), METAL, 0, 0.48, -0.16);
  kit.box(0.48, 0.035, 0.43, 0, 0.74, -0.47);
  kit.box(0.24, 0.022, 0.04, 0, 0.70, -0.42, METAL);
  for (const s of [-1, 1]) {
    kit.box(0.045, 0.32, 0.75, s * 0.34, 0.72, -0.15);
    kit.box(0.06, 0.12, 0.04, s * 0.22, 0.49, -0.17, DARK);
  }
  kit.box(0.73, 0.04, 0.80, 0, 0.90, -0.20);
  for (let i = 0; i < 4; i++) kit.box(0.68, 0.04, 0.018, 0, 0.87, -0.49 + i * 0.20, METAL);
  group.add(body.mesh('ballKneesAndBoots'), kit.mesh('ballChutesHatchAndFuselage'));
  return group;
}

export function buildTailDetails() {
  const group = new THREE.Group(); group.name = 'tailLivingInterior';
  const shell = new Parts(), body = new Parts(), clothes = lookOf(null);
  // Continuous tapered panels: their joints overlap ribs, without cracks to the sky.
  for (let i = 0; i < 13; i++) {
    const z = 0.53 - i * 0.58, w = 0.45 + i * 0.035, h = 0.5 + i * 0.025;
    shell.box(0.028, h * 2, 0.04, -w, 0.08, z, METAL);
    shell.box(0.028, h * 2, 0.04, w, 0.08, z, METAL);
    shell.box(w * 2, 0.025, 0.04, 0, h + 0.08, z, METAL);
    if (i < 12) {
      for (const side of [-1, 1]) {
        const wall = new THREE.BoxGeometry(0.03, (h + 0.025) * 2, 0.59);
        wall.rotateY(-side * Math.atan2(0.035, 0.58));
        shell.add(wall, OLIVE, side * (w + 0.0325), 0.08, z - 0.29);
      }
      shell.add(new THREE.BoxGeometry((w + 0.05) * 2, 0.03, 0.59).rotateX(Math.atan2(0.025, 0.58)), OLIVE, 0, h + 0.108, z - 0.29);
      shell.box((w + 0.05) * 2, 0.04, 0.61, 0, TAIL_FLOOR - 0.02, z - 0.29, DARK);
    }
  }
  // Bicycle saddle and kneeling pads. No chair back blocking the view forward.
  shell.add(new THREE.SphereGeometry(1, 16, 8).scale(0.15, 0.038, 0.21), PAD, 0, -0.19, -0.72);
  shell.box(0.025, 0.17, 0.025, 0, -0.285, -0.72, METAL);
  for (const s of [-1, 1]) {
    shell.box(0.16, 0.026, 0.24, s * 0.22, -0.352, -0.30, PAD);
    body.bone(V(s * 0.14, -0.17, -0.64), V(s * 0.22, -0.29, -0.28), 0.075, clothes.trousers);
    body.bone(V(s * 0.22, -0.29, -0.28), V(s * 0.22, -0.31, -0.72), 0.062, clothes.trousers);
    body.add(new THREE.SphereGeometry(1, 12, 8).scale(0.075, 0.06, 0.13), DARK, s * 0.22, -0.30, -0.82);
    // Belts run forward down the fuselage on open trays.
    shell.box(0.14, 0.018, 1.70, s * 0.36, -0.13, -1.06, METAL);
    shell.box(0.20, 0.24, 0.38, s * 0.38, -0.20, -2.03);
    for (const y of [0.22, 0.29]) shell.bone(V(s * 0.41, y, -0.65), V(s * 0.77, y + 0.08, -4.6), 0.007, METAL);
  }
  // Raised wheel-well cover with reinforcing hoops and control-cable pulleys.
  shell.add(new THREE.CylinderGeometry(0.25, 0.25, 0.82, 16).rotateZ(Math.PI / 2), OLIVE, 0, -0.42, -2.70);
  for (const x of [-0.34, 0.34]) shell.add(new THREE.TorusGeometry(0.255, 0.012, 6, 24).rotateY(Math.PI / 2), METAL, x, -0.42, -2.70);
  for (const s of [-1, 1]) shell.add(new THREE.TorusGeometry(0.042, 0.008, 6, 16), DARK, s * 0.5, 0.27, -1.5);
  // Open waist bulkhead at the far end; actual sky comes through side openings.
  shell.box(0.16, 1.25, 0.045, -0.65, 0.12, -6.65);
  shell.box(0.16, 1.25, 0.045, 0.65, 0.12, -6.65);
  shell.box(1.45, 0.10, 0.045, 0, 0.78, -6.65);
  group.add(shell.mesh('tailConeSeatWheelWellAndCables'), body.mesh('tailKneelingLegs'));
  return group;
}

// The same soft, sun-directed prism used at the waist, with station-local apertures.
export function stationShafts(kind: 'ball' | 'tail') {
  return new SunShafts(0, 0, [kind === 'ball' ? {
    corners: [V(-0.20, 0.47, -0.34), V(0.20, 0.47, -0.34), V(0.20, 0.47, 0.02), V(-0.20, 0.47, 0.02)], out: V(0, 1, 0),
  } : {
    corners: [V(-0.32, -0.14, 0.49), V(0.32, -0.14, 0.49), V(0.32, 0.44, 0.49), V(-0.32, 0.44, 0.49)], out: V(0, 0, 1),
  }]);
}

export function disposeStationDetails(group: THREE.Object3D) {
  group.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
}


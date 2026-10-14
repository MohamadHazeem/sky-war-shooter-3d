import * as THREE from 'three';
import type { Fighter, HitZone } from './Aircraft';
import { ENEMY_VARIANTS, tintModel, type EnemyType } from './EnemyTypes';

// Per-type fitting of the late-war enemy types, done by World.spawnEnemy right after the
// airframe is built (before the paint/damage-look copies, the scale and the zone toughening):
//
//   he111  hit zones fitted to the He 111 (two engines, glazed nose, long fuselage, 22.5 m span)
//   do335  hit zones for the push-pull layout (nose engine and the rear engine behind the tail)
//   me410  the Bf 110 airframe stands in for the Me 410 (there is no GPL Me 410 model): a lighter
//          day-fighter grey, the BK 5 50 mm cannon in a ventral tray with its long barrel under
//          the nose, and the two FDL 131 remote barbettes on the fuselage sides (barbette_left /
//          barbette_right, each with a muzzle child; RearGunners swings and fires them). The
//          stand-in's rear-cockpit MG is hidden (the Me 410 had none).
//
// Zones are in the model's own (unscaled) frame: +X left wing, +Y up, +Z nose. Engine zones carry
// the prop index (engine 0 = prop_1), so a shot-out engine stops its own propeller. The first
// engine zone keeps the name 'engine' (Fighter.update, Exhaust, FighterDeath read it).
// New meshes reuse the airframe's own materials (no new shader programs on the first spawn or
// the first kill: World.prewarm compiles every enemy model's materials).

type ZoneDef = [name: string, x: number, y: number, z: number, r: number, hp: number, extra?: Partial<HitZone>];

const ZONES: Partial<Record<EnemyType, { radius: number; zones: ZoneDef[] }>> = {
  // Hero models (tools/hero/luftwaffe): zones over their named parts (part_* in docs/phase10/hero-parts.md).
  // The Fw 190 A-8 keeps the base layout (Aircraft.ts), which it was built to match.
  // Bf 109 G-6: prop hub z 2.43, cockpit z -1.0, tail -5.9, span +-4.96
  bf109: {
    radius: 7,
    zones: [
      ['engine', 0, 0.0, 1.35, 0.75, 130, { engine: 0 }],
      ['cockpit', 0, 0.5, -1.0, 0.55, 95, { critical: true }],
      ['fuselage', 0, 0.1, -3.0, 0.7, 170, { critical: true }],
      ['tail', 0, 0.55, -5.3, 1.0, 120, { critical: true }],
      ['wingL', 2.5, -0.3, -0.55, 1.45, 150, { critical: true }],
      ['wingR', -2.5, -0.3, -0.55, 1.45, 150, { critical: true }],
    ],
  },
  // Me 262 A-1a (FlightGear shape scaled to the published span / length): nacelles at x +-2.21 under the
  // wing, cockpit z -0.72, tail -6.1, span +-6.28
  me262: {
    radius: 8,
    zones: [
      ['engine', 2.21, -0.86, -0.3, 0.75, 120, { engine: 0 }],
      ['engine2', -2.21, -0.86, -0.3, 0.75, 120, { engine: 1 }],
      ['cockpit', 0, 0.55, -0.75, 0.6, 95, { critical: true }],
      ['fuselage', 0, 0.1, -2.6, 0.75, 170, { critical: true }],
      ['tail', 0, 0.75, -6.1, 1.2, 120, { critical: true }],
      ['wingL', 3.9, -0.2, -1.1, 1.7, 150, { critical: true }],
      ['wingR', -3.9, -0.2, -1.1, 1.7, 150, { critical: true }],
    ],
  },
  // Bf 110 G-2: engines at x +-2.35, crew z 1.2 / -0.6, twin fins at x +-2.25 z -7.9, span +-8.2
  bf110: {
    radius: 9,
    zones: [
      ['engine', 2.35, -0.2, 1.0, 0.8, 130, { engine: 0 }],
      ['engine2', -2.35, -0.2, 1.0, 0.8, 130, { engine: 1 }],
      ['cockpit', 0, 0.55, 0.6, 0.85, 110, { critical: true }],
      ['fuselage', 0, 0.15, -2.6, 0.8, 190, { critical: true }],
      ['tail', 0, 0.45, -7.3, 1.8, 140, { critical: true }],
      ['wingL', 4.6, -0.05, -0.6, 1.9, 170, { critical: true }],
      ['wingR', -4.6, -0.05, -0.6, 1.9, 170, { critical: true }],
      ['wingLtip', 6.9, 0.15, -0.55, 1.2, 110],
      ['wingRtip', -6.9, 0.15, -0.55, 1.2, 110],
    ],
  },
  // Ju 88 A-4: engines at x +-2.78, glazed nose z 1..3.8, tail -9.3, span +-10
  ju88: {
    radius: 11,
    zones: [
      ['engine', 2.78, -0.34, 1.2, 0.9, 150, { engine: 0 }],
      ['engine2', -2.78, -0.34, 1.2, 0.9, 150, { engine: 1 }],
      ['cockpit', 0, 0.6, 2.1, 1.05, 120, { critical: true }],
      ['fuselage', 0, 0.2, -2.0, 0.95, 230, { critical: true }],
      ['fuselageAft', 0, 0.3, -5.8, 0.8, 200],
      ['tail', 0, 1.0, -9.0, 1.9, 170, { critical: true }],
      ['wingL', 5.4, 0.2, -1.05, 2.3, 210, { critical: true }],
      ['wingR', -5.4, 0.2, -1.05, 2.3, 210, { critical: true }],
      ['wingLtip', 8.6, 0.55, -1.15, 1.5, 130],
      ['wingRtip', -8.6, 0.55, -1.15, 1.5, 130],
    ],
  },
  // He 111 H (he111.glb): nose +4.1, tail -12.9, props at x +-2.68 z 3.16, span +-11.3
  he111: {
    radius: 12.5,
    zones: [
      ['engine', 2.68, -0.45, 2.1, 1.05, 150, { engine: 0 }],
      ['engine2', -2.68, -0.45, 2.1, 1.05, 150, { engine: 1 }],
      ['cockpit', 0, 0.25, 3.0, 1.1, 120, { critical: true }],
      ['fuselage', 0, 0.2, -1.6, 1.15, 230, { critical: true }],
      ['fuselageAft', 0, 0.35, -6.6, 1.0, 200],
      ['tail', 0, 0.9, -11.7, 1.7, 170, { critical: true }],
      ['wingL', 5.4, -0.1, 0.9, 2.3, 210, { critical: true }],
      ['wingR', -5.4, -0.1, 0.9, 2.3, 210, { critical: true }],
      ['wingLtip', 9.2, 0.15, 0.2, 1.7, 130],
      ['wingRtip', -9.2, 0.15, 0.2, 1.7, 130],
    ],
  },
  // Do 335 (do335.glb): nose prop z 4.79, rear prop z -8.44, cockpit z ~1, span +-6.9
  do335: {
    radius: 9.5,
    zones: [
      ['engine', 0, 0.05, 3.5, 0.95, 130, { engine: 0 }],
      ['engine2', 0, 0.35, -5.6, 0.85, 110, { engine: 1 }],
      ['cockpit', 0, 0.75, 0.9, 0.65, 95, { critical: true }],
      ['fuselage', 0, 0.25, -2.4, 0.8, 170, { critical: true }],
      ['tail', 0, 0.5, -7.6, 1.25, 120, { critical: true }],
      ['wingL', 3.1, -0.25, -0.1, 1.7, 150, { critical: true }],
      ['wingR', -3.1, -0.25, -0.1, 1.7, 150, { critical: true }],
    ],
  },
};

ZONES.me410 = ZONES.bf110; // the Me 410 flies the Bf 110 airframe

// first material of a named node's meshes (the stand-in's own gun / skin materials)
function matOf(model: THREE.Object3D, node: string): THREE.Material | null {
  let mat: THREE.Material | null = null;
  model.getObjectByName(node)?.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!mat && m.isMesh) mat = Array.isArray(m.material) ? m.material[0] : m.material;
  });
  return mat;
}

// shared geometries (never disposed: every Me 410 uses them)
let geo: { barrel: THREE.BufferGeometry; brake: THREE.BufferGeometry; tray: THREE.BufferGeometry; blister: THREE.BufferGeometry; mg: THREE.BufferGeometry } | null = null;
function geos() {
  return geo ??= {
    barrel: new THREE.CylinderGeometry(0.055, 0.065, 4.4, 10).rotateX(Math.PI / 2),
    brake: new THREE.CylinderGeometry(0.1, 0.1, 0.32, 10).rotateX(Math.PI / 2),
    tray: new THREE.CapsuleGeometry(0.2, 2.6, 4, 10).rotateX(Math.PI / 2),
    blister: new THREE.SphereGeometry(1, 12, 8).scale(0.2, 0.19, 0.42),
    mg: new THREE.CylinderGeometry(0.028, 0.028, 0.9, 6).rotateX(Math.PI / 2),
  };
}

// BK 5 muzzle in the Me 410 model frame (unscaled): read by the stand-off cannon run (Tactics.ts)
export const BK5_MUZZLE = new THREE.Vector3(0, -0.62, 5.75);

// The airframe texture coordinate nearest a model-frame point: the painted add-ons (tray,
// blisters) take the paint of the skin next to them instead of a random part of the atlas
function uvNear(model: THREE.Object3D, p: THREE.Vector3): [number, number] | null {
  let best = Infinity, uv: [number, number] | null = null;
  const v = new THREE.Vector3();
  model.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const m4 = new THREE.Matrix4();
  model.getObjectByName('airframe')?.traverse((o) => {
    const m = o as THREE.Mesh;
    const pos = m.isMesh ? m.geometry.getAttribute('position') : null;
    const tc = m.isMesh ? m.geometry.getAttribute('uv') : null;
    if (!pos || !tc) return;
    m4.multiplyMatrices(inv, m.matrixWorld);
    for (let i = 0; i < pos.count; i += 3) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m4);
      const d = v.distanceToSquared(p);
      if (d < best) { best = d; uv = [tc.getX(i), tc.getY(i)]; }
    }
  });
  return uv;
}

function paintUV(g: THREE.BufferGeometry, uv: [number, number] | null) {
  const tc = g.getAttribute('uv');
  if (!uv || !tc) return;
  for (let i = 0; i < tc.count; i++) tc.setXY(i, uv[0], uv[1]);
  tc.needsUpdate = true;
}

let painted = false;

function dressMe410(f: Fighter) {
  const model = f.model;
  const gm = matOf(model, 'gun_rear'), sm = matOf(model, 'airframe');
  const g = geos();
  // the rear-cockpit MG 81Z belongs to the Bf 110
  const rear = model.getObjectByName('gun_rear');
  rear?.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.visible = false; });
  if (!gm || !sm) return;
  if (!painted) {
    painted = true;
    paintUV(g.tray, uvNear(model, new THREE.Vector3(0, -0.45, 1.2)));
    paintUV(g.blister, uvNear(model, new THREE.Vector3(0.5, 0.12, -1.75)));
  }
  // BK 5 in its ventral tray, the barrel reaching well past the nose
  const tray = new THREE.Mesh(g.tray, sm);
  tray.position.set(0, -0.5, 1.2);
  const barrel = new THREE.Mesh(g.barrel, gm);
  barrel.position.set(0, -0.62, 3.4);
  const brake = new THREE.Mesh(g.brake, gm);
  brake.position.set(0, -0.62, 5.6);
  model.add(tray, barrel, brake);
  // FDL 131 barbettes: a blister either side of the fuselage, one MG 131 pointing aft from each
  for (const side of [1, -1]) {
    const node = new THREE.Group();
    node.name = side > 0 ? 'barbette_left' : 'barbette_right';
    node.position.set(0.5 * side, 0.12, -1.75);
    const blister = new THREE.Mesh(g.blister, sm);
    node.add(blister);
    const mg = new THREE.Mesh(g.mg, gm);
    mg.position.set(0, 0, -0.55);
    node.add(mg);
    const muzzle = new THREE.Object3D();
    muzzle.name = 'muzzle_' + node.name;
    muzzle.position.set(0, 0, -1.0);
    node.add(muzzle);
    model.add(node);
  }
  for (const o of [tray, barrel, brake]) { o.castShadow = true; o.receiveShadow = true; }
}

// Called by World.spawnEnemy (own = the type's own model loaded; otherwise it flies the Fw 190
// airframe and keeps the Fw 190 layout)
export function dressEnemy(f: Fighter, type: EnemyType, own: boolean) {
  const v = ENEMY_VARIANTS[type];
  if (!own) return;
  if (v.ownTint && v.tint) tintModel(f.model, v.tint);
  const layout = ZONES[type];
  if (layout) {
    f.zones = layout.zones.map(([name, x, y, z, r, hp, extra]) => ({ name, offset: new THREE.Vector3(x, y, z), radius: r, hp, maxHp: hp, ...extra }));
    f.radius = layout.radius;
  }
  if (type === 'me410') dressMe410(f);
}

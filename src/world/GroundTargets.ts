import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { World } from './World';
import type { Aircraft, Fighter } from './Aircraft';
import { instantiate, hasModel, type ModelKind } from './Models';
import { type Countryside, terrainHeight, hazed, vcolored } from './Countryside';
import { segSphere } from './Ballistics';
import { sound } from '../audio/Sound';

// Ground targets for the P-51 ground-attack operation (StrafeOps.ts): a steam train (locomotive,
// goods and tank wagons, a flak wagon), truck convoys with a flak half-track, aircraft parked on
// an airfield (the enemy models, static) and 20 mm flak positions / a quad-20 mm flak tower that
// shoot back with tracer.
//  * Drawn as one InstancedMesh per kind (vertex-coloured boxes and cylinders), children of the
//    countryside group (map coordinates, so the floating origin moves them too); parked aircraft
//    are model instances; flak guns are small yaw / pitch rigs that track their target.
//  * Hit detection: Ballistics.ground (installed by attach()) tests every round that hit no
//    aircraft against each live target's hit spheres, then against the terrain: strafing rounds
//    that miss kick up pooled dust and dirt along the ground.
//  * Destroyed targets char (instance colour), tilt and burn; the locomotive bursts its boiler in a
//    cloud of steam; fuel goes up in a fireball. onDestroyed reports who gets the credit.

export type GroundKind = 'loco' | 'boxcar' | 'tanker' | 'flakcar' | 'truck' | 'fueltruck' | 'halftrack' | 'plane' | 'flak' | 'flaktower';
export type Credit = 'player' | 'wing' | 'other';

interface FlakSpec { h: number; z: number; barrels: number; rate: number; range: number }
interface KindDef { label: string; hp: number; score: number; spheres: [number, number, number, number][]; boom: number; fuel?: boolean; flak?: FlakSpec; scale: number }

export const GROUND_KINDS: Record<GroundKind, KindDef> = {
  loco: { label: 'Locomotive', hp: 900, score: 500, scale: 1.2, boom: 0.5, spheres: [[0, 2.6, 4.2, 2.4], [0, 2.8, -1.6, 2.4], [0, 2.3, -7.4, 2.6]] },
  boxcar: { label: 'Goods wagon', hp: 220, score: 60, scale: 1.2, boom: 0.35, spheres: [[0, 2.4, 2.6, 3.0], [0, 2.4, -2.6, 3.0]] },
  tanker: { label: 'Tank wagon', hp: 200, score: 120, scale: 1.2, boom: 1.2, fuel: true, spheres: [[0, 2.5, 2.4, 2.7], [0, 2.5, -2.4, 2.7]] },
  flakcar: { label: 'Flak wagon', hp: 260, score: 150, scale: 1.2, boom: 0.5, spheres: [[0, 1.8, 2.5, 3.0], [0, 1.8, -2.5, 3.0]], flak: { h: 1.9, z: 0, barrels: 1, rate: 7, range: 1900 } },
  truck: { label: 'Truck', hp: 150, score: 100, scale: 1.2, boom: 0.4, spheres: [[0, 1.8, 1.6, 1.9], [0, 1.9, -1.4, 2.1]] },
  fueltruck: { label: 'Fuel truck', hp: 140, score: 150, scale: 1.2, boom: 1.1, fuel: true, spheres: [[0, 1.8, 1.6, 1.9], [0, 1.9, -1.4, 2.1]] },
  halftrack: { label: 'Flak half-track', hp: 220, score: 150, scale: 1.2, boom: 0.5, spheres: [[0, 1.6, 1.4, 2.0], [0, 1.8, -1.6, 2.2]], flak: { h: 2.3, z: -1.3, barrels: 1, rate: 7, range: 1800 } },
  plane: { label: 'Aircraft on the ground', hp: 170, score: 200, scale: 1, boom: 0.7, fuel: true, spheres: [] },
  flak: { label: '20 mm flak', hp: 170, score: 150, scale: 1.1, boom: 0.45, spheres: [[0, 1.2, 0, 3.0]], flak: { h: 0.7, z: 0, barrels: 1, rate: 7, range: 2000 } },
  flaktower: { label: 'Flak tower', hp: 480, score: 300, scale: 1.1, boom: 0.9, spheres: [[0, 11.5, 0, 3.6], [0, 5.5, 0, 3.4]], flak: { h: 11.6, z: 0, barrels: 4, rate: 6, range: 2300 } },
};

export interface FlakGun {
  rig: THREE.Group; yaw: THREE.Object3D; pitch: THREE.Object3D;
  cd: number; burstLeft: number; shot: number;
  err: THREE.Vector3; target: Fighter | null; retarget: number;
  curYaw: number; curPitch: number; firing: boolean;
}

export interface GroundTarget {
  readonly id: number;
  kind: GroundKind;
  def: KindDef;
  set: string;              // gameplay group: 'train' | 'convoy' | 'airfield' | 'flak'
  u: number; v: number;     // map position
  heading: number;          // rad, atan2(du, dv): +z of the model points along (sin, cos)
  hp: number; maxHp: number;
  alive: boolean;
  destroyedAt: number;
  playerDamage: number; wingDamage: number;
  lastBy: Credit | null;
  label: string;
  score: number;
  speed: number;            // m/s (moving targets: StrafeOps drives them)
  pos: THREE.Vector3;       // scene position of the target's base (updated by place())
  c: Float32Array;          // hit spheres, map coordinates: x, y, z, r per sphere
  br: number;               // bounding radius around (u, y, v)
  inst: number;
  gun: FlakGun | null;
  model: THREE.Object3D | null;
  burnUntil: number;
  smokeUntil: number;
  tilt: number;
}

const MUZZLE = 880;           // m/s, 20 mm
const FLAK_DMG = 9;
const HIT_SCALE = 1.35;        // hit spheres a little larger than the models (like the enlarged fighters)
const FLAK_TRACER: [number, number, number] = [9, 2.6, 0.55];
const G = 9.81;
const DUST_MAX = 14;          // dust puffs per frame
const MAX_Y = 130;            // nothing on the ground stands higher (terrain + flak tower)
const CHAR = new THREE.Color(0.075, 0.07, 0.065);
const WHITE = new THREE.Color(1, 1, 1);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const R = () => Math.random() * 2 - 1;

// ---------- geometry ----------

const C = vcolored;
const box = (w: number, h: number, d: number, x: number, y: number, z: number, col: number) => C(new THREE.BoxGeometry(w, h, d).translate(x, y, z), col);
const cylZ = (r: number, len: number, x: number, y: number, z: number, col: number, seg = 10) => C(new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2).translate(x, y, z), col);
const wheel = (r: number, x: number, z: number) => C(new THREE.CylinderGeometry(r, r, 0.3, 8).rotateZ(Math.PI / 2).translate(x, r, z), 0x111111);
const cylY = (r0: number, r1: number, h: number, x: number, y: number, z: number, col: number, seg = 8) => C(new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y + h / 2, z), col);

function railFrame(len: number) {
  return [box(2.7, 0.5, len, 0, 1.05, 0, 0x1d1c1b), box(0.3, 0.9, len * 0.8, 1.1, 0.6, 0, 0x262422), box(0.3, 0.9, len * 0.8, -1.1, 0.6, 0, 0x262422)];
}

function kindGeometry(k: GroundKind): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  switch (k) {
    case 'loco':
      parts.push(box(2.6, 0.6, 19, 0, 1.0, -1.5, 0x1c1c1c));
      parts.push(box(0.3, 1.6, 9, 1.15, 0.9, 1.5, 0x5a2a20), box(0.3, 1.6, 9, -1.15, 0.9, 1.5, 0x5a2a20));
      parts.push(box(0.3, 1.0, 6, 1.15, 0.7, -7.5, 0x3a2a22), box(0.3, 1.0, 6, -1.15, 0.7, -7.5, 0x3a2a22));
      parts.push(cylZ(0.98, 7.6, 0, 2.6, 2.3, 0x1b1b1c, 14), cylZ(1.05, 1.0, 0, 2.6, 6.5, 0x121212, 14));
      parts.push(cylY(0.32, 0.38, 1.2, 0, 3.4, 5.6, 0x111111), C(new THREE.SphereGeometry(0.55, 10, 6).translate(0, 3.55, 2.6), 0x1e1e1e));
      parts.push(box(2.9, 2.9, 2.7, 0, 3.0, -2.4, 0x283028), box(3.1, 0.2, 3.1, 0, 4.55, -2.4, 0x1c1c1c));
      parts.push(box(2.8, 2.3, 6.6, 0, 2.3, -7.6, 0x252525), box(2.4, 0.5, 5.2, 0, 3.6, -7.4, 0x0c0c0c));
      parts.push(box(2.8, 0.25, 0.4, 0, 1.0, 7.4, 0x8a1c14));   // buffer beam
      break;
    case 'boxcar':
      parts.push(...railFrame(10.5), box(2.8, 2.9, 10, 0, 2.6, 0, 0x5a3a2b), box(3.0, 0.25, 10.2, 0, 4.15, 0, 0x4a4a48));
      parts.push(box(0.05, 2.0, 2.4, 1.42, 2.5, 0, 0x3e281e), box(0.05, 2.0, 2.4, -1.42, 2.5, 0, 0x3e281e));
      break;
    case 'tanker':
      parts.push(...railFrame(10), cylZ(1.3, 9, 0, 2.7, 0, 0x4f5254, 14), cylY(0.4, 0.4, 0.6, 0, 3.9, 0, 0x3c3e40));
      break;
    case 'flakcar':
      parts.push(...railFrame(10.5), box(2.8, 0.4, 10.4, 0, 1.45, 0, 0x3b3530), box(2.8, 0.9, 0.5, 0, 2.1, 5, 0x8b7d5e), box(2.8, 0.9, 0.5, 0, 2.1, -5, 0x8b7d5e));
      parts.push(box(0.5, 0.9, 3, 1.15, 2.1, 0, 0x8b7d5e), box(0.5, 0.9, 3, -1.15, 2.1, 0, 0x8b7d5e));
      break;
    case 'truck':
    case 'fueltruck':
      parts.push(box(2.0, 0.45, 6.2, 0, 0.95, 0, 0x1f201c));
      for (const z of [2.2, -0.9, -2.2]) for (const x of [1.0, -1.0]) parts.push(wheel(0.48, x, z));
      parts.push(box(2.1, 1.6, 1.8, 0, 1.95, 1.4, 0x4c5044), box(1.6, 0.85, 1.3, 0, 1.6, 2.9, 0x4c5044), box(1.9, 0.5, 0.05, 0, 2.3, 2.31, 0x22261f));
      if (k === 'truck') parts.push(box(2.2, 0.55, 3.9, 0, 1.45, -1.3, 0x45493d), box(2.2, 1.5, 3.8, 0, 2.45, -1.3, 0x6b664f));
      else parts.push(box(2.0, 0.4, 3.9, 0, 1.35, -1.3, 0x33352f), cylZ(0.95, 3.6, 0, 2.3, -1.3, 0x5a5d50, 12));
      break;
    case 'halftrack':
      parts.push(box(2.0, 0.9, 3.8, 0, 0.75, -1.2, 0x1a1a18), wheel(0.45, 0.95, 2.3), wheel(0.45, -0.95, 2.3));
      parts.push(box(2.0, 1.1, 2.4, 0, 1.6, 1.8, 0x4f5346), box(2.2, 0.7, 4.0, 0, 1.55, -1.2, 0x4f5346));
      break;
    case 'flak':
      parts.push(C(new THREE.TorusGeometry(3.0, 0.65, 6, 16).rotateX(Math.PI / 2).scale(1, 0.75, 1).translate(0, 0.4, 0), 0x8b7d5e));
      parts.push(cylY(2.5, 2.5, 0.05, 0, 0.02, 0, 0x4a4234, 16));
      parts.push(box(0.8, 0.5, 0.6, 1.6, 0.25, 1.4, 0x3d4232), box(0.8, 0.5, 0.6, -1.7, 0.25, -1.2, 0x3d4232));   // ammunition boxes
      break;
    case 'flaktower':
      for (const x of [2.4, -2.4]) for (const z of [2.4, -2.4]) parts.push(box(0.45, 11, 0.45, x, 5.5, z, 0x4a3e30));
      parts.push(box(0.2, 0.3, 5, 2.4, 4, 0, 0x4a3e30), box(0.2, 0.3, 5, -2.4, 4, 0, 0x4a3e30), box(5, 0.3, 0.2, 0, 7, 2.4, 0x4a3e30), box(5, 0.3, 0.2, 0, 7, -2.4, 0x4a3e30));
      parts.push(box(6.4, 0.5, 6.4, 0, 11.1, 0, 0x5a4c3a));
      parts.push(C(new THREE.TorusGeometry(2.7, 0.5, 6, 14).rotateX(Math.PI / 2).scale(1, 0.8, 1).translate(0, 11.7, 0), 0x8b7d5e));
      break;
    case 'plane':
      parts.push(box(1.6, 1.2, 9, 0, 0.6, 0, 0xffffff), box(11, 0.3, 2.2, 0.8, 0.3, 0.6, 0xffffff), box(3.5, 0.3, 1.4, 0, 0.9, -4.2, 0xffffff));
      break;
  }
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  return g;
}

// The flak gun on its pedestal: yaw part (pedestal, cradle, shield) and pitch part (barrels)
function gunRig(barrels: number) {
  const rig = new THREE.Group();
  const yaw = new THREE.Group(), pitch = new THREE.Group();
  const ped = mergeGeometries([cylY(0.35, 0.5, 0.9, 0, 0, 0, 0x3a3f33), box(1.9, 1.0, 0.08, 0, 1.25, 0.7, 0x454b3d), box(0.8, 0.5, 1.0, 0, 1.05, 0, 0x30352b)])!;
  const bar: THREE.BufferGeometry[] = [];
  const xs = barrels === 4 ? [-0.28, 0.28] : [0];
  const ys = barrels === 4 ? [-0.22, 0.22] : [0];
  for (const x of xs) for (const y of ys) bar.push(cylZ(0.055, 2.3, x, y, 1.2, 0x222420, 6), cylZ(0.09, 0.5, x, y, 2.3, 0x1a1a18, 6));
  bar.push(box(0.5, 0.35, 0.9, 0, 0, 0.1, 0x2c3027));
  const bg = mergeGeometries(bar)!;
  ped.computeVertexNormals(); bg.computeVertexNormals();
  return { rig, yaw, pitch, ped, bar: bg };
}

// ---------- the target set ----------

let nextId = 1;

export class GroundTargets {
  readonly list: GroundTarget[] = [];
  onDestroyed: ((t: GroundTarget, by: Credit) => void) | null = null;
  onHit: ((t: GroundTarget, by: Credit) => void) | null = null;
  wingman: Aircraft | null = null;           // Blue Two (credit 'wing')
  skill = 1;                                 // flak accuracy
  readonly root = new THREE.Group();
  private meshes = new Map<GroundKind | 'planewreck', THREE.InstancedMesh>();
  private mat: THREE.MeshLambertMaterial;
  private gunMat: THREE.MeshLambertMaterial;
  private gunGeo = new Map<number, { ped: THREE.BufferGeometry; bar: THREE.BufferGeometry }>();
  private dirty = new Set<THREE.InstancedMesh>();
  private dust = 0;
  private fxTick = 0;
  stats = { hits: 0, dust: 0, flakShots: 0, flakHitsOnPlayer: 0 };

  constructor(private world: World, private cs: Countryside) {
    this.root.name = 'ground_targets';
    cs.group.add(this.root);
    this.mat = hazed(new THREE.MeshLambertMaterial({ vertexColors: true }), { key: 'targets' });
    this.gunMat = hazed(new THREE.MeshLambertMaterial({ vertexColors: true }), { key: 'targets' });
  }

  private mesh(k: GroundKind | 'planewreck'): THREE.InstancedMesh {
    let m = this.meshes.get(k);
    if (!m) {
      const geo = k === 'planewreck' ? kindGeometry('plane') : kindGeometry(k);
      m = new THREE.InstancedMesh(geo, this.mat, 40);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true; m.receiveShadow = true;
      m.name = 'gt_' + k;
      m.setColorAt(0, WHITE);
      this.root.add(m);
      this.meshes.set(k, m);
    }
    return m;
  }

  get alive() { return this.list.filter((t) => t.alive); }
  of(set: string) { return this.list.filter((t) => t.set === set); }

  // A new target at map (u, v), facing `heading` (rad)
  add(kind: GroundKind, u: number, v: number, heading: number, set: string, model?: ModelKind): GroundTarget {
    const def = GROUND_KINDS[kind];
    const t: GroundTarget = {
      id: nextId++, kind, def, set, u, v, heading, hp: def.hp, maxHp: def.hp, alive: true, destroyedAt: -1,
      playerDamage: 0, wingDamage: 0, lastBy: null, label: def.label, score: def.score, speed: 0,
      pos: new THREE.Vector3(), c: new Float32Array(Math.max(1, def.spheres.length || 3) * 4), br: 0, inst: -1,
      gun: null, model: null, burnUntil: 0, smokeUntil: 0, tilt: 0,
    };
    if (kind === 'plane') {
      const mk: ModelKind = model && hasModel(model) ? model : 'fw190';
      const o = instantiate(mk);
      const big = mk === 'ju88' || mk === 'bf110';
      const k = big ? 1.0 : 1.35;
      o.scale.setScalar(k);
      o.traverse((c) => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
      const bb = new THREE.Box3().setFromObject(o);
      const size = bb.getSize(new THREE.Vector3());
      (o.userData as any).lift = -bb.min.y + 0.1;
      (o.userData as any).span = size.x;
      this.root.add(o);
      t.model = o;
      t.label = `${mk === 'fw190' ? 'Fw 190' : mk === 'bf109' ? 'Bf 109' : mk === 'ju88' ? 'Ju 88' : mk === 'bf110' ? 'Bf 110' : 'Aircraft'} on the ground`;
      if (big) { t.score = 300; t.hp = t.maxHp = 260; }
      const r = Math.max(size.x, size.z) * 0.2, y = size.y * 0.45;
      (t as any).sph = [[0, y, 0, r * 1.15], [size.x * 0.3, y * 0.6, 0, r * 0.9], [-size.x * 0.3, y * 0.6, 0, r * 0.9], [0, y, -size.z * 0.32, r * 0.8]];
      t.c = new Float32Array(16);
    } else {
      const m = this.mesh(kind);
      t.inst = m.count++;
      m.setColorAt(t.inst, WHITE);
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    if (def.flak) t.gun = this.makeGun(def.flak.barrels);
    this.list.push(t);
    this.place(t, u, v, heading);
    return t;
  }

  private makeGun(barrels: number): FlakGun {
    let gg = this.gunGeo.get(barrels);
    if (!gg) { const r = gunRig(barrels); gg = { ped: r.ped, bar: r.bar }; this.gunGeo.set(barrels, gg); }
    const rig = new THREE.Group(), yaw = new THREE.Group(), pitch = new THREE.Group();
    const ped = new THREE.Mesh(gg.ped, this.gunMat), bar = new THREE.Mesh(gg.bar, this.gunMat);
    ped.castShadow = bar.castShadow = true;
    yaw.add(ped); pitch.add(bar);
    pitch.position.set(0, 1.25, 0);
    yaw.add(pitch); rig.add(yaw);
    this.root.add(rig);
    return { rig, yaw, pitch, cd: 1 + Math.random() * 3, burstLeft: 0, shot: 0, err: new THREE.Vector3(), target: null, retarget: 0, curYaw: Math.random() * 6, curPitch: 0.3, firing: false };
  }

  // Move a target to map (u, v), facing heading; refreshes its matrix, hit spheres and gun rig
  place(t: GroundTarget, u: number, v: number, heading: number) {
    t.u = u; t.v = v; t.heading = heading;
    const s = t.def.scale;
    const y = terrainHeight(u, v);
    const sn = Math.sin(heading), cs = Math.cos(heading);
    // pitch along the slope (look a few metres ahead and behind)
    const slope = Math.atan2(terrainHeight(u + sn * 4, v + cs * 4) - terrainHeight(u - sn * 4, v - cs * 4), 8);
    _q.setFromEuler(_e.set(-slope, heading, t.tilt, 'YXZ'));
    if (t.model) {
      const o = t.model;
      o.position.set(u, y + (o.userData as any).lift, v);
      o.quaternion.copy(_q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), t.alive ? -0.16 : 0.05));
    } else if (t.inst >= 0) {
      const m = this.mesh(t.alive ? t.kind : t.kind);
      _m.compose(_p.set(u, y - (t.alive ? 0 : 0.35), v), _q, _s.set(s, s * (t.alive ? 1 : 0.8), s));
      m.setMatrixAt(t.inst, _m);
      this.dirty.add(m);
    }
    // hit spheres in map coordinates
    const sph: number[][] = (t as any).sph ?? t.def.spheres;
    let br = 0;
    sph.forEach((q, i) => {
      _v.set(q[0] * s, q[1] * s, q[2] * s).applyQuaternion(_q);
      t.c[i * 4] = u + _v.x; t.c[i * 4 + 1] = y + _v.y; t.c[i * 4 + 2] = v + _v.z; t.c[i * 4 + 3] = q[3] * s;
      br = Math.max(br, Math.hypot(_v.x, _v.y - 2, _v.z) + q[3] * s);
    });
    t.br = br;
    (t as any).ny = sph.length;
    t.pos.set(u + this.cs.group.position.x, y, v + this.cs.group.position.z);
    if (t.gun) {
      const f = t.def.flak!;
      _v.set(0, f.h * s, f.z * s).applyQuaternion(_q);
      t.gun.rig.position.set(u + _v.x, y + _v.y, v + _v.z);
      t.gun.rig.visible = t.alive || t.kind === 'flaktower';
    }
  }

  clear() {
    for (const t of this.list) { t.model?.removeFromParent(); t.gun?.rig.removeFromParent(); }
    this.list.length = 0;
    for (const m of this.meshes.values()) m.count = 0;
  }

  attach(on: boolean) {
    this.world.ballistics.ground = on ? this.ballistic : null;
    this.root.visible = on;
  }

  private credit(owner: Aircraft | null, player: boolean): Credit {
    return player ? 'player' : owner && owner === this.wingman ? 'wing' : 'other';
  }

  // Ballistics.ground: hit spheres first (allied rounds only), then the terrain
  private ballistic = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, axis: boolean, dmg: number, player: boolean, owner: Aircraft | null, cannon: boolean): boolean => {
    if (ay > MAX_Y && by > MAX_Y) return false;
    const gx = this.cs.group.position.x, gz = this.cs.group.position.z;
    const au = ax - gx, av = az - gz, bu = bx - gx, bv = bz - gz;
    if (!axis) {
      let best = 2, hit: GroundTarget | null = null;
      for (const t of this.list) {
        if (!t.alive) continue;
        const cy = terrainHeight(t.u, t.v) + 3;
        if (segSphere(au, ay, av, bu, by, bv, t.u, cy, t.v, t.br * HIT_SCALE + 4) < 0) continue;
        const n = (t as any).ny as number;
        for (let i = 0; i < n; i++) {
          const k = segSphere(au, ay, av, bu, by, bv, t.c[i * 4], t.c[i * 4 + 1], t.c[i * 4 + 2], t.c[i * 4 + 3] * HIT_SCALE * (player ? this.world.ballistics.playerHitScale : 1));
          if (k >= 0 && k < best) { best = k; hit = t; }
        }
      }
      if (hit) {
        _p.set(ax + (bx - ax) * best, ay + (by - ay) * best, az + (bz - az) * best);
        this.damage(hit, dmg * (cannon ? 1.3 : 1), this.credit(owner, player), _p);
        return true;
      }
    }
    // terrain
    const hb = terrainHeight(bu, bv);
    if (by > hb) return false;
    const ha = terrainHeight(au, av);
    const fa = ay - ha, fb = by - hb;
    const k = fa > 0 ? fa / (fa - fb) : 0;
    _p.set(ax + (bx - ax) * k, ay + (by - ay) * k, az + (bz - az) * k);
    _p.y = Math.max(_p.y, terrainHeight(_p.x - gx, _p.z - gz));
    if (this.dust < DUST_MAX && (!axis || Math.random() < 0.25)) {
      const L = this.world.listener;
      if (!L || L.distanceToSquared(_p) < 1800 * 1800) { this.dust++; this.dustPuff(_p, _d.set(bx - ax, by - ay, bz - az), !axis && (player || owner === this.wingman)); }
    }
    return true;
  };

  // A strafing round in the dirt: a brown dust puff, a spurt of dirt thrown up and back
  private dustPuff(p: THREE.Vector3, dir: THREE.Vector3, big: boolean) {
    const fx = this.world.effects;
    this.stats.dust++;
    const k = big ? 1 : 0.7;
    dir.normalize();
    fx.smoke.spawn({ pos: p, vel: _w.set(dir.x * 6 + R() * 2, 2.5 + Math.random() * 2, dir.z * 6 + R() * 2), life: 1.4 + Math.random() * 0.8, size0: 0.9 * k, size1: (4.5 + Math.random() * 2.5) * k, color0: [0.46, 0.39, 0.29], color1: [0.5, 0.45, 0.37], alpha0: 0.75, alpha1: 0, drag: 2.2, rise: 0.6, lit: true });
    for (let i = 0; i < (big ? 3 : 1); i++) {
      fx.smoke.spawn({ pos: p, vel: _w.set(R() * 4 + dir.x * 5, 7 + Math.random() * 9, R() * 4 + dir.z * 5), life: 0.6 + Math.random() * 0.4, size0: 0.45 * k, size1: 0.25 * k, color0: [0.12, 0.1, 0.08], alpha0: 1, alpha1: 0.4, drag: 0.6, rise: -9.8 });
    }
    if (big && Math.random() < 0.25) fx.glow.spawn({ pos: p, life: 0.05, size0: 0.8, size1: 1.4, color0: [20, 12, 5], alpha0: 1, alpha1: 0, frame: 1 });
  }

  damage(t: GroundTarget, d: number, by: Credit, at?: THREE.Vector3) {
    if (!t.alive) return;
    t.hp -= d;
    if (by === 'player') t.playerDamage += d; else if (by === 'wing') t.wingDamage += d;
    t.lastBy = by;
    this.stats.hits++;
    const fx = this.world.effects;
    if (at) {
      if (by === 'player' || Math.random() < 0.4) fx.sparks(at, _w.set(0, 0, 0), false);
      if (by === 'player' && Math.random() < 0.35) fx.smoke.spawn({ pos: at, vel: _w.set(R() * 2, 3, R() * 2), life: 1.2, size0: 0.6, size1: 3, color0: [0.22, 0.21, 0.2], alpha0: 0.6, alpha1: 0, drag: 1.5, lit: true });
      if (by === 'player' && Math.random() < 0.3) sound.play('hit', at, { gain: 0.3, delay: false, ref: 60 });
    }
    if (by === 'player') { this.world.events.hitMarker?.(false); this.world.stats.hits++; }
    this.onHit?.(t, by);
    if (t.hp <= 0) this.destroy(t);
  }

  // Who gets the credit: the player for a real share of the damage, else the wingman, else nobody
  creditOf(t: GroundTarget): Credit {
    if (t.playerDamage >= t.maxHp * 0.25 || t.lastBy === 'player') return 'player';
    if (t.wingDamage > 0) return 'wing';
    return 'other';
  }

  destroy(t: GroundTarget) {
    if (!t.alive) return;
    t.alive = false;
    t.destroyedAt = this.world.time;
    t.tilt = (Math.random() - 0.5) * 0.35;
    const fx = this.world.effects;
    const base = _p.copy(t.pos).add(_v.set(0, 2, 0));
    if (t.kind === 'loco') this.steamBurst(base.clone());
    fx.explosion(base, _w.set(0, 0, 0), t.def.boom * (t.def.fuel ? 1.2 : 1));
    if (t.def.fuel) fx.flashLight(base, 2500, 0.6, 0xff8a3a);
    sound.play('explosion', base, { gain: t.def.fuel || t.kind === 'loco' ? 1.5 : 1, ref: 220, reverb: 0.6 });
    t.burnUntil = this.world.time + (t.def.fuel ? 70 : 45);
    t.smokeUntil = t.burnUntil + 60;
    // charred and slumped
    if (t.model) {
      t.model.visible = false;
      const m = this.mesh('planewreck');
      t.inst = m.count++;
      const span = (t.model.userData as any).span ?? 11;
      _q.setFromEuler(_e.set(0.04, t.heading, t.tilt, 'YXZ'));
      const y = terrainHeight(t.u, t.v);
      m.setMatrixAt(t.inst, _m.compose(_p.set(t.u, y, t.v), _q, _s.set(span / 11, 0.7, span / 11)));
      m.setColorAt(t.inst, CHAR);
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      this.dirty.add(m);
    } else if (t.inst >= 0) {
      const m = this.mesh(t.kind);
      m.setColorAt(t.inst, CHAR);
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    if (t.gun && t.kind !== 'flaktower') t.gun.rig.visible = false;
    if (t.gun && t.kind === 'flaktower') { t.gun.pitch.rotation.x = -0.6; t.gun.rig.rotation.z = 0.4; }
    this.place(t, t.u, t.v, t.heading);
    this.onDestroyed?.(t, this.creditOf(t));
  }

  // The locomotive's boiler goes: a white cloud of steam bursting out and rolling up, scalding
  // jets from the front and sides, then steam venting for a while
  steamBurst(p: THREE.Vector3) {
    const fx = this.world.effects;
    fx.flashLight(p, 1800, 0.5, 0xffe2b0);
    fx.glow.spawn({ pos: p, life: 0.25, size0: 12, size1: 30, color0: [14, 12, 9], alpha0: 0.9, alpha1: 0, frame: 1 });
    for (let i = 0; i < 56; i++) {
      _v.set(R(), Math.random() * 0.9 + 0.1, R()).normalize().multiplyScalar(18 + Math.random() * 34);
      fx.smoke.spawn({ pos: p, vel: _v, life: 6 + Math.random() * 6, size0: 9 + Math.random() * 7, size1: 42 + Math.random() * 34, color0: [1.0, 1.0, 1.0], color1: [0.86, 0.87, 0.9], alpha0: 0.95, alpha1: 0, drag: 1.2, rise: 2.5, lit: true });
    }
    // the column: a jet of steam blasting straight up out of the burst boiler
    for (let i = 0; i < 26; i++) {
      _v.set(R() * 0.25, 1, R() * 0.25).normalize().multiplyScalar(30 + Math.random() * 45);
      fx.smoke.spawn({ pos: p, vel: _v, life: 5 + Math.random() * 4, size0: 5, size1: 30, color0: [0.97, 0.97, 0.99], alpha0: 0.9, alpha1: 0, drag: 0.8, rise: 3, lit: true });
    }
    fx.spawnDebris(p, _w.set(0, 12, 0), 10, false);
    sound.play('explosionFar', p, { gain: 1.2, rate: 0.7, reverb: 0.8 });
    (this as any).vent = { p: p.clone(), until: this.world.time + 18 };
  }

  // ---------- per frame ----------
  // Scene positions follow the floating origin (the group moves; u, v stay put)
  refresh() {
    const gx = this.cs.group.position.x, gz = this.cs.group.position.z;
    for (const t of this.list) t.pos.set(t.u + gx, t.pos.y, t.v + gz);
  }

  update(dt: number) {
    this.dust = 0;
    this.refresh();
    this.fxTick++;
    for (const m of this.dirty) m.instanceMatrix.needsUpdate = true;
    this.dirty.clear();
    this.guns(dt);
    this.burn(dt);
  }

  private guns(dt: number) {
    const w = this.world;
    const allied = w.fighters('allied').filter((f) => f.alive);
    for (const t of this.list) {
      const g = t.gun;
      if (!g || !t.alive) continue;
      const spec = t.def.flak!;
      const pos = _p.copy(g.rig.position).add(this.cs.group.position);
      g.retarget -= dt;
      if (g.retarget <= 0 || !g.target?.alive) {
        g.retarget = 2 + Math.random() * 2;
        let best: Fighter | null = null, bs = Infinity;
        for (const f of allied) {
          const d = f.pos.distanceTo(pos) * (f.isPlayer ? 0.75 : 1);
          if (d < spec.range * 1.2 && d < bs) { bs = d; best = f; }
        }
        g.target = best;
      }
      const tg = g.target;
      let wantYaw = g.curYaw + dt * 0.3, wantPitch = 0.25;
      let range = Infinity;
      if (tg?.alive) {
        // lead the target (gravity drop included), with a wandering aiming error per burst
        const d0 = tg.pos.distanceTo(pos);
        let tof = d0 / MUZZLE;
        for (let i = 0; i < 2; i++) { _d.copy(tg.pos).addScaledVector(tg.vel, tof); tof = _d.distanceTo(pos) / MUZZLE; }
        _d.y += 0.5 * G * tof * tof * 1.1;
        _d.add(g.err);
        _d.sub(pos);
        range = d0;
        wantYaw = Math.atan2(_d.x, _d.z);
        wantPitch = Math.atan2(_d.y, Math.hypot(_d.x, _d.z));
      }
      // traverse and elevate at a limited rate
      let dy = wantYaw - g.curYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      const rate = 1.7 * dt;
      g.curYaw += THREE.MathUtils.clamp(dy, -rate, rate);
      g.curPitch += THREE.MathUtils.clamp(THREE.MathUtils.clamp(wantPitch, -0.05, 1.5) - g.curPitch, -rate, rate);
      g.yaw.rotation.y = g.curYaw;
      g.pitch.rotation.x = -g.curPitch;
      g.firing = false;
      g.cd -= dt;
      if (!tg?.alive || range > spec.range) { if (g.burstLeft > 0) g.burstLeft = 0; continue; }
      const aligned = Math.abs(dy) < 0.06;
      if (g.burstLeft <= 0) {
        if (g.cd > 0 || !aligned) continue;
        g.burstLeft = 6 + Math.floor(Math.random() * 10);
        // each burst has its own error, tighter for better crews and at short range
        const e = (5 + range * 0.016) / this.skill;
        g.err.set(R(), R() * 0.7, R()).multiplyScalar(e);
      }
      g.firing = true;
      g.shot -= dt;
      while (g.shot <= 0 && g.burstLeft > 0) {
        g.shot += 1 / (spec.rate * spec.barrels);
        g.burstLeft--;
        this.fire(t, g, pos, tg!);
        if (g.burstLeft <= 0) g.cd = 1.1 + Math.random() * 1.8;
      }
      g.err.multiplyScalar(Math.exp(-dt * 0.25));   // the gunner walks his tracer onto the target
    }
  }

  private fire(t: GroundTarget, g: FlakGun, pos: THREE.Vector3, tg: Fighter) {
    const w = this.world;
    _d.set(Math.sin(g.curYaw) * Math.cos(g.curPitch), Math.sin(g.curPitch), Math.cos(g.curYaw) * Math.cos(g.curPitch));
    _w.copy(pos).add(_v.set(0, 1.25, 0)).addScaledVector(_d, 2.6);
    _d.x += R() * 0.006; _d.y += R() * 0.006; _d.z += R() * 0.006;
    _d.normalize();
    const vel = _v.copy(_d).multiplyScalar(MUZZLE);
    w.ballistics.fire(_w, vel, 'axis', FLAK_DMG * (0.8 + 0.2 * w.difficulty), true, FLAK_TRACER, null, true, false, 2.9);
    this.stats.flakShots++;
    w.effects.muzzleFlash(_w, _d, 2.4);
    if (this.stats.flakShots % 2 === 0) sound.play('cannon', _w, { gain: 0.55, ref: 180, reverb: 0.5 });
    void t; void tg;
  }

  // Burning wrecks: flames and a leaning column of dark smoke; later only smoke
  private burn(_dt: number) {
    const w = this.world, fx = w.effects;
    const vent = (this as any).vent as { p: THREE.Vector3; until: number } | undefined;
    if (vent && w.time < vent.until && this.fxTick % 2 === 0) {
      fx.smoke.spawn({ pos: vent.p, vel: _w.set(R() * 2, 9 + Math.random() * 5, R() * 2), life: 3.5, size0: 2, size1: 12, color0: [0.95, 0.95, 0.97], alpha0: 0.7, alpha1: 0, drag: 0.8, rise: 1.5, lit: true });
    }
    if (this.fxTick % 3) return;
    const L = w.listener;
    for (const t of this.list) {
      if (t.alive || w.time > t.smokeUntil) continue;
      const far = L ? L.distanceTo(t.pos) : 0;
      if (far > 7000) continue;
      const fire = w.time < t.burnUntil;
      const big = t.def.fuel || t.kind === 'loco' ? 1.5 : 1;
      _p.copy(t.pos);
      _p.x += R() * 2; _p.z += R() * 2; _p.y += 1.5 + Math.random() * 1.5;
      if (fire) {
        fx.glow.spawn({ pos: _p, vel: _w.set(R(), 4 + Math.random() * 3, R()), life: 0.5 + Math.random() * 0.4, size0: 4 * big, size1: 1.5 * big, color0: [9, 3.6, 0.8], color1: [2, 0.4, 0.05], alpha0: 0.95, alpha1: 0, frame: 2, rotVel: 1.5 });
      }
      if (this.fxTick % (fire ? 6 : 15) === 0 && far < 6000) {
        fx.smoke.spawn({ pos: _p, vel: _w.set(2.5 + R(), 5 + Math.random() * 2, 1 + R()), life: 12 + Math.random() * 6, size0: 3 * big, size1: 26 * big, color0: fire ? [0.07, 0.06, 0.055] : [0.2, 0.2, 0.2], color1: [0.16, 0.155, 0.15], alpha0: fire ? 0.85 : 0.5, alpha1: 0, drag: 0.5, rise: 0.8, lit: true });
      }
    }
  }

  dispose() {
    this.clear();
    this.attach(false);
    this.root.removeFromParent();
    for (const m of this.meshes.values()) { m.geometry.dispose(); m.dispose(); }
    this.meshes.clear();
    for (const g of this.gunGeo.values()) { g.ped.dispose(); g.bar.dispose(); }
    this.mat.dispose(); this.gunMat.dispose();
  }
}

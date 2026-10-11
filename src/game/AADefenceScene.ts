import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Airbase, afToLocal, makeGear } from '../world/Airbase';
import { instantiate } from '../world/Models';
import type { AAAssetHealth, AAAssetKind } from './AADefenceRules';

const metal = new THREE.MeshStandardMaterial({ color: 0x343b2a, roughness: 0.7, metalness: 0.35 });
const steel = new THREE.MeshStandardMaterial({ color: 0x202522, roughness: 0.6, metalness: 0.7 });
const sand = new THREE.MeshStandardMaterial({ color: 0x9c9070, roughness: 1 });
const brass = new THREE.MeshStandardMaterial({ color: 0xb29a51, metalness: 0.65, roughness: 0.4 });
const soot = new THREE.MeshBasicMaterial({ color: 0x171914 });
const sight = new THREE.MeshBasicMaterial({ color: 0xb5bb85 });
const cube = new RoundedBoxGeometry(1, 1, 1, 2, 0.035);
const tube = new THREE.CylinderGeometry(1, 1, 1, 12).rotateX(Math.PI / 2);
const ring = new THREE.TorusGeometry(0.115, 0.007, 6, 40);
const craterGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);

function box(parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const m = new THREE.Mesh(cube, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m;
}
export interface AAGunRig { root: THREE.Group; yaw: THREE.Group; pitch: THREE.Group; barrel: THREE.Group }
export function makeAAGun(kind: number): AAGunRig {
  const root = new THREE.Group(), yaw = new THREE.Group(), pitch = new THREE.Group(), barrel = new THREE.Group();
  root.add(yaw); yaw.position.y = 1.5; yaw.add(pitch); pitch.add(barrel);
  box(root, metal, 0, 0.6, 0, 1.2, 1.2, 1.1);
  box(pitch, metal, 0, -0.45, 0.5, 1.5, 0.22, 1.6);
  // Split armour shield leaves an unobstructed centre sightline.
  for (const side of [-1, 1]) {
    const plate = box(pitch, metal, side * 0.72, -0.3, 0.7, 0.6, 0.75, 0.06);
    plate.rotation.y = -side * 0.18;
    box(pitch, metal, side * 0.88, -0.35, -0.1, 0.42, 0.4, 0.55);
  }
  const count = kind ? 1 : 4;
  for (let i = 0; i < count; i++) {
    const x = kind ? 0 : (i % 2 ? 1 : -1) * 0.32, y = kind ? -0.24 : -0.17 - Math.floor(i / 2) * 0.27;
    box(barrel, steel, x, y, 0.35, kind ? 0.23 : 0.15, 0.18, 0.9);
    const m = new THREE.Mesh(tube, steel); m.position.set(x, y, kind ? 1.65 : 1.35); m.scale.set(kind ? 0.065 : 0.035, kind ? 0.065 : 0.035, kind ? 2 : 1.3); barrel.add(m);
    for (let j = 0; j < 5; j++) box(barrel, metal, x, y, 0.9 + j * 0.13, 0.09, 0.09, 0.035);
  }
  const r = new THREE.Mesh(ring, sight); r.position.set(0, 0.18, 0.65); pitch.add(r);
  const inner = r.clone(); inner.scale.setScalar(0.5); pitch.add(inner);
  box(pitch, sight, 0, 0.18, 0.65, 0.003, 0.25, 0.003);
  box(pitch, sight, 0, 0.18, 0.65, 0.25, 0.003, 0.003);
  box(pitch, steel, 0, -0.01, 0.65, 0.015, 0.17, 0.018);
  box(pitch, sight, 0, 0.18, 1.6, 0.016, 0.016, 0.016);
  return { root, yaw, pitch, barrel };
}
/** Keep shared gun/projectile materials compiled by World's normal warm-up. */
export function warmAAGuns(scene: THREE.Scene, at: THREE.Vector3) {
  const group = new THREE.Group(); group.position.copy(at);
  group.add(makeAAGun(0).root, makeAAGun(1).root);
  for (const mat of [sand, brass, soot]) box(group, mat, 0, 0, 0, 1, 1, 1);
  scene.add(group);
  return () => group.removeFromParent();
}

export interface AAAsset extends AAAssetHealth { label: string; pos: THREE.Vector3; radius: number; object: THREE.Object3D; originalY: number }
export class AABattlefield {
  readonly base: Airbase;
  readonly group = new THREE.Group();
  readonly assets: AAAsset[] = [];
  readonly pits: AAAsset[] = [];
  readonly rigs: AAGunRig[] = [];
  readonly craters: THREE.Mesh[] = [];
  readonly shells: { mesh: THREE.Mesh; vel: THREE.Vector3; ttl: number; team: boolean; damage: number; rocket: boolean }[] = [];
  readonly wrecks: { object: THREE.Group; pos: THREE.Vector3; ttl: number }[] = [];
  readonly cases: { mesh: THREE.Mesh; vel: THREE.Vector3; ttl: number }[] = [];
  private craterIndex = 0;
  private owned: THREE.BufferGeometry[] = [];
  constructor(quality: 'low' | 'medium' | 'high' | 'ultra') {
    this.base = new Airbase(quality);
    this.group.name = 'aa-defence';
    for (const obj of this.base.group.children) {
      if (obj.name === 'ab_hangar') this.asset('hangar', 'Hangar', obj, 450, 38);
      if (obj.name === 'ab_tower') this.asset('tower', 'Control tower', obj, 800, 17);
    }
    // Closest hardstands to the technical site; parked models are scenery, not flying bombers.
    const stands = [...this.base.stands].sort((a, b) => Math.hypot(a.x - this.assets[1].pos.x, a.z - this.assets[1].pos.z) - Math.hypot(b.x - this.assets[1].pos.x, b.z - this.assets[1].pos.z));
    for (let i = 0; i < 4; i++) {
      const o = new THREE.Group(); o.add(instantiate('b17'));
      const gear = makeGear().group;
      gear.traverse(node => { if (node instanceof THREE.Mesh) this.owned.push(node.geometry); });
      o.add(gear);
      o.position.set(stands[i * 2].x, 3.6, stands[i * 2].z); o.rotation.y = stands[i * 2].yaw;
      this.group.add(o); this.asset('bomber', 'Parked B-17', o, 260, 19);
    }
    const fuel = new THREE.Group(); afToLocal(300, 780, fuel.position, 0);
    for (let i = 0; i < 3; i++) box(fuel, metal, i * 12, 4, 0, 9, 8, 12);
    this.group.add(fuel); this.asset('fuel', 'Fuel dump', fuel, 350, 28);
    const sites = [[100, 570], [-590, 280], [470, 540]];
    for (let i = 0; i < 3; i++) {
      const pit = new THREE.Group(); afToLocal(sites[i][0], sites[i][1], pit.position, 0.15);
      const parts: THREE.BufferGeometry[] = [];
      for (let layer = 0; layer < 3; layer++) for (let j = 0; j < 22; j++) {
        const a = (j + layer * 0.5) / 22 * Math.PI * 2;
        parts.push(new RoundedBoxGeometry(1, 0.33, 0.52, 2, 0.09).rotateY(-a).translate(Math.sin(a) * 3.5, 0.17 + layer * 0.32, Math.cos(a) * 3.5));
      }
      const geo = mergeGeometries(parts)!; parts.forEach(p => p.dispose()); this.owned.push(geo);
      pit.add(new THREE.Mesh(geo, sand));
      const rig = makeAAGun(i === 1 ? 1 : 0); pit.add(rig.root); this.rigs.push(rig);
      this.group.add(pit); this.pits.push(this.asset('pit', i === 1 ? '40 mm Bofors' : 'Quad .50', pit, 180, 5));
    }
    for (let i = 0; i < 12; i++) {
      const o = new THREE.Group();
      box(o, steel, 0, 0.7, 0, 2, 1.3, 9);
      const wing = box(o, steel, 0, 0.5, 1, 13, 0.22, 2.4); wing.rotation.z = 0.12;
      box(o, steel, 0, 1.1, -3.8, 4, 0.15, 1.3);
      o.visible = false; this.group.add(o); this.wrecks.push({ object: o, pos: o.position, ttl: 0 });
    }
    for (let i = 0; i < 48; i++) { const m = new THREE.Mesh(craterGeo, soot); m.visible = false; this.group.add(m); this.craters.push(m); }
    for (let i = 0; i < 128; i++) {
      const m = new THREE.Mesh(tube, steel); m.visible = false; this.group.add(m);
      this.shells.push({ mesh: m, vel: new THREE.Vector3(), ttl: 0, team: false, damage: 0, rocket: false });
    }
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(tube, brass); m.scale.set(0.024, 0.024, 0.12); m.visible = false; this.group.add(m);
      this.cases.push({ mesh: m, vel: new THREE.Vector3(), ttl: 0 });
    }
  }
  private asset(kind: AAAssetKind, label: string, object: THREE.Object3D, hp: number, radius: number) {
    const a: AAAsset = { kind, label, object, pos: object.position.clone(), radius, hp, maxHp: hp, repair: 0, originalY: object.scale.y };
    this.assets.push(a); return a;
  }
  wreck(at: THREE.Vector3) {
    let slot = this.wrecks[0];
    for (const w of this.wrecks) if (w.ttl < slot.ttl) slot = w;
    slot.pos.copy(at).setY(0.15); slot.object.rotation.y = Math.random() * Math.PI * 2;
    slot.object.visible = true; slot.ttl = 75;
  }
  crater(at: THREE.Vector3, radius: number) {
    const m = this.craters[this.craterIndex++ % this.craters.length]; m.position.copy(at); m.position.y = 0.18; m.scale.setScalar(radius); m.visible = true;
  }
  show(scene: THREE.Scene) { this.base.show(scene, true); scene.add(this.group); }
  dispose() { this.base.dispose(); this.group.removeFromParent(); for (const geo of this.owned) geo.dispose(); }
}

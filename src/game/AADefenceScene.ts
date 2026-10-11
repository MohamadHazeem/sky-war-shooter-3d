import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeAAGun, makeSandbags, makePitFloor, aaMaterials, type AAGunRig } from './AADefenceModels';
import { AAGroundDetail, warmAAGround } from './AADefenceGround';
import { Airbase, afToLocal, makeGear, MAIN_CONTACT, THREE_POINT, SURFACE_Y } from '../world/Airbase';
import { instantiate } from '../world/Models';
import type { AAAssetHealth, AAAssetKind } from './AADefenceRules';

const metal = new THREE.MeshStandardMaterial({ color: 0x343b2a, roughness: 0.7, metalness: 0.35 });
const steel = new THREE.MeshStandardMaterial({ color: 0x202522, roughness: 0.6, metalness: 0.7 });
const brass = new THREE.MeshStandardMaterial({ color: 0xb29a51, metalness: 0.65, roughness: 0.4 });
const soot = new THREE.MeshBasicMaterial({ color: 0x171914 });
const cube = new RoundedBoxGeometry(1, 1, 1, 2, 0.035);
const tube = new THREE.CylinderGeometry(1, 1, 1, 12).rotateX(Math.PI / 2);
const craterGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);

function box(parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const m = new THREE.Mesh(cube, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m;
}
/** Keep shared gun/projectile materials compiled by World's normal warm-up. */
export function warmAAGuns(scene: THREE.Scene, at: THREE.Vector3) {
  const group = new THREE.Group(); group.position.copy(at);
  const rigs = [makeAAGun(0), makeAAGun(1)];
  for (const rig of rigs) {
    rig.barrel.traverse(o => { if (o instanceof THREE.Mesh && o.material === rig.heat) o.material = aaMaterials().steel; });
    rig.heat.dispose();
  }
  group.add(...rigs.map(r => r.root), makeSandbags(), makePitFloor());
  warmAAGround(group);
  for (const mat of [aaMaterials().sand, brass, soot]) box(group, mat, 0, 0, 0, 1, 1, 1);
  scene.add(group);
  return () => { group.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); }); group.removeFromParent(); };
}

export interface AAAsset extends AAAssetHealth { label: string; pos: THREE.Vector3; radius: number; object: THREE.Object3D; originalY: number }
export class AABattlefield {
  readonly base: Airbase;
  readonly detail: AAGroundDetail;
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
      o.position.set(stands[i * 2].x, SURFACE_Y - MAIN_CONTACT.y * Math.cos(THREE_POINT) - MAIN_CONTACT.z * Math.sin(THREE_POINT), stands[i * 2].z);
      o.rotation.set(-THREE_POINT, stands[i * 2].yaw, 0, 'YXZ');
      this.group.add(o); this.asset('bomber', 'Parked B-17', o, 260, 19);
    }
    const fuel = new THREE.Group(); afToLocal(300, 780, fuel.position, 0);
    for (let i = 0; i < 3; i++) box(fuel, metal, i * 12, 4, 0, 9, 8, 12);
    this.group.add(fuel); this.asset('fuel', 'Fuel dump', fuel, 350, 28);
    const sites = [[100, 570], [-590, 280], [470, 540]];
    for (let i = 0; i < 3; i++) {
      const pit = new THREE.Group(); afToLocal(sites[i][0], sites[i][1], pit.position, 0.15);
      pit.add(makeSandbags(), makePitFloor());
      const rig = makeAAGun(i === 1 ? 1 : 0); pit.add(rig.root); this.rigs.push(rig);
      this.group.add(pit); this.pits.push(this.asset('pit', i === 1 ? '40 mm Bofors' : 'Quad .50', pit, 180, 5));
    }
    this.detail = new AAGroundDetail(this.base, this.assets.filter(a => a.kind === 'bomber').map(a => a.object), this.pits.map(a => a.pos), quality === 'low');
    this.group.add(this.detail.group);
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
  dispose() { this.group.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); }); this.detail.dispose(); for (const r of this.rigs) r.heat.dispose(); this.base.dispose(); this.group.removeFromParent(); for (const geo of this.owned) geo.dispose(); }
}

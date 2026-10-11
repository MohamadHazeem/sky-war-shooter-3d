import * as THREE from 'three';
import { Airbase } from '../world/Airbase';
import { aaBatch, aaBox, aaTube, aaMaterials } from './AADefenceModels';

const sheet = new THREE.MeshStandardMaterial({ color: 0x747c69, roughness: 0.88, metalness: 0.25 });
const trim = new THREE.MeshStandardMaterial({ color: 0x424a3e, roughness: 0.85 });
const glass = new THREE.MeshStandardMaterial({ color: 0x64848d, roughness: 0.25, metalness: 0.55 });
const brick = new THREE.MeshStandardMaterial({ color: 0x796452, roughness: 1 });
const tire = new THREE.MeshStandardMaterial({ color: 0x252820, roughness: 1 });
const leaf = new THREE.MeshStandardMaterial({ color: 0x485735, roughness: 1 });
const grass = new THREE.MeshStandardMaterial({ color: 0x626844, roughness: 1 });
const arch = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
const end = new THREE.CircleGeometry(1, 32, 0, Math.PI);
const crown = new THREE.IcosahedronGeometry(1, 1);

export function warmAAGround(group: THREE.Group) {
  for (const material of [sheet, trim, glass, brick, tire, leaf, grass]) aaBox(group, material, 0, 0, 0, 1, 1, 1);
}

/** Eye-level detail is AA-only, attached to damageable buildings and culled past 650 m. */
export class AAGroundDetail {
  readonly group = new THREE.Group();
  private owned: THREE.BufferGeometry[] = [];
  private lods: { group: THREE.Group; anchor: THREE.Object3D }[] = [];
  private crew: { mesh: THREE.Group; home: THREE.Vector3; phase: number }[] = [];
  private anchor = new THREE.Vector3();
  constructor(base: Airbase, parked: readonly THREE.Object3D[], pits: readonly THREE.Vector3[], low: boolean) {
    this.group.name = 'aa-ground-detail';
    const near = (parent: THREE.Object3D) => {
      const g = new THREE.Group(); parent.add(g); this.lods.push({ group: g, anchor: parent }); return g;
    };
    for (const obj of base.group.children) {
      if (obj.name === 'ab_hangar') {
        const g = near(obj);
        // T2 keeps its historically correct low gable; corrugated panels and roof ribs break up the silhouette.
        for (const side of [-1, 1]) {
          for (let z = -36; z <= 36; z += 1.5) {
            aaBox(g, sheet, side * 18.08, 5.7, z, 0.13, 11.4, 0.12);
            const roof = aaBox(g, sheet, side * 9, 13.08, z, 18.3, 0.12, 0.14); roof.rotation.z = -side * 0.165;
          }
          for (let x = -14; x <= 14; x += 2) aaBox(g, sheet, x, 5.2, side * 36.76, 0.09, 10.4, 0.12);
          aaBox(g, trim, 0, 10.65, side * 36.85, 32, 0.25, 0.3);
          for (const x of [-8, 8]) {
            aaBox(g, glass, x, 8.7, side * 36.79, 6, 1.1, 0.04);
            for (let k = -2; k <= 2; k++) aaBox(g, trim, x + k, 8.7, side * 36.83, 0.05, 1.1, 0.06);
          }
          aaBox(g, trim, 0, 4, side * 36.8, 0.12, 8, 0.16);
        }
        aaBatch(g, this.owned);
      }
      if (obj.name === 'ab_tower') {
        const g = near(obj);
        for (const y of [1.9, 5.2]) for (let x = -5; x <= 5; x += 1.8) {
          aaBox(g, glass, x, y, 5.09, 1.5, 1.25, 0.03);
          aaBox(g, sheet, x, y, 5.13, 0.055, 1.25, 0.06);
          aaBox(g, sheet, x, y, 5.13, 1.5, 0.06, 0.06);
        }
        for (let x = -6.5; x <= 6.5; x += 0.75) {
          aaBox(g, trim, x, 4.15, 7.15, 0.05, 1.1, 0.05);
          for (const z of [-5.1, 5.1]) aaBox(g, trim, x, 7.75, z, 0.05, 1.1, 0.05);
        }
        aaBatch(g, this.owned);
      }
      if (obj.name === 'ab_blocks') {
        obj.visible = false;
        const workshops = new THREE.Group(); workshops.position.copy(obj.position); workshops.rotation.copy(obj.rotation); this.group.add(workshops);
        for (let i = 0; i < 7; i++) {
          const hut = new THREE.Group(); hut.position.set(-40 + i * 34, 0, 0); workshops.add(hut);
          this.hut(hut, low);
        }
      }
    }
    for (const bomber of parked) {
      const site = new THREE.Group(); site.position.copy(bomber.position).setY(0); site.rotation.y = bomber.rotation.y; this.group.add(site);
      const g = near(site);
      // Fuel bowser: cab, tank, chassis, hose reel and paired wheels.
      aaBox(g, trim, 24, 0.65, 0, 2.1, 0.22, 5.5);
      aaBox(g, aaMaterials().paint, 24, 1.55, 1.7, 2.1, 1.7, 1.6);
      aaBox(g, glass, 24, 1.9, 2.51, 1.75, 0.6, 0.04);
      aaTube(g, sheet, 24, 1.5, -0.9, 1, 3.5);
      for (const x of [22.9, 25.1]) for (const z of [-1.6, 1.6]) aaTube(g, tire, x, 0.53, z, 0.52, 0.28).rotation.y = Math.PI / 2;
      aaTube(g, trim, 25.15, 1.4, -0.6, 0.38, 0.18).rotation.y = Math.PI / 2;
      // Bomb trolley, drawbar and four olive bombs.
      aaBox(g, trim, -18, 0.5, 4, 1.6, 0.16, 3.6);
      aaBox(g, sheet, -18, 0.5, 6.4, 0.06, 0.06, 1.2);
      for (const x of [-18.85, -17.15]) for (const z of [3, 5]) aaTube(g, tire, x, 0.3, z, 0.3, 0.15).rotation.y = Math.PI / 2;
      for (let j = 0; j < 4; j++) aaTube(g, aaMaterials().paint, -18.55 + j * 0.36, 0.8, 4, 0.17, 2.3);
      aaBatch(g, this.owned);
    }
    // Ground cover in small, independently culled patches around the technical site.
    for (const obj of base.group.children) if (obj.name === 'ab_hangar' || obj.name === 'ab_tower') {
      const patch = new THREE.Group(); patch.position.copy(obj.position); patch.rotation.copy(obj.rotation); this.group.add(patch);
      const g = near(patch);
      for (let i = 0; i < (low ? 16 : 30); i++) {
        const z = -50 + i * 7, x = 55 + Math.sin(i * 7) * 5;
        this.anchor.set(x, 0, z); patch.localToWorld(this.anchor);
        // Every firing position needs an open traverse, including High's denser hedge line.
        if (pits.some(p => p.distanceToSquared(this.anchor) < 18 * 18)) continue;
        const tree = new THREE.Mesh(crown, leaf); tree.position.set(x, 2.6, z); tree.scale.set(2.2, 2.1 + i % 3, 2); g.add(tree);
        aaBox(g, brick, x, 1.4, z, 0.24, 2.8, 0.24);
        aaBox(g, grass, -45 + Math.sin(i * 11) * 14, 0.06, z, 6, 0.03, 3);
      }
      // Gravel verge and a narrow path with separated edges.
      aaBox(g, brick, -23, 0.03, 0, 2.6, 0.04, 100);
      for (const x of [-24.4, -21.6]) aaBox(g, sheet, x, 0.07, 0, 0.18, 0.12, 100);
      aaBatch(g, this.owned);
      if (!low) for (let i = 0; i < 3; i++) {
        const crew = new THREE.Group(); crew.position.set(-22, 0, i * 3); patch.add(crew);
        aaBox(crew, trim, 0, 1.1, 0, 0.36, 0.6, 0.23);
        aaBox(crew, brick, 0, 1.55, 0, 0.22, 0.24, 0.2);
        for (const x of [-0.12, 0.12]) aaBox(crew, trim, x, 0.4, 0, 0.12, 0.8, 0.14);
        aaBatch(crew, this.owned); this.crew.push({ mesh: crew, home: crew.position.clone(), phase: i * 2 });
      }
    }
  }
  private hut(parent: THREE.Group, low: boolean) {
    const shell = new THREE.Mesh(arch, sheet); shell.scale.set(5, 5, 14); parent.add(shell);
    for (const z of [-7, 7]) {
      const e = new THREE.Mesh(end, brick); e.scale.setScalar(5); e.position.z = z; if (z < 0) e.rotation.y = Math.PI; parent.add(e);
      aaBox(parent, trim, 0, 1.25, z * 1.01, 1.65, 2.5, 0.08);
      for (const x of [-2.8, 2.8]) {
        aaBox(parent, glass, x, 1.9, z * 1.01, 1.3, 1.1, 0.09);
        aaBox(parent, sheet, x, 1.9, z * 1.02, 0.06, 1.1, 0.05);
      }
    }
    aaBatch(parent, this.owned);
    const ribs = new THREE.Group(); parent.add(ribs); this.lods.push({ group: ribs, anchor: parent });
    const geo = new THREE.TorusGeometry(5.03, 0.04, 4, 32, Math.PI);
    for (let z = -7; z <= 7; z += low ? 0.5 : 0.3) { const rib = new THREE.Mesh(geo, trim); rib.position.z = z; ribs.add(rib); }
    aaBatch(ribs, this.owned); geo.dispose();
  }
  update(camera: THREE.Camera, time: number, raid: boolean) {
    for (const lod of this.lods) {
      lod.anchor.getWorldPosition(this.anchor); lod.group.visible = camera.position.distanceToSquared(this.anchor) < 650 * 650;
    }
    for (const c of this.crew) {
      c.mesh.position.z = c.home.z + (raid ? (time * 3 + c.phase) % 28 : 0);
      c.mesh.position.y = raid ? Math.abs(Math.sin(time * 9 + c.phase)) * 0.12 : 0;
    }
  }
  dispose() { this.group.removeFromParent(); for (const g of this.owned) g.dispose(); }
}

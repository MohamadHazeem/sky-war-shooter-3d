import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { gunTextures, interiorTextures } from '../render/Textures';

const cube = new RoundedBoxGeometry(1, 1, 1, 2, 0.04);
const tube = new THREE.CylinderGeometry(1, 1, 1, 16).rotateX(Math.PI / 2);
export const aaBrass = new THREE.MeshStandardMaterial({ color: 0xb69b52, metalness: 0.7, roughness: 0.38 });
const edge = new THREE.MeshStandardMaterial({ color: 0x626b5e, metalness: 0.65, roughness: 0.55 });
const lens = new THREE.MeshStandardMaterial({ color: 0x91b0a8, metalness: 0.3, roughness: 0.15, transparent: true, opacity: 0.14, depthWrite: false });
const black = new THREE.MeshStandardMaterial({ color: 0x171b17, roughness: 0.85 });
let paint: THREE.MeshStandardMaterial, steel: THREE.MeshStandardMaterial, sand: THREE.MeshStandardMaterial, earth: THREE.MeshStandardMaterial;
export function aaMaterials() {
  if (!paint) {
    const p = interiorTextures(), s = gunTextures();
    paint = new THREE.MeshStandardMaterial({ map: p.map, normalMap: p.normal, roughnessMap: p.rough, color: 0xc7cbb0, metalness: 0.35, roughness: 0.8 });
    steel = new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normal, roughnessMap: s.rough, color: 0xc1c6c4, metalness: 0.65, roughness: 0.65, side: THREE.DoubleSide, emissive: 0xff3107, emissiveIntensity: 0 });
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#ada181'; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 128; i += 4) {
      ctx.fillStyle = i % 8 ? '#8f8469' : '#c4b696'; ctx.fillRect(i, 0, 1, 128);
      ctx.fillStyle = '#998d70'; ctx.fillRect(0, i, 128, 1);
    }
    const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
    sand = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 0.012, color: 0xa19a83, roughness: 1 });
    const dirt = document.createElement('canvas'); dirt.width = dirt.height = 128;
    const dc = dirt.getContext('2d')!; dc.fillStyle = '#6b614b'; dc.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1000; i++) {
      const v = (Math.sin(i * 73.7) + 1) * 0.5; dc.fillStyle = v > 0.5 ? '#80745a' : '#574e3d';
      dc.fillRect((i * 37) % 128, (i * 67 + Math.floor(i / 128) * 13) % 128, 1 + v * 3, 1 + v * 3);
    }
    const dm = new THREE.CanvasTexture(dirt); dm.colorSpace = THREE.SRGBColorSpace;
    earth = new THREE.MeshStandardMaterial({ map: dm, roughness: 1 });
  }
  return { paint, steel, sand, earth };
}
export function aaBox(parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const m = new THREE.Mesh(cube, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m;
}
export function aaTube(parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, r: number, len: number) {
  const m = new THREE.Mesh(tube, mat); m.position.set(x, y, z); m.scale.set(r, r, len); parent.add(m); return m;
}
/** Bake static siblings by material, preserving the yaw, elevation and recoil pivots. */
export function aaBatch(group: THREE.Group, owned?: THREE.BufferGeometry[]) {
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const child of [...group.children]) {
    if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh) continue;
    child.updateMatrix();
    const geo = (child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone()).applyMatrix4(child.matrix);
    const material = child.material as THREE.Material;
    const list = batches.get(material) ?? []; list.push(geo); batches.set(material, list);
    group.remove(child);
  }
  for (const [mat, parts] of batches) {
    const geo = mergeGeometries(parts)!; parts.forEach(p => p.dispose()); owned?.push(geo);
    group.add(new THREE.Mesh(geo, mat));
  }
}
// Unfold, perforate, then roll the jacket. Real openings expose the narrower bore underneath.
function jacketGeometry() {
  const r = 0.047, length = 0.96, circumference = Math.PI * 2 * r;
  const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(circumference, 0); shape.lineTo(circumference, length); shape.lineTo(0, length); shape.closePath();
  for (let row = 0; row < 10; row++) for (let col = 0; col < 6; col++) {
    const hole = new THREE.Path(); hole.absarc((col + 0.5) * circumference / 6, 0.065 + row * 0.09, 0.015, 0, Math.PI * 2, true); shape.holes.push(hole);
  }
  const g = new THREE.ShapeGeometry(shape, 6), pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) { const a = pos.getX(i) / r, z = pos.getY(i); pos.setXYZ(i, Math.sin(a) * r, Math.cos(a) * r, z); }
  g.computeVertexNormals(); return g;
}
let jacket: THREE.BufferGeometry;
const templates: AAGunRig[] = [];
export interface AAGunRig { root: THREE.Group; yaw: THREE.Group; pitch: THREE.Group; barrel: THREE.Group; heat: THREE.MeshStandardMaterial; clip: THREE.Group }
function buildGun(kind: number): AAGunRig {
  const { paint, steel } = aaMaterials();
  const root = new THREE.Group(), yaw = new THREE.Group(), pitch = new THREE.Group(), barrel = new THREE.Group(), clip = new THREE.Group();
  root.add(yaw); yaw.position.y = 1.5; yaw.add(pitch); pitch.add(barrel, clip);
  root.name = kind ? 'Bofors 40 mm' : 'M45 Maxson'; yaw.name = 'traverse'; pitch.name = 'elevation'; barrel.name = 'recoil'; clip.name = 'clip';
  aaTube(root, paint, 0, 0.24, 0, 0.7, 0.28).rotation.x = Math.PI / 2;
  aaBox(root, paint, 0, 0.68, 0, 0.45, 0.8, 0.5);
  aaBox(yaw, paint, 0, -0.66, -0.38, 1.3, 0.12, 1.3);
  aaBox(yaw, black, 0, -0.5, -0.63, 0.48, 0.13, 0.42); // seat cushion / rolled edge
  aaBox(yaw, paint, 0, -0.34, -0.84, 0.5, 0.38, 0.05);
  for (const side of [-1, 1]) {
    aaBox(yaw, paint, side * 0.59, -0.35, 0.15, 0.12, 0.7, 0.55);
    aaTube(yaw, edge, side * 0.63, -0.1, 0.2, 0.11, 0.08).rotation.y = Math.PI / 2;
    // Armour surrounds a central sight window; folded wings and bright rubbed top edges.
    const plate = aaBox(pitch, paint, side * 0.65, -0.2, 0.58, 0.64, 0.7, 0.055); plate.rotation.y = -side * 0.24;
    const rim = aaBox(pitch, edge, side * 0.65, 0.15, 0.58, 0.64, 0.012, 0.058); rim.rotation.y = plate.rotation.y;
    aaBox(pitch, paint, 0, -0.46, 0.58, 0.65, 0.16, 0.055);
    aaBox(pitch, paint, side * 0.24, -0.14, -0.44, 0.045, 0.2, 0.1);
    aaBox(pitch, black, side * 0.24, -0.1, -0.51, 0.052, 0.15, 0.065); // hand grips
    if (!kind) {
      aaBox(pitch, paint, side * 0.95, -0.23, 0.04, 0.4, 0.55, 0.62);
      aaBox(pitch, paint, side * 0.95, 0.05, 0.04, 0.41, 0.025, 0.63);
      for (const z of [-0.27, 0.35]) aaBox(pitch, edge, side * 0.95, 0.05, z, 0.41, 0.008, 0.008);
      aaBox(pitch, edge, side * 1.157, -0.025, 0.04, 0.01, 0.1, 0.04);
      aaBox(pitch, black, side * 0.95, 0.085, 0.04, 0.18, 0.035, 0.06);
      for (let row = 0; row < 2; row++) for (let j = 0; j < 12; j++) {
        const x = side * (0.38 + j * 0.041), y = -0.17 - row * 0.27 - Math.sin(j / 11 * Math.PI) * 0.13;
        aaTube(pitch, aaBrass, x, y, 0.08, 0.014, 0.12);
        aaBox(pitch, steel, x, y, 0.055, 0.043, 0.018, 0.022);
      }
    }
  }
  if (!kind) {
    jacket ??= jacketGeometry();
    for (let i = 0; i < 4; i++) {
      const x = (i % 2 ? 1 : -1) * 0.32, y = -0.17 - Math.floor(i / 2) * 0.27;
      aaBox(barrel, steel, x, y, 0.14, 0.135, 0.16, 0.77);
      aaBox(barrel, edge, x, y + 0.081, 0.12, 0.012, 0.008, 0.55);
      aaTube(barrel, steel, x, y, 1.08, 0.022, 1.1);
      const j = new THREE.Mesh(jacket, steel); j.position.set(x, y, 0.54); barrel.add(j);
      aaTube(barrel, edge, x, y, 0.54, 0.052, 0.04);
      aaTube(barrel, steel, x, y, 1.58, 0.052, 0.13);
      aaTube(barrel, black, x, y, 1.649, 0.033, 0.005);
    }
    aaBox(pitch, lens, 0, 0.18, 0.46, 0.18, 0.18, 0.003);
    // Mk 9 reflector sight: short post, optical housing and amber reticle in a framed lens.
    aaBox(pitch, steel, 0, -0.015, 0.38, 0.045, 0.24, 0.06);
    aaBox(pitch, black, 0, 0.08, 0.38, 0.18, 0.08, 0.2);
    for (const x of [-0.1, 0.1]) aaBox(pitch, edge, x, 0.18, 0.46, 0.013, 0.2, 0.015);
    for (const y of [0.08, 0.28]) aaBox(pitch, edge, 0, y, 0.46, 0.2, 0.012, 0.015);
  } else {
    aaBox(barrel, steel, 0, -0.26, 0.25, 0.27, 0.28, 1.1);
    aaTube(barrel, paint, 0, -0.24, 0.92, 0.13, 0.8); // recoil sleeve
    aaTube(barrel, steel, 0, -0.24, 1.75, 0.047, 1.5);
    const coneGeo = new THREE.CylinderGeometry(0.105, 0.047, 0.28, 16, 1, true).rotateX(Math.PI / 2);
    const cone = new THREE.Mesh(coneGeo, steel); cone.position.set(0, -0.24, 2.55); barrel.add(cone);
    for (const x of [-0.14, 0.14]) aaBox(pitch, paint, x, -0.06, 0.1, 0.035, 0.46, 0.25); // loader guides
    for (let i = 0; i < 4; i++) aaTube(clip, aaBrass, (i - 1.5) * 0.058, 0.05, 0.13, 0.024, 0.3);
    aaBox(clip, steel, 0, 0.05, -0.01, 0.25, 0.022, 0.045);
    aaBox(pitch, steel, 0, 0, 0.65, 0.022, 0.24, 0.022);
  }
  const reticleMat = new THREE.MeshBasicMaterial({ color: kind ? 0xaaa893 : 0xdfaf50 });
  for (const r of kind ? [0.11, 0.055] : [0.048]) {
    const geo = new THREE.TorusGeometry(r, kind ? 0.003 : 0.002, 5, 40);
    const m = new THREE.Mesh(geo, reticleMat); m.position.set(0, 0.18, kind ? 0.65 : 0.465); pitch.add(m);
  }
  for (let i = 0; i < (kind ? 4 : 2); i++) {
    const spoke = aaBox(pitch, reticleMat, 0, 0.18, kind ? 0.65 : 0.465, kind ? 0.22 : 0.12, 0.0025, 0.0025); spoke.rotation.z = i * Math.PI / (kind ? 4 : 2);
  }
  if (kind) aaBox(pitch, edge, 0, 0.18, 1.9, 0.012, 0.015, 0.012);
  for (const g of [root, yaw, pitch, barrel, clip]) aaBatch(g);
  return { root, yaw, pitch, barrel, heat: steel, clip };
}
export function makeAAGun(kind: number): AAGunRig {
  const t = templates[kind] ??= buildGun(kind);
  const root = t.root.clone(true), heat = t.heat.clone();
  const barrel = root.getObjectByName('recoil') as THREE.Group;
  barrel.traverse(o => { if (o instanceof THREE.Mesh && o.material === t.heat) o.material = heat; });
  return { root, yaw: root.getObjectByName('traverse') as THREE.Group, pitch: root.getObjectByName('elevation') as THREE.Group, barrel, clip: root.getObjectByName('clip') as THREE.Group, heat };
}
const dirtGeometry = new THREE.CircleGeometry(3.6, 48).rotateX(-Math.PI / 2);
export function makePitFloor() {
  const mesh = new THREE.Mesh(dirtGeometry, aaMaterials().earth); mesh.position.y = 0.012; return mesh;
}
const bagGeometry = new RoundedBoxGeometry(0.62, 0.25, 0.39, 3, 0.105);
export function makeSandbags() {
  const bags = new THREE.InstancedMesh(bagGeometry, aaMaterials().sand, 4 * 34);
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  for (let layer = 0; layer < 4; layer++) for (let j = 0; j < 34; j++) {
    const i = layer * 34 + j, a = (j + layer * 0.5) / 34 * Math.PI * 2, wobble = Math.sin(i * 73.7);
    dummy.position.set(Math.sin(a) * (3.3 + wobble * 0.025), 0.13 + layer * 0.245 + wobble * 0.012, Math.cos(a) * (3.3 + wobble * 0.025));
    dummy.rotation.set(wobble * 0.025, a + wobble * 0.045, wobble * 0.025); dummy.updateMatrix();
    bags.setMatrixAt(i, dummy.matrix); bags.setColorAt(i, color.setScalar(0.82 + (wobble + 1) * 0.09));
  }
  bags.name = 'hessian sandbag courses'; bags.computeBoundingSphere(); return bags;
}

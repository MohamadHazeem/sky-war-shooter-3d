import * as THREE from 'three';
import { interiorAssets, addBounce } from './InteriorAssets';
import { interiorSkinTextures, SKIN_TILE_Z, SKIN_TILE_T } from '../render/InteriorSkin';
import { envRef } from '../render/EnvRef';

// Interior 2.0 dressing of the waist group (LivingInterior.build, Medium preset and up):
//  - the Blender kit (formers, stringers, equipment, radio room, bomb bay, bombs) goes in
//  - the procedural details it replaces (Viewmodels 'waistLegacyDetail', LivingInterior
//    'radioLegacy') are hidden
//  - the procedural skin (waist shell, bulkheads, radio-room shell, tail tunnel) gets bare
//    aluminium (render/InteriorSkin.ts) with UVs that put its rivet lines on the kit's members
// undo() puts everything back (Low preset / next mission).

const A = 1.08, B = 1.12, YC = 0.15;
const WAIST_Z = -7.44, Z_FORMER0 = WAIST_Z - 3.2 + 0.25;
const FLOOR_TOP = YC - B * 0.78 + 0.015;
const T0 = Math.asin((FLOOR_TOP - YC) / B) + 0.1;        // first stringer line (tools/interior/build_interior.py)
// forward end of the kit (bomb-bay bulkhead): the cut-down airframe must clear up to here
export const KIT_FWD_Z = WAIST_Z + 3.2 + 1.7 + 2.9;

let skinMat: THREE.MeshStandardMaterial | null = null;
let skinMatBoth: THREE.MeshStandardMaterial | null = null;
export function skinMaterial(double = false): THREE.MeshStandardMaterial {
  if (!skinMat) {
    const t = interiorSkinTextures();
    skinMat = new THREE.MeshStandardMaterial({
      map: t.map, normalMap: t.normal, roughnessMap: t.rough, normalScale: new THREE.Vector2(0.9, 0.9),
      color: new THREE.Color(1, 1, 1), roughness: 1, metalness: 0.55, envMap: envRef.tex, envMapIntensity: 0.22, vertexColors: true,
    });
    skinMat.name = 'interiorSkin';
    addBounce(skinMat, 0.85);
    skinMatBoth = skinMat.clone();
    skinMatBoth.side = THREE.DoubleSide;
    addBounce(skinMatBoth, 0.85);
  }
  return double ? skinMatBoth! : skinMat;
}

// UVs on the elliptical skin (one tile = 4 formers x 4 stringers) and a grime/AO vertex colour:
// dirtier toward the floor, darker in the crown and the bilge where the window light never reaches
export function skinUv(geo: THREE.BufferGeometry, planar = false) {
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2), col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let t = Math.atan2((y - YC) / B, x / A);
    if (t < T0 - 0.4) t += Math.PI * 2;
    uv[i * 2] = planar ? x / (SKIN_TILE_T * 1.1) : (t - T0) / SKIN_TILE_T;
    uv[i * 2 + 1] = planar ? y / SKIN_TILE_Z : (z - Z_FORMER0) / SKIN_TILE_Z;
    const floorGrime = THREE.MathUtils.smoothstep(y, FLOOR_TOP - 0.3, FLOOR_TOP + 0.5);
    const crown = 1 - 0.25 * THREE.MathUtils.smoothstep(y, YC + 0.7, YC + B);
    const k = (0.55 + 0.45 * floorGrime) * crown;
    col[i * 3] = k; col[i * 3 + 1] = k * 0.99; col[i * 3 + 2] = k * 0.97;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

interface Swap { mesh: THREE.Mesh; mat: THREE.Material | THREE.Material[]; uv: THREE.BufferAttribute | undefined; col: THREE.BufferAttribute | undefined }

export class InteriorKit {
  readonly group = new THREE.Group();
  bombs: THREE.Object3D | null = null;
  private hidden: THREE.Object3D[] = [];
  private swaps: Swap[] = [];

  // waist: the waist interior group (Viewmodels.buildWaistInterior + LivingInterior statics)
  constructor(private waist: THREE.Group) {
    const a = interiorAssets()!;
    this.group.name = 'interiorKit';
    const kit = a.kit.scene.clone();
    this.group.add(kit);
    this.bombs = kit.getObjectByName('kitBombs') ?? null;
    waist.add(this.group);
    for (const name of ['waistLegacyDetail', 'radioLegacy']) {
      const o = waist.getObjectByName(name);
      if (o && o.visible) { o.visible = false; this.hidden.push(o); }
    }
    for (const name of ['waistShell', 'waistBulkhead', 'radioShell', 'tailTunnel', 'tailCatwalk']) {
      waist.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || m.name !== name) return;
        const g = m.geometry;
        this.swaps.push({ mesh: m, mat: m.material, uv: g.getAttribute('uv') as THREE.BufferAttribute | undefined, col: g.getAttribute('color') as THREE.BufferAttribute | undefined });
        skinUv(g, name === 'waistBulkhead');
        const side = (Array.isArray(m.material) ? m.material[0] : m.material).side;
        m.material = skinMaterial(side !== THREE.FrontSide);
      });
    }
  }

  undo() {
    for (const o of this.hidden) o.visible = true;
    for (const s of this.swaps) {
      s.mesh.material = s.mat;
      const g = s.mesh.geometry;
      if (s.uv) g.setAttribute('uv', s.uv); else g.deleteAttribute('uv');
      if (s.col) g.setAttribute('color', s.col); else g.deleteAttribute('color');
    }
    this.hidden = []; this.swaps = [];
    this.group.removeFromParent();
    this.bombs = null;
  }
}

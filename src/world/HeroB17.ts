import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Authored mesh LODs share one animation/damage hierarchy. No per-frame allocations. */
let low = false;
export function setHeroQuality(isLow: boolean) { low = isLow; }
export function heroLevel(distance: number, isLow: boolean) { return isLow || distance >= 650 ? 2 : distance >= 180 ? 1 : 0; }
export class HeroLOD extends THREE.LOD {
  override update(camera: THREE.Camera) {
    if (!low) { super.update(camera); return; }
    for (let i = 0; i < this.levels.length; i++) this.levels[i].object.visible = i === 2;
  }
}

export function prepareHeroLODs(root: THREE.Object3D) {
  const parents: THREE.Object3D[] = [];
  root.traverse(o => { if (o.name.endsWith('_lod')) parents.push(o); });
  for (const parent of parents) {
    const lod = new HeroLOD();
    lod.name = 'heroLOD';
    const children = [...parent.children].sort((a, b) => a.name.localeCompare(b.name));
    if (children.length !== 3) throw new Error(`B-17 LOD contract: ${parent.name}`);
    for (let i = 0; i < children.length; i++) lod.addLevel(children[i], [0, 180, 650][i], .1);
    parent.add(lod);
    // Before the first renderer update, only the detailed level participates in raycasts.
    lod.levels[1].object.visible = lod.levels[2].object.visible = false;
  }
}

/** One merged LOD2 silhouette for LivingSky's existing single instanced stream draw. */
export function heroStreamGeometry(root: THREE.Object3D): THREE.BufferGeometry | null {
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    let level = false;
    for (let p: THREE.Object3D | null = m; p; p = p.parent) if (p.name.endsWith('_LOD2')) level = true;
    if (!level) return;
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    parts.push(g.index ? g.toNonIndexed() : g);
    if (g.index) g.dispose();
  });
  if (!parts.length) return null;
  const result = mergeGeometries(parts)!;
  for (const g of parts) g.dispose();
  return result;
}

/** Mechanical controls use normalized travel; props and gun aiming use Aircraft.ts. */
export class HeroB17Controls {
  private readonly flaps: (THREE.Object3D | undefined)[];
  private readonly doors: (THREE.Object3D | undefined)[];
  private readonly gear: (THREE.Object3D | undefined)[];
  private bay = 0;
  constructor(root: THREE.Object3D) {
    const find = (n: string) => root.getObjectByName(n);
    this.flaps = ['flap_L', 'flap_R'].map(find);
    this.doors = ['bomb_bay_L', 'bomb_bay_R'].map(find);
    this.gear = ['gear_L', 'gear_R', 'gear_tail'].map(find);
  }
  setGear(retracted: number) {
    const k = THREE.MathUtils.clamp(retracted, 0, 1);
    for (const o of this.gear) if (o) o.rotation.x = Math.PI / 2 * k * (o.userData.heroGearSign ?? 1);
    for (const o of this.flaps) if (o) o.rotation.x = -.52 * (1 - k);
  }
  update(dt: number, open: boolean) {
    this.bay += ((open ? 1 : 0) - this.bay) * (1 - Math.exp(-dt * 2));
    for (let i = 0; i < 2; i++) if (this.doors[i]) this.doors[i]!.rotation.z = (i ? -1 : 1) * this.bay * 1.35;
  }
}

/** Include every material variant in World.prewarm, regardless of camera distance/preset. */
export function warmHeroLODs(root: THREE.Object3D) {
  const lods: THREE.LOD[] = [];
  root.traverse(o => { if ((o as THREE.LOD).isLOD) {
    const l = o as THREE.LOD; l.autoUpdate = false; lods.push(l);
    for (const level of l.levels) level.object.visible = true;
  } });
  return () => { for (const l of lods) { l.autoUpdate = true; for (let i = 0; i < l.levels.length; i++) l.levels[i].object.visible = i === 0; } };
}

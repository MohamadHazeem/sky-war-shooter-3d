import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Low/Medium distant formation: one rigid LOD2 airframe per material, with opaque
 * glass and no tiny crew/gun/prop details. Falling, nearby and player ships use the
 * articulated source instead. Built once from the authored model, never in a frame. */
export function compactBomber(source: T.Object3D): T.Group {
  const byMaterial = new Map<T.Material, T.BufferGeometry[]>();
  source.updateMatrixWorld(true);
  source.traverse(o => {
    const m = o as T.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    let level = false;
    for (let p: T.Object3D | null = m; p && p !== source; p = p.parent) {
      if (/^prop_|^gun_|^turret_.*_guns|^crew|^invasion_markings/.test(p.name)) return;
      if (p.name.endsWith('_LOD2')) level = true;
    }
    if (!level) return;
    const g = new T.BufferGeometry(), src = m.geometry;
    for (const name of ['position', 'normal', 'uv']) {
      const a = src.getAttribute(name), size = name === 'uv' ? 2 : 3;
      const out = new T.Float32BufferAttribute(new Float32Array(src.attributes.position.count * size), size);
      if (a) for (let i=0;i<a.count;i++) { out.setXY(i,a.getX(i),a.getY(i)); if(size===3)out.setZ(i,a.getZ(i)); }
      g.setAttribute(name,out);
    }
    if(src.index)g.setIndex(src.index.clone());
    g.applyMatrix4(m.matrixWorld);
    const list = byMaterial.get(m.material) ?? []; list.push(g); byMaterial.set(m.material,list);
  });
  const root = new T.Group(); root.name = 'compactBomber';
  for (const [material, parts] of byMaterial) {
    const geometry = mergeGeometries(parts); for(const p of parts)p.dispose();
    if(!geometry)continue;
    // Independent Low material keeps the shared High glass fully transparent.
    const mat = material.clone();mat.transparent=false;mat.opacity=1;mat.depthWrite=true;
    const mesh = new T.Mesh(geometry, mat); mesh.castShadow=mesh.receiveShadow=true;
    mesh.matrixAutoUpdate=false; root.add(mesh);
  }
  return root;
}

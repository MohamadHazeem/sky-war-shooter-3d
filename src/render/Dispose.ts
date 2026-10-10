import * as THREE from 'three';

// Per-instance GPU resources (cloned materials, one-off geometries) are tagged with
// userData.owned = true where they are created; this frees them when the object leaves the
// scene. Shared resources (model geometry, cached materials) are never tagged.
export function markOwned<T extends THREE.Material | THREE.BufferGeometry>(r: T): T {
  r.userData.owned = true;
  return r;
}

export function disposeOwned(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry?.userData?.owned) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) if (mat.userData?.owned) mat.dispose();
  });
}

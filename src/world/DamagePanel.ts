import * as THREE from 'three';

// Static aircraft meshes (including normalized/quantized GLTF attributes). Unlike
// Mesh.raycast this writes into caller-owned vectors and allocates no intersections
// for every round in a burst. Bounds reject unrelated panels before triangle tests.
const inverse = new THREE.Matrix4();
const normalMatrix = new THREE.Matrix3();
const localRay = new THREE.Ray();
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const p = new THREE.Vector3(), n = new THREE.Vector3();
export function hitPanel(meshes: readonly THREE.Mesh[], ray: THREE.Ray, far: number, point: THREE.Vector3, normal?: THREE.Vector3) {
  let best = far * far, found = false;
  for (const mesh of meshes) {
    if (!mesh.visible) continue;
    const geo = mesh.geometry, positions = geo.getAttribute('position'), index = geo.index;
    if (!positions) continue;
    inverse.copy(mesh.matrixWorld).invert();
    localRay.copy(ray).applyMatrix4(inverse);
    if (geo.boundingSphere && localRay.distanceSqToPoint(geo.boundingSphere.center) > geo.boundingSphere.radius ** 2) continue;
    if (geo.boundingBox && !localRay.intersectsBox(geo.boundingBox)) continue;
    const count = index ? index.count : positions.count;
    for (let i = 0; i + 2 < count; i += 3) {
      a.fromBufferAttribute(positions, index ? index.getX(i) : i);
      b.fromBufferAttribute(positions, index ? index.getX(i + 1) : i + 1);
      c.fromBufferAttribute(positions, index ? index.getX(i + 2) : i + 2);
      if (!localRay.intersectTriangle(a, b, c, false, p)) continue;
      p.applyMatrix4(mesh.matrixWorld);
      const distance = p.distanceToSquared(ray.origin);
      if (distance > best) continue;
      best = distance; found = true; point.copy(p);
      if (normal) {
        n.subVectors(b, a); c.sub(a); n.cross(c);
        normal.copy(n).applyMatrix3(normalMatrix.getNormalMatrix(mesh.matrixWorld)).normalize();
      }
    }
  }
  return found;
}

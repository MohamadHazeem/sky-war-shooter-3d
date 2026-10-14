import * as THREE from 'three';
const SILK = new THREE.MeshBasicMaterial({ color: 0xbdb79b, side: THREE.DoubleSide });
const CORD = new THREE.MeshBasicMaterial({ color: 0x594e35 });
const DOME = new THREE.SphereGeometry(1.5, 20, 8, 0, Math.PI * 2, 0, Math.PI * .48);
const LINE = new THREE.CylinderGeometry(.009, .009, 1, 4);
/** Visible silk and suspension lines put the player under his own parachute. */
export function bailOutCanopy() {
  const root = new THREE.Group(); root.name = 'playerParachute';
  const dome = new THREE.Mesh(DOME, SILK); dome.scale.y = .3; dome.position.set(0, .75, -1.8); root.add(dome);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const side of [-1, 1]) for (const z of [-2.8, -1.4]) {
    a.set(side * .3, -.3, -.8); b.set(side * 1.1, .78, z);
    const line = new THREE.Mesh(LINE, CORD); line.position.copy(a).add(b).multiplyScalar(.5);
    line.scale.y = a.distanceTo(b); line.quaternion.setFromUnitVectors(up, b.sub(a).normalize()); root.add(line);
  }
  root.visible = false; return root;
}
export function warmBailOutCanopy(scene: THREE.Scene, at: THREE.Vector3) {
  const root = bailOutCanopy(); root.visible = true; root.position.copy(at); scene.add(root);
  return () => root.removeFromParent();
}

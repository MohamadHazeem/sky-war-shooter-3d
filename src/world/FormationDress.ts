import * as THREE from 'three';
import type { Bomber } from './Aircraft';
import type { HitEvent } from './Ballistics';
import { applyNoseArt } from '../render/NoseArt';
import { markOwned } from '../render/Dispose';
import { tx } from '../i18n';
import { SQUADRONS } from './FormationRules';

// One bounded instanced draw per ship; skin raycasts happen only on impact, never per frame.
const shape = new THREE.Shape();
for (let i = 0; i < 12; i++) {
  const a = i / 12 * Math.PI * 2, r = i % 2 ? 0.7 : 1;
  if (!i) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
}
shape.closePath();
const holeGeo = new THREE.ShapeGeometry(shape);
const holeMat = new THREE.MeshStandardMaterial({color: 0x100e0b, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3});
const _matrix = new THREE.Matrix4(), _position = new THREE.Vector3(), _normal = new THREE.Vector3(), _scale = new THREE.Vector3();
const _q = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1), ray = new THREE.Raycaster();
const inv = new THREE.Matrix4(), normalMatrix = new THREE.Matrix3();
const badges = new Map<string, THREE.MeshStandardMaterial>();
const badgeGeo = new THREE.PlaneGeometry(3.8, 0.9);
function badgeMaterial(index: number) {
  const squadron = SQUADRONS[index], label = tx(squadron.name);
  const cached = badges.get(label); if (cached) return cached;
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = squadron.color; ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#f4e6c0'; ctx.font = 'bold 58px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, 256, 85);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({map, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2});
  badges.set(label, mat); return mat;
}
export class FormationDress {
  readonly holes = new THREE.InstancedMesh(holeGeo, holeMat, 16);
  readonly identity = new THREE.Group();
  private next = 0;
  private skin: THREE.Object3D;
  constructor(readonly bomber: Bomber, index: number) {
    this.identity.name = 'formationIdentity';
    this.skin = bomber.model.getObjectByName('airframe') ?? bomber.model;
    this.holes.count = 0; this.holes.frustumCulled = false; this.holes.name = 'formationDamage';
    // Own the instance buffer, while geometry/material remain shared.
    bomber.model.add(this.holes, this.identity);
    const squadron = Math.floor(index / 3) % SQUADRONS.length;
    applyNoseArt(bomber.model, SQUADRONS[squadron].art, tx(bomber.name));
    const art = bomber.model.getObjectByName('noseArt');
    if (art) {
      this.identity.attach(art);
      const right = art.clone() as THREE.Mesh;
      right.geometry = markOwned((art as THREE.Mesh).geometry.clone().scale(-1, 1, 1));
      right.material = (art as THREE.Mesh).material;
      // Reverse triangle winding after mirroring so the second decal faces outwards.
      const indices = right.geometry.index!;
      for (let i = 0; i < indices.count; i += 3) { const a = indices.getX(i); indices.setX(i, indices.getX(i + 2)); indices.setX(i + 2, a); }
      this.identity.add(right);
    }
    for (const side of [-1, 1]) {
      const badge = new THREE.Mesh(badgeGeo, badgeMaterial(squadron));
      badge.position.set(side * 1.27, 0.25, -4.5); badge.rotation.y = side * Math.PI / 2;
      this.identity.add(badge);
    }
  }
  hit(e: HitEvent) {
    const b = this.bomber;
    b.root.updateMatrixWorld(true);
    // Cast from outside toward the hit zone, seating the scar on the actual model skin.
    _normal.copy(e.point).sub(b.pos).normalize();
    if (_normal.lengthSq() < 0.1) _normal.set(0, 1, 0);
    ray.set(_position.copy(e.point).addScaledVector(_normal, 25), _normal.negate()); ray.far = 55;
    const hits = ray.intersectObject(this.skin, true);
    let hit = hits[0];
    for (const candidate of hits) if (candidate.point.distanceToSquared(e.point) < hit.point.distanceToSquared(e.point)) hit = candidate;
    if (!hit?.face) return;
    inv.copy(b.model.matrixWorld).invert(); _position.copy(hit.point).applyMatrix4(inv);
    normalMatrix.getNormalMatrix(hit.object.matrixWorld);
    _normal.copy(hit.face.normal).applyMatrix3(normalMatrix).transformDirection(inv);
    _position.addScaledVector(_normal, 0.015); _q.setFromUnitVectors(Z, _normal);
    _scale.setScalar(e.cannon ? 0.65 : 0.24);
    _matrix.compose(_position, _q, _scale);
    this.holes.setMatrixAt(this.next++ % 16, _matrix); this.holes.count = Math.min(16, this.next); this.holes.instanceMatrix.needsUpdate = true;
  }
  update(distanceSq: number, low: boolean) {
    this.identity.visible = distanceSq < (low ? 400 * 400 : 800 * 800);
    this.holes.visible = this.holes.count > 0 && distanceSq < (low ? 500 * 500 : 1100 * 1100);
  }
  dispose() { this.holes.dispose(); }
  static warm(scene: THREE.Scene, at: THREE.Vector3) {
    const m = new THREE.InstancedMesh(holeGeo, holeMat, 1); m.setMatrixAt(0, _matrix.makeTranslation(at.x, at.y, at.z)); m.frustumCulled = false; scene.add(m);
    const badge = new THREE.Mesh(badgeGeo, badgeMaterial(0));
    badge.position.copy(at); badge.frustumCulled = false; scene.add(badge);
    return () => { badge.removeFromParent(); m.removeFromParent(); m.dispose(); };
  }
}

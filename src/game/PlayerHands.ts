import * as THREE from 'three';
import type { StationId } from '../world/B17Layout';
import type { GunModel } from './Viewmodels';
import { playerArm } from './CrewActor';
import { lookOf, type FigureLook } from './CrewFigure';

// Interior 2.0: the player's own sheepskin sleeves and gloved fists on the guns (the 'fpArm'
// mesh of crew.glb). Waist and tail: on the spade grips of the M2s (they ride the recoil);
// top and ball turrets: on the turret's control handles, a small yoke added in front of the
// gunner. Seen when looking down at the gun (free look, kill cams, photo mode).
const GRIP = new THREE.Vector3(0.085, -0.02, -0.52);   // spade grip in the gun frame (Viewmodels.buildM2)

function onGrip(gun: GunModel, side: 1 | -1, look: FigureLook) {
  const arm = playerArm(look, side < 0);
  if (!arm) return;
  arm.position.set(side * GRIP.x, GRIP.y, GRIP.z);
  arm.rotation.x = 0.25;
  gun.recoil[0].add(arm);
}

let yokeMat: THREE.MeshStandardMaterial | null = null;
function controlYoke(look: FigureLook, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'playerHands';
  yokeMat ??= new THREE.MeshStandardMaterial({ color: 0x1a1b18, roughness: 0.55, metalness: 0.5 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 0.05), yokeMat);
  bar.position.set(0, y - 0.07, z);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.04), yokeMat);
  post.position.set(0, y - 0.16, z);
  g.add(bar, post);
  for (const side of [1, -1] as const) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.12, 10), yokeMat);
    h.position.set(side * 0.13, y, z);
    g.add(h);
    const arm = playerArm(look, side < 0);
    if (arm) { arm.position.set(side * 0.13, y, z); g.add(arm); }
  }
  g.traverse((o) => { o.castShadow = o.receiveShadow = true; });
  return g;
}

// guns: GunnerController's per-station guns; turrets: the top / ball interiors (they turn with the guns)
export function addPlayerHands(guns: Partial<Record<StationId, GunModel[]>>, turrets: { top?: THREE.Object3D; ball?: THREE.Object3D }) {
  const look = lookOf(null);
  for (const id of ['waistL', 'waistR'] as const) for (const g of guns[id] ?? []) { onGrip(g, 1, look); onGrip(g, -1, look); }
  (guns.tail ?? []).forEach((g, i) => onGrip(g, i === 0 ? -1 : 1, look));   // the outer grip of each twin gun
  if (turrets.top) turrets.top.add(controlYoke(look, 0.02, 0.2));
  if (turrets.ball) turrets.ball.add(controlYoke(look, -0.18, 0.22));
}

// yoke programs for World.prewarm
export function yokeMaterial() { yokeMat ??= new THREE.MeshStandardMaterial({ color: 0x1a1b18, roughness: 0.55, metalness: 0.5 }); return yokeMat; }

// Share cards' photo (Phase 11 · 37): a staged camera instead of the live view. The camera is
// moved to a three-quarter view of the player's aircraft (the B-17, or the Mustang), on whichever
// side puts the most of the formation in the background, a few frames are rendered so shadows and
// exposure settle, the frame is copied, and then everything is put back exactly as PhotoMode does
// it: the camera's parent, slot, pose and fov, the post settings, the parts the gunner view hides
// and the camera's own children (gun viewmodels, hands). Without a subject (no world, everything
// shot down) it falls back to the live view.
import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { World } from '../world/World';
import type { Aircraft } from '../world/Aircraft';
import { Atmos } from '../render/Atmosphere';
import { GUNNER_HIDDEN } from './PhotoMode';
import { captureFrame } from './Share';

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _look = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _mi = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

/** Camera offset in the subject's frame (+Z is forward): front quarter, a little above. x and z are mirrored to find the best side. */
export const STAGE = {
  bomber: { pos: new THREE.Vector3(26, 4, 28), look: new THREE.Vector3(-3, 2.5, -1), fov: 40 },   // the aim point sits above the ship: it prints below the stamp
  fighter: { pos: new THREE.Vector3(10, 2.4, 9), look: new THREE.Vector3(-0.4, 0, 0.6), fov: 44 },
  warmFrames: 8,   // frames rendered before the copy: the sun's shadow cascades, history and exposure settle
};
/** The print's aspect (ShareCard: 872×430 for missions; the tour's print is wider still). */
const PRINT_ASPECT = 2;


const flying = (a: Aircraft | null | undefined): a is Aircraft => !!a && a.alive && !a.falling && !a.remove;

/** The aircraft to photograph: the player's own if it is still flying, else the nearest bomber still in formation. */
export function stageSubject(world: World): { a: Aircraft; kind: 'bomber' | 'fighter' } | null {
  if (world.player && world.player === world.playerFighter && flying(world.playerFighter)) return { a: world.playerFighter, kind: 'fighter' };
  if (flying(world.playerBomber)) return { a: world.playerBomber, kind: 'bomber' };
  const ref = world.player?.pos ?? world.formationCenter;
  let best: Aircraft | null = null, d = Infinity;
  for (const b of world.bombers()) if (flying(b) && b.pos.distanceToSquared(ref) < d) { d = b.pos.distanceToSquared(ref); best = b; }
  return best ? { a: best, kind: 'bomber' } : null;
}

/**
 * Scores the four mirrored poses (left/right, front/rear quarter) by how many other bombers land in
 * the print's frame (within 1.2 km, none close enough to block the subject); front and sun-side
 * views win ties. Pure: positions in, the pose's sign pair out.
 */
export function bestSide(subject: { pos: THREE.Vector3; quat: THREE.Quaternion }, others: THREE.Vector3[], s: { pos: THREE.Vector3; look: THREE.Vector3; fov: number },
  frameAspect: number, sunDir: THREE.Vector3): { sx: number; sz: number } {
  const tanY = Math.tan(THREE.MathUtils.degToRad(s.fov) / 2), tanX = tanY * frameAspect;
  const cropY = Math.min(1, frameAspect / PRINT_ASPECT);   // the print shows the frame's middle band
  const eye = new THREE.Vector3(), at = new THREE.Vector3(), p = new THREE.Vector3();
  let best = { sx: 1, sz: 1 }, bestScore = -Infinity;
  for (const sz of [1, -1]) for (const sx of [1, -1]) {
    eye.set(s.pos.x * sx, s.pos.y, s.pos.z * sz).applyQuaternion(subject.quat).add(subject.pos);
    at.set(s.look.x * sx, s.look.y, s.look.z * sz).applyQuaternion(subject.quat).add(subject.pos);
    _mi.copy(_m.lookAt(eye, at, UP)).invert();   // world → camera axes (the camera looks down -Z)
    _mi.setPosition(0, 0, 0);
    let score = 0;
    for (const o of others) {
      p.copy(o).sub(eye).applyMatrix4(_mi);
      const d = -p.z;
      if (d < 20 || d > 1200) continue;
      if (Math.abs(p.x / d) < tanX * 0.92 && Math.abs(p.y / d) < tanY * cropY * 0.9) score += d < 60 ? -2 : 2;
    }
    if (sz > 0) score += 0.6;
    if (_v.set(sx, 0, 0).applyQuaternion(subject.quat).dot(sunDir) > 0) score += 0.5;
    if (score > bestScore) { bestScore = score; best = { sx, sz }; }
  }
  return best;
}

/** Renders the staged view and returns it as a 2D canvas; the live view when there is nothing to stage. */
export function captureStaged(engine: Engine, world: World | null): HTMLCanvasElement {
  const sub = world ? stageSubject(world) : null;
  if (!sub) return captureFrame(engine);
  const cam = engine.camera, post = engine.post, parent = cam.parent;
  const slot = parent ? parent.children.indexOf(cam) : -1;
  const pos = cam.position.clone(), quat = cam.quaternion.clone(), up = cam.up.clone(), fov = cam.fov;
  const pp = { nearFocus: post.nearFocus, dofStrength: post.dofStrength, noBlurDist: post.noBlurDist, motionBlur: post.motionBlur, damageFlash: post.damageFlash, flash: post.flash };
  const hidden: THREE.Object3D[] = [];
  if (sub.a === world!.playerBomber) sub.a.model.traverse((o) => { if (GUNNER_HIDDEN.includes(o.name) && !o.visible) { o.visible = true; hidden.push(o); } });
  const kids = cam.children.filter((o) => o.visible);
  for (const o of kids) o.visible = false;
  try {
    engine.scene.add(cam);
    const s = STAGE[sub.kind];
    const others = world!.bombers().filter((b) => b !== sub.a && flying(b)).map((b) => b.pos);
    const { sx, sz } = bestSide(sub.a, others, s, engine.width / Math.max(1, engine.height), Atmos.sunDir);
    _q.copy(sub.a.quat);
    cam.position.copy(_v.set(s.pos.x * sx, s.pos.y, s.pos.z * sz).applyQuaternion(_q).add(sub.a.pos));
    cam.up.set(0, 1, 0);
    cam.lookAt(_look.set(s.look.x * sx, s.look.y, s.look.z * sz).applyQuaternion(_q).add(sub.a.pos));
    cam.fov = s.fov;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    post.nearFocus = 0.1; post.dofStrength = 0; post.noBlurDist = 1e6; post.motionBlur = 0; post.damageFlash = 0; post.flash = 0;
    post.resetHistory();
    for (let i = 0; i < STAGE.warmFrames; i++) engine.render(1 / 60);
    return captureFrame(engine);
  } finally {
    if (parent) {
      parent.add(cam);
      const ch = parent.children, cur = ch.indexOf(cam);
      if (cur >= 0 && slot >= 0) { ch.splice(cur, 1); ch.splice(Math.min(slot, ch.length), 0, cam); }
    } else cam.removeFromParent();
    cam.position.copy(pos); cam.quaternion.copy(quat); cam.up.copy(up); cam.fov = fov;
    cam.updateProjectionMatrix();
    Object.assign(post, pp);
    post.resetHistory();
    for (const o of hidden) o.visible = false;
    for (const o of kids) o.visible = true;
  }
}

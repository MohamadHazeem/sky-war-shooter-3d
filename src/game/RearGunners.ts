import * as THREE from 'three';
import type { World } from '../world/World';
import { Fighter } from '../world/Aircraft';
import { sound } from '../audio/Sound';

// Rear gunners of the twin-engine heavies (Bf 110, Ju 88, He 111, Me 410): an MG 81Z on a flexible
// mount that swings onto an allied fighter sitting in the rear cone and fires bursts back at it.
// The model's gun_rear node (with its muzzle_rear child: Bf 110 rear cockpit, He 111 dorsal B-Stand)
// is traversed so the gun visibly tracks; airframes without one fire from the rear cockpit
// position. The Me 410's two remote FDL 131 barbettes (barbette_left / barbette_right, fitted by
// world/EnemyDress.ts) both swing onto the target and fire alternately.
//
// Driven every frame of a P-51 mission by PilotOps, independent of what the pilot is doing.

const HEAVIES = new Set(['bf110', 'ju88', 'he111', 'me410']);
const RANGE = 680;                // m
const CONE = Math.cos(1.15);      // ~66 deg either side of dead astern
const RATE = 18;                  // rounds/s (the twin MG 81Z, slowed for game balance)
const MUZZLE = 780;
const DAMAGE = 2.6;
const TRACER: [number, number, number] = [10, 8, 3.5];
const FALLBACK = new THREE.Vector3(0, 0.63, -1.46); // rear cockpit (model frame, unscaled)

interface Mount { node: THREE.Object3D; muzzle: THREE.Object3D | null; rest: THREE.Quaternion; restDir: THREE.Vector3 }
interface Gunner { mounts: Mount[]; cur: THREE.Vector3; burst: number; cooldown: number; err: THREE.Vector3; acc: number; seen: boolean; shot: number }

const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _l = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const BACK = new THREE.Vector3(0, 0, -1);
const R = () => Math.random() * 2 - 1;

export class RearGunners {
  private gunners = new WeakMap<Fighter, Gunner>();
  onOpenFire: ((f: Fighter) => void) | null = null; // first burst from a heavy (radio warning)

  private gunnerOf(f: Fighter): Gunner {
    let g = this.gunners.get(f);
    if (!g) {
      const mounts: Mount[] = [];
      const add = (name: string, muzzleName: string) => {
        const node = f.model.getObjectByName(name);
        if (!node) return;
        const muzzle = node.getObjectByName(muzzleName) ?? null;
        // the barrel's own rest direction (model frame), so the gun points where it fires
        const restDir = muzzle && muzzle.position.lengthSq() > 1e-6 ? muzzle.position.clone().applyQuaternion(node.quaternion).normalize() : BACK.clone();
        mounts.push({ node, muzzle, rest: node.quaternion.clone(), restDir });
      };
      add('barbette_left', 'muzzle_barbette_left');
      add('barbette_right', 'muzzle_barbette_right');
      if (!mounts.length) add('gun_rear', 'muzzle_rear');
      g = { mounts, cur: BACK.clone(), burst: 0, cooldown: 0, err: new THREE.Vector3(), acc: 0, seen: false, shot: 0 };
      this.gunners.set(f, g);
    }
    return g;
  }

  update(dt: number, w: World) {
    const allies = w.fighters('allied').filter((a) => a.alive);
    if (!allies.length) return;
    for (const f of w.fighters('axis')) {
      if (!f.alive || !HEAVIES.has(f.enemyType)) continue;
      const g = this.gunnerOf(f);
      g.cooldown -= dt;
      // gun position in the world (the next mount to fire)
      const mt = g.mounts.length ? g.mounts[g.shot % g.mounts.length] : null;
      if (mt?.muzzle) { f.model.updateMatrixWorld(true); mt.muzzle.getWorldPosition(_p); }
      else f.localToWorld(_p.copy(FALLBACK).multiplyScalar(f.model.scale.x), _p);
      // the nearest allied fighter in the rear cone (the player's Mustang first)
      const tail = _d.copy(BACK).applyQuaternion(f.quat);
      let target: Fighter | null = null, best = RANGE, range = 0;
      for (const a of allies) {
        const to = _v.copy(a.pos).sub(_p);
        const dist = to.length();
        if (dist > best || to.divideScalar(dist).dot(tail) < CONE) continue;
        best = a.isPlayer ? dist * 0.6 : dist; target = a; range = dist;
      }
      // swing the mount (back to rest when there is nothing to shoot at)
      const want = _w.copy(BACK);
      if (target) {
        const tof = range / MUZZLE;
        const relV = _l.copy(target.vel).sub(f.vel);
        _v.copy(target.pos).addScaledVector(relV, tof * (0.6 + 0.4 * Math.random())).add(g.err);
        _v.y += 0.5 * 9.81 * tof * tof;
        want.copy(_v).sub(_p).normalize().applyQuaternion(_q.copy(f.quat).invert());
      }
      g.cur.lerp(want, 1 - Math.exp(-dt * 5)).normalize();
      for (const m of g.mounts) m.node.quaternion.copy(m.rest).premultiply(_qa.setFromUnitVectors(m.restDir, g.cur));
      if (!target) { g.burst = 0; continue; }
      // bursts: ~1 s on, a breather, new aim error every burst
      if (g.burst <= 0 && g.cooldown <= 0 && Math.random() < dt * 2.5) {
        g.burst = 0.7 + Math.random() * 0.8;
        g.err.set(R(), R(), R()).multiplyScalar(6.5 * w.enemyAimMult);
        if (!g.seen) { g.seen = true; this.onOpenFire?.(f); }
      }
      if (g.burst <= 0) continue;
      g.burst -= dt;
      if (g.burst <= 0) { g.cooldown = 0.8 + Math.random() * 1.4; continue; }
      g.acc += dt * RATE;
      while (g.acc >= 1) {
        g.acc -= 1;
        g.shot++;
        // barbettes: the two guns fire in turn
        if (g.mounts.length > 1) g.mounts[g.shot % g.mounts.length].muzzle?.getWorldPosition(_p);
        const dir = _d.copy(g.cur).applyQuaternion(f.quat);
        dir.x += R() * 0.012; dir.y += R() * 0.012; dir.z += R() * 0.012;
        dir.normalize();
        const muzzle = _v.copy(_p).addScaledVector(dir, 0.8);
        w.ballistics.fire(muzzle, dir.clone().multiplyScalar(MUZZLE).add(f.vel), 'axis', DAMAGE, Math.random() < 0.34, TRACER, f);
        if (Math.random() < 0.5) w.effects.muzzleFlash(muzzle, dir, 1.4, f.vel);
        if (Math.random() < 0.25) sound.play('mg131', muzzle, { gain: 0.45, rate: 1.25, ref: 60 });
      }
    }
  }
}

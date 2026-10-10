import * as THREE from 'three';
import type { World } from '../world/World';
import { Fighter } from '../world/Aircraft';
import { sound } from '../audio/Sound';

// Rear gunners of the twin-engine heavies (Bf 110, Ju 88): an MG 81Z on a flexible mount that
// swings onto an allied fighter sitting in the rear cone and fires bursts back at it. The
// Bf 110 model's gun_rear node (with its muzzle_rear child) is traversed so the guns visibly
// track; airframes without one fire from the rear cockpit position.
//
// Driven every frame of a P-51 mission by PilotOps, independent of what the pilot is doing.

const HEAVIES = new Set(['bf110', 'ju88']);
const RANGE = 680;                // m
const CONE = Math.cos(1.15);      // ~66 deg either side of dead astern
const RATE = 18;                  // rounds/s (the twin MG 81Z, slowed for game balance)
const MUZZLE = 780;
const DAMAGE = 2.6;
const TRACER: [number, number, number] = [10, 8, 3.5];
const FALLBACK = new THREE.Vector3(0, 0.63, -1.46); // rear cockpit (model frame, unscaled)

interface Gunner { node: THREE.Object3D | null; muzzle: THREE.Object3D | null; rest: THREE.Quaternion; cur: THREE.Vector3; burst: number; cooldown: number; err: THREE.Vector3; acc: number; seen: boolean }

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
      const node = f.model.getObjectByName('gun_rear') ?? null;
      const muzzle = node?.getObjectByName('muzzle_rear') ?? null;
      g = { node, muzzle, rest: node ? node.quaternion.clone() : new THREE.Quaternion(), cur: BACK.clone(), burst: 0, cooldown: 0, err: new THREE.Vector3(), acc: 0, seen: false };
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
      // gun position in the world
      if (g.muzzle) { f.model.updateMatrixWorld(true); g.muzzle.getWorldPosition(_p); }
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
      if (g.node) g.node.quaternion.copy(g.rest).premultiply(_qa.setFromUnitVectors(BACK, g.cur));
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

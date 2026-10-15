import * as THREE from 'three';
import type { Fighter } from '../world/Aircraft';
import type { ParticleSystem } from './Particles';

// Night exhaust flames: without flame dampers the raiders' exhaust stacks show as flickering
// orange-blue tongues of flame, the main thing a night fighter sees of them. Every engine of
// every aircraft passed in gets a pair of stacks just behind its propeller (jets: a glow in
// each nozzle). World's own Exhaust.ts keeps the small daytime glows on the Fw 190 and P-51;
// these are larger and brighter and only run in the night mission.

const ORANGE: [number, number, number] = [9, 4, 1.4];
const BLUE: [number, number, number] = [2.6, 3.6, 8];
const JETS: Record<string, [number, number, number][]> = {
  me262: [[1.75, -0.55, -1.2], [-1.75, -0.55, -1.2]],
  me163: [[0, 0, -2.6]],
};
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const stackCache = new WeakMap<Fighter, THREE.Vector3[]>();

// Stack positions in the aircraft's root frame (scaled): two per propeller, behind the hub
export function exhaustStacks(f: Fighter): THREE.Vector3[] {
  let s = stackCache.get(f);
  if (s) return s;
  s = [];
  const k = f.model.scale.x;
  const jet = JETS[f.enemyType];
  if (jet) for (const [x, y, z] of jet) s.push(new THREE.Vector3(x * k, y * k, z * k));
  else {
    for (const pr of f.props) {
      // prop pivot in the model frame (props hang off the model root or a nacelle node)
      const p = new THREE.Vector3();
      let o: THREE.Object3D | null = pr.node;
      const m = new THREE.Matrix4().identity();
      while (o && o !== f.model) { o.updateMatrix(); m.premultiply(o.matrix); o = o.parent; }
      p.applyMatrix4(m);
      const twin = f.props.length > 1;
      for (const side of [1, -1]) s.push(new THREE.Vector3(p.x + side * (twin ? 0.42 : 0.55), p.y - 0.08, p.z - (twin ? 1.1 : 0.75)).multiplyScalar(k));
    }
  }
  stackCache.set(f, s);
  return s;
}

let tick = 0;

// Once per frame (every other frame spawns, like Exhaust.ts)
export function updateNightExhaust(aircraft: readonly Fighter[], glow: ParticleSystem, brightness = 1) {
  tick++;
  if (tick & 1) return;
  for (const f of aircraft) {
    if (!f.alive || f.remove || f.enemyType === 'ju88g' || (f.enemyType === 'me163' && (f.rocketFuel <= 0 || f.fm.throttle <= 0))) continue;
    const eng = f.zone('engine');
    if (eng && eng.hp <= 0) continue;
    const thr = THREE.MathUtils.clamp(f.fm.throttle, 0.3, 1.1);
    const k = Math.sqrt(f.model.scale.x);
    const jet = !!JETS[f.enemyType];
    for (const st of exhaustStacks(f)) {
      if (Math.random() > 0.7 + 0.3 * thr) continue;
      f.localToWorld(_p.copy(st), _p);
      f.forward(_v).multiplyScalar(-(8 + 8 * thr)).addScaledVector(f.vel, 0.05);
      const sz = (jet ? 0.9 : 0.55) * k * (0.7 + 0.6 * Math.random());
      glow.spawn({
        pos: _p, vel: _v, life: 0.06 + Math.random() * 0.05,
        size0: sz, size1: sz * 0.4,
        color0: jet ? [8, 5, 2] : Math.random() < 0.3 ? BLUE : ORANGE,
        alpha0: (0.6 + 0.4 * thr) * brightness, alpha1: 0, frame: 1, rotVel: (Math.random() - 0.5) * 8,
      });
    }
  }
}

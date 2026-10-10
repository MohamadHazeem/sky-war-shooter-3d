import * as THREE from 'three';
import { Aircraft, Fighter } from './Aircraft';
import { ParticleSystem } from '../render/Particles';
import { ModelKind } from './Models';

// Engine exhaust stacks: short, flickering blue-orange flame glows on both sides of the
// cowling, just behind each propeller. Positions are in model units (x = lateral,
// z = behind the prop hub) and scale with the fighter's model scale, so the
// Fw 190 (drawn at 1.7x) keeps its stacks in the right place.
const STACK: Partial<Record<ModelKind, { x: number; y: number; z: number }>> = {
  fw190: { x: 0.6, y: -0.05, z: 1.75 }, // prop hub at z 1.98
  p51d: { x: 0.6, y: 0.0, z: 2.3 },     // prop hub at z 2.57
};

const ORANGE: [number, number, number] = [6, 3, 1.2];   // hot exhaust gas
const BLUE: [number, number, number] = [2.2, 3.2, 6];   // flame core, cooler and bluer

const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
let tick = 0;

// Called once per frame from World.update. Spawns every other frame to keep it cheap;
// with 0.05 s lifetimes the glows still overlap into a continuous, flickering flame.
export function updateExhausts(aircraft: readonly Aircraft[], glow: ParticleSystem) {
  tick++;
  if (tick & 1) return;
  for (const a of aircraft) {
    if (!(a instanceof Fighter) || !a.alive || a.remove) continue;
    const stack = STACK[a.kind];
    if (!stack) continue;
    // a dead engine stops burning
    const eng = a.zone('engine');
    if (!eng || eng.hp <= 0) continue;

    const s = a.model.scale.x;
    const thr = THREE.MathUtils.clamp(a.fm.throttle, 0, 1.1);
    const k = 0.3 + 0.7 * thr;                            // throttle-dependent brightness
    const size = 0.32 * Math.sqrt(s) * (0.6 + 0.6 * k);

    for (const side of [1, -1]) {
      // flicker: randomly drop some flames, more often at low throttle
      if (Math.random() > 0.55 + 0.45 * k) continue;
      _p.set(side * stack.x * s, stack.y * s, stack.z * s);
      a.localToWorld(_p, _p);
      // gas trails backwards, lightly carried by the airframe's motion
      a.forward(_v).multiplyScalar(-(6 + 6 * thr));
      _v.addScaledVector(a.vel, 0.05);
      const sz = size * (0.7 + 0.6 * Math.random());
      glow.spawn({
        pos: _p, vel: _v,
        life: 0.045 + Math.random() * 0.03,
        size0: sz, size1: sz * 0.45,
        color0: Math.random() < 0.3 ? BLUE : ORANGE,
        alpha0: 0.5 + 0.5 * k, alpha1: 0,
        frame: 1, rotVel: (Math.random() - 0.5) * 8,
      });
    }
  }
}

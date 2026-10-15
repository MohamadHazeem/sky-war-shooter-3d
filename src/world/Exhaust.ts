import * as THREE from 'three';
import { Aircraft, Bomber, Fighter } from './Aircraft';
import { ParticleSystem, type ParticleOpts } from '../render/Particles';
import { ModelKind } from './Models';
import { heatHaze } from '../render/HeatHaze';

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
const rocketGlow: ParticleOpts = { pos: _p, vel: _v, life: .18, size0: 1, size1: .2, color0: [10, 7, 4], alpha0: .8, alpha1: 0, frame: 1 };
let tick = 0;

// Called once per frame from World.update. Spawns every other frame to keep it cheap;
// with 0.05 s lifetimes the glows still overlap into a continuous, flickering flame.
export function updateExhausts(aircraft: readonly Aircraft[], glow: ParticleSystem) {
  tick++;
  if (tick & 1) return;
  for (const a of aircraft) {
    if (!(a instanceof Fighter) || !a.alive || a.remove) continue;
    if (a.enemyType === 'me163' && a.rocketFuel > 0 && a.fm.throttle > 0 && (a.zone('engine')?.hp ?? 0) > 0) {
      const scale = a.model.scale.x;
      a.localToWorld(_p.set(0, -.015, -3.45).multiplyScalar(scale), _p);
      a.forward(_v).multiplyScalar(-45).addScaledVector(a.vel, .2);
      rocketGlow.size0 = .65 * scale; rocketGlow.size1 = .15 * scale;
      glow.spawn(rocketGlow);
    }
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

// Night (Atmos.night via World): the B-17s' turbo-supercharger exhausts under each nacelle show
// as short orange-blue flames, so the box reads at night as rows of paired engine glows.
// The far ones are skipped; a dead engine goes dark.
const TURBO: [number, number, number][] = [[6.51, -0.62, 1.2], [3.02, -1.02, 1.75], [-3.02, -1.02, 1.75], [-6.51, -0.62, 1.2]];
const TURBO_ORANGE: [number, number, number] = [7, 3.2, 1.1];
const TURBO_BLUE: [number, number, number] = [2.4, 3.3, 7];
let nightTick = 0;
// own flicker sequence: the night flames never shift the shared Math.random stream
let seed = 0x2545f491;
const flick = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
export function updateBomberNightExhaust(aircraft: readonly Aircraft[], glow: ParticleSystem, night: number, eye: THREE.Vector3 | null) {
  if (++nightTick & 1) return;
  for (const a of aircraft) {
    if (!(a instanceof Bomber) || !a.alive || a.remove) continue;
    if (eye && a.pos.distanceToSquared(eye) > 3000 * 3000) continue;
    for (let k = 0; k < TURBO.length; k++) {
      if (a.engineDead[k] || flick() > 0.8) continue;
      const [x, y, z] = TURBO[k];
      a.localToWorld(_p.set(x, y, z), _p);
      a.forward(_v).multiplyScalar(-9).addScaledVector(a.vel, 0.05);
      const sz = 0.55 * (0.7 + 0.6 * flick());
      glow.spawn({
        pos: _p, vel: _v, life: 0.06 + flick() * 0.04, size0: sz, size1: sz * 0.4,
        color0: flick() < 0.35 ? TURBO_BLUE : TURBO_ORANGE,
        alpha0: 0.85 * night, alpha1: 0, frame: 1, rotVel: (flick() - 0.5) * 8, rot: flick() * 6.283,
      });
    }
  }
}

// Heat haze behind the engines (render/HeatHaze.ts): a shimmering plume streaming back from
// each B-17 nacelle and from both exhaust banks of the fighters with modelled stacks (the
// P-51's own stubs in the cockpit view, close Fw 190s). Called once per aircraft from
// World.add; the emitters follow the airframe and go when it leaves the scene.
const B17_NACELLES: [number, number, number][] = [[6.51, -0.07, 3.1], [3.02, -0.47, 3.68], [-3.02, -0.47, 3.68], [-6.51, -0.07, 3.1]];

export function attachEngineHaze(a: Aircraft) {
  if (a instanceof Bomber) {
    B17_NACELLES.forEach(([x, y, z], k) => heatHaze.attach(a.root, new THREE.Vector3(x, y - 0.3, z - 1.6), 0.7, 1,
      { trail: new THREE.Vector3(0, 0.1, -7), active: () => a.alive && !a.engineDead[k] }));
    return;
  }
  const stack = a instanceof Fighter ? STACK[a.kind] : undefined;
  if (!stack) return;
  const s = a.model.scale.x;
  for (const side of [1, -1]) {
    heatHaze.attach(a.root, new THREE.Vector3(side * stack.x * s, stack.y * s, stack.z * s), 0.28 * s, 1, {
      trail: new THREE.Vector3(side * 0.25 * s, 0.05 * s, -3.6 * s),
      active: () => a.alive && (a.zone('engine')?.hp ?? 1) > 0,
    });
  }
}

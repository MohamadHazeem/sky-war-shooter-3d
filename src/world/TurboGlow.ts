import * as THREE from 'three';
import { weatherNow } from '../render/WeatherState';
import type { ParticleOpts, ParticleSystem } from '../render/Particles';
import type { Bomber } from './Aircraft';

// Match the baked wastegate mouths in tools/hero/build.py. Pooled records/vectors:
// no particles, materials, lights or shader variants are allocated by this emitter.
const ENGINES = [[6.525, -.0723, 3.045], [3.031, -.4733, 3.61], [-3.031, -.4733, 3.61], [-6.525, -.0723, 3.045]] as const;
const position = new THREE.Vector3();
const particle: ParticleOpts = { pos: position, life: .12, age: .03, size0: .24, size1: .10,
  color0: [6, 1.3, .2], alpha0: .8, alpha1: 0, frame: 1 };

export function emitTurboGlow(bomber: Bomber, glow: Pick<ParticleSystem, 'spawn'>) {
  const night = THREE.MathUtils.clamp(weatherNow.night, 0, 1);
  if (!night || !bomber.alive || bomber.remove) return;
  particle.alpha0 = .8 * night;
  for (let i = 0; i < ENGINES.length; i++) {
    if (bomber.engineDead[i]) continue;
    const engine = ENGINES[i];
    for (let side = -1; side <= 1; side += 2) {
      position.set(engine[0] + side * .57, engine[1] - .89, engine[2] - 1.95);
      bomber.localToWorld(position, position);
      glow.spawn(particle);
    }
  }
}

import * as THREE from 'three';
import type { Fighter, HitZone } from './Aircraft';
import { ENEMY_VARIANTS, tintModel, type EnemyType } from './EnemyTypes';

// Per-type fitting of the late-war enemy types, done by World.spawnEnemy right after the
// airframe is built (before the paint/damage-look copies, the scale and the zone toughening):
//
//   he111  hit zones fitted to the He 111 (two engines, glazed nose, long fuselage, 22.5 m span)
//   do335  hit zones for the push-pull layout (nose engine and the rear engine behind the tail)
//   me410 / ju88g / me163: dedicated hero models with fitted hit zones.
//
// Zones are in the model's own (unscaled) frame: +X left wing, +Y up, +Z nose. Engine zones carry
// the prop index (engine 0 = prop_1), so a shot-out engine stops its own propeller. The first
// engine zone keeps the name 'engine' (Fighter.update, Exhaust, FighterDeath read it).
// New meshes reuse the airframe's own materials (no new shader programs on the first spawn or
// the first kill: World.prewarm compiles every enemy model's materials).

type ZoneDef = [name: string, x: number, y: number, z: number, r: number, hp: number, extra?: Partial<HitZone>];

const ZONES: Partial<Record<EnemyType, { radius: number; zones: ZoneDef[] }>> = {
  // Hero models (tools/hero/luftwaffe): zones over their named parts (part_* in docs/phase10/hero-parts.md).
  // The Fw 190 A-8 keeps the base layout (Aircraft.ts), which it was built to match.
  // Bf 109 G-6: prop hub z 2.43, cockpit z -1.0, tail -5.9, span +-4.96
  bf109: {
    radius: 7,
    zones: [
      ['engine', 0, 0.0, 1.35, 0.75, 130, { engine: 0 }],
      ['cockpit', 0, 0.5, -1.0, 0.55, 95, { critical: true }],
      ['fuselage', 0, 0.1, -3.0, 0.7, 170, { critical: true }],
      ['tail', 0, 0.55, -5.3, 1.0, 120, { critical: true }],
      ['wingL', 2.5, -0.3, -0.55, 1.45, 150, { critical: true }],
      ['wingR', -2.5, -0.3, -0.55, 1.45, 150, { critical: true }],
    ],
  },
  // Me 262 A-1a (FlightGear shape scaled to the published span / length): nacelles at x +-2.21 under the
  // wing, cockpit z -0.72, tail -6.1, span +-6.28
  me262: {
    radius: 8,
    zones: [
      ['engine', 2.21, -0.86, -0.3, 0.75, 120, { engine: 0 }],
      ['engine2', -2.21, -0.86, -0.3, 0.75, 120, { engine: 1 }],
      ['cockpit', 0, 0.55, -0.75, 0.6, 95, { critical: true }],
      ['fuselage', 0, 0.1, -2.6, 0.75, 170, { critical: true }],
      ['tail', 0, 0.75, -6.1, 1.2, 120, { critical: true }],
      ['wingL', 3.9, -0.2, -1.1, 1.7, 150, { critical: true }],
      ['wingR', -3.9, -0.2, -1.1, 1.7, 150, { critical: true }],
    ],
  },
  // Bf 110 G-2: engines at x +-2.35, crew z 1.2 / -0.6, twin fins at x +-2.25 z -7.9, span +-8.2
  bf110: {
    radius: 9,
    zones: [
      ['engine', 2.35, -0.2, 1.0, 0.8, 130, { engine: 0 }],
      ['engine2', -2.35, -0.2, 1.0, 0.8, 130, { engine: 1 }],
      ['cockpit', 0, 0.55, 0.6, 0.85, 110, { critical: true }],
      ['fuselage', 0, 0.15, -2.6, 0.8, 190, { critical: true }],
      ['tail', 0, 0.45, -7.3, 1.8, 140, { critical: true }],
      ['wingL', 4.6, -0.05, -0.6, 1.9, 170, { critical: true }],
      ['wingR', -4.6, -0.05, -0.6, 1.9, 170, { critical: true }],
      ['wingLtip', 6.9, 0.15, -0.55, 1.2, 110],
      ['wingRtip', -6.9, 0.15, -0.55, 1.2, 110],
    ],
  },
  // Ju 88 A-4: engines at x +-2.78, glazed nose z 1..3.8, tail -9.3, span +-10
  ju88: {
    radius: 11,
    zones: [
      ['engine', 2.78, -0.34, 1.2, 0.9, 150, { engine: 0 }],
      ['engine2', -2.78, -0.34, 1.2, 0.9, 150, { engine: 1 }],
      ['cockpit', 0, 0.6, 2.1, 1.05, 120, { critical: true }],
      ['fuselage', 0, 0.2, -2.0, 0.95, 230, { critical: true }],
      ['fuselageAft', 0, 0.3, -5.8, 0.8, 200],
      ['tail', 0, 1.0, -9.0, 1.9, 170, { critical: true }],
      ['wingL', 5.4, 0.2, -1.05, 2.3, 210, { critical: true }],
      ['wingR', -5.4, 0.2, -1.05, 2.3, 210, { critical: true }],
      ['wingLtip', 8.6, 0.55, -1.15, 1.5, 130],
      ['wingRtip', -8.6, 0.55, -1.15, 1.5, 130],
    ],
  },
  // He 111 H (he111.glb): nose +4.1, tail -12.9, props at x +-2.68 z 3.16, span +-11.3
  he111: {
    radius: 12.5,
    zones: [
      ['engine', 2.68, -0.45, 2.1, 1.05, 150, { engine: 0 }],
      ['engine2', -2.68, -0.45, 2.1, 1.05, 150, { engine: 1 }],
      ['cockpit', 0, 0.25, 3.0, 1.1, 120, { critical: true }],
      ['fuselage', 0, 0.2, -1.6, 1.15, 230, { critical: true }],
      ['fuselageAft', 0, 0.35, -6.6, 1.0, 200],
      ['tail', 0, 0.9, -11.7, 1.7, 170, { critical: true }],
      ['wingL', 5.4, -0.1, 0.9, 2.3, 210, { critical: true }],
      ['wingR', -5.4, -0.1, 0.9, 2.3, 210, { critical: true }],
      ['wingLtip', 9.2, 0.15, 0.2, 1.7, 130],
      ['wingRtip', -9.2, 0.15, 0.2, 1.7, 130],
    ],
  },
  // Do 335 (do335.glb): nose prop z 4.79, rear prop z -8.44, cockpit z ~1, span +-6.9
  do335: {
    radius: 9.5,
    zones: [
      ['engine', 0, 0.05, 3.5, 0.95, 130, { engine: 0 }],
      ['engine2', 0, 0.35, -5.6, 0.85, 110, { engine: 1 }],
      ['cockpit', 0, 0.75, 0.9, 0.65, 95, { critical: true }],
      ['fuselage', 0, 0.25, -2.4, 0.8, 170, { critical: true }],
      ['tail', 0, 0.5, -7.6, 1.25, 120, { critical: true }],
      ['wingL', 3.1, -0.25, -0.1, 1.7, 150, { critical: true }],
      ['wingR', -3.1, -0.25, -0.1, 1.7, 150, { critical: true }],
    ],
  },
};

ZONES.ju88g = ZONES.ju88;
ZONES.me410 = { radius: 9, zones: [
  ['engine', 2.35, -.2, 1, .8, 130, { engine: 0 }],
  ['engine2', -2.35, -.2, 1, .8, 130, { engine: 1 }],
  ['cockpit', 0, .65, .5, .9, 110, { critical: true }],
  ['fuselage', 0, .1, -2.6, .85, 190, { critical: true }],
  ['tail', 0, .9, -7.1, 1.45, 140, { critical: true }],
  ['wingL', 4.6, -.05, -.7, 1.9, 170, { critical: true }],
  ['wingR', -4.6, -.05, -.7, 1.9, 170, { critical: true }],
] };
ZONES.me163 = { radius: 5.5, zones: [
  ['engine', 0, 0, -3, .55, 95, { engine: 0 }],
  ['cockpit', 0, .65, .7, .5, 70, { critical: true }],
  ['fuselage', 0, .1, -1.1, .7, 110, { critical: true }],
  ['tail', 0, .8, -3.1, .8, 80, { critical: true }],
  ['wingL', 2.5, 0, -1.5, 1.3, 95, { critical: true }],
  ['wingR', -2.5, 0, -1.5, 1.3, 95, { critical: true }],
] };
export const BK5_MUZZLE = new THREE.Vector3(0, -.62, 5.75);

// Called by World.spawnEnemy (own = the type's own model loaded; otherwise it flies the Fw 190
// airframe and keeps the Fw 190 layout)
export function dressEnemy(f: Fighter, type: EnemyType, own: boolean) {
  const v = ENEMY_VARIANTS[type];
  if (!own) return;
  if (v.ownTint && v.tint) tintModel(f.model, v.tint);
  const layout = ZONES[type];
  if (layout) {
    f.zones = layout.zones.map(([name, x, y, z, r, hp, extra]) => ({ name, offset: new THREE.Vector3(x, y, z), radius: r, hp, maxHp: hp, ...extra }));
    f.radius = layout.radius;
  }
}

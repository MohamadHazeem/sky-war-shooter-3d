import * as THREE from 'three';
import { markOwned } from '../render/Dispose';
import { FlightParams, FW190_PARAMS } from './FlightModel';

// Enemy aircraft types. Each has its own model when one is available (see Models.ts);
// otherwise it flies the Fw 190 airframe with a paint tint.
// Late-war types (EnemyDress.ts dresses them at spawn, Tactics.ts flies them):
//   he111  Heinkel He 111 bomber: raid target (Raid.ts spawnBomberRaid), dorsal gunner (gun_rear)
//   me410  Me 410 Hornisse: dedicated hero airframe, BK 5
//          50 mm cannon under the nose for a stand-off shot at the bombers, side barbettes
//   do335  Dornier Do 335 Pfeil: push-pull fast interceptor, diving slashing passes from high
export type EnemyType = 'fw190' | 'bf109' | 'me262' | 'bf110' | 'ju88' | 'ju88g' | 'me163' | 'he111' | 'me410' | 'do335';

export interface EnemyVariant {
  label: string;          // name used in the HUD and kill feed
  model: string;          // ModelKind of its own model (falls back to 'fw190')
  params: FlightParams;
  structure: number;      // multiplier on the base enemy structure
  scale: number;          // multiplier on ENEMY_SCALE for its own model (real sizes differ: heavies are normalised so they read ~1.3x a fighter)
  fallbackScale: number;  // multiplier when it flies the Fw 190 airframe instead
  score: number;          // points for a kill
  propRadius: number;
  tint?: THREE.Color;     // multiplied into the paint (also used on the fallback airframe)
  ownTint?: boolean;      // also tint its own model (a stand-in airframe painted differently)
  blurb: string;          // radio/feed description
}

export const ENEMY_VARIANTS: Record<EnemyType, EnemyVariant> = {
  fw190: { label: 'Fw 190', model: 'fw190', params: FW190_PARAMS, structure: 1, scale: 1, fallbackScale: 1, score: 100, propRadius: 1.65, blurb: 'Butcher-bird' },
  bf109: {
    label: 'Bf 109', model: 'bf109', blurb: 'nimble, lightly built',
    // lighter and more agile: climbs and rolls better, falls apart sooner
    params: { ...FW190_PARAMS, power: FW190_PARAMS.power * 1.08, rollRate: 3.2, maxG: 8 },
    structure: 0.75, scale: 1.05, fallbackScale: 0.95, score: 100, propRadius: 1.5,
    tint: new THREE.Color(0.74, 0.86, 1.15),
  },
  me262: {
    label: 'Me 262', model: 'me262', blurb: 'jet — very fast, fragile',
    // jet: enormous speed, wide turns, a thin skin
    params: { ...FW190_PARAMS, power: FW190_PARAMS.power * 2.3, dragK: 5.4e-5, rollRate: 2.2, maxG: 6.2 },
    structure: 0.55, scale: 1.0, fallbackScale: 1.05, score: 160, propRadius: 0,
    tint: new THREE.Color(0.85, 0.9, 0.82),
  },
  bf110: {
    label: 'Bf 110', model: 'bf110', blurb: 'twin-engine destroyer — heavy, tough',
    params: { ...FW190_PARAMS, power: FW190_PARAMS.power * 1.02, rollRate: 1.7, maxG: 6, pitchRate: 0.8 },
    structure: 2.6, scale: 0.85, fallbackScale: 1.3, score: 250, propRadius: 1.55,
    tint: new THREE.Color(0.8, 0.82, 0.78),
  },
  ju88: {
    label: 'Ju 88', model: 'ju88', blurb: 'heavy twin — slow, armoured, hard to bring down',
    params: { ...FW190_PARAMS, power: FW190_PARAMS.power * 0.95, rollRate: 1.3, maxG: 5, pitchRate: 0.7 },
    structure: 3.4, scale: 0.75, fallbackScale: 1.45, score: 320, propRadius: 1.72,
    tint: new THREE.Color(0.7, 0.75, 0.7),
  },
  ju88g: {
    label: 'Ju 88 G', model: 'ju88g', blurb: 'radar night fighter — attacks from below with upward-firing cannon',
    params: { ...FW190_PARAMS, power: FW190_PARAMS.power * 1.12, rollRate: 1.4, maxG: 5, pitchRate: .75 },
    structure: 3, scale: .75, fallbackScale: 1.45, score: 380, propRadius: 1.72,
  },
  me163: {
    label: 'Me 163', model: 'me163', blurb: 'rocket fighter — blindingly fast, made of paper',
    // rocket: a slashing pass at absurd speed; it barely survives a burst
    params: { ...FW190_PARAMS, power: FW190_PARAMS.power * 2.8, dragK: 5.0e-5, rollRate: 2.6, maxG: 6.5 },
    structure: 0.4, scale: 1.1, fallbackScale: 0.9, score: 200, propRadius: 0,
    tint: new THREE.Color(1.0, 0.85, 0.75),
  },
  he111: {
    label: 'He 111', model: 'he111', blurb: 'bombers in close formation, gunners in every window',
    // a laden bomber: holds its course, barely manoeuvres, soaks up a lot of fire
    params: { ...FW190_PARAMS, power: FW190_PARAMS.power * 0.85, rollRate: 0.9, maxG: 3.5, pitchRate: 0.5, yawRate: 0.3 },
    structure: 3.8, scale: 0.66, fallbackScale: 1.5, score: 300, propRadius: 1.45,
    tint: new THREE.Color(0.72, 0.78, 0.7),
  },
  me410: {
    label: 'Me 410', model: 'me410', blurb: 'Hornisse, a fifty-millimetre cannon that fires from two kilometres',
    // DB 603 twin: faster than the Bf 110, a little less armour
    params: { ...FW190_PARAMS, power: FW190_PARAMS.power * 1.1, rollRate: 1.8, maxG: 6, pitchRate: 0.85 },
    structure: 2.2, scale: 0.85, fallbackScale: 1.3, score: 350, propRadius: 1.55,
    tint: new THREE.Color(0.94, 1.0, 1.1),
  },
  do335: {
    label: 'Do 335', model: 'do335', blurb: 'Pfeil, a push-pull fighter as fast as a jet in a dive',
    // two engines in line: very fast and climbs hard, but heavy in the turn
    params: { ...FW190_PARAMS, power: FW190_PARAMS.power * 1.55, dragK: 5.9e-5, rollRate: 2.2, maxG: 6.5, pitchRate: 0.95 },
    structure: 1.3, scale: 0.8, fallbackScale: 1.05, score: 220, propRadius: 1.5,
    tint: new THREE.Color(0.8, 0.95, 0.78),
  },
};

// (Me 163 Komet: rocket interceptor, appended below)
// The mix gets heavier and faster as the rounds go on
export function enemyWeights(round = 0): [EnemyType, number][] {
  return round <= 0 ? [['fw190', 0.7], ['bf109', 0.3]]
    : round === 1 ? [['fw190', 0.5], ['bf109', 0.25], ['bf110', 0.25]]
    : round === 2 ? [['fw190', 0.35], ['bf109', 0.2], ['bf110', 0.2], ['me262', 0.15], ['ju88', 0.1]]
    : [['fw190', 0.22], ['bf109', 0.18], ['bf110', 0.18], ['me262', 0.17], ['ju88', 0.15], ['me163', 0.1]];
}

export function randomEnemyType(round = 0): EnemyType {
  let r = Math.random();
  for (const [t, p] of enemyWeights(round)) { r -= p; if (r <= 0) return t; }
  return 'fw190';
}

// A type from a restricted list (custom battles): the round's usual weights among the allowed
// types; types the round would not send yet still get a small share, so any list works.
export function pickEnemyType(allowed: readonly EnemyType[], round = 0, rnd: () => number = Math.random): EnemyType {
  if (!allowed.length) return randomEnemyType(round);
  if (allowed.length === 1) return allowed[0];
  const base = new Map(enemyWeights(Math.max(round, 1)));
  const w = allowed.map((t): [EnemyType, number] => [t, Math.max(0.08, base.get(t) ?? 0)]);
  let r = rnd() * w.reduce((a, [, p]) => a + p, 0);
  for (const [t, p] of w) { r -= p; if (r <= 0) return t; }
  return w[w.length - 1][0];
}

// Give one aircraft its own copies of the materials and multiply the paint colour.
// The model's materials are shared between all clones, so this must not touch them.
export function tintModel(model: THREE.Object3D, tint: THREE.Color) {
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = Array.isArray(m.material) ? m.material : [m.material];
    const copies = src.map((mat) => {
      const c = markOwned(mat.clone());
      const std = c as THREE.MeshStandardMaterial;
      if (std.color) std.color.multiply(tint);
      return c;
    });
    m.material = Array.isArray(m.material) ? copies : copies[0];
  });
}

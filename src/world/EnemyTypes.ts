import * as THREE from 'three';
import { FlightParams, FW190_PARAMS } from './FlightModel';

// Enemy aircraft types. Each has its own model when one is available (see Models.ts);
// otherwise it flies the Fw 190 airframe with a paint tint.
export type EnemyType = 'fw190' | 'bf109' | 'me262' | 'bf110' | 'ju88';

export interface EnemyVariant {
  label: string;          // name used in the HUD and kill feed
  model: string;          // ModelKind of its own model (falls back to 'fw190')
  params: FlightParams;
  structure: number;      // multiplier on the base enemy structure
  scale: number;          // multiplier on ENEMY_SCALE (heavies are bigger)
  score: number;          // points for a kill
  propRadius: number;
  tint?: THREE.Color;     // multiplied into the paint (also used on the fallback airframe)
  blurb: string;          // radio/feed description
}

export const ENEMY_VARIANTS: Record<EnemyType, EnemyVariant> = {
  fw190: { label: 'Fw 190', model: 'fw190', params: FW190_PARAMS, structure: 1, scale: 1, score: 100, propRadius: 1.65, blurb: 'Butcher-bird' },
  bf109: {
    label: 'Bf 109', model: 'bf109', blurb: 'nimble, lightly built',
    // lighter and more agile: climbs and rolls better, falls apart sooner
    params: { ...FW190_PARAMS, power: FW190_PARAMS.power * 1.08, rollRate: 3.2, maxG: 8 },
    structure: 0.75, scale: 0.95, score: 100, propRadius: 1.5,
    tint: new THREE.Color(0.74, 0.86, 1.15),
  },
  me262: {
    label: 'Me 262', model: 'me262', blurb: 'jet — very fast, fragile',
    // jet: enormous speed, wide turns, a thin skin
    params: { ...FW190_PARAMS, power: FW190_PARAMS.power * 2.3, dragK: 5.4e-5, rollRate: 2.2, maxG: 6.2 },
    structure: 0.55, scale: 1.05, score: 160, propRadius: 0,
    tint: new THREE.Color(0.85, 0.9, 0.82),
  },
  bf110: {
    label: 'Bf 110', model: 'bf110', blurb: 'twin-engine destroyer — heavy, tough',
    params: { ...FW190_PARAMS, power: FW190_PARAMS.power * 1.02, rollRate: 1.7, maxG: 6, pitchRate: 0.8 },
    structure: 2.6, scale: 1.3, score: 250, propRadius: 1.6,
    tint: new THREE.Color(0.8, 0.82, 0.78),
  },
  ju88: {
    label: 'Ju 88', model: 'ju88', blurb: 'heavy twin — slow, armoured, hard to bring down',
    params: { ...FW190_PARAMS, power: FW190_PARAMS.power * 0.95, rollRate: 1.3, maxG: 5, pitchRate: 0.7 },
    structure: 3.4, scale: 1.45, score: 320, propRadius: 1.7,
    tint: new THREE.Color(0.7, 0.75, 0.7),
  },
};

// The mix gets heavier and faster as the rounds go on
export function randomEnemyType(round = 0): EnemyType {
  const w: [EnemyType, number][] = round <= 0 ? [['fw190', 0.7], ['bf109', 0.3]]
    : round === 1 ? [['fw190', 0.5], ['bf109', 0.25], ['bf110', 0.25]]
    : round === 2 ? [['fw190', 0.35], ['bf109', 0.2], ['bf110', 0.2], ['me262', 0.15], ['ju88', 0.1]]
    : [['fw190', 0.25], ['bf109', 0.2], ['bf110', 0.2], ['me262', 0.2], ['ju88', 0.15]];
  let r = Math.random();
  for (const [t, p] of w) { r -= p; if (r <= 0) return t; }
  return 'fw190';
}

// Give one aircraft its own copies of the materials and multiply the paint colour.
// The model's materials are shared between all clones, so this must not touch them.
export function tintModel(model: THREE.Object3D, tint: THREE.Color) {
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = Array.isArray(m.material) ? m.material : [m.material];
    const copies = src.map((mat) => {
      const c = mat.clone();
      const std = c as THREE.MeshStandardMaterial;
      if (std.color) std.color.multiply(tint);
      return c;
    });
    m.material = Array.isArray(m.material) ? copies : copies[0];
  });
}

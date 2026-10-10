import * as THREE from 'three';
import { FlightParams, FW190_PARAMS } from './FlightModel';

// Enemy fighter variants. The Bf 109 G flies the Fw 190 airframe model in this game:
// it is a re-skin with a bluish-grey paint, lighter structure and a little more power.
export type EnemyType = 'fw190' | 'bf109';

// Share of enemy fighters that are Bf 109s in a wave
export const BF109_SHARE = 0.3;

export interface EnemyVariant {
  label: string;          // name used in the HUD and kill feed
  params: FlightParams;
  structure: number;      // multiplier on the base enemy structure
  tint?: THREE.Color;     // multiplied into the paint of each aircraft
}

export const ENEMY_VARIANTS: Record<EnemyType, EnemyVariant> = {
  fw190: { label: 'Fw 190', params: FW190_PARAMS, structure: 1 },
  bf109: {
    label: 'Bf 109',
    // copy of the Fw 190 handling with +6% power for a better climb
    params: { ...FW190_PARAMS, power: FW190_PARAMS.power * 1.06 },
    structure: 0.85,
    // the RLM 74/75/76 green-grey texture pushed towards blue-grey
    tint: new THREE.Color(0.74, 0.86, 1.15),
  },
};

export function randomEnemyType(): EnemyType {
  return Math.random() < BF109_SHARE ? 'bf109' : 'fw190';
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

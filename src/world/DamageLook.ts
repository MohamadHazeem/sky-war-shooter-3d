import * as THREE from 'three';
import { markOwned } from '../render/Dispose';
import type { Fighter } from './Aircraft';
import { setup as setupStages } from './DamageStages';

// Visible battle damage on enemy fighters. Each enemy gets its own copies of its
// model materials so soot never leaks onto the other aircraft.

const SOOT_MIN = 0.25;       // colour multiplier at zero structure (sooty, not pitch black)

interface Slot {
  mat: THREE.Material;
  color: THREE.Color | null;      // base colour, kept to re-derive the sooted tint
}

interface State {
  slots: Slot[];
  soot: number;   // last applied tint multiplier, -1 = never applied
}

const states = new WeakMap<Fighter, State>();

// Give the fighter its own material copies. Called once when the enemy is spawned.
export function setup(f: Fighter) {
  if (states.has(f)) return;
  const copies = new Map<THREE.Material, THREE.Material>(); // keeps shared materials shared
  const slots: Slot[] = [];
  f.model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = Array.isArray(m.material) ? m.material : [m.material];
    const next = src.map((mm) => {
      let c = copies.get(mm);
      if (!c) {
        c = markOwned(mm.clone());
        copies.set(mm, c);
        const col = (c as THREE.MeshStandardMaterial).color;
        slots.push({ mat: c, color: col ? col.clone() : null });
      }
      return c;
    });
    m.material = Array.isArray(m.material) ? next : next[0];
  });
  states.set(f, { slots, soot: -1 });
  setupStages(f); // torn-skin patches are added later and keep their own shared materials
}

// Soot darkens steadily and steps down at the 65% and 45% damage stages (DamageStages)
function sootOf(frac: number) {
  const s = 1 - 0.6 * (1 - frac) - (frac <= 0.65 ? 0.12 : 0) - (frac <= 0.45 ? 0.08 : 0);
  return Math.max(SOOT_MIN, s);
}

// Per-frame soot only. Ballistic impacts flash the hit panel through DamageStages.
export function update(f: Fighter, _worldTime: number) {
  const st = states.get(f);
  if (!st) return;
  const soot = sootOf(f.structureFrac);
  if (soot === st.soot) return;
  st.soot = soot;
  for (const s of st.slots) if (s.color) {
    (s.mat as THREE.MeshStandardMaterial).color.copy(s.color).multiplyScalar(soot);
  }
}

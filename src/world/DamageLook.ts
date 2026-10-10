import * as THREE from 'three';
import type { Fighter } from './Aircraft';

// Visible battle damage on enemy fighters. Each enemy gets its own copies of its
// model materials so soot and hit flashes never leak onto the other aircraft.

const SOOT_MIN = 0.4;        // colour multiplier at zero structure (sooty, not pitch black)
const FLASH_TIME = 0.08;     // s of orange glow after a hit from the player
const FLASH_COLOR = new THREE.Color(2.4, 0.9, 0.22); // linear HDR orange, blooms

interface Slot {
  mat: THREE.Material;
  color: THREE.Color | null;      // base colour, kept to re-derive the sooted tint
  emissive: THREE.Color | null;   // base emissive (nav lights etc.)
}

interface State {
  slots: Slot[];
  soot: number;   // last applied tint multiplier, -1 = never applied
  flash: number;  // last applied flash strength, -1 = never applied
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
        c = mm.clone();
        copies.set(mm, c);
        const col = (c as THREE.MeshStandardMaterial).color;
        const em = (c as THREE.MeshStandardMaterial).emissive;
        slots.push({ mat: c, color: col ? col.clone() : null, emissive: em ? em.clone() : null });
      }
      return c;
    });
    m.material = Array.isArray(m.material) ? next : next[0];
  });
  states.set(f, { slots, soot: -1, flash: -1 });
}

// Per-frame: soot builds up with lost structure, and a player hit flashes orange.
export function update(f: Fighter, worldTime: number) {
  const st = states.get(f);
  if (!st) return;

  const soot = SOOT_MIN + (1 - SOOT_MIN) * f.structureFrac; // 1 = clean, SOOT_MIN = wrecked
  const since = worldTime - f.lastPlayerHit;
  const flash = since >= 0 && since < FLASH_TIME ? 1 - since / FLASH_TIME : 0;
  if (soot === st.soot && flash === st.flash) return; // nothing changed: skip the writes
  st.soot = soot;
  st.flash = flash;

  for (const s of st.slots) {
    if (s.color) {
      const col = (s.mat as THREE.MeshStandardMaterial).color;
      col.copy(s.color).multiplyScalar(soot);
    }
    if (s.emissive) {
      const em = (s.mat as THREE.MeshStandardMaterial).emissive;
      em.copy(s.emissive);
      em.r += FLASH_COLOR.r * flash;
      em.g += FLASH_COLOR.g * flash;
      em.b += FLASH_COLOR.b * flash;
    }
  }
}

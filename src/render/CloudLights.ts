import * as THREE from 'three';
import { weatherNow } from './WeatherState';

// Point lights inside the volumetric clouds (Clouds.ts): flak bursts and explosions glowing
// orange in the cloud at night, parachute flares lighting the cloud tops below them, lightning
// flickering through a storm. Sources register here (a fixed pool, no allocation); every frame
// the cloud pass takes the CLOUD_LIGHTS that matter most to the camera into a fixed-size uniform
// array (count = 0 costs nothing in the march), so the shader program never changes.
//
// Positions are scene (floating-origin) coordinates: Effects.rebase shifts them.

export const CLOUD_LIGHTS = 4;          // uniform array size (Clouds.ts)
const POOL = 32;
const HOLD_LIFE = 0.12;   // s

interface Src { pos: THREE.Vector3; r: number; g: number; b: number; i: number; radius: number; life: number; max: number; hold: boolean; dark: boolean; key: number }

const pool: Src[] = [];
for (let i = 0; i < POOL; i++) pool.push({ pos: new THREE.Vector3(), r: 1, g: 1, b: 1, i: 0, radius: 1, life: 0, max: 1, hold: false, dark: true, key: -1 });
const pick: (Src | null)[] = new Array(CLOUD_LIGHTS).fill(null);
const pickW = new Float64Array(CLOUD_LIGHTS);
let nPick = 0;

function alloc(intensity: number): Src | null {
  let low: Src | null = null, lw = Infinity;
  for (const s of pool) {
    if (s.life <= 0) return s;
    const k = s.hold ? 1 : s.life / s.max;
    const w = s.i * k * k;
    if (w < lw) { lw = w; low = s; }
  }
  return low && lw < intensity ? low : null;
}

export const cloudLights = {
  // A transient light (flak, explosion, lightning): fades out over `life` s (quadratic).
  // dark: scaled by how dark the sky is (weatherNow.dark), so day flak barely glows; lightning passes false.
  flash(pos: THREE.Vector3, r: number, g: number, b: number, intensity: number, radius: number, life: number, dark = true) {
    if (dark && weatherNow.dark < 0.02) return;
    const s = alloc(intensity);
    if (!s) return;
    s.pos.copy(pos); s.r = r; s.g = g; s.b = b; s.i = intensity; s.radius = radius;
    s.life = s.max = life; s.hold = false; s.dark = dark; s.key = -1;
  },
  // A steady light, refreshed every frame by its owner under the same key (a flare): it keeps its
  // slot, and lapses HOLD_LIFE s after the owner stops refreshing it
  hold(key: number, pos: THREE.Vector3, r: number, g: number, b: number, intensity: number, radius: number) {
    if (weatherNow.dark < 0.02) return;
    let s: Src | null = null;
    for (const x of pool) if (x.key === key && x.life > 0) { s = x; break; }
    s ??= alloc(intensity);
    if (!s) return;
    s.pos.copy(pos); s.r = r; s.g = g; s.b = b; s.i = intensity; s.radius = radius;
    s.life = s.max = HOLD_LIFE; s.hold = true; s.dark = true; s.key = key;
  },
  rebase(off: THREE.Vector3) { for (const s of pool) if (s.life > 0) s.pos.sub(off); },
  clear() { for (const s of pool) s.life = 0; },
  // Ages the sources and fills the shader arrays: xyz position + radius, rgb * intensity.
  // Returns the number of lights written.
  sync(dt: number, cam: THREE.Vector3, posR: THREE.Vector4[], col: THREE.Vector3[]): number {
    nPick = 0;
    const dk = weatherNow.dark;
    for (const s of pool) {
      if (s.life <= 0) continue;
      const k = s.hold ? 1 : Math.max(0, s.life / s.max);
      const kk = k * k * (s.dark ? dk : 1);
      if (kk > 0.002) {
        const d = s.pos.distanceTo(cam);
        const w = s.i * kk / (1 + (d * d) / ((s.radius + 1500) * (s.radius + 1500)));
        // insertion into the top CLOUD_LIGHTS by weight
        let at = nPick;
        while (at > 0 && pickW[at - 1] < w) at--;
        if (at < CLOUD_LIGHTS) {
          for (let j = Math.min(nPick, CLOUD_LIGHTS - 1); j > at; j--) { pick[j] = pick[j - 1]; pickW[j] = pickW[j - 1]; }
          pick[at] = s; pickW[at] = w;
          if (nPick < CLOUD_LIGHTS) nPick++;
        }
      }
      s.life -= dt;
      if (s.life <= 0) s.key = -1;
    }
    for (let i = 0; i < nPick; i++) {
      const s = pick[i]!;
      const k = s.hold ? 1 : Math.max(0, s.life + dt) / s.max;
      const e = s.i * k * k * (s.dark ? dk : 1);
      posR[i].set(s.pos.x, s.pos.y, s.pos.z, s.radius);
      col[i].set(s.r * e, s.g * e, s.b * e);
    }
    return nPick;
  },
};

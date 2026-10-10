import * as THREE from 'three';
import type { ParticleOpts, ParticleSystem } from '../render/Particles';
import { cloudLights } from '../render/CloudLights';
import { Atmos } from '../render/Atmosphere';

// Parachute flares (target markers): magnesium candles dropped by pathfinders that drift down
// under small parachutes for a minute and a half, burning white-hot. Each is a glow sprite with a
// wide halo (bloom carries it for kilometres), a column of its own lit smoke above it, a light in
// the volumetric clouds (CloudLights: the cloud tops below glow) and, for the one nearest the
// camera, the steady slot of Effects' fixed combat-light pool, so aircraft under the flares are
// lit without the light count (and the shader programs) ever changing.
// A fixed pool; no allocation per frame. Positions are scene coordinates (Effects.rebase).

const MAX = 16;
const FALL = 4.2;            // m/s under the canopy
const BURN = 95;             // s
const IGNITE = 1.4;          // s of free fall before the chute opens and the candle lights

interface Flare { key: number; pos: THREE.Vector3; vel: THREE.Vector3; age: number; life: number; active: boolean; phase: number; smokeAcc: number; color: [number, number, number] }

const WHITE: [number, number, number] = [1.0, 0.93, 0.78];
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c: [number, number, number] = [0, 0, 0];
const _h: [number, number, number] = [0, 0, 0];
const _s: [number, number, number] = [0, 0, 0];
const _s1: [number, number, number] = [0, 0, 0];
// one reusable spawn-options object (no allocation per particle)
const O: ParticleOpts = { pos: new THREE.Vector3(), life: 1, size0: 1, size1: 1, color0: _c };
function emit(sys: ParticleSystem, pos: THREE.Vector3, vel: THREE.Vector3, life: number, s0: number, s1: number,
  c0: [number, number, number], c1: [number, number, number] | undefined, a0: number, a1: number, frame: number, drag: number, rotVel: number) {
  O.pos = pos; O.vel = vel; O.life = life; O.size0 = s0; O.size1 = s1; O.color0 = c0; O.color1 = c1;
  O.alpha0 = a0; O.alpha1 = a1; O.frame = frame; O.drag = drag; O.rotVel = rotVel; O.rise = 0; O.lit = false;
  sys.spawn(O);
}

export class Flares {
  private pool: Flare[] = [];
  private nearest: Flare | null = null;

  constructor(private glow: ParticleSystem, private light: (pos: THREE.Vector3, intensity: number, range: number, color: number) => void) {
    for (let i = 0; i < MAX; i++) this.pool.push({ key: 1000 + i, pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, life: BURN, active: false, phase: 0, smokeAcc: 0, color: WHITE });
  }

  get count() { let n = 0; for (const f of this.pool) if (f.active) n++; return n; }
  // burning flares (dev / tests)
  get burning() { let n = 0; for (const f of this.pool) if (f.active && f.age > IGNITE) n++; return n; }

  // Drop one flare at pos (scene coordinates) with the aircraft's velocity; it lights a moment later
  drop(pos: THREE.Vector3, vel?: THREE.Vector3, burn = BURN) {
    let f: Flare | null = null;
    for (const x of this.pool) if (!x.active) { f = x; break; }
    if (!f) for (const x of this.pool) if (!f || x.life - x.age < f.life - f.age) f = x;   // the most burnt-out
    if (!f) return;
    f.pos.copy(pos);
    if (vel) f.vel.copy(vel).multiplyScalar(0.3); else f.vel.set(0, 0, 0);
    f.age = 0; f.life = burn + IGNITE; f.active = true; f.phase = Math.random() * 100; f.smokeAcc = 0;
  }

  clear() { for (const f of this.pool) f.active = false; this.nearest = null; }
  rebase(off: THREE.Vector3) { for (const f of this.pool) if (f.active) f.pos.sub(off); }

  // Brightness 0..1 of a flare now: lights up, sputters, gutters out at the end
  private bright(f: Flare): number {
    const t = f.age - IGNITE;
    if (t < 0) return 0;
    const left = f.life - f.age;
    const flick = 0.86 + 0.08 * Math.sin(f.age * 23 + f.phase) + 0.06 * Math.sin(f.age * 37.7 + f.phase * 2);
    return Math.min(1, t / 0.6) * Math.min(1, left / 7) * flick;
  }

  update(dt: number, cam: THREE.Vector3 | null) {
    let best: Flare | null = null, bd = Infinity;
    for (const f of this.pool) {
      if (!f.active) continue;
      f.age += dt;
      if (f.age >= f.life || f.pos.y < 300) { f.active = false; continue; }
      if (f.age < IGNITE) {
        f.vel.y -= 9.81 * dt;
        f.vel.multiplyScalar(Math.exp(-0.6 * dt));
      } else {
        // under the chute: settle to a slow descent, drift with the wind, a lazy swing
        f.vel.y += (-FALL - f.vel.y) * Math.min(1, dt * 1.5);
        f.vel.x += (Atmos.wind.x + Math.sin(f.age * 0.4 + f.phase) * 1.2 - f.vel.x) * Math.min(1, dt * 0.8);
        f.vel.z += (Atmos.wind.z + Math.cos(f.age * 0.33 + f.phase) * 1.2 - f.vel.z) * Math.min(1, dt * 0.8);
      }
      f.pos.addScaledVector(f.vel, dt);
      const b = this.bright(f);
      if (b <= 0) continue;
      const d = cam ? f.pos.distanceTo(cam) : 0;
      if (d < bd) { bd = d; best = f; }
      // white-hot candle and a broad halo (bloom); halo grows with distance so it reads from afar
      _c[0] = 26 * b; _c[1] = 24 * b; _c[2] = 18 * b;
      const cs = 2.6 + Math.min(14, d * 0.0025);   // never shrinks below a few pixels
      emit(this.glow, f.pos, f.vel, 0.05, cs, cs * 1.1, _c, undefined, 1, 0.8, 1, 0, 0);
      const hs = 30 + Math.min(110, d * 0.014);
      _h[0] = 0.8 * b; _h[1] = 0.71 * b; _h[2] = 0.55 * b;
      emit(this.glow, f.pos, f.vel, 0.05, hs, hs, _h, undefined, 0.22, 0.2, 1, 0, 0);
      // smoke trailing up from the candle, lit by it (additive: it glows rather than shades)
      f.smokeAcc += dt;
      if (f.smokeAcc > 0.22) {
        f.smokeAcc = 0;
        _p.copy(f.pos); _p.y += 2;
        _v.set((Math.random() - 0.5) * 0.6, 2.2, (Math.random() - 0.5) * 0.6).add(f.vel).multiplyScalar(0.5);
        _s[0] = 0.22 * b; _s[1] = 0.2 * b; _s[2] = 0.17 * b;
        _s1[0] = 0.01; _s1[1] = 0.009; _s1[2] = 0.008;
        emit(this.glow, _p, _v, 5, 3, 16, _s, _s1, 0.45, 0, 0, 0.2, 0.2);
      }
      // the cloud below and around glows with it
      cloudLights.hold(f.key, f.pos, f.color[0], f.color[1], f.color[2], 2.0 * b, 420);
    }
    this.nearest = best;
    // aircraft under the flares: the nearest one takes the pool's steady light
    if (best) {
      const b = this.bright(best);
      this.light(best.pos, 260000 * b, 3200, 0xfff0d0);
    }
  }
}

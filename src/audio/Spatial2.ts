// Spatial audio 2.0 (Phase 11 · 17): pure helpers, no Web Audio, unit-tested in Node
// (tests/spatial2.test.ts). Sound.ts wires them into the graph (SpatialNodes.ts holds the nodes).
//  - listener motion: the camera rides in a bomber doing ~75 m/s, so Doppler must use the
//    velocity of the source relative to the listener (a wingman holding station has no pitch shift)
//  - pass-by HRTF: the few HRTF panners go to the fighters about to pass close, not just the nearest
//  - station occlusion: what the gunner hears through the fuselage skin depends on where the
//    station's openings face (waist windows, turret domes, tail glazing)
//  - interior reverb per compartment (waist tube, flight deck, ball turret, tail)
//  - distance-based flak rumble: the barrage builds a low bed that darkens with distance
//  - engine harmonics per RPM: propeller blade-pass and firing orders of the Cyclones / the Merlin
import { SPEED_OF_SOUND, type AudioDetail } from './Acoustics';

const finite = (v: number, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, finite(v, lo)));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- detail
// What Settings "Audio detail" keeps. Occlusion, Doppler and the flak rumble are parameter changes
// on nodes that exist anyway, so both levels keep them.
export interface SpatialCaps { hrtfFighters: number; harmonics: boolean; compartmentIRs: boolean }
export const SPATIAL_DETAIL: Record<AudioDetail, SpatialCaps> = {
  normal: { hrtfFighters: 4, harmonics: true, compartmentIRs: true },
  reduced: { hrtfFighters: 1, harmonics: false, compartmentIRs: false },
};

// ---------------------------------------------------------------- listener motion
// Smoothed listener velocity from its per-frame positions. A jump faster than maxSpeed (floating
// origin shift, camera cut, kill cam) is not motion: the estimate keeps its last value.
export class ListenerMotion {
  vx = 0; vy = 0; vz = 0;
  private px = 0; private py = 0; private pz = 0; private pt = NaN;
  constructor(public maxSpeed = 400, public tau = 0.15) {}
  update(x: number, y: number, z: number, t: number) {
    if (!Number.isFinite(x + y + z + t)) return;
    const dt = t - this.pt;
    if (!(dt >= 0.004)) {                   // first sample, clock went back or too short to measure
      if (!(dt >= 0)) this.set(x, y, z, t);
      return;
    }
    const rx = (x - this.px) / dt, ry = (y - this.py) / dt, rz = (z - this.pz) / dt;
    this.set(x, y, z, t);
    if (dt > 0.5 || rx * rx + ry * ry + rz * rz > this.maxSpeed * this.maxSpeed) return;
    const k = 1 - Math.exp(-dt / this.tau);
    this.vx += (rx - this.vx) * k; this.vy += (ry - this.vy) * k; this.vz += (rz - this.vz) * k;
  }
  reset() { this.vx = this.vy = this.vz = 0; this.pt = NaN; }
  private set(x: number, y: number, z: number, t: number) { this.px = x; this.py = y; this.pz = z; this.pt = t; }
}

// Doppler factor with both ends moving: vs = source speed towards the listener, vl = listener speed
// towards the source (m/s). Same limits as Acoustics.doppler (which this equals when vl = 0).
export function doppler2(vs: number, vl: number): number {
  const f = (SPEED_OF_SOUND + clamp(vl, -250, 250)) / Math.max(110, SPEED_OF_SOUND - clamp(vs, -2000, 2000));
  return clamp(f, 0.3, 3.2);
}

// ---------------------------------------------------------------- pass-by HRTF
// rx..: source position relative to the listener, vx..: source velocity relative to the listener.
// tca: seconds to the closest approach (negative: already past), miss: distance at that moment.
export interface PassBy { tca: number; miss: number }
export function passBy(rx: number, ry: number, rz: number, vx: number, vy: number, vz: number, out: PassBy = { tca: 0, miss: 0 }): PassBy {
  const v2 = vx * vx + vy * vy + vz * vz;
  const d = Math.hypot(rx, ry, rz);
  if (!(v2 > 1) || !Number.isFinite(d)) { out.tca = Infinity; out.miss = finite(d, Infinity); return out; }
  const tca = -(rx * vx + ry * vy + rz * vz) / v2;
  const s = Math.max(0, tca);
  out.tca = tca;
  out.miss = Math.hypot(rx + vx * s, ry + vy * s, rz + vz * s);
  return out;
}

// How much a fighter deserves an HRTF panner (0: not at all): close now, or about to pass close.
export function hrtfScore(d: number, tca: number, miss: number): number {
  if (!(d < 1200)) return 0;
  const near = 1 - d / 1200;
  const pass = tca > -1.5 && tca < 5 && miss < 300 ? (1 / (1 + miss / 60)) * (1 / (1 + Math.max(0, tca) / 1.5)) : 0;
  return 0.5 * near * near + pass;
}

// Pick the k best scores (> 0.02) into `on` (1/0 per slot). Slots that already have HRTF get a
// bonus so a panner does not flip back and forth between two similar fighters. No allocation.
export function pickHrtf(scores: ArrayLike<number>, n: number, k: number, was: ArrayLike<number>, on: Uint8Array): number {
  for (let i = 0; i < n; i++) on[i] = 0;
  let picked = 0;
  for (; picked < k; picked++) {
    let best = -1, bs = 0.02;
    for (let i = 0; i < n; i++) {
      if (on[i]) continue;
      const s = finite(scores[i]) + (was[i] && scores[i] > 0 ? 0.15 : 0);
      if (s > bs) { bs = s; best = i; }
    }
    if (best < 0) break;
    on[best] = 1;
  }
  return picked;
}

// ---------------------------------------------------------------- station occlusion
// The B-17 model frame: +X left wing, +Y up, +Z nose (B17Layout). Each station hears the outside
// through its openings (open waist windows, turret and tail glazing); everything else comes
// through the thin aluminium skin and the structure: quieter and much darker.
export type StationKey = 'waistL' | 'waistR' | 'top' | 'ball' | 'tail';
interface Opening { x: number; y: number; z: number; lo: number; hi: number; gain: number; lp: number }
// lo/hi: cosine range over which the opening fades in; gain/lp: what it lets through (1 = open air)
const OPEN_WAIST_L: Opening = { x: 1, y: 0, z: 0, lo: -0.05, hi: 0.55, gain: 1, lp: 1 };
const OPEN_WAIST_R: Opening = { x: -1, y: 0, z: 0, lo: -0.05, hi: 0.55, gain: 1, lp: 1 };
const OPENINGS: Record<StationKey, Opening[]> = {
  // your own window wide open; the one across the fuselage lets in a little
  waistL: [OPEN_WAIST_L, { ...OPEN_WAIST_R, gain: 0.72, lp: 0.6 }],
  waistR: [OPEN_WAIST_R, { ...OPEN_WAIST_L, gain: 0.72, lp: 0.6 }],
  top: [{ x: 0, y: 1, z: 0, lo: -0.25, hi: 0.45, gain: 0.95, lp: 0.8 }],     // plexiglass dome
  ball: [{ x: 0, y: -1, z: 0, lo: -0.25, hi: 0.45, gain: 0.95, lp: 0.75 }],  // the ball hangs under the belly
  tail: [{ x: 0, y: 0, z: -1, lo: 0.05, hi: 0.6, gain: 0.95, lp: 0.8 }],     // aft glazing
};
export const SKIN = { gain: 0.55, lp: 0.3 };  // through the fuselage (about -5 dB, highs cut hard)
export interface Occlusion { gain: number; lp: number }
export function isStation(id: string | null | undefined): id is StationKey { return !!id && id in OPENINGS; }

// (dx, dy, dz): direction from the listener to the source in the bomber's model frame (any length)
export function occlusion(station: StationKey, dx: number, dy: number, dz: number, out: Occlusion = { gain: 1, lp: 1 }): Occlusion {
  const len = Math.hypot(dx, dy, dz);
  if (!(len > 1e-6)) { out.gain = 1; out.lp = 1; return out; }
  dx /= len; dy /= len; dz /= len;
  let g = SKIN.gain, lp = SKIN.lp;
  for (const o of OPENINGS[station]) {
    const k = smooth(o.lo, o.hi, o.x * dx + o.y * dy + o.z * dz);
    g = Math.max(g, SKIN.gain + (o.gain - SKIN.gain) * k);
    lp = Math.max(lp, SKIN.lp + (o.lp - SKIN.lp) * k);
  }
  out.gain = g; out.lp = lp;
  return out;
}

// ---------------------------------------------------------------- compartments
// Interior reverb per compartment: send level into the interior reverb, its pre-delay (s), a
// damping low-pass on the reverb input (Hz) and the impulse length (s) / decay used at Normal detail.
export type Compartment = 'waist' | 'flightDeck' | 'ball' | 'tail' | 'outside';
export interface Room { send: number; predelay: number; damp: number; length: number; decay: number }
export const ROOMS: Record<Compartment, Room> = {
  waist: { send: 0.55, predelay: 0.012, damp: 5200, length: 0.75, decay: 6.5 },     // long ribbed aluminium tube
  flightDeck: { send: 0.42, predelay: 0.007, damp: 4200, length: 0.55, decay: 7.5 }, // top turret, behind the cockpit
  ball: { send: 0.2, predelay: 0.002, damp: 2600, length: 0.28, decay: 12 },          // cramped steel sphere
  tail: { send: 0.32, predelay: 0.004, damp: 3400, length: 0.4, decay: 9.5 },         // narrow tail cone
  outside: { send: 0, predelay: 0.01, damp: 5000, length: 0.75, decay: 6.5 },
};
export function compartmentOf(station: string | null | undefined): Compartment {
  switch (station) {
    case 'waistL': case 'waistR': return 'waist';
    case 'top': return 'flightDeck';
    case 'ball': return 'ball';
    case 'tail': return 'tail';
    default: return 'outside';
  }
}

// ---------------------------------------------------------------- flak rumble
// The heavy-flak barrage as a low rolling bed: every burst adds energy weighted by distance, the
// energy decays over a few seconds; far bursts make it darker. level 0..1, lp in Hz.
export class FlakRumble {
  energy = 0;
  dist = 2000;     // energy-weighted distance of the recent bursts
  burst(d: number, gain = 1) {
    d = finite(d, Infinity);
    if (!(d < 8000) || !(gain > 0)) return;
    const w = clamp(gain, 0, 2) / (1 + (d / 900) ** 2);
    if (w < 1e-4) return;
    this.dist = (this.dist * this.energy + d * w) / (this.energy + w);
    this.energy = Math.min(6, this.energy + w);
  }
  step(dt: number) {
    if (dt > 0 && Number.isFinite(dt)) this.energy *= Math.exp(-Math.min(dt, 1) / 3.5);
    if (this.energy < 1e-4) this.energy = 0;
  }
  get level() { return 1 - Math.exp(-0.45 * this.energy); }
  get lp() { return Math.max(90, 520 * Math.exp(-this.dist / 2500)); }
  reset() { this.energy = 0; this.dist = 2000; }
}

// ---------------------------------------------------------------- engine harmonics
// Order tones of a piston engine + propeller: blade-pass = rpm/60 x reduction gear x blades,
// firing = rpm/60 x cylinders/2 (four-stroke).
export type HarmonicEngine = 'cyclone' | 'merlin';
export interface EngineOrders { cylinders: number; gear: number; blades: number; idle: number; max: number }
export const ENGINE_ORDERS: Record<HarmonicEngine, EngineOrders> = {
  cyclone: { cylinders: 9, gear: 0.5625, blades: 3, idle: 1000, max: 2500 },   // Wright R-1820-97, Hamilton 3-blade
  merlin: { cylinders: 12, gear: 0.479, blades: 4, idle: 1800, max: 3000 },    // Packard V-1650-7, 4-blade
};
export function rpmFor(e: HarmonicEngine, throttle: number): number {
  const o = ENGINE_ORDERS[e];
  return o.idle + (o.max - o.idle) * clamp(throttle, 0, 1.1);
}
// The B-17's cruise rpm; with engines out the pilot runs the rest harder. wander: -1..1 slow drift.
export function bomberRpm(alive: number, wander = 0): number {
  const a = clamp(Math.round(alive), 0, 4);
  if (a === 0) return 0;
  return 2300 + (4 - a) * 70 + 18 * clamp(wander, -1, 1);
}
// Partials [blade-pass, 2 x blade-pass, firing] into freqs/gains (length >= 3). Louder with rpm.
export function engineHarmonics(e: HarmonicEngine, rpm: number, freqs: Float32Array | number[], gains: Float32Array | number[]) {
  const o = ENGINE_ORDERS[e];
  const r = clamp(rpm, 0, o.max * 1.2), hz = r / 60;
  const bpf = hz * o.gear * o.blades, fire = hz * o.cylinders / 2;
  const load = r <= 0 ? 0 : 0.35 + 0.65 * smooth(o.idle, o.max, r);
  freqs[0] = bpf; freqs[1] = bpf * 2; freqs[2] = fire;
  gains[0] = load; gains[1] = 0.45 * load; gains[2] = 0.3 * load * (0.6 + 0.4 * smooth(o.idle, o.max, r));
}

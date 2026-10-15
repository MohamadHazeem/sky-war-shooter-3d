// Spectator mode for B-17 crew co-op (Phase 11 goal 34): the pure parts, unit-tested in
// tests/spectator.test.ts. The runtime is game/Spectator.ts, the network side CoopSession.ts.
//
//   views       the five gun positions (first person, following that gunner's streamed aim)
//               plus a cinematic camera that cuts between shots of the ship and the fight
//   crew aims   the host streams every gun's aim in each snapshot (`ca`: yaw, pitch per station
//               in STATION_ORDER, model frame) and a bit mask of the guns firing (`cf`)
//   delay       a spectator can hold the whole broadcast back (Settings "Spectator delay"), so a
//               streamed picture never gives a crew live information; DelayLine is that buffer
//   shots       the cinematic camera's shot list and the rule that picks the next one
import { STATION_ORDER, STATIONS, wrapAngle, type StationDef, type StationId } from '../world/B17Layout';

export type SpecView = StationId | 'cine';
export const SPEC_VIEWS: readonly SpecView[] = [...STATION_ORDER, 'cine'];

/** The next view in the bar (dir +1 / -1), wrapping round. */
export function cycleView(cur: SpecView, dir: number): SpecView {
  const i = Math.max(0, SPEC_VIEWS.indexOf(cur));
  const n = SPEC_VIEWS.length;
  return SPEC_VIEWS[(((i + Math.sign(dir || 1)) % n) + n) % n];
}

/** First view when the round starts: the host's gun when known, else the first crewed gun, else the cinematic camera. */
export function defaultView(crew: readonly { id: number; seat: StationId }[]): SpecView {
  const host = crew.find(p => p.id === 0);
  if (host) return host.seat;
  const sorted = [...crew].sort((a, b) => a.id - b.id);
  return sorted[0]?.seat ?? 'cine';
}

// ---------------- broadcast delay ----------------

export const SPECTATOR_DELAYS = [0, 5, 15, 30, 60] as const;
export const MAX_DELAY_ITEMS = 2400;   // 60 s of 20 Hz snapshots plus events, with headroom

/** Settings value -> one of the offered delays in seconds (anything else: off). */
export function delaySeconds(v: unknown): number {
  const n = Number(v);
  return (SPECTATOR_DELAYS as readonly number[]).includes(n) ? n : 0;
}

/** First-in, first-out hold for network messages: everything comes out `delay` ms after it went in, in order. */
export class DelayLine<T> {
  private at: number[] = [];
  private items: T[] = [];
  private head = 0;
  firstAt = -1;   // arrival time of the first message since the last clear (the countdown)
  get length() { return this.items.length - this.head; }
  push(now: number, item: T) {
    if (this.firstAt < 0) this.firstAt = now;
    this.at.push(now); this.items.push(item);
    if (this.length > MAX_DELAY_ITEMS) this.head++;   // never grows without bound (the oldest go)
  }
  /** Hands every message older than `delayMs` to `fn`, oldest first. */
  drain(now: number, delayMs: number, fn: (item: T) => void) {
    while (this.head < this.items.length && now - this.at[this.head] >= delayMs) {
      const item = this.items[this.head];
      this.items[this.head] = undefined as unknown as T;
      this.head++;
      fn(item);
    }
    if (this.head > 256 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head); this.at = this.at.slice(this.head); this.head = 0;
    }
  }
  /** Seconds until the first message comes out (the "picture starts in" countdown), 0 once it has. */
  wait(now: number, delayMs: number, released: boolean) {
    if (released || this.firstAt < 0) return released ? 0 : delayMs / 1000;
    return Math.max(0, (delayMs - (now - this.firstAt)) / 1000);
  }
  clear() { this.at = []; this.items = []; this.head = 0; this.firstAt = -1; }
}

// ---------------- crew aims ----------------

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Yaw/pitch (model frame, yaw about +Y from +Z) of a local direction. */
export function aimOf(d: { x: number; y: number; z: number }, out: [number, number] = [0, 0]): [number, number] {
  const len = Math.hypot(d.x, d.y, d.z) || 1;
  out[0] = Math.atan2(d.x, d.z);
  out[1] = Math.asin(Math.max(-1, Math.min(1, d.y / len)));
  return out;
}

/** The `ca` snapshot field: yaw, pitch for every station in STATION_ORDER (rounded). */
export function packAims(aims: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < STATION_ORDER.length * 2; i++) out.push(r3(Number(aims[i]) || 0));
  return out;
}

/** Reads a `ca` field into `out` (length 10); false (and `out` untouched) when it is malformed. */
export function readAims(raw: unknown, out: Float32Array | number[]): boolean {
  const n = STATION_ORDER.length * 2;
  if (!Array.isArray(raw) || raw.length !== n) return false;
  for (let i = 0; i < n; i++) if (typeof raw[i] !== 'number' || !Number.isFinite(raw[i]) || Math.abs(raw[i]) > 7) return false;
  for (let i = 0; i < n; i++) out[i] = raw[i];
  return true;
}

/** Firing mask `cf`: bit i = the gun at STATION_ORDER[i] fired since the last snapshot. */
export function fireMask(firing: (s: StationId) => boolean) {
  let m = 0;
  STATION_ORDER.forEach((s, i) => { if (firing(s)) m |= 1 << i; });
  return m;
}
export const firesAt = (mask: number, s: StationId) => ((mask | 0) & (1 << STATION_ORDER.indexOf(s))) !== 0;

/** An absolute aim -> the gunner controller's target yaw/pitch for that station (relative to its rest, inside its limits). */
export function stationTarget(def: StationDef, yaw: number, pitch: number, out: { y: number; p: number } = { y: 0, p: 0 }) {
  let ry = wrapAngle(yaw - def.rest.yaw);
  if (def.yaw[1] - def.yaw[0] < Math.PI * 1.99) ry = Math.max(def.yaw[0], Math.min(def.yaw[1], ry));
  out.y = ry;
  out.p = Math.max(def.pitch[0], Math.min(def.pitch[1], pitch)) - def.rest.pitch;
  return out;
}

export const stationIndex = (s: StationId) => STATION_ORDER.indexOf(s);
export const stationLabel = (s: StationId) => STATIONS[s].label;

// ---------------- cinematic camera ----------------

export type ShotKind = 'chase' | 'wing' | 'below' | 'nose' | 'action';
/** Calm shots, in the order the camera works through them. */
export const CALM_SHOTS: readonly Exclude<ShotKind, 'action'>[] = ['chase', 'wing', 'below', 'nose'];
export const SHOT_SECONDS: Record<ShotKind, number> = { chase: 8, wing: 7, below: 6, nose: 6, action: 6.5 };
export const ACTION_RANGE = 1800;   // m: a fighter this close to our ship is worth cutting to
export const MIN_SHOT = 2.5;        // s: never cut sooner (no flicker when a fighter comes and goes)

/**
 * Next shot: the fight when a fighter is in range (but never two action shots back to back, so
 * the ship gets screen time), otherwise the next calm shot after the last calm one.
 */
export function nextShot(prev: ShotKind | null, threat: boolean, calmIdx: number): ShotKind {
  if (threat && prev !== 'action') return 'action';
  return CALM_SHOTS[((calmIdx % CALM_SHOTS.length) + CALM_SHOTS.length) % CALM_SHOTS.length];
}

/** Cut now? After the shot's length, or early (past MIN_SHOT) when a fighter arrives during a calm shot or the subject of an action shot is gone. */
export function shouldCut(kind: ShotKind, t: number, threat: boolean, subjectGone: boolean): boolean {
  if (t >= SHOT_SECONDS[kind]) return true;
  if (t < MIN_SHOT) return kind === 'action' && subjectGone;
  return kind === 'action' ? subjectGone : threat && kind !== 'nose';
}

type V3 = [number, number, number];
/** Calm shots in the ship's model frame (+Z nose, +X left wing, +Y up): the camera eases from `from` to `to`, looking at `look`. */
export const SHOTS: Record<Exclude<ShotKind, 'action'>, { from: V3; to: V3; look: V3; fov: number }> = {
  chase: { from: [14, 9, -58], to: [-10, 7, -50], look: [0, 1, 4], fov: 42 },
  wing: { from: [34, 2.5, 14], to: [30, 4, -4], look: [0, 0.5, -5], fov: 38 },
  below: { from: [-7, -16, 18], to: [5, -14, 2], look: [0, -1, -6], fov: 46 },
  nose: { from: [-9, 3, 46], to: [9, 4, 40], look: [0, 0.8, 0], fov: 40 },
};

/** Calm shot camera offset at progress u (0..1), eased, into `out`. */
export function shotOffset<T extends { set(x: number, y: number, z: number): unknown }>(kind: Exclude<ShotKind, 'action'>, u: number, out: T): T {
  const s = SHOTS[kind], k = Math.max(0, Math.min(1, u)), e = k * k * (3 - 2 * k);
  out.set(s.from[0] + (s.to[0] - s.from[0]) * e, s.from[1] + (s.to[1] - s.from[1]) * e, s.from[2] + (s.to[2] - s.from[2]) * e);
  return out;
}

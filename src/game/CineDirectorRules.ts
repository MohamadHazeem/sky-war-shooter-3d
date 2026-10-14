// Combat director rules (pure, unit-tested in tests/cinema.test.ts): when a cinematic shot may
// cut in, which camera it uses, its slow motion, and the mission-end combat film's edit.
// The runtime (CombatDirector.ts / CineShots.ts) feeds these from the live world.

export type DirectorLevel = 'off' | 'rare' | 'often';
export const DIRECTOR_LEVELS: DirectorLevel[] = ['off', 'rare', 'often'];
/** Settings value -> level (missing / old saves: rare). */
export const directorLevel = (v?: string): DirectorLevel => (v === 'off' || v === 'often' ? v : 'rare');

export interface DirectorTuning {
  cooldown: number;     // s of mission time between two director shots
  maxPerMission: number;
  passChance: number;   // a qualifying close pass becomes a shot
  killChance: number;   // an ordinary credited kill gets a gun-camera / chase follow
  warmup: number;       // s into the mission before the first shot
}
export const DIRECTOR: Record<Exclude<DirectorLevel, 'off'>, DirectorTuning> = {
  rare: { cooldown: 75, maxPerMission: 4, passChance: 0.6, killChance: 0.25, warmup: 30 },
  often: { cooldown: 38, maxPerMission: 9, passChance: 0.9, killChance: 0.45, warmup: 15 },
};

/** Everything the director checks before cutting away from the gun. */
export interface DirectorGate {
  level: DirectorLevel;
  missionTime: number;      // s since the mission started (world time)
  sinceLastCine: number;    // s since any cinematic (kill cam, drama, director shot)
  shots: number;            // director shots this mission
  playing: boolean;         // state === 'playing', not the ending / debrief
  tutorial: boolean;
  coop: boolean;            // both players share the clock: never
  photo: boolean;
  busy: boolean;            // bomb run at the sight, boss battle, station change, ditching, formation return
  fit: boolean;             // player healthy and not under heavy fire (Cinematics.playerFit)
  threats: number;          // other fighters pressing an attack close by
}

/** True when a director shot may start now ("never during critical moments"). */
export function shotAllowed(g: DirectorGate): boolean {
  if (g.level === 'off' || !g.playing || g.tutorial || g.coop || g.photo || g.busy || !g.fit) return false;
  const t = DIRECTOR[g.level];
  if (g.missionTime < t.warmup || g.shots >= t.maxPerMission) return false;
  if (g.sinceLastCine < t.cooldown) return false;
  return g.threats === 0;
}

export interface Approach { t: number; miss: number; speed: number }

/** Closest approach of a target relative to an observer: r = target - observer position,
 *  v = target - observer velocity. t: seconds until it (negative: already past). */
export function closestApproach(rx: number, ry: number, rz: number, vx: number, vy: number, vz: number, out: Approach): Approach {
  const vv = vx * vx + vy * vy + vz * vz;
  out.speed = Math.sqrt(vv);
  out.t = vv > 1e-6 ? -(rx * vx + ry * vy + rz * vz) / vv : 0;
  const mx = rx + vx * out.t, my = ry + vy * out.t, mz = rz + vz * out.t;
  out.miss = Math.sqrt(mx * mx + my * my + mz * mz);
  return out;
}

/** A fighter "flashing past": fast, about to pass close (not a collision course). */
export function passQualifies(a: Approach, hostRadius: number): boolean {
  return a.t > 0.3 && a.t < 0.95 && a.speed > 55 && a.miss > hostRadius * 0.5 && a.miss < hostRadius * 2.4 + 30;
}

export type PassCam = 'waist' | 'wingtip' | 'telephoto';
export type KillCam = 'gunCam' | 'chase' | 'telephoto';

/** Camera for a close pass. Gunner at a waist gun: through the waist window when the fighter
 *  passes below the wing line, else alternate a wing-tip camera and a long lens from a neighbour. */
export function pickPassCam(role: 'gunner' | 'pilot', station: string | null, relY: number, hasNeighbour: boolean, seq: number): PassCam {
  if (role === 'gunner' && (station === 'waistL' || station === 'waistR') && relY < 25 && seq % 3 !== 2) return 'waist';
  if (!hasNeighbour) return 'wingtip';
  return seq % 2 === 0 ? 'telephoto' : 'wingtip';
}

/** Camera for a kill follow: mostly the 16 mm gun camera; the chase and the telephoto for variety. */
export function pickKillCam(hasNeighbour: boolean, seq: number): KillCam {
  const k = seq % 4;
  if (k === 1) return 'chase';
  if (k === 3 && hasNeighbour) return 'telephoto';
  return 'gunCam';
}

export const PASS_SLOW = 0.22, KILL_SLOW = 0.45;

/** Slow-motion target for a close pass: real speed into it, slow from a quarter second before the
 *  closest approach (game time) to just after it, then back to normal. Reduce motion: never slowed. */
export function passScale(gameSinceStart: number, tCpa: number, calm: boolean): number {
  if (calm) return 1;
  return gameSinceStart > tCpa - 0.3 && gameSinceStart < tCpa + 0.2 ? PASS_SLOW : 1;
}

/** Slow-motion target for a kill follow, u = 0..1 of the shot. */
export function killScale(u: number, calm: boolean): number {
  if (calm) return 1;
  return u < 0.6 ? KILL_SLOW : KILL_SLOW + (1 - KILL_SLOW) * Math.min(1, (u - 0.6) / 0.4);
}

/** Shot lengths, real seconds (shorter without slow motion). */
export const shotDuration = (event: 'pass' | 'kill', calm: boolean) => (event === 'pass' ? (calm ? 1.6 : 3.2) : (calm ? 2.0 : 2.7));

// ---------------- mission-end combat film ----------------

export interface ReelMark { t: number; type: number }
export interface ReelSegment { a: number; b: number; t: number }

/** The combat film's edit: the best moments of the recording (higher mark types first, then
 *  later ones), each from 3.5 s before to 1.8 s after, merged when they overlap, in time order.
 *  With no marks, the last 10 s. */
export function reelSegments(marks: ReelMark[], t0: number, t1: number, max = 4): ReelSegment[] {
  if (t1 - t0 < 1) return [];
  const pick = [...marks].filter((m) => m.t >= t0 && m.t <= t1).sort((x, y) => y.type - x.type || y.t - x.t);
  const segs: ReelSegment[] = [];
  for (const m of pick) {
    if (segs.length >= max) break;
    const a = Math.max(t0, m.t - 3.5), b = Math.min(t1, m.t + 1.8);
    const o = segs.find((s) => a < s.b + 0.5 && b > s.a - 0.5);
    if (o) { o.a = Math.min(o.a, a); o.b = Math.max(o.b, b); continue; }
    segs.push({ a, b, t: m.t });
  }
  if (!segs.length) segs.push({ a: Math.max(t0, t1 - 10), b: t1, t: t1 });
  return segs.sort((x, y) => x.a - y.a);
}

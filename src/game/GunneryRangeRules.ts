import { STATIONS, STATION_ORDER, type StationId } from '../world/B17Layout';

// Gunnery Range 2.0 (Phase 11 goal 35): the pure rules behind the free practice range.
// No THREE objects, no DOM: drills and free-practice set-ups, the straight passes the targets
// fly (in the bomber's frame, relative to the gun's pivot), the score, the stars, the saved
// best runs with their ghost track, and the lead tutor's coaching words.
// Runtime: game/GunneryRange.ts. Screen: ui/GunneryRangeScreen.ts.

export type TargetKind = 'drone' | 'sleeve';
export type SpeedId = 'slow' | 'medium' | 'fast';
export type RangeAngle = 30 | 60 | 90;
export type RangeDist = 300 | 500 | 700 | 900;

/** Speed of the target relative to the bomber (m/s). */
export const SPEED_MS: Record<SpeedId, number> = { slow: 45, medium: 75, fast: 110 };
export const SPEED_LABEL: Record<SpeedId, string> = { slow: 'Slow', medium: 'Medium', fast: 'Fast' };
export const ANGLE_LABEL: Record<RangeAngle, string> = { 30: 'Shallow · 30°', 60: 'Quartering · 60°', 90: 'Full deflection · 90°' };
export const KIND_LABEL: Record<TargetKind, string> = { drone: 'Target drone', sleeve: 'Towed sleeve' };
export const SPEEDS: SpeedId[] = ['slow', 'medium', 'fast'];
export const ANGLES: RangeAngle[] = [30, 60, 90];
export const DISTS: RangeDist[] = [300, 500, 700, 900];

/** One straight pass through the gun's field of fire. */
export interface PassSpec {
  kind: TargetKind;
  speed: number;     // m/s relative to the bomber
  angle: number;     // deg between the flight path and the line of sight (90 = full crossing)
  range: number;     // m from the gun at the middle of the pass
  yaw: number;       // rad: the pass centre, off the station's rest direction
  pitch: number;     // rad
  tilt: number;      // rad: 0 = a level crossing, + climbs across the sight, - dives
  dir: 1 | -1;       // which way it crosses
}

export interface Drill {
  id: string;
  station: StationId;
  key: string;       // 'steady' | 'crossers' | 'sleeve' | 'long' | 'free'
  title: string;
  text: string;
  passes: PassSpec[];
  par: number;       // a very good score (three stars at 90% of it)
}

export interface Window { spec: PassSpec; start: number; half: number }

export const LEAD_IN = 4;        // s before the first target
export const GAP = 2.5;          // s between passes
export const TAIL = 1.5;         // s after the last pass
export const SLEEVE_HP = 8;      // hits that shred a towed sleeve
export const CABLE = 230;        // m of tow cable between the tow ship and the sleeve

export const SCORE = { hit: 10, sleeveHit: 15, down: 100, speed: 60, accuracy: 200 } as const;

// ---------------------------------------------------------------- seeded random
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashId(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------------------------------------------------------------- station geometry
/** Half of the angular sweep a pass may use, and how far its centre may sit off the rest direction. */
export function stationRoom(station: StationId) {
  const st = STATIONS[station];
  const full = st.yaw[1] - st.yaw[0] >= Math.PI * 1.99;
  const yawRoom = full ? 0.9 : Math.min(-st.yaw[0], st.yaw[1]) - 0.08;
  const sweep = full ? 0.55 : Math.min(0.45, yawRoom * 0.75);
  return { sweep, yawRoom: Math.max(0, yawRoom - sweep), pitchLo: st.pitch[0] - st.rest.pitch + 0.08, pitchHi: st.pitch[1] - st.rest.pitch - 0.08 };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const MARGIN = 0.06;   // rad kept clear of the gun's stops
/** Is a point (relative to the pivot, model frame) inside the station's field of fire, with a margin? */
export function inField(station: StationId, p: V3) {
  const st = STATIONS[station];
  const yaw = Math.atan2(p.x, p.z), pitch = Math.asin(clamp(p.y / Math.max(1e-6, Math.hypot(p.x, p.y, p.z)), -1, 1));
  let dy = yaw - st.rest.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  const full = st.yaw[1] - st.yaw[0] >= Math.PI * 1.99;
  return (full || (dy >= st.yaw[0] + MARGIN && dy <= st.yaw[1] - MARGIN)) && pitch >= st.pitch[0] + MARGIN && pitch <= st.pitch[1] - MARGIN;
}

const _hp: V3 = { x: 0, y: 0, z: 0 };
function passFits(spec: PassSpec, station: StationId, T: number) {
  const { sweep } = stationRoom(station);
  const u = passAxis(spec, station, { x: 0, y: 0, z: 0 });
  for (let k = 0; k <= 8; k++) {
    const p = passPoint(spec, station, -T + (2 * T * k) / 8, _hp);
    const d = Math.hypot(p.x, p.y, p.z);
    if (d < 0.6 * spec.range || !inField(station, p)) return false;
    // turrets turn all the way round: keep the pass within a comfortable sweep of its centre
    if (Math.acos(clamp((p.x * u.x + p.y * u.y + p.z * u.z) / d, -1, 1)) > sweep + 0.2) return false;
  }
  return true;
}

export const MIN_HALF = 1.2, MAX_HALF = 7;
/** Half-duration (s) of a pass: as long as it stays in the gun's field of fire, never closer than 60% of its range. */
export function passHalf(spec: PassSpec, station: StationId) {
  if (passFits(spec, station, MAX_HALF)) return MAX_HALF;
  let lo = 0, hi = MAX_HALF;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (passFits(spec, station, m)) lo = m; else hi = m; }
  return Math.max(MIN_HALF, lo);
}

/** The drill's fixed timeline: every run of a drill sees the same targets at the same moments (ghosts line up). */
export function timeline(d: Drill): Window[] {
  let t = LEAD_IN;
  return d.passes.map((spec) => {
    const half = passHalf(spec, d.station);
    const w = { spec, start: t, half };
    t += half * 2 + GAP;
    return w;
  });
}
export function drillLength(d: Drill) {
  const w = timeline(d);
  const last = w[w.length - 1];
  return last ? last.start + last.half * 2 + TAIL : LEAD_IN + TAIL;
}

export interface V3 { x: number; y: number; z: number }

/** Unit line of sight to the pass centre, in the bomber's model frame (+Z nose, +Y up). */
export function passAxis(spec: PassSpec, station: StationId, out: V3) {
  const st = STATIONS[station];
  const yaw = st.rest.yaw + spec.yaw, pitch = st.rest.pitch + spec.pitch;
  out.x = Math.sin(yaw) * Math.cos(pitch); out.y = Math.sin(pitch); out.z = Math.cos(yaw) * Math.cos(pitch);
  return out;
}

/** Constant velocity of a pass relative to the bomber (model frame, m/s). */
export function passVelocity(spec: PassSpec, station: StationId, out: V3) {
  const u = passAxis(spec, station, out);
  const ux = u.x, uy = u.y, uz = u.z;
  // horizontal perpendicular h = up × u, then the "vertical" one k = u × h
  let hx = uz, hz = -ux;
  const hl = Math.hypot(hx, hz);
  if (hl < 1e-4) { hx = 1; hz = 0; } else { hx /= hl; hz /= hl; }
  const kx = uy * hz, ky = uz * hx - ux * hz, kz = -uy * hx;
  const c = Math.cos(spec.tilt), s = Math.sin(spec.tilt);
  const ex = hx * c + kx * s, ey = ky * s, ez = hz * c + kz * s;
  const th = spec.angle * Math.PI / 180;
  const a = Math.cos(th), b = Math.sin(th) * spec.dir;
  out.x = (-ux * a + ex * b) * spec.speed;
  out.y = (-uy * a + ey * b) * spec.speed;
  out.z = (-uz * a + ez * b) * spec.speed;
  return out;
}

const _ax: V3 = { x: 0, y: 0, z: 1 };
/** Where the target is `s` seconds from the middle of its pass, relative to the gun's pivot (model frame). */
export function passPoint(spec: PassSpec, station: StationId, s: number, out: V3) {
  const u = passAxis(spec, station, _ax);
  const cx = u.x * spec.range, cy = u.y * spec.range, cz = u.z * spec.range;
  passVelocity(spec, station, out);
  out.x = cx + out.x * s; out.y = cy + out.y * s; out.z = cz + out.z * s;
  return out;
}

// ---------------------------------------------------------------- drills
interface PassPlan { kind: TargetKind; speed: number; angle: number; range: number; climb?: number }

function buildPasses(station: StationId, seed: number, plans: PassPlan[]): PassSpec[] {
  const r = rng(seed);
  const room = stationRoom(station);
  const st = STATIONS[station];
  // the ball turret looks down and the top turret up: keep passes on the useful side of the horizon
  const pitchMid = st.type === 'turret' ? (station === 'ball' ? -0.12 : 0.12) : 0.06;
  return plans.map((p, i) => ({
    kind: p.kind, speed: p.speed, angle: p.angle, range: p.range,
    yaw: clamp((r() * 2 - 1) * room.yawRoom, -room.yawRoom, room.yawRoom),
    pitch: clamp(pitchMid + (r() * 2 - 1) * 0.1, room.pitchLo, room.pitchHi),
    tilt: (p.climb ?? 0) * (r() < 0.5 ? 1 : -1),
    dir: (i % 2 === 0 ? 1 : -1) as 1 | -1,
  }));
}

/** Expected score of a very good run: most hits land, every target goes down early. */
export function parScore(passes: PassSpec[]) {
  let p = 0;
  for (const s of passes) p += s.kind === 'sleeve' ? SLEEVE_HP * SCORE.sleeveHit + SCORE.down + SCORE.speed * 0.4 : 12 * SCORE.hit + SCORE.down + SCORE.speed * 0.4;
  return Math.round(p * 0.85 + SCORE.accuracy * 0.35);
}

export const DRILL_KEYS = ['steady', 'crossers', 'sleeve', 'long'] as const;
export type DrillKey = typeof DRILL_KEYS[number];

const DRILL_TEXT: Record<DrillKey, [string, string]> = {
  steady: ['Steady shots', 'Slow drones on shallow angles. Settle the sight and fire short bursts.'],
  crossers: ['Crossing targets', 'Fast drones crossing your sight. Lead them: aim where they will be.'],
  sleeve: ['Towed sleeve', 'A cloth sleeve towed behind a tow ship. Shred it — and lead the sleeve, not the tow ship.'],
  long: ['Long range', 'Drones at 800–900 m. Hold more lead and allow for the drop.'],
};

export function drill(station: StationId, key: DrillKey): Drill {
  const seed = hashId(`${station}:${key}`);
  const P = (kind: TargetKind, speed: SpeedId, angle: number, range: number, climb = 0): PassPlan => ({ kind, speed: SPEED_MS[speed], angle, range, climb });
  const plans: Record<DrillKey, PassPlan[]> = {
    steady: [P('drone', 'slow', 20, 450), P('drone', 'slow', 30, 420), P('drone', 'slow', 30, 480, 0.2), P('drone', 'medium', 25, 450), P('drone', 'slow', 40, 400)],
    crossers: [P('drone', 'medium', 60, 550), P('drone', 'medium', 90, 520), P('drone', 'fast', 60, 560, 0.25), P('drone', 'fast', 90, 540), P('drone', 'medium', 75, 500, 0.3), P('drone', 'fast', 90, 580)],
    sleeve: [P('sleeve', 'slow', 90, 600), P('sleeve', 'medium', 75, 580), P('sleeve', 'medium', 90, 620, 0.15), P('sleeve', 'fast', 80, 600)],
    long: [P('drone', 'slow', 45, 850), P('drone', 'medium', 50, 880), P('drone', 'slow', 60, 900, 0.2), P('drone', 'medium', 60, 820), P('drone', 'medium', 40, 900)],
  };
  const passes = buildPasses(station, seed, plans[key]);
  const [title, text] = DRILL_TEXT[key];
  return { id: `${station}-${key}`, station, key, title, text, passes, par: parScore(passes) };
}

export const drillsFor = (station: StationId) => DRILL_KEYS.map((k) => drill(station, k));

export interface FreeConfig { kind: TargetKind; speed: SpeedId; angle: RangeAngle; range: RangeDist }
export const DEFAULT_FREE: FreeConfig = { kind: 'drone', speed: 'medium', angle: 60, range: 500 };
export const FREE_PASSES = 6;

/** Free practice: six passes exactly as chosen (only the side and a little height vary). */
export function freeDrill(station: StationId, cfg: FreeConfig): Drill {
  const c = sanitizeFree(cfg);
  const id = `free-${station}-${c.kind}-${c.speed}-${c.angle}-${c.range}`;
  const plans: PassPlan[] = Array.from({ length: FREE_PASSES }, () => ({ kind: c.kind, speed: SPEED_MS[c.speed], angle: c.angle, range: c.range }));
  const passes = buildPasses(station, hashId(id), plans);
  return { id, station, key: 'free', title: 'Free practice', text: 'Your own set-up: same targets every run, so you can beat your ghost.', passes, par: parScore(passes) };
}

export function sanitizeFree(c: Partial<FreeConfig> | undefined): FreeConfig {
  const o = c ?? {};
  return {
    kind: o.kind === 'sleeve' ? 'sleeve' : 'drone',
    speed: SPEEDS.includes(o.speed as SpeedId) ? o.speed as SpeedId : DEFAULT_FREE.speed,
    angle: ANGLES.includes(o.angle as RangeAngle) ? o.angle as RangeAngle : DEFAULT_FREE.angle,
    range: DISTS.includes(o.range as RangeDist) ? o.range as RangeDist : DEFAULT_FREE.range,
  };
}

export function drillById(id: string): Drill | null {
  const m = /^(waistL|waistR|top|ball|tail)-(steady|crossers|sleeve|long)$/.exec(id);
  if (m) return drill(m[1] as StationId, m[2] as DrillKey);
  const f = /^free-(waistL|waistR|top|ball|tail)-(drone|sleeve)-(slow|medium|fast)-(\d+)-(\d+)$/.exec(id);
  if (f) {
    const cfg = sanitizeFree({ kind: f[2] as TargetKind, speed: f[3] as SpeedId, angle: Number(f[4]) as RangeAngle, range: Number(f[5]) as RangeDist });
    const d = freeDrill(f[1] as StationId, cfg);
    return d.id === id ? d : null;
  }
  return null;
}

// ---------------------------------------------------------------- score
/** Points for downing a target: more the earlier in its pass it went down. */
export function downPoints(fracOfPass: number) {
  return SCORE.down + Math.round(SCORE.speed * (1 - clamp(fracOfPass, 0, 1)));
}
export function accuracyBonus(hits: number, shots: number) {
  if (shots <= 0) return 0;
  return Math.round(SCORE.accuracy * clamp(hits / shots, 0, 1));
}
export function stars(score: number, par: number) {
  if (par <= 0) return 0;
  const k = score / par;
  return k >= 0.9 ? 3 : k >= 0.6 ? 2 : k >= 0.3 ? 1 : 0;
}

// ---------------------------------------------------------------- ghost of the best run
/** The best run's aim (bomber frame, milliradians) and running score, sampled at `hz`. */
export interface Ghost { hz: number; yaw: number[]; pitch: number[]; score: number[] }
export const GHOST_HZ = 5;
export const GHOST_MAX = 1200;   // samples (4 minutes at 5 Hz): far longer than any drill

export class GhostRecorder {
  readonly g: Ghost = { hz: GHOST_HZ, yaw: [], pitch: [], score: [] };
  /** t: drill time (s). Samples are taken on the 1/hz grid, so the ghost lines up with the timeline. */
  sample(t: number, yaw: number, pitch: number, score: number) {
    const g = this.g;
    while (g.yaw.length <= t * g.hz && g.yaw.length < GHOST_MAX) {
      g.yaw.push(Math.round(yaw * 1000)); g.pitch.push(Math.round(pitch * 1000)); g.score.push(Math.round(score));
    }
  }
}

export interface GhostSample { yaw: number; pitch: number; score: number; on: boolean }
/** Interpolated ghost at drill time t (on = false past its end). Writes into `out`. */
export function ghostAt(g: Ghost | null | undefined, t: number, out: GhostSample) {
  out.on = false;
  if (!g || g.yaw.length === 0 || t < 0) return out;
  const x = t * g.hz, i = Math.floor(x);
  if (i >= g.yaw.length - 1) {
    const j = g.yaw.length - 1;
    out.yaw = g.yaw[j] / 1000; out.pitch = g.pitch[j] / 1000; out.score = g.score[j];
    out.on = x <= j + 1e-6;
    return out;
  }
  const f = x - i;
  // shortest way round for yaw (turrets cross ±180°)
  let dy = g.yaw[i + 1] - g.yaw[i];
  if (dy > Math.PI * 1000) dy -= Math.PI * 2000; else if (dy < -Math.PI * 1000) dy += Math.PI * 2000;
  out.yaw = (g.yaw[i] + dy * f) / 1000;
  out.pitch = (g.pitch[i] + (g.pitch[i + 1] - g.pitch[i]) * f) / 1000;
  out.score = g.score[i];   // score steps, it doesn't glide
  out.on = true;
  return out;
}

// ---------------------------------------------------------------- lead tutor
export type Coach = 'on' | 'more' | 'less' | 'high' | 'low';
export const COACH_TEXT: Record<Coach, string> = { on: 'On target — fire!', more: 'More lead', less: 'Less lead', high: 'Aim lower', low: 'Aim higher' };

/**
 * Coaching word for the gap between the gun's aim and the lead point, in screen pixels:
 * `along` is measured along the target's motion (+ = the aim is ahead of the lead point),
 * `across` at right angles to it (+ = above). Inside `tol` the shot is good.
 */
export function coachLead(along: number, across: number, tol: number): Coach {
  if (Math.hypot(along, across) <= tol) return 'on';
  if (Math.abs(along) >= Math.abs(across)) return along < 0 ? 'more' : 'less';
  return across > 0 ? 'high' : 'low';
}

/** Lead in degrees between the line of sight to the target and to the lead point. */
export function leadDegrees(origin: V3, target: V3, lead: V3) {
  const ax = target.x - origin.x, ay = target.y - origin.y, az = target.z - origin.z;
  const bx = lead.x - origin.x, by = lead.y - origin.y, bz = lead.z - origin.z;
  const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz);
  if (la < 1e-6 || lb < 1e-6) return 0;
  const c = clamp((ax * bx + ay * by + az * bz) / (la * lb), -1, 1);
  return Math.acos(c) * 180 / Math.PI;
}

// ---------------------------------------------------------------- records and preferences
export const RANGE_KEY = 'sws3d.range.v1';

export interface RangeRecord { best: number; stars: number; runs: number; ghost?: Ghost }
export interface RangePrefs { station: StationId; tutor: boolean; ghost: boolean; free: FreeConfig }
export interface RangeSave { records: Record<string, RangeRecord>; prefs: RangePrefs }

export const DEFAULT_PREFS: RangePrefs = { station: 'waistL', tutor: true, ghost: true, free: DEFAULT_FREE };

function sanitizeGhost(g: unknown): Ghost | undefined {
  const o = g as Partial<Ghost> | null;
  if (!o || !Array.isArray(o.yaw) || !Array.isArray(o.pitch) || !Array.isArray(o.score)) return undefined;
  const n = Math.min(o.yaw.length, o.pitch.length, o.score.length, GHOST_MAX);
  const ok = (a: unknown[]) => a.slice(0, n).map((v) => (Number.isFinite(v) ? Math.round(v as number) : 0));
  if (n === 0) return undefined;
  return { hz: o.hz === GHOST_HZ ? GHOST_HZ : GHOST_HZ, yaw: ok(o.yaw), pitch: ok(o.pitch), score: ok(o.score) };
}

export function sanitizeSave(raw: unknown): RangeSave {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<RangeSave>;
  const records: Record<string, RangeRecord> = {};
  for (const [id, r] of Object.entries(o.records && typeof o.records === 'object' ? o.records : {})) {
    if (!drillById(id) || !r || typeof r !== 'object') continue;
    const best = Number(r.best), runs = Number(r.runs);
    if (!Number.isFinite(best) || best < 0) continue;
    const rec: RangeRecord = { best: Math.round(best), stars: clamp(Math.round(Number(r.stars) || 0), 0, 3), runs: Number.isFinite(runs) && runs > 0 ? Math.round(runs) : 1 };
    const g = sanitizeGhost(r.ghost);
    if (g) rec.ghost = g;
    records[id] = rec;
  }
  const p = (o.prefs ?? {}) as Partial<RangePrefs>;
  const prefs: RangePrefs = {
    station: STATION_ORDER.includes(p.station as StationId) ? p.station as StationId : DEFAULT_PREFS.station,
    tutor: p.tutor !== false, ghost: p.ghost !== false, free: sanitizeFree(p.free),
  };
  return { records, prefs };
}

export function loadRange(): RangeSave {
  try { return sanitizeSave(JSON.parse(localStorage.getItem(RANGE_KEY) ?? '{}')); } catch { return sanitizeSave({}); }
}
export function saveRange(s: RangeSave) {
  try { localStorage.setItem(RANGE_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

export interface RunOutcome { score: number; ghost: Ghost | null }
/** Books a finished run; a new best keeps its ghost. Returns the stars and whether it beat the old best. */
export function bookRun(save: RangeSave, d: Drill, run: RunOutcome) {
  const old = save.records[d.id];
  const st = stars(run.score, d.par);
  const newBest = !old || run.score > old.best;
  const rec: RangeRecord = newBest
    ? { best: Math.round(run.score), stars: Math.max(st, old?.stars ?? 0), runs: (old?.runs ?? 0) + 1, ...(run.ghost && run.ghost.yaw.length ? { ghost: run.ghost } : old?.ghost ? { ghost: old.ghost } : {}) }
    : { ...old, stars: Math.max(st, old.stars), runs: old.runs + 1 };
  save.records[d.id] = rec;
  return { stars: st, newBest, prevBest: old?.best ?? null, record: rec };
}

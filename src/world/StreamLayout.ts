import * as THREE from 'three';

// The thousand-bomber stream (Phase 10 goal 08): layout and motion, kept free of rendering so
// it can be unit tested. render/BomberStream.ts draws it.
//
// Frame: the formation's frame (origin = World.formationCenter, +Z = course, +Y up, +X left),
// as render/LivingSky.ts. Our own combat box (the gameplay formation) sits at the origin and is
// NOT part of the stream: every other box, the escorts and the German gaggles are.
//
// Structure of the stream (8th Air Force, 1943-44):
//   squadron  = 2-4 three-ship vics (6-12 B-17s)
//   group     = lead, high and low squadrons: a combat box of 18-36 bombers
//   wing      = lead, high and low groups, stacked and staggered (ours is the lead group of wing 0)
//   column    = wings in trail, ~4 km apart; a second bomb-division column flies off to the left
//
// Every aircraft is one record of REC_TEXELS vec4 texels (a float data texture on the GPU), and
// its position is a closed-form function of time, mirrored exactly in STREAM_GLSL below: the
// vertex shaders place the aircraft, their contrails and their falls without any per-frame CPU
// work. The JS functions here are the same maths for the few things the CPU needs (LOD bands,
// flak aim points, where a loss starts, glows).

export const KIND_BOMBER = 0, KIND_ESCORT = 1, KIND_GAGGLE = 2;
export const REC_TEXELS = 4;
export const REC_FLOATS = REC_TEXELS * 4;
export const LOSS_TEXELS = 2;
export const NOT_LOST = 1e9;

// Drawn size of the stream aircraft (model scale), like the enlarged gameplay aircraft: at
// 2-5 km a life-size B-17 is a few pixels; the box spacing grows with it (squadronSlot)
export const BOMBER_SCALE = 1.9;
export const ESCORT_SCALE = 2.4;
export const GAGGLE_SCALE = 3.0;

export type StreamTier = 'low' | 'medium' | 'high' | 'ultra';

export interface TierSpec {
  ahead: number;            // wings in our column ahead of ours
  behind: number;           // ... and behind it
  side: number;             // wings in the second (bomb division) column, off to the left
  sizes: readonly number[]; // combat box sizes to draw from (18-36)
  escorts: number;          // escort flights of four
  gaggles: number;          // Luftwaffe gaggles attacking distant boxes
  gaggleSize: readonly [number, number];
  ribbons: 1 | 2 | 4;       // contrail ribbons per bomber (4 = one per engine)
  engineLife: number;       // s of engine contrail before it merges into the field
  fieldLife: number;        // s of the spreading contrail field behind each squadron
  tile: number;             // impostor frame size (px)
  barrages: number;         // flak barrages walking through other boxes at once
  lossEvery: readonly [number, number]; // s between distant losses (min, max)
}

export const STREAM_TIERS: Record<StreamTier, TierSpec> = {
  low:    { ahead: 1, behind: 1, side: 0, sizes: [18, 18, 21],             escorts: 2, gaggles: 1, gaggleSize: [6, 8],   ribbons: 1, engineLife: 50, fieldLife: 130, tile: 64,  barrages: 1, lossEvery: [45, 90] },
  medium: { ahead: 1, behind: 3, side: 1, sizes: [18, 21, 24, 27],         escorts: 3, gaggles: 1, gaggleSize: [8, 12],  ribbons: 2, engineLife: 60, fieldLife: 200, tile: 96,  barrages: 1, lossEvery: [35, 75] },
  high:   { ahead: 2, behind: 4, side: 2, sizes: [18, 21, 24, 27, 36],     escorts: 4, gaggles: 2, gaggleSize: [9, 14],  ribbons: 4, engineLife: 70, fieldLife: 300, tile: 128, barrages: 2, lossEvery: [25, 60] },
  ultra:  { ahead: 3, behind: 7, side: 4, sizes: [21, 24, 27, 36, 36],     escorts: 6, gaggles: 3, gaggleSize: [10, 16], ribbons: 4, engineLife: 80, fieldLife: 360, tile: 128, barrages: 3, lossEvery: [20, 50] },
};
export const MAX_STREAM_BOMBERS = 1000;

// ---- formation geometry (metres, frame axes) ----
const VIC = [[0, 0, 0], [-24, -5, -20], [24, -5, -22]];
const ELEM = [[0, 0, 0], [-48, 15, -42], [48, -15, -46], [0, -30, -92]];
const WING_GAP = 4200;
// lead / high / low group of a combat wing (ours is the lead group of wing 0)
const WING_GROUPS = [[0, 0, 0], [-1500, 330, -650], [1550, -340, -1050]];
const SIDE_COLUMN = new THREE.Vector3(7400, 480, 2600);
// finger four (leader, wingman, element leader, his wingman), metres at fighter scale 1
const FINGER = [[0, 0, 0], [-16, -2, -14], [22, 1, -12], [38, -1, -26]];

export interface StreamGroup {
  index: number;
  wing: number;            // column position (0 = ours, < 0 ahead, > 0 behind)
  column: 0 | 1;           // 0 = our column, 1 = the second division
  role: 0 | 1 | 2;         // lead / high / low group of the wing
  base: THREE.Vector3;     // centre in the frame (before the meander)
  phase: number;           // meander phase
  first: number;           // first aircraft record
  count: number;
  squadrons: THREE.Vector3[]; // squadron centres relative to base (contrail field ribbons)
}

export interface StreamGaggle { index: number; first: number; count: number; target: number; side: number; period: number }

export interface StreamLayoutData {
  tier: StreamTier;
  data: Float32Array;      // REC_FLOATS per aircraft
  count: number;           // aircraft records
  bombers: number;         // records [0, bombers) are bombers
  groups: StreamGroup[];
  escortFirst: number; escortCount: number;
  gaggles: StreamGaggle[];
}

const r3 = (a: number[], k = 1) => new THREE.Vector3(a[0] * k, a[1] * k, a[2] * k);

// Squadron sizes for a combat box: 18 -> 6/6/6, 21 -> 9/6/6, 24 -> 9/9/6, 27 -> 9/9/9, 36 -> 12/12/12
export function squadronSizes(n: number): [number, number, number] {
  const v = Math.max(6, Math.round(n / 3));
  if (n % 9 === 0 || n === 18) return [v, v, v];
  const big = Math.ceil(n / 9) * 3, rest = n - big;
  const a = Math.ceil(rest / 6) * 3;
  return [big, a, rest - a];
}

// Slot of ship i in a squadron (relative to the squadron's lead), metres
export function squadronSlot(i: number, out = new THREE.Vector3()) {
  const e = ELEM[Math.floor(i / 3) % ELEM.length], v = VIC[i % 3];
  return out.set(e[0] + v[0], e[1] + v[1], e[2] + v[2]).multiplyScalar(1.6 * BOMBER_SCALE / 1.3);
}

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Lay out the stream for a quality tier. Deterministic for a seed.
export function buildStream(tier: StreamTier, seed = 1944): StreamLayoutData {
  const spec = STREAM_TIERS[tier];
  const R = rng(seed);
  const groups: StreamGroup[] = [];
  const recs: number[][] = [];
  let bombers = 0;
  const addGroup = (wing: number, column: 0 | 1, role: 0 | 1 | 2, base: THREE.Vector3) => {
    let size = spec.sizes[Math.floor(R() * spec.sizes.length)];
    size = Math.min(size, MAX_STREAM_BOMBERS - bombers);
    if (size < 6) return;
    const g: StreamGroup = { index: groups.length, wing, column, role, base, phase: R() * 100, first: recs.length, count: 0, squadrons: [] };
    const mirror = R() < 0.5 ? 1 : -1;
    // natural-metal share of the group (1944: olive drab boxes with a few silver replacements, some all-silver)
    const silver = [0.08, 0.25, 0.6][Math.floor(R() * 3)];
    const sq = squadronSizes(size);
    const centres = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-mirror * 270, 100, -130), new THREE.Vector3(mirror * 270, -100, -210)];
    for (let s = 0; s < 3; s++) {
      g.squadrons.push(centres[s].clone().add(new THREE.Vector3(0, 0, -60)));
      for (let i = 0; i < sq[s]; i++) {
        const slot = squadronSlot(i).add(centres[s]);
        recs.push([
          base.x, base.y, base.z, g.phase,
          slot.x, slot.y, slot.z, R() * Math.PI * 2,
          KIND_BOMBER, BOMBER_SCALE, R() < silver ? 1 : 0, g.index,
          0, 0, 0, 0,
        ]);
        g.count++;
      }
    }
    bombers += g.count;
    groups.push(g);
  };
  // our column: wings in trail with a slow snake; wing 0 is ours (its lead group is the gameplay box)
  for (let w = -spec.ahead; w <= spec.behind; w++) {
    const c = new THREE.Vector3(
      w === 0 ? 0 : 650 * Math.sin(w * 0.55 + 1.1) + (R() - 0.5) * 300,
      w === 0 ? 0 : 110 * Math.sin(w * 1.3) + (R() - 0.5) * 120,
      -w * WING_GAP + (w === 0 ? 0 : (R() - 0.5) * 500));
    for (let role = 0 as 0 | 1 | 2; role < 3; role = (role + 1) as 0 | 1 | 2) {
      if (w === 0 && role === 0) continue;   // the gameplay formation
      addGroup(w, 0, role, c.clone().add(r3(WING_GROUPS[role])));
    }
  }
  // the second bomb division, off to the left and a little higher
  for (let k = 0; k < spec.side; k++) {
    const w = k - Math.floor(spec.side / 3);
    const c = SIDE_COLUMN.clone().add(new THREE.Vector3(500 * Math.sin(k * 0.8), 90 * Math.sin(k * 1.7), -w * (WING_GAP + 300)));
    for (let role = 0 as 0 | 1 | 2; role < 3; role = (role + 1) as 0 | 1 | 2) addGroup(w, 1, role, c.clone().add(r3(WING_GROUPS[role], 0.85)));
  }

  // escorts: flights of four weaving above the stream (P-51s natural metal, P-47s olive drab)
  const escortFirst = recs.length;
  for (let f = 0; f < spec.escorts; f++) {
    const side = f % 2 === 0 ? 1 : -1;
    const base = new THREE.Vector3(side * (500 + R() * 2400), 950 + R() * 500, 7000 - (f + 0.5) * (16000 / spec.escorts) + (R() - 0.5) * 1500);
    const ax = 500 + R() * 400, w = (55 + R() * 30) / ax, ph = R() * Math.PI * 2;
    const p47 = R() < 0.4 ? 1 : 0;
    for (let i = 0; i < 4; i++) {
      const s = FINGER[i];
      recs.push([
        base.x, base.y, base.z, ph,
        s[0] * side * ESCORT_SCALE, s[1] * ESCORT_SCALE, s[2] * ESCORT_SCALE, R(),
        KIND_ESCORT, ESCORT_SCALE * (p47 ? 1.12 : 1), p47, f,
        ax, 40 + R() * 50, 150 + R() * 150, w,
      ]);
    }
  }
  const escortCount = recs.length - escortFirst;

  // gaggles: Fw 190s making head-on passes through distant boxes
  const gaggles: StreamGaggle[] = [];
  const far = groups.filter((g) => g.base.length() > 3500);
  for (let k = 0; k < spec.gaggles && far.length; k++) {
    const target = far[Math.floor(R() * far.length)].index;
    const n = spec.gaggleSize[0] + Math.floor(R() * (spec.gaggleSize[1] - spec.gaggleSize[0] + 1));
    const gg: StreamGaggle = { index: k, first: recs.length, count: n, target, side: R() < 0.5 ? 1 : -1, period: 70 + R() * 25 };
    const u0 = R();
    for (let i = 0; i < n; i++) recs.push(gaggleRecord(groups[target], gg, u0, i, R));
    gaggles.push(gg);
  }

  const data = new Float32Array(recs.length * REC_FLOATS);
  recs.forEach((r, i) => data.set(r, i * REC_FLOATS));
  return { tier, data, count: recs.length, bombers, groups, escortFirst, escortCount, gaggles };
}

// One gaggle fighter's record (also used to re-target a gaggle at run time)
export function gaggleRecord(g: StreamGroup, gg: StreamGaggle, u0: number, i: number, R: () => number): number[] {
  // loose line abreast with a few stragglers: lateral, vertical and along-path scatter
  const lane = (i - (gg.count - 1) / 2) * 70;
  return [
    g.base.x, g.base.y, g.base.z, g.phase,
    lane + (R() - 0.5) * 60, (R() - 0.5) * 90, (R() - 0.5) * 160, (R() - 0.5) * 0.05 + (i % 3) * 0.012,
    KIND_GAGGLE, GAGGLE_SCALE, R() < 0.3 ? 1 : 0, gg.index,
    gg.side, gg.period, u0, 1900 + R() * 300,
  ];
}

// ---------------- motion (JS; mirrored in STREAM_GLSL) ----------------

// Slow wander of a whole box around its station (metres)
export function groupMeander(phase: number, t: number, out = new THREE.Vector3()) {
  return out.set(150 * Math.sin(0.0071 * t + phase), 35 * Math.sin(0.0113 * t + 1.3 * phase), 220 * Math.sin(0.0053 * t + 0.7 * phase));
}

// Centre of a group at time t (frame)
export function groupCentre(g: StreamGroup, t: number, out = new THREE.Vector3()) {
  return groupMeander(g.phase, t, out).add(g.base);
}

export interface Pose { p: THREE.Vector3; yaw: number; pitch: number; roll: number }
export const newPose = (): Pose => ({ p: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0 });

const _m = new THREE.Vector3();

export function bomberPose(d: Float32Array, i: number, t: number, V: number, out: Pose): Pose {
  const o = i * REC_FLOATS, gp = d[o + 3], ph = d[o + 7];
  groupMeander(gp, t, _m);
  out.p.set(
    d[o] + _m.x + d[o + 4] + 2.5 * Math.sin(0.31 * t + ph),
    d[o + 1] + _m.y + d[o + 5] + 1.6 * Math.sin(0.47 * t + ph) + 0.25 * Math.sin(1.3 * t + 2 * ph),
    d[o + 2] + _m.z + d[o + 6] + 3 * Math.sin(0.23 * t + ph));
  const lat = 150 * 0.0071 * Math.cos(0.0071 * t + gp) + 0.775 * Math.cos(0.31 * t + ph);
  out.yaw = lat / V;
  out.pitch = 0.008 * Math.sin(0.4 * t + ph);
  out.roll = 0.035 * Math.cos(0.31 * t + ph) + 0.012 * Math.sin(0.5 * t + ph);
  return out;
}

export function escortPos(d: Float32Array, i: number, t: number, V: number, top: number, out = new THREE.Vector3()) {
  const o = i * REC_FLOATS, ph = d[o + 3], ax = d[o + 12], ay = d[o + 13], az = d[o + 14], w = d[o + 15];
  const cy = Math.min(d[o + 1], top) + ay * Math.sin(0.5 * w * t + ph * 1.7);
  const cx = d[o] + ax * Math.sin(w * t + ph), cz = d[o + 2] + az * Math.sin(2 * w * t + ph);
  const vx = ax * w * Math.cos(w * t + ph), vz = V + 2 * az * w * Math.cos(2 * w * t + ph);
  const yaw = Math.atan2(vx, vz), c = Math.cos(yaw), s = Math.sin(yaw);
  const sx = d[o + 4], sy = d[o + 5], sz = d[o + 6];
  return out.set(cx + sx * c + sz * s, cy + sy, cz - sx * s + sz * c);
}

// Head-on passes: ahead and above the target box, through it, out behind and below, then a
// wide swing on one side back up ahead. The attack half takes 30 % of the cycle.
export function gaggleTheta(u: number) { return u < 0.3 ? Math.PI * u / 0.3 : Math.PI + Math.PI * (u - 0.3) / 0.7; }
export function gagglePos(d: Float32Array, i: number, t: number, out = new THREE.Vector3()) {
  const o = i * REC_FLOATS;
  groupMeander(d[o + 3], t, _m);
  const side = d[o + 12], T = d[o + 13], u0 = d[o + 14], rz = d[o + 15];
  const u = fract(t / T + u0 + d[o + 7]);
  const th = gaggleTheta(u), c = Math.cos(th), s = Math.sin(th);
  return out.set(
    d[o] + _m.x + side * (90 + 1700 * Math.max(0, -s)) + d[o + 4],
    d[o + 1] + _m.y + 380 * c + d[o + 5],
    d[o + 2] + _m.z + rz * c + d[o + 6]);
}
// Cycle position of a gaggle fighter (0..1): attacking while 0.12 < u < 0.27
export function gaggleU(d: Float32Array, i: number, t: number) { const o = i * REC_FLOATS; return fract(t / d[o + 13] + d[o + 14] + d[o + 7]); }

export function fighterPos(d: Float32Array, i: number, t: number, V: number, top: number, out = new THREE.Vector3()) {
  return d[i * REC_FLOATS + 8] === KIND_ESCORT ? escortPos(d, i, t, V, top, out) : gagglePos(d, i, t, out);
}

// Any aircraft's position at t (not counting a loss)
export function aircraftPos(d: Float32Array, i: number, t: number, V: number, top: number, out = new THREE.Vector3()) {
  if (d[i * REC_FLOATS + 8] !== KIND_BOMBER) return fighterPos(d, i, t, V, top, out);
  bomberPose(d, i, t, V, _pose);
  return out.copy(_pose.p);
}
const _pose = newPose();

// A loss: the path away from where it was hit (frame, relative to that point). kind 0 = a
// slow burning spiral, 1 = a steep dive, 2 = blown up (gone in a flash). The aircraft keeps
// flying through the air for a while, so in the formation's frame it falls back.
export const LOSS_SPIRAL = 0, LOSS_DIVE = 1, LOSS_BLAST = 2;
export function lossPath(s: number, seed: number, kind: number, V: number, out = new THREE.Vector3()) {
  const kd = 0.06;
  const lag = V * (1 - Math.exp(-kd * s)) / kd - V * s;
  const vt = kind === LOSS_DIVE ? 105 : 62;
  const fall = vt * s - (vt * vt / 9.81) * (1 - Math.exp(-9.81 * s / vt));
  const w = 0.45 + 0.35 * fract(seed * 7.13);
  const r = Math.min(kind === LOSS_DIVE ? 25 : 85, (kind === LOSS_DIVE ? 2.5 : 5.5) * s);
  const a = s * w + seed;
  return out.set(r * Math.sin(a) - r * Math.sin(seed), -fall, lag + (r * Math.cos(a) - r * Math.cos(seed)) * 0.6);
}

export function fract(x: number) { return x - Math.floor(x); }

// ---------------- GLSL mirror ----------------
// Needs: uniform highp sampler2D tStreamData, tStreamLoss; uniform float uSpeed, uEscortTop.
export const STREAM_GLSL = /* glsl */ `
uniform highp sampler2D tStreamData;
uniform highp sampler2D tStreamLoss;
uniform float uSpeed;
uniform float uEscortTop;
vec4 sRec(int id, int f) { return texelFetch(tStreamData, ivec2(f, id), 0); }
vec4 sLoss(int id, int f) { return texelFetch(tStreamLoss, ivec2(f, id), 0); }
vec3 sMeander(float ph, float t) {
  return vec3(150.0 * sin(0.0071 * t + ph), 35.0 * sin(0.0113 * t + 1.3 * ph), 220.0 * sin(0.0053 * t + 0.7 * ph));
}
// rotation: yaw about +Y, then pitch (nose up +), then roll about the nose (three.js Euler YXZ)
mat3 sBasis(float yaw, float pitch, float roll) {
  float cy = cos(yaw), sy = sin(yaw), cp = cos(-pitch), sp = sin(-pitch), cr = cos(roll), sr = sin(roll);
  mat3 Ry = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  mat3 Rx = mat3(1.0, 0.0, 0.0, 0.0, cp, sp, 0.0, -sp, cp);
  mat3 Rz = mat3(cr, sr, 0.0, -sr, cr, 0.0, 0.0, 0.0, 1.0);
  return Ry * Rx * Rz;
}
vec3 sBomberPos(int id, float t, out vec3 ang) {
  vec4 a0 = sRec(id, 0), a1 = sRec(id, 1);
  float gp = a0.w, ph = a1.w;
  vec3 p = a0.xyz + sMeander(gp, t) + a1.xyz + vec3(2.5 * sin(0.31 * t + ph), 1.6 * sin(0.47 * t + ph) + 0.25 * sin(1.3 * t + 2.0 * ph), 3.0 * sin(0.23 * t + ph));
  float lat = 150.0 * 0.0071 * cos(0.0071 * t + gp) + 0.775 * cos(0.31 * t + ph);
  ang = vec3(lat / uSpeed, 0.008 * sin(0.4 * t + ph), 0.035 * cos(0.31 * t + ph) + 0.012 * sin(0.5 * t + ph));
  return p;
}
vec3 sEscortPos(int id, float t) {
  vec4 a0 = sRec(id, 0), a1 = sRec(id, 1), a3 = sRec(id, 3);
  float ph = a0.w, w = a3.w;
  float cy = min(a0.y, uEscortTop) + a3.y * sin(0.5 * w * t + ph * 1.7);
  float cx = a0.x + a3.x * sin(w * t + ph), cz = a0.z + a3.z * sin(2.0 * w * t + ph);
  float vx = a3.x * w * cos(w * t + ph), vz = uSpeed + 2.0 * a3.z * w * cos(2.0 * w * t + ph);
  float yaw = atan(vx, vz), c = cos(yaw), s = sin(yaw);
  return vec3(cx + a1.x * c + a1.z * s, cy + a1.y, cz - a1.x * s + a1.z * c);
}
float sGaggleTheta(float u) { return u < 0.3 ? 3.14159265 * u / 0.3 : 3.14159265 + 3.14159265 * (u - 0.3) / 0.7; }
vec3 sGagglePos(int id, float t) {
  vec4 a0 = sRec(id, 0), a1 = sRec(id, 1), a3 = sRec(id, 3);
  vec3 m = sMeander(a0.w, t);
  float u = fract(t / a3.y + a3.z + a1.w);
  float th = sGaggleTheta(u), c = cos(th), s = sin(th);
  return a0.xyz + m + vec3(a3.x * (90.0 + 1700.0 * max(0.0, -s)), 380.0 * c, a3.w * c) + a1.xyz;
}
vec3 sFighterPos(int id, float t) { return sRec(id, 2).x < 1.5 ? sEscortPos(id, t) : sGagglePos(id, t); }
vec3 sLossPath(float s, float seed, float kind) {
  float kd = 0.06;
  float lag = uSpeed * (1.0 - exp(-kd * s)) / kd - uSpeed * s;
  float vt = abs(kind - 1.0) < 0.5 ? 105.0 : 62.0;
  float fall = vt * s - (vt * vt / 9.81) * (1.0 - exp(-9.81 * s / vt));
  float w = 0.45 + 0.35 * fract(seed * 7.13);
  float r = min(abs(kind - 1.0) < 0.5 ? 25.0 : 85.0, (abs(kind - 1.0) < 0.5 ? 2.5 : 5.5) * s);
  float a = s * w + seed;
  return vec3(r * sin(a) - r * sin(seed), -fall, lag + (r * cos(a) - r * cos(seed)) * 0.6);
}
// Pose of aircraft id at t, a loss included. vis 0 = not drawn; fire 0..1 = burning.
void sPose(int id, float t, out vec3 P, out mat3 B, out float vis, out float fire) {
  vec4 L0 = sLoss(id, 0), L1 = sLoss(id, 1);
  float kind = sRec(id, 2).x;
  vis = 1.0; fire = 0.0;
  if (t >= L0.w) {
    float s = t - L0.w;
    P = L0.xyz + sLossPath(s, L1.y, L1.z);
    float spinW = 0.45 + 0.35 * fract(L1.y * 7.13);
    float dive = abs(L1.z - 1.0) < 0.5 ? 1.25 : 0.75;
    B = sBasis(L1.x + s * spinW * 0.9, -min(dive, 0.05 * s), min(1.1, 0.07 * s) * (fract(L1.y) < 0.5 ? -1.0 : 1.0));
    vis = (L1.z > 1.5 ? step(s, 0.12) : step(s, 95.0));
    fire = 1.0;
    return;
  }
  if (kind < 0.5) {
    vec3 ang;
    P = sBomberPos(id, t, ang);
    B = sBasis(ang.x, ang.y, ang.z);
    return;
  }
  // fighters: heading, climb and bank from the path itself
  P = sFighterPos(id, t);
  vec3 pa = sFighterPos(id, t - 0.25), pb = sFighterPos(id, t + 0.25);
  vec3 v1 = (P - pa) * 4.0 + vec3(0.0, 0.0, uSpeed), v2 = (pb - P) * 4.0 + vec3(0.0, 0.0, uSpeed);
  float y1 = atan(v1.x, v1.z), y2 = atan(v2.x, v2.z);
  float dy = y2 - y1; dy -= 6.2831853 * floor((dy + 3.14159265) / 6.2831853);
  vec3 v = v1 + v2;
  float spd = length(v) * 0.5;
  B = sBasis(atan(v.x, v.z), atan(v.y, length(v.xz)), clamp(-atan(dy * 4.0 * spd / 9.81), -1.35, 1.35));
}
`;

import { HeroB17Controls } from './HeroB17';
import { weatherNow } from '../render/WeatherState';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hazed, vcolored } from './Countryside';
import { skyGround } from '../render/Sky';
import { mulberry } from '../render/Particles';

// The 401st Bomb Group's base at Deenethorpe (USAAF Station 128) for the mission bookends
// (Bookends.ts, Phase 5 goal 23): take-off at dawn and the landing after a successful raid.
// A flat English landscape seen from 1-500 m: a Class A airfield (three concrete runways in an
// "A", the perimeter track, pan hardstands, the watch office with its balcony, the runway
// controller's chequered caravan, two T2 hangars, Nissen huts, a windsock), then fields with
// hedgerows, woods, lanes and a stone village, hazed out to a procedural patchwork.
//
// Shares the low-level look of Countryside.ts (its haze patch and vertex-colour helper) but has
// its own layout and an English palette (greener, larger arable fields, fewer hedges).
// Everything is one group in "map" coordinates (x east, z north, metres from the field centre),
// placed in the scene by Bookends and detached when no bookend is playing, so it costs nothing
// during the mission. The ground is flat (y = 0); the concrete sits at SURFACE_Y.
//
// Airfield frame (a, b): a along the main runway (05, take-off toward +a), b to its left.
// afToLocal() maps it to the group's local coordinates.

const H = 3600;                        // painted map half size (m)
const FAR = 30000;                     // ground mesh half size (m)
export const SURFACE_Y = 0.1;          // runway / track surface height (wheels rest here)
export const RWY_HEADING = (50 * Math.PI) / 180;   // runway 05: take-off toward the north-east
const D = new THREE.Vector2(Math.sin(RWY_HEADING), Math.cos(RWY_HEADING));   // (x, z) along +a
const L = new THREE.Vector2(D.y, -D.x);                                        // (x, z) along +b (left)
export const RWY_YAW = Math.atan2(D.x, D.y);    // rotation.y that points an object's +z down the runway
export const RWY = { half: 960, width: 46, threshold: -915 };
export const TOWER = { a: -640, b: 392 };   // the watch office, facing the runway (-b)

export function afToLocal(a: number, b: number, out: THREE.Vector3, y = 0) {
  return out.set(a * D.x + b * L.x, y, a * D.y + b * L.y);
}
export function localToAf(x: number, z: number, out: THREE.Vector2) {
  return out.set(x * D.x + z * D.y, x * L.x + z * L.y);
}
/** Heading (rotation.y) of an airfield-frame direction (da, db). */
export function afYaw(da: number, db: number) {
  return Math.atan2(da * D.x + db * L.x, da * D.y + db * L.y);
}
const _v3 = new THREE.Vector3();
const af2 = (a: number, b: number): [number, number] => { afToLocal(a, b, _v3); return [_v3.x, _v3.z]; };

// ---------------- polylines ----------------

/** A polyline in local (x, z) with arc length; at() interpolates position and direction. */
export class Line {
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly s: Float32Array;
  readonly length: number;
  constructor(pts: [number, number][]) {
    const n = pts.length;
    this.x = new Float32Array(n); this.z = new Float32Array(n); this.s = new Float32Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      this.x[i] = pts[i][0]; this.z[i] = pts[i][1];
      if (i) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      this.s[i] = acc;
    }
    this.length = acc;
  }
  get count() { return this.x.length; }
  at(s: number, out: THREE.Vector2, dir?: THREE.Vector2): THREE.Vector2 {
    const S = this.s, n = S.length;
    s = Math.min(Math.max(s, 0), this.length);
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    const t = S[hi] > S[lo] ? (s - S[lo]) / (S[hi] - S[lo]) : 0;
    out.set(this.x[lo] + (this.x[hi] - this.x[lo]) * t, this.z[lo] + (this.z[hi] - this.z[lo]) * t);
    if (dir) dir.set(this.x[hi] - this.x[lo], this.z[hi] - this.z[lo]).normalize();
    return out;
  }
  nearest(x: number, z: number): number {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.x.length; i++) { const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    return this.s[best];
  }
}

// Closed Catmull-Rom loop through airfield-frame points, sampled every `step` m (local x, z)
function loop(ctrl: [number, number][], step: number): [number, number][] {
  const c = new THREE.CatmullRomCurve3(ctrl.map(([a, b]) => afToLocal(a, b, new THREE.Vector3())), true, 'centripetal');
  const n = Math.ceil(c.getLength() / step);
  return c.getSpacedPoints(n).slice(0, n).map((p) => [p.x, p.z]);
}

// ---------------- layout ----------------

// Runways (airfield frame): the main one along a, two secondaries crossing it in an "X"
const RUNWAYS: [number, number, number, number][] = [
  [-RWY.half, 0, RWY.half, 0],
  [-700, -560, 150, 330],
  [700, -560, -150, 330],
];
// Perimeter track through these points (closed)
const TRACK_CTRL: [number, number][] = [
  [-1000, 0], [-940, -300], [-760, -640], [-300, -705], [0, -690], [300, -705], [760, -640], [940, -300],
  [1000, 0], [900, 200], [500, 400], [150, 425], [-150, 425], [-500, 400], [-900, 200],
];
export const TRACK = new Line(loop(TRACK_CTRL, 8));
// Stubs from the secondary runway ends to the track
const STUBS: [number, number, number, number][] = [[-700, -560, -770, -640], [700, -560, 770, -640], [150, 330, 150, 425], [-150, 330, -150, 425]];

// The departure route for runway 05: along the track from the north-west dispersals to the
// threshold, a turn onto the centreline, then the runway and the climb-out beyond it
export const DEPART: Line = (() => {
  const start = TRACK.nearest(...af2(-300, 412));
  const end = TRACK.nearest(...af2(-975, 80));
  const pts: [number, number][] = [];
  for (let s = start; s <= end; s += 8) { const p = TRACK.at(s, new THREE.Vector2()); pts.push([p.x, p.y]); }
  for (const [a, b] of [[-985, 40], [-975, 10], [-950, 0], [-925, 0]] as [number, number][]) pts.push(af2(a, b));
  for (let a = -900; a <= 6000; a += 50) pts.push(af2(a, 0));
  return new Line(pts);
})();
/** Arc length on DEPART where a ship is lined up on runway 05 (threshold). */
export const LINEUP_S = DEPART.nearest(...af2(-925, 0));
/** Arc length on DEPART of the hold short point. */
export const HOLD_S = LINEUP_S - 55;

export interface Stand { x: number; z: number; yaw: number }

// Point in polygon (local x, z)
function inside(px: number, pz: number, xs: Float32Array, zs: Float32Array) {
  let c = false;
  for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) {
    if ((zs[i] > pz) !== (zs[j] > pz) && px < ((xs[j] - xs[i]) * (pz - zs[i])) / (zs[j] - zs[i]) + xs[i]) c = !c;
  }
  return c;
}

// ---------------- textures ----------------

function concreteTexture(): THREE.CanvasTexture {
  const W = 256, Hh = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = Hh;
  const g = c.getContext('2d')!;
  const rnd = mulberry(128);
  g.fillStyle = '#9b988f'; g.fillRect(0, 0, W, Hh);
  // slabs: 4 lanes x 8 bays, each a slightly different tone
  for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) {
    const k = 0.9 + rnd() * 0.16;
    g.fillStyle = `rgb(${Math.round(156 * k)},${Math.round(153 * k)},${Math.round(144 * k)})`;
    g.fillRect(i * 64, j * 64, 64, 64);
  }
  // grit and stains
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(60,58,52,0.12)' : 'rgba(200,198,190,0.12)';
    g.fillRect(rnd() * W, rnd() * Hh, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  for (let i = 0; i < 14; i++) {
    const x = rnd() * W, y = rnd() * Hh, r = 6 + rnd() * 18;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(40,36,30,0.28)'); grd.addColorStop(1, 'rgba(40,36,30,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // tar-filled expansion joints
  g.fillStyle = 'rgba(38,36,32,0.75)';
  for (let i = 1; i < 4; i++) g.fillRect(i * 64 - 1, 0, 2, Hh);
  for (let j = 0; j < 8; j++) g.fillRect(0, j * 64, W, 2);
  // rubber from the tyres down the middle
  for (let i = 0; i < 70; i++) {
    const x = W / 2 + (rnd() - 0.5) * W * 0.55;
    g.fillStyle = `rgba(30,28,26,${0.05 + rnd() * 0.08})`;
    g.fillRect(x, rnd() * Hh, 2 + rnd() * 5, 30 + rnd() * 160);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function checkerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#141414' : '#e9e6dc'; g.fillRect(i * 16, j * 16, 16, 16); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

// ---------------- ground shader ----------------

const GROUND_FRAG_HEAD = /* glsl */ `
uniform sampler2D uAbMap;
uniform float uAbHalf;
varying vec3 vMap;
float abH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float abN(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  return mix(mix(abH(i), abH(i + vec2(1.0, 0.0)), w.x), mix(abH(i + vec2(0.0, 1.0)), abH(i + vec2(1.0, 1.0)), w.x), w.y);
}
// English patchwork beyond the painted map: big arable fields, pasture, dark woods
vec3 abFar(vec2 p) {
  vec2 q = p / 1000.0;
  vec2 warp = vec2(abN(q * 0.8), abN(q * 0.8 + 5.1)) * 0.5;
  vec2 cell = floor(q * vec2(3.4, 4.1) + warp);
  float c = abH(cell);
  vec3 col = c < 0.2 ? vec3(0.74, 0.65, 0.38) : c < 0.5 ? vec3(0.4, 0.55, 0.26) : c < 0.66 ? vec3(0.33, 0.47, 0.22)
    : c < 0.82 ? vec3(0.46, 0.37, 0.27) : vec3(0.68, 0.64, 0.44);
  col *= 0.9 + 0.2 * abH(cell + 2.7);
  float wood = smoothstep(0.64, 0.7, abN(q * 0.5 + 3.0) * 0.6 + abN(q * 1.9) * 0.4);
  return mix(col, vec3(0.18, 0.26, 0.14), wood);
}
`;

const GROUND_FRAG = /* glsl */ `
{
  vec2 mp = vMap.xz;
  float edge = max(abs(mp.x), abs(mp.y));
  vec2 muv = mp / (2.0 * uAbHalf) + 0.5;
  vec2 gx = dFdx(muv), gy = dFdy(muv);
  vec3 alb;
  if (edge < uAbHalf - 600.0) alb = textureGrad(uAbMap, muv, gx, gy).rgb;
  else if (edge < uAbHalf) alb = mix(textureGrad(uAbMap, muv, gx, gy).rgb, abFar(mp), smoothstep(uAbHalf - 600.0, uAbHalf, edge));
  else alb = abFar(mp);
  float fw = length(fwidth(mp));
  float n0 = (abN(mp / 0.7) - 0.5) * (1.0 - smoothstep(0.15, 0.8, fw));
  float n1 = (abN(mp / 2.7) - 0.5) * (1.0 - smoothstep(0.6, 3.0, fw));
  float n2 = (abN(mp / 9.0) - 0.5) * (1.0 - smoothstep(2.0, 10.0, fw));
  float n3 = (abN(mp / 41.0) - 0.5) * (1.0 - smoothstep(8.0, 45.0, fw));
  float n4 = (abN(mp / 190.0) - 0.5);
  alb *= 1.0 + n0 * 0.3 + n1 * 0.3 + n2 * 0.32 + n3 * 0.28 + n4 * 0.2;
  diffuseColor.rgb *= alb;
}
`;

// ---------------- the painted map ----------------

type RGB = [number, number, number];
const CROPS: { c: RGB; w: number }[] = [
  { c: [198, 172, 98], w: 0.2 },    // wheat
  { c: [212, 192, 120], w: 0.1 },   // barley
  { c: [104, 142, 66], w: 0.2 },    // pasture
  { c: [92, 130, 58], w: 0.12 },    // meadow
  { c: [72, 106, 50], w: 0.1 },     // sugar beet
  { c: [120, 94, 68], w: 0.12 },    // ploughed
  { c: [98, 80, 60], w: 0.05 },     // dark earth
  { c: [180, 170, 114], w: 0.06 },  // hay
  { c: [132, 138, 82], w: 0.05 },   // fallow
];
const GRASS: RGB = [110, 146, 70];
const CONCRETE: RGB = [150, 148, 138];

export interface TreeSpot { x: number; z: number; h: number; tint: number }
export interface HouseSpot { x: number; z: number; ang: number; w: number; d: number; h: number; wall: number; roof: number }

interface Painted { canvas: HTMLCanvasElement; trees: TreeSpot[]; houses: HouseSpot[] }

// Village (Deenethorpe) and lanes, airfield frame
const VILLAGE = { a: -1650, b: 1150 };
const LANES: [number, number][][] = [
  [[-4200, 1500], [-2600, 1300], [-1650, 1150], [-900, 1250], [200, 1400], [1600, 1250], [4200, 1700]],
  [[-1650, 1150], [-1800, 300], [-1700, -900], [-1400, -2200], [-1300, -4200]],
  [[200, 1400], [400, 2600], [300, 4200]],
  [[1600, 1250], [1700, 0], [1500, -1500], [1900, -4200]],
];

function paintMap(S: number, treeBudget: number, rwyCorners: [number, number][][], trackX: Float32Array, trackZ: Float32Array): Painted {
  const rnd = mulberry(401);
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const px = (u: number) => ((u + H) / (2 * H)) * S;
  const k = S / (2 * H);
  const rgb = (c: RGB, j = 0) => `rgb(${Math.round(c[0] * (1 + j))},${Math.round(c[1] * (1 + j))},${Math.round(c[2] * (1 + j))})`;
  const pick = () => { let r = rnd(); for (const c of CROPS) { r -= c.w; if (r <= 0) return c.c; } return CROPS[0].c; };
  const trees: TreeSpot[] = [], houses: HouseSpot[] = [];
  const _a = new THREE.Vector2();
  // trees stay off the airfield, the runway approaches, the village plots and the lanes
  const laneLines = LANES.map((l) => new Line(l.map(([a, b]) => af2(a, b))));
  const nearLane = (x: number, z: number, r: number) => {
    for (const ln of laneLines) for (let i = 0; i < ln.count; i++) {
      if (i === 0) continue;
      const ax = ln.x[i - 1], az = ln.z[i - 1], bx = ln.x[i], bz = ln.z[i];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if ((ax + dx * t - x) ** 2 + (az + dz * t - z) ** 2 < r * r) return true;
    }
    return false;
  };
  const free = (x: number, z: number, r: number) => {
    localToAf(x, z, _a);
    const a = _a.x, b = _a.y;
    if (Math.abs(b) < 170 && Math.abs(a) < 3000) return false;                         // runway 05/23 approaches
    if (a > -1250 && a < 1250 && b > -950 && b < 900) return false;                     // the airfield
    if (Math.hypot(a - VILLAGE.a, b - VILLAGE.b) < 260) return false;
    if (Math.max(Math.abs(x), Math.abs(z)) > H - 40) return false;
    return !nearLane(x, z, r + 6);
  };
  const addTree = (x: number, z: number, big = 1) => trees.push({ x, z, h: (10 + rnd() * 8) * big, tint: rnd() });

  g.fillStyle = rgb(CROPS[2].c);
  g.fillRect(0, 0, S, S);
  // fields: tiles of rotated, jittered grids (bigger fields than the Normandy bocage)
  const T = 1400;
  const hedges: [number, number, number, number][] = [];
  for (let tx = -H; tx < H; tx += T) for (let tz = -H; tz < H; tz += T) {
    const th = (rnd() - 0.5) * 0.7, c = Math.cos(th), s = Math.sin(th);
    const cw = 200 + rnd() * 170, ch = 160 + rnd() * 150;
    const cx = tx + T / 2, cz = tz + T / 2;
    const na = Math.ceil((1.5 * T) / cw) + 1, nb = Math.ceil((1.5 * T) / ch) + 1;
    const gu: number[][] = [], gv: number[][] = [];
    for (let i = 0; i <= na; i++) {
      gu.push([]); gv.push([]);
      for (let j = 0; j <= nb; j++) {
        const a = (i - na / 2) * cw + (rnd() - 0.5) * 0.35 * cw, b = (j - nb / 2) * ch + (rnd() - 0.5) * 0.35 * ch;
        gu[i].push(cx + a * c - b * s); gv[i].push(cz + a * s + b * c);
      }
    }
    g.save();
    g.beginPath(); g.rect(px(tx), px(tz), T * k + 1, T * k + 1); g.clip();
    for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) {
      const qu = [gu[i][j], gu[i + 1][j], gu[i + 1][j + 1], gu[i][j + 1]], qv = [gv[i][j], gv[i + 1][j], gv[i + 1][j + 1], gv[i][j + 1]];
      const mu = (qu[0] + qu[2]) / 2, mv = (qv[0] + qv[2]) / 2;
      if (Math.abs(mu - cx) > T * 0.75 || Math.abs(mv - cz) > T * 0.75) continue;
      g.fillStyle = rgb(pick(), (rnd() - 0.5) * 0.1);
      g.beginPath();
      for (let q = 0; q < 4; q++) { const x = px(qu[q]), y = px(qv[q]); if (q) g.lineTo(x, y); else g.moveTo(x, y); }
      g.closePath(); g.fill();
      for (const [a, b] of [[0, 1], [0, 3]] as const) {
        if (rnd() > 0.55) continue;
        const um = (qu[a] + qu[b]) / 2, vm = (qv[a] + qv[b]) / 2;
        if (um < tx || um > tx + T || vm < tz || vm > tz + T) continue;
        hedges.push([qu[a], qv[a], qu[b], qv[b]]);
      }
    }
    g.restore();
  }
  // hedgerows: a dark strip with a tree every so often
  g.strokeStyle = rgb([54, 74, 40]);
  g.lineWidth = Math.max(1, 4.5 * k);
  g.lineCap = 'round';
  for (const [u0, v0, u1, v1] of hedges) {
    const ma = localToAf((u0 + u1) / 2, (v0 + v1) / 2, _a);
    if (ma.x > -1250 && ma.x < 1250 && ma.y > -950 && ma.y < 900) continue;
    g.beginPath(); g.moveTo(px(u0), px(v0)); g.lineTo(px(u1), px(v1)); g.stroke();
    if (rnd() < 0.45) continue;
    const len = Math.hypot(u1 - u0, v1 - v0);
    for (let d = rnd() * 22; d < len; d += 14 + rnd() * 26) {
      const t = d / len, x = u0 + (u1 - u0) * t + (rnd() - 0.5) * 3, z = v0 + (v1 - v0) * t + (rnd() - 0.5) * 3;
      if (free(x, z, 5)) addTree(x, z, 0.9 + rnd() * 0.35);
    }
  }
  // woods
  for (let w = 0; w < 14; w++) {
    const R = 130 + rnd() * 300;
    let wx = 0, wz = 0, ok = false;
    for (let tries = 0; tries < 40 && !ok; tries++) {
      wx = (rnd() * 2 - 1) * (H - R - 150); wz = (rnd() * 2 - 1) * (H - R - 150);
      ok = free(wx, wz, R) && free(wx + R, wz, 0) && free(wx - R, wz, 0) && free(wx, wz + R, 0) && free(wx, wz - R, 0);
    }
    if (!ok) continue;
    const a1 = rnd() * 6.3, a2 = rnd() * 6.3;
    const rad = (f: number) => R * (1 + 0.2 * Math.sin(3 * f + a1) + 0.12 * Math.sin(5 * f + a2));
    g.fillStyle = rgb([50, 68, 38], (rnd() - 0.5) * 0.1);
    g.beginPath();
    for (let q = 0; q <= 48; q++) { const f = (q / 48) * Math.PI * 2, r = rad(f); const x = px(wx + Math.cos(f) * r), y = px(wz + Math.sin(f) * r); if (q) g.lineTo(x, y); else g.moveTo(x, y); }
    g.closePath(); g.fill();
    for (let d = 0; d < 2 * Math.PI * R; d += 9) { const f = d / R, r = rad(f) - 4 - rnd() * 5; const x = wx + Math.cos(f) * r, z = wz + Math.sin(f) * r; if (free(x, z, 4)) addTree(x, z, 1.05 + rnd() * 0.3); }
    for (let q = 0, n = Math.round((Math.PI * R * R) / 650); q < n; q++) { const f = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (rad(f) - 10); const x = wx + Math.cos(f) * r, z = wz + Math.sin(f) * r; if (free(x, z, 4)) addTree(x, z, 1.1 + rnd() * 0.3); }
  }
  // the airfield: mown grass inside and around the perimeter track, with mowing stripes
  const poly = (pts: [number, number][], fill: string) => {
    g.fillStyle = fill; g.beginPath();
    pts.forEach(([x, z], i) => { if (i) g.lineTo(px(x), px(z)); else g.moveTo(px(x), px(z)); });
    g.closePath(); g.fill();
  };
  poly([af2(-1250, -950), af2(1250, -950), af2(1250, 900), af2(-1250, 900)], rgb([104, 138, 66]));
  g.save();
  g.beginPath();
  for (let i = 0; i < trackX.length; i++) { const x = px(trackX[i]), y = px(trackZ[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.closePath(); g.clip();
  for (let i = -30; i < 30; i++) poly([af2(-1300, i * 40), af2(1300, i * 40), af2(1300, i * 40 + 20), af2(-1300, i * 40 + 20)], i % 2 ? rgb(GRASS, 0.05) : rgb(GRASS, -0.04));
  g.restore();
  // concrete (the meshes draw it up close; this is what the distance sees)
  for (const c of rwyCorners) poly(c, rgb(CONCRETE));
  g.strokeStyle = rgb(CONCRETE, -0.06); g.lineWidth = Math.max(1, 15 * k); g.lineJoin = 'round';
  g.beginPath();
  for (let i = 0; i <= trackX.length; i++) { const j = i % trackX.length; const x = px(trackX[j]), y = px(trackZ[j]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke();
  // technical and living sites behind the tower: worn ground and paths
  poly([af2(-700, 600), af2(650, 600), af2(650, 880), af2(-700, 880)], rgb([118, 128, 84]));
  poly([af2(-760, 430), af2(-480, 430), af2(-480, 600), af2(-760, 600)], rgb([118, 128, 84]));
  for (let q = 0; q < 40; q++) {
    const a = -680 + rnd() * 1300, b = 620 + rnd() * 240;
    if (q % 4 === 0) { const [x2, z2] = af2(-740 + rnd() * 240, 450 + rnd() * 130); g.fillStyle = rgb([124, 118, 98]); g.fillRect(px(x2) - 6 * k, px(z2) - 4 * k, 12 * k, 8 * k); }
    const [x, z] = af2(a, b);
    g.fillStyle = rgb([124, 118, 98], (rnd() - 0.5) * 0.1);
    g.save(); g.translate(px(x), px(z)); g.rotate(-RWY_YAW); g.fillRect(-12 * k, -8 * k, 24 * k, 16 * k); g.restore();
  }
  // lanes and the village
  g.strokeStyle = rgb([132, 124, 100]); g.lineWidth = Math.max(1, 6 * k);
  for (const ln of laneLines) {
    g.beginPath();
    for (let i = 0; i < ln.count; i++) { const x = px(ln.x[i]), y = px(ln.z[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  }
  const [vx, vz] = af2(VILLAGE.a, VILLAGE.b);
  for (let q = 0; q < 90; q++) {
    const f = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 250;
    g.fillStyle = rnd() < 0.55 ? rgb([92, 120, 62], (rnd() - 0.5) * 0.1) : rgb([138, 130, 108], (rnd() - 0.5) * 0.1);
    g.save(); g.translate(px(vx + Math.cos(f) * r), px(vz + Math.sin(f) * r)); g.rotate(rnd() * 3); g.fillRect(-14 * k, -10 * k, (18 + rnd() * 18) * k, (14 + rnd() * 14) * k); g.restore();
  }
  // houses: stone cottages along the lanes through the village, a few farms
  const place = (x: number, z: number, ang: number, w: number, d: number, h: number) => {
    for (const o of houses) if ((o.x - x) ** 2 + (o.z - z) ** 2 < ((Math.max(w, d) + Math.max(o.w, o.d)) * 0.55) ** 2) return false;
    if (nearLane(x, z, Math.max(w, d) * 0.5 - 2)) return false;
    houses.push({ x, z, ang, w, d, h, wall: rnd(), roof: rnd() });
    return true;
  };
  for (const ln of laneLines) for (let i = 1; i < ln.count; i++) {
    const L0x = ln.x[i - 1], L0z = ln.z[i - 1], dx = ln.x[i] - L0x, dz = ln.z[i] - L0z, len = Math.hypot(dx, dz);
    for (let d = 0; d < len; d += 9) {
      const x = L0x + (dx * d) / len, z = L0z + (dz * d) / len;
      if (Math.hypot(x - vx, z - vz) > 270 || rnd() < 0.35) continue;
      for (const side of [1, -1]) {
        if (rnd() < 0.4) continue;
        place(x - (dz / len) * 13 * side, z + (dx / len) * 13 * side, Math.atan2(dx, dz), 8 + rnd() * 5, 6 + rnd() * 2, 4.6 + rnd() * 1.6);
      }
    }
  }
  for (let q = 0; q < 30; q++) {
    const x = (rnd() * 2 - 1) * (H - 300), z = (rnd() * 2 - 1) * (H - 300);
    if (!free(x, z, 40)) continue;
    const ang = rnd() * Math.PI;
    if (place(x, z, ang, 11 + rnd() * 3, 7, 5.5)) {
      g.fillStyle = rgb([130, 122, 98]);
      g.save(); g.translate(px(x), px(z)); g.rotate(-ang); g.fillRect(-30 * k, -26 * k, 60 * k, 52 * k); g.restore();
      place(x + Math.cos(ang) * 24, z - Math.sin(ang) * 24, ang + Math.PI / 2, 20 + rnd() * 6, 10, 6.5);
      for (let t = 0; t < 5; t++) { const tx = x + (rnd() - 0.5) * 80, tz = z + (rnd() - 0.5) * 80; if (free(tx, tz, 5) && Math.hypot(tx - x, tz - z) > 22) addTree(tx, tz); }
    }
  }
  // the trees by the village and lone field oaks
  for (let q = 0; q < 60; q++) { const f = rnd() * Math.PI * 2, r = 120 + rnd() * 200; const x = vx + Math.cos(f) * r, z = vz + Math.sin(f) * r; if (!nearLane(x, z, 8)) addTree(x, z, 1.15); }
  for (let q = 0; q < 260; q++) { const x = (rnd() * 2 - 1) * (H - 100), z = (rnd() * 2 - 1) * (H - 100); if (free(x, z, 8)) addTree(x, z, 1.25); }
  // a belt of trees along the airfield boundary hedge (the horizon from the runway)
  for (let a = -1250; a <= 1250; a += 16) for (const b of [-960, 910]) { const [x, z] = af2(a + (rnd() - 0.5) * 8, b + (rnd() - 0.5) * 10); if (rnd() < 0.7 && !nearLane(x, z, 6)) addTree(x, z, 1 + rnd() * 0.3); }
  for (let b = -960; b <= 910; b += 16) for (const a of [-1270, 1270]) { if (Math.abs(b) < 190) continue; const [x, z] = af2(a + (rnd() - 0.5) * 10, b); if (rnd() < 0.7 && !nearLane(x, z, 6)) addTree(x, z, 1 + rnd() * 0.3); }
  const thin = <T,>(arr: T[], n: number) => (arr.length <= n ? arr : arr.filter(() => rnd() < n / arr.length));
  return { canvas: cv, trees: thin(trees, treeBudget), houses };
}

// ---------------- geometry helpers ----------------

const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => vcolored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);

// A flat strip from (x0, z0) to (x1, z1) with uv: u across (0..1), v along (metres / tile)
function strip(x0: number, z0: number, x1: number, z1: number, w: number, y: number, tile: number): THREE.BufferGeometry {
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
  const nx = (-dz / len) * (w / 2), nz = (dx / len) * (w / 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0 - nx, y, z0 - nz, x0 + nx, y, z0 + nz, x1 - nx, y, z1 - nz, x1 + nx, y, z1 + nz], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, len / tile, 1, len / tile], 2));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  return g;
}

// A ribbon along a closed loop of local points
function ribbonLoop(xs: Float32Array, zs: Float32Array, w: number, y: number, tile: number): THREE.BufferGeometry {
  const n = xs.length;
  const pos: number[] = [], uv: number[] = [], nor: number[] = [], idx: number[] = [];
  let acc = 0;
  for (let i = 0; i <= n; i++) {
    const j = i % n, p = (j - 1 + n) % n, q = (j + 1) % n;
    let dx = xs[q] - xs[p], dz = zs[q] - zs[p];
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    if (i) acc += Math.hypot(xs[j] - xs[(j - 1 + n) % n], zs[j] - zs[(j - 1 + n) % n]);
    for (const sd of [-1, 1]) { pos.push(xs[j] - dz * (w / 2) * sd, y, zs[j] + dx * (w / 2) * sd); nor.push(0, 1, 0); uv.push(sd < 0 ? 0 : 1, acc / tile); }
    if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// The watch office (control tower, drawing 12779/41): two storeys, a balcony and railing
// across the front, a glazed control room on the roof. Front faces +z.
function towerGeometry() {
  const W = 0xd9d2bf, DARK = 0x1b1f22, RAIL = 0x2b2d2c, ROOF = 0x55534c;
  const parts = [
    box(14, 7, 10, 0, 3.5, 0, W),
    box(14.4, 0.35, 10.4, 0, 7.15, 0, ROOF),
    // windows: ground and first floor, front and sides
    box(11, 1.4, 0.1, 0, 1.9, 5.02, DARK), box(11.6, 1.6, 0.1, 0, 5.2, 5.02, DARK),
    box(0.1, 1.4, 6, 7.02, 1.9, 0, DARK), box(0.1, 1.4, 6, -7.02, 1.9, 0, DARK),
    box(0.1, 1.5, 7, 7.02, 5.2, 0, DARK), box(0.1, 1.5, 7, -7.02, 5.2, 0, DARK),
    box(1.6, 2.4, 0.1, -4.5, 1.2, 5.03, 0x3a3226),
    // first-floor balcony with its railing
    box(14, 0.3, 2.2, 0, 3.6, 6.1, ROOF),
    box(14, 0.08, 0.08, 0, 4.7, 7.15, RAIL), box(0.08, 1.1, 0.08, -6.95, 4.15, 7.15, RAIL), box(0.08, 1.1, 0.08, 6.95, 4.15, 7.15, RAIL),
    box(0.08, 0.08, 2.2, -6.95, 4.7, 6.1, RAIL), box(0.08, 0.08, 2.2, 6.95, 4.7, 6.1, RAIL),
    // roof railing and the glazed control room
    box(14.2, 0.07, 0.07, 0, 8.3, 5.1, RAIL), box(14.2, 0.07, 0.07, 0, 8.3, -5.1, RAIL),
    box(0.07, 0.07, 10.2, 7.1, 8.3, 0, RAIL), box(0.07, 0.07, 10.2, -7.1, 8.3, 0, RAIL),
    box(4.2, 0.6, 4.2, 2.5, 7.6, -1, W), box(4.2, 1.5, 4.2, 2.5, 8.65, -1, 0x2a3236), box(4.6, 0.25, 4.6, 2.5, 9.5, -1, ROOF),
    // signals mast beside it
    box(0.18, 12, 0.18, -10, 6, 1, 0xcfcfc8), box(4, 0.12, 0.12, -10, 10.5, 1, 0xcfcfc8),
  ];
  return mergeGeometries(parts)!;
}

// T2 hangar (73 x 36 m, corrugated sheet): walls, a low gabled roof, the door end darker
function hangarGeometry() {
  const C = 0x4c5148, DOOR = 0x2e322d;
  const sh = new THREE.Shape();
  sh.moveTo(-18, 0); sh.lineTo(18, 0); sh.lineTo(18, 11.5); sh.lineTo(0, 14.5); sh.lineTo(-18, 11.5); sh.closePath();
  const body = vcolored(new THREE.ExtrudeGeometry(sh, { depth: 73, bevelEnabled: false }).translate(0, 0, -36.5).toNonIndexed(), C);
  const door = box(30, 10.5, 0.2, 0, 5.25, 36.6, DOOR);
  const door2 = box(30, 10.5, 0.2, 0, 5.25, -36.6, DOOR);
  return mergeGeometries([body, door, door2])!;
}

// Nissen hut: a corrugated half cylinder with brick ends (axis along z)
function nissenGeometry() {
  const r = 2.6, len = 11;
  // CylinderGeometry's half (theta -90..90, the +z side) turned so it arches over +y, axis along z
  const shell = vcolored(new THREE.CylinderGeometry(r, r, len, 12, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), 0x4f5449);
  const endA = vcolored(new THREE.CircleGeometry(r, 12, 0, Math.PI).translate(0, 0, len / 2), 0x7a5a48);
  const endB = vcolored(new THREE.CircleGeometry(r, 12, 0, Math.PI).rotateY(Math.PI).translate(0, 0, -len / 2), 0x7a5a48);
  const door = box(1.0, 1.9, 0.1, 0, 0.95, len / 2 + 0.03, 0x2e2a24);
  return mergeGeometries([shell, endA, endB, door])!;
}

// Runway controller's chequered caravan (by the threshold), on its own chequered material
function caravanGeometry() {
  const g = new THREE.BoxGeometry(4.2, 2.3, 2.2).translate(0, 1.55, 0);
  const wheels = new THREE.CylinderGeometry(0.4, 0.4, 2.3, 10).rotateX(Math.PI / 2).translate(0, 0.4, 0);
  wheels.deleteAttribute('uv'); g.deleteAttribute('uv');
  // uv: the chequer repeats ~1.1 m on every face
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    const u = nx > 0.5 ? z : x, v = ny > 0.5 ? z : y;
    uv[i * 2] = u / 2.2; uv[i * 2 + 1] = v / 2.2;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return { body: g, wheels: vcolored(wheels, 0x1a1a1a) };
}

function windsockGeometry() {
  const pole = box(0.12, 7, 0.12, 0, 3.5, 0, 0xd8d8d0);
  const sock = vcolored(new THREE.CylinderGeometry(0.5, 0.25, 3.2, 10, 1, true).rotateZ(Math.PI / 2).translate(1.7, 6.8, 0).toNonIndexed(), 0xe07a2a);
  const band = vcolored(new THREE.CylinderGeometry(0.42, 0.36, 0.7, 10, 1, true).rotateZ(Math.PI / 2).translate(2.2, 6.8, 0).toNonIndexed(), 0xf0ece2);
  return mergeGeometries([pole, sock, band])!;
}

// ---------------- vehicles ----------------

export type VehicleKind = 'fire' | 'crash' | 'ambulance' | 'jeep';
export interface Vehicle { kind: VehicleKind; obj: THREE.Group; beacons: THREE.Mesh[]; home: THREE.Vector3; homeYaw: number }

function vehicleGeometry(kind: VehicleKind): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const wheel = (x: number, z: number, r = 0.48) => parts.push(vcolored(new THREE.CylinderGeometry(r, r, 0.36, 12).rotateZ(Math.PI / 2).translate(x, r, z), 0x161616));
  if (kind === 'fire') {
    const R = 0xa11e16;
    parts.push(box(2.4, 1.9, 5.2, 0, 1.75, -0.9, R), box(2.4, 1.5, 1.9, 0, 1.55, 2.6, R), box(2.3, 0.8, 0.1, 0, 2.0, 3.56, 0x1d2328));
    parts.push(box(0.5, 0.25, 5.4, -0.6, 2.85, -0.8, 0xb8b8b0), box(0.5, 0.25, 5.4, 0.6, 2.85, -0.8, 0xb8b8b0));
    for (let i = 0; i < 6; i++) parts.push(box(1.3, 0.07, 0.07, 0, 2.95, -3.2 + i * 0.95, 0xb8b8b0));
    parts.push(box(2.42, 0.18, 6.9, 0, 0.95, 0.05, 0xd8c070));
    wheel(-1.05, 2.4); wheel(1.05, 2.4); wheel(-1.05, -1.6); wheel(1.05, -1.6); wheel(-1.05, -2.6); wheel(1.05, -2.6);
  } else if (kind === 'crash') {
    const O = 0x4f5530;
    parts.push(box(2.5, 2.1, 4.8, 0, 1.9, -1.0, O), box(2.4, 1.5, 2.0, 0, 1.6, 2.4, O), box(2.3, 0.75, 0.1, 0, 2.05, 3.42, 0x1d2328));
    parts.push(vcolored(new THREE.CylinderGeometry(0.75, 0.75, 4.2, 12).rotateX(Math.PI / 2).translate(0, 3.25, -1.0), 0x575d36));
    parts.push(box(0.9, 0.9, 0.06, 1.26, 2.0, -1.0, 0xe8e6dc));
    wheel(-1.1, 2.3, 0.55); wheel(1.1, 2.3, 0.55); wheel(-1.1, -2.2, 0.55); wheel(1.1, -2.2, 0.55);
  } else if (kind === 'ambulance') {
    const O = 0x515732;
    parts.push(box(2.1, 2.0, 3.2, 0, 1.6, -0.9, O), box(2.0, 1.1, 1.6, 0, 1.15, 1.5, O), box(1.9, 0.6, 0.08, 0, 1.75, 2.3, 0x1d2328));
    // white squares with red crosses on the sides and the back
    for (const s of [1, -1]) {
      parts.push(box(0.04, 1.0, 1.0, s * 1.06, 1.8, -0.9, 0xece9e0));
      parts.push(box(0.05, 0.7, 0.2, s * 1.07, 1.8, -0.9, 0xb3221a), box(0.05, 0.2, 0.7, s * 1.07, 1.8, -0.9, 0xb3221a));
    }
    parts.push(box(1.0, 1.0, 0.04, 0, 1.8, -2.52, 0xece9e0), box(0.7, 0.2, 0.05, 0, 1.8, -2.54, 0xb3221a), box(0.2, 0.7, 0.05, 0, 1.8, -2.54, 0xb3221a));
    wheel(-0.95, 1.4, 0.42); wheel(0.95, 1.4, 0.42); wheel(-0.95, -1.6, 0.42); wheel(0.95, -1.6, 0.42);
  } else {
    const O = 0x4b5130;
    parts.push(box(1.6, 0.7, 3.2, 0, 0.95, 0, O), box(1.5, 0.45, 0.06, 0, 1.55, 0.55, 0x8a9090));
    parts.push(box(0.5, 0.5, 0.04, 0, 1.05, -1.62, 0xe8e6dc));
    wheel(-0.75, 1.1, 0.38); wheel(0.75, 1.1, 0.38); wheel(-0.75, -1.1, 0.38); wheel(0.75, -1.1, 0.38);
  }
  return mergeGeometries(parts)!;
}

// ---------------- landing gear (the B-17 model has none) ----------------

// Main gear legs under the inboard nacelles and the tail wheel, in the B-17 model frame.
// MAIN_CONTACT / TAIL_CONTACT: the tyre contact points (a level aircraft).
export const MAIN_CONTACT = new THREE.Vector3(0, -3.3, 1.6);
export const TAIL_CONTACT = new THREE.Vector3(0, -0.45, -12.3);
/** Three-point attitude (tail wheel down): ~11.6 degrees nose up. */
export const THREE_POINT = Math.atan((TAIL_CONTACT.y - MAIN_CONTACT.y) / (MAIN_CONTACT.z - TAIL_CONTACT.z));

export interface Gear { group: THREE.Group; legs: THREE.Group[]; tail: THREE.Group; set(retract: number): void }

let gearMats: { metal: THREE.MeshStandardMaterial; tyre: THREE.MeshStandardMaterial } | null = null;
export function makeGear(): Gear {
  gearMats ??= {
    metal: new THREE.MeshStandardMaterial({ color: 0x5a5d58, roughness: 0.45, metalness: 0.7 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9, metalness: 0 }),
  };
  const { metal, tyre } = gearMats;
  const group = new THREE.Group();
  group.name = 'bk_gear';
  let hero: HeroB17Controls | null = null;
  let owner: THREE.Object3D | null = null;
  const legs: THREE.Group[] = [];
  for (const x of [3.02, -3.02]) {
    // pivot at the nacelle; the leg hangs down to the axle
    const leg = new THREE.Group();
    leg.position.set(x, -0.95, MAIN_CONTACT.z);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.7, 8).translate(0, -0.85, 0), metal);
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6).rotateX(0.55).translate(0, -0.7, 0.35), metal);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.4, 18).rotateZ(Math.PI / 2).translate(0, -1.65, 0), tyre);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.43, 12).rotateZ(Math.PI / 2).translate(0, -1.65, 0), metal);
    for (const m of [strut, brace, wheel, hub]) { m.castShadow = true; leg.add(m); }
    group.add(leg);
    legs.push(leg);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.05, TAIL_CONTACT.z);
  const tStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.45, 6).translate(0, -0.12, 0.08), metal);
  const tWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 14).rotateZ(Math.PI / 2).translate(0, -0.2, 0), tyre);
  for (const m of [tStrut, tWheel]) { m.castShadow = true; tail.add(m); }
  group.add(tail);
  return {
    group, legs, tail,
    // 0 = down, 1 = up (the main legs swing forward into the nacelles, the tail wheel up and in)
    set(retract: number) {
      if (group.parent !== owner) {
        owner = group.parent;
        hero = owner?.getObjectByName('B17G_HERO') ? new HeroB17Controls(owner) : null;
      }
      group.visible = !hero;
      if (hero) { hero.setGear(retract); return; }
      const k = THREE.MathUtils.clamp(retract, 0, 1);
      for (const l of legs) { l.rotation.x = -k * 1.45; l.visible = k < 0.999; }
      tail.position.y = 0.05 + k * 0.45;
      tail.visible = k < 0.999;
    },
  };
}

// ---------------- the airbase ----------------

export class Airbase {
  readonly group = new THREE.Group();
  readonly stands: Stand[] = [];
  readonly vehicles: Vehicle[] = [];
  readonly stats = { trees: 0, houses: 0, ms: 0 };
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private tex: THREE.Texture[] = [];
  private sock: THREE.Mesh | null = null;
  private wet = { value: 0 };
  private savedHaze = -1;

  constructor(quality: 'low' | 'medium' | 'high' | 'ultra' = 'high') {
    const t0 = performance.now();
    this.group.name = 'airbase';
    const hi = quality === 'high' || quality === 'ultra';
    const rwyCorners = RUNWAYS.map(([a0, b0, a1, b1]) => {
      const len = Math.hypot(a1 - a0, b1 - b0), na = -(b1 - b0) / len * (RWY.width / 2), nb = (a1 - a0) / len * (RWY.width / 2);
      return [af2(a0 - na, b0 - nb), af2(a1 - na, b1 - nb), af2(a1 + na, b1 + nb), af2(a0 + na, b0 + nb)];
    });
    const painted = paintMap(hi ? 2048 : 1024, hi ? 5200 : quality === 'medium' ? 3400 : 2000, rwyCorners, TRACK.x, TRACK.z);
    this.buildGround(painted.canvas);
    this.buildConcrete();
    this.buildTrees(painted.trees);
    this.buildHouses(painted.houses);
    this.buildSite();
    this.buildVehicles();
    this.stats.trees = painted.trees.length; this.stats.houses = painted.houses.length;
    this.stats.ms = Math.round(performance.now() - t0);
  }

  private keep<T extends THREE.Material>(m: T) { this.mats.push(m); return m; }
  private keepG<T extends THREE.BufferGeometry>(g: T) { this.geos.push(g); return g; }
  private add(g: THREE.BufferGeometry, m: THREE.Material, name: string, shadow = true) {
    const mesh = new THREE.Mesh(this.keepG(g), m);
    mesh.name = name; mesh.castShadow = shadow; mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  private buildGround(canvas: HTMLCanvasElement) {
    // a grid (not one quad) so the haze and lighting interpolate well over 60 km
    const N = 96;
    const warp = (s: number) => Math.sign(s) * (Math.abs(s) < 0.5 ? Math.abs(s) * 2 * 5000 : 5000 + ((Math.abs(s) - 0.5) / 0.5) ** 1.6 * (FAR - 5000));
    const pos = new Float32Array((N + 1) * (N + 1) * 3);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const o = (j * (N + 1) + i) * 3;
      pos[o] = warp(i / N * 2 - 1); pos[o + 1] = 0; pos[o + 2] = warp(j / N * 2 - 1);
    }
    const idx: number[] = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.anisotropy = 8;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex.push(tex);
    const mat = this.keep(new THREE.MeshLambertMaterial({ color: 0xffffff }));
    hazed(mat, { key: 'abGround', vertHead: 'varying vec3 vMap;', vertBody: 'vMap = position;', fragHead: GROUND_FRAG_HEAD, fragColor: GROUND_FRAG });
    this.wetSurface(mat);
    const inner = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => { inner(sh, r); sh.uniforms.uAbMap = { value: tex }; sh.uniforms.uAbHalf = { value: H }; };
    const m = this.add(geo, mat, 'ab_ground', false);
    m.frustumCulled = false;
  }

  private buildConcrete() {
    const tex = concreteTexture();
    this.tex.push(tex);
    const mk = (color: number, off: number, key: string) => this.keep(hazed(new THREE.MeshLambertMaterial({ map: tex, color, polygonOffset: true, polygonOffsetFactor: off, polygonOffsetUnits: off }), { key }));
    const rwy = mk(0xffffff, -3, 'abRunway'), track = mk(0xd2d0ca, -2, 'abTrack'), pan = mk(0xc9c7c0, -2, 'abPan');
    this.wetSurface(rwy); this.wetSurface(track); this.wetSurface(pan);
    const parts: THREE.BufferGeometry[] = [];
    for (const [a0, b0, a1, b1] of RUNWAYS) {
      const ext = a0 === -RWY.half ? 50 : 0;   // the main runway runs on to meet the track
      const len = Math.hypot(a1 - a0, b1 - b0), ua = (a1 - a0) / len, ub = (b1 - b0) / len;
      const [x0, z0] = af2(a0 - ua * ext, b0 - ub * ext), [x1, z1] = af2(a1 + ua * ext, b1 + ub * ext);
      parts.push(strip(x0, z0, x1, z1, RWY.width, SURFACE_Y + 0.02, RWY.width));
    }
    this.add(mergeGeometries(parts)!, rwy, 'ab_runways', false);
    // threshold bars and a centreline of dashes on 05/23 (sparse wartime markings)
    const paint = this.keep(hazed(new THREE.MeshLambertMaterial({ color: 0xe8e4d6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), { key: 'abPaint' }));
    const marks: THREE.BufferGeometry[] = [];
    for (const end of [-1, 1]) for (let i = -4; i <= 4; i++) {
      if (!i) continue;
      const a = end * (RWY.half - 20), b = i * 4.6;
      const [x0, z0] = af2(a - 12, b), [x1, z1] = af2(a + 12, b);
      marks.push(strip(x0, z0, x1, z1, 1.6, SURFACE_Y + 0.04, 1));
    }
    for (let a = -RWY.half + 70; a < RWY.half - 70; a += 60) { const [x0, z0] = af2(a, 0), [x1, z1] = af2(a + 25, 0); marks.push(strip(x0, z0, x1, z1, 0.8, SURFACE_Y + 0.04, 1)); }
    this.add(mergeGeometries(marks)!, paint, 'ab_marks', false);
    // perimeter track and the stubs
    this.add(ribbonLoop(TRACK.x, TRACK.z, 15, SURFACE_Y, 30), track, 'ab_track', false);
    const st: THREE.BufferGeometry[] = [];
    for (const [a0, b0, a1, b1] of STUBS) { const [x0, z0] = af2(a0, b0), [x1, z1] = af2(a1, b1); st.push(strip(x0, z0, x1, z1, 15, SURFACE_Y - 0.01, 30)); }
    // the lead-in from the track onto the threshold of 05
    for (let i = 1; i < DEPART.count && DEPART.s[i] <= LINEUP_S + 5; i++) {
      if (DEPART.s[i] < LINEUP_S - 70) continue;
      st.push(strip(DEPART.x[i - 1], DEPART.z[i - 1], DEPART.x[i], DEPART.z[i], 16, SURFACE_Y - 0.005, 30));
    }
    // hardstands: pans off the outside of the track, each with a short stub
    const outwardSign = this.outwardSign();
    const pans: THREE.Matrix4[] = [];
    const runwayEnds = RUNWAYS.flatMap(([a0, b0, a1, b1]) => [af2(a0, b0), af2(a1, b1)]);
    const _p = new THREE.Vector2(), _d = new THREE.Vector2(), _a = new THREE.Vector2();
    for (let s = 40; s < TRACK.length; s += 78) {
      TRACK.at(s, _p, _d);
      if (runwayEnds.some(([x, z]) => Math.hypot(x - _p.x, z - _p.y) < 190)) continue;
      localToAf(_p.x, _p.y, _a);
      if (_a.y > 250 && _a.x > -790 && _a.x < -500) continue;   // in front of the tower
      const ox = -_d.y * outwardSign, oz = _d.x * outwardSign;
      const cx = _p.x + ox * 44, cz = _p.y + oz * 44;
      st.push(strip(_p.x + ox * 6, _p.y + oz * 6, cx, cz, 14, SURFACE_Y - 0.02, 30));
      pans.push(new THREE.Matrix4().makeTranslation(cx, SURFACE_Y - 0.03, cz));
      this.stands.push({ x: cx, z: cz, yaw: Math.atan2(-ox, -oz) });   // nose toward the track
    }
    this.add(mergeGeometries(st)!, track, 'ab_stubs', false);
    const disc = this.keepG(new THREE.CircleGeometry(20, 28).rotateX(-Math.PI / 2));
    const im = new THREE.InstancedMesh(disc, pan, pans.length);
    pans.forEach((m, i) => im.setMatrixAt(i, m));
    im.receiveShadow = true; im.name = 'ab_pans';
    im.computeBoundingSphere();
    this.group.add(im);
  }

  // +1 if the track runs counter-clockwise (left normal points outward), else -1
  private outwardSign() {
    const _p = new THREE.Vector2(), _d = new THREE.Vector2();
    TRACK.at(10, _p, _d);
    const probeX = _p.x - _d.y * 30, probeZ = _p.y + _d.x * 30;
    return inside(probeX, probeZ, TRACK.x, TRACK.z) ? -1 : 1;
  }

  private buildTrees(trees: TreeSpot[]) {
    const crown = new THREE.IcosahedronGeometry(1, 1);
    crown.scale(0.44, 0.38, 0.44).translate(0, 0.62, 0);
    const p = crown.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.13 * Math.sin(x * 21 + y * 15) * Math.cos(z * 17);
      p.setXYZ(i, x * k, y, z * k);
    }
    const geo = this.keepG(mergeGeometries([vcolored(crown, 0x48622f), vcolored(new THREE.CylinderGeometry(0.035, 0.05, 0.42, 5).translate(0, 0.21, 0), 0x4a3a2a)])!);
    geo.computeVertexNormals();
    const mat = this.keep(hazed(new THREE.MeshLambertMaterial({ vertexColors: true }), { key: 'abTrees' }));
    const im = new THREE.InstancedMesh(geo, mat, trees.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pp = new THREE.Vector3(), col = new THREE.Color(), y = new THREE.Vector3(0, 1, 0);
    trees.forEach((t, i) => {
      const w = t.h * (0.85 + t.tint * 0.4);
      pp.set(t.x, -0.3, t.z); q.setFromAxisAngle(y, t.tint * 6.28); s.set(w, t.h, w);
      im.setMatrixAt(i, m4.compose(pp, q, s));
      col.setRGB(0.8 + t.tint * 0.32, 0.86 + ((t.tint * 7.3) % 1) * 0.3, 0.78 + ((t.tint * 3.1) % 1) * 0.22);
      im.setColorAt(i, col);
    });
    im.computeBoundingSphere();
    im.name = 'ab_trees';
    this.group.add(im);
  }

  private buildHouses(houses: HouseSpot[]) {
    const walls = this.keepG(vcolored(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), 0xffffff));
    const sh = new THREE.Shape();
    sh.moveTo(-0.56, 0); sh.lineTo(0.56, 0); sh.lineTo(0, 0.6); sh.closePath();
    const roof = this.keepG(vcolored(new THREE.ExtrudeGeometry(sh, { depth: 1.06, bevelEnabled: false }).translate(0, 1, -0.53).toNonIndexed(), 0xffffff));
    const mat = this.keep(hazed(new THREE.MeshLambertMaterial({ vertexColors: true }), { key: 'abHouses' }));
    const W = new THREE.InstancedMesh(walls, mat, houses.length), R = new THREE.InstancedMesh(roof, mat, houses.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    // Northamptonshire limestone and brick, Collyweston slate and thatch
    const WALLS = [0xcdb98f, 0xc4ae84, 0xb89e74, 0x9c6a4e, 0xd6c9a8], ROOFS = [0x55524c, 0x4a4844, 0x8a7448, 0x6c3a2a, 0x5f5a50];
    houses.forEach((h, i) => {
      p.set(h.x, -0.2, h.z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), h.ang); s.set(h.d, h.h, h.w);
      W.setMatrixAt(i, m4.compose(p, q, s)); R.setMatrixAt(i, m4);
      W.setColorAt(i, c.setHex(WALLS[Math.floor(h.wall * WALLS.length)]));
      R.setColorAt(i, c.setHex(ROOFS[Math.floor(h.roof * ROOFS.length)]));
    });
    for (const m of [W, R]) { m.computeBoundingSphere(); m.name = 'ab_houses'; m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
    // the village church: nave, west tower with a short spire
    const church = mergeGeometries([
      box(9, 8, 22, 0, 4, 0, 0xc9b58c),
      vcolored(new THREE.CylinderGeometry(0.01, 7, 5, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 2.2).translate(0, 10.4, 0), 0x55524c),
      box(6.5, 18, 6.5, 0, 9, -13, 0xc2ad84),
      vcolored(new THREE.ConeGeometry(3.6, 11, 8).translate(0, 23.5, -13), 0x8e8a80),
    ])!;
    const m = this.add(church, mat, 'ab_church');
    afToLocal(VILLAGE.a + 40, VILLAGE.b + 30, m.position, -0.2);
    m.rotation.y = 0.9;
  }

  private buildSite() {
    const mat = this.keep(hazed(new THREE.MeshLambertMaterial({ vertexColors: true }), { key: 'abSite' }));
    const at = (o: THREE.Object3D, a: number, b: number, yaw: number) => { afToLocal(a, b, o.position, 0); o.rotation.y = yaw; return o; };
    const faceRunway = afYaw(0, -1);   // +z toward the runway (-b)
    at(this.add(towerGeometry(), mat, 'ab_tower'), TOWER.a, TOWER.b, faceRunway);
    // two T2 hangars on the technical site, doors toward the track
    at(this.add(hangarGeometry(), mat, 'ab_hangar'), 220, 700, afYaw(1, 0));
    at(this.add(hangarGeometry(), mat, 'ab_hangar'), 420, 690, afYaw(1, 0));
    // workshops and stores: low brick blocks
    const blocks: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) blocks.push(box(16 + (i % 3) * 5, 4 + (i % 2), 8, -40 + i * 34, 2.2, 0, i % 2 ? 0xa0806a : 0x8f8a78));
    at(this.add(mergeGeometries(blocks)!, mat, 'ab_blocks'), 40, 640, faceRunway);
    // Nissen huts: living and technical sites behind the tower
    const hut = this.keepG(nissenGeometry());
    const huts: [number, number, number][] = [];
    for (let i = 0; i < 9; i++) huts.push([-740 + (i % 3) * 18, 470 + Math.floor(i / 3) * 24, afYaw(0, 1)]);
    for (let i = 0; i < 12; i++) huts.push([-560 + (i % 6) * 14, 700 + Math.floor(i / 6) * 26, afYaw(0, 1)]);
    for (let i = 0; i < 8; i++) huts.push([-80 + i * 16, 830, afYaw(0, 1)]);
    for (let i = 0; i < 6; i++) huts.push([-1000 + i * 16, 470 + (i % 2) * 4, afYaw(-1, -1)]);
    const him = new THREE.InstancedMesh(hut, mat, huts.length);
    const v = new THREE.Vector3(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), m4 = new THREE.Matrix4(), yAx = new THREE.Vector3(0, 1, 0);
    huts.forEach(([a, b, yaw], i) => { afToLocal(a, b, v, 0); q.setFromAxisAngle(yAx, yaw); him.setMatrixAt(i, m4.compose(v, q, one)); });
    him.castShadow = true; him.receiveShadow = true; him.name = 'ab_huts';
    him.computeBoundingSphere();
    this.group.add(him);
    // the runway controller's chequered caravan beside the threshold of 05, the windsock
    const chq = checkerTexture();
    this.tex.push(chq);
    const cmat = this.keep(hazed(new THREE.MeshLambertMaterial({ map: chq }), { key: 'abChq' }));
    const cv = caravanGeometry();
    const car = new THREE.Group();
    const body = new THREE.Mesh(this.keepG(cv.body), cmat); body.castShadow = true;
    const wh = new THREE.Mesh(this.keepG(cv.wheels), mat);
    car.add(body, wh);
    at(car, -870, 48, afYaw(1, 0));
    car.name = 'ab_caravan';
    this.group.add(car);
    this.sock = at(this.add(windsockGeometry(), mat, 'ab_windsock'), -560, 440, afYaw(1, 0.3)) as THREE.Mesh;
    // a few things by the hardstands: bomb trolleys, fuel bowsers (low boxes)
    const bits: THREE.BufferGeometry[] = [];
    this.stands.forEach((s, i) => {
      if (i % 3) return;
      const g = i % 2 ? box(2.5, 2.2, 7, 0, 1.4, 0, 0x4f5530) : box(1.6, 0.8, 3.4, 0, 0.5, 0, 0x3c3f33);
      g.rotateY(s.yaw + 0.5).translate(s.x + Math.sin(s.yaw + 1.6) * 24, 0, s.z + Math.cos(s.yaw + 1.6) * 24);
      bits.push(g);
    });
    if (bits.length) this.add(mergeGeometries(bits)!, mat, 'ab_bits');
  }

  private buildVehicles() {
    const mat = this.keep(hazed(new THREE.MeshLambertMaterial({ vertexColors: true }), { key: 'abVehicles' }));
    const beaconMat = this.keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.6, 0.3) }));
    const beaconGeo = this.keepG(new THREE.SphereGeometry(0.16, 8, 6));
    // crash crews standing by beside the runway, near the tower
    const homes: [VehicleKind, number, number][] = [['fire', -330, 135], ['crash', -352, 146], ['ambulance', -308, 148], ['ambulance', -288, 140], ['jeep', -610, 372]];
    for (const [kind, a, b] of homes) {
      const obj = new THREE.Group();
      const m = new THREE.Mesh(this.keepG(vehicleGeometry(kind)), mat);
      m.castShadow = true; m.receiveShadow = true;
      obj.add(m);
      const beacons: THREE.Mesh[] = [];
      if (kind !== 'jeep') {
        const y = kind === 'fire' ? 2.55 : kind === 'crash' ? 3.05 : 2.65, z = kind === 'fire' ? 2.6 : kind === 'crash' ? 1.9 : 0.6;
        for (const x of [-0.6, 0.6]) { const bm = new THREE.Mesh(beaconGeo, beaconMat); bm.position.set(x, y, z); bm.visible = false; bm.userData.bkBeacon = true; obj.add(bm); beacons.push(bm); }
      }
      const home = afToLocal(a, b, new THREE.Vector3(), SURFACE_Y - 0.1);
      const homeYaw = afYaw(0, -1);
      obj.position.copy(home); obj.rotation.y = homeYaw;
      obj.name = 'ab_vehicle_' + kind;
      this.group.add(obj);
      this.vehicles.push({ kind, obj, beacons, home, homeYaw });
    }
  }

  resetVehicles() {
    for (const v of this.vehicles) { v.obj.position.copy(v.home); v.obj.rotation.y = v.homeYaw; for (const b of v.beacons) b.visible = false; }
  }

  /** Windsock flutter (cheap, per frame while shown). */
  private wetSurface(mat: THREE.Material) {
    const inner = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, renderer) => {
      inner(sh, renderer); sh.uniforms.uWet = this.wet;
      sh.fragmentShader = sh.fragmentShader.replace('uniform float uCsHaze;', 'uniform float uCsHaze; uniform float uWet;')
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          vec3 wetV = normalize(cameraPosition - vCsWorld);
          float wetF = pow(1.0 - abs(wetV.y), 4.0);
          float wetPatch = .55 + .45*sin(vCsWorld.x*.17)*sin(vCsWorld.z*.23);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb*.7 + uHorizon*wetF*.5, uWet*wetPatch);`);
    };
  }
  update(time: number) {
    this.wet.value = weatherNow.effects ? weatherNow.wetness : 0;
    if (this.sock) this.sock.rotation.z = Math.sin(time * 2.3) * 0.02;
  }

  // Shown while a bookend plays: the low-level haze on the sky dome's own ground matches ours
  show(scene: THREE.Scene, on: boolean) {
    if (on && this.group.parent !== scene) {
      scene.add(this.group);
      this.savedHaze = skyGround.uGroundHaze.value;
      skyGround.uGroundHaze.value = 9000 * 1.05;
    }
    if (!on && this.group.parent) {
      this.group.removeFromParent();
      if (this.savedHaze > 0) skyGround.uGroundHaze.value = this.savedHaze;
      this.savedHaze = -1;
    }
  }

  dispose() {
    if (this.group.parent) this.show(this.group.parent as THREE.Scene, false);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.tex) t.dispose();
  }
}

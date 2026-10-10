import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { atmosUniforms, skyGLSL } from '../render/Atmosphere';
import { skyGround } from '../render/Sky';
import { mulberry } from '../render/Particles';

// Low-level countryside for the P-51 ground-attack operation (StrafeOps.ts, Phase 5 goal 18):
// Normandy / northern France bocage, seen from 50-600 m. Everything sits in one group in "map"
// coordinates (u, height, v), metres from the map centre; the group is a direct scene child, so
// the floating-origin shift moves it like any other object and nothing on the ground swims.
//
//  * Ground: one static mesh, a 256x256 grid warped so it is dense (~120 m) over the 18 km
//    middle and coarse out to 32 km, heights from terrainHeight() (gentle rolling hills, a river
//    valley, a hill with the railway tunnel, a levelled airfield; flat y = 0 at the rim, where
//    the sky dome's own ground takes over). Its colour comes from a 2048^2 painted map of the
//    16 km centre (field patchwork, hedgerows, woods, village plots, the airfield) blended into
//    a procedural patchwork further out, times world-space detail noise faded by pixel size
//    (no shimmer), lit by the scene's sun/hemisphere (Lambert, receives the aircraft shadows),
//    and hazed toward the sky colour with distance (shared with the sky dome's ground haze).
//  * Ribbons that follow the terrain: roads, the railway (ballast, sleepers and rails in a
//    mip-mapped texture) and the river (a glossy water strip), plus bridges and a tunnel portal.
//  * Instanced trees (hedgerows, poplar-lined roads, woods) in chunks with two levels of detail,
//    instanced houses and barns (the village, scattered farms), a church, the airfield's hangars.
// Gameplay reads terrainHeight() (ground collision, targets) and the paths (train, convoy).

export const MAP_HALF = 8000;          // painted map: +-8 km
const GRID_INNER = 9000;               // dense part of the ground grid: +-9 km
const GRID_FAR = 32000;                // rim of the ground mesh
const FLAT_FROM = 10500, FLAT_TO = 15000; // hills fade to the flat sky-dome ground between these
const CHUNK = 2000;                    // tree / house chunk size (m)
const LOD_NEAR = 2600;                 // chunks nearer than this draw the detailed trees
export const HAZE_LOW = 9000;          // low-level haze distance (m)

// Shared low-level haze uniform (ground, trees, buildings, targets)
export const countryUniforms = { uCsHaze: { value: HAZE_LOW } };

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------- terrain ----------------

// The river runs roughly south-north on the west side: its centre line u(v)
export const riverU = (v: number) => -3200 + 380 * Math.sin(v / 1500) + 160 * Math.sin(v / 520 + 1);
export const AIRFIELD = { u: 4600, v: 4200, ang: 0.35, len: 1700, wid: 720 };
export const TUNNEL = { u: 6650, v: 1720 };
const HILL = { u: 7350, v: 1760, r: 760, h: 48 };

function baseHeight(u: number, v: number): number {
  let h = 17 + 9 * Math.sin(u / 1700 + 0.7) * Math.cos(v / 2100 - 0.4) + 6 * Math.sin((u + 0.6 * v) / 1150 + 1.3)
    + 3.5 * Math.cos((u - v) / 640 + 2.1) + 1.4 * Math.sin(u / 310 + v / 270);
  // the river valley
  const dr = Math.abs(u - riverU(v));
  h -= 10 * (1 - smooth(40, 520, dr));
  // the tunnel hill
  const dh = Math.hypot(u - HILL.u, v - HILL.v);
  h += HILL.h * Math.exp(-(dh * dh) / (HILL.r * HILL.r));
  return h;
}
const AIRFIELD_H = baseHeight(AIRFIELD.u, AIRFIELD.v);

// Ground height (m) at map point (u, v). Never below 1 m, 0 beyond the rim.
export function terrainHeight(u: number, v: number): number {
  const r = Math.max(Math.abs(u), Math.abs(v));
  if (r >= FLAT_TO) return 0;
  let h = baseHeight(u, v);
  // the airfield is levelled
  const da = Math.hypot(u - AIRFIELD.u, v - AIRFIELD.v);
  if (da < 1300) h += (AIRFIELD_H - h) * (1 - smooth(950, 1300, da));
  return Math.max(1, h) * (1 - smooth(FLAT_FROM, FLAT_TO, r));
}

// ---------------- paths ----------------

// A smooth polyline in map coordinates, sampled every `step` m, with arc length
export class Path {
  readonly u: Float32Array;
  readonly v: Float32Array;
  readonly s: Float32Array;
  readonly length: number;
  constructor(ctrl: [number, number][], step = 10) {
    const curve = new THREE.CatmullRomCurve3(ctrl.map(([u, v]) => new THREE.Vector3(u, 0, v)), false, 'centripetal');
    const n = Math.max(2, Math.ceil(curve.getLength() / step) + 1);
    const pts = curve.getSpacedPoints(n - 1);
    this.u = new Float32Array(n); this.v = new Float32Array(n); this.s = new Float32Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      this.u[i] = pts[i].x; this.v[i] = pts[i].z;
      if (i > 0) acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      this.s[i] = acc;
    }
    this.length = acc;
  }
  get count() { return this.u.length; }
  // Point (and unit direction) at arc length s, clamped to the ends
  at(s: number, out: THREE.Vector2, dir?: THREE.Vector2): THREE.Vector2 {
    const S = this.s, n = S.length;
    s = Math.min(Math.max(s, 0), this.length);
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    const t = S[hi] > S[lo] ? (s - S[lo]) / (S[hi] - S[lo]) : 0;
    out.set(this.u[lo] + (this.u[hi] - this.u[lo]) * t, this.v[lo] + (this.v[hi] - this.v[lo]) * t);
    if (dir) dir.set(this.u[hi] - this.u[lo], this.v[hi] - this.v[lo]).normalize();
    return out;
  }
  // Arc length of the sample nearest to (u, v) (brute force; setup only)
  nearest(u: number, v: number): number {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.u.length; i++) { const d = (this.u[i] - u) ** 2 + (this.v[i] - v) ** 2; if (d < bd) { bd = d; best = i; } }
    return this.s[best];
  }
}

// The fixed map layout (deterministic: the countryside is built once and reused)
export const RAIL = new Path([[-15000, 900], [-9500, 1150], [-6200, 700], [-3300, 1300], [-1200, 1700], [600, 1480], [2600, 1900], [4800, 1520], [TUNNEL.u, TUNNEL.v]]);
export const ROAD = new Path([[-15000, -10500], [-9000, -6300], [-5200, -3700], [-3000, -1700], [-900, -250], [600, 900], [1800, 2500], [3000, 3800], [3400, 4500], [5200, 6600], [9000, 9500], [15000, 14000]]);
export const ROAD2 = new Path([[1100, -15000], [900, -9000], [300, -3200], [600, 900], [-250, 4200], [-1500, 9000], [-2500, 15000]]);
export const RIVER = (() => { const c: [number, number][] = []; for (let v = -16000; v <= 16000; v += 400) c.push([riverU(v), v]); return new Path(c, 12); })();
export const VILLAGE = { u: 600, v: 900 };

// ---------------- materials ----------------

const HAZE_GLSL = /* glsl */ `
${skyGLSL}
uniform float uCsHaze;
varying vec3 vCsWorld;
`;

interface Patch { key: string; vertHead?: string; vertBody?: string; fragHead?: string; fragColor?: string }

// Inject the low-level haze (and optional albedo code) into a built-in material
function patch<T extends THREE.Material>(mat: T, p: Patch = { key: 'haze' }): T {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, atmosUniforms, countryUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vCsWorld;\n${p.vertHead ?? ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 csW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          csW = instanceMatrix * csW;
        #endif
        vCsWorld = (modelMatrix * csW).xyz;
        ${p.vertBody ?? ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${HAZE_GLSL}\n${p.fragHead ?? ''}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${p.fragColor ?? ''}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        vec3 csV = vCsWorld - cameraPosition;
        float csD = length(csV);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, skyRadiance(csV / max(csD, 1.0)), 1.0 - exp(-csD / uCsHaze));`);
  };
  mat.customProgramCacheKey = () => 'country-' + p.key;
  return mat;
}
export const hazed = patch;

const GROUND_FRAG_HEAD = /* glsl */ `
uniform sampler2D uCountry;
uniform float uMapHalf;
varying vec3 vMap;
float csH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float csN(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  return mix(mix(csH(i), csH(i + vec2(1.0, 0.0)), w.x), mix(csH(i + vec2(0.0, 1.0)), csH(i + vec2(1.0, 1.0)), w.x), w.y);
}
// Procedural patchwork beyond the painted map (same palette, coarser)
vec3 csFar(vec2 p) {
  vec2 q = p / 1000.0;
  vec2 warp = vec2(csN(q * 0.9), csN(q * 0.9 + 7.3)) * 0.6;
  vec2 cell = floor(q * vec2(4.4, 5.6) + warp);
  float c = csH(cell);
  vec3 col = c < 0.22 ? vec3(0.72, 0.64, 0.36) : c < 0.45 ? vec3(0.47, 0.57, 0.3) : c < 0.62 ? vec3(0.31, 0.42, 0.21)
    : c < 0.8 ? vec3(0.46, 0.38, 0.28) : vec3(0.7, 0.66, 0.47);
  col *= 0.9 + 0.2 * csH(cell + 3.1);
  float wood = smoothstep(0.62, 0.68, csN(q * 0.55 + 11.0) * 0.6 + csN(q * 1.7) * 0.4);
  return mix(col, vec3(0.2, 0.27, 0.16), wood);
}
`;

const GROUND_FRAG = /* glsl */ `
{
  vec2 mp = vMap.xz;
  float edge = max(abs(mp.x), abs(mp.y));
  // the painted map inside, the procedural patchwork outside (each only where it is seen)
  vec2 muv = mp / (2.0 * uMapHalf) + 0.5;
  vec2 gx = dFdx(muv), gy = dFdy(muv);
  vec3 alb;
  if (edge < uMapHalf - 700.0) alb = textureGrad(uCountry, muv, gx, gy).rgb;
  else if (edge < uMapHalf) alb = mix(textureGrad(uCountry, muv, gx, gy).rgb, csFar(mp), smoothstep(uMapHalf - 700.0, uMapHalf, edge));
  else alb = csFar(mp);
  // world-space detail, each octave faded out once it is smaller than a pixel
  float fw = length(fwidth(mp));
  float n1 = (csN(mp / 2.7) - 0.5) * (1.0 - smoothstep(0.6, 3.0, fw));
  float n2 = (csN(mp / 9.0) - 0.5) * (1.0 - smoothstep(2.0, 10.0, fw));
  float n3 = (csN(mp / 41.0) - 0.5) * (1.0 - smoothstep(8.0, 45.0, fw));
  float n4 = (csN(mp / 190.0) - 0.5);
  alb *= 1.0 + n1 * 0.32 + n2 * 0.34 + n3 * 0.3 + n4 * 0.22;
  diffuseColor.rgb *= alb;
}
`;

// ---------------- the painted map ----------------

type RGB = [number, number, number];
const CROPS: { c: RGB; w: number }[] = [
  { c: [190, 168, 94], w: 0.17 },   // wheat
  { c: [204, 182, 108], w: 0.08 },  // ripe barley
  { c: [124, 148, 80], w: 0.2 },    // pasture
  { c: [108, 136, 70], w: 0.13 },   // meadow
  { c: [78, 106, 52], w: 0.1 },     // beet / potatoes
  { c: [124, 98, 72], w: 0.11 },    // ploughed
  { c: [106, 86, 64], w: 0.06 },    // dark earth
  { c: [184, 174, 122], w: 0.08 },  // stubble / hay
  { c: [140, 140, 86], w: 0.07 },   // fallow
];
const WOOD: RGB = [52, 68, 40];

export interface TreeSpot { u: number; v: number; h: number; kind: 0 | 1; tint: number }
export interface HouseSpot { u: number; v: number; ang: number; w: number; d: number; h: number; wall: number; roof: number }

// Spatial hash over the path samples: "is (u, v) within r of a road / rail / river?"
class PathIndex {
  private cells = new Map<number, number[]>();
  constructor(private cell = 60) {}
  private key(cx: number, cz: number) { return (cx + 2000) * 4096 + (cz + 2000); }
  add(p: Path, pad: number) {
    for (let i = 0; i < p.count; i++) {
      const k = this.key(Math.floor(p.u[i] / this.cell), Math.floor(p.v[i] / this.cell));
      let a = this.cells.get(k);
      if (!a) this.cells.set(k, a = []);
      a.push(p.u[i], p.v[i], pad);
    }
  }
  // true when within (r + that path's pad) of any sample
  near(u: number, v: number, r: number): boolean {
    const cx = Math.floor(u / this.cell), cz = Math.floor(v / this.cell);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const a = this.cells.get(this.key(cx + dx, cz + dz));
      if (!a) continue;
      for (let i = 0; i < a.length; i += 3) { const rr = r + a[i + 2]; if ((a[i] - u) ** 2 + (a[i + 1] - v) ** 2 < rr * rr) return true; }
    }
    return false;
  }
}

function inAirfield(u: number, v: number, pad = 0) {
  const c = Math.cos(AIRFIELD.ang), s = Math.sin(AIRFIELD.ang);
  const du = u - AIRFIELD.u, dv = v - AIRFIELD.v;
  const a = du * c + dv * s, b = -du * s + dv * c;
  return Math.abs(a) < AIRFIELD.len / 2 + pad && Math.abs(b) < AIRFIELD.wid / 2 + pad;
}

interface Painted { canvas: HTMLCanvasElement; trees: TreeSpot[]; houses: HouseSpot[]; poplars: TreeSpot[] }

function paintMap(S: number, treeBudget: number): Painted {
  const H = MAP_HALF;
  const rnd = mulberry(1944);
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const px = (u: number) => (u + H) / (2 * H) * S;
  const k = S / (2 * H);                              // px per metre
  const rgb = (c: RGB, j = 0) => `rgb(${Math.round(c[0] * (1 + j))},${Math.round(c[1] * (1 + j))},${Math.round(c[2] * (1 + j))})`;
  const pick = () => { let r = rnd(); for (const c of CROPS) { r -= c.w; if (r <= 0) return c.c; } return CROPS[0].c; };
  const idx = new PathIndex();
  idx.add(ROAD, 9); idx.add(ROAD2, 9); idx.add(RAIL, 9); idx.add(RIVER, 22);
  const trees: TreeSpot[] = [], houses: HouseSpot[] = [], poplars: TreeSpot[] = [];
  const village = (u: number, v: number) => Math.hypot(u - VILLAGE.u, v - VILLAGE.v) < 420;
  const free = (u: number, v: number, r: number) => !idx.near(u, v, r) && !inAirfield(u, v, 60) && !village(u, v)
    && Math.hypot(u - TUNNEL.u, v - TUNNEL.v) > 60 && Math.max(Math.abs(u), Math.abs(v)) < H - 50;
  const addTree = (u: number, v: number, big = 1) => { trees.push({ u, v, h: (9 + rnd() * 7) * big, kind: 0, tint: rnd() }); };

  g.fillStyle = rgb(CROPS[2].c);
  g.fillRect(0, 0, S, S);

  // fields: tiles of rotated, jittered grids; some edges carry hedgerows (bocage)
  const T = 1600;
  const hedges: [number, number, number, number][] = [];
  for (let tx = -H; tx < H; tx += T) for (let tz = -H; tz < H; tz += T) {
    const th = (rnd() - 0.5) * 0.9, c = Math.cos(th), s = Math.sin(th);
    const cw = 120 + rnd() * 150, ch = 90 + rnd() * 120;
    const cx = tx + T / 2, cz = tz + T / 2;
    const na = Math.ceil(1.5 * T / cw) + 1, nb = Math.ceil(1.5 * T / ch) + 1;
    const gu: number[][] = [], gv: number[][] = [];
    for (let i = 0; i <= na; i++) {
      gu.push([]); gv.push([]);
      for (let j = 0; j <= nb; j++) {
        const a = (i - na / 2) * cw + (rnd() - 0.5) * 0.4 * cw, b = (j - nb / 2) * ch + (rnd() - 0.5) * 0.4 * ch;
        gu[i].push(cx + a * c - b * s); gv[i].push(cz + a * s + b * c);
      }
    }
    g.save();
    g.beginPath(); g.rect(px(tx), px(tz), T * k + 1, T * k + 1); g.clip();
    const hedgeP = 0.35 + rnd() * 0.35;
    for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) {
      const qu = [gu[i][j], gu[i + 1][j], gu[i + 1][j + 1], gu[i][j + 1]], qv = [gv[i][j], gv[i + 1][j], gv[i + 1][j + 1], gv[i][j + 1]];
      const mu = (qu[0] + qu[2]) / 2, mv = (qv[0] + qv[2]) / 2;
      if (Math.abs(mu - cx) > T * 0.75 || Math.abs(mv - cz) > T * 0.75) continue;
      g.fillStyle = rgb(pick(), (rnd() - 0.5) * 0.12);
      g.beginPath();
      for (let q = 0; q < 4; q++) { const x = px(qu[q]), y = px(qv[q]); if (q) g.lineTo(x, y); else g.moveTo(x, y); }
      g.closePath(); g.fill();
      // hedgerows on the cell's top and left edges
      for (const [a, b] of [[0, 1], [0, 3]] as const) {
        if (rnd() > hedgeP) continue;
        const u0 = qu[a], v0 = qv[a], u1 = qu[b], v1 = qv[b];
        const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
        if (um < tx || um > tx + T || vm < tz || vm > tz + T) continue;
        hedges.push([u0, v0, u1, v1]);
      }
    }
    g.restore();
  }
  // hedge strips and their trees
  g.strokeStyle = rgb([58, 74, 42]);
  g.lineWidth = Math.max(1, 6 * k);
  g.lineCap = 'round';
  const hedgeSpacing = 15;
  for (const [u0, v0, u1, v1] of hedges) {
    g.beginPath(); g.moveTo(px(u0), px(v0)); g.lineTo(px(u1), px(v1)); g.stroke();
    const len = Math.hypot(u1 - u0, v1 - v0);
    for (let d = rnd() * hedgeSpacing; d < len; d += hedgeSpacing * (0.5 + rnd())) {
      const t = d / len, u = u0 + (u1 - u0) * t + (rnd() - 0.5) * 3, v = v0 + (v1 - v0) * t + (rnd() - 0.5) * 3;
      if (free(u, v, 6)) addTree(u, v, 0.85 + rnd() * 0.3);
    }
  }
  // woods: wobbly patches, a dark canopy painted under a ring of edge trees and a sparse interior
  const woodsN = 22;
  for (let w = 0; w < woodsN; w++) {
    const R = 160 + rnd() * 380;
    let wu = 0, wv = 0, ok = false;
    for (let tries = 0; tries < 30 && !ok; tries++) {
      wu = (rnd() * 2 - 1) * (H - R - 200); wv = (rnd() * 2 - 1) * (H - R - 200);
      ok = !idx.near(wu, wv, R * 0.9) && !inAirfield(wu, wv, R + 100) && Math.hypot(wu - VILLAGE.u, wv - VILLAGE.v) > R + 500;
    }
    if (!ok) continue;
    const a1 = rnd() * 6.3, a2 = rnd() * 6.3;
    const rad = (f: number) => R * (1 + 0.22 * Math.sin(3 * f + a1) + 0.14 * Math.sin(5 * f + a2));
    g.fillStyle = rgb(WOOD, (rnd() - 0.5) * 0.1);
    g.beginPath();
    for (let q = 0; q <= 48; q++) { const f = q / 48 * Math.PI * 2, r = rad(f); const x = px(wu + Math.cos(f) * r), y = px(wv + Math.sin(f) * r); if (q) g.lineTo(x, y); else g.moveTo(x, y); }
    g.closePath(); g.fill();
    const per = 2 * Math.PI * R;
    const ringStep = 10;
    for (let d = 0; d < per; d += ringStep) {
      const f = d / R, r = rad(f) - 4 - rnd() * 6;
      const u = wu + Math.cos(f) * r, v = wv + Math.sin(f) * r;
      if (free(u, v, 5)) addTree(u, v, 1.05 + rnd() * 0.25);
    }
    const inner = Math.round(Math.PI * R * R / 700);
    for (let q = 0; q < inner; q++) {
      const f = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (rad(f) - 12);
      const u = wu + Math.cos(f) * r, v = wv + Math.sin(f) * r;
      if (free(u, v, 5)) addTree(u, v, 1.1 + rnd() * 0.3);
    }
  }
  // the airfield: mown grass with lighter stripes, a worn landing strip, a perimeter track
  {
    const c = Math.cos(AIRFIELD.ang), s = Math.sin(AIRFIELD.ang);
    g.save();
    g.translate(px(AIRFIELD.u), px(AIRFIELD.v));
    g.rotate(AIRFIELD.ang);
    const L = AIRFIELD.len * k, W = AIRFIELD.wid * k;
    g.fillStyle = rgb([126, 152, 86]);
    g.fillRect(-L / 2, -W / 2, L, W);
    for (let i = 0; i < 14; i++) { g.fillStyle = i % 2 ? rgb([134, 160, 92]) : rgb([118, 144, 80]); g.fillRect(-L / 2, -W / 2 + (i / 14) * W, L, W / 14); }
    g.fillStyle = rgb([150, 150, 104]);
    g.fillRect(-L * 0.46, -W * 0.08, L * 0.92, W * 0.16);
    g.strokeStyle = rgb([156, 148, 122]);
    g.lineWidth = Math.max(1, 10 * k);
    g.strokeRect(-L * 0.48, -W * 0.44, L * 0.96, W * 0.88);
    g.restore();
    void c; void s;
  }
  // village: gardens and yards around the crossroads
  for (let q = 0; q < 160; q++) {
    const f = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 430;
    const u = VILLAGE.u + Math.cos(f) * r, v = VILLAGE.v + Math.sin(f) * r;
    g.fillStyle = rnd() < 0.5 ? rgb([96, 118, 66], (rnd() - 0.5) * 0.1) : rgb([140, 130, 108], (rnd() - 0.5) * 0.1);
    g.save(); g.translate(px(u), px(v)); g.rotate(rnd() * 3); g.fillRect(-20 * k, -14 * k, (24 + rnd() * 26) * k, (18 + rnd() * 20) * k); g.restore();
  }
  // river banks (the water itself is a ribbon mesh), roads and rail bed
  const strokePath = (p: Path, width: number, col: RGB) => {
    g.strokeStyle = rgb(col); g.lineWidth = Math.max(1, width * k); g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i < p.count; i += 2) { const x = px(p.u[i]), y = px(p.v[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  };
  strokePath(RIVER, 70, [70, 96, 52]);
  strokePath(RIVER, 34, [40, 62, 66]);
  strokePath(ROAD, 13, [128, 120, 98]);
  strokePath(ROAD2, 12, [128, 120, 98]);
  strokePath(RAIL, 12, [104, 98, 88]);

  // poplars along stretches of the roads (French roads lined with trees)
  for (const p of [ROAD, ROAD2]) {
    let on = false;
    for (let i = 0; i < p.count - 1; i += 2) {
      if (i % 60 === 0) on = rnd() < 0.45;
      if (!on || i % 4) continue;
      const du = p.u[i + 1] - p.u[i], dv = p.v[i + 1] - p.v[i], l = Math.hypot(du, dv) || 1;
      for (const side of [1, -1]) {
        const u = p.u[i] - dv / l * 11 * side, v = p.v[i] + du / l * 11 * side;
        if (Math.max(Math.abs(u), Math.abs(v)) > H - 50 || village(u, v) || inAirfield(u, v, 40) || idx.near(u, v, -3)) continue;
        poplars.push({ u, v, h: 18 + rnd() * 7, kind: 1, tint: rnd() });
      }
    }
  }

  // houses: the village along its roads, a few scattered farms (house + barn)
  const placeHouse = (u: number, v: number, ang: number, w: number, d: number, h: number, farm = false) => {
    if (idx.near(u, v, Math.max(w, d) * 0.5 - 4) || inAirfield(u, v, 30)) return false;
    for (const o of houses) if ((o.u - u) ** 2 + (o.v - v) ** 2 < ((Math.max(w, d) + Math.max(o.w, o.d)) * 0.55) ** 2) return false;
    houses.push({ u, v, ang, w, d, h, wall: farm ? 0.3 + rnd() * 0.5 : rnd(), roof: rnd() });
    return true;
  };
  for (const p of [ROAD, ROAD2]) {
    for (let i = 0; i < p.count - 1; i++) {
      const dc = Math.hypot(p.u[i] - VILLAGE.u, p.v[i] - VILLAGE.v);
      if (dc > 430 || rnd() > 0.55) continue;
      const du = p.u[i + 1] - p.u[i], dv = p.v[i + 1] - p.v[i], l = Math.hypot(du, dv) || 1;
      const ang = Math.atan2(du, dv);
      for (const side of [1, -1]) {
        if (rnd() < 0.35) continue;
        const off = 15 + rnd() * 6;
        placeHouse(p.u[i] - dv / l * off * side, p.v[i] + du / l * off * side, ang, 9 + rnd() * 6, 7 + rnd() * 3, 5 + rnd() * 3);
      }
    }
  }
  for (let q = 0; q < 46; q++) {
    const u = (rnd() * 2 - 1) * (H - 400), v = (rnd() * 2 - 1) * (H - 400);
    if (!free(u, v, 40)) continue;
    const ang = rnd() * Math.PI;
    if (placeHouse(u, v, ang, 12 + rnd() * 4, 8, 6, true)) {
      g.fillStyle = rgb([132, 122, 98]);
      g.save(); g.translate(px(u), px(v)); g.rotate(-ang); g.fillRect(-35 * k, -30 * k, 70 * k, 60 * k); g.restore();
      const bu = u + Math.cos(ang) * 26, bv = v - Math.sin(ang) * 26;
      placeHouse(bu, bv, ang + Math.PI / 2, 22 + rnd() * 8, 11, 7, true);
      for (let t = 0; t < 5; t++) { const tu = u + (rnd() - 0.5) * 80, tv = v + (rnd() - 0.5) * 80; if (free(tu, tv, 6) && Math.hypot(tu - u, tv - v) > 22) addTree(tu, tv); }
    }
  }
  // a few lone field trees
  for (let q = 0; q < 300; q++) { const u = (rnd() * 2 - 1) * (H - 100), v = (rnd() * 2 - 1) * (H - 100); if (free(u, v, 8)) addTree(u, v, 1.2); }
  // thin out to the quality's budget (evenly: every tree line keeps its shape, only sparser)
  const thin = <T,>(a: T[], n: number) => { if (a.length <= n) return a; const keep = n / a.length; return a.filter(() => rnd() < keep); };
  return { canvas: cv, trees: thin(trees, treeBudget), houses, poplars: thin(poplars, Math.round(treeBudget * 0.12)) };
}

// ---------------- geometry helpers ----------------

function colored(geo: THREE.BufferGeometry, c: THREE.ColorRepresentation) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const col = new THREE.Color(c);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g;
}
export const vcolored = colored;

function treeGeometry(detail: 0 | 1, poplar: boolean): THREE.BufferGeometry {
  const crown = new THREE.IcosahedronGeometry(1, detail);
  if (poplar) crown.scale(0.24, 0.5, 0.24).translate(0, 0.55, 0); else crown.scale(0.42, 0.36, 0.42).translate(0, 0.6, 0);
  // break up the perfect silhouette a little
  const p = crown.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.12 * Math.sin(x * 23 + y * 17) * Math.cos(z * 19);
    p.setXYZ(i, x * k, y, z * k);
  }
  const parts = [colored(crown, poplar ? 0x3f5a2c : 0x48632f)];
  if (detail) parts.push(colored(new THREE.CylinderGeometry(0.035, 0.05, 0.4, 5).translate(0, 0.2, 0), 0x4a3a2a));
  const g = mergeVertices(mergeGeometries(parts)!);
  g.computeVertexNormals();
  return g;
}

function houseGeometries() {
  const walls = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  // gabled roof: a prism from y 1 to 1.55 along z, slight overhang
  const sh = new THREE.Shape();
  sh.moveTo(-0.56, 0); sh.lineTo(0.56, 0); sh.lineTo(0, 0.55); sh.closePath();
  const roof = new THREE.ExtrudeGeometry(sh, { depth: 1.06, bevelEnabled: false }).translate(0, 1, -0.53);
  return { walls: colored(walls, 0xffffff), roof: colored(roof.toNonIndexed(), 0xffffff) };
}

function ribbon(p: Path, width: number, lift: number, tile: number, from = 0, to = p.count - 1, edgeDrop = 0): THREE.BufferGeometry {
  const n = to - from + 1;
  const pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), nor = new Float32Array(n * 2 * 3);
  const idx: number[] = [];
  for (let k = 0; k < n; k++) {
    const i = from + k;
    const a = Math.max(from, i - 1), b = Math.min(to, i + 1);
    let du = p.u[b] - p.u[a], dv = p.v[b] - p.v[a];
    const l = Math.hypot(du, dv) || 1; du /= l; dv /= l;
    for (let sd = 0; sd < 2; sd++) {
      const side = sd ? 1 : -1;
      const u = p.u[i] - dv * width / 2 * side, v = p.v[i] + du * width / 2 * side;
      const j = k * 2 + sd;
      pos[j * 3] = u; pos[j * 3 + 1] = terrainHeight(u, v) + lift - edgeDrop; pos[j * 3 + 2] = v;
      nor[j * 3 + 1] = 1;
      uv[j * 2] = sd; uv[j * 2 + 1] = p.s[i] / tile;
    }
    if (k < n - 1) { const j = k * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function stripTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Where a path crosses the river (for bridges): sample indices with a sign change
function riverCrossings(p: Path): number[] {
  const out: number[] = [];
  for (let i = 1; i < p.count; i++) {
    const a = p.u[i - 1] - riverU(p.v[i - 1]), b = p.u[i] - riverU(p.v[i]);
    if (a * b <= 0 && Math.max(Math.abs(p.u[i]), Math.abs(p.v[i])) < GRID_INNER) out.push(i);
  }
  return out;
}

// ---------------- the countryside ----------------

interface Chunk { near: THREE.InstancedMesh[]; far: THREE.InstancedMesh[]; cx: number; cz: number }

export class Countryside {
  readonly group = new THREE.Group();
  private chunks: Chunk[] = [];
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private tex: THREE.Texture[] = [];
  readonly stats = { trees: 0, poplars: 0, houses: 0, ms: 0 };
  onFrame: (() => void) | null = null;   // called while the ground is drawn (StrafeOps: notices the menu)

  constructor(quality: 'low' | 'medium' | 'high' | 'ultra' = 'high') {
    const t0 = performance.now();
    this.group.name = 'countryside';
    const hi = quality === 'high' || quality === 'ultra';
    const S = hi ? 2048 : 1024;
    const painted = paintMap(S, hi ? 9000 : quality === 'medium' ? 6000 : 3500);
    this.buildGround(painted.canvas, hi ? 256 : 192);
    this.buildRibbons();
    this.buildTrees(painted.trees, painted.poplars);
    this.buildHouses(painted.houses);
    this.buildLandmarks();
    this.stats.trees = painted.trees.length; this.stats.poplars = painted.poplars.length; this.stats.houses = painted.houses.length;
    this.stats.ms = Math.round(performance.now() - t0);
  }

  // ----- coordinates: the group sits at (mapOrigin - floating origin); map = local - group.position
  heightAt(u: number, v: number) { return terrainHeight(u, v); }
  // ground height under a scene-space point
  groundY(x: number, z: number) { return terrainHeight(x - this.group.position.x, z - this.group.position.z); }
  toLocal(u: number, v: number, out: THREE.Vector3, dy = 0) { return out.set(u + this.group.position.x, terrainHeight(u, v) + dy, v + this.group.position.z); }
  toMap(p: THREE.Vector3, out: THREE.Vector2) { return out.set(p.x - this.group.position.x, p.z - this.group.position.z); }

  private keep<T extends THREE.Material>(m: T) { this.mats.push(m); return m; }
  private keepG<T extends THREE.BufferGeometry>(g: T) { this.geos.push(g); return g; }

  private buildGround(canvas: HTMLCanvasElement, N: number) {
    const Q = (GRID_FAR - GRID_INNER * (1 + 0.4 / 0.6)) / 0.16;
    const warp = (a: number) => { const s = Math.abs(a); const d = s <= 0.6 ? GRID_INNER * s / 0.6 : GRID_INNER + (s - 0.6) * GRID_INNER / 0.6 + (s - 0.6) ** 2 * Q; return Math.sign(a) * d; };
    const pos = new Float32Array((N + 1) * (N + 1) * 3);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const u = warp(i / N * 2 - 1), v = warp(j / N * 2 - 1);
      const o = (j * (N + 1) + i) * 3;
      pos[o] = u; pos[o + 1] = terrainHeight(u, v); pos[o + 2] = v;
    }
    const idx: number[] = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = this.keepG(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.anisotropy = 8;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex.push(tex);
    const mat = this.keep(new THREE.MeshLambertMaterial({ color: 0xffffff }));
    patch(mat, { key: 'ground', vertHead: 'varying vec3 vMap;', vertBody: 'vMap = position;', fragHead: GROUND_FRAG_HEAD, fragColor: GROUND_FRAG });
    const inner = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      inner(sh, r);
      sh.uniforms.uCountry = { value: tex };
      sh.uniforms.uMapHalf = { value: MAP_HALF };
    };
    const m = new THREE.Mesh(geo, mat);
    m.name = 'country_ground';
    m.onBeforeRender = () => this.onFrame?.();
    m.receiveShadow = true;
    m.frustumCulled = false;
    this.group.add(m);
  }

  private buildRibbons() {
    // road: pale tarmac with worn edges and grass creeping in
    const roadTex = stripTexture(32, 128, (g) => {
      g.fillStyle = '#8f8775'; g.fillRect(0, 0, 32, 128);
      for (let i = 0; i < 260; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(60,56,48,0.25)' : 'rgba(170,162,140,0.25)'; g.fillRect(Math.random() * 32, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 3); }
      g.fillStyle = 'rgba(88,104,60,0.75)'; g.fillRect(0, 0, 3, 128); g.fillRect(29, 0, 3, 128);
      g.fillStyle = 'rgba(70,64,52,0.35)'; g.fillRect(8, 0, 3, 128); g.fillRect(21, 0, 3, 128);   // wheel ruts
    });
    // rail: ballast, dark sleepers, two steel rails
    const railTex = stripTexture(64, 128, (g) => {
      g.fillStyle = '#6f685d'; g.fillRect(0, 0, 64, 128);
      for (let i = 0; i < 400; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(40,38,34,0.3)' : 'rgba(150,144,132,0.3)'; g.fillRect(Math.random() * 64, Math.random() * 128, 1, 1); }
      g.fillStyle = '#3b2e24';
      for (let y = 0; y < 128; y += 10.67) g.fillRect(12, y, 40, 4.5);
      g.fillStyle = '#9a9a98'; g.fillRect(20, 0, 2.5, 128); g.fillRect(41.5, 0, 2.5, 128);
      g.fillStyle = '#4a4744'; g.fillRect(22.5, 0, 1, 128); g.fillRect(44, 0, 1, 128);
    });
    this.tex.push(roadTex, railTex);
    const mk = (map: THREE.Texture, off: number) => this.keep(patch(new THREE.MeshLambertMaterial({ map, polygonOffset: true, polygonOffsetFactor: off, polygonOffsetUnits: off }), { key: 'ribbon' }));
    const roadMat = mk(roadTex, -2), railMat = mk(railTex, -3);
    const water = this.keep(patch(new THREE.MeshStandardMaterial({ color: 0x1e3134, roughness: 0.1, metalness: 0.15, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), { key: 'water' }));
    const add = (g: THREE.BufferGeometry, m: THREE.Material, name: string) => {
      const mesh = new THREE.Mesh(this.keepG(g), m);
      mesh.name = name; mesh.receiveShadow = true;
      this.group.add(mesh);
    };
    const endR = RAIL.nearest(TUNNEL.u, TUNNEL.v);
    const railEnd = Math.max(1, Math.round(endR / RAIL.s[1]));
    add(ribbon(RAIL, 6.5, 0.45, 8, 0, Math.min(RAIL.count - 1, railEnd)), railMat, 'country_rail');
    add(ribbon(ROAD, 7.5, 0.3, 20), roadMat, 'country_road');
    add(ribbon(ROAD2, 6.5, 0.3, 20), roadMat, 'country_road2');
    add(ribbon(RIVER, 30, 0.15, 30, 0, RIVER.count - 1, 0), water, 'country_river');
    // bridges where the road / rail cross the river: a deck with low parapets
    const stone = this.keep(patch(new THREE.MeshLambertMaterial({ color: 0x8c8478 }), { key: 'haze' }));
    for (const [p, w, lift] of [[ROAD, 8.5, 0.6], [ROAD2, 7.5, 0.6], [RAIL, 7.5, 0.8]] as [Path, number, number][]) {
      for (const i of riverCrossings(p)) {
        const du = p.u[Math.min(p.count - 1, i + 1)] - p.u[i - 1], dv = p.v[Math.min(p.count - 1, i + 1)] - p.v[i - 1];
        const ang = Math.atan2(du, dv);
        const u = p.u[i], v = p.v[i];
        const y = Math.max(terrainHeight(u - 30 * Math.sin(ang), v - 30 * Math.cos(ang)), terrainHeight(u + 30 * Math.sin(ang), v + 30 * Math.cos(ang))) + lift;
        const deck = new THREE.BoxGeometry(w, 1.2, 64).translate(0, -0.6, 0);
        const parL = new THREE.BoxGeometry(0.5, 1, 64).translate(w / 2, 0.5, 0), parR = parL.clone().translate(-w, 0, 0);
        const pier = new THREE.BoxGeometry(w * 0.8, 8, 3).translate(0, -5, 0);
        const g = mergeGeometries([deck, parL, parR, pier])!;
        const m = new THREE.Mesh(this.keepG(g), stone);
        m.position.set(u, y, v); m.rotation.y = ang;
        m.name = 'country_bridge';
        this.group.add(m);
      }
    }
  }

  private buildTrees(trees: TreeSpot[], poplars: TreeSpot[]) {
    const broad = [this.keepG(treeGeometry(1, false)), this.keepG(treeGeometry(0, false))];
    const tall = [this.keepG(treeGeometry(1, true)), this.keepG(treeGeometry(0, true))];
    const mat = this.keep(patch(new THREE.MeshLambertMaterial({ vertexColors: true }), { key: 'trees' }));
    const byChunk = new Map<number, { cx: number; cz: number; b: TreeSpot[]; p: TreeSpot[] }>();
    const put = (t: TreeSpot, pop: boolean) => {
      const cx = Math.floor(t.u / CHUNK), cz = Math.floor(t.v / CHUNK), key = cx * 1000 + cz;
      let c = byChunk.get(key);
      if (!c) byChunk.set(key, c = { cx, cz, b: [], p: [] });
      (pop ? c.p : c.b).push(t);
    };
    trees.forEach((t) => put(t, false));
    poplars.forEach((t) => put(t, true));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    const yAxis = new THREE.Vector3(0, 1, 0);
    for (const c of byChunk.values()) {
      const chunk: Chunk = { near: [], far: [], cx: (c.cx + 0.5) * CHUNK, cz: (c.cz + 0.5) * CHUNK };
      for (const [list, geos] of [[c.b, broad], [c.p, tall]] as [TreeSpot[], THREE.BufferGeometry[]][]) {
        if (!list.length) continue;
        const near = new THREE.InstancedMesh(geos[0], mat, list.length);
        list.forEach((t, i) => {
          const w = t.kind ? t.h * 0.95 : t.h * (0.9 + t.tint * 0.35);
          p.set(t.u, terrainHeight(t.u, t.v) - 0.4, t.v);
          q.setFromAxisAngle(yAxis, t.tint * 6.28);
          s.set(w, t.h, w);
          near.setMatrixAt(i, m4.compose(p, q, s));
          col.setRGB(0.82 + t.tint * 0.34, 0.85 + ((t.tint * 7.3) % 1) * 0.3, 0.8 + ((t.tint * 3.1) % 1) * 0.25);
          near.setColorAt(i, col);
        });
        near.computeBoundingSphere();
        const far = new THREE.InstancedMesh(geos[1], mat, list.length);
        far.instanceMatrix = near.instanceMatrix;
        far.instanceColor = near.instanceColor;
        far.boundingSphere = near.boundingSphere!.clone();
        for (const m of [near, far]) { m.castShadow = false; m.receiveShadow = false; m.name = 'country_trees'; this.group.add(m); }
        chunk.near.push(near); chunk.far.push(far);
      }
      this.chunks.push(chunk);
    }
  }

  private buildHouses(houses: HouseSpot[]) {
    const { walls, roof } = houseGeometries();
    this.keepG(walls); this.keepG(roof);
    const wm = this.keep(patch(new THREE.MeshLambertMaterial({ vertexColors: true }), { key: 'houses' }));
    const W = new THREE.InstancedMesh(walls, wm, houses.length), R = new THREE.InstancedMesh(roof, wm, houses.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    const WALLS = [0xd9cdb4, 0xcfc2a6, 0xbfb29a, 0xe3dccb, 0xa89c88], ROOFS = [0x7a3b2a, 0x6a3324, 0x4b4d52, 0x5c5048, 0x8a4a33];
    houses.forEach((h, i) => {
      p.set(h.u, terrainHeight(h.u, h.v) - 0.3, h.v);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), h.ang);
      s.set(h.d, h.h, h.w);
      W.setMatrixAt(i, m4.compose(p, q, s));
      R.setMatrixAt(i, m4);
      W.setColorAt(i, c.setHex(WALLS[Math.floor(h.wall * WALLS.length)]));
      R.setColorAt(i, c.setHex(ROOFS[Math.floor(h.roof * ROOFS.length)]));
    });
    for (const m of [W, R]) { m.computeBoundingSphere(); m.name = 'country_houses'; m.receiveShadow = true; this.group.add(m); }
  }

  private buildLandmarks() {
    const mat = this.keep(patch(new THREE.MeshLambertMaterial({ vertexColors: true }), { key: 'landmarks' }));
    const add = (g: THREE.BufferGeometry, u: number, v: number, ang = 0, name = 'country_landmark', dy = 0) => {
      const m = new THREE.Mesh(this.keepG(g), mat);
      m.position.set(u, terrainHeight(u, v) + dy, v); m.rotation.y = ang; m.name = name;
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    // village church: nave, square tower, slate spire
    const nave = colored(new THREE.BoxGeometry(11, 9, 24).translate(0, 4.5, 0), 0xcfc4ab);
    const naveRoof = colored(new THREE.CylinderGeometry(0.01, 8, 6, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 2.1).translate(0, 12, 0), 0x4b4d52);
    const tower = colored(new THREE.BoxGeometry(7, 22, 7).translate(0, 11, -14), 0xc6bba2);
    const spire = colored(new THREE.ConeGeometry(5, 16, 4).rotateY(Math.PI / 4).translate(0, 30, -14), 0x45474c);
    add(mergeGeometries([nave, naveRoof, tower, spire])!, VILLAGE.u + 40, VILLAGE.v - 30, 0.4, 'country_church');
    // station by the line at the village
    const sp = new THREE.Vector2(), sd = new THREE.Vector2();
    RAIL.at(RAIL.nearest(VILLAGE.u, VILLAGE.v + 500), sp, sd);
    const st = mergeGeometries([colored(new THREE.BoxGeometry(18, 6, 8).translate(0, 3, 0), 0xc8b89a), colored(new THREE.CylinderGeometry(0.01, 7, 3.5, 4, 1).rotateY(Math.PI / 4).scale(1.9, 1, 0.9).translate(0, 7.7, 0), 0x6a3324)])!;
    add(st, sp.x - sd.y * 14, sp.y + sd.x * 14, Math.atan2(sd.x, sd.y) + Math.PI / 2, 'country_station');
    // airfield: three arched hangars and a small control tower on the north side
    const c = Math.cos(AIRFIELD.ang), s = Math.sin(AIRFIELD.ang);
    const hangar = mergeGeometries([
      colored(new THREE.CylinderGeometry(14, 14, 36, 14, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), 0x5d6352),
      colored(new THREE.CircleGeometry(14, 14, 0, Math.PI).translate(0, 0, 18), 0x2c2f28),
      colored(new THREE.CircleGeometry(14, 14, 0, Math.PI).rotateY(Math.PI).translate(0, 0, -18), 0x4a4e42),
    ])!;
    for (let i = 0; i < 3; i++) {
      const a = -500 + i * 140, b = -AIRFIELD.wid / 2 - 70;
      add(hangar.clone(), AIRFIELD.u + a * c - b * s, AIRFIELD.v + a * s + b * c, -AIRFIELD.ang, 'country_hangar');
    }
    {
      const a = -100, b = -AIRFIELD.wid / 2 - 60;
      add(mergeGeometries([colored(new THREE.BoxGeometry(9, 8, 9).translate(0, 4, 0), 0xd0c6b0), colored(new THREE.BoxGeometry(6, 3, 6).translate(0, 9.5, 0), 0x9a978c)])!, AIRFIELD.u + a * c - b * s, AIRFIELD.v + a * s + b * c, -AIRFIELD.ang, 'country_tower');
    }
    // the railway tunnel: a stone portal with a black arch in the flank of the hill
    {
      const dir = new THREE.Vector2(); RAIL.at(RAIL.length, sp, dir);
      const ang = Math.atan2(dir.x, dir.y);
      const face = colored(new THREE.BoxGeometry(26, 16, 3).translate(0, 8, 1.5), 0x8a8274);
      const arch = colored(new THREE.CircleGeometry(4.2, 16, 0, Math.PI).translate(0, 5.2, 0.05), 0x050505);
      const box = colored(new THREE.PlaneGeometry(8.4, 5.2).translate(0, 2.6, 0.05), 0x050505);
      const mound = colored(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(60, 34, 70).translate(0, -4, 46), 0x3c5230);
      const g = mergeGeometries([face, arch.rotateY(Math.PI), box.rotateY(Math.PI), mound])!;
      add(g, TUNNEL.u, TUNNEL.v, ang, 'country_tunnel', -0.5);
    }
  }

  // Per frame: tree LOD by chunk distance (cheap: ~60 chunks)
  update(camera: THREE.Camera) {
    const cu = camera.position.x - this.group.position.x, cz = camera.position.z - this.group.position.z;
    for (const c of this.chunks) {
      const near = Math.hypot(c.cx - cu, c.cz - cz) < LOD_NEAR;
      for (const m of c.near) m.visible = near;
      for (const m of c.far) m.visible = !near;
    }
  }

  // Shown for a low-level operation: haze on, sky dome ground haze matched
  show(scene: THREE.Scene, on: boolean) {
    if (on && this.group.parent !== scene) scene.add(this.group);
    if (!on && this.group.parent) this.group.removeFromParent();
    skyGround.uGroundHaze.value = on ? HAZE_LOW * 1.05 : 24000;
  }

  dispose() {
    this.show(this.group.parent as THREE.Scene, false);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.tex) t.dispose();
    for (const c of this.chunks) for (const m of [...c.near, ...c.far]) m.dispose();
  }
}

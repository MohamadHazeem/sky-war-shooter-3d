import * as THREE from 'three';
import { Atmos } from '../render/Atmosphere';

// Dust hanging in the waist section. Tiny additive specks drift slowly inside a 2 m box;
// a speck whose sun-ward ray leaves the fuselage through a side window catches the shaft
// of light and flares, the rest stay a faint haze. Geometry mirrors buildWaistInterior
// (fuselage ellipse A x B centred on YC, window opening WIN_W wide, WIN_Y0..WIN_Y1 high).

const A = 1.08, B = 1.12, YC = 0.15;      // fuselage half width / half height / centre height
const INNER = 0.93;                        // motes stay a little inside the skin
const AI = A * INNER, BI = B * INNER;
const WIN_W = 0.8, WIN_Y0 = -0.06, WIN_Y1 = 0.55;
const FLOOR = -0.7;                        // above the plank floor
const HALF = 1.0;                          // half size of the 2 m box

// smooth 0..1 ramp from e0 to e1 (works with e0 > e1 too)
const sstep = (e0: number, e1: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export class DustMotes {
  readonly points: THREE.Points;
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;
  private pos: Float32Array;     // bomber-local positions (the points sit at the bomber origin)
  private vel: Float32Array;     // slow drift, m/s
  private ph: Float32Array;      // per-speck phase
  private tw: Float32Array;      // twinkle rate
  private gain: Float32Array;    // per-speck brightness
  private bright: THREE.BufferAttribute;
  private time = 0;

  // centre: box centre in bomber-local space (the waist gun pivot); leftZ/rightZ: window centres
  constructor(private center: THREE.Vector3, private leftZ: number, private rightZ: number, count = 150) {
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.ph = new Float32Array(count);
    this.tw = new Float32Array(count);
    this.gain = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.spawn(i);
      const k = i * 3;
      this.vel[k] = (Math.random() * 2 - 1) * 0.04;
      this.vel[k + 1] = (Math.random() * 2 - 1) * 0.02;
      this.vel[k + 2] = (Math.random() * 2 - 1) * 0.04;
      this.ph[i] = Math.random() * Math.PI * 2;
      this.tw[i] = 0.8 + Math.random() * 2.2;
      this.gain[i] = 0.6 + Math.random() * 0.6;
    }
    const posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.bright = new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', posAttr);
    this.geo.setAttribute('aBright', this.bright);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uViewH: { value: 900 }, uColor: { value: new THREE.Color() } },
      vertexShader: /* glsl */ `
        attribute float aBright;
        uniform float uViewH;
        varying float vB; varying float vFade;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = max(-mv.z, 0.05);
          // specks are ~8 mm across: world diameter -> pixels at this depth
          gl_PointSize = clamp(0.004 * uViewH * projectionMatrix[1][1] / d, 1.0, 10.0);
          vB = aBright;
          vFade = smoothstep(0.15, 0.5, d);   // no blobs when a speck drifts past the eye
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vB; varying float vFade;
        void main() {
          vec2 c = gl_PointCoord * 2.0 - 1.0;
          float a = exp(-dot(c, c) * 3.0) * vFade;
          gl_FragColor = vec4(uColor * vB, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.name = 'dustMotes';
  }

  // Advance the drift and recompute each speck's sunlit brightness.
  // sunLocal: direction towards the sun in bomber-local space; viewH: canvas height in px.
  update(dt: number, sunLocal: THREE.Vector3, viewH: number) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const t = this.time;
    const p = this.pos, v = this.vel, cz = this.center.z;
    const n = this.bright.count;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      const sp = 0.75 + 0.25 * Math.sin(t * 0.5 + this.ph[i]);   // gentle swell in the drift
      p[k] += v[k] * sp * dt;
      p[k + 1] += v[k + 1] * sp * dt;
      p[k + 2] += v[k + 2] * sp * dt;
      // z wraps around the box so specks never pile up on its faces
      const rz = ((p[k + 2] - cz + HALF) % (2 * HALF) + 2 * HALF) % (2 * HALF) - HALF;
      p[k + 2] = cz + rz;
      this.confine(k);
      const lit = this.sunlit(p[k], p[k + 1], p[k + 2], sunLocal);
      this.bright.array[i] = (0.07 + 2.2 * lit) * this.gain[i] * (0.55 + 0.45 * Math.sin(t * this.tw[i] + this.ph[i]));
    }
    this.geo.getAttribute('position').needsUpdate = true;
    this.bright.needsUpdate = true;
    this.mat.uniforms.uViewH.value = viewH;
    this.mat.uniforms.uColor.value.copy(Atmos.sunColor).multiplyScalar(0.8);
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }

  private spawn(i: number) {
    const k = i * 3;
    const c = this.center;
    for (let tries = 0; tries < 40; tries++) {
      const x = c.x + (Math.random() * 2 - 1) * HALF;
      const y = c.y + (Math.random() * 2 - 1) * HALF;
      if (y < FLOOR || this.inside(x, y) > 0.9) continue;
      this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = c.z + (Math.random() * 2 - 1) * HALF;
      return;
    }
    this.pos[k] = c.x; this.pos[k + 1] = c.y; this.pos[k + 2] = c.z;
  }

  // normalised ellipse radius^2 of the (slightly shrunk) fuselage section; >1 is outside
  private inside(x: number, y: number) {
    return (x / AI) ** 2 + ((y - YC) / BI) ** 2;
  }

  // Keep a speck inside the skin (reflecting its drift) and above the floor.
  private confine(k: number) {
    const p = this.pos, v = this.vel;
    const x = p[k], y = p[k + 1] - YC;
    const e = (x / AI) ** 2 + (y / BI) ** 2;
    if (e > 1) {
      const s = 0.99 / Math.sqrt(e);
      p[k] = x * s; p[k + 1] = YC + y * s;
      let nx = x / (AI * AI), ny = y / (BI * BI);
      const inv = 1 / Math.hypot(nx, ny); nx *= inv; ny *= inv;
      const d = v[k] * nx + v[k + 1] * ny;
      if (d > 0) { v[k] -= 2 * d * nx; v[k + 1] -= 2 * d * ny; }
    }
    if (p[k + 1] < FLOOR) { p[k + 1] = FLOOR; if (v[k + 1] < 0) v[k + 1] = -v[k + 1]; }
  }

  // Sunlit fraction (0..1): trace the ray from the speck towards the sun and see whether
  // it leaves the fuselage through a side window opening. Sun direction is bomber-local.
  private sunlit(x: number, y: number, z: number, s: THREE.Vector3): number {
    const Y = y - YC;
    const Cq = (x / A) ** 2 + (Y / B) ** 2 - 1;          // < 0 inside the skin
    const Aq = (s.x / A) ** 2 + (s.y / B) ** 2;
    if (Aq < 1e-6 || Cq >= 0) return 0;
    const Bq = 2 * ((x * s.x) / (A * A) + (Y * s.y) / (B * B));
    const disc = Bq * Bq - 4 * Aq * Cq;
    if (disc < 0) return 0;
    const t = (-Bq + Math.sqrt(disc)) / (2 * Aq);          // exit through the skin, t > 0
    const ex = x + s.x * t, ey = y + s.y * t - YC, ez = z + s.z * t;
    const wz = ex > 0 ? this.leftZ : this.rightZ;          // left window on +x, right on -x
    const zMask = 1 - sstep(WIN_W / 2 - 0.04, WIN_W / 2 + 0.06, Math.abs(ez - wz));
    const yMask = sstep(WIN_Y0 - 0.03, WIN_Y0 + 0.03, ey) * (1 - sstep(WIN_Y1 - 0.03, WIN_Y1 + 0.03, ey));
    return zMask * yMask;
  }
}

// Keep one program owner alive across gunner attach/detach and seat changes.
let warmDust: DustMotes | undefined;
export function warmDustMotes(scene: THREE.Scene, at: THREE.Vector3) {
  warmDust ??= new DustMotes(new THREE.Vector3(), 0, 0, 1);
  const points = warmDust.points;
  points.position.copy(at); scene.add(points);
  return () => scene.remove(points);
}

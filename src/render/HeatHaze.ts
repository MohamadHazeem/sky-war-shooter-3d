import * as THREE from 'three';
import { access } from '../core/Accessibility';

// Heat haze: screen-space refraction behind engine exhausts, around muzzle blasts and in
// the expanding shock ripple of a nearby explosion.
//
// A fixed pool of world-space emitters is drawn as camera-facing billboards (one instanced
// draw) into a small half-float buffer of screen-space offset vectors, additively, with a
// soft depth test against the scene. PostFX then offsets its scene colour lookups by it.
//
// API (other systems call these; nothing is allocated per call):
//   heatHaze.emit(pos, radius, strength?, life?, kind?, trail?)
//       a transient emitter: 'ripple' (explosion shock ring, the default) or 'shimmer'
//       (muzzle blast); `trail` stretches a shimmer along a world vector (the gas flow)
//   heatHaze.attach(object3D, offset, radius, strength?, { trail?, active? }) -> handle
//       a persistent emitter following an object (offset and trail in its local frame);
//       released by handle.detach() or automatically once the object leaves the scene.
//       `active()` returning false hides it for that frame (dead engine, wreck).
// Off on Low (Engine sets `enabled`); 'reduce flashes' (reduce motion) tones it down.

export type HazeKind = 'shimmer' | 'ripple';

export interface HazeHandle {
  strength: number;
  detach(): void;
}

interface Attached extends HazeHandle {
  obj: THREE.Object3D;
  offset: THREE.Vector3;
  trail: THREE.Vector3 | null;
  radius: number;
  active?: () => boolean;
  seed: number;
  seen: boolean;     // has been in the scene (auto-release once it leaves)
  dead: boolean;
}

interface Transient {
  pos: THREE.Vector3;
  trail: THREE.Vector3;
  radius: number;
  strength: number;
  age: number;
  life: number;
  ripple: boolean;
  seed: number;
}

const POOL = 96;          // drawn per frame (nearest first when over budget)
const TRANSIENTS = 48;    // live transient emitters (the oldest is recycled)

const vert = /* glsl */ `
attribute vec4 iPos;      // xyz world position, w radius (m)
attribute vec4 iTrail;    // xyz world trail vector, w kind (0 shimmer, 1 ripple)
attribute vec4 iParams;   // x strength, y age 0..1, z seed, w -
uniform float uNear;
varying vec2 vLocal;      // billboard coords: x along the trail, y across (units of radius)
varying float vLen;       // trail length in radii
varying vec4 vParams;
varying float vKind;
varying float vDist;
varying float vRadius;
void main() {
  float r = iPos.w;
  vec3 c0 = (viewMatrix * vec4(iPos.xyz, 1.0)).xyz;
  vec3 tv = mat3(viewMatrix) * iTrail.xyz;
  // screen-space trail direction and length (in the view plane of the source)
  float tl = length(tv.xy);
  vec2 ax = tl > 1e-4 ? tv.xy / tl : vec2(1.0, 0.0);
  vec2 px = vec2(-ax.y, ax.x);
  float lenR = tl / r;
  // quad: from one radius behind the source to one radius past the trail end
  float u = mix(-1.0, lenR + 1.0, position.x * 0.5 + 0.5);
  vec3 p = c0 + vec3(ax * (u * r) + px * (position.y * r), 0.0);
  p.z += tv.z * clamp(u / max(lenR, 1e-3), 0.0, 1.0);
  // never cross the near plane (a muzzle right at the eye)
  p.z = min(p.z, -uNear * 1.5);
  vLocal = vec2(u, position.y);
  vLen = lenR;
  vParams = iParams;
  vKind = iTrail.w;
  vDist = -c0.z;
  vRadius = r;
  gl_Position = projectionMatrix * vec4(p, 1.0);
}
`;

const frag = /* glsl */ `
precision highp float;
uniform sampler2D tDepth;
uniform mat4 uInvProj;
uniform float uReversed;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uGain;       // x shimmer gain, y ripple gain
varying vec2 vLocal;
varying float vLen;
varying vec4 vParams;
varying float vKind;
varying float vDist;
varying float vRadius;

float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y);
}

float sceneDist(vec2 uv) {
  float d = texture2D(tDepth, uv).r;
  bool sky = uReversed > 0.5 ? d <= 0.0 : d >= 1.0;
  if (sky) return 1e9;
  vec4 vp = uInvProj * vec4(uv * 2.0 - 1.0, uReversed > 0.5 ? d : d * 2.0 - 1.0, 1.0);
  return -vp.z / vp.w;
}

void main() {
  vec2 suv = gl_FragCoord.xy / uRes;
  // soft depth test: geometry in front of the emitter (the gun itself, the canopy frame,
  // the wing over the nacelle) is not distorted
  float sd = sceneDist(suv);
  float vis = smoothstep(-vRadius * 0.6, vRadius * 0.4, sd - vDist);
  if (vis <= 0.0) discard;
  float strength = vParams.x;
  float age = vParams.y;
  float seed = vParams.z;
  vec2 off;
  if (vKind > 0.5) {
    // expanding shock ring: pushes the background outward as it passes
    float rr = length(vLocal);
    float ring = sqrt(age) * 0.95;
    float w = 0.08 + 0.18 * age;
    float prof = exp(-pow((rr - ring) / w, 2.0)) * (rr - ring) / w;
    vec2 dir = rr > 1e-3 ? vLocal / rr : vec2(0.0);
    off = dir * prof * (1.0 - age) * (1.0 - age) * uGain.y;
  } else {
    // capsule falloff around the trail segment; the plume widens and fades downstream
    float along = clamp(vLocal.x, 0.0, vLen);
    float k = vLen > 0.0 ? along / vLen : 0.0;
    float width = 1.0 + 0.8 * k;
    float d = length(vec2(vLocal.x - along, vLocal.y)) / width;
    float fall = 1.0 - smoothstep(0.2, 1.0, d);
    fall *= fall * (1.0 - 0.75 * k);
    if (fall <= 0.0) discard;
    // gas flowing down the trail: noise scrolls along it and boils
    vec2 q = vec2(vLocal.x * 1.6 - uTime * 7.0, vLocal.y * 2.2) + seed * 17.0;
    float t = uTime * 2.3;
    float n1 = vnoise(q + vec2(0.0, t)) - vnoise(q * 1.9 + vec2(3.1, -t * 1.4));
    float n2 = vnoise(q + vec2(5.2, -t)) - vnoise(q * 2.1 + vec2(-1.7, t * 1.2));
    // shimmer from a muzzle is brief: fade over its life
    off = vec2(n1, n2) * fall * (1.0 - age * age) * uGain.x;
  }
  gl_FragColor = vec4(off * strength * vis, 0.0, 1.0);
}
`;

const _v = new THREE.Vector3();
const _t = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class HeatHaze {
  enabled = true;
  gain = 1;           // overall strength (tuning)
  readonly rt: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private mat: THREE.ShaderMaterial;
  private aPos: THREE.InstancedBufferAttribute;
  private aTrail: THREE.InstancedBufferAttribute;
  private aParams: THREE.InstancedBufferAttribute;
  private attached: Attached[] = [];
  private transients: Transient[] = [];
  private live = 0;   // transients in use (packed at the front)
  private seed = 0;
  private time = 0;
  private cand: { d: number; i: number }[] = [];
  private readonly clearColor = new THREE.Color();
  count = 0;          // emitters drawn last frame (dev)

  constructor(reversed: boolean) {
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rt.texture.minFilter = this.rt.texture.magFilter = THREE.LinearFilter;
    const quad = new THREE.PlaneGeometry(2, 2);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 4), 4);
    this.aTrail = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 4), 4);
    this.aParams = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 4), 4);
    for (const a of [this.aPos, this.aTrail, this.aParams]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('iPos', this.aPos);
    this.geo.setAttribute('iTrail', this.aTrail);
    this.geo.setAttribute('iParams', this.aParams);
    this.geo.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uReversed: { value: reversed ? 1 : 0 },
        uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uNear: { value: 0.05 },
        uGain: { value: new THREE.Vector2(0.004, 0.012) },
      },
      vertexShader: vert,
      fragmentShader: frag,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    for (let i = 0; i < TRANSIENTS; i++) {
      this.transients.push({ pos: new THREE.Vector3(), trail: new THREE.Vector3(), radius: 1, strength: 1, age: 0, life: 1, ripple: true, seed: 0 });
    }
  }

  /** A transient emitter: an explosion's shock ripple (default) or a muzzle-blast shimmer. */
  emit(pos: THREE.Vector3, radius: number, strength = 1, life = 0.6, kind: HazeKind = 'ripple', trail?: THREE.Vector3) {
    if (!this.enabled || radius <= 0 || life <= 0) return;
    let e: Transient;
    if (this.live < TRANSIENTS) e = this.transients[this.live++];
    else {
      // pool full: recycle the oldest
      let oi = 0;
      for (let i = 1; i < TRANSIENTS; i++) if (this.transients[i].age / this.transients[i].life > this.transients[oi].age / this.transients[oi].life) oi = i;
      e = this.transients[oi];
    }
    e.pos.copy(pos);
    if (trail) e.trail.copy(trail); else e.trail.set(0, 0, 0);
    e.radius = radius; e.strength = strength; e.age = 0; e.life = life;
    e.ripple = kind === 'ripple';
    e.seed = (this.seed = (this.seed + 0.618034) % 1);
  }

  /** A persistent emitter following `obj` (offset / trail in its local frame). */
  attach(obj: THREE.Object3D, offset: THREE.Vector3, radius: number, strength = 1,
    opts: { trail?: THREE.Vector3; active?: () => boolean } = {}): HazeHandle {
    const a: Attached = {
      obj, offset: offset.clone(), trail: opts.trail?.clone() ?? null, radius, strength, active: opts.active,
      seed: (this.seed = (this.seed + 0.618034) % 1), seen: false, dead: false,
      detach: () => { a.dead = true; },
    };
    this.attached.push(a);
    return a;
  }

  /** Drop every emitter (mission reset). */
  clear() {
    this.live = 0;
    for (const a of this.attached) a.dead = true;
    this.attached.length = 0;
  }

  update(dt: number) {
    this.time += dt;
    for (let i = 0; i < this.live; i++) {
      const e = this.transients[i];
      e.age += dt;
      if (e.age >= e.life) {
        // swap-remove (keep live ones packed)
        const last = this.transients[--this.live];
        this.transients[this.live] = e;
        this.transients[i] = last;
        i--;
      }
    }
    // attached emitters whose object left the scene are released
    let w = 0;
    for (const a of this.attached) {
      if (a.obj.parent) a.seen = true;
      else if (a.seen) a.dead = true;
      if (!a.dead) this.attached[w++] = a;
    }
    this.attached.length = w;
  }

  setReversed(reversed: boolean) { this.mat.uniforms.uReversed.value = reversed ? 1 : 0; }

  setSize(w: number, h: number) {
    this.rt.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.mat.uniforms.uRes.value.set(this.rt.width, this.rt.height);
  }

  /**
   * Draws the offset buffer; returns its texture, or null when nothing is in view (PostFX
   * then skips the lookup).
   */
  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, depth: THREE.Texture): THREE.Texture | null {
    this.count = 0;
    if (!this.enabled) return null;
    _cam.setFromMatrixPosition(camera.matrixWorld);
    const fwd = _t.set(0, 0, -1).transformDirection(camera.matrixWorld).clone();
    // candidates: in front of the camera and close enough to cover more than a few pixels
    const cand = this.cand;
    cand.length = 0;
    const reach = (r: number) => r * 160;
    const nA = this.attached.length;
    for (let i = 0; i < nA; i++) {
      const a = this.attached[i];
      if (!a.obj.parent || a.strength <= 0 || (a.active && !a.active())) continue;
      a.obj.updateWorldMatrix(false, false);
      _v.copy(a.offset).applyMatrix4(a.obj.matrixWorld);
      const d = _v.distanceTo(_cam);
      const along = _v.sub(_cam).dot(fwd);
      const len = a.trail ? a.trail.length() : 0;
      if (d > reach(a.radius) || along < -(a.radius + len)) continue;
      cand.push({ d, i });
    }
    for (let i = 0; i < this.live; i++) {
      const e = this.transients[i];
      const d = e.pos.distanceTo(_cam);
      const along = _v.copy(e.pos).sub(_cam).dot(fwd);
      if (d > reach(e.radius) * (e.ripple ? 0.5 : 1) || along < -(e.radius + e.trail.length())) continue;
      cand.push({ d, i: -1 - i });
    }
    if (cand.length === 0) return null;
    if (cand.length > POOL) { cand.sort((x, y) => x.d - y.d); cand.length = POOL; }
    const P = this.aPos.array as Float32Array, T = this.aTrail.array as Float32Array, Q = this.aParams.array as Float32Array;
    const calm = access.prefs.reduceMotion;
    let n = 0;
    for (const c of cand) {
      const o = n * 4;
      if (c.i >= 0) {
        const a = this.attached[c.i];
        _v.copy(a.offset).applyMatrix4(a.obj.matrixWorld);
        P[o] = _v.x; P[o + 1] = _v.y; P[o + 2] = _v.z; P[o + 3] = a.radius;
        if (a.trail) {
          a.obj.getWorldQuaternion(_q);
          _t.copy(a.trail).applyQuaternion(_q);
          T[o] = _t.x; T[o + 1] = _t.y; T[o + 2] = _t.z;
        } else { T[o] = T[o + 1] = T[o + 2] = 0; }
        T[o + 3] = 0;
        // far plumes fade out instead of popping
        const fade = 1 - THREE.MathUtils.smoothstep(c.d, reach(a.radius) * 0.6, reach(a.radius));
        Q[o] = a.strength * fade; Q[o + 1] = 0; Q[o + 2] = a.seed; Q[o + 3] = 0;
      } else {
        const e = this.transients[-1 - c.i];
        P[o] = e.pos.x; P[o + 1] = e.pos.y; P[o + 2] = e.pos.z;
        // a ripple's billboard covers its final ring
        P[o + 3] = e.radius;
        T[o] = e.trail.x; T[o + 1] = e.trail.y; T[o + 2] = e.trail.z; T[o + 3] = e.ripple ? 1 : 0;
        Q[o] = e.strength * (e.ripple ? access.flash : 1); Q[o + 1] = Math.min(1, e.age / e.life); Q[o + 2] = e.seed; Q[o + 3] = 0;
      }
      n++;
    }
    this.count = n;
    for (const a of [this.aPos, this.aTrail, this.aParams]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * 4);
      a.needsUpdate = true;
    }
    this.geo.instanceCount = n;
    const u = this.mat.uniforms;
    u.tDepth.value = depth;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uTime.value = this.time;
    u.uNear.value = camera.near;
    // offsets are in uv units; 'reduce motion' halves the constant shimmer
    u.uGain.value.set(0.01 * (calm ? 0.5 : 1) * this.gain, 0.02 * this.gain);
    const prevClear = renderer.getClearColor(this.clearColor), prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    const layers = camera.layers.mask;
    camera.layers.set(0);
    renderer.render(this.scene, camera);
    camera.layers.mask = layers;
    renderer.setClearColor(prevClear, prevAlpha);
    return this.rt.texture;
  }
}

/** The game's heat-haze emitters (Engine draws them; World, GunnerController and Effects feed them). */
export const heatHaze = new HeatHaze(true);

import * as THREE from 'three';
import { Atmos } from './Atmosphere';

// Condensation trails: one camera-facing ribbon per engine. Each ribbon is a ring
// buffer of world-space points; the ribbon starts a little behind the engine (the
// condensation gap), widens and drifts as it ages, and fades out.
const PTS = 90;           // points per trail
const INTERVAL = 0.18;    // seconds between points
const LIFE = PTS * INTERVAL;

interface Trail { emit: () => THREE.Vector3 | null; px: Float32Array; born: Float32Array; head: number; last: number; alive: boolean }

export class Contrails {
  readonly mesh: THREE.Mesh;
  private trails: Trail[] = [];
  private geo = new THREE.BufferGeometry();
  private pos: THREE.BufferAttribute;
  private dir: THREE.BufferAttribute;
  private age: THREE.BufferAttribute;
  private seed: THREE.BufferAttribute;
  private max: number;
  enabled = true;
  private mat: THREE.ShaderMaterial;

  constructor(maxTrails = 64) {
    this.max = maxTrails;
    const nv = maxTrails * PTS * 2;
    this.pos = new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.dir = new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.age = new THREE.BufferAttribute(new Float32Array(nv), 1).setUsage(THREE.DynamicDrawUsage);
    const side = new Float32Array(nv);
    const seed = new Float32Array(nv);
    const idx: number[] = [];
    for (let t = 0; t < maxTrails; t++) {
      for (let i = 0; i < PTS; i++) {
        const v = (t * PTS + i) * 2;
        side[v] = -1; side[v + 1] = 1;
        seed[v] = seed[v + 1] = t * 7.31;
        if (i < PTS - 1) idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
    this.seed = new THREE.BufferAttribute(seed, 1);
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('aDir', this.dir);
    this.geo.setAttribute('aAge', this.age);
    this.geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    this.geo.setAttribute('aSeed', this.seed);
    this.geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uLife: { value: LIFE }, uSun: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec3 aDir; attribute float aAge; attribute float aSide; attribute float aSeed;
        uniform float uLife; uniform float uTime;
        varying float vAlpha; varying float vSide; varying float vT; varying float vSeed; varying float vNear;
        void main() {
          float t = clamp(aAge / uLife, 0.0, 1.0);
          float width = mix(0.4, 7.5, pow(t, 0.6));
          vec3 toCam = normalize(cameraPosition - position);
          vec3 d = normalize(aDir + 1e-5);
          vec3 side = normalize(cross(d, toCam));
          // slow drift and spread as the trail ages
          vec3 p = position + side * aSide * width + vec3(sin(aSeed + t * 3.0) * t * 6.0, -t * 9.0, cos(aSeed * 1.3 + t * 2.0) * t * 6.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          float gap = smoothstep(0.012, 0.05, t);   // condensation gap behind the engine
          float fade = 1.0 - smoothstep(0.55, 1.0, t);
          vAlpha = aAge < 0.0 ? 0.0 : gap * fade;
          vSide = aSide; vT = t; vSeed = aSeed;
          vNear = smoothstep(18.0, 70.0, distance(cameraPosition, p));
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunCol;
        varying float vAlpha; varying float vSide; varying float vT; varying float vSeed; varying float vNear;
        void main() {
          float edge = 1.0 - vSide * vSide;
          float a = vAlpha * edge * mix(0.9, 0.35, vT) * vNear;
          // a little break-up along the trail
          a *= 0.8 + 0.2 * sin(vT * 90.0 + vSeed);
          vec3 col = uSunCol * 0.75 + vec3(0.45, 0.5, 0.58);
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.userData.noRebase = true;
    this.geo.setDrawRange(0, 0);
  }

  add(emit: () => THREE.Vector3 | null) {
    if (this.trails.length >= this.max) return;
    const born = new Float32Array(PTS).fill(-1e9);
    this.trails.push({ emit, px: new Float32Array(PTS * 3), born, head: 0, last: -1e9, alive: true });
  }

  clear() { this.trails = []; this.geo.setDrawRange(0, 0); }

  rebase(off: THREE.Vector3) {
    for (const tr of this.trails) for (let i = 0; i < PTS; i++) { tr.px[i * 3] -= off.x; tr.px[i * 3 + 1] -= off.y; tr.px[i * 3 + 2] -= off.z; }
  }

  update(time: number) {
    const u = this.mat.uniforms;
    u.uTime.value = time;
    u.uSunCol.value.copy(Atmos.sunColor).multiplyScalar(Atmos.sunIntensity * 0.32);
    this.mesh.visible = this.enabled;
    if (!this.enabled) return;
    const P = this.pos.array as Float32Array, D = this.dir.array as Float32Array, A = this.age.array as Float32Array;
    const tmp = new THREE.Vector3();
    this.trails.forEach((tr, ti) => {
      if (time - tr.last >= INTERVAL) {
        const p = tr.emit();
        if (p) {
          tr.head = (tr.head + 1) % PTS;
          tr.px[tr.head * 3] = p.x; tr.px[tr.head * 3 + 1] = p.y; tr.px[tr.head * 3 + 2] = p.z;
          tr.born[tr.head] = time;
          tr.last = time;
        } else tr.last = time;
      }
      // newest point follows the emitter continuously so the trail is attached
      const live = tr.emit();
      for (let k = 0; k < PTS; k++) {
        const i = (tr.head - k + PTS) % PTS;
        const v = (ti * PTS + k) * 2;
        let x = tr.px[i * 3], y = tr.px[i * 3 + 1], z = tr.px[i * 3 + 2];
        let ageS = time - tr.born[i];
        if (k === 0 && live) { x = live.x; y = live.y; z = live.z; ageS = 0; }
        const j = (i - 1 + PTS) % PTS;
        tmp.set(x - tr.px[j * 3], y - tr.px[j * 3 + 1], z - tr.px[j * 3 + 2]);
        if (k === PTS - 1 || tr.born[j] < -1e8) tmp.set(0, 0, 1);
        const valid = tr.born[i] > -1e8;
        if (!valid && k > 0) {
          // collapse unused points onto the previous one (no streaks to the origin)
          const pv = (ti * PTS + k - 1) * 2;
          x = P[pv * 3]; y = P[pv * 3 + 1]; z = P[pv * 3 + 2];
        }
        for (let s = 0; s < 2; s++) {
          P[(v + s) * 3] = x; P[(v + s) * 3 + 1] = y; P[(v + s) * 3 + 2] = z;
          D[(v + s) * 3] = tmp.x; D[(v + s) * 3 + 1] = tmp.y; D[(v + s) * 3 + 2] = tmp.z;
          A[v + s] = valid ? ageS : -1;
        }
      }
    });
    this.geo.setDrawRange(0, this.trails.length * (PTS - 1) * 6);
    this.pos.needsUpdate = this.dir.needsUpdate = this.age.needsUpdate = true;
  }
}

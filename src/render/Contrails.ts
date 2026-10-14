import * as THREE from 'three';
import { Atmos } from './Atmosphere';
import { cloudOcclusionUniforms, cloudOcclusionGLSL } from './CloudOcclusion';

// Condensation trails: one camera-facing ribbon per engine. Each ribbon is a ring
// buffer of world-space points; the ribbon starts a little behind the engine (the
// condensation gap), widens and drifts as it ages, and fades out.
// Effects 2.0: lit as ice crystals: strong forward (Mie / Henyey-Greenstein) scattering, so a trail
// between the eye and a low sun glows in the sun's own colour (gold at sunset) while one seen
// down-sun stays a dull pink-grey; the sky light comes from the live sky colours.
const PTS = 90;           // points per trail
const INTERVAL = 0.24;    // seconds between points (~22 s, 1.6 km of trail at cruise: long streams, same CPU cost)
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
      uniforms: { ...cloudOcclusionUniforms, uLife: { value: LIFE }, uSun: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uSky: { value: new THREE.Color() }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec3 aDir; attribute float aAge; attribute float aSide; attribute float aSeed;
        uniform float uLife; uniform float uTime; uniform vec3 uSun;
        varying float vDistance; varying float vAlpha; varying float vSide; varying float vT; varying float vSeed; varying float vNear; varying float vSun; varying float vPhase;
        void main() {
          float t = clamp(aAge / uLife, 0.0, 1.0);
          float width = mix(0.4, 7.5, pow(t, 0.6));
          vec3 toCam = normalize(cameraPosition - position);
          vec3 d = normalize(aDir + 1e-5);
          vec3 side = normalize(cross(d, toCam));
          // slow drift and spread as the trail ages
          vec3 p = position + side * aSide * width + vec3(sin(aSeed + t * 3.0) * t * 6.0, -t * 9.0, cos(aSeed * 1.3 + t * 2.0) * t * 6.0);
          // turbulent wobble: each point wanders sideways on its own phase (driven by its
          // age, so it evolves along the length); amplitude grows with age so the head
          // stays pinned to the engine. Both vertices of a point share the offset.
          float wob = sin(aSeed * 1.7 + aAge * 2.3) * 0.7 + sin(aSeed * 3.1 - aAge * 5.7 + 1.3) * 0.3;
          p += side * wob * smoothstep(0.02, 0.5, t) * (0.4 + 1.6 * t);
          p.y += cos(aSeed * 2.1 + aAge * 3.1) * t * 0.5;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          float gap = smoothstep(0.012, 0.05, t);   // condensation gap behind the engine
          float fade = 1.0 - smoothstep(0.55, 1.0, t);
          vAlpha = aAge < 0.0 ? 0.0 : gap * fade;
          vSide = aSide; vT = t; vSeed = aSeed;
          // how much this edge of the ribbon faces the sun (-1 shadow side .. 1 sun side)
          vSun = dot(side * aSide, uSun);
          // Henyey-Greenstein forward scattering toward the eye (g = 0.7), normalised to 1 at 90 degrees
          float cs = dot(normalize(p - cameraPosition), uSun);
          vPhase = (0.51 / pow(1.49 - 1.4 * cs, 1.5)) / (0.51 / pow(1.49, 1.5));
          vDistance = distance(cameraPosition, p);
          vNear = smoothstep(18.0, 70.0, distance(cameraPosition, p));
          // seen end-on a ribbon turns into a flat sheet: fade it out
          vNear *= 1.0 - smoothstep(0.82, 0.97, abs(dot(d, toCam)));
        }`,
      fragmentShader: /* glsl */ `
        ${cloudOcclusionGLSL}
        uniform vec3 uSunCol; uniform vec3 uSky;
        varying float vDistance; varying float vAlpha; varying float vSide; varying float vT; varying float vSeed; varying float vNear; varying float vSun; varying float vPhase;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        void main() {
          float edge = pow(max(0.0, 1.0 - vSide * vSide), 2.0);
          float a = vAlpha * edge * mix(0.9, 0.35, vT) * vNear;
          // a little break-up along the trail
          a *= 0.8 + 0.2 * sin(vT * 90.0 + vSeed);
          // puffy density: slightly denser lumps, and small gaps that open up as it ages
          vec2 q = vec2(vT * 28.0 + fract(vSeed * 0.13) * 40.0, vSide * 1.5 + fract(vSeed * 0.71) * 9.0);
          float puff = vnoise(q) * 0.65 + vnoise(q * 2.3 + 7.1) * 0.35;
          float gaps = smoothstep(0.35, 0.6, vnoise(q * vec2(0.6, 1.4) + 3.7));
          a *= mix(0.8, 1.15, puff) * mix(1.0, mix(0.35, 1.0, gaps), smoothstep(0.15, 0.7, vT));
          // sun-facing edge is a touch brighter than the shadowed edge
          float sunSide = clamp(vSun * 0.5 + 0.5, 0.0, 1.0);
          // Cylinder optical depth: the shaded half sees a longer path through ice (Beer attenuation),
          // on top of the forward-scattering phase and the live sky light.
          float optical = (0.4 + 1.8 * puff) * sqrt(max(0.0, 1.0 - vSide * vSide));
          float transmission = exp(-optical * (1.0 - sunSide));
          float ph = min(vPhase, 9.0);
          vec3 col = uSunCol * (0.45 + 0.4 * ph) * mix(0.55, 1.2, transmission) + uSky;
          // thin young trail toward the sun: a bright filament even where it is barely dense
          a *= 1.0 + 0.25 * smoothstep(1.5, 6.0, ph);
          a = (1.0 - exp(-a * 0.9)) * 0.72;
          gl_FragColor = vec4(col, a * cloudVisibility(vDistance));
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide, forceSinglePass: true,
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
    u.uSun.value.copy(Atmos.sunDir);
    u.uSky.value.setRGB(Atmos.horizon.r * 0.55 + Atmos.zenith.r * 0.45, Atmos.horizon.g * 0.55 + Atmos.zenith.g * 0.45, Atmos.horizon.b * 0.55 + Atmos.zenith.b * 0.45)
      .multiplyScalar(0.8 + Atmos.cloudAmbient * 0.3);
    this.mesh.visible = this.enabled;
    if (!this.enabled) return;
    const P = this.pos.array as Float32Array, D = this.dir.array as Float32Array, A = this.age.array as Float32Array;
    const tmp = _tmp;
    for (let ti = 0; ti < this.trails.length; ti++) {
      const tr = this.trails[ti];
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
    }
    this.geo.setDrawRange(0, this.trails.length * (PTS - 1) * 6);
    this.pos.needsUpdate = this.dir.needsUpdate = this.age.needsUpdate = true;
  }
}

const _tmp = new THREE.Vector3();

import * as THREE from 'three';
import { Atmos } from './Atmosphere';
import { softDepth, SOFT_DEPTH_GLSL } from './SoftDepth';
import { weatherNow } from './WeatherState';

// Smoke trails as continuous ribbon volumes (Effects 2.0).
//
// A damaged engine's trail used to be a row of sprite puffs. Each trail is now also one
// camera-facing ribbon: a ring buffer of world-space nodes laid down along the emitter's path.
// Every node drifts with the air (a quarter of the emitter's velocity, decaying, plus the wind),
// widens with age (faster in a stronger wind: turbulent spreading) and thins as it widens (the same
// smoke over a wider cross-section), so the trail is a tight dark rope at the engine and a broad,
// ragged, translucent band a kilometre back. The fragment shader treats each slice as a cylinder:
// optical depth through the cross-section, eroded by two octaves of scrolling noise, lit by the sun
// on its cylinder normal with forward scattering, sky light from above, soft against the scene
// (SoftDepth) and hazed with distance. The flipbook puffs (Flipbooks.ts) ride on top for detail.
//
// Trails are matched to the stateless Effects.trail() calls by position: a feed continues the
// ribbon whose emitter was last seen where this one would have flown to, else starts a new one.
// One draw call for every ribbon; nothing allocated per frame.

const NODES = 64;          // nodes per ribbon
const STEP = 0.14;         // s between nodes (~9 s of trail)
const LIFE = NODES * STEP;

interface Ribbon {
  px: Float32Array; vx: Float32Array; born: Float32Array; w0: Float32Array; a0: Float32Array; ser: Float32Array; serial: number;
  head: number; count: number; lastNode: number; lastFeed: number;
  ex: number; ey: number; ez: number;   // where the emitter was at the last feed
  evx: number; evy: number; evz: number;
  grey: number; seed: number; active: boolean;
}

export class SmokeRibbons {
  readonly mesh: THREE.Mesh;
  private ribbons: Ribbon[] = [];
  private geo = new THREE.BufferGeometry();
  private aPos: THREE.BufferAttribute;
  private aDir: THREE.BufferAttribute;
  private aInfo: THREE.BufferAttribute;   // age, width, alpha, grey
  private aSer: THREE.BufferAttribute;    // the node's serial number along its trail (noise coordinate)
  private mat: THREE.ShaderMaterial;
  private time = 0;
  enabled = true;

  constructor(readonly max = 40) {
    const nv = max * NODES * 2;
    this.aPos = new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aDir = new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aInfo = new THREE.BufferAttribute(new Float32Array(nv * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSer = new THREE.BufferAttribute(new Float32Array(nv), 1).setUsage(THREE.DynamicDrawUsage);
    const side = new Float32Array(nv), seed = new Float32Array(nv);
    const idx: number[] = [];
    for (let r = 0; r < max; r++) {
      for (let i = 0; i < NODES; i++) {
        const v = (r * NODES + i) * 2;
        side[v] = -1; side[v + 1] = 1;
        seed[v] = seed[v + 1] = r * 7.13;
        if (i < NODES - 1) idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
      this.ribbons.push({
        px: new Float32Array(NODES * 3), vx: new Float32Array(NODES * 3), born: new Float32Array(NODES).fill(-1e9),
        w0: new Float32Array(NODES), a0: new Float32Array(NODES), ser: new Float32Array(NODES), serial: 0, head: 0, count: 0, lastNode: -1e9, lastFeed: -1e9,
        ex: 0, ey: 0, ez: 0, evx: 0, evy: 0, evz: 0, grey: 0.1, seed: r * 7.13, active: false,
      });
    }
    this.geo.setAttribute('position', this.aPos);
    this.geo.setAttribute('aDir', this.aDir);
    this.geo.setAttribute('aInfo', this.aInfo);
    this.geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    this.geo.setAttribute('aSer', this.aSer);
    this.geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: Atmos.sunDir },
        uSunCol: { value: new THREE.Vector3(1, 1, 1) },
        uSky: { value: new THREE.Vector3(0.3, 0.35, 0.45) },
        uHaze: { value: new THREE.Vector3(0.5, 0.6, 0.75) },
        uHazeK: { value: 1 / 30000 },
        ...softDepth.uniforms,
      },
      vertexShader: /* glsl */ `
        attribute vec3 aDir; attribute vec4 aInfo; attribute float aSide; attribute float aSer; attribute float aSeed;
        varying vec3 vSideW; varying vec3 vToCam; varying float vS; varying vec4 vInfo; varying vec2 vAlong; varying float vDist; varying float vEnd;
        void main() {
          vec3 toCam = cameraPosition - position;
          float dist = length(toCam);
          toCam /= max(dist, 1e-3);
          vec3 d = normalize(aDir + 1e-5);
          vec3 side = normalize(cross(d, toCam) + 1e-5);
          float w = aInfo.y;
          vec3 p = position + side * aSide * w;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          vSideW = side; vToCam = toCam; vS = aSide; vInfo = aInfo; vAlong = vec2(aSer, aSeed); vDist = dist;
          // seen end-on a ribbon degenerates into a sheet: fade it there
          vEnd = 1.0 - smoothstep(0.85, 0.98, abs(dot(d, toCam)));
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uHaze; uniform float uHazeK;
        ${SOFT_DEPTH_GLSL}
        varying vec3 vSideW; varying vec3 vToCam; varying float vS; varying vec4 vInfo; varying vec2 vAlong; varying float vDist; varying float vEnd;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        void main() {
          float age = vInfo.x, alpha0 = vInfo.z, grey = vInfo.w;
          if (alpha0 <= 0.001) discard;
          float s = vS;
          float c = sqrt(max(1.0 - s * s, 0.0));          // path length through the round cross-section
          // turbulence: noise in (along the trail, across it), drifting and coarsening with age
          vec2 q = vec2(vAlong.x * 0.55 + vAlong.y, s * (1.2 + age * 0.08) + age * 0.15);
          float n = vnoise(q * vec2(1.0, 1.6) + vec2(0.0, uTime * 0.05)) * 0.65 + vnoise(q * vec2(2.7, 3.1) + 11.3) * 0.35;
          float dens = c * smoothstep(0.15, 0.75, n + c * 0.55 - age * 0.012);
          float a = 1.0 - exp(-dens * alpha0 * 3.0);
          if (a < 0.003) discard;
          // lit as a cylinder: the normal swings from the side to the eye across the ribbon
          vec3 nrm = normalize(vSideW * s + vToCam * c);
          float ndl = dot(nrm, uSunDir);
          float lam = clamp(ndl * 0.6 + 0.4, 0.0, 1.0);
          float fwd = pow(max(dot(-vToCam, uSunDir), 0.0), 8.0) * (1.0 - a) * 2.5;   // sun behind the trail
          vec3 lit = grey * (uSunCol * (lam + fwd) * uSunShadow + uSky * (0.55 + 0.45 * nrm.y));
          float h = 1.0 - exp(-vDist * uHazeK);
          vec3 col = mix(lit, uHaze, h);
          float k = clamp((softScene() - vDist) / (vInfo.y * 0.8 + 1.0), 0.0, 1.0) * smoothstep(2.0, 12.0, vDist) * vEnd;
          gl_FragColor = vec4(col * a * k, a * k);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide, forceSinglePass: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;   // under the puffs and the contrails' neighbours
    this.mesh.userData.noRebase = true;
    this.geo.setDrawRange(0, 0);
  }

  // Lay smoke along an emitter's path. width: rope radius at the source (m); grey: albedo;
  // alpha: density at the source (0..1). Called by Effects.trail on every emission tick.
  feed(pos: THREE.Vector3, vel: THREE.Vector3, width: number, grey: number, alpha: number) {
    if (!this.enabled) return;
    const t = this.time;
    let best: Ribbon | null = null, bestD = Infinity, free: Ribbon | null = null, oldest: Ribbon | null = null;
    for (const r of this.ribbons) {
      if (!r.active) { free ??= r; continue; }
      if (!oldest || r.lastFeed < oldest.lastFeed) oldest = r;
      const since = t - r.lastFeed;
      if (since > 0.6 || since < 0) continue;
      const x = r.ex + r.evx * since - pos.x, y = r.ey + r.evy * since - pos.y, z = r.ez + r.evz * since - pos.z;
      const d = x * x + y * y + z * z;
      const tol = 4 + vel.length() * since * 0.35;
      if (d < tol * tol && d < bestD) { bestD = d; best = r; }
    }
    let r = best;
    if (!r) {
      r = free ?? (oldest && t - oldest.lastFeed > 1 ? oldest : null);
      if (!r) return;
      r.active = true; r.count = 0; r.head = NODES - 1; r.lastNode = -1e9; r.born.fill(-1e9);
      r.grey = grey;
    }
    r.ex = pos.x; r.ey = pos.y; r.ez = pos.z; r.evx = vel.x; r.evy = vel.y; r.evz = vel.z;
    r.lastFeed = t;
    r.grey += (grey - r.grey) * 0.2;
    if (t - r.lastNode >= STEP || r.count === 0) {
      r.head = (r.head + 1) % NODES;
      r.count = Math.min(NODES, r.count + 1);
      r.lastNode = t;
      r.ser[r.head] = ++r.serial;
    }
    // the head node follows the emitter until the next one is laid
    const h = r.head * 3;
    r.px[h] = pos.x; r.px[h + 1] = pos.y; r.px[h + 2] = pos.z;
    r.vx[h] = vel.x * 0.25; r.vx[h + 1] = vel.y * 0.25; r.vx[h + 2] = vel.z * 0.25;
    r.born[r.head] = t; r.w0[r.head] = width; r.a0[r.head] = alpha;
  }

  // live ribbons (tests, dev stats)
  get active() { let n = 0; for (const r of this.ribbons) if (r.active) n++; return n; }

  rebase(off: THREE.Vector3) {
    for (const r of this.ribbons) {
      if (!r.active) continue;
      r.ex -= off.x; r.ey -= off.y; r.ez -= off.z;
      for (let i = 0; i < NODES; i++) { r.px[i * 3] -= off.x; r.px[i * 3 + 1] -= off.y; r.px[i * 3 + 2] -= off.z; }
    }
  }

  clear() {
    for (const r of this.ribbons) r.active = false;
    this.geo.setDrawRange(0, 0);
  }

  update(dt: number) {
    this.time += dt;
    const t = this.time;
    const u = this.mat.uniforms;
    u.uTime.value = t;
    u.uSunCol.value.set(Atmos.sunColor.r, Atmos.sunColor.g, Atmos.sunColor.b).multiplyScalar(Atmos.sunIntensity * 0.55);
    u.uSky.value.set(Atmos.zenith.r * 0.5 + Atmos.horizon.r * 0.5, Atmos.zenith.g * 0.5 + Atmos.horizon.g * 0.5, Atmos.zenith.b * 0.5 + Atmos.horizon.b * 0.5)
      .multiplyScalar(0.75 + Atmos.cloudAmbient * 0.6);
    u.uHaze.value.set(Atmos.horizon.r, Atmos.horizon.g, Atmos.horizon.b);
    u.uHazeK.value = (1 / (32000 * Math.max(0.15, Atmos.haze))) + weatherNow.fog;
    const wx = Atmos.wind.x, wy = Atmos.wind.y, wz = Atmos.wind.z;
    const wind = Math.sqrt(wx * wx + wz * wz);
    const spread = 0.9 + wind * 0.1;    // turbulent widening (m), stronger in a stronger wind
    const drag = Math.exp(-0.7 * dt);
    const S = this.aSer.array as Float32Array, P = this.aPos.array as Float32Array, D = this.aDir.array as Float32Array, I = this.aInfo.array as Float32Array;
    let used = 0;
    for (let ri = 0; ri < this.max; ri++) {
      const r = this.ribbons[ri];
      if (r.active && t - r.lastFeed > LIFE) r.active = false;
      if (r.active) used = ri + 1;
    }
    for (let ri = 0; ri < used; ri++) {
      const r = this.ribbons[ri];
      if (!r.active) {
        // a dead slot below the last live one: drawn, but empty
        for (let q = ri * NODES * 2; q < (ri + 1) * NODES * 2; q++) I[q * 4 + 2] = 0;
        continue;
      }
      // nodes drift with the air
      for (let i = 0; i < NODES; i++) {
        if (r.born[i] < -1e8) continue;
        const k = i * 3;
        r.vx[k] *= drag; r.vx[k + 1] = r.vx[k + 1] * drag + 0.12 * dt; r.vx[k + 2] *= drag;
        if (i !== r.head || t - r.lastFeed > 0.2) {
          r.px[k] += (r.vx[k] + wx) * dt; r.px[k + 1] += (r.vx[k + 1] + wy) * dt; r.px[k + 2] += (r.vx[k + 2] + wz) * dt;
        }
      }
      // write the ribbon (slot `used`), newest node first
      let prev = -1;
      for (let j = 0; j < NODES; j++) {
        const i = (r.head - j + NODES) % NODES;
        const v = (ri * NODES + j) * 2;
        const valid = j < r.count && r.born[i] > -1e8;
        const src = valid ? i : prev;
        const age = valid ? t - r.born[i] : LIFE;
        const k = (src < 0 ? r.head : src) * 3;
        const x = r.px[k], y = r.px[k + 1], z = r.px[k + 2];
        // direction toward the older neighbour
        const o = ((src < 0 ? r.head : src) - 1 + NODES) % NODES;
        let dx = x - r.px[o * 3], dy = y - r.px[o * 3 + 1], dz = z - r.px[o * 3 + 2];
        if (!valid || r.born[o] < -1e8 || j >= r.count - 1) { dx = r.evx; dy = r.evy; dz = r.evz; }
        const w0 = valid ? r.w0[i] : 0;
        // slow at first (a tight rope behind the engine), then spreading like a diffusing plume
        const width = w0 + spread * 1.6 * (Math.sqrt(1 + Math.max(age, 0)) - 1) * (0.6 + w0 * 0.3);
        // fades in just behind the source, thins as it spreads, and dies away at the end of its life
        const head = Math.min(1, age / 0.25 + 0.15);
        const tail = 1 - THREE.MathUtils.smoothstep(age / LIFE, 0.55, 1);
        const alpha = valid ? r.a0[i] * head * tail * Math.min(1, (w0 * 1.6 + 0.6) / (width + 0.6)) : 0;
        for (let s = 0; s < 2; s++) {
          const q = v + s;
          P[q * 3] = x; P[q * 3 + 1] = y; P[q * 3 + 2] = z;
          D[q * 3] = dx; D[q * 3 + 1] = dy; D[q * 3 + 2] = dz;
          I[q * 4] = age; I[q * 4 + 1] = width; I[q * 4 + 2] = alpha; I[q * 4 + 3] = r.grey;
          S[q] = r.ser[src < 0 ? r.head : src];
        }
        if (valid) prev = i;
      }
    }
    this.geo.setDrawRange(0, used * (NODES - 1) * 6);
    const nv = used * NODES * 2;
    this.aPos.clearUpdateRanges(); this.aDir.clearUpdateRanges(); this.aInfo.clearUpdateRanges(); this.aSer.clearUpdateRanges();
    if (nv > 0) {
      this.aPos.addUpdateRange(0, nv * 3); this.aDir.addUpdateRange(0, nv * 3); this.aInfo.addUpdateRange(0, nv * 4); this.aSer.addUpdateRange(0, nv);
      softDepth.want();
    }
    this.aPos.needsUpdate = this.aDir.needsUpdate = this.aInfo.needsUpdate = this.aSer.needsUpdate = true;
  }
}

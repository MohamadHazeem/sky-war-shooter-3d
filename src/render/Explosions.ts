import { DepthSort } from './DepthSort';
import * as THREE from 'three';
import { Atmos } from './Atmosphere';
import { mulberry } from './Particles';

// Volumetric-looking explosions: pooled camera-facing sphere impostors, one instanced draw.
//
// Each instance is a sphere of noisy density marched in a few steps along the view ray
// (ray-sphere intersection on a billboard, 3D noise from a small tileable texture made at
// startup). Two kinds share the material:
//   type 0  volume  fireball / smoke ball: emissive temperature ramp (white-yellow core ->
//                   orange -> dark red -> black smoke) on top of sun-lit smoke (half-lambert
//                   from the sun direction, darker deep inside the ball)
//   type 1  shock   thin expanding shell, bright only at the rim (fresnel-like), additive
// Output is premultiplied alpha, so fire adds light while smoke occludes what is behind it.
// Instances are sorted back to front on the CPU each frame. No depth texture is readable
// during the transparent pass (it belongs to the render target being drawn), so instead of
// soft depth intersection the volumes fade out as their front surface nears the camera.
// Depth test uses the renderer default; three.js flips it for the reversed-Z buffer, exactly
// like the existing particle layers.

const STEPS = 6;

// --- tileable 3D noise (inverted Worley "cauliflower" + value noise), R8, 32^3 ---
function makeFireNoise(size = 32): THREE.Data3DTexture {
  const rnd = mulberry(1913);
  const worley = (cells: number) => {
    const pts = new Float32Array(cells * cells * cells * 3);
    for (let i = 0; i < pts.length; i++) pts[i] = rnd();
    const out = new Float32Array(size * size * size);
    const cs = size / cells;
    for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / cs, py = (y + 0.5) / cs, pz = (z + 0.5) / cs;
      const cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
      let best = 9;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const ix = cx + dx, iy = cy + dy, iz = cz + dz;
        const wx = (ix + cells) % cells, wy = (iy + cells) % cells, wz = (iz + cells) % cells;
        const j = ((wz * cells + wy) * cells + wx) * 3;
        const ox = ix + pts[j] - px, oy = iy + pts[j + 1] - py, oz = iz + pts[j + 2] - pz;
        const d = ox * ox + oy * oy + oz * oz;
        if (d < best) best = d;
      }
      out[(z * size + y) * size + x] = 1 - Math.min(1, Math.sqrt(best));
    }
    return out;
  };
  const value = (cells: number) => {
    const lat = new Float32Array(cells * cells * cells);
    for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    const out = new Float32Array(size * size * size);
    const cs = size / cells;
    const s = (t: number) => t * t * (3 - 2 * t);
    const L = (x: number, y: number, z: number) => lat[(((z % cells) * cells + (y % cells)) * cells) + (x % cells)];
    for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const px = x / cs, py = y / cs, pz = z / cs;
      const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
      const fx = s(px - ix), fy = s(py - iy), fz = s(pz - iz);
      const a = L(ix, iy, iz) + (L(ix + 1, iy, iz) - L(ix, iy, iz)) * fx;
      const b = L(ix, iy + 1, iz) + (L(ix + 1, iy + 1, iz) - L(ix, iy + 1, iz)) * fx;
      const c = L(ix, iy, iz + 1) + (L(ix + 1, iy, iz + 1) - L(ix, iy, iz + 1)) * fx;
      const d = L(ix, iy + 1, iz + 1) + (L(ix + 1, iy + 1, iz + 1) - L(ix, iy + 1, iz + 1)) * fx;
      const e = a + (b - a) * fy, f = c + (d - c) * fy;
      out[(z * size + y) * size + x] = e + (f - e) * fz;
    }
    return out;
  };
  const w1 = worley(4), w2 = worley(8), v = value(16);
  const data = new Uint8Array(size * size * size);
  let lo = 1, hi = 0;
  const raw = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    raw[i] = w1[i] * 0.55 + w2[i] * 0.3 + v[i] * 0.15;
    lo = Math.min(lo, raw[i]); hi = Math.max(hi, raw[i]);
  }
  for (let i = 0; i < data.length; i++) data[i] = Math.round(((raw[i] - lo) / (hi - lo)) * 255);
  const tex = new THREE.Data3DTexture(data, size, size, size);
  tex.format = THREE.RedFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// One pooled instance. Callers get a reset slot from VolumeFX.alloc() and fill it in.
export interface Vol {
  active: boolean;
  type: 0 | 1;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  delay: number;     // s before it appears
  age: number;
  life: number;
  r0: number;        // radius at birth
  r1: number;        // radius it eases out to (time constant growTau)
  growTau: number;
  growth: number;    // m/s of slow expansion after that
  heat0: number;     // fire temperature at birth (0 = plain smoke); shock: rim brightness
  tau: number;       // s, temperature decay
  grey: number;      // smoke albedo
  dens: number;      // optical density multiplier
  billow0: number;   // edge break-up at birth / at death
  billow1: number;
  drag: number;      // 1/s on vel
  rise: number;      // m/s buoyant climb
  windK: number;     // share of the wind it drifts with
  fadeIn: number;    // s
  fadeOut: number;   // share of the life spent fading out
  seed: number;
  prio: number;      // which instance gets stolen when the pool is full (lowest first)
}

function blank(): Vol {
  return {
    active: false, type: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), delay: 0, age: 0, life: 1, r0: 1, r1: 1, growTau: 0.2, growth: 0,
    heat0: 0, tau: 1, grey: 0.08, dens: 1, billow0: 0.5, billow1: 0.8, drag: 0, rise: 0, windK: 0, fadeIn: 0.05, fadeOut: 0.4, seed: 0, prio: 1,
  };
}

const _c = new THREE.Vector3();
const _w = new THREE.Vector3();

// Brightness of an explosion's shock ring for the light of the moment. The ring is a condensation
// flash lit by the sky and the fireball, not a light of its own: at a fixed brightness it stood
// as a white neon ring against a night or dusk sky for ~0.4 s. Scaled with the daylight (key +
// fill): 1 on a clear day, ~0.4 at dusk, ~0.3 in a storm, a faint trace (~0.035) at night.
export function shockLight(): number {
  const day = Math.min(1, (Atmos.sunIntensity / 4.2) * 0.7 + (Atmos.cloudAmbient / 0.6) * 0.3);
  return 0.03 + 0.97 * day * day;
}

export class VolumeFX {
  readonly mesh: THREE.Mesh;
  readonly camPos = new THREE.Vector3();
  hasCam = false;
  private slots: Vol[] = [];
  private order: Int32Array;
  private readonly depthSort: DepthSort;
  private keys: Float32Array;
  private iA: THREE.InstancedBufferAttribute;
  private iB: THREE.InstancedBufferAttribute;
  private iC: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;
  private attrs: THREE.InstancedBufferAttribute[];
  // Uniform loop bound: the program warmed by World.prewarm serves every tier.
  setQuality(low: boolean) { this.uniforms.uSteps.value = low ? 4 : STEPS; }

  private uniforms = {
    uSteps: { value: STEPS },
    tNoise: { value: null as THREE.Data3DTexture | null },
    uSunDir: { value: Atmos.sunDir },
    uSunCol: { value: new THREE.Vector3(1, 1, 1) },
    uAmb: { value: new THREE.Vector3(0.3, 0.35, 0.45) },
  };
  private live = 0;

  constructor(readonly max = 128) {
    for (let i = 0; i < max; i++) this.slots.push(blank());
    this.depthSort = new DepthSort(max);
    this.order = new Int32Array(max);
    this.keys = new Float32Array(max);
    this.uniforms.tNoise.value = makeFireNoise();
    const geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    const A = (k: number) => new THREE.InstancedBufferAttribute(new Float32Array(max * k), k).setUsage(THREE.DynamicDrawUsage);
    this.iA = A(4); this.iB = A(4); this.iC = A(4);
    geo.setAttribute('iA', this.iA); geo.setAttribute('iB', this.iB); geo.setAttribute('iC', this.iC);
    geo.instanceCount = 0;
    this.geo = geo;
    this.attrs = [this.iA, this.iB, this.iC];
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec4 iA; attribute vec4 iB; attribute vec4 iC;
        varying vec3 vWorld; varying vec4 vA; varying vec4 vB; varying vec4 vC;
        void main() {
          vec3 c = iA.xyz; float R = iA.w;
          vec3 toC = c - cameraPosition;
          float d = max(length(toC), 1e-3);
          vec3 n = toC / d;
          vec3 up = abs(n.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
          vec3 u = normalize(cross(n, up));
          vec3 v = cross(u, n); // u x v = -n: the quad faces the eye
          // half-size of the quad (through the centre, facing the eye) that covers the
          // sphere's silhouette cone; capped when the eye is at or inside the sphere
          float hs = R * d / sqrt(max(d * d - R * R, R * R * 0.0625));
          vec3 p = c + (u * position.x + v * position.y) * 2.0 * hs;
          vWorld = p; vA = iA; vB = iB; vC = iC;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        precision highp sampler3D;
        uniform sampler3D tNoise;
        uniform float uSteps;
        uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb;
        varying vec3 vWorld; varying vec4 vA; varying vec4 vB; varying vec4 vC;
        float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        // blackbody-ish ramp, linear HDR: smoke-black -> dark red -> orange -> yellow -> white
        vec3 fireRamp(float T) {
          vec3 c = vec3(0.55, 0.05, 0.0) * smoothstep(0.08, 0.3, T);
          c = mix(c, vec3(3.2, 0.85, 0.12), smoothstep(0.28, 0.55, T));
          c = mix(c, vec3(8.0, 4.2, 1.1), smoothstep(0.55, 0.85, T));
          c = mix(c, vec3(16.0, 13.0, 9.0), smoothstep(0.85, 1.25, T));
          return c;
        }
        void main() {
          vec3 ro = cameraPosition;
          vec3 rd = normalize(vWorld - ro);
          vec3 c = vA.xyz; float R = vA.w;
          vec3 oc = c - ro;
          float b = dot(oc, rd);
          float h = b * b - dot(oc, oc) + R * R;
          if (h <= 0.0) discard;
          h = sqrt(h);
          float t0 = max(b - h, 0.0), t1 = b + h;
          if (t1 <= t0) discard;
          float age = vB.y, seed = vB.z, opacity = vB.w;
          // eye inside or right at the surface: fade instead of filling the screen
          float nearFade = smoothstep(0.5, 4.0 + R * 0.25, t0);
          if (vB.x > 0.5) {
            // shock shell: brightness along the rim, broken up a little by noise
            float rr = clamp(sqrt(max(dot(oc, oc) - b * b, 0.0)) / R, 0.0, 1.0);
            // path length through a thin shell grows toward the rim: a crisp fresnel edge
            float e = (rr - 0.93) / 0.045;
            float rim = exp(-e * e) * (1.0 + 2.0 * smoothstep(0.85, 0.97, rr));
            float nz = texture(tNoise, normalize(ro + rd * b - c) * 0.9 + seed * 11.0).r;
            float s = rim * (0.3 + 1.2 * nz * nz) * vC.x * opacity * nearFade;
            gl_FragColor = vec4(vec3(1.0, 0.88, 0.72) * s * 0.35, s * 0.05);
            return;
          }
          float heat = vC.x, grey = vC.y, dens = vC.z, billow = vC.w;
          float stepLen = (t1 - t0) / uSteps;
          float tt = t0 + stepLen * hash12(gl_FragCoord.xy);
          vec3 drift = vec3(seed * 17.31, seed * 31.7 - age * 0.22, seed * 7.93);
          vec3 albedo = vec3(grey) * vec3(1.0, 0.94, 0.88);
          vec3 acc = vec3(0.0);
          float trans = 1.0;
          for (int i = 0; i < ${STEPS}; i++) {
            if (float(i) >= uSteps) break;
            vec3 q = (ro + rd * tt - c) / R;
            float r = length(q);
            vec3 nq = q * 0.62 + drift;
            float n = texture(tNoise, nq).r * 0.62 + texture(tNoise, nq * 2.71 + 0.31).r * 0.38;
            float s = 1.0 - r;
            float d = clamp((s * 1.15 + (n - 0.58) * billow * 1.5) * 3.0, 0.0, 1.0);
            float a = 1.0 - exp(-d * dens * stepLen / R * 4.0);
            if (a > 0.002) {
              float T = heat * clamp(s * 1.3 + (n - 0.52) * 2.2, 0.0, 1.0);
              vec3 nrm = q / max(r, 1e-3);
              float hl = dot(nrm, uSunDir) * 0.5 + 0.5;
              hl *= hl;
              float shade = mix(0.3, 1.0, clamp(r * 1.25, 0.0, 1.0));
              vec3 col = albedo * (uSunCol * hl * shade + uAmb) + fireRamp(T);
              acc += trans * a * col;
              trans *= 1.0 - a;
              if (trans < 0.02) break;
            }
            tt += stepLen;
          }
          float k = opacity * nearFade;
          gl_FragColor = vec4(acc * k, (1.0 - trans) * k);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 15; // over the particle smoke (10), under glow sparks (20)
    this.mesh.userData.noRebase = true;
    this.mesh.userData.emptyDrawSafe = true; // camera is refreshed by Effects.setCamera; still submitted during prewarm
    // the eye position for LOD, light priority and sorting (one frame old is fine)
    this.mesh.onBeforeRender = (_r, _s, cam) => { cam.getWorldPosition(this.camPos); this.hasCam = true; };
  }

  get count() { return this.live; }
  get free() { return this.max - this.live; }

  camDist(p: THREE.Vector3) { return this.hasCam ? p.distanceTo(this.camPos) : 0; }

  // A reset slot, or null when the pool is full of more important instances
  alloc(prio: number): Vol | null {
    let pick = -1, low = Infinity;
    for (let i = 0; i < this.max; i++) {
      const s = this.slots[i];
      if (!s.active) { pick = i; break; }
      const v = s.prio * (1 - s.age / s.life);
      if (v < low) { low = v; pick = i; }
    }
    if (pick < 0) return null;
    const s = this.slots[pick];
    if (s.active && low >= prio) return null;
    if (!s.active) this.live++;
    s.active = true; s.type = 0; s.delay = 0; s.age = 0; s.life = 1; s.r0 = s.r1 = 1; s.growTau = 0.2; s.growth = 0;
    s.heat0 = 0; s.tau = 1; s.grey = 0.08; s.dens = 1; s.billow0 = 0.5; s.billow1 = 0.8; s.drag = 0; s.rise = 0; s.windK = 0;
    s.fadeIn = 0.05; s.fadeOut = 0.4; s.seed = Math.random(); s.prio = prio;
    s.vel.set(0, 0, 0);
    return s;
  }

  rebase(off: THREE.Vector3) {
    for (const s of this.slots) if (s.active) s.pos.sub(off);
  }

  clear() {
    for (const s of this.slots) s.active = false;
    this.live = 0;
    this.geo.instanceCount = 0;
  }

  update(dt: number) {
    const u = this.uniforms;
    u.uSunCol.value.set(Atmos.sunColor.r, Atmos.sunColor.g, Atmos.sunColor.b).multiplyScalar(Atmos.sunIntensity * 0.55);
    u.uAmb.value.set(
      Atmos.horizon.r * 0.6 + Atmos.zenith.r * 0.4, Atmos.horizon.g * 0.6 + Atmos.zenith.g * 0.4, Atmos.horizon.b * 0.6 + Atmos.zenith.b * 0.4,
    ).multiplyScalar(0.9 + Atmos.cloudAmbient * 0.5);
    const shockK = shockLight();
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      const s = this.slots[i];
      if (!s.active) continue;
      if (s.delay > 0) { s.delay -= dt; s.pos.addScaledVector(s.vel, dt); continue; }
      s.age += dt;
      if (s.age >= s.life) { s.active = false; this.live--; continue; }
      s.vel.multiplyScalar(Math.exp(-s.drag * dt));
      s.pos.addScaledVector(s.vel, dt);
      s.pos.y += s.rise * dt;
      if (s.windK) s.pos.addScaledVector(_w.copy(Atmos.wind), s.windK * dt);
      // nearly faded out: not worth a draw
      const fo = s.fadeOut > 0 ? THREE.MathUtils.smoothstep(s.age / s.life, 1 - s.fadeOut, 1) : 0;
      if (s.type === 0 && 1 - fo < 0.01) continue;
      this.order[n] = i;
      this.keys[n] = this.hasCam ? s.pos.distanceToSquared(this.camPos) : 0;
      n++;
    }
    const o = this.order;
    this.depthSort.sort(o, this.keys, n);
    const A = this.iA.array as Float32Array, B = this.iB.array as Float32Array, C = this.iC.array as Float32Array;
    for (let m = 0; m < n; m++) {
      const s = this.slots[o[m]];
      const t = s.age / s.life;
      const R = s.r0 + (s.r1 - s.r0) * (1 - Math.exp(-s.age / s.growTau)) + s.growth * s.age;
      const fin = Math.min(1, s.age / s.fadeIn);
      const fo = s.fadeOut > 0 ? THREE.MathUtils.smoothstep(t, 1 - s.fadeOut, 1) : 0;
      _c.copy(s.pos);
      A[m * 4] = _c.x; A[m * 4 + 1] = _c.y; A[m * 4 + 2] = _c.z; A[m * 4 + 3] = R;
      B[m * 4] = s.type; B[m * 4 + 1] = s.age; B[m * 4 + 2] = s.seed; B[m * 4 + 3] = fin * (1 - fo);
      if (s.type === 1) {
        C[m * 4] = s.heat0 * shockK * (1 - t) * (1 - t); C[m * 4 + 1] = 0; C[m * 4 + 2] = 0; C[m * 4 + 3] = 0;
      } else {
        C[m * 4] = s.heat0 * Math.exp(-s.age / s.tau);
        C[m * 4 + 1] = s.grey;
        C[m * 4 + 2] = s.dens;
        C[m * 4 + 3] = s.billow0 + (s.billow1 - s.billow0) * t;
      }
    }
    this.geo.instanceCount = n;
    // Do not turn an empty draw into a full-capacity buffer upload.
    if (n === 0) return;
    for (const at of this.attrs) {
      at.clearUpdateRanges();
      if (n > 0) at.addUpdateRange(0, n * 4);
      at.needsUpdate = true;
    }
  }
}

import * as THREE from 'three';
import { Atmos } from './Atmosphere';
import { assetUrl } from '../core/Assets';
import { softDepth, SOFT_DEPTH_GLSL } from './SoftDepth';
import { weatherNow } from './WeatherState';

// Effects 2.0: offline-simulated volumetric flipbooks, relit in game.
//
// tools/fx/bake_flipbooks.py simulates each effect in Blender (Mantaflow smoke and fire) and bakes
// the simulated volume into a directional lighting basis: for every frame, how the volume looks lit
// from +X, -X, +Y, -Y and the front, plus its opacity and its own flame emission (light from
// behind is derived from the opacity: thin smoke lets it through, a dense core does not). All
// six effects share one pair of atlases (public/fx/fx_a.webp, fx_b.webp: 2 x 3 blocks of 8 x 8
// frames, 128 px each), loaded lazily the first time a tier above Low needs them.
//
// FlipbookFX draws every flipbook particle in one instanced, back-to-front sorted draw:
//   - relit per pixel from the live sun direction and colour (the "six-way" basis, weighted by the
//     squared direction components), the sky from above and the ground bounce from below; the sun
//     side is dimmed under the upper cloud layer's shadow (SoftDepth.uSunShadow)
//   - forward scattering: thin edges glow when the sun is behind the smoke
//   - flame emission through a blackbody ramp, cooling with the particle's heat
//   - soft: faded where it meets opaque geometry (SoftDepth) and right in front of the eye
//   - aerial perspective toward the horizon colour with distance, and a minimum on-screen size so
//     a far flak puff stays a dot instead of vanishing (its opacity scaled down to match)
// Frames are cross-faded, so 64 frames play smoothly over a 10 s life.
// Nothing is allocated per spawn or per frame; the program is compiled by World.prewarm with the
// placeholder textures, so the atlases arriving later never recompile anything.

export type FlipKind = 'explosion' | 'fireball' | 'flak' | 'fire' | 'smoke' | 'wisp';
export const FLIP_KINDS: FlipKind[] = ['explosion', 'fireball', 'flak', 'fire', 'smoke', 'wisp'];
const FRAMES = 64;

// One spawn's settings (reused objects: the caller fills one in and passes it)
export interface FlipOpts {
  kind: FlipKind;
  pos: THREE.Vector3;
  vel?: THREE.Vector3;
  life: number;
  play?: number;      // s to play the frames (default: the whole life); the last frame holds after
  f0?: number;        // first / last frame (0..63)
  f1?: number;
  curve?: number;     // frame timing exponent: < 1 plays the early (fast, hot) frames quicker
  size0: number;      // quad width (m) at birth / at the end
  size1: number;
  rot?: number;       // radians; random when undefined
  rotVel?: number;
  albedo: [number, number, number];
  alpha0?: number;    // opacity multiplier at birth / at death
  alpha1?: number;
  heat?: number;      // flame emission multiplier at birth (0 = smoke only)
  tau?: number;       // s, heat decay
  drag?: number;
  rise?: number;      // m/s^2 upward
  windK?: number;     // share of the wind it drifts with
  age?: number;       // s already lived (back-dated along a trail)
  soft?: number;      // m of depth over which it fades into geometry (default: a third of its size)
  delay?: number;     // s before it appears (it drifts meanwhile)
  fadeIn?: number;    // s to fade in (default 0.05)
}

let atlasA: THREE.Texture | null = null;
let atlasB: THREE.Texture | null = null;
let loading: Promise<boolean> | null = null;
export const flipAtlas = { ready: false, failed: false, bytes: 0 };

function placeholder(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  t.needsUpdate = true;
  return t;
}

// Tileable "cauliflower" detail noise (inverted Worley + value noise, 128^2, R8) that breaks up
// the flipbook at close range, where one baked texel covers several pixels: billow dents in the
// lighting, an eroded edge, hot and cool pockets in the flames
let detailTex: THREE.DataTexture | null = null;
function detailNoise(): THREE.DataTexture {
  if (detailTex) return detailTex;
  const N = 128;
  let seed = 4242;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const worley = (cells: number) => {
    const pts = new Float32Array(cells * cells * 2);
    for (let i = 0; i < pts.length; i++) pts[i] = rnd();
    const out = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const px = (x + 0.5) / N * cells, py = (y + 0.5) / N * cells;
      const cx = Math.floor(px), cy = Math.floor(py);
      let best = 9;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const ix = cx + dx, iy = cy + dy;
        const j = (((iy + cells) % cells) * cells + ((ix + cells) % cells)) * 2;
        const ox = ix + pts[j] - px, oy = iy + pts[j + 1] - py;
        best = Math.min(best, ox * ox + oy * oy);
      }
      out[y * N + x] = 1 - Math.min(1, Math.sqrt(best));
    }
    return out;
  };
  const a = worley(5), b = worley(11), c = worley(23);
  const data = new Uint8Array(N * N);
  let lo = 9, hi = -9;
  const raw = new Float32Array(N * N);
  for (let i = 0; i < raw.length; i++) { raw[i] = a[i] * 0.5 + b[i] * 0.32 + c[i] * 0.18; lo = Math.min(lo, raw[i]); hi = Math.max(hi, raw[i]); }
  for (let i = 0; i < raw.length; i++) data[i] = Math.round((raw[i] - lo) / (hi - lo) * 255);
  const t = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  detailTex = t;
  return t;
}

async function loadOne(url: string): Promise<THREE.Texture> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const blob = await res.blob();
  flipAtlas.bytes += blob.size;
  // straight (not premultiplied) alpha: the colour channels are data, not colour under the alpha
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none', imageOrientation: 'none' } as ImageBitmapOptions);
  const tex = new THREE.Texture(bmp as unknown as HTMLImageElement);
  tex.flipY = false;
  tex.premultiplyAlpha = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 1;
  tex.needsUpdate = true;
  return tex;
}

// Start loading the atlases (once); resolves true when they are in
export function loadFlipbooks(): Promise<boolean> {
  loading ??= (async () => {
    try {
      const [a, b] = await Promise.all([loadOne(assetUrl('fx/fx_a.webp')), loadOne(assetUrl('fx/fx_b.webp'))]);
      atlasA = a; atlasB = b;
      for (const m of materials) { m.uniforms.tA.value = a; m.uniforms.tB.value = b; if (m.uniforms.uFlipOn) m.uniforms.uFlipOn.value = 1; }
      flipAtlas.ready = true;
      return true;
    } catch (e) {
      console.info('Effect flipbooks not loaded, keeping the sprite effects', e);
      flipAtlas.failed = true;
      return false;
    }
  })();
  return loading;
}

const materials: THREE.ShaderMaterial[] = [];

// Another material that samples the atlases (uniforms tA, tB and uFlipOn): filled in once loaded.
// LivingSky's distant flak fields use the simulated flak puff this way.
export function registerFlipMaterial(m: THREE.ShaderMaterial) {
  m.uniforms.tA ??= { value: atlasA ?? placeholder() };
  m.uniforms.tB ??= { value: atlasB ?? placeholder() };
  m.uniforms.uFlipOn ??= { value: 0 };
  materials.push(m);
}
const _d = new THREE.Vector3();


export class FlipbookFX {
  readonly mesh: THREE.Mesh;
  readonly camPos = new THREE.Vector3();
  private camQinv = new THREE.Quaternion();
  private hasCam = false;
  private n = 0;
  private pos: Float32Array; private vel: Float32Array;
  private life: Float32Array; private age: Float32Array; private play: Float32Array;
  private fr0: Float32Array; private fr1: Float32Array; private curve: Float32Array; private kind: Float32Array;
  private s0: Float32Array; private s1: Float32Array; private rot: Float32Array; private rotVel: Float32Array;
  private alb: Float32Array; private a0: Float32Array; private a1: Float32Array;
  private heat: Float32Array; private tau: Float32Array; private drag: Float32Array; private rise: Float32Array;
  private windK: Float32Array; private soft: Float32Array; private fadeIn: Float32Array;
  private order: Int32Array; private keys: Float32Array;
  private iA: THREE.InstancedBufferAttribute; private iB: THREE.InstancedBufferAttribute; private iC: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;
  private attrs: THREE.InstancedBufferAttribute[];
  private mat: THREE.ShaderMaterial;

  constructor(readonly max = 2400) {
    const F = (k: number) => new Float32Array(max * k);
    this.pos = F(3); this.vel = F(3); this.life = F(1); this.age = F(1); this.play = F(1);
    this.fr0 = F(1); this.fr1 = F(1); this.curve = F(1); this.kind = F(1); this.s0 = F(1); this.s1 = F(1); this.rot = F(1); this.rotVel = F(1);
    this.alb = F(3); this.a0 = F(1); this.a1 = F(1); this.heat = F(1); this.tau = F(1); this.drag = F(1); this.rise = F(1);
    this.windK = F(1); this.soft = F(1); this.fadeIn = F(1);
    this.order = new Int32Array(max); this.keys = new Float32Array(max);
    const geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    const A = () => new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iA = A(); this.iB = A(); this.iC = A();
    geo.setAttribute('iA', this.iA); geo.setAttribute('iB', this.iB); geo.setAttribute('iC', this.iC);
    geo.instanceCount = 0;
    this.geo = geo;
    this.attrs = [this.iA, this.iB, this.iC];
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tA: { value: atlasA ?? placeholder() },
        tB: { value: atlasB ?? placeholder() },
        tDetail: { value: detailNoise() },
        uSunDir: { value: Atmos.sunDir },
        uSunCol: { value: new THREE.Vector3(1, 1, 1) },
        uSky: { value: new THREE.Vector3(0.3, 0.35, 0.45) },
        uGround: { value: new THREE.Vector3(0.1, 0.1, 0.1) },
        uHaze: { value: new THREE.Vector3(0.5, 0.6, 0.75) },
        uHazeK: { value: 1 / 30000 },
        uPx: { value: 0.001 },
        ...softDepth.uniforms,
      },
      vertexShader: /* glsl */ `
        attribute vec4 iA; attribute vec4 iB; attribute vec4 iC;
        uniform vec3 uSunDir; uniform float uPx;
        varying vec2 vUv0; varying vec2 vUv1; varying float vBlend;
        varying vec3 vL; varying vec3 vUp; varying vec3 vAlb;
        varying float vAlpha; varying float vHeat; varying float vDist; varying float vSoft;
        varying vec2 vQ; varying vec3 vDet;
        void main() {
          vec4 mv = viewMatrix * vec4(iA.xyz, 1.0);
          float dist = max(-mv.z, 0.01);
          float size = iA.w;
          // never smaller than ~2.5 px: far puffs stay visible, their opacity scaled to match
          float grow = max(size, dist * uPx * 2.5);
          float c = cos(iB.x), s = sin(iB.x);
          vec2 ax = vec2(c, s), ay = vec2(-s, c);
          mv.xy += (ax * position.x + ay * position.y) * grow;
          gl_Position = projectionMatrix * mv;
          float kind = floor(iB.y / ${FRAMES}.0 + 1e-3);
          float fr = clamp(iB.y - kind * ${FRAMES}.0, 0.0, ${FRAMES - 1}.0);
          float f0 = floor(fr), f1 = min(f0 + 1.0, ${FRAMES - 1}.0);
          vBlend = fr - f0;
          vec2 q = vec2(uv.x, 1.0 - uv.y);
          vec2 blk = vec2(mod(kind, 2.0), floor(kind / 2.0)) * 8.0;
          vUv0 = (blk + vec2(mod(f0, 8.0), floor(f0 / 8.0)) + q) / vec2(16.0, 24.0);
          vUv1 = (blk + vec2(mod(f1, 8.0), floor(f1 / 8.0)) + q) / vec2(16.0, 24.0);
          // sun and world-up in the billboard's own frame (x right, y up, z toward the eye)
          vec3 sv = (viewMatrix * vec4(uSunDir, 0.0)).xyz;
          vL = vec3(dot(sv.xy, ax), dot(sv.xy, ay), sv.z);
          vec3 uw = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
          vUp = vec3(dot(uw.xy, ax), dot(uw.xy, ay), uw.z);
          float k = size / grow;
          vAlpha = iB.z * max(k * k, 0.35);
          vHeat = iB.w;
          vAlb = iC.rgb;
          vDist = dist;
          vSoft = iC.a;
          // detail: a seed per particle, the playback time, and how magnified a baked texel is
          vQ = q - 0.5;
          float px = grow / (dist * uPx);   // quad width on screen (px)
          vDet = vec3(fract(iB.x * 0.1591) * 7.3, fr * 0.02, smoothstep(160.0, 520.0, px));
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tA; uniform sampler2D tB; uniform sampler2D tDetail;
        uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uGround; uniform vec3 uHaze; uniform float uHazeK;
        ${SOFT_DEPTH_GLSL}
        varying vec2 vUv0; varying vec2 vUv1; varying float vBlend;
        varying vec3 vL; varying vec3 vUp; varying vec3 vAlb;
        varying float vAlpha; varying float vHeat; varying float vDist; varying float vSoft;
        varying vec2 vQ; varying vec3 vDet;
        // linear HDR blackbody-ish ramp: dark red -> orange -> yellow -> white
        vec3 fireRamp(float T) {
          vec3 c = vec3(0.9, 0.08, 0.0) * smoothstep(0.0, 0.25, T);
          c = mix(c, vec3(4.0, 1.0, 0.12), smoothstep(0.2, 0.5, T));
          c = mix(c, vec3(9.0, 4.6, 1.2), smoothstep(0.5, 0.8, T));
          c = mix(c, vec3(16.0, 12.5, 8.0), smoothstep(0.95, 1.45, T));
          return c;
        }
        float six(vec4 a, vec4 b, vec3 d, float back) {
          vec3 w = d * d;
          return (d.x > 0.0 ? a.r : a.g) * w.x + (d.y > 0.0 ? a.b : b.r) * w.y + (d.z > 0.0 ? b.g : back) * w.z;
        }
        void main() {
          vec4 a = mix(texture2D(tA, vUv0), texture2D(tA, vUv1), vBlend);
          // sub-texel detail, strongest where the flipbook is magnified (close explosions)
          float n = texture2D(tDetail, vQ * 1.4 + vDet.x + vec2(0.0, vDet.y)).r * 0.65
                  + texture2D(tDetail, vQ * 3.1 - vDet.x * 1.7 + vec2(vDet.y * 0.7, 0.0)).r * 0.35 - 0.5;
          float dk = vDet.z;
          float alpha = min(1.0, a.a * (1.0 + n * 0.7 * dk * (1.0 - a.a * 0.5))) * vAlpha;
          vec4 b = mix(texture2D(tB, vUv0), texture2D(tB, vUv1), vBlend);
          // (min: WebP keeps no colour under a fully transparent pixel; B.a = max(opacity, flame) bounds it)
          float eb = min(b.b, b.a);
          // linear flame = eb^2; one more power for contrast: a hot core inside cooler flame
          float e = eb * eb * eb * vHeat * max(0.0, 1.0 + n * (1.0 + 0.8 * dk));   // hot and cool pockets
          if (alpha < 0.002 && e < 0.002) discard;
          vec3 L = normalize(vL), U = normalize(vUp);
          float back = 0.08 + 0.85 * sqrt(max(1.0 - a.a, 0.0));
          float sun = six(a, b, L, back);
          // forward scattering: the sun behind the smoke lights its thin edges
          float behind = max(-L.z, 0.0);
          sun *= (1.0 + 2.5 * pow(behind, 8.0) * (1.0 - a.a * 0.7)) * (1.0 + n * 0.9 * dk);
          float sky = six(a, b, U, back), gnd = six(a, b, -U, back);
          vec3 lit = vAlb * (uSunCol * sun * uSunShadow + uSky * (0.35 + 0.65 * sky) + uGround * gnd);
          vec3 fire = fireRamp(e);
          // soft against the opaque scene, and faded right in front of the eye
          float k = clamp((softScene() - vDist) / vSoft, 0.0, 1.0) * smoothstep(0.6, 3.0 + vSoft * 0.5, vDist);
          float h = 1.0 - exp(-vDist * uHazeK);
          vec3 col = mix(lit, uHaze, h) * alpha + fire * (1.0 - h);
          gl_FragColor = vec4(col * k, alpha * k);
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
    materials.push(this.mat);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;   // over the sprite smoke (10), under the volumes (15) and glow (20)
    this.mesh.userData.noRebase = true;
    this.mesh.onBeforeRender = (r, _s, cam) => {
      cam.getWorldPosition(this.camPos); this.hasCam = true;
      cam.getWorldQuaternion(this.camQinv).invert();
      const pc = cam as THREE.PerspectiveCamera;
      if (pc.isPerspectiveCamera) {
        const h = r.getRenderTarget()?.height ?? r.domElement.height;
        this.mat.uniforms.uPx.value = (2 * Math.tan(THREE.MathUtils.degToRad(pc.fov) / 2)) / Math.max(1, h);
      }
    };
  }

  get count() { return this.n; }

  // Rotation that turns a flipbook's "up" (the way its hot gas rises) along a world direction as
  // seen from the camera (last frame's view): flames streaming back from a moving engine
  angleOf(dir: THREE.Vector3): number {
    _d.copy(dir).applyQuaternion(this.camQinv);
    if (_d.x * _d.x + _d.y * _d.y < 1e-8) return 0;
    return Math.atan2(-_d.x, _d.y);
  }
  get free() { return this.max - this.n; }

  spawn(o: FlipOpts) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = o.pos.x; this.pos[i * 3 + 1] = o.pos.y; this.pos[i * 3 + 2] = o.pos.z;
    const v = o.vel;
    this.vel[i * 3] = v ? v.x : 0; this.vel[i * 3 + 1] = v ? v.y : 0; this.vel[i * 3 + 2] = v ? v.z : 0;
    this.life[i] = o.life; this.age[i] = o.delay ? -o.delay : o.age ? Math.min(o.age, o.life * 0.9) : 0;
    this.fadeIn[i] = o.fadeIn ?? 0.05;
    this.play[i] = o.play ?? o.life;
    this.fr0[i] = o.f0 ?? 0; this.fr1[i] = o.f1 ?? FRAMES - 1; this.curve[i] = o.curve ?? 1;
    this.kind[i] = FLIP_KINDS.indexOf(o.kind);
    this.s0[i] = o.size0; this.s1[i] = o.size1;
    this.rot[i] = o.rot ?? Math.random() * Math.PI * 2;
    this.rotVel[i] = o.rotVel ?? (Math.random() - 0.5) * 0.12;
    this.alb[i * 3] = o.albedo[0]; this.alb[i * 3 + 1] = o.albedo[1]; this.alb[i * 3 + 2] = o.albedo[2];
    this.a0[i] = o.alpha0 ?? 1; this.a1[i] = o.alpha1 ?? 1;
    this.heat[i] = o.heat ?? 0; this.tau[i] = o.tau ?? 1e9;
    this.drag[i] = o.drag ?? 0; this.rise[i] = o.rise ?? 0; this.windK[i] = o.windK ?? 0;
    this.soft[i] = o.soft ?? Math.max(o.size0, o.size1) * 0.3;
  }

  private kill(i: number) {
    const j = --this.n;
    if (i === j) return;
    const mv = (a: Float32Array, k: number) => { for (let q = 0; q < k; q++) a[i * k + q] = a[j * k + q]; };
    mv(this.pos, 3); mv(this.vel, 3); mv(this.life, 1); mv(this.age, 1); mv(this.play, 1); mv(this.fr0, 1); mv(this.fr1, 1); mv(this.curve, 1);
    mv(this.kind, 1); mv(this.s0, 1); mv(this.s1, 1); mv(this.rot, 1); mv(this.rotVel, 1); mv(this.alb, 3); mv(this.a0, 1);
    mv(this.a1, 1); mv(this.heat, 1); mv(this.tau, 1); mv(this.drag, 1); mv(this.rise, 1); mv(this.windK, 1); mv(this.soft, 1); mv(this.fadeIn, 1);
  }

  rebase(off: THREE.Vector3) {
    for (let i = 0; i < this.n; i++) { this.pos[i * 3] -= off.x; this.pos[i * 3 + 1] -= off.y; this.pos[i * 3 + 2] -= off.z; }
  }

  clear() { this.n = 0; this.geo.instanceCount = 0; }

  update(dt: number) {
    const u = this.mat.uniforms;
    const day = Math.min(1, Atmos.sunIntensity / 4.2);
    u.uSunCol.value.set(Atmos.sunColor.r, Atmos.sunColor.g, Atmos.sunColor.b).multiplyScalar(Atmos.sunIntensity * 0.62);
    u.uSky.value.set(Atmos.zenith.r * 0.5 + Atmos.horizon.r * 0.5, Atmos.zenith.g * 0.5 + Atmos.horizon.g * 0.5, Atmos.zenith.b * 0.5 + Atmos.horizon.b * 0.5)
      .multiplyScalar(0.75 + Atmos.cloudAmbient * 0.6);
    // the cloud sea / ground below bounces a little warm-grey light up into the smoke's belly
    u.uGround.value.set(0.42, 0.42, 0.44).multiplyScalar((0.25 + 0.35 * Atmos.envFloor) * day);
    u.uHaze.value.set(Atmos.horizon.r, Atmos.horizon.g, Atmos.horizon.b);
    u.uHazeK.value = (1 / (32000 * Math.max(0.15, Atmos.haze))) + weatherNow.fog;
    const wx = Atmos.wind.x, wz = Atmos.wind.z;
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.kill(i); continue; }
      const d = Math.exp(-this.drag[i] * dt);
      const k3 = i * 3;
      this.vel[k3] *= d; this.vel[k3 + 1] = this.vel[k3 + 1] * d + this.rise[i] * dt; this.vel[k3 + 2] *= d;
      const wk = this.windK[i];
      this.pos[k3] += (this.vel[k3] + wx * wk) * dt;
      this.pos[k3 + 1] += this.vel[k3 + 1] * dt;
      this.pos[k3 + 2] += (this.vel[k3 + 2] + wz * wk) * dt;
      this.rot[i] += this.rotVel[i] * dt;
      i++;
    }
    // back to front (insertion sort on the previous order: it barely changes between frames)
    const n = this.n, o = this.order, ks = this.keys;
    const cx = this.camPos.x, cy = this.camPos.y, cz = this.camPos.z;
    for (let m = 0; m < n; m++) {
      o[m] = m;
      const x = this.pos[m * 3] - cx, y = this.pos[m * 3 + 1] - cy, z = this.pos[m * 3 + 2] - cz;
      ks[m] = this.hasCam ? x * x + y * y + z * z : 0;
    }
    for (let m = 1; m < n; m++) {
      const oi = o[m], ki = ks[m];
      let j = m - 1;
      while (j >= 0 && ks[j] < ki) { o[j + 1] = o[j]; ks[j + 1] = ks[j]; j--; }
      o[j + 1] = oi; ks[j + 1] = ki;
    }
    const A = this.iA.array as Float32Array, B = this.iB.array as Float32Array, C = this.iC.array as Float32Array;
    for (let m = 0; m < n; m++) {
      const k = o[m];
      const ag = Math.max(0, this.age[k]);
      const t = ag / this.life[k];
      const te = 1 - (1 - t) * (1 - t);
      const pt = Math.min(1, ag / this.play[k]);
      const fr = this.fr0[k] + (this.fr1[k] - this.fr0[k]) * (this.curve[k] === 1 ? pt : Math.pow(pt, this.curve[k]));
      A[m * 4] = this.pos[k * 3]; A[m * 4 + 1] = this.pos[k * 3 + 1]; A[m * 4 + 2] = this.pos[k * 3 + 2];
      A[m * 4 + 3] = this.s0[k] + (this.s1[k] - this.s0[k]) * te;
      const fin = this.age[k] <= 0 ? 0 : Math.min(1, this.age[k] / this.fadeIn[k]);
      const fout = 1 - THREE.MathUtils.smoothstep(t, 0.75, 1);
      B[m * 4] = this.rot[k];
      B[m * 4 + 1] = this.kind[k] * FRAMES + fr;
      B[m * 4 + 2] = (this.a0[k] + (this.a1[k] - this.a0[k]) * t) * fin * fout;
      B[m * 4 + 3] = this.heat[k] * Math.exp(-ag / this.tau[k]);
      C[m * 4] = this.alb[k * 3]; C[m * 4 + 1] = this.alb[k * 3 + 1]; C[m * 4 + 2] = this.alb[k * 3 + 2]; C[m * 4 + 3] = this.soft[k];
    }
    this.geo.instanceCount = n;
    for (let q = 0; q < 3; q++) {
      const at = this.attrs[q];
      at.clearUpdateRanges();
      if (n > 0) at.addUpdateRange(0, n * 4);
      at.needsUpdate = true;
    }
    if (n > 0) softDepth.want();
  }
}

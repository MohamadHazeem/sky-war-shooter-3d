import * as THREE from 'three';
import { Atmos } from './Atmosphere';

// Procedural sprite atlas (2x2): 0 = soft billowy puff, 1 = hot glow,
// 2 = turbulent fireball, 3 = shockwave ring.
function makeAtlas(): THREE.Texture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S * 2; c.height = S * 2;
  const g = c.getContext('2d')!;
  const rnd = mulberry(7);
  const blobs = (ox: number, oy: number, n: number, spread: number, rmin: number, rmax: number, amin: number, amax: number) => {
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 0.7) * S * spread;
      const x = ox + S / 2 + Math.cos(a) * r, y = oy + S / 2 + Math.sin(a) * r;
      const br = S * (rmin + rnd() * (rmax - rmin));
      const grd = g.createRadialGradient(x, y, 0, x, y, br);
      grd.addColorStop(0, `rgba(255,255,255,${amin + rnd() * (amax - amin)})`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, br, 0, Math.PI * 2); g.fill();
    }
  };
  // 0: puff
  blobs(0, 0, 90, 0.28, 0.08, 0.22, 0.22, 0.22);
  // 1: glow
  let grd = g.createRadialGradient(S * 1.5, S / 2, 0, S * 1.5, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.15, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(S, 0, S, S);
  // 2: fireball — dense core with many small hot tongues
  g.save();
  g.beginPath(); g.rect(0, S, S, S); g.clip();
  blobs(0, S, 60, 0.18, 0.1, 0.24, 0.35, 0.6);
  blobs(0, S, 160, 0.34, 0.025, 0.08, 0.2, 0.7);
  g.restore();
  // 3: shockwave ring
  grd = g.createRadialGradient(S * 1.5, S * 1.5, S * 0.3, S * 1.5, S * 1.5, S * 0.5);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.75, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(S, S, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let atlas: THREE.Texture | null = null;

export interface ParticleOpts {
  pos: THREE.Vector3;
  vel?: THREE.Vector3;
  life: number;
  size0: number;
  size1: number;
  color0: THREE.Color | [number, number, number];
  color1?: THREE.Color | [number, number, number];
  alpha0?: number;
  alpha1?: number;
  frame?: number; // 0 puff, 1 glow, 2 fire, 3 ring
  drag?: number;
  rise?: number; // upward accel (m/s^2), negative = gravity
  rotVel?: number;
  lit?: boolean; // shade with sun/ambient (smoke)
  age?: number;  // s already lived: a puff back-dated along a trail starts part-way through its life
}

const tmpC = new THREE.Color();

export class ParticleSystem {
  readonly mesh: THREE.Mesh;
  private n = 0;
  private max: number;
  private pos: Float32Array; private vel: Float32Array;
  private life: Float32Array; private age: Float32Array;
  private s0: Float32Array; private s1: Float32Array;
  private c0: Float32Array; private c1: Float32Array;
  private a0: Float32Array; private a1: Float32Array;
  private frame: Float32Array; private drag: Float32Array; private rise: Float32Array;
  private rot: Float32Array; private rotVel: Float32Array;
  private iPos: THREE.InstancedBufferAttribute;
  private iSR: THREE.InstancedBufferAttribute;
  private iCol: THREE.InstancedBufferAttribute;
  private iFrame: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;

  constructor(max: number, additive: boolean) {
    this.max = max;
    atlas ??= makeAtlas();
    const F = (k: number) => new Float32Array(max * k);
    this.pos = F(3); this.vel = F(3); this.life = F(1); this.age = F(1);
    this.s0 = F(1); this.s1 = F(1); this.c0 = F(3); this.c1 = F(3); this.a0 = F(1); this.a1 = F(1);
    this.frame = F(1); this.drag = F(1); this.rise = F(1); this.rot = F(1); this.rotVel = F(1);
    const geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.iSR = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.iCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iFrame = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.iPos);
    geo.setAttribute('iSR', this.iSR);
    geo.setAttribute('iCol', this.iCol);
    geo.setAttribute('iFrame', this.iFrame);
    geo.instanceCount = 0;
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { tAtlas: { value: atlas } },
      vertexShader: /* glsl */ `
        attribute vec3 iPos; attribute vec2 iSR; attribute vec4 iCol; attribute float iFrame;
        varying vec2 vUv; varying vec4 vCol;
        void main() {
          vec4 mv = viewMatrix * vec4(iPos, 1.0);
          float c = cos(iSR.y), s = sin(iSR.y);
          vec2 p = mat2(c, s, -s, c) * position.xy * iSR.x;
          mv.xy += p;
          gl_Position = projectionMatrix * mv;
          // atlas rows: canvas top = frames 0/1 (texture is not flipped, so v grows downward)
          vUv = vec2((uv.x + mod(iFrame, 2.0)) * 0.5, (1.0 - uv.y + floor(iFrame / 2.0)) * 0.5);
          vCol = iCol;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tAtlas; varying vec2 vUv; varying vec4 vCol;
        void main() {
          float a = texture2D(tAtlas, vUv).a;
          ${additive ? 'gl_FragColor = vec4(vCol.rgb * a * vCol.a, 1.0);' : 'gl_FragColor = vec4(vCol.rgb, a * vCol.a);'}
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 20 : 10;
    this.mesh.userData.noRebase = true;
  }

  spawn(o: ParticleOpts) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = o.pos.x; this.pos[i * 3 + 1] = o.pos.y; this.pos[i * 3 + 2] = o.pos.z;
    const v = o.vel;
    this.vel[i * 3] = v ? v.x : 0; this.vel[i * 3 + 1] = v ? v.y : 0; this.vel[i * 3 + 2] = v ? v.z : 0;
    this.life[i] = o.life; this.age[i] = o.age ? Math.min(o.age, o.life * 0.9) : 0;
    this.s0[i] = o.size0; this.s1[i] = o.size1;
    const setC = (arr: Float32Array, c: THREE.Color | [number, number, number]) => {
      if (Array.isArray(c)) { arr[i * 3] = c[0]; arr[i * 3 + 1] = c[1]; arr[i * 3 + 2] = c[2]; }
      else { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    };
    setC(this.c0, o.color0);
    setC(this.c1, o.color1 ?? o.color0);
    if (o.lit) {
      // Bake sun + sky lighting into smoke colour
      const k = 0.55 + Atmos.sunIntensity * 0.22;
      for (const arr of [this.c0, this.c1]) { arr[i * 3] *= k; arr[i * 3 + 1] *= k * 0.99; arr[i * 3 + 2] *= k * 1.02; }
    }
    this.a0[i] = o.alpha0 ?? 1; this.a1[i] = o.alpha1 ?? 0;
    this.frame[i] = o.frame ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.rise[i] = o.rise ?? 0;
    this.rot[i] = Math.random() * Math.PI * 2;
    this.rotVel[i] = o.rotVel ?? (Math.random() - 0.5) * 0.6;
  }

  private kill(i: number) {
    const j = --this.n;
    if (i === j) return;
    const mv = (a: Float32Array, k: number) => { for (let q = 0; q < k; q++) a[i * k + q] = a[j * k + q]; };
    mv(this.pos, 3); mv(this.vel, 3); mv(this.life, 1); mv(this.age, 1); mv(this.s0, 1); mv(this.s1, 1);
    mv(this.c0, 3); mv(this.c1, 3); mv(this.a0, 1); mv(this.a1, 1); mv(this.frame, 1); mv(this.drag, 1);
    mv(this.rise, 1); mv(this.rot, 1); mv(this.rotVel, 1);
  }

  rebase(off: THREE.Vector3) {
    for (let i = 0; i < this.n; i++) {
      this.pos[i * 3] -= off.x; this.pos[i * 3 + 1] -= off.y; this.pos[i * 3 + 2] -= off.z;
    }
  }

  update(dt: number) {
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.kill(i); continue; }
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + this.rise[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.rot[i] += this.rotVel[i] * dt;
      i++;
    }
    const P = this.iPos.array as Float32Array, SR = this.iSR.array as Float32Array;
    const C = this.iCol.array as Float32Array, FR = this.iFrame.array as Float32Array;
    for (let k = 0; k < this.n; k++) {
      const t = this.age[k] / this.life[k];
      const te = 1 - (1 - t) * (1 - t); // ease-out growth
      P[k * 3] = this.pos[k * 3]; P[k * 3 + 1] = this.pos[k * 3 + 1]; P[k * 3 + 2] = this.pos[k * 3 + 2];
      SR[k * 2] = this.s0[k] + (this.s1[k] - this.s0[k]) * te;
      SR[k * 2 + 1] = this.rot[k];
      C[k * 4] = this.c0[k * 3] + (this.c1[k * 3] - this.c0[k * 3]) * t;
      C[k * 4 + 1] = this.c0[k * 3 + 1] + (this.c1[k * 3 + 1] - this.c0[k * 3 + 1]) * t;
      C[k * 4 + 2] = this.c0[k * 3 + 2] + (this.c1[k * 3 + 2] - this.c0[k * 3 + 2]) * t;
      // fade in quickly, then to alpha1
      const fadeIn = Math.min(1, this.age[k] / 0.06);
      C[k * 4 + 3] = (this.a0[k] + (this.a1[k] - this.a0[k]) * t) * fadeIn;
      FR[k] = this.frame[k];
    }
    this.geo.instanceCount = this.n;
    this.iPos.needsUpdate = this.iSR.needsUpdate = this.iCol.needsUpdate = this.iFrame.needsUpdate = true;
    this.iPos.clearUpdateRanges(); this.iSR.clearUpdateRanges(); this.iCol.clearUpdateRanges(); this.iFrame.clearUpdateRanges();
    if (this.n > 0) {
      this.iPos.addUpdateRange(0, this.n * 3); this.iSR.addUpdateRange(0, this.n * 2);
      this.iCol.addUpdateRange(0, this.n * 4); this.iFrame.addUpdateRange(0, this.n);
    }
  }

  get count() { return this.n; }
  clear() { this.n = 0; this.geo.instanceCount = 0; }
}

const HALO = 2.6;

// Tracer streaks: camera-facing ribbons between two points, at least ~1.5 px wide.
// Effects 2.0: an HDR white-hot core (drives the bloom) inside a coloured glow and a wide, faint
// halo (the quad is HALO times the streak width), with the burning head brighter than the tail.
// Sparks.ts uses the same renderer for motion-stretched sparks and fragments.
export class TracerRenderer {
  readonly mesh: THREE.Mesh;
  private max: number;
  private a: THREE.InstancedBufferAttribute;
  private b: THREE.InstancedBufferAttribute;
  private c: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;
  private n = 0;
  readonly uniforms = { uPx: { value: 0.001 } };

  constructor(max: number) {
    this.max = max;
    const geo = new THREE.InstancedBufferGeometry();
    const pos = new Float32Array([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0]);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex([0, 1, 2, 2, 1, 3]);
    this.a = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.b = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.c = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iA', this.a); geo.setAttribute('iB', this.b); geo.setAttribute('iC', this.c);
    geo.instanceCount = 0;
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec3 iA; attribute vec3 iB; attribute vec4 iC;
        uniform float uPx;
        varying vec2 vQ; varying vec4 vC;
        void main() {
          vec3 p = mix(iA, iB, position.y);
          vec3 dir = normalize(iB - iA + 1e-5);
          vec3 toCam = cameraPosition - p;
          float dist = length(toCam);
          vec3 side = normalize(cross(dir, toCam / dist));
          float w = max(iC.a, dist * uPx * 2.1);
          p += side * position.x * w * ${HALO.toFixed(1)};
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          vQ = position.xy;
          // Thin far tracers get dimmer per pixel but keep their energy
          // fade out close to the eye so a round passing the camera is not a beam across the screen
          vC = vec4(iC.rgb * clamp(iC.a / w, 0.25, 1.0) * smoothstep(6.0, 28.0, dist), 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vQ; varying vec4 vC;
        void main() {
          // white-hot HDR core inside a soft coloured glow and a faint wide halo; the head burns brightest
          float a = abs(vQ.x) * ${HALO.toFixed(1)};   // in streak widths
          float core = exp(-a * a * 14.0);
          float glow = exp(-a * a * 2.6) * 0.75;
          float halo = exp(-a * 2.2) * 0.12 * (1.0 - smoothstep(${(HALO * 0.6).toFixed(2)}, ${HALO.toFixed(1)}, a));
          float along = smoothstep(0.0, 0.7, vQ.y) * (0.7 + 0.3 * vQ.y);
          float head = exp(-(1.0 - vQ.y) * 9.0);
          float lum = dot(vC.rgb, vec3(0.33));
          vec3 c = vC.rgb * (glow + halo) * (along + head * 0.8) + vec3(lum * 1.1, lum, lum * 0.85) * core * (along * 1.2 + head * 1.6);
          gl_FragColor = vec4(c, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 30;
    this.mesh.userData.noRebase = true;
  }

  begin() { this.n = 0; }

  push(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, g: number, b: number, width: number) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const A = this.a.array as Float32Array, B = this.b.array as Float32Array, C = this.c.array as Float32Array;
    A[i * 3] = ax; A[i * 3 + 1] = ay; A[i * 3 + 2] = az;
    B[i * 3] = bx; B[i * 3 + 1] = by; B[i * 3 + 2] = bz;
    C[i * 4] = r; C[i * 4 + 1] = g; C[i * 4 + 2] = b; C[i * 4 + 3] = width;
  }

  end(camera: THREE.PerspectiveCamera, screenH: number) {
    this.flush();
    this.uniforms.uPx.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / screenH;
  }

  // Upload what was pushed since begin() (the caller keeps uPx current)
  flush() {
    this.geo.instanceCount = this.n;
    for (let q = 0; q < 3; q++) {
      const at = q === 0 ? this.a : q === 1 ? this.b : this.c;
      at.clearUpdateRanges();
      if (this.n > 0) at.addUpdateRange(0, this.n * at.itemSize);
      at.needsUpdate = true;
    }
  }
}

export { tmpC };

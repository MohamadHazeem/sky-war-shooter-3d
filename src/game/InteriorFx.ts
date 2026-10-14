import * as THREE from 'three';
import { Atmos } from '../render/Atmosphere';

// Light and air in the waist compartment:
//  - SunShafts: a faint volume of sunlight through each waist window. The prism is the window
//    opening swept along the sun direction, rebuilt each frame (8 vertices), so the shafts
//    swing across the compartment as the bomber weaves and jinks.
//  - WindowFrost: rime on the skin and frame around each window, creeping in from the edges
//    over a cold mission.
//  - BreathFog: faint puffs from the gunner's oxygen-mask exhaust, seen with the eye down on
//    the sight (subtle, and gone in the over-the-gun hip view).
// Geometry mirrors buildWaistInterior: ellipse A x B centred at YC, window WIN_W wide, WIN_Y0..WIN_Y1.

const A = 1.08, B = 1.12, YC = 0.15;
const WIN_W = 0.8, WIN_Y0 = -0.06, WIN_Y1 = 0.55;
const SHAFT_LEN = 2.6;

// ---------------- sun shafts ----------------
let shaftMat: THREE.ShaderMaterial | null = null;
export function shaftMaterial(): THREE.ShaderMaterial {
  shaftMat ??= new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color() } },
    vertexShader: /* glsl */ `
      attribute float aT; attribute float aU;
      varying float vT; varying float vF; varying float vNear; varying float vU;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelMatrix) * normal);
        vec3 v = cameraPosition - wp.xyz;
        float d = length(v);
        vF = abs(dot(n, v / d));
        vT = aT; vU = aU;
        vNear = d;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCol; varying float vT; varying float vF; varying float vNear; varying float vU;
      void main() {
        // soft at the window, fading along the shaft, feathered across each face (no hard
        // prism edges); no glare when the eye is inside it
        float across = pow(sin(3.14159 * vU), 2.0);
        float a = pow(vF, 2.0) * across * smoothstep(0.0, 0.12, vT) * (1.0 - smoothstep(0.3, 1.0, vT)) * smoothstep(0.25, 0.9, vNear);
        gl_FragColor = vec4(uCol * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  return shaftMat;
}

// Volumetric variant (interior 2.0, Medium and up): the prism is ray-marched in the fragment
// shader. Every face of the closed prism is drawn; an entry face integrates from itself to where
// the view ray leaves the prism (found analytically against its six planes), an exit face only
// when the eye is inside the beam (from the eye to the face), so nothing is counted twice and
// the beam needs no depth texture. Along the ray: drifting dust (two octaves of value noise
// with bright motes), soft edges, fading with distance from the window.
let shaftVolMat: THREE.ShaderMaterial | null = null;
export function shaftVolumeMaterial(): THREE.ShaderMaterial {
  shaftVolMat ??= new THREE.ShaderMaterial({
    uniforms: {
      uCol: { value: new THREE.Color() }, uCam: { value: new THREE.Vector3() }, uTime: { value: 0 },
      uPlanes: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, uLen: { value: SHAFT_LEN },
    },
    vertexShader: /* glsl */ `
      varying vec3 vP;
      void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCol; uniform vec3 uCam; uniform float uTime; uniform vec4 uPlanes[6]; uniform float uLen;
      varying vec3 vP;
      float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float vnoise(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main() {
        vec3 rd = vP - uCam; float dist = length(rd); rd /= dist;
        // clip the ray against the prism: inside where dot(n, p) <= w for all six planes
        float t0 = 0.0, t1 = 1e4;
        for (int i = 0; i < 6; i++) {
          vec3 n = uPlanes[i].xyz; float w = uPlanes[i].w;
          float dn = dot(n, rd), s = w - dot(n, uCam);
          if (abs(dn) < 1e-5) { if (s < 0.0) discard; continue; }
          float t = s / dn;
          if (dn < 0.0) t0 = max(t0, t); else t1 = min(t1, t);
        }
        // entry or exit face? (by where this fragment lies on the ray: independent of winding)
        bool entry = abs(dist - t0) < abs(dist - t1);
        if (entry) { if (t0 <= 0.0) discard; t0 = dist; }            // eye outside: from here to the exit
        else { if (t0 > 0.0) discard; t0 = 0.0; t1 = dist; }         // eye inside: from the eye to here
        if (t1 <= t0) discard;
        const int N = 10;
        float dt = (t1 - t0) / float(N), acc = 0.0;
        float j = h31(vec3(gl_FragCoord.xy, uTime * 60.0));
        for (int k = 0; k < N; k++) {
          vec3 p = uCam + rd * (t0 + (float(k) + j) * dt);
          // soft edges: distance inside the nearest side plane
          float e = 1e3;
          for (int i = 0; i < 4; i++) e = min(e, uPlanes[i].w - dot(uPlanes[i].xyz, p));
          float along = clamp((uPlanes[4].w - dot(uPlanes[4].xyz, p)) / uLen, 0.0, 1.0);   // 0 at the window
          vec3 q = p * 9.0 + vec3(0.0, uTime * 0.25, uTime * 0.6);
          float dust = 0.55 + 0.45 * vnoise(q) + 0.35 * vnoise(q * 2.7 + 7.1);
          float mote = smoothstep(0.83, 0.95, vnoise(p * 55.0 + vec3(uTime * 0.4, 0.0, uTime * 1.3)));
          float near = smoothstep(0.15, 0.6, length(p - uCam));
          acc += (dust + 2.5 * mote) * smoothstep(0.0, 0.06, e) * smoothstep(0.0, 0.08, along) * (1.0 - smoothstep(0.35, 1.0, along)) * near;
        }
        float a = acc * dt;
        gl_FragColor = vec4(uCol * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  return shaftVolMat;
}

export class SunShafts {
  readonly group = new THREE.Group();
  private shafts: { mesh: THREE.Mesh; pos: THREE.BufferAttribute; corners: THREE.Vector3[]; out: THREE.Vector3; mat: THREE.ShaderMaterial; vol: THREE.ShaderMaterial; centre: THREE.Vector3 }[] = [];
  private volumetric = false;
  private t = 0;

  constructor(leftZ: number, rightZ: number, apertures?: { corners: THREE.Vector3[]; out: THREE.Vector3 }[]) {
    const xAt = (y: number) => A * Math.sqrt(1 - (y / B) ** 2);
    const windows = apertures ?? ([1, -1] as const).map((side) => {
      const wz = side === 1 ? leftZ : rightZ;
      const y0 = WIN_Y0 + 0.01, y1 = WIN_Y1 - 0.01;
      const corners = [
        new THREE.Vector3(side * xAt(y0), YC + y0, wz - WIN_W / 2), new THREE.Vector3(side * xAt(y1), YC + y1, wz - WIN_W / 2),
        new THREE.Vector3(side * xAt(y1), YC + y1, wz + WIN_W / 2), new THREE.Vector3(side * xAt(y0), YC + y0, wz + WIN_W / 2),
      ];
      return { corners, out: new THREE.Vector3(side, 0.25, 0).normalize() };
    });
    for (const { corners, out } of windows) {
      // 4 side quads of a prism (flat-shaded, 4 vertices each): window edge (t = 0) to the far end
      // (t = 1), then the window and far caps (aU = 0: invisible to the classic shader)
      const geo = new THREE.BufferGeometry();
      const pos = new THREE.BufferAttribute(new Float32Array(24 * 3), 3).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', pos);
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(24 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const at: number[] = [], au: number[] = [], idx: number[] = [];
      for (let i = 0; i < 4; i++) { at.push(0, 0, 1, 1); au.push(0, 1, 0, 1); const o = i * 4; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
      for (const t of [0, 1]) { at.push(t, t, t, t); au.push(0, 0, 0, 0); }
      idx.push(16, 17, 18, 16, 18, 19, 20, 22, 21, 20, 23, 22);
      geo.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(at), 1));
      geo.setAttribute('aU', new THREE.BufferAttribute(new Float32Array(au), 1));
      geo.setIndex(idx);
      geo.boundingSphere = new THREE.Sphere(corners[0].clone(), 4);
      const mat = shaftMaterial().clone();
      const vol = shaftVolumeMaterial().clone();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 2;
      mesh.name = 'sunShaft';
      const centre = corners.reduce((c, v) => c.add(v), new THREE.Vector3()).multiplyScalar(0.25);
      // the volume shader works in the mesh's own frame: the eye goes in each frame
      mesh.onBeforeRender = (_r, _s, cam) => {
        if (mesh.material !== vol) return;
        vol.uniforms.uCam.value.setFromMatrixPosition(cam.matrixWorld);
        mesh.worldToLocal(vol.uniforms.uCam.value);
      };
      this.group.add(mesh);
      this.shafts.push({ mesh, pos, corners, out, mat, vol, centre });
    }
  }

  // interior 2.0: ray-marched dusty shafts instead of the feathered prism
  setVolumetric(on: boolean) {
    this.volumetric = on;
    for (const s of this.shafts) s.mesh.material = on ? s.vol : s.mat;
  }

  // sunLocal: toward the sun, bomber-local
  // ownSide: the player's window (+1 left, -1 right, 0 none) and own: its shaft strength (fainter in the hip view)
  update(sunLocal: THREE.Vector3, ownSide = 0, own = 1, dt = 1 / 60) {
    this.t += dt;
    const sunUp = THREE.MathUtils.smoothstep(Atmos.sunElevationDeg, -2, 6);
    for (const s of this.shafts) {
      const k = THREE.MathUtils.smoothstep(sunLocal.dot(s.out), 0.04, 0.4) * sunUp * (Math.sign(s.out.x) === ownSide ? own : 1);
      s.mesh.visible = k > 0.002;
      if (!s.mesh.visible) continue;
      s.mat.uniforms.uCol.value.copy(Atmos.sunColor).multiplyScalar(Atmos.sunIntensity * 0.0045 * k);
      const P = s.pos.array as Float32Array;
      const N = (s.mesh.geometry.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array;
      const V = this.volumetric ? s.vol.uniforms : null;
      for (let i = 0; i < 4; i++) {
        const c0 = s.corners[i], c1 = s.corners[(i + 1) % 4];
        _n.subVectors(c1, c0).cross(sunLocal).normalize();
        // outward side plane (the prism's centre line is inside)
        if (V) {
          let w = _n.dot(c0);
          if (_n.dot(s.centre) > w) { _n.negate(); w = -w; }
          (V.uPlanes.value as THREE.Vector4[])[i].set(_n.x, _n.y, _n.z, w);
        }
        const o = i * 12;
        for (let v = 0; v < 4; v++) {
          const c = v & 1 ? c1 : c0, far = v >= 2 ? SHAFT_LEN : 0;
          P[o + v * 3] = c.x - sunLocal.x * far; P[o + v * 3 + 1] = c.y - sunLocal.y * far; P[o + v * 3 + 2] = c.z - sunLocal.z * far;
          N[o + v * 3] = _n.x; N[o + v * 3 + 1] = _n.y; N[o + v * 3 + 2] = _n.z;
        }
      }
      for (let cap = 0; cap < 2; cap++) {
        const far = cap * SHAFT_LEN;
        for (let v = 0; v < 4; v++) {
          const c = s.corners[v], o = 48 + cap * 12 + v * 3;
          P[o] = c.x - sunLocal.x * far; P[o + 1] = c.y - sunLocal.y * far; P[o + 2] = c.z - sunLocal.z * far;
          N[o] = sunLocal.x; N[o + 1] = sunLocal.y; N[o + 2] = sunLocal.z;
        }
      }
      if (V) {
        // window plane (its normal toward the sun; inside = the cabin side) and the far cap parallel to it
        _n.subVectors(s.corners[1], s.corners[0]).cross(_m.subVectors(s.corners[3], s.corners[0])).normalize();
        if (_n.dot(sunLocal) < 0) _n.negate();
        const w = _n.dot(s.corners[0]), across = _n.dot(sunLocal) * SHAFT_LEN;
        (V.uPlanes.value as THREE.Vector4[])[4].set(_n.x, _n.y, _n.z, w);
        (V.uPlanes.value as THREE.Vector4[])[5].set(-_n.x, -_n.y, -_n.z, -(w - across));
        V.uLen.value = Math.max(0.05, across);
        V.uCol.value.copy(Atmos.sunColor).multiplyScalar(Atmos.sunIntensity * 0.035 * k);
        V.uTime.value = this.t;
      }
      s.pos.needsUpdate = true;
      s.mesh.geometry.getAttribute('normal').needsUpdate = true;
    }
  }
}
const _n = new THREE.Vector3(), _m = new THREE.Vector3();

// ---------------- window frost ----------------
let frostTex: THREE.CanvasTexture | null = null;
export function frostTexture(): THREE.CanvasTexture {
  if (frostTex) return frostTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  // fern-like rime: branching strokes, drawn tileable (each stroke also at its wrapped copies)
  const branch = (x: number, y: number, ang: number, len: number, w: number, depth: number) => {
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x2 + ox, y2 + oy); g.stroke();
    }
    if (depth <= 0) return;
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      const bx = x + (x2 - x) * t, by = y + (y2 - y) * t;
      g.lineWidth = w * 0.6;
      branch(bx, by, ang + 0.9 * (Math.random() < 0.5 ? -1 : 1), len * 0.4, w * 0.6, depth - 1);
    }
  };
  g.strokeStyle = 'rgba(255,255,255,0.3)';
  for (let i = 0; i < 40; i++) { g.lineWidth = 0.8 + Math.random() * 0.6; branch(Math.random() * S, Math.random() * S, Math.random() * 6.28, 18 + Math.random() * 30, 1.4, 2); }
  // fine granular frost
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < S * S; i++) {
    const n = 40 + Math.random() ** 2 * 140;
    img.data[i * 4] = Math.min(255, img.data[i * 4] + n);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  frostTex = t;
  return t;
}

let frostMat: THREE.ShaderMaterial | null = null;
export function frostMaterial(): THREE.ShaderMaterial {
  frostMat ??= new THREE.ShaderMaterial({
    uniforms: { uTex: { value: null }, uGrow: { value: 0 }, uCol: { value: new THREE.Color(0.8, 0.86, 0.92) } },
    vertexShader: /* glsl */ `
      attribute float aD;
      varying float vD; varying vec2 vUv;
      void main() { vD = aD; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex; uniform float uGrow; uniform vec3 uCol;
      varying float vD; varying vec2 vUv;
      void main() {
        float f = texture2D(uTex, vUv * 2.6).r;
        float g = texture2D(uTex, vUv * 7.0 + 0.37).r;
        // reach grows with the cold: from a rim on the frame to a hand's width over the skin,
        // with crystals creeping a little way into the opening
        float reach = mix(0.015, 0.2, uGrow);
        float inside = 1.0 - smoothstep(0.0, 0.035 * uGrow + 0.002, -vD);
        float outside = 1.0 - smoothstep(reach * 0.35, reach, vD - (f - 0.5) * 0.06);
        float a = (vD < 0.0 ? inside : outside) * (0.25 + 0.75 * f) * (0.6 + 0.4 * g) * uGrow;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uCol, a * 0.5);
      }`,
    transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  frostMat.uniforms.uTex.value = frostTexture();
  return frostMat;
}

export class WindowFrost {
  readonly group = new THREE.Group();
  readonly mats: THREE.ShaderMaterial[] = [];

  constructor(leftZ: number, rightZ: number) {
    const tA = Math.asin(WIN_Y0 / B), tB = Math.asin(WIN_Y1 / B);
    const M = 0.3; // margin around the opening, metres
    const inset = 0.012;
    for (const [side, wz] of [[1, leftZ], [-1, rightZ]] as [number, number][]) {
      // grid over theta / z around the opening, on the inner skin
      const NT = 22, NZ = 26;
      const t0 = tA - M / B, t1 = tB + M / B;
      const z0 = wz - WIN_W / 2 - M, z1 = wz + WIN_W / 2 + M;
      const pos: number[] = [], uv: number[] = [], dd: number[] = [], idx: number[] = [];
      for (let i = 0; i <= NT; i++) for (let j = 0; j <= NZ; j++) {
        const t = t0 + (t1 - t0) * (i / NT), z = z0 + (z1 - z0) * (j / NZ);
        const x = Math.cos(t) * (A - inset), y = YC + Math.sin(t) * (B - inset);
        pos.push(side * x, y, z);
        // signed distance to the opening edge, metres along the skin (negative inside it)
        const dt = Math.max(tA - t, t - tB) * B, dz = Math.abs(z - wz) - WIN_W / 2;
        const out = Math.hypot(Math.max(dt, 0), Math.max(dz, 0)) + Math.min(Math.max(dt, dz), 0);
        dd.push(out);
        uv.push(t * B, z);
      }
      for (let i = 0; i < NT; i++) for (let j = 0; j < NZ; j++) {
        const a = i * (NZ + 1) + j, b = a + NZ + 1;
        if (side > 0) idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute('aD', new THREE.Float32BufferAttribute(dd, 1));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const mat = frostMaterial().clone();
      mat.uniforms.uTex.value = frostTexture();
      mat.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'windowFrost';
      mesh.renderOrder = 1;
      this.group.add(mesh);
      this.mats.push(mat);
    }
  }

  // grow: 0..1 per window [left, right]; light: interior brightness
  update(growL: number, growR: number, light: number) {
    this.mats[0].uniforms.uGrow.value = growL;
    this.mats[1].uniforms.uGrow.value = growR;
    for (const m of this.mats) m.uniforms.uCol.value.setRGB(0.55, 0.6, 0.66).multiplyScalar(light);
    this.group.children[0].visible = growL > 0.01;
    this.group.children[1].visible = growR > 0.01;
  }
}

// ---------------- breath ----------------
const PUFFS = 24;
let breathMat: THREE.ShaderMaterial | null = null;
export function breathMaterial(): THREE.ShaderMaterial {
  breathMat ??= new THREE.ShaderMaterial({
    uniforms: { uViewH: { value: 900 }, uCol: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: /* glsl */ `
      attribute float aSize; attribute float aAlpha;
      uniform float uViewH;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float d = max(-mv.z, 0.03);
        gl_PointSize = clamp(aSize * uViewH * projectionMatrix[1][1] / d, 1.0, 512.0);
        vA = aAlpha * smoothstep(0.1, 0.35, d);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCol; varying float vA;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r = dot(c, c);
        float a = exp(-r * 2.8) * (1.0 - smoothstep(0.7, 1.0, r)) * vA;
        if (a < 0.002) discard;
        gl_FragColor = vec4(uCol, a);
      }`,
    transparent: true, depthWrite: false,
  });
  return breathMat;
}

export class BreathFog {
  readonly points: THREE.Points;
  private geo = new THREE.BufferGeometry();
  private pos = new Float32Array(PUFFS * 3);
  private vel = new Float32Array(PUFFS * 3);
  private age = new Float32Array(PUFFS).fill(99);
  private life = new Float32Array(PUFFS).fill(1);
  private size: THREE.BufferAttribute;
  private alpha: THREE.BufferAttribute;
  private next = 0;
  private cycle = Math.random() * 3;
  private emitAcc = 0;
  private side = 1;     // which exhalation valve this breath leaves by
  private mat: THREE.ShaderMaterial;

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.size = new THREE.BufferAttribute(new Float32Array(PUFFS), 1).setUsage(THREE.DynamicDrawUsage);
    this.alpha = new THREE.BufferAttribute(new Float32Array(PUFFS), 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aSize', this.size);
    this.geo.setAttribute('aAlpha', this.alpha);
    this.mat = breathMaterial().clone();
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.points.name = 'breathFog';
  }

  // mouth / exhaust: bomber-local exhaust point and the direction the mask vents (down-forward);
  // drift: cabin draught; k: visibility 0..1 (ADS amount x cold); rate: breaths per second
  update(dt: number, mouth: THREE.Vector3, vent: THREE.Vector3, ventX: THREE.Vector3, drift: THREE.Vector3, k: number, rate: number, light: number, viewH: number) {
    dt = Math.min(dt, 0.05);
    // breathing: exhale for the first 40% of each cycle
    this.cycle += dt * rate;
    if (this.cycle >= 1) { this.cycle -= 1; this.side = -this.side; }
    if (k > 0.01 && this.cycle < 0.4) {
      this.emitAcc += dt * 14;
      while (this.emitAcc >= 1) {
        this.emitAcc -= 1;
        const i = this.next; this.next = (this.next + 1) % PUFFS;
        const j = i * 3;
        this.pos[j] = mouth.x; this.pos[j + 1] = mouth.y; this.pos[j + 2] = mouth.z;
        const sp = 0.35 + Math.random() * 0.2;
        const sx = this.side;
        this.vel[j] = (vent.x + ventX.x * sx) * sp + (Math.random() - 0.5) * 0.06;
        this.vel[j + 1] = (vent.y + ventX.y * sx) * sp + (Math.random() - 0.5) * 0.06;
        this.vel[j + 2] = (vent.z + ventX.z * sx) * sp + (Math.random() - 0.5) * 0.06;
        this.age[i] = 0;
        this.life[i] = 0.9 + Math.random() * 0.6;
      }
    }
    const S = this.size.array as Float32Array, Al = this.alpha.array as Float32Array;
    let live = 0;
    for (let i = 0; i < PUFFS; i++) {
      const j = i * 3;
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) { Al[i] = 0; continue; }
      live++;
      const damp = 1 - Math.min(1, 1.2 * dt);
      this.vel[j] = this.vel[j] * damp + drift.x * dt * 2;
      this.vel[j + 1] = this.vel[j + 1] * damp + drift.y * dt * 2 + 0.12 * dt; // warm breath rises
      this.vel[j + 2] = this.vel[j + 2] * damp + drift.z * dt * 2;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      S[i] = 0.02 + 0.07 * Math.sqrt(t);
      Al[i] = 0.2 * k * Math.sin(Math.PI * Math.min(1, t * 1.6 + 0.05)) * (1 - t);
    }
    this.geo.getAttribute('position').needsUpdate = true;
    this.size.needsUpdate = true;
    this.alpha.needsUpdate = true;
    this.mat.uniforms.uViewH.value = viewH;
    this.mat.uniforms.uCol.value.setRGB(0.85, 0.88, 0.92).multiplyScalar(light);
    this.points.visible = k > 0.01 || live > 0;
  }

  dispose() {
    this.points.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}

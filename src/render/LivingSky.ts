import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Atmos, atmosUniforms, skyGLSL } from './Atmosphere';
import { mulberry } from './Particles';
import { useSkyEnv } from './AircraftLook';

// The living sky: purely visual life 3-9 km out, so the player's box is one of many.
//  - other bomber boxes (instanced low-detail B-17s), each trailing long contrail streams
//  - far-off dogfights: tiny fighters wheeling, gun flashes, now and then one falls burning
//    with a smoke trail
//  - flak fields bursting around some of the distant boxes
// Everything lives in the formation's frame (origin = formation centre, +Z = course), so it
// rides the floating origin for free. Air-fixed things (contrails, smoke, flak puffs) drift
// back at the formation's speed, computed analytically in the vertex shaders: the CPU only
// writes a few hundred floats per frame. ~6 draw calls, no shadows.

const LIFE = 48;          // s of contrail behind each distant bomber (~3.6 km)
const SMOKE_LIFE = 30;    // s of smoke behind a falling wreck
const WRECK_TIME = 42;    // s a wreck is followed before it's gone into the clouds
// Distant aircraft are drawn larger than life (like the enlarged enemy fighters): at 3-8 km
// a real-size B-17 seen level is a 1-pixel line, a fighter is dust.
const FIGHTER_SCALE = 3.2;
const BOMBER_SCALE = 2.2;

const ENGINES: [number, number, number][] = [[6.5, -0.05, -1.4], [3.02, -0.4, -1.0], [-3.02, -0.4, -1.0], [-6.5, -0.05, -1.4]];

// Combat box slots (like World.spawnFormation), metres in the box frame
const VIC = [[0, 0, 0], [36, -8, -34], [-36, -8, -34]];
const ELEMENTS = [[0, 0, 0], [95, 45, -70], [-95, -45, -80], [0, -90, -160], [120, 30, -220], [-120, 60, -230]];
const SLOTS = ELEMENTS.flatMap((e) => VIC.map((v) => new THREE.Vector3(e[0] + v[0], e[1] + v[1], e[2] + v[2]).multiplyScalar(1.4 * BOMBER_SCALE)));

// Where the other boxes fly, relative to ours (+X left, +Y up, +Z ahead)
const BOX_OFFSETS = [
  new THREE.Vector3(-4600, -250, 900),
  new THREE.Vector3(3800, 350, -2000),
  new THREE.Vector3(2600, 520, 5800),
  new THREE.Vector3(-3200, 150, -6800),
];

const hazeGLSL = /* glsl */ `
${skyGLSL}
// aerial perspective toward the sky colour, matching the cloud pass composite
vec3 hazed(vec3 col, vec3 wp) {
  vec3 d = wp - cameraPosition;
  float dist = length(d);
  return mix(col, skyRadiance(d / max(dist, 1.0)), 1.0 - exp(-dist / 26000.0));
}
`;

// Low-poly B-17 (~300 triangles): reads correctly from 3 km, where it is a dozen pixels
function bomberGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const cyl = (r0: number, r1: number, len: number, seg: number, x: number, y: number, z: number) =>
    parts.push(new THREE.CylinderGeometry(r0, r1, len, seg).rotateX(Math.PI / 2).translate(x, y, z));
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
    parts.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  cyl(1.15, 1.25, 8, 8, 0, 0, 2);         // forward fuselage
  cyl(0.7, 1.25, 2.8, 8, 0, -0.1, 7.4);   // nose
  cyl(1.15, 0.45, 11, 8, 0, 0.2, -7.5);   // rear fuselage, tapering to the tail
  // wings and tail are drawn 2-3x too thick: seen level from kilometres away a real wing is
  // an edge-on hairline that vanishes, this keeps a readable silhouette
  box(14, 0.9, 5, 0, -0.2, 1.6);           // wing centre section
  box(31.6, 0.75, 2.9, 0, -0.1, 1.0);      // outer wings
  box(13, 0.6, 2.6, 0, 0.5, -11.5);        // tailplane
  box(0.7, 5.2, 4.2, 0, 2.8, -11);         // fin
  for (const [x] of ENGINES) cyl(0.65, 0.7, 3.4, 6, x, -0.3, 3.3);
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  g.computeVertexNormals();
  return g;
}

// Low-poly single-engine fighter, 1:1 size (scaled up per instance)
function fighterGeometry(): THREE.BufferGeometry {
  const parts = [
    new THREE.CylinderGeometry(0.55, 0.65, 4.5, 6).rotateX(Math.PI / 2).translate(0, 0, 1.6),
    new THREE.CylinderGeometry(0.62, 0.2, 5, 6).rotateX(Math.PI / 2).translate(0, 0.05, -3),
    new THREE.BoxGeometry(10.5, 0.18, 1.8).translate(0, -0.25, 0.9),
    new THREE.BoxGeometry(3.6, 0.12, 0.9).translate(0, 0.15, -5),
    new THREE.BoxGeometry(0.12, 1.4, 1.1).translate(0, 0.8, -5),
  ];
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  g.computeVertexNormals();
  return g;
}

// Camera-facing ribbon strip: SEG segments, `aU` 0..1 along it, `aSide` -1/+1
function ribbonStrip(seg: number): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  const n = (seg + 1) * 2;
  const u = new Float32Array(n), side = new Float32Array(n), pos = new Float32Array(n * 3);
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    u[i * 2] = u[i * 2 + 1] = i / seg;
    side[i * 2] = -1; side[i * 2 + 1] = 1;
    if (i < seg) { const v = i * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aU', new THREE.BufferAttribute(u, 1));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.setIndex(idx);
  return g;
}

function quad(): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

const dyn = (arr: Float32Array, size: number) => new THREE.InstancedBufferAttribute(arr, size).setUsage(THREE.DynamicDrawUsage);

// Shared uniforms: time, formation speed, pixel footprint, the low cloud deck top
const shared = {
  uTime: { value: 0 },
  uSpeed: { value: 75 },
  uPx: { value: 0.001 },          // radians per pixel
  uAnchorY: { value: 7600 },      // world altitude of the frame origin
  uLowTop: { value: 5900 },
  uSunCol: { value: new THREE.Vector3() },
};

// World position + camera-facing side offset with a minimum on-screen width (in pixels);
// returns the width scale so the fragment can thin out alpha instead of vanishing.
const ribbonVert = /* glsl */ `
uniform float uPx;
vec3 faceCamera(vec3 wp, vec3 dirW, float side, float width, float minPx, out float thin) {
  vec3 toCam = cameraPosition - wp;
  float dist = length(toCam);
  vec3 s = normalize(cross(dirW, toCam / max(dist, 1e-3)) + 1e-5);
  float wmin = dist * uPx * minPx;
  thin = clamp(width / max(wmin, 1e-3), 0.0, 1.0);
  return wp + s * side * max(width, wmin);
}
`;

interface Box { off: THREE.Vector3; n: number; phase: number; silver: number }
interface Fighter { r: number; w: number; ph: number; tilt: THREE.Quaternion; bob: number; dead: number }
interface Site { c: THREE.Vector3; fighters: Fighter[]; nextFlash: number; nextKill: number }
interface Wreck { o: THREE.Vector3; v0: THREE.Vector3; t0: number; spin: number; seed: number; slot: number }
interface Glow { p: THREE.Vector3; t0: number; life: number; size: number; col: THREE.Color }

export class LivingSky {
  readonly group = new THREE.Group();
  private anchor: THREE.Vector3 | null = null;
  private forward: THREE.Vector3 | null = null;
  private contrailSrc: { enabled: boolean } | null = null;
  private k = 1;
  private rnd = mulberry(1944);
  private last = -1;

  private boxes: Box[] = [];
  private sites: Site[] = [];
  private wrecks: Wreck[] = [];
  private glows: Glow[] = [];

  private bombers: THREE.InstancedMesh;
  private fighters: THREE.InstancedMesh;
  private trails: THREE.Mesh;
  private trailEmit: THREE.InstancedBufferAttribute;
  private smoke: THREE.Mesh;
  private smokeData: THREE.InstancedBufferAttribute;   // o.xyz, t0
  private smokeV0: THREE.InstancedBufferAttribute;     // v0.xyz, seed
  private flak: THREE.Mesh;
  private flakPos: THREE.InstancedBufferAttribute;     // xyz, birth
  private flakHead = 0;
  private flakMax = 320;
  private flakAcc = [0, 0];
  private glowMesh: THREE.Mesh;
  private glowA: THREE.InstancedBufferAttribute;       // xyz, size
  private glowB: THREE.InstancedBufferAttribute;       // rgb (HDR)
  private static readonly MAX_BOMBERS = 48;
  private static readonly MAX_FIGHTERS = 24;
  private static readonly MAX_WRECKS = 3;
  private static readonly MAX_GLOWS = 40;
  private dummy = new THREE.Object3D();
  // The bomber stream (BomberStream.ts) draws the other boxes and their flak while it is up
  boxesOff = false;

  constructor() {
    this.group.name = 'livingSky';
    this.group.userData.noRebase = true;

    // --- bombers ---
    const bMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.1 });
    useSkyEnv(bMat, 0.45);
    this.bombers = new THREE.InstancedMesh(bomberGeometry(), bMat, LivingSky.MAX_BOMBERS);
    this.bombers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bombers.frustumCulled = false;
    this.bombers.count = 0;
    this.group.add(this.bombers);

    // --- dogfight fighters (and falling wrecks) ---
    const fMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.1 });
    useSkyEnv(fMat, 0.45);
    this.fighters = new THREE.InstancedMesh(fighterGeometry(), fMat, LivingSky.MAX_FIGHTERS + LivingSky.MAX_WRECKS);
    this.fighters.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fighters.frustumCulled = false;
    this.fighters.count = 0;
    this.group.add(this.fighters);

    // --- contrail streams from the distant bombers ---
    const tg = ribbonStrip(28);
    this.trailEmit = dyn(new Float32Array(LivingSky.MAX_BOMBERS * 4 * 4), 4); // xyz emitter, seed
    tg.setAttribute('iEmit', this.trailEmit);
    tg.instanceCount = 0;
    this.trails = new THREE.Mesh(tg, new THREE.ShaderMaterial({
      uniforms: { ...atmosUniforms, ...shared, uLife: { value: LIFE } },
      vertexShader: /* glsl */ `
        ${ribbonVert}
        uniform float uTime; uniform float uSpeed; uniform float uLife;
        attribute float aU; attribute float aSide; attribute vec4 iEmit;
        varying float vA; varying float vSide; varying float vT; varying vec3 vW; varying float vSeed;
        void main() {
          // denser segments near the aircraft, where the trail bends and widens fastest
          float t = aU * aU;
          float age = t * uLife;
          float sd = iEmit.w;
          vec3 p = iEmit.xyz + vec3(0.0, -age * 0.35, -uSpeed * age);
          // slow lateral meander as the trail ages
          p.x += (sin(sd * 1.7 + age * 0.21) * 0.7 + sin(sd * 3.1 + age * 0.53) * 0.3) * age * 0.9;
          p.y += sin(sd * 2.3 + age * 0.17) * age * 0.25;
          vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
          vec3 dirW = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, -1.0));
          float width = mix(0.8, 22.0, pow(t, 0.55));
          float thin;
          wp = faceCamera(wp, dirW, aSide, width, 1.2, thin);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          float dist = distance(cameraPosition, wp);
          vA = smoothstep(0.0, 0.012, t) * (1.0 - smoothstep(0.45, 1.0, t)) * mix(0.75, 0.3, t) * thin
             * (1.0 - smoothstep(11000.0, 16000.0, dist));
          vSide = aSide; vT = t; vW = wp; vSeed = sd;
        }`,
      fragmentShader: /* glsl */ `
        ${hazeGLSL}
        uniform vec3 uSunCol;
        varying float vA; varying float vSide; varying float vT; varying vec3 vW; varying float vSeed;
        void main() {
          float edge = 1.0 - vSide * vSide;
          float a = vA * edge * (0.85 + 0.15 * sin(vT * 160.0 + vSeed));
          vec3 col = uSunCol * 0.24 + vec3(0.42, 0.47, 0.55);
          gl_FragColor = vec4(hazed(col, vW), a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.trails.frustumCulled = false;
    this.trails.renderOrder = 7;
    this.group.add(this.trails);

    // --- smoke trails of falling wrecks ---
    const sg = ribbonStrip(56);
    this.smokeData = dyn(new Float32Array(LivingSky.MAX_WRECKS * 4), 4);
    this.smokeV0 = dyn(new Float32Array(LivingSky.MAX_WRECKS * 4), 4);
    sg.setAttribute('iO', this.smokeData);
    sg.setAttribute('iV', this.smokeV0);
    sg.instanceCount = LivingSky.MAX_WRECKS;
    this.smoke = new THREE.Mesh(sg, new THREE.ShaderMaterial({
      uniforms: { ...atmosUniforms, ...shared, uLife: { value: SMOKE_LIFE } },
      vertexShader: /* glsl */ `
        ${ribbonVert}
        uniform float uTime; uniform float uSpeed; uniform float uLife; uniform float uAnchorY; uniform float uLowTop;
        attribute float aU; attribute float aSide; attribute vec4 iO; attribute vec4 iV;
        varying float vA; varying float vSide; varying float vT; varying vec3 vW;
        ${WRECK_PATH_GLSL}
        void main() {
          float s = uTime - iO.w;              // seconds since the kill
          float age = aU * aU * uLife;
          float se = s - age;                  // when this bit of smoke was laid
          float ok = step(0.0, se) * step(s, ${WRECK_TIME.toFixed(1)}) * step(-1e8, iO.w);
          se = max(se, 0.0);
          vec3 p = iO.xyz + wreckPath(se, iV.xyz, iV.w) - vec3(0.0, 0.0, uSpeed * s);
          p.y += age * 0.6;                    // the smoke rises a little and spreads
          vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
          vec3 p2 = iO.xyz + wreckPath(se + 0.4, iV.xyz, iV.w) - vec3(0.0, 0.0, uSpeed * s);
          vec3 dirW = normalize(mat3(modelMatrix) * (p2 - p) + 1e-4);
          float width = mix(4.0, 46.0, pow(aU, 0.7));
          float thin;
          wp = faceCamera(wp, dirW, aSide, width, 1.5, thin);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          // hidden once it sinks into the cumulus deck
          float aboveDeck = smoothstep(uLowTop - 150.0, uLowTop + 250.0, p.y + uAnchorY);
          vA = ok * (1.0 - smoothstep(0.55, 1.0, aU)) * thin * aboveDeck;
          vSide = aSide; vT = aU; vW = wp;
        }`,
      fragmentShader: /* glsl */ `
        ${hazeGLSL}
        uniform vec3 uSunCol;
        varying float vA; varying float vSide; varying float vT; varying vec3 vW;
        void main() {
          float edge = 1.0 - vSide * vSide;
          float a = vA * edge * mix(0.95, 0.5, vT);
          // oily black at the fire, thinning to grey
          vec3 col = mix(vec3(0.025, 0.022, 0.02), vec3(0.16, 0.16, 0.17) + uSunCol * 0.03, smoothstep(0.0, 0.5, vT));
          gl_FragColor = vec4(hazed(col, vW), a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 7;
    this.group.add(this.smoke);
    for (let i = 0; i < LivingSky.MAX_WRECKS; i++) this.smokeData.setW(i, -1e9);

    // --- flak puffs (black, with an orange flash at the burst) ---
    const fq = quad();
    this.flakPos = dyn(new Float32Array(this.flakMax * 4).map((_, i) => (i % 4 === 3 ? -1e9 : 0)), 4);
    fq.setAttribute('iP', this.flakPos);
    fq.instanceCount = this.flakMax;
    this.flak = new THREE.Mesh(fq, new THREE.ShaderMaterial({
      uniforms: { ...atmosUniforms, ...shared },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uSpeed; uniform float uPx;
        attribute vec4 iP;
        varying vec2 vQ; varying float vA; varying float vFlash; varying vec3 vW; varying float vSeed;
        void main() {
          float age = uTime - iP.w;
          float alive = step(0.0, age) * step(age, 14.0);
          vec3 p = iP.xyz - vec3(0.0, 0.0, uSpeed * max(age, 0.0)) + vec3(0.0, age * 0.8, 0.0);
          vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
          float dist = distance(cameraPosition, wp);
          float size = mix(5.0, 30.0, 1.0 - exp(-age * 1.4)) * (0.65 + 0.7 * fract(iP.w * 7.31));
          float smin = dist * uPx * 1.6;
          float thin = clamp(size / smin, 0.0, 1.0);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float sz = max(size, smin) * alive;
          wp += (right * position.x + up * position.y) * sz;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          vQ = position.xy; vW = wp;
          vFlash = 1.0 - smoothstep(0.0, 0.18, age);
          vA = alive * thin * (1.0 - smoothstep(7.0, 14.0, age)) * (1.0 - smoothstep(12000.0, 16000.0, dist));
          vSeed = fract(iP.w * 13.7);
        }`,
      fragmentShader: /* glsl */ `
        ${hazeGLSL}
        uniform vec3 uSunCol;
        varying vec2 vQ; varying float vA; varying float vFlash; varying vec3 vW; varying float vSeed;
        void main() {
          float r = length(vQ);
          // soft, slightly lopsided smudge (two overlapping blobs)
          vec2 o = vec2(cos(vSeed * 40.0), sin(vSeed * 40.0)) * 0.28;
          float b1 = 1.0 - smoothstep(0.1, 0.75, length(vQ - o * 0.6));
          float b2 = 1.0 - smoothstep(0.05, 0.55, length(vQ + o));
          float a = clamp(b1 + b2 * 0.7, 0.0, 1.0) * vA;
          if (a < 0.004) discard;
          vec3 col = vec3(0.045, 0.04, 0.036) + uSunCol * 0.012 * (0.6 + 0.4 * vQ.y);
          col = mix(col, vec3(9.0, 5.0, 2.0), vFlash * (1.0 - smoothstep(0.0, 0.7, r)));
          gl_FragColor = vec4(hazed(col, vW), max(a, vFlash * vA));
        }`,
      transparent: true, depthWrite: false,
    }));
    this.flak.frustumCulled = false;
    this.flak.renderOrder = 6;
    this.group.add(this.flak);

    // --- glows: dogfight gun flashes, explosions, wreck fires (additive) ---
    const gq = quad();
    this.glowA = dyn(new Float32Array(LivingSky.MAX_GLOWS * 4), 4);
    this.glowB = dyn(new Float32Array(LivingSky.MAX_GLOWS * 3), 3);
    gq.setAttribute('iA', this.glowA);
    gq.setAttribute('iB', this.glowB);
    gq.instanceCount = 0;
    this.glowMesh = new THREE.Mesh(gq, new THREE.ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: /* glsl */ `
        uniform float uPx;
        attribute vec4 iA; attribute vec3 iB;
        varying vec2 vQ; varying vec3 vC;
        void main() {
          vec3 wp = (modelMatrix * vec4(iA.xyz, 1.0)).xyz;
          float dist = distance(cameraPosition, wp);
          float smin = dist * uPx * 2.5;
          float k = clamp(iA.w / smin, 0.05, 1.0);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          wp += (right * position.x + up * position.y) * max(iA.w, smin);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          vQ = position.xy;
          // energy kept roughly constant when a glow is held at the minimum size; fades with haze
          vC = iB * k * exp(-dist / 20000.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vQ; varying vec3 vC;
        void main() {
          float r = length(vQ);
          float g = exp(-r * r * 5.0) * (1.0 - smoothstep(0.7, 1.0, r));
          gl_FragColor = vec4(vC * g, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.glowMesh.frustumCulled = false;
    this.glowMesh.renderOrder = 9;
    this.group.add(this.glowMesh);

    for (const o of this.group.children) { o.castShadow = false; o.receiveShadow = false; }
    this.setQuality(1);
  }

  // The formation to fly with: its centre and course (World.formationCenter/-Forward are
  // updated in place, including on floating-origin shifts) and its contrail switch
  bind(src: { formationCenter: THREE.Vector3; formationForward: THREE.Vector3; contrails?: { enabled: boolean } }, speed = 75) {
    this.anchor = src.formationCenter;
    this.forward = src.formationForward;
    this.contrailSrc = src.contrails ?? null;
    shared.uSpeed.value = speed;
  }

  // k = QUALITY[q].particles: 0 off, 0.5 medium, 1 high, 1.6 ultra
  setQuality(k: number) {
    this.k = k;
    this.group.visible = k > 0;
    this.reset();
  }

  // Lay everything out again (deterministic for a seed: the screenshot gallery uses it)
  reset(seed = 1944) {
    const k = this.k;
    this.rnd = mulberry(seed);
    const R = this.rnd;
    const nBoxes = k >= 1.5 ? 4 : k >= 1 ? 3 : k > 0 ? 2 : 0;
    const perBox = k >= 1.5 ? 12 : k >= 1 ? 9 : 6;
    this.boxes = BOX_OFFSETS.slice(0, nBoxes).map((off, i) => ({ off: off.clone(), n: perBox - (i === 3 ? 3 : 0), phase: R() * 100, silver: i === 2 ? 0.6 : 0.15 }));
    const nSites = k >= 1.5 ? 3 : k >= 1 ? 2 : k > 0 ? 1 : 0;
    this.sites = [];
    for (let i = 0; i < nSites; i++) this.sites.push(this.newSite(i, true));
    this.wrecks = [];
    this.glows = [];
    for (let i = 0; i < LivingSky.MAX_WRECKS; i++) this.smokeData.setW(i, -1e9);
    this.smokeData.needsUpdate = true;
    const arr = this.flakPos.array as Float32Array;
    for (let i = 0; i < this.flakMax; i++) arr[i * 4 + 3] = -1e9;
    this.flakPos.needsUpdate = true;
    this.flakHead = 0;
    this.last = -1;
  }

  private newSite(i: number, initial: boolean): Site {
    const R = this.rnd;
    const side = (i % 2 === 0 ? -1 : 1) * (R() < 0.8 ? 1 : -1);
    const c = new THREE.Vector3(side * (2600 + R() * 3200), -200 + R() * 900, initial ? -3000 + R() * 9000 : 6500 + R() * 2500);
    const n = Math.max(3, Math.round((3 + R() * 3) * Math.min(1.2, this.k)));
    const fighters: Fighter[] = [];
    for (let j = 0; j < n; j++) {
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler((R() - 0.5) * 1.1, R() * Math.PI * 2, (R() - 0.5) * 1.1));
      const r = 260 + R() * 420;
      fighters.push({ r, w: (130 + R() * 40) / r * (R() < 0.5 ? -1 : 1), ph: R() * Math.PI * 2, tilt, bob: R() * 6, dead: -1 });
    }
    return { c, fighters, nextFlash: R() * 2, nextKill: 6 + R() * 20 };
  }

  // heightPx: render-target height, for the minimum on-screen size of distant things
  update(cam: THREE.PerspectiveCamera, time: number, heightPx: number) {
    if (!this.group.visible) return;
    const dt = this.last < 0 ? 0 : Math.max(0, Math.min(0.1, time - this.last));
    this.last = time;
    // frame: formation centre (or the camera when nothing is bound), facing along the course
    const anchor = this.anchor ?? cam.getWorldPosition(_v1);
    this.group.position.copy(anchor);
    if (this.forward) this.group.quaternion.setFromUnitVectors(_z, _v2.copy(this.forward).setY(0).normalize());
    this.group.updateMatrixWorld();
    shared.uTime.value = time;
    shared.uAnchorY.value = anchor.y;
    shared.uLowTop.value = Atmos.lowTop;
    shared.uSunCol.value.set(Atmos.sunColor.r, Atmos.sunColor.g, Atmos.sunColor.b).multiplyScalar(Atmos.sunIntensity);
    shared.uPx.value = (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) / Math.max(1, heightPx);
    this.updateBombers(time);
    this.updateDogfights(time, dt);
    this.updateFlak(time, dt);
    this.updateGlows(time);
  }

  private updateBombers(time: number) {
    const d = this.dummy;
    const col = _c;
    let n = 0, ribbons = 0;
    const E = this.trailEmit.array as Float32Array;
    const trailsOn = this.contrailSrc ? this.contrailSrc.enabled : true;
    for (let bi = 0; bi < (this.boxesOff ? 0 : this.boxes.length); bi++) {
      const b = this.boxes[bi];
      const t = time + b.phase;
      _v1.copy(b.off).add(_v2.set(Math.sin(t * 0.011) * 220, Math.sin(t * 0.017) * 60, Math.sin(t * 0.007) * 320));
      const sway = Math.cos(t * 0.011) * 0.011 * 220; // lateral rate -> bank and yaw
      for (let i = 0; i < b.n && n < LivingSky.MAX_BOMBERS; i++, n++) {
        const s = SLOTS[i];
        const ph = i * 1.7 + bi * 3.1;
        d.position.copy(_v1).add(s).add(_v2.set(Math.sin(t * 0.31 + ph) * 2.5, Math.sin(t * 0.47 + ph) * 1.6, Math.sin(t * 0.23 + ph) * 3));
        d.rotation.set(Math.sin(t * 0.4 + ph) * 0.01, sway * 0.004, -sway * 0.02 + Math.sin(t * 0.5 + ph) * 0.015);
        d.scale.setScalar(BOMBER_SCALE);
        d.updateMatrix();
        this.bombers.setMatrixAt(n, d.matrix);
        // olive drab, a few natural-metal ships
        const silver = ((i * 7 + bi * 3) % 10) / 10 < b.silver;
        col.setRGB(silver ? 0.34 : 0.075, silver ? 0.35 : 0.075, silver ? 0.36 : 0.045);
        this.bombers.setColorAt(n, col);
        if (trailsOn) {
          for (let e = 0; e < 4; e++) {
            const o = ENGINES[e];
            const q = (ribbons++) * 4;
            _v3.set(o[0], o[1], o[2]).multiplyScalar(BOMBER_SCALE).applyEuler(d.rotation).add(d.position);
            E[q] = _v3.x; E[q + 1] = _v3.y; E[q + 2] = _v3.z; E[q + 3] = n * 4.13 + e * 1.7;
          }
        }
      }
    }
    this.bombers.count = n;
    this.bombers.instanceMatrix.needsUpdate = true;
    if (this.bombers.instanceColor) this.bombers.instanceColor.needsUpdate = true;
    (this.trails.geometry as THREE.InstancedBufferGeometry).instanceCount = ribbons;
    this.trailEmit.needsUpdate = ribbons > 0;
    this.trails.visible = ribbons > 0;
  }

  private fighterPos(s: Site, f: Fighter, t: number, out: THREE.Vector3, fwd?: THREE.Vector3) {
    const a = f.ph + f.w * t;
    out.set(Math.cos(a) * f.r, Math.sin(t * 0.3 + f.bob) * 40, Math.sin(a) * f.r).applyQuaternion(f.tilt).add(s.c);
    if (fwd) fwd.set(-Math.sin(a) * Math.sign(f.w), 0, Math.cos(a) * Math.sign(f.w)).applyQuaternion(f.tilt);
    return out;
  }

  private updateDogfights(time: number, dt: number) {
    const R = this.rnd;
    const d = this.dummy;
    let n = 0;
    const siteDrift = -40; // m/s: dogfights fall behind the bombers
    for (let si = 0; si < this.sites.length; si++) {
      let s = this.sites[si];
      s.c.z += siteDrift * dt;
      if (s.c.z < -9500) s = this.sites[si] = this.newSite(si, false);
      for (const f of s.fighters) {
        if (f.dead > 0 && time - f.dead < 25) continue;
        f.dead = -1;
        if (n >= LivingSky.MAX_FIGHTERS) break;
        this.fighterPos(s, f, time, _v1, _v2);
        // bank into the turn: up leans toward the circle centre
        _v3.copy(s.c).sub(_v1).normalize().multiplyScalar(0.8).add(_y).normalize();
        _m.lookAt(_o, _v2, _v3);   // +Z of the matrix toward -_v2 (Matrix4.lookAt: z = eye - target)
        d.quaternion.setFromRotationMatrix(_m).multiply(_flip);
        d.position.copy(_v1);
        d.scale.setScalar(FIGHTER_SCALE);
        d.updateMatrix();
        this.fighters.setMatrixAt(n, d.matrix);
        this.fighters.setColorAt(n, (n % 3 === 0) ? _c.setRGB(0.3, 0.31, 0.3) : _c.setRGB(0.05, 0.055, 0.045));
        n++;
      }
      // gun flashes: short bright winks near the fighters
      s.nextFlash -= dt;
      if (s.nextFlash <= 0) {
        s.nextFlash = 0.25 + R() * 1.6 / Math.max(0.5, this.k);
        const f = s.fighters[Math.floor(R() * s.fighters.length)];
        if (f.dead < 0) {
          this.fighterPos(s, f, time, _v1, _v2);
          this.glow(_v1.addScaledVector(_v2, 30 + R() * 60), time, 0.08 + R() * 0.12, 8 + R() * 8, _c.setRGB(30, 22, 10));
        }
      }
      // now and then one goes down in flames
      s.nextKill -= dt;
      if (s.nextKill <= 0) {
        s.nextKill = 14 + R() * 26;
        const alive = s.fighters.filter((f) => f.dead < 0);
        if (alive.length > 1 && this.wrecks.length < LivingSky.MAX_WRECKS) {
          const f = alive[Math.floor(R() * alive.length)];
          f.dead = time;
          this.fighterPos(s, f, time, _v1, _v2);
          // velocity relative to the air: the turn speed plus the formation's own speed
          const v0 = _v2.clone().multiplyScalar(Math.abs(f.w) * f.r).add(new THREE.Vector3(0, 0, siteDrift + shared.uSpeed.value));
          const slot = [0, 1, 2].find((k) => !this.wrecks.some((w) => w.slot === k))!;
          const w: Wreck = { o: _v1.clone(), v0, t0: time, spin: (R() - 0.5) * 4, seed: R() * 10, slot };
          this.wrecks.push(w);
          this.smokeData.setXYZW(slot, w.o.x, w.o.y, w.o.z, time);
          this.smokeV0.setXYZW(slot, v0.x, v0.y, v0.z, w.seed);
          this.smokeData.needsUpdate = this.smokeV0.needsUpdate = true;
          this.glow(_v1, time, 0.5, 45, _c.setRGB(40, 20, 6));
        }
      }
    }
    // falling wrecks: tumbling, burning, trailing smoke
    this.wrecks = this.wrecks.filter((w) => {
      const s = time - w.t0;
      if (s > WRECK_TIME) { this.smokeData.setW(w.slot, -1e9); this.smokeData.needsUpdate = true; return false; }
      wreckPathJS(s, w.v0, w.seed, _v1).add(w.o);
      _v1.z -= shared.uSpeed.value * s;
      if (_v1.y + shared.uAnchorY.value > Atmos.lowTop - 100 && n < this.fighters.instanceMatrix.count) {
        d.position.copy(_v1);
        d.rotation.set(s * 0.7, s * 0.3, s * w.spin);
        d.scale.setScalar(FIGHTER_SCALE);
        d.updateMatrix();
        this.fighters.setMatrixAt(n, d.matrix);
        this.fighters.setColorAt(n, _c.setRGB(0.06, 0.06, 0.05));
        n++;
        const flick = 0.75 + 0.25 * Math.sin(time * 31 + w.seed * 7) * Math.sin(time * 17.3);
        this.glow(_v1, time, 0, 10 + 4 * flick, _c.setRGB(14 * flick, 6 * flick, 1.6 * flick));
      }
      return true;
    });
    this.fighters.count = n;
    this.fighters.instanceMatrix.needsUpdate = true;
    if (this.fighters.instanceColor) this.fighters.instanceColor.needsUpdate = true;
  }

  // Two barrages, each following one of the distant boxes, on and off in turn
  private updateFlak(time: number, dt: number) {
    if (dt <= 0 || this.k <= 0 || this.boxesOff) return;
    const R = this.rnd;
    const arr = this.flakPos.array as Float32Array;
    const max = Math.min(this.flakMax, Math.round(200 * this.k));
    const fields = this.k >= 1 ? [0, 2] : [0];
    let wrote = false;
    fields.forEach((bi, fi) => {
      const b = this.boxes[bi];
      if (!b) return;
      const on = Math.sin(time * 0.045 + fi * 2.4) > -0.1;
      if (!on) return;
      this.flakAcc[fi] += dt * 4.5 * Math.min(1.3, this.k);
      const t = time + b.phase;
      while (this.flakAcc[fi] >= 1) {
        this.flakAcc[fi] -= 1;
        // bursts bracket the box: mostly ahead, a few in the middle of it
        _v1.copy(b.off).add(_v2.set(Math.sin(t * 0.011) * 220, Math.sin(t * 0.017) * 60, Math.sin(t * 0.007) * 320));
        _v1.x += (R() - 0.5) * 900; _v1.y += (R() - 0.35) * 380; _v1.z += -200 + R() * 1100;
        const q = (this.flakHead++ % max) * 4;
        arr[q] = _v1.x; arr[q + 1] = _v1.y; arr[q + 2] = _v1.z; arr[q + 3] = time + R() * dt;
        wrote = true;
      }
    });
    (this.flak.geometry as THREE.InstancedBufferGeometry).instanceCount = max;
    if (wrote) this.flakPos.needsUpdate = true;
  }

  private glow(p: THREE.Vector3, t0: number, life: number, size: number, col: THREE.Color) {
    if (this.glows.length >= LivingSky.MAX_GLOWS) return;
    // life 0: lives one frame (held each frame by its owner, e.g. a wreck fire)
    this.glows.push({ p: p.clone(), t0, life, size, col: col.clone() });
  }

  private updateGlows(time: number) {
    const A = this.glowA.array as Float32Array, B = this.glowB.array as Float32Array;
    let n = 0;
    for (const g of this.glows) {
      const age = time - g.t0;
      const k = g.life > 0 ? Math.max(0, 1 - age / g.life) : 1;
      A[n * 4] = g.p.x; A[n * 4 + 1] = g.p.y; A[n * 4 + 2] = g.p.z; A[n * 4 + 3] = g.size * (0.6 + 0.4 * k);
      B[n * 3] = g.col.r * k; B[n * 3 + 1] = g.col.g * k; B[n * 3 + 2] = g.col.b * k;
      n++;
    }
    this.glows = this.glows.filter((g) => g.life > 0 && time - g.t0 < g.life);
    (this.glowMesh.geometry as THREE.InstancedBufferGeometry).instanceCount = n;
    this.glowMesh.visible = n > 0;
    this.glowA.needsUpdate = this.glowB.needsUpdate = n > 0;
  }
}

// Path of a falling wreck relative to where it was hit, in the air's frame: its momentum
// bleeding off, a drag-limited fall, and a slow corkscrew. Mirrored in GLSL below.
const VT = 110, G = 9.81, KD = 0.12;
function wreckPathJS(s: number, v0: THREE.Vector3, seed: number, out: THREE.Vector3) {
  const m = (1 - Math.exp(-KD * s)) / KD;
  const fall = VT * s - (VT * VT / G) * (1 - Math.exp(-G * s / VT));
  const w = 1.3 + (seed % 1) * 0.8, rr = Math.min(40, s * 6);
  return out.set(v0.x * m + Math.cos(s * w + seed) * rr, v0.y * m - fall, v0.z * m + Math.sin(s * w + seed) * rr);
}
const WRECK_PATH_GLSL = /* glsl */ `
vec3 wreckPath(float s, vec3 v0, float seed) {
  float m = (1.0 - exp(-${KD.toFixed(3)} * s)) / ${KD.toFixed(3)};
  float fall = ${VT.toFixed(1)} * s - ${(VT * VT / G).toFixed(3)} * (1.0 - exp(-${(G / VT).toFixed(5)} * s));
  float w = 1.3 + fract(seed) * 0.8;
  float rr = min(40.0, s * 6.0);
  return vec3(v0.x * m + cos(s * w + seed) * rr, v0.y * m - fall, v0.z * m + sin(s * w + seed) * rr);
}
`;

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _o = new THREE.Vector3();
const _y = new THREE.Vector3(0, 1, 0);
const _z = new THREE.Vector3(0, 0, 1);
// Matrix4.lookAt points +Z away from the target; the fighter mesh's nose is +Z
const _flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

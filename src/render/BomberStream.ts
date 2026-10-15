import * as THREE from 'three';
import { StreamTracers } from './StreamTracers';
import { STREAM_MIN_HALF_PX, STREAM_MIN_COVERAGE } from './StreamReadability';
import { Atmos, atmosUniforms, skyGLSL } from './Atmosphere';
import { useSkyEnv } from './AircraftLook';
import { weatherNow } from './WeatherState';
import { cloudOcclusionUniforms, cloudOcclusionGLSL } from './CloudOcclusion';
import { hasModel, instantiate, type ModelKind } from '../world/Models';
import { IMPOSTOR_FRAG_GLSL, IMPOSTOR_VERT_GLSL, ImpostorBake, mergeForInstancing, type ImpostorAtlas } from './Impostor';
import {
  buildStream, bomberPose, fighterPos, gaggleRecord, gaggleU, groupCentre, lossPath, newPose,
  KIND_BOMBER, LOSS_BLAST, LOSS_DIVE, LOSS_SPIRAL, LOSS_TEXELS, NOT_LOST, REC_FLOATS, REC_TEXELS, STREAM_GLSL, STREAM_TIERS,
  type StreamLayoutData, type StreamTier, type TierSpec,
} from '../world/StreamLayout';

// The thousand-bomber stream (Phase 10 goal 08): 150-1,000 B-17s in combat boxes stretching
// to the horizon ahead of, behind and beside our own box, P-51 / P-47 escort flights weaving
// above them, Fw 190 gaggles making head-on passes through distant boxes, flak barrages walking
// through other boxes, distant losses spiralling down in smoke with chutes, and the contrails
// of all of it merging into a persistent contrail field. Pure spectacle: nothing here touches
// gameplay, and it costs the CPU a few hundred floats a frame (StreamLayout.ts: every aircraft
// is a closed-form function of time, evaluated in the vertex shaders).
//
// Drawing: one instanced impostor billboard draw per aircraft type (bombers, escorts, gaggle
// fighters; atlases baked at load from the real models, Impostor.ts), plus an instanced mesh
// LOD for boxes that come within NEAR_IN of the camera (the real B-17 geometry merged into
// one draw per material). Contrails, the contrail field, smoke, flak/chutes and glows are one
// instanced draw each. ~10 draw calls in all.
//
// LOD / asset contract (for the hero B-17 of goal 02 and later hero fighters): see
// setModelSource() and docs/phase10/stream-lod-contract.md.

const NEAR_IN = 1100, NEAR_OUT = 1350;   // m: boxes this close draw the instanced mesh LOD
const SMOKE_LIFE = 36;                   // s of smoke behind a falling aircraft
const MAX_SMOKE = 8;
const MAX_GLOWS = 128;
const FLAK_RING = 448, CHUTE_RING = 64;  // puff instances: flak bursts, then chutes and blast smoke
const FIGHTER_TRAIL_LIFE = 34;

export interface StreamModelSource {
  /** model the bomber impostors are baked from (hero B-17: its LOD1) */
  bomber(): THREE.Object3D | null;
  /** model drawn instanced for the near boxes (hero B-17: its LOD2, opaque materials, <= ~10k tris) */
  near(): THREE.Object3D | null;
  /** escort fighters (P-51D; P-47 flights are tinted olive drab) */
  escort(): THREE.Object3D | null;
  /** Luftwaffe gaggle fighters */
  gaggle(): THREE.Object3D | null;
  /** prop disc radius (m) per model; skin test for the surface classes */
  propRadius: { bomber: number; escort: number; gaggle: number };
  isSkin?: (m: THREE.Material) => boolean;
  /** mesh names left out of the impostor bake and the near LOD */
  hide: RegExp;
  nearSkip: RegExp;
}

const fromCache = (k: ModelKind, level = 0) => () => {
  if (!hasModel(k)) return null;
  const root = instantiate(k);
  root.traverse(o => {
    const lod = o as THREE.LOD;
    if (!lod.isLOD) return;
    lod.autoUpdate = false;
    for (let i = 0; i < lod.levels.length; i++) lod.levels[i].object.visible = i === Math.min(level, lod.levels.length - 1);
  });
  return root;
};
export const DEFAULT_STREAM_MODELS: StreamModelSource = {
  bomber: fromCache('b17', 1), near: fromCache('b17', 2), escort: fromCache('p51d'), gaggle: fromCache('fw190'),
  propRadius: { bomber: 1.77, escort: 1.7, gaggle: 1.65 },
  isSkin: m => !!m.userData.surf || m.name === 'GD-L' || /^hero_(skin|neutral_grey)/.test(m.name),
  hide: /^crew$/,
  nearSkip: /^(crew|interior|gun_.*|turret_.*_guns)$/,
};

export interface StreamHost {
  formationCenter: THREE.Vector3;
  formationForward: THREE.Vector3;
  contrails?: { enabled: boolean };
  flakIntensity?: number;
  livingFormation?: { ships: readonly unknown[] };
}

// Shared uniforms (one object, every stream material holds references to it)
const U = {
  tStreamData: { value: null as THREE.DataTexture | null },
  tStreamLoss: { value: null as THREE.DataTexture | null },
  uSpeed: { value: 75 },
  uEscortTop: { value: 1200 },
  uTime: { value: 0 },
  uPx: { value: 0.001 },
  uAnchorY: { value: 7600 },
  uLowTop: { value: 5900 },
  uSunL: { value: new THREE.Vector3(0, 1, 0) },
  uStreamSun: { value: new THREE.Vector3(1, 1, 1) },
  uOn: { value: 1 },
  uA2C: { value: 1 },
};

// Distant ribbons need slowly varying aerial perspective, not two atmosphere LUT reads
// at every overlapping fragment. Interpolate it from their existing segmented vertices.
const hazeVertexGLSL = /* glsl */ `
${skyGLSL}
uniform float uHaze;
varying vec4 vStreamHaze;
void streamHaze(vec3 wp) {
  vec3 d = wp - cameraPosition; float dist = length(d);
  vStreamHaze = vec4(skyRadiance(d / max(dist, 1.0)), 1.0 - exp(-dist / (26000.0 * max(uHaze, 0.05))));
}
`;
const hazeGLSL = /* glsl */ `
${cloudOcclusionGLSL}
uniform vec3 uHorizon;
varying vec4 vStreamHaze;
vec3 hazed(vec3 col, vec3 wp) { return mix(col, vStreamHaze.rgb, vStreamHaze.a); }
`;

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

const noiseGLSL = /* glsl */ `
float shash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float snoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(shash(i), shash(i + vec2(1.0, 0.0)), f.x), mix(shash(i + vec2(0.0, 1.0)), shash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

// ---------------- impostor material (lit like every other aircraft) ----------------
const IMP_VERT_PARS = /* glsl */ `
attribute float iId;
uniform float uTime;
uniform float uPx;
uniform float uAnchorY;
uniform float uLowTop;
uniform vec3 uSunL;
uniform vec3 uImpC;
uniform float uImpR;
uniform float uMinPx;
uniform float uGlint;
varying vec4 vImpX;   // ink (coverage scale), paint, glint, fire
varying vec3 vImpBx;
varying vec3 vImpBy;
varying vec3 vImpBz;
`;
const IMP_VERT_MAIN = /* glsl */ `
int sid = int(iId + 0.5);
vec3 sP; mat3 sB; float sVis; float sFire;
sPose(sid, uTime, sP, sB, sVis, sFire);
vec4 sR2 = sRec(sid, 2);
float sScale = sR2.y;
sVis *= step(uLowTop - 150.0, sP.y + uAnchorY);       // gone into the cloud deck
vec3 sC = sP + sB * (uImpC * sScale);
vec3 camL = transpose(mat3(modelMatrix)) * (cameraPosition - modelMatrix[3].xyz);
vec3 toCam = camL - sC;
float sDist = max(length(toCam), 1.0);
vec3 vd = toCam / sDist;
vec3 vl = transpose(sB) * vd;
vec3 rxl; vec3 uyl;
impAxes(vl, rxl, uyl);
vec3 q = rxl * position.x + uyl * position.y;
impFrames(vl, q);
float hR = uImpR * sScale;
float h = max(hR, sDist * uPx * uMinPx);
vec3 impPos = sC + (sB * q) * h * sVis;
vec3 objectNormal = vd;
float ink = hR / h;
vImpX = vec4(max(ink * ink, uMinPx > 3.0 ? ${STREAM_MIN_COVERAGE.toFixed(2)} : 0.0), sR2.z, 0.0, sFire);
mat3 sMV = mat3(modelViewMatrix);
vImpBx = sMV * sB[0]; vImpBy = sMV * sB[1]; vImpBz = sMV * sB[2];
// sun glints: the mirror of the sun off the fuselage (a cylinder: lit when the half vector is
// square to it) and off the wing tops; the ship's slow rocking makes them wink on and off
vec3 hv = normalize(uSunL + vd);
float cyl = pow(max(1.0 - abs(dot(hv, sB[2])), 0.0), 260.0);
float wing = pow(max(dot(hv, sB[1]), 0.0), 700.0);
vImpX.z = (cyl * 0.7 + wing) * uGlint * smoothstep(-0.02, 0.08, uSunL.y) * (1.0 - sFire);
`;
const IMP_FRAG_PARS = /* glsl */ `
uniform float uTime;
uniform float uA2C;
uniform vec2 uSkin;
uniform vec3 uStreamSun;
uniform float uGlintK;
varying vec4 vImpX;
varying vec3 vImpBx;
varying vec3 vImpBy;
varying vec3 vImpBz;
`;
const impFragMap = (fighter: boolean) => /* glsl */ `
vec4 impAlb; vec4 impNrm;
impSample(impAlb, impNrm);
float impCov = impAlb.a;
vec3 impCol = impAlb.rgb / max(impCov, 1e-3);
float impCode = impNrm.a / max(impCov, 0.02);
float wGlass = smoothstep(0.78, 0.95, impCode);
float wSkin = smoothstep(0.32, 0.5, impCode) * (1.0 - wGlass);
float impRough = mix(mix(clamp(0.85 - 2.4 * impCode, 0.2, 0.9), uSkin.x, wSkin), 0.08, wGlass);
float impMetal = mix(mix(0.3, uSkin.y, wSkin), 0.0, wGlass);
float impShine = 0.35;
if (vImpX.y > 0.5) {
${fighter ? `
  // P-47 / Bf 109 flights: olive drab over the baked airframe
  float lum = dot(impCol, vec3(0.2126, 0.7152, 0.0722));
  impCol = mix(impCol, vec3(0.055, 0.06, 0.035) * clamp(lum / 0.3, 0.6, 1.4), wSkin);
  impRough = mix(impRough, 0.6, wSkin); impMetal = mix(impMetal, 0.15, wSkin);
` : `
  // natural-metal ship: aluminium wherever the skin is olive drab or neutral grey; markings stay
  float lum = dot(impCol, vec3(0.2126, 0.7152, 0.0722));
  float mark = max(step(0.26, lum), step(impCol.r * 1.3, impCol.b));
  float k = wSkin * (1.0 - mark);
  impCol = mix(impCol, vec3(0.43, 0.44, 0.46) * clamp(lum / 0.055, 0.6, 1.3), k);
  impRough = mix(impRough, 0.32, k); impMetal = mix(impMetal, 0.62, k);
  impShine = 1.0;
`}
}
${fighter ? '' : 'if (vImpX.y < 0.5) impShine = 0.35;'}
diffuseColor.rgb *= mix(impCol, impCol * vec3(0.35, 0.3, 0.27), vImpX.w * 0.6);
float impSharp = clamp((impCov - 0.5) / max(fwidth(impCov), 1e-4) + 0.5, 0.0, 1.0);
float impA = mix(impCov, impSharp, smoothstep(0.55, 1.0, vImpX.x)) * min(vImpX.x, 1.0);
if (impA < 0.02 || (uA2C < 0.5 && impA < 0.5)) discard;
diffuseColor.a = uA2C > 0.5 ? impA : 1.0;
`;
const IMP_FRAG_NORMAL = /* glsl */ `
vec3 impN = impNrm.rgb * 2.0 - 1.0;
if (dot(impN, impN) > 0.0025) normal = normalize(vImpBx * impN.x + vImpBy * impN.y + vImpBz * impN.z);
`;
const IMP_FRAG_EMIT = /* glsl */ `
totalEmissiveRadiance += uStreamSun * (vImpX.z * uGlintK * impShine) * impCov;
totalEmissiveRadiance += vec3(5.0, 1.8, 0.4) * vImpX.w * impCov * (0.35 + 0.25 * sin(uTime * 23.0 + vImpBx.x * 40.0));
`;

function impostorMaterial(atlas: ImpostorAtlas, fighter: boolean, minPx: number, glint: number) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.15, side: THREE.DoubleSide });
  useSkyEnv(m, 0.5);
  m.alphaToCoverage = true;
  const local = {
    tImpAlbedo: { value: atlas.albedo }, tImpNormal: { value: atlas.normal },
    uImpC: { value: atlas.center }, uImpR: { value: atlas.radius },
    uSkin: { value: new THREE.Vector2(atlas.skinRough, atlas.skinMetal) },
    uMinPx: { value: minPx }, uGlint: { value: glint }, uGlintK: { value: 3.5 },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, local);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${STREAM_GLSL}\n${IMPOSTOR_VERT_GLSL}\n${IMP_VERT_PARS}`)
      .replace('#include <beginnormal_vertex>', IMP_VERT_MAIN)
      .replace('#include <begin_vertex>', 'vec3 transformed = impPos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${IMPOSTOR_FRAG_GLSL}\n${IMP_FRAG_PARS}`)
      .replace('#include <map_fragment>', impFragMap(fighter))
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = impRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = impMetal;')
      .replace('#include <normal_fragment_maps>', IMP_FRAG_NORMAL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + IMP_FRAG_EMIT);
  };
  m.customProgramCacheKey = () => `sws-stream-imp-${fighter ? 'f' : 'b'}`;
  return m;
}

// ---------------- near LOD (instanced real geometry) ----------------
function nearMaterial(src: THREE.Material, skin: boolean): THREE.Material {
  const m = src;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${STREAM_GLSL}\nattribute float iId;\nuniform float uTime;\nuniform float uAnchorY;\nuniform float uLowTop;\nvarying float vNearPaint;`)
      .replace('#include <beginnormal_vertex>', /* glsl */ `
        int sid = int(iId + 0.5);
        vec3 sP; mat3 sB; float sVis; float sFire;
        sPose(sid, uTime, sP, sB, sVis, sFire);
        vec4 sR2 = sRec(sid, 2);
        sVis *= step(uLowTop - 150.0, sP.y + uAnchorY);
        vec3 objectNormal = sB * normal;
        vNearPaint = sR2.z;`)
      .replace('#include <begin_vertex>', 'vec3 transformed = sP + sB * (position * sR2.y * sVis);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vNearPaint;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + (skin ? /* glsl */ `
        if (vNearPaint > 0.5) {
          float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          float mark = max(step(0.26, lum), step(diffuseColor.r * 1.3, diffuseColor.b));
          diffuseColor.rgb = mix(vec3(0.43, 0.44, 0.46) * clamp(lum / 0.055, 0.6, 1.3), diffuseColor.rgb, mark);
          roughnessFactor = mix(0.32, roughnessFactor, mark); metalnessFactor = mix(0.62, metalnessFactor, mark);
        }` : ''));
  };
  m.customProgramCacheKey = () => `sws-stream-near-${skin ? 's' : 'o'}`;
  return m;
}

// ---------------- geometry helpers ----------------
function quad(): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}
function ribbonStrip(seg: number): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  const n = (seg + 1) * 2;
  const u = new Float32Array(n), side = new Float32Array(n);
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    u[i * 2] = u[i * 2 + 1] = i / seg;
    side[i * 2] = -1; side[i * 2 + 1] = 1;
    if (i < seg) { const v = i * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
  }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aU', new THREE.BufferAttribute(u, 1));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.setIndex(idx);
  return g;
}
const inst = (arr: Float32Array, size: number, dynamic = false) => {
  const a = new THREE.InstancedBufferAttribute(arr, size);
  if (dynamic) a.setUsage(THREE.DynamicDrawUsage);
  return a;
};
const shaderMat = (o: { uniforms?: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string; blending?: THREE.Blending }) => new THREE.ShaderMaterial({
  uniforms: { ...atmosUniforms, ...cloudOcclusionUniforms, ...U, ...(o.uniforms ?? {}) },
  vertexShader: o.fragmentShader.includes('hazed(') ? hazeVertexGLSL + o.vertexShader
    .replaceAll('uniform vec3 uSunDir;', '')
    .replace('gl_Position = projectionMatrix', 'streamHaze(wp); gl_Position = projectionMatrix') : o.vertexShader,
  fragmentShader: o.fragmentShader,
  transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, blending: o.blending ?? THREE.NormalBlending,
});

// Bomber engine positions (model metres, just behind the nacelles) for 1, 2 and 4 ribbons
const ENGINES: Record<1 | 2 | 4, [number, number, number][]> = {
  4: [[6.5, -0.1, -1.6], [3.0, -0.4, -1.2], [-3.0, -0.4, -1.2], [-6.5, -0.1, -1.6]],
  2: [[4.8, -0.25, -1.4], [-4.8, -0.25, -1.4]],
  1: [[0, -0.3, -1.4]],
};

interface Barrage { group: number; t0: number; dur: number; x: number; y: number; acc: number }
interface Wreck { id: number; t0: number; kind: number; seed: number; smoke: number; p0: THREE.Vector3; chutes: number[]; fighter: boolean }
interface Glow { x: number; y: number; z: number; t0: number; life: number; size: number; r: number; g: number; b: number }

export class BomberStream {
  readonly group = new THREE.Group();
  private host: StreamHost | null = null;
  private models: StreamModelSource = DEFAULT_STREAM_MODELS;
  private tier: StreamTier | null = null;
  private spec: TierSpec = STREAM_TIERS.high;
  private layout: StreamLayoutData | null = null;
  private dataTex: THREE.DataTexture | null = null;
  private lossTex: THREE.DataTexture | null = null;
  private bakes: { bomber: ImpostorBake | null; escort: ImpostorBake | null; gaggle: ImpostorBake | null } = { bomber: null, escort: null, gaggle: null };
  private nearSrc: { geometry: THREE.BufferGeometry; materials: THREE.Material[] } | null = null;
  private nearTried = false;
  private rnd = Math.random;
  private last = -1;
  private nearGroups = new Set<number>();
  private lodT = 0;

  // draws
  private bomberImp: THREE.Mesh | null = null;
  private escortImp: THREE.Mesh | null = null;
  private gaggleImp: THREE.Mesh | null = null;
  private near: THREE.Mesh | null = null;
  readonly tracers = new StreamTracers();
  private trails: THREE.Mesh;
  private field: THREE.Mesh;
  private smoke: THREE.Mesh;
  private puffs: THREE.Mesh;
  private glowMesh: THREE.Mesh;
  private puffP: THREE.InstancedBufferAttribute;   // xyz, birth
  private puffK: THREE.InstancedBufferAttribute;   // kind, size, life, seed
  private flakHead = 0;
  private chuteHead = 0;
  private smokeId: THREE.InstancedBufferAttribute;
  private glowA: THREE.InstancedBufferAttribute;
  private glowB: THREE.InstancedBufferAttribute;
  private glows: Glow[] = Array.from({ length: MAX_GLOWS }, () => ({ x: 0, y: 0, z: 0, t0: 0, life: 0, size: 0, r: 0, g: 0, b: 0 }));
  private nGlows = 0;

  // events
  private barrages: Barrage[] = [];
  private wrecks: Wreck[] = [];
  private nextLoss = 0;
  private gaggleKill: number[] = [];
  private gaggleRetarget: number[] = [];
  private attackedUntil: number[] = [];   // per group: s of time it is under attack until
  private shown = false;
  /** Master switch (dev A/B: sws.engine.bomberStream.enabled = false) */
  enabled = true;

  constructor() {
    this.group.name = 'bomberStream';
    this.group.userData.noRebase = true;
    this.group.visible = false;
    this.group.add(this.tracers.renderer.mesh);

    // --- contrails: one ribbon per engine (or pair) of every bomber, one per fighter ---
    this.trails = new THREE.Mesh(ribbonStrip(16), shaderMat({
      vertexShader: /* glsl */ `
        ${STREAM_GLSL}
        ${ribbonVert}
        uniform float uTime; uniform float uOn; uniform vec3 uSunDir;
        attribute float aU; attribute float aSide; attribute vec4 iRib; attribute vec3 iEmit;
        varying float vA; varying float vSide; varying float vT; varying vec3 vW; varying float vSeed; varying float vSun;
        void main() {
          int id = int(iRib.x + 0.5);
          float t = aU * aU;
          float age = t * iRib.w;
          float te = uTime - age;
          float ok = step(te, sLoss(id, 0).w - 0.05) * uOn;
          vec4 r2 = sRec(id, 2);
          vec3 P;
          if (r2.x < 0.5) { vec3 ang; P = sBomberPos(id, te, ang); P += sBasis(ang.x, ang.y, ang.z) * (iEmit * r2.y); }
          else P = sFighterPos(id, te) + iEmit * r2.y;
          float sd = iRib.y;
          vec3 p = P - vec3(0.0, 0.0, uSpeed * age);
          // the trail spreads, sinks and meanders as it ages
          p.x += (sin(sd * 1.7 + age * 0.21) * 0.7 + sin(sd * 3.1 + age * 0.53) * 0.3) * age * 0.22;
          p.y += sin(sd * 2.3 + age * 0.17) * age * 0.08 - age * 0.3;
          vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
          vec3 dirW = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, -1.0));
          float width = mix(0.5, 3.5 * iRib.z, pow(t, 0.6));
          float dist = distance(cameraPosition, wp);
          float thin;
          wp = faceCamera(wp, dirW, aSide, width * step(40.0, dist), 1.1, thin);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          vA = ok * smoothstep(0.6, 2.4, age) * (1.0 - smoothstep(0.3, 1.0, t)) * mix(0.34, 0.06, sqrt(t)) * thin
             * (1.0 - smoothstep(30000.0, 42000.0, dist)) * smoothstep(60.0, 180.0, dist);
          vSide = aSide; vT = t; vW = wp; vSeed = sd;
          vSun = dot(normalize(cross(dirW, normalize(cameraPosition - wp))) * aSide, uSunDir);
        }`,
      fragmentShader: /* glsl */ `
        ${hazeGLSL}
        uniform vec3 uStreamSun;
        varying float vA; varying float vSide; varying float vT; varying vec3 vW; varying float vSeed; varying float vSun;
        void main() {
          float edge = 1.0 - vSide * vSide;
          float a = vA * edge * (0.85 + 0.15 * sin(vT * 140.0 + vSeed));
          if (a < 0.002) discard;
          vec3 col = (uStreamSun * 0.22 + uHorizon * 0.78) * mix(0.9, 1.15, clamp(vSun * 0.5 + 0.5, 0.0, 1.0));
          gl_FragColor = vec4(hazed(col, vW), a * cloudVisibility(distance(cameraPosition, vW)));
        }`,
    }));
    this.trails.renderOrder = 7;

    // --- the contrail field: one wide, long-lived band per squadron ---
    this.field = new THREE.Mesh(ribbonStrip(24), shaderMat({
      vertexShader: /* glsl */ `
        ${STREAM_GLSL}
        ${ribbonVert}
        uniform float uTime; uniform float uOn; uniform vec3 uSunDir;
        attribute float aU; attribute float aSide; attribute vec4 iF0; attribute vec4 iF1;
        varying float vA; varying float vSide; varying float vAge; varying vec3 vW; varying float vSeed; varying float vSun;
        vec3 fieldAt(vec4 g, float age) {
          vec3 c = g.xyz + sMeander(g.w, uTime - age) + iF0.xyz - vec3(0.0, 0.0, uSpeed * age);
          c.x += sin(iF1.x * 3.7) * age * 0.8 + sin(iF1.x + age * 0.013) * age * 0.35;
          c.y -= age * 0.32;
          return c;
        }
        void main() {
          int gid = int(iF0.w + 0.5);
          vec4 g = sRec(gid, 0);
          float a0 = iF1.z, life = iF1.w;
          float k = pow(aU, 1.35);
          float age = a0 + k * (life - a0);
          vec3 p = fieldAt(g, age);
          vec3 p2 = fieldAt(g, age + 3.0);
          vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
          vec3 dirW = normalize(mat3(modelMatrix) * (p2 - p) + 1e-4);
          float width = mix(65.0, 850.0 * iF1.y, pow(k, 0.65));
          float dist = distance(cameraPosition, wp);
          float nearK = smoothstep(width * 0.5 + 120.0, width * 0.9 + 600.0, dist);
          float thin;
          // Old camera-facing bands stood upright like white fences. A spreading
          // wake is a horizontal ice sheet, advected with its squadron's air mass.
          vec3 sheetSide = normalize(mat3(modelMatrix) * vec3(1.0, 0.0, 0.0));
          wp += sheetSide * aSide * width;
          thin = 1.0;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          vA = uOn * smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.5, 1.0, k)) * thin * nearK
             * (1.0 - smoothstep(30000.0, 44000.0, dist)) * mix(0.38, 0.22, k);
          vSide = aSide; vAge = age; vW = wp; vSeed = iF1.x;
          vSun = dot(normalize(cross(dirW, normalize(cameraPosition - wp))) * aSide, uSunDir);
        }`,
      fragmentShader: /* glsl */ `
        ${hazeGLSL}
        ${noiseGLSL}
        uniform vec3 uStreamSun; uniform vec3 uSunDir; uniform float uTwilight;
        varying float vA; varying float vSide; varying float vAge; varying vec3 vW; varying float vSeed; varying float vSun;
        void main() {
          float edge = pow(max(1.0 - vSide * vSide, 0.0), 1.8);
          // wispy streaks along the band, like spreading cirrus
          float n1 = snoise(vec2(vSide * 3.5 + vSeed * 7.0, vAge * 0.012));
          float n2 = snoise(vec2(vSide * 11.0 + vSeed * 3.0, vAge * 0.045 + 5.0));
          float density = edge * mix(0.45, 1.25, n1) * mix(0.7, 1.15, n2);
          float slant = min(3.0, 1.0 / max(0.18, abs(normalize(cameraPosition - vW).y)));
          float a = 1.0 - exp(-vA * density * slant);
          if (a < 0.002) discard;
          // Beer attenuation through the sheet; a bounded forward lobe retains
          // amber sunset lighting without bleaching the whole horizon white.
          float mu = dot(normalize(vW - cameraPosition), uSunDir);
          float phase = min(3.0, 0.51 / pow(max(0.09, 1.49 - 1.4 * mu), 1.5));
          float transmission = exp(-density * 1.2);
          // low sun: down-sun the sheet takes the cool earth-shadow sky, not the burning horizon (Atmosphere.ts)
          float toward = (mu * 0.5 + 0.5) * (mu * 0.5 + 0.5);
          vec3 skyLight = mix(uHorizon, vec3(0.30, 0.34, 0.56) * dot(uHorizon, vec3(0.2126, 0.7152, 0.0722)) * 1.05, uTwilight * (1.0 - toward));
          vec3 col = skyLight * 0.62 + uStreamSun * 0.16 * (0.4 + 0.6 * transmission) * (0.7 + phase);
          gl_FragColor = vec4(hazed(col, vW), a * cloudVisibility(distance(cameraPosition, vW)));
        }`,
    }));
    this.field.renderOrder = 6;

    // --- smoke behind falling aircraft ---
    const sg = ribbonStrip(48);
    this.smokeId = inst(new Float32Array(MAX_SMOKE).fill(-1), 1, true);
    sg.setAttribute('iS', this.smokeId);
    sg.instanceCount = MAX_SMOKE;
    this.smoke = new THREE.Mesh(sg, shaderMat({
      uniforms: { uLife: { value: SMOKE_LIFE } },
      vertexShader: /* glsl */ `
        ${STREAM_GLSL}
        ${ribbonVert}
        uniform float uTime; uniform float uLife; uniform float uAnchorY; uniform float uLowTop;
        attribute float aU; attribute float aSide; attribute float iS;
        varying float vA; varying float vSide; varying float vT; varying vec3 vW;
        void main() {
          int id = int(max(iS, 0.0) + 0.5);
          vec4 L0 = sLoss(id, 0), L1 = sLoss(id, 1);
          float s = uTime - L0.w;
          float age = aU * aU * uLife;
          float se = s - age;
          float ok = step(0.0, iS) * step(0.0, se) * step(s, 95.0) * step(L1.z, 1.5);
          se = max(se, 0.0);
          float sc = sRec(id, 2).y;
          vec3 p = L0.xyz + sLossPath(se, L1.y, L1.z) - vec3(0.0, 0.0, uSpeed * age) + vec3(sin(L1.y) * 4.0 * sc, age * 0.6, 0.0);
          vec3 p2 = L0.xyz + sLossPath(se + 0.4, L1.y, L1.z) - vec3(0.0, 0.0, uSpeed * age);
          vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
          vec3 dirW = normalize(mat3(modelMatrix) * (p2 - p) + 1e-4);
          float width = mix(2.0, 34.0, pow(aU, 0.7)) * (sRec(id, 2).x > 0.5 ? 0.6 : 1.0);
          float thin;
          wp = faceCamera(wp, dirW, aSide, width, 1.4, thin);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          float aboveDeck = smoothstep(uLowTop - 150.0, uLowTop + 250.0, p.y + uAnchorY);
          vA = ok * (1.0 - smoothstep(0.55, 1.0, aU)) * thin * aboveDeck;
          vSide = aSide; vT = aU; vW = wp;
        }`,
      fragmentShader: /* glsl */ `
        ${hazeGLSL}
        uniform vec3 uStreamSun;
        varying float vA; varying float vSide; varying float vT; varying vec3 vW;
        void main() {
          float edge = 1.0 - vSide * vSide;
          float a = vA * edge * mix(0.95, 0.45, vT);
          if (a < 0.002) discard;
          vec3 col = mix(vec3(0.025, 0.022, 0.02), vec3(0.15, 0.15, 0.16) + uStreamSun * 0.03, smoothstep(0.0, 0.5, vT));
          gl_FragColor = vec4(hazed(col, vW), a * cloudVisibility(distance(cameraPosition, vW)));
        }`,
    }));
    this.smoke.renderOrder = 7;

    // --- puffs: flak bursts (black, orange flash), chutes (white), blast smoke ---
    const pq = quad();
    const N = FLAK_RING + CHUTE_RING;
    this.puffP = inst(new Float32Array(N * 4).map((_, i) => (i % 4 === 3 ? -1e9 : 0)), 4, true);
    this.puffK = inst(new Float32Array(N * 4), 4, true);
    pq.setAttribute('iP', this.puffP);
    pq.setAttribute('iK', this.puffK);
    pq.instanceCount = N;
    this.puffs = new THREE.Mesh(pq, shaderMat({
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uSpeed; uniform float uPx;
        attribute vec4 iP; attribute vec4 iK;
        varying vec2 vQ; varying float vA; varying float vFlash; varying vec3 vW; varying float vSeed; varying float vKind;
        void main() {
          float age = uTime - iP.w;
          float life = iK.z;
          float alive = step(0.0, age) * step(age, life);
          float kind = iK.x;
          vec3 p = iP.xyz - vec3(0.0, 0.0, uSpeed * max(age, 0.0));
          float size;
          if (kind < 0.5) { p.y += age * 0.8; size = mix(4.0, 24.0, 1.0 - exp(-age * 1.5)) * iK.y; }
          else if (kind < 1.5) { p.y -= age * 5.5; size = iK.y * smoothstep(0.0, 1.5, age); }
          else { p.y += age * 0.5; size = mix(10.0, 55.0, 1.0 - exp(-age * 0.9)) * iK.y; }
          vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
          float dist = distance(cameraPosition, wp);
          float smin = dist * uPx * 1.5;
          float thin = clamp(size / smin, 0.0, 1.0);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          wp += (right * position.x + up * position.y) * max(size, smin) * alive;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          vQ = position.xy; vW = wp; vKind = kind; vSeed = iK.w;
          vFlash = kind < 0.5 ? 1.0 - smoothstep(0.0, 0.16, age) : (kind > 1.5 ? 1.0 - smoothstep(0.0, 0.4, age) : 0.0);
          vA = alive * thin * (1.0 - smoothstep(life * 0.5, life, age)) * (1.0 - smoothstep(30000.0, 40000.0, dist));
        }`,
      fragmentShader: /* glsl */ `
        ${hazeGLSL}
        ${noiseGLSL}
        uniform vec3 uStreamSun;
        varying vec2 vQ; varying float vA; varying float vFlash; varying vec3 vW; varying float vSeed; varying float vKind;
        void main() {
          float r = length(vQ);
          vec3 col; float a;
          if (vKind > 0.5 && vKind < 1.5) {
            // a parachute: a small white canopy
            a = (1.0 - smoothstep(0.55, 0.9, r)) * vA;
            col = vec3(0.78, 0.76, 0.7) * (uStreamSun * 0.2 + uHorizon * 0.5) * (0.85 + 0.25 * vQ.y);
          } else {
            vec2 o = vec2(cos(vSeed * 40.0), sin(vSeed * 40.0)) * 0.28;
            float erosion = (snoise(vQ * 12.0 + vSeed * 19.0) - 0.5) * 0.12;
            float b1 = 1.0 - smoothstep(0.34, 0.57, length(vQ - o * 0.6) + erosion);
            float b2 = 1.0 - smoothstep(0.20, 0.43, length(vQ + o) - erosion);
            a = clamp(b1 + b2 * 0.7, 0.0, 1.0) * vA;
            col = vec3(0.045, 0.04, 0.036) + uStreamSun * 0.012 * (0.6 + 0.4 * vQ.y);
            col = mix(col, vec3(9.0, 5.0, 2.0), vFlash * (1.0 - smoothstep(0.0, 0.7, r)));
            a = max(a, vFlash * vA * (1.0 - r));
          }
          if (a < 0.004) discard;
          gl_FragColor = vec4(hazed(col, vW), a * cloudVisibility(distance(cameraPosition, vW)));
        }`,
    }));
    this.puffs.renderOrder = 6;

    // --- glows: gun flashes, return fire, explosions, fires on falling aircraft (additive) ---
    const gq = quad();
    this.glowA = inst(new Float32Array(MAX_GLOWS * 4), 4, true);
    this.glowB = inst(new Float32Array(MAX_GLOWS * 3), 3, true);
    gq.setAttribute('iA', this.glowA);
    gq.setAttribute('iB', this.glowB);
    gq.instanceCount = 0;
    this.glowMesh = new THREE.Mesh(gq, shaderMat({
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uPx;
        attribute vec4 iA; attribute vec3 iB;
        varying vec2 vQ; varying vec3 vC;
        void main() {
          vec3 wp = (modelMatrix * vec4(iA.xyz, 1.0)).xyz;
          float dist = distance(cameraPosition, wp);
          float smin = dist * uPx * 2.2;
          float k = clamp(iA.w / smin, 0.05, 1.0);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          wp += (right * position.x + up * position.y) * max(iA.w, smin);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          vQ = position.xy;
          vC = iB * k * exp(-dist / 22000.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vQ; varying vec3 vC;
        void main() {
          float r = length(vQ);
          float g = exp(-r * r * 5.0) * (1.0 - smoothstep(0.7, 1.0, r));
          gl_FragColor = vec4(vC * g, 1.0);
        }`,
    }));
    this.glowMesh.renderOrder = 9;

    for (const m of [this.trails, this.field, this.smoke, this.puffs, this.glowMesh]) {
      m.frustumCulled = false;
      m.castShadow = m.receiveShadow = false;
      this.group.add(m);
    }
  }

  // The formation to fly with (World): its centre and course are updated in place, including
  // on floating-origin shifts; its contrail switch, flak level and formation (is there one?)
  bind(host: StreamHost, speed = 75) {
    this.host = host;
    U.uSpeed.value = speed;
  }

  /**
   * Swap the models the stream is drawn from (hero assets, goal 02). Everything is rebaked
   * on the next frames; nothing else changes. Pass DEFAULT_STREAM_MODELS to go back.
   */
  setModelSource(src: StreamModelSource) {
    this.models = src;
    this.rebake();
  }

  /** Throw away the impostor atlases and the near LOD and build them again (models changed) */
  rebake() {
    for (const k of ['bomber', 'escort', 'gaggle'] as const) { this.bakes[k]?.dispose(); this.bakes[k] = null; }
    for (const m of [this.bomberImp, this.escortImp, this.gaggleImp, this.near]) if (m) { this.group.remove(m); (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose()); }
    this.bomberImp = this.escortImp = this.gaggleImp = this.near = null;
    this.nearSrc?.geometry.dispose();
    this.nearSrc = null;
    this.nearTried = false;
    this.nearGroups.clear();
    if (this.layout) this.buildDraws();
  }

  /** Quality tier (Engine.setQuality): a smaller stream and cheaper contrails on Low */
  setQuality(q: StreamTier, msaa: number) {
    U.uA2C.value = msaa > 0 ? 1 : 0;
    if (q === this.tier) return;
    this.tier = q;
    this.spec = STREAM_TIERS[q];
    const tileChanged = !!this.bakes.bomber && this.bakes.bomber.atlas.tile !== this.spec.tile;
    if (tileChanged) for (const k of ['bomber', 'escort', 'gaggle'] as const) { this.bakes[k]?.dispose(); this.bakes[k] = null; }
    this.reset();
  }

  /** Lay the stream out again (deterministic for a seed: screenshots use it) */
  reset(seed = 1944) {
    if (!this.tier) return;
    let s = seed;
    this.rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    this.layout = buildStream(this.tier, seed);
    const L = this.layout;
    this.dataTex?.dispose();
    this.lossTex?.dispose();
    this.dataTex = new THREE.DataTexture(L.data, REC_TEXELS, L.count, THREE.RGBAFormat, THREE.FloatType);
    const loss = new Float32Array(L.count * LOSS_TEXELS * 4);
    for (let i = 0; i < L.count; i++) loss[i * 8 + 3] = NOT_LOST;
    this.lossTex = new THREE.DataTexture(loss, LOSS_TEXELS, L.count, THREE.RGBAFormat, THREE.FloatType);
    for (const t of [this.dataTex, this.lossTex]) { t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; }
    U.tStreamData.value = this.dataTex;
    U.tStreamLoss.value = this.lossTex;
    this.barrages = [];
    this.wrecks = [];
    this.nGlows = 0;
    this.tracers.clear();
    this.attackedUntil = L.groups.map(() => -1);
    this.gaggleKill = L.gaggles.map(() => 20 + this.rnd() * 20);
    this.gaggleRetarget = L.gaggles.map((g) => g.period * (2.5 + this.rnd() * 1.5));
    this.nextLoss = -1;
    this.last = -1;
    (this.smokeId.array as Float32Array).fill(-1); this.smokeId.needsUpdate = true;
    const P = this.puffP.array as Float32Array;
    for (let i = 3; i < P.length; i += 4) P[i] = -1e9;
    this.puffP.needsUpdate = true;
    this.flakHead = this.chuteHead = 0;
    this.buildRibbons();
    this.buildDraws();
  }

  private buildRibbons() {
    const L = this.layout!, spec = this.spec;
    const eng = ENGINES[spec.ribbons];
    const widthMul = spec.ribbons === 4 ? 1 : spec.ribbons === 2 ? 1.5 : 2.2;
    const fighters = L.escortCount + L.gaggles.reduce((n, g) => n + g.count, 0);
    const gaggleTrails = this.tier === 'high' || this.tier === 'ultra';
    const n = L.bombers * eng.length + fighters;
    const rib = new Float32Array(n * 4), emit = new Float32Array(n * 3);
    let k = 0;
    for (let i = 0; i < L.bombers; i++) for (let e = 0; e < eng.length; e++, k++) {
      rib.set([i, i * 4.13 + e * 1.7, widthMul, spec.engineLife * (0.85 + 0.3 * ((i * 7 + e) % 5) / 4)], k * 4);
      emit.set(eng[e], k * 3);
    }
    for (let i = L.escortFirst; i < L.count; i++) {
      if (i >= L.escortFirst + L.escortCount && !gaggleTrails) continue;
      rib.set([i, i * 2.71, 0.45, FIGHTER_TRAIL_LIFE], k * 4);
      emit.set([0, 0, -3], k * 3);
      k++;
    }
    const g = this.trails.geometry as THREE.InstancedBufferGeometry;
    g.setAttribute('iRib', inst(rib, 4));
    g.setAttribute('iEmit', inst(emit, 3));
    g.instanceCount = k;
    // the field: one band per squadron
    const sq: number[] = [], sq2: number[] = [];
    for (const gr of L.groups) gr.squadrons.forEach((c, j) => {
      sq.push(c.x, c.y, c.z, gr.first);
      sq2.push(gr.index * 3.3 + j * 1.1, 1 + (gr.count / 3 - 6) * 0.04, 14 + j * 2, spec.fieldLife * (0.9 + 0.2 * this.rnd()));
    });
    const fg = this.field.geometry as THREE.InstancedBufferGeometry;
    fg.setAttribute('iF0', inst(new Float32Array(sq), 4));
    fg.setAttribute('iF1', inst(new Float32Array(sq2), 4));
    fg.instanceCount = sq.length / 4;
  }

  // Impostor and near-LOD meshes (once their atlases / geometry exist)
  private buildDraws() {
    const L = this.layout;
    if (!L) return;
    const mk = (b: ImpostorBake | null, fighter: boolean, ids: number[], minPx: number, glint: number, old: THREE.Mesh | null) => {
      if (!b || !b.done) return old;
      if (old) { this.group.remove(old); (old.material as THREE.Material).dispose(); }
      const g = quad();
      g.setAttribute('iId', inst(new Float32Array(Math.max(1, ids.length)), 1, true));
      (g.getAttribute('iId').array as Float32Array).set(ids);
      g.instanceCount = ids.length;
      const m = new THREE.Mesh(g, impostorMaterial(b.atlas, fighter, minPx, glint));
      m.frustumCulled = false;
      m.castShadow = m.receiveShadow = false;
      this.group.add(m);
      return m;
    };
    const range = (a: number, n: number) => Array.from({ length: n }, (_, i) => a + i);
    if (this.bakes.bomber?.done && !this.bomberImp) this.bomberImp = mk(this.bakes.bomber, false, range(0, L.bombers), this.tier === 'low' ? 2.0 : STREAM_MIN_HALF_PX, 1, null);
    if (this.bakes.escort?.done && !this.escortImp) this.escortImp = mk(this.bakes.escort, true, range(L.escortFirst, L.escortCount), 1.3, 0.8, null);
    const gStart = L.escortFirst + L.escortCount;
    if (this.bakes.gaggle?.done && !this.gaggleImp) this.gaggleImp = mk(this.bakes.gaggle, true, range(gStart, L.count - gStart), 1.3, 0.5, null);
    // layout changed under existing meshes: refresh their id lists
    if (this.bomberImp) this.setIds(this.bomberImp, range(0, L.bombers).filter((i) => !this.nearGroups.has(this.groupOf(i))));
    if (this.escortImp) this.setIds(this.escortImp, range(L.escortFirst, L.escortCount));
    if (this.gaggleImp) this.setIds(this.gaggleImp, range(gStart, L.count - gStart));
    if (this.nearSrc && !this.near) {
      const src = this.nearSrc.geometry;
      const g = new THREE.InstancedBufferGeometry();
      g.setIndex(src.index);
      for (const [name, a] of Object.entries(src.attributes)) g.setAttribute(name, a);
      for (const gr of src.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
      g.setAttribute('iId', inst(new Float32Array(256), 1, true));
      g.instanceCount = 0;
      const mats = this.nearSrc.materials.map((m) => nearMaterial(m, !!(m as THREE.MeshStandardMaterial).map && (m.name === 'GD-L' || (this.models.isSkin?.(m) ?? false))));
      this.near = new THREE.Mesh(g, mats);
      this.near.frustumCulled = false;
      this.near.castShadow = this.near.receiveShadow = false;
      this.group.add(this.near);
    }
    this.nearGroups.clear();
    this.lodT = 0;
  }

  private setIds(m: THREE.Mesh, ids: number[]) {
    const g = m.geometry as THREE.InstancedBufferGeometry;
    let a = g.getAttribute('iId') as THREE.InstancedBufferAttribute;
    if (a.count < ids.length) { a = inst(new Float32Array(ids.length), 1, true); g.setAttribute('iId', a); }
    (a.array as Float32Array).set(ids);
    a.needsUpdate = true;
    g.instanceCount = ids.length;
  }

  private groupOf(i: number) { return this.layout!.data[i * REC_FLOATS + 11]; }

  // Compile the near-LOD programs (World.prewarm): one instance for a frame
  warm(): () => void {
    const n = this.near;
    if (!n || !this.layout || !this.group.visible) return () => {};
    const g = n.geometry as THREE.InstancedBufferGeometry;
    const before = g.instanceCount;
    if (before === 0) { (g.getAttribute('iId').array as Float32Array)[0] = 0; g.getAttribute('iId').needsUpdate = true; g.instanceCount = 1; }
    return () => { g.instanceCount = before; };
  }

  // heightPx: render-target height, for the minimum on-screen size of distant things
  update(renderer: THREE.WebGLRenderer, cam: THREE.PerspectiveCamera, time: number, heightPx: number) {
    const host = this.host;
    const L = this.layout;
    this.shown = this.enabled && !!host && !!L && (host.livingFormation ? host.livingFormation.ships.length > 0 : true) && weatherNow.night < 0.5;
    this.group.visible = this.shown && this.tier !== 'low';
    if (this.tier === 'low') return;
    if (!this.shown || !L || !host) return;
    this.bake(renderer);
    const dt = this.last < 0 ? 0 : Math.max(0, Math.min(0.1, time - this.last));
    this.last = time;
    const anchor = host.formationCenter;
    this.group.position.copy(anchor);
    this.group.quaternion.setFromUnitVectors(_z, _v1.copy(host.formationForward).setY(0).normalize());
    this.group.updateMatrixWorld();
    _qi.copy(this.group.quaternion).invert();
    const camL = _cam.copy(cam.position).sub(anchor).applyQuaternion(_qi);
    U.uTime.value = time;
    U.uAnchorY.value = anchor.y;
    U.uLowTop.value = Atmos.lowTop;
    U.uEscortTop.value = Math.max(350, Atmos.highBase - 380 - anchor.y);
    U.uSunL.value.copy(Atmos.sunDir).applyQuaternion(_qi);
    U.uStreamSun.value.set(Atmos.sunColor.r, Atmos.sunColor.g, Atmos.sunColor.b).multiplyScalar(Atmos.sunIntensity);
    U.uPx.value = (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) / Math.max(1, heightPx);
    U.uOn.value = host.contrails ? (host.contrails.enabled ? 1 : 0) : 1;
    if (this.nextLoss < 0) this.nextLoss = time + 8 + this.rnd() * 10;
    this.lods(time, dt, camL);
    if (dt > 0) {
      this.flak(time, dt, camL, host.flakIntensity ?? 0);
      this.gaggles(time, dt);
      this.losses(time, dt, camL);
    }
    this.tracers.update(time, this.group.matrixWorld, cam, heightPx);
    this.writeGlows(time);
  }

  // ---------------- baking (a few tiles a frame) ----------------
  private bake(r: THREE.WebGLRenderer) {
    const T = this.spec.tile, m = this.models;
    let budget = 16;
    const one = (k: 'bomber' | 'escort' | 'gaggle', src: () => THREE.Object3D | null, prop: number) => {
      if (budget <= 0) return;
      let b = this.bakes[k];
      if (!b) {
        const o = src();
        if (!o) return;
        b = this.bakes[k] = new ImpostorBake(o, { tile: T, propRadius: prop, hide: m.hide, isSkin: m.isSkin });
      }
      if (b.done) return;
      b.step(r, budget);
      budget = 0;
      if (b.done) this.buildDraws();
    };
    one('bomber', m.bomber, m.propRadius.bomber);
    one('escort', m.escort, m.propRadius.escort);
    one('gaggle', m.gaggle, m.propRadius.gaggle);
    if (!this.nearTried && budget > 0) {
      const o = m.near();
      if (o) {
        this.nearTried = true;
        this.nearSrc = mergeForInstancing(o, m.nearSkip);
        if (this.nearSrc) for (const mat of this.nearSrc.materials) { const s = mat as THREE.MeshStandardMaterial; if (s.isMeshStandardMaterial) useSkyEnv(s, s.envMapIntensity || 0.6); }
        this.buildDraws();
      }
    }
  }

  // ---------------- LOD bands: boxes near the camera draw the mesh LOD ----------------
  private lods(time: number, dt: number, camL: THREE.Vector3) {
    const L = this.layout!;
    this.lodT -= dt;
    if (this.lodT > 0 || !this.bomberImp) return;
    this.lodT = 0.5;
    const next = new Set<number>();
    if (this.near) for (const g of L.groups) {
      const d = groupCentre(g, time, _v1).distanceTo(camL);
      if (d < NEAR_IN || (this.nearGroups.has(g.index) && d < NEAR_OUT)) next.add(g.index);
    }
    let same = next.size === this.nearGroups.size;
    if (same) for (const i of next) if (!this.nearGroups.has(i)) { same = false; break; }
    if (same) return;
    this.nearGroups = next;
    const far: number[] = [], near: number[] = [];
    for (let i = 0; i < L.bombers; i++) (next.has(this.groupOf(i)) ? near : far).push(i);
    this.setIds(this.bomberImp, far);
    if (this.near) this.setIds(this.near, near);
  }

  // ---------------- flak barrages walking through other boxes ----------------
  private flak(time: number, dt: number, camL: THREE.Vector3, intensity: number) {
    const L = this.layout!, R = this.rnd;
    while (this.barrages.length < this.spec.barrages) {
      const g = this.pickGroup(camL, time, 2400, 14000);
      if (g < 0) break;
      this.barrages.push({ group: g, t0: time + 2 + R() * 10, dur: 26 + R() * 14, x: (R() - 0.5) * 500, y: (R() - 0.3) * 200, acc: 0 });
    }
    const P = this.puffP.array as Float32Array, K = this.puffK.array as Float32Array;
    let wrote = false;
    const rate = (4.5 + 3 * Math.min(2, intensity)) * Math.min(1.4, 0.6 + this.spec.barrages * 0.25);
    for (let bi = this.barrages.length - 1; bi >= 0; bi--) {
      const b = this.barrages[bi];
      const f = (time - b.t0) / b.dur;
      if (f > 1) { this.barrages.splice(bi, 1); continue; }
      if (f < 0) continue;
      this.attackedUntil[b.group] = time + 4;
      b.acc += dt * rate;
      groupCentre(L.groups[b.group], time, _v2);
      while (b.acc >= 1) {
        b.acc -= 1;
        // the aim point walks from ahead of the box, through it, to behind it
        _v1.set(_v2.x + b.x + (R() - 0.5) * 520, _v2.y + b.y + (R() - 0.4) * 240, _v2.z + 1500 - 2500 * f + (R() - 0.5) * 380);
        if (_v1.distanceTo(camL) < 1500) continue;
        const q = (this.flakHead++ % FLAK_RING) * 4;
        P[q] = _v1.x; P[q + 1] = _v1.y; P[q + 2] = _v1.z; P[q + 3] = time - R() * dt;
        K[q] = 0; K[q + 1] = 0.7 + R() * 0.6; K[q + 2] = 11 + R() * 5; K[q + 3] = R();
        wrote = true;
      }
    }
    if (wrote) this.puffP.needsUpdate = this.puffK.needsUpdate = true;
  }

  // a random group between min and max metres from the camera (-1 if none)
  private pickGroup(camL: THREE.Vector3, time: number, min: number, max: number) {
    const L = this.layout!;
    for (let tries = 0; tries < 12; tries++) {
      const g = L.groups[Math.floor(this.rnd() * L.groups.length)];
      const d = groupCentre(g, time, _v3).distanceTo(camL);
      if (d > min && d < max) return g.index;
    }
    return -1;
  }

  // ---------------- gaggles: gun flashes, return fire, losses, new targets ----------------
  private gaggles(time: number, dt: number) {
    const L = this.layout!, d = L.data, R = this.rnd, V = U.uSpeed.value, top = U.uEscortTop.value;
    let dataDirty = false;
    L.gaggles.forEach((gg, k) => {
      let attacking = 0;
      for (let i = gg.first; i < gg.first + gg.count; i++) {
        if (this.lost(i)) continue;
        const u = gaggleU(d, i, time);
        if (u < 0.1 || u > 0.27) continue;
        attacking++;
        if (R() < dt * 9) {
          fighterPos(d, i, time, V, top, _v1);
          fighterPos(d, i, time + 0.1, V, top, _v2);
          _v2.sub(_v1).multiplyScalar(4);   // ~40 m ahead along the flight path
          this.glow(_v1.x + _v2.x, _v1.y + _v2.y, _v1.z + _v2.z, time, 0.07 + R() * 0.08, 7 + R() * 6, 30, 20, 9);
          groupCentre(L.groups[gg.target], time, _v3);
          this.tracers.emit(_v1.x, _v1.y, _v1.z, _v3.x, _v3.y, _v3.z, time, false);
        }
      }
      if (attacking) {
        this.attackedUntil[gg.target] = time + 3;
        // the box's gunners firing back: winks among the bombers
        const g = L.groups[gg.target];
        if (R() < dt * 14) {
          const i = g.first + Math.floor(R() * g.count);
          if (!this.lost(i)) {
            bomberPose(d, i, time, V, _pose);
            this.glow(_pose.p.x, _pose.p.y, _pose.p.z, time, 0.06, 5 + R() * 4, 22, 16, 7);
            fighterPos(d, gg.first, time, V, top, _v3);
            this.tracers.emit(_pose.p.x, _pose.p.y, _pose.p.z, _v3.x, _v3.y, _v3.z, time, true);
          }
        }
        this.gaggleKill[k] -= dt;
        if (this.gaggleKill[k] <= 0) {
          this.gaggleKill[k] = 18 + R() * 25;
          const i = gg.first + Math.floor(R() * gg.count);
          if (!this.lost(i) && gaggleU(d, i, time) > 0.12) this.startLoss(i, time, R() < 0.6 ? LOSS_DIVE : LOSS_SPIRAL);
        }
      }
      // after a few passes the gaggle re-forms on another box, its losses made good
      this.gaggleRetarget[k] -= dt;
      if (this.gaggleRetarget[k] <= 0) {
        this.gaggleRetarget[k] = gg.period * (2.5 + R() * 1.5);
        const far = L.groups.filter((g) => g.base.length() > 3500);
        if (!far.length) return;
        gg.target = far[Math.floor(R() * far.length)].index;
        gg.side = R() < 0.5 ? 1 : -1;
        // start out on the wide swing behind the new box, out of sight
        const u0 = 0.55 - (time / gg.period) % 1;
        for (let i = gg.first; i < gg.first + gg.count; i++) {
          if (this.lost(i) && time - this.lossT0(i) < 95) continue;   // still falling
          d.set(gaggleRecord(L.groups[gg.target], gg, u0, i - gg.first, R), i * REC_FLOATS);
          this.clearLoss(i);
        }
        dataDirty = true;
      }
    });
    if (dataDirty && this.dataTex) this.dataTex.needsUpdate = true;
  }

  // ---------------- losses: a distant bomber (or fighter) going down ----------------
  private losses(time: number, dt: number, camL: THREE.Vector3) {
    const L = this.layout!, R = this.rnd;
    if (time >= this.nextLoss) {
      const [a, b] = this.spec.lossEvery;
      this.nextLoss = time + a + R() * (b - a);
      // mostly boxes under fire (flak or fighters), now and then anywhere
      const hot = L.groups.filter((g) => this.attackedUntil[g.index] > time).map((g) => g.index);
      let gi = hot.length && R() < 0.85 ? hot[Math.floor(R() * hot.length)] : this.pickGroup(camL, time, 2200, 16000);
      if (gi >= 0 && groupCentre(L.groups[gi], time, _v1).distanceTo(camL) < 2000) gi = -1;
      if (gi >= 0) {
        const g = L.groups[gi];
        for (let tries = 0; tries < 6; tries++) {
          const i = g.first + Math.floor(R() * g.count);
          if (this.lost(i)) continue;
          const r = R();
          this.startLoss(i, time, r < 0.62 ? LOSS_SPIRAL : r < 0.85 ? LOSS_DIVE : LOSS_BLAST);
          break;
        }
      }
    }
    const V = U.uSpeed.value;
    for (let k = this.wrecks.length - 1; k >= 0; k--) {
      const w = this.wrecks[k];
      const s = time - w.t0;
      if (s > 95) {
        if (w.smoke >= 0) { (this.smokeId.array as Float32Array)[w.smoke] = -1; this.smokeId.needsUpdate = true; }
        this.wrecks.splice(k, 1);
        continue;
      }
      if (w.kind === LOSS_BLAST) continue;
      lossPath(s, w.seed, w.kind, V, _v1).add(w.p0);
      if (_v1.y + U.uAnchorY.value < Atmos.lowTop - 100) continue;
      // the fire on it: a flickering orange glow, held one frame at a time
      const fl = 0.75 + 0.25 * Math.sin(time * 31 + w.seed * 7) * Math.sin(time * 17.3);
      const sz = w.fighter ? 7 : 12;
      this.glow(_v1.x, _v1.y, _v1.z, time, 0, (sz + 4 * fl) * Math.min(1, s * 2), 14 * fl, 6 * fl, 1.6 * fl);
      while (w.chutes.length && s >= w.chutes[0]) {
        w.chutes.shift();
        this.puff(_v1.x + (R() - 0.5) * 20, _v1.y - 10, _v1.z + (R() - 0.5) * 20, time, 1, 5 + R() * 2, 140, R());
      }
    }
  }

  private lost(i: number) { return this.lossT0(i) < NOT_LOST * 0.5; }
  private lossT0(i: number) { return (this.lossTex!.image.data as Float32Array)[i * 8 + 3]; }
  private clearLoss(i: number) {
    const a = this.lossTex!.image.data as Float32Array;
    a.fill(0, i * 8, i * 8 + 8); a[i * 8 + 3] = NOT_LOST;
    this.lossTex!.needsUpdate = true;
  }

  private startLoss(i: number, time: number, kind: number) {
    const L = this.layout!, d = L.data, R = this.rnd, V = U.uSpeed.value;
    const fighter = d[i * REC_FLOATS + 8] !== KIND_BOMBER;
    let yaw = 0;
    if (fighter) {
      fighterPos(d, i, time, V, U.uEscortTop.value, _v1);
      fighterPos(d, i, time + 0.25, V, U.uEscortTop.value, _v2);
      yaw = Math.atan2((_v2.x - _v1.x) * 4, (_v2.z - _v1.z) * 4 + V);
    } else { bomberPose(d, i, time, V, _pose); _v1.copy(_pose.p); yaw = _pose.yaw; }
    const seed = R() * 10;
    const a = this.lossTex!.image.data as Float32Array;
    a.set([_v1.x, _v1.y, _v1.z, time, yaw, seed, kind, 0], i * 8);
    this.lossTex!.needsUpdate = true;
    // a flash, and for a blast a cloud of black smoke and burning debris
    if (kind === LOSS_BLAST) {
      this.glow(_v1.x, _v1.y, _v1.z, time, 0.9, 80, 60, 28, 8);
      for (let k = 0; k < 5; k++) this.puff(_v1.x + (R() - 0.5) * 40, _v1.y + (R() - 0.5) * 30, _v1.z + (R() - 0.5) * 50, time + k * 0.08, 2, 0.7 + R() * 0.6, 22 + R() * 8, R());
    } else this.glow(_v1.x, _v1.y, _v1.z, time, 0.45, fighter ? 22 : 40, 40, 20, 6);
    let smoke = -1;
    if (kind !== LOSS_BLAST) {
      const S = this.smokeId.array as Float32Array;
      smoke = S.findIndex((x) => x < 0);
      if (smoke < 0) { const oldest = this.wrecks.filter((w) => w.smoke >= 0).sort((p, q) => p.t0 - q.t0)[0]; if (oldest) { smoke = oldest.smoke; oldest.smoke = -1; } }
      if (smoke >= 0) { S[smoke] = i; this.smokeId.needsUpdate = true; }
    }
    // the crew getting out: chutes over the next half minute (fewer from a dive, none from a fighter)
    const chutes: number[] = [];
    if (!fighter) {
      const n = kind === LOSS_SPIRAL ? 3 + Math.floor(R() * 5) : kind === LOSS_DIVE ? Math.floor(R() * 3) : Math.floor(R() * 2);
      for (let k = 0; k < n; k++) chutes.push(5 + R() * 22);
      chutes.sort((p, q) => p - q);
    }
    this.wrecks.push({ id: i, t0: time, kind, seed, smoke, p0: _v1.clone(), chutes, fighter });
  }

  private puff(x: number, y: number, z: number, t0: number, kind: number, size: number, life: number, seed: number) {
    const P = this.puffP.array as Float32Array, K = this.puffK.array as Float32Array;
    const q = (FLAK_RING + (this.chuteHead++ % CHUTE_RING)) * 4;
    P[q] = x; P[q + 1] = y; P[q + 2] = z; P[q + 3] = t0;
    K[q] = kind; K[q + 1] = size; K[q + 2] = life; K[q + 3] = seed;
    this.puffP.needsUpdate = this.puffK.needsUpdate = true;
  }

  private glow(x: number, y: number, z: number, t0: number, life: number, size: number, r: number, g: number, b: number) {
    if (this.nGlows >= MAX_GLOWS) return;
    const o = this.glows[this.nGlows++];
    o.x = x; o.y = y; o.z = z; o.t0 = t0; o.life = life; o.size = size; o.r = r; o.g = g; o.b = b;
  }

  private writeGlows(time: number) {
    const A = this.glowA.array as Float32Array, B = this.glowB.array as Float32Array;
    let n = 0;
    for (let i = 0; i < this.nGlows; i++) {
      const g = this.glows[i];
      const k = g.life > 0 ? Math.max(0, 1 - (time - g.t0) / g.life) : 1;
      A[n * 4] = g.x; A[n * 4 + 1] = g.y; A[n * 4 + 2] = g.z; A[n * 4 + 3] = g.size * (0.6 + 0.4 * k);
      B[n * 3] = g.r * k; B[n * 3 + 1] = g.g * k; B[n * 3 + 2] = g.b * k;
      n++;
    }
    // keep the ones still burning (swap them to the front of the pool)
    let w = 0;
    for (let i = 0; i < this.nGlows; i++) {
      const g = this.glows[i];
      if (g.life > 0 && time - g.t0 < g.life) { const t = this.glows[w]; this.glows[w] = g; this.glows[i] = t; w++; }
    }
    this.nGlows = w;
    (this.glowMesh.geometry as THREE.InstancedBufferGeometry).instanceCount = n;
    this.glowMesh.visible = n > 0;
    if (n > 0) this.glowA.needsUpdate = this.glowB.needsUpdate = true;
  }

  // ---------------- dev / tests ----------------
  /** Counts for the report and sws.stream: aircraft, draws, LOD split, losses */
  stats() {
    const L = this.layout;
    const cnt = (m: THREE.Mesh | null) => (m ? (m.geometry as THREE.InstancedBufferGeometry).instanceCount : 0);
    return {
      tier: this.tier, shown: this.shown, bombers: L?.bombers ?? 0, groups: L?.groups.length ?? 0,
      escorts: L?.escortCount ?? 0, gaggleFighters: L ? L.gaggles.reduce((n, g) => n + g.count, 0) : 0,
      baked: { bomber: !!this.bakes.bomber?.done, escort: !!this.bakes.escort?.done, gaggle: !!this.bakes.gaggle?.done, near: !!this.near },
      impostors: cnt(this.bomberImp), nearInstances: cnt(this.near), ribbons: cnt(this.trails), fieldBands: cnt(this.field),
      wrecks: this.wrecks.length, barrages: this.barrages.length,
    };
  }
  /** Force a loss now (dev): kind 0 spiral, 1 dive, 2 blast; nearest visible group if none given */
  devLoss(kind = 0, group?: number) {
    const L = this.layout;
    if (!L) return -1;
    const gi = group ?? this.pickGroup(_cam, U.uTime.value, 1500, 6000);
    if (gi < 0) return -1;
    const g = L.groups[gi];
    for (let i = g.first; i < g.first + g.count; i++) if (!this.lost(i)) { this.startLoss(i, U.uTime.value, kind); return i; }
    return -1;
  }
  get groups() { return this.layout?.groups ?? []; }
  /** shared uniforms (dev inspection) */
  get uniforms() { return U; }
}

const _z = new THREE.Vector3(0, 0, 1);
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _qi = new THREE.Quaternion();
const _pose = newPose();

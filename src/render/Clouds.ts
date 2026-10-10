import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { Atmos, atmosUniforms, skyGLSL } from './Atmosphere';
import { createDetailNoise, createShapeNoise, createWeatherMap } from './noise';

// Raymarched volumetric clouds: a dense cumulus "sea" below the formation and a
// scattered cumulus layer above, rendered at reduced resolution then composited
// against the scene depth.
export const depthGLSL = /* glsl */ `
uniform sampler2D tDepth;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform float uReversed;

// Returns view-space distance along the ray for the given uv; 1e9 for sky.
float sceneDistance(vec2 uv, out vec3 rd) {
  float d = texture2D(tDepth, uv).r;
  vec3 ndc = vec3(uv * 2.0 - 1.0, uReversed > 0.5 ? d : d * 2.0 - 1.0);
  vec4 vp = uInvProj * vec4(ndc, 1.0);
  vec3 viewPos = vp.xyz / vp.w;
  // direction from a point on the far plane (stable even for sky pixels)
  vec4 fp = uInvProj * vec4(ndc.xy, uReversed > 0.5 ? 0.0 : 1.0, 1.0);
  vec3 farV = fp.xyz / fp.w;
  rd = normalize((uCamWorld * vec4(normalize(farV), 0.0)).xyz);
  bool sky = uReversed > 0.5 ? d <= 0.0 : d >= 1.0;
  return sky ? 1e9 : length(viewPos);
}

vec2 slabT(float ro, float rd, float lo, float hi) {
  if (abs(rd) < 1e-5) {
    return (ro > lo && ro < hi) ? vec2(0.0, 1e6) : vec2(-1.0);
  }
  float t0 = (lo - ro) / rd, t1 = (hi - ro) / rd;
  float a = max(min(t0, t1), 0.0), b = max(t0, t1);
  return b > a ? vec2(a, b) : vec2(-1.0);
}
`;

const cloudFrag = /* glsl */ `
precision highp float;
precision highp sampler3D;
${skyGLSL}
${depthGLSL}
uniform sampler3D tShape;
uniform sampler3D tDetail;
uniform sampler2D tWeather;
uniform vec3 uCamPos;
uniform vec3 uWind;
uniform vec4 uLow;   // base, top, coverage, density
uniform vec4 uHigh;
uniform float uTime;
uniform float uSteps;
uniform float uAmb;
#define Atmos_hazeDist 60000.0
uniform float uWeatherScale;
uniform vec2 uRes;
varying vec2 vUv;

float remap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }

float hg(float mu, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * 3.14159 * pow(1.0 + g2 - 2.0 * g * mu, 1.5));
}

float density(vec3 p, vec4 L, float layerSel, bool cheap) {
  float h = clamp((p.y - L.x) / (L.y - L.x), 0.0, 1.0);
  vec3 q = p + uWind;
  vec4 wm = texture2D(tWeather, q.xz / mix(uWeatherScale, 26000.0, layerSel) + vec2(layerSel * 0.37));
  vec4 wm2 = texture2D(tWeather, q.xz / 90000.0 + vec2(0.61, 0.13));
  float cov = clamp((wm.r * 0.7 + wm2.r * 0.5) * 1.35 - 0.45 + (L.z - 0.6) * 1.8, 0.0, 1.0);
  // Cumulus: cloud top height follows local coverage, so every cell becomes a dome.
  float topH = clamp(cov * 1.05, 0.05, 1.0);
  float prof = smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(topH * 0.25, topH, h));
  float scale = mix(5600.0, 3800.0, layerSel);
  vec4 n = texture(tShape, q / scale);
  float fbm = n.g * 0.625 + n.b * 0.25 + n.a * 0.125;
  float base = remap(n.r, -(1.0 - fbm), 1.0, 0.0, 1.0);
  base = remap(base * prof, 1.0 - cov * 0.85, 1.0, 0.0, 1.0);
  if (base <= 0.0) return 0.0;
  if (!cheap) {
    float dn = texture(tDetail, q / (scale * 0.14) + vec3(0.0, uTime * 0.002, 0.0)).r;
    float dmod = mix(dn, 1.0 - dn, clamp(h * 4.0, 0.0, 1.0));
    base = remap(base, dmod * 0.3, 1.0, 0.0, 1.0);
  }
  return clamp(base, 0.0, 1.0) * L.w;
}

float lightMarch(vec3 p, vec4 L, float sel) {
  float sum = 0.0;
  float st = 45.0;
  for (int i = 0; i < 6; i++) {
    p += uSunDir * st;
    if (p.y > L.y) break;
    sum += density(p, L, sel, i > 2) * st;
    st *= 1.7;
  }
  return sum;
}

void marchLayer(vec3 ro, vec3 rd, vec2 t, float maxDist, vec4 L, float sel, int steps, float jitter,
                inout vec3 col, inout float T, inout float firstHit) {
  if (t.x < 0.0) return;
  float t0 = t.x;
  float t1 = min(t.y, min(maxDist, 90000.0));
  if (t1 <= t0) return;
  float len = t1 - t0;
  float dt = max(len / float(steps), 30.0);
  float mu = dot(rd, uSunDir);
  float phase = mix(hg(mu, 0.62), hg(mu, -0.25), 0.35) * 4.0 * 3.14159;
  phase = max(phase, 0.55);
  float tt = t0 + dt * jitter;
  float sigma = 0.0042;
  for (int i = 0; i < 96; i++) {
    if (i >= steps || tt > t1 || T < 0.02) break;
    vec3 p = ro + rd * tt;
    float dens = density(p, L, sel, false);
    if (dens > 0.001) {
      if (firstHit < 0.0) firstHit = tt;
      float h = clamp((p.y - L.x) / (L.y - L.x), 0.0, 1.0);
      float ls = lightMarch(p, L, sel) * sigma;
      // Multiple-scattering approximation (sum of attenuated octaves)
      float beer = exp(-ls) + 0.3 * exp(-ls * 0.25) + 0.12 * exp(-ls * 0.06);
      float powder = 1.0 - exp(-dens * 2.0 * dt * sigma * 2.0);
      vec3 sun = uSunColor * beer * phase * mix(0.55, 1.0, powder) * 0.36;
      vec3 amb = mix(uHorizon * 0.35 + vec3(0.03), uZenith * 0.7 + uHorizon * 0.45, h) * uAmb;
      vec3 S = (sun + amb) * dens * sigma;
      float sE = max(dens * sigma, 1e-6);
      float Tr = exp(-sE * dt);
      col += T * (S - S * Tr) / sE;
      T *= Tr;
    }
    tt += dt;
  }
}

uniform vec2 uFullTexel;
void main() {
  vec3 rd;
  // Use the farthest depth in this low-res texel's footprint so clouds are never cut
  // short at aircraft silhouettes (avoids haloes when upsampling).
  float sceneD = sceneDistance(vUv, rd);
  vec3 rdTmp;
  sceneD = max(sceneD, sceneDistance(vUv + uFullTexel * vec2(1.0, 0.0), rdTmp));
  sceneD = max(sceneD, sceneDistance(vUv + uFullTexel * vec2(0.0, 1.0), rdTmp));
  sceneD = max(sceneD, sceneDistance(vUv + uFullTexel * vec2(1.0, 1.0), rdTmp));
  sceneD = max(sceneD, sceneDistance(vUv - uFullTexel, rdTmp));
  vec3 ro = uCamPos;
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + uTime * 0.0);
  vec3 col = vec3(0.0);
  float T = 1.0;
  float hitLow = -1.0, hitHigh = -1.0;
  vec2 tl = slabT(ro.y, rd.y, uLow.x, uLow.y);
  vec2 th = slabT(ro.y, rd.y, uHigh.x, uHigh.y);
  int steps = int(uSteps);
  // March nearer layer first
  if (th.x >= 0.0 && (tl.x < 0.0 || th.x < tl.x)) {
    vec3 c1 = vec3(0.0); float T1 = 1.0;
    marchLayer(ro, rd, th, sceneD, uHigh, 1.0, steps / 2 + 8, jitter, c1, T1, hitHigh);
    col += c1; T *= T1;
    vec3 c2 = vec3(0.0); float T2 = 1.0;
    marchLayer(ro, rd, tl, sceneD, uLow, 0.0, steps, jitter, c2, T2, hitLow);
    col += c2 * T; T *= T2;
  } else {
    vec3 c1 = vec3(0.0); float T1 = 1.0;
    marchLayer(ro, rd, tl, sceneD, uLow, 0.0, steps, jitter, c1, T1, hitLow);
    col += c1; T *= T1;
    vec3 c2 = vec3(0.0); float T2 = 1.0;
    marchLayer(ro, rd, th, sceneD, uHigh, 1.0, steps / 2 + 8, jitter, c2, T2, hitHigh);
    col += c2 * T; T *= T2;
  }
  // Distance haze on the clouds themselves
  float hit = hitLow > 0.0 ? hitLow : hitHigh;
  if (hitLow > 0.0 && hitHigh > 0.0) hit = min(hitLow, hitHigh);
  if (hit > 0.0) {
    float f = 1.0 - exp(-hit / Atmos_hazeDist);
    col = mix(col, skyRadiance(rd) * (1.0 - T), f * 0.9);
  }
  gl_FragColor = vec4(col, T);
}
`;

const compositeFrag = /* glsl */ `
precision highp float;
${skyGLSL}
${depthGLSL}
uniform sampler2D tScene;
uniform sampler2D tClouds;
uniform vec3 uCamPos;
uniform vec4 uLow;
uniform vec4 uHigh;
varying vec2 vUv;
void main() {
  vec3 rd;
  float d = sceneDistance(vUv, rd);
  vec3 scene = texture2D(tScene, vUv).rgb;
  // Aerial perspective on geometry
  if (d < 1e8) {
    float f = 1.0 - exp(-d / 26000.0);
    scene = mix(scene, skyRadiance(rd), f);
  }
  vec2 tl = slabT(uCamPos.y, rd.y, uLow.x, uLow.y);
  vec2 th = slabT(uCamPos.y, rd.y, uHigh.x, uHigh.y);
  float entry = 1e10;
  if (tl.x >= 0.0) entry = min(entry, tl.x);
  if (th.x >= 0.0) entry = min(entry, th.x);
  vec3 col = scene;
  if (d > entry) {
    vec4 c = texture2D(tClouds, vUv);
    col = scene * c.a + c.rgb;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export class CloudRenderer {
  readonly rt: THREE.WebGLRenderTarget;
  private quad: FullScreenQuad;
  private compQuad: FullScreenQuad;
  private mat: THREE.ShaderMaterial;
  private compMat: THREE.ShaderMaterial;
  scale = 0.5;
  steps = 56;

  constructor(reversed: boolean) {
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rt.texture.minFilter = this.rt.texture.magFilter = THREE.LinearFilter;
    const shared = {
      ...atmosUniforms,
      tDepth: { value: null as THREE.Texture | null },
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uReversed: { value: reversed ? 1 : 0 },
      uCamPos: { value: new THREE.Vector3() },
      uLow: { value: new THREE.Vector4() },
      uHigh: { value: new THREE.Vector4() },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        ...shared,
        tShape: { value: createShapeNoise(64) },
        tDetail: { value: createDetailNoise(32) },
        tWeather: { value: createWeatherMap(256) },
        uWind: { value: Atmos.windOffset },
        uTime: { value: 0 },
        uSteps: { value: this.steps },
        uAmb: { value: 1.0 },
        uWeatherScale: { value: 17000 },
        uRes: { value: new THREE.Vector2() },
        uFullTexel: { value: new THREE.Vector2() },
      },
      vertexShader: vert,
      fragmentShader: cloudFrag,
      depthTest: false,
      depthWrite: false,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: { ...shared, tScene: { value: null }, tClouds: { value: this.rt.texture } },
      vertexShader: vert,
      fragmentShader: compositeFrag,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.mat);
    this.compQuad = new FullScreenQuad(this.compMat);
  }

  setSize(w: number, h: number) {
    this.rt.setSize(Math.max(1, Math.floor(w * this.scale)), Math.max(1, Math.floor(h * this.scale)));
    this.mat.uniforms.uFullTexel.value.set(1 / w, 1 / h);
    this.mat.uniforms.uRes.value.set(this.rt.width, this.rt.height);
  }

  setQuality(q: 'low' | 'medium' | 'high', w: number, h: number) {
    this.scale = q === 'low' ? 0.33 : q === 'medium' ? 0.5 : 0.6;
    this.steps = q === 'low' ? 36 : q === 'medium' ? 56 : 72;
    this.setSize(w, h);
  }

  private syncUniforms(camera: THREE.PerspectiveCamera, depth: THREE.Texture, time: number) {
    for (const m of [this.mat, this.compMat]) {
      const u = m.uniforms;
      u.tDepth.value = depth;
      u.uInvProj.value.copy(camera.projectionMatrixInverse);
      u.uCamWorld.value.copy(camera.matrixWorld);
      u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
      u.uLow.value.set(Atmos.lowBase, Atmos.lowTop, Atmos.lowCoverage, Atmos.lowDensity);
      u.uHigh.value.set(Atmos.highBase, Atmos.highTop, Atmos.highCoverage, Atmos.highDensity);
    }
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uSteps.value = this.steps;
    this.mat.uniforms.uAmb.value = Atmos.cloudAmbient;
    atmosUniforms.uCamAlt.value = camera.position.y;
  }

  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, sceneRT: THREE.WebGLRenderTarget,
    out: THREE.WebGLRenderTarget, time: number) {
    this.syncUniforms(camera, sceneRT.depthTexture!, time);
    renderer.setRenderTarget(this.rt);
    this.quad.render(renderer);
    this.compMat.uniforms.tScene.value = sceneRT.texture;
    renderer.setRenderTarget(out);
    // `out` shares the scene depth texture: overwrite colour only, keep depth
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    this.compQuad.render(renderer);
    renderer.autoClear = ac;
  }
}

import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { Atmos, atmosUniforms, skyGLSL } from './Atmosphere';
import { createDetailNoise, createShapeNoise, createWeatherMap } from './noise';
import { CLOUD_LIGHTS, cloudLights } from './CloudLights';
import { weatherNow } from './WeatherState';
import { cloudOcclusionUniforms } from './CloudOcclusion';
import { cloudShadowUniforms } from './CloudShadow';

// Raymarched volumetric clouds: a dense cumulus "sea" below the formation and a
// scattered cumulus layer above, rendered at reduced resolution then composited
// against the scene depth.
//
// Two paths (Engine QUALITY presets, `cloudTemporal`):
// - legacy (Low): one full march per frame with a static per-pixel step offset.
// - temporal (Medium/High/Ultra): the march runs at quarter resolution on one texel of each
//   2x2 block per frame (cycling), with a per-frame jittered step offset; a resolve pass
//   reprojects the accumulated history (previous view-projection, per-texel cloud depth,
//   wind drift), clips it to the fresh samples' neighbourhood and blends them in, so every
//   texel is refreshed every 4 frames and the noise averages out. Texels behind geometry in
//   front of the layers are not marched and keep their history (no aircraft-shaped holes to
//   ghost); camera cuts reset it. Plus a sharp forward-scattering lobe for silver linings and
//   the upper layer's shadows on the cumulus sea (and the formation) from a low-resolution
//   cloud shadow map.
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
#ifdef TEMPORAL
layout(location = 0) out highp vec4 outColor;
layout(location = 1) out highp vec4 outDepth;   // x: representative distance (km)
uniform float uFrame;
uniform vec2 uSub;          // this frame's texel within each 2x2 block of the cloud buffer
uniform vec2 uCloudTexel;   // texel size of the full cloud buffer
#endif
#ifdef SHADOWMAP
uniform sampler2D tShadow;
uniform vec3 uShadowBox;   // centre x, z, size (m)
#endif
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
uniform vec3 uShapeDrift;   // slow churn of the shape lookup (tile units)
uniform vec3 uDetailDrift;  // slow churn of the detail lookup (tile units)
uniform float uSteps;
uniform float uAmb;
uniform vec2 uCloudType; // stratus amount, convective tower amount
#define Atmos_hazeDist 60000.0
uniform float uWeatherScale;
uniform vec2 uRes;
uniform vec2 uFullTexel;
uniform float uConvection; // dense cumulus only; fair decks and stratus keep production rendering
uniform vec4 uGap;   // break in the low deck over the bombing target: x, z (local), radius, strength
uniform vec4 uGlow;  // fire / flash light from the target on the deck: x, z (local), radius, intensity
uniform float uWeatherFog;
uniform float uHaze; // distance-haze scale (Atmos.haze)
// point lights inside the cloud (CloudLights.ts): flak and explosions at night, flares, lightning
uniform int uPLn;
uniform vec4 uPL[${CLOUD_LIGHTS}];   // xyz scene position, w radius (m): full strength inside, 1/d^2 beyond
uniform vec3 uPLc[${CLOUD_LIGHTS}];  // colour * intensity
varying vec2 vUv;

float remap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }

float hg(float mu, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * 3.14159 * pow(1.0 + g2 - 2.0 * g * mu, 1.5));
}

float deckDensity(vec3 p, vec4 L, float layerSel, bool cheap, vec2 noiseLod) {
  float h = clamp((p.y - L.x) / (L.y - L.x), 0.0, 1.0);
  vec3 q = p + uWind;
  // Explicit LOD is essential inside divergent marches: implicit derivatives of
  // world-space positions produce horizontal mip bands at grazing angles.
#ifdef CLOUD_TYPES
  vec4 wm = textureLod(tWeather, q.xz / mix(uWeatherScale, 26000.0, layerSel) + vec2(layerSel * 0.37), 0.0);
  vec4 wm2 = textureLod(tWeather, q.xz / 90000.0 + vec2(0.61, 0.13), 0.0);
#else
  vec4 wm = texture2D(tWeather, q.xz / mix(uWeatherScale, 26000.0, layerSel) + vec2(layerSel * 0.37));
  vec4 wm2 = texture2D(tWeather, q.xz / 90000.0 + vec2(0.61, 0.13));
#endif
  float cov = clamp((wm.r * 0.7 + wm2.r * 0.5) * 1.35 - 0.45 + (L.z - 0.6) * 1.8, 0.0, 1.0);
  if (layerSel < 0.5 && uGap.w > 0.0) {
    vec2 gq = p.xz - uGap.xy;
    float gd = length(gq + vec2(sin(gq.y * 0.0007), cos(gq.x * 0.0006)) * uGap.z * 0.15);
    cov = clamp(cov - uGap.w * (1.0 - smoothstep(uGap.z * 0.4, uGap.z, gd)), 0.0, 1.0);
    if (cov < 0.01) return 0.0;
  }
  // Cumulus: cloud top height follows local coverage, so every cell becomes a dome.
  float topH = clamp(cov * 1.05, 0.05, 1.0);
  float prof = smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(topH * 0.25, topH, h));
#ifdef CLOUD_TYPES
  // Weather G chooses cell maturity. Broad flat decks and deep cauliflower towers
  // share the same density field used by lighting and shadows; fronts blend continuously.
  float mature = smoothstep(0.25, 0.72, wm.g);
  float tower = uCloudType.y * mature;
  topH = mix(0.42 + 0.48 * mature, 1.0, tower);
  float cumulus = smoothstep(0.0, 0.07, h) * (1.0 - smoothstep(topH * 0.62, topH, h));
  float stratus = smoothstep(0.0, 0.06, h) * (1.0 - smoothstep(0.22, 0.42, h));
  prof = mix(cumulus, stratus, uCloudType.x);
  // Wind shear with height, strongest in convective cells.
  q.xz += vec2(480.0, 210.0) * h * h * tower;
#endif
  float scale = mix(5600.0, 3800.0, layerSel);
  // Shape drifts against the weather field, so cells deform and churn instead of only sliding with the wind
  // Explicit level zero keeps the original density for below/inside views and shadows.
  vec4 n = textureLod(tShape, q / scale + uShapeDrift, noiseLod.x);
  float fbm = n.g * 0.625 + n.b * 0.25 + n.a * 0.125;
  float base = remap(n.r, -(1.0 - fbm), 1.0, 0.0, 1.0);
  base = remap(base * prof, 1.0 - cov * 0.85, 1.0, 0.0, 1.0);
  if (base <= 0.0) return 0.0;
  if (!cheap) {
    float dn = textureLod(tDetail, q / (scale * 0.14) + vec3(0.0, uTime * 0.002, 0.0) + uDetailDrift, noiseLod.y).r;
    float dmod = mix(dn, 1.0 - dn, clamp(h * 4.0, 0.0, 1.0));
    base = remap(base, dmod * 0.42, 1.0, 0.0, 1.0);
  }
  return clamp(base, 0.0, 1.0) * L.w;
}

#ifdef CLOUD_TYPES
float towerDensity(vec3 p, vec4 L, float layerSel, bool cheap, vec2 noiseLod) {
  float h = clamp((p.y - L.x) / (L.y - L.x), 0.0, 1.0);
  vec3 q = p + uWind;
  // Explicit LOD is essential inside divergent marches: implicit derivatives of
  // world-space positions produce horizontal mip bands at grazing angles.
#ifdef CLOUD_TYPES
  vec4 wm = textureLod(tWeather, q.xz / mix(uWeatherScale, 26000.0, layerSel) + vec2(layerSel * 0.37), max(0.0, noiseLod.x));
  vec4 wm2 = textureLod(tWeather, q.xz / 90000.0 + vec2(0.61, 0.13), max(0.0, noiseLod.x - 2.0));
#else
  vec4 wm = texture2D(tWeather, q.xz / mix(uWeatherScale, 26000.0, layerSel) + vec2(layerSel * 0.37));
  vec4 wm2 = texture2D(tWeather, q.xz / 90000.0 + vec2(0.61, 0.13));
#endif
  float cov = clamp((wm.r * 0.7 + wm2.r * 0.5) * 1.35 - 0.45 + (L.z - 0.6) * 1.8, 0.0, 1.0);
#ifdef CLOUD_TYPES
  // Fair weather reduces occupied area instead of deleting every cloud cell.
  if (layerSel < 0.5) cov = max(cov, smoothstep(0.73 - L.z * 0.3, 0.86 - L.z * 0.3, wm.b) * 0.7 * smoothstep(0.0, 0.08, L.z));
#endif
  if (layerSel < 0.5 && uGap.w > 0.0) {
    vec2 gq = p.xz - uGap.xy;
    float gd = length(gq + vec2(sin(gq.y * 0.0007), cos(gq.x * 0.0006)) * uGap.z * 0.15);
    cov = clamp(cov - uGap.w * (1.0 - smoothstep(uGap.z * 0.4, uGap.z, gd)), 0.0, 1.0);
    if (cov < 0.01) return 0.0;
  }
  float scale = mix(5600.0, 3800.0, layerSel);
#ifdef CLOUD_TYPES
  // A weather cell needs a coherent coverage core. Remap weak coverage
  // out before evaluating 3D detail, so it cannot seed detached fragments.
  float denseWeather = smoothstep(0.65, 0.85, L.z);
  if (layerSel < 0.5) cov = mix(smoothstep(0.4, 0.85, cov), cov, denseWeather);
  if (cov < 0.08) return 0.0;
  // B is a coherent cell core, not a height-independent blanket. Sparse mature
  // cells rise above the deck; the widening upper profile forms a sheared anvil.
  float anvil = smoothstep(0.48, 0.7, h) * (1.0 - smoothstep(0.82, 0.98, h));
  float core = smoothstep(0.27 - anvil * 0.16, 0.68 - anvil * 0.1, wm.b);
  float mature = smoothstep(0.36, 0.65, wm.g);
  float tower = core * mix(0.65, 1.0, mature) * (1.0 - uCloudType.x);
  float topH = mix(0.28, 0.94, tower);
  q.xz += vec2(900.0, 350.0) * h * h * uCloudType.y;
  vec3 shapeQ = q / scale;
  shapeQ.y *= mix(1.05, 0.85, denseWeather);
  vec4 n = textureLod(tShape, shapeQ + uShapeDrift, noiseLod.x);
  // Three-dimensional Worley lobes define the volume itself. The weather map
  // selects a cluster, rather than extruding its 2D footprint into a cliff.
  float body = n.r * 0.35 + n.g * 0.65;
  cov = clamp(cov + anvil * tower * 0.22, 0.0, 1.0);
  float base = (body - (0.61 - cov * 0.25)) * 3.2;
  float cap = 1.0 - smoothstep(topH * 0.72, topH, h);
  float stratusCap = 1.0 - smoothstep(0.18, 0.3, h);
  base *= mix(cap, stratusCap, uCloudType.x) * smoothstep(0.0, 0.07, h) * smoothstep(0.08, 0.30, cov);
  if (base <= 0.0) return 0.0;
  if (!cheap) {
    vec4 eddy = textureLod(tDetail, q / 1800.0 + uDetailDrift, noiseLod.y);
    float erosion = textureLod(tDetail, q / 650.0 + (eddy.gba * 2.0 - 1.0) * 0.32 + uDetailDrift, noiseLod.y + 1.47).r;
    // Erode only the boundary. The curls remain spatial structure, not a noisy
    // multiplier throughout the opaque core; filtered distant wisps disappear.
    float edge = 1.0 - smoothstep(0.3, 0.8, base);
    // Erosion cannot excavate deep holes through a supporting lobe.
    base -= min(eddy.r * 0.24 + erosion * 0.28, mix(0.28, 0.52, denseWeather)) * edge;
    base = max(0.0, base) * mix(1.7, 1.0, denseWeather);
    // Heterogeneous liquid water inside the body creates passing veils and
    // pockets during penetration, rather than one constant grey extinction.
    base *= mix(0.32, 1.0, smoothstep(0.22, 0.65, eddy.r));
  } else {
    // Mean unresolved erosion/water content for shadow integration, avoiding
    // the old over-dense cheap field that made illuminated cloud bodies muddy.
    base = max(0.0, base - mix(0.18, 0.14, denseWeather)) * mix(1.1, 0.65, denseWeather);
  }
#else
  float topH = clamp(cov * 1.05, 0.05, 1.0);
  float prof = smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(topH * 0.25, topH, h));
  vec4 n = textureLod(tShape, q / scale + uShapeDrift, noiseLod.x);
  float fbm = n.g * 0.625 + n.b * 0.25 + n.a * 0.125;
  float base = remap(n.r, -(1.0 - fbm), 1.0, 0.0, 1.0);
  base = remap(base * prof, 1.0 - cov * 0.85, 1.0, 0.0, 1.0);
  if (base <= 0.0) return 0.0;
  if (!cheap) {
    float dn = textureLod(tDetail, q / (scale * 0.14) + vec3(0.0, uTime * 0.002, 0.0) + uDetailDrift, noiseLod.y).r;
    base = remap(base, mix(dn, 1.0 - dn, clamp(h * 4.0, 0.0, 1.0)) * 0.42, 1.0, 0.0, 1.0);
  }
#endif
  return clamp(base, 0.0, 1.0) * L.w;
}

#endif

float filteredDensity(vec3 p, vec4 L, float sel, bool cheap, vec2 lod) {
#ifdef CLOUD_TYPES
  if (sel < 0.5 && uConvection > 0.0) {
    float tower = towerDensity(p, L, sel, cheap, lod);
    if (uConvection >= 1.0) return tower;
    return mix(deckDensity(p, L, sel, cheap, lod), tower, uConvection);
  }
#endif
  return deckDensity(p, L, sel, cheap, lod);
}

float density(vec3 p, vec4 L, float layerSel, bool cheap) {
  return filteredDensity(p, L, layerSel, cheap, vec2(0.0));
}

float deckLightMarch(vec3 p, vec4 L, float sel, float jl, vec2 noiseLod) {
  float sum = 0.0;
#ifdef CLOUD_TYPES
  float st = 150.0 * jl;
  for (int i = 0; i < 3; i++) {
#else
  float st = 45.0 * jl;
  for (int i = 0; i < 6; i++) {
#endif
    p += uSunDir * st;
    if (p.y > L.y) break;
#ifdef CLOUD_TYPES
    sum += filteredDensity(p, L, sel, true, noiseLod) * st;
    st *= 2.5;
#else
    sum += filteredDensity(p, L, sel, i > 2, noiseLod) * st;
    st *= 1.7;
#endif
  }
  return sum;
}

#ifdef CLOUD_TYPES
float towerLightMarch(vec3 p, vec4 L, float sel, float jl, vec2 noiseLod) {
  float sum = 0.0;
#ifdef CLOUD_TYPES
  float st = 110.0 * jl;
  for (int i = 0; i < 4; i++) {
#else
  float st = 45.0 * jl;
  for (int i = 0; i < 6; i++) {
#endif
#ifdef CLOUD_TYPES
    // Near erosion shades the curls; successively wider, filtered intervals
    // reach neighbouring towers without a coarse shadow-map altitude seam.
    p += uSunDir * (st * 0.5);
    if (p.y > L.y) break;
    float lightLod = log2(max(1.0, st * 0.5 * 64.0 / mix(5600.0, 3800.0, sel)));
    sum += filteredDensity(p, L, sel, i > 0, max(noiseLod, vec2(lightLod, -4.0))) * st;
    p += uSunDir * (st * 0.5);
    st *= i < 2 ? 3.0 : 6.0;
#else
    p += uSunDir * st;
    if (p.y > L.y) break;
    sum += filteredDensity(p, L, sel, i > 2, noiseLod) * st;
    st *= 1.7;
#endif
  }
  return sum;
}

#endif

float lightMarch(vec3 p, vec4 L, float sel, float jl, vec2 noiseLod) {
#ifdef CLOUD_TYPES
  if (sel < 0.5 && uConvection > 0.0) return towerLightMarch(p, L, sel, jl, noiseLod);
#endif
  return deckLightMarch(p, L, sel, jl, noiseLod);
}

#ifdef SHADOWMAP
// Transmittance of the upper layer toward the sun for a point below it: the shadow map is
// indexed where the sun ray through p crosses the upper layer's base, so it is exact at any height.
float cloudShadow(vec3 p) {
  if (p.y >= uHigh.y) return 1.0;
  vec3 q = p + uSunDir * ((uHigh.x - p.y) / max(uSunDir.y, 0.05));
  vec2 suv = (q.xz - uShadowBox.xy) / uShadowBox.z + 0.5;
  float edge = 1.0 - smoothstep(0.4, 0.49, max(abs(suv.x - 0.5), abs(suv.y - 0.5)));
  return mix(1.0, texture2D(tShadow, suv).r, edge);
}
#endif

void marchDeck(vec3 ro, vec3 rd, vec2 t, float maxDist, vec4 L, float sel, int steps, float jitter,
                inout vec3 col, inout float T, inout float firstHit, inout vec2 dw) {
  if (t.x < 0.0) return;
  float t0 = t.x;
  // Camera inside this layer (climbing through the deck in the take-off scene, a dive): a
  // grazing ray runs tens of km through the slab, the steps end up ~1 km apart and the cloud
  // ahead turned into step noise the temporal accumulation could not settle (static horizontal
  // banding). Inside, the march stops 8 km out (murk), relaxed over the last 500 m before the
  // layer's top or base so the far cloud sea fades back in as the camera leaves it. (A cap from
  // above the layer would cut the cumulus sea: grazing rays reach the dense part km past entry.)
  float inK = smoothstep(0.0, 500.0, min(ro.y - L.x, L.y - ro.y));
  float t1 = min(t.y, min(maxDist, mix(90000.0, 8000.0, inK)));
  if (t1 <= t0) return;
  float len = t1 - t0;
  float dt = max(len / float(steps), 30.0);
  // Above the deck, coarse grazing steps must integrate noise at their own scale.
  // Keep the full cloud sea; filter both extinction and its lighting, not the history.
  // Fade in over 100 m above the top so crossing it does not switch density abruptly.
  float footprint = dt * smoothstep(0.0, 100.0, ro.y - L.y);
  float noiseScale = mix(5600.0, 3800.0, sel);
  vec2 noiseLod = log2(max(vec2(1.0), footprint * vec2(64.0, 32.0 / 0.14) / noiseScale));
  // Once erosion is filtered over several texels, a centred sample is stable without
  // the large per-frame offsets that otherwise survive the temporal history clamp.
#ifndef CLOUD_TYPES
  jitter = mix(jitter, 0.5, smoothstep(1.0, 3.0, noiseLod.y));
#endif
  float mu = dot(rd, uSunDir);
  float phase = mix(hg(mu, 0.62), hg(mu, -0.25), 0.35) * 4.0 * 3.14159;
  phase = max(phase, 0.55);
#ifdef SILVER
  // a sharp forward lobe (g 0.88) for the single-scattered sun: only within ~20 degrees of
  // the sun, where it makes thin cloud edges in front of it blaze (silver linings)
  float sharp = hg(mu, 0.88) * 4.0 * 3.14159 * 0.12;
  // powder darkening (dark edges seen away from the sun) fades out toward the sun
  float fwd = smoothstep(0.55, 0.97, mu);
  // light scattered many times has forgotten the sun's direction: toward the sun the higher
  // octaves take a flatter phase, so a thick cloud in front of the sun goes grey and only
  // its thin rim blazes (elsewhere the tuned single phase is kept)
  float phaseSoft = mix(phase, mix(hg(mu, 0.3), hg(mu, -0.2), 0.35) * 4.0 * 3.14159, fwd);
  float phaseFlat = mix(phase, 0.9, fwd);
  // the broad forward lobe narrows its energy into the sharp one above: the bulk of a cloud
  // near the sun is no longer blown out, its edges are
  float phaseMain = mix(phase, mix(hg(mu, 0.4), hg(mu, -0.25), 0.35) * 4.0 * 3.14159, fwd);
  float jl = 0.75 + 0.5 * fract(jitter * 7.13);
#else
  float jl = 1.0;
#endif
  float tt = t0 + dt * jitter;
  float sigma = 0.0042;
  for (int i = 0; i < 96; i++) {
    if (i >= steps || tt > t1 || T < 0.02) break;
#ifdef CLOUD_TYPES
    // Quadratic spacing resolves wisps within metres of the eye on entry, without
    // increasing sample count. Integrate the actual interval (Beer is step invariant).
    if (inK > 0.0) {
      float a = float(i) / float(steps), b = float(i + 1) / float(steps);
      float ta = mix(a, a * a, inK), tb = mix(b, b * b, inK);
      dt = len * (tb - ta);
      tt = t0 + len * ta + dt * jitter;
    }
#endif
    vec3 p = ro + rd * tt;
    float dens = filteredDensity(p, L, sel, false, noiseLod);
    if (dens > 0.001) {
      if (firstHit < 0.0) firstHit = tt;
      float h = clamp((p.y - L.x) / (L.y - L.x), 0.0, 1.0);
      float ls = lightMarch(p, L, sel, jl, noiseLod) * sigma;
      // Multiple-scattering approximation (sum of attenuated octaves)
      float beer = exp(-ls) + 0.3 * exp(-ls * 0.25) + 0.12 * exp(-ls * 0.06);
#ifdef CLOUD_TYPES
      float powder = 1.0 - exp(-dens * 400.0 * sigma);
#else
      float powder = 1.0 - exp(-dens * 2.0 * dt * sigma * 2.0);
#endif
      // a touch more sun and less flat ambient than physically tidy: brighter sunlit tops and
      // greyer bases give the cumulus sea its towering relief (the film's look)
#ifdef SILVER
      // thin edges (little density along the view ray and toward the sun) take the sharp lobe
      float e0 = exp(-ls);
      float edgeK = e0 * (1.0 + 2.0 * (1.0 - smoothstep(0.0, 0.35, dens)));
      float scat = e0 * phaseMain + 0.3 * exp(-ls * 0.25) * phaseSoft + 0.12 * exp(-ls * 0.06) * phaseFlat;
      vec3 sun = uSunColor * (scat + edgeK * sharp) * mix(mix(0.45, 1.0, powder), 1.0, fwd) * 0.47;
#else
      vec3 sun = uSunColor * beer * phase * mix(0.45, 1.0, powder) * 0.47;
#endif
#ifdef SHADOWMAP
      if (sel < 0.5) sun *= cloudShadow(p);
#endif
      vec3 amb = mix(uHorizon * 0.3 + vec3(0.02), uZenith * 0.7 + uHorizon * 0.45, h) * uAmb * mix(0.42, 1.0, h * h * (3.0 - 2.0 * h));
      if (sel < 0.5 && uGlow.w > 0.0) {
        vec2 gq = p.xz - uGlow.xy;
        amb += vec3(1.0, 0.45, 0.15) * uGlow.w * exp(-dot(gq, gq) / (uGlow.z * uGlow.z)) * (1.0 - h);
      }
      for (int li = 0; li < ${CLOUD_LIGHTS}; li++) {
        if (li >= uPLn) break;
        vec3 dl = p - uPL[li].xyz;
        float q = dot(dl, dl) / (uPL[li].w * uPL[li].w);
        // inverse-square beyond the radius, faded out by 8 radii
        if (q < 64.0) amb += uPLc[li] * (1.0 - q * 0.015625) / (1.0 + q);
      }
      vec3 S = (sun + amb) * dens * sigma;
      float sE = max(dens * sigma, 1e-6);
      float Tr = exp(-sE * dt);
      col += T * (S - S * Tr) / sE;
#ifdef TEMPORAL
      float wgt = T * (1.0 - Tr);
      dw += vec2(wgt * tt, wgt);
#endif
      T *= Tr;
    }
    tt += dt;
  }
}


#ifdef CLOUD_TYPES
void marchTower(vec3 ro, vec3 rd, vec2 t, float maxDist, vec4 L, float sel, int steps, float jitter,
                inout vec3 col, inout float T, inout float firstHit, inout vec2 dw) {
  if (t.x < 0.0) return;
  jitter = 0.5;
  float t0 = t.x;
  // Camera inside this layer (climbing through the deck in the take-off scene, a dive): a
  // grazing ray runs tens of km through the slab, the steps end up ~1 km apart and the cloud
  // ahead turned into step noise the temporal accumulation could not settle (static horizontal
  // banding). Inside, the march stops 8 km out (murk), relaxed over the last 500 m before the
  // layer's top or base so the far cloud sea fades back in as the camera leaves it. (A cap from
  // above the layer would cut the cumulus sea: grazing rays reach the dense part km past entry.)
  float inK = smoothstep(0.0, 500.0, min(ro.y - L.x, L.y - ro.y));
#ifdef CLOUD_TYPES
  // A camera beside a tower is inside the slab, but still in clear air. Only
  // actual local density may shorten visibility to the immersion range.
  inK *= smoothstep(0.02, 0.3, density(ro, L, sel, false));
#endif
  float t1 = min(t.y, min(maxDist, mix(90000.0, 8000.0, inK)));
  if (t1 <= t0) return;
  float len = t1 - t0;
  float dt = max(len / float(steps), 30.0);
  // Above the deck, coarse grazing steps must integrate noise at their own scale.
  // Keep the full cloud sea; filter both extinction and its lighting, not the history.
  // Fade in over 100 m above the top so crossing it does not switch density abruptly.
  float footprint = dt * smoothstep(0.0, 100.0, ro.y - L.y);
  float noiseScale = mix(5600.0, 3800.0, sel);
  vec2 noiseLod = log2(max(vec2(1.0), footprint * vec2(64.0, 32.0 / 0.14) / noiseScale));
  // Once erosion is filtered over several texels, a centred sample is stable without
  // the large per-frame offsets that otherwise survive the temporal history clamp.
#ifndef CLOUD_TYPES
  jitter = mix(jitter, 0.5, smoothstep(1.0, 3.0, noiseLod.y));
#endif
  float mu = dot(rd, uSunDir);
  float phase = mix(hg(mu, 0.62), hg(mu, -0.25), 0.35) * 4.0 * 3.14159;
  phase = max(phase, 0.55);
#ifdef SILVER
  // a sharp forward lobe (g 0.86) for the single-scattered sun: only within ~20 degrees of
  // the sun, where it makes thin cloud edges in front of it blaze (silver linings)
  float sharp = hg(mu, 0.86) * 4.0 * 3.14159 * 0.24;
  // powder darkening (dark edges seen away from the sun) fades out toward the sun
  float fwd = smoothstep(0.55, 0.97, mu);
  // light scattered many times has forgotten the sun's direction: toward the sun the higher
  // octaves take a flatter phase, so a thick cloud in front of the sun goes grey and only
  // its thin rim blazes (elsewhere the tuned single phase is kept)
  float phaseSoft = mix(hg(mu, 0.3), hg(mu, -0.2), 0.35) * 4.0 * 3.14159;
  float phaseFlat = 0.9;
  // the broad forward lobe narrows its energy into the sharp one above: the bulk of a cloud
  // near the sun is no longer blown out, its edges are
  float phaseMain = mix(phase, 0.35, fwd);
  phaseSoft = mix(phaseSoft, 0.8, fwd);
  float jl = 1.0;
#else
  float jl = 1.0;
#endif
  float tt = t0 + dt * jitter;
#ifdef CLOUD_TYPES
  tt = t0;
  bool fineStep = false;
  int emptySteps = 0;
#endif
  float sigma = 0.0042;
#ifdef SILVER
  vec3 rim = vec3(0.0);
#endif
  for (int i = 0; i < 96; i++) {
    if (i >= steps || T < 0.02) break;
#ifndef CLOUD_TYPES
    if (tt > t1) break;
#endif
#ifdef CLOUD_TYPES
    // Empty-space steps grow with distance; an occupied interval is re-marched
    // at surface scale before integrating it. This preserves 30 km towers without
    // corrugated kilometre-wide integration slices or noisy opaque shoulders.
    if (tt >= t1) break;
    float coarse = clamp((tt + 1000.0) * 0.07, 180.0, 1800.0) * 56.0 / float(steps);
    coarse = mix(coarse, min(coarse, 120.0), inK);
    dt = min(fineStep ? clamp(coarse * 0.5, 70.0, 250.0) : coarse, t1 - tt);
    float pixelFootprint = tt * uFullTexel.y * 2.0;
    noiseLod = log2(max(vec2(1.0, 0.01), vec2(max(pixelFootprint, dt * 0.16) * 64.0 / noiseScale,
      max(pixelFootprint * 2.0, dt * 0.12) * 32.0 / 1800.0)));
#endif
#ifdef CLOUD_TYPES
    vec3 p = ro + rd * (tt + dt * jitter);
#else
    vec3 p = ro + rd * tt;
#endif
    float dens = filteredDensity(p, L, sel, false, noiseLod);
#ifdef CLOUD_TYPES
    if (dens > 0.001 && !fineStep) { fineStep = true; emptySteps = 0; continue; }
    if (dens <= 0.001 && fineStep) {
      emptySteps++;
      if (emptySteps >= 3) fineStep = false;
    } else emptySteps = 0;
#endif
    if (dens > 0.001) {
      if (firstHit < 0.0) firstHit = tt;
      float h = clamp((p.y - L.x) / (L.y - L.x), 0.0, 1.0);
      float ls = lightMarch(p, L, sel, jl, noiseLod) * sigma;
      // Multiple-scattering approximation (sum of attenuated octaves)
      float beer = exp(-ls) + 0.3 * exp(-ls * 0.25) + 0.12 * exp(-ls * 0.06);
#ifdef CLOUD_TYPES
      float powder = 1.0 - exp(-dens * 400.0 * sigma);
#else
      float powder = 1.0 - exp(-dens * 2.0 * dt * sigma * 2.0);
#endif
      // a touch more sun and less flat ambient than physically tidy: brighter sunlit tops and
      // greyer bases give the cumulus sea its towering relief (the film's look)
#ifdef SILVER
      // thin edges (little density along the view ray and toward the sun) take the sharp lobe
      float e0 = exp(-ls);
      float edgeK = e0 * exp(-dens * 5.0) * 4.5;
      float scat = e0 * phaseMain + 0.3 * exp(-ls * 0.25) * phaseSoft + 0.12 * exp(-ls * 0.06) * phaseFlat;
      vec3 sun = uSunColor * scat * mix(mix(0.45, 1.0, powder), 1.0, fwd) * 0.47;
      // Backlit bodies retain cool skylight beneath the warm single-scatter rim.
      sun *= mix(1.0, 0.62, fwd);
      vec3 rimColour = mix(uSunColor, vec3(max(uSunColor.r, max(uSunColor.g, uSunColor.b))), 0.65);
      vec3 silver = rimColour * edgeK * sharp * 1.5;
#else
      vec3 sun = uSunColor * beer * phase * mix(0.45, 1.0, powder) * 0.47;
#endif
#ifdef SHADOWMAP
      if (sel < 0.5) {
        float visibility = cloudShadow(p);
        sun *= visibility;
#ifdef SILVER
        silver *= visibility;
#endif
      }
#endif
      vec3 amb = mix(uHorizon * 0.3 + vec3(0.02), uZenith * 0.7 + uHorizon * 0.45, h) * uAmb * mix(0.42, 1.0, h * h * (3.0 - 2.0 * h));
#ifdef CLOUD_TYPES
      // Sky fill is attenuated inside a thick body, with cool open-sky bounce on
      // exposed heads. Low sun keeps its warm direct colour against blue shadows.
      float skyAccess = exp(-dens * 1.2) * mix(0.18, 1.0, smoothstep(0.05, 0.7, h));
      amb *= mix(0.42, 1.08, skyAccess);
      amb += uZenith * uAmb * skyAccess * 0.10;
#ifdef SILVER
      amb += vec3(0.035, 0.055, 0.10) * uAmb * fwd;
#endif
#endif
      if (sel < 0.5 && uGlow.w > 0.0) {
        vec2 gq = p.xz - uGlow.xy;
        amb += vec3(1.0, 0.45, 0.15) * uGlow.w * exp(-dot(gq, gq) / (uGlow.z * uGlow.z)) * (1.0 - h);
      }
      for (int li = 0; li < ${CLOUD_LIGHTS}; li++) {
        if (li >= uPLn) break;
        vec3 dl = p - uPL[li].xyz;
        float q = dot(dl, dl) / (uPL[li].w * uPL[li].w);
        // inverse-square beyond the radius, faded out by 8 radii
        if (q < 64.0) amb += uPLc[li] * (1.0 - q * 0.015625) / (1.0 + q);
      }
      vec3 S = (sun + amb) * dens * sigma;
      float sE = max(dens * sigma, 1e-6);
      float Tr = exp(-sE * dt);
      col += T * (S - S * Tr) / sE;
#ifdef SILVER
      rim += T * (1.0 - Tr) * silver;
#endif
#ifdef TEMPORAL
      float wgt = T * (1.0 - Tr);
      dw += vec2(wgt * tt, wgt);
#endif
      T *= Tr;
    }
    tt += dt;
  }
#ifdef SILVER
  // Only a thin VIEW column receives the forward rim. Applying this to every
  // low-density front sample used to turn entire opaque bodies into glowing dunes.
  // The rim peaks on the translucent silhouette, with no inner opacity band.
  col += rim * T * T;
#endif
}

#endif

// Scope the experimental march to dense convection. Fair/overcast skies retain
// the production marcher, including its horizon integration and solar response.
void marchLayer(vec3 ro, vec3 rd, vec2 t, float maxDist, vec4 L, float sel, int steps, float jitter,
                inout vec3 col, inout float T, inout float firstHit, inout vec2 dw) {
#ifdef CLOUD_TYPES
  if (sel < 0.5 && uConvection > 0.0) {
    marchTower(ro, rd, t, maxDist, L, sel, steps, jitter, col, T, firstHit, dw);
    if (T < 0.02) T = 0.0; // no HDR solar-disk leakage through terminated opaque volume
    return;
  }
#endif
  marchDeck(ro, rd, t, maxDist, L, sel, steps, jitter, col, T, firstHit, dw);
}

#if defined(SHADOW_PASS)
// Cloud shadow map: transmittance of the upper layer along the sun ray that crosses the
// layer's base at this texel's (x, z). Cheap density (no detail erosion), 8 steps.
void main() {
  vec2 xz = uShadowBox.xy + (vUv - 0.5) * uShadowBox.z;
  float sy = max(uSunDir.y, 0.08);
  float len = min((uHigh.y - uHigh.x) / sy, 14000.0);
  float dt = len / 8.0;
  vec3 p = vec3(xz.x, uHigh.x, xz.y) + uSunDir * (dt * 0.5);
  float od = 0.0;
  for (int i = 0; i < 8; i++) {
    od += density(p, uHigh, 1.0, true) * dt;
    p += uSunDir * dt;
  }
  // light scattered around the cloud softens its shadow (multiple scattering): 3/4 of the optical depth
  float upper = max(exp(-od * 0.0042 * 0.75), 0.1);
  // G holds the low deck, indexed at its own base. Ground lookups project each
  // channel separately, so sunset shadows do not slide to the wrong altitude.
  len = min((uLow.y - uLow.x) / sy, 14000.0); dt = len / 8.0;
  p = vec3(xz.x, uLow.x, xz.y) + uSunDir * (dt * 0.5); od = 0.0;
  for (int i = 0; i < 8; i++) { od += density(p, uLow, 0.0, true) * dt; p += uSunDir * dt; }
  gl_FragColor = vec4(upper, max(exp(-od * 0.0042 * 0.75), 0.1), 0.0, 1.0);
}
#elif defined(PROBE_PASS)
// One texel: the upper layer's shadow at the camera (aircraft lighting, read back asynchronously)
void main() {
  float local = 0.0, light = cloudShadow(uCamPos);
  if (uCamPos.y > uLow.x && uCamPos.y < uLow.y) {
    local = density(uCamPos, uLow, 0.0, false);
    light *= exp(-lightMarch(uCamPos, uLow, 0.0, 1.0, vec2(0.0)) * 0.0042);
  }
  if (uCamPos.y > uHigh.x && uCamPos.y < uHigh.y) {
    local = density(uCamPos, uHigh, 1.0, false);
    light = exp(-lightMarch(uCamPos, uHigh, 1.0, 1.0, vec2(0.0)) * 0.0042);
  }
  gl_FragColor = vec4(light, 1.0 - exp(-local * 2.0), 0.0, 1.0);
}
#else
void main() {
  vec3 rd;
#ifdef TEMPORAL
  // quarter-resolution march: each texel here is one texel of its 2x2 block of the cloud
  // buffer, a different one every frame (the resolve fills in the rest from history)
  vec2 sUv = (floor(gl_FragCoord.xy) * 2.0 + uSub + 0.5) * uCloudTexel;
#else
  vec2 sUv = vUv;
#endif
  // Use the farthest depth in this low-res texel's footprint so clouds are never cut
  // short at aircraft silhouettes (avoids haloes when upsampling).
  float sceneD = sceneDistance(sUv, rd);
  vec3 rdTmp;
  sceneD = max(sceneD, sceneDistance(sUv + uFullTexel * vec2(1.0, 0.0), rdTmp));
  sceneD = max(sceneD, sceneDistance(sUv + uFullTexel * vec2(0.0, 1.0), rdTmp));
  sceneD = max(sceneD, sceneDistance(sUv + uFullTexel * vec2(1.0, 1.0), rdTmp));
  sceneD = max(sceneD, sceneDistance(sUv - uFullTexel, rdTmp));
  vec3 ro = uCamPos;
#ifdef TEMPORAL
  // interleaved gradient noise, moved on every frame: the accumulation integrates the offsets
  vec2 jp = gl_FragCoord.xy + 5.588238 * mod(uFrame, 64.0);
  float jitter = fract(52.9829189 * fract(dot(jp, vec2(0.06711056, 0.00583715))));
#else
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + uTime * 0.0);
#endif
  vec3 col = vec3(0.0);
  float T = 1.0;
  float hitLow = -1.0, hitHigh = -1.0;
  vec2 dw1 = vec2(0.0), dw2 = vec2(0.0);
  vec2 tl = slabT(ro.y, rd.y, uLow.x, uLow.y);
  vec2 th = slabT(ro.y, rd.y, uHigh.x, uHigh.y);
  float entry = 1e9;
  if (tl.x >= 0.0) entry = min(entry, tl.x);
  if (th.x >= 0.0) entry = min(entry, th.x);
#ifdef TEMPORAL
  // geometry in front of every layer (the bomber's interior, aircraft in the clear air
  // between the layers): nothing to march. Flagged, so the resolve keeps the history there
  // instead of accumulating an aircraft-shaped hole that would ghost once it moves.
  if (sceneD < entry) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    outDepth = vec4(min(entry, 60000.0) * 0.001, 1.0, 0.0, 1.0);
    return;
  }
#endif
  int steps = int(uSteps);
  // March nearer layer first
  if (th.x >= 0.0 && (tl.x < 0.0 || th.x < tl.x)) {
    vec3 c1 = vec3(0.0); float T1 = 1.0;
    marchLayer(ro, rd, th, min(sceneD, 55000.0), uHigh, 1.0, steps * 3 / 4 + 8, jitter, c1, T1, hitHigh, dw1);
    col += c1; T *= T1;
    vec3 c2 = vec3(0.0); float T2 = 1.0;
#ifdef CLOUD_TYPES
    if (T > 0.02)
#endif
    marchLayer(ro, rd, tl, sceneD, uLow, 0.0, steps, jitter, c2, T2, hitLow, dw2);
    col += c2 * T; dw2 *= T; T *= T2;
  } else {
    vec3 c1 = vec3(0.0); float T1 = 1.0;
    marchLayer(ro, rd, tl, sceneD, uLow, 0.0, steps, jitter, c1, T1, hitLow, dw1);
    col += c1; T *= T1;
    vec3 c2 = vec3(0.0); float T2 = 1.0;
#ifdef CLOUD_TYPES
    if (T > 0.02)
#endif
    marchLayer(ro, rd, th, min(sceneD, 55000.0), uHigh, 1.0, steps * 3 / 4 + 8, jitter, c2, T2, hitHigh, dw2);
    col += c2 * T; dw2 *= T; T *= T2;
  }
  // Distance haze on the clouds themselves
  float hit = hitLow > 0.0 ? hitLow : hitHigh;
  if (hitLow > 0.0 && hitHigh > 0.0) hit = min(hitLow, hitHigh);
  if (hit > 0.0) {
    float f = 1.0 - exp(-hit / (Atmos_hazeDist * uHaze));
    col = mix(col, skyRadiance(rd) * (1.0 - T), f * 0.9);
  }
#ifdef TEMPORAL
  // Reprojection depth: where the cloud's opacity builds up; empty texels take the nearest
  // layer entry
  vec2 dw = dw1 + dw2;
  float rep = dw.y > 1e-4 ? dw.x / dw.y : min(entry, 60000.0);
  outColor = vec4(col, T);
  outDepth = vec4(min(rep, 90000.0) * 0.001, 0.0, 0.0, 1.0);   // y: 1 = hidden behind geometry
#else
  gl_FragColor = vec4(col, T);
#endif
}
#endif
`;

const compositeFrag = /* glsl */ `
precision highp float;
precision highp sampler3D;
${skyGLSL}
${depthGLSL}
uniform sampler2D tScene;
uniform sampler2D tClouds;
uniform sampler3D tMist;
uniform float uConvection;
uniform vec3 uMistWind;
uniform vec3 uCamPos;
uniform vec4 uLow;
uniform vec4 uHigh;
uniform float uWeatherFog;
uniform float uHaze;
varying vec2 vUv;
void main() {
  vec3 rd;
  float d = sceneDistance(vUv, rd);
  vec3 scene = texture2D(tScene, vUv).rgb;
  // Aerial perspective on geometry
  if (d < 1e8) {
    float f = 1.0 - exp(-d / (26000.0 * uHaze));
    if (uAtmosQuality > 0.5) {
      vec3 transmittance = airTransmittance(uCamPos.y, rd, d);
      // Retain weather's aerosol veil alongside molecular aerial perspective.
      transmittance *= exp(-d / (65000.0 * uHaze));
      scene = scene * transmittance + skyRadiance(rd) * (1.0 - transmittance);
    } else scene = mix(scene, skyRadiance(rd), f);
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
  // Local mist veils the cloud sea and sky too; nearby cockpit geometry remains crisp.
  float fogD = min(d, 4500.0);
  float fog = uWeatherFog;
  vec3 fogColour = mix(uHorizon, uZenith, .2);
  if (uAtmosQuality > 0.5 && uConvection > 0.0 && fog > 0.0) {
    // Two world-space mist intervals break heavy weather into coherent passing
    // veils. They stay attached to the air mass through a camera turn or rebase.
    vec3 mp = uCamPos + uMistWind;
    float nearMist = textureLod(tMist, (mp + rd * fogD * 0.25) / 2100.0, 1.0).r;
    float farMist = textureLod(tMist, (mp + rd * fogD * 0.75) / 3400.0, 1.0).r;
    fog *= mix(1.0, 0.35 + nearMist * 0.8 + farMist * 0.6, uConvection);
    fogColour *= mix(1.0, 0.72 + 0.3 * farMist, uConvection);
    fogColour += uSunColor * pow(max(0.0, dot(rd, uSunDir)), 6.0) * 0.035 * uConvection;
  }
  col = mix(col, fogColour, 1.0 - exp(-fogD * fog));
  gl_FragColor = vec4(col, 1.0);
}
`;

// Temporal resolve (full cloud-buffer resolution). The march ran at quarter resolution on
// one texel of every 2x2 block; here every texel reprojects the accumulated history with the
// previous frame's view-projection (at the cloud depth of its block, carried along by the
// wind) and clips it to the box of the fresh quarter-res samples around it (mean +- k sigma,
// inside min/max). The texel that was marched this frame blends its fresh sample in; the
// other three keep the reprojected history. No history (first frame, cut, off-screen):
// the fresh samples upsampled.
const resolveFrag = /* glsl */ `
precision highp float;
uniform sampler2D tCur;
uniform sampler2D tCurD;
uniform sampler2D tHist;
uniform mat4 uPrevVP;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform vec3 uWindDelta;
uniform float uReversed;
uniform float uAlpha;
uniform float uHistOK;
uniform vec2 uTexel;
uniform vec2 uSub;
varying vec2 vUv;

// Catmull-Rom history fetch (5 bilinear taps): a turret swing resamples the history every
// frame, and plain bilinear would blur it a little more each time
vec4 histCR(vec2 uv) {
  vec2 res = 1.0 / uTexel;
  vec2 pos = uv * res;
  vec2 c = floor(pos - 0.5) + 0.5;
  vec2 f = pos - c;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 tc0 = (c - 1.0) * uTexel, tc3 = (c + 2.0) * uTexel;
  vec2 tc12 = (c + w2 / w12) * uTexel;
  vec4 r = texture2D(tHist, vec2(tc12.x, tc0.y)) * (w12.x * w0.y)
         + texture2D(tHist, vec2(tc0.x, tc12.y)) * (w0.x * w12.y)
         + texture2D(tHist, tc12) * (w12.x * w12.y)
         + texture2D(tHist, vec2(tc3.x, tc12.y)) * (w3.x * w12.y)
         + texture2D(tHist, vec2(tc12.x, tc3.y)) * (w12.x * w3.y);
  float wsum = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return max(r / wsum, vec4(0.0));
}

void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  ivec2 hiQ = textureSize(tCur, 0) - 1;
  ivec2 b = min(ip / 2, hiQ);
  vec2 uv = (vec2(ip) + 0.5) * uTexel;
  vec4 f = texelFetch(tCur, b, 0);
  vec2 dh = texelFetch(tCurD, b, 0).xy;
  // a hidden fresh sample (behind geometry) carries no cloud: keep the history there
  bool fresh = all(equal(ip - (ip / 2) * 2, ivec2(uSub))) && dh.y < 0.5;
  // neighbourhood of visible fresh samples (3x3 quarter-res texels, ~6x6 here)
  vec4 m1 = vec4(0.0), m2 = vec4(0.0), mn = vec4(1e9), mx = vec4(-1e9);
  float n = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    ivec2 q = clamp(b + ivec2(x, y), ivec2(0), hiQ);
    if (texelFetch(tCurD, q, 0).y > 0.5) continue;
    vec4 s = texelFetch(tCur, q, 0);
    m1 += s; m2 += s * s; mn = min(mn, s); mx = max(mx, s); n += 1.0;
  }
  m1 /= max(n, 1.0); m2 /= max(n, 1.0);
  // fallback: the fresh samples, upsampled (their positions this frame sit at uSub)
  vec4 up = texture2D(tCur, uv + (0.5 - uSub) * uTexel);
  if (uHistOK < 0.5) { gl_FragColor = fresh ? f : up; return; }
  float dk = dh.x;
  vec4 fp = uInvProj * vec4(uv * 2.0 - 1.0, uReversed > 0.5 ? 0.0 : 1.0, 1.0);
  vec3 rd = normalize((uCamWorld * vec4(normalize(fp.xyz / fp.w), 0.0)).xyz);
  // the cloud seen here now sat (wind drift) further upwind a frame ago
  vec3 wp = uCamPos + rd * (dk * 1000.0) + uWindDelta;
  vec4 pc = uPrevVP * vec4(wp, 1.0);
  vec2 puv = pc.xy / max(pc.w, 1e-6) * 0.5 + 0.5;
  if (pc.w <= 0.0 || any(lessThan(puv, vec2(0.0))) || any(greaterThan(puv, vec2(1.0)))) {
    gl_FragColor = fresh ? f : up; return;
  }
  vec4 h = histCR(puv);
  vec4 sig = sqrt(max(m2 - m1 * m1, 0.0));
  if (n > 0.0) h = clamp(h, max(mn, m1 - 1.5 * sig), min(mx, m1 + 1.5 * sig));
  // fast motion resamples the history (bilinear blur): lean on the fresh data more
  float v = length((puv - uv) / uTexel);
  float mo = smoothstep(2.0, 24.0, v);
  gl_FragColor = fresh ? mix(h, f, mix(uAlpha, 0.6, mo)) : mix(h, up, mo * 0.5 * step(dh.y, 0.5));
}
`;

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Bombing target (TargetArea.ts): a hole in the low deck and the glow of the fires below it
export const cloudTargetUniforms = {
  uGap: { value: new THREE.Vector4() },
  uGlow: { value: new THREE.Vector4() },
};

export class CloudRenderer {
  private quad: FullScreenQuad;
  private compQuad: FullScreenQuad;
  private mat: THREE.ShaderMaterial;          // legacy march (Low)
  private tMat: THREE.ShaderMaterial;         // jittered march with MRT depth (temporal path)
  private resolveMat: THREE.ShaderMaterial;
  private shadowMat: THREE.ShaderMaterial;
  private probeMat: THREE.ShaderMaterial;
  private compMat: THREE.ShaderMaterial;
  private uniforms: Record<string, THREE.IUniform>;
  // legacy output; temporal path: this frame's quarter-res jittered march (colour + depth)
  // and the accumulated full cloud-res history (ping-pong)
  private legacyRT: THREE.WebGLRenderTarget;
  private cur: THREE.WebGLRenderTarget;
  private hist: THREE.WebGLRenderTarget[];
  private shadowRT: THREE.WebGLRenderTarget;
  private probeRT: THREE.WebGLRenderTarget;
  private idx = 0;
  private histOK = false;
  private frameN = 0;
  private prevVP = new THREE.Matrix4();
  private prevCamPos = new THREE.Vector3();
  private prevCamFwd = new THREE.Vector3();
  private prevFov = 0;
  private prevWind = new THREE.Vector3();
  private probeBusy = false;
  private probeGeneration = 0;
  private probeBuf = new Uint8Array(4);
  scale = 0.5;
  steps = 56;
  temporal = false;
  private get convection() {
    return this.useTemporal ? THREE.MathUtils.smoothstep(Atmos.lowCoverage, .65, .85)
      * (1 - THREE.MathUtils.smoothstep(Atmos.stratus, .6, .9)) : 0;
  }
  get lowTop() { return THREE.MathUtils.lerp(Atmos.lowTop, Atmos.lowTowerTop, this.convection); }
  get groundShadowTexture() { return this.shadowRT.texture; }
  get groundShadowBox() { return this.uniforms.uShadowBox.value as THREE.Vector3; }
  shadows = false;
  forceLegacy = false;    // dev A/B: the Low path at the current tier's buffer size
  alpha = 0.3;            // history blend: weight of a texel's fresh sample (one frame in four)
  shadowSize = 52000;     // world extent (m) of the cloud shadow map
  shadowRes = 256;
  // Upper-layer cloud shadow at the camera (0..1, 1 = full sun), smoothed: Engine dims the
  // sun light on the aircraft with it
  sunShadow = 1;
  private sunShadowTarget = 1;

  constructor(reversed: boolean) {
    const halfRT = (count = 1) => {
      const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false, count });
      for (const t of rt.textures) t.minFilter = t.magFilter = THREE.LinearFilter;
      return rt;
    };
    this.legacyRT = halfRT();
    this.cur = halfRT(2);
    for (const t of this.cur.textures) t.minFilter = t.magFilter = THREE.NearestFilter;
    this.cur.textures[0].minFilter = this.cur.textures[0].magFilter = THREE.LinearFilter;
    this.hist = [halfRT(), halfRT()];
    this.shadowRT = halfRT();
    this.shadowRT.setSize(this.shadowRes, this.shadowRes);
    this.probeRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    const shared = {
      ...atmosUniforms,
      tDepth: { value: null as THREE.Texture | null },
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uReversed: { value: reversed ? 1 : 0 },
      uCamPos: { value: new THREE.Vector3() },
      uLow: { value: new THREE.Vector4() },
      uHigh: { value: new THREE.Vector4() },
      uConvection: { value: 0 },
    };
    // Startup-only mip chains: coarse grazing steps use a prefiltered noise footprint.
    const shape = createShapeNoise(64), detail = createDetailNoise(32);
    for (const tex of [shape, detail]) {
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
    }
    this.uniforms = {
      ...shared,
      tShape: { value: shape },
      tDetail: { value: detail },
      tWeather: { value: createWeatherMap(256) },
      uWind: { value: Atmos.windOffset },
      uTime: { value: 0 },
      uFrame: { value: 0 },
      uSub: { value: new THREE.Vector2() },
      uCloudTexel: { value: new THREE.Vector2() },
      uShapeDrift: { value: new THREE.Vector3() },
      uDetailDrift: { value: new THREE.Vector3() },
      uSteps: { value: this.steps },
      uAmb: { value: 1.0 },
      uCloudType: { value: new THREE.Vector2() },
      uWeatherScale: { value: 17000 },
      uRes: { value: new THREE.Vector2() },
      uFullTexel: { value: new THREE.Vector2() },
      uPLn: { value: 0 },
      uPL: { value: Array.from({ length: CLOUD_LIGHTS }, () => new THREE.Vector4(0, -1e5, 0, 1)) },
      uPLc: { value: Array.from({ length: CLOUD_LIGHTS }, () => new THREE.Vector3()) },
      tShadow: { value: this.shadowRT.texture },
      uShadowBox: { value: new THREE.Vector3(0, 0, this.shadowSize) },
      ...cloudTargetUniforms,
    };
    // one source, four programs: legacy march, temporal march (MRT), shadow map, shadow probe
    const march = (defines: Record<string, number>, glsl3 = false) => new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      defines,
      vertexShader: vert,
      fragmentShader: cloudFrag,
      depthTest: false,
      depthWrite: false,
      ...(glsl3 ? { glslVersion: THREE.GLSL3 } : {}),
    });
    this.mat = march({});
    this.tMat = march({ TEMPORAL: 1, SHADOWMAP: 1, SILVER: 1, CLOUD_TYPES: 1 }, true);
    this.shadowMat = march({ SHADOW_PASS: 1, SHADOWMAP: 1, CLOUD_TYPES: 1 });
    this.probeMat = march({ PROBE_PASS: 1, SHADOWMAP: 1, CLOUD_TYPES: 1 });
    this.resolveMat = new THREE.ShaderMaterial({
      uniforms: {
        tCur: { value: null }, tCurD: { value: null }, tHist: { value: null }, uSub: { value: new THREE.Vector2() },
        uPrevVP: { value: this.prevVP }, uInvProj: shared.uInvProj, uCamWorld: shared.uCamWorld,
        uCamPos: shared.uCamPos, uWindDelta: { value: new THREE.Vector3() }, uReversed: shared.uReversed,
        uAlpha: { value: this.alpha }, uHistOK: { value: 0 }, uTexel: { value: new THREE.Vector2() },
      },
      vertexShader: vert,
      fragmentShader: resolveFrag,
      depthTest: false,
      depthWrite: false,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: { ...shared, tMist: { value: detail }, uMistWind: { value: Atmos.windOffset }, tScene: { value: null }, tClouds: { value: this.legacyRT.texture } },
      vertexShader: vert,
      fragmentShader: compositeFrag,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.mat);
    this.compQuad = new FullScreenQuad(this.compMat);
  }

  // The resolved cloud buffer of the last frame (rgb in-scatter, a transmittance): PostFX
  // reads it for sun visibility and god rays
  get texture(): THREE.Texture {
    return this.useTemporal ? this.hist[this.idx].texture : this.legacyRT.texture;
  }

  private get useTemporal() { return this.temporal && !this.forceLegacy; }

  resetHistory() { this.histOK = false; this.probeGeneration++; weatherNow.cloudInside = 0; }

  rebase(offset: THREE.Vector3) {
    this.groundShadowBox.x -= offset.x; this.groundShadowBox.y -= offset.z;
    cloudShadowUniforms.uCloudShadowBox.value.copy(this.groundShadowBox);
  }

  setSize(w: number, h: number) {
    // even, so the quarter-res march tiles the cloud buffer in exact 2x2 blocks
    const cw = Math.max(2, Math.floor(w * this.scale / 2) * 2), ch = Math.max(2, Math.floor(h * this.scale / 2) * 2);
    for (const rt of [this.legacyRT, ...this.hist]) rt.setSize(cw, ch);
    this.cur.setSize(cw / 2, ch / 2);
    this.uniforms.uFullTexel.value.set(1 / w, 1 / h);
    cloudOcclusionUniforms.uCloudScreen.value.set(w, h);
    this.uniforms.uRes.value.set(cw, ch);
    this.uniforms.uCloudTexel.value.set(1 / cw, 1 / ch);
    this.resolveMat.uniforms.uTexel.value.set(1 / cw, 1 / ch);
    this.resetHistory();
  }

  // Buffer scale, raymarch steps and path of the quality tier (Engine QUALITY presets; max 96 steps)
  setQuality(p: { cloudScale: number; cloudSteps: number; cloudTemporal: boolean }, w: number, h: number) {
    this.scale = p.cloudScale;
    this.steps = Math.min(96, p.cloudSteps);
    this.temporal = this.shadows = p.cloudTemporal;
    if (!this.temporal) { cloudShadowUniforms.uCloudShadowOn.value = 0; weatherNow.cloudInside = 0; }
    this.setSize(w, h);
  }

  private syncUniforms(camera: THREE.PerspectiveCamera, depth: THREE.Texture, time: number, dt = 0) {
    const u = this.uniforms;
    u.tDepth.value = depth;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    u.uConvection.value = this.convection;
    u.uLow.value.set(Atmos.lowBase, this.lowTop, Atmos.lowCoverage, Atmos.lowDensity * THREE.MathUtils.lerp(1, .55, this.convection));
    u.uHigh.value.set(Atmos.highBase, Atmos.highTop, Atmos.highCoverage, Atmos.highDensity);
    u.uTime.value = time;
    u.uFrame.value = this.frameN;
    // Bounded sinusoidal drift (never grows, so no float precision loss in texture coords).
    // Incommensurate frequencies keep the motion from visibly repeating.
    u.uShapeDrift.value.set(
      Math.sin(time * 0.021) * 0.05 + Math.sin(time * 0.057 + 1.3) * 0.02,
      Math.sin(time * 0.013 + 2.1) * 0.03,
      Math.cos(time * 0.017) * 0.05 + Math.cos(time * 0.043) * 0.02);
    u.uDetailDrift.value.set(Math.cos(time * 0.031) * 0.06, 0, Math.sin(time * 0.037 + 0.7) * 0.06);
    // Dense penetration spends its budget on near surfaces; fair decks keep the
    // production march/resolution. The existing uniform avoids reallocating targets.
    u.uSteps.value = THREE.MathUtils.lerp(this.steps, Math.max(20, Math.floor(this.steps * .7)), this.convection);
    u.uAmb.value = Atmos.cloudAmbient;
    u.uCloudType.value.set(Atmos.stratus, Atmos.towers);
    u.uPLn.value = cloudLights.sync(dt, u.uCamPos.value, u.uPL.value, u.uPLc.value);
    atmosUniforms.uCamAlt.value = camera.position.y;
  }

  // Camera cuts (station switch, view toggle, teleport) and FOV jumps invalidate the history
  private detectCut(camera: THREE.PerspectiveCamera) {
    const pos = this.uniforms.uCamPos.value as THREE.Vector3;
    const fwd = _fwd.set(0, 0, -1).transformDirection(camera.matrixWorld);
    // the floating origin moves the world and the wind offset together: compare positions in
    // the cloud frame (world + wind offset), which a rebase leaves unchanged
    const moved = _d.copy(pos).add(Atmos.windOffset).sub(this.prevCamPos).length();
    const cut = moved > 60 || fwd.dot(this.prevCamFwd) < 0.7 || Math.abs(camera.fov - this.prevFov) > 3;
    this.prevCamPos.copy(pos).add(Atmos.windOffset);
    this.prevCamFwd.copy(fwd);
    this.prevFov = camera.fov;
    if (cut) this.resetHistory();
  }

  private renderShadowMap(renderer: THREE.WebGLRenderer) {
    // centred on the camera, snapped to whole texels so the shadows don't swim
    const box = this.uniforms.uShadowBox.value as THREE.Vector3;
    const pos = this.uniforms.uCamPos.value as THREE.Vector3;
    const texel = this.shadowSize / this.shadowRes;
    box.set(Math.round(pos.x / texel) * texel, Math.round(pos.z / texel) * texel, this.shadowSize);
    this.quad.material = this.shadowMat;
    renderer.setRenderTarget(this.shadowRT);
    this.quad.render(renderer);
    cloudShadowUniforms.tCloudShadow.value = this.shadowRT.texture;
    cloudShadowUniforms.uCloudShadowBox.value.copy(box);
    cloudShadowUniforms.uCloudShadowLayers.value.set(Atmos.lowBase, this.uniforms.uLow.value.y, Atmos.highBase, Atmos.highTop);
    cloudShadowUniforms.uCloudSun.value.copy(Atmos.sunDir);
    cloudShadowUniforms.uCloudShadowOn.value = 1;
    // aircraft: sample the shadow at the camera now and then, read back without stalling
    if (!this.probeBusy && (this.frameN & 7) === 0) {
      this.quad.material = this.probeMat;
      renderer.setRenderTarget(this.probeRT);
      this.quad.render(renderer);
      this.probeBusy = true;
      const generation = this.probeGeneration;
      renderer.readRenderTargetPixelsAsync(this.probeRT, 0, 0, 1, 1, this.probeBuf)
        .then(() => { if (this.useTemporal && generation === this.probeGeneration) { this.sunShadowTarget = this.probeBuf[0] / 255; weatherNow.cloudInside = this.probeBuf[1] / 255; } })
        .catch(() => { /* lost context or unsupported: keep full sun */ })
        .finally(() => { this.probeBusy = false; });
    }
  }

  /** Compile the infrequent shadow probe during mission warm-up, without a readback. */
  warmProbe(renderer: THREE.WebGLRenderer) {
    if (!this.temporal || !this.shadows) return;
    const target = renderer.getRenderTarget(), material = this.quad.material;
    this.quad.material = this.probeMat;
    renderer.setRenderTarget(this.probeRT); this.quad.render(renderer);
    this.quad.material = material; renderer.setRenderTarget(target);
  }

  /** Fixed capture only: resolve aircraft illumination before settling the image.
   * Normal flight keeps the asynchronous probe and never stalls the GPU. */
  settleProbeForCapture(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, time: number) {
    if (!this.useTemporal || !this.shadows) return;
    // Capture phase must not depend on how many async startup frames ran.
    // Normal flight retains its uninterrupted stochastic sequence.
    this.frameN = 0;
    const target = renderer.getRenderTarget(), material = this.quad.material;
    this.syncUniforms(camera, this.uniforms.tDepth.value, time, 0);
    // Consume the cut before sampling: the first render must not clear the
    // settled density and wait for a timing-dependent asynchronous replacement.
    this.detectCut(camera);
    this.probeGeneration++;
    const busy = this.probeBusy;
    this.probeBusy = true;
    this.renderShadowMap(renderer);
    this.quad.material = this.probeMat;
    renderer.setRenderTarget(this.probeRT); this.quad.render(renderer);
    renderer.readRenderTargetPixels(this.probeRT, 0, 0, 1, 1, this.probeBuf);
    this.sunShadowTarget = this.sunShadow = this.probeBuf[0] / 255;
    weatherNow.cloudInside = this.probeBuf[1] / 255;
    this.probeBusy = busy;
    this.quad.material = material; renderer.setRenderTarget(target);
  }

  // Dev (gallery): render the shadow map around the camera and read it back synchronously.
  // Returns the transmittance per texel (row-major from -z) and the map's centre / size.
  readShadowMap(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, time: number) {
    const tex = this.uniforms.tDepth.value as THREE.Texture | null;
    camera.updateMatrixWorld();
    this.syncUniforms(camera, tex as THREE.Texture, time);
    const busy = this.probeBusy;
    this.probeBusy = true;   // no probe readback from this call
    this.renderShadowMap(renderer);
    this.probeBusy = busy;
    const n = this.shadowRes;
    const buf = new Uint16Array(n * n * 4);
    renderer.readRenderTargetPixels(this.shadowRT, 0, 0, n, n, buf);
    const out = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) out[i] = THREE.DataUtils.fromHalfFloat(buf[i * 4]);
    const box = this.uniforms.uShadowBox.value as THREE.Vector3;
    return { data: out, res: n, cx: box.x, cz: box.y, size: box.z };
  }

  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, sceneRT: THREE.WebGLRenderTarget,
    out: THREE.WebGLRenderTarget, time: number, dt = 1 / 60) {
    this.syncUniforms(camera, sceneRT.depthTexture!, time, dt);
    let cloudTex: THREE.Texture;
    if (this.useTemporal) {
      this.frameN++;
      this.detectCut(camera);
      // the cloud shadows drift slowly: refresh the map every 4th frame (its box uniform
      // changes only with it, so lookups stay consistent in between)
      if (this.shadows && ((this.frameN & 3) === 0 || !this.histOK)) this.renderShadowMap(renderer);
      else if (!this.shadows) (this.uniforms.uShadowBox.value as THREE.Vector3).z = 1e-3;   // lookups fall outside: full sun
      const prev = this.idx, next = 1 - this.idx;
      // march: quarter res, jittered, one texel of each 2x2 block (cycling over 4 frames)
      const sub = SUB_ORDER[this.frameN & 3];
      (this.uniforms.uSub.value as THREE.Vector2).set(sub[0], sub[1]);
      this.quad.material = this.tMat;
      renderer.setRenderTarget(this.cur);
      this.quad.render(renderer);
      // resolve into the other history buffer
      const ru = this.resolveMat.uniforms;
      ru.tCur.value = this.cur.textures[0];
      ru.tCurD.value = this.cur.textures[1];
      ru.tHist.value = this.hist[prev].texture;
      ru.uSub.value.set(sub[0], sub[1]);
      ru.uHistOK.value = this.histOK ? 1 : 0;
      ru.uAlpha.value = this.alpha;
      ru.uWindDelta.value.copy(Atmos.windOffset).sub(this.prevWind);
      this.quad.material = this.resolveMat;
      renderer.setRenderTarget(this.hist[next]);
      this.quad.render(renderer);
      this.idx = next;
      cloudTex = this.hist[next].texture;
      // for the next frame's reprojection
      this.prevVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.prevWind.copy(Atmos.windOffset);
      this.histOK = true;
    } else {
      this.quad.material = this.mat;
      renderer.setRenderTarget(this.legacyRT);
      this.quad.render(renderer);
      cloudTex = this.legacyRT.texture;
      this.sunShadowTarget = this.sunShadow = 1;
      cloudShadowUniforms.uCloudShadowOn.value = 0;
      weatherNow.cloudInside = 0;
      this.histOK = false;
    }
    this.sunShadow += (this.sunShadowTarget - this.sunShadow) * Math.min(1, dt * 3);
    cloudOcclusionUniforms.tCloudVeil.value = cloudTex;
    cloudOcclusionUniforms.tCloudDistance.value = this.cur.textures[1];
    cloudOcclusionUniforms.uCloudVeilOn.value = this.useTemporal ? 1 : 0;
    this.compMat.uniforms.tClouds.value = cloudTex;
    this.compMat.uniforms.tScene.value = sceneRT.texture;
    renderer.setRenderTarget(out);
    // `out` shares the scene depth texture: overwrite colour only, keep depth
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    this.compQuad.render(renderer);
    renderer.autoClear = ac;
  }
}

// texel of each 2x2 block marched on successive frames (diagonals first: even coverage)
const SUB_ORDER: [number, number][] = [[0, 0], [1, 1], [1, 0], [0, 1]];
const _fwd = new THREE.Vector3();
const _d = new THREE.Vector3();

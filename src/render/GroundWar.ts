import * as THREE from 'three';
import { freightHead, groundSortie, hasGroundAirfield, type GroundSortie } from '../world/GroundWarMath';

export const groundWarUniforms = {
  uFreight: { value: 0 },
  uGroundSorties: { value: Array.from({ length: 3 }, () => new THREE.Vector4()) },
};
const sortie: GroundSortie = { u: 0, v: 0, altitude: 0, visibility: 0 };
export function syncGroundWar(clock: number, look: number) {
  groundWarUniforms.uFreight.value = freightHead(clock);
  for (let i = 0; i < 3; i++) {
    groundSortie(clock, i, sortie);
    groundWarUniforms.uGroundSorties.value[i].set(sortie.u, sortie.v, sortie.altitude,
      hasGroundAirfield(look) ? sortie.visibility : 0);
  }
}

// Shared with the sky's existing compiled ground shader: no extra passes, meshes or programs.
export const GROUND_WAR_GLSL = /* glsl */ `
uniform float uFreight;
uniform vec4 uGroundSorties[3];
vec2 warUV(vec2 p) { return vec2(dot(p, uTgtRot), dot(p, vec2(-uTgtRot.y, uTgtRot.x))); }
float warBox(vec2 p, vec2 halfSize, float fw) {
  vec2 d = abs(p) - halfSize;
  return 1.0 - smoothstep(-fw, fw, max(d.x, d.y));
}
vec3 groundWarTraffic(vec2 uv, vec3 c, float fw, float dry) {
  // A subdued service line outside the runway/taxiways, fading when sub-pixel.
  float railDetail = 1.0 - smoothstep(20.0, 65.0, fw);
  float rail = tBand(uv.y, -1820.0, -1780.0, fw) * tBand(uv.x, -2700.0, 2600.0, fw) * dry;
  c = mix(c, c * 0.75 + vec3(0.018, 0.016, 0.013), rail * railDetail);
  float tracks = tBand(abs(uv.y + 1800.0), 12.0, 16.0, fw);
  c = mix(c, vec3(0.065, 0.06, 0.052), rail * tracks * railDetail);
  float tail = uFreight - uv.x;
  float train = tBand(tail, 0.0, 560.0, fw) * tBand(uv.y, -1828.0, -1772.0, fw) * dry;
  float wagons = tBand(mod(tail, 70.0), 5.0, 62.0, fw * 0.4);
  vec3 car = mix(vec3(0.025, 0.027, 0.025), vec3(0.17, 0.075, 0.035), step(72.0, tail));
  c = mix(c, car, train * wagons);
  // Overlapping exhaust puffs grow and drift away from the track, clear of the runway.
  // Keep the locomotive end narrow so its attachment reads at bombing altitude.
  vec2 smoke = uv - vec2(uFreight - 18.0, -1800.0);
  vec2 stack = (smoke - vec2(0.0, -18.0)) / vec2(24.0, 36.0);
  float exhaust = exp(-dot(stack, stack) * 1.5);
  for (int j = 0; j < 5; j++) {
    float age = float(j) + fract(uTgtClock * 0.7);
    vec2 center = vec2(-age * 65.0, -22.0 - age * 42.0);
    vec2 q = (smoke - center) / vec2(40.0 + age * 23.0, 32.0 + age * 22.0);
    float puff = exp(-dot(q, q) * 1.5) * (1.0 - age / 6.0);
    exhaust += puff;
  }
  c = mix(c, vec3(0.035, 0.038, 0.035), min(exhaust, 1.0) * 0.95 * dry);
  if ((uTgtLook > 0.5 && uTgtLook < 1.5) || (uTgtLook > 2.5 && uTgtLook < 3.5)) {
    // Perimeter taxiway, dispersals and threshold bars remain readable through 7.6 km of air.
    float taxi = tBand(uv.y, -1465.0, -1395.0, fw) * tBand(uv.x, -1700.0, 1700.0, fw);
    float links = tBand(abs(uv.x), 1490.0, 1560.0, fw) * tBand(uv.y, -1465.0, -1185.0, fw);
    c = mix(c, vec3(0.10, 0.105, 0.09), max(taxi, links) * dry);
    float marking = tBand(uv.y, -1199.0, -1171.0, fw) * tBand(abs(uv.x), 80.0, 1600.0, fw)
      * tBand(mod(uv.x + 1800.0, 180.0), 0.0, 90.0, fw);
    float threshold = tBand(abs(uv.x), 1550.0, 1660.0, fw) * tBand(uv.y, -1235.0, -1135.0, fw);
    c = mix(c, vec3(0.9, 0.86, 0.66), max(marking, threshold * tBand(mod(uv.y + 1240.0, 35.0), 0.0, 20.0, fw * 0.5)) * dry);
    float bay = warBox(vec2(mod(uv.x + 1600.0, 400.0) - 200.0, uv.y + 1510.0), vec2(85.0, 60.0), fw)
      * tBand(uv.x, -1600.0, 1600.0, fw);
    c = mix(c, vec3(0.19, 0.18, 0.145), bay * dry);
  }
  return c;
}
float warFighter(vec2 q, float aa) {
  float wing = warBox(q - vec2(0.8 - abs(q.y) * 0.17, 0.0), vec2(1.3 - abs(q.y) * 0.09, 5.255), aa);
  return max(warBox(q, vec2(4.475, 0.7), aa),
    max(wing, warBox(q + vec2(3.5, 0.0), vec2(0.7, 2.3), aa)));
}
vec3 groundWarAircraft(vec2 rel, vec2 camRel, vec3 g, float fw, vec3 light) {
  vec2 uv = warUV(rel), camera = warUV(camRel);
  for (int i = 0; i < 3; i++) {
    vec4 p = uGroundSorties[i];
    if (p.w <= 0.0) continue;
    // Intersect the eye-to-aircraft ray with the ground plane: correct parallax on the sky.
    float ratio = uCamAlt / max(100.0, uCamAlt - p.z);
    vec2 projected = camera + (p.xy - camera) * ratio;
    vec2 q = uv - projected;
    // Recognition scale: preserve wing taper, fuselage and tail through the sky pass.
    float size = max(18.0, fw * 6.0 / 5.255);
    float scale = size * ratio;
    q /= scale;
    float aa = fw / scale * 0.55;
    float silhouette = warFighter(q, aa);
    vec2 shadowUV = uv - p.xy + warUV(uSunDir.xz) * p.z / max(uSunDir.y, 0.15);
    float shadow = warFighter(shadowUV / size, fw / size + p.z * 0.0008);
    g *= 1.0 - shadow * p.w * 0.75;
    // Prop wash follows the accelerating roll; a short dust wake lingers after rotation.
    float behind = p.x - uv.x;
    float dustWidth = 18.0 + max(behind, 0.0) * 0.13;
    float dustQ = (uv.y + 1185.0) / dustWidth;
    float dust = exp(-dustQ * dustQ)
      * tBand(behind, 55.0, 650.0, 60.0) * (1.0 - smoothstep(40.0, 350.0, p.z));
    dust *= (0.6 + 0.4 * sin(behind * 0.035 + uTgtClock * 3.0)) * p.w;
    g = mix(g, vec3(0.26, 0.235, 0.18) * light, dust * 0.6);
    vec3 paint = mix(vec3(0.025, 0.035, 0.022), vec3(0.16, 0.18, 0.13), step(2.5, abs(q.y)));
    paint = mix(paint, vec3(0.75, 0.49, 0.045), step(2.8, q.x));
    g = mix(g, paint * light, silhouette * p.w);
  }
  return g;
}
`;

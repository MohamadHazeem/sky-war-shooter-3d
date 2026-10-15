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
  // Exaggerated ballast/car widths preserve distinct wagons at the Low sky resolution.
  float rail = tBand(uv.y, -1070.0, -998.0, fw) * tBand(uv.x, -3000.0, 2800.0, fw) * dry;
  c = mix(c, vec3(0.46, 0.40, 0.29), rail);
  float tracks = tBand(abs(uv.y + 1034.0), 20.0, 25.0, fw);
  c = mix(c, vec3(0.055), rail * tracks);
  float tail = uFreight - uv.x;
  float train = tBand(tail, 0.0, 460.0, fw) * tBand(uv.y, -1053.0, -1015.0, fw) * dry;
  float wagons = tBand(mod(tail, 56.0), 5.0, 49.0, fw * 0.5);
  vec3 car = mix(vec3(0.035, 0.028, 0.022), vec3(0.24, 0.085, 0.025), step(60.0, tail));
  c = mix(c, car, train * wagons);
  // Broad rolling soot trails the moving locomotive; keep the car gaps unobscured.
  vec2 wind = warUV(uTgtWind);
  vec2 smoke = uv - vec2(uFreight - 18.0, -1034.0);
  float behind = -smoke.x;
  float width = 18.0 + max(0.0, behind) * 0.20;
  float drift = 40.0 + max(0.0, behind) * (0.36 + wind.y / 25.0);
  float steam = exp(-pow((smoke.y - drift) / width, 2.0))
    * tBand(behind, -20.0, 360.0, 30.0) * (1.0 - clamp(behind / 440.0, 0.0, 1.0));
  steam *= 0.72 + 0.28 * sin(behind / 20.0 - uTgtClock * 2.0);
  c = mix(c, vec3(0.045, 0.042, 0.037), steam * 0.9 * dry);
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
    // Seven-times recognition scale, with a nine-pixel minimum on the half-size Low sky.
    float size = max(7.0, fw * 4.5 / 5.255);
    float scale = size * ratio;
    q /= scale;
    float aa = fw / scale * 0.55;
    float silhouette = warFighter(q, aa);
    vec2 shadowUV = uv - p.xy + warUV(uSunDir.xz) * p.z / max(uSunDir.y, 0.15);
    float shadow = warFighter(shadowUV / size, fw / size + p.z * 0.0008);
    g *= 1.0 - shadow * p.w * 0.75;
    vec3 paint = mix(vec3(0.035, 0.045, 0.028), vec3(0.42, 0.43, 0.33), step(2.5, abs(q.y)));
    paint = mix(paint, vec3(0.75, 0.49, 0.045), step(2.8, q.x));
    g = mix(g, paint * light, silhouette * p.w);
  }
  return g;
}
`;

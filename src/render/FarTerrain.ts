import * as THREE from 'three';
import { Atmos } from './Atmosphere';
import type { Mission } from '../game/Missions';
import type { World } from '../world/World';
import { COVER_SIZE, COVER_SPAN, COAST_WIDTH, COAST_HEIGHT, CROSS_SPAN, ROUTE_PAD, coastPixels, terrainPixels, terrainRoute, terrainSeason } from '../world/FarTerrainData';

// Far-view ground at y=0, sampled by Sky's ray/plane intersection. Texture mips supply
// continuous LOD without terrain draws or per-pixel procedural noise. Coast/season state is
// prepared once per mission; only shared quality/shadow uniforms change during flight.
const cover = new THREE.DataTexture(terrainPixels(), COVER_SIZE, COVER_SIZE);
cover.wrapS = cover.wrapT = THREE.ClampToEdgeWrapping;
cover.generateMipmaps = true;
cover.minFilter = THREE.LinearMipmapLinearFilter;
cover.magFilter = THREE.LinearFilter;
cover.anisotropy = 4;
cover.needsUpdate = true;
const coast = new THREE.DataTexture(new Uint8Array(COAST_WIDTH * COAST_HEIGHT).fill(255), COAST_WIDTH, COAST_HEIGHT, THREE.RedFormat);
coast.minFilter = coast.magFilter = THREE.LinearFilter;
coast.needsUpdate = true;
export const farTerrainUniforms = {
  tLandCover: { value: cover }, tCoast: { value: coast },
  uFarRoute: { value: new THREE.Vector4(0, 0, 0, 1) }, // anchor xz, forward xz
  uFarLength: { value: 30000 }, uFarSeason: { value: 0 }, uFarQuality: { value: 2 },
  uFarMapped: { value: 0 },
  tFarShadow: { value: null as THREE.Texture | null },
  uFarShadowBox: { value: new THREE.Vector3() },
  uFarOrigin: { value: Atmos.originOffset }, uFarCloudBase: { value: 8900 }, uFarLowBase: { value: 3900 },
};

/** No per-frame work: rebuild the coast strip only when a mission is armed/reset. */
export function setFarTerrain(m: Mission | null, world: World, cruise: number, fallLead: number) {
  const u = farTerrainUniforms;
  const route = m && terrainRoute(m);
  u.uFarMapped.value = route ? 1 : 0;
  u.uFarSeason.value = m ? ({ summer: 0, autumn: 1, winter: 2 }[terrainSeason(m.date)]) : 0;
  if (!route || !m) return;
  const duration = m.bombsAway ? m.bombsAway + fallLead : Math.max(60, m.duration * 0.8);
  const length = cruise * duration;
  u.uFarLength.value = length;
  u.uFarRoute.value.set(world.formationCenter.x + Atmos.originOffset.x - world.formationForward.x * cruise * world.time,
    world.formationCenter.z + Atmos.originOffset.z - world.formationForward.z * cruise * world.time,
    world.formationForward.x, world.formationForward.z);
  coast.image.data = coastPixels(route, length);
  coast.needsUpdate = true;
}

export const FAR_TERRAIN_GLSL = /* glsl */ `
uniform sampler2D tLandCover, tCoast, tFarShadow;
uniform vec4 uFarRoute;
uniform float uFarLength, uFarSeason, uFarQuality, uFarMapped, uFarCloudBase, uFarLowBase;
uniform vec3 uFarShadowBox, uFarOrigin;
vec3 terrain(vec2 xz, float dist) {
  vec2 rel = xz - uFarRoute.xy;
  vec2 uv = vec2(dot(rel, vec2(uFarRoute.w, -uFarRoute.z)) / ${CROSS_SPAN}.0 + 0.5,
    (dot(rel, uFarRoute.zw) + ${ROUTE_PAD}.0) / (uFarLength + ${ROUTE_PAD * 2}.0));
  // Sub-chart estuaries / inlets: stable in world space, within ~200 m of the chart coast.
  uv.y += (120.0 * sin(xz.x / 1700.0) + 60.0 * sin(xz.x / 580.0) + 35.0 * sin(xz.x / 230.0)) / (uFarLength + ${ROUTE_PAD * 2}.0);
  float land = uFarMapped > 0.5 ? texture2D(tCoast, uv).r : 1.0;
  // Keep the existing industrial city on dry land even on a chart's coarse port outline.
  if (uTgt.w > 0.0) land = max(land, 1.0 - smoothstep(uTgt.z, uTgt.z * 1.8, length(xz - uTgt.xy)));
  vec3 water = vec3(0.025, 0.060, 0.085);
  vec3 grass = uFarSeason < 0.5 ? vec3(0.15, 0.17, 0.115) : uFarSeason < 1.5 ? vec3(0.19, 0.17, 0.125) : vec3(0.49, 0.52, 0.52);
  if (uFarQuality < 0.5) return mix(water, grass, land); // Low: one coast fetch, no detail/shadows
  // One unique regional atlas, aligned with the route and fixed in absolute space.
  // No wrapping, tile grid or repeated towns. Medium favours coarser mips.
  vec2 coverUV = vec2(dot(rel, vec2(uFarRoute.w, -uFarRoute.z)), dot(rel, uFarRoute.zw)) / ${COVER_SPAN}.0 + vec2(0.5, 0.25);
  vec4 mask = texture2D(tLandCover, coverUV, uFarQuality < 1.5 ? 1.0 : 0.0);
  // Final dusty crop/roof/wood colours are baked, so trilinear filtering cannot
  // create false colour outlines or turn distant mixed parcels into a single crop.
  vec3 field = mask.rgb / 3.0;
  if (uFarSeason > 0.5 && uFarSeason < 1.5) field *= vec3(1.04, 0.96, 0.91);
  if (uFarSeason > 1.5) field = mix(field, vec3(0.56, 0.59, 0.59), mask.a * 0.78);
  // Very broad relief: a gentle sun-facing bias, baked features remain flat.
  field *= 0.97 + 0.035 * sin(xz.x / 2800.0 + xz.y / 3700.0) * uSunDir.x
    + 0.025 * sin(xz.y / 1900.0) * uSunDir.z;
  // At the finite atlas boundary fade to regional colour before clamp could
  // stretch the last texel. Normal mission views are well inside this margin.
  vec2 atlasEdge = min(coverUV, 1.0 - coverUV);
  field = mix(grass, field, smoothstep(0.0, 0.06, min(atlasEdge.x, atlasEdge.y)));
  vec3 alb = mix(water, field, smoothstep(0.25, 0.75, land));
  if (uFarQuality > 1.5 && uFarShadowBox.z > 1.0) {
    vec2 q = xz - uFarOrigin.xz + uSunDir.xz * (uFarCloudBase / max(uSunDir.y, 0.05));
    vec2 suv = (q - uFarShadowBox.xy) / uFarShadowBox.z + 0.5;
    float edge = 1.0 - smoothstep(0.4, 0.49, max(abs(suv.x - 0.5), abs(suv.y - 0.5)));
    float shadow = mix(1.0, texture2D(tFarShadow, suv).r, edge);
    q = xz - uFarOrigin.xz + uSunDir.xz * (uFarLowBase / max(uSunDir.y, 0.05));
    suv = (q - uFarShadowBox.xy) / uFarShadowBox.z + 0.5;
    edge = 1.0 - smoothstep(0.4, 0.49, max(abs(suv.x - 0.5), abs(suv.y - 0.5)));
    shadow *= mix(1.0, texture2D(tFarShadow, suv).g, edge);
    alb *= 0.35 + 0.65 * shadow;
  }
  return alb * 1.35;
}
`;

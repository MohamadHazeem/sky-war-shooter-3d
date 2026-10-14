import * as THREE from 'three';
import { Atmos } from './Atmosphere';
import { cloudTargetUniforms } from './Clouds';
import { targetUniforms } from './TargetGround';
import type { Mission } from '../game/Missions';
import type { World } from '../world/World';
import { GRID, toGrid } from '../world/TerrainGrid';
import { TERRAIN_OVERVIEW } from '../world/TerrainIndex';
import { SEASON_INDEX, terrainRegion, terrainSeason, terrainView, trackLength, unpackOverview, unpackTile, type Region, type TileImage } from '../world/FarTerrainData';

// Europe from altitude (Phase 10 goal 04). The ground is still drawn by the sky dome's ray/plane
// intersection (Sky.ts), now over real geography at true scale: a mission's 3×3 block of 64 km
// tiles (coast, rivers and rails as distance fields, towns and land cover from ESA WorldCover,
// relief from Terrarium elevation; tools/terrain/) is streamed into three region textures, with
// a 2 km overview of the whole route area out to the horizon. 1940s land use is procedural on
// top: strip fields and polder parcels, woods, towns with dense centres, roads, villages.
// Water gets sun glint, swell and sky reflection; the low cloud deck and the upper layer cast
// shadows. No per-frame CPU work besides a few uniform copies; tiles load once per mission.
// Low keeps the old flat look: one coast lookup and seasonal colours.

const REGION = GRID.TILE * GRID.BLOCK;
function regionTexture(size: number, mip: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array(4 * 4), 2, 2);   // 2×2 placeholder until a mission loads
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = mip;
  t.anisotropy = mip ? 4 : 1;
  t.userData.size = size;
  return t;
}
const lines = regionTexture(GRID.LINES * GRID.BLOCK, true);
const cover = regionTexture(GRID.COVER * GRID.BLOCK, true);
const relief = regionTexture(GRID.RELIEF * GRID.BLOCK, true);
const overview = regionTexture(0, true);

export const farTerrainUniforms = {
  tFarLines: { value: lines }, tFarCover: { value: cover }, tFarRelief: { value: relief }, tFarOverview: { value: overview },
  uFarFocus: { value: new THREE.Vector2() },     // absolute world x, z of the mission's map focus
  uFarUV0: { value: new THREE.Vector2(0.5, 0.5) }, // region uv of the focus
  uFarM: { value: new THREE.Matrix2() },          // world offset (x, z) -> region uv offset
  uFarG: { value: new THREE.Matrix2() },          // world offset (x, z) -> true metres east, north
  uFarOV: { value: new THREE.Vector4(0, 0, 1, 1) }, // overview uv = xy + region uv * zw
  uFarSeason: { value: 0 }, uFarQuality: { value: 2 },
  uFarMapped: { value: 0 },                       // 1 = real map loaded for this mission
  uFarCityWater: { value: 0 },                    // the target city's water: 0 none (procedural river), 1 river, 2 shore
  uFarFw: { value: 1 },
  tFarShadow: { value: null as THREE.Texture | null },
  uFarShadowBox: { value: new THREE.Vector3() },
  uFarOrigin: { value: Atmos.originOffset }, uFarCloudBase: { value: 8900 },
  // low cloud deck shadows (Clouds.ts weather map + shape noise, read-only)
  tFarWeather: { value: null as THREE.Texture | null }, tFarShape: { value: null as THREE.Texture | null },
  uFarLow: { value: new THREE.Vector4(3900, 5900, 0, 0) }, uFarWind: { value: Atmos.windOffset },
  uFarWeatherScale: { value: 17000 }, uFarShapeDrift: { value: new THREE.Vector3() }, uFarGap: cloudTargetUniforms.uGap,
};

// ------------------------------------------------------------------ streaming
const BASE = (import.meta.env?.BASE_URL ?? './') + 'terrain/';
const tileCache = new Map<string, Promise<TileImage[] | null>>();
async function inflate(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url);
    if (!r.ok || !r.body) return null;
    const stream = r.body.pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch { return null; }
}
function loadTile(id: string): Promise<TileImage[] | null> {
  let p = tileCache.get(id);
  if (!p) {
    p = inflate(`${BASE}t${id}.bin`).then((b) => { try { return b ? unpackTile(b) : null; } catch { return null; } });
    tileCache.set(id, p);
    // a mission needs nine tiles; keep a few missions' worth (~1.5 MB decoded per tile)
    if (tileCache.size > 27) tileCache.delete(tileCache.keys().next().value!);
  }
  return p;
}
let overviewData: Promise<{ w: number; h: number; data: Uint8Array } | null> | null = null;
function loadOverview() {
  overviewData ??= inflate(`${BASE}overview.bin`).then((b) => { try { return b ? unpackOverview(b) : null; } catch { return null; } });
  return overviewData;
}

let generation = 0;
/** Fills the region textures from the block's tiles (missing tiles: overview land / open sea). */
async function loadRegion(region: Region, gen: number) {
  const [tiles, ov] = await Promise.all([Promise.all(region.tiles.map((t) => t.present ? loadTile(t.id) : Promise.resolve(null))), loadOverview()]);
  if (gen !== generation) return false;
  const fill = (tex: THREE.DataTexture, index: number, tileSize: number) => {
    const size = tileSize * GRID.BLOCK;
    const data = new Uint8Array(size * size * 4);
    region.tiles.forEach((t, k) => {
      const img = tiles[k]?.[index];
      const bx = (t.i - region.i0) * tileSize, by = (t.j - region.j0) * tileSize;
      for (let r = 0; r < tileSize; r++) {
        const dst = ((by + r) * size + bx) * 4;
        if (img) data.set(img.data.subarray(r * tileSize * 4, (r + 1) * tileSize * 4), dst);
        else for (let c = 0; c < tileSize; c++) {
          // no tile (open sea or off the chart): land from the overview, no rivers or rails
          const land = ov ? overviewLand(ov, (t.i + (c + 0.5) / tileSize) * GRID.TILE, (t.j + (r + 0.5) / tileSize) * GRID.TILE) : 0;
          const p = dst + c * 4;
          if (index === 0) { data[p] = land > 0.5 ? 255 : 0; data[p + 1] = 255; data[p + 2] = 0; data[p + 3] = 255; }
          else if (index === 1) { data[p] = 0; data[p + 1] = 40; data[p + 2] = 60; data[p + 3] = 10; }
          else { data[p] = 128; data[p + 1] = 128; data[p + 2] = 20; data[p + 3] = 0; }
        }
      }
    });
    tex.image = { data, width: size, height: size } as unknown as typeof tex.image;
    tex.needsUpdate = true;
  };
  fill(lines, 0, GRID.LINES);
  fill(cover, 1, GRID.COVER);
  fill(relief, 2, GRID.RELIEF);
  if (ov && overview.image.width !== ov.w) {
    overview.image = { data: ov.data, width: ov.w, height: ov.h } as unknown as typeof overview.image;
    overview.needsUpdate = true;
  }
  return true;
}
function overviewLand(ov: { w: number; h: number; data: Uint8Array }, gx: number, gy: number): number {
  const x = Math.floor(gx / GRID.OVERVIEW) - TERRAIN_OVERVIEW.i0 * GRID.TILE / GRID.OVERVIEW, y = Math.floor(gy / GRID.OVERVIEW) - TERRAIN_OVERVIEW.j0 * GRID.TILE / GRID.OVERVIEW;
  if (x < 0 || y < 0 || x >= ov.w || y >= ov.h) return 0;
  return ov.data[(y * ov.w + x) * 4] / 255;
}

// ------------------------------------------------------------------ mission mapping
const _r = new THREE.Vector2();
let riverWorld: THREE.Vector2 | null = null;
/** World direction of the target's river (for TargetGround's city axis), when mapped. */
export function targetRiverAxis(): THREE.Vector2 | null { return riverWorld; }

/** Arms the map for a mission (TargetArea, at mission start or reset). No per-frame work. */
export function setFarTerrain(m: Mission | null, world: World, cruise: number, fallLead: number) {
  const u = farTerrainUniforms;
  generation++;
  u.uFarMapped.value = 0;
  riverWorld = null;
  u.uFarCityWater.value = 0;
  u.uFarSeason.value = m ? SEASON_INDEX[terrainSeason(m.date)] : 0;
  // the ground track: from the formation's start along its heading
  const fwd = _r.set(world.formationForward.x, world.formationForward.z);
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 1); else fwd.normalize();
  const length = m ? trackLength(m, cruise, fallLead) : 30000;
  const sx = world.formationCenter.x + Atmos.originOffset.x - fwd.x * cruise * world.time;
  const sz = world.formationCenter.z + Atmos.originOffset.z - fwd.y * cruise * world.time;
  const view = m && terrainView(m);
  const at = view ? view.at : 0.5;
  u.uFarFocus.value.set(sx + fwd.x * length * at, sz + fwd.y * length * at);
  if (!view) return;
  // world (x, z) -> map (east, north) = (x, -z); rotate the heading onto the real bearing
  const theta = Math.atan2(Math.cos(view.bearing), Math.sin(view.bearing)) - Math.atan2(-fwd.y, fwd.x);
  const c = Math.cos(theta), s = Math.sin(theta);
  // G: world offset -> true metres (east, north); Matrix2.set takes row-major
  u.uFarG.value.set(c, s, s, -c);
  // S: true east metres -> grid metres at the focus latitude; region uv over the 3×3 block
  const region = terrainRegion(view, length);
  const kx = GRID.KX / Math.cos(view.lat * Math.PI / 180);
  const e = u.uFarG.value.elements;   // column-major
  u.uFarM.value.set(e[0] * kx / REGION, e[2] * kx / REGION, e[1] / REGION, e[3] / REGION);
  const [fx, fy] = toGrid(view.lon, view.lat);
  u.uFarUV0.value.set((fx - region.i0 * GRID.TILE) / REGION, (fy - region.j0 * GRID.TILE) / REGION);
  const ovW = TERRAIN_OVERVIEW.w * GRID.OVERVIEW, ovH = TERRAIN_OVERVIEW.h * GRID.OVERVIEW;
  u.uFarOV.value.set((region.i0 - TERRAIN_OVERVIEW.i0) * GRID.TILE / ovW, (region.j0 - TERRAIN_OVERVIEW.j0) * GRID.TILE / ovH, REGION / ovW, REGION / ovH);
  if (view.river) {
    // the water's run (grid frame, radians from east toward north) as a world direction
    const ge = Math.cos(view.riverAngle) / kx, gn = Math.sin(view.riverAngle);
    // G is its own inverse (a reflection): world = G * (east, north)
    riverWorld = new THREE.Vector2(c * ge + s * gn, s * ge - c * gn).normalize();
    u.uFarCityWater.value = view.river;
  }
  const gen = generation;
  loadRegion(region, gen).then((ok) => {
    if (!ok || gen !== generation) return;
    u.uFarMapped.value = 1;
    if (riverWorld && targetUniforms.uTgt.value.w > 0) targetUniforms.uTgtRot.value.copy(riverWorld);
  });
}

// ------------------------------------------------------------------ per frame (Engine.render)
/** Dev A/B (src/dev/groundShots.ts bench): force the terrain detail level (-1 = follow the preset). */
export const farTerrainDev = { quality: -1 };
interface CloudsLike { groundShadowTexture: THREE.Texture; groundShadowBox: THREE.Vector3 }
/** Quality, cloud shadows and the pixel footprint scale: uniform copies only. */
export function syncFarTerrain(clouds: CloudsLike, quality: string, camera: THREE.PerspectiveCamera, heightPx: number) {
  const u = farTerrainUniforms;
  u.uFarQuality.value = farTerrainDev.quality >= 0 ? farTerrainDev.quality : quality === 'low' ? 0 : quality === 'medium' ? 1 : 2;
  u.tFarShadow.value = clouds.groundShadowTexture;
  u.uFarShadowBox.value.copy(clouds.groundShadowBox);
  u.uFarCloudBase.value = Atmos.highBase;
  u.uFarFw.value = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.max(1, heightPx);
  // the low deck's shadow is approximated from the cloud renderer's own weather map and shape
  // noise (when it exposes them), High and above only
  const cu = (clouds as unknown as { uniforms?: Record<string, THREE.IUniform> }).uniforms;
  const ok = u.uFarQuality.value > 1.5 && !!cu?.tWeather?.value && !!cu?.tShape?.value;
  u.uFarLow.value.set(Atmos.lowBase, Atmos.lowTop, ok ? Atmos.lowCoverage : 0, Atmos.lowDensity);
  if (ok) {
    u.tFarWeather.value = cu!.tWeather.value;
    u.tFarShape.value = cu!.tShape.value;
    u.uFarWeatherScale.value = cu!.uWeatherScale?.value ?? 17000;
    if (cu!.uShapeDrift?.value) u.uFarShapeDrift.value.copy(cu!.uShapeDrift.value);
  }
}

export const FAR_TERRAIN_GLSL = /* glsl */ `
// Needs from the sky shader: skyRadiance(), the atmosphere uniforms, uGroundXZ, uGroundHaze,
// uHaze, uTgt and TargetGround's tgtLand / tgtRiverV / tgtRiverW.
uniform sampler2D tFarLines, tFarCover, tFarRelief, tFarOverview, tFarShadow, tFarWeather;
uniform highp sampler3D tFarShape;
uniform vec2 uFarFocus, uFarUV0;
uniform mat2 uFarM, uFarG;
uniform vec4 uFarOV, uFarLow, uFarGap;
uniform float uFarSeason, uFarQuality, uFarMapped, uFarCloudBase, uFarFw, uFarWeatherScale, uFarCityWater;
uniform vec3 uFarShadowBox, uFarOrigin, uFarWind, uFarShapeDrift;
vec3 farSpec;   // water glint and sky reflection: radiance, added by Sky.ts after lighting

// integer hash: stable for large cell indices (sin hashes band at tens of km)
float fh(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p)) + ivec2(1 << 20));
  q = q * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u;
  return float(n >> 8u) * (1.0 / 16777216.0);
}
float fn(vec2 p) {
  vec2 i = floor(p), f = p - i;
  vec2 w = f * f * (3.0 - 2.0 * f);
  return mix(mix(fh(i), fh(i + vec2(1, 0)), w.x), mix(fh(i + vec2(0, 1)), fh(i + vec2(1, 1)), w.x), w.y);
}
// 1 inside |x| < hw, antialiased over the pixel footprint (fades to its coverage when thin)
float farLine(float x, float hw, float fw) {
  float a = 1.0 - smoothstep(hw - fw * 0.5, hw + fw * 0.5, abs(x));
  return mix(a, min(1.0, 2.0 * hw / max(fw, 1e-3)), smoothstep(hw, hw * 4.0, fw * 0.5));
}
float farRemap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }

// Season palettes (linear albedo), one crop per field. 0 summer, 1 autumn, 2 winter, 3 spring.
vec3 farCrop(float h, float s) {
  if (s < 0.5) return h < 0.3 ? vec3(0.21, 0.17, 0.085) : h < 0.42 ? vec3(0.235, 0.205, 0.115) : h < 0.67 ? vec3(0.07, 0.11, 0.038)
    : h < 0.82 ? vec3(0.1, 0.14, 0.055) : h < 0.9 ? vec3(0.15, 0.11, 0.07) : vec3(0.17, 0.16, 0.085);
  if (s < 1.5) return h < 0.3 ? vec3(0.21, 0.18, 0.115) : h < 0.6 ? vec3(0.115, 0.08, 0.055) : h < 0.75 ? vec3(0.17, 0.13, 0.085)
    : h < 0.9 ? vec3(0.09, 0.13, 0.055) : vec3(0.07, 0.1, 0.04);
  if (s < 2.5) return h < 0.55 ? vec3(0.7, 0.72, 0.75) : h < 0.8 ? vec3(0.6, 0.62, 0.65) : h < 0.92 ? vec3(0.5, 0.505, 0.52) : vec3(0.36, 0.35, 0.35);
  return h < 0.35 ? vec3(0.13, 0.095, 0.065) : h < 0.55 ? vec3(0.18, 0.14, 0.095) : h < 0.85 ? vec3(0.085, 0.13, 0.048) : vec3(0.11, 0.15, 0.065);
}
vec3 farCropMean(float s) {
  return s < 0.5 ? vec3(0.14, 0.135, 0.07) : s < 1.5 ? vec3(0.15, 0.125, 0.08) : s < 2.5 ? vec3(0.64, 0.66, 0.69) : vec3(0.125, 0.12, 0.07);
}
vec3 farMeadow(float s) { return s < 0.5 ? vec3(0.085, 0.125, 0.048) : s < 1.5 ? vec3(0.1, 0.12, 0.058) : s < 2.5 ? vec3(0.66, 0.68, 0.71) : vec3(0.095, 0.145, 0.05); }
vec3 farHeath(float s) { return s > 1.5 && s < 2.5 ? vec3(0.5, 0.5, 0.5) : vec3(0.13, 0.125, 0.095); }
vec3 farWood(float conifer, float s) {
  vec3 dec = s < 0.5 ? vec3(0.05, 0.075, 0.038) : s < 1.5 ? vec3(0.085, 0.078, 0.04) : s < 2.5 ? vec3(0.17, 0.165, 0.16) : vec3(0.075, 0.1, 0.045);
  vec3 con = s > 1.5 && s < 2.5 ? vec3(0.07, 0.08, 0.075) : vec3(0.035, 0.05, 0.036);
  return mix(dec, con, conifer);
}
vec3 farRoof(float h, float s) {
  vec3 r = h < 0.45 ? vec3(0.165, 0.1, 0.075) : h < 0.7 ? vec3(0.13, 0.1, 0.085) : h < 0.88 ? vec3(0.12, 0.12, 0.13) : vec3(0.21, 0.18, 0.15);
  return s > 1.5 && s < 2.5 ? mix(r, vec3(0.55, 0.56, 0.6), 0.55) : r;
}

// Low deck's shadow on the ground: the cloud renderer's coverage and shape at mid-deck where
// the sun ray through this ground point crosses it (3 fetches)
float farLowShadow(vec2 xz) {
  if (uFarLow.z <= 0.0) return 1.0;
  float hm = mix(uFarLow.x, uFarLow.y, 0.3);
  vec3 p = vec3(xz.x - uFarOrigin.x, hm, xz.y - uFarOrigin.z) + uSunDir * (hm / max(uSunDir.y, 0.08));
  vec3 q = p + uFarWind;
  vec4 wm = texture2D(tFarWeather, q.xz / uFarWeatherScale);
  vec4 wm2 = texture2D(tFarWeather, q.xz / 90000.0 + vec2(0.61, 0.13));
  float cov = clamp((wm.r * 0.7 + wm2.r * 0.5) * 1.35 - 0.45 + (uFarLow.z - 0.6) * 1.8, 0.0, 1.0);
  if (uFarGap.w > 0.0) cov = clamp(cov - uFarGap.w * (1.0 - smoothstep(uFarGap.z * 0.4, uFarGap.z, length(p.xz - uFarGap.xy))), 0.0, 1.0);
  if (cov < 0.02) return 1.0;
  vec4 n = texture(tFarShape, q / 5600.0 + uFarShapeDrift);
  float fbm = n.g * 0.625 + n.b * 0.25 + n.a * 0.125;
  float base = farRemap(n.r, -(1.0 - fbm), 1.0, 0.0, 1.0);
  float topH = clamp(cov * 1.05, 0.05, 1.0);
  base = farRemap(base * (1.0 - smoothstep(topH * 0.25, topH, 0.3)), 1.0 - cov * 0.85, 1.0, 0.0, 1.0);
  float od = clamp(base, 0.0, 1.0) * uFarLow.w * (uFarLow.y - uFarLow.x) * 0.0009;
  return mix(1.0, max(exp(-od), 0.42), smoothstep(0.0, 0.15, cov));
}

// Water: sun glint (Cox-Munk slope distribution), swell, sky reflection. Writes farSpec.
vec3 farWater(vec3 base, vec2 p, vec2 xz, float rough, float fw, float shadow) {
  vec3 v = normalize(vec3(uGroundXZ.x - xz.x, uCamAlt, uGroundXZ.y - xz.y));
  // swell: two trains along the wind, faded once a wave is a few pixels long
  vec2 w1 = normalize(vec2(0.92, 0.39)), w2 = normalize(vec2(0.55, -0.83));
  float a1 = 0.05 * rough * (1.0 - smoothstep(18.0, 60.0, fw)), a2 = 0.035 * rough * (1.0 - smoothstep(10.0, 34.0, fw));
  vec2 q = vec2(dot(p, w1), dot(p, vec2(-w1.y, w1.x)));   // along / across the wind
  vec2 sl = (vec2(fn(q / vec2(120.0, 260.0)), fn(q / vec2(120.0, 260.0) + 17.0)) - 0.5) * 2.0 * a1
    + (vec2(fn(q / vec2(38.0, 70.0) + 5.0), fn(q / vec2(38.0, 70.0) + 11.0)) - 0.5) * 2.0 * a2;
  sl = vec2(sl.x * w1.x - sl.y * w1.y, sl.x * w1.y + sl.y * w1.x);
  vec3 n = normalize(vec3(-sl.x, 1.0, -sl.y));
  // rougher in gusty patches and wind lanes; the footprint widens the lobe at range
  float patches = mix(0.45, 1.7, fn(vec2(dot(p, w1) / 5200.0, dot(p, vec2(-w1.y, w1.x)) / 1600.0)));
  float s2 = (0.003 + 0.022 * rough) * patches + fw * 0.00004;
  vec3 h = normalize(uSunDir + v);
  float ch = max(dot(h, n), 0.05), c2 = ch * ch;
  float D = exp(-(1.0 - c2) / (c2 * s2)) / (3.14159 * s2 * c2 * c2);
  float nv = max(dot(n, v), 0.02);
  float F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
  float Fs = 0.02 + 0.98 * pow(1.0 - max(dot(h, v), 0.0), 5.0);
  vec3 glint = uSunColor * Fs * D * 0.25 / nv * max(uSunDir.y, 0.0) * shadow;
  vec3 r = reflect(-v, n); r.y = abs(r.y);
  farSpec = glint + skyRadiance(r) * F * mix(0.55, 1.0, shadow);
  return base * (1.0 - F);
}

vec3 terrain(vec2 xz, float dist) {
  farSpec = vec3(0.0);
  tgtLand = 1.0; tgtRiverW = 0.0; tgtRiverV = 0.0; tgtOwnTown = 0.0;
  float season = uFarSeason;
  vec2 rel = xz - uFarFocus;
  float fw = max(uFarFw * dist / max(uCamAlt / dist, 0.06), 0.3);   // footprint (m), stretched at grazing angles
  vec3 water = vec3(0.016, 0.034, 0.042);
  vec3 grass = season < 0.5 ? vec3(0.15, 0.17, 0.115) : season < 1.5 ? vec3(0.19, 0.17, 0.125) : season < 2.5 ? vec3(0.49, 0.52, 0.52) : vec3(0.15, 0.165, 0.11);
  // ---- real map: region (tiles) blended into the overview toward the block's edge
  vec4 Ln = vec4(1.0, 1.0, 0.0, 1.0), Cv = vec4(0.0, 0.16, 0.25, 0.04), Rf = vec4(0.5, 0.5, 0.2, 0.0);
  float seaNear = 0.0;   // open water within a few km (overview): beaches and dunes, not pond rims
  if (uFarMapped > 0.5) {
    vec2 uv = uFarUV0 + uFarM * rel;
    vec2 ed = min(uv, 1.0 - uv);
    float inR = smoothstep(0.0, 0.04, min(ed.x, ed.y));
    vec4 O = texture2D(tFarOverview, uFarOV.xy + uv * uFarOV.zw);
    seaNear = smoothstep(0.985, 0.8, O.r);
    if (inR < 1.0) { Ln = vec4(O.r, 1.0, 0.0, 1.0); Cv = vec4(O.b, O.g, 0.25, 0.04); }
    if (inR > 0.0) {
      vec4 L2 = texture2D(tFarLines, uv);
      if (uFarQuality < 0.5) return mix(water, grass, smoothstep(0.495, 0.505, mix(Ln.r, L2.r, inR)));
      Ln = mix(Ln, L2, inR);
      Cv = mix(Cv, texture2D(tFarCover, uv), inR);
      Rf = mix(Rf, texture2D(tFarRelief, uv), inR);
    }
  } else {
    if (uFarQuality < 0.5) return grass;
    // no map for this operation: generic Central European countryside
    Cv = vec4(smoothstep(0.62, 0.8, fn(rel / 2600.0)) * 0.6, smoothstep(0.45, 0.75, fn(rel / 3400.0 + 9.0)), 0.25, 0.04);
  }
  if (uFarQuality < 0.5) return mix(water, grass, step(0.5, Ln.r));
  float coast = (Ln.r * 2.0 - 1.0) * ${GRID.COAST_RANGE}.0;
  // sub-texel shoreline detail: stable in world space, within ~60 m of the mapped coast
  if (abs(coast) < 250.0) coast += (fn(rel / 230.0) - 0.5) * 70.0 + (fn(rel / 61.0 + 3.0) - 0.5) * 22.0;
  float land = smoothstep(-fw * 0.5, fw * 0.5, coast);
  float urban = Cv.r, forest = Cv.g, meadow = Cv.b, heath = Cv.a;
  // the bombing target: its streets are this town pattern (TargetGround adds the works, docks
  // and rail yard on the real water), grown to the city's footprint
  if (uTgt.w > 0.0 && uFarMapped > 0.5) {
    float dt = length(xz - uTgt.xy) / uTgt.z;
    urban = max(urban, (1.0 - smoothstep(0.45, 1.25, dt + (fn(rel / 900.0) - 0.5) * 0.5)) * 0.92);
    forest *= smoothstep(0.8, 1.4, dt);
    tgtOwnTown = 1.0;
  }
  float lowland = Rf.a;
  bool detail = uFarQuality > 1.5;

  // ---- fields: irregular farm blocks (jittered Voronoi on lightly warped ground), each
  // ploughed in one direction and split into strips; neighbouring strips often share a crop.
  // Beyond the distance where a block is a few pixels, only the regional mean is shaded.
  float bsz = mix(560.0, 780.0, lowland);
  float farFade = smoothstep(bsz * 0.12, bsz * 0.45, fw);
  vec3 alb = mix(mix(farCropMean(season), farMeadow(season), meadow * 0.85), farHeath(season), heath * 0.4);
  vec2 pw = rel, fid = vec2(0.0);
  float h1 = 0.0;
  if (farFade < 0.999) {
    pw += (vec2(fn(rel / 2100.0), fn(rel / 2100.0 + 7.3)) - 0.5) * 700.0;
    // nearest two sites among the 2×2 cells around this point (sites jittered in the cell's middle half)
    vec2 gq = pw / bsz, gi = floor(gq - 0.5);
    vec2 c1 = vec2(0.0), c2 = vec2(0.0), s1 = vec2(0.0), s2 = vec2(0.0);
    float d1 = 1e9, d2 = 1e9;
    for (int y = 0; y <= 1; y++) for (int x = 0; x <= 1; x++) {
      vec2 c = gi + vec2(float(x), float(y));
      vec2 sp = c + 0.25 + 0.5 * vec2(fh(c + 0.5), fh(c + 9.7));
      vec2 dv = sp - gq;
      float dd = dot(dv, dv);
      if (dd < d1) { d2 = d1; c2 = c1; s2 = s1; d1 = dd; c1 = c; s1 = sp; }
      else if (dd < d2) { d2 = dd; c2 = c; s2 = sp; }
    }
    // distance (m) to the block's border: the bisector of the two nearest sites
    float blockEdge = abs(dot(gq - (s1 + s2) * 0.5, normalize(s2 - s1))) * bsz;
    vec2 cell = c1;
    h1 = fh(cell);
    float h2 = fh(cell + 17.3), h3 = fh(cell + 41.9), h4 = fh(cell + 77.1);
    float ang = (h1 - 0.5) * 3.14159;
    vec2 lp = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * ((gq - s1) * bsz);
    float sw = lowland > 0.5 ? mix(34.0, 70.0, h3) : mix(22.0, 75.0, h3 * h3);
    float sl = lowland > 0.5 ? mix(500.0, 1100.0, h4) : mix(180.0, 520.0, h4);
    float sid = floor(lp.x / sw);
    float gsz = 1.0 + floor(fh(cell + 3.3) * 3.99);   // 1-4 strips per field
    float grp = floor((sid + floor(h2 * 5.0)) / gsz);
    float sub = floor((lp.y + fh(vec2(grp, h1 * 97.0)) * sl) / sl);
    fid = cell * 7.0 + vec2(grp, sub * 13.0);
    float fhash = fh(fid);
    float gx0 = grp * gsz - floor(h2 * 5.0);   // the field's first strip
    float stripEdge = min(lp.x - gx0 * sw, (gx0 + gsz) * sw - lp.x);
    // field colours, faded to the block's tone once strips are sub-pixel
    vec3 fieldC = mix(farCrop(fhash, season) * (0.95 + 0.1 * fh(vec2(sid, h3 * 50.0))), farCrop(h4, season), smoothstep(sw * 0.3, sw * 0.8, fw));
    if (fw < 40.0) fieldC *= 0.9 + 0.2 * fn(rel / 130.0 + fhash * 31.0) * (1.0 - smoothstep(10.0, 40.0, fw));
    // land cover per field: meadows and heath by the mapped shares
    float isMeadow = step(fh(fid + 5.0), meadow * 1.1);
    float isHeath = step(fh(fid + 9.0), heath * 1.2) * (1.0 - isMeadow);
    if (isMeadow > 0.5) fieldC = farMeadow(season) * (0.86 + 0.24 * fhash + 0.16 * (fn(rel / 260.0 + 3.0) - 0.5));
    fieldC = mix(fieldC, farHeath(season), isHeath);
    // parcel boundaries: ditches in the polders; block borders: hedges or lanes on some sides
    if (detail) {
      float fieldEdge = fh(vec2(grp, h1 * 97.0) + 0.37) < 0.6 ? stripEdge : 99.0;   // field (not strip) borders
      float ditch = lowland > 0.4 ? farLine(fieldEdge, 1.3, fw) * 0.6 : 0.0;
      float edgeH = fh(c1 + c2 * 3.1);
      float hedge = farLine(blockEdge, 3.5, fw) * step(edgeH, 0.3 + 0.3 * meadow);
      float lane = farLine(blockEdge, 2.5, fw) * step(0.75, edgeH);
      vec3 hedgeC = season > 1.5 && season < 2.5 ? vec3(0.2, 0.19, 0.18) : vec3(0.045, 0.065, 0.035);
      fieldC = mix(fieldC, hedgeC, hedge * 0.8);
      fieldC = mix(fieldC, season > 1.5 && season < 2.5 ? vec3(0.45, 0.45, 0.46) : vec3(0.24, 0.21, 0.16), lane * 0.7);
      if (ditch > 0.001) { fieldC = mix(fieldC, farWater(water, rel, xz, 0.2, fw, 1.0), ditch * land); farSpec *= ditch * land; }
    }
    alb = mix(fieldC, alb, farFade);
  }

  // ---- woods: the mapped share, with organic edges and whole fields of farm woodland
  float wood = step(fh(fid + 11.0), forest * 0.22) * (1.0 - smoothstep(bsz * 0.15, bsz * 0.5, fw)) * step(0.001, fid.x * fid.x + fid.y * fid.y);
  if (forest > 0.02) {
    float wn = forest + (fn(rel / 380.0) - 0.5) * 0.42 + (fn(rel / 95.0 + 5.0) - 0.5) * 0.14;
    float woodE = max(0.05, fw / 250.0);
    wood = max(wood, smoothstep(0.5 - woodE, 0.5 + woodE, wn));
  }
  if (wood > 0.0) {
    float conifer = smoothstep(0.35, 0.65, fn(rel / 1300.0 + 2.0) + (Rf.b - 0.3) * 0.8);
    float crowns = fw < 12.0 ? fn(rel / 14.0) * (1.0 - smoothstep(3.0, 12.0, fw)) : 0.0;
    vec3 woodC = farWood(conifer, season) * (0.8 + 0.4 * crowns + 0.15 * (fn(rel / 160.0) - 0.5));
    alb = mix(alb, woodC, wood);
  }

  // ---- roads: the farm blocks' lanes become roads in places; villages sit where they cross
  vec2 rc = floor(pw / vec2(2300.0, 1900.0));
  vec2 rf = pw - (rc + 0.5) * vec2(2300.0, 1900.0);
  vec2 rj = (vec2(fh(rc + 3.0), fh(rc + 8.0)) - 0.5) * vec2(900.0, 700.0);
  float road = 0.0;
  float vil = 0.0;
  if (fw < 80.0) {
    vec2 q = rf - rj;
    float rx = farLine(q.x + 60.0 * sin(q.y / 400.0 + h1), 4.5, fw) * step(0.35, fh(rc + 21.0));
    float ry = farLine(q.y + 50.0 * sin(q.x / 520.0), 4.0, fw) * step(0.3, fh(rc + 33.0));
    road = max(rx, ry) * (1.0 - wood * 0.7);
    // village: a cluster of farmsteads around the crossing, roads leading in
    float vr = mix(140.0, 320.0, fh(rc + 50.0)) * step(0.38, fh(rc + 61.0));
    vil = (1.0 - smoothstep(vr * 0.6, vr * 1.1, length(q * vec2(1.0, 1.3)))) * 0.62;
  }
  urban = max(urban, vil * (1.0 - wood));

  // ---- towns: blocks of roofs, yards and gardens; dense old centres; AA to the mean
  float townN = urban + (fn(rel / 170.0) - 0.5) * 0.22;
  float town = smoothstep(0.2, 0.34, townN);
  if (town > 0.0) {
    vec2 dc = floor(rel / 1600.0);
    float ta = (fh(dc + 4.4) - 0.5) * 1.6;
    vec2 tp = mat2(cos(ta), sin(ta), -sin(ta), cos(ta)) * (rel - dc * 1600.0);
    // block size per district and density class (a continuously varying size would shear the grid)
    float core = step(0.72, urban);
    vec2 tb = mix(vec2(96.0, 74.0), vec2(56.0, 46.0), core) * (0.85 + 0.3 * fh(dc + 6.1));
    vec2 tc = floor(tp / tb), tf = tp - tc * tb;
    vec2 te = min(tf, tb - tf);
    float street = 1.0 - smoothstep(4.0 - fw * 0.5, 4.0 + fw * 0.5, min(te.x, te.y));
    float th = fh(tc + 91.0);
    float builtB = step(th, townN * 1.5 - 0.15);
    float yard = (1.0 - smoothstep(0.18, 0.24, max(abs(tf.x / tb.x - 0.5), abs(tf.y / tb.y - 0.5)))) * step(0.3, fh(tc + 7.0)) * (1.0 - smoothstep(0.75, 0.95, urban));
    vec3 roofC = farRoof(fh(tc + 13.0 + floor(tf.x / 18.0)), season) * (0.85 + 0.3 * fh(tc + 2.0));
    vec3 garden = farMeadow(season) * 0.8 + vec3(0.0, 0.01, 0.0);
    vec3 blockT = mix(roofC, mix(garden, vec3(0.08, 0.075, 0.07), 0.4), yard);
    blockT = mix(garden, blockT, builtB);
    vec3 streetC = season > 1.5 && season < 2.5 ? vec3(0.32, 0.32, 0.33) : vec3(0.075, 0.072, 0.07);
    vec3 townC = mix(blockT, streetC, street);
    vec3 townMean = mix(mix(farRoof(0.3, season), farRoof(0.8, season), 0.5), streetC, 0.35);
    townC = mix(townC, mix(townMean, garden, (1.0 - urban) * 0.4), smoothstep(tb.y * 0.18, tb.y * 0.6, fw));
    alb = mix(alb, townC, town * (1.0 - wood * 0.8));
  }
  vec3 roadC = season > 1.5 && season < 2.5 ? vec3(0.4, 0.4, 0.41) : vec3(0.22, 0.2, 0.17);
  alb = mix(alb, roadC, road * (1.0 - town * 0.6));

  // ---- rails (mapped): ballast and track, skipping the sign flips of the side field
  float railS = (Ln.a * 2.0 - 1.0) * ${GRID.SIDE_RANGE}.0;
  if (detail && abs(railS) < 60.0) {
    float rail = farLine(railS, 4.0, fw) * step(abs(dFdx(railS)) + abs(dFdy(railS)), fw * 3.0 + 4.0);
    alb = mix(alb, vec3(0.09, 0.085, 0.08), rail * 0.9);
  }

  // ---- relief: sun-facing slopes lit, lee slopes shaded (exaggerated for 7 km of air)
  vec2 slope = (Rf.rg * 2.0 - 1.0) * ${GRID.SLOPE_RANGE};
  vec2 gw = slope * uFarG;   // world gradient (x, z)
  vec3 nrm = normalize(vec3(-gw.x * 2.6, 1.0, -gw.y * 2.6));
  float sunY = max(uSunDir.y, 0.12);
  float shade = clamp(dot(nrm, uSunDir) / sunY, 0.35, 1.7);
  alb *= mix(1.0, shade, 0.85);
  if (season > 1.5 && season < 2.5) alb = mix(alb, alb * vec3(0.93, 0.96, 1.04), 0.6);   // blue snow light

  // ---- rivers (mapped): water with banks; city hooks for TargetGround
  float side = (Ln.g * 2.0 - 1.0) * ${GRID.SIDE_RANGE}.0, hw = Ln.b * 510.0;
  float riverW = 0.0;
  if (hw > 0.5 && coast > 0.0) {
    float spur = step(abs(dFdx(side)) + abs(dFdy(side)), fw * 3.0 + 4.0);
    riverW = farLine(side, hw, fw) * spur;
    float bank = farLine(side, hw + 25.0, fw) * spur;
    alb = mix(alb, farMeadow(season) * 0.85, bank * (1.0 - riverW) * 0.6);
  }
  // shores: sand and dunes on the seaward side, a muddy margin elsewhere
  float sand = (1.0 - smoothstep(10.0 + 180.0 * heath * seaNear, 35.0 + 220.0 * heath * seaNear, coast)) * land * smoothstep(0.3, 0.8, seaNear);
  alb = mix(alb, season > 1.5 && season < 2.5 ? vec3(0.6, 0.6, 0.6) : vec3(0.36, 0.33, 0.26), sand * 0.85 * (1.0 - urban) * seaNear);

  // ---- water: depth tint, tidal flats, glint and reflections
  float shallow = Ln.b * (1.0 - land);
  vec3 wc = mix(water, vec3(0.04, 0.065, 0.06), smoothstep(0.2, 0.8, shallow));
  wc = mix(wc, vec3(0.1, 0.092, 0.078), smoothstep(0.9, 1.0, shallow));     // tidal flats: wet mud
  // the city on its river: TargetGround reads these (docks, works and bridges follow the water)
  if (uTgt.w > 0.0 && uFarMapped > 0.5) {
    if (uFarCityWater > 0.5 && uFarCityWater < 1.5 && hw > 0.5 && abs(side) < 1500.0) { tgtRiverV = side; tgtRiverW = max(hw, 45.0); }
    else if (uFarCityWater > 1.5) tgtRiverW = -1.0;   // harbour shore: the real coast is the water
    tgtLand = land * (1.0 - riverW);
  }

  // cloud shadows: the upper layer's shadow map (High), the low deck from its weather map
  float shadow = 1.0;
  if (detail && uFarShadowBox.z > 1.0) {
    vec2 q = xz - uFarOrigin.xz + uSunDir.xz * (uFarCloudBase / max(uSunDir.y, 0.05));
    vec2 suv = (q - uFarShadowBox.xy) / uFarShadowBox.z + 0.5;
    float edge = 1.0 - smoothstep(0.4, 0.49, max(abs(suv.x - 0.5), abs(suv.y - 0.5)));
    shadow = mix(1.0, 0.45 + 0.55 * texture2D(tFarShadow, suv).r, edge);
  }
  if (detail) shadow *= farLowShadow(xz);
  float wet = max(1.0 - land, riverW);
  if (wet > 0.0) {
    vec3 spec0 = farSpec;
    vec3 wcol = farWater(wc, rel, xz, mix(1.0, 0.25, max(riverW, smoothstep(0.6, 0.95, shallow))), fw, shadow);
    alb = mix(alb, wcol, wet);
    farSpec = mix(spec0, farSpec, wet) * mix(1.0, 0.35, smoothstep(0.9, 1.0, shallow));
  }
  return alb * shadow * 1.35;
}

// Air between the camera and the ground. Low down: the old distance haze (matches Countryside /
// Airbase meshes through uGroundHaze). At altitude: an exponential aerosol layer (1.5 km scale
// height) plus Rayleigh, integrated along the slant path, so the ground straight below stays
// clear and blue-veiled while the horizon dissolves into the sky's own colour.
vec3 farAerial(vec3 g, vec3 skyCol, float t, vec3 d) {
  float hazeOld = 1.0 - exp(-t / max(uGroundHaze * uHaze, 1.0));
  vec3 oldC = mix(g + uHorizon * 0.22, skyCol, hazeOld);
  float mu = max(-d.y, 0.015);
  float L = max(uGroundHaze * uHaze, 1.0) * 0.55;
  float aer = 1500.0 * (1.0 - exp(-uCamAlt / 1500.0)) / (mu * L);
  vec3 ray = vec3(5.8e-6, 13.5e-6, 33.1e-6) * 8000.0 * (1.0 - exp(-uCamAlt / 8000.0)) / mu;
  vec3 T = exp(-(aer + ray));
  float cs = max(dot(d, uSunDir), 0.0);
  // short paths look down through dim, mostly back-scattering air; long ones end in the sky's colour
  vec3 airC = uHorizon * 0.3 + uSunColor * (0.006 + 0.025 * pow(cs, 24.0));
  vec3 newC = g * T + mix(airC, skyCol, smoothstep(0.25, 0.95, 1.0 - T.g)) * (1.0 - T);
  return mix(oldC, newC, smoothstep(1500.0, 4000.0, uCamAlt));
}
`;

import * as THREE from 'three';
import { groundWarUniforms, GROUND_WAR_GLSL } from './GroundWar';

// The bombing target as seen from 7 km: an industrial river city drawn procedurally into the
// sky dome's ground (Sky.ts), plus the bomb run's aftermath — impact flashes, shock rings,
// burn scars, fires, a drifting ground pall, leaning smoke columns — and the flak batteries'
// muzzle flashes. Everything is analytic per pixel from a handful of uniforms, so the clouds
// (composited over the sky) hide it naturally and show it through the gap over the target.
// Driven by src/world/TargetArea.ts.

export const TGT_IMPACTS = 40;
export const TGT_PLUMES = 8;

export const targetUniforms = {
  ...groundWarUniforms,
  uTgt: { value: new THREE.Vector4() },        // absolute ground x, z of the aim point, city radius (m), on (0/1)
  uTgtLook: { value: 0 },                     // authored target layout, 0 retains the original city
  uTgtRot: { value: new THREE.Vector2(1, 0) }, // cos, sin of the river / street grid axis
  uTgtClock: { value: -1000 },                 // s since bombs away (negative before)
  uTgtWind: { value: new THREE.Vector2() },    // ground wind (m/s): smoke drift
  uFlakGround: { value: 0 },                   // 0..1 flak batteries firing
  uImpacts: { value: Array.from({ length: TGT_IMPACTS }, () => new THREE.Vector4()) }, // rel x, z, impact clock, radius (0 = unused)
  uPlumes: { value: Array.from({ length: TGT_PLUMES }, () => new THREE.Vector4()) },   // rel x, z, start clock, strength (0 = unused)
  uPlumeShape: { value: Array.from({ length: TGT_PLUMES }, () => new THREE.Vector4()) }, // top, base width, density, age
  uImpBound: { value: new THREE.Vector3() },   // circle around all impacts' marks (x, z, radius): pixel cull
};

/** Uniform-only plume growth: compute once per frame instead of at every sky pixel. */
export function syncTargetPlumes() {
  const u = targetUniforms;
  for (let i = 0; i < TGT_PLUMES; i++) {
    const p = u.uPlumes.value[i], age = Math.max(0, u.uTgtClock.value - p.z);
    const ramp = Math.min(1, age / 3);
    u.uPlumeShape.value[i].set(7400 * (1 - Math.exp(-age / 45)) + 80,
      70 + Math.min(age, 300) * 0.35,
      p.w * (0.45 + 0.55 * Math.exp(-age / 600)) * ramp * ramp * (3 - 2 * ramp), age);
  }
}

// Needs h2(), vnoise(), fbm() and the atmosphere uniforms from the sky shader.
export const TARGET_GLSL = /* glsl */ `
#define TGT_IMPACTS ${TGT_IMPACTS}
#define TGT_PLUMES ${TGT_PLUMES}
uniform vec4 uTgt;
uniform vec2 uTgtRot;
uniform float uTgtLook;
uniform float uTgtClock;
uniform vec2 uTgtWind;
uniform float uFlakGround;
uniform vec4 uImpacts[TGT_IMPACTS];
uniform vec4 uPlumes[TGT_PLUMES];
uniform vec4 uPlumeShape[TGT_PLUMES];
uniform vec3 uImpBound;   // circle holding every impact's marks and pall: x, z, radius
// Set by the real-map ground (FarTerrain.ts terrain()) for this pixel: land share, and the
// city's water as a signed side distance (m) with its half-width (0 = no mapped water: the
// procedural river below)
float tgtLand = 1.0, tgtRiverV = 0.0, tgtRiverW = 0.0;   // tgtRiverW < 0: a harbour shore (no river band)
float tgtDry = 1.0;
float tgtOwnTown = 0.0;   // 1: the map draws the city's streets itself (no block grid here)

// 1 inside [a, b], antialiased over w metres
float tBand(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) - smoothstep(b - w, b + w, x); }
// street mask of a block grid (1 = street), fading to its mean coverage once a street is sub-pixel
float tStreets(vec2 p, vec2 size, float hw, float fw, out vec2 cell, out vec2 f) {
  cell = floor(p / size);
  f = p - cell * size;
  vec2 e = min(f, size - f);
  float s = 1.0 - smoothstep(hw - fw * 0.5, hw + fw * 0.5, min(e.x, e.y));
  float mean = 1.0 - (1.0 - 2.0 * hw / size.x) * (1.0 - 2.0 * hw / size.y);
  return mix(s, mean, smoothstep(hw, hw * 5.0, fw));
}
float tRiver(float u) { return 340.0 * sin(u / 1700.0 + 0.6) + 110.0 * sin(u / 640.0 + 2.0); }

${GROUND_WAR_GLSL}

// City albedo over the base terrain. u runs along the river, v across it.
vec3 tCity(vec2 rel, vec3 base, float fw) {
  float R = uTgt.z;
  vec2 uv = vec2(dot(rel, uTgtRot), dot(rel, vec2(-uTgtRot.y, uTgtRot.x)));
  float u = uv.x, v = uv.y;
  float vr = tgtRiverW > 0.0 ? tgtRiverV : v - tRiver(u);
  // works, rail yard and docks: straight bands beside mapped water (the city axis follows it)
  float vb = tgtRiverW != 0.0 ? v : vr;
  float rn = length(uv * vec2(0.83, 1.18)) / R + (vnoise(rel / 700.0) * 0.65 + vnoise(rel / 260.0) * 0.35 - 0.5) * 0.45;
  rn = min(rn, length((uv - vec2(1450.0, 800.0)) * vec2(1.2, 1.8)) / R + 0.38);
  float city = 1.0 - smoothstep(0.7, 1.05, rn);
  float suburb = 1.0 - smoothstep(1.0, 1.45, rn);
  vec3 c = base;
  vec2 cell, f;
  // residential blocks: tiled roofs around dark courtyards, sparser toward the edge
  float st = tStreets(uv + vec2(0.0, 37.0), vec2(118.0, 92.0), 7.0, fw, cell, f);
  float hb = h2(cell);
  vec3 roof = (hb < 0.45 ? vec3(0.165, 0.15, 0.13) : hb < 0.75 ? vec3(0.15, 0.15, 0.16) : vec3(0.225, 0.22, 0.205)) * (0.85 + 0.3 * h2(cell + 2.1));
  vec2 cq = abs(f / vec2(118.0, 92.0) - 0.5);
  float ys = 0.08 + 0.2 * h2(cell + 9.4);
  float yard = (1.0 - smoothstep(ys, ys + 0.04, max(cq.x, cq.y))) * (1.0 - smoothstep(10.0, 40.0, fw)) * step(0.25, h2(cell + 4.4));
  vec3 blockC = mix(roof, vec3(0.08, 0.085, 0.065), yard * 0.6 + smoothstep(25.0, 60.0, fw) * 0.08);
  vec3 res = mix(blockC, vec3(0.07, 0.07, 0.072), st);
  float built = city + suburb * step(h2(cell + 5.3), 0.55) * 0.7;
  c = mix(c, res, clamp(built, 0.0, 1.0) * tgtLand * (1.0 - tgtOwnTown));
  // main roads and the two bridges
  float roads = max(tBand(v, 1250.0, 1272.0, fw), tBand(u, 820.0, 842.0, fw)) * suburb;
  // chemical works between the river and the rail yard: big sheds, tank farms, yards
  float works = tBand(vb, -780.0, -110.0, fw) * tBand(u, -1800.0, 1700.0, fw) * tgtLand;
  if (works > 0.0) {
    float ws = tStreets(uv + vec2(400.0, 0.0), vec2(260.0, 170.0), 9.0, fw, cell, f);
    float hw = h2(cell + 11.0);
    vec3 shed = hw < 0.3 ? vec3(0.15, 0.145, 0.14) : hw < 0.5 ? vec3(0.115, 0.115, 0.12) : vec3(0.135, 0.125, 0.115);
    // each lot: a shed (or two) set back on a dark yard
    vec2 m0 = vec2(14.0, 10.0) + 40.0 * vec2(h2(cell + 3.1), h2(cell + 5.9)), m1 = vec2(260.0, 170.0) - vec2(14.0, 10.0) - 40.0 * vec2(h2(cell + 8.2), h2(cell + 1.7));
    float inLot = tBand(f.x, m0.x, m1.x, fw) * tBand(f.y, m0.y, m1.y, fw);
    shed = mix(vec3(0.09, 0.088, 0.082), shed, mix(inLot, 0.7, smoothstep(20.0, 60.0, fw)));
    // sawtooth roofs read as faint stripes
    shed *= mix(1.0, 0.82 + 0.18 * step(0.5, fract(f.x / 18.0)), 1.0 - smoothstep(6.0, 18.0, fw));
    if (hw > 0.7 && hw < 0.8) {
      // tank farm: rows of round storage tanks on dark ground
      vec2 tq = mod(f, 42.0) - 21.0;
      float tank = 1.0 - smoothstep(13.0 - fw * 0.5, 13.0 + fw * 0.5, length(tq));
      shed = mix(vec3(0.08, 0.08, 0.075), vec3(0.2, 0.2, 0.19), mix(tank, 0.3, smoothstep(10.0, 30.0, fw)));
    } else if (hw >= 0.84) shed = vec3(0.065, 0.06, 0.05); // coal and slag yards
    c = mix(c, mix(shed, vec3(0.095), ws), works);
  }
  // rail yard: ballast streaked with tracks and rows of wagons
  float yardM = tBand(vb, -1080.0, -800.0, fw) * tBand(u, -2500.0, 1900.0, fw) * tgtLand;
  if (yardM > 0.0) {
    float tracks = 0.5 + 0.5 * sin(vb * 0.7);
    float wagons = step(0.35, fract(u / 15.0)) * step(0.5, h2(vec2(floor(vb / 9.0), floor(u / 160.0))));
    vec3 rc = mix(vec3(0.13, 0.12, 0.105), vec3(0.05, 0.045, 0.04), mix(tracks * 0.5 + wagons * 0.5, 0.42, smoothstep(3.0, 14.0, fw)));
    c = mix(c, rc, yardM);
  }
  c = mix(c, vec3(0.085), roads * tgtLand);
  // docks: quays and warehouse rows between basins cut into the north bank
  float docks = tBand(vb, 110.0, 560.0, fw) * tBand(u, -1500.0, 400.0, fw) * (tgtRiverW != 0.0 ? tgtLand : 1.0);
  float water = 0.0;
  if (docks > 0.0) {
    float g = mod(u + 1500.0, 330.0);
    float basin = tBand(g, 110.0, 220.0, fw) * (1.0 - smoothstep(510.0 - fw, 510.0 + fw, vb));
    float shed = tBand(g, 22.0, 88.0, fw) * tBand(vb, 160.0, 480.0, fw);
    vec3 q = mix(vec3(0.145, 0.14, 0.13), vec3(0.12, 0.1, 0.085), shed);
    c = mix(c, q, docks);
    water = basin * docks;
  }
  // the river, wide and dark, fading out well beyond the city
  float rw = tgtRiverW > 0.0 ? tgtRiverW : tgtRiverW < 0.0 ? 0.0 : 110.0 * (1.0 - smoothstep(1.5, 2.1, length(rel) / R));
  water = max(water, 1.0 - smoothstep(rw - fw * 0.5, rw + fw * 0.5, abs(vr)));
  vec3 wc = vec3(0.03, 0.055, 0.07);
  // bridges stay dry
  float bridge = max(tBand(u, -712.0, -690.0, fw), tBand(u, 820.0, 842.0, fw)) * step(abs(vr), rw + 20.0);
  c = mix(c, wc, water * (1.0 - bridge));
  // Authored chapter silhouettes, using the existing compiled sky material on every preset.
  // Airport / assembly works, bearing halls, Leipzig airfield, Berlin rail grid, Leuna tanks.
  if (uTgtLook > 0.5) {
    float dry = smoothstep(130.0 - fw, 150.0 + fw, abs(vr));
    float zone = tBand(u, -1700.0, 1700.0, fw) * tBand(vr, -1500.0, -150.0, fw);
    if (uTgtLook < 1.5 || (uTgtLook > 2.5 && uTgtLook < 3.5)) {
      float runway = tBand(v, -1250.0, -1120.0, fw) * tBand(u, -1800.0, 1800.0, fw);
      float cross = uTgtLook > 2.5 ? tBand(u + v * 0.6, -100.0, 30.0, fw) * tBand(v, -1400.0, -350.0, fw) : 0.0;
      c = mix(c, vec3(0.075, 0.08, 0.065), max(runway, cross) * dry * tgtLand);
      float halls = tBand(v, -900.0, -300.0, fw) * tBand(u, -1300.0, 1300.0, fw);
      float rows = tBand(mod(u + 1400.0, 370.0), 30.0, 310.0, fw);
      c = mix(c, mix(vec3(0.09), vec3(0.3, 0.29, 0.25), rows), halls * dry);
    } else if (uTgtLook < 2.5) {
      float halls = tBand(v, -1200.0, 500.0, fw) * tBand(u, -1400.0, 1400.0, fw);
      float roof = tBand(mod(v + 1500.0, 360.0), 30.0, 270.0, fw);
      c = mix(c, mix(vec3(0.07), vec3(0.28, 0.2, 0.14), roof), halls * dry);
    } else if (uTgtLook < 4.5) {
      float rails = tBand(v, -1100.0, 0.0, fw) * tBand(u, -2200.0, 2000.0, fw);
      float tracks = 0.5 + 0.5 * sin(v / 18.0);
      c = mix(c, mix(vec3(0.065), vec3(0.21, 0.2, 0.18), tracks), rails * dry);
    } else {
      vec2 tankQ = mod(uv + 1800.0, 180.0) - 90.0;
      float tanks = 1.0 - smoothstep(55.0 - fw, 55.0 + fw, length(tankQ));
      c = mix(c, mix(vec3(0.065, 0.06, 0.05), vec3(0.4, 0.4, 0.36), tanks), zone * dry);
    }
  }
  tgtDry = tgtLand * (1.0 - water * (1.0 - bridge));
  // Four-gun revetments identify the flashing batteries between salvos.
  float rr = length(rel);
  if (rr > R * 0.45 && rr < R * 2.1) {
    vec2 bc = floor(rel / 520.0);
    if (h2(bc + 3.7) < 0.16) {
      vec2 site = (bc + 0.3 + 0.4 * vec2(h2(bc + 1.3), h2(bc + 7.1))) * 520.0;
      vec2 q = abs(rel - site) - 50.0;
      float pit = length(q);
      float siteDetail = 1.0 - smoothstep(16.0, 28.0, fw);
      float earth = tBand(pit, 20.0, 37.0, fw * 0.65);
      float gun = 1.0 - smoothstep(10.0, 18.0 + fw, pit);
      c = mix(c, vec3(0.32, 0.23, 0.12), earth * tgtDry * siteDetail);
      c = mix(c, vec3(0.035), gun * tgtDry * siteDetail * 0.9);
    }
  }
  return groundWarTraffic(uv, c, fw, tgtLand * (1.0 - water));
}

// The bombs' work: returns lit ground colour with flashes, fires, scars and pall.
vec3 targetGround(vec2 rel, vec3 alb, float fw, vec3 light, vec2 camRel, vec3 d) {
  float R = uTgt.z;
  float r2 = dot(rel, rel);
  vec3 emis = vec3(0.0);
  float pall = 0.0;
  if (r2 < R * R * 4.6) {
    alb = tCity(rel, alb / 1.35, fw) * 1.35;
    vec2 bq = rel - uImpBound.xy;
    if (uTgtClock > 0.0 && tgtDry > 0.5 && dot(bq, bq) < uImpBound.z * uImpBound.z) {
      float burn = 0.0, ring = 0.0, fireGlow = 0.0;
      for (int i = 0; i < TGT_IMPACTS; i++) {
        vec4 I = uImpacts[i];
        if (I.w <= 0.0) continue;
        float age = uTgtClock - I.z;
        if (age < 0.0) continue;
        vec2 dv = rel - I.xy;
        float s = I.w;
        // ground pall: dust and smoke spreading downwind
        vec2 dp = dv - uTgtWind * min(age, 120.0) * 0.7;
        float pr = s * 1.3 + 22.0 * sqrt(age);
        float pq = dot(dp, dp) / (pr * pr);
        if (pq < 9.0) pall = max(pall, exp(-pq) * 0.85 * exp(-age / 300.0) * smoothstep(0.0, 2.0, age));
        float dist = length(dv);
        if (dist > s * 6.0) continue;
        float hs = h2(I.xy * 0.0137 + I.z);
        if (age < 5.0) {
        // flash: a blinding disc for a fraction of a second, kept at least ~2 px wide
        float rf = max(s * (0.7 + 2.5 * min(age, 0.25)), fw * 2.0);
        float k = clamp(s * s / (rf * rf), 0.2, 1.0);
        emis += vec3(1.0, 0.78, 0.5) * 70.0 * exp(-age * 9.0) * k * (1.0 - smoothstep(0.0, rf, dist));
        // fireball rolling up and cooling over a few seconds
        float rb = max(s * (0.6 + 0.5 * min(age, 1.5)), fw * 1.5);
        emis += vec3(1.0, 0.42, 0.12) * 9.0 * exp(-age * 1.1) * clamp(s * s / (rb * rb), 0.25, 1.0) * (1.0 - smoothstep(rb * 0.3, rb, dist));
        // shock / dust ring racing outward
        float rr = s * 4.5 * (1.0 - exp(-age * 2.2));
        float rw = max(18.0, fw * 1.2);
        float rx = (dist - rr) / rw;
        ring = max(ring, exp(-age * 1.3) * exp(-rx * rx));
        }
        // burn scar
        float sR = s * (0.95 + 0.15 * sin(dv.x * 0.031 + hs * 6.0) + 0.15 * sin(dv.y * 0.027 - hs * 9.0));
        float inside = 1.0 - smoothstep(0.55, 1.0, dist / sR);
        burn = max(burn, inside * min(1.0, age * 1.5));
        // fires keep burning in the rubble; some die down within a minute, some burn for ages
        float life = mix(45.0, 900.0, hs * hs);
        float amt = exp(-age / life) * smoothstep(0.4, 2.5, age);
        if (inside > 0.0) {
          float n = vnoise(dv / 20.0 + hs * 50.0);
          float flick = vnoise(dv / 12.0 + vec2(uTgtClock * 1.7, -uTgtClock * 1.3));
          float fire = mix(smoothstep(0.5, 0.78, n), 0.3, smoothstep(6.0, 30.0, fw)) * inside;
          emis += vec3(1.0, 0.36, 0.07) * 3.2 * fire * amt * (0.6 + 0.8 * flick);
        }
        // firelight halo on the smoke over the blaze (keeps far fires visible as glow)
        fireGlow += amt * exp(-dist * dist / (s * s * 4.0));
      }
      alb = mix(alb, vec3(0.022, 0.02, 0.018), burn * 0.9);
      alb = mix(alb, vec3(0.2, 0.19, 0.17), ring * 0.7);
      emis += vec3(1.0, 0.4, 0.1) * 0.1 * min(fireGlow, 2.0);
    }
    // Fires left by the preceding wave anchor the two persistent smoke columns to the works.
    for (int k = TGT_PLUMES - 2; k < TGT_PLUMES; k++) {
      vec4 P = uPlumes[k];
      if (P.w <= 0.0 || P.z > -100.0 || uTgtClock < P.z) continue;
      vec2 q = rel - P.xy;
      float scar = exp(-dot(q, q) / 65000.0);
      alb = mix(alb, vec3(0.027, 0.024, 0.02), scar * 0.9 * tgtDry);
      float fire = exp(-dot(q, q) / 13000.0) * (0.55 + 0.45 * vnoise(q / 35.0 + uTgtClock * 0.3));
      emis += vec3(1.0, 0.30, 0.035) * fire * 2.8 * tgtDry;
    }
    // Pathfinder target indicators, laid before our arrival; hidden by the real cloud deck.
    if (uTgtClock < 3.0 && uTgtClock > -40.0) {
      float marker = 1.0 - smoothstep(35.0, max(80.0, fw * 2.0), length(rel));
      emis += vec3(1.0, 0.18, 0.035) * marker * 18.0 * tgtDry;
    }
    // flak batteries: four-gun sites ringed around the city, muzzle flashes during the barrage
    if (uFlakGround > 0.0 && tgtDry > 0.5) {
      float rr = sqrt(r2);
      if (rr > R * 0.45 && rr < R * 2.1) {
        vec2 cell = floor(rel / 520.0);
        float h = h2(cell + 3.7);
        if (h < 0.16) {
          vec2 gp = (cell + 0.3 + 0.4 * vec2(h2(cell + 1.3), h2(cell + 7.1))) * 520.0;
          for (int i = 0; i < 4; i++) {
            vec2 o = gp + (vec2(mod(float(i), 2.0), floor(float(i) / 2.0)) - 0.5) * 100.0;
            float rate = 0.24 + 0.12 * h2(cell + float(i));
            float since = fract(uTgtClock * rate + h2(cell + float(i) * 2.3)) / rate;
            float rf = max(28.0, fw * 2.0);
            float kf = clamp(784.0 / (rf * rf), 0.3, 1.0);
            emis += vec3(1.0, 0.72, 0.38) * 70.0 * uFlakGround * exp(-since * 10.0) * kf * (1.0 - smoothstep(0.0, rf, length(rel - o)));
          }
        }
      }
    }
  }
  vec3 g = alb * light;
  vec3 pallC = vec3(0.07, 0.064, 0.058) * light;
  g = mix(g, pallC, pall) + emis * (1.0 - pall * 0.55);
  g = groundWarAircraft(rel, camRel, g, fw, light);
  // rising smoke columns, leaning downwind: each column is a stack of vertically stretched
  // gaussian puffs whose line integral along the view ray is analytic. Only for rays whose
  // stretch below 7.5 km passes within reach of the city.
  float dy = max(-d.y, 1e-3);
  vec2 ra = camRel + d.xz * ((uCamAlt - 7500.0) / dy), rb = rel;
  vec2 ab = rb - ra;
  vec2 cl = ra + ab * clamp(-dot(ra, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
  if (dot(cl, cl) < (R * 1.6 + 2500.0) * (R * 1.6 + 2500.0)) {
    float tau = 0.0, glow = 0.0;
    vec3 sc = vec3(0.0);
    vec3 O = vec3(camRel.x, uCamAlt, camRel.y);
    for (int k = 0; k < TGT_PLUMES; k++) {
      vec4 P = uPlumes[k];
      if (P.w <= 0.0) continue;
      vec4 shape = uPlumeShape[k];
      float age = shape.w;
      if (age <= 0.0) continue;
      float top = shape.x;
      // skip columns the ray's lower stretch never comes near
      vec2 pa = camRel + d.xz * ((uCamAlt - top) / dy) - P.xy;
      vec2 pab = rel - P.xy - pa;
      vec2 pcl = pa + pab * clamp(-dot(pa, pab) / max(dot(pab, pab), 1e-3), 0.0, 1.0);
      float reach = 3.0 * (shape.y + top * 0.085) + length(uTgtWind) * min(top / 16.0, age);
      if (dot(pcl, pcl) > reach * reach) continue;
      float fade = shape.z;
      for (int j = 0; j < 4; j++) {
        float fj = (float(j) + 0.5) / 4.0;
        float yb = top * fj;
        float w = shape.y + yb * 0.085;
        float hgt = max(top * 0.2, w);                   // vertical half-size: puffs overlap into a column
        vec2 cxz = P.xy + uTgtWind * min(yb / 16.0, age);
        // squash y so the puff is a sphere of radius w, integrate, undo the stretch
        float kq = w / hgt;
        vec3 dd = vec3(d.x, d.y * kq, d.z);
        float L = length(dd);
        dd /= L;
        vec3 oc = vec3(O.x - cxz.x, (O.y - yb) * kq, O.z - cxz.y);
        float tc = -dot(oc, dd);
        vec3 pc = oc + dd * tc;
        if (dot(pc, pc) > w * w * 6.25) continue;
        float dens = fade * (1.0 - fj * 0.55) / (1.0 + yb / 1500.0);
        // Break the analytic column into rolling lobes, stable in world space.
        float billow = 0.55 + 0.65 * vnoise((pc.xz + vec2(yb * 0.3, uTgtClock * -8.0)) / max(90.0, w * 0.6));
        float tk = billow * dens * 0.009 * 1.772 * w / L * exp(-dot(pc, pc) / (w * w));
        tau += tk;
        sc += mix(vec3(0.02, 0.018, 0.017), vec3(0.12, 0.115, 0.11), fj * fj) * tk;
        glow += (1.0 - fj) * (1.0 - fj) * tk;
      }
    }
    if (tau > 0.001) {
      vec3 sm = sc / tau * light + vec3(1.0, 0.25, 0.035) * 0.06 * glow / tau;
      g = mix(g, sm, 1.0 - exp(-tau));
    }
  }
  return g;
}
`;

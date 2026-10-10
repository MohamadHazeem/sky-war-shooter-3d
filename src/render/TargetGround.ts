import * as THREE from 'three';

// The bombing target as seen from 7 km: an industrial river city drawn procedurally into the
// sky dome's ground (Sky.ts), plus the bomb run's aftermath — impact flashes, shock rings,
// burn scars, fires, a drifting ground pall, leaning smoke columns — and the flak batteries'
// muzzle flashes. Everything is analytic per pixel from a handful of uniforms, so the clouds
// (composited over the sky) hide it naturally and show it through the gap over the target.
// Driven by src/world/TargetArea.ts.

export const TGT_IMPACTS = 40;
export const TGT_PLUMES = 8;

export const targetUniforms = {
  uTgt: { value: new THREE.Vector4() },        // absolute ground x, z of the aim point, city radius (m), on (0/1)
  uTgtRot: { value: new THREE.Vector2(1, 0) }, // cos, sin of the river / street grid axis
  uTgtClock: { value: -1000 },                 // s since bombs away (negative before)
  uTgtWind: { value: new THREE.Vector2() },    // ground wind (m/s): smoke drift
  uFlakGround: { value: 0 },                   // 0..1 flak batteries firing
  uImpacts: { value: Array.from({ length: TGT_IMPACTS }, () => new THREE.Vector4()) }, // rel x, z, impact clock, radius (0 = unused)
  uPlumes: { value: Array.from({ length: TGT_PLUMES }, () => new THREE.Vector4()) },   // rel x, z, start clock, strength (0 = unused)
  uImpBound: { value: new THREE.Vector3() },   // circle around all impacts' marks (x, z, radius): pixel cull
};

// Needs h2(), vnoise(), fbm() and the atmosphere uniforms from the sky shader.
export const TARGET_GLSL = /* glsl */ `
#define TGT_IMPACTS ${TGT_IMPACTS}
#define TGT_PLUMES ${TGT_PLUMES}
uniform vec4 uTgt;
uniform vec2 uTgtRot;
uniform float uTgtClock;
uniform vec2 uTgtWind;
uniform float uFlakGround;
uniform vec4 uImpacts[TGT_IMPACTS];
uniform vec4 uPlumes[TGT_PLUMES];
uniform vec3 uImpBound;   // circle holding every impact's marks and pall: x, z, radius

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

// City albedo over the base terrain. u runs along the river, v across it.
vec3 tCity(vec2 rel, vec3 base, float fw) {
  float R = uTgt.z;
  vec2 uv = vec2(dot(rel, uTgtRot), dot(rel, vec2(-uTgtRot.y, uTgtRot.x)));
  float u = uv.x, v = uv.y;
  float vr = v - tRiver(u);
  float rn = length(rel) / R + (vnoise(rel / 700.0) * 0.65 + vnoise(rel / 260.0) * 0.35 - 0.5) * 0.45;
  float city = 1.0 - smoothstep(0.7, 1.05, rn);
  float suburb = 1.0 - smoothstep(1.0, 1.45, rn);
  vec3 c = base;
  vec2 cell, f;
  // residential blocks: tiled roofs around dark courtyards, sparser toward the edge
  float st = tStreets(uv + vec2(0.0, 37.0), vec2(118.0, 92.0), 7.0, fw, cell, f);
  float hb = h2(cell);
  vec3 roof = (hb < 0.45 ? vec3(0.24, 0.12, 0.085) : hb < 0.75 ? vec3(0.15, 0.15, 0.16) : vec3(0.26, 0.245, 0.22)) * (0.85 + 0.3 * h2(cell + 2.1));
  vec2 cq = abs(f / vec2(118.0, 92.0) - 0.5);
  float ys = 0.08 + 0.2 * h2(cell + 9.4);
  float yard = (1.0 - smoothstep(ys, ys + 0.04, max(cq.x, cq.y))) * (1.0 - smoothstep(10.0, 40.0, fw)) * step(0.25, h2(cell + 4.4));
  vec3 blockC = mix(roof, vec3(0.08, 0.085, 0.065), yard * 0.6 + smoothstep(25.0, 60.0, fw) * 0.08);
  vec3 res = mix(blockC, vec3(0.07, 0.07, 0.072), st);
  float built = city + suburb * step(h2(cell + 5.3), 0.55) * 0.7;
  c = mix(c, res, clamp(built, 0.0, 1.0));
  // main roads and the two bridges
  float roads = max(tBand(v, 1250.0, 1272.0, fw), tBand(u, 820.0, 842.0, fw)) * suburb;
  // chemical works between the river and the rail yard: big sheds, tank farms, yards
  float works = tBand(vr, -780.0, -110.0, fw) * tBand(u, -1800.0, 1700.0, fw);
  if (works > 0.0) {
    float ws = tStreets(uv + vec2(400.0, 0.0), vec2(260.0, 170.0), 9.0, fw, cell, f);
    float hw = h2(cell + 11.0);
    vec3 shed = hw < 0.3 ? vec3(0.22, 0.22, 0.21) : hw < 0.5 ? vec3(0.08, 0.085, 0.09) : vec3(0.16, 0.115, 0.085);
    // sawtooth roofs read as faint stripes
    shed *= mix(1.0, 0.82 + 0.18 * step(0.5, fract(f.x / 18.0)), 1.0 - smoothstep(6.0, 18.0, fw));
    if (hw > 0.62 && hw < 0.84) {
      // tank farm: rows of round storage tanks on dark ground
      vec2 tq = mod(f, 42.0) - 21.0;
      float tank = 1.0 - smoothstep(13.0 - fw * 0.5, 13.0 + fw * 0.5, length(tq));
      shed = mix(vec3(0.07, 0.07, 0.065), vec3(0.27, 0.27, 0.26), mix(tank, 0.3, smoothstep(10.0, 30.0, fw)));
    } else if (hw >= 0.84) shed = vec3(0.065, 0.06, 0.05); // coal and slag yards
    c = mix(c, mix(shed, vec3(0.095), ws), works);
  }
  // rail yard: ballast streaked with tracks and rows of wagons
  float yardM = tBand(vr, -1080.0, -800.0, fw) * tBand(u, -2500.0, 1900.0, fw);
  if (yardM > 0.0) {
    float tracks = 0.5 + 0.5 * sin(vr * 0.7);
    float wagons = step(0.35, fract(u / 15.0)) * step(0.5, h2(vec2(floor(vr / 9.0), floor(u / 160.0))));
    vec3 rc = mix(vec3(0.13, 0.12, 0.105), vec3(0.05, 0.045, 0.04), mix(tracks * 0.5 + wagons * 0.5, 0.42, smoothstep(3.0, 14.0, fw)));
    c = mix(c, rc, yardM);
  }
  c = mix(c, vec3(0.085), roads);
  // docks: quays and warehouse rows between basins cut into the north bank
  float docks = tBand(vr, 110.0, 560.0, fw) * tBand(u, -1500.0, 400.0, fw);
  float water = 0.0;
  if (docks > 0.0) {
    float g = mod(u + 1500.0, 330.0);
    float basin = tBand(g, 110.0, 220.0, fw) * (1.0 - smoothstep(510.0 - fw, 510.0 + fw, vr));
    float shed = tBand(g, 22.0, 88.0, fw) * tBand(vr, 160.0, 480.0, fw);
    vec3 q = mix(vec3(0.2, 0.19, 0.18), vec3(0.13, 0.11, 0.09), shed);
    c = mix(c, q, docks);
    water = basin * docks;
  }
  // the river, wide and dark, fading out well beyond the city
  float rw = 110.0 * (1.0 - smoothstep(1.5, 2.1, length(rel) / R));
  water = max(water, 1.0 - smoothstep(rw - fw * 0.5, rw + fw * 0.5, abs(vr)));
  vec3 wc = vec3(0.03, 0.055, 0.07);
  // bridges stay dry
  float bridge = max(tBand(u, -712.0, -690.0, fw), tBand(u, 820.0, 842.0, fw)) * step(abs(vr), rw + 20.0);
  c = mix(c, wc, water * (1.0 - bridge));
  return c;
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
    if (uTgtClock > 0.0 && dot(bq, bq) < uImpBound.z * uImpBound.z) {
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
    // flak batteries: four-gun sites ringed around the city, muzzle flashes during the barrage
    if (uFlakGround > 0.0) {
      float rr = sqrt(r2);
      if (rr > R * 0.45 && rr < R * 2.1) {
        vec2 cell = floor(rel / 520.0);
        float h = h2(cell + 3.7);
        if (h < 0.45) {
          vec2 gp = (cell + 0.3 + 0.4 * vec2(h2(cell + 1.3), h2(cell + 7.1))) * 520.0;
          for (int i = 0; i < 4; i++) {
            vec2 o = gp + (vec2(mod(float(i), 2.0), floor(float(i) / 2.0)) - 0.5) * 45.0;
            float rate = 0.24 + 0.12 * h2(cell + float(i));
            float since = fract(uTgtClock * rate + h2(cell + float(i) * 2.3)) / rate;
            float rf = max(9.0, fw * 1.3);
            float kf = clamp(81.0 / (rf * rf), 0.12, 1.0);
            emis += vec3(1.0, 0.72, 0.38) * 70.0 * uFlakGround * exp(-since * 22.0) * kf * (1.0 - smoothstep(0.0, rf, length(rel - o)));
          }
        }
      }
    }
  }
  vec3 g = alb * light;
  vec3 pallC = vec3(0.07, 0.064, 0.058) * light;
  g = mix(g, pallC, pall) + emis * (1.0 - pall * 0.55);
  // rising smoke columns, leaning downwind: each column is a stack of vertically stretched
  // gaussian puffs whose line integral along the view ray is analytic. Only for rays whose
  // stretch below 3 km passes within reach of the city.
  float dy = max(-d.y, 1e-3);
  vec2 ra = camRel + d.xz * ((uCamAlt - 3000.0) / dy), rb = rel;
  vec2 ab = rb - ra;
  vec2 cl = ra + ab * clamp(-dot(ra, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
  if (uTgtClock > 0.0 && dot(cl, cl) < (R * 1.6 + 2500.0) * (R * 1.6 + 2500.0)) {
    float tau = 0.0, glow = 0.0;
    vec3 sc = vec3(0.0);
    vec3 O = vec3(camRel.x, uCamAlt, camRel.y);
    for (int k = 0; k < TGT_PLUMES; k++) {
      vec4 P = uPlumes[k];
      if (P.w <= 0.0) continue;
      float age = uTgtClock - P.z;
      if (age <= 0.0) continue;
      float top = 3000.0 * (1.0 - exp(-age / 45.0)) + 80.0;
      // skip columns the ray's lower stretch never comes near
      vec2 pa = camRel + d.xz * ((uCamAlt - top) / dy) - P.xy;
      vec2 pab = rel - P.xy - pa;
      vec2 pcl = pa + pab * clamp(-dot(pa, pab) / max(dot(pab, pab), 1e-3), 0.0, 1.0);
      float reach = 3.0 * (70.0 + top * 0.32 + min(age, 300.0) * 0.35) + length(uTgtWind) * min(top / 16.0, age);
      if (dot(pcl, pcl) > reach * reach) continue;
      float fade = P.w * (0.45 + 0.55 * exp(-age / 600.0)) * smoothstep(0.0, 3.0, age);
      for (int j = 0; j < 4; j++) {
        float fj = (float(j) + 0.5) / 4.0;
        float yb = top * fj;
        float w = 70.0 + yb * 0.32 + min(age, 300.0) * 0.35;
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
        float dens = fade * (1.0 - fj * 0.55) / (1.0 + yb / 1500.0);
        float tk = dens * 0.009 * 1.772 * w / L * exp(-dot(pc, pc) / (w * w));
        tau += tk;
        sc += mix(vec3(0.02, 0.018, 0.017), vec3(0.12, 0.115, 0.11), fj * fj) * tk;
        glow += (1.0 - fj) * (1.0 - fj) * tk;
      }
    }
    if (tau > 0.001) {
      vec3 sm = sc / tau * light + vec3(1.0, 0.4, 0.1) * 0.35 * glow / tau;
      g = mix(g, sm, 1.0 - exp(-tau));
    }
  }
  return g;
}
`;

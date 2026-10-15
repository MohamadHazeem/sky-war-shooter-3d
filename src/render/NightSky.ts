// Night sky pieces drawn by the sky dome (Sky.ts), gated by uNightSky (Atmos.night, from
// Weather): a star field above the haze, and the fires of a burning country on the ground below
// (towns and the target alight after a raid). Both are procedural and analytic, so they cost
// nothing by day (one uniform test) and never change the sky's shader program.
//
// Anti-aliasing: a star or a fire is a Gaussian whose width never drops below the pixel footprint,
// with its peak scaled down to keep its energy, so distant points fade instead of shimmering.
// Needs from the sky shader: h2(), vnoise(), uSunDir, uSunColor, uNightSky.
export const NIGHT_SKY_GLSL = /* glsl */ `
vec3 hash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// One layer of stars: a cell grid on the direction cube, at most one star per cell.
vec3 starLayer(vec3 d, float cells, float px, float density) {
  vec3 p = d * cells;
  vec3 c = floor(p);
  vec3 h = hash3(c);
  if (h.x > density) return vec3(0.0);
  vec3 star = c + 0.2 + 0.6 * hash3(c + 17.0);
  float r = length(p - star);
  float w = max(px * cells, 0.05);
  // a few bright stars, many faint ones
  float mag = pow(h.y, 9.0) * 1.6 + h.y * 0.06;
  vec3 tint = mix(vec3(0.75, 0.85, 1.15), vec3(1.15, 0.95, 0.75), h.z);
  return tint * mag * exp(-r * r / (w * w)) * min(1.0, 0.0025 / (w * w));
}

vec3 nightStars(vec3 d, float px) {
  if (d.y < -0.02) return vec3(0.0);
  vec3 s = starLayer(d, 120.0, px, 0.55) + starLayer(d, 260.0, px, 0.45) * 0.6;
  // the milky way: a faint, mottled band across the sky
  vec3 g = normalize(vec3(0.42, 0.55, -0.72));
  float band = exp(-pow(dot(d, g) * 4.2, 2.0));
  float mottle = vnoise(d.xz * 9.0 / (0.4 + d.y) + 3.0) * 0.6 + vnoise(d.xy * 23.0) * 0.4;
  s *= 1.0 + band * 1.2 * smoothstep(0.35, 0.75, mottle);
  s += vec3(0.0035, 0.0042, 0.0065) * band * smoothstep(0.2, 0.9, mottle);
  // extinction toward the horizon and the moon's glare
  float mu = dot(d, uSunDir);
  return s * smoothstep(-0.02, 0.22, d.y) * (1.0 - smoothstep(0.93, 0.995, mu));
}

// The moon's face: darker maria over a bright disk (d within ~1 degree of uSunDir)
float moonFace(vec3 d) {
  vec3 t = normalize(cross(uSunDir, vec3(0.0, 1.0, 0.0)));
  vec3 b = cross(t, uSunDir);
  vec2 uv = vec2(dot(d, t), dot(d, b)) / 0.0125;
  float m = vnoise(uv * 2.2 + 4.0) * 0.65 + vnoise(uv * 5.1 + 1.0) * 0.35;
  return 1.0 - 0.38 * smoothstep(0.45, 0.7, m);
}

// Fires on the ground: burning districts (low-frequency mask) of scattered fires, each a hot
// core with a glow of lit smoke around it, and the target itself burning after a raid.
float fireCell(vec2 xz, float size, float fp, float district, float seed) {
  vec2 q = xz / size;
  vec2 c = floor(q), f = q - c;
  float h = h2(c + seed);
  if (h > district) return 0.0;
  vec2 at = 0.3 + 0.4 * vec2(h2(c + seed + 3.1), h2(c + seed + 7.7));
  float r = size * (0.025 + 0.05 * h2(c + seed + 1.3));
  float d = length((f - at) * size);
  float re = max(r, fp * 1.3);
  float core = exp(-d * d / (re * re)) * (r * r) / (re * re);
  float gr = max(r * 3.5, fp * 1.5);
  float glow = exp(-d * d / (gr * gr)) * 0.16 * min(1.0, (r * r * 12.0) / (gr * gr));
  return core * (16.0 + 36.0 * h2(c + seed + 9.4)) + glow * 4.5;
}

vec3 nightFires(vec2 xz, float fp, float nearTarget, vec3 albedo) {
  // land only (open water has a dark, blue-dominant albedo)
  float land = smoothstep(0.0, 0.03, albedo.r - albedo.b * 0.6);
  // burning regions (~10 km), and within them the towns (~1.5 km clusters) that are alight
  float region = smoothstep(0.35, 0.62, vnoise(xz * 0.00009 + 11.3));
  float town = smoothstep(0.4, 0.7, vnoise(xz / 1500.0 + 7.0));
  float district = max(region * town, nearTarget * (0.35 + 0.65 * town)) * land;
  if (district <= 0.0) return vec3(0.0);
  float k = fireCell(xz, 170.0, fp, district * 0.75, 0.0) + 0.8 * fireCell(xz + 59.0, 380.0, fp, district * 0.5, 41.0);
  // big burning blocks in the target area
  if (nearTarget > 0.0) k += 1.4 * fireCell(xz + 137.0, 800.0, fp, nearTarget * land * 0.7, 83.0);
  // the smoke of a burning town glows dull red over it
  k += district * 0.03;
  return vec3(1.0, 0.36, 0.08) * k * 0.5;
}
`;

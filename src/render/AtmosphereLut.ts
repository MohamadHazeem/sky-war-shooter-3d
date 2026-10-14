import * as THREE from 'three';

// Spherical optical-depth LUT, in km. Inspired by Bruneton's transmittance
// parameterization; this is a two-species approximation, not his full 4D scattering LUT.
// Integrate once on the CPU: no render pass, downloads, or weather-time rebuilds.
export const EARTH_KM = 6360, AIR_KM = 100, LUT_W = 128, LUT_H = 32;
export function opticalDepth(altKm: number, mu: number, species: 'rayleigh' | 'mie', samples = 64): number {
  const r = EARTH_KM + Math.max(0, Math.min(AIR_KM, altKm));
  const c = Math.max(-1, Math.min(1, mu));
  const outer = EARTH_KM + AIR_KM;
  let distance = -r * c + Math.sqrt(r * r * (c * c - 1) + outer * outer);
  const ground = r * r * (c * c - 1) + EARTH_KM * EARTH_KM;
  if (c < 0 && ground >= 0) distance = Math.min(distance, -r * c - Math.sqrt(ground));
  const ds = Math.max(0, distance) / samples, height = species === 'rayleigh' ? 8 : 1.2;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const t = (i + .5) * ds;
    const h = Math.sqrt(r * r + t * t + 2 * r * c * t) - EARTH_KM;
    sum += Math.exp(-Math.max(0, h) / height) * ds;
  }
  return sum;
}
export function createAtmosphereLut() {
  const data = new Float32Array(LUT_W * LUT_H * 4);
  for (let y = 0; y < LUT_H; y++) for (let x = 0; x < LUT_W; x++) {
    const h = y / (LUT_H - 1) * 20;
    // Concentrate angular samples at the horizon.
    const q = x / (LUT_W - 1) * 2 - 1, mu = Math.sign(q) * q * q;
    const i = (y * LUT_W + x) * 4;
    data[i] = opticalDepth(h, mu, 'rayleigh');
    data[i + 1] = opticalDepth(h, mu, 'mie');
    data[i + 3] = 1;
  }
  const texture = new THREE.DataTexture(data, LUT_W, LUT_H, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export const atmosphereLutGLSL = /* glsl */ `
uniform sampler2D tAtmosphere;
uniform float uAtmosQuality;
vec2 airColumn(float altitude, float mu) {
  float x = sign(mu) * sqrt(abs(clamp(mu, -1.0, 1.0))) * 0.5 + 0.5;
  vec2 uv = vec2(x, clamp(altitude / 20000.0, 0.0, 1.0));
  uv = (uv * vec2(127.0, 31.0) + 0.5) / vec2(128.0, 32.0);
  return texture2D(tAtmosphere, uv).rg;
}
vec3 airExtinction(vec2 column) {
  return vec3(0.005802, 0.013558, 0.033100) * column.x + vec3(0.003996) * column.y;
}
vec3 airTransmittance(float altitude, vec3 direction, float metres) {
  float r = 6360000.0 + max(0.0, altitude), d = max(0.0, metres);
  float endR = sqrt(r * r + d * d + 2.0 * r * d * direction.y);
  float endMu = (r * direction.y + d) / endR;
  vec2 column = max(vec2(0.0), airColumn(altitude, direction.y) - airColumn(endR - 6360000.0, endMu));
  return exp(-airExtinction(column));
}
`;

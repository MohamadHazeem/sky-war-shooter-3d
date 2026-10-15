import * as THREE from 'three';
import { createAtmosphereLut, atmosphereLutGLSL } from './AtmosphereLut';

// Scene-referred light unit: 25,000 lux. Keep sunlight pre-exposed in the half-float HDR
// range; 105,000 lux of direct daylight becomes 4.2 scene units before the BRDF's 1/pi.
// Sky radiance and authored emissive effects use the corresponding scene-linear scale.
export const LIGHT_UNIT_LUX = 25000;
export const DAY_SUN_LUX = 105000;

// Shared lighting/atmosphere state. All colors are linear HDR.
// Tuned against the reference frames (reference/video-frames): high summer sun,
// deep blue zenith, pale hazy horizon, a bright sea of cumulus below the formation.
export const Atmos = {
  sunDir: new THREE.Vector3(),
  sunElevationDeg: 52,
  sunAzimuthDeg: 205,
  sunColor: new THREE.Color(1.0, 0.95, 0.88),
  sunIntensity: DAY_SUN_LUX / LIGHT_UNIT_LUX,
  zenith: new THREE.Color(0.045, 0.15, 0.5),
  horizon: new THREE.Color(0.5, 0.62, 0.8),
  ground: new THREE.Color(0.11, 0.14, 0.17),
  // Cloud layers (meters, absolute altitude)
  lowBase: 3900,
  lowTop: 5900,
  lowCoverage: 0.7,
  lowDensity: 3.0,
  highBase: 8900,
  highTop: 10900,
  highCoverage: 0.55,
  highDensity: 1.8,
  cloudAmbient: 0.6,
  stratus: 0,
  towers: 0.25,
  envFloor: 1,       // brightness of the cloud-sea floor in the reflection map (Weather: ~0 at night)
  twilight: 0,       // 0..1: low-sun sky (Weather): earth shadow and belt of Venus opposite the sun, glow toward it
  night: 0,          // 0..1: moonlit night sky (Weather): stars, fires on the ground
  haze: 1,           // distance-haze length scale (1 = clear air; storms and overcast thicken the murk: < 1)
  windOffset: new THREE.Vector3(), // accumulated wind drift + floating-origin shift
  originOffset: new THREE.Vector3(), // accumulated floating-origin shift only (ground)
  wind: new THREE.Vector3(9, 0, 4),
};

export function updateSunDir() {
  const el = THREE.MathUtils.degToRad(Atmos.sunElevationDeg);
  const az = THREE.MathUtils.degToRad(Atmos.sunAzimuthDeg);
  Atmos.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
}
updateSunDir();

export const atmosUniforms = {
  tAtmosphere: { value: createAtmosphereLut() },
  uAtmosQuality: { value: 1 },
  uSunDir: { value: Atmos.sunDir },
  uSunColor: { value: new THREE.Vector3() },
  uZenith: { value: new THREE.Vector3() },
  uHorizon: { value: new THREE.Vector3() },
  uGround: { value: new THREE.Vector3() },
  uCamAlt: { value: 7600 },
  uWeatherFog: { value: 0 },
  uTwilight: { value: 0 },
  uNightSky: { value: 0 },
  uHaze: { value: 1 },   // Atmos.haze (declared only by the shaders that use it: cloud march, composite, storm wall)
};

export function syncAtmosUniforms() {
  const c = Atmos.sunColor;
  atmosUniforms.uSunColor.value.set(c.r, c.g, c.b).multiplyScalar(Atmos.sunIntensity);
  atmosUniforms.uZenith.value.set(Atmos.zenith.r, Atmos.zenith.g, Atmos.zenith.b);
  atmosUniforms.uHorizon.value.set(Atmos.horizon.r, Atmos.horizon.g, Atmos.horizon.b);
  atmosUniforms.uGround.value.set(Atmos.ground.r, Atmos.ground.g, Atmos.ground.b);
  atmosUniforms.uHaze.value = Atmos.haze;
  atmosUniforms.uTwilight.value = Atmos.twilight;
  atmosUniforms.uNightSky.value = Atmos.night;
}
syncAtmosUniforms();

// GLSL: sky radiance for a view direction, without the sun disk. Used by the sky dome,
// the cloud pass (distance haze) and aerial perspective on geometry.
export const skyGLSL = /* glsl */ `
${atmosphereLutGLSL}
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform float uCamAlt;
uniform float uTwilight;
uniform float uNightSky;

// Twilight (low sun, uTwilight): the horizon is no longer one colour all round. Toward the sun it
// burns orange; opposite it the earth's shadow rises as a cool blue-violet band with the pink
// belt of Venus above it. Everything hazed with skyRadiance (clouds, distant aircraft, ground)
// takes the same split, so sunlit surfaces stand warm against a cool anti-solar backdrop.
vec3 twilightHorizon(vec3 d, float y, out float anti) {
  vec2 sh = uSunDir.xz / max(length(uSunDir.xz), 1e-4);
  vec2 dh = d.xz / max(length(d.xz), 1e-4);
  float c = dot(dh, sh);
  float toward = (c * 0.5 + 0.5) * (c * 0.5 + 0.5);
  anti = (1.0 - toward) * uTwilight;
  float lum = dot(uHorizon, vec3(0.2126, 0.7152, 0.0722));
  vec3 shadow = vec3(0.30, 0.34, 0.56) * lum * 1.05;
  vec3 sunward = uHorizon * vec3(1.22, 0.98, 0.72);
  vec3 h = mix(shadow, sunward, toward);
  // belt of Venus: a rose band a few degrees above the earth shadow, opposite the sun
  float belt = smoothstep(0.015, 0.07, y) * (1.0 - smoothstep(0.1, 0.3, y));
  h += vec3(0.62, 0.36, 0.42) * lum * 0.75 * belt * (1.0 - toward);
  return mix(uHorizon, h, uTwilight);
}

vec3 skyRadiance(vec3 d) {
  float y = d.y;
  vec3 col;
  float anti = 0.0;
  vec3 hor = uTwilight > 0.0 ? twilightHorizon(d, abs(y), anti) : uHorizon;
  if (y >= 0.0) {
    // the horizon colour reaches a little higher (paler, airier mid sky), then a bright
    // milky haze band hugs the horizon itself
    float t = pow(clamp(y, 0.0, 1.0), 0.5);
    col = mix(hor, uZenith, t);
    col += hor * 0.22 * exp(-y * 9.0) * (1.0 - 0.5 * anti);
  } else {
    // Looking down through ~7 km of air: the ground is mostly lost in haze.
    float t = 1.0 - exp(y * 9.0);
    col = mix(hor * 0.92, mix(hor * 0.55, uGround, 0.55), t);
    col += hor * 0.22 * exp(y * 40.0) * (1.0 - 0.5 * anti);   // the haze band continues just below the horizon
  }
  float mu = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(mu, 6.0) * 0.02 + pow(mu, 48.0) * 0.06 + pow(mu, 600.0) * 0.6);
  // low sun: a wide orange aureole lying along the horizon on the sun's side
  col += uSunColor * uTwilight * pow(mu, 4.0) * exp(-abs(y) * 5.0) * 0.05;
  if (uAtmosQuality > 0.5 && y >= 0.0) {
    vec2 column = airColumn(uCamAlt, y);
    vec3 extinct = airExtinction(column);
    float cosine = dot(d, uSunDir);
    float rayleigh = 0.75 * (1.0 + cosine * cosine);
    float mie = 0.12 * (1.0 - 0.76 * 0.76) / pow(1.0 + 0.76 * 0.76 - 1.52 * cosine, 1.5);
    vec3 sunT = exp(-airExtinction(airColumn(uCamAlt, max(0.0, uSunDir.y))));
    vec3 scattering = (1.0 - exp(-extinct)) * (rayleigh + mie) * sunT;
    // The mission palette carries night and storm art direction; optical depth supplies
    // altitude, wavelength-dependent extinction and the sunward aerosol lobe.
    col = mix(col, col * 0.65 + scattering * uSunColor * 0.55, 0.55 * (1.0 - 0.6 * anti));
  }
  return col;
}
`;

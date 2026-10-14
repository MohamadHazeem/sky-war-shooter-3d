import * as THREE from 'three';
import { createAtmosphereLut, atmosphereLutGLSL } from './AtmosphereLut';

// Shared lighting/atmosphere state. All colors are linear HDR.
// Tuned against the reference frames (reference/video-frames): high summer sun,
// deep blue zenith, pale hazy horizon, a bright sea of cumulus below the formation.
export const Atmos = {
  sunDir: new THREE.Vector3(),
  sunElevationDeg: 52,
  sunAzimuthDeg: 205,
  sunColor: new THREE.Color(1.0, 0.95, 0.88),
  sunIntensity: 4.2,
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
  uHaze: { value: 1 },   // Atmos.haze (declared only by the shaders that use it: cloud march, composite, storm wall)
};

export function syncAtmosUniforms() {
  const c = Atmos.sunColor;
  atmosUniforms.uSunColor.value.set(c.r, c.g, c.b).multiplyScalar(Atmos.sunIntensity);
  atmosUniforms.uZenith.value.set(Atmos.zenith.r, Atmos.zenith.g, Atmos.zenith.b);
  atmosUniforms.uHorizon.value.set(Atmos.horizon.r, Atmos.horizon.g, Atmos.horizon.b);
  atmosUniforms.uGround.value.set(Atmos.ground.r, Atmos.ground.g, Atmos.ground.b);
  atmosUniforms.uHaze.value = Atmos.haze;
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

vec3 skyRadiance(vec3 d) {
  float y = d.y;
  vec3 col;
  if (y >= 0.0) {
    // the horizon colour reaches a little higher (paler, airier mid sky), then a bright
    // milky haze band hugs the horizon itself
    float t = pow(clamp(y, 0.0, 1.0), 0.5);
    col = mix(uHorizon, uZenith, t);
    col += uHorizon * 0.22 * exp(-y * 9.0);
  } else {
    // Looking down through ~7 km of air: the ground is mostly lost in haze.
    float t = 1.0 - exp(y * 9.0);
    col = mix(uHorizon * 0.92, mix(uHorizon * 0.55, uGround, 0.55), t);
    col += uHorizon * 0.22 * exp(y * 40.0);   // the haze band continues just below the horizon
  }
  float mu = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(mu, 6.0) * 0.02 + pow(mu, 48.0) * 0.06 + pow(mu, 600.0) * 0.6);
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
    col = mix(col, col * 0.65 + scattering * uSunColor * 0.55, 0.55);
  }
  return col;
}
`;

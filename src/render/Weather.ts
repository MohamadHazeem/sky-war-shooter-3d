import * as THREE from 'three';
import { Atmos, syncAtmosUniforms, updateSunDir } from './Atmosphere';
import type { Engine } from '../core/Engine';

// Time of day + cloud cover for a mission. Low sun elevations warm the light and
// the horizon for golden-hour missions.
export interface Weather {
  sunEl: number;        // degrees
  sunAz: number;        // degrees
  low: number;          // low (cumulus sea) coverage 0..1
  high: number;         // upper layer coverage 0..1
  contrails?: boolean;
}

export const DEFAULT_WEATHER: Weather = { sunEl: 52, sunAz: 205, low: 0.7, high: 0.55, contrails: true };

export function applyWeather(engine: Engine, w: Weather) {
  Atmos.sunElevationDeg = w.sunEl;
  Atmos.sunAzimuthDeg = w.sunAz;
  Atmos.lowCoverage = w.low;
  Atmos.highCoverage = w.high;
  updateSunDir();
  // 0 = golden hour, 1 = high summer sun
  const k = THREE.MathUtils.smoothstep(w.sunEl, 8, 45);
  Atmos.sunColor.setRGB(1.0, THREE.MathUtils.lerp(0.72, 0.95, k), THREE.MathUtils.lerp(0.46, 0.88, k));
  Atmos.sunIntensity = THREE.MathUtils.lerp(3.1, 4.2, k);
  Atmos.zenith.setRGB(THREE.MathUtils.lerp(0.06, 0.045, k), THREE.MathUtils.lerp(0.13, 0.15, k), THREE.MathUtils.lerp(0.36, 0.5, k));
  Atmos.horizon.setRGB(THREE.MathUtils.lerp(0.66, 0.5, k), THREE.MathUtils.lerp(0.58, 0.62, k), THREE.MathUtils.lerp(0.56, 0.8, k));
  Atmos.cloudAmbient = THREE.MathUtils.lerp(0.5, 0.6, k);
  syncAtmosUniforms();
  engine.refreshLighting();
}

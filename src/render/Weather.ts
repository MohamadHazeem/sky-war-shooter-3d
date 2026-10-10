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
  mood?: 'clear' | 'overcast' | 'storm' | 'dusk' | 'night';   // grey overcast, dark storm with lightning, red dusk, moonlit night
}

// The mood currently applied (glass rain / glints read it: game/GlassFx.ts)
export const weatherNow: { mood: NonNullable<Weather['mood']> } = { mood: 'clear' };

export const DEFAULT_WEATHER: Weather = { sunEl: 52, sunAz: 205, low: 0.7, high: 0.55, contrails: true };

export function applyWeather(engine: Engine, w: Weather) {
  weatherNow.mood = w.mood ?? 'clear';
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
  Atmos.ground.setRGB(0.11, 0.14, 0.17);
  Atmos.envFloor = 1;
  engine.hemi.intensity = 0.35;
  engine.scene.environmentIntensity = 0.75;
  if (w.mood === 'night') {
    // moonlight (the "sun" is the moon): a faint cold key light, a near-black sky with a deep
    // blue glow on the horizon, dark ground and barely any fill. Exhaust flames and the
    // searchlights carry the scene (Searchlights.ts, NightExhaust.ts).
    Atmos.sunColor.setRGB(0.62, 0.72, 1.0);
    Atmos.sunIntensity = 0.3;
    Atmos.zenith.setRGB(0.0035, 0.005, 0.014);
    Atmos.horizon.setRGB(0.022, 0.03, 0.055);
    Atmos.ground.setRGB(0.008, 0.01, 0.014);
    Atmos.cloudAmbient = 0.06;
    Atmos.envFloor = 0.02;   // no sunlit cloud sea to light the aircraft from below
    engine.hemi.intensity = 0.03;
    engine.scene.environmentIntensity = 0.25;
  } else if (w.mood === 'dusk') {
    // sun on the horizon: deep orange light, dimming violet zenith, a glowing red rim
    Atmos.sunColor.setRGB(1.0, 0.5, 0.26);
    Atmos.sunIntensity = 2.4;
    Atmos.zenith.setRGB(0.05, 0.07, 0.2);
    Atmos.horizon.setRGB(0.78, 0.46, 0.34);
    Atmos.cloudAmbient = 0.42;
  } else if (w.mood === 'overcast') {
    // flat grey light under a high deck: little direct sun, bright diffuse sky
    Atmos.sunColor.setRGB(0.92, 0.93, 0.95);
    Atmos.sunIntensity *= 0.55;
    Atmos.zenith.setRGB(0.16, 0.19, 0.24);
    Atmos.horizon.setRGB(0.55, 0.58, 0.62);
    Atmos.cloudAmbient = 0.75;
  } else if (w.mood === 'storm') {
    // towering dark cloud: dim, cold, heavy
    Atmos.sunColor.setRGB(0.75, 0.8, 0.9);
    Atmos.sunIntensity *= 0.35;
    Atmos.zenith.setRGB(0.07, 0.08, 0.11);
    Atmos.horizon.setRGB(0.3, 0.32, 0.36);
    Atmos.cloudAmbient = 0.5;
  }
  syncAtmosUniforms();
  engine.refreshLighting();
}

// Weather sets that survival rounds cycle through (campaign missions set their own)
export const ROUND_WEATHER: Weather[] = [
  { sunEl: 52, sunAz: 205, low: 0.7, high: 0.55, contrails: true, mood: 'clear' },
  { sunEl: 14, sunAz: 250, low: 0.68, high: 0.45, contrails: true, mood: 'clear' },
  { sunEl: 40, sunAz: 180, low: 0.9, high: 0.95, contrails: false, mood: 'overcast' },
  { sunEl: 5, sunAz: 265, low: 0.62, high: 0.4, contrails: true, mood: 'dusk' },
  { sunEl: 30, sunAz: 170, low: 0.97, high: 0.98, contrails: false, mood: 'storm' },
];

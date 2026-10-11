/** Conditions are independent of sun elevation / night. Gameplay penalties never exceed 20%. */
export type WeatherPreset = 'clear' | 'lightRain' | 'heavyRain' | 'snow' | 'fog' | 'thunderstorm';
export interface WeatherCondition {
  rain: number; snow: number; fog: number; cloud: number;
  windX: number; windZ: number; spotting: number; aimError: number;
  traverse: number; turbulence: number; wetness: number; swell: number; lightning: number;
}
export const WEATHER_PRESETS: Record<WeatherPreset, Readonly<WeatherCondition>> = {
  clear:        { rain: 0, snow: 0, fog: 0, cloud: 0, windX: 9, windZ: 4, spotting: 1, aimError: 1, traverse: 1, turbulence: 0, wetness: 0, swell: 1, lightning: 0 },
  lightRain:    { rain: .35, snow: 0, fog: .00008, cloud: .45, windX: 10, windZ: 4, spotting: .94, aimError: 1.05, traverse: 1, turbulence: .1, wetness: .5, swell: 1.1, lightning: 0 },
  heavyRain:    { rain: 1, snow: 0, fog: .00018, cloud: .85, windX: 10.8, windZ: 4.8, spotting: .85, aimError: 1.15, traverse: 1, turbulence: .45, wetness: 1, swell: 1.5, lightning: 0 },
  snow:         { rain: 0, snow: 1, fog: .00014, cloud: .6, windX: 7.2, windZ: 3.2, spotting: .9, aimError: 1.1, traverse: .9, turbulence: .1, wetness: .15, swell: 1.1, lightning: 0 },
  fog:          { rain: 0, snow: 0, fog: .0004, cloud: .65, windX: 7.2, windZ: 3.2, spotting: .8, aimError: 1.1, traverse: 1, turbulence: 0, wetness: .2, swell: 1, lightning: 0 },
  thunderstorm: { rain: 1, snow: 0, fog: .00022, cloud: 1, windX: 10.8, windZ: -4.8, spotting: .8, aimError: 1.2, traverse: 1, turbulence: 1, wetness: 1, swell: 1.8, lightning: 1 },
};
export const CONDITION_KEYS = Object.keys(WEATHER_PRESETS.clear) as (keyof WeatherCondition)[];
export function blendConditions(out: WeatherCondition, a: WeatherCondition, b: WeatherCondition, k: number) {
  k = Math.max(0, Math.min(1, k));
  for (const key of CONDITION_KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
}
/** The final 15% of spotting range fades smoothly, including on Low / effects off. */
export function spottingAlpha(distance: number, baseRange: number, visibility: number): number {
  const range = baseRange * Math.max(.8, Math.min(1, visibility));
  const k = Math.max(0, Math.min(1, (range - distance) / (range * .15)));
  return k * k * (3 - 2 * k);
}
/** Bullet drag responds gently to crosswind (m/s²); shared by both sides. */
export function windDrift(wind: number, dt: number): number { return wind * .12 * Math.max(0, dt); }
export function precipitationCount(quality: string, enabled: boolean): number {
  return !enabled ? 0 : quality === 'low' ? 160 : quality === 'medium' ? 480 : quality === 'ultra' ? 1400 : 960;
}

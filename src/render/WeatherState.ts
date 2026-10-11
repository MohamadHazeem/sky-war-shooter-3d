import { WEATHER_PRESETS, type WeatherPreset } from './WeatherPresets';
// The weather as it is right now, for everything that reacts to it (glass rain and glints,
// night tracers, flares, cloud lights, lightning). Written by Weather.ts (applyWeather and the
// in-mission weather fronts); dependency-free so world/game modules and unit tests can read it.
export type Mood = 'clear' | 'overcast' | 'storm' | 'dusk' | 'night';

export const weatherNow = {
  ...WEATHER_PRESETS.clear,
  preset: 'clear' as WeatherPreset,
  effects: true, // cosmetic toggle; gameplay and visibility always remain active
  mood: 'clear' as Mood,  // the mood in force (during a front: the one it is turning into, past halfway)
  from: 'clear' as Mood,  // during a front: the mood it is leaving ...
  to: 'clear' as Mood,    // ... the mood it is turning into ...
  k: 0,                   // ... and how far (0..1); outside a front from = to = mood, k = 0
  night: 0,               // 0..1: moonlit night (brighter tracers, flare glare)
  dark: 0,                // 0..1: how much a light in the cloud shows (night 1, storm ~0.45, clear 0)
  muzzle: 0,              // 0..1: the player's own guns firing close to the glass (decays; Effects bumps it)
};

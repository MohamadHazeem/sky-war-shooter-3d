// The weather as it is right now, for everything that reacts to it (glass rain and glints,
// night tracers, flares, cloud lights, lightning). Written by Weather.ts (applyWeather and the
// in-mission weather fronts); dependency-free so world/game modules and unit tests can read it.
export type Mood = 'clear' | 'overcast' | 'storm' | 'dusk' | 'night';

export const weatherNow = {
  mood: 'clear' as Mood,  // the mood in force (during a front: the one it is turning into, past halfway)
  from: 'clear' as Mood,  // during a front: the mood it is leaving ...
  to: 'clear' as Mood,    // ... the mood it is turning into ...
  k: 0,                   // ... and how far (0..1); outside a front from = to = mood, k = 0
  night: 0,               // 0..1: moonlit night (brighter tracers, flare glare)
  dark: 0,                // 0..1: how much a light in the cloud shows (night 1, storm ~0.45, clear 0)
  flash: 0,               // lightning flash from a weather front's storm (GameFeel adds it to the screen flash)
  stormGate: 1,           // 0 once a front has cleared away the mission's own storm (silences Game.storm's flash)
  muzzle: 0,              // 0..1: the player's own guns firing close to the glass (decays; Effects bumps it)
};

// Rain on the glass and sun glints for a mood (GlassFx)
export function rainFor(m: Mood, time: number): number {
  if (m === 'storm') return 1;
  if (m === 'overcast') {
    const s = 0.5 + 0.5 * Math.sin(time * 0.045 + 1.1) * Math.sin(time * 0.017 + 0.4);
    const t = Math.min(1, Math.max(0, (s - 0.45) / 0.3));
    return 0.4 * t * t * (3 - 2 * t);
  }
  return 0;
}

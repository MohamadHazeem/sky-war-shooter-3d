import type { StationId } from '../world/B17Layout';
import type { Weather } from '../render/Weather';

export interface RigShot { id: string; label: string; pillars: number[]; station?: StationId; weather: keyof typeof RIG_WEATHER }
export const RIG_VERSION = 6;
export const RIG_SEED = 19431008;
export const RIG_DT = 1 / 60;
export const RIG_STEPS = 360;
export const RIG_SETTLE = 24;
export const RIG_WEATHER = {
  clear: { sunEl: 40, sunAz: 140, low: .55, high: .2, contrails: true },
  ground: { sunEl: 48, sunAz: 205, low: .08, high: .08, contrails: true },
  beauty: { sunEl: 24, sunAz: 245, low: .45, high: .12, contrails: true },
  cloud: { sunEl: 40, sunAz: 140, low: .86, high: .25 },
  sunset: { sunEl: 7, sunAz: 250, low: .55, high: .25, mood: 'dusk', contrails: true },
  rain: { sunEl: 28, sunAz: 140, low: .9, high: .95, mood: 'overcast', preset: 'heavyRain' },
  night: { sunEl: 26, sunAz: 140, low: .08, high: .12, mood: 'night' },
  interior: { sunEl: 22, sunAz: 90, low: .35, high: .1 },
} satisfies Record<string, Weather>;

export function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rigOptions(search: string) {
  const p = new URLSearchParams(search);
  const backend = p.get('backend') ?? 'webgl2';
  const quality = p.get('quality') ?? 'high';
  const seed = Number(p.get('seed') ?? RIG_SEED);
  if (!['webgl2', 'webgpu'].includes(backend)) throw new Error(`Unknown backend: ${backend}`);
  if (!['low', 'medium', 'high', 'ultra', 'cinematic'].includes(quality)) throw new Error(`Unknown quality: ${quality}`);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be a uint32');
  return { backend: backend as 'webgl2' | 'webgpu', quality: quality as 'low' | 'medium' | 'high' | 'ultra' | 'cinematic', seed, shot: p.get('shot') ?? 'waist-fw190' };
}

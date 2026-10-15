import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { rigOptions, seededRandom, RIG_WEATHER, type RigShot } from '../src/dev/VisualRigConfig';

const shots: RigShot[] = JSON.parse(readFileSync(new URL('../tools/visual-shots.json', import.meta.url), 'utf8'));
describe('visual rig fixture contract', () => {
  it('covers every pillar with 24 unique, safe names and fixed weather', () => {
    expect(shots).toHaveLength(24);
    expect(new Set(shots.map(s => s.id)).size).toBe(24);
    expect([...new Set(shots.flatMap(s => s.pillars))].sort((a, b) => a - b)).toEqual([1,2,3,4,5,6,7,8,9,10]);
    for (const shot of shots) {
      expect(shot.id).toMatch(/^[a-z0-9-]+$/);
      expect(RIG_WEATHER[shot.weather]).toBeDefined();
      expect(RIG_WEATHER[shot.weather]).not.toHaveProperty('front');
      expect(shot.pillars).toContain(10);
    }
  });
  it('reproduces random sequences without relying on global state', () => {
    const a = seededRandom(1943), b = seededRandom(1943), c = seededRandom(1944);
    const values = Array.from({ length: 100 }, a);
    expect(values).toEqual(Array.from({ length: 100 }, b));
    expect(values).not.toEqual(Array.from({ length: 100 }, c));
    expect(values.every(v => v >= 0 && v < 1)).toBe(true);
  });
  it('keeps backend selection explicit and rejects invalid inputs', () => {
    expect(rigOptions('?quality=cinematic').quality).toBe('cinematic');
    expect(rigOptions('').backend).toBe('webgl2');
    expect(rigOptions('?backend=webgpu&quality=low&seed=0')).toMatchObject({ backend: 'webgpu', quality: 'low', seed: 0 });
    for (const q of ['?backend=auto', '?quality=cinema', '?seed=NaN', '?seed=-1', '?seed=1.2', '?seed=4294967296']) expect(() => rigOptions(q)).toThrow();
  });
});

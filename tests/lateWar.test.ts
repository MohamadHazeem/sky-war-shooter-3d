import { describe, it, expect, vi } from 'vitest';
import { ENEMY_VARIANTS, type EnemyType } from '../src/world/EnemyTypes';
import { ENEMY_MIX } from '../src/game/Modes';
import { CAMPAIGN, survivalMission, type Mission } from '../src/game/Missions';
import { ALL_ENEMIES } from '../src/game/CustomBattle';
import { styleOf } from '../src/world/DogfightAI';

// The late-war types (Phase 5): He 111 raids, the Me 410 big gun, the Do 335.

// share of each answer of the late-war mix provider over an even grid of Math.random values
function mix(m: Mission, tier: number, N = 2000): Record<string, number> {
  let k = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => (k++ + 0.5) / N);
  const out: Record<string, number> = {};
  for (let i = 0; i < N; i++) {
    k = i;
    const t = ENEMY_MIX[0](m, tier) ?? 'normal';
    out[t] = (out[t] ?? 0) + 1 / N;
  }
  vi.restoreAllMocks();
  return out;
}
const mission = (id: string) => CAMPAIGN.find((m) => m.id === id)!;

describe('late-war enemy types', () => {
  it('are defined, tougher where they should be, and in the custom battle list', () => {
    for (const t of ['he111', 'me410', 'do335'] as EnemyType[]) {
      const v = ENEMY_VARIANTS[t];
      expect(v.propRadius, t).toBeGreaterThan(0);
      expect(v.score, t).toBeGreaterThan(ENEMY_VARIANTS.fw190.score);
      expect(ALL_ENEMIES).toContain(t);
    }
    expect(ENEMY_VARIANTS.he111.structure).toBeGreaterThan(ENEMY_VARIANTS.bf110.structure);
    // no GPL Me 410 model exists: the Bf 110 airframe stands in, repainted
    expect(ENEMY_VARIANTS.me410.model).toBe('bf110');
    expect(ENEMY_VARIANTS.me410.ownTint).toBe(true);
    expect(styleOf('me410')).toBe('heavy');
    expect(styleOf('he111')).toBe('heavy');
    expect(styleOf('do335')).toBe('boomzoom');
  });

  it('show up sparingly: the Me 410 in m11 / m12 and deep survival runs only', () => {
    expect(Object.keys(mix(mission('m1'), 3))).toEqual(['normal']);
    expect(Object.keys(mix(mission('m10'), 5))).toEqual(['normal']);
    const m11 = mix(mission('m11'), 4);
    expect(Object.keys(m11).sort()).toEqual(['me410', 'normal']);
    expect(m11.me410).toBeCloseTo(0.07, 2);
    const m12 = mix(mission('m12'), 6);
    expect(m12.me410).toBeCloseTo(0.08, 2);
    expect(m12.do335).toBeCloseTo(0.04, 2);
    const s = survivalMission('gunner');
    expect(Object.keys(mix(s, 2))).toEqual(['normal']);
    expect(mix(s, 3).me410).toBeCloseTo(0.04, 2);
    expect(mix(s, 3).do335).toBeUndefined();
    expect(mix(s, 9).me410).toBeCloseTo(0.09, 2);
    expect(mix(s, 9).do335).toBeCloseTo(0.05, 2);
    // the He 111 is a raid target, never part of a fighter mix
    for (const t of [3, 6, 12]) expect(mix(s, t).he111).toBeUndefined();
  });
});

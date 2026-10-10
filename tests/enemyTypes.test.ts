import { describe, it, expect, vi } from 'vitest';
import { randomEnemyType, ENEMY_VARIANTS, type EnemyType } from '../src/world/EnemyTypes';

// Feed randomEnemyType an evenly spaced grid of Math.random values: the share of each
// type is then exactly its weight in that tier (up to the grid resolution).
function distribution(round: number, N = 10000): Record<string, number> {
  let k = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => (k++ + 0.5) / N);
  const out: Record<string, number> = {};
  for (let i = 0; i < N; i++) {
    const t = randomEnemyType(round);
    out[t] = (out[t] ?? 0) + 1 / N;
  }
  vi.restoreAllMocks();
  return out;
}

const TIERS: [number, Partial<Record<EnemyType, number>>][] = [
  [0, { fw190: 0.7, bf109: 0.3 }],
  [1, { fw190: 0.5, bf109: 0.25, bf110: 0.25 }],
  [2, { fw190: 0.35, bf109: 0.2, bf110: 0.2, me262: 0.15, ju88: 0.1 }],
  [3, { fw190: 0.22, bf109: 0.18, bf110: 0.18, me262: 0.17, ju88: 0.15, me163: 0.1 }],
];

describe('randomEnemyType', () => {
  for (const [round, want] of TIERS) {
    it(`round ${round} matches its weights`, () => {
      const got = distribution(round);
      expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
      for (const [t, p] of Object.entries(want)) expect(got[t], t).toBeCloseTo(p!, 3);
    });
  }

  it('treats negative and late rounds like the end tiers', () => {
    expect(distribution(-3)).toEqual(distribution(0));
    expect(distribution(12)).toEqual(distribution(3));
  });

  it('returns a valid type at the edges of Math.random', () => {
    for (const r of [0, 1 - Number.EPSILON]) {
      vi.spyOn(Math, 'random').mockReturnValue(r);
      for (const round of [0, 1, 2, 3]) expect(ENEMY_VARIANTS[randomEnemyType(round)]).toBeDefined();
      vi.restoreAllMocks();
    }
  });

  it('jets and rockets appear only from round 2 / 3', () => {
    expect(distribution(1).me262).toBeUndefined();
    expect(distribution(2).me163).toBeUndefined();
    expect(distribution(3).me163).toBeGreaterThan(0);
  });
});

describe('ENEMY_VARIANTS', () => {
  it('have positive structure, score and scale', () => {
    for (const [id, v] of Object.entries(ENEMY_VARIANTS)) {
      expect(v.structure, id).toBeGreaterThan(0);
      expect(v.score, id).toBeGreaterThan(0);
      expect(v.scale, id).toBeGreaterThan(0);
      expect(v.params.power, id).toBeGreaterThan(0);
    }
  });

  it('jets have no propeller and heavies are tougher than fighters', () => {
    expect(ENEMY_VARIANTS.me262.propRadius).toBe(0);
    expect(ENEMY_VARIANTS.me163.propRadius).toBe(0);
    expect(ENEMY_VARIANTS.ju88.structure).toBeGreaterThan(ENEMY_VARIANTS.fw190.structure);
    expect(ENEMY_VARIANTS.bf110.score).toBeGreaterThan(ENEMY_VARIANTS.fw190.score);
  });
});

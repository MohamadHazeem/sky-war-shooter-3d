import { describe, it, expect } from 'vitest';
import { CAMPAIGN, roundDef, survivalMission, type Round } from '../src/game/Missions';

function expectNonDecreasing(xs: number[], label: string) {
  for (let i = 1; i < xs.length; i++) expect(xs[i], `${label}[${i}]`).toBeGreaterThanOrEqual(xs[i - 1]);
}

describe('campaign table', () => {
  it('numbers missions 1..n with unique ids', () => {
    expect(CAMPAIGN.map((m) => m.number)).toEqual(CAMPAIGN.map((_, i) => i + 1));
    expect(new Set(CAMPAIGN.map((m) => m.id)).size).toBe(CAMPAIGN.length);
  });

  it('gives every gunner mission a station and every mission a briefing', () => {
    for (const m of CAMPAIGN) {
      if (m.role === 'gunner') expect(m.station, m.id).toBeTruthy();
      expect(m.briefing.length, m.id).toBeGreaterThan(0);
      expect(m.objectives.length, m.id).toBeGreaterThan(0);
      expect(m.bombers, m.id).toBeGreaterThan(0);
    }
  });

  it('attaches a sane ROUNDS entry to every mission', () => {
    for (const m of CAMPAIGN) {
      const r = m.round as Round;
      expect(r, m.id).toBeDefined();
      expect(m.duration).toBe(r.duration);
      if (m.number <= 2) expect(m.rounds).toBe(2);
      else expect([3, 4]).toContain(m.rounds);
      expect(r.start).toBeGreaterThan(0);
      expect(r.start).toBeLessThan(r.duration);
      expect(r.min).toBeGreaterThan(0);
      expect(r.min).toBeLessThanOrEqual(r.max);
      expect(r.skill[0]).toBeLessThanOrEqual(r.skill[1]);
      expect(r.rockets ?? 0).toBeGreaterThanOrEqual(0);
      expect(r.rockets ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it('keeps flak and bombs-away inside the mission time', () => {
    for (const m of CAMPAIGN) {
      if (m.flak) {
        expect(m.flak.start).toBeLessThan(m.flak.end);
        expect(m.flak.end).toBeLessThanOrEqual(m.duration);
      }
      if (m.bombsAway !== undefined) expect(m.bombsAway).toBeLessThanOrEqual(m.duration);
    }
  });

  it('later missions are at least as demanding as the first', () => {
    const first = CAMPAIGN[0].round!;
    for (const m of CAMPAIGN) {
      expect(m.round!.max).toBeGreaterThanOrEqual(first.max);
      expect(m.round!.skill[1]).toBeGreaterThanOrEqual(first.skill[1]);
    }
  });
});

describe('roundDef (campaign)', () => {
  for (const m of CAMPAIGN) {
    it(`${m.id}: rounds escalate monotonically and end at the full ramp`, () => {
      const n = m.rounds!;
      const base = m.round!;
      const rs = Array.from({ length: n }, (_, i) => roundDef(m, i));
      expectNonDecreasing(rs.map((r) => r.min), 'min');
      expectNonDecreasing(rs.map((r) => r.max), 'max');
      expectNonDecreasing(rs.map((r) => r.skill[0]), 'skill0');
      expectNonDecreasing(rs.map((r) => r.skill[1]), 'skill1');
      for (const r of rs) {
        expect(r.min).toBeLessThanOrEqual(r.max);
        expect(r.skill[0]).toBeLessThanOrEqual(r.skill[1]);
        expect(r.min).toBeGreaterThanOrEqual(base.min);
        expect(r.max).toBeLessThanOrEqual(base.max);
      }
      expect(rs[0].start).toBe(base.start);
      expect(rs[0].min).toBe(base.min);
      expect(rs[0].skill[0]).toBeCloseTo(base.skill[0], 10);
      expect(rs[n - 1].max).toBe(base.max);
      expect(rs[n - 1].skill[1]).toBeCloseTo(base.skill[1], 10);
      expect(rs[0].rockets).toBe(0); // no rockets in the opening round
      const total = rs.reduce((s, r) => s + r.duration, 0);
      expect(Math.abs(total - base.duration)).toBeLessThanOrEqual(n);
    });
  }
});

describe('survival', () => {
  it('builds an endless mission for each role', () => {
    const g = survivalMission('gunner'), p = survivalMission('pilot');
    expect(g.rounds).toBe(Infinity);
    expect(g.duration).toBe(Infinity);
    expect(g.role).toBe('gunner');
    expect(p.escorts).toBeGreaterThan(0);
    expect(g.escorts).toBe(0);
    expect(g.id).not.toBe(p.id);
  });

  it('escalates without end but within caps', () => {
    const m = survivalMission('gunner');
    const rs = Array.from({ length: 40 }, (_, i) => roundDef(m, i));
    expectNonDecreasing(rs.map((r) => r.min), 'min');
    expectNonDecreasing(rs.map((r) => r.max), 'max');
    expectNonDecreasing(rs.map((r) => r.skill[0]), 'skill0');
    expectNonDecreasing(rs.map((r) => r.skill[1]), 'skill1');
    expectNonDecreasing(rs.map((r) => r.rockets ?? 0), 'rockets');
    for (const r of rs) {
      expect(Number.isFinite(r.duration)).toBe(true);
      expect(r.min).toBeLessThanOrEqual(r.max);
      expect(r.max).toBeLessThanOrEqual(20);
      expect(r.skill[1]).toBeLessThanOrEqual(1.65);
      expect(r.rockets ?? 0).toBeLessThanOrEqual(0.4);
    }
    expect(rs[0].rockets).toBe(0);
    expect(rs[1].rockets).toBe(0);
    expect(rs[39].max).toBeGreaterThan(rs[0].max);
  });
});

import { describe, it, expect } from 'vitest';
import { CAMPAIGN, roundDef, survivalMission, type Round } from '../src/game/Missions';
import { paceAt, paceMarks, finalWaveSize, splitFormations, DEFAULT_PROFILE, AIR_CAP, LULL_MIN, LULL_MAX, FINAL_AT } from '../src/game/Pacing';
import { MODES, ACE_HUNT, TIME_ATTACK, SURVIVAL_MODE, leaderboardMode, modeFor } from '../src/game/Modes';

// The leaderboard modes firestore.rules accepts
const RULES = /^(survival-(gunner|pilot)|campaign-m[0-9]{1,2}|daily-(gunner|pilot)-[0-9]{8}|weekly-(gunner|pilot)-[0-9]{6}|(acehunt|timeattack)-(gunner|pilot))$/;

const rounds = (): Round[] => [
  ...CAMPAIGN.flatMap((m) => Array.from({ length: m.rounds! }, (_, i) => roundDef(m, i))),
  ...Array.from({ length: 12 }, (_, i) => roundDef(survivalMission('gunner'), i)),
];

describe('pace curve', () => {
  it('builds, breathes 10-15 s, then surges into a final wave in the last 25%', () => {
    for (const r of rounds()) {
      const k = paceMarks(r);
      const span = r.duration - r.start;
      expect(k.buildEnd - r.start).toBeGreaterThanOrEqual(span * 0.3 - 1e-9);
      expect(k.buildEnd - r.start).toBeLessThanOrEqual(span * 0.4 + 1e-9);
      expect(k.lullEnd - k.buildEnd).toBeGreaterThanOrEqual(LULL_MIN);
      expect(k.lullEnd - k.buildEnd).toBeLessThanOrEqual(LULL_MAX);
      expect(k.final).toBeCloseTo(r.start + span * FINAL_AT, 6);
      expect(k.lullEnd).toBeLessThan(k.final);
      // build ramps up monotonically
      let prev = -1;
      for (let t = r.start; t < k.buildEnd; t += 0.5) { const p = paceAt(t, r); expect(p.phase).toBe('build'); expect(p.ramp).toBeGreaterThanOrEqual(prev); prev = p.ramp; }
      // the breather sends far fewer fighters than the build-up peak
      const lull = paceAt((k.buildEnd + k.lullEnd) / 2, r);
      expect(lull.phase).toBe('breather');
      const target = (p: { ramp: number; scale: number }) => (r.min + (r.max - r.min) * p.ramp) * p.scale;
      expect(target(lull)).toBeLessThan(target(paceAt(k.buildEnd - 0.01, r)));
      expect(lull.gap).toBeGreaterThan(1);
      // mid surges to the full max before the final wave
      expect(paceAt(k.final - 0.01, r).ramp).toBeCloseTo(1, 2);
      expect(paceAt(k.final + 0.01, r).phase).toBe('final');
      expect(paceAt(r.duration, r).phase).toBe('over');
    }
  });

  it('Time Attack streams: no breather, no final wave, full strength quickly', () => {
    const r = roundDef(TIME_ATTACK.mission('gunner'), 0);
    const prof = TIME_ATTACK.pace!;
    for (let t = r.start; t < r.duration; t += 1) expect(['mid']).toContain(paceAt(t, r, prof).phase);
    expect(paceAt(r.start + 25, r, prof).ramp).toBeCloseTo(1, 5);
    expect(paceAt(r.start + 25, r, prof).gap).toBeLessThan(1);
  });
});

describe('final wave', () => {
  it('is 15-25 fighters in 2-3 formations for normal rounds, within the air cap', () => {
    for (const r of rounds()) for (const last of [false, true]) for (const mult of [0.75, 1, 1.3]) {
      const n = finalWaveSize(DEFAULT_PROFILE, r.max, last, mult, 0, false);
      expect(n).toBeGreaterThanOrEqual(15 * (mult < 1 ? 0.8 : 1) - 1e-9);
      expect(n).toBeLessThanOrEqual(25);
      const parts = splitFormations(n, last);
      expect(parts.length).toBeGreaterThanOrEqual(2);
      expect(parts.length).toBeLessThanOrEqual(3);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(n);
      if (last) expect(parts.length).toBe(3);
    }
    // the mission's last round is the biggest
    expect(finalWaveSize(DEFAULT_PROFILE, 14, true, 1, 0, false)).toBeGreaterThan(finalWaveSize(DEFAULT_PROFILE, 14, false, 1, 0, false));
    // many already in the air, or a slow machine: a smaller wave
    expect(finalWaveSize(DEFAULT_PROFILE, 20, true, 1.3, 20, false)).toBeLessThanOrEqual(AIR_CAP - 20);
    expect(finalWaveSize(DEFAULT_PROFILE, 20, true, 1, 0, true)).toBeLessThan(finalWaveSize(DEFAULT_PROFILE, 20, true, 1, 0, false));
  });

  it('Ace Hunt sends a small elite wave', () => {
    const n = finalWaveSize(ACE_HUNT.pace!, 5, true, 1, 0, false);
    expect(n).toBeGreaterThanOrEqual(6);
    expect(n).toBeLessThanOrEqual(13);
    expect(finalWaveSize(TIME_ATTACK.pace!, 14, true, 1, 0, false)).toBe(0);
  });
});

describe('modes', () => {
  it('every mode builds a sane mission for both roles and names an allowed leaderboard', () => {
    for (const d of MODES) for (const role of ['gunner', 'pilot'] as const) {
      const m = d.mission(role);
      expect(m.role).toBe(role);
      expect(modeFor(m)).toBe(d);
      expect(leaderboardMode(m)).toBe(d.board(role));
      expect(d.board(role)).toMatch(RULES);
      expect(m.round).toBeDefined();
      expect(m.briefing.length).toBeGreaterThan(0);
      expect(m.number).toBe(0); // never a boss round, never in the campaign table
    }
  });

  it('Ace Hunt is 3 rounds of few, sharp fighters; Time Attack is one 3-minute round', () => {
    const a = ACE_HUNT.mission('gunner');
    expect(a.rounds).toBe(3);
    const sv = roundDef(survivalMission('gunner'), 0);
    for (let i = 0; i < 3; i++) {
      const r = roundDef(a, i);
      expect(r.max).toBeLessThanOrEqual(5);
      expect(r.skill[0]).toBeGreaterThan(sv.skill[1]);
    }
    const t = TIME_ATTACK.mission('pilot');
    expect(t.rounds).toBe(1);
    expect(roundDef(t, 0).duration).toBe(180);
    expect(SURVIVAL_MODE.board('gunner')).toBe('survival-gunner');
  });

  it('campaign missions keep their own leaderboard', () => {
    for (const m of CAMPAIGN) expect(leaderboardMode(m)).toBeNull();
  });
});

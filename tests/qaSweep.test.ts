import { describe, it, expect } from 'vitest';
import { controlsHintShown, CONTROLS_HINT_SECONDS, statusRepeatsRound } from '../src/ui/HudDetail';
import { PACK, PACK_IDS } from '../src/world/LuftwaffeTactics';
import { STATIONS, STATION_ORDER } from '../src/world/B17Layout';
import { PHRASES } from '../src/i18n/phrases';
import { CAMPAIGN, missionProgress, roundDef, survivalMission } from '../src/game/Missions';
import { DEEP_PENETRATION } from '../src/game/DeepPenetration';
import { companionDitchAllowed } from '../src/world/FormationRules';

// Phase 9 goal 7: the bug sweep's fixes (docs/phase9/reports/07.md)
describe('top-left status line', () => {
  it('drops the round when the objective line already starts with it', () => {
    expect(statusRepeatsRound('Round 1/2 — 3:30 · 4 fighters')).toBe(true);
    expect(statusRepeatsRound('Round 3 — clear the last 2 fighters')).toBe(true);
    expect(statusRepeatsRound('Wave 2 — 5 fighters remaining')).toBe(false);
    expect(statusRepeatsRound('Hold steady through the flak')).toBe(false);
  });
  it('the short form has Arabic', () => {
    expect(PHRASES['Score {n}']).toBeTruthy();
    expect(PHRASES['Score {score} · Round {round}']).toBeTruthy();
  });
});

describe('"H — controls" reminder', () => {
  const base = { missions: 1, detail: 'standard' as const, playing: true, t: 0, cardOpen: false };
  it('shows at the start of an early mission and goes on its own clock', () => {
    expect(controlsHintShown(base)).toBe(true);
    expect(controlsHintShown({ ...base, t: CONTROLS_HINT_SECONDS - 0.1 })).toBe(true);
    expect(controlsHintShown({ ...base, t: CONTROLS_HINT_SECONDS })).toBe(false);
  });
  it('never lingers outside live play, over Minimal, the open card or later missions', () => {
    expect(controlsHintShown({ ...base, playing: false })).toBe(false);
    expect(controlsHintShown({ ...base, detail: 'minimal' })).toBe(false);
    expect(controlsHintShown({ ...base, cardOpen: true })).toBe(false);
    expect(controlsHintShown({ ...base, missions: 3 })).toBe(false);
    expect(controlsHintShown({ ...base, missions: 0 })).toBe(false);
  });
});

describe('Luftwaffe tactic tips', () => {
  const seats = STATION_ORDER.map((id) => STATIONS[id].label.toLowerCase());
  it('name only seats the player can man', () => {
    for (const id of PACK_IDS) {
      const tip = PACK[id].tip.toLowerCase();
      expect(tip, id).not.toMatch(/\bchin\b|\bnose\b|radio gun|cheek/);
    }
    expect(PACK.sturm.tip).toMatch(/top turret/);
    expect(seats.some((s) => s.includes('top'))).toBe(true);
  });
  it('every tip is translated', () => {
    for (const id of PACK_IDS) expect(PHRASES[PACK[id].tip], id).toBeTruthy();
  });
});

describe('return-leg progress (ditching)', () => {
  const m1 = CAMPAIGN.find((m) => m.id === 'm1')!;
  it('round missions measure progress by round, not by the nominal duration', () => {
    // the sweep's m1 run: 161 s into round 1 of 2 counted as 77 % "return leg" and the B-17 ditched
    expect(m1.rounds).toBe(2);
    expect(161 / m1.duration).toBeGreaterThan(0.75);
    expect(missionProgress(m1, 161, 0, 0)).toBeLessThan(0.75);
    const d = roundDef(m1, 1).duration;
    expect(missionProgress(m1, 200 + d * 0.99, 1, 200)).toBeLessThan(0.75);   // final round still on its clock
    expect(missionProgress(m1, 200 + d * 1.5, 1, 200)).toBeCloseTo(0.875);    // clearing the last fighters
    expect(missionProgress(m1, 9999, 1, 200)).toBe(1);
  });
  it('the return leg is never reached before the final round has run its time', () => {
    for (const m of [...CAMPAIGN, ...DEEP_PENETRATION].filter((c) => c.round && Number.isFinite(c.rounds ?? 1))) {
      const n = m.rounds ?? 1;
      if (n > 1) expect(missionProgress(m, 1e5, n - 2, 0), m.id).toBeLessThan(0.75);
      expect(missionProgress(m, roundDef(m, n - 1).duration * 0.99, n - 1, 0), m.id).toBeLessThan(0.75);
    }
  });
  it('missions without rounds keep time / duration; endless ones never get there', () => {
    expect(missionProgress({ ...m1, round: undefined, rounds: undefined, duration: 400 }, 300, 0, 0)).toBe(0.75);
    expect(missionProgress(survivalMission('gunner'), 5000, 30, 4900)).toBeLessThan(0.75);
  });
  it('a companion ditch never becomes the loss that fails the mission', () => {
    expect(companionDitchAllowed(5, 6)).toBe(true);
    expect(companionDitchAllowed(6, 6)).toBe(false);
    expect(companionDitchAllowed(40, undefined)).toBe(true);
  });
});

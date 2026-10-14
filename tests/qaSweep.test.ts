import { describe, it, expect } from 'vitest';
import { controlsHintShown, CONTROLS_HINT_SECONDS, statusRepeatsRound } from '../src/ui/HudDetail';
import { PACK, PACK_IDS } from '../src/world/LuftwaffeTactics';
import { STATIONS, STATION_ORDER } from '../src/world/B17Layout';
import { PHRASES } from '../src/i18n/phrases';

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

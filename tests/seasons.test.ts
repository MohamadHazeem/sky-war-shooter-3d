import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { stubStorage } from './helpers';
import {
  FIRST_SEASON, LIMITS, TIERS, fmtCountdown, loadSeasons, msUntilSeasonEnd, nextTier, plausibility, recordSortie, rollover, saveSeasons,
  seasonKey, seasonNumber, seasonRibbon, seasonStart, seasonalBoard, shadowFlag, shiftSeason, tierFor, validSeason, visibleRows, type RewardTarget,
} from '../src/game/Seasons';
import { COLLECTABLES } from '../src/game/Customize';
import { NOSE_ARTS } from '../src/render/NoseArt';
import { hasPhrase, setLang, tx } from '../src/i18n';
import { seasonInfo } from '../src/ui/LeaderboardPanel';

beforeEach(() => { stubStorage(); setLang('en'); });
const utc = (y: number, mo: number, d: number, h = 12) => new Date(Date.UTC(y, mo - 1, d, h));
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

class Prog implements RewardTarget {
  unlocked = new Set<string>();
  unlock(id: string) { this.unlocked.add(id); return true; }
}

describe('monthly seasons', () => {
  it('keys are UTC yyyymm, numbered from Season 1 (October 2026)', () => {
    expect(seasonKey(utc(2026, 10, 15))).toBe(202610);
    expect(seasonKey(new Date(Date.UTC(2026, 9, 31, 23, 59)))).toBe(202610);
    expect(seasonKey(new Date(Date.UTC(2026, 10, 1, 0, 0)))).toBe(202611);
    expect(seasonNumber(FIRST_SEASON)).toBe(1);
    expect(seasonNumber(202612)).toBe(3);
    expect(seasonNumber(202701)).toBe(4);
    expect(shiftSeason(202612, 1)).toBe(202701);
    expect(shiftSeason(202701, -1)).toBe(202612);
    expect(shiftSeason(202610, 15)).toBe(202801);
    expect(validSeason(202613)).toBe(false);
    expect(validSeason(202609)).toBe(false);
    expect(seasonStart(202702).toISOString()).toBe('2027-02-01T00:00:00.000Z');
  });

  it('counts down to the 1st of next month (UTC)', () => {
    expect(msUntilSeasonEnd(utc(2026, 10, 31, 12))).toBe(12 * 3600000);
    expect(msUntilSeasonEnd(utc(2026, 12, 31, 0))).toBe(86400000);
    expect(fmtCountdown(16 * 86400000 + 4 * 3600000 + 5 * 60000)).toBe('16d 04h 05m');
    expect(fmtCountdown(3 * 3600000)).toBe('3h 00m');
  });

  it('daily and weekly boards are already time-boxed', () => {
    expect(seasonalBoard('survival-gunner')).toBe(true);
    expect(seasonalBoard('campaign-m3')).toBe(true);
    expect(seasonalBoard('coop-gunner')).toBe(true);
    expect(seasonalBoard('daily-gunner-20261015')).toBe(false);
    expect(seasonalBoard('weekly-pilot-202642')).toBe(false);
    expect(seasonalBoard('')).toBe(false);
  });

  it('the rules pin the season to the server month', () => {
    expect(rules).toContain("request.resource.data.season == request.time.year() * 100 + request.time.month()");
  });
});

describe('plausibility', () => {
  it('real runs pass', () => {
    expect(plausibility({ score: 1200, kills: 5, rounds: 1, duration: 300 })).toBe('ok');
    expect(plausibility({ score: 0, kills: 0, rounds: 1, duration: 4 })).toBe('ok');                // bailed at once
    expect(plausibility({ score: 64000, kills: 60, rounds: 12, duration: 1500 })).toBe('ok');       // long survival
    expect(plausibility({ score: 5200, kills: 3, rounds: 1, duration: 600 })).toBe('ok');           // bomb run + nemesis bonus
  });

  it('impossible runs are rejected, unlikely ones shadow-flagged', () => {
    expect(plausibility({ score: 200000, kills: 10, rounds: 2, duration: 600 })).toBe('reject');    // points per kill
    expect(plausibility({ score: 60000, kills: 30, rounds: 3, duration: 20 })).toBe('reject');      // points per second
    expect(plausibility({ score: 1000, kills: 100, rounds: 3, duration: 60 })).toBe('reject');      // kills per second
    expect(plausibility({ score: 0, kills: 0, rounds: 40, duration: 60 })).toBe('reject');          // rounds per second
    expect(plausibility({ score: 1.5, kills: 0, rounds: 0, duration: 60 })).toBe('reject');
    expect(plausibility({ score: 0, kills: 0, rounds: 0, duration: 36001 })).toBe('reject');
    expect(plausibility({ score: 33000, kills: 10, rounds: 2, duration: 900 })).toBe('shadow');      // 3.3k a kill
    expect(plausibility({ score: 40000, kills: 15, rounds: 3, duration: 60 })).toBe('shadow');       // 40k a minute
    expect(plausibility({ score: 3000, kills: 40, rounds: 3, duration: 100 })).toBe('shadow');       // 24 kills a minute
  });

  it('a shadow ban forces the flag', () => {
    const ok = { score: 1200, kills: 5, rounds: 1, duration: 300 };
    expect(shadowFlag(ok, false)).toBe(false);
    expect(shadowFlag(ok, true)).toBe(true);
    expect(shadowFlag({ ...ok, score: 31000, kills: 10 }, false)).toBe(true);
  });

  it('firestore.rules mirrors the limits', () => {
    const h = LIMITS.hard, s = LIMITS.soft;
    const hard = rules.slice(rules.indexOf('function plausibleHard'), rules.indexOf('function plausibleSoft'));
    expect(hard).toContain(`d.score <= d.kills * ${h.perKill} + d.rounds * ${h.perRound} + ${h.base}`);
    expect(hard).toContain(`d.score <= d.duration * ${h.perSec} + ${h.secBase}`);
    expect(hard).toContain(`d.kills * ${h.killSecs} <= d.duration + ${h.killBase}`);
    expect(hard).toContain(`d.rounds * ${h.roundSecs} <= d.duration + ${h.roundBase}`);
    const soft = rules.slice(rules.indexOf('function plausibleSoft'), rules.indexOf('function shadowOk'));
    expect(soft).toContain(`d.score <= d.kills * ${s.perKill} + d.rounds * ${s.perRound} + ${s.base}`);
    expect(soft).toContain(`d.score <= d.duration * ${s.perSec} + ${s.secBase}`);
    expect(soft).toContain(`d.kills * ${s.killSecs} <= d.duration + ${s.killBase}`);
    expect(rules).toContain(`intIn(request.resource.data.duration, 0, ${LIMITS.maxDuration})`);
    expect(rules).toMatch(/match \/shadowbans\/\{uid\} \{[^}]*allow list, write: if false;/);
    // the squadron best mirrors the score document, new fields included
    expect(rules).toContain("'rounds', 'duration', 'season', 'shadow', 'createdAt', 'v', 'squadron', 'scoreId'");
  });

  it('boards hide other players\' shadow entries but never your own', () => {
    const rows = [
      { name: 'a', mine: false, shadow: true }, { name: 'b', mine: false }, { name: 'c', mine: true, shadow: true }, { name: 'd', mine: false, shadow: false },
    ];
    expect(visibleRows(rows).map(r => r.name)).toEqual(['b', 'c', 'd']);
  });
});

describe('season rewards', () => {
  it('tiers at 3 / 10 / 25 posted scores', () => {
    expect(tierFor(0)).toBeNull();
    expect(tierFor(3)).toBe('bronze');
    expect(tierFor(24)).toBe('silver');
    expect(tierFor(25)).toBe('gold');
    expect(nextTier(4)?.id).toBe('silver');
    expect(nextTier(30)).toBeNull();
  });

  it('reaching a tier pays its ribbon and, once ever, the nose art; shadow scores do not count', () => {
    const p = new Prog(), now = utc(2026, 10, 15);
    expect(recordSortie(900, false, p, now).reached).toBeNull();
    expect(recordSortie(900, true, p, now).record.sorties).toBe(1);
    recordSortie(1500, false, p, now);
    const r = recordSortie(400, false, p, now);
    expect(r).toMatchObject({ reached: 'bronze', nose: 'Bronze Season Wings' });
    expect(r.record).toMatchObject({ key: 202610, sorties: 3, best: 1500, tier: 'bronze' });
    expect(p.unlocked.has(seasonRibbon(202610, 'bronze'))).toBe(true);
    expect(p.unlocked.has('nose:seasonbronze')).toBe(true);
    // next month: a clean season; bronze again pays the ribbon but the nose art is already owned
    const nov = utc(2026, 11, 2);
    for (let i = 0; i < 2; i++) recordSortie(100, false, p, nov);
    expect(recordSortie(100, false, p, nov)).toMatchObject({ reached: 'bronze', nose: null });
    expect(p.unlocked.has(seasonRibbon(202611, 'bronze'))).toBe(true);
  });

  it('a new month archives the flown season (newest first) and keeps it across loads', () => {
    recordSortie(2000, false, null, utc(2026, 10, 3));
    let s = loadSeasons(utc(2026, 12, 1));
    expect(s.current).toMatchObject({ key: 202612, sorties: 0 });
    expect(s.archive).toEqual([{ key: 202610, sorties: 1, best: 2000, tier: null }]);
    saveSeasons(s);
    recordSortie(10, false, null, utc(2026, 12, 4));
    s = rollover(loadSeasons(utc(2026, 12, 9)), utc(2027, 1, 1));
    expect(s.archive.map(r => r.key)).toEqual([202612, 202610]);
    // unflown months leave no empty archive rows; garbage storage is ignored
    expect(rollover({ current: { key: 202701, sorties: 0, best: 0, tier: null }, archive: [] }, utc(2027, 3, 1)).archive).toEqual([]);
    localStorage.setItem('sws3d.seasons', '{"current":{"key":"x"},"archive":[{"key":1},null]}');
    expect(loadSeasons(utc(2026, 10, 15))).toEqual({ current: { key: 202610, sorties: 0, best: 0, tier: null }, archive: [] });
  });

  it('season nose arts are exclusive collectables (no crates, no merit)', () => {
    for (const t of TIERS) {
      expect(NOSE_ARTS.find(n => n.id === t.nose)?.name).toBe(t.noseName);
      expect(COLLECTABLES.find(c => c.key === `nose:${t.nose}`)?.exclusive).toBe('Season reward');
    }
  });
});

describe('season panel text', () => {
  it('shows the live season, tier progress and the archive, in Arabic too', () => {
    const now = utc(2026, 11, 20);
    const rec = { key: 202611, sorties: 4, best: 900, tier: 'bronze' as const };
    const html = seasonInfo(202611, rec, [{ key: 202610, sorties: 12, best: 8000, tier: 'silver' }], now);
    expect(html).toContain('Season 2');
    expect(html).toContain('ends in 10d 12h 00m');
    expect(html).toContain('Your season: Bronze · 4 scores posted · 6 more for Silver');
    expect(html).toContain('Season 1 · Silver · 12 scores posted · best 8000');
    expect(seasonInfo(202610, rec, [], now)).toContain('final standings');
    setLang('ar');
    const ar = seasonInfo(202611, rec, [], now);
    expect(ar).toContain('الموسم 2');
    expect(ar).toContain('برونزية');
    expect(ar).not.toMatch(/Season|scores posted|ends in/);
  });

  it('every new phrase has Arabic', () => {
    for (const k of ['Season', 'All time', 'final standings', 'Previous season', 'Next season', 'No tier yet', 'Bronze', 'Silver', 'Gold',
      'Top tier reached', 'Your past seasons', 'No past seasons yet.', 'Season reward', ...TIERS.map(t => t.noseName),
      'Season boards reset on the 1st of each month (UTC). Post 3, 10 and 25 scores in a season for season-only nose art.']) {
      expect(hasPhrase(k), k).toBe(true);
    }
    setLang('ar');
    expect(tx('{tier} tier reached: {nose} nose art unlocked', { tier: 'x', nose: 'y' })).toContain('y');
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { stubStorage } from './helpers';
import {
  ESCORT_LABEL, EVEN_MARGIN, FATE_LABEL, RAIDS, RAIDS_KEY, VERDICT_TEXT, VERDICT_TITLE, compareRaid, histId, isHistoricalId, loadRecords,
  lossRate, parseHistId, pct, pressure, raidById, raidMission, recordRaid, sanitizeRecords, saveRecords, type RaidResult,
} from '../src/game/HistoricalRaids';
import { CAMPAIGN } from '../src/game/Missions';
import { DEEP_PENETRATION } from '../src/game/DeepPenetration';
import { HANGAR_TABS } from '../src/game/MenuModel';
import { isRaidId } from '../src/game/SideRaids';
import { isTourId } from '../src/game/Tour';
import { hasPhrase, setLang, tx } from '../src/i18n';

const arabic = /[؀-ۿ]/;
const res = (o: Partial<RaidResult> = {}): RaidResult => ({ success: true, bombersLost: 1, bombersTotal: 12, kills: 4, fate: 'home', ...o });

beforeEach(() => { stubStorage(); });
afterEach(() => { setLang('en'); });

describe('historical raids: the data', () => {
  it('four famous raids with their commonly cited numbers', () => {
    expect(RAIDS.map((r) => r.id)).toEqual(['sr', 'bt', 'bw', 'bn']);
    const sr = raidById('sr')!, bt = raidById('bt')!, bw = raidById('bw')!, bn = raidById('bn')!;
    expect([sr.dispatched, sr.lost, sr.date]).toEqual([376, 60, '17 August 1943']);
    expect([bt.dispatched, bt.lost, bt.writtenOff, bt.date]).toEqual([291, 60, 17, '14 October 1943']);
    expect([bw.lost, bw.fighters]).toEqual([226, 262]);
    expect([bn.dispatched, bn.lost, bn.date]).toEqual([730, 69, '6 March 1944']);
    expect(pct(lossRate(sr))).toBe('16%');
    expect(pct(lossRate(bt))).toBe('21%');
    expect(pct(lossRate(bw))).toBe('5.9%');
    expect(pct(lossRate(bn))).toBe('9.5%');
    // escort follows the date: none in 1943, most of the way in Big Week, all the way to Berlin
    expect(RAIDS.map((r) => r.escort)).toEqual(['none', 'none', 'partial', 'full']);
    // Schweinfurt-Regensburg is two forces; their losses add up to the day's
    expect(sr.forces.map((f) => f.label)).toEqual(['Regensburg force', 'Schweinfurt force']);
    for (const r of RAIDS) for (const f of r.forces) expect(f.briefing.join(' '), f.label).toContain(String(r.id === 'bw' ? r.lost : r.lost));
  });

  it('ids round-trip and never collide with the Tour or the side raids', () => {
    for (const r of RAIDS) r.forces.forEach((_, i) => {
      const id = histId(r.id, i);
      expect(isHistoricalId(id)).toBe(true);
      expect(isTourId(id) || isRaidId(id)).toBe(false);
      expect(parseHistId(id)).toEqual({ raid: r, force: i });
    });
    expect(parseHistId('hist-bt-1')).toBeNull();   // Black Thursday has one force
    expect(parseHistId('hist-xx-0')).toBeNull();
    expect(isHistoricalId('tour-1-0')).toBe(false);
  });
});

describe('historical raids: the mission', () => {
  it('every force flies a valid gunner mission on its real date and target', () => {
    for (const r of RAIDS) r.forces.forEach((f, i) => {
      const m = raidMission(r.id, i);
      expect(m.id).toBe(histId(r.id, i));
      expect(m.role).toBe('gunner');
      expect(m.number).toBe(0);   // no "mission N of 12" badge
      expect([m.title, m.date, m.target, m.station]).toEqual([r.title, r.date, f.target, f.station]);
      expect(m.bombers).toBe(12);
      expect(m.briefing).toEqual(f.briefing);
      expect(m.objectives.at(-1)).toBe(`Lose no more than ${m.maxBombersLost} bombers`);
      expect(m.round ?? m.waves.length).toBeTruthy();
    });
    const regensburg = raidMission('sr', 0), schweinfurt = raidMission('sr', 1);
    expect(regensburg.shuttle).toBe(true);                 // on to North Africa
    expect(schweinfurt.shuttle).toBeFalsy();
    expect(schweinfurt.enemyTypes).toEqual(['fw190', 'bf109', 'bf110']);   // a 1944 base flown with 1943 fighters
    expect(schweinfurt.escortArrive).toBeUndefined();
    expect(raidMission('bn').escortArrive).toBeGreaterThan(0);
  });

  it('the fighter pressure follows the real loss rate', () => {
    const k = Object.fromEntries(RAIDS.map((r) => [r.id, pressure(r)]));
    expect(k.bt).toBeGreaterThan(k.sr);
    expect(k.sr).toBeGreaterThan(k.bn);
    expect(k.bn).toBeGreaterThan(k.bw);
    for (const v of Object.values(k)) { expect(v).toBeGreaterThanOrEqual(0.82); expect(v).toBeLessThanOrEqual(1.12); }
    const dp2 = DEEP_PENETRATION.find((m) => m.id === 'dp2')!, bt = raidMission('bt');
    expect(bt.round!.max).toBeGreaterThanOrEqual(dp2.round!.max);
    const dp3 = DEEP_PENETRATION.find((m) => m.id === 'dp3')!, bw = raidMission('bw');
    expect(bw.round!.max).toBeLessThan(dp3.round!.max);
  });

  it('never mutates the base missions', () => {
    const before = JSON.stringify([...CAMPAIGN, ...DEEP_PENETRATION]);
    for (const r of RAIDS) r.forces.forEach((_, i) => { const m = raidMission(r.id, i); m.briefing.push('x'); m.round && (m.round.max = 99); });
    expect(JSON.stringify([...CAMPAIGN, ...DEEP_PENETRATION])).toBe(before);
    expect(raidMission('nope').id).toBe(histId('sr', 0));
    expect(raidMission('sr', 9).id).toBe(histId('sr', 1));
  });
});

describe('historical raids: you against history', () => {
  it('verdicts against the scaled losses', () => {
    // Schweinfurt-Regensburg: 16 % = 1.9 of 12
    const even = compareRaid('sr', res({ bombersLost: 2 }));
    expect(even.verdict).toBe('even');
    expect(even.histInGroup).toBe(1.9);
    expect(even.histFightersInGroup).toBe(0.9);
    expect(compareRaid('sr', res({ bombersLost: 1 })).verdict).toBe('better');
    expect(compareRaid('sr', res({ bombersLost: 3 })).verdict).toBe('worse');
    expect(compareRaid('sr', res({ bombersLost: 0, success: false })).verdict).toBe('failed');
    // Big Week, 5.9 %: losing none beats it, one of twelve (8.3 %) is about the same, two is worse
    expect(compareRaid('bw', res({ bombersLost: 0 })).verdict).toBe('better');
    expect(compareRaid('bw', res({ bombersLost: 1 })).verdict).toBe('even');
    expect(compareRaid('bw', res({ bombersLost: 2 })).verdict).toBe('worse');
    expect(EVEN_MARGIN).toBeLessThan(1 / 12);
  });

  it('cleans bad inputs', () => {
    const c = compareRaid('bt', res({ bombersLost: 40, bombersTotal: 0 }));
    expect(c.result.bombersTotal).toBe(1);
    expect(c.result.bombersLost).toBe(1);
    expect(c.yourRate).toBe(1);
    expect(compareRaid('bt', res({ bombersLost: NaN })).result.bombersLost).toBe(0);
  });

  it('keeps the best result per raid and counts sorties', () => {
    let recs = {};
    let out = recordRaid(recs, compareRaid('bt', res({ bombersLost: 4 })));
    expect(out.newBest).toBe(true);
    recs = out.records;
    out = recordRaid(recs, compareRaid('bt', res({ success: false, bombersLost: 0 })));
    expect(out.newBest).toBe(false);   // a miss never beats a hit
    recs = out.records;
    out = recordRaid(recs, compareRaid('bt', res({ bombersLost: 1, kills: 2 })));
    expect(out.newBest).toBe(true);
    recs = out.records;
    out = recordRaid(recs, compareRaid('bt', res({ bombersLost: 1, kills: 5 })));
    expect(out.newBest).toBe(true);     // same losses, more kills
    expect(out.records.bt).toEqual({ flown: 4, best: { verdict: 'better', lost: 1, total: 12, kills: 5 } });
    saveRecords(out.records);
    expect(loadRecords()).toEqual(out.records);
  });

  it('survives garbage in storage', () => {
    localStorage.setItem(RAIDS_KEY, '{nope');
    expect(loadRecords()).toEqual({});
    expect(sanitizeRecords({ bt: { flown: -3, best: { verdict: 'great', lost: 1, total: 12 } }, xx: { flown: 2 }, bn: 'x' }))
      .toEqual({ bt: { flown: 0, best: null } });
    expect(sanitizeRecords({ sr: { flown: 2.7, best: { verdict: 'even', lost: 20, total: 12, kills: 'a' } } }))
      .toEqual({ sr: { flown: 2, best: { verdict: 'even', lost: 12, total: 12, kills: 0 } } });
    expect(sanitizeRecords(null)).toEqual({});
  });
});

describe('historical raids: menu and Arabic', () => {
  it('has a Hangar entry', () => {
    const crew = HANGAR_TABS.find((t) => t.id === 'crew')!;
    expect(crew.entries.map((e) => e[0])).toContain('raids');
  });

  it('every player-visible text is translated', () => {
    const texts = new Set<string>([
      'Historical Raids', 'Famous raids with their real numbers', 'HISTORICAL RAIDS', 'HISTORICAL RAID', 'Fly the famous raids',
      'Four raids of the Eighth Air Force with their real numbers. Your group of twelve is measured against what really happened.',
      'Dispatched', 'Sorties', 'Lost', 'Loss rate', 'Not flown yet', 'Escort', 'Airmen lost', 'Luftwaffe fighters lost', 'Force', 'Target', 'Fly this raid',
      'A new best for this raid.', 'Your group', 'History, the whole raid', 'Bombers lost', 'Fighters downed', 'Your ship', 'Reached North Africa',
      'What really happened', 'Back to Historical Raids', 'Back',
      ...Object.values(ESCORT_LABEL), ...Object.values(VERDICT_TITLE), ...Object.values(VERDICT_TEXT), ...Object.values(FATE_LABEL),
    ]);
    for (const r of RAIDS) {
      [r.title, r.date, r.outcome, r.note].forEach((t) => texts.add(t));
      r.forces.forEach((f, i) => {
        [f.label, f.target, f.success, ...f.briefing].forEach((t) => texts.add(t));
        const m = raidMission(r.id, i);
        [m.title, m.target, m.date, m.success!, ...m.objectives, ...m.briefing].forEach((t) => texts.add(t));
      });
    }
    const templates: [string, Record<string, string | number>][] = [
      ['Your best: {lost} of {total} lost · {verdict}', { lost: 1, total: 12, verdict: tx('Better than history') }],
      ['about {n}', { n: '3,800' }], ['Historical raid · {title}', { title: 'x' }], ['History, scaled to {n} ships', { n: 12 }],
      ['A further {n} bombers were wrecked on return and never flew again.', { n: 17 }],
      ['The bomber gunners claimed {claims} fighters that day; the Luftwaffe actually lost about {n}.', { claims: 288, n: 27 }],
    ];
    setLang('ar');
    for (const t of texts) { expect(hasPhrase(t), t).toBe(true); expect(tx(t), t).toMatch(arabic); }
    for (const [t, v] of templates) {
      expect(hasPhrase(t), t).toBe(true);
      const out = tx(t, v);
      expect(out, t).toMatch(arabic);
      expect(out, t).not.toMatch(/\{\w+\}/);
    }
  });
});

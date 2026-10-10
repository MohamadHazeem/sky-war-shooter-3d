import { describe, it, expect, beforeEach } from 'vitest';
import { CAMPAIGN, type Mission } from '../src/game/Missions';
import {
  CAMPAIGN_KEY, ESCORT_THRESHOLD, FULL_SQUADRON, applyModifiers, applyOutcome, campaignMeritMult, currentGap, currentStory,
  defaultCampaign, enemyMult, escortAvailability, expectedDone, isCurrentOp, loadCampaign, migrateFromProgress, modifiersFor,
  offeredRaids, opInfo, prepareCampaignMission, reconcile, recordCampaignOutcome, sanitize, startNewTour, totals, type CampaignData,
} from '../src/game/CampaignState';
import { RAID_TEMPLATES, raidEnemyType, sideRaidById, sideRaidsFor } from '../src/game/SideRaids';
import { briefingMapSvg } from '../src/ui/BriefingMap';
import { stubStorage } from './helpers';

const byId = (id: string) => CAMPAIGN.find((m) => m.id === id)!;
const win = (d: CampaignData, m: Mission, lost = 2, kills = 6) => applyOutcome(d, opInfo(d, m)!, { success: true, kills, bombersLost: lost, bombersTotal: m.bombers });
const lose = (d: CampaignData, m: Mission, lost = 5) => applyOutcome(d, opInfo(d, m)!, { success: false, kills: 2, bombersLost: lost, bombersTotal: m.bombers });
// play story missions 0..n-1 with average results
const after = (n: number, d = defaultCampaign(7)) => { for (let i = 0; i < n; i++) d = win(d, CAMPAIGN[i]).data; return d; };

describe('campaign state transitions', () => {
  it('starts at full strength with neutral modifiers on mission 1', () => {
    const d = defaultCampaign(1);
    expect(currentStory(d)!.id).toBe(CAMPAIGN[0].id);
    expect(currentGap(d)).toBe(0);
    expect(offeredRaids(d)).toEqual([]);
    const mods = modifiersFor(d, CAMPAIGN[0])!;
    expect(mods.enemy).toBe(1);
    expect(mods.bombers).toBe(CAMPAIGN[0].bombers);
    expect(mods.escortArrive).toBeUndefined(); // no long-range escort in September 1943
    expect(modifiersFor(d, CAMPAIGN[1])).toBeNull(); // not the current operation
  });

  it('a story win advances the tour, weakens the Luftwaffe, books losses and replacements', () => {
    const d0 = defaultCampaign(1);
    const { data: d, report } = win(d0, CAMPAIGN[0], 4);
    expect(d.storyDone).toEqual([CAMPAIGN[0].id]);
    expect(d.luftwaffe).toBeLessThan(d0.luftwaffe);
    expect(d.squadron).toBe(FULL_SQUADRON - 4 + 2);
    expect(currentStory(d)!.id).toBe(CAMPAIGN[1].id);
    expect(report.effect).toBe(true);
    expect(report.lines.map((l) => l.gauge)).toEqual(expect.arrayContaining(['luftwaffe', 'squadron', 'morale', 'note']));
    expect(d.report).toBe(report);
    expect(d0.storyDone).toEqual([]); // pure: the old state is untouched
  });

  it('a failure keeps the mission current, strengthens the Luftwaffe and costs morale', () => {
    const d0 = defaultCampaign(1);
    const { data: d } = lose(d0, CAMPAIGN[0]);
    expect(d.storyDone).toEqual([]);
    expect(d.luftwaffe).toBeGreaterThan(d0.luftwaffe);
    expect(d.morale).toBeLessThan(d0.morale);
    expect(currentStory(d)!.id).toBe(CAMPAIGN[0].id);
  });

  it('replays of finished missions leave the state alone', () => {
    const d = after(3);
    const r = win(d, CAMPAIGN[0]);
    expect(r.data).toBe(d);
    expect(r.report.effect).toBe(false);
  });

  it('heavy losses shrink later formations; replacements bring them back', () => {
    let d = defaultCampaign(3);
    d = win(d, CAMPAIGN[0], 9).data;   // 18 - 9 + 2 = 11 ships
    const m = currentStory(d)!;
    const mods = modifiersFor(d, m)!;
    expect(d.squadron).toBe(11);
    expect(mods.bombers).toBeLessThan(m.bombers);
    expect(mods.bombers).toBeGreaterThanOrEqual(Math.round(m.bombers * 2 / 3));
    for (let i = 1; i < 4; i++) d = win(d, CAMPAIGN[i], 0).data;
    expect(d.squadron).toBe(17);
    expect(modifiersFor(d, currentStory(d)!)!.bombers).toBe(currentStory(d)!.bombers);
  });

  it('keeps the Luftwaffe effect on enemies within ±20%', () => {
    expect(enemyMult(50)).toBeCloseTo(0.8);
    expect(enemyMult(150)).toBeCloseTo(1.2);
    expect(enemyMult(0)).toBeCloseTo(0.8);
    expect(enemyMult(400)).toBeCloseTo(1.2);
    let d = defaultCampaign(5);
    for (let i = 0; i < 40; i++) d = lose(d, CAMPAIGN[0], 0).data;
    expect(d.luftwaffe).toBe(150);
    expect(modifiersFor(d, CAMPAIGN[0])!.enemy).toBeCloseTo(1.2);
  });

  it('completes the tour after the last story mission', () => {
    const d = after(CAMPAIGN.length);
    expect(d.complete).toBe(true);
    expect(currentStory(d)).toBeNull();
    expect(d.report!.lines.at(-1)!.text).toMatch(/summary/);
    expect(totals(d).sorties).toBe(CAMPAIGN.length);
  });
});

describe('side raids', () => {
  it('offers 2-3 raids between story missions, deterministic per seed', () => {
    for (let g = 1; g < CAMPAIGN.length; g++) {
      const a = sideRaidsFor(42, g), b = sideRaidsFor(42, g);
      expect(a.length).toBeGreaterThanOrEqual(2);
      expect(a.length).toBeLessThanOrEqual(3);
      expect(a.map((r) => r.mission.id)).toEqual(b.map((r) => r.mission.id));
      expect(new Set(a.map((r) => r.template.kind)).size).toBe(a.length);
      for (const r of a) {
        const m = r.mission;
        expect(m.id).toMatch(new RegExp(`^raid-${g}-`));
        expect(m.number).toBe(0);
        expect(m.round, m.id).toBeDefined();
        expect(m.rounds).toBe(2);
        expect(m.weather?.mood).toBeTruthy();
        expect(Number.isNaN(Date.parse(m.date))).toBe(false);
        expect(Date.parse(m.date)).toBeGreaterThanOrEqual(Date.parse(CAMPAIGN[g - 1].date));
        expect(Date.parse(m.date)).toBeLessThanOrEqual(Date.parse(CAMPAIGN[g].date));
        if (m.bombsAway) expect(m.bombsAway).toBeLessThan(m.duration);
        expect(briefingMapSvg(m), m.target).toContain('<svg');
        expect(sideRaidById(42, m.id)).toBe(r);
      }
    }
    expect(sideRaidsFor(42, 0)).toEqual([]);
    expect(sideRaidsFor(42, CAMPAIGN.length)).toEqual([]);
  });

  it('uses every template somewhere in a tour, with its own enemy mix', () => {
    const kinds = new Set<string>();
    for (let g = 1; g < CAMPAIGN.length; g++) for (const r of sideRaidsFor(9, g)) kinds.add(r.template.kind);
    expect(kinds.size).toBe(RAID_TEMPLATES.length);
    const r = sideRaidsFor(9, 1)[0];
    const types = new Set(Array.from({ length: 200 }, () => raidEnemyType(r.mission)));
    for (const t of types) expect(r.template.mix.map(([e]) => e)).toContain(t);
    expect(raidEnemyType(CAMPAIGN[0])).toBeNull();
  });

  it('one raid per gap: the first one flown closes the others', () => {
    const d = after(1);
    const [a, b] = offeredRaids(d);
    expect(isCurrentOp(d, a.mission)).toBe(true);
    const { data } = win(d, a.mission, 0);
    expect(data.raids).toEqual([{ gap: 1, id: a.mission.id, success: true }]);
    expect(isCurrentOp(data, b.mission)).toBe(false);
    expect(win(data, b.mission).report.effect).toBe(false);
    expect(data.storyDone.length).toBe(1); // raids never advance the story
  });

  it('airfield raids weaken the Luftwaffe and can bring the P-51s in early', () => {
    // find a seed whose gap before mission 5 (30 December 1943) offers an airfield raid
    let seed = 1, raid = null as ReturnType<typeof sideRaidsFor>[number] | null;
    for (; seed < 500 && !raid; seed++) raid = sideRaidsFor(seed, 4).find((r) => r.template.kind === 'airfield') ?? null;
    expect(raid).toBeTruthy();
    const d = after(4, defaultCampaign(seed - 1));
    const m = currentStory(d)!;
    expect(m.role).toBe('gunner');
    expect(escortAvailability(d)).toBeLessThan(ESCORT_THRESHOLD);
    expect(modifiersFor(d, m)!.escortArrive).toBeUndefined();
    const { data, report } = win(d, raid!.mission, 0);
    expect(data.luftwaffe).toBe(d.luftwaffe - 8);
    expect(escortAvailability(data)).toBeGreaterThanOrEqual(ESCORT_THRESHOLD);
    expect(report.lines.some((l) => l.gauge === 'escort' && /Mustangs will now join/.test(l.text))).toBe(true);
    const mods = modifiersFor(data, m)!;
    expect(mods.escortArrive).toBeGreaterThan(0);
    expect(mods.escortArrive!).toBeLessThan(m.duration);
  });

  it('U-boat raids bring replacement crews early', () => {
    let seed = 1, raid = null as ReturnType<typeof sideRaidsFor>[number] | null;
    for (; seed < 500 && !raid; seed++) raid = sideRaidsFor(seed, 1).find((r) => r.template.kind === 'uboat') ?? null;
    let d = defaultCampaign(seed - 1);
    d = win(d, CAMPAIGN[0], 8).data;
    const { data } = win(d, raid!.mission, 0);
    expect(data.squadron).toBe(d.squadron + 2 + 3);
  });
});

describe('mission modifiers', () => {
  const clone = (m: Mission): Mission => JSON.parse(JSON.stringify(m));

  it('applies in place, idempotently, and restores the mission as written', () => {
    const m = clone(byId('m4')); // pilot mission, 12 bombers, "Lose no more than 7 bombers"
    const orig = clone(m);
    const mods = { enemy: 1.2, skill: 1.1, bombers: 9, meritMult: 1 };
    applyModifiers(m, mods);
    const once = clone(m);
    applyModifiers(m, mods);
    expect(m).toEqual(once);
    expect(m.bombers).toBe(9);
    expect(m.maxBombersLost).toBe(Math.round(orig.maxBombersLost! * 9 / 12));
    expect(m.objectives.join()).toContain(`Lose no more than ${m.maxBombersLost} bombers`);
    expect(m.round!.max).toBe(Math.round(orig.round!.max * 1.2));
    expect(m.round!.skill[1]).toBeCloseTo(orig.round!.skill[1] * 1.1, 2);
    applyModifiers(m, null);
    expect(m).toEqual(orig);
  });

  it('prepareCampaignMission only touches current operations', () => {
    stubStorage({ [CAMPAIGN_KEY]: { ...defaultCampaign(3), luftwaffe: 140, squadron: 10 } });
    const m1 = CAMPAIGN[0], m2 = CAMPAIGN[1];
    const b1 = m1.bombers, max1 = m1.round!.max, r2 = { ...m2.round! };
    prepareCampaignMission(m1, { unlocked: 0, medals: {} });
    expect(m1.bombers).toBeLessThan(b1);
    expect(m1.round!.max).toBe(Math.round(max1 * enemyMult(140))); // scaled up by the strong Luftwaffe
    expect(m1.round!.max).toBeGreaterThan(max1);
    prepareCampaignMission(m2, { unlocked: 0, medals: {} });
    expect(m2.round).toEqual(r2);
    applyModifiers(m1, null);
    expect(m1.bombers).toBe(b1);
    const surv = { ...CAMPAIGN[0], id: 'survival-gunner' };
    expect(prepareCampaignMission(surv, { unlocked: 0 })).toBe(surv);
  });
});

describe('save migration', () => {
  beforeEach(() => { stubStorage(); });

  it('counts finished story missions from the old unlocked index and the last Air Medal', () => {
    expect(expectedDone({ unlocked: 0 })).toBe(0);
    expect(expectedDone({ unlocked: 4 })).toBe(4);
    expect(expectedDone({ unlocked: 99 })).toBe(CAMPAIGN.length - 1);
    expect(expectedDone({ unlocked: -3 })).toBe(0);
    expect(expectedDone({ unlocked: NaN as unknown as number })).toBe(0);
    expect(expectedDone({ unlocked: CAMPAIGN.length - 1, medals: { [CAMPAIGN.at(-1)!.id]: ['Air Medal'] } })).toBe(CAMPAIGN.length);
  });

  it('migrates an existing profile into the campaign', () => {
    const d = migrateFromProgress({ unlocked: 5, medals: {} }, 11);
    expect(d.storyDone).toEqual(CAMPAIGN.slice(0, 5).map((m) => m.id));
    expect(d.luftwaffe).toBeLessThan(100);
    expect(d.report?.title).toMatch(/transferred/);
    expect(d.raids).toEqual([]);
    expect(currentStory(d)!.id).toBe(CAMPAIGN[5].id);
    const done = migrateFromProgress({ unlocked: CAMPAIGN.length - 1, medals: { [CAMPAIGN.at(-1)!.id]: ['Air Medal'] } });
    expect(done.complete).toBe(true);
    const fresh = migrateFromProgress({ unlocked: 0, medals: {} });
    expect(fresh.storyDone).toEqual([]);
    expect(fresh.report).toBeNull();
  });

  it('loads from the old progress key when there is no campaign save, and writes sws3d.campaign.v2', () => {
    const s = stubStorage({ 'sws3d.progress.v1': { unlocked: 3, medals: {}, best: {}, survival: [], layout: 2 } });
    const d = loadCampaign();
    expect(d.storyDone.length).toBe(3);
    const saved = JSON.parse(s.getItem(CAMPAIGN_KEY)!);
    expect(saved.v).toBe(2);
    expect(saved.storyDone).toEqual(d.storyDone);
    // and reads it back unchanged
    expect(loadCampaign()).toEqual(d);
  });

  it('survives corrupt saves', () => {
    for (const bad of ['{nope', '"text"', '{"v":1}', 'null', '[]']) {
      const s = stubStorage({ 'sws3d.progress.v1': { unlocked: 2, medals: {} } });
      s.setItem(CAMPAIGN_KEY, bad);
      expect(loadCampaign().storyDone.length).toBe(2);
    }
    const d = sanitize({ v: 2, seed: 5, luftwaffe: 999, squadron: -4, morale: 'x', storyDone: ['m1', 'm9', 'm2'], raids: [{ id: 'evil' }, { gap: 1, id: 'raid-1-oil', success: 1 }], history: 7 })!;
    expect(d.luftwaffe).toBe(150);
    expect(d.squadron).toBe(6);
    expect(d.morale).toBe(65);
    expect(d.storyDone).toEqual(['m1']); // only a prefix of the campaign order counts
    expect(d.raids).toEqual([{ gap: 1, id: 'raid-1-oil', success: true }]);
    expect(d.history).toEqual([]);
  });

  it('reconciles with progress made elsewhere, and rebuilds when progress went backwards', () => {
    const d = after(2, defaultCampaign(4));
    const ahead = reconcile(d, { unlocked: 5 });
    expect(ahead.storyDone.length).toBe(5);
    expect(ahead.seed).toBe(4);
    const behind = reconcile(after(6, defaultCampaign(4)), { unlocked: 1 });
    expect(behind.storyDone.length).toBe(1);
    expect(reconcile(d, { unlocked: 2 })).toBe(d);
    // a second tour is not tied to the old index
    const t2 = { ...defaultCampaign(4, 2) };
    expect(reconcile(t2, { unlocked: 11 })).toBe(t2);
  });

  it('records the real result even though Game moved progress.unlocked on first', () => {
    const s = stubStorage();
    const progress = { unlocked: 0, medals: {} as Record<string, string[]>, best: {} };
    prepareCampaignMission(CAMPAIGN[0], progress);    // mission start saves the state
    const mult = campaignMeritMult(CAMPAIGN[0], progress);
    expect(mult).toBeCloseTo(0.9 + 0.2 * 0.65);
    progress.unlocked = 1;                             // Game.showDebrief, before the hook
    const res = recordCampaignOutcome(CAMPAIGN[0], { success: true, kills: 13, bombersLost: 0, bombersTotal: 9 }, progress)!;
    expect(res.report.effect).toBe(true);
    expect(res.data.history).toEqual([{ id: CAMPAIGN[0].id, kind: 'story', title: CAMPAIGN[0].title, success: true, kills: 13, lost: 0 }]);
    expect(JSON.parse(s.getItem(CAMPAIGN_KEY)!).storyDone).toEqual([CAMPAIGN[0].id]);
    expect(CAMPAIGN[0].bombers).toBe(9); // back to the mission as written
    // a side raid now pays its merit bonus once
    const raid = offeredRaids(res.data)[0];
    const rr = recordCampaignOutcome(raid.mission, { success: true, kills: 4, bombersLost: 1, bombersTotal: 9 }, progress)!;
    expect(rr.reward).toBe(raid.template.reward);
    expect(recordCampaignOutcome(raid.mission, { success: true, kills: 4, bombersLost: 1, bombersTotal: 9 }, progress)!.reward).toBe(0);
    expect(recordCampaignOutcome({ ...CAMPAIGN[0], id: 'survival-pilot' }, { success: true, kills: 1, bombersLost: 0, bombersTotal: 1 }, progress)).toBeNull();
  });

  it('a new tour starts over with a fresh seed', () => {
    const d = after(CAMPAIGN.length, defaultCampaign(3));
    const n = startNewTour(d);
    expect(n.tour).toBe(2);
    expect(n.storyDone).toEqual([]);
    expect(n.complete).toBe(false);
    expect(loadCampaign({ unlocked: 11, medals: {} }).tour).toBe(2);
  });
});

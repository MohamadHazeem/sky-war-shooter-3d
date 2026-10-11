import { beforeEach, describe, expect, it } from 'vitest';
import { CAMPAIGN, isBossRound } from '../src/game/Missions';
import { applyOutcome, campaignOperations, currentStory, defaultCampaign, escortAvailability, loadCampaign, migrateFromProgress, modifiersFor, opInfo, prepareCampaignMission, recordCampaignOutcome, sanitize, saveCampaign, secondTourMedal, startNewTour, startSecondTour } from '../src/game/CampaignState';
import { secondTourDifficulty, secondTourKind, secondTourMission, secondTourSturmbock, SECOND_TOUR_MEDAL } from '../src/game/SecondTour';
import { buildScene, type CrewRoomCtx } from '../src/game/CrewRoom';
import { hasPhrase, setLang, tx } from '../src/i18n';
import { stubStorage } from './helpers';
import type { Fighter } from '../src/world/Aircraft';

const finished = () => migrateFromProgress({ unlocked: 11, medals: { [CAMPAIGN.at(-1)!.id]: ['Air Medal'] } }, 7);
const win = { success: true, kills: 9, bombersLost: 0, bombersTotal: 12, score: 1200 };
beforeEach(() => { stubStorage(); setLang('en'); });

describe('second-tour generation', () => {
  it('is deterministic without sharing mutable missions and spans roles, targets, weather and 1944–45', () => {
    const kinds = new Set(), moods = new Set(), roles = new Set();
    for (let i = 0; i < 50; i++) {
      const a = secondTourMission(7, i), b = secondTourMission(7, i);
      expect(a).toEqual(b); expect(a).not.toBe(b);
      kinds.add(secondTourKind(7, i)); moods.add(a.weather?.mood); roles.add(a.role);
      expect(isBossRound(a, 1)).toBe((i + 1) % 5 === 0);
      expect(isBossRound(a, 0)).toBe(false);
      expect(Number.isFinite(Date.parse(a.date))).toBe(true);
      expect(Date.parse(a.date)).toBeGreaterThan(Date.parse(CAMPAIGN.at(-1)!.date));
      expect(a.bombsAway ?? 0).toBeLessThan(a.duration);
    }
    expect(kinds.size).toBe(6); expect(moods.size).toBe(5); expect(roles.size).toBe(2);
    expect(secondTourMission(7, 1).weather?.front).toBeTruthy();
    expect(secondTourMission(7, 24).date).toContain('1945');
    expect(secondTourMission(8, 0)).not.toEqual(secondTourMission(7, 0));
  });

  it('escalates opposition while capping counts and keeping strategic strength relevant', () => {
    const early = secondTourMission(7, 0), late = secondTourMission(7, 24), endless = secondTourMission(7, 10000);
    expect(late.round!.max).toBeGreaterThan(early.round!.max);
    expect(late.round!.skill[1]).toBeGreaterThan(early.round!.skill[1]);
    expect(secondTourDifficulty(10000)).toBeLessThanOrEqual(1.85);
    expect(endless.round!.max).toBeLessThanOrEqual(17);
    expect(early.enemyTypes).not.toContain('me262');
    expect(secondTourMission(7, 8).enemyTypes).toContain('me262');
    expect(late.enemyTypes).toContain('me163');
    const d = startSecondTour(finished());
    const strong = modifiersFor({ ...d, luftwaffe: 150 }, early)!;
    const weak = modifiersFor({ ...d, luftwaffe: 50, squadron: 6, morale: 10 }, early)!;
    expect(strong.enemy).toBeGreaterThan(weak.enemy); expect(strong.bombers).toBeGreaterThan(weak.bombers);
    expect(strong.meritMult).toBeGreaterThan(weak.meritMult);
    expect(escortAvailability({ ...d, escortBonus: 0, secondTour: { completed: 24, score: 0, medal: false } })).toBeGreaterThan(escortAvailability({ ...d, escortBonus: 0 }));
    const f = { enemyType: 'fw190', structure: 100, maxStructure: 100, zones: [{ hp: 100, maxHp: 100 }] } as Fighter;
    secondTourSturmbock(early, f); expect(f.structure).toBe(100);
    secondTourSturmbock(late, f); expect(f.structure).toBe(140); expect(f.zones[0].hp).toBe(130);
  });
});

describe('second-tour persistence and outcomes', () => {
  it('leaves legacy repeat tours as story tours and carries strategy and the independent Experten save forward', () => {
    const old = defaultCampaign(4, 2);
    expect(sanitize(old)?.secondTour).toBeUndefined();
    expect(currentStory(sanitize(old)!)!.id).toBe(CAMPAIGN[0].id);
    localStorage.setItem('sws3d.nemesis.v1', 'unchanged');
    const d = finished(), n = startSecondTour(d);
    expect(n.luftwaffe).toBe(d.luftwaffe); expect(n.squadron).toBe(d.squadron);
    expect(localStorage.getItem('sws3d.nemesis.v1')).toBe('unchanged');
    expect(loadCampaign({ unlocked: 0 }).secondTour).toEqual(n.secondTour);
    expect(startSecondTour(defaultCampaign()).secondTour).toBeUndefined();
    expect(startNewTour(d).secondTour).toBeUndefined();
  });

  it('retries failures, records once, awards the 25th win and continues endlessly after save/load', () => {
    let d = startSecondTour(finished());
    const m = currentStory(d)!;
    const failed = applyOutcome(d, opInfo(d, m)!, { ...win, success: false });
    expect(failed.data.secondTour?.completed).toBe(0);
    expect(failed.data.luftwaffe).toBeGreaterThan(d.luftwaffe);
    prepareCampaignMission(m);
    const once = structuredClone(m); prepareCampaignMission(m); expect(m).toEqual(once);
    const res = recordCampaignOutcome(m, win)!;
    expect(res.data.secondTour?.score).toBe(1200);
    expect(recordCampaignOutcome(m, win)!.report.effect).toBe(false);
    d = res.data;
    for (let i = 1; i < 27; i++) {
      saveCampaign(d);
      const next = currentStory(d)!;
      expect(secondTourMedal(next, true)).toEqual(i === 24 ? [SECOND_TOUR_MEDAL] : []);
      expect(secondTourMedal(next, false)).toEqual([]);
      d = recordCampaignOutcome(next, win)!.data;
    }
    expect(d.secondTour).toEqual({ completed: 27, score: 32400, medal: true });
    expect(loadCampaign().secondTour).toEqual(d.secondTour);
    expect(currentStory(loadCampaign())!.number).toBe(28);
    expect(d.complete).toBe(false);
    expect(campaignOperations({ ...d, secondTour: { ...d.secondTour!, completed: 10000 } })).toHaveLength(25);
  });

  it('sanitizes damaged generated saves and accepts old v2 data', () => {
    expect(sanitize({ ...finished(), secondTour: { completed: -4, score: 'bad', medal: true } })?.secondTour).toEqual({ completed: 0, score: 0, medal: false });
    expect(sanitize({ ...finished(), secondTour: { completed: 30, score: 10 } })?.complete).toBe(false);
    expect(sanitize(finished())?.complete).toBe(true);
  });
});

it('reuses a short outcome-driven crew-room scene without story dialogue', () => {
  const ctx: CrewRoomCtx = { mission: 'tour2-7-0', role: 'gunner', kills: 6, shots: 100, hits: 30, lost: 0, total: 12, hospital: [], patched: [], rookies: [], aces: [], luftwaffe: 65 };
  const scene = buildScene(ctx.mission, ctx)!;
  expect(scene.lines.length).toBeGreaterThan(0); expect(scene.lines.length).toBeLessThanOrEqual(3);
  expect(scene.v.open).toEqual([]); expect(scene.v.close).toEqual([]);
});

it('translates generated mission text and reports into Arabic', () => {
  setLang('ar');
  for (let seed = 1; seed <= 6; seed++) for (let i = 0; i < 30; i++) {
    const m = secondTourMission(seed, i);
    for (const text of [m.title, m.target, m.date, ...m.briefing, ...m.objectives, m.success!]) {
      expect(hasPhrase(text), text).toBe(true);
      expect(tx(text), text).toMatch(/[\u0600-\u06ff]/);
      expect(tx(text), text).not.toMatch(/[a-z]{3,}/i);
    }
    const d = { ...startSecondTour(finished()), seed, secondTour: { completed: i, score: 0, medal: false } };
    for (const l of applyOutcome(d, opInfo(d, m)!, win).report.lines) expect(hasPhrase(l.text), l.text).toBe(true);
  }
  setLang('en');
});

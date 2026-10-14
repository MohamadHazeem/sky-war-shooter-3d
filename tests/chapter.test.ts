import { describe, it, expect, beforeEach } from 'vitest';
import { DEEP_PENETRATION as missions, chapterUnlocked, chapterCompleted, chapterCanFly } from '../src/game/DeepPenetration';
import { CAMPAIGN, isBossRound } from '../src/game/Missions';
import { defaultCampaign, migrateFromProgress, loadCampaign, saveCampaign, startSecondTour, currentStory, prepareCampaignMission } from '../src/game/CampaignState';
import { scheduledTactic, TacticSchedule } from '../src/world/LuftwaffeTactics';
import { CHAPTER_VIGNETTES } from '../src/game/ChapterCrew';
import { briefingMapSvg } from '../src/ui/BriefingMap';
import { hasPhrase, setLang, tx } from '../src/i18n';
import { stubStorage } from './helpers';
const FS = 'node:fs';
const { readFileSync, existsSync } = await import(FS);
const manifest = JSON.parse(readFileSync(new URL('../public/audio/voice/manifest.json', import.meta.url), 'utf8'));
beforeEach(() => { stubStorage(); setLang('en'); });

describe('Deep Penetration chapter', () => {
  it('keeps the original twelve stable and supplies five finite historical gunner operations', () => {
    expect(CAMPAIGN.map(m => m.id)).toEqual(['m1','m2','m8','m9','m3','m10','m4','m5','m11','m6','m7','m12']);
    expect(missions.map(m => m.date)).toEqual(['17 August 1943','14 October 1943','20 February 1944','6 March 1944','2 November 1944']);
    expect(new Set(missions.map(m => m.signature?.id)).size).toBe(5);
    expect(new Set(missions.map(m => m.targetLook)).size).toBe(5);
    for (const m of missions) {
      expect(m.role).toBe('gunner'); expect(m.rounds).toBe(1);
      expect(m.bombsAway! + 35).toBeLessThan(m.duration);
      expect(m.signature!.at).toBeLessThan(m.bombsAway!);
      expect(m.flak!.start).toBeLessThan(m.bombsAway!);
      expect(m.flak!.end).toBeGreaterThan(m.bombsAway!);
      expect(isBossRound(m, 0)).toBe(false);
      expect(briefingMapSvg(m)).toContain('<svg');
      expect(CHAPTER_VIGNETTES.find(v => v.id === m.id)).toBeDefined();
    }
    expect(briefingMapSvg(missions[0])).toContain('South to North Africa');
    expect(missions[0].shuttle).toBe(true);
  });

  it('uses date-appropriate enemy types and explicit Phase 8 tactics once per round', () => {
    const expected = ['multiAxis','airBomb','hornisse','multiAxis','sturm'];
    for (const [i, m] of missions.entries()) {
      expect(scheduledTactic(m, 0)).toBe(expected[i]);
      if (i < 4) expect(m.enemyTypes).not.toContain('me262');
      expect(m.enemyTypes).not.toContain('me163'); expect(m.enemyTypes).not.toContain('do335');
      if (i < 2) { expect(m.enemyTypes).not.toContain('me410'); expect(m.escortArrive).toBeUndefined(); }
      const schedule = new TacticSchedule();
      expect(schedule.next(m, 0, 24, 180, 0, false)).toBeNull();
      expect(schedule.next(m, 0, 30, 180, 0, true)).toBeNull();
      expect(schedule.next(m, 0, 30, 180, 0, false)).toBe(expected[i]);
      expect(schedule.next(m, 0, 45, 160, 0, false)).toBeNull();
    }
  });

  it('migrates first-tour completion without altering indexed unlocks or strategic state', () => {
    const fresh = { unlocked: 0, medals: {} };
    expect(chapterUnlocked(fresh, migrateFromProgress(fresh))).toBe(false);
    const incomplete = { unlocked: 11, medals: {} };
    expect(chapterUnlocked(incomplete, migrateFromProgress(incomplete))).toBe(false);
    const veteran = { unlocked: 11, medals: { m12: ['Air Medal'] } };
    const d = migrateFromProgress(veteran); saveCampaign(d);
    const before = JSON.stringify(d);
    expect(chapterUnlocked(veteran, d)).toBe(true);
    expect(chapterCanFly('dp1', veteran, d)).toBe(true);
    expect(chapterCanFly('dp2', veteran, d)).toBe(false);
    prepareCampaignMission(missions[0], veteran);
    expect(missions[0].escortArrive).toBeUndefined();
    expect(JSON.stringify(d)).toBe(before);
    expect(loadCampaign(veteran).complete).toBe(true);
    expect(veteran.unlocked).toBe(11);
  });

  it('keeps a second tour in progress and derives retry/replay access from persisted Air Medals', () => {
    const d = defaultCampaign(42); d.complete = true;
    startSecondTour(d);
    const saved = loadCampaign(undefined, { noReconcile: true });
    const next = currentStory(saved)!.id;
    const p = { medals: { dp1: ['Purple Heart'], dp3: ['Air Medal'] } as Record<string,string[]> };
    expect(chapterUnlocked(p, saved)).toBe(true);
    expect(chapterCompleted(p)).toBe(0); // a failed run / out-of-order record cannot skip a mission
    p.medals.dp1.push('Air Medal');
    expect(chapterCompleted(p)).toBe(1);
    expect(chapterCanFly('dp1', p, saved)).toBe(true);
    expect(chapterCanFly('dp2', p, saved)).toBe(true);
    expect(chapterCanFly('dp3', p, saved)).toBe(false);
    for (const m of missions) p.medals[m.id] = ['Air Medal'];
    localStorage.setItem('sws3d.progress.v1', JSON.stringify({ unlocked: 11, ...p }));
    expect(chapterCompleted(JSON.parse(localStorage.getItem('sws3d.progress.v1')!))).toBe(5);
    expect(currentStory(loadCampaign(undefined, { noReconcile: true }))!.id).toBe(next);
    expect(chapterCanFly('bogus', p, saved)).toBe(false);
  });

  it('translates every mission, story and chapter string and ships every voiced paragraph', () => {
    setLang('ar');
    for (const m of missions) {
      for (const s of [m.title,m.target,m.date,...m.briefing,...m.objectives,m.success!]) {
        expect(hasPhrase(s), s).toBe(true); expect(tx(s), s).toMatch(/[\u0600-\u06ff]/);
      }
      m.briefing.forEach((text, i) => {
        const id = `brief_${m.id}_${i + 1}`, clip = manifest.clips[id];
        expect(clip?.text).toBe(text); expect(clip?.dur).toBeGreaterThan(1);
        expect(existsSync(new URL(`../public/audio/voice/${id}.m4a`, import.meta.url))).toBe(true);
      });
    }
    for (const v of CHAPTER_VIGNETTES) for (const s of [v.place,v.time,...v.open.map(l => l.text),...v.close.map(l => l.text)]) expect(hasPhrase(s), s).toBe(true);
    for (const s of ['Deep Penetration','Historical chapter · 5 B-17 missions','Complete the first tour to unlock this chapter.',
      'A historical retrospective, separate from your current tour.','Chapter complete','South to North Africa','Merseburg']) expect(hasPhrase(s), s).toBe(true);
    setLang('en');
  });
});

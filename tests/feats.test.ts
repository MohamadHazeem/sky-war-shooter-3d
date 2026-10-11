import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stubStorage } from './helpers';
import {
  BRANCH_SIZE, FEATS_KEY, RAID_KINDS, TRAIN_CARS, endFeats, fullestBranch, loadFeats, quizFeats, raidKindOf, raidKindsFlown, recordRaid, trainWrecked,
  QUIZ_PERFECT, type MissionFeats,
} from '../src/game/Feats';
import { RAID_TEMPLATES, sideRaidsFor, FIRST_GAP } from '../src/game/SideRaids';
import { SKILLS, BRANCHES } from '../src/game/Skills';
import { QUIZ_ROUNDS } from '../src/game/AircraftData';
import { ACHIEVEMENTS } from '../src/game/Achievements';
import { TROPHY_ICONS } from '../src/ui/TrophyScreen';
import { hasPhrase, setLang, tx } from '../src/i18n';

const NEW_IDS = ['raider', 'strategist', 'notOverMyField', 'nightFighter', 'searchlightHunter', 'trainBuster', 'endOfLine', 'teamwork', 'weatherMan',
  'gotHimFirst', 'broughtHerHome', 'bigGunSpotter', 'he111x10', 'do335', 'specialist', 'warGames', 'weeklyWarrior', 'directorsCut', 'fullCrew',
  'recognition', 'friendOrFoe', 'roomWithView'];

const base = (o: Partial<MissionFeats> = {}): MissionFeats => ({
  id: 'm1', success: true, raidThrough: null, stormSeen: false, belly: false, trainWrecked: false, weekly: false, custom: false, ...o,
});

beforeEach(() => { stubStorage(); });
afterEach(() => { setLang('en'); });

describe('Phase 5 achievement rules (Feats.ts)', () => {
  it('reads the raid kind from a side raid id, and knows every template', () => {
    expect(RAID_KINDS.slice().sort()).toEqual(RAID_TEMPLATES.map((t) => t.kind).sort());
    for (const r of sideRaidsFor(12345, FIRST_GAP)) expect(raidKindOf(r.mission.id)).toBe(r.template.kind);
    expect(raidKindOf('raid-3-oil')).toBe('oil');
    expect(raidKindOf('raid-3-bananas')).toBeNull();
    expect(raidKindOf('m3')).toBeNull();
  });

  it('remembers the raid kinds flown (Strategist) across reloads, once each', () => {
    expect(raidKindsFlown()).toBe(0);
    expect(recordRaid('rail')).toBe(1);
    expect(recordRaid('rail')).toBe(1);
    expect(recordRaid('oil')).toBe(2);
    expect(JSON.parse(localStorage.getItem(FEATS_KEY)!).raidKinds).toEqual(['rail', 'oil']);
    localStorage.setItem(FEATS_KEY, JSON.stringify({ raidKinds: ['rail', 'nonsense', 'rail', 'uboat'] }));
    expect(loadFeats().raidKinds).toEqual(['rail', 'uboat']);
    localStorage.setItem(FEATS_KEY, '{broken');
    expect(raidKindsFlown()).toBe(0);
    const strategist = ACHIEVEMENTS.find((a) => a.id === 'strategist')!;
    expect(strategist.goal).toBe(RAID_KINDS.length);
  });

  it('a skill-tree branch is full only with every node in it', () => {
    expect(BRANCH_SIZE).toBe(6);
    const marks = SKILLS.filter((s) => s.branch === BRANCHES[0].id).map((s) => s.id);
    expect(fullestBranch([])).toBe(0);
    expect(fullestBranch(marks.slice(0, 5))).toBe(5);
    expect(fullestBranch(marks)).toBe(BRANCH_SIZE);
    // one node from each branch is not a full branch
    expect(fullestBranch(BRANCHES.map((b) => SKILLS.find((s) => s.branch === b.id)!.id))).toBe(1);
  });

  it('the whole train is the locomotive and nine wagons', () => {
    expect(Object.values(TRAIN_CARS).reduce((a, b) => a + b, 0)).toBe(10);
    expect(trainWrecked({ loco: 1, boxcar: 6, tanker: 2, flakcar: 1, truck: 3 })).toBe(true);
    expect(trainWrecked({ loco: 1, boxcar: 6, tanker: 2 })).toBe(false);
    expect(trainWrecked({ boxcar: 6, tanker: 2, flakcar: 1 })).toBe(false);
  });

  it('quiz: 10/10 is Recognition Expert, 0/10 the secret one', () => {
    expect(QUIZ_PERFECT).toBe(QUIZ_ROUNDS);
    expect(quizFeats(10, 10)).toEqual(['recognition']);
    expect(quizFeats(0, 10)).toEqual(['friendOrFoe']);
    expect(quizFeats(7, 10)).toEqual([]);
    expect(quizFeats(3, 3)).toEqual([]);   // a short quiz never counts
  });

  it('end-of-mission rules', () => {
    expect(endFeats(base())).toEqual([]);
    expect(endFeats(base({ id: 'raid-pilot', raidThrough: 0 }))).toEqual(['notOverMyField']);
    expect(endFeats(base({ id: 'raid-pilot', raidThrough: 1 }))).toEqual([]);
    expect(endFeats(base({ id: 'raid-pilot', raidThrough: 0, success: false }))).toEqual([]);
    expect(endFeats(base({ id: 'night-pilot', raidThrough: 3 }))).toEqual(['nightFighter']);
    expect(endFeats(base({ id: 'm9', stormSeen: true }))).toEqual(['weatherMan']);
    expect(endFeats(base({ id: 'm9', stormSeen: false }))).toEqual([]);
    expect(endFeats(base({ id: 'm3', stormSeen: true }))).toEqual([]);
    expect(endFeats(base({ belly: true }))).toEqual(['broughtHerHome']);
    expect(endFeats(base({ belly: true, success: false }))).toEqual([]);
    expect(endFeats(base({ id: 'custom-gunner', custom: true }))).toEqual(['warGames']);
    expect(endFeats(base({ id: 'weekly-pilot-202641', weekly: true }))).toEqual(['weeklyWarrior']);
    // the train counts even if the Mustang is lost later in the mission
    expect(endFeats(base({ id: 'strafe-pilot', trainWrecked: true, success: false }))).toEqual(['endOfLine']);
    expect(endFeats(base({ id: 'm1', trainWrecked: true }))).toEqual([]);
  });
});

describe('Phase 5 achievement definitions', () => {
  it('adds ~20 unique trophies with icons, a rarity spread and a few secrets', () => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    expect(ids.size).toBe(ACHIEVEMENTS.length);
    for (const id of NEW_IDS) expect(ids.has(id), id).toBe(true);
    const fresh = ACHIEVEMENTS.filter((a) => NEW_IDS.includes(a.id));
    expect(fresh.length).toBeGreaterThanOrEqual(18);
    for (const a of fresh) expect(TROPHY_ICONS, `${a.id} icon`).toContain(a.icon);
    expect(new Set(fresh.map((a) => a.rarity)).size).toBeGreaterThanOrEqual(4);
    expect(fresh.filter((a) => a.secret).length).toBeGreaterThanOrEqual(2);
    // every id a rule can return is defined
    const ruled = [...endFeats(base({ id: 'raid-pilot', raidThrough: 0, belly: true, custom: true, weekly: true })), ...quizFeats(0, 10), ...quizFeats(10, 10), 'endOfLine'];
    for (const id of ruled) expect(ids.has(id), id).toBe(true);
  });

  it('every achievement and the secret placeholder have Arabic', () => {
    setLang('ar');
    for (const a of ACHIEVEMENTS) {
      expect(hasPhrase(a.name), a.name).toBe(true);
      expect(hasPhrase(a.desc), a.desc).toBe(true);
      expect(tx(a.name), a.name).toMatch(/[؀-ۿ]/);
    }
    for (const s of ['Secret achievement', 'Keep flying: this one reveals itself when you earn it.']) expect(hasPhrase(s), s).toBe(true);
  });
});

describe('achievements.watch (FeatWatch hook)', () => {
  it('watchers see every mission begin and end', async () => {
    stubStorage();
    vi.resetModules();
    const { achievements } = await import('../src/game/Achievements');
    const seen: string[] = [];
    achievements.watch({ begin: (m) => seen.push(`begin ${m.id}`), end: (ok) => seen.push(`end ${ok}`) });
    achievements.endMission(true, 0, 0);            // no mission running: nothing
    achievements.beginMission({ id: 'raid-pilot', playerDamaged: false } as never);
    achievements.endMission(true, 0, 0);
    expect(seen).toEqual(['begin raid-pilot', 'end true']);
  });
});

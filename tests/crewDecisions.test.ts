import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stubStorage } from './helpers';
import {
  CrewDecisions, crewDecisions, fatigueLabel, fatigueMult, groundCrewLoadout, workEffects, SHIFTS, VETERAN_SKILL,
  VOLUNTEER, WORK_GAIN, WORK_LABEL, RESTED_BONUS,
} from '../src/game/CrewDecisions';
import { beginCrewDecisions, endCrewDecisions, decisionsApply } from '../src/game/CrewDecisionHooks';
import { CrewRoster, crewRoster, MEN, type ManId } from '../src/game/CrewRoster';
import { hasPhrase, setLang, tx } from '../src/i18n';
import type { Mission } from '../src/game/Missions';
import type { World } from '../src/world/World';

type Men = Record<ManId, { missions: number; rest: number; dead: boolean }>;
const men = (f: (id: ManId) => Partial<{ missions: number; rest: number; dead: boolean }> = () => ({})): Men =>
  Object.fromEntries(MEN.map((m) => [m.id, { missions: 0, rest: 0, dead: false, ...f(m.id) }])) as Men;

function resetSingleton() {
  const d = crewDecisions;
  d.work = { armour: 0, guns: 0, engines: 0 }; d.repairs = 0; d.volunteer = false; d.fatigue = {}; d.flying = null;
  d.leave.clear(); d.rested.clear(); d.veterans.clear();
}

beforeEach(() => { stubStorage(); resetSingleton(); });
afterEach(() => { setLang('en'); resetSingleton(); });

describe('ground crew shifts', () => {
  it('spends at most SHIFTS shifts and gives them back', () => {
    const d = new CrewDecisions();
    expect(d.free()).toBe(SHIFTS);
    expect(d.assign('armour', 1)).toBe(true);
    expect(d.assign('armour', 1)).toBe(true);
    expect(d.assign('engines', 1)).toBe(true);
    expect(d.assign('guns', 1)).toBe(false);          // all three shifts spent
    expect(d.assign('guns', -1)).toBe(false);         // nothing to take back
    expect(d.assign('armour', -1)).toBe(true);
    expect(d.free()).toBe(1);
  });
  it('turns work into loadout multipliers, for a running gunner mission only', () => {
    const fx = workEffects({ armour: 2, guns: 1, engines: 0 });
    expect(fx.armor).toBeCloseTo(0.86);
    expect(fx.heat).toBeCloseTo(0.9);
    expect(fx.engines).toBe(1);
    const plan = { work: { armour: 1, guns: 2, engines: 0 }, volunteer: false };
    const l = groundCrewLoadout({ armor: 1, heat: 1, spread: 1 }, 'gunner', plan);
    expect(l.armor).toBeLessThan(1); expect(l.heat).toBeLessThan(1); expect(l.spread).toBeLessThan(1);
    expect(groundCrewLoadout({ armor: 1, heat: 1, spread: 1 }, 'pilot', plan)).toEqual({ armor: 1, heat: 1, spread: 1 });
    expect(groundCrewLoadout({ armor: 1, heat: 1, spread: 1 }, 'gunner', null)).toEqual({ armor: 1, heat: 1, spread: 1 });
  });
  it('a ship that came home shot up costs a shift for repairs; a lost ship does not', () => {
    const d = new CrewDecisions();
    d.begin(men()); d.end(men(), 0.4);
    expect(d.shifts()).toBe(SHIFTS - 1);
    d.begin(men()); d.end(men(), 0.9);
    expect(d.shifts()).toBe(SHIFTS);
    d.begin(men()); d.end(men(), 0);
    expect(d.shifts()).toBe(SHIFTS);
  });
});

describe('fatigue, leave and the volunteer mission', () => {
  it('fatigue only bites from the third mission in a row and is bounded', () => {
    expect(fatigueMult(0)).toBe(1);
    expect(fatigueMult(2)).toBe(1);
    expect(fatigueMult(3)).toBeCloseTo(0.96);
    expect(fatigueMult(99)).toBeGreaterThanOrEqual(0.84);
    expect(fatigueLabel(1)).toBe('Fresh'); expect(fatigueLabel(4)).toBe('Tired'); expect(fatigueLabel(6)).toBe('Exhausted');
  });
  it('flying tires a man, a volunteer mission twice as much; a man on the ground recovers', () => {
    const d = new CrewDecisions();
    d.fatigue.reilly = 3;
    d.begin(men());
    expect(d.end(men((id) => ({ missions: id === 'dawson' ? 1 : 0 })), 1)).toEqual(['dawson']);
    expect(d.fatigueOf('dawson')).toBe(1);
    expect(d.fatigueOf('reilly')).toBe(1);
    d.setVolunteer(true);
    const plan = d.begin(men());
    expect(plan.volunteer).toBe(true);
    expect(d.meritMult()).toBe(VOLUNTEER.merit);
    d.end(men((id) => ({ missions: id === 'dawson' ? 1 : 0 })), 1);
    expect(d.fatigueOf('dawson')).toBe(3);
    expect(d.volunteer).toBe(false);                 // one mission only
    expect(d.meritMult()).toBe(1);
  });
  it('a pass: misses the mission, then comes back rested with a one-mission bonus', () => {
    const d = new CrewDecisions();
    d.fatigue.walsh = 5;
    expect(d.canLeave('walsh', false)).toBe(true);
    d.grantLeave('walsh');
    d.begin(men());
    d.end(men(), 1);                                  // the roster counted his rest down to 0
    expect(d.leave.has('walsh')).toBe(false);
    expect(d.fatigueOf('walsh')).toBe(0);
    expect(d.skillMult('walsh')).toBe(RESTED_BONUS);
    d.begin(men());
    d.end(men((id) => ({ missions: id === 'walsh' ? 1 : 0 })), 1);
    expect(d.skillMult('walsh')).toBe(1);
  });
  it('limits passes and keeps a man in hospital out of them', () => {
    const d = new CrewDecisions();
    d.grantLeave('price'); d.grantLeave('gallo');
    expect(d.canLeave('dawson', false)).toBe(false);
    d.cancelLeave('gallo');
    expect(d.canLeave('dawson', false)).toBe(true);
    expect(d.canLeave('dawson', true)).toBe(false);
  });
  it('saves and loads every choice, and survives corrupt saves', () => {
    const d = new CrewDecisions();
    d.fatigue.doyle = 4; d.assign('guns', 1); d.setVolunteer(true); d.grantLeave('mendez'); d.hireVeteran('tail');
    const e = new CrewDecisions();
    expect(e.work.guns).toBe(1); expect(e.volunteer).toBe(true); expect(e.leave.has('mendez')).toBe(true);
    expect(e.replacementSkill('tail')).toBe(VETERAN_SKILL); expect(e.fatigueOf('doyle')).toBe(4);
    stubStorage({ 'sws3d.decisions.v1': '{"work":{"armour":9,"guns":-3},"repairs":"x","fatigue":{"stern":40}}' });
    const f = new CrewDecisions();
    expect(f.used()).toBeLessThanOrEqual(f.shifts());
    expect(f.fatigueOf('stern')).toBe(6);
    stubStorage({ 'sws3d.decisions.v1': 'not json' });
    expect(new CrewDecisions().free()).toBe(SHIFTS);
  });
});

describe('roster and game hooks', () => {
  it('fatigue and replacements change the roster skills', () => {
    const r = new CrewRoster();
    const fresh = r.roleStat('dawson', 'gunnery');
    crewDecisions.fatigue.dawson = 6;
    expect(r.roleStat('dawson', 'gunnery')).toBeLessThan(fresh);
    expect(r.rookieSkill('tail')).toBe(24);
    crewDecisions.hireVeteran('tail');
    expect(r.rookieSkill('tail')).toBe(VETERAN_SKILL);
  });
  it('a pass takes him off the next mission and can be cancelled', () => {
    const r = new CrewRoster();
    expect(r.setLeave('reilly', true)).toBe(true);
    expect(r.isOut('reilly')).toBe(true);
    expect(r.occupant('ball')).toBeNull();
    expect(r.setLeave('reilly', false)).toBe(true);
    expect(r.isOut('reilly')).toBe(false);
    r.men.price.rest = 2;                            // in hospital: no pass, no cancelling it
    expect(r.setLeave('price', true)).toBe(false);
    expect(r.setLeave('price', false)).toBe(false);
  });
  it('a volunteer mission sharpens the fighters, the engine work toughens the engines, and it counts double', () => {
    const engine = { engine: 0, hp: 100, maxHp: 100 }, wing = { hp: 50, maxHp: 50 };
    const world = { difficulty: 1, playerBomber: { zones: [engine, wing], alive: true, integrity: 0.9 } } as unknown as World;
    const m = { role: 'gunner', id: 'm1' } as Mission;
    crewDecisions.assign('engines', 1); crewDecisions.setVolunteer(true);
    beginCrewDecisions(world, m, false);
    expect(world.difficulty).toBeCloseTo(VOLUNTEER.enemy);
    expect(engine.maxHp).toBeCloseTo(125); expect(wing.maxHp).toBe(50);
    const before = crewRoster.men.mendez.missions;
    crewRoster.men.mendez.missions += 1;             // the roster's own endMission credit
    endCrewDecisions(world);
    expect(crewRoster.men.mendez.missions).toBe(before + 2);
    expect(crewDecisions.flying).toBeNull();
    expect(crewDecisions.used()).toBe(0);
  });
  it('leaves pilot, tutorial and co-op missions alone', () => {
    expect(decisionsApply({ role: 'pilot', id: 'x' } as Mission, false)).toBe(false);
    expect(decisionsApply({ role: 'gunner', id: 'x', tutorial: true } as Mission, false)).toBe(false);
    expect(decisionsApply({ role: 'gunner', id: 'x' } as Mission, true)).toBe(false);
    crewDecisions.setVolunteer(true);
    const world = { difficulty: 1, playerBomber: null } as unknown as World;
    beginCrewDecisions(world, { role: 'pilot', id: 'x' } as Mission, false);
    expect(world.difficulty).toBe(1);
    expect(crewDecisions.flying).toBeNull();
  });
});

// node:fs without @types/node
const FS = 'node:fs';
const { readFileSync } = (await import(FS)) as { readFileSync(p: URL, enc: 'utf8'): string };
const literals = (path: string) => [...readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8').matchAll(/tx\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));

describe('Arabic', () => {
  it('covers every decision text', () => {
    const texts = [
      ...literals('ui/CrewDecisionsPanel.ts'), ...literals('game/CrewDecisionHooks.ts'),
      ...Object.values(WORK_LABEL), ...Object.values(WORK_GAIN), 'Fresh', 'Tired', 'Exhausted',
      'On a 48-hour pass — misses the next mission',
    ];
    expect(texts.length).toBeGreaterThan(40);
    for (const s of texts) expect(hasPhrase(s), s).toBe(true);
    setLang('ar');
    expect(tx('{free} of {n} shifts free', { free: 2, n: 3 })).toMatch(/[؀-ۿ]/);
  });
});

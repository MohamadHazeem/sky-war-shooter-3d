import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stubStorage } from './helpers';
import { CrewRoster, MEN, POSTS, xpFor, DEFAULT_SKILL } from '../src/game/CrewRoster';
import { ROLE_STATS, ROLE_HELP, ROLE_LABEL, TALENTS, roleEffects, roleMultiplier, roleStat } from '../src/game/CrewRoles';
import { Crew } from '../src/world/Crew';
import type { World } from '../src/world/World';
import { hasPhrase } from '../src/i18n';
import { buildScene } from '../src/game/CrewRoom';

beforeEach(() => stubStorage());
function flight(r: CrewRoster) {
  const w = { playerBomber: { alive: true }, crew: new Crew(), ballistics: {}, combatLosses: 0 };
  r.beginMission(w as unknown as World, { banner() {}, feed() {} }, 'gunner');
  return w;
}

describe('crew role effects', () => {
  it('grows all five stats for all ten personalities with XP, capped at 100', () => {
    const r = new CrewRoster();
    for (const m of MEN) for (const s of ROLE_STATS) {
      const low = roleStat(m.id, s, 1);
      r.men[m.id].xp = xpFor(10);
      expect(r.roleStat(m.id, s)).toBe(Math.min(100, low + 36));
      expect(r.roleStat(m.id, s)).toBeGreaterThan(low);
    }
    expect(TALENTS.walsh.stats.nerve).toBeGreaterThan(TALENTS.walsh.stats.gunnery);
    expect(TALENTS.mendez.stats.mechanics).toBeGreaterThan(TALENTS.price.stats.mechanics);
  });
  it('bounds every role modifier and keeps skill 50 neutral', () => {
    expect(roleMultiplier(-50)).toBe(0.75);
    expect(roleMultiplier(150)).toBe(1.25);
    for (const v of [0, 24, 50, 100]) for (const m of Object.values(roleEffects(() => v))) {
      expect(m).toBeGreaterThanOrEqual(0.75); expect(m).toBeLessThanOrEqual(1.25);
      if (v === 50) expect(m).toBe(1);
    }
  });
  it('gives veterans tighter fire and faster reaction than replacements', () => {
    const r = new CrewRoster(); r.men.dawson.xp = xpFor(10); flight(r);
    const veteran = r.aiSkill('tail');
    expect(r.aiSkill('tail')).toBe(veteran); // allocation-free cached hot path
    r.endMission(true); r.men.dawson.rest = 1; flight(r);
    const rookie = r.aiSkill('tail');
    expect(veteran.spread).toBeLessThan(rookie.spread);
    expect(veteran.react).toBeLessThan(rookie.react);
    for (const k of [veteran, rookie]) for (const v of [k.spread, k.react, k.burst, k.engage]) {
      expect(v).toBeGreaterThanOrEqual(0.75); expect(v).toBeLessThanOrEqual(1.25);
    }
  });
  it('uses assigned specialists for repairs and aid; changes apply at round start', () => {
    const r = new CrewRoster(); flight(r);
    const before = r.effects(); expect(r.effects()).toBe(before);
    r.swap('top', 'radio');
    expect(r.effects()).toEqual(before);
    r.onRoundStart();
    expect(r.effects().repair).toBeLessThan(before.repair);
    expect(r.effects().fireDelay).toBeGreaterThan(before.fireDelay);
    expect(r.effects().dressing).toBeGreaterThan(before.dressing);
    expect(r.effects().seriousWound).toBeGreaterThan(before.seriousWound);
  });
  it('losing officers weakens warnings, jinks and formation keeping', () => {
    const r = new CrewRoster(); flight(r); const veteran = r.effects(); r.endMission(true);
    for (const id of ['brenner', 'doyle', 'stern'] as const) r.men[id].rest = 1;
    flight(r); const rookie = r.effects();
    expect(rookie.warning).toBeLessThan(veteran.warning);
    expect(rookie.jink).toBeLessThan(veteran.jink);
    expect(rookie.formation).toBeGreaterThan(veteran.formation);
  });
  it('returns neutral effects outside bomber missions, including abandoned missions', () => {
    const r = new CrewRoster(); const w = flight(r); w.playerBomber = { alive: true };
    expect(r.active).toBe(false);
    expect(r.aiSkill('tail')).toBe(DEFAULT_SKILL);
    expect(Object.values(r.effects()).every((v) => v === 1)).toBe(true);
    r.beginMission(w as unknown as World, { banner() {}, feed() {} }, 'pilot');
    expect(Object.values(r.effects()).every((v) => v === 1)).toBe(true);
  });
  it('recommends distinct seats with engineering and medic strengths and persists them', () => {
    const r = new CrewRoster(); r.swap('top', 'radio'); r.recommend();
    expect(r.seats.top).toBe('mendez'); expect(r.seats.radio).toBe('gallo');
    expect(new Set(Object.values(r.seats)).size).toBe(POSTS.length);
    expect(new CrewRoster().seats).toEqual(r.seats);
    r.men.mendez.rest = 2; r.recommend(); expect(r.seats.top).not.toBe('mendez');
  });
  it('localizes all stat help and personality labels', () => {
    for (const s of [...Object.values(ROLE_LABEL), ...Object.values(ROLE_HELP), ...Object.values(TALENTS).map((t) => t.trait)]) expect(hasPhrase(s), s).toBe(true);
  });
});

describe('hospital and memorial', () => {
  it('keeps a serious casualty out across rounds and two completed missions', () => {
    const r = new CrewRoster(); const w = flight(r);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    w.crew.wound('tail'); r.onRoundStart(['medic']);
    expect(r.occupant('tail')).toBeNull();
    r.onRoundStart(); expect(r.occupant('tail')).toBeNull();
    r.endMission(true); expect(r.men.dawson.rest).toBe(2);
    const loaded = new CrewRoster();
    for (const rest of [1, 0]) { flight(loaded); expect(loaded.occupant('tail')).toBeNull(); loaded.endMission(true); expect(loaded.men.dawson.rest).toBe(rest); }
    flight(loaded); expect(loaded.occupant('tail')).toBe('dawson');
  });
  it('a better medic prevents a borderline serious wound', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.24);
    const trained = new CrewRoster(); const w = flight(trained); w.crew.wound('tail');
    expect(trained.serious.has('dawson')).toBe(false);
    const rookie = new CrewRoster(); rookie.men.gallo.rest = 1;
    flight(rookie).crew.wound('tail'); expect(rookie.serious.has('dawson')).toBe(true);
  });
  it('does not discharge hospital patients when a mission is abandoned', () => {
    const r = new CrewRoster(); r.men.dawson.rest = 2; const w = flight(r);
    w.playerBomber = { alive: true }; expect(r.active).toBe(false);
    expect(r.men.dawson.rest).toBe(2);
  });
  it.each([{ lost: 2, alive: false, xp: xpFor(5) }, { lost: 3, alive: true, xp: xpFor(5) }, { lost: 3, alive: false, xp: 0 }])('no death without all heavy-loss gates: %j', ({ lost, alive, xp }) => {
    const r = new CrewRoster(); r.men.dawson.xp = xp; const w = flight(r);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    w.crew.wound('tail'); w.playerBomber.alive = alive; w.combatLosses = lost;
    r.endMission(false); expect(r.men.dawson.dead).toBe(false);
  });
  it('never kills a veteran already benched before the ship is lost', () => {
    const r = new CrewRoster(); r.men.dawson.xp = xpFor(5); const w = flight(r);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    w.crew.wound('tail'); r.onRoundStart();
    expect(r.occupant('tail')).toBeNull();
    w.playerBomber.alive = false; w.combatLosses = 3; r.endMission(false);
    expect(r.men.dawson.dead).toBe(false); expect(r.men.dawson.rest).toBe(2);
  });
  it('makes rare veteran loss permanent, never healable, and excludes him from room scenes', () => {
    const r = new CrewRoster(); r.men.dawson.xp = xpFor(5); const w = flight(r);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    w.crew.wound('tail'); w.playerBomber.alive = false; w.combatLosses = 3; r.endMission(false);
    const loaded = new CrewRoster(); loaded.heal('dawson'); flight(loaded);
    expect(loaded.men.dawson.dead).toBe(true); expect(loaded.occupant('tail')).toBeNull();
    const scene = buildScene('m1', { mission: 'm1', role: 'gunner', kills: 0, shots: 0, hits: 0, lost: 0, total: 12, hospital: [], patched: [], rookies: [], aces: [], luftwaffe: 100, memorial: ['dawson'] })!;
    expect(scene.present).not.toContain('dawson'); expect(scene.lines.some((l) => l.who === 'dawson')).toBe(false);
    expect(scene.emptyBunk).toBe(true); expect(scene.memorial).toEqual(['dawson']);
  });
  it('loads old saves without inventing deaths and sanitizes hospital duration', () => {
    stubStorage({ 'sws3d.crew.v1': { men: { dawson: { xp: 600, rest: 99 } } } });
    const r = new CrewRoster(); expect(r.men.dawson.dead).toBe(false); expect(r.men.dawson.rest).toBe(2); expect(r.level('dawson')).toBe(3);
  });
});

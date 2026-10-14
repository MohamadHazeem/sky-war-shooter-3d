import { VOICE_LINES } from '../src/audio/voiceLines';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { B17DamageRules, DAMAGE_RADIO, DAMAGE_TEXT, DAMAGE_TUNING, escapeManifest } from '../src/game/B17DamageRules';
import { CrewRoster } from '../src/game/CrewRoster';
import { CREW, Crew } from '../src/world/Crew';
import type { World } from '../src/world/World';
import { hasPhrase } from '../src/i18n';
import { stubStorage } from './helpers';

beforeEach(() => stubStorage());
describe('B-17 damage control', () => {
  it('gates incidents on heavy hits, a quiet opening and shared cooldown', () => {
    const s = new B17DamageRules();
    expect(s.hit('fuselageAft', true, () => 0)).toBe(false);
    s.update(31, 'waistL', false, false);
    expect(s.hit('fuselageAft', false, () => 0)).toBe(false);
    expect(s.hit('fuselageAft', true, () => 0)).toBe(true);
    expect(s.fire).toBe('fuselage');
    expect(s.hit('engine2', true, () => 0)).toBe(false);
  });
  it('requires the right compartment and an uninterrupted short hold', () => {
    const s = new B17DamageRules(); s.ignite('bombBay');
    s.update(10, 'waistL', true, false); expect(s.fill).toBe(0);
    s.update(1, 'top', true, false); expect(s.fill).toBeGreaterThan(0);
    s.update(.1, 'top', false, false); expect(s.fill).toBe(0);
    expect(s.update(2.3, 'top', true, false)).toBe(true); expect(s.fire).toBeNull();
    s.ignite('fuselage'); expect(s.reachable('ball')).toBe(false); expect(s.reachable('waistR')).toBe(true);
  });
  it('allows crew suppression only after arrival and resets between missions', () => {
    const s = new B17DamageRules(); s.ignite('fuselage');
    expect(s.update(20, 'tail', false, false)).toBe(false);
    expect(s.update(5, 'tail', false, true)).toBe(true);
    s.controls = .8; s.runaway[2] = true; s.feather(1); s.reset('recruit');
    expect(s.controls).toBe(0); expect(s.runaway.some(Boolean)).toBe(false); expect(s.feathered.some(Boolean)).toBe(false);
  });
  it('keeps recruit incidents rarer, shorter and less damaging than ace', () => {
    for (const key of ['chance', 'hold', 'crew', 'burn'] as const) expect(DAMAGE_TUNING.recruit[key]).toBeLessThan(DAMAGE_TUNING.ace[key]);
    expect(DAMAGE_TUNING.recruit.gap).toBeGreaterThan(DAMAGE_TUNING.ace.gap);
  });
  it('separates governor failure, feathering and control damage', () => {
    const s = new B17DamageRules(); s.cooldown = 0;
    expect(s.hit('engine3', true, () => 0)).toBe(true); expect(s.runaway).toEqual([false, false, true, false]);
    s.update(5, 'top', false, false); expect(s.engineAge[2]).toBe(5);
    s.feather(2); expect(s.runaway[2]).toBe(false); expect(s.feathered[2]).toBe(true);
    s.cooldown = 0; expect(s.hit('tail', true, () => 0)).toBe(true); expect(s.controls).toBe(.4);
    s.cooldown = 0; expect(s.hit('wingL', true, () => 0)).toBe(false);
  });
  it('recognizes bomb bay hits in the actual forward/middle fuselage zones', () => {
    for (const zone of ['fuselageFwd', 'fuselageMid']) {
      const s = new B17DamageRules(); s.cooldown = 0; s.hit(zone, true, () => 0); expect(s.fire).toBe('bombBay');
    }
  });
});
describe('crew replacement and escape', () => {
  it('moves a real helper to the gun, preserving the wounded man and his roster wound', () => {
    const roster = new CrewRoster(); const crew = new Crew();
    const world = { playerBomber: { alive: true }, crew, ballistics: {}, combatLosses: 0 };
    roster.beginMission(world as unknown as World, { banner() {}, feed() {} }, 'gunner');
    const hurt = roster.occupant('waistR')!, helper = roster.occupant('radio')!;
    crew.wound('waistR'); expect(roster.relieve('waistR', 'radio')).toBe(true);
    expect(roster.occupant('waistR')).toBe(helper); expect(roster.occupant('radio')).toBe(hurt);
    expect(crew.wounded.has('waistR')).toBe(false); expect(crew.wounded.has('radio')).toBe(true);
    expect(roster.wounded.has(hurt)).toBe(true);
    crew.wound('tail'); expect(roster.relieve('tail', 'radio')).toBe(false);
    const ids = CREW.map(c => roster.occupant(c.id)); expect(new Set(ids).size).toBe(10);
  });
  it('records ten distinct names, delays wounds and guarantees the player chute view', () => {
    const men = CREW.map((c, i) => ({ name: c.name, wounded: i === 9, player: i === 7 }));
    const high = escapeManifest(men, 7000), low = escapeManifest(men, 220);
    expect(high).toHaveLength(10); expect(high.every(m => m.escaped)).toBe(true);
    expect(high[9].at).toBeGreaterThan(high[8].at);
    expect(low.some(m => !m.escaped)).toBe(true); expect(low[7].escaped).toBe(true);
    // No wall time or random roll: skipping and normal playback share the same outcome.
    expect(escapeManifest(men, 220)).toEqual(low);
  });
  it('does not roll a contradictory fatality after recording an escape', () => {
    const roster = new CrewRoster(), crew = new Crew();
    const world = { playerBomber: { alive: true }, crew, ballistics: {}, combatLosses: 3 };
    roster.beginMission(world as unknown as World, { banner() {}, feed() {} }, 'gunner');
    roster.men.price.xp = 1000; crew.wound('waistL'); world.playerBomber.alive = false; roster.escapeRecorded = true;
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    roster.endMission(false); random.mockRestore(); expect(roster.men.price.dead).toBe(false);
  });
});
it('covers every new instruction and radio line in Arabic', () => {
  for (const text of Object.values(DAMAGE_TEXT)) expect(hasPhrase(text), text).toBe(true);
  for (const [, text] of Object.values(DAMAGE_RADIO)) expect(hasPhrase(text), text).toBe(true);
});

it('has a recorded Chatterbox line for every new damage callout and speaker', () => {
  for (const [speaker, text] of Object.values(DAMAGE_RADIO)) {
    expect(Object.values(VOICE_LINES).some(line => line.text === text && (line.speakers as readonly string[]).includes(speaker)), text).toBe(true);
  }
});

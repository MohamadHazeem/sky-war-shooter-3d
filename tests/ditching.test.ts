import { describe, expect, it, vi, afterEach } from 'vitest';
import { shouldDitch, coastDistanceKm, ditchSuccess, DITCH_TEXT, DITCH_RADIO, type DitchState } from '../src/game/DitchingRules';
import { applyOutcome, defaultCampaign, opInfo, sanitize } from '../src/game/CampaignState';
import { CAMPAIGN } from '../src/game/Missions';
import { hasPhrase } from '../src/i18n';
import { DitchingSea } from '../src/world/DitchingSea';
import { seaWash, waterImpact } from '../src/audio/SynthField';
import { CrewRoster } from '../src/game/CrewRoster';
import { Crew } from '../src/world/Crew';
import { stubStorage } from './helpers';
vi.hoisted(() => { vi.stubGlobal('window', {}); });
const state: DitchState = { campaign: true, gunner: true, coop: false, controllable: true, enginesOut: 0, integrity: 1, leaking: false, progress: 0.8, coastKm: 48, ending: true };
afterEach(() => vi.restoreAllMocks());

describe('ditching trigger boundaries', () => {
  it('preserves normal, rough and near-coast belly landings', () => {
    for (const enginesOut of [0, 1, 2]) expect(shouldDitch({ ...state, enginesOut })).toBe(false);
    expect(shouldDitch({ ...state, integrity: 0.22 })).toBe(false);
    expect(shouldDitch({ ...state, enginesOut: 2, ending: false, coastKm: 25 })).toBe(false);
  });
  it('selects a controlled ditch beyond belly-landing territory', () => {
    for (const enginesOut of [3, 4]) expect(shouldDitch({ ...state, enginesOut })).toBe(true);
    expect(shouldDitch({ ...state, integrity: 0.219 })).toBe(true);
    expect(shouldDitch({ ...state, enginesOut: 2, leaking: true })).toBe(true);
    expect(shouldDitch({ ...state, enginesOut: 1, leaking: true })).toBe(false);
  });
  it('requires the return leg AND a distant coast for an early ending', () => {
    expect(shouldDitch({ ...state, enginesOut: 2, ending: false, progress: 0.75, coastKm: 25.01 })).toBe(true);
    expect(shouldDitch({ ...state, enginesOut: 3, ending: false, progress: 0.749 })).toBe(false);
    expect(coastDistanceKm(0.8)).toBeCloseTo(48);
    expect(coastDistanceKm(1)).toBe(0);
    expect(coastDistanceKm(-1)).toBe(80);
  });
  it('excludes pilots, co-op, non-campaign and uncontrollable destruction', () => {
    for (const patch of [{ gunner: false }, { campaign: false }, { coop: true }, { controllable: false }])
      expect(shouldDitch({ ...state, enginesOut: 4, ...patch })).toBe(false);
  });
  it('does not make the authored two-engine Last Light start an unavoidable failure', () => {
    expect(shouldDitch({ ...state, ending: false, enginesOut: 2, initialEnginesOut: 2 })).toBe(false);
    expect(shouldDitch({ ...state, ending: false, enginesOut: 2, initialEnginesOut: 2, integrity: 0.49 })).toBe(true);
  });
  it('preserves the bomb objective, independently of surviving the ditch', () => {
    expect(ditchSuccess(true, true, false)).toBe(true);
    expect(ditchSuccess(true, false, true)).toBe(false);
    expect(ditchSuccess(false, false, false)).toBe(false);
    expect(ditchSuccess(false, false, true)).toBe(true);
  });
});
describe('rescue outcome and content', () => {
  it('persists the bomber loss and ditched note with a successful campaign objective', () => {
    const d = defaultCampaign(42), op = opInfo(d, CAMPAIGN[0])!;
    const result = applyOutcome(d, op, { success: true, kills: 0, bombersLost: 3, bombersTotal: 12, ditched: true });
    expect(result.data.storyDone).toEqual(['m1']);
    expect(result.data.squadron).toBe(17);
    expect(result.data.history[0]).toMatchObject({ success: true, lost: 3, ditched: true });
    expect(sanitize(JSON.parse(JSON.stringify(result.data)))!.history[0].ditched).toBe(true);
    expect(result.report.lines.some(l => l.text === DITCH_TEXT.merit)).toBe(true);
    expect(applyOutcome(d, op, { success: false, kills: 0, bombersLost: 1, bombersTotal: 12, ditched: true }).data.storyDone).toEqual([]);
  });
  it('all visible captions, outcome strings and radio lines have Arabic', () => {
    for (const s of [...Object.values(DITCH_TEXT), ...DITCH_RADIO.map(l => l[1])]) expect(hasPhrase(s), s).toBe(true);
  });
  it('keeps ten crew, launches two dinghies, signals and brings the rescue launch alongside', () => {
    const s = new DitchingSea();
    s.update(6, false); expect(s.brace.visible).toBe(true); expect(s.crew.every(c => c.parent === s.brace)).toBe(true);
    s.update(12, false); expect(s.spray.some(p => p.visible)).toBe(true);
    s.update(18, false); expect(s.rafts.every(r => r.visible)).toBe(true); expect(s.crew.every(c => s.rafts.includes(c.parent as any))).toBe(true);
    s.update(23, true); expect(s.flare.visible).toBe(true); expect(s.launch.visible).toBe(true);
    s.update(31, true); expect(s.launch.position.z).toBe(0); expect(s.flare.visible).toBe(false);
  });
  it('water sounds are finite, audible and bounded', () => {
    for (const make of [seaWash, waterImpact]) {
      const pcm = make(); let peak = 0;
      for (const c of pcm.ch) for (const n of c) { if (!Number.isFinite(n)) throw Error('nonfinite PCM'); peak = Math.max(peak, Math.abs(n)); }
      expect(peak).toBeGreaterThan(0.2); expect(peak).toBeLessThanOrEqual(1);
    }
  });
  it('rescue wounds flow through the roster and persist without losing crew', () => {
    stubStorage(); const roster = new CrewRoster(), crew = new Crew();
    const world = { playerBomber: {}, crew, events: {}, ballistics: {}, playerStation: 'waistL' } as any;
    roster.beginMission(world, { banner() {}, feed() {} }, 'gunner');
    vi.spyOn(Math, 'random').mockReturnValue(0.9); crew.wound('radio');
    roster.endMission(true);
    expect(roster.men.gallo.rest).toBe(1); expect(roster.men.gallo.wounds).toBe(1);
    expect(new CrewRoster().men.gallo.rest).toBe(1); expect(Object.keys(roster.men)).toHaveLength(10);
  });
});

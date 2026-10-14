import { describe, expect, it, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { chutesDue, companionDitchDue, formationCompression, formationStatus, leadIndex, lossKind, LOSS_PROFILES, FORMATION_RADIO, SQUADRONS, type FormationMember } from '../src/world/FormationRules';
import { hasPhrase } from '../src/i18n';

vi.mock('../src/world/FormationDress', () => ({FormationDress: class { hit() {} update() {} dispose() {} }}));
import { LivingFormation } from '../src/world/LivingFormation';
import type { Bomber } from '../src/world/Aircraft';
import type { World } from '../src/world/World';

function bomber(x = 0, player = false): Bomber {
  const root = new THREE.Group(); root.position.set(x, 7600, 0);
  return {root, pos: root.position, quat: root.quaternion, model: new THREE.Group(), slot: new THREE.Vector3(x, 0, 0), isPlayer: player,
    alive: true, remove: false, enginesOut: 0, engineDead: [false, false, false, false], integrity: 1, straggling: false, scripted: false,
    vel: new THREE.Vector3(), spin: new THREE.Vector3(), crewBailed: 0, zones: [], zone: () => undefined} as unknown as Bomber;
}
function fixture() {
  const parachute = vi.fn((_pos: THREE.Vector3, _vel: THREE.Vector3, _scale: number) => true), callout = vi.fn(), piece = {root: new THREE.Group(), vel: new THREE.Vector3(), life: 26};
  const w = {time: 0, formationCenter: new THREE.Vector3(0, 7600, 0), formationForward: new THREE.Vector3(0, 0, 1), aircraft: [],
    effects: {parachute, explosion: vi.fn(), sparks: vi.fn()}, destruction: {jointWorld: vi.fn((b: Bomber, _part: number, out: THREE.Vector3) => out.copy(b.pos).addScalar(7)), separate: vi.fn((b: Bomber) => { b.falling = false; }), explode: vi.fn(), piecesOf: vi.fn(() => [{...piece, body: {vel: piece.vel}, shard: false}])}, callout} as unknown as World;
  const system = new LivingFormation(w), ships = [bomber(0), bomber(70, true), bomber(-70), bomber(170)];
  for (const b of ships) system.add(b);
  return {system, w, ships, parachute, callout};
}
afterEach(() => vi.restoreAllMocks());

describe('living formation transitions', () => {
  it('damaged engines become stragglers; repair can rejoin, death is terminal', () => {
    expect(formationStatus('station', true, 1, 0.98, false)).toBe('damaged');
    expect(formationStatus('damaged', true, 2, 0.8, false)).toBe('straggler');
    expect(formationStatus('straggler', true, 0, 1, false)).toBe('station');
    expect(formationStatus('station', true, 0, 1, true)).toBe('straggler');
    expect(formationStatus('straggler', false, 2, 0.5, true)).toBe('lost');
    expect(formationStatus('lost', true, 0, 1, false)).toBe('lost');
  });
  it('hands lead and deputy over, excluding stragglers and all losses', () => {
    const {system, ships} = fixture();
    expect(system.lead).toBe(ships[0]); expect(system.deputy).toBe(ships[1]);
    ships[0].straggling = true; system.update(1, true);
    expect(system.lead).toBe(ships[1]); expect(system.deputy).toBe(ships[2]);
    ships[1].alive = false; system.update(1, true);
    expect(system.lead).toBe(ships[2]); expect(system.deputy).toBe(ships[3]);
    ships[2].alive = ships[3].alive = false; system.update(1, true);
    expect(system.lead).toBeNull(); expect(system.deputy).toBeNull();
  });
  it('re-forms gradually after losses, keeps player fixed and separation above 48 m', () => {
    const {system, ships} = fixture(), playerSlot = ships[1].slot.clone(), initial = ships[3].slot.clone();
    ships[0].alive = false; system.update(1 / 60, true);
    expect(ships[3].slot.distanceTo(initial)).toBeLessThanOrEqual(2.5 / 60 + 1e-6);
    for (let t = 0; t < 1200; t++) system.update(1 / 60, true);
    expect(ships[1].slot.equals(playerSlot)).toBe(true);
    expect(ships[3].slot.distanceTo(playerSlot)).toBeLessThan(initial.distanceTo(playerSlot));
    for (let i = 1; i < ships.length; i++) for (let j = i + 1; j < ships.length; j++) expect(ships[i].slot.distanceTo(ships[j].slot)).toBeGreaterThanOrEqual(48);
  });
  it('handles empty/total-loss formations and caps compression', () => {
    expect(leadIndex([])).toBe(-1); expect(formationCompression([])).toBe(1);
    const dead: FormationMember[] = Array.from({length: 18}, (_, slot) => ({slot, player: false, status: 'lost'}));
    expect(leadIndex(dead)).toBe(-1); expect(formationCompression(dead)).toBe(0.78);
  });
  it('leaves event-controlled stragglers on their own path and resets all mission state', () => {
    const {system, ships} = fixture(); ships[2].straggling = true;
    const before = ships[2].slot.clone(); system.update(10, false);
    expect(ships[2].slot.equals(before)).toBe(true);
    system.reset(); expect(system.ships).toHaveLength(0); expect(system.lead).toBeNull(); expect(system.deputy).toBeNull();
  });
});

describe('combat casualty sequencing', () => {
  it('places a small tear burst at the failed joint and avoids a duplicate fuel explosion', () => {
    const {system, ships, w} = fixture(); ships[0].alive = ships[2].alive = false;
    system.beginLoss(ships[0], 'wingL');
    expect(w.effects.explosion).toHaveBeenCalledExactlyOnceWith(ships[0].pos.clone().addScalar(7), ships[0].vel, .22, 'small');
    expect(w.effects.sparks).toHaveBeenCalledOnce();
    system.beginLoss(ships[2], 'fire', 'explode');
    expect(w.destruction.explode).toHaveBeenCalledExactlyOnceWith(ships[2]);
    expect(w.effects.explosion).toHaveBeenCalledOnce();
  });
  it('uses damage cause and supports four distinct airborne endings', () => {
    expect(lossKind('tail', 0)).toBe('split'); expect(lossKind('all engines', 0)).toBe('glide');
    expect(lossKind('wingR', 0.99)).toBe('fold'); expect(lossKind('cockpit', 0.99)).toBe('spin'); expect(lossKind('ditch', 0)).toBe('ditch');
    expect([0.1, 0.4, 0.7, 0.9].map(r => lossKind('fire', r))).toEqual(['explode', 'split', 'spin', 'glide']);
  });
  it.each(['spin', 'split', 'explode', 'glide'] as const)('%s releases the exact crew count once, even with large simulation steps', kind => {
    const {system, ships, parachute} = fixture(), b = ships[0]; b.alive = false;
    expect(system.beginLoss(b, 'fire', kind)).toBe(true);
    system.beginLoss(b, 'fire', kind); // idempotent
    system.update(0, true); expect(parachute).not.toHaveBeenCalled();
    system.update(12, true);
    expect(parachute).toHaveBeenCalledTimes(LOSS_PROFILES[kind].chutes); expect(b.crewBailed).toBe(LOSS_PROFILES[kind].chutes);
    system.update(1, true); expect(parachute).toHaveBeenCalledTimes(LOSS_PROFILES[kind].chutes);
    system.update(60, true); expect(b.remove).toBe(true);
    system.reset(); system.update(100, true); expect(parachute).toHaveBeenCalledTimes(LOSS_PROFILES[kind].chutes);
  });
  it('counts actual pooled chutes, with no invented count if the pool is exhausted', () => {
    const {system, ships, parachute, callout} = fixture(); parachute.mockReturnValue(false); ships[0].alive = false;
    system.beginLoss(ships[0], 'all engines'); system.update(12, true);
    expect(ships[0].crewBailed).toBe(0); expect(callout.mock.calls.some(c => String(c[0]).startsWith('lf_chutes'))).toBe(false);
  });
  it('follows the physical hulk coordinates after a floating-origin rebase', () => {
    const {system, ships, parachute} = fixture(); ships[0].alive = false; system.beginLoss(ships[0], 'tail');
    const piece = {root: ships[0].root}; piece.root.position.set(10, 20, 30);
    system.update(2.5, true); expect(parachute.mock.calls.length).toBe(1);
    expect(parachute.mock.calls[0][0].toArray()).toEqual([13, 18, 25]);
    expect(ships[0].crewBailed).toBe(1);
  });
  it('a neighbour whose wing is shot through loses it on that side physically, and chutes come from the hulk', () => {
    const {system, ships, w, parachute} = fixture(); ships[2].alive = false; system.beginLoss(ships[2], 'wingR');
    const brk = w.destruction.separate as ReturnType<typeof vi.fn>;
    expect(brk).toHaveBeenCalledWith(ships[2], 5, false);
    expect(ships[2].remove).toBe(false);
    expect(ships[2].falling).toBe(false);
    system.update(LOSS_PROFILES.fold.duration, true);
    expect(parachute).toHaveBeenCalledTimes(LOSS_PROFILES.fold.chutes);
  });
  it('gates chutes and water landings by simulation age and the return route', () => {
    expect(chutesDue('glide', 2.49)).toBe(0); expect(chutesDue('glide', 2.5)).toBe(1); expect(chutesDue('glide', 80)).toBe(5);
    expect(companionDitchDue(true, 0.8, 2, 0.8, true)).toBe(true);
    for (const progress of [0, 0.749, 0.96, 1]) expect(companionDitchDue(true, progress, 3, 0.5, true)).toBe(false);
    expect(companionDitchDue(false, 0.8, 3, 0.5, true)).toBe(false);
    expect(companionDitchDue(true, 0.8, 3, 0.5, false)).toBe(false);
    expect(companionDitchDue(true, 0.8, 0, 1, true)).toBe(false);
  });
  it('tracks neighbouring crews’ kills and clears them between missions', () => {
    const {system} = fixture(); system.gunnerKill(); system.gunnerKill(); expect(system.kills).toBe(2);
    system.reset(); expect(system.kills).toBe(0);
  });
  it('all new radio and squadron names have Arabic', () => {
    for (const text of [...Object.values(FORMATION_RADIO), ...SQUADRONS.map(s => s.name)]) expect(hasPhrase(text), text).toBe(true);
  });
});

import { Wrecks } from '../src/world/Wrecks';
import type { Effects } from '../src/world/Effects';
describe('reusable bomber wrecks', () => {
  it('reuses warmed clipping materials and clears active pieces for a mission restart', () => {
    const scene = new THREE.Scene(), effects = {trail() {}, glow: {spawn() {}}, smoke: {spawn() {}}} as unknown as Effects;
    const wrecks = new Wrecks(scene, effects), b = bomber();
    Object.assign(b, {kind: 'b17'});
    b.model.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())); b.root.add(b.model);
    const warm = wrecks.breakBomber(b, 'split'); expect(warm).toHaveLength(2); wrecks.keepWarm(warm);
    b.pos.set(300, 7200, -1000);
    const live = wrecks.breakBomber(b, 'split'); expect(live[0]).toBe(warm[0]); expect(live[0].root.position.equals(b.pos)).toBe(true);
    expect(live[0].root.parent).toBe(scene);
    wrecks.clear(); expect(live[0].life).toBe(0); expect(live[0].root.parent).toBeNull();
    expect(wrecks.breakBomber(b, 'split')[0]).toBe(warm[0]);
  });
});

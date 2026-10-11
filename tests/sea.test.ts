import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { SeaCombat, SEA_KINDS, seaWave, canSkipBomb } from '../src/world/SeaCombat';
import { SeaWorld } from '../src/world/SeaWorld';
import { seaMission, SEA_MODE, SEA_RADIO } from '../src/game/SeaMission';
import { leaderboardMode, modeFor, SURVIVAL_MODE } from '../src/game/Modes';
import { hasPhrase } from '../src/i18n';
import table from '../src/i18n/ar/sea';

const hull = (s: SeaCombat) => s.parts.findIndex(p => p.kind === 'hull');
const disarm = (s: SeaCombat) => s.parts.forEach((p, i) => { if (p.kind === 'flak' || p.kind === 'turret') s.damage(i, 9999, 'gun'); });

describe('naval part damage and sinking', () => {
  it('light boats can be shredded with guns; destroyed mounts no longer take damage', () => {
    const s = new SeaCombat('eboat'), mount = s.parts.findIndex(p => p.kind === 'flak');
    expect(s.damage(mount, 80, 'gun')).toBe(80); expect(s.damage(mount, 80, 'gun')).toBe(0);
    expect(s.hp).toBe(170); s.damage(hull(s), 170, 'gun'); expect(s.alive).toBe(false);
    expect(s.sink).toBe('listing'); s.update(6); expect(s.sink).toBe('settling'); s.update(8); expect(s.resolved).toBe(true);
    expect(s.damage(hull(s), 9999, 'bomb')).toBe(0);
  });
  it('requires all four battleship turrets and all flak mounts before opening magazines', () => {
    const s = new SeaCombat('battleship'), mag = s.parts.findIndex(p => p.kind === 'magazine');
    expect(s.parts.filter(p => p.kind === 'turret')).toHaveLength(4);
    expect(s.damage(mag, 9999, 'bomb')).toBe(0);
    s.parts.forEach((p, i) => { if (p.kind === 'turret') s.damage(i, 999, 'rocket'); });
    expect(s.armourOpen).toBe(false); disarm(s); expect(s.armourOpen).toBe(true);
    expect(s.damage(mag, 100, 'bomb')).toBe(180);
    s.damage(mag, 9999, 'bomb'); s.update(8); expect(s.sink).toBe('breaking');
    s.update(10); expect(s.sink).toBe('settling'); s.update(14); expect(s.sink).toBe('sunk');
  });
  it('armoured hulls resist guns but a waterline magazine amplifies ordnance', () => {
    const s = new SeaCombat('destroyer'); expect(s.damage(hull(s), 100, 'gun')).toBe(22);
    const mag = s.parts.findIndex(p => p.kind === 'magazine'); expect(s.damage(mag, 400, 'rocket')).toBe(720);
    s.damage(hull(s), 1000, 'bomb'); s.update(32); expect(s.sink).toBe('sunk');
  });
  it('rejects invalid damage and time; large steps cannot skip terminal states', () => {
    const s = new SeaCombat('trawler'); s.damage(0, NaN, 'gun'); s.damage(0, -100, 'gun'); s.update(NaN);
    expect(s.hp).toBe(s.spec.hp); s.damage(0, 999, 'bomb'); s.update(1000); expect(s.sink).toBe('sunk');
  });
});
describe('U-boat deadlines', () => {
  it('starts diving on attack, retains a near-bomb window and escapes without a kill', () => {
    const s = new SeaCombat('uboat'); s.update(20); expect(s.dive).toBe('surfaced');
    s.damage(hull(s), 1, 'gun'); expect(s.dive).toBe('diving'); s.update(9); expect(s.dive).toBe('submerged');
    expect(s.damage(hull(s), 100, 'rocket')).toBe(0); expect(s.damage(hull(s), 100, 'bomb')).toBe(100);
    s.update(6); expect(s.damage(hull(s), 999, 'bomb')).toBe(0); s.update(15); expect(s.dive).toBe('escaped');
    expect(s.resolved).toBe(true); expect(s.hp).toBe(259);
  });
  it('nearby bombs sink a diving boat and stop its escape clock', () => {
    const s = new SeaCombat('uboat'); s.attack(); s.update(10); s.damage(hull(s), 500, 'bomb');
    expect(s.sink).toBe('listing'); s.update(20); expect(s.sink).toBe('sunk'); expect(s.dive).not.toBe('escaped');
  });
});
describe('waves, mode routing and localisation', () => {
  it('escalates through the whole roster and keeps endless fleets bounded', () => {
    const kinds = new Set<string>();
    for (let i = 1; i <= 100; i++) { const wave = seaWave(i); expect(wave.includes('battleship')).toBe(i % 5 === 0); expect(wave.length).toBeLessThanOrEqual(10); wave.forEach(k => kinds.add(k)); }
    expect([...kinds].sort()).toEqual(Object.keys(SEA_KINDS).sort());
    const a = seaWave(1); a.length = 0; expect(seaWave(1)).toHaveLength(3);
  });
  it('routes the naval board independently of air survival and accepts finite campaigns', () => {
    const m = seaMission(); expect(modeFor(m)).toBe(SEA_MODE); expect(SURVIVAL_MODE.matches(m)).toBe(false);
    expect(leaderboardMode(m)).toBe('survival-sea'); expect(m.rounds).toBe(Infinity);
    expect(seaMission(2)).toMatchObject({ naval: true, rounds: 2, duration: 0 });
    const rules = readFileSync('firestore.rules', 'utf8');
    const regex = new RegExp(rules.match(/request.resource.data.mode.matches\('([^']+)'\)/)![1]);
    expect(regex.test('survival-sea')).toBe(true); expect(regex.test('survival-invalid')).toBe(false);
    for (const s of [m.title, m.target, m.date, m.success!, ...m.briefing, ...m.objectives, SEA_MODE.blurb, ...Object.values(SEA_RADIO), ...Object.values(SEA_KINDS).map(s => s.label)]) expect(hasPhrase(s), s).toBe(true);
    for (const [en, ar] of Object.entries(table.phrases)) { expect(ar).toMatch(/[؀-ۿ]/); expect([...ar.matchAll(/\{\w+\}/g)].map(x => x[0]).sort()).toEqual([...en.matchAll(/\{\w+\}/g)].map(x => x[0]).sort()); }
  });
  it('allows shallow skip bombing but rejects steep, slow and exhausted skips', () => {
    expect(canSkipBomb(-25, 140, 0)).toBe(true); expect(canSkipBomb(-80, 140, 0)).toBe(false);
    expect(canSkipBomb(-10, 60, 0)).toBe(false); expect(canSkipBomb(-25, 140, 2)).toBe(false);
  });
  it('models split hulls, sinking, periscope wakes and floating-origin ground coordinates', () => {
    const sea = new SeaWorld(); sea.root.position.set(-4000, 0, 1000);
    expect(sea.groundAt(-650, 500)).toBe(47); expect(sea.groundAt(-4000, 500)).toBe(0);
    const ship = sea.add('destroyer', 0, 0); ship.combat.damage(0, 9999, 'bomb'); sea.update(10, true);
    expect(ship.halves[0].rotation.x).toBeLessThan(0); expect(ship.halves[1].rotation.x).toBeGreaterThan(0);
    expect(ship.oil.visible).toBe(true); expect(sea.spray.count).toBeLessThanOrEqual(96);
    const boat = sea.add('uboat', 0, 500); boat.combat.attack(); sea.update(10, true);
    expect(boat.wake.visible).toBe(true); expect(boat.wake.scale.x).toBe(12);
    sea.clear(); expect(sea.ships).toHaveLength(0);
  });
});

vi.mock('../src/audio/Sound', () => ({ sound: { play: vi.fn() } }));
import { SeaOps } from '../src/game/SeaOps';
import type { World } from '../src/world/World';
import type { UI } from '../src/ui/UI';

function combatFixture() {
  const pf = { alive: true, pos: new THREE.Vector3(0, 20, -250), vel: new THREE.Vector3(0, 0, 140), root: new THREE.Group(), forward: (out: THREE.Vector3) => out.set(0, 0, 1) };
  const world = { scene: new THREE.Scene(), playerFighter: pf, stats: { kills: 0, shots: 0, hits: 0, damage: 0 },
    callout: vi.fn(), effects: { explosion: vi.fn(), warshipBlast: vi.fn(), flak: vi.fn(), trail: vi.fn() }, ballistics: { ground: null } };
  const ops = new SeaOps(world as unknown as World, {} as UI, null, null); ops.active = true;
  // Tests exercise the normal private collision/update callbacks without a WebGL renderer.
  const callbacks = ops as unknown as { ballistic: NonNullable<World['ballistics']['ground']>; updateOrdnance(dt: number): void; ordnance: { skips: number; life: number; mesh: THREE.Mesh; vel: THREE.Vector3 }[] };
  return { ops, world, pf, callbacks };
}
describe('naval weapons integration', () => {
  it('routes real bullet segments to the nearest part after floating-origin translation', () => {
    const { ops, world, callbacks } = combatFixture(); ops.sea.root.position.set(-3000, 0, 6000);
    const ship = ops.sea.add('merchant', 0, 0);
    expect(callbacks.ballistic(-3100, 2, 6000, -2900, 2, 6000, false, 200, true, null, false)).toBe(true);
    expect(ship.combat.hp).toBe(300); expect(world.stats.hits).toBe(1);
    callbacks.ballistic(-3100, 2, 6000, -2900, 2, 6000, true, 999, false, null, false);
    expect(ship.combat.hp).toBe(300); // the fleet cannot sink itself with flak
    callbacks.ballistic(-3100, 2, 6000, -2900, 2, 6000, false, 900, true, null, false);
    expect(world.stats.kills).toBe(1); ops.damage(ship, 0, 999, 'bomb'); expect(world.stats.kills).toBe(1);
  });
  it('consumes a pooled rocket, damages the moving hull and does not damage it once per hull sphere', () => {
    const { ops, pf, callbacks } = combatFixture(); pf.pos.set(0, 5, -250); pf.vel.set(0, 0, 140);
    const ship = ops.sea.add('cruiser', 0, 0);
    expect(ops.launch('rocket')).toBe(true); expect(ops.rockets).toBe(7);
    expect(ops.launch('rocket')).toBe(false); // launch interval
    for (let i = 0; i < 60; i++) callbacks.updateOrdnance(1 / 60);
    expect(ship.combat.hp).toBeLessThan(ship.combat.spec.hp); expect(ship.combat.hp).toBeGreaterThan(0);
    expect(callbacks.ordnance[0].life).toBe(0);
  });
  it('skips a shallow bomb and detonates its fuse; nearby diving U-boats take the blast', () => {
    const { ops, pf, callbacks } = combatFixture(); pf.pos.set(0, 8, -150);
    expect(ops.launch('bomb')).toBe(true); expect(ops.bombs).toBe(1);
    for (let i = 0; i < 70; i++) callbacks.updateOrdnance(1 / 60);
    expect(callbacks.ordnance[0].skips).toBe(1);
    for (let i = 0; i < 300; i++) callbacks.updateOrdnance(1 / 60);
    expect(callbacks.ordnance[0].life).toBe(0);
    const boat = ops.sea.add('uboat', 500, 0); boat.combat.attack(); boat.update(10, 10, 0);
    ops.blast(new THREE.Vector3(520, 0, 0), 'bomb'); expect(boat.combat.sink).toBe('listing');
  });
});

// Regression: broad hull hitboxes must never shield all the battleship's deck mounts.
it('lets bullets disable battleship flak before the armoured hull opens', () => {
  const { ops, callbacks } = combatFixture(); const ship = ops.sea.add('battleship', 0, 0);
  const idx = ship.combat.parts.findIndex(p => p.kind === 'flak'), p = ship.combat.parts[idx];
  callbacks.ballistic(p.x, 100, p.z, p.x, -10, p.z, false, 100, true, null, false);
  expect(p.hp).toBe(0); expect(ship.combat.hp).toBe(ship.combat.spec.hp);
});

// Art proportions must stay tied to hit volumes; changing visual length cannot change armour/sink rules.
describe('naval visual contracts', () => {
  it('uses metre-scale hulls and keeps superfiring mounts clear of the bridge', () => {
    const sea = new SeaWorld();
    for (const [kind, length, beam] of [['battleship', 250, 36], ['destroyer', 120, 12], ['uboat', 67, 6.2], ['eboat', 33, 7]] as const) {
      const s = sea.add(kind, 0, 0); expect(s.combat.spec.length).toBe(length); expect(s.combat.spec.beam).toBe(beam);
      const bounds = new THREE.Box3();
      for (const half of s.halves) { half.geometry.computeBoundingBox(); bounds.union(half.geometry.boundingBox!); }
      expect(bounds.max.z - bounds.min.z).toBeCloseTo(length, 2);
      for (const m of s.halves) for (const value of m.geometry.getAttribute('position').array) expect(Number.isFinite(value)).toBe(true);
    }
    const s = sea.ships[0], guns = s.combat.parts.filter(p => p.kind === 'turret');
    expect(guns.map(p => p.z)).toEqual([-85, -60, 60, 85]);
    expect(guns[1].y).toBeGreaterThan(guns[0].y); expect(guns[2].y).toBeGreaterThan(guns[3].y);
  });
  it('bounds effects, gates fine detail and rotates the radar without changing combat state', () => {
    const sea = new SeaWorld(), s = sea.add('battleship', 0, 0), radar = sea.add('radar', 3340, 0);
    sea.update(0, false, new THREE.Vector3(0, 100, 0)); expect(s.detail.every(m => m.visible)).toBe(true);
    sea.update(0, false, new THREE.Vector3(4000, 100, 0)); expect(s.detail.every(m => !m.visible)).toBe(true);
    sea.update(0, true, new THREE.Vector3()); expect(s.detail.every(m => !m.visible)).toBe(true);
    const angle = radar.radar!.rotation.y;
    const gun = s.combat.parts.findIndex(p => p.kind === 'turret');
    for (let i = 0; i < 300; i++) sea.fireGun(s, gun, true);
    sea.effects.update(.02); expect(sea.effects.mesh.count).toBeLessThanOrEqual(256); expect(sea.effects.mesh.count).toBeGreaterThan(0);
    sea.update(1, true); expect(radar.radar!.rotation.y).toBeGreaterThan(angle); expect(s.combat.hp).toBe(s.combat.spec.hp);
    sea.effects.update(7); expect(sea.effects.mesh.count).toBe(0); sea.clear(); expect(sea.effects.mesh.count).toBe(0);
  });
});

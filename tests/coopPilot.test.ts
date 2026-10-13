import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { pilotInput, validPilotInput, pilotDamage, applyPilotDamage, packAircraft, unpackAircraft, coopBoard } from '../src/net/CoopPilot';
import { CoopPilot } from '../src/game/CoopPilot';
import { Fighter, makeGun } from '../src/world/Aircraft';
import { World } from '../src/world/World';
import { Ballistics } from '../src/world/Ballistics';
import { FlightModel, P51_PARAMS } from '../src/world/FlightModel';
import { cleanScoreName } from '../src/net/Leaderboard';
import { PHRASES } from '../src/i18n/phrases';
import type { Game } from '../src/game/Game';
import type { SnapAircraft } from '../src/game/CoopSession';
import { readFileSync } from 'node:fs';

// Real fighter methods and flight model; no GPU/model loading in protocol tests.
function fighter(): Fighter {
  const root = new THREE.Group(); root.position.set(30, 8000, -600);
  const f = Object.assign(Object.create(Fighter.prototype), {
    root, team: 'allied', alive: true, vel: new THREE.Vector3(0, 0, 140), maxStructure: 500, structure: 500,
    zones: [{ name: 'engine', hp: 100, maxHp: 100, burning: false }], isPlayer: false,
    trigger: true, guns: [-2.4, -2.2, -2, 2, 2.2, 2.4].map(x => makeGun({ offset: new THREE.Vector3(x, 0, 0), ammo: 500, cooldown: 0, spread: 0, damage: 14, muzzleVel: 880 })),
  }) as Fighter;
  (f as any).fm = new FlightModel(P51_PARAMS, root.position, root.quaternion); f.fm.vel.copy(f.vel);
  return f;
}

describe('pilot co-op protocol', () => {
  it('round-trips flight input, absolute origin, throttle and trigger with bounded quantisation', () => {
    const f = fighter(), origin = new THREE.Vector3(12000, 0, 5000);
    f.quat.setFromEuler(new THREE.Euler(.13, .45, -.27));
    const d = JSON.parse(JSON.stringify(pilotInput(f, origin, 25, 2)));
    expect(validPilotInput(d)).toBe(true); expect(d.slice(2, 5)).toEqual([12030, 8000, 4400]);
    expect(d[12]).toBe(f.fm.throttle); expect(d[13]).toBe(1);
    expect(new THREE.Quaternion(...d.slice(5, 9)).normalize().angleTo(f.quat)).toBeLessThan(.001);
    for (const bad of [[], [...d.slice(0, 13), 5], d.map((x: number, i: number) => i === 2 ? NaN : x), d.map((x: number, i: number) => i === 9 ? 1e6 : x)]) expect(validPilotInput(bad)).toBe(false);
  });
  it('round-trips compact snapshots with damage flags and bounded positional/quaternion error', () => {
    const rows: SnapAircraft[] = [[70042, 'P', 15000.42, 8099.15, -199.61, 0, 0, 0, 1, 13, .36], [43, 'bf109', 10, 20, 30, 0, 0, 0, 1, 1, 1]];
    const decoded = unpackAircraft(packAircraft(rows))!;
    expect(decoded[0][0]).toBe(70042); expect(decoded[1][1]).toBe('bf109'); expect(decoded[0][9]).toBe(13);
    expect(decoded[0][2]).toBeCloseTo(rows[0][2], 2); expect(decoded[0][10]).toBeCloseTo(.36, 2);
    expect(packAircraft(rows).length).toBeLessThan(JSON.stringify(rows).length);
    expect(unpackAircraft('!notbase64')).toBeNull(); expect(unpackAircraft(btoa('x'))).toBeNull();
  });
  it('rejects stale sequences/old lives and interpolates the remote fighter without flying local physics', () => {
    const f = fighter(), c = new CoopPilot({ state: 'playing' } as Game, vi.fn(), new THREE.Vector3());
    c.remote = f;
    const d = pilotInput(f, new THREE.Vector3(), 1, 0);
    expect(c.input(d)).toBe(true); expect(c.input(d)).toBe(false); expect(c.input([2, 8, ...d.slice(2)])).toBe(false);
    const next = [...d]; next[0] = 2; next[4] += 140 / 30; expect(c.input(next)).toBe(true);
    c.beforeWorld(1 / 60); expect(f.trigger).toBe(true); expect(f.pos.z).toBeGreaterThan(-610); expect(f.pos.z).toBeLessThan(-590);
    c.beforeWorld(1); expect(f.trigger).toBe(false);
  });
  it('applies only authoritative same-life damage, preserves local transforms and propagates fire/ammo', () => {
    const host = fighter(), guest = fighter(); host.zones[0].hp = 25; host.zones[0].burning = true; host.structure = 100; host.guns[0].ammo = 12; host.guns[1].ammo = Infinity;
    const d = JSON.parse(JSON.stringify(pilotDamage(host, 2))), before = guest.pos.clone();
    expect(applyPilotDamage(guest, d, 1)).toBe(false); expect(guest.structure).toBe(500);
    expect(applyPilotDamage(guest, d, 2)).toBe(true); expect(guest.zones[0].hp).toBe(25); expect(guest.zones[0].burning).toBe(true);
    expect(guest.structure).toBe(100); expect(guest.guns[0].ammo).toBe(12); expect(guest.pos.equals(before)).toBe(true); expect(guest.guns[1].ammo).toBe(Infinity);
    host.alive = false; expect(pilotDamage(host, 2).alive).toBe(false);
    expect(applyPilotDamage(guest, { ...d, zones: [NaN] }, 2)).toBe(false);
  });
  it('fires six real host ballistic rounds from the remote Mustang with inherited velocity and ammunition', () => {
    const f = fighter(), ballistics = new Ballistics();
    const world = { ballistics, effects: { muzzleFlash: vi.fn() }, stats: { shots: 0 } };
    World.prototype.fireGuns.call(world as unknown as World, f, 1 / 60);
    expect(ballistics.n).toBe(6); expect(f.guns.every(g => g.ammo === 499)).toBe(true);
    const b = ballistics as any; expect(b.owner.slice(0, 6).every((owner: unknown) => owner === f)).toBe(true);
    expect(b.vz[0]).toBeCloseTo(1020); expect(b.dmg[0]).toBe(14); expect(world.stats.shots).toBe(0);
    f.alive = false; World.prototype.fireGuns.call(world as unknown as World, f, .1); expect(ballistics.n).toBe(6);
  });
  it('routes both callsigns to coop-pilot and preserves all existing rules modes', () => {
    expect(coopBoard('pilot')).toBe('coop-pilot'); expect(coopBoard('gunner')).toBe('coop-gunner');
    expect(cleanScoreName('Blue One + Blue Two', coopBoard('pilot'))).toBe('Blue One + Blue Two');
    const rules = readFileSync('firestore.rules', 'utf8'), pattern = rules.match(/mode.matches\('([^']+)'\)/)![1];
    for (const mode of ['coop-pilot', 'coop-gunner', 'survival-sea', 'survival-aa', 'survival-pilot', 'campaign-m12', 'daily-gunner-20261013', 'weekly-pilot-202641', 'strafe-pilot']) expect(new RegExp(pattern).test(mode)).toBe(true);
  });
  it('translates every new lobby, HUD and result phrase into Arabic', () => {
    for (const text of ['Blue One', 'Blue Two', 'Mission', 'Co-op mode', 'B-17 crew (gunners)', 'P-51 escort (pilots)', 'Co-op Survival — Pilots', 'Custom Battle — saved escort settings', 'Partner connected — ready to fly', 'Pause is disabled in co-op', 'You are down — spectating your partner until the next round', 'Form up on your partner', '{name} destroyed {target}', 'Leave co-op']) expect(PHRASES[text], text).toMatch(/[\u0600-\u06ff]/);
  });
});

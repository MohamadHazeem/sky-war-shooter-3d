import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { pickAttackTarget, pickCoverTarget, pickBomberTarget, WING_KEYS, WING_RADIO } from '../src/game/Wingman';
import { RAIDS, RAID_RADIO, RaidBomberPilot, raidMission, nightMission, RAID_MODE, NIGHT_MODE } from '../src/game/RaidDefence';
import { MODES, leaderboardMode } from '../src/game/Modes';
import { KeyMap, buildTranslation, defaultBindings } from '../src/core/KeyMap';
import { FlightModel } from '../src/world/FlightModel';
import { ENEMY_VARIANTS } from '../src/world/EnemyTypes';
import type { Fighter } from '../src/world/Aircraft';
import type { WorldView } from '../src/world/AI';
import { Searchlights } from '../src/render/Searchlights';
import { seedRandom } from './helpers';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const spot = (x: number, y: number, z: number, alive = true) => ({ pos: V(x, y, z), alive });

describe('wingman target choice', () => {
  const lead = V(0, 7000, 0), fwd = V(0, 0, 1);

  it('attack: the padlocked bandit first, else the one nearest the nose', () => {
    const ahead = spot(50, 7000, 1500), offAxis = spot(900, 7000, 900), behind = spot(0, 7000, -600);
    expect(pickAttackTarget(lead, fwd, [offAxis, ahead, behind], null)).toBe(ahead);
    expect(pickAttackTarget(lead, fwd, [offAxis, ahead, behind], behind)).toBe(behind);
    // a dead padlock or nothing in front: no target
    expect(pickAttackTarget(lead, fwd, [behind], spot(0, 7000, 500, false))).toBe(null);
    expect(pickAttackTarget(lead, fwd, [spot(0, 7000, 5000)], null)).toBe(null);
  });

  it('cover: whoever is on the six (nearest), or fighting the leader close by', () => {
    const six = spot(0, 7050, -400), farSix = spot(0, 7000, -1400), ahead = spot(0, 7000, 600);
    expect(pickCoverTarget(lead, fwd, [farSix, ahead, six])).toBe(six);
    expect(pickCoverTarget(lead, fwd, [ahead])).toBe(null);
    expect(pickCoverTarget(lead, fwd, [ahead], (e) => e === ahead)).toBe(ahead);
    expect(pickCoverTarget(lead, fwd, [spot(0, 7000, -2500)])).toBe(null);
  });

  it('bombers: the attacker closest to the bomber it is going for', () => {
    const b1 = spot(0, 7600, 0), b2 = spot(300, 7600, 0);
    const near = spot(0, 7600, 500), far = spot(0, 7600, 2500), idle = spot(0, 7600, 100);
    const goingFor = new Map([[near, b2], [far, b1]]);
    expect(pickBomberTarget([far, near, idle], (e) => goingFor.get(e) ?? null)).toBe(near);
    expect(pickBomberTarget([idle], () => null)).toBe(null);
  });

  it('keys 1-4 map to the four orders, each with a radio acknowledgement', () => {
    expect(Object.values(WING_KEYS)).toEqual(['attack', 'cover', 'bombers', 'form']);
    for (const t of Object.values(WING_RADIO)) expect(t.length).toBeGreaterThan(8);
  });
});

describe('scoped key bindings', () => {
  it('the number keys are gun positions in the B-17 and wingman orders in the P-51', () => {
    const store = new Map<string, string>();
    const km = new KeyMap({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } });
    expect(buildTranslation(defaultBindings(), 'pilot').size).toBe(0);
    expect(km.bindings.seat1).toBe('Digit1');
    expect(km.bindings.wing1).toBe('Digit1');
    // moving a wingman order does not touch the gun positions (no swap across roles)
    expect(km.bind('wing1', 'KeyU')).toEqual({ ok: true, swapped: undefined });
    expect(km.bindings.seat1).toBe('Digit1');
    km.scope = 'pilot';
    expect(km.translate('KeyU', true)).toBe('Digit1');
    expect(km.translate('Digit1', true)).toBe('');
    km.scope = 'gunner';
    expect(km.translate('KeyU', true)).toBe('KeyU');
    expect(km.translate('Digit1', true)).toBe('Digit1');
    // within one role a taken key still swaps
    km.scope = 'pilot';
    expect(km.bind('wing2', 'KeyU')).toEqual({ ok: true, swapped: 'wing1' });
    expect(km.bindings.wing1).toBe('Digit2');
  });
});

// Just enough of a Fighter for the raid bomber's pilot
function mockBomber(pos: THREE.Vector3, dir: THREE.Vector3, speed: number) {
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dir.clone().normalize());
  const fm = new FlightModel(ENEMY_VARIANTS.ju88.params, pos.clone(), q);
  fm.vel.copy(dir).normalize().multiplyScalar(speed);
  const f = {
    fm, enemyType: 'ju88', alive: true, trigger: false, gunAim: null, structureFrac: 1, label: 'Ju 88',
    get pos() { return fm.pos; }, get quat() { return fm.quat; }, get vel() { return fm.vel; },
    forward: (o = new THREE.Vector3()) => fm.forward(o),
    up: (o = new THREE.Vector3()) => fm.up(o),
  };
  return f as unknown as Fighter & { structureFrac: number };
}
const emptyWorld = { fighters: () => [], playerFighter: null, enemyAimMult: 1 } as unknown as WorldView;

describe('raid bombers', () => {
  it('fly straight and level for the field and bomb it', () => {
    seedRandom(3);
    const f = mockBomber(V(0, 6500, -6000), V(0, 0, 1), 110);
    const p = new RaidBomberPilot(f, 1, V(0, 0, 0), 6500, 110);
    p.course.set(0, 0, 1);
    let released = 0;
    p.onRelease = () => released++;
    let minY = Infinity, maxY = -Infinity, maxX = 0;
    for (let i = 0; i < 60 * 90 && !released; i++) {
      p.update(1 / 60, emptyWorld);
      f.fm.step(1 / 60);
      minY = Math.min(minY, f.pos.y); maxY = Math.max(maxY, f.pos.y); maxX = Math.max(maxX, Math.abs(f.pos.x));
    }
    expect(released).toBe(1);
    expect(p.result).toBe('released');
    expect(p.inbound).toBe(false);
    expect(f.pos.z).toBeGreaterThan(-1200);           // released ~700 m short of the field
    expect(maxY - minY).toBeLessThan(400);             // held his height
    expect(maxX).toBeLessThan(150);                    // and his course
    expect(f.fm.speed).toBeGreaterThan(80);
    expect(f.fm.speed).toBeLessThan(150);
  });

  it('badly damaged, he jettisons and turns for home', () => {
    seedRandom(4);
    const f = mockBomber(V(0, 6500, -6000), V(0, 0, 1), 110);
    const p = new RaidBomberPilot(f, 1, V(0, 0, 0), 6500, 110);
    p.course.set(0, 0, 1);
    let jett = 0;
    p.onJettison = () => jett++;
    f.structureFrac = 0.2;
    for (let i = 0; i < 60 * 25; i++) { p.update(1 / 60, emptyWorld); f.fm.step(1 / 60); }
    expect(jett).toBe(1);
    expect(p.result).toBe('jettisoned');
    expect(f.forward().z).toBeLessThan(-0.5);          // heading back the way he came
  });
});

describe('raid missions', () => {
  it('both are three rounds of escalating raids with radio from the voice set', () => {
    for (const [id, def] of Object.entries(RAIDS)) {
      expect(def.rounds.length, id).toBe(3);
      const counts = def.rounds.map((r) => r.groups.reduce((n, g) => n + g.bombers.length, 0));
      expect(counts[2]).toBeGreaterThan(counts[0]);
      for (const r of def.rounds) {
        expect(r.maxTime).toBeGreaterThan(120);
        expect(r.groups[0].afterClear ?? false).toBe(false);
        for (const g of r.groups) for (const t of g.bombers) expect(['ju88', 'bf110']).toContain(t);
      }
      expect(def.allowThrough).toBeGreaterThan(0);
    }
    expect(RAIDS['night-pilot'].night).toBe(true);
    expect(RAIDS['raid-pilot'].night).toBe(false);
    for (const [who] of Object.values(RAID_RADIO)) expect(['Control', 'Blue Two']).toContain(who);
  });

  it('are pilot-only Special operations with their own leaderboards', () => {
    expect(MODES).toContain(RAID_MODE);
    expect(MODES).toContain(NIGHT_MODE);
    const raid = raidMission(), night = nightMission();
    expect(raid.role).toBe('pilot');
    expect(raid.rounds).toBe(3);
    expect(raid.bombers).toBe(0);
    expect(night.weather?.mood).toBe('night');
    expect(RAID_MODE.roles).toEqual(['pilot']);
    expect(leaderboardMode(raid)).toBe('raid-pilot');
    expect(leaderboardMode(night)).toBe('night-pilot');
    expect(RAIDS[raid.id]).toBeDefined();
    expect(RAIDS[night.id]).toBeDefined();
  });
});

describe('searchlights', () => {
  it('a sweeping beam catches a raider and holds him coned', () => {
    seedRandom(5);
    const scene = new THREE.Scene();
    const sl = new Searchlights<{ pos: THREE.Vector3; alive: boolean }>(scene);
    sl.setup([V(0, 0, 0), V(400, 0, 200), V(-300, 0, 500)], V(0, 0, 1));
    expect(sl.count).toBe(3);
    // a raider sitting right where the first beam points
    const b = (sl as any).beams[0];
    const raider = { pos: b.dir.clone().multiplyScalar(5000), alive: true };
    let coned = 0;
    for (let i = 0; i < 60 * 6; i++) {
      raider.pos.addScaledVector(V(0, 0, 1), 100 / 60);
      sl.update(1 / 60, [raider]);
      if (sl.coned.has(raider)) coned++;
    }
    expect(sl.locks()).toBeGreaterThan(0);
    expect(coned).toBeGreaterThan(60);
    sl.clear();
    expect(sl.count).toBe(0);
    expect(scene.children.length).toBe(0);
  });
});



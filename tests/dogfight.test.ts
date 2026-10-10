import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { DogfightAI, STYLES, styleOf, type BfmMode } from '../src/world/DogfightAI';
import { FlightModel, P51_PARAMS } from '../src/world/FlightModel';
import { ENEMY_VARIANTS, type EnemyType } from '../src/world/EnemyTypes';
import type { Fighter } from '../src/world/Aircraft';
import type { WorldView } from '../src/world/AI';
import { seedRandom } from './helpers';

const DT = 1 / 60;
const world = { enemyAimMult: 1 } as unknown as WorldView;

// Just enough of a Fighter for the dogfight AI: a flight model, position, velocity, attitude
function mock(type: EnemyType | 'p51', pos: THREE.Vector3, dir: THREE.Vector3, speed = 180): Fighter {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
  const fm = new FlightModel(type === 'p51' ? P51_PARAMS : ENEMY_VARIANTS[type].params, pos.clone(), q);
  fm.vel.copy(dir).normalize().multiplyScalar(speed);
  return {
    fm, enemyType: type === 'p51' ? '' : type, alive: true, trigger: false, gunAim: null,
    get pos() { return fm.pos; }, get quat() { return fm.quat; }, get vel() { return fm.vel; },
    forward: (o = new THREE.Vector3()) => fm.forward(o),
    up: (o = new THREE.Vector3()) => fm.up(o),
  } as unknown as Fighter;
}

// Target flying straight and level
function straight(t: Fighter) {
  t.fm.pitch = 0; t.fm.roll = 0; t.fm.yaw = 0; t.fm.throttle = 0.9;
  t.fm.step(DT);
}

describe('DogfightAI personalities', () => {
  it('maps each enemy type to its fighting style', () => {
    expect(styleOf('fw190')).toBe('boomzoom');
    expect(styleOf('bf109')).toBe('turner');
    expect(styleOf('me262')).toBe('slasher');
    expect(styleOf('me163')).toBe('slasher');
    expect(styleOf('bf110')).toBe('heavy');
    expect(styleOf('ju88')).toBe('heavy');
    expect(STYLES.turner.turnTime).toBe(Infinity);          // the 109 stays in the turn
    expect(STYLES.slasher.extendTo).toBeGreaterThan(STYLES.turner.extendTo);
    expect(STYLES.heavy.pull).toBeLessThan(STYLES.turner.pull);
  });
});

describe('DogfightAI manoeuvres', () => {
  it('a Bf 109 behind a straight-flying Mustang closes and opens fire', () => {
    seedRandom(7);
    const t = mock('p51', new THREE.Vector3(0, 7500, 0), new THREE.Vector3(0, 0, 1), 150);
    const e = mock('bf109', new THREE.Vector3(30, 7550, -800), new THREE.Vector3(0, 0, 1), 200);
    const ai = new DogfightAI(e, 1.2);
    let fired = 0, minD = Infinity;
    for (let i = 0; i < 40 / DT; i++) {
      ai.update(DT, world, t); e.fm.step(DT); straight(t);
      if (e.trigger) fired++;
      minD = Math.min(minD, e.pos.distanceTo(t.pos));
    }
    expect(minD).toBeLessThan(500);
    expect(fired).toBeGreaterThan(30);
  });

  it('breaks (with a warning call) when the Mustang sits on its six', () => {
    seedRandom(3);
    const calls: string[] = [];
    DogfightAI.onCall = (c) => calls.push(c);
    const e = mock('bf109', new THREE.Vector3(0, 7500, 0), new THREE.Vector3(0, 0, 1), 180);
    const t = mock('p51', new THREE.Vector3(20, 7500, -450), new THREE.Vector3(0, 0, 1), 190);
    const ai = new DogfightAI(e, 1.3);
    const seen = new Set<BfmMode>();
    let maxRoll = 0;
    for (let i = 0; i < 4 / DT; i++) {
      ai.update(DT, world, t); e.fm.step(DT); straight(t);
      seen.add(ai.mode);
      maxRoll = Math.max(maxRoll, Math.abs(e.fm.roll));
    }
    DogfightAI.onCall = null;
    expect(seen.has('break')).toBe(true);
    expect(calls).toContain('break');
    expect(maxRoll).toBeGreaterThan(0.5);                   // rolled hard into the turn
  });

  it('an Me 262 slashes through and extends instead of turning', () => {
    seedRandom(11);
    const t = mock('p51', new THREE.Vector3(0, 7500, 0), new THREE.Vector3(0, 0, 1), 170);
    const e = mock('me262', new THREE.Vector3(0, 7600, 1600), new THREE.Vector3(0, 0, -1), 230);
    const ai = new DogfightAI(e, 1);
    const seen = new Set<BfmMode>();
    for (let i = 0; i < 30 / DT; i++) { ai.update(DT, world, t); e.fm.step(DT); straight(t); seen.add(ai.mode); }
    expect(seen.has('headon') || seen.has('pursue')).toBe(true);
    expect(seen.has('extend')).toBe(true);
  });

  it('a wingman flies cover on his leader, then goes for a Mustang that gets behind the leader', () => {
    seedRandom(5);
    const calls: string[] = [];
    DogfightAI.onCall = (c) => calls.push(c);
    const lead = mock('bf109', new THREE.Vector3(0, 7500, 0), new THREE.Vector3(0, 0, 1), 180);
    const wing = mock('bf109', new THREE.Vector3(450, 7700, 0), new THREE.Vector3(0, 0, 1), 180);
    const t = mock('p51', new THREE.Vector3(0, 7500, -500), new THREE.Vector3(0, 0, 1), 185);
    const a = new DogfightAI(lead, 1), b = new DogfightAI(wing, 1);
    DogfightAI.pair(a, b);
    expect(b.mode).toBe('cover');
    let covered = false;
    for (let i = 0; i < 6 / DT; i++) {
      a.update(DT, world, t); b.update(DT, world, t);
      lead.fm.step(DT); wing.fm.step(DT); straight(t);
      if (b.mode === 'pursue') covered = true;
    }
    DogfightAI.onCall = null;
    expect(covered).toBe(true);
    expect(calls).toContain('cover');
    a.end();
    expect(b.leader).toBeNull();
  });

  it('keeps every control in range and the state finite in a long free-for-all of every style', () => {
    seedRandom(42);
    const types: EnemyType[] = ['fw190', 'bf109', 'me262', 'bf110', 'ju88', 'me163'];
    for (const type of types) {
      const t = mock('fw190', new THREE.Vector3(0, 7600, 0), new THREE.Vector3(1, 0, 0), 180);
      const e = mock(type, new THREE.Vector3(600, 7700, 900), new THREE.Vector3(-1, 0, -1), 190);
      const ai = new DogfightAI(e, 1.1);
      const ai2 = new DogfightAI(t, 1.1); // the "Mustang" fights back with the same brain
      for (let i = 0; i < 60 / DT; i++) {
        ai.update(DT, world, t); ai2.update(DT, world, e);
        e.fm.step(DT); t.fm.step(DT);
        for (const fm of [e.fm, t.fm]) {
          expect(Math.abs(fm.roll)).toBeLessThanOrEqual(1);
          expect(Math.abs(fm.yaw)).toBeLessThanOrEqual(1);
          expect(fm.pitch).toBeLessThanOrEqual(1);
          expect(fm.pitch).toBeGreaterThanOrEqual(-0.6);
        }
      }
      for (const v of [e.pos.x, e.pos.y, e.pos.z, e.vel.length(), t.pos.y]) expect(Number.isFinite(v), type).toBe(true);
    }
  });
});

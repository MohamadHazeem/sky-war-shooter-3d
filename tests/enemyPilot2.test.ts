import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { EnemyPilot, type WorldView } from '../src/world/AI';
import { FlightModel, FW190_PARAMS } from '../src/world/FlightModel';
import type { Bomber, Fighter } from '../src/world/Aircraft';
import { AI_STATS, resetAiStats, mulberry32, reactionTime, staggerDelay, type Personality } from '../src/world/PilotMind';
import { seedRandom } from './helpers';

// EnemyPilot driven on a small host: one B-17 (the player's ship) flying north at 75 m/s and
// a Fw 190 flown by the real flight model. Deterministic: Math.random and the pilot's rng seeded.
function fighter(pos: THREE.Vector3, vel: THREE.Vector3) {
  const root = new THREE.Object3D();
  root.position.copy(pos);
  root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), vel.clone().normalize());
  const fm = new FlightModel(FW190_PARAMS, root.position, root.quaternion);
  fm.vel.copy(vel); fm.speed = vel.length();
  const f = {
    alive: true, remove: false, root, fm, pos: root.position, vel: fm.vel, quat: root.quaternion, enemyType: 'fw190',
    zones: [{ name: 'engine', hp: 100, maxHp: 100, engine: 0 }], structure: 100, maxStructure: 100,
    get structureFrac() { return this.structure / this.maxStructure; },
    trigger: false, gunAim: null, lastPlayerHit: -99, fireNear: 0, dropTankAttached: false, rockets: 0, fireRockets: false,
    forward: (out = new THREE.Vector3()) => out.set(0, 0, 1).applyQuaternion(root.quaternion),
  };
  return f as unknown as Fighter & { structure: number };
}

function host(opts: { wounded?: string[]; station?: string } = {}) {
  const bomber = {
    alive: true, isPlayer: true, team: 'allied', pos: new THREE.Vector3(0, 7600, 0), vel: new THREE.Vector3(0, 0, 75),
    zones: [{ name: 'tail', hp: 100, maxHp: 100 }], straggling: false, engineDead: [false, false, false, false],
  } as unknown as Bomber;
  const station = opts.station ?? 'waistL';
  const arcs: Record<string, THREE.Vector3> = { waistL: new THREE.Vector3(1, 0, 0), waistR: new THREE.Vector3(-1, 0, 0), tail: new THREE.Vector3(0, 0, -1), top: new THREE.Vector3(0, 0.6, 0.8).normalize(), ball: new THREE.Vector3(0, -0.6, -0.8).normalize() };
  const w: WorldView = {
    bombers: () => [bomber], fighters: () => [], formationForward: new THREE.Vector3(0, 0, 1), formationCenter: bomber.pos,
    player: bomber, playerFighter: null, time: 0, dropTank: vi.fn(), difficulty: 1, playerFocus: 1,
    playerArc: () => arcs[station].clone(), playerGunPos: () => bomber.pos.clone(), playerStationId: () => station,
    stationArc: (id: string) => arcs[id].clone(), stationGunPos: () => bomber.pos.clone(), enemyAimMult: 1,
    crew: { wounded: new Set(opts.wounded ?? []) }, callout: vi.fn(),
  };
  return { w, bomber };
}

function pilot(f: Fighter, personality: Personality, q: number, seed = 1) {
  const p = new EnemyPilot(f, undefined, 1.2);
  p.setPersona({ personality, signature: null, ace: false, q });
  p.rng = mulberry32(seed);
  return p;
}

const run = (p: EnemyPilot, w: WorldView, f: Fighter, seconds: number, each?: (t: number) => void) => {
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) { each?.(i * dt); p.update(dt, w); f.fm.step(dt); (w as { time: number }).time += dt; }
};

beforeEach(() => { seedRandom(11); resetAiStats(); });

describe('evasion triggers in the pilot', () => {
  it('a pilot under sustained close fire evades, after his reaction time and not before', () => {
    const { w } = host();
    const f = fighter(new THREE.Vector3(900, 7650, 0), new THREE.Vector3(-170, 0, 40));
    const p = pilot(f, 'cautious', 0.8);
    p.target = w.bombers()[0]; p.state = 'attack'; p.timer = 0;
    let firstEvade = -1;
    run(p, w, f, 3, (t) => {
      f.fireNear += 1;   // ~15 rounds a second passing within 30 m (each counted on ~4 frames)
      if (firstEvade < 0 && (p.state !== 'attack' && p.state !== 'duel' || p.evasion)) firstEvade = t;
    });
    expect(firstEvade).toBeGreaterThan(reactionTime(0.8) - 0.05);
    expect(firstEvade).toBeLessThan(1.6);
    expect(AI_STATS.jink + AI_STATS.break + AI_STATS.splitS).toBe(1);   // one evasion per pass
  });

  it('nobody evades when the rounds go wide, and aggressive pilots shrug off a light burst', () => {
    const { w } = host();
    for (const [pers, near] of [['cautious', 0], ['aggressive', 0.25]] as const) {
      const f = fighter(new THREE.Vector3(900, 7650, 0), new THREE.Vector3(-170, 0, 40));
      const p = pilot(f, pers, 0.6);
      p.target = w.bombers()[0]; p.state = 'attack';
      run(p, w, f, 1.5, () => { f.fireNear += near; });
      expect(p.evasion).toBeNull();
    }
    expect(AI_STATS.jink + AI_STATS.break + AI_STATS.splitS).toBe(0);
  });

  it('a hit counts as heavy pressure', () => {
    const { w } = host();
    const f = fighter(new THREE.Vector3(900, 7650, 0), new THREE.Vector3(-170, 0, 40));
    const p = pilot(f, 'cautious', 0.9);
    p.target = w.bombers()[0]; p.state = 'attack';
    run(p, w, f, 1.5, (t) => { if (Math.abs(t - 0.1) < 1e-6 || Math.abs(t - 0.2) < 0.009) (f as { lastPlayerHit: number }).lastPlayerHit = t + 0.001; });
    expect(AI_STATS.jink + AI_STATS.break + AI_STATS.splitS).toBe(1);
  });
});

describe('attack selection in the pilot', () => {
  it('good pilots come through the wounded gunner\'s sector, and the crew calls it', () => {
    let tail = 0;
    for (let s = 0; s < 20; s++) {
      const { w } = host({ wounded: ['tail'] });
      const f = fighter(new THREE.Vector3(3000, 8000, 0), new THREE.Vector3(-170, 0, 0));
      const p = pilot(f, 'cunning', 0.95, s);
      p.update(1 / 60, w);
      if (p.station === 'tail') tail++;
      if (p.station === 'tail') expect(w.callout).toHaveBeenCalledWith('ai_weak_tail', 'Navigator', expect.stringContaining('tail gunner'), 20, 1);
    }
    expect(tail).toBeGreaterThan(14);
  });

  it('with every gun manned, attacks keep coming through the player\'s own arc', () => {
    for (let s = 0; s < 10; s++) {
      const { w } = host();
      const f = fighter(new THREE.Vector3(3000, 8000, 0), new THREE.Vector3(-170, 0, 0));
      const p = pilot(f, 'cunning', 0.95, s);
      p.update(1 / 60, w);
      expect(p.station).toBeNull();
    }
  });
});

describe('energy after a pass', () => {
  it('a good pilot extends when slow; a rookie turns straight back in', () => {
    for (const [q, want] of [[0.8, 'recover'], [0.1, 'approach']] as const) {
      const { w } = host();
      const f = fighter(new THREE.Vector3(300, 7600, 0), new THREE.Vector3(-100, 0, 20));
      const p = pilot(f, 'cunning', q);
      p.target = w.bombers()[0]; p.state = 'break'; p.timer = 5;
      p.update(1 / 60, w);
      expect(p.state).toBe(want);
      if (want === 'recover') expect(p.recover).toBe('extend');
    }
    expect(AI_STATS.extend).toBe(1);
    expect(AI_STATS.reattack).toBe(1);
  });

  it('an extending fighter gains speed and comes back for the next run', () => {
    const { w } = host();
    const f = fighter(new THREE.Vector3(300, 7600, 0), new THREE.Vector3(-110, 0, 20));
    const p = pilot(f, 'cunning', 0.8);
    p.target = w.bombers()[0]; p.state = 'break'; p.timer = 5;
    const v0 = f.fm.vel.length();
    let maxV = v0, back = false;
    run(p, w, f, 6, () => { maxV = Math.max(maxV, f.fm.vel.length()); if (p.state === 'approach' || p.state === 'attack') back = true; });
    expect(maxV).toBeGreaterThan(v0 + 12);
    expect(back).toBe(true);
  });
});

describe('wounded fighters', () => {
  it('cautious pilots limp home; aggressive ones press on once, then limp', () => {
    const { w } = host();
    const f1 = fighter(new THREE.Vector3(900, 7650, 0), new THREE.Vector3(-170, 0, 40));
    const c = pilot(f1, 'cautious', 0.6);
    c.target = w.bombers()[0]; c.state = 'attack';
    (f1 as { structure: number }).structure = 35;
    c.update(1 / 60, w);
    expect(c.state).toBe('withdraw');
    const f2 = fighter(new THREE.Vector3(900, 7650, 0), new THREE.Vector3(-170, 0, 40));
    const a = pilot(f2, 'aggressive', 0.6);
    a.target = w.bombers()[0]; a.state = 'attack';
    (f2 as { structure: number }).structure = 18;
    a.update(1 / 60, w);
    expect(a.state).not.toBe('withdraw');
    expect(AI_STATS.press).toBe(1);
    a.update(1 / 60, w);
    expect(a.state).toBe('withdraw');
    expect(AI_STATS.limp).toBe(2);
    expect(f2.fm.throttle).toBeLessThanOrEqual(0.55);
  });
});

describe('Rotte: staggered passes', () => {
  it('the wingman holds his slot and starts his run the stagger delay after his leader', () => {
    const { w } = host();
    const fl = fighter(new THREE.Vector3(1200, 7700, 0), new THREE.Vector3(-170, 0, 0));
    const fw = fighter(new THREE.Vector3(1300, 7740, 140), new THREE.Vector3(-170, 0, 0));
    const lead = pilot(fl, 'cunning', 0.6), wing = pilot(fw, 'cunning', 0.6, 2);
    lead.target = w.bombers()[0]; lead.state = 'attack'; lead.runT = 0;
    const delay = staggerDelay(1, 0.6);
    wing.wing = { leader: lead, i: 1, delay };
    let started = -1;
    const dt = 1 / 60;
    for (let i = 0; i < 6 * 60 && started < 0; i++) {
      wing.update(dt, w); fw.fm.step(dt);
      lead.runT += dt;
      if (wing.state === 'attack') started = lead.runT;
    }
    expect(started).toBeGreaterThanOrEqual(delay);
    expect(started).toBeLessThan(delay + 0.1);
    expect(wing.target).toBe(lead.target);
    expect(AI_STATS.schwarm).toBe(1);
  });
});

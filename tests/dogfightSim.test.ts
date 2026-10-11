import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EnemyPilot, steerTo, type AttackType, type WorldView } from '../src/world/AI';
import { Fighter, makeGun, type Bomber } from '../src/world/Aircraft';
import { DogfightAI } from '../src/world/DogfightAI';
import { Ballistics } from '../src/world/Ballistics';
import { P51_PARAMS } from '../src/world/FlightModel';
import { ENEMY_VARIANTS, type EnemyType } from '../src/world/EnemyTypes';
import { seedRandom } from './helpers';

// Real flight, hit zones and ballistics; only the loaded visual models are replaced.
vi.mock('../src/world/Models', async () => {
  const { Group } = await import('three');
  return { instantiate: () => new Group(), setupProps: () => [] };
});
afterEach(() => vi.restoreAllMocks());
const DT = 1 / 60;
const SEEDS = [3, 7, 11, 19, 42];
const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

function scenario(type: EnemyType = 'fw190', distance = 1100) {
  const variant = ENEMY_VARIANTS[type];
  const player = new Fighter('p51d', 'allied', P51_PARAMS);
  player.pos.set(0, 7500, -distance); player.fm.vel.set(0, 0, 185); player.vel.copy(player.fm.vel);
  const enemy = new Fighter('fw190', 'axis', variant.params);
  enemy.enemyType = type; enemy.pos.set(0, 7500, 0); enemy.fm.vel.set(0, 0, 190); enemy.vel.copy(enemy.fm.vel);
  enemy.setScale(6 * variant.scale); // World.spawnEnemy at Veteran, with own model
  enemy.structure = enemy.maxStructure = 460 * variant.structure;
  for (const zone of enemy.zones) { zone.hp *= 2.2; zone.maxHp *= 2.2; }
  const bomber = { alive: true, team: 'allied', zones: [], pos: new THREE.Vector3(0, 7600, 1500), vel: new THREE.Vector3(0, 0, 75) } as unknown as Bomber;
  const allies = [player], enemies = [enemy], bombers = [bomber];
  const world: WorldView = {
    player, playerFighter: player, time: 0, difficulty: 1, playerFocus: 0, enemyAimMult: 1,
    formationForward: new THREE.Vector3(0, 0, 1), formationCenter: bomber.pos,
    fighters: (team) => team === 'allied' ? allies : enemies, bombers: () => bombers,
    dropTank: () => {}, playerArc: () => null, playerGunPos: () => null,
    playerStationId: () => null, stationArc: () => null, stationGunPos: () => null,
  };
  const pilot = new EnemyPilot(enemy, 'headon', 1);
  pilot.dogfightChance = 0; pilot.engage(world, bomber, 'headon', false);
  return { player, enemy, bomber, world, pilot };
}

// Same 20 Hz, full-throttle lead pursuit / <500 m, dot > .998 trigger as swsDuel/autoplay,
// with PilotController's mouse-aim instructor and 60 Hz flight integration. No wingman,
// perks, collisions, return damage or damage-induced roll/fire: isolates the bandit's flying.
function pursue(type: EnemyType, seed: number, duel = false, damage = false) {
  const random = seedRandom(seed);
  const { player, enemy, bomber, world, pilot } = scenario(type, duel ? 650 : 1100);
  if (duel) { pilot.target = player; pilot.state = 'dogfight'; }
  const bullets = new Ballistics(1000);
  bullets.playerHitScale = 1.4; // high aim assist, as in the dev bot
  for (const side of [-1, 1]) for (const [x, y, z] of [[2.009, -0.434, 0.6], [2.211, -0.417, 0.55], [2.407, -0.392, 0.55]]) {
    const offset = new THREE.Vector3(x * side, y, z);
    player.guns.push(makeGun({ offset, dir: new THREE.Vector3(-offset.x, -offset.y + 0.45, 300).normalize(), rate: 13, muzzleVel: 880, damage: 14, spread: 0.0035 }));
  }
  let near = 0, far = 0, fire = 0, defensive = 0, hits = 0, killT: number | null = null;
  const modes: Record<string, number> = {};
  bullets.onHit = ({ zone, damage: dmg }) => {
    hits++; enemy.structure -= dmg; zone.hp -= dmg;
    if (enemy.structure <= 0 || (zone.critical && zone.hp <= 0)) enemy.alive = false;
  };
  const dir = new THREE.Vector3(), relVel = new THREE.Vector3(), muzzle = new THREE.Vector3(), velocity = new THREE.Vector3();
  for (let frame = 0; frame < (damage ? 120 : 90) / DT; frame++) {
    if (frame % 3 === 0) {
      const d = enemy.pos.distanceTo(player.pos), tof = d / 880;
      dir.copy(enemy.pos).addScaledVector(relVel.copy(enemy.vel).sub(player.vel), tof);
      dir.y += 0.5 * 9.81 * tof * tof;
      dir.sub(player.pos).normalize();
      player.trigger = d < 500 && player.forward(relVel).dot(dir) > 0.998;
    }
    pilot.update(DT, world);
    steerTo(player.fm, dir, 1.1, THREE.MathUtils.clamp((player.fm.speed - 70) / 70, 0.6, 1));
    player.fm.throttle = 1;
    for (const f of [enemy, player]) { f.fm.step(DT); f.vel.copy(f.fm.vel); }
    bomber.pos.addScaledVector(bomber.vel, DT); world.time += DT;
    const d = enemy.pos.distanceTo(player.pos);
    if (d < 600) near += DT;
    if (d > 1500) far += DT;
    if (player.trigger) fire += DT;
    if (pilot.bfm?.defensive) defensive += DT;
    const mode = pilot.bfm?.mode ?? pilot.state;
    modes[mode] = (modes[mode] ?? 0) + DT;
    if (damage) {
      for (const gun of player.guns) {
        gun.cooldown -= DT;
        if (!player.trigger) { gun.cooldown = Math.max(0, gun.cooldown); continue; }
        if (gun.cooldown > 0) continue;
        gun.cooldown += 1 / gun.rate;
        muzzle.copy(gun.offset).applyQuaternion(player.quat).add(player.pos);
        velocity.copy(gun.dir).applyQuaternion(player.quat);
        velocity.x += (Math.random() * 2 - 1) * gun.spread;
        velocity.y += (Math.random() * 2 - 1) * gun.spread;
        velocity.z += (Math.random() * 2 - 1) * gun.spread;
        velocity.normalize().multiplyScalar(gun.muzzleVel).add(player.vel);
        bullets.fire(muzzle, velocity, 'allied', gun.damage, false, [1, 1, 1], player, false, true);
      }
      bullets.update(DT, [enemy]);
      if (!enemy.alive) { killT = world.time; break; }
    }
  }
  bullets.tracers.mesh.geometry.dispose(); (bullets.tracers.mesh.material as THREE.Material).dispose();
  random.mockRestore();
  return { near, far, fire, defensive, killT, hits, modes };
}

// Baseline recorded on the task's starting commit, same seeds and harness (seconds / 90).
const BASELINE_NEAR = { fw190: 56.75, bf109: 56.33, me262: 9.22, bf110: 63.98 };

describe('seeded escort pursuit', () => {
  it.each(['fw190', 'bf109', 'me262', 'bf110'] as const)('%s stays closer without becoming a free kill', (type) => {
    const escort = SEEDS.map((s) => pursue(type, s));
    const duels = SEEDS.map((s) => pursue(type, s, true, true));
    const near = median(escort.map((s) => s.near));
    const kills = duels.filter((s) => s.killT !== null).map((s) => s.killT!);
    // Jets can escape the bot, so retain censored results rather than calling 120 s a kill.
    console.log(JSON.stringify({ type, near, far: median(escort.map((s) => s.far)), fire: median(escort.map((s) => s.fire)), defensive: median(duels.map((s) => s.defensive)), kills: kills.length, killT: duels.map((s) => s.killT) }));
    expect(near).toBeGreaterThan(BASELINE_NEAR[type] + 7);
    expect(kills.length).toBeGreaterThanOrEqual(type === 'me262' ? 3 : 5);
    expect(median(kills)).toBeGreaterThan(8);
    expect(median(kills)).toBeLessThan(40);
    expect(Math.min(...kills)).toBeGreaterThan(5);
    expect(median(duels.map((s) => s.defensive))).toBeGreaterThan(4);
    if (type === 'me262') expect(duels.every((s) => (s.modes.extend ?? 0) > 0)).toBe(true);
    else expect(escort.every((s) => !s.modes.extend)).toBe(true);
  });

  it('unengaged bandits keep making firing passes on the bombers', () => {
    const samples = SEEDS.map((seed) => {
      seedRandom(seed);
      const { player, enemy, bomber, world, pilot } = scenario();
      let nearBox = 0, firing = 0;
      for (let i = 0; i < 90 / DT; i++) {
        // Escort holds beside the box, looking away from the attacker.
        player.pos.copy(bomber.pos).add(new THREE.Vector3(2200, 0, 0));
        player.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
        pilot.update(DT, world); enemy.fm.step(DT); enemy.vel.copy(enemy.fm.vel);
        bomber.pos.addScaledVector(bomber.vel, DT); world.time += DT;
        if (enemy.pos.distanceTo(bomber.pos) < 1200) nearBox += DT;
        if (enemy.trigger) firing += DT;
        expect(pilot.target).toBe(bomber);
      }
      return { nearBox, firing, passes: pilot.attackCount };
    });
    console.log(JSON.stringify({ bomberPasses: samples }));
    expect(median(samples.map((s) => s.nearBox))).toBeGreaterThan(40);
    expect(samples.every((s) => s.firing > 0.5 && s.passes >= 2)).toBe(true);
  });
});

function detect(skill: number, dt: number, seed: number, setup?: (s: ReturnType<typeof scenario>) => void) {
  seedRandom(seed);
  const s = scenario();
  s.pilot.skill = skill;
  setup?.(s);
  // Fixed relative geometry isolates detection latency from flight / setup geometry.
  for (let t = 0; t < 6; t += dt) {
    s.pilot.update(dt, s.world); s.world.time += dt;
    if (s.pilot.state === 'dogfight') return s.world.time;
  }
  return Infinity;
}

describe('escort engagement decisions', () => {
  it('notices the player on its tail at 1.1 km, with skill and frame-rate independent reaction', () => {
    const seeds = Array.from({ length: 80 }, (_, i) => i + 1);
    const low = seeds.map((s) => detect(0.6, DT, s));
    const high = seeds.map((s) => detect(1.4, DT, s));
    expect(median(high)).toBeLessThan(median(low) * 0.7);
    for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
      const times = seeds.map((s) => detect(1, dt, s));
      expect(median(times)).toBeGreaterThan(0.2);
      expect(median(times)).toBeLessThan(0.8);
      expect(times.filter((t) => t < 2).length).toBeGreaterThan(65);
    }
  });

  it('reacts to aimed fire across the nose and recent hits, but not unrelated shooting', () => {
    const crossing = (s: ReturnType<typeof scenario>) => {
      s.enemy.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    };
    expect(detect(1, DT, 7, crossing)).toBe(Infinity);
    expect(detect(1, DT, 7, (s) => { crossing(s); s.player.trigger = true; })).toBeLessThan(2);
    expect(detect(1, DT, 7, (s) => {
      crossing(s); s.player.quat.copy(s.enemy.quat); s.enemy.lastPlayerHit = 0;
    })).toBeLessThan(2);
    expect(detect(1, DT, 7, (s) => {
      crossing(s); s.player.quat.copy(s.enemy.quat); s.player.trigger = true;
    })).toBe(Infinity);
  });

  it('preserves withdrawal and steady raid orders under fire', () => {
    for (const steady of [false, true]) {
      expect(detect(1, DT, 7, (s) => {
        s.player.trigger = true;
        if (steady) s.pilot.override = { steady: true, fly: () => true };
        else s.enemy.structure = s.enemy.maxStructure * 0.2;
      })).toBe(Infinity);
    }
    expect(detect(1, DT, 7, (s) => { s.player.alive = false; })).toBe(Infinity);
  });

  it.each(['headon', 'stern', 'beam', 'high'] as AttackType[])('tightens %s setups only around a live nearby player escort', (attack) => {
    const { player, bomber, world, pilot } = scenario();
    const offset = (distance: number, alive = true) => {
      player.pos.copy(bomber.pos).add(new THREE.Vector3(distance, 0, 0)); player.alive = alive;
      seedRandom(3); pilot.engage(world, bomber, attack);
      return pilot.setupPoint.distanceTo(bomber.pos);
    };
    const distant = offset(4000);
    expect(offset(2000)).toBeCloseTo(distant * 0.45);
    expect(offset(2000, false)).toBeCloseTo(distant);
  });

  it('continues a close fight past its engagement timer, then returns to the bombers when contact is lost', () => {
    seedRandom(3);
    const { enemy, player, pilot, world, bomber } = scenario('fw190', 500);
    pilot.target = player; pilot.state = 'dogfight'; pilot.bfm = new DogfightAI(enemy);
    pilot.bfm.timer = 100;
    pilot.update(DT, world);
    expect(pilot.state).toBe('dogfight');
    player.pos.set(5000, 7500, 0);
    for (let i = 0; i < 9 / DT; i++) { pilot.update(DT, world); world.time += DT; }
    expect(pilot.state).toBe('approach');
    expect(pilot.target).toBe(bomber);
    expect(pilot.bfm).toBeNull();
  });

  it('turns a jet back even with the Mustang still on its tail and completes its reversal', () => {
    seedRandom(3);
    const { enemy, player, world } = scenario('me262', 1000);
    enemy.fm.speed = 220;
    const ai = new DogfightAI(enemy);
    ai.mode = 'extend'; ai.modeT = 6;
    ai.update(DT, world, player);
    expect(ai.mode).toBe('zoom');
    for (let i = 0; i < 2 / DT; i++) ai.update(DT, world, player);
    expect(ai.mode).toBe('zoom'); // cannot flip straight back into another extension
  });
});

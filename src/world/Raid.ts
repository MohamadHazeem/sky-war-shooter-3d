import * as THREE from 'three';
import { steerTo, type EnemyPilot, type PilotOverride, type WorldView } from './AI';
import type { Fighter } from './Aircraft';
import type { World } from './World';
import { radarCues, type RadarCue } from './Tactics';

/**
 * German bomber raids: He 111s flying a straight-and-level bomber course in formation, for
 * raid-defence / role-reversal missions (the player's P-51 against the bombers) and the
 * He 111 in custom battles (Tactics.perType sends them past the box).
 *
 * Formation: Ketten of three (a vic), the Ketten in a wide arrowhead, 3–9 aircraft (more just
 * continue the pattern). The leader holds the raid's heading and altitude; everyone else holds a
 * slot relative to the leader, so the formation needs no world-space waypoint and floating-origin
 * rebases are free. When the leader goes down the next aircraft takes the lead. A bomber shot
 * below 30 % structure leaves the formation (EnemyPilot 'withdraw'); its dorsal gunner
 * (RearGunners, P-51 missions) keeps firing while it flies.
 *
 * The raid pilots are 'steady' (AI.ts PilotOverride.steady): they never break into a dogfight or
 * evade a fighter on their tail. They never fire forward.
 *
 *   spawnBomberRaid(world, count, pos, heading)  spawn a raid (He 111 by default)
 *   formRaid(world, fighters, pos, heading)       fly fighters already spawned as a raid
 */

export interface RaidOptions {
  speed?: number;          // m/s over the ground (default 95, an He 111 H in cruise)
  skill?: number;          // pilot skill (only matters once a bomber leaves the formation)
  type?: 'he111';          // airframe
  telegraph?: boolean;     // radio call + radar cue (default true)
  cueSeconds?: number;     // how long the radar cue shows (default 25)
}

export interface BomberRaid {
  readonly fighters: Fighter[];
  readonly heading: THREE.Vector3;   // horizontal unit vector
  speed: number;
  altitude: number;
  alive(): number;                   // aircraft still flying in the formation
  leader(): Fighter | null;
}

const UP = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// slot i in the raid frame (x right, y up, z forward), metres: the enemy airframes are drawn
// ~6x life size (World.ENEMY_SCALE), so the spacing is wide
export function raidSlot(i: number, out = new THREE.Vector3()) {
  const k = Math.floor(i / 3), j = i % 3;
  const KETTE = [[0, 0, 0], [-300, -40, -230], [300, 40, -230], [0, -70, -470], [-600, -20, -460], [600, 60, -460]];
  const VIC = [[0, 0, 0], [-125, -12, -85], [125, 12, -85]];
  const ke = KETTE[k % KETTE.length];
  const extra = Math.floor(k / KETTE.length) * -700;
  return out.set(ke[0] + VIC[j][0], ke[1] + VIC[j][1], ke[2] + VIC[j][2] + extra);
}

function horizontal(dir: THREE.Vector3 | number, out: THREE.Vector3) {
  // a number is a compass-like yaw: 0 = +Z, positive turns toward +X
  if (typeof dir === 'number') out.set(Math.sin(dir), 0, Math.cos(dir));
  else out.set(dir.x, 0, dir.z);
  if (out.lengthSq() < 1e-8) out.set(0, 0, 1);
  return out.normalize();
}

class RaidState implements BomberRaid {
  readonly fighters: Fighter[] = [];
  readonly slots: THREE.Vector3[] = [];
  readonly heading = new THREE.Vector3(0, 0, 1);
  speed = 95;
  altitude = 7000;
  cue: RadarCue | null = null;
  pilots: (EnemyPilot | undefined)[] = [];

  inFormation(i: number) {
    const f = this.fighters[i], p = this.pilots[i];
    return f.alive && !f.remove && !!p && p.override instanceof RaidPilot && p.state !== 'withdraw';
  }
  alive() { let n = 0; for (let i = 0; i < this.fighters.length; i++) if (this.inFormation(i)) n++; return n; }
  leaderIndex() { for (let i = 0; i < this.fighters.length; i++) if (this.inFormation(i)) return i; return -1; }
  leader() { const i = this.leaderIndex(); return i >= 0 ? this.fighters[i] : null; }
}

class RaidPilot implements PilotOverride {
  readonly steady = true;
  constructor(readonly raid: RaidState, readonly i: number) {}

  fly(p: EnemyPilot, _dt: number, w: WorldView): boolean {
    const raid = this.raid, f = p.me, fm = f.fm;
    p.state = 'approach';
    f.trigger = false;
    const li = raid.leaderIndex();
    if (li < 0) return false;
    const h = raid.heading;
    if (li === this.i) {
      // the leader: hold the heading and the altitude, cruise power
      _a.copy(h).addScaledVector(UP, THREE.MathUtils.clamp((raid.altitude - f.pos.y) / 500, -0.12, 0.12));
      steerTo(fm, _a, 0.8, 0.45);
      fm.throttle = THREE.MathUtils.clamp(0.55 + (raid.speed - fm.speed) * 0.05, 0.3, 1);
      if (raid.cue) {
        raid.cue.pos.copy(f.pos);
        if (w.time > raid.cue.until) raid.cue = null;
      }
      return true;
    }
    // a wingman: hold the slot relative to the leader
    const lead = raid.fighters[li];
    _r.crossVectors(h, UP).normalize();    // right of the heading
    _b.copy(raid.slots[this.i]).sub(raid.slots[li]);
    _a.copy(lead.pos).addScaledVector(_r, _b.x).addScaledVector(UP, _b.y).addScaledVector(h, _b.z);
    const want = _a.sub(f.pos).multiplyScalar(0.25).addScaledVector(h, raid.speed);
    let len = want.length();
    const lo = raid.speed * 0.75, hi = raid.speed * 1.45;
    if (len > hi) { want.multiplyScalar(hi / len); len = hi; } else if (len < lo) { want.multiplyScalar(lo / Math.max(len, 1e-3)); len = lo; }
    steerTo(fm, want, 0.9, 0.55);
    fm.throttle = THREE.MathUtils.clamp(0.55 + (len - fm.speed) * 0.05, 0.25, 1);
    return true;
  }
}

// Put a fighter that was spawned this frame onto its start point
function place(f: Fighter, pos: THREE.Vector3, dir: THREE.Vector3, speed: number) {
  f.root.position.copy(pos);
  f.root.quaternion.setFromUnitVectors(Z, dir);
  f.fm.vel.copy(dir).multiplyScalar(speed);
  f.fm.omega.set(0, 0, 0);
  f.fm.throttle = 0.6;
  f.vel.copy(f.fm.vel);
}

// Fly fighters (normally He 111s just spawned) as a raid from pos (the leader's slot) along heading
export function formRaid(world: World, fighters: Fighter[], pos: THREE.Vector3, heading: THREE.Vector3 | number, opts: RaidOptions = {}): BomberRaid {
  const raid = new RaidState();
  horizontal(heading, raid.heading);
  raid.speed = opts.speed ?? 95;
  // the pilots climb back above 5600 m on their own (AI.ts), so the raid flies above it
  raid.altitude = Math.max(5800, pos.y);
  _r.crossVectors(raid.heading, UP).normalize();
  fighters.forEach((f, i) => {
    const s = raidSlot(i);
    raid.fighters.push(f);
    raid.slots.push(s);
    const p = world.enemyPilot(f);
    raid.pilots.push(p);
    _f.copy(pos).addScaledVector(_r, s.x).addScaledVector(UP, s.y).addScaledVector(raid.heading, s.z);
    _f.y = Math.max(_f.y, 5750);
    place(f, _f, raid.heading, raid.speed);
    if (p) { p.override = new RaidPilot(raid, i); p.state = 'approach'; p.timer = 0; p.target = null; }
  });
  if (opts.telegraph !== false && fighters.length) {
    const c = radarCues.find((q) => !q.on) ?? null;
    if (c) { c.on = true; c.label = fighters.length > 1 ? `BOMBERS ×${fighters.length}` : 'BOMBER'; c.until = world.time + (opts.cueSeconds ?? 25); c.pos.copy(pos); raid.cue = c; }
    if (world.playerFighter && world.player === world.playerFighter) world.callout('raid_he111', 'Lead', 'Heinkels! A whole formation of bombers — get into them before they reach the target!', 30, 3);
    else world.callout('raid_he111', 'Navigator', 'German bombers crossing ahead — a whole formation of Heinkels!', 30, 3);
  }
  return raid;
}

// Spawn a raid of `count` He 111s (formation slots behind pos, the leader at pos) flying along
// heading (a direction, or a yaw in radians: 0 = +Z). Returns the raid; its fighters are ordinary
// axis enemies (World.spawnEnemy, type 'he111'), so kills, scoring and the radar work as usual.
export function spawnBomberRaid(world: World, count: number, pos: THREE.Vector3, heading: THREE.Vector3 | number, opts: RaidOptions = {}): BomberRaid {
  const fs: Fighter[] = [];
  for (let i = 0; i < count; i++) fs.push(world.spawnEnemy(pos.clone(), 'stern', opts.skill ?? 1, false, false, opts.type ?? 'he111'));
  return formRaid(world, fs, pos, heading, opts);
}

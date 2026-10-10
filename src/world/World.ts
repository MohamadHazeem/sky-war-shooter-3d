import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { Aircraft, Bomber, Fighter, makeGun } from './Aircraft';
import { Ballistics, HitEvent } from './Ballistics';
import { Effects } from './Effects';
import { EnemyPilot, EscortPilot, AttackType, WorldView } from './AI';
import { FW190_PARAMS, P51_PARAMS } from './FlightModel';
import { AI_EXTRA, dirFromYawPitch, inArc, STATIONS, STATION_ORDER, StationDef } from './B17Layout';
import { sound } from '../audio/Sound';
import { Contrails } from '../render/Contrails';
import { Wrecks, BreakKind } from './Wrecks';
import { makeDropTank } from './Props';

export const ENEMY_SCALE = 1.7;      // Fw 190s are drawn (and hit) larger so they read clearly on screen
export const ENEMY_STRUCTURE = 260; // ~20 hits from a .50 to wear one down

export const CRUISE = 75;          // m/s formation speed (~170 mph)
export const ALTITUDE = 7600;      // m (25,000 ft)

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const R = () => Math.random() * 2 - 1;

export interface WorldEvents {
  radio(speaker: string, text: string, priority?: number): void;
  kill(victim: Aircraft, byPlayer: boolean): void;
  bomberLost(b: Bomber): void;
  playerHit(zone: string, heavy: boolean): void;
  hitMarker(kill: boolean): void;
  fuselageHit(local: THREE.Vector3, dir: THREE.Vector3): void;
  shake(amount: number): void;
}

interface AIGunner { key: string; def: { pivot: THREE.Vector3; rest: { yaw: number; pitch: number }; yaw: [number, number]; pitch: [number, number] }; station?: StationDef; cooldown: number; burst: number; target: Fighter | null; retarget: number }

interface Rocket { obj: THREE.Object3D; pos: THREE.Vector3; vel: THREE.Vector3; fuse: number; age: number; owner: Fighter }

const BOMBER_NAMES = ['Sky Queen', 'Miss Fortune', 'Ole Rattler', 'Hell\'s Angel II', 'Dinah Might', 'Lucky Lady', 'Iron Maiden', 'Sweet Sue', 'Big Stoop', 'Night Owl', 'Wabash Cannonball', 'Patches', 'Belle of Ohio', 'Tondelayo II', 'Blue Streak', 'Short Snorter'];

// The air battle: bomber formation, fighters, guns, damage, flak and effects.
export class World implements WorldView {
  readonly scene: THREE.Scene;
  aircraft: Aircraft[] = [];
  readonly ballistics = new Ballistics(6000);
  readonly effects: Effects;
  readonly contrails = new Contrails(64);
  readonly wrecks: Wrecks;
  playerFocus = 0.7;
  playerAimDir = new THREE.Vector3(1, 0, 0);
  formationCenter = new THREE.Vector3(0, ALTITUDE, 0);
  formationForward = new THREE.Vector3(0, 0, 1);
  player: Aircraft | null = null;
  playerBomber: Bomber | null = null;
  playerFighter: Fighter | null = null;
  playerStation: StationDef | null = null;
  time = 0;
  difficulty = 1;
  aiGunnerFactor = 1; // damage multiplier for AI bomber crews
  playerDamageScale = 0.6; // incoming damage on the player's own aircraft (game balance)
  flakIntensity = 0;   // bursts per second around the formation
  private flakAcc = 0;
  private gunners = new Map<Bomber, AIGunner[]>();
  private rockets: Rocket[] = [];
  private rocketGeo = new THREE.CylinderGeometry(0.105, 0.105, 1.0, 10).rotateX(Math.PI / 2);
  private rocketMat = new THREE.MeshStandardMaterial({ color: 0x3a3c33, roughness: 0.6, metalness: 0.4 });
  private extinguishers = new Map<string, number>(); // player engine -> bottles left
  private fireTimers = new Map<string, number>();
  private pilots = new Map<Fighter, EnemyPilot | EscortPilot>();
  private tankProto: THREE.Object3D;
  private radioCooldown = 0;
  private lastCallout = new Map<string, number>();
  events: Partial<WorldEvents> = {};
  stats = { kills: 0, shots: 0, hits: 0, damage: 0, bombersLost: 0, assists: 0, enemiesSpawned: 0 };
  crewWounded = 0;
  private lastWound = -99;
  lastKillCause = '';
  private lastConfirm = 0;
  listener: THREE.Vector3 | null = null; // camera position (set by the game)

  constructor(private engine: Engine) {
    this.scene = engine.scene;
    this.effects = new Effects(this.scene);
    this.wrecks = new Wrecks(this.scene, this.effects);
    this.scene.add(this.ballistics.tracers.mesh);
    this.scene.add(this.contrails.mesh);
    this.ballistics.onHit = (e) => this.onHit(e);
    this.ballistics.onNearMiss = (p, cannon) => {
      if (Math.random() < 0.35) sound.play('crack', p, { gain: cannon ? 0.5 : 0.3, delay: false });
    };
    // Yellow 300 L drop tank prototype, cloned per fighter
    this.tankProto = makeDropTank();
  }

  // ---------- WorldView ----------
  bombers(): Bomber[] { return this.aircraft.filter((a): a is Bomber => a instanceof Bomber && !a.remove); }
  fighters(team: 'allied' | 'axis'): Fighter[] { return this.aircraft.filter((a): a is Fighter => a instanceof Fighter && a.team === team && !a.remove); }

  // World direction covered by the player's current gun position (gunner missions)
  playerArc(): THREE.Vector3 | null {
    const b = this.playerBomber, st = this.playerStation;
    if (!b || !b.alive || !st || this.player !== b) return null;
    if (st.type === 'turret') return this.playerAimDir.clone().setY(Math.max(-0.4, Math.min(0.5, this.playerAimDir.y))).normalize();
    return dirFromYawPitch(st.rest.yaw, st.rest.pitch).applyQuaternion(b.quat).normalize();
  }

  playerGunPos(): THREE.Vector3 | null {
    const b = this.playerBomber, st = this.playerStation;
    if (!b || !b.alive || !st || this.player !== b) return null;
    return b.localToWorld(st.pivot.clone());
  }

  // Enemies still pressing the attack (withdrawing/damaged stragglers don't hold up a wave)
  activeEnemies(): Fighter[] {
    return this.fighters('axis').filter((f) => {
      if (!f.alive) return false;
      const p = this.pilots.get(f) as EnemyPilot | undefined;
      return !(p && p.state === 'withdraw') && f.pos.distanceTo(this.formationCenter) < 7000;
    });
  }

  dropTank(f: Fighter) {
    if (!f.dropTankAttached || !f.dropTank) return;
    f.dropTankAttached = false;
    const t = f.dropTank;
    const wp = t.getWorldPosition(new THREE.Vector3());
    const wq = t.getWorldQuaternion(new THREE.Quaternion());
    f.model.remove(t);
    t.position.copy(wp); t.quaternion.copy(wq);
    this.effects.dropTank(t, f.vel);
    this.callout('tanks', 'Navigator', 'They\'re dropping their belly tanks — here they come!', 20);
  }

  // ---------- setup ----------
  reset() {
    for (const a of this.aircraft) this.scene.remove(a.root);
    this.aircraft = [];
    this.gunners.clear();
    this.pilots.clear();
    this.ballistics.clear();
    this.effects.clear();
    this.contrails.clear();
    this.wrecks.clear();
    for (const r of this.rockets) r.obj.removeFromParent();
    this.rockets = [];
    this.extinguishers.clear();
    this.fireTimers.clear();
    this.player = this.playerBomber = this.playerFighter = null;
    this.formationCenter.set(0, ALTITUDE, 0);
    this.formationForward.set(0, 0, 1);
    this.time = 0;
    this.flakIntensity = 0;
    this.stats = { kills: 0, shots: 0, hits: 0, damage: 0, bombersLost: 0, assists: 0, enemiesSpawned: 0 };
    this.crewWounded = 0;
    this.lastWound = -99;
    this.lastKillCause = '';
    this.lastCallout.clear();
  }

  // Combat box: lead element + high and low elements, 3-ship vics, offsets in meters
  spawnFormation(count: number, playerSlot = 1) {
    const slots: THREE.Vector3[] = [];
    const vic = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(36, -8, -34), new THREE.Vector3(-36, -8, -34)];
    const elements = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(95, 45, -70), new THREE.Vector3(-95, -45, -80), new THREE.Vector3(0, -90, -160), new THREE.Vector3(120, 30, -220), new THREE.Vector3(-120, 60, -230)];
    for (const e of elements) for (const v of vic) slots.push(e.clone().add(v));
    const names = [...BOMBER_NAMES];
    for (let i = 0; i < count && i < slots.length; i++) {
      const b = new Bomber();
      b.slot.copy(slots[i]);
      b.name = i === playerSlot ? 'Sky Queen' : names.splice(1 + Math.floor(Math.random() * (names.length - 1)), 1)[0] ?? `B-17 #${i}`;
      b.wobbleAmp = 0.6 + Math.random() * 0.8;
      if (i === playerSlot) {
        b.isPlayer = true; this.playerBomber = b; this.player = b;
        // The player's ship is tougher than the rest: one bad pass shouldn't end the mission
        for (const z of b.zones) { const k = z.name.startsWith('wing') && z.critical ? 3.5 : z.critical ? 2.4 : 1.5; z.hp *= k; z.maxHp *= k; }
      } else {
        for (const z of b.zones) { z.hp *= 1.3; z.maxHp *= 1.3; }
      }
      this.placeBomber(b, 0);
      this.add(b);
      // contrails from behind each engine nacelle
      const engines = [[6.5, -0.05, 0.6], [3.02, -0.4, 1.0], [-3.02, -0.4, 1.0], [-6.5, -0.05, 0.6]];
      engines.forEach(([x, y, z], k) => this.contrails.add(() => (b.remove || b.engineDead[k] ? null : b.localToWorld(new THREE.Vector3(x, y, z)))));
      const gs: AIGunner[] = [];
      for (const id of STATION_ORDER) gs.push({ key: id, def: STATIONS[id], station: STATIONS[id], cooldown: Math.random(), burst: 0, target: null, retarget: Math.random() });
      for (const x of AI_EXTRA) gs.push({ key: 'chin', def: x, cooldown: Math.random(), burst: 0, target: null, retarget: Math.random() });
      this.gunners.set(b, gs);
    }
  }

  private placeBomber(b: Bomber, dt: number) {
    const t = this.time + b.wobblePhase;
    const wob = _v.set(Math.sin(t * 0.31) * 2.2, Math.sin(t * 0.47) * 1.4 + Math.sin(t * 1.3) * 0.25, Math.sin(t * 0.23) * 2.5).multiplyScalar(b.wobbleAmp);
    if (b.straggling) {
      b.slot.z -= dt * 3.5 * Math.max(1, b.enginesOut);
      b.slot.y -= dt * 2.0 * b.enginesOut;
    }
    const target = _v2.copy(b.slot).add(wob).add(this.formationCenter);
    if (dt > 0) b.vel.copy(target).sub(b.root.position).divideScalar(dt);
    else b.vel.copy(this.formationForward).multiplyScalar(CRUISE);
    b.root.position.copy(target);
    // gentle bank/pitch from the wobble derivative
    const roll = Math.cos(t * 0.31) * 0.03 * b.wobbleAmp + (b.straggling ? 0.05 * b.enginesOut : 0);
    const pitch = Math.cos(t * 0.47) * 0.012 * b.wobbleAmp;
    b.root.quaternion.setFromEuler(new THREE.Euler(-pitch, 0, roll, 'YXZ'));
  }

  add(a: Aircraft) {
    this.aircraft.push(a);
    this.scene.add(a.root);
  }

  spawnEnemy(pos: THREE.Vector3, attack?: AttackType, skill = 1, dropTank = true, rockets = false): Fighter {
    const f = new Fighter('fw190', 'axis', FW190_PARAMS);
    f.root.position.copy(pos);
    const dir = _v.copy(this.formationCenter).sub(pos).setY(0).normalize();
    f.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    f.fm.vel.copy(dir).multiplyScalar(180);
    f.vel.copy(f.fm.vel);
    // Fw 190 A-8: 2x MG 131 (13 mm) cowling, 4x MG 151/20 wing cannon
    const tracerY: [number, number, number] = [10, 8, 3.5];
    f.guns = [
      makeGun({ offset: new THREE.Vector3(0.18, 0.554, 0.9), rate: 15, muzzleVel: 750, damage: 5, spread: 0.007, tracerEvery: 3, tracerColor: tracerY }),
      makeGun({ offset: new THREE.Vector3(-0.18, 0.554, 0.9), rate: 15, muzzleVel: 750, damage: 5, spread: 0.007, tracerEvery: 3, tracerColor: tracerY }),
      makeGun({ offset: new THREE.Vector3(0.95, -0.466, 0.9), rate: 11, muzzleVel: 700, damage: 14, spread: 0.009, tracerEvery: 2, tracerColor: [11, 6, 2], cannon: true }),
      makeGun({ offset: new THREE.Vector3(-0.95, -0.466, 0.9), rate: 11, muzzleVel: 700, damage: 14, spread: 0.009, tracerEvery: 2, tracerColor: [11, 6, 2], cannon: true }),
      makeGun({ offset: new THREE.Vector3(2.3, -0.326, 0.7), rate: 9, muzzleVel: 700, damage: 14, spread: 0.01, tracerEvery: 3, tracerColor: [11, 6, 2], cannon: true }),
      makeGun({ offset: new THREE.Vector3(-2.3, -0.326, 0.7), rate: 9, muzzleVel: 700, damage: 14, spread: 0.01, tracerEvery: 3, tracerColor: [11, 6, 2], cannon: true }),
    ];
    if (dropTank) {
      const t = this.tankProto.clone();
      t.position.set(0, -0.98, -0.2);
      f.model.add(t);
      f.dropTank = t;
      f.dropTankAttached = true;
    }
    if (rockets) {
      // two underwing Wgr. 21 mortar tubes
      f.rockets = 2;
      for (const x of [1.9, -1.9]) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.3, 10).rotateX(Math.PI / 2), this.rocketMat);
        tube.position.set(x, -0.62, -0.1);
        tube.castShadow = true;
        f.model.add(tube);
        f.rocketTubes.push(tube);
      }
    }
    f.setScale(ENEMY_SCALE);
    f.structure = f.maxStructure = ENEMY_STRUCTURE * (0.85 + 0.15 * this.difficulty);
    f.label = 'Fw 190';
    this.add(f);
    this.pilots.set(f, new EnemyPilot(f, attack, skill * this.difficulty));
    this.stats.enemiesSpawned++;
    return f;
  }

  spawnPlayerFighter(pos: THREE.Vector3, dir: THREE.Vector3): Fighter {
    const f = this.makeMustang(pos, dir);
    f.isPlayer = true;
    for (const z of f.zones) { z.hp *= 1.7; z.maxHp *= 1.7; }
    this.player = f;
    this.playerFighter = f;
    return f;
  }

  spawnEscort(pos: THREE.Vector3, slot: THREE.Vector3): Fighter {
    const f = this.makeMustang(pos, this.formationForward);
    // wingmen keep the enemy busy but leave the kills to the player
    for (const g of f.guns) { g.damage *= 0.3; g.tracerEvery = 3; }
    this.pilots.set(f, new EscortPilot(f, slot));
    return f;
  }

  private makeMustang(pos: THREE.Vector3, dir: THREE.Vector3) {
    const f = new Fighter('p51d', 'allied', P51_PARAMS);
    f.root.position.copy(pos);
    f.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _v.copy(dir).normalize());
    f.fm.vel.copy(dir).normalize().multiplyScalar(140);
    f.vel.copy(f.fm.vel);
    // 6x M2 .50 cal in the wings, harmonised at ~300 m
    const conv = 300;
    const muzzles = [[2.009, -0.434, 0.6], [2.211, -0.417, 0.55], [2.407, -0.392, 0.55]];
    f.guns = [];
    for (const side of [1, -1]) for (const [x, y, z] of muzzles) {
      const off = new THREE.Vector3(x * side, y, z);
      const dirv = new THREE.Vector3(-off.x, -off.y + 0.45, conv).normalize();
      f.guns.push(makeGun({ offset: off, dir: dirv, rate: 13, muzzleVel: 880, damage: 14, spread: 0.0035, tracerEvery: 4, tracerColor: [9, 3, 1], ammo: 500 }));
    }
    f.label = 'P-51D';
    this.add(f);
    return f;
  }

  // ---------- radio ----------
  callout(key: string, speaker: string, text: string, cooldown = 8, priority = 1) {
    const last = this.lastCallout.get(key) ?? -999;
    if (this.time - last < cooldown) return;
    if (this.radioCooldown > 0 && priority < 2) return;
    this.lastCallout.set(key, this.time);
    this.radioCooldown = 2.5;
    this.events.radio?.(speaker, text, priority);
  }

  clockPosition(from: Aircraft, worldPos: THREE.Vector3): string {
    const local = from.worldToLocal(worldPos, _v);
    const ang = Math.atan2(-local.x, local.z); // + = right
    let clock = Math.round((ang / (Math.PI * 2)) * 12);
    if (clock <= 0) clock += 12;
    const elev = Math.atan2(local.y, Math.hypot(local.x, local.z));
    const hl = elev > 0.18 ? 'high' : elev < -0.18 ? 'low' : 'level';
    const words = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
    return `${words[clock]} o'clock ${hl}`;
  }

  // ---------- damage ----------
  private onHit(e: HitEvent) {
    const t = e.target;
    if (t.remove) return;
    const z = e.zone;
    const wasAlive = t.alive;
    if (t === this.player) e.damage *= this.playerDamageScale;
    z.hp -= e.damage;
    t.damageTaken += e.damage;
    t.hitFlash = 0.15;
    if (e.shooter) t.lastAttacker = e.shooter;
    t.structure -= e.damage;
    if (e.playerShot) {
      this.stats.hits++;
      this.stats.damage += e.damage;
      t.playerDamage += e.damage;
      t.lastPlayerHit = this.time;
      this.effects.hitFlash(e.point, t.vel);
    }
    const heavy = e.cannon;
    this.effects.sparks(e.point, t.vel, heavy);
    if (t === this.player || t === this.playerBomber) {
      sound.playerImpact(heavy);
      this.events.shake?.(heavy ? 0.45 : 0.15);
      this.events.playerHit?.(z.name, heavy);
      if (t === this.playerBomber && /fuselage|tail|nose/.test(z.name)) {
        const local = t.worldToLocal(e.point.clone());
        const dir = e.bulletVel.clone().sub(t.vel).applyQuaternion(t.quat.clone().invert());
        this.events.fuselageHit?.(local, dir);
      }
      if (t === this.playerBomber && this.playerStation) {
        // Rounds hitting the section of fuselage you are standing in can wound you
        const near = e.point.distanceTo(t.localToWorld(this.playerStation.pivot, _v)) < 2.2;
        if (near && this.time - this.lastWound > 18 && Math.random() < (heavy ? 0.05 : 0.006)) {
          this.lastWound = this.time;
          this.crewWounded++;
          this.events.playerHit?.('gunner', true);
        }
        if (near && Math.random() < 0.3) sound.play('glass', null, { gain: 0.4 });
      }
    } else if (e.playerShot) {
      sound.play('hit', e.point, { gain: 0.35, delay: false, ref: 60 });
      if (this.time - this.lastConfirm > 0.07) { this.lastConfirm = this.time; sound.confirm('hit_confirm'); }
      this.events.hitMarker?.(false);
      // visible battle damage: panels and cowling pieces tearing off
      if (z.hp < z.maxHp * 0.55 && !(z as any).shed) {
        (z as any).shed = true;
        this.effects.spawnDebris(e.point, t.vel, 3, false);
        this.effects.smoke.spawn({ pos: e.point, vel: t.vel, life: 1.6, size0: 1.2, size1: 5, color0: [0.25, 0.24, 0.22], alpha0: 0.7, alpha1: 0, drag: 1.5, lit: true });
      }
    }

    if (z.hp <= 0 && !(z as any).destroyed) {
      (z as any).destroyed = true;
      if (z.engine !== undefined) {
        t.engineDead[z.engine] = true;
        z.burning = Math.random() < (t instanceof Bomber ? 0.35 : 0.6);
        if (t instanceof Bomber) {
          if (t.isPlayer) this.callout('eng' + z.engine, 'Pilot', `Number ${z.engine + 1} engine is hit! Feathering number ${z.engine + 1}!`, 1, 2);
          if (t.enginesOut >= 2 && !t.straggling) {
            t.straggling = true;
            if (t.isPlayer) this.callout('strag', 'Pilot', 'We can\'t hold formation. We\'re falling behind — keep those guns hot!', 1, 2);
            else this.callout('strag' + t.id, 'Tail', `${t.name} is falling out of formation!`, 1);
          }
        } else if (t instanceof Fighter) {
          // engine dead -> the fighter is effectively finished
          this.killAircraft(t, e.playerShot, 'engine');
        }
      } else if (z.critical) {
        this.killAircraft(t, e.playerShot, z.name);
      }
      if (t instanceof Bomber && t.enginesOut >= 4) this.killAircraft(t, false, 'all engines');
    }
    if (t.alive && t instanceof Fighter && t.structure <= 0) this.killAircraft(t, e.playerShot, z.name);
    if (wasAlive && !t.alive && e.playerShot) this.events.hitMarker?.(true);
  }

  killAircraft(a: Aircraft, byPlayer: boolean, cause = '') {
    if (!a.alive) return;
    if (a === this.player) {
      this.lastKillCause = cause;
      console.info('Player aircraft lost:', cause, a.zones.map((z) => `${z.name}:${Math.round(z.hp)}/${Math.round(z.maxHp)}`).join(' '));
    }
    a.alive = false;
    a.falling = true;
    a.fallTime = 0;
    // Credit the player if they dealt a meaningful share of the damage
    const credited = byPlayer || a.playerDamage >= a.damageTaken * 0.2;
    if (a instanceof Fighter) {
      a.spin.set(R() * 0.6, R() * 0.4, (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 2.5));
      // how it comes apart depends on what was shot away
      let kind: BreakKind | 'burn' = cause === 'wingL' || cause === 'wingR' || cause === 'tail' ? cause : Math.random() < 0.55 ? 'blowup' : 'burn';
      if (a.team === 'allied' && kind !== 'burn') kind = 'burn';
      if (kind !== 'burn') {
        this.wrecks.break(a, kind);
        a.remove = true;
        if (kind === 'blowup') {
          this.effects.explosion(a.pos, a.vel, 1.2);
          sound.play('explosion', a.pos, { gain: 1.5, ref: 140, reverb: 0.7 });
        } else {
          this.effects.explosion(a.localToWorld(new THREE.Vector3(kind === 'wingL' ? 1.5 : kind === 'wingR' ? -1.5 : 0, 0, kind === 'tail' ? -5.5 : 0)), a.vel, 0.45);
          sound.play('explosion', a.pos, { gain: 1.0, ref: 100, reverb: 0.6 });
        }
        if (this.player) this.events.shake?.(Math.max(0, 1 - a.pos.distanceTo(this.player.pos) / 300) * 0.8);
        if (this.player && a.pos.distanceTo(this.player.pos) < 500) sound.play('debris', a.pos, { gain: 0.7, ref: 40 });
        if (Math.random() < 0.45) setTimeout(() => this.effects.parachute(a.pos.clone(), a.vel.clone().multiplyScalar(0.3)), 1200 + Math.random() * 2000);
      } else {
        // engine or pilot hit: goes down burning in a spin
        this.effects.explosion(a.localToWorld(new THREE.Vector3(0, 0, 1.2)), a.vel, 0.35);
        this.effects.spawnDebris(a.pos, a.vel, 5, true);
        a.zones.forEach((z) => { if (z.engine !== undefined) z.burning = true; });
        if (Math.random() < 0.5) setTimeout(() => this.effects.parachute(a.pos.clone(), a.vel.clone().multiplyScalar(0.3)), 1500 + Math.random() * 2500);
      }
      if (a.team === 'axis') {
        if (credited) this.stats.kills++;
        this.events.kill?.(a, credited);
      } else {
        this.events.kill?.(a, false);
      }
    } else if (a instanceof Bomber) {
      a.spin.set(R() * 0.05, R() * 0.05, (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.25));
      a.vel.copy(this.formationForward).multiplyScalar(CRUISE * 0.85);
      a.zones.forEach((z) => { if (z.engine !== undefined && Math.random() < 0.5) z.burning = true; });
      this.effects.explosion(a.localToWorld(new THREE.Vector3(R() * 6, 0, 2)), a.vel, 0.8);
      sound.play('explosion', a.pos, { gain: 1.6, ref: 200, reverb: 0.8 });
      this.stats.bombersLost++;
      this.events.bomberLost?.(a);
      // crew bailing out
      const n = 2 + Math.floor(Math.random() * 6);
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          if (a.remove) return;
          this.effects.parachute(a.localToWorld(new THREE.Vector3(R() * 0.5, -1.4, -4 + R() * 2)), a.vel.clone().multiplyScalar(0.5));
        }, 2500 + i * 900 + Math.random() * 1500);
      }
    }
  }

  // ---------- per-frame ----------
  update(dt: number) {
    if (dt <= 0) return;
    this.time += dt;
    this.radioCooldown -= dt;
    this.formationCenter.addScaledVector(this.formationForward, CRUISE * dt);

    for (const a of this.aircraft) {
      if (a instanceof Bomber && a.alive) this.placeBomber(a, dt);
      const p = this.pilots.get(a as Fighter);
      if (p && a.alive) p.update(dt, this);
      a.update(dt, this.time);
      if (a.hitFlash > 0) a.hitFlash -= dt;
      if (a instanceof Fighter && a.alive && !a.isPlayer && this.listener) {
        // close fly-by: roar of the engine and a buffet
        const d = a.pos.distanceTo(this.listener);
        if (d < 160 && this.time - ((a as any).lastWhoosh ?? -99) > 4) {
          (a as any).lastWhoosh = this.time;
          sound.play('whoosh', a.pos, { gain: 1.3, ref: 50, delay: false });
          this.events.shake?.(0.25 * (1 - d / 160));
        }
      }
      if (a instanceof Fighter && a.alive) {
        if (a.pos.y < 250) { a.alive = false; a.remove = !a.isPlayer; if (a.isPlayer) { a.falling = false; } }
        else if (!a.isPlayer && a.pos.distanceTo(this.formationCenter) > ((this.pilots.get(a) as EnemyPilot | undefined)?.state === 'withdraw' ? 4500 : 9000)) a.remove = true; // left the battle
      }
      this.fireGuns(a, dt);
      this.damageEffects(a, dt);
    }
    this.bomberGunners(dt);
    this.flak(dt);
    this.updateRockets(dt);
    this.fires(dt);
    this.ballistics.update(dt, this.aircraft);
    this.effects.update(dt);
    this.wrecks.update(dt);
    this.contrails.update(this.time);
    this.radioChatter(dt);

    // cleanup
    for (const a of this.aircraft) if (a.remove) { this.scene.remove(a.root); this.pilots.delete(a as Fighter); this.gunners.delete(a as Bomber); }
    this.aircraft = this.aircraft.filter((a) => !a.remove);
  }

  private launchRockets(f: Fighter) {
    f.fireRockets = false;
    if (f.rockets <= 0) return;
    const target = this.bombers().filter((b) => b.alive).sort((x, y) => x.pos.distanceTo(f.pos) - y.pos.distanceTo(f.pos))[0];
    for (const tube of f.rocketTubes) {
      const pos = tube.getWorldPosition(new THREE.Vector3());
      const dir = f.forward(new THREE.Vector3());
      // aimed slightly high (they drop a lot); time fuse set to the range of the target
      dir.y += 0.035;
      dir.normalize();
      const obj = new THREE.Mesh(this.rocketGeo, this.rocketMat);
      obj.position.copy(pos);
      this.scene.add(obj);
      const range = target ? target.pos.distanceTo(f.pos) : 1000;
      this.rockets.push({ obj, pos: obj.position, vel: dir.multiplyScalar(320).add(f.vel), fuse: range / 330 + (Math.random() - 0.5) * 1.1, age: 0, owner: f });
      tube.removeFromParent();
    }
    f.rocketTubes = [];
    f.rockets = 0;
    sound.play('rocket', f.pos, { gain: 1.2, ref: 80 });
    this.callout('rockets', 'Tail', 'Rockets! They\'re firing rockets into the formation!', 8, 2);
  }

  private updateRockets(dt: number) {
    for (const r of this.rockets) {
      r.age += dt;
      r.vel.y -= 9.81 * dt;
      r.pos.addScaledVector(r.vel, dt);
      r.obj.lookAt(r.pos.clone().add(r.vel));
      // sizzling smoke trail and motor flame
      this.effects.smoke.spawn({ pos: r.pos, vel: r.vel.clone().multiplyScalar(0.05), life: 3.5, size0: 0.8, size1: 4.5, color0: [0.85, 0.85, 0.83], alpha0: 0.55, alpha1: 0, drag: 1, lit: true });
      if (r.age < 1.6) this.effects.glow.spawn({ pos: r.pos, life: 0.06, size0: 1.4, size1: 0.6, color0: [14, 7, 2], alpha0: 1, alpha1: 0, frame: 1 });
      let boom = r.age >= r.fuse;
      if (!boom) for (const a of this.aircraft) if (a.alive && a.team === 'allied' && a.pos.distanceTo(r.pos) < 22) { boom = true; break; }
      if (boom) {
        r.fuse = -1;
        r.obj.removeFromParent();
        this.effects.explosion(r.pos, new THREE.Vector3(), 0.9);
        sound.play('explosion', r.pos, { gain: 1.5, ref: 150, reverb: 0.7 });
        if (this.player) this.events.shake?.(Math.max(0, 1 - r.pos.distanceTo(this.player.pos) / 300));
        for (const a of this.aircraft) {
          if (!a.alive || a.team !== 'allied') continue;
          const d = a.pos.distanceTo(r.pos);
          if (d > 40) continue;
          for (let k = 0; k < 2; k++) {
            const zone = a.zones[Math.floor(Math.random() * a.zones.length)];
            this.onHit({ target: a, zone, point: a.localToWorld(zone.offset, new THREE.Vector3()), damage: (1 - d / 40) * 45, cannon: true, shooter: r.owner, bulletVel: r.vel.clone(), playerShot: false });
          }
        }
      }
    }
    this.rockets = this.rockets.filter((r) => r.fuse >= 0 && r.age < 8);
  }

  // Fires: burning engines eat into the wing; on the player's ship the pilot fights them
  private fires(dt: number) {
    for (const b of this.bombers()) {
      if (!b.alive) continue;
      for (const z of b.zones) {
        if (!z.burning || z.engine === undefined) continue;
        const wing = b.zone(z.engine < 2 ? 'wingL' : 'wingR');
        if (wing && wing.hp > 0) {
          wing.hp -= dt * (b.isPlayer ? 1.2 : 3.5);
          if (wing.hp <= 0 && !(wing as any).destroyed) { (wing as any).destroyed = true; this.killAircraft(b, false, 'fire'); }
        }
        if (!b.isPlayer) continue;
        const key = z.name;
        const t = (this.fireTimers.get(key) ?? 0) + dt;
        this.fireTimers.set(key, t);
        if (t > 0.1 && t - dt <= 0.1) this.callout('fire' + key, 'Top Turret', `Fire in number ${z.engine + 1} engine!`, 1, 3);
        if (t > 4.5) {
          const bottles = this.extinguishers.get(key) ?? 1;
          this.fireTimers.set(key, -6); // next attempt (if any) later
          if (bottles > 0) {
            this.extinguishers.set(key, bottles - 1);
            if (Math.random() < 0.75) { z.burning = false; this.fireTimers.delete(key); this.callout('fireout' + key, 'Pilot', `Extinguisher's in. Fire's out on number ${z.engine + 1}.`, 1, 3); }
            else this.callout('firestill' + key, 'Pilot', `Extinguisher didn't take! Number ${z.engine + 1} is still burning!`, 1, 3);
          }
        }
      }
    }
  }

  private fireGuns(a: Aircraft, dt: number) {
    if (!(a instanceof Fighter) || !a.alive) return;
    if (a.fireRockets) this.launchRockets(a);
    for (const g of a.guns) {
      g.cooldown -= dt;
      if (!a.trigger || g.ammo <= 0) { if (g.cooldown < 0) g.cooldown = 0; continue; }
      while (g.cooldown <= 0) {
        g.cooldown += 1 / g.rate;
        g.count++;
        if (g.ammo !== Infinity) g.ammo--;
        const muzzle = a.localToWorld(g.offset, _v);
        const dir = _v2.copy(g.dir).applyQuaternion(a.quat);
        if (a.gunAim) dir.copy(a.gunAim);
        dir.x += R() * g.spread; dir.y += R() * g.spread; dir.z += R() * g.spread;
        dir.normalize();
        const vel = dir.clone().multiplyScalar(g.muzzleVel).add(a.vel);
        this.ballistics.fire(muzzle, vel, a.team, g.damage, g.count % g.tracerEvery === 0, g.tracerColor, a, !!g.cannon, a.isPlayer);
        if (a.isPlayer) this.stats.shots++;
        if (g.count % 2 === 0) this.effects.muzzleFlash(muzzle, dir, a.isPlayer ? 0.4 : g.cannon ? 2.6 : 1.8, a.vel);
        if (g.count % 3 === 0) {
          if (a.isPlayer) sound.playerGun(true);
          else sound.play(g.cannon ? 'cannon' : 'mg131', muzzle, { gain: g.cannon ? 0.9 : 0.6, ref: 70 });
        }
      }
    }
  }

  private damageEffects(a: Aircraft, dt: number) {
    a.smokeAcc += dt;
    if (a.smokeAcc < 0.05) return;
    a.smokeAcc = 0;
    for (const z of a.zones) {
      const dmg = 1 - Math.max(0, z.hp) / z.maxHp;
      const smoking = z.engine !== undefined ? dmg > 0.35 : dmg > 0.85;
      if (!smoking && !z.burning) continue;
      const p = a.localToWorld(_v.copy(z.offset).add(_v2.set(0, 0.2, -0.6)), new THREE.Vector3());
      this.effects.trail(p, a.vel, Math.min(1, dmg), !!z.burning, a instanceof Bomber ? 1.3 : 0.8);
    }
    // worn-down fighters: thin smoke -> black smoke -> fire, from the engine
    if (a instanceof Fighter && a.alive && a.maxStructure !== Infinity) {
      const f = a.structureFrac;
      if (f < 0.75) {
        const at = a.localToWorld(_v.set(0, 0.3, 0.6 * ENEMY_SCALE), new THREE.Vector3());
        this.effects.trail(at, a.vel, f < 0.45 ? 0.9 : 0.35, f < 0.25, 0.9);
      }
    }
    if (a.falling && a instanceof Fighter && Math.random() < 0.6) {
      this.effects.trail(a.localToWorld(_v.set(0, 0, 1.5), new THREE.Vector3()), a.vel, 1, true, 1);
    }
  }

  // AI crews on every bomber, including the other stations of the player's own bomber
  private bomberGunners(dt: number) {
    const enemies = this.fighters('axis').filter((f) => f.alive);
    for (const [b, gs] of this.gunners) {
      if (!b.alive) continue;
      for (const g of gs) {
        if (b.isPlayer && g.station && this.playerStation && g.station.id === this.playerStation.id) continue;
        g.retarget -= dt;
        g.cooldown -= dt;
        if (g.retarget <= 0) {
          g.retarget = 0.4 + Math.random() * 0.4;
          g.target = null;
          let best = 650 + 250 * Math.random();
          const pivotW = b.localToWorld(g.def.pivot, new THREE.Vector3());
          for (const e of enemies) {
            const d = e.pos.distanceTo(pivotW);
            if (d > best) continue;
            const local = b.worldToLocal(e.pos, _v).sub(g.def.pivot);
            if (!inArc(g.def as StationDef, local)) continue;
            best = d; g.target = e;
          }
          if (g.target && g.burst <= 0 && Math.random() < 0.35) g.burst = 0.5 + Math.random() * 1.2;
        }
        if (!g.target || !g.target.alive) { g.burst = 0; continue; }
        // swing the visible turret/gun toward the target
        const tg = b.guns.get(g.key);
        if (tg) tg.want = b.worldToLocal(g.target.pos, new THREE.Vector3()).sub(g.def.pivot).normalize();
        if (g.burst > 0) {
          g.burst -= dt;
          while (g.cooldown <= 0) {
            g.cooldown += 1 / (g.station?.twin ? 22 : 12);
            const pivotW = b.localToWorld(g.def.pivot, new THREE.Vector3());
            // Imperfect lead: AI gunners spray, they rarely get a clean kill
            const tp = g.target.pos.clone();
            const dist = tp.distanceTo(pivotW);
            const tof = dist / 860;
            tp.addScaledVector(_v.copy(g.target.vel).sub(b.vel), tof * (0.2 + Math.random() * 1.4));
            tp.y += 0.5 * 9.81 * tof * tof;
            const dir = tp.sub(pivotW).normalize();
            const spread = 0.026;
            dir.x += R() * spread; dir.y += R() * spread; dir.z += R() * spread;
            dir.normalize();
            const muzzle = pivotW.addScaledVector(dir, 1.6);
            this.ballistics.fire(muzzle, dir.multiplyScalar(860).add(b.vel), 'allied', 0.12 * this.aiGunnerFactor, Math.random() < 0.35, [9, 2.4, 0.8], b);
            if (Math.random() < 0.3) this.effects.muzzleFlash(muzzle, dir.normalize(), 0.8, b.vel);
            if (Math.random() < 0.12) sound.play('m2far', muzzle, { gain: b.isPlayer ? 0.5 : 0.35, ref: b.isPlayer ? 6 : 50 });
          }
        } else if (g.cooldown < 0) g.cooldown = 0;
      }
    }
  }

  private flak(dt: number) {
    if (this.flakIntensity <= 0) return;
    this.flakAcc += dt * this.flakIntensity;
    while (this.flakAcc > 1) {
      this.flakAcc -= 1;
      const bs = this.bombers().filter((b) => b.alive);
      if (!bs.length) return;
      const target = Math.random() < 0.15 && this.playerBomber?.alive ? this.playerBomber : bs[Math.floor(Math.random() * bs.length)];
      const p = target.pos.clone().add(new THREE.Vector3(R() * 180, R() * 90 + 20, R() * 220 + 60));
      this.effects.flak(p);
      const dl = this.player ? p.distanceTo(this.player.pos) : 9999;
      if (dl < 160) { sound.play('flakClose', p, { gain: 1.5, ref: 60, reverb: 0.5 }); if (dl < 75) setTimeout(() => sound.rattle(), 120); }
      if (dl < 400) this.events.shake?.(Math.max(0, 1 - dl / 400) * 0.9);
      else sound.play('flak', p, { gain: 1.3, ref: 80, reverb: 0.6 });
      // shrapnel
      for (const a of this.aircraft) {
        if (!a.alive) continue;
        const d = a.pos.distanceTo(p);
        if (d < 55) {
          const dmg = (1 - d / 55) * 40;
          const zone = a.zones[Math.floor(Math.random() * a.zones.length)];
          this.onHit({ target: a, zone, point: a.localToWorld(zone.offset, new THREE.Vector3()), damage: dmg, cannon: d < 25, shooter: null, bulletVel: new THREE.Vector3(), playerShot: false });
        }
      }
    }
  }

  private radioChatter(dt: number) {
    const pl = this.player;
    if (!pl || !pl.alive) return;
    for (const f of this.fighters('axis')) {
      if (!f.alive) continue;
      const p = this.pilots.get(f) as EnemyPilot | undefined;
      if (!p || p.calloutDone) continue;
      const d = f.pos.distanceTo(pl.pos);
      if (p.state === 'attack' && d < 2200) {
        p.calloutDone = true;
        const clock = this.clockPosition(pl, f.pos);
        const speakers = ['Pilot', 'Navigator', 'Tail', 'Top Turret', 'Ball Turret', 'Bombardier'];
        const lines = [`Fighters, ${clock}!`, `Bandit coming in, ${clock}!`, `Here he comes, ${clock}!`, `Fw one-ninety, ${clock}! Get him!`];
        this.callout('attack', speakers[Math.floor(Math.random() * speakers.length)], lines[Math.floor(Math.random() * lines.length)], 5);
      }
    }
  }

  rebase(off: THREE.Vector3) {
    this.formationCenter.sub(off);
    this.ballistics.rebase(off);
    this.effects.rebase(off);
    // rockets are scene children (shifted by the engine); nothing else to do
    this.contrails.rebase(off);
    for (const p of this.pilots.values()) if (p instanceof EnemyPilot) p.setupPoint.sub(off);
  }

  // Engine voice info for sound
  fighterSoundInfo() {
    return this.fighters('axis').concat(this.fighters('allied').filter((f) => !f.isPlayer))
      .filter((f) => !f.remove)
      .map((f) => ({ id: f.id, pos: f.pos, vel: f.vel, radial: f.kind === 'fw190', throttle: f.fm.throttle }));
  }
}

export { dirFromYawPitch, _q };

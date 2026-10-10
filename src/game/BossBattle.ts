import * as THREE from 'three';
import { World, ENEMY_SCALE, CRUISE } from '../world/World';
import { Aircraft, Bomber, Fighter } from '../world/Aircraft';
import type { HitEvent } from '../world/Ballistics';
import { ENEMY_VARIANTS, randomEnemyType } from '../world/EnemyTypes';
import { BossShip, ShipPart, SHIP_DEFS, PART_LABEL, BOSS_ROCKET_GEO, BOSS_ROCKET_MAT, PartKind } from '../world/BossShip';
import type { AttackType } from '../world/AI';
import type { ParticleOpts } from '../render/Particles';
import { isBossRound, type Mission } from './Missions';
import type { UI } from '../ui/UI';
import { sound } from '../audio/Sound';
import { BossDrone } from '../audio/BossDrone';
import { drawBossHud } from '../ui/BossHud';

/**
 * Boss battle: a Luftkreuzer battle group (3-4 giant flying warships, see BossShip) that
 * holds stations 400-900 m off the bomber stream and slowly shifts around it (left beam,
 * ahead-high crossing, right beam, astern, split), fighting back with tracking turrets,
 * a dorsal flak cannon, rocket pods and telegraphed heavy attacks (one at a time, the
 * weapon glows and the crew calls it out, so the player can knock it out first). Escort
 * fighters launch from the ships in waves; a ship at half health enrages; the last one
 * standing turns desperate (ramming runs and all-turret broadsides). Ships break in two
 * when they die. Game only calls director()/update()/drawHud() and reads `cleared`.
 */

export interface BossHooks {
  score(n: number): void;
  slowmo(seconds: number): void;   // real seconds of slow motion (Game.slowmo)
  perk(label: string): void;       // field upgrade card (Game.awardPerk)
  merit(n: number): void;          // Armory merit (Progression.earn)
}

// isBossRound lives in Missions.ts (pure, unit-tested); re-exported for the existing importers
export { isBossRound };

type HeavyKind = 'flak' | 'rockets' | 'broadside' | 'ram';
interface Heavy { kind: HeavyKind; part: ShipPart | null; t: number; charge: number; fire: number; fired: number; hit: boolean }

export interface ShipState {
  ship: BossShip;
  slot: number;
  arrived: boolean;
  enraged: boolean;
  desperate: boolean;
  breachShown: boolean;
  heavy: Heavy | null;
  deathT: number;          // -1 while fighting
  blastT: number;
  blasts: number;
  fxT: number;
  armourPing: number;      // HUD: "ARMOURED" after hull hits before the breach
  lag: number;             // HUD: trailing health
}

interface Piece { root: THREE.Group; model: THREE.Object3D; local: THREE.Plane; world: THREE.Plane; mats: THREE.Material[]; vel: THREE.Vector3; spin: THREE.Vector3; age: number; acc: number; S: number; front: boolean; cut: number }
interface Shell { t: number; pos: THREE.Vector3; heavy: boolean; live: boolean; owner: BossShip | null }
interface Rocket { obj: THREE.Mesh; vel: THREE.Vector3; fuse: number; age: number; live: boolean; owner: BossShip | null }
export interface Popup { pos: THREE.Vector3; text: string; life: number; live: boolean; color: string }
export interface Flash { title: string; sub: string; color: string; t: number }

// Station patterns (formation frame: x left, y up, z forward; metres from the formation
// centre), one slot per ship. The group moves to the next pattern every PATTERN_TIME s.
const PATTERNS: [number, number, number][][] = [
  [[500, 60, 330], [620, 190, -120], [520, -50, -520], [860, 150, 260]],      // left beam
  [[380, 230, 760], [-60, 300, 880], [-440, 220, 720], [40, 450, 1180]],      // ahead and high, crossing
  [[-500, 60, 330], [-620, 190, -120], [-520, -50, -520], [-860, 150, 260]],  // right beam
  [[-560, 110, -640], [560, 160, -700], [-40, 300, -860], [0, 440, -1180]],   // astern: the tail gun's turn
  [[-500, 50, 240], [540, 110, 20], [-620, 220, -480], [720, 240, -400]],     // split, both sides
];
const PATTERN_TIME = 42;
const INTRO_OFF = new THREE.Vector3(0, 240, 2300);
const MUZZLE = 820;
const G = 9.81;
const TRACER: [number, number, number] = [12, 3.6, 1.6];
const TRACER_HEAVY: [number, number, number] = [14, 7, 2.2];

const R = () => Math.random() * 2 - 1;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _d = new THREE.Vector3();
const _tp = new THREE.Vector3();
const _mz = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _left = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// reusable particle options (no per-frame object literals)
const O: ParticleOpts = { pos: _v, life: 1, size0: 1, size1: 1, color0: [1, 1, 1] };
function po(pos: THREE.Vector3, vel: THREE.Vector3 | undefined, life: number, s0: number, s1: number, c0: [number, number, number], c1: [number, number, number] | undefined, a0: number, drag: number, rise: number, lit: boolean, frame: number) {
  O.pos = pos; O.vel = vel; O.life = life; O.size0 = s0; O.size1 = s1; O.color0 = c0; O.color1 = c1;
  O.alpha0 = a0; O.alpha1 = 0; O.drag = drag; O.rise = rise; O.lit = lit; O.frame = frame; O.rotVel = frame === 2 ? 1.5 : undefined;
  return O;
}
const C_CHARGE: [number, number, number] = [26, 5, 1.5];
const C_CHARGE1: [number, number, number] = [6, 0.6, 0.1];
const C_COL0: [number, number, number] = [0.045, 0.04, 0.035];
const C_COL1: [number, number, number] = [0.11, 0.1, 0.095];
const C_FIRE0: [number, number, number] = [10, 4, 0.9];
const C_LAUNCH: [number, number, number] = [3, 3, 3];
const C_BURN1: [number, number, number] = [1, 0.2, 0.04];

export class BossBattle {
  ships: ShipState[] = [];
  active = false;
  cleared = false;             // whole group destroyed and the sky settled: Game ends the round
  time = 0;
  groupHealth = 1;
  groupLag = 1;
  groupName = 'LUFTKREUZER-GESCHWADER';
  objective = '';
  flash: Flash = { title: '', sub: '', color: '', t: 0 };
  popups: Popup[] = [];
  role: 'gunner' | 'pilot' = 'gunner';
  private pieces: Piece[] = [];
  private shells: Shell[] = [];
  private rockets: Rocket[] = [];
  private mission: Mission | null = null;
  private bossRound = -1;
  private roundIdx = 0;
  private forcePending = false;
  private lastWorldTime = 0;
  private heavyCd = 14;
  private escortCd = 18;
  private escortsLaunched = 0;
  private victoryT = -1;
  private introT = 0;
  private hpScale = 1;
  private dmgScale = 1;
  private shipsAtStart = 0;
  private tips = new Set<string>();
  private anchor = new THREE.Object3D();
  private drone = new BossDrone();
  private partMult = (p: ShipPart) => (p.charge > 0 ? 2.5 : 1);

  constructor(private world: World, private ui: UI, private hooks: BossHooks) {
    world.scene.add(this.anchor);  // floating-origin probe: Engine.rebase shifts it with the world
    for (let i = 0; i < 24; i++) this.shells.push({ t: 0, pos: new THREE.Vector3(), heavy: false, live: false, owner: null });
    for (let i = 0; i < 12; i++) this.popups.push({ pos: new THREE.Vector3(), text: '', life: 0, live: false, color: '' });
  }

  // Dev hook (sws.boss): start a battle group on the next director tick, whatever the round
  force() { this.forcePending = true; }

  get alive() { let n = 0; for (const s of this.ships) if (s.deathT < 0) n++; return n; }

  // Called by Game.director every frame of a round mission. Starts the battle group on a
  // boss round; returns true while this round belongs to the boss (Game then skips its
  // normal fighter director and ends the round when `cleared` turns true).
  director(_dt: number, m: Mission, roundIdx: number): boolean {
    this.checkReset(m);
    this.roundIdx = roundIdx;
    if (!this.active && (this.forcePending || (this.bossRound !== roundIdx && isBossRound(m, roundIdx)))) this.start(m, roundIdx);
    return this.active && this.bossRound === roundIdx;
  }

  private checkReset(m?: Mission) {
    const w = this.world;
    if ((m && m !== this.mission) || w.time < this.lastWorldTime - 1e-6) { this.reset(); if (m) this.mission = m; }
    this.lastWorldTime = w.time;
  }

  reset() {
    for (const s of this.ships) { s.ship.remove = true; s.ship.root.removeFromParent(); s.ship.dispose(); }
    this.ships = [];
    for (const p of this.pieces) { p.root.removeFromParent(); for (const m of p.mats) m.dispose(); }
    this.pieces = [];
    for (const r of this.rockets) { r.live = false; r.obj.visible = false; }
    for (const s of this.shells) s.live = false;
    for (const p of this.popups) p.live = false;
    this.active = false; this.cleared = false; this.bossRound = -1;
    this.victoryT = -1; this.flash.t = 0; this.objective = '';
    this.drone.stop();
    this.mission = null;
  }

  // ---------------- start ----------------
  private start(m: Mission, roundIdx: number) {
    const w = this.world;
    const forced = this.forcePending;
    this.forcePending = false;
    this.mission = m;
    this.role = m.role;
    this.active = true; this.cleared = false; this.bossRound = roundIdx; this.victoryT = -1;
    this.time = 0; this.introT = 0; this.heavyCd = 16; this.escortCd = 16; this.escortsLaunched = 0;
    const survival = !Number.isFinite(m.rounds ?? 1);
    const count = forced || (survival ? roundIdx >= 5 : m.id !== 'm5') ? 4 : 3;
    const tier = survival ? Math.floor(roundIdx / 3) : m.id === 'm12' ? 2 : m.id === 'm7' ? 1 : 0;
    this.hpScale = (m.role === 'gunner' ? 0.5 : 0.85) * (0.85 + 0.15 * w.difficulty) * (1 + 0.12 * tier);
    this.dmgScale = w.difficulty * (1 + 0.06 * tier);
    const base = ENEMY_SCALE * ENEMY_VARIANTS.ju88.scale;
    this.ships = [];
    for (let i = 0; i < count; i++) {
      const def = SHIP_DEFS[i];
      const ship = new BossShip(def, base * def.mult, this.hpScale);
      ship.formation = { center: w.formationCenter, forward: w.formationForward };
      ship.cruise = CRUISE;
      const st0 = PATTERNS[0][i];
      ship.off.set(st0[0], st0[1], st0[2]).add(INTRO_OFF).add(_v.set(R() * 120, i * 40, i * 280));
      ship.station.set(st0[0], st0[1], st0[2]);
      ship.maxRel = 95; ship.accel = 10;
      ship.relVel.set(0, -8, -60);
      w.add(ship);
      ship.update(1e-3);
      this.ships.push({ ship, slot: i, arrived: false, enraged: false, desperate: false, breachShown: false, heavy: null, deathT: -1, blastT: 0, blasts: 0, fxT: Math.random() * 0.1, armourPing: 0, lag: 1 });
    }
    this.shipsAtStart = count;
    this.groupName = count === 4 ? 'SCHLACHTGESCHWADER GÖTTERDÄMMERUNG' : 'LUFTKREUZER-GESCHWADER';
    this.objective = `Destroy the battle group — ${count} warships`;
    if (!this.rockets.length) {
      for (let i = 0; i < 36; i++) {
        const obj = new THREE.Mesh(BOSS_ROCKET_GEO, BOSS_ROCKET_MAT);
        obj.visible = false; obj.castShadow = false;
        w.scene.add(obj);
        this.rockets.push({ obj, vel: new THREE.Vector3(), fuse: 0, age: 0, live: false, owner: null });
      }
    }
    const gunner = m.role === 'gunner';
    setTimeout(() => this.radio('b_intro0', gunner ? 'Navigator' : 'Lead', 'Big formation, twelve o\'clock high... those aren\'t fighters.'), 600);
    setTimeout(() => this.radio('b_intro1', gunner ? 'Pilot' : 'Big Friend', 'Good God... look at the size of those things!'), 5200);
    setTimeout(() => this.radio('b_intro2', gunner ? 'Top Turret' : 'Lead', 'Luftkreuzers! Their hulls are armoured — go for the turrets, the engines and the fuel tanks!'), 10500);
    setTimeout(() => { if (this.active) this.ui.banner(count === 4 ? 'BATTLE GROUP · FLAGSHIP GÖTTERDÄMMERUNG' : 'BATTLE GROUP INBOUND', 'LUFTKREUZER', 4800); }, 1800);
    setTimeout(() => { if (this.active) this.tip('weak', 'Shoot the bracketed <kbd>weak points</kbd> — turrets, engines, fuel tank, bridge — to breach the armour', 6000); }, 9000);
  }

  private radio(key: string, who: string, text: string, cooldown = 0, priority = 3) {
    if (!this.active && this.victoryT < 0) return;
    this.world.callout(key, who, text, cooldown, priority);
  }

  private tip(key: string, text: string, ms = 4000) {
    if (this.tips.has(key)) return;
    this.tips.add(key);
    this.ui.tip(text, ms);
  }

  private say(lines: [string, string][], key: string, cooldown: number, priority = 2) {
    const [who, text] = lines[Math.floor(Math.random() * lines.length)];
    this.world.callout(key, this.role === 'pilot' && who !== 'Big Friend' ? (Math.random() < 0.6 ? 'Lead' : 'Blue Three') : who, text, cooldown, priority);
  }

  // Positions of the weak points (dev autoplay targeting)
  targets(): { pos: THREE.Vector3; vel: THREE.Vector3 }[] {
    const out: { pos: THREE.Vector3; vel: THREE.Vector3 }[] = [];
    for (const s of this.ships) {
      if (s.deathT >= 0) continue;
      const sh = s.ship;
      if (sh.breached) { out.push({ pos: sh.pos.clone(), vel: sh.vel.clone() }); continue; }
      for (const p of sh.parts) if (p.alive) out.push({ pos: sh.partPos(p, new THREE.Vector3()), vel: sh.vel.clone() });
    }
    return out;
  }

  // ---------------- per frame ----------------
  update(dt: number) {
    this.checkReset();
    // floating origin: the probe moved with the world, shift our absolute positions too
    const a = this.anchor.position;
    if (a.x !== 0 || a.y !== 0 || a.z !== 0) {
      for (const s of this.shells) if (s.live) s.pos.add(a);
      for (const p of this.popups) if (p.live) p.pos.add(a);
      a.set(0, 0, 0);
    }
    if (!this.active && !this.pieces.length) return;
    if (dt <= 0) return;
    this.time += dt;
    const w = this.world;
    if (this.active) sound.music.setIntensity(1);
    this.introT += dt;
    let health = 0, max = 0;
    for (const s of this.ships) {
      const sh = s.ship;
      sh.sync(dt, this.partMult);
      for (const p of sh.destroyed) this.onPartDestroyed(s, p);
      sh.destroyed.length = 0;
      if (sh.breached && !s.breachShown) this.onBreach(s);
      if (s.deathT < 0 && sh.core <= 0) this.startDeath(s);
      if (s.deathT < 0) {
        if (!s.enraged && sh.health < 0.5) this.enrage(s);
        if (!s.desperate && this.shipsAtStart > 1 && this.alive === 1 && this.introT > 20) this.despair(s);
        this.fly(s, dt);
        this.weapons(s, dt);
        this.shipFx(s, dt);
        if (sh.coreHitAcc > 3 && !sh.breached) { s.armourPing = 0.7; if (sh.hullHitT === 0 && this.introT > 12) this.tip('armour', 'Armour plate — bullets bounce off the hull. Hit the <kbd>weak points</kbd> first', 3500); }
        s.armourPing = Math.max(0, s.armourPing - dt);
      } else this.dying(s, dt);
      const hp = sh.health, wgt = sh.coreMax;
      health += hp * wgt; max += wgt;
      s.lag += (hp - s.lag) * (hp < s.lag ? Math.min(1, dt * 1.5) : 1);
    }
    this.groupHealth = max > 0 ? health / max : 0;
    this.groupLag += (this.groupHealth - this.groupLag) * (this.groupHealth < this.groupLag ? Math.min(1, dt * 1.2) : 1);
    if (this.active && this.victoryT < 0) {
      this.scheduleHeavy(dt);
      this.escorts(dt);
      const left = this.alive;
      this.objective = left > 0 ? `Battle group — ${left} warship${left > 1 ? 's' : ''} · ${Math.round(this.groupHealth * 100)}%` : 'Battle group destroyed';
    }
    this.updateShells(dt);
    this.updateRockets(dt);
    this.updatePieces(dt);
    for (const p of this.popups) if (p.live) { p.life -= dt; p.pos.addScaledVector(w.formationForward, CRUISE * dt); p.pos.y += dt * 12; if (p.life <= 0) p.live = false; }
    if (this.flash.t > 0) this.flash.t -= dt;
    // victory: the last ship's death has played, pay out, then let Game end the round
    if (this.victoryT >= 0) {
      this.victoryT += dt;
      if (this.victoryT - dt < 4.2 && this.victoryT >= 4.2) this.victory();
      if (!this.cleared && this.victoryT > 10 && (w.activeEnemies().length === 0 || this.victoryT > 35)) { this.cleared = true; this.active = false; }
    }
    this.drone.update(this.ships, this.active);
    // ships fully gone: drop them from our list
    if (!this.active && this.cleared) {
      for (let i = this.ships.length - 1; i >= 0; i--) if (this.ships[i].ship.remove) { this.ships[i].ship.dispose(); this.ships.splice(i, 1); }
    }
  }

  drawHud(ctx: CanvasRenderingContext2D, W: number, H: number, cam: THREE.PerspectiveCamera) {
    if (!this.ships.length && !this.active) return;
    drawBossHud(ctx, W, H, cam, this);
  }

  // ---------------- flight ----------------
  private fly(s: ShipState, dt: number) {
    const sh = s.ship;
    let deadL = 0, deadR = 0;
    for (const p of sh.parts) if (p.kind === 'engine' && !p.alive) { if (p.side > 0) deadL++; else deadR++; }
    const dead = deadL + deadR;
    sh.listRoll = (deadR - deadL) * 0.075;
    const h = s.heavy;
    if (h && h.kind === 'ram' && h.t >= h.charge) return; // ram run steers the ship itself (heavyFire)
    const pi = s.arrived ? Math.floor(Math.max(0, this.introT - 30) / PATTERN_TIME) % PATTERNS.length : 0;
    const st = PATTERNS[pi][s.slot];
    sh.station.set(st[0], st[1] - dead * 30, st[2] - dead * 85);
    // changing sides: climb over the bomber box instead of flying through it
    if (Math.abs(st[0]) > 200 && (sh.off.x * st[0] < 0 || Math.abs(sh.off.x) < 200) && Math.abs(sh.off.z) < 1000) sh.station.y = Math.max(sh.station.y, 330 + s.slot * 45);
    if (!s.arrived) {
      if (sh.off.distanceTo(sh.station) < 260) s.arrived = true;
    }
    if (s.arrived) {
      sh.maxRel = Math.max(7, (s.enraged ? 22 : 16) - dead * 2.2);
      sh.accel = 6;
    }
    sh.extraRoll *= Math.exp(-dt * 0.6);
  }

  // ---------------- weapons ----------------
  private pickTarget(sh: BossShip): Aircraft | null {
    const w = this.world, pl = w.player;
    if (pl && pl.alive && (Math.random() < 0.8 || this.role === 'pilot' && Math.random() < 0.5)) return pl;
    const near: Aircraft[] = [];
    for (const a of w.aircraft) if (a.alive && a.team === 'allied' && (a instanceof Bomber || a instanceof Fighter) && a.pos.distanceTo(sh.pos) < 1500) near.push(a);
    return near.length ? near[Math.floor(Math.random() * near.length)] : pl && pl.alive ? pl : null;
  }

  // Lead point for a gun at `from` on `target` (world), with drop compensation
  private lead(from: THREE.Vector3, shooterVel: THREE.Vector3, target: Aircraft, speed: number, out: THREE.Vector3) {
    let tof = target.pos.distanceTo(from) / speed;
    for (let i = 0; i < 2; i++) { out.copy(target.vel).sub(shooterVel).multiplyScalar(tof).add(target.pos); tof = out.distanceTo(from) / speed; }
    out.y += 0.5 * G * tof * tof;
    return out;
  }

  private weapons(s: ShipState, dt: number) {
    const sh = s.ship, w = this.world;
    const pl = w.player;
    const inRange = pl && sh.pos.distanceTo(pl.pos) < 2000;
    const h = s.heavy;
    const bridgeUp = sh.aliveParts('bridge') > 0;
    const inacc = (bridgeUp ? 1 : 1.7) * w.enemyAimMult / Math.max(0.6, this.dmgScale);
    const rateMul = (s.enraged ? 1.45 : 1) * (s.desperate ? 1.2 : 1);
    if (h) this.heavyUpdate(s, h, dt);
    const broadside = !!h && h.kind === 'broadside' && h.t >= h.charge;
    _q.copy(sh.quat).invert();
    for (const p of sh.parts) {
      if (!p.alive || (p.kind !== 'turret' && p.kind !== 'flak')) continue;
      p.retarget -= dt;
      if (p.retarget <= 0 || !p.target || !p.target.alive) { p.retarget = 2 + Math.random() * 2.5; p.target = broadside ? pl : this.pickTarget(sh); }
      if (broadside && pl?.alive) p.target = pl;
      const tgt = p.target;
      if (!tgt || !this.arrivedEnough(s)) { this.idleAim(sh, p, dt); continue; }
      sh.partPos(p, _mz);
      const speed = p.kind === 'flak' ? 750 : MUZZLE;
      this.lead(_mz, sh.vel, tgt, speed, _tp);
      if (p.burst > 0) p.err.multiplyScalar(Math.exp(-dt * 1.6));
      _tp.add(p.err);
      const dist = _tp.distanceTo(_mz);
      _d.copy(_tp).sub(_mz).normalize();
      _v.copy(_d).applyQuaternion(_q);           // model frame
      const dn = _v.dot(p.up);
      const inArc = dn > -0.12;
      // out of its field of fire the gun waits at the edge of its arc, toward the target
      if (!inArc) _v.addScaledVector(p.up, 0.1 - dn).normalize();
      sh.aimTurret(p, _v, 1 - Math.exp(-dt * 2.6));
      if (p.kind === 'flak') {
        if (h && h.part === p) continue;          // charging for the barrage
        p.cd -= dt * rateMul;
        if (p.cd <= 0 && inArc && inRange && tgt === pl && dist < 2200) {
          p.cd = s.enraged ? 3 + Math.random() : 5.5 + Math.random() * 2;
          this.fireFlak(sh, p, tgt, 25 + Math.random() * 35, false);
        }
        continue;
      }
      p.cd -= dt * rateMul;
      if (broadside) {
        p.burst = Math.max(p.burst, 0.2);
        p.err.multiplyScalar(0.5);
      } else if (p.burst <= 0 && p.cd <= 0 && inArc && dist < 1500) {
        p.burst = (1.2 + Math.random() * 0.9) * (s.enraged ? 1.4 : 1);
        p.cd = p.burst + 2.2 + Math.random() * 1.8;
        p.err.set(R(), R(), R()).normalize().multiplyScalar(dist * (0.028 + Math.random() * 0.028) * inacc);
      }
      if (p.burst > 0) {
        p.burst -= dt;
        if (!inArc) continue;
        const rate = (broadside ? 15 : 9.5) * rateMul;
        p.acc += dt * rate;
        while (p.acc >= 1) { p.acc -= 1; this.fireGun(sh, p, (broadside ? 0.004 : 0.008) * inacc, broadside); }
      } else p.acc = 0;
    }
  }

  private arrivedEnough(s: ShipState) {
    const pl = this.world.player;
    return s.arrived || (pl && s.ship.pos.distanceTo(pl.pos) < 1500);
  }

  private idleAim(sh: BossShip, p: ShipPart, dt: number) {
    _v.copy(p.up).multiplyScalar(0.6).add(_v2.set(0, 0, 1)).normalize();
    sh.aimTurret(p, _v, 1 - Math.exp(-dt));
  }

  private fireGun(sh: BossShip, p: ShipPart, spread: number, heavy: boolean) {
    const w = this.world;
    p.shots++;
    sh.muzzle(p, _mz);
    _d.copy(p.aim).applyQuaternion(sh.quat);
    _d.x += R() * spread; _d.y += R() * spread; _d.z += R() * spread;
    _d.normalize();
    _v.copy(_d).multiplyScalar(MUZZLE).add(sh.vel);
    w.ballistics.fire(_mz, _v, 'axis', 14 * this.dmgScale, p.shots % 2 === 0, heavy ? TRACER_HEAVY : TRACER, sh, heavy, false, 3.0);
    if (p.shots % 2 === 0) w.effects.muzzleFlash(_mz, _d, 3.2, sh.vel);
    if (p.shots % 3 === 0) sound.play(heavy ? 'cannon' : 'mg131', _mz, { gain: 0.75, ref: 150 });
  }

  // 8.8 cm shell: bursts near the target after its time of flight (err = miss distance, m)
  private fireFlak(sh: BossShip, p: ShipPart, tgt: Aircraft, err: number, heavy: boolean) {
    const w = this.world;
    sh.muzzle(p, _mz);
    _d.copy(p.aim).applyQuaternion(sh.quat);
    w.effects.muzzleFlash(_mz, _d, 7, sh.vel);
    w.effects.smoke.spawn(po(_mz, sh.vel, 3, 4, 16, C_COL1, undefined, 0.6, 1.2, 0.5, true, 0));
    sound.play('cannon', _mz, { gain: 1.6, ref: 220, rate: 0.6 });
    const shell = this.shells.find((x) => !x.live);
    if (!shell) return;
    this.lead(_mz, sh.vel, tgt, 750, _tp);
    _tp.y -= 0.5 * G * (_tp.distanceTo(_mz) / 750) ** 2; // shells are fused for the point, not lobbed
    shell.pos.copy(_tp).add(_v.set(R(), R() * 0.6, R()).normalize().multiplyScalar(err));
    shell.t = _tp.distanceTo(_mz) / 750;
    shell.heavy = heavy; shell.live = true; shell.owner = sh;
  }

  private updateShells(dt: number) {
    const w = this.world;
    for (const s of this.shells) {
      if (!s.live) continue;
      s.t -= dt;
      if (s.t > 0) continue;
      s.live = false;
      // shells travel with the formation's frame of reference closely enough: shift with it
      w.effects.flak(s.pos);
      if (s.heavy) w.effects.flak(_v.copy(s.pos).add(_v2.set(R() * 10, R() * 6, R() * 10)));
      const dl = w.listener ? s.pos.distanceTo(w.listener) : 9999;
      if (dl < 220) sound.play('flakClose', s.pos, { gain: 1.6, ref: 70, reverb: 0.5 }); else sound.play('flak', s.pos, { gain: 1.4, ref: 90, reverb: 0.6 });
      if (w.player && dl < 450) w.events.shake?.(Math.max(0, 1 - dl / 450) * 1.1);
      this.blast(s.pos, 62, s.heavy ? 95 : 70, s.owner);
    }
  }

  // Area damage to allied aircraft through World.onHit (so player feedback all works)
  private blast(pos: THREE.Vector3, radius: number, dmg: number, owner: Aircraft | null) {
    const w = this.world;
    const onHit = (w as unknown as { onHit(e: HitEvent): void }).onHit;
    for (const a of w.aircraft) {
      if (!a.alive || a.team !== 'allied') continue;
      const d = a.pos.distanceTo(pos);
      if (d > radius) continue;
      for (let k = 0; k < 2; k++) {
        const zone = a.zones[Math.floor(Math.random() * a.zones.length)];
        onHit.call(w, { target: a, zone, point: a.localToWorld(zone.offset, new THREE.Vector3()), damage: (1 - d / radius) * dmg * this.dmgScale, cannon: d < radius * 0.45, shooter: owner, bulletVel: new THREE.Vector3(), playerShot: false });
      }
    }
  }

  private fireRocket(sh: BossShip, pod: ShipPart, tgt: Aircraft) {
    const r = this.rockets.find((x) => !x.live);
    if (!r) return;
    const w = this.world;
    _mz.set(pod.local.x + R() * 0.15, pod.local.y, pod.local.z + 0.7).multiplyScalar(sh.S);
    sh.root.localToWorld(_mz);
    this.lead(_mz, sh.vel, tgt, 300, _tp);
    const dist = _tp.distanceTo(_mz);
    _d.copy(_tp).sub(_mz).normalize();
    _d.x += R() * 0.03; _d.y += R() * 0.03 + 0.01; _d.z += R() * 0.03;
    _d.normalize();
    r.obj.position.copy(_mz);
    r.vel.copy(_d).multiplyScalar(300).add(sh.vel);
    r.fuse = dist / 300 + R() * 0.35;
    r.age = 0; r.live = true; r.owner = sh;
    r.obj.visible = true;
    r.obj.scale.setScalar(4);
    w.effects.muzzleFlash(_mz, _d, 5, sh.vel);
    sound.play('rocket', _mz, { gain: 1.1, ref: 120 });
  }

  private updateRockets(dt: number) {
    const w = this.world;
    for (const r of this.rockets) {
      if (!r.live) continue;
      r.age += dt;
      r.vel.y -= G * dt * 0.5;
      const p = r.obj.position;
      p.addScaledVector(r.vel, dt);
      r.obj.lookAt(_v.copy(p).add(r.vel));
      w.effects.smoke.spawn(po(p, _v2.copy(r.vel).multiplyScalar(0.05), 4, 2, 9, [0.8, 0.8, 0.78], undefined, 0.5, 1, 0.3, true, 0));
      if (r.age < 2) w.effects.glow.spawn(po(p, undefined, 0.06, 4, 1.5, C_FIRE0, undefined, 1, 0, 0, false, 1));
      let boom = r.age >= r.fuse;
      if (!boom) for (const a of w.aircraft) if (a.alive && a.team === 'allied' && a.pos.distanceTo(p) < (a.isPlayer ? 30 : 24)) { boom = true; break; }
      if (boom || r.age > 9) {
        r.live = false; r.obj.visible = false;
        if (!boom) continue;
        w.effects.explosion(p, _v.set(0, 0, 0), 0.8);
        sound.play('explosion', p, { gain: 1.5, ref: 150, reverb: 0.7 });
        if (w.player) w.events.shake?.(Math.max(0, 1 - p.distanceTo(w.player.pos) / 300));
        this.blast(p, 50, 85, r.owner);
      }
    }
  }

  // ---------------- telegraphed heavy attacks ----------------
  private scheduleHeavy(dt: number) {
    if (this.introT < 14) return;
    for (const s of this.ships) if (s.heavy) return;
    this.heavyCd -= dt;
    if (this.heavyCd > 0) return;
    const pl = this.world.player;
    if (!pl || !pl.alive) return;
    const cands: ShipState[] = [];
    for (const s of this.ships) if (s.deathT < 0 && s.arrived && s.ship.pos.distanceTo(pl.pos) < 1900) { cands.push(s); if (s.enraged || s.desperate) cands.push(s); }
    if (!cands.length) { this.heavyCd = 2; return; }
    const s = cands[Math.floor(Math.random() * cands.length)];
    const sh = s.ship;
    const kinds: HeavyKind[] = [];
    if (sh.aliveParts('flak')) kinds.push('flak', 'flak');
    if (sh.aliveParts('rockets')) kinds.push('rockets', 'rockets');
    if ((s.enraged || s.desperate) && sh.aliveParts('bridge') && sh.aliveParts('turret')) kinds.push('broadside', 'broadside');
    if (s.desperate) kinds.push('ram', 'ram', 'ram');
    if (!kinds.length) { this.heavyCd = 4; return; }
    this.startHeavy(s, kinds[Math.floor(Math.random() * kinds.length)]);
    const frac = Math.max(0.45, this.alive / this.shipsAtStart);
    this.heavyCd = s.desperate ? 6 + Math.random() * 3 : (11 + Math.random() * 5) * frac;
  }

  private startHeavy(s: ShipState, kind: HeavyKind) {
    const sh = s.ship, n = sh.def.name;
    const part = kind === 'flak' ? sh.part('flak') : kind === 'rockets' ? sh.part('rockets') : kind === 'broadside' ? sh.part('bridge') : null;
    s.heavy = { kind, part, t: 0, charge: kind === 'flak' ? 3.2 : kind === 'rockets' ? 2.8 : kind === 'broadside' ? 2.6 : 3.2, fire: kind === 'flak' ? 2.6 : kind === 'rockets' ? 1.6 : kind === 'broadside' ? 4.2 : 16, fired: 0, hit: false };
    sound.alarmBell(2, 0.45, 0.16);
    const g = this.role === 'gunner';
    if (kind === 'flak') this.say([['Navigator', `${n}'s big gun is training on us — knock it out!`], ['Top Turret', `Flak gun on ${n} is laying on us! Hit it before it fires!`]], 'b_hv_flak', 0, 3);
    else if (kind === 'rockets') this.say([['Tail', `${n}'s loading rockets — shoot the pods!`], ['Ball Turret', `Rocket pods on ${n} are glowing! Take them out!`]], 'b_hv_rk', 0, 3);
    else if (kind === 'broadside') this.say([['Pilot', `${n} is swinging every gun onto us — broadside coming!`], ['Top Turret', `She's lining up a broadside! Kill her bridge!`]], 'b_hv_bs', 0, 3);
    else this.say([['Pilot', g ? `${n} is turning into us — she means to ram! Shoot her down!` : `${n} is turning into the bombers — she's going to ram!`]], 'b_hv_ram', 0, 3);
    this.tip('charge', 'A <kbd>charging</kbd> weapon glows red — destroy it before it fires (it takes extra damage while charging)', 4500);
  }

  private heavyUpdate(s: ShipState, h: Heavy, dt: number) {
    const sh = s.ship, w = this.world, pl = w.player;
    h.t += dt;
    // the charging weapon was shot away: attack broken up
    const lost = h.kind === 'flak' || h.kind === 'rockets' ? !h.part?.alive && !(h.kind === 'rockets' && sh.aliveParts('rockets')) : h.kind === 'broadside' ? !sh.aliveParts('bridge') : false;
    if (lost && h.t < h.charge) {
      this.say([['Pilot', 'You got it just in time!'], ['Navigator', 'Nice shooting — that broke it up!']], 'b_hv_broken', 4, 2);
      this.endHeavy(s);
      return;
    }
    if (h.kind === 'rockets' && h.part && !h.part.alive) h.part = sh.part('rockets');
    const charging = h.t < h.charge;
    const k = Math.min(1, h.t / h.charge);
    // telegraph glow on the weapon(s)
    for (const p of sh.parts) {
      const glowing = charging && p.alive && (p === h.part || (h.kind === 'rockets' && p.kind === 'rockets') || (h.kind === 'broadside' && p.kind === 'turret') || (h.kind === 'ram' && p.kind === 'bridge'));
      p.charge = glowing ? Math.max(0.02, k) : 0;
      if (glowing && Math.random() < dt * 30) {
        sh.partPos(p, _v3);
        const pulse = 0.6 + 0.4 * Math.sin(this.time * 18);
        w.effects.glow.spawn(po(_v3, sh.vel, 0.12, (6 + 22 * k) * pulse, (10 + 30 * k) * pulse, C_CHARGE, C_CHARGE1, 1, 0, 0, false, 1));
      }
    }
    if (!pl || !pl.alive) { if (!charging) this.endHeavy(s); return; }
    if (charging) {
      if (h.kind === 'ram') sh.extraRoll = Math.sin(h.t * 2) * 0.12;
      return;
    }
    const ft = h.t - h.charge;
    if (h.kind === 'flak' && h.part?.alive) {
      // barrage: 7 tight shells walked across the player
      while (h.fired < 7 && ft >= h.fired * 0.36) { h.fired++; this.fireFlak(sh, h.part, pl, 8 + Math.random() * 22, true); }
    } else if (h.kind === 'rockets') {
      while (ft >= h.fired * 0.11 && h.fired < 12) {
        const pods = sh.parts.filter((p) => p.alive && p.kind === 'rockets');
        if (!pods.length) break;
        this.fireRocket(sh, pods[h.fired % pods.length], pl);
        h.fired++;
      }
      if (h.fired === 1) this.say([['Tail', 'Rockets! Rockets incoming!']], 'b_rk_fire', 3, 3);
    } else if (h.kind === 'ram') {
      this.ramRun(s, h);
      if (h.hit && ft > 4) { this.endHeavy(s); return; }
    }
    if (ft >= h.fire) this.endHeavy(s);
  }

  private endHeavy(s: ShipState) {
    for (const p of s.ship.parts) p.charge = 0;
    s.heavy = null;
    s.ship.extraPitch = 0;
  }

  // Desperate last ship: drives straight at the player and passes close overhead
  private ramRun(s: ShipState, h: Heavy) {
    const sh = s.ship, w = this.world, pl = w.player!;
    _left.crossVectors(UP, w.formationForward).normalize();
    _v.copy(pl.pos).sub(w.formationCenter);
    sh.station.set(_v.dot(_left), _v.y + 85, _v.dot(w.formationForward) + (h.hit ? 900 : 0));
    sh.maxRel = 55; sh.accel = 13;
    sh.extraRoll = Math.sin(this.time * 0.9) * 0.08;
    const d = sh.pos.distanceTo(pl.pos);
    if (!h.hit && d < 170) {
      h.hit = true;
      // she thunders past a few metres over the canopy: the wash and the point-blank guns hurt
      const onHit = (w as unknown as { onHit(e: HitEvent): void }).onHit;
      for (let k = 0; k < 4; k++) {
        const zone = pl.zones[Math.floor(Math.random() * pl.zones.length)];
        onHit.call(w, { target: pl, zone, point: pl.localToWorld(zone.offset, new THREE.Vector3()), damage: 34 * this.dmgScale, cannon: true, shooter: sh, bulletVel: new THREE.Vector3(), playerShot: false });
      }
      w.events.shake?.(1.4);
      sound.play('whoosh', sh.pos, { gain: 2, ref: 200, delay: false });
      sound.play('explosion', pl.pos, { gain: 1.2, ref: 120 });
      this.say([['Pilot', 'Jesus, that was close! She nearly took our tail off!']], 'b_ram_pass', 0, 3);
    }
  }

  // ---------------- phases ----------------
  private enrage(s: ShipState) {
    s.enraged = true;
    const n = s.ship.def.name;
    this.ui.feed(`${n} ENRAGED`, 'loss');
    this.say([['Top Turret', `${n}'s mad as hell — she's throwing everything at us!`], ['Navigator', `${n} is hurt and angry! Watch her guns!`]], 'b_enrage', 6, 2);
    this.flash.title = 'ENRAGED'; this.flash.sub = `${s.ship.def.title} ${n}`; this.flash.color = '255,140,40'; this.flash.t = 2.2;
    this.launchEscorts(s, 2);
    this.heavyCd = Math.min(this.heavyCd, 4);
  }

  private despair(s: ShipState) {
    s.desperate = true; s.enraged = true;
    this.say([['Pilot', `${s.ship.def.name} is the last one — she's desperate! Brace yourselves!`]], 'b_despair', 0, 3);
    this.flash.title = 'LAST STAND'; this.flash.sub = `${s.ship.def.title} ${s.ship.def.name}`; this.flash.color = '255,60,40'; this.flash.t = 2.6;
    this.heavyCd = Math.min(this.heavyCd, 3);
  }

  private onBreach(s: ShipState) {
    s.breachShown = true;
    const sh = s.ship, w = this.world;
    this.flash.title = 'ARMOUR BREACHED'; this.flash.sub = `${sh.def.title} ${sh.def.name} — hit the hull!`; this.flash.color = '255,70,45'; this.flash.t = 2.8;
    this.say([['Top Turret', `${sh.def.name}'s armour is cracked wide open — pour it into her hull!`], ['Pilot', `Her plating's gone! Hit ${sh.def.name} anywhere now!`]], 'b_breach', 3, 3);
    sound.confirm('kill_confirm');
    for (let i = 0; i < 4; i++) {
      _v.set(R() * 0.5, R() * 0.4, -1 - Math.random() * 6).multiplyScalar(sh.S);
      this.bigBlast(sh.root.localToWorld(_v), sh.vel, 1.6);
    }
    sound.play('explosion', sh.pos, { gain: 1.8, ref: 250, reverb: 0.8 });
    this.hooks.score(400);
    this.popup(sh.pos, '+400  ARMOUR BREACHED', '255,120,80');
  }

  private onPartDestroyed(s: ShipState, p: ShipPart) {
    const sh = s.ship, w = this.world;
    sh.partPos(p, _v3);
    this.bigBlast(_v3, sh.vel, p.kind === 'fuel' ? 3.5 : p.kind === 'flak' || p.kind === 'bridge' ? 2 : 1.4);
    w.effects.spawnDebris(_v3, sh.vel, 6, true);
    sound.play('explosion', _v3, { gain: p.kind === 'fuel' ? 2 : 1.4, ref: 220, reverb: 0.7 });
    if (w.player) w.events.shake?.(Math.max(0, 1 - _v3.distanceTo(w.player.pos) / 900) * (p.kind === 'fuel' ? 0.8 : 0.4));
    const pts = p.kind === 'fuel' ? 300 : p.kind === 'bridge' || p.kind === 'flak' ? 250 : 150;
    this.hooks.score(pts);
    this.popup(_v3, `+${pts}  ${PART_LABEL[p.kind]} DESTROYED`, '255,214,120');
    sound.confirm('hit_confirm');
    w.events.hitMarker?.(true);
    const n = sh.def.name;
    const L: Record<PartKind, [string, string][]> = {
      turret: [['Top Turret', `Got one of ${n}'s turrets!`], ['Tail', 'Turret knocked out! Keep at it!']],
      flak: [['Navigator', `${n}'s big gun is gone!`]],
      rockets: [['Ball Turret', 'Rocket pod went up like a firework!']],
      engine: [['Pilot', `${n}'s got an engine on fire — she's losing speed!`], ['Tail', 'Engine hit! She\'s dropping back!']],
      fuel: [['Pilot', `You hit ${n}'s fuel tank — look at her burn!`]],
      bridge: [['Navigator', `Her bridge is gone! ${n}'s guns are firing blind!`]],
    };
    this.say(L[p.kind], 'b_part_' + p.kind, p.kind === 'turret' || p.kind === 'engine' ? 9 : 2, 2);
  }

  private popup(pos: THREE.Vector3, text: string, color: string) {
    const p = this.popups.find((x) => !x.live) ?? this.popups[0];
    p.pos.copy(pos); p.text = text; p.life = 2.2; p.live = true; p.color = color;
  }

  private escorts(dt: number) {
    if (this.introT < 12) return;
    this.escortCd -= dt;
    if (this.escortCd > 0) return;
    this.escortCd = 28 + Math.random() * 10;
    const live = this.ships.filter((s) => s.deathT < 0);
    if (!live.length) return;
    const cap = 3 + Math.floor(this.roundIdx / 3) + (this.alive <= 1 ? 1 : 0);
    if (this.world.activeEnemies().length >= cap) return;
    this.launchEscorts(live[Math.floor(Math.random() * live.length)], 2 + (Math.random() < 0.4 ? 1 : 0));
  }

  private launchEscorts(s: ShipState, n: number) {
    const w = this.world, sh = s.ship;
    const attacks: AttackType[] = ['headon', 'stern', 'beam', 'high'];
    for (let i = 0; i < n; i++) {
      _v.set((i - (n - 1) / 2) * 3, -1.6, -3.5).multiplyScalar(sh.S);
      const pos = sh.root.localToWorld(_v).clone();
      w.effects.glow.spawn(po(pos, sh.vel, 0.3, 10, 30, C_LAUNCH, undefined, 0.8, 0, 0, false, 3));
      const type = randomEnemyType(Math.min(3, 1 + Math.floor(this.roundIdx / 3)));
      const f = w.spawnEnemy(pos, attacks[Math.floor(Math.random() * attacks.length)], Math.min(1.4, 0.95 + 0.05 * this.roundIdx), false, Math.random() < 0.25, type);
      f.fm.vel.copy(sh.vel).addScaledVector(f.forward(_v2), 40);
      f.vel.copy(f.fm.vel);
    }
    this.escortsLaunched++;
    if (this.escortsLaunched === 1) this.say([['Tail', `They're launching fighters from ${sh.def.name}!`], ['Navigator', 'Fighters dropping out of that thing\'s belly!']], 'b_launch', 0, 2);
    else this.say([['Ball Turret', `More fighters coming off ${sh.def.name}!`]], 'b_launch2', 20, 1);
  }

  // ---------------- per-ship effects ----------------
  private shipFx(s: ShipState, dt: number) {
    const sh = s.ship, w = this.world;
    // enraged: the bolted-on plating glows a dull, pulsing red
    const em = s.enraged ? (0.25 + 0.2 * Math.sin(this.time * (s.desperate ? 9 : 4))) : 0;
    sh.boltMat.emissive.setRGB(em, em * 0.12, em * 0.04);
    s.fxT -= dt;
    if (s.fxT > 0) return;
    s.fxT = 0.1;
    for (const p of sh.parts) {
      if (p.alive) continue;
      if (p.kind === 'engine' || p.kind === 'fuel') {
        sh.partPos(p, _v3);
        w.effects.trail(_v3, sh.vel, 1, true, p.kind === 'fuel' ? 5.5 : 4);
      } else if (p.kind === 'bridge' || p.kind === 'flak') {
        sh.partPos(p, _v3);
        w.effects.trail(_v3, sh.vel, 0.8, false, 3);
      }
    }
    // breached: fires break out along the hull
    if (sh.breached && Math.random() < 0.6) {
      const z = sh.coreZones[Math.floor(Math.random() * 9)];
      w.effects.trail(sh.localToWorld(z.offset, _v3), sh.vel, 1, Math.random() < 0.5, 3);
    }
  }

  // Warship-sized blast: Effects.explosion kept small (it spawns debris meshes) plus a
  // fireball and smoke cloud sized k times larger, from particles only
  private bigBlast(pos: THREE.Vector3, vel: THREE.Vector3, k: number) {
    const fx = this.world.effects;
    fx.explosion(pos, vel, Math.min(1, 0.4 + k * 0.2));
    fx.flashLight(pos, 1400 * k, 0.4, 0xff8a3a);
    for (let i = 0; i < 10; i++) {
      _v2.set(R(), R(), R()).normalize().multiplyScalar((6 + Math.random() * 14) * k).add(vel);
      fx.glow.spawn(po(pos, _v2, 0.9 + Math.random() * 0.9, (8 + Math.random() * 8) * k, (22 + Math.random() * 14) * k, C_FIRE0, C_BURN1, 1, 2, -1, false, 2));
    }
    for (let i = 0; i < 8; i++) {
      _v2.set(R(), R(), R()).normalize().multiplyScalar((4 + Math.random() * 9) * k).add(_v3.copy(vel).multiplyScalar(0.6));
      fx.smoke.spawn(po(pos, _v2, 12 + Math.random() * 8, 12 * k, (40 + Math.random() * 25) * k, C_COL0, C_COL1, 0.9, 1, 0.5, true, 0));
    }
  }

  // ---------------- death ----------------
  private startDeath(s: ShipState) {
    const sh = s.ship, w = this.world;
    s.deathT = 0; s.blastT = 0; s.blasts = 0;
    if (s.heavy) this.endHeavy(s);
    sh.dying = true; sh.alive = false; sh.core = 0;
    for (const p of sh.parts) p.charge = 0;
    const last = this.alive === 0;
    this.hooks.slowmo(last ? 5 : 2.4);
    const pts = Math.round((sh.def.flagship ? 4000 : 2500) * (1 + this.roundIdx * 0.1));
    this.hooks.score(pts);
    w.stats.kills++;
    this.ui.feed(`${sh.def.title} ${sh.def.name} destroyed — +${pts}`, 'mine');
    this.popup(sh.pos, `+${pts}  ${sh.def.name.toUpperCase()} DESTROYED`, '255,214,120');
    this.bigBlast(sh.pos, sh.vel, 3.5);
    sound.play('explosion', sh.pos, { gain: 2.2, ref: 400, reverb: 1 });
    sound.confirm('kill_confirm');
    w.events.hitMarker?.(true);
    this.flash.title = `${sh.def.name.toUpperCase()} IS GOING DOWN`; this.flash.sub = last ? 'The battle group is finished' : `${this.alive} warship${this.alive === 1 ? '' : 's'} left`; this.flash.color = '255,214,120'; this.flash.t = 3;
    this.say(last
      ? [['Pilot', 'She\'s breaking up! That\'s the last of them!'], ['Top Turret', 'Look at her go — she\'s breaking in two!']]
      : [['Tail', `${sh.def.name} is breaking up! She's going down!`], ['Navigator', `Scratch ${sh.def.name}! She's finished!`]], 'b_kill', 0, 3);
    if (last) this.victoryT = 0;
  }

  private dying(s: ShipState, dt: number) {
    const sh = s.ship, w = this.world;
    if (sh.remove) return;
    s.deathT += dt;
    // stricken: nose drops, she rolls over and loses height
    sh.station.y -= dt * 40;
    sh.maxRel = 30; sh.accel = 5;
    sh.extraPitch = -Math.min(0.22, s.deathT * 0.06);
    sh.extraRoll += dt * 0.09 * (sh.listRoll >= 0 ? 1 : -1);
    // chain of secondary explosions marching along the hull, nose to tail
    s.blastT -= dt;
    if (s.blastT <= 0 && s.deathT < 3.4) {
      s.blastT = 0.18 + Math.random() * 0.1;
      const u = Math.min(1, s.blasts / 14);
      _v.set(Math.random() < 0.35 ? R() * 7 : R() * 0.6, R() * 0.5, 3 - u * 12.5).multiplyScalar(sh.S);
      sh.root.localToWorld(_v);
      this.bigBlast(_v, sh.vel, 1.6 + Math.random() * 1.4);
      if (s.blasts % 2 === 0) sound.play('explosion', _v, { gain: 1.6, ref: 300, reverb: 0.9 });
      if (w.player) w.events.shake?.(Math.max(0, 1 - _v.distanceTo(w.player.pos) / 1200) * 0.35);
      s.blasts++;
    }
    if (s.deathT >= 3.4) this.breakShip(s);
  }

  private breakShip(s: ShipState) {
    const sh = s.ship, w = this.world;
    const cut = -3.1;
    const halves = sh.breakApart(cut);
    halves.forEach((h, i) => {
      const front = i === 0;
      w.scene.add(h.root);
      const kick = _v.set(R() * 3, front ? -7 : -2, front ? 7 : -16).applyQuaternion(sh.quat);
      this.pieces.push({
        ...h, vel: sh.vel.clone().add(kick), age: 0, acc: 0, S: sh.S, front, cut,
        spin: new THREE.Vector3(front ? 0.09 + Math.random() * 0.05 : 0.16 + Math.random() * 0.1, R() * 0.05, (front ? 1 : -1) * (0.12 + Math.random() * 0.12) * (Math.random() < 0.5 ? -1 : 1)),
      });
    });
    _v.set(0, 0, cut).multiplyScalar(sh.S);
    sh.root.localToWorld(_v);
    this.bigBlast(_v, sh.vel, 5);
    w.effects.spawnDebris(_v, sh.vel, 18, true);
    w.effects.flashLight(_v, 4000, 0.8, 0xff9a4a);
    sound.play('explosion', _v, { gain: 2.6, ref: 500, reverb: 1 });
    if (w.player) w.events.shake?.(Math.max(0, 1 - _v.distanceTo(w.player.pos) / 1500) * 1.2);
    sh.remove = true;
  }

  private updatePieces(dt: number) {
    const w = this.world;
    let n = 0;
    for (const p of this.pieces) {
      p.age += dt;
      p.vel.y -= G * 0.55 * dt;
      p.vel.y = Math.max(p.vel.y, -85);
      p.vel.multiplyScalar(Math.exp(-0.05 * dt));
      p.root.position.addScaledVector(p.vel, dt);
      _e.set(p.spin.x * dt, p.spin.y * dt, p.spin.z * dt);
      p.root.quaternion.multiply(_q.setFromEuler(_e));
      p.root.updateMatrixWorld(true);
      p.world.copy(p.local).applyMatrix4(p.model.matrixWorld);
      p.acc += dt;
      if (p.acc > 0.07 && p.age < 32) {
        p.acc = 0;
        // burning break: fire at the torn section, a huge smoke column behind it
        _v.set(R() * 0.4, R() * 0.3, p.cut + (p.front ? 0.3 : -0.3));
        p.model.localToWorld(_v);
        w.effects.trail(_v, p.vel, 1, true, 5.5);
        _v2.copy(p.vel).multiplyScalar(0.04);
        w.effects.smoke.spawn(po(_v, _v2, 28 + Math.random() * 10, 30, 130 + Math.random() * 50, C_COL0, C_COL1, 0.9, 0.5, 1.8, true, 0));
        if (p.front) {
          _v.set(R() * 6, 0.2, 0.5).multiplyScalar(1);
          p.model.localToWorld(_v);
          w.effects.trail(_v, p.vel, 1, true, 4);
        }
        if (Math.random() < 0.08) {
          _v.set(R() * 5, R() * 0.4, p.front ? 1 - Math.random() * 3 : -4 - Math.random() * 5);
          p.model.localToWorld(_v);
          this.bigBlast(_v, p.vel, 1.2);
        }
      }
      if (p.age > 40) { p.root.removeFromParent(); for (const m of p.mats) m.dispose(); }
      else this.pieces[n++] = p;
    }
    this.pieces.length = n;
  }

  private victory() {
    const w = this.world;
    const bonus = Math.round(5000 * (1 + this.roundIdx * 0.1) * (this.shipsAtStart / 3));
    this.hooks.score(bonus);
    this.hooks.merit(1000 + 250 * this.shipsAtStart);
    this.ui.banner(`+${bonus} · MERIT +${1000 + 250 * this.shipsAtStart}`, 'BATTLE GROUP DESTROYED', 5000);
    this.ui.feed(`Battle group destroyed — +${bonus}`, 'mine');
    this.hooks.perk('BATTLE GROUP DESTROYED');
    w.callout('b_victory', this.role === 'gunner' ? 'Pilot' : 'Lead', 'That\'s the last of them! Scratch one battle group — drinks are on me!', 0, 3);
    this.objective = 'Battle group destroyed — clear the last fighters';
  }
}

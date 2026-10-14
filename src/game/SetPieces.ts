import * as THREE from 'three';
import type { MidRound } from './MidRound';
import type { PacePhase } from './Pacing';
import { Bomber, Fighter } from '../world/Aircraft';
import type { WreckPiece } from '../world/Wrecks';
import { startBomberDeath } from '../world/BomberDeath';
import { EVENTS } from './RandomEvents';
import { sound } from '../audio/Sound';
import { tx } from '../i18n';
import { achievements } from './Achievements';

// Formation set pieces (Phase 5 goal 27): rare, scripted-but-dynamic moments that make the bomber
// stream feel alive and dangerous. Gunner missions only, staged in the player's field of view:
//
//   flakHit       a neighbouring B-17 takes a direct flak hit: the outer wing folds, she rolls over
//                 into a flat spin, the crew bail out and the radio counts the chutes; the wing
//                 debris comes through the formation and the pilot jinks
//   collision     a crippled, smoking Fw 190 drifts into a B-17 near the player; both go down
//                 locked together (shoot the Fw 190 down first and the collision never happens)
//   bombBay       fire in a B-17's bomb bay, then she blows up: a huge blast that rocks the
//                 player's ship, debris, and a loose wingtip fluttering past the gun position
//   straggler     the existing straggler event (RandomEvents.ts), started from here so it stays
//                 inside the same pacing rules; it got a visible victim, more radio and a drama shot
//   littleFriends two P-51s chase a Bf 109 in a dive straight through the box, right past the
//                 player's window, and shoot it down
//
// Each one has radio lines (tools/voice/lines.json, Arabic in i18n/ar/setpieces.ts) and asks for
// a short drama shot (Cinematics.drama: the kill-cam setting and rules, never in heavy combat).
// Shake goes through World.events.shake / World.buffet and the flash through GameFeel.blastFlash,
// so 'reduce screen shake and flashes' (access.shake / access.flash) scales both.
//
// Pacing: MidRound owns this and calls update() every frame. A set piece starts only in a lull:
// the round's breather (Pacing.ts), or a long-overdue quiet moment in the build-up / middle of a
// round with no more than two fighters near the player; never during a boss fight, the final wave,
// the first or last 25 s of a round or a random event (a bonus objective may be on: the set piece
// never picks a ship it marks, and 'no losses' counts combat losses only). At most one every
// 120-170 s and three per mission; Pacing holds the next fighter group back while one plays, and
// no new objective or event starts until 8 s after it.
//
// Losses: a set piece takes a B-17 down with World.scriptedLoss, which counts it in bombersLost
// (debrief, career) but not in combatLosses, the number the mission's loss limit, the Silver Star
// and 'Fortress Defender' use. So set pieces never make a mission fail; on top of that they take
// at most two B-17s a mission and only while the box has five or more other ships.
//
// Victims: the ship best placed in the gun's view is used as it is; otherwise one is "staged":
// the nearest ship slides over into a free spot in the gun's view over a few seconds (the pilots
// closing up the box) before the drama starts. Per-frame code allocates nothing (scratch vectors).

export type SetPieceId = 'flakHit' | 'collision' | 'bombBay' | 'straggler' | 'littleFriends';
export const SET_PIECES: SetPieceId[] = ['flakHit', 'collision', 'bombBay', 'straggler', 'littleFriends'];
const LOSS_PIECES: SetPieceId[] = ['flakHit', 'collision', 'bombBay'];

export const SP_FIRST = 20;                       // s into the mission before the first one
export const SP_GAP: [number, number] = [120, 170]; // s between set pieces
export const SP_MAX = 3;                          // per mission
export const SP_MAX_LOSSES = 2;                   // B-17s the set pieces may take down per mission
export const SP_OVERDUE = 45;                     // s past the gap before a quiet non-breather moment will do
const SP_EDGE = 25;                               // s at either end of a round kept clear
const STAGE_T = 5.5;                              // s a staged victim takes to slide into view
const NEAR_TRUE_SCALE = 2.2;                      // drawn scale of the scripted enemy fighters (normal enemies: 6)
const LF_LAG = 0.065;                             // path lag of each Mustang behind the 109 (x 5 s)
const BUSY_AFTER = 8;                             // s after a set piece before objectives / events resume

// The scheduling rule as a pure function (unit-tested)
export interface SpGate {
  role: 'gunner' | 'pilot'; boss: boolean; busy: boolean; phase: PacePhase | 'none';
  missionT: number; roundT: number; roundLeft: number; sinceLast: number; gap: number; count: number;
  near: number;   // enemy fighters pressing the attack within 1.2 km of the player
}
export function setPieceDue(g: SpGate): boolean {
  if (g.role !== 'gunner' || g.boss || g.busy || g.count >= SP_MAX) return false;
  if (g.missionT < SP_FIRST || g.sinceLast < g.gap) return false;
  if (g.roundT < SP_EDGE || g.roundLeft < SP_EDGE) return false;
  if (g.phase === 'final' || g.phase === 'over' || g.phase === 'wait') return false;
  // the breather: the build-up's last few fighters may still be about (the drama cam has its own,
  // stricter rule); outside it, only a long-overdue and really quiet moment
  if (g.phase === 'breather') return g.near <= 6;
  return g.near <= 2 && g.sinceLast >= g.gap + SP_OVERDUE && g.missionT >= SP_FIRST + SP_OVERDUE;
}

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _g = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1);
const R = () => Math.random() * 2 - 1;
const smooth = (x: number) => { x = THREE.MathUtils.clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const COUNT_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six'];

// ------------------------------------------------------------------ base
abstract class SetPiece {
  abstract readonly id: SetPieceId;
  t = 0;
  protected prev = -1;
  done = false;
  constructor(protected sp: SetPieces) {}
  get w() { return this.sp.world; }
  /** false: can't be staged now (nothing happens, the scheduler tries again later) */
  abstract start(): boolean;
  abstract step(dt: number): void;
  stop() {}
  tick(dt: number) {
    if (dt <= 0) return;
    // A ship already in view has no staging delay: its zero-time cue must fire on tick one.
    this.prev = this.t === 0 ? -Number.EPSILON : this.t;
    this.t += dt; this.step(dt);
  }
  /** true on the frame t crosses t0 */
  protected at(t0: number) { return this.prev < t0 && this.t >= t0; }
}

// A victim B-17, used where it is or slid into the gun's view first
abstract class VictimPiece extends SetPiece {
  protected b!: Bomber;
  protected t0 = 0;                    // when the drama proper starts (after any staging)
  private from: THREE.Vector3 | null = null;
  private to: THREE.Vector3 | null = null;
  protected side: 1 | -1 = 1;          // victim's model x sign facing the player

  start(): boolean {
    const st = this.sp.stage();
    if (!st) return false;
    this.b = st.b;
    if (st.slot) { this.from = st.b.slot.clone(); this.to = st.slot; this.t0 = STAGE_T; }
    return true;
  }

  // false while staging (and when the victim died on the way: the piece ends)
  protected staged(): boolean {
    if (!this.b.alive) { if (this.t < this.t0) this.done = true; return this.t >= this.t0; }
    if (this.from && this.to && this.t <= this.t0 + 0.01) this.b.slot.lerpVectors(this.from, this.to, smooth(this.t / this.t0));
    if (this.t < this.t0) return false;
    if (this.at(this.t0)) {
      const pl = this.w.player;
      if (pl) this.side = this.b.worldToLocal(_a.copy(pl.pos)).x >= 0 ? 1 : -1;
    }
    return true;
  }

  protected shake(pos: THREE.Vector3, k: number, range = 350) {
    const pl = this.w.player;
    if (pl) this.w.events.shake?.(Math.max(0, 1 - pos.distanceTo(pl.pos) / range) * k);
  }

  // debris thrown toward the player's ship (visual only), and the pilot jinks if it's close
  protected debris(pos: THREE.Vector3, n: number) {
    const pl = this.w.player;
    if (!pl) return;
    _d.copy(pl.pos).sub(pos);
    const dist = _d.length();
    _d.multiplyScalar(Math.min(60, dist / 2.2) / Math.max(1, dist));
    this.w.effects.spawnDebris(pos, this.b.vel, n, true, _d);
  }

  protected evade(from: THREE.Vector3, range = 260): boolean {
    const pl = this.w.player;
    if (!pl || from.distanceTo(pl.pos) > range) return false;
    this.w.evade(Math.sign(pl.pos.x - from.x) || 1);
    return true;
  }
}

// ------------------------------------------------------------------ flak hit, wing folds, flat spin, chutes
class FlakHit extends VictimPiece {
  readonly id = 'flakHit';
  private hulk: WreckPiece | null = null;
  private fold = new THREE.Vector3();
  private chuteAt: number[] = [];
  private chutes = 0;
  private endAt = 0;

  start(): boolean {
    if (!super.start()) return false;
    const n = [3, 4, 4, 5, 5, 6][Math.floor(Math.random() * 6)];
    for (let i = 0; i < n; i++) this.chuteAt.push(this.t0 + 5.6 + i * 1.25 + Math.random() * 0.5);
    this.endAt = this.chuteAt[n - 1] + 3.4;
    return true;
  }

  step() {
    if (!this.staged() || this.done) return;
    const w = this.w, b = this.b, s = this.side, T = this.t0;
    if (this.at(T)) {
      // the burst right under the near wing
      const p = b.localToWorld(_a.set(s * 6.5, -1.5, 1));
      w.effects.flak(p);
      w.effects.explosion(b.localToWorld(_b.set(s * 4.8, 0, 0.6)), b.vel, 0.45, 'small');
      sound.flakBurst(p);
      sound.play('explosion', p, { gain: 1.2, ref: 150, reverb: 0.6 });
      this.shake(p, 0.8);
      const z = b.zone(s > 0 ? 'engine1' : 'engine4');
      if (z) z.burning = true;
      w.callout('sp_flak_hit', 'Top Turret', 'Direct hit on the ship next to us! Her wing\'s folding up!', 0, 3);
    }
    if (this.at(T + 0.35) && b.alive) {
      b.localToWorld(this.fold.set(s * 4.6, 0, 0.4));
      const pieces = w.wrecks.breakBomber(b, 'wingFold', s);
      this.hulk = pieces[1];
      // she slides away from the box as she goes over (keeps her in the gun's view for longer)
      const pl = w.player;
      if (pl) this.hulk.vel.addScaledVector(_c.copy(b.pos).sub(pl.pos).setY(0).normalize(), 14);
      w.scriptedLoss(b, false);
      w.effects.explosion(this.fold, b.vel, 0.35, 'small');
      sound.play('crack', this.fold, { gain: 1, ref: 120 });
      this.debris(this.fold, 12);
      const hulk = this.hulk;
      this.sp.drama((out) => { if (hulk.life <= 0) return false; out.copy(hulk.root.position); return true; }, 3.2, tx('FLAK HIT'), tx('{name} is going down', { name: b.name }));
    }
    if (this.at(T + 1.6) && this.evade(this.fold)) w.callout('sp_debris', 'Pilot', 'Debris coming through! Hang on!', 0, 3);
    if (this.at(T + 3.6)) w.callout('sp_flak_spin', 'Pilot', 'She\'s rolling over… she\'s going into a flat spin. Get out, fellas — get out of there!', 0, 3);
    // the crew bail out of the spinning hulk; the radio counts them
    const n = this.chuteAt.length;
    if (this.chutes < n && this.t >= this.chuteAt[this.chutes]) {
      const h = this.hulk;
      if (h && h.life > 0) {
        this.w.effects.parachute(_a.copy(h.root.position).add(_b.set(R() * 3, -2.5, R() * 3)), _c.copy(h.vel).multiplyScalar(0.35));
        if (this.chutes === 0) w.callout('sp_chute1', 'Waist', 'Chute! I see a chute!', 0, 3);
        else if (this.chutes === n - 2) w.callout('sp_count', 'Tail', `I count ${COUNT_WORDS[n - 1]} chutes… ${COUNT_WORDS[n]}…`, 0, 3);
      }
      this.chutes++;
    }
    if (this.at(this.endAt - 3)) {
      if (n <= 4) w.callout('sp_chutes_end', 'Pilot', 'That\'s all. Ten men on that ship… God help the rest of them.', 0, 3);
      else w.callout('sp_chutes_end', 'Tail', 'That\'s all I see. Come on… come on… that\'s all of them.', 0, 3);
    }
    if (this.t >= this.endAt) this.done = true;
  }
}

// ------------------------------------------------------------------ mid-air collision
class Collision extends VictimPiece {
  readonly id = 'collision';
  private f: Fighter | null = null;
  private dur = 4.6;
  private contact = new THREE.Vector3();
  private S = new THREE.Vector3();         // path start, relative to the contact point
  private C = new THREE.Vector3();         // bezier control
  private last = new THREE.Vector3();
  private hit = -1;                        // t of the impact
  private relPos = new THREE.Vector3();
  private relQuat = new THREE.Quaternion();
  private smokeAcc = 0;
  private averted = false;

  step(dt: number) {
    if (!this.staged() || this.done) return;
    const w = this.w, b = this.b, T = this.t0;
    if (this.at(T)) {
      if (!b.alive) { this.done = true; return; }
      // contact at the near wing root; the Fw comes up from behind on the player's side, smoking
      this.contact.set(this.side * 3.6, 0.1, 0.4);
      const F = w.formationForward;
      const toPl = _a.copy(w.player!.pos).sub(b.pos).setY(0).normalize();
      this.S.copy(F).multiplyScalar(-330).addScaledVector(toPl, 70).addScaledVector(UP, 90);
      this.C.copy(F).multiplyScalar(-120).addScaledVector(toPl, 85).addScaledVector(UP, 25);
      const start = b.localToWorld(_b.copy(this.contact)).add(this.S);
      const f = w.spawnEnemy(start, 'stern', 1, false, false, 'fw190');
      w.clearPilot(f);
      // tough enough that the box's AI gunners don't settle it by chance (the player still can)
      for (const z of f.zones) { z.hp *= 3; z.maxHp *= 3; }
      f.structure = f.maxStructure *= 2;
      f.zone('engine')!.hp = f.zone('engine')!.maxHp * 0.6;    // visibly crippled: smoking from the cowling
      // drawn near true size against the B-17 (enemy fighters are normally drawn 6x for readability;
      // its hit zones stay large, so it is still easy to shoot down)
      f.model.scale.setScalar(NEAR_TRUE_SCALE);
      this.f = f;
      this.last.copy(start);
      w.callout('sp_ram_warn', 'Top Turret', 'That one-ninety\'s on fire — he\'s not pulling out! He\'s going to ram her!', 0, 3);
    }
    const f = this.f;
    if (!f) return;
    if (this.hit < 0) {
      if (!f.alive || f.remove) { this.avert(); return; }
      if (!b.alive) { this.release(); this.done = true; return; }
      const u = Math.min(1, (this.t - T) / this.dur), v = 1 - u;
      const cw = b.localToWorld(_a.copy(this.contact));
      f.root.position.copy(cw).addScaledVector(this.S, v * v).addScaledVector(this.C, 2 * v * u);
      if (dt > 0) {
        f.vel.copy(f.root.position).sub(this.last).divideScalar(dt);
        f.fm.vel.copy(f.vel);
        if (f.vel.lengthSq() > 1) {
          _q.setFromUnitVectors(Z, _b.copy(f.vel).normalize());
          f.root.quaternion.copy(_q).multiply(_q2.setFromAxisAngle(Z, 0.45 * Math.sin(this.t * 2.3) - 0.25));
        }
      }
      this.last.copy(f.root.position);
      this.smokeAcc += dt;
      if (this.smokeAcc > 0.05) { this.smokeAcc = 0; w.effects.trail(f.localToWorld(_b.set(0, 0, 1.2 * NEAR_TRUE_SCALE)), f.vel, 1, true, 0.9); }
      if (this.at(T + this.dur - 1.3)) {
        const vb = b;
        this.sp.drama((out) => { if (vb.remove) return false; out.copy(vb.pos); return true; }, 3.4, tx('MID-AIR COLLISION'), tx('{name} — a Fw 190 on a collision course', { name: b.name }));
      }
      // the nose strikes the wing root (the fighter's centre is ~4 m short of it)
      if (u >= 1 || f.root.position.distanceTo(cw) < 4 * NEAR_TRUE_SCALE) this.impact();
      return;
    }
    // locked together: the Fw 190 stays where it struck as the bomber spirals down
    const th = this.t - this.hit;
    if (!f.remove && !b.remove) {
      f.root.position.copy(b.localToWorld(_a.copy(this.relPos)));
      f.root.quaternion.copy(b.quat).multiply(this.relQuat);
      f.vel.copy(b.vel);
    }
    const cw = b.localToWorld(_a.copy(this.contact));
    if (this.at(this.hit + 0.4)) w.callout('sp_ram_hit', 'Top Turret', 'He hit her! Oh God, they\'re locked together!', 0, 3);
    if (this.at(this.hit + 1.2) && this.evade(cw, 240)) w.callout('sp_debris', 'Pilot', 'Debris coming through! Hang on!', 0, 3);
    if (this.at(this.hit + 4)) w.callout('sp_ram_down', 'Pilot', 'They\'re going down together… I don\'t see anybody getting out.', 0, 3);
    if (this.at(this.hit + 7.5) && !b.remove && Math.random() < 0.45) {
      w.effects.parachute(_b.copy(b.pos).add(_c.set(R() * 3, -3, R() * 3)), _d.copy(b.vel).multiplyScalar(0.4));
      w.callout('sp_ram_chute', 'Waist', 'One chute! One man got out!', 0, 3);
    }
    if (th > 12 || b.remove) this.done = true;
  }

  private impact() {
    const w = this.w, b = this.b, f = this.f!;
    this.hit = this.t;
    const cw = b.localToWorld(new THREE.Vector3().copy(this.contact));
    w.effects.explosion(cw, b.vel, 0.9, 'heavy');
    sound.play('explosion', cw, { gain: 1.7, ref: 200, reverb: 0.8 });
    this.shake(cw, 1);
    w.buffet(Math.max(0, 1 - cw.distanceTo(w.player!.pos) / 400));
    // the bomber: knocked out of the sky, slewing round into a spiral (her own wing fire, blasts)
    w.scriptedLoss(b, true);
    const s = this.side;
    b.vel.multiplyScalar(0.8);   // was flying with the box
    b.vel.y -= 4;
    b.spin.set(0.12, 0.28 * s, 0.5 * s);
    for (const z of b.zones) if (z.engine !== undefined && (s > 0 ? z.engine < 2 : z.engine > 1)) z.burning = true;
    startBomberDeath(b, w.effects, (pos, k) => this.shake(pos, k, 300));
    // the fighter: dead, embedded where it struck (no kill credit: nobody shot it down)
    f.alive = false; f.falling = true; f.fallTime = 0;
    this.relPos.copy(b.worldToLocal(_b.copy(f.root.position)));
    this.relQuat.copy(b.quat).invert().multiply(f.quat);
    this.debris(cw, 12);
  }

  // shot down before it struck: the collision never happens
  private avert() {
    if (this.averted) return;
    this.averted = true;
    const f = this.f!;
    if (f.alive) { f.alive = false; f.falling = true; }
    if (f.playerDamage >= f.damageTaken * 0.2 && f.playerDamage > 0) {
      this.w.callout('sp_ram_saved', 'Top Turret', 'Got him before he hit her! That was too close!', 0, 3);
      this.sp.c.reward(75, tx('Collision averted'));
      achievements.unlock('gotHimFirst'); // achievement hook (FeatWatch.ts)
    }
    this.done = true;
  }

  // the victim went down some other way first: the cripple just falls out of the sky
  private release() {
    const f = this.f;
    if (f && f.alive) { f.alive = false; f.falling = true; f.spin.set(R() * 0.5, R() * 0.3, 2); }
  }

  stop() { if (this.hit < 0) this.release(); }
}

// ------------------------------------------------------------------ bomb-bay explosion
class BombBay extends VictimPiece {
  readonly id = 'bombBay';
  private boom = -1;
  private chunk: WreckPiece | null = null;
  private fireAcc = 0;
  private pass = 2;            // s the wingtip takes to reach the gun position

  step(dt: number) {
    if (!this.staged() || this.done) return;
    const w = this.w, b = this.b, T = this.t0;
    if (this.boom < 0) {
      if (this.t >= T && !b.alive) { this.done = true; return; }
      if (this.at(T)) {
        const p = b.localToWorld(_a.set(0, -7, -1));
        w.effects.flak(p);
        sound.flakBurst(p);
        this.shake(p, 0.6);
      }
      if (this.t >= T) {
        // fire pouring out of the bomb bay
        this.fireAcc += dt;
        if (this.fireAcc > 0.05) {
          this.fireAcc = 0;
          w.effects.trail(b.localToWorld(_a.set(R() * 0.6, -1.1, -1.4 + R() * 1.2)), b.vel, 1, true, 1.7);
          if (Math.random() < 0.3) w.effects.sparks(_a, b.vel, true);
        }
      }
      if (this.at(T + 0.3)) w.callout('sp_bay_fire', 'Ball Turret', 'She\'s hit in the bomb bay — she\'s burning! She\'s going to blow!', 0, 3);
      if (this.at(T + 0.9)) {
        const vb = b;
        const last = new THREE.Vector3().copy(b.pos);
        this.sp.drama((out) => { if (!vb.remove) last.copy(vb.pos); out.copy(last); return true; }, 3.2, tx('BOMB BAY HIT'), tx('{name} — fire in the bomb bay', { name: b.name }));
      }
      if (this.t >= T + 2) this.explode();
      return;
    }
    const tb = this.t - this.boom;
    if (this.at(this.boom + Math.max(0.2, this.pass - 1))) w.callout('sp_bay_wing', 'Waist', 'Wing section coming past the window — look out!', 0, 3);
    if (this.chunk && this.at(this.boom + this.pass)) sound.play('whoosh', this.chunk.root.position, { gain: 1.5, ref: 40, delay: false });
    if (this.at(this.boom + 4.6)) w.callout('sp_bay_gone', 'Pilot', 'She\'s gone. The whole ship… just gone.', 0, 3);
    if (this.at(this.boom + 8.4)) w.callout('sp_bay_check', 'Pilot', 'Crew, check in! Is anybody hurt back there?', 0, 3);
    if (this.at(this.boom + 11.4)) w.callout('sp_bay_tail', 'Tail', 'Tail\'s okay. Just… shook up.', 0, 3);
    if (tb > 13) this.done = true;
  }

  private explode() {
    const w = this.w, b = this.b, pl = w.player!;
    this.boom = this.t;
    const center = b.pos.clone();
    const pieces = w.wrecks.breakBomber(b, 'blowup', this.side);
    w.scriptedLoss(b, false);
    w.effects.warshipBlast(center, b.vel, 1.2);
    w.effects.explosion(center, b.vel, 1.2, 'heavy');
    sound.play('explosion', center, { gain: 2.2, ref: 300, reverb: 0.9 });
    sound.play('explosionFar', center, { gain: 1.2, rate: 0.7, reverb: 0.9 });
    const d = center.distanceTo(pl.pos);
    const k = THREE.MathUtils.clamp(1 - d / 520, 0, 1);
    w.events.shake?.(1.6 * k);
    w.buffet(1.5 * k);
    this.sp.flash(0.6 * k);
    this.debris(center, 16);
    // the loose wingtip flutters past the gun position, ~16 m out from it
    const chunk = pieces[1];
    const gun = w.playerGunPos() ?? pl.pos.clone();
    this.pass = THREE.MathUtils.clamp(d / 65, 1.6, 2.6);
    const out = _a.copy(chunk.root.position).sub(gun).setY(0).normalize();
    const target = _b.copy(gun).addScaledVector(out, 16).addScaledVector(w.formationForward, -4).addScaledVector(pl.vel, this.pass);
    target.y -= 2;
    const g = 9.81 * 0.85;
    chunk.vel.copy(target).sub(chunk.root.position).divideScalar(this.pass);
    chunk.vel.y += 0.5 * g * this.pass;
    chunk.drag = 0;
    this.chunk = chunk;
  }
}

// ------------------------------------------------------------------ straggler (RandomEvents.ts)
class StragglerPiece extends SetPiece {
  readonly id = 'straggler';
  start(): boolean {
    const c = this.sp.c;
    if (c.event || !EVENTS.straggler.eligible(c)) return false;
    if (!c.startEvent('straggler')) return false;
    this.done = true;
    return true;
  }
  step() {}
}

// ------------------------------------------------------------------ little friends
class LittleFriends extends SetPiece {
  readonly id = 'littleFriends';
  private bandit: Fighter | null = null;
  private friends: Fighter[] = [];
  private aims: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3()];
  private last: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private dir = new THREE.Vector3();
  private readonly lead = 1.5;          // s of radio before the dive starts
  private readonly dur = 5;             // s for u 0 -> 1 (closest pass at u = 0.5)
  private killedAt = -1;

  start(): boolean {
    const w = this.w;
    const arc = w.playerArc();
    if (!arc || !w.playerGunPos()) return false;
    this.dir.copy(arc).setY(THREE.MathUtils.clamp(arc.y, -0.3, 0.3)).normalize();
    const p = this.path(-0.3, 0, 0, _a);
    this.bandit = w.spawnEnemy(p.clone(), 'stern', 1, false, false, 'bf109');
    w.clearPilot(this.bandit);
    this.bandit.model.scale.setScalar(NEAR_TRUE_SCALE);   // near true size beside the Mustangs (hit zones stay large)
    for (let i = 0; i < 2; i++) {
      const f = w.spawnEscort(this.path(-0.3 - LF_LAG * (i + 1), 0, 0, _b).clone(), new THREE.Vector3(0, 300, 0));
      w.clearPilot(f);
      for (const g of f.guns) g.damage *= 0.15;   // tracers for show: the kill comes just past the window
      f.gunAim = this.aims[i];
      this.friends.push(f);
    }
    this.place(0);
    w.callout('sp_lf_lead', 'Lead', 'Big friends, hold your fire — Mustangs coming through!', 0, 3);
    return true;
  }

  // the dive: from high astern to low ahead, passing D m out from the gun at u = 0.5
  private path(u: number, lateral: number, up: number, out: THREE.Vector3) {
    const w = this.w, D = 60;
    const g = this.sp.gunPos(_g) ?? w.formationCenter;
    const e = 2 * u - 1;
    return out.copy(g).addScaledVector(this.dir, D * (1 + 0.6 * e * e) + lateral)
      .addScaledVector(w.formationForward, -300 + 600 * u).addScaledVector(UP, 150 - 300 * u + up);
  }

  private fly(f: Fighter, i: number, u: number, lateral: number, up: number, roll: number, dt: number) {
    this.path(u, lateral, up, f.root.position);
    if (dt > 0) {
      f.vel.copy(f.root.position).sub(this.last[i]).divideScalar(dt);
      f.fm.vel.copy(f.vel);
      f.fm.throttle = 1;
      _q.setFromUnitVectors(Z, _a.copy(f.vel).normalize());
      f.root.quaternion.copy(_q).multiply(_q2.setFromAxisAngle(Z, roll));
    }
    this.last[i].copy(f.root.position);
  }

  private place(dt: number) {
    const u = (this.t - this.lead) / this.dur;
    const e = this.bandit;
    if (e && e.alive && !e.remove) this.fly(e, 0, u, 0, 0, 0.7 * Math.sin(this.t * 3.1), dt);
    for (let i = 0; i < this.friends.length; i++) {
      const f = this.friends[i];
      if (!f.alive || f.remove) continue;
      const ui = u - LF_LAG * (i + 1);
      this.fly(f, i + 1, ui, i === 0 ? -9 : 10, 5, 0.4 * Math.sin(this.t * 2.6 + i), dt);
      // guns on the 109 through the middle of the pass
      f.trigger = !!e && e.alive && ui > 0.2 && ui < 0.75 && Math.sin(this.t * 7 + i * 2) > -0.2;
      if (e) this.aims[i].copy(e.pos).sub(f.pos).normalize();
    }
  }

  step(dt: number) {
    const w = this.w, e = this.bandit;
    this.place(dt);
    const u = (this.t - this.lead) / this.dur;
    if (this.at(this.lead + 0.3 * this.dur) && e) {
      const last = new THREE.Vector3().copy(e.pos);
      this.sp.drama((out) => { if (!e.remove) last.copy(e.pos); out.copy(last); return true; }, 2.6, tx('LITTLE FRIENDS'), tx('P-51s on a Bf 109'));
    }
    if (this.at(this.lead + 0.5 * this.dur)) w.callout('sp_lf_pass', 'Waist', 'Little friends! Right past the window — they\'re all over him!', 0, 3);
    // they get him just past the window (or somebody else did first)
    if (e && this.killedAt < 0) {
      if (e.alive && u >= 0.62) w.killAircraft(e, false, 'engine');
      if (!e.alive) this.killedAt = this.t;
    }
    if (this.killedAt > 0 && this.at(this.killedAt + 1.4)) w.callout('sp_lf_kill', 'Pilot', 'They got him! God bless those little friends!', 0, 3);
    // the Mustangs dive on out of sight
    if (u > 2.2) { this.stop(); this.done = true; }
  }

  stop() {
    for (const f of this.friends) { f.trigger = false; f.gunAim = null; if (f.alive) f.remove = true; }
    const e = this.bandit;
    if (e && e.alive) e.remove = true;
    this.friends = [];
    this.bandit = null;
  }
}

const MAKE: Record<SetPieceId, (sp: SetPieces) => SetPiece> = {
  flakHit: (sp) => new FlakHit(sp),
  collision: (sp) => new Collision(sp),
  bombBay: (sp) => new BombBay(sp),
  straggler: (sp) => new StragglerPiece(sp),
  littleFriends: (sp) => new LittleFriends(sp),
};

// ------------------------------------------------------------------ scheduler
export class SetPieces {
  active: SetPiece | null = null;
  log: string[] = [];
  private count = 0;
  private lastAt = -1e9;          // world time the last one started
  private endedAt = -1e9;
  private gap = SP_GAP[0];
  private check = 0;              // s to the next gate check (the gate allocates: once a second)
  private recent: SetPieceId[] = [];

  constructor(readonly c: MidRound) {}

  get world() { return this.c.world; }
  /** an objective or random event must wait (a set piece is on, or just ended) */
  get busy() { return !!this.active || this.world.time - this.endedAt < BUSY_AFTER; }

  reset() {
    this.stop();
    this.count = 0; this.lastAt = -1e9; this.endedAt = -1e9; this.check = 0;
    this.gap = SP_GAP[0] + Math.random() * (SP_GAP[1] - SP_GAP[0]);
    this.recent = [];
    this.log = [];
  }

  stop() {
    if (!this.active) return;
    this.log.push(`${this.world.time.toFixed(0)}s set piece ${this.active.id} stopped`);
    this.active.stop();
    this.active = null;
  }

  // MidRound.update, every frame of a live mission (boss: a boss fight is on; eventOn: a random event is)
  update(dt: number, boss: boolean, eventOn: boolean) {
    const w = this.world;
    const a = this.active;
    if (a) {
      a.tick(dt);
      this.c.game.pacing.hushUntil = w.time + 1;   // hold the next fighter group back while it plays
      if (a.done) this.finish(a);
      return;
    }
    this.check -= dt;
    if (this.check > 0) return;
    this.check = 1;
    const signature = this.c.game.mission?.signature;
    if (signature) {
      if (!this.count && w.time >= signature.at && !boss && !eventOn && !this.c.objective) this.begin(signature.id);
      return;
    }
    if (!setPieceDue(this.gate(boss, eventOn))) return;
    const id = this.pick();
    if (id) this.begin(id);
  }

  private gate(boss: boolean, busy: boolean): SpGate {
    const w = this.world, c = this.c, pl = w.player;
    let near = 0;
    if (pl) for (const f of w.activeEnemies()) if (f.pos.distanceTo(pl.pos) < 1200) near++;
    const m = c.game.mission;
    return {
      role: c.role, boss, busy, phase: m?.round ? c.game.pacing.phase : 'none',
      missionT: w.time, roundT: c.roundT, roundLeft: c.roundLeft, sinceLast: w.time - this.lastAt, gap: this.gap, count: this.count, near,
    };
  }

  private pick(): SetPieceId | null {
    const w = this.world;
    const others = this.c.aliveBombers().filter((b) => !b.straggling).length;
    const lossOk = w.stats.scriptedLost < SP_MAX_LOSSES && others >= 5;
    let ids = SET_PIECES.filter((id) => (LOSS_PIECES.includes(id) ? lossOk : true));
    ids = ids.filter((id) => id !== 'straggler' || (!this.c.event && EVENTS.straggler.eligible(this.c)));
    const fresh = ids.filter((id) => !this.recent.includes(id));
    const pool = fresh.length ? fresh : ids;
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  begin(id: SetPieceId): boolean {
    const p = MAKE[id](this);
    if (!p.start()) { this.log.push(`${this.world.time.toFixed(0)}s set piece ${id} could not stage`); return false; }
    this.count++;
    this.lastAt = this.world.time;
    this.gap = SP_GAP[0] + Math.random() * (SP_GAP[1] - SP_GAP[0]);
    this.recent.push(id);
    if (this.recent.length > 3) this.recent.shift();
    this.log.push(`${this.world.time.toFixed(0)}s set piece ${id}`);
    if (!p.done) this.active = p; else this.endedAt = this.world.time;
    return true;
  }

  private finish(p: SetPiece) {
    p.stop();
    this.active = null;
    this.endedAt = this.world.time;
    this.log.push(`${this.world.time.toFixed(0)}s set piece ${p.id} done`);
  }

  // ---------------- shared toolbox ----------------

  /** Short drama shot through the kill cam (Cinematics.drama decides whether it may run). */
  drama(focus: (out: THREE.Vector3) => boolean, dur: number, title: string, sub: string): boolean {
    return this.c.dramaCam(focus, dur, title, sub);
  }

  flash(k: number) { if (k > 0.02) this.c.game.feel.blastFlash(k); }

  /** The player's gun position (World.playerGunPos without the allocation), null off the B-17 */
  gunPos(out: THREE.Vector3): THREE.Vector3 | null {
    const w = this.world, b = w.playerBomber, st = w.playerStation;
    if (!b || !b.alive || !st || w.player !== b) return null;
    return b.localToWorld(st.pivot, out);
  }

  /** The victim for a set piece: the B-17 best placed in the player's gun view, or one staged
   *  into a free spot there (slot = where it should slide to). null: no suitable ship. */
  stage(): { b: Bomber; slot: THREE.Vector3 | null } | null {
    const w = this.world, pb = w.playerBomber;
    const arc = w.playerArc(), gun = w.playerGunPos();
    if (!pb || !arc || !gun) return null;
    const dir = arc.setY(THREE.MathUtils.clamp(arc.y, -0.35, 0.35)).normalize();
    const marked = this.c.markedAircraft();
    const cands = this.c.aliveBombers().filter((b) => !b.straggling && !b.scripted && !marked.includes(b));
    if (cands.length < 3) return null;
    // already in view: within ~28 degrees of the gun's look, 70-320 m out
    let best: Bomber | null = null, bestCos = Math.cos(THREE.MathUtils.degToRad(28));
    for (const b of cands) {
      _a.copy(b.pos).sub(gun);
      const d = _a.length();
      if (d < 70 || d > 320) continue;
      const cos = _a.divideScalar(d).dot(dir);
      if (cos > bestCos) { bestCos = cos; best = b; }
    }
    if (best) return { b: best, slot: null };
    // a free spot in the gun's view (formation slots are world-axis offsets from the box centre)
    const F = w.formationForward;
    for (const dist of [120, 145, 170]) {
      for (const fwd of [0, 30, -30]) {
        for (const up of [0, 14, -14]) {
          const spot = _b.copy(pb.slot).addScaledVector(dir, dist).addScaledVector(F, fwd).addScaledVector(UP, up);
          if (w.bombers().some((o) => o !== pb && o.alive && o.slot.distanceTo(spot) < 55)) continue;
          // the nearest ship that can slide over without passing close to the player's own
          let pick: Bomber | null = null, pd = Infinity;
          for (const b of cands) {
            const d = b.slot.distanceTo(spot);
            if (d < pd && segmentClear(b.slot, spot, pb.slot, 60)) { pd = d; pick = b; }
          }
          if (pick) return { b: pick, slot: spot.clone() };
        }
      }
    }
    return null;
  }

  // ---------------- dev ----------------
  dev(id: SetPieceId): string {
    if (!MAKE[id]) return `unknown set piece ${id}; try ${SET_PIECES.join(', ')}`;
    if (this.active) { this.active.stop(); this.active = null; }
    return this.begin(id) ? `set piece ${id} started` : `set piece ${id} not available now`;
  }
}

// the segment a -> b stays at least r from p
function segmentClear(a: THREE.Vector3, b: THREE.Vector3, p: THREE.Vector3, r: number) {
  _c.copy(b).sub(a);
  const L2 = _c.lengthSq();
  const s = L2 > 0 ? THREE.MathUtils.clamp(_d.copy(p).sub(a).dot(_c) / L2, 0, 1) : 0;
  return _d.copy(a).addScaledVector(_c, s).distanceTo(p) >= r;
}

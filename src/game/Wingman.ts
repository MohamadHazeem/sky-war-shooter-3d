import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { World } from '../world/World';
import { Bomber, type Aircraft, type Fighter } from '../world/Aircraft';
import { EscortPilot, leadPoint, steerTo, type WorldView } from '../world/AI';
import type { FlightParams } from '../world/FlightModel';
import type { UI } from '../ui/UI';
import type { PilotController } from './PilotController';
import { tx, isAr, CANVAS_MONO } from '../i18n';

// "Blue Two": the player's wingman in every P-51 mission, a friendly Mustang flown by AI that
// takes orders from his leader (the player):
//   1  Attack my target     the padlocked bandit, else the one nearest the nose
//   2  Cover me             goes for whoever is on (or turning onto) the leader's six
//   3  Protect the bombers  goes for fighters attacking the Fortresses (raid missions: the
//                           enemy bombers themselves — RaidDefence hands him the list)
//   4  Form up              back on the leader's right wing
// Keys 1-4 (remappable pilot actions in KeyMap), gamepad D-pad, touch buttons (DeviceControls).
// He acknowledges on the radio, shows his order, health and kills on the HUD (drawOverlay)
// and can be shot down; a replacement joins at the start of the next round.
//
// PilotOps owns one: start() at mission start, update() every frame, onRound() between rounds.

export type WingCmd = 'attack' | 'cover' | 'bombers' | 'form';
export const WING_KEYS: Record<string, WingCmd> = { Digit1: 'attack', Digit2: 'cover', Digit3: 'bombers', Digit4: 'form' };
export const WING_LABEL: Record<WingCmd, string> = { attack: 'ATTACK MY TARGET', cover: 'COVER ME', bombers: 'PROTECT THE BOMBERS', form: 'FORM UP' };

// Radio lines (tools/voice/lines.json, speaker "Blue Two")
export const WING_RADIO = {
  attack: 'Blue Two, engaging your target!',
  noTarget: 'Blue Two — no target in front of you, staying on your wing.',
  cover: 'Blue Two, covering your six!',
  bombers: 'Blue Two, going to the bombers!',
  raid: 'Blue Two, going after the bombers!',
  form: 'Blue Two, forming up on your wing.',
  six: 'Bandit on your tail — Blue Two is on him!',
  splash: 'Blue Two — splash one!',
  hit: 'Blue Two, I\'m hit! I\'m going down!',
  join: 'Blue Two, replacement aircraft joining on your wing.',
} as const;

const SLOT = new THREE.Vector3(-45, 6, -40);  // leader frame: right wing (x is left), a little high, behind
const COVER_SLOT = new THREE.Vector3(-120, 90, -260);
const MUZZLE = 880;
const FIRE_RANGE = 520;
const CATCH_UP = 1.45;        // x engine power while he is well behind his slot
const GUN_DAMAGE = 0.55;      // x the Mustang's gun damage: he helps, the player still does most of the killing

const _d = new THREE.Vector3();
const _t = new THREE.Vector3();
const _p = new THREE.Vector3();
const _f = new THREE.Vector3();

interface Spot { pos: THREE.Vector3; alive: boolean }

// ---------- target choice (pure, unit-tested) ----------

// The padlocked bandit, else the one nearest the leader's nose (angle first, then range) within 35 deg / 3 km
export function pickAttackTarget<T extends Spot>(leadPos: THREE.Vector3, leadFwd: THREE.Vector3, enemies: readonly T[], padlock: T | null): T | null {
  if (padlock && padlock.alive && padlock.pos.distanceTo(leadPos) < 4000) return padlock;
  let best: T | null = null, bs = Infinity;
  for (const e of enemies) {
    if (!e.alive) continue;
    const to = _d.copy(e.pos).sub(leadPos);
    const d = to.length();
    if (d > 3000 || d < 1) continue;
    const ang = THREE.MathUtils.radToDeg(to.divideScalar(d).angleTo(leadFwd));
    if (ang > 35) continue;
    const s = ang + d / 120;
    if (s < bs) { bs = s; best = e; }
  }
  return best;
}

// Whoever is on the leader's six: behind him within 1.6 km, or (hunting) fighting him within 1.2 km.
// Nearest to the leader wins.
export function pickCoverTarget<T extends Spot>(leadPos: THREE.Vector3, leadFwd: THREE.Vector3, enemies: readonly T[], hunting: (e: T) => boolean = () => false): T | null {
  let best: T | null = null, bd = Infinity;
  for (const e of enemies) {
    if (!e.alive) continue;
    const to = _d.copy(e.pos).sub(leadPos);
    const d = to.length();
    if (d < 1) continue;
    const behind = to.divideScalar(d).dot(leadFwd) < -0.25 && d < 1600;
    if (!behind && !(hunting(e) && d < 1200)) continue;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// Bomber defence: the attacker nearest to the bomber it is going for (attacking(e) = its bomber)
export function pickBomberTarget<T extends Spot>(enemies: readonly T[], attacking: (e: T) => Spot | null): T | null {
  let best: T | null = null, bd = Infinity;
  for (const e of enemies) {
    if (!e.alive) continue;
    const b = attacking(e);
    if (!b || !b.alive) continue;
    const d = e.pos.distanceTo(b.pos);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// ---------- the AI pilot ----------

// Flies Blue Two. An EscortPilot (so World runs it like any escort) with its own orders.
export class WingmanPilot extends EscortPilot {
  cmd: WingCmd = 'cover';
  lead: Fighter | null = null;
  ordered: Fighter | null = null;      // attack: the bandit he was told to get
  raidTargets: (() => Fighter[]) | null = null;
  reason = '';                         // why he picked his current target (log / tests)
  private scanT = 0;
  private aimAt = new THREE.Vector3();
  private breakT = 0;

  private baseP: FlightParams;
  private catchP: FlightParams;

  constructor(me: Fighter, private world: World) {
    super(me, SLOT.clone());
    // catching up with the leader (who flies near full power): a hidden power reserve
    this.baseP = me.fm.p;
    this.catchP = { ...me.fm.p, power: me.fm.p.power * CATCH_UP };
  }

  // A new order: retarget at once
  order(cmd: WingCmd, ordered: Fighter | null = null) {
    this.cmd = cmd;
    this.ordered = ordered;
    this.target = cmd === 'attack' ? ordered : null;
    this.scanT = 0;
    this.reason = cmd === 'attack' ? (ordered ? `ordered: ${ordered.label}` : 'no target') : '';
  }

  private axis(): Fighter[] { return this.world.fighters('axis').filter((f) => f.alive); }

  // Who is hunting the leader / attacking a bomber (EnemyPilot state)
  private huntingLead = (e: Fighter) => {
    const p = this.world.enemyPilot(e);
    return !!p && p.target === this.lead && (p.state === 'dogfight' || p.state === 'attack');
  };
  private bomberOf = (e: Fighter): Aircraft | null => {
    const p = this.world.enemyPilot(e);
    if (!p || !(p.target instanceof Bomber)) return null;
    return p.state === 'approach' || p.state === 'attack' || p.state === 'duel' ? p.target : null;
  };

  // Re-evaluate the target for the current order (every 0.5 s, or when it died)
  private choose() {
    const me = this.me, lead = this.lead;
    const enemies = this.axis();
    // self-defence: a bandit fighting him at close quarters comes first in every order but
    // 'attack' (and in 'cover', only when nothing is on the leader's six)
    const selfDefence = () => {
      if (this.cmd === 'attack') return false;
      for (const e of enemies) {
        const p = this.world.enemyPilot(e);
        if (p && p.target === me && p.state === 'dogfight' && e.pos.distanceTo(me.pos) < 600) { this.target = e; this.reason = `self-defence: ${e.label}`; return true; }
      }
      return false;
    };
    if (this.cmd !== 'cover' && selfDefence()) return;
    switch (this.cmd) {
      case 'attack':
        if (this.ordered?.alive) { this.target = this.ordered; return; }
        this.target = null;
        return;
      case 'cover': {
        if (!lead) { this.target = null; return; }
        const t = pickCoverTarget(lead.pos, lead.forward(_f), enemies, this.huntingLead);
        if (!t && selfDefence()) return;
        this.target = t; this.reason = t ? `on lead's six: ${t.label}` : '';
        return;
      }
      case 'bombers': {
        const raid = this.raidTargets?.();
        if (raid) {
          // raid missions: the inbound enemy bomber nearest to him
          let best: Fighter | null = null, bd = Infinity;
          for (const e of raid) { if (!e.alive) continue; const d = e.pos.distanceTo(me.pos); if (d < bd) { bd = d; best = e; } }
          this.target = best; this.reason = best ? `raid bomber: ${best.label}` : '';
          return;
        }
        const t = pickBomberTarget(enemies, this.bomberOf);
        this.target = t; this.reason = t ? `attacking bombers: ${t.label}` : '';
        return;
      }
      case 'form':
        this.target = null; this.reason = '';
        return;
    }
  }

  update(dt: number, w: WorldView) {
    const me = this.me, fm = me.fm;
    me.trigger = false;
    if (!me.alive) return;
    this.timer += dt;
    this.scanT -= dt;
    const lead = this.lead && this.lead.alive ? this.lead : null;
    if (this.target && !this.target.alive) {
      this.target = null;
      this.scanT = 0;
    }
    if (this.scanT <= 0) { this.scanT = 0.5; if (!(this.cmd === 'attack' && this.target)) this.choose(); }
    this.breakT -= dt;
    const t = this.target;
    fm.p = this.baseP;
    if (t && this.breakT <= 0) {
      leadPoint(me.pos, me.vel, t, MUZZLE, this.aimAt);
      const dir = _d.copy(this.aimAt).sub(me.pos);
      const dist = dir.length();
      const err = steerTo(fm, dir, 1.2, 1);
      fm.throttle = 1.05;
      // hold fire with the leader in the line of fire
      let clear = true;
      if (lead) {
        const toL = _t.copy(lead.pos).sub(me.pos);
        const dl = toL.length();
        if (dl < dist + 50 && toL.divideScalar(Math.max(dl, 1)).dot(me.forward(_f)) > 0.985) clear = false;
      }
      if (dist < FIRE_RANGE && err < 0.035 && clear) me.trigger = true;
      // don't ram him: overshoot high and come round again
      if (dist < 90) this.breakT = 1.4;
    } else if (t) {
      steerTo(fm, _d.copy(me.forward(_f)).add(_t.set(0, 0.6, 0)), 1.2, 1);
      fm.throttle = 1;
    } else if (lead) {
      // on the leader's wing (form) or a little behind and above him (cover / bombers / attack done)
      const slot = this.cmd === 'cover' ? COVER_SLOT : SLOT;
      const want = lead.localToWorld(_p.copy(slot), _p);
      const off = _t.copy(want).sub(me.pos);
      const d = off.length();
      fm.p = d > 120 && off.dot(me.forward(_f)) > 0 ? this.catchP : this.baseP;
      // desired velocity: the leader's plus a closing term (capped)
      const v = _d.copy(lead.vel).addScaledVector(off, d > 600 ? 0.25 : 0.6);
      if (v.length() > 230) v.setLength(230);
      if (v.lengthSq() < 1) v.copy(lead.forward(_f));
      steerTo(fm, v, d > 400 ? 1.1 : 0.8, d > 400 ? 1 : 0.6);
      const ahead = off.dot(lead.forward(_f));
      fm.throttle = THREE.MathUtils.clamp(lead.fm.throttle + ahead * 0.012 + (v.length() - fm.speed) * 0.03, 0.25, 1.1);
    } else {
      // no leader (he went down): orbit over the formation
      const p = _p.copy(w.formationCenter).add(_t.set(0, 500, 0));
      const dir = _d.copy(p).sub(me.pos);
      if (dir.length() < 600) dir.copy(w.formationForward).multiplyScalar(600).add(dir);
      steerTo(fm, dir, 0.8, 0.5);
      fm.throttle = 0.75;
    }
    if (me.pos.y < 4200) steerTo(fm, _d.copy(me.forward(_f)).setY(0).normalize().add(_t.set(0, 0.8, 0)), 1.2, 1);
  }
}

// ---------- the flight lead's side: orders, radio, HUD, replacement ----------

export class Wingman {
  plane: Fighter | null = null;
  pilot: WingmanPilot | null = null;
  cmd: WingCmd = 'cover';
  kills = 0;
  lost = 0;                        // shot down this mission
  active = false;
  log: string[] = [];              // order / target log (dev, playtests)
  raidTargets: (() => Fighter[]) | null = null;
  // Blue Two when the player leads the flight (raid missions); in escort missions the player is
  // Lead's Blue Two, so the wingman flies as Blue Four (PilotOps sets this before start)
  callsign: 'Blue Two' | 'Blue Four' = 'Blue Two';
  private line(text: string) { return text.replace(/Blue Two/g, this.callsign); }
  private watched = new Set<Fighter>();
  private lastReason = '';
  private flash = 0;               // HUD highlight after an order
  private downCalled = false;

  constructor(private world: World, private ui: UI, private input: Input | null = null, private lead: PilotController | null = null) {}

  start(active: boolean) {
    this.active = active;
    this.plane = this.pilot = null;
    this.kills = 0; this.lost = 0;
    this.cmd = 'cover';
    this.watched.clear();
    this.log = [];
    this.lastReason = '';
    this.downCalled = false;
    if (active) this.spawn(false);
  }

  get alive() { return !!this.plane?.alive; }

  // Blue Two joins on the leader's right wing
  spawn(replacement: boolean) {
    const w = this.world, pf = w.playerFighter;
    if (!pf) return;
    const pos = pf.localToWorld(replacement ? new THREE.Vector3(-300, 120, -700) : SLOT.clone());
    const f = w.spawnEscort(pos, SLOT.clone());
    f.root.quaternion.copy(pf.quat);
    f.fm.vel.copy(pf.fm.vel.lengthSq() > 100 ? pf.fm.vel : pf.forward(_f).multiplyScalar(140));
    f.vel.copy(f.fm.vel);
    for (const g of f.guns) { g.damage = 14 * GUN_DAMAGE; g.tracerEvery = 3; }
    for (const z of f.zones) { z.hp *= 1.5; z.maxHp *= 1.5; }
    f.label = this.callsign;
    const p = new WingmanPilot(f, w);
    p.lead = pf;
    p.raidTargets = this.raidTargets;
    p.order(this.cmd === 'attack' ? 'cover' : this.cmd);
    this.cmd = p.cmd;
    w.setPilot(f, p);
    this.plane = f; this.pilot = p;
    this.downCalled = false;
    if (replacement) w.callout('wing_join', this.callsign, this.line(WING_RADIO.join), 0, 3);
  }

  // Between rounds: a replacement for a lost wingman
  onRound() {
    if (!this.active) return;
    if (!this.plane || !this.plane.alive || this.plane.remove) this.spawn(true);
  }

  // Give an order (keys, pad, touch, tests). Returns the target chosen for 'attack'.
  command(cmd: WingCmd): Fighter | null {
    const p = this.pilot, f = this.plane, w = this.world;
    if (!this.active || !p || !f?.alive) return null;
    this.flash = 1.6;
    let target: Fighter | null = null;
    if (cmd === 'attack') {
      const pf = w.playerFighter;
      if (pf) target = pickAttackTarget(pf.pos, pf.forward(_f), w.fighters('axis'), this.lead?.padlock ?? null);
      if (!target) {
        this.note('attack: no target in front');
        w.callout('wing_none', this.callsign, this.line(WING_RADIO.noTarget), 0, 3);
        return null;
      }
    }
    this.cmd = cmd;
    p.order(cmd, target);
    p.raidTargets = this.raidTargets;
    const text = cmd === 'attack' ? WING_RADIO.attack : cmd === 'cover' ? WING_RADIO.cover : cmd === 'form' ? WING_RADIO.form : this.raidTargets ? WING_RADIO.raid : WING_RADIO.bombers;
    w.callout('wing_' + cmd, this.callsign, this.line(text), 0, 3);
    this.note(`order ${cmd}${target ? ` -> ${target.label} @${Math.round(target.pos.distanceTo(f.pos))}m` : ''}`);
    return target;
  }

  private note(s: string) {
    this.log.push(`${this.world.time.toFixed(1)}s ${s}`);
    if (this.log.length > 80) this.log.shift();
  }

  update(dt: number) {
    if (!this.active) return;
    const w = this.world;
    const inp = this.input;
    this.flash = Math.max(0, this.flash - dt);
    if (inp && w.playerFighter?.alive) {
      for (const code in WING_KEYS) if (inp.hit(code)) this.command(WING_KEYS[code]);
    }
    const f = this.plane, p = this.pilot;
    if (!f || !p) return;
    if (p.lead !== w.playerFighter) p.lead = w.playerFighter;
    // an attack order is done once the bandit is down: back to covering the leader
    if (p.cmd === 'attack' && !(p.ordered?.alive)) { p.order('cover'); this.cmd = 'cover'; }
    if (p.reason && p.reason !== this.lastReason) {
      this.lastReason = p.reason;
      this.note(`target (${p.cmd}) ${p.reason}`);
      if (p.cmd === 'cover' && p.reason.startsWith('on lead')) w.callout('wing_six', this.callsign, this.line(WING_RADIO.six), 20, 2);
    }
    // his kills: an axis fighter going down with Blue Two the last to hit it
    for (const e of w.fighters('axis')) if (e.alive) this.watched.add(e);
    for (const e of this.watched) {
      if (e.alive && !e.remove) continue;
      this.watched.delete(e);
      if (!e.alive && e.lastAttacker === f) {
        this.kills++;
        this.note(`kill ${e.label}`);
        w.callout('wing_splash', this.callsign, this.line(WING_RADIO.splash), 12, 2);
      }
    }
    if (!f.alive && !this.downCalled) {
      this.downCalled = true;
      this.lost++;
      this.note('shot down');
      w.callout('wing_hit', this.callsign, this.line(WING_RADIO.hit), 0, 3);
      this.ui.feed(this.line('Blue Two is down — a replacement joins next round'), 'loss');
    }
  }

  // HUD: a small panel under the radar (order, health, kills) and a "2" tag on him
  drawOverlay(ctx: CanvasRenderingContext2D, W: number, H: number, cam: THREE.Camera) {
    if (!this.active) return;
    const f = this.plane;
    ctx.save();
    // Arabic: the Arabic canvas font a size up, the panel widened to fit and its contents
    // right-aligned (the bar on the right, read first); English is drawn exactly as before
    const rtl = isAr();
    ctx.font = rtl ? `600 12px ${CANVAS_MONO}` : '600 11px "IBM Plex Mono", monospace';
    const x = 16, y = H * 0.5 + 40;
    const alive = !!f?.alive;
    const hp = alive ? Math.round(f!.integrity * 100) : 0;
    const head = `${tx(this.callsign).toUpperCase()} · ${tx(alive ? WING_LABEL[this.cmd] : 'DOWN')}`;
    const keys = tx('1 ATK  2 COVER  3 BOMBERS  4 FORM');
    const sub = alive ? tx(`${hp}%  ·  ${this.kills} kill${this.kills === 1 ? '' : 's'}`) : tx(`replacement next round · ${this.kills} kills`);
    const pw = rtl ? Math.max(210, 12 + Math.max(ctx.measureText(head).width, ctx.measureText(keys).width, ctx.measureText(sub).width + (alive ? 98 : 0))) : 210;
    const xr = x - 6 + pw - 6;   // right edge of the text (Arabic)
    ctx.fillStyle = 'rgba(10,12,8,0.45)';
    ctx.fillRect(x - 6, y - 14, pw, rtl ? 50 : 46);
    ctx.textAlign = rtl ? 'right' : 'left';
    const tx0 = rtl ? xr : x;
    ctx.fillStyle = this.flash > 0 ? `rgba(255,230,140,${0.6 + 0.4 * Math.sin(this.flash * 12)})` : 'rgba(233,226,207,0.92)';
    ctx.fillText(head, tx0, y);
    if (alive) {
      // health bar
      const bx = rtl ? xr - 90 : x;
      ctx.fillStyle = 'rgba(233,226,207,0.25)';
      ctx.fillRect(bx, y + 8, 90, 5);
      ctx.fillStyle = hp > 60 ? 'rgba(140,220,120,0.9)' : hp > 30 ? 'rgba(240,200,90,0.9)' : 'rgba(240,90,70,0.95)';
      ctx.fillRect(rtl ? xr - 90 * hp / 100 : x, y + 8, 90 * hp / 100, 5);
      ctx.fillStyle = 'rgba(233,226,207,0.85)';
      ctx.fillText(sub, rtl ? xr - 98 : x + 98, y + 14);
    } else {
      ctx.fillStyle = 'rgba(240,120,90,0.9)';
      ctx.fillText(sub, tx0, y + 14);
    }
    ctx.fillStyle = 'rgba(233,226,207,0.5)';
    ctx.fillText(keys, tx0, y + (rtl ? 29 : 27));
    // tag on the aircraft
    if (alive) {
      const s = _p.copy(f!.pos).project(cam);
      if (s.z < 1 && Math.abs(s.x) < 1 && Math.abs(s.y) < 1) {
        const sx = (s.x * 0.5 + 0.5) * W, sy = (-s.y * 0.5 + 0.5) * H;
        ctx.strokeStyle = 'rgba(120,200,255,0.85)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(120,200,255,0.95)'; ctx.textAlign = 'center';
        ctx.fillText(this.callsign === 'Blue Two' ? '2' : '4', sx, sy + 4);
      }
    }
    ctx.restore();
  }
}

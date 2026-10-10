import * as THREE from 'three';
import type { World } from '../world/World';
import { Bomber, Fighter } from '../world/Aircraft';
import type { AttackType } from '../world/AI';
import { DogfightAI, type BfmCall } from '../world/DogfightAI';
import { ENEMY_VARIANTS } from '../world/EnemyTypes';
import type { UI } from '../ui/UI';
import type { Mission } from './Missions';
import type { Incoming } from '../ui/Radar';
import { PILOT_ROUNDS, type PilotFrom, type PilotGroup, type PilotRound } from './PilotRounds';
import { RearGunners } from './RearGunners';
import { Wingman } from './Wingman';
import { RaidDefence } from './RaidDefence';
import { StrafeOps } from './StrafeOps';
import type { Input } from '../core/Input';
import type { PilotController } from './PilotController';
import { tx, isAr, CANVAS_MONO } from '../i18n';

// P-51 missions director layer.
//  * Campaign pilot missions with a PILOT_ROUNDS entry (m4, m7) are flown as scripted rounds:
//    intercept waves heading for the bombers, fighter sweeps hunting the Mustang, and a
//    "save the straggler" round. PilotOps spawns the groups, tells each pilot what to go for,
//    shows the next group on the radar and says when the round is over (Game.endRound).
//  * Every pilot mission (survival too) scores protecting the bombers: kills on fighters that
//    were going for a Fortress, a bonus per bomber still flying at each round's end, and a big
//    one for bringing a straggler through. It also runs the heavies' rear gunners and turns
//    the dogfight AI's manoeuvres into radio calls.
//
// Game calls: start(mission) at mission start, direct(...) every frame of the mission,
// objective() for the HUD line and drawOverlay(...) on the 2D overlay.
//  * Every pilot mission also flies Blue Two, the player's wingman (Wingman.ts), and the
//    role-reversal Special operations ("Defend the Field", "Night Fighter") are run by
//    RaidDefence.ts in place of the scripted escort rounds (their fail state: OpsResult.fail).
//  * The ground-attack Special operation "Train Busting" (low level, ground targets, flak) is
//    run by StrafeOps.ts the same way.

export interface OpsResult {
  scripted: boolean;          // true: PilotOps runs the round instead of Game's director
  score: number;              // points earned this frame (protection bonuses)
  incoming: Incoming | null;  // next group for the radar (scripted only)
  roundOver: boolean;         // scripted only
  fail?: string | null;       // the mission is lost (raid missions: too many bombers through)
}

interface Tracked { goal: 'bombers' | 'player' | 'straggler' | 'mixed'; attacking: boolean; nearBomber: boolean; onStraggler: boolean }

const SCORE_INTERCEPT = 60;     // killed a fighter that was heading for the bombers
const SCORE_SAVE = 120;         // ... while it was making its firing pass on a Fortress
const SCORE_ROUND_BOMBER = 25;  // per Fortress still flying when a round ends
const SCORE_STRAGGLER = 600;    // the straggler made it
const R = () => Math.random() * 2 - 1;
const _v = new THREE.Vector3();

export class PilotOps {
  private mission: Mission | null = null;
  private rounds: PilotRound[] | null = null;
  private roundIdx = -1;
  private roundDone = false;
  private groupIdx = 0;
  private clearT = 0;           // s the sky has been clear (or since the last group, for afterClear)
  private bannerDone = false;
  private incomingOff: THREE.Vector3 | null = null;
  private tracked = new Map<Fighter, Tracked>();
  private pending = 0;
  private seen = new Set<string>();
  private straggler: Bomber | null = null;
  private straggleT = 0;
  private stragglerDone: 'saved' | 'lost' | null = null;
  private lastPassiveRound = 0;
  private lastT = 0;
  private padTip = false;
  readonly rear = new RearGunners();
  readonly wing: Wingman;        // Blue Two
  readonly raid: RaidDefence;    // role-reversal missions
  readonly strafe: StrafeOps;    // ground attack (Train Busting)

  constructor(private world: World, private ui: UI, input: Input | null = null, private lead: PilotController | null = null) {
    this.wing = new Wingman(world, ui, input, lead);
    this.raid = new RaidDefence(world, ui);
    this.strafe = new StrafeOps(world, ui, lead);
    DogfightAI.onCall = (call, ai, side) => this.onCall(call, ai.me, side);
    this.rear.onOpenFire = (f) => this.world.callout('rear', 'Lead', `Careful, Blue two — that ${f.label} has a rear gunner. Come at him from below!`, 25, 2);
  }

  get scripted() { return !!this.rounds || this.raid.active || this.strafe.active; }

  start(m: Mission) {
    this.mission = m.role === 'pilot' ? m : null;
    this.rounds = this.mission ? PILOT_ROUNDS[m.id] ?? null : null;
    this.roundIdx = -1;
    this.tracked.clear();
    this.seen.clear();
    this.straggler = null;
    this.stragglerDone = null;
    this.lastPassiveRound = 0;
    this.pending = 0;
    this.padTip = false;
    this.incomingOff = null;
    this.raid.start(m);
    this.strafe.start(m, this.wing); // before Blue Two joins: it moves the Mustang down to the deck
    this.wing.raidTargets = this.raid.active ? () => this.raid.inbound() : null;
    this.wing.callsign = this.raid.active || this.strafe.active ? 'Blue Two' : 'Blue Four'; // escort missions: the player is Lead's Blue Two
    this.wing.start(!!this.mission && !!this.world.playerFighter && m.id !== 'duel'); // no wingman on the dev duel bench
    // raid missions: Blue Two starts out on the bombers
    if (this.raid.active) this.wing.command('bombers');
    if (this.lead) this.lead.sightLit = this.raid.night;
  }

  // ---------- radio ----------
  private onCall(call: BfmCall, f: Fighter, side: 'left' | 'right') {
    const w = this.world;
    if (!this.mission || !w.playerFighter?.alive) return;
    if (f.pos.distanceTo(w.playerFighter.pos) > 1500) return;
    const name = f.label;
    switch (call) {
      case 'break': w.callout('df_break', 'Lead', `He's seen you — he's breaking ${side}! Stay with him!`, 9, 1); break;
      case 'scissors': w.callout('df_sc', 'Lead', 'He\'s reversing — scissors! Throttle back, make him fly out in front!', 14, 1); break;
      case 'extend': w.callout('df_ext', 'Lead', f.enemyType === 'me262' || f.enemyType === 'me163' ? 'Jet\'s running — don\'t chase him, catch him when he turns back!' : `The ${name} is diving away — let him go or run him down!`, 14, 1); break;
      case 'headon': w.callout('df_head', 'Lead', 'Head-on! Hold your fire till he\'s close, then break high!', 14, 1); break;
      case 'cover': w.callout('df_cover', 'Lead', 'Watch it, Blue two — his wingman is sliding in behind you!', 10, 2); break;
      case 'spiral': w.callout('df_spiral', 'Lead', 'He\'s spiralling down — don\'t follow him into the deck!', 18, 1); break;
      case 'zoom': w.callout('df_zoom', 'Lead', 'Focke-Wulf\'s zooming up for another pass. Keep your speed!', 18, 1); break;
    }
  }

  // ---------- per frame ----------
  direct(dt: number, roundIdx: number, roundT: number): OpsResult {
    const res: OpsResult = { scripted: this.scripted, score: 0, incoming: null, roundOver: false };
    const m = this.mission;
    if (!m) return res;
    const w = this.world;
    this.rear.update(dt, w);
    this.wing.update(dt);
    res.score += this.track();
    if (!this.padTip && roundT > 20 && roundIdx === 0) {
      this.padTip = true;
      this.ui.tip('<kbd>T</kbd> padlocks the nearest bandit — the view tracks him while you fly · <kbd>V</kbd> cockpit / chase', 4500);
    }
    // a round changed (Game handles the hangar break between them)
    if (roundIdx !== this.roundIdx) {
      if (this.roundIdx >= 0 && !this.rounds && !this.raid.active && !this.strafe.active) res.score += this.roundBonus();
      if (this.roundIdx >= 0) this.wing.onRound();
      this.beginRound(roundIdx);
    }
    if (this.strafe.active) {
      const r = this.strafe.direct(dt, roundIdx, roundT);
      res.score += r.score; res.incoming = r.incoming; res.roundOver = r.roundOver; res.fail = r.fail;
      return res;
    }
    if (this.raid.active) {
      const pf = w.playerFighter;
      const r = this.raid.direct(dt, roundIdx, roundT, (f) => !!pf && (f.lastAttacker === pf || f.playerDamage >= f.damageTaken * 0.2));
      res.score += r.score; res.incoming = r.incoming; res.roundOver = r.roundOver; res.fail = r.fail;
      return res;
    }
    if (!this.rounds || this.roundDone) return res;
    const r = this.rounds[Math.min(roundIdx, this.rounds.length - 1)];
    if (!this.bannerDone && roundT > (roundIdx === 0 ? 4.2 : 0.4)) {
      this.bannerDone = true;
      this.ui.banner(`ROUND ${roundIdx + 1} · ${r.kind.toUpperCase()}`, r.title, 3200);
    }
    const enemies = w.activeEnemies().length;
    this.clearT = enemies === 0 ? this.clearT + dt : 0;
    if (roundT < this.lastT) this.clearT = 0;
    this.lastT = roundT;

    // straggler: a Fortress drops out, and must be kept alive
    if (r.kind === 'straggler') res.score += this.updateStraggler(dt, r, roundT);

    // groups
    const g = r.groups[this.groupIdx];
    if (g) {
      const since = g.afterClear ? this.clearT : roundT;
      const eta = g.afterClear ? (enemies > 0 ? null : Math.max(0, g.at - this.clearT)) : Math.max(0, g.at - roundT);
      // afterClear groups also come anyway once the round has dragged on 70 s past the last one
      const forced = g.afterClear && ((this.pending > 60 && enemies <= 2) || this.pending > 110);
      this.pending += dt;
      if ((eta !== null && since >= g.at) || forced) {
        this.spawnGroup(g);
        this.groupIdx++;
        this.pending = 0;
        this.clearT = 0;
      } else if (eta !== null && eta < 25) {
        if (!this.incomingOff) this.incomingOff = this.spawnPos(g.from).sub(w.formationCenter);
        res.incoming = { pos: w.formationCenter.clone().add(this.incomingOff), eta, count: g.types.length };
      }
    }
    // round over: every group flown, the sky clear (and the straggler settled), or out of time
    const allSpawned = this.groupIdx >= r.groups.length;
    const stragglerSettled = r.kind !== 'straggler' || this.stragglerDone !== null;
    if ((allSpawned && enemies === 0 && stragglerSettled && this.clearT > 1.5) || roundT > r.maxTime) {
      if (r.kind === 'straggler' && !this.stragglerDone) res.score += this.settleStraggler(this.straggler?.alive ? 'saved' : 'lost');
      res.score += this.roundBonus();
      res.roundOver = true;
      this.roundDone = true; // the next round index starts the next one
    }
    return res;
  }

  private beginRound(i: number) {
    this.roundIdx = i;
    this.roundDone = false;
    this.groupIdx = 0;
    this.clearT = 0;
    this.pending = 0;
    this.bannerDone = false;
    this.incomingOff = null;
    this.straggleT = 0;
    this.lastT = 0;
    if (this.straggler && !this.straggler.alive) this.straggler = null;
    this.stragglerDone = null;
  }

  // A per-round reward for every Fortress still in the air
  private roundBonus() {
    const alive = this.world.bombers().filter((b) => b.alive).length;
    const pts = alive * SCORE_ROUND_BOMBER;
    if (pts > 0) this.ui.feed(`${alive} bombers protected — +${pts}`, 'mine');
    return pts;
  }

  // Watch every bandit: what it is going for, and whether the player shot it down doing it
  private track(): number {
    const w = this.world, pf = w.playerFighter;
    let pts = 0;
    for (const f of w.fighters('axis')) {
      let t = this.tracked.get(f);
      if (!t) { t = { goal: 'mixed', attacking: false, nearBomber: false, onStraggler: false }; this.tracked.set(f, t); }
      if (!f.alive) continue;
      const p = w.enemyPilot(f);
      const tgt = p?.target;
      t.attacking = !!p && (p.state === 'attack' || p.state === 'duel' || p.state === 'approach') && tgt instanceof Bomber;
      t.nearBomber = t.attacking && !!tgt && (p!.state === 'attack' || p!.state === 'duel') && tgt.pos.distanceTo(f.pos) < 1300;
      t.onStraggler = t.attacking && !!tgt && tgt === this.straggler;
    }
    for (const [f, t] of this.tracked) {
      if (f.alive && !f.remove) continue;
      this.tracked.delete(f);
      if (f.alive) continue; // left the battle
      const credited = !!pf && (f.lastAttacker === pf || f.playerDamage >= f.damageTaken * 0.2);
      if (!credited || !t.attacking) continue;
      const bonus = t.nearBomber ? SCORE_SAVE : SCORE_INTERCEPT;
      pts += bonus;
      this.ui.feed(t.onStraggler ? `Straggler defended — +${bonus}` : t.nearBomber ? `Bomber saved — +${bonus}` : `Intercepted — +${bonus}`, 'mine');
      if (t.nearBomber && Math.random() < 0.5) w.callout('saved', 'Big Friend', 'Thanks, little friend — he was all over us!', 20, 1);
    }
    return pts;
  }

  private updateStraggler(dt: number, r: PilotRound, roundT: number): number {
    const w = this.world;
    if (!this.straggler && !this.stragglerDone && roundT >= (r.straggleAt ?? 15)) {
      const b = this.pickStraggler();
      if (!b) { this.stragglerDone = 'lost'; return 0; }
      this.straggler = b;
      this.straggleT = 0;
      // flak knocks out two engines: she can't hold formation
      for (const name of ['engine1', 'engine2']) {
        const z = b.zone(name);
        if (!z) continue;
        z.hp = 0; (z as any).destroyed = true;
        if (z.engine !== undefined) b.engineDead[z.engine] = true;
      }
      b.straggling = true;
      w.effects.explosion(b.localToWorld(new THREE.Vector3(5, 0, 2)), b.vel, 0.6);
      w.callout('strag_call', 'Big Friend', `Little friends, this is ${b.name}. We've lost two engines and can't keep up — can you cover us?`, 0, 3);
      this.ui.banner('STRAGGLER', `Cover "${b.name}" — she's falling out of formation`, 3200);
    }
    const b = this.straggler;
    if (!b || this.stragglerDone) return 0;
    if (!b.alive) return this.settleStraggler('lost');
    this.straggleT += dt;
    // safe once she has been carried through the hold time and nothing is still on her
    const onHer = [...this.tracked.entries()].some(([f, t]) => f.alive && t.onStraggler);
    if (this.straggleT >= (r.holdFor ?? 60) && !onHer) return this.settleStraggler('saved');
    return 0;
  }

  private settleStraggler(result: 'saved' | 'lost'): number {
    this.stragglerDone = result;
    const b = this.straggler;
    if (result === 'saved') {
      this.ui.banner('STRAGGLER SAVED', `"${b?.name ?? 'The Fortress'}" is heading home · +${SCORE_STRAGGLER}`, 3200);
      this.world.callout('strag_ok', 'Big Friend', 'We owe you one, little friend. We\'re going to make it!', 0, 3);
      return SCORE_STRAGGLER;
    }
    this.ui.feed(`Straggler "${b?.name ?? 'B-17'}" lost`, 'loss');
    return 0;
  }

  // An outside ship of the box (never the lead), so she visibly falls out
  private pickStraggler(): Bomber | null {
    const bs = this.world.bombers().filter((b) => b.alive && !b.straggling && !b.isPlayer);
    if (!bs.length) return null;
    bs.sort((a, b) => Math.abs(b.slot.x) + Math.abs(b.slot.y) - (Math.abs(a.slot.x) + Math.abs(a.slot.y)));
    return bs[Math.floor(Math.random() * Math.min(3, bs.length))];
  }

  private spawnPos(from: PilotFrom): THREE.Vector3 {
    const w = this.world;
    const c = w.formationCenter, f = w.formationForward;
    const left = new THREE.Vector3(0, 1, 0).cross(f).normalize();
    const p = c.clone();
    switch (from) {
      case 'front': p.addScaledVector(f, 5000).addScaledVector(left, R() * 900).y += 300 + Math.random() * 400; break;
      case 'rear': p.addScaledVector(f, -3400).addScaledVector(left, R() * 700).y += 150 + Math.random() * 300; break;
      case 'left': p.addScaledVector(left, 3800).addScaledVector(f, 900 + R() * 900).y += Math.random() * 400; break;
      case 'right': p.addScaledVector(left, -3800).addScaledVector(f, 900 + R() * 900).y += Math.random() * 400; break;
      case 'high': p.addScaledVector(f, -1200 + R() * 1200).addScaledVector(left, R() * 1500).y += 1700 + Math.random() * 400; break;
    }
    return p;
  }

  private spawnGroup(g: PilotGroup) {
    const w = this.world;
    const base = this.incomingOff ? w.formationCenter.clone().add(this.incomingOff) : this.spawnPos(g.from);
    this.incomingOff = null;
    const attack: AttackType = g.from === 'front' ? 'headon' : g.from === 'rear' ? 'stern' : g.from === 'high' ? 'high' : 'beam';
    const pf = w.playerFighter;
    let lead: DogfightAI | null = null;
    g.types.forEach((type, i) => {
      const pos = base.clone().add(new THREE.Vector3(R() * 160 + (i - g.types.length / 2) * 70, R() * 60, R() * 160));
      const f = w.spawnEnemy(pos, attack, g.skill, g.goal !== 'player', Math.random() < (g.rockets ?? 0), type);
      const p = w.enemyPilot(f);
      if (!p) return;
      const goal = g.goal === 'mixed' ? (type === 'bf109' || type === 'me262' ? 'player' : 'bombers') : g.goal;
      this.tracked.set(f, { goal, attacking: false, nearBomber: false, onStraggler: false });
      if (goal === 'player' && pf?.alive) {
        p.target = pf; p.state = 'dogfight'; p.timer = 0;
        if (g.pairs) {
          p.bfm = new DogfightAI(f, p.skill);
          if (lead) { DogfightAI.pair(lead, p.bfm); lead = null; } else lead = p.bfm;
        }
      } else if (goal === 'straggler' && this.straggler?.alive) {
        const s = this.straggler;
        p.dogfightChance = 0;
        p.target = s; p.attack = 'stern'; p.state = 'approach'; p.timer = 0;
        p.setupPoint.copy(s.pos).addScaledVector(w.formationForward, -1300).add(_v.set(R() * 300, 200 + Math.random() * 200, R() * 300));
      } else {
        // bomber attackers mostly stay on the bombers until the Mustang jumps them
        p.dogfightChance = goal === 'bombers' ? 0.06 : 0.35;
      }
      if (!this.seen.has(type) && type !== 'fw190') {
        this.seen.add(type);
        const v = ENEMY_VARIANTS[type];
        w.callout('type' + type, 'Lead', `${v.label}s in this bunch — ${v.blurb}!`, 1, 2);
      }
    });
    if (g.radio) w.callout('pgrp' + this.roundIdx + '_' + this.groupIdx, g.radio[0], g.radio[1], 0, 3);
  }

  // HUD objective line (null: leave Game's own)
  objective(roundIdx: number, rounds: number): string | null {
    if (this.raid.active) return this.raid.objective(roundIdx, rounds);
    if (this.strafe.active) return this.strafe.objective(roundIdx, rounds);
    if (!this.rounds) return null;
    const r = this.rounds[Math.min(roundIdx, this.rounds.length - 1)];
    const n = this.world.activeEnemies().length;
    const head = `Round ${roundIdx + 1}/${rounds} · ${r.kind.toUpperCase()}`;
    if (r.kind === 'straggler' && this.straggler && !this.stragglerDone) {
      const left = Math.max(0, Math.ceil((r.holdFor ?? 60) - this.straggleT));
      const hp = Math.round(this.straggler.integrity * 100);
      return `${head} — cover "${this.straggler.name}" (${hp}%)${left > 0 ? ` · ${left}s` : ' · clear her six'}`;
    }
    const attacking = [...this.tracked.entries()].filter(([f, t]) => f.alive && t.attacking).length;
    if (n === 0) return `${head} — ${this.groupIdx < r.groups.length ? 'more bandits inbound' : 'sky clear'}`;
    return `${head} — ${n} bandit${n === 1 ? '' : 's'}${attacking ? `, ${attacking} on the bombers` : ''}`;
  }

  // Bombers under attack get a red marker; the straggler is labelled with her health
  drawOverlay(ctx: CanvasRenderingContext2D, W: number, H: number, cam: THREE.Camera) {
    if (!this.mission) return;
    this.wing.drawOverlay(ctx, W, H, cam);
    this.raid.drawOverlay(ctx, W, H, cam);
    this.strafe.drawOverlay(ctx, W, H, cam);
    const under = new Map<Bomber, number>();
    for (const [f, t] of this.tracked) {
      if (!f.alive || !t.nearBomber) continue;
      const tgt = this.world.enemyPilot(f)?.target;
      if (tgt instanceof Bomber && tgt.alive) under.set(tgt, (under.get(tgt) ?? 0) + 1);
    }
    const s = this.straggler;
    ctx.save();
    ctx.font = isAr() ? `600 12px ${CANVAS_MONO}` : '600 11px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 160);
    const mark = (b: Bomber, label: string, col: string) => {
      const p = _v.copy(b.pos).project(cam);
      if (p.z > 1) return;
      const x = THREE.MathUtils.clamp((p.x * 0.5 + 0.5) * W, 30, W - 30), y = THREE.MathUtils.clamp((-p.y * 0.5 + 0.5) * H, 40, H - 30);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.lineTo(x + 7, y - 42); ctx.lineTo(x - 7, y - 42); ctx.closePath(); ctx.fill();
      ctx.fillText(tx(label), x, y - 48);
    };
    for (const [b, n] of under) if (b !== s) mark(b, n > 1 ? `UNDER ATTACK ×${n}` : 'UNDER ATTACK', `rgba(255,80,60,${pulse})`);
    if (s?.alive && !this.stragglerDone) {
      mark(s, `STRAGGLER ${Math.round(s.integrity * 100)}%${under.has(s) ? ' — UNDER ATTACK' : ''}`, under.has(s) ? `rgba(255,80,60,${pulse})` : 'rgba(255,210,120,0.95)');
    }
    ctx.restore();
  }
}

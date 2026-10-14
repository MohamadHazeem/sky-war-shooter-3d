import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Input } from '../core/Input';
import type { UI } from '../ui/UI';
import type { Game } from './Game';
import type { World } from '../world/World';
import { Aircraft, Bomber, Fighter } from '../world/Aircraft';
import type { AttackType } from '../world/AI';
import { EnemyType, randomEnemyType } from '../world/EnemyTypes';
import { roundDef } from './Missions';
import { sound } from '../audio/Sound';
import { ObjectiveHud, TagView } from '../ui/ObjectiveCard';
import { Objective, OBJECTIVES, ObjectiveId } from './Objectives';
import { RandomEvent, EVENTS, EventId } from './RandomEvents';
import { tx } from '../i18n';
import { SetPieces, SetPieceId } from './SetPieces';
import { projectMarker } from '../ui/MarkerProjection';

// Mid-round extras: pop-up bonus objectives (1–2 per round) and random in-flight events
// (every 60–120 s). This file is the scheduler and the shared toolbox; the objectives live in
// Objectives.ts, the events in RandomEvents.ts, the HUD in ui/ObjectiveCard.ts.
//
// Hooked into Game with three lines (import, construction, one update call per frame after the
// wounded-crew desaturation is set). It reads the rest of the game through public fields and,
// where unavoidable, the World's private pilot/fire tables (see pin() and RandomEvents).
// Nothing fires during a boss fight ((a as any).boss on a live aircraft) or during the first
// 20 s of a round, and every event times out by itself, so the autoplay never gets stuck.
// It also runs the formation set pieces (SetPieces.ts): objectives and events wait while one plays.

const R = () => Math.random() * 2 - 1;
const _p = new THREE.Vector3();

export const EVENT_GAP: [number, number] = [60, 120];   // s between random events
export const EVENT_QUIET_START = 20;                    // s into a round before any event

export class MidRound {
  readonly hud = new ObjectiveHud();
  objective: Objective | null = null;
  event: RandomEvent | null = null;
  bonusMerit = 0;                     // merit paid out by objectives and events this mission
  log: string[] = [];                 // outcome log (dev / playtests)
  private mission: unknown = null;
  private lastTime = 0;
  private roundIdx = -1;
  private roundT0 = -1;
  private objSlots: number[] = [];    // round times when the next objectives pop up
  private objStartedAt = -99;
  private objEndedAt = -99;
  private eventCd = 0;
  private eventStartedAt = -99;
  private recent: string[] = [];      // last objectives / events, to avoid repeats
  private pins = new Map<Fighter, Aircraft>();
  roundT = 0;
  roundLeft = 0;
  readonly setPieces: SetPieces;      // formation drama set pieces (SetPieces.ts)

  constructor(readonly game: Game, readonly engine: Engine, readonly input: Input, readonly ui: UI) {
    this.setPieces = new SetPieces(this);
    this.hookKills();
  }

  get world(): World { return this.game.world; }
  get role(): 'gunner' | 'pilot' { return this.game.mission?.role ?? 'gunner'; }
  get round(): number { return Math.max(0, this.roundIdx); }

  // ---------------- per frame ----------------
  // roundIdx / roundT0: Game's current round and its start time (w.time)
  update(dt: number, roundIdx: number, roundT0: number) {
    const g = this.game, w = g.world, m = g.mission;
    if (m !== this.mission || w.time < this.lastTime - 1e-6) this.resetMission(m);
    this.lastTime = w.time;
    const live = g.state === 'playing' && !!m && !!w.player && w.player.alive && m.midRound !== false;
    // a pause, perk card or hangar break freezes a formation set piece; it carries on afterwards
    if (!live) { this.stopAll(g.state === 'paused' && m === this.mission && !!w.player?.alive); return; }
    if (roundIdx !== this.roundIdx) this.newRound(roundIdx, roundT0);
    const r = m!.round ? roundDef(m!, roundIdx) : { duration: Number.isFinite(m!.duration) ? m!.duration : 120, start: 7 };
    this.roundT = w.time - roundT0;
    this.roundLeft = r.duration - this.roundT;
    const boss = this.bossFight();

    // keep pinned attackers on their bomber
    for (const [f, t] of this.pins) {
      if (!f.alive || f.remove || !t.alive) { this.pins.delete(f); continue; }
      this.pin(f, t);
    }

    // ---- objectives ----
    if (this.objective) {
      const o = this.objective;
      o.timeLeft -= dt;
      o.update(dt, this);
      if (o.state === 'active' && o.timeLeft <= 0) o.timeout(this);
      if (o.state !== 'active') this.finishObjective(o);
      else this.hud.showCard(o.view());
    } else if (!m.signature && this.objSlots.length && this.roundT >= this.objSlots[0]) {
      // a slot comes due: needs 25 s of the round left, no boss and a gap after an event
      if (this.roundLeft < 25) this.objSlots.length = 0;
      else if (!boss && !this.setPieces.busy && w.time - this.eventStartedAt > 6 && w.time - this.objEndedAt > 8) { this.objSlots.shift(); this.startObjective(); }
    }

    // ---- random events ----
    if (this.event) {
      const e = this.event;
      e.t += dt;
      e.update(dt, this);
      // the round's spawning is over: whatever is still going wraps up on its own
      if (e.state === 'active' && this.roundLeft <= 0) e.timeout(this);
      if (e.state === 'active' && e.t >= e.limit) e.timeout(this);
      if (e.state !== 'active') this.finishEvent(e);
    } else {
      this.eventCd -= dt;
      if (!m.signature && this.eventCd <= 0 && this.roundT >= EVENT_QUIET_START && this.roundLeft > 15 && !boss && !this.setPieces.busy && w.time - this.objStartedAt > 6) {
        if (this.startEvent()) this.eventCd = EVENT_GAP[0] + Math.random() * (EVENT_GAP[1] - EVENT_GAP[0]);
        else this.eventCd = 5;
      }
    }
    // ---- formation set pieces (lulls only; never on top of an objective or event) ----
    this.setPieces.update(dt, boss, !!this.event);
    if (!this.event) this.hud.hidePrompt();
    this.drawTags();
  }

  // ---------------- scheduling ----------------
  private resetMission(m: unknown) {
    this.stopAll();
    this.mission = m;
    this.roundIdx = -1; this.roundT0 = -1;
    this.bonusMerit = 0;
    this.log = [];
    this.recent = [];
    this.objStartedAt = this.eventStartedAt = this.objEndedAt = -99;
    // the first event comes a little sooner than the 60-120 s gap, so round 1 gets one
    this.eventCd = 40 + Math.random() * 35;
    this.setPieces.reset();
    this.hookKills();
  }

  private newRound(idx: number, t0: number) {
    this.roundIdx = idx; this.roundT0 = t0;
    const m = this.game.mission!;
    const r = m.round ? roundDef(m, idx) : { duration: Number.isFinite(m.duration) ? m.duration : 120, start: 7 };
    // one objective early in the round, a second one later in most rounds
    const first = r.start + 14 + Math.random() * 10;
    this.objSlots = [first];
    const second = Math.max(first + 34, r.duration * 0.45 + Math.random() * 8);
    if (r.duration - second >= 26 && Math.random() < 0.75) this.objSlots.push(second);
  }

  private bossFight() { return this.world.aircraft.some((a) => a.alive && !a.remove && (a as any).boss); }

  private pickFresh<T extends string>(ids: T[]): T | null {
    if (!ids.length) return null;
    const fresh = ids.filter((i) => !this.recent.includes(i));
    const pool = fresh.length ? fresh : ids;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private remember(id: string) { this.recent.push(id); if (this.recent.length > 3) this.recent.shift(); }

  startObjective(id?: ObjectiveId): Objective | null {
    if (this.objective) { this.objective.cancel(this); this.finishObjective(this.objective, true); }
    const ids = (Object.keys(OBJECTIVES) as ObjectiveId[]).filter((k) => OBJECTIVES[k].eligible(this));
    const pick = id ?? this.pickFresh(ids);
    if (!pick || (id && !OBJECTIVES[id].eligible(this))) return null;
    const o = OBJECTIVES[pick].create(this);
    o.timeLeft = Math.min(o.limit, id ? o.limit : Math.max(20, this.roundLeft - 2));
    o.limit = o.timeLeft;
    o.merit = Math.round(o.merit * (1 + 0.25 * Math.min(4, this.round)) / 5) * 5;
    this.objective = o;
    this.objStartedAt = this.world.time;
    this.remember(pick);
    o.start(this);
    this.hud.showCard(o.view());
    sound.confirm('hit_confirm');
    this.log.push(`${this.world.time.toFixed(0)}s objective ${pick} start`);
    return o;
  }

  private finishObjective(o: Objective, silent = false) {
    o.end(this);
    this.objective = null;
    this.objEndedAt = this.world.time;
    const won = o.state === 'won';
    this.log.push(`${this.world.time.toFixed(0)}s objective ${o.id} ${won ? 'WON' : 'lost'}`);
    if (silent) { this.hud.hideCard(); return; }
    if (won) this.reward(o.merit, tx('Bonus: {title}', { title: o.title }));
    this.hud.resolveCard(won, won ? tx('COMPLETE · +{n} MERIT', { n: o.merit }) : `${tx('FAILED')}${o.failText ? ' · ' + o.failText : ''}`);
  }

  startEvent(id?: EventId): RandomEvent | null {
    if (this.event) { this.event.timeout(this); this.finishEvent(this.event); }
    const ids = (Object.keys(EVENTS) as EventId[]).filter((k) => EVENTS[k].eligible(this));
    const pick = id ?? this.pickFresh(ids);
    if (!pick || (id && !EVENTS[id].eligible(this))) return null;
    const e = EVENTS[pick].create(this);
    this.event = e;
    this.eventStartedAt = this.world.time;
    this.remember(pick);
    e.start(this);
    this.log.push(`${this.world.time.toFixed(0)}s event ${pick} start`);
    return e;
  }

  private finishEvent(e: RandomEvent) {
    e.end(this);
    this.event = null;
    this.hud.hidePrompt();
    this.log.push(`${this.world.time.toFixed(0)}s event ${e.id} ${e.state}`);
  }

  // Mission over / quit / restart: wind everything down without rewards
  private stopAll(keepSetPiece = false) {
    if (this.objective) { this.objective.cancel(this); this.objective.end(this); this.objective = null; }
    if (this.event) { this.event.cancel(this); this.event.end(this); this.event = null; }
    this.pins.clear();
    if (!keepSetPiece) this.setPieces.stop();
    this.hud.hideAll();
  }

  // ---------------- shared toolbox ----------------
  reward(merit: number, label: string) {
    if (merit <= 0) return;
    this.game.prog.earn(merit);
    this.bonusMerit += merit;
    this.ui.feed(`${label} — +${merit} merit`, 'mine');
    sound.confirm('kill_confirm');
  }

  // Crew/flight radio line through World.callout (subtitle + interphone), always heard
  radio(key: string, speaker: string, text: string) { this.world.callout('mr_' + key, speaker, text, 0, 3); }

  // The player's own aircraft position (gunner: his B-17; pilot: his Mustang)
  playerPos(): THREE.Vector3 | null { return this.world.player?.pos ?? null; }

  // Fighters the player can count kills on (both roles)
  aliveBombers(includePlayer = false): Bomber[] {
    return this.world.bombers().filter((b) => b.alive && (includePlayer || !b.isPlayer));
  }

  // The friendly bomber best placed in the player's gun view (ahead of distance), for events
  // that should play where the player can see them
  bomberInView(filter: (b: Bomber) => boolean = () => true): Bomber | null {
    const w = this.world, arc = w.playerArc(), gun = w.playerGunPos();
    if (!arc || !gun) return this.nearbyBomber(filter);
    let best: Bomber | null = null, score = -Infinity;
    for (const b of this.aliveBombers()) {
      if (b.straggling || !filter(b)) continue;
      const d = _p.copy(b.pos).sub(gun).length();
      const s = _p.divideScalar(Math.max(1, d)).dot(arc) - d / 900;
      if (s > score) { score = s; best = b; }
    }
    return best;
  }

  /** Aircraft an objective or event has marked (a set piece leaves them alone) */
  markedAircraft() { return [...(this.objective?.tags() ?? []), ...(this.event?.tags() ?? [])].map((m) => m.a); }

  /** Short drama shot (Cinematics.drama: kill-cam setting and rules). False: not now. */
  dramaCam(focus: (out: THREE.Vector3) => boolean, dur: number, title: string, sub: string): boolean {
    return this.game.cine.drama(focus, dur, title, sub);
  }

  // A friendly bomber near the player's own position (visible from the guns)
  nearbyBomber(filter: (b: Bomber) => boolean = () => true): Bomber | null {
    const p = this.playerPos() ?? this.world.formationCenter;
    const bs = this.aliveBombers().filter((b) => !b.straggling && filter(b));
    bs.sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p));
    // one of the three nearest, so it isn't always the same ship
    return bs.length ? bs[Math.floor(Math.random() * Math.min(3, bs.length))] : null;
  }

  // Spawn a group of fighters aimed at a target. from: where they come in from (relative
  // to the formation's heading); the target is pinned so the AI keeps coming back for it.
  spawnAttackers(target: Aircraft, n: number, opts: { from?: 'rear' | 'any' | 'front'; dist?: number; type?: EnemyType; attack?: AttackType; station?: string; pin?: boolean } = {}): Fighter[] {
    const w = this.world;
    const fwd = w.formationForward;
    const right = _p.set(0, 1, 0).cross(fwd).normalize().clone();
    const out: Fighter[] = [];
    const skill = Math.min(1.35, 0.95 + 0.07 * this.round);
    const dist = opts.dist ?? 2300;
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const pos = target.pos.clone();
      if (opts.from === 'rear') pos.addScaledVector(fwd, -dist).addScaledVector(right, side * (150 + Math.random() * 450));
      else if (opts.from === 'front') pos.addScaledVector(fwd, dist * 1.4).addScaledVector(right, side * (200 + Math.random() * 500));
      else { const a = Math.random() * Math.PI * 2; pos.addScaledVector(fwd, Math.cos(a) * dist).addScaledVector(right, Math.sin(a) * dist); }
      pos.y += 250 + Math.random() * 400;
      pos.add(new THREE.Vector3(R() * 60 + i * 50, R() * 40, R() * 60));
      const type = opts.type ?? randomEnemyType(Math.min(2, this.round));
      const attack: AttackType = opts.attack ?? (opts.from === 'rear' ? 'stern' : (['headon', 'stern', 'beam', 'high'] as AttackType[])[Math.floor(Math.random() * 4)]);
      const f = w.spawnEnemy(pos, attack, skill, true, false, type);
      if (opts.station) w.assignStation(f, opts.station);
      this.setTarget(f, target);
      if (opts.pin !== false) this.pins.set(f, target);
      out.push(f);
    }
    return out;
  }

  unpin(fs: Fighter[]) { for (const f of fs) this.pins.delete(f); }

  // Point a fighter's AI at a target now (and work out its set-up point for the run)
  setTarget(f: Fighter, t: Aircraft) {
    const p = (this.world as any).pilots?.get(f);
    if (!p) return;
    p.target = t;
    p.state = 'approach'; p.timer = 0;
    p.computeSetup?.(this.world);
  }

  // Keep a pinned fighter on its target: re-aim it whenever it sets up a new pass on
  // someone else (EnemyPilot re-picks targets after each break)
  private pin(f: Fighter, t: Aircraft) {
    const p = (this.world as any).pilots?.get(f);
    if (!p || p.state === 'withdraw' || p.target === t) return;
    if (p.state === 'approach') { p.target = t; p.computeSetup?.(this.world, true); }
  }

  // Send a fighter home (escaped pathfinder)
  withdraw(f: Fighter) {
    const p = (this.world as any).pilots?.get(f);
    if (!p) return;
    p.state = 'withdraw'; p.timer = 0;
    p.breakDir?.copy(this.world.formationForward).negate().setY(0.05).normalize();
    this.pins.delete(f);
  }

  // Wrap World.events.kill once (re-wrapped if someone reassigns it)
  private hookKills() {
    const ev = this.world.events;
    const cur = ev.kill as any;
    if (cur?.__midRound) return;
    const wrapped = (v: Aircraft, byPlayer: boolean, cause?: string) => {
      cur?.(v, byPlayer, cause);
      if (this.game.state !== 'playing') return;
      this.objective?.onKill(v, byPlayer, this);
      this.event?.onKill(v, byPlayer, this);
    };
    (wrapped as any).__midRound = true;
    ev.kill = wrapped;
  }

  // Floating tags over marked aircraft
  private drawTags() {
    const list: TagView[] = [];
    const marks = [...(this.objective?.tags() ?? []), ...(this.event?.tags() ?? [])];
    if (marks.length) {
      const cam = this.engine.camera, W = innerWidth, H = innerHeight;
      for (const mk of marks) {
        if (!mk.a.alive || mk.a.remove) continue;
        const d = mk.a.pos.distanceTo(cam.position);
        const p = projectMarker(mk.a.pos, cam);   // camera-space depth: NDC z misses behind-camera points with reversed depth
        let x = p.x, y = p.y, edge = false;
        if (!p.front) { x = -x; y = -y; edge = true; }
        if (Math.abs(x) > 0.92 || Math.abs(y) > 0.86) {
          edge = true;
          const k = Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.86);
          x /= k; y /= k;
        }
        const lift = edge ? 0 : Math.min(60, Math.max(16, 2600 / Math.max(1, d)));
        list.push({ x: (x * 0.5 + 0.5) * W, y: (-y * 0.5 + 0.5) * H - lift, label: mk.label, dist: d, edge, kind: mk.a.team === 'axis' ? 'target' : 'friend' });
      }
    }
    this.hud.setTags(list);
  }

  // ---------------- dev ----------------
  devObjective(id: ObjectiveId) {
    if (!OBJECTIVES[id]) return `unknown objective ${id}; try ${Object.keys(OBJECTIVES).join(', ')}`;
    if (this.game.state !== 'playing') return 'not playing';
    if (this.roundIdx < 0) this.newRound(0, this.world.time);
    const o = this.startObjective(id);
    return o ? `objective ${id}: ${o.title}` : `objective ${id} not available now`;
  }

  devDrama(id: SetPieceId) {
    if (this.game.state !== 'playing') return 'not playing';
    if (this.role !== 'gunner') return 'set pieces are staged for the gunner';
    if (this.event) { this.event.cancel(this); this.finishEvent(this.event); }
    return this.setPieces.dev(id);
  }

  devEvent(id: EventId) {
    if (!EVENTS[id]) return `unknown event ${id}; try ${Object.keys(EVENTS).join(', ')}`;
    if (this.game.state !== 'playing') return 'not playing';
    const e = this.startEvent(id);
    return e ? `event ${id} started` : `event ${id} not available now (role ${this.role})`;
  }
}

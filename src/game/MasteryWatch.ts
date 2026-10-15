// The in-game side of Gunner Mastery (rules and record: Mastery.ts). Like FeatWatch it attaches
// itself without frame-loop or mission-flow edits:
//   - achievements.watch(): the begin / end of every mission;
//   - world.events.kill and world.events.playerHit, chained: each kill is booked to the gun
//     station it was made from and classified (deflection, long shot, ace, heavy); any hit on
//     the B-17 spoils the round for the Untouched challenge;
//   - an engine updatable: rounds fired / hits (World.stats deltas) and time are booked to the
//     station manned at that moment; a round index change closes a round;
//   - the debrief: the mission is committed when the debrief opens and its report is drawn into
//     the debrief box once the debrief has been built (a microtask after showDebrief).
// Game.ts has one line (the constructor); SimpleMenu routes the Hangar entry to open().
import type { Game } from './Game';
import type { Mission } from './Missions';
import * as THREE from 'three';
import { Fighter } from '../world/Aircraft';
import type { StationId } from '../world/B17Layout';
import { achievements } from './Achievements';
import {
  type MissionReport, type MissionTally, type StationTally, CLEAN_ROUND_S, MasteryBook, classifyKill, crossingAngle, emptyTally, huntPointsForKill, quarryFor,
} from './Mastery';
import { setActiveSight } from './GunSights';
import { refreshPlayerBomber } from './Customize';
import { renderMasteryDebrief, rewardText, showMasteryScreen, sourceLabel } from '../ui/MasteryScreen';
import { hudToast } from '../ui/HudToast';
import { tx } from '../i18n';

const _los = new THREE.Vector3(), _rel = new THREE.Vector3();

export class MasteryWatch {
  readonly book = new MasteryBook();
  private m: Mission | null = null;
  private tally: MissionTally | null = null;
  private lastShots = 0;
  private lastHits = 0;
  private round = 0;
  private roundT = 0;
  private roundHit = false;
  private roundStation: StationId | null = null;
  last: MissionReport | null = null;   // the latest debrief's report (dev / QA: sws.game.mastery.last)

  constructor(private g: Game) {
    achievements.watch({ begin: (m) => this.begin(m), end: (ok) => this.end(ok) });
    const ev = g.world.events;
    const prevKill = ev.kill;
    ev.kill = (victim, byPlayer, cause) => {
      prevKill?.(victim, byPlayer, cause);
      if (byPlayer) this.onKill(victim);
    };
    const prevHit = ev.playerHit;
    ev.playerHit = (zone, heavy) => {
      prevHit?.(zone, heavy);
      if (this.tally) this.roundHit = true;
    };
    g.engine.add({ update: (dt) => this.update(dt) });
    // career kills by station from before mastery existed, and any reward they already earned
    try {
      const c = JSON.parse(localStorage.getItem('sws3d.career.v1') ?? 'null');
      if (c?.killsByStation && typeof c.killsByStation === 'object') this.book.migrate(c.killsByStation);
    } catch { /* storage unavailable */ }
    this.book.claimAll(g.prog);
    this.syncSight();
  }

  syncSight() { setActiveSight(this.book.activeSight(this.g.prog)); }

  // The Hangar entry (SimpleMenu): the mastery screen
  open(back: () => void) {
    this.book.rollWeek();
    showMasteryScreen(this.book, this.g.prog, {
      back,
      changed: () => { this.syncSight(); refreshPlayerBomber(); },
    });
  }

  private tracked(m: Mission) { return m.role === 'gunner' && !m.tutorial && m.id !== 'survival-aa'; }

  private begin(m: Mission) {
    this.m = m;
    this.tally = this.tracked(m) ? { stations: {}, huntPoints: 0, huntKills: 0, win: false } : null;
    const s = this.g.world.stats;
    this.lastShots = s.shots; this.lastHits = s.hits;
    this.round = 0; this.roundT = 0; this.roundHit = false; this.roundStation = null;
    this.syncSight();   // the ball turret's reflector is drawn at attach, after this
  }

  private st(id: StationId): StationTally {
    const t = this.tally!;
    return (t.stations[id] ??= emptyTally());
  }

  private update(dt: number) {
    const g = this.g, t = this.tally;
    if (!t || g.mission !== this.m) return;
    const w = g.world, s = w.stats;
    if (s.shots < this.lastShots || s.hits < this.lastHits) { this.lastShots = 0; this.lastHits = 0; }   // stats were reset
    const id = w.playerStationId() as StationId | null;
    if (id) {
      const x = this.st(id);
      x.shots += s.shots - this.lastShots;
      x.hits += s.hits - this.lastHits;
      if (g.state === 'playing') x.time += dt;
      this.roundStation = id;
    }
    this.lastShots = s.shots; this.lastHits = s.hits;
    if (g.state === 'playing') this.roundT += dt;
    if (g.roundIdx !== this.round) {
      if (g.roundIdx > this.round) this.closeRound();
      this.round = g.roundIdx;
    }
  }

  // A round is over: untouched if nothing hit the B-17 and it lasted long enough to count
  private closeRound() {
    if (this.tally && !this.roundHit && this.roundT >= CLEAN_ROUND_S && this.roundStation) this.st(this.roundStation).clean++;
    this.roundT = 0; this.roundHit = false;
  }

  private onKill(v: unknown) {
    const t = this.tally, g = this.g, w = g.world;
    if (!t || !(v instanceof Fighter) || v.team !== 'axis') return;
    const id = w.playerStationId() as StationId | null;
    if (!id) return;
    const cam = g.engine.camera.position;
    _los.copy(v.pos).sub(cam);
    _rel.copy(v.vel);
    if (w.playerBomber) _rel.sub(w.playerBomber.vel);
    const ace = !!(v as any).ace || !!v.ai?.persona?.ace;
    const c = classifyKill({ type: v.enemyType, dist: _los.length(), cross: crossingAngle(_los, _rel), relSpeed: _rel.length(), ace });
    const x = this.st(id);
    x.kills++; x.xp += c.xp;
    if (c.deflection) x.deflection++;
    if (c.long) x.long++;
    if (c.ace) x.aces++;
    if (c.heavy) x.heavy++;
    t.huntKills++;
    t.huntPoints += huntPointsForKill(v.enemyType, c, quarryFor(this.book.d.hunt.week));
  }

  private end(success: boolean) {
    const t = this.tally;
    this.tally = null;
    if (!t) return;
    this.update(0);                      // book the last rounds fired
    if (success) this.closeRound();      // the final round, or the whole mission without rounds
    t.win = success;
    const rep = this.book.commit(t, this.g.prog);
    this.last = rep;
    this.syncSight();
    if (rep.rewards.length) refreshPlayerBomber();
    // the debrief box is built after achievements.endMission: draw once it is there
    queueMicrotask(() => {
      if (this.g.state !== 'debrief') return;
      renderMasteryDebrief(rep, this.book, this.g.prog);
      for (const r of rep.rewards.slice(0, 3)) if (r.reward.kind !== 'merit') hudToast(tx('GUNNER MASTERY'), rewardText(r.reward), r.source === 'hunt' ? tx('Weekly Ace Hunt goal') : sourceLabel(r.source));
    });
  }
}

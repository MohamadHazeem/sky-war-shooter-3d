import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { UI } from '../ui/UI';
import type { Game } from './Game';
import { roundDef, Wave } from './Missions';
import { isBossRound } from './BossBattle';
import { Tactics } from '../world/Tactics';
import { Aircraft, Fighter } from '../world/Aircraft';
import { ENEMY_VARIANTS, EnemyType } from '../world/EnemyTypes';
import { SpecialHud, PanelView, TagSpec } from '../ui/SpecialHud';
import { sound } from '../audio/Sound';
import { paintNose } from '../world/AceLook';
import { NemesisRuntime, setNemesisRuntime, type NemLive } from './NemesisRuntime';
import { ACE_RANKS, aceName, fullRankName, traitLabel } from './Nemesis';
import { tx } from '../i18n';

// Special events inside normal rounds, on top of MidRound's objectives and random events.
// Rare and memorable: at most one per round, only from round 2 of a mission (or any round of
// mission 3 onwards; survival from round 2), never in the first 25 s of a round, never in a
// boss round or while a boss is up.
//   ace        3–4 yellow-nosed aces led by a named (fictional) Experte: higher skill, twice
//              as tough, a name tag + health bar and a radio taunt. Downing the leader pays
//              big and carries the kill-cam flag (f as any).ace = true.
//   zerstorer  4–6 Bf 110s / Ju 88s close in formation and fire coordinated rocket salvos
//   barrage    3–4 heavies stand off at ~1 km lobbing Wgr. 21 salvos until they are shot down
// This module also owns the enemy tactics layer (world/Tactics.ts): Game hands it every group
// the director spawns (onGroup) and calls update() once per frame.
// Nemesis (NemesisRuntime.ts): an ace squadron is led by one of the persistent named Experten
// when one is available (his trait flies him, his outcome goes into his dossier), and the
// nemesis runtime books extra ace squadrons into some rounds (newRound -> forced).
//
// Hooked into Game with: import, a field + construction, one onGroup() call in director() after
// spawnWave(), one update() call per frame next to MidRound's. Score is added through Game's
// private `score` field ((game as any).score), merit through game.prog.earn.

export type SpecialId = 'ace' | 'zerstorer' | 'barrage';
export const SPECIAL_IDS: SpecialId[] = ['ace', 'zerstorer', 'barrage'];
export const SPECIAL_QUIET_START = 25;   // s into a round before a special event
const SPECIAL_CHANCE = 0.45;             // chance an eligible round gets one
const SPECIAL_CHANCE_AFTER = 0.25;       // ... when the previous round already had one

// Fictional Luftwaffe Experten (no real pilots)
const ACES = [
  { rank: 'Hauptmann', short: 'Hptm.', name: 'Otto Kessler', last: 'Kessler', victories: 52 },
  { rank: 'Major', short: 'Maj.', name: 'Wilhelm Brandauer', last: 'Brandauer', victories: 71 },
  { rank: 'Oberleutnant', short: 'Oblt.', name: 'Ernst Falkenrath', last: 'Falkenrath', victories: 38 },
  { rank: 'Hauptmann', short: 'Hptm.', name: 'Kurt Reinholt', last: 'Reinholt', victories: 64 },
  { rank: 'Major', short: 'Maj.', name: 'Johann Steinbrecher', last: 'Steinbrecher', victories: 87 },
];
type Ace = typeof ACES[number];

const TAUNTS: ((a: Ace) => string)[] = [
  (a) => `Viermots ahead. ${a.last} here — the fat one in the middle is mine. Horrido!`,
  (a) => `Achtung, Amis. Number ${a.victories + 1} is flying in that box. Pauke, pauke!`,
  (a) => `Close up, Kinder. We go through them together — and nobody turns away before me.`,
  (a) => `Indianer at the bombers? Let them come. Today I paint another bar on my rudder.`,
];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const round5 = (n: number) => Math.round(n / 5) * 5;
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// worst of overall structure and the vital zones: what the HUD bar shows
function health(f: Fighter) {
  let h = f.structureFrac;
  for (const z of f.zones) if (z.critical) h = Math.min(h, Math.max(0, z.hp) / z.maxHp);
  return h;
}

function toughen(f: Fighter, k: number) {
  f.maxStructure *= k; f.structure = f.maxStructure;
  for (const z of f.zones) { z.hp *= k; z.maxHp *= k; }
}

// ---------------------------------------------------------------- event base
abstract class Special {
  abstract readonly id: SpecialId;
  t = 0;
  limit = 90;
  state: 'active' | 'won' | 'lost' | 'timeout' | 'cancelled' = 'active';
  fighters: Fighter[] = [];
  abstract start(c: SpecialEvents): void;
  update(_dt: number, _c: SpecialEvents) {}
  timeout(c: SpecialEvents) { if (this.state === 'active') { this.state = 'timeout'; c.withdraw(this.fighters); } }
  cancel() { if (this.state === 'active') this.state = 'cancelled'; }
  panel(): PanelView | null { return null; }
  tags(_out: TagSpec[]): number { return 0; }
  alive() { let n = 0; for (const f of this.fighters) if (f.alive && !f.remove) n++; return n; }
}

// ---------------------------------------------------------------- ace squadron
class AceSquadron extends Special {
  readonly id = 'ace';
  ace: Ace = ACES[Math.floor(Math.random() * ACES.length)];
  leader!: Fighter;
  nem: NemLive | null = null;     // a roster Experte leads this squadron
  private c: SpecialEvents | null = null;
  private tauntAt = 4;
  private eye: THREE.Vector3 | null = null;
  private taunted = false;
  private view: PanelView = { kicker: '', title: '', desc: 'Yellow noses — bring down the Staffelkapitän', bar: 1, barText: '', timeFrac: 1, ace: true };
  constructor() { super(); this.limit = 120; }

  start(c: SpecialEvents) {
    const w = c.world;
    this.c = c;
    const pro = c.nemesis.claim();
    if (pro) this.ace = { rank: ACE_RANKS[pro.rank].name, short: ACE_RANKS[pro.rank].short, name: `${pro.first} ${pro.last}`, last: pro.last, victories: pro.victories };
    const type: EnemyType = pro ? pro.type : Math.random() < 0.6 ? 'fw190' : 'bf109';
    // jets and Zerstörers fly in pairs; piston Experten bring a Schwarm
    const n = pro ? (pro.type === 'me262' || pro.type === 'me410' ? 2 : Math.random() < 0.5 ? 2 : 3) : Math.random() < 0.5 ? 3 : 4;
    const skill = Math.min(1.9, 1.55 + 0.06 * c.round);
    this.fighters = c.tactics.spawn(type, n, skill);
    this.leader = this.fighters[0];
    for (const f of this.fighters) { toughen(f, 2); if (!pro) c.yellowNose(f); f.label = `${ENEMY_VARIANTS[type].label} (${pro ? 'Experte' : 'yellow nose'})`; }
    (this.leader as any).ace = true;   // kill-cam / big slow-motion beat in Game's kill handler
    this.leader.label = `${this.ace.short} ${this.ace.last}`;
    if (pro) {
      this.nem = c.nemesis.engage(pro, this.fighters);
      this.view.kicker = tx('EXPERTE · {n} VICTORIES', { n: pro.victories });
      this.view.title = fullRankName(pro);
      this.view.desc = traitLabel(pro.trait);
      return;
    }
    const lp = w.enemyPilot(this.leader);
    if (lp) lp.skill = Math.max(lp.skill, 1.75);
    // the entrance: a schwarm head-on pass out of twelve o'clock high
    c.tactics.companyFront(this.fighters, { schwarm: true, telegraph: false });
    w.callout('sp_ace', 'Navigator', `Yellow noses, twelve o'clock high! That's ${this.ace.last}'s Staffel — ${this.ace.victories} kills!`, 0, 3);
    c.ui.banner(`ACE SQUADRON · ${this.ace.rank.toUpperCase()} ${this.ace.name.toUpperCase()} · ${this.ace.victories} VICTORIES`, `${this.ace.last}'s Staffel`, 3600);
    if (c.gunner()) c.ui.tip('The aces are coming head-on — <b>TOP TURRET</b> <kbd>3</kbd> · bring down the leader', 3600);
    this.view.kicker = `ACE · ${this.ace.victories} VICTORIES`;
    this.view.title = `${this.ace.rank} ${this.ace.name}`;
  }

  update(dt: number, c: SpecialEvents) {
    const w = c.world, L = this.leader;
    this.eye = w.player ? w.player.pos : null;
    if (this.nem) {
      c.nemesis.fly(this.nem, dt);
      if (!L.alive) { c.aceDown(this); return; }
      if (L.remove) { this.state = 'lost'; c.nemesis.leave(this.nem, 'escaped'); }
      return;
    }
    if (!this.taunted && this.t > this.tauntAt) {
      this.taunted = true;
      // German pilot on the radio: subtitle only
      c.ui.subtitle(this.ace.last, TAUNTS[Math.floor(Math.random() * TAUNTS.length)](this.ace));
      sound.radioStatic();
    }
    if (!L.alive) { c.aceDown(this); return; }
    if (L.remove) { this.state = 'lost'; c.ui.feed(`${this.ace.short} ${this.ace.last} got away`, 'loss'); return; }
    // after the entrance he hunts the player: the Mustang in a dogfight, the gunner's own ship
    const p = w.enemyPilot(L);
    if (p && !p.override && p.state === 'approach') {
      if (w.playerFighter?.alive && w.player === w.playerFighter) { p.target = w.playerFighter; p.state = 'dogfight'; p.timer = 0; }
      else if (w.playerBomber?.alive && w.player === w.playerBomber && p.target !== w.playerBomber) p.engage(w, w.playerBomber, undefined, true);
    }
  }

  timeout(c: SpecialEvents) {
    if (this.state !== 'active') return;
    this.state = 'timeout';
    c.withdraw(this.fighters);
    if (this.nem) { if (this.leader.alive) c.nemesis.leave(this.nem, 'timeout'); return; }
    if (this.leader.alive) c.world.callout('sp_aceaway', 'Tail', `${this.ace.last} is breaking off — the yellow noses are heading home.`, 0, 3);
  }

  cancel() {
    if (this.state === 'active' && this.nem && this.c) this.c.nemesis.leave(this.nem, 'cancel');
    super.cancel();
  }

  panel() {
    this.view.bar = this.leader.alive ? health(this.leader) : 0;
    const n = this.alive() - (this.leader.alive ? 1 : 0);
    this.view.barText = n > 0 ? tx('+{n} WINGMEN', { n }) : tx('ALONE');
    this.view.timeFrac = -1;
    return this.view;
  }

  tags(out: TagSpec[]) {
    let n = 0;
    const eye = this.eye;
    for (const f of this.fighters) {
      if (!f.alive || f.remove || n >= out.length) continue;
      // wingmen tags only once they are close enough to tell apart from the leader's
      if (f !== this.leader && eye && f.pos.distanceTo(eye) > 1300) continue;
      const t = out[n++];
      t.a = f; t.health = health(f);
      t.ace = f === this.leader;
      t.label = f === this.leader ? (this.nem ? `${aceName(this.nem.ace).toUpperCase()} · ${this.nem.ace.victories}` : `${this.ace.short.toUpperCase()} ${this.ace.last.toUpperCase()} · ${this.ace.victories}`) : tx('ACE');
    }
    return n;
  }
}

// ---------------------------------------------------------------- Zerstörer wave
class ZerstorerWave extends Special {
  readonly id = 'zerstorer';
  total = 0;
  private view: PanelView = { kicker: 'SPECIAL EVENT', title: 'Zerstörer wave', desc: 'Break up the formation before the salvos land', bar: 1, barText: '', timeFrac: 1 };
  constructor() { super(); this.limit = 85; }

  start(c: SpecialEvents) {
    const n = 4 + Math.floor(Math.random() * 3);
    const tier = c.tier();
    for (let i = 0; i < n; i++) {
      const type: EnemyType = Math.random() < (tier >= 2 ? 0.4 : 0.2) ? 'ju88' : 'bf110';
      this.fighters.push(...c.tactics.spawn(type, 1, Math.min(1.4, 1.0 + 0.05 * c.round), true));
    }
    this.total = n;
    c.tactics.zerstorer(this.fighters, { ang: c.sideBearing(0.9, 2.0), salvos: tier >= 3 ? 3 : 2 });
    c.ui.banner(`${n} HEAVY FIGHTERS WITH ROCKETS`, 'Zerstörer wave', 3200);
  }

  update(_dt: number, c: SpecialEvents) {
    if (this.alive() === 0) {
      const killed = this.fighters.some((f) => !f.alive);
      this.state = killed ? 'won' : 'lost';
      if (killed) {
        c.reward(round5(90 * (1 + 0.25 * Math.min(4, c.round))), 600, 'Zerstörer wave broken up');
        c.world.callout('sp_zdone', 'Pilot', 'That\'s the last of the destroyers! Nice work, boys.', 0, 3);
      }
    }
  }

  timeout(c: SpecialEvents) {
    // whoever is left keeps pressing gun attacks as ordinary fighters; nothing to withdraw
    if (this.state === 'active') this.state = 'timeout';
    if (c.roundLeft <= 0) c.withdraw(this.fighters);
  }

  panel() {
    const n = this.alive();
    this.view.bar = this.total ? n / this.total : 0;
    this.view.barText = `${n} / ${this.total} LEFT`;
    this.view.timeFrac = 1 - this.t / this.limit;
    return this.view;
  }

  tags(out: TagSpec[]) {
    let n = 0;
    for (const f of this.fighters) {
      if (!f.alive || f.remove || n >= out.length) continue;
      const t = out[n++];
      t.a = f; t.health = health(f); t.ace = false; t.label = f.label.toUpperCase();
    }
    return n;
  }
}

// ---------------------------------------------------------------- rocket barrage
class RocketBarrage extends Special {
  readonly id = 'barrage';
  total = 0;
  private view: PanelView = { kicker: 'SPECIAL EVENT', title: 'Rocket barrage', desc: 'Shoot down the launchers standing off at 1 km', bar: 1, barText: '', timeFrac: 1 };
  constructor() { super(); this.limit = 65; }

  start(c: SpecialEvents) {
    const n = 3 + (c.tier() >= 3 ? 1 : 0);
    const base = c.sideBearing(1.2, 1.9);
    // two on one side (the player's, when he is on a waist gun), the rest across the box
    const angles = [base - 0.3, base + 0.3, -base, -base + 0.4 * Math.sign(base)].slice(0, n);
    for (let i = 0; i < n; i++) this.fighters.push(...c.tactics.spawn(Math.random() < 0.5 ? 'ju88' : 'bf110', 1, 1.0, true));
    this.total = n;
    c.tactics.standoff(this.fighters, { telegraph: false, angles, radius: 1450, minR: 900, maxR: 1450, salvoMax: Infinity, reload: 6.5, place: 2700 });
    for (const f of this.fighters) {
      const g = c.tactics.memberOf(f)?.g;
      if (g && !g.cue) c.tactics.cueAt(g, 'BARRAGE', this.limit);
    }
    c.world.callout('sp_barrage', 'Navigator', 'Rocket barrage! Heavies standing off at a kilometre — they\'ll keep lobbing rockets into the box until we knock them down!', 0, 3);
    c.ui.banner('SHOOT DOWN THE LAUNCHERS', 'Rocket barrage', 3200);
    if (c.gunner()) c.ui.tip(`Launchers on <b>BOTH BEAMS</b> — <kbd>1</kbd> left · <kbd>2</kbd> right waist`, 3600);
  }

  update(_dt: number, c: SpecialEvents) {
    if (this.alive() === 0) {
      const killed = this.fighters.some((f) => !f.alive);
      this.state = killed ? 'won' : 'lost';
      if (killed) {
        c.reward(round5(80 * (1 + 0.25 * Math.min(4, c.round))), 500, 'Rocket barrage broken up');
        c.world.callout('sp_bdone', 'Pilot', 'Launchers are down! That\'s the end of the rockets.', 0, 3);
      }
    }
  }

  timeout(c: SpecialEvents) {
    if (this.state !== 'active') return;
    this.state = 'timeout';
    c.withdraw(this.fighters);
    if (this.alive()) c.world.callout('sp_bout', 'Tail', 'They\'re out of rockets — the heavies are heading home.', 0, 3);
  }

  panel() {
    const n = this.alive();
    this.view.bar = this.total ? n / this.total : 0;
    this.view.barText = `${n} LAUNCHER${n === 1 ? '' : 'S'}`;
    this.view.timeFrac = 1 - this.t / this.limit;
    return this.view;
  }

  tags(out: TagSpec[]) {
    let n = 0;
    for (const f of this.fighters) {
      if (!f.alive || f.remove || n >= out.length) continue;
      const t = out[n++];
      t.a = f; t.health = health(f); t.ace = false; t.label = 'LAUNCHER';
    }
    return n;
  }
}

const MAKE: Record<SpecialId, () => Special> = {
  ace: () => new AceSquadron(),
  zerstorer: () => new ZerstorerWave(),
  barrage: () => new RocketBarrage(),
};
const WEIGHT: Record<SpecialId, number> = { ace: 0.4, zerstorer: 0.3, barrage: 0.3 };

// ---------------------------------------------------------------- scheduler
export class SpecialEvents {
  readonly tactics: Tactics;
  readonly nemesis: NemesisRuntime;   // the persistent named Experten (Nemesis.ts)
  readonly hud = new SpecialHud();
  active: Special | null = null;
  log: string[] = [];
  bonusMerit = 0;
  roundT = 0;
  roundLeft = 0;
  private mission: unknown = null;
  private lastTime = 0;
  private roundIdx = -1;
  private roundT0 = -1;
  private slotT = -1;            // round time of this round's special event (-1 = none)
  private roundDur = 120;        // this round's spawning time (cached: roundDef allocates)
  private hadLast = false;
  private recent: SpecialId[] = [];
  private forced: SpecialId | null = null;   // this round's slot is a nemesis appearance
  private tagList: TagSpec[] = Array.from({ length: 8 }, () => ({ a: null as unknown as Aircraft, label: '', health: 1 }));

  constructor(readonly game: Game, readonly engine: Engine, readonly ui: UI) {
    this.tactics = new Tactics(game.world);
    this.tactics.hint = (html) => { if (this.game.state === 'playing') this.ui.tip(html, 3400); };
    this.nemesis = new NemesisRuntime(this);
    setNemesisRuntime(this.nemesis);
  }

  get world() { return this.game.world; }
  get round() { return Math.max(0, this.roundIdx); }
  tier() { const m = this.game.mission; return this.round + (m && m.number > 0 ? Math.floor((m.number - 1) / 2) : 0); }
  gunner() { const w = this.world; return !!w.playerBomber && w.player === w.playerBomber; }

  // ---------------- director hook ----------------
  // Game.director spawned a group (spawnWave): its fighters are the last `count` axis fighters added
  onGroup(wave: Wave) {
    const w = this.world;
    const fs: Fighter[] = [];
    for (let i = w.aircraft.length - 1; i >= 0 && fs.length < wave.count; i--) {
      const a = w.aircraft[i];
      if (a instanceof Fighter && a.team === 'axis' && a.alive && !a.remove && !(a as any).boss) fs.push(a);
    }
    this.tactics.onGroup(fs, { tier: this.tier(), station: wave.station, skill: wave.skill });
  }

  // ---------------- per frame ----------------
  update(dt: number, roundIdx: number, roundT0: number) {
    const g = this.game, w = g.world, m = g.mission;
    if (m !== this.mission || w.time < this.lastTime - 1e-6) this.resetMission(m);
    this.lastTime = w.time;
    this.tactics.update(dt);
    const live = g.state === 'playing' && !!m && !!w.player && w.player.alive && !m.tutorial;
    if (!live) {
      if (g.state !== 'playing' && g.state !== 'paused' && this.active) this.stop();
      this.hud.hideAll();
      return;
    }
    if (roundIdx !== this.roundIdx || roundT0 !== this.roundT0) this.newRound(roundIdx, roundT0);
    this.roundT = w.time - roundT0;
    this.roundLeft = this.roundDur - this.roundT;

    if (this.active) {
      const e = this.active;
      e.t += dt;
      e.update(dt, this);
      if (e.state === 'active' && (e.t >= e.limit || this.roundLeft <= 0)) e.timeout(this);
      if (e.state !== 'active') this.finish(e);
    } else if (this.slotT >= 0 && this.roundT >= Math.max(SPECIAL_QUIET_START, this.slotT)) {
      if (this.roundLeft < 25) this.slotT = -1;
      else if (!this.bossUp()) { this.slotT = -1; this.start(this.forced ?? this.pick()); this.forced = null; }
    }
    this.draw();
  }

  private resetMission(m: unknown) {
    this.stop();
    this.tactics.reset();
    this.mission = m;
    this.roundIdx = -1; this.roundT0 = -1; this.slotT = -1;
    this.hadLast = false; this.recent = []; this.log = []; this.bonusMerit = 0; this.forced = null;
    this.nemesis.resetMission(m as Game['mission']);
  }

  private newRound(idx: number, t0: number) {
    const m = this.game.mission!;
    this.roundIdx = idx; this.roundT0 = t0;
    this.roundDur = m.round ? roundDef(m, idx).duration : (Number.isFinite(m.duration) ? m.duration : 120);
    this.tactics.groupCd = Math.min(this.tactics.groupCd, 12);
    this.slotT = -1;
    this.forced = null;
    if (!this.eligible(idx)) { this.hadLast = false; return; }
    const r = roundDef(m, idx);
    const dur = Number.isFinite(r.duration) ? r.duration : 100;
    if (dur - 30 > SPECIAL_QUIET_START && this.nemesis.wantsRound(idx)) {
      // a named Experte turns up this round (an ace squadron led by him)
      this.slotT = rnd(SPECIAL_QUIET_START, Math.max(SPECIAL_QUIET_START + 1, dur - 35));
      this.forced = 'ace';
      this.hadLast = true;
    } else if (Math.random() < (this.hadLast ? SPECIAL_CHANCE_AFTER : SPECIAL_CHANCE) && dur - 30 > SPECIAL_QUIET_START) {
      this.slotT = rnd(SPECIAL_QUIET_START, Math.max(SPECIAL_QUIET_START + 1, dur - 35));
      this.hadLast = true;
    } else this.hadLast = false;
    this.log.push(`round ${idx + 1}: special ${this.slotT >= 0 ? 'at ' + this.slotT.toFixed(0) + 's' + (this.forced ? ' (Experte)' : '') : 'none'}`);
  }

  // round 2 onwards, or any round from mission 3; never a boss round
  private eligible(idx: number) {
    const m = this.game.mission;
    if (!m || !m.round || m.tutorial || m.specials === false) return false;
    if (idx < 1 && m.number < 3) return false;
    return !isBossRound(m, idx);
  }

  private bossUp() { return this.game.boss.active || this.world.aircraft.some((a) => a.alive && !a.remove && (a as any).boss); }

  private pick(): SpecialId {
    const pool = SPECIAL_IDS.filter((i) => !this.recent.includes(i));
    const ids = pool.length ? pool : SPECIAL_IDS;
    let tot = 0;
    for (const i of ids) tot += WEIGHT[i];
    let r = Math.random() * tot;
    for (const i of ids) { r -= WEIGHT[i]; if (r <= 0) return i; }
    return ids[0];
  }

  start(id: SpecialId): Special {
    if (this.active) { this.active.cancel(); this.finish(this.active); }
    const e = MAKE[id]();
    this.active = e;
    this.recent.push(id); if (this.recent.length > 2) this.recent.shift();
    e.start(this);
    this.log.push(`${this.world.time.toFixed(0)}s special ${id} start`);
    return e;
  }

  private finish(e: Special) {
    this.active = null;
    this.hud.hideAll();
    this.log.push(`${this.world.time.toFixed(0)}s special ${e.id} ${e.state}`);
  }

  private stop() {
    if (this.active) { this.active.cancel(); this.active = null; }
    this.hud.hideAll();
  }

  private draw() {
    const e = this.active;
    if (!e) { this.hud.hideAll(); return; }
    const v = e.panel();
    if (v) this.hud.showPanel(v); else this.hud.hidePanel();
    const n = e.tags(this.tagList);
    this.hud.setTags(this.tagList, n, this.engine.camera, innerWidth, innerHeight);
  }

  // ---------------- shared toolbox ----------------
  addScore(n: number) { (this.game as any).score += n; }   // Game.score is private; read back by the HUD and debrief

  reward(merit: number, score: number, label: string) {
    if (score) this.addScore(score);
    if (merit > 0) { this.game.prog.earn(merit); this.bonusMerit += merit; }
    this.ui.feed(`${label} — +${merit} merit`, 'mine');
    sound.confirm('kill_confirm');
  }

  // the ace leader went down: big pay-out if the player had a hand in it
  aceDown(e: AceSquadron) {
    const w = this.world, L = e.leader, a = e.ace;
    const credited = w.time - L.lastPlayerHit < 0.8 || L.playerDamage >= L.damageTaken * 0.2;
    e.state = credited ? 'won' : 'lost';
    if (e.nem) this.nemesis.down(e.nem, credited);
    else if (credited) {
      this.reward(round5(150 * (1 + 0.25 * Math.min(4, this.round))), 2500, `${a.short} ${a.last} shot down`);
      this.ui.banner(`${a.rank.toUpperCase()} ${a.name.toUpperCase()} · ${a.victories} VICTORIES`, 'Ace down', 4200);
      w.callout('sp_acedown', 'Pilot', `You got ${a.last}! The whole group saw him go down!`, 0, 3);
    } else {
      this.ui.feed(`${a.short} ${a.last} shot down`, '');
      w.callout('sp_acedown', 'Tail', `Somebody got ${a.last}! Scratch one Experte!`, 0, 3);
    }
    // leaderless, half the Staffel loses heart
    const wings = e.fighters.filter((f) => f !== L && f.alive);
    if (wings.length && Math.random() < 0.5) {
      this.withdraw(wings);
      if (!e.nem) w.callout('sp_acewings', 'Navigator', 'The yellow noses are breaking off — they\'ve lost their leader!', 0, 2);
    }
  }

  // send fighters home (counted out of the round by World.activeEnemies)
  withdraw(fs: Fighter[]) {
    const w = this.world;
    for (const f of fs) {
      if (!f.alive || f.remove) continue;
      const p = w.enemyPilot(f);
      if (!p) continue;
      p.override = null;
      p.state = 'withdraw'; p.timer = 0; p.me.gunAim = null;
      p.breakDir.copy(f.pos).sub(w.formationCenter).setY(0).normalize().setY(-0.08).normalize();
    }
  }

  // a bearing (rad from the heading, + = right) for an attack to come from: gunner missions
  // favour the side the player's gun faces, so he sees it coming
  sideBearing(min: number, max: number) {
    const w = this.world;
    let side = Math.random() < 0.5 ? 1 : -1;
    const arc = w.playerArc();
    if (arc && Math.random() < 0.65) {
      _f.copy(w.formationForward).setY(0).normalize();
      _r.crossVectors(_f, UP).normalize();
      const s = arc.dot(_r);
      if (Math.abs(s) > 0.3) side = s > 0 ? 1 : -1;
    }
    return side * rnd(min, max);
  }

  // JG 2 / JG 26 style yellow cowling ring, fitted behind the propeller of this airframe
  // (world/AceLook.ts; size from the model's own length, so it suits every model)
  yellowNose(f: Fighter) { paintNose(f, 0xf2c418); }

  // ---------------- dev ----------------
  // sws.special(name): a special event ('ace' | 'zerstorer' | 'barrage') or a tactic
  // ('companyFront' | 'schwarm' | 'pincer' | 'comet' | 'jet' | 'standoff' | 'topCover') now
  dev(name?: string): string {
    if (this.game.state !== 'playing' || !this.game.mission) return 'not playing';
    // a mission the scheduler has not seen yet (e.g. just started by sws.special): adopt it first
    if (this.game.mission !== this.mission || this.world.time < this.lastTime - 1e-6) this.resetMission(this.game.mission);
    this.lastTime = this.world.time;
    if (!name) return `specials: ${SPECIAL_IDS.join(', ')} · tactics: companyFront, schwarm, pincer, comet, jet, standoff, topCover, zerstorer-tactic, bigGun, pfeil, raid`;
    if ((SPECIAL_IDS as string[]).includes(name)) {
      if (this.bossUp()) return 'boss fight in progress';
      if (this.roundIdx < 0) this.newRound(0, this.world.time);
      this.start(name as SpecialId);
      return `special ${name} started`;
    }
    return this.tactics.dev(name === 'zerstorer-tactic' ? 'zerstorer' : name);
  }
}


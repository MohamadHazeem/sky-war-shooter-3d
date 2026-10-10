import type { MidRound } from './MidRound';
import { Aircraft, Bomber, Fighter } from '../world/Aircraft';
import { STATIONS } from '../world/B17Layout';
import type { CardView } from '../ui/ObjectiveCard';
import { tx } from '../i18n';

// Bonus objectives that pop up mid-round (scheduled by MidRound): a HUD card with a title,
// progress and timer, a radio line to announce it and merit on success.

export type ObjectiveId = 'protect' | 'pathfinder' | 'coolHead' | 'clearTail' | 'sharpshooter' | 'noLoss';
export interface Mark { a: Aircraft; label: string }

export abstract class Objective {
  abstract readonly id: ObjectiveId;
  title = '';
  desc = '';
  merit = 100;
  limit = 30;        // s (MidRound trims it to what is left of the round)
  timeLeft = 30;
  goal = 1;
  progress = 0;
  state: 'active' | 'won' | 'lost' = 'active';
  failText = '';

  start(_c: MidRound) {}
  update(_dt: number, _c: MidRound) {}
  onKill(_v: Aircraft, _byPlayer: boolean, _c: MidRound) {}
  // time limit reached: most objectives fail, survival ones succeed
  timeout(_c: MidRound) { this.state = 'lost'; this.failText = tx('out of time'); }
  cancel(_c: MidRound) {}
  end(_c: MidRound) {}
  tags(): Mark[] { return []; }
  protected frac() { return this.goal > 0 ? this.progress / this.goal : 0; }
  protected progressText() { return `${this.progress} / ${this.goal}`; }
  protected win() { if (this.state === 'active') this.state = 'won'; }
  protected lose(why: string) { if (this.state === 'active') { this.state = 'lost'; this.failText = why; } }

  view(): CardView {
    const t = Math.max(0, Math.ceil(this.timeLeft));
    return {
      title: this.title, desc: this.desc, merit: this.merit,
      progress: this.frac(), progressText: this.progressText(),
      timeFrac: this.limit > 0 ? this.timeLeft / this.limit : 0,
      timeText: `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`,
    };
  }
}

// A kill the player is credited with, on an enemy aircraft
const myKill = (v: Aircraft, byPlayer: boolean) => byPlayer && v.team === 'axis';

// ---------------------------------------------------------------- Protect the <bomber>
class Protect extends Objective {
  readonly id = 'protect';
  private attackers: Fighter[] = [];
  constructor(private b: Bomber) {
    super();
    this.title = tx('Protect the {name}', { name: b.name });
    this.desc = tx('She\'s shot up and the fighters smell blood. Keep her flying.');
    this.limit = 30; this.merit = 150;
  }
  start(c: MidRound) {
    const b = this.b;
    // visibly hurt: one engine out (trailing smoke), the rest of her worn down
    for (const z of b.zones) if (z.hp > 0) z.hp = Math.min(z.hp, z.maxHp * 0.7);
    if (b.enginesOut === 0) {
      const e = b.zones.filter((z) => z.engine !== undefined && z.hp > 0);
      const z = e[Math.floor(Math.random() * e.length)];
      if (z) { z.hp = 0; (z as any).destroyed = true; b.engineDead[z.engine!] = true; }
    }
    this.attackers = c.spawnAttackers(b, 3 + Math.min(2, c.round), { from: 'any', dist: 2100 });
    c.radio('protect', b.name, `${b.name} to group: we're hit bad and they're lining up on us. Cover us!`);
  }
  update(_dt: number, _c: MidRound) {
    if (!this.b.alive) this.lose(tx('{name} went down', { name: this.b.name }));
  }
  timeout(c: MidRound) {
    if (!this.b.alive) { this.lose(tx('{name} went down', { name: this.b.name })); return; }
    this.win();
    c.radio('protectok', this.b.name, `${this.b.name} here. Thanks for the cover — we owe you one.`);
  }
  end(c: MidRound) { c.unpin(this.attackers); }
  tags(): Mark[] { return [{ a: this.b, label: this.b.name.toUpperCase() }]; }
  protected frac() { return 1 - this.timeLeft / this.limit; }
  protected progressText() { return tx('hold {n} s', { n: Math.max(0, Math.ceil(this.timeLeft)) }); }
}

// ---------------------------------------------------------------- Down the pathfinder
class Pathfinder extends Objective {
  readonly id = 'pathfinder';
  private f: Fighter | null = null;
  constructor() {
    super();
    this.title = tx('Down the pathfinder');
    this.desc = tx('A marked Ju 88 is shadowing the box and calling in the fighters. Shoot it down before it gets away.');
    this.limit = 45; this.merit = 175;
  }
  start(c: MidRound) {
    const target = c.role === 'gunner' ? c.world.playerBomber : c.nearbyBomber();
    if (!target) { this.lose(tx('no target')); return; }
    this.f = c.spawnAttackers(target, 1, { from: 'front', dist: 1900, type: 'ju88', attack: 'headon' })[0];
    // a lighter shadower than the armoured Ju 88 in the fighter waves: one good pass downs it
    this.f.structure = this.f.maxStructure = this.f.maxStructure * 0.5;
    this.f.label = 'Ju 88 pathfinder';
    c.radio('pathfinder', 'Navigator', 'Ju 88 out ahead, all alone — that\'s a pathfinder calling the fighters onto us. Knock him down!');
  }
  update(_dt: number, _c: MidRound) {
    const f = this.f;
    if (f && (!f.alive || f.remove)) { this.progress = 1; this.win(); }
  }
  timeout(c: MidRound) {
    if (this.f && !this.f.alive) { this.win(); return; }
    if (this.f) c.withdraw(this.f);
    this.lose(tx('he got away'));
    c.radio('pathfinderaway', 'Tail', 'The Ju 88\'s turning for home — he got away!');
  }
  tags(): Mark[] { return this.f && this.f.alive ? [{ a: this.f, label: tx('PATHFINDER') }] : []; }
  protected frac() { return this.f ? 1 - Math.max(0, this.f.structureFrac) : 0; }
  protected progressText() { return this.f && this.f.alive ? tx('{n}% left', { n: Math.round(Math.max(0, this.f.structureFrac) * 100) }) : tx('down'); }
}

// ---------------------------------------------------------------- 3 kills without overheating
class CoolHead extends Objective {
  readonly id = 'coolHead';
  private station = '';
  private hot = false;
  constructor() {
    super();
    this.title = tx('Cool barrel');
    this.desc = tx('Down 3 fighters without overheating your gun. Short bursts.');
    this.goal = 3; this.limit = 60; this.merit = 120;
  }
  start(c: MidRound) {
    this.station = c.game.gunner.station; this.hot = c.game.gunner.state.overheated;
    c.radio('coolhead', 'Pilot', 'Gunner, short bursts! Three of them on a cool barrel and the first round\'s on me.');
  }
  update(_dt: number, c: MidRound) {
    const g = c.game.gunner, hot = g.state.overheated;
    if (g.station === this.station && hot && !this.hot) this.lose(tx('barrel overheated'));
    this.station = g.station; this.hot = hot;
  }
  onKill(v: Aircraft, byPlayer: boolean) {
    if (!myKill(v, byPlayer)) return;
    if (++this.progress >= this.goal) this.win();
  }
  protected progressText() { return tx('{n} / {m} kills', { n: this.progress, m: this.goal }); }
}

// ---------------------------------------------------------------- Clear the tail
class ClearTail extends Objective {
  readonly id = 'clearTail';
  private marked: Fighter[] = [];
  constructor(private gunner: boolean) {
    super();
    this.title = tx('Clear the tail');
    this.desc = gunner ? tx('Two fighters are boring in from six o\'clock. Take the tail gun ({key}) and get them both.', { key: STATIONS.tail.key }) : tx('Two bandits are working over the box from six o\'clock. Get them both.');
    this.goal = 2; this.limit = 45; this.merit = 140;
  }
  start(c: MidRound) {
    const target = this.gunner ? c.world.playerBomber : c.nearbyBomber();
    if (!target) { this.lose(tx('no target')); return; }
    this.marked = c.spawnAttackers(target, 2, { from: 'rear', dist: 2000, attack: 'stern', station: this.gunner ? 'tail' : undefined, type: Math.random() < 0.5 ? 'fw190' : 'bf109' });
    c.radio('cleartail', 'Tail', 'Two of them sitting at six o\'clock — coming straight up our tail!');
    if (this.gunner && c.game.gunner.station !== 'tail') c.ui.tip(`Fighters at six o'clock — press <kbd>${STATIONS.tail.key}</kbd> for the TAIL gun`, 3200);
  }
  // a kill counts if it is one of the two marked fighters or anything else in the rear sector
  private inRear(v: Aircraft, c: MidRound) {
    const w = c.world, ref = (this.gunner ? w.playerBomber?.pos : null) ?? w.formationCenter;
    const rel = v.pos.clone().sub(ref);
    const along = rel.dot(w.formationForward);
    const lateral = rel.addScaledVector(w.formationForward, -along).length();
    return along < 0 && lateral < -along * 1.2;
  }
  onKill(v: Aircraft, byPlayer: boolean, c: MidRound) {
    if (!myKill(v, byPlayer)) return;
    if (!this.marked.includes(v as Fighter) && !this.inRear(v, c)) return;
    if (++this.progress >= this.goal) this.win();
  }
  end(c: MidRound) { c.unpin(this.marked); }
  tags(): Mark[] { return this.marked.filter((f) => f.alive).map((f) => ({ a: f, label: tx('SIX O\'CLOCK') })); }
  protected progressText() { return tx('{n} / {m} kills', { n: this.progress, m: this.goal }); }
}

// ---------------------------------------------------------------- Sharpshooter
class Sharpshooter extends Objective {
  readonly id = 'sharpshooter';
  constructor(private range: number) {
    super();
    this.title = tx('Sharpshooter');
    this.desc = tx('Down 3 fighters at more than {range} m. Lead them early.', { range });
    this.goal = 3; this.limit = 75; this.merit = 160;
  }
  start(c: MidRound) {
    c.radio('sharp', c.role === 'gunner' ? 'Bombardier' : 'Lead', c.role === 'gunner' ? 'Reach out and touch them, gunner — don\'t wait till they\'re on top of us.' : 'Blue Leader, take your shots long. Break them up before they reach the bombers.');
  }
  onKill(v: Aircraft, byPlayer: boolean, c: MidRound) {
    if (!myKill(v, byPlayer)) return;
    const p = c.playerPos();
    const d = p ? v.pos.distanceTo(p) : 0;
    if (d >= this.range) {
      this.progress++;
      c.ui.feed(`Long shot — ${Math.round(d)} m`, 'mine');
      if (this.progress >= this.goal) this.win();
    } else c.ui.tip(`Too close for Sharpshooter — ${Math.round(d)} m (need ${this.range} m)`, 1800);
  }
  protected progressText() { return tx('{n} / {m} long kills', { n: this.progress, m: this.goal }); }
}

// ---------------------------------------------------------------- No bomber lost this round
class NoLoss extends Objective {
  readonly id = 'noLoss';
  private lost0 = 0;
  constructor(c: MidRound) {
    super();
    this.title = tx('Hold the box');
    this.desc = tx('No Fortress goes down for the rest of this round.');
    this.limit = Math.max(20, c.roundLeft - 1); this.merit = 200;
  }
  start(c: MidRound) {
    this.lost0 = c.world.stats.bombersLost;
    c.radio('noloss', c.role === 'gunner' ? 'Pilot' : 'Big Friend', c.role === 'gunner' ? 'Group lead says hold it together — nobody drops out of this box!' : 'Little friends, stay close. We can\'t afford to lose another ship.');
  }
  update(_dt: number, c: MidRound) {
    if (c.world.stats.bombersLost > this.lost0) this.lose(tx('a B-17 went down'));
  }
  timeout(c: MidRound) {
    if (c.world.stats.bombersLost > this.lost0) this.lose(tx('a B-17 went down')); else this.win();
  }
  protected frac() { return 1 - this.timeLeft / this.limit; }
  protected progressText() { return tx('{n} s to go', { n: Math.max(0, Math.ceil(this.timeLeft)) }); }
}

export interface ObjectiveDef { eligible(c: MidRound): boolean; create(c: MidRound): Objective }

export const OBJECTIVES: Record<ObjectiveId, ObjectiveDef> = {
  protect: {
    eligible: (c) => c.aliveBombers().filter((b) => !b.straggling).length >= 2,
    create: (c) => new Protect(c.nearbyBomber()!),
  },
  pathfinder: { eligible: () => true, create: () => new Pathfinder() },
  coolHead: { eligible: (c) => c.role === 'gunner', create: () => new CoolHead() },
  clearTail: { eligible: (c) => c.role === 'pilot' || !!c.world.playerBomber?.alive, create: (c) => new ClearTail(c.role === 'gunner') },
  sharpshooter: { eligible: () => true, create: (c) => new Sharpshooter(c.role === 'gunner' ? 500 : 350) },
  noLoss: { eligible: (c) => c.roundLeft >= 30 && c.aliveBombers().length >= 2, create: (c) => new NoLoss(c) },
};

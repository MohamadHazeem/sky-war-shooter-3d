import type { Game } from './Game';
import type { Fighter } from '../world/Aircraft';
import { tx } from '../i18n';
import { sound } from '../audio/Sound';
import {
  ASK_AT, CHOICE_KEYS, DECIDE_TIME, FUEL, HUNTER_TIMES, LIMP_RADIO, LIMP_TEXT, ROUTE, burnRate, choiceLabel, decide, distanceLeft,
  ALL_HANDS, CREW_SEATS, PLAYER_WEIGHT, internReason, shortLabel, limpingDue, neutralFor, options, startFuel, tally, type LimpChoice, type LimpState, type Neutral, type Tally,
} from './LimpingHomeRules';

// Limping home (Phase 11 goal 12). When a campaign gunner mission would end in success but the ship is
// badly hurt (engines out, a holed tank, a shot-up airframe), the return leg becomes gameplay: the fuel
// gauge runs down, she may fall out of the formation, German fighters come for the straggler, and the crew
// votes, with the gunner's vote counted three times, on where to take her: home with the box, the emergency
// strip at Woodbridge, the Channel and Air-Sea Rescue (the existing Ditching scene), or a neutral country
// (internment, which ends the tour). Rules and numbers: LimpingHomeRules.ts.
//
// Hooks: MissionFlow.finish asks intercept() first; Game.frame calls frame(dt) next to midRound.update;
// Ditching.eligible defers to `ditch` / `owns`; reset() from MissionFlow.startMission, release() from the menus.
const CSS = `
#limpHome { position: fixed; left: 16px; top: 236px; width: min(30vw, 330px); box-sizing: border-box; padding: 8px 11px 9px; z-index: 44;
  background: rgba(10,14,10,.88); border-inline-start: 3px solid #c6a85e; color: #efe6cf; font: 12px/1.35 inherit; text-align: start; pointer-events: none; }
#limpHome .lh-k { font-size: 10px; letter-spacing: 2px; color: #c6a85e; }
#limpHome .lh-s { font-size: 11px; opacity: .85; margin: 2px 0 4px; }
#limpHome .lh-f { display: flex; align-items: center; gap: 7px; font-size: 11px; }
#limpHome .lh-f .bar { flex: 1; height: 7px; background: #fff2; }
#limpHome .lh-f .bar i { display: block; height: 100%; background: #c6a85e; width: 0; }
#limpHome.low .lh-f .bar i { background: #d0573f; }
#limpHome .lh-q { margin-top: 7px; font-size: 12px; color: #c6a85e; }
#limpHome .lh-o { display: flex; gap: 6px; align-items: baseline; margin-top: 4px; padding: 3px 5px; border: 1px solid #fff2; pointer-events: auto; cursor: pointer; }
#limpHome .lh-o kbd { font-size: 10px; padding: 0 4px; border: 1px solid #c6a85e; }
#limpHome .lh-o .l { flex: 1; }
#limpHome .lh-o .v { font-size: 10px; opacity: .8; white-space: nowrap; }
#limpHome .lh-o.mine { border-color: #c6a85e; background: #c6a85e22; }
#limpHome .lh-o.win { border-color: #efe6cf; }
#limpHome .lh-r { margin-top: 6px; font-size: 13px; }
#limpHome .lh-c { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 8px; margin-top: 6px; padding-top: 5px; border-top: 1px solid #fff2; font-size: 10px; line-height: 1.3; }
#limpHome .lh-c .cv { opacity: .62; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#limpHome .lh-c .cv.on { opacity: 1; color: #efe6cf; }
#limpHome .lh-c .cv.me { color: #c6a85e; opacity: 1; }
#limpHome .lh-n { margin-top: 4px; font-size: 10px; color: #d9a07a; }
@media (max-height: 520px) { #limpHome { top: 120px; padding: 4px 7px; } #limpHome .lh-s { display: none; } }
`;

export class LimpingHome {
  /** The leg is being flown (the mission's success ending is on hold). */
  active = false;
  /** The crew chose (or ran dry into) the sea: Ditching takes the ending. */
  ditch = false;
  /** Landed in a neutral country this mission (MissionFlow / campaign report). */
  interned: Neutral | null = null;
  diverted = false;
  t = 0;
  flown = 0;
  choice: LimpChoice | null = null;
  vote: LimpChoice | null = null;
  readonly state: LimpState = { fuel: 0, enginesOut: 0, leaking: false, wounded: 0, neutral: null, straggling: false };
  private used = false;
  private resolving = false;
  private reason = '';
  private opts: LimpChoice[] = [];
  private votes: Tally | null = null;
  private votedAt = -1;
  private said = new Set<string>();
  private hunters: Fighter[] = [];
  private nextHunter = 0;
  private uiT = 0;
  private root: HTMLElement | null = null;
  private html = '';

  constructor(private g: Game) {}

  /** Dev (sws.limp): treat the tanks as holed even without a hit on them. */
  forceLeak = false;
  /** Dev (sws.ditch): no return leg this mission. */
  skip() { this.used = true; }

  /** The crew's decision owns the ending once the leg has started, until the next mission. */
  get owns() { return this.active || this.choice !== null; }

  /** MissionFlow.finish, before anything else. True: the ending waits for the leg. */
  intercept(success: boolean, reason: string): boolean {
    if (this.resolving) return false;
    if (this.active) {
      if (success) return true;   // the director keeps declaring victory; the leg decides when
      this.stop();                // shot down, too many losses, the gunner wounded: that ending stands
      return false;
    }
    if (!success || this.used || !this.due()) return false;
    this.begin(reason);
    return true;
  }

  private due(): boolean {
    const g = this.g, m = g.mission, b = g.world.playerBomber;
    if (!m || !b || g.endResult || g.state !== 'playing' || g.aa.active) return false;
    return limpingDue({
      campaign: !!m.number && !m.tutorial && Number.isFinite(m.duration), gunner: m.role === 'gunner', coop: !!g.coop.role,
      alive: b.alive && !b.remove, enginesOut: b.enginesOut, initialEnginesOut: m.playerDamaged ? 2 : 0,
      integrity: b.integrity, initialIntegrity: m.playerDamaged ? 0.7 : 1, leaking: this.leaking(),
    });
  }

  private leaking() { return this.forceLeak || this.g.world.bomberDamage.fuelLeaking; }

  private begin(reason: string) {
    const g = this.g, b = g.world.playerBomber!, s = this.state;
    this.used = this.active = true; this.reason = reason; this.t = this.flown = 0; this.choice = this.vote = null;
    this.votes = null; this.votedAt = -1; this.said.clear(); this.nextHunter = 0; this.uiT = 0;
    s.enginesOut = b.enginesOut; s.leaking = this.leaking(); s.wounded = g.world.crewWounded;
    s.neutral = neutralFor(g.mission!.target); s.straggling = b.straggling || b.enginesOut >= 2;
    s.fuel = startFuel(s.leaking, s.enginesOut);
    if (s.enginesOut >= 2) b.straggling = true;
    g.ui.banner(LIMP_TEXT.title, LIMP_TEXT.sub, 3200);
    this.say('start', 0);
    this.mount();
  }

  frame(dt: number) {
    if (!this.active) return;
    const g = this.g, b = g.world.playerBomber;
    if (g.endResult || !g.mission) { this.stop(); return; }
    if (g.state !== 'playing' || !b || !b.alive) return;   // the director handles a ship going down
    const s = this.state;
    this.t += dt;
    s.enginesOut = b.enginesOut; s.leaking = this.leaking(); s.wounded = g.world.crewWounded;
    s.straggling = b.straggling;
    // the route's fuel counts from the decision; until then only the holes drain the tanks (decide quickly)
    s.fuel = Math.max(0, s.fuel - (this.choice ? burnRate(this.choice, s.enginesOut, s.leaking) : s.leaking ? FUEL.leakPerS : 0) * dt);
    if (this.t >= 2.5) this.say(s.leaking ? 'leak' : 'noLeak', 2.5);
    if (this.t >= 4.5 && s.straggling) this.say('behind', 4.5);
    this.huntStragglers(b);
    if (!this.choice) this.ask();
    else {
      this.flown += dt;
      if (s.fuel <= 0 && this.choice !== 'ditch') {
        // ran the tanks dry: the sea it is, whatever was decided
        this.choice = 'ditch'; this.flown = ROUTE.ditch.time - 3; this.say('dry', this.t);
      }
      if (this.choice === 'neutral' && this.flown >= ROUTE.neutral.time * 0.5) this.say('border', this.t);
      if ((this.choice === 'home' || this.choice === 'divert') && this.flown >= ROUTE[this.choice].time - 10) this.say('coast', this.t);
      if (this.flown >= ROUTE[this.choice].time) { this.arrive(this.choice); return; }
    }
    this.uiT -= dt;
    if (this.uiT <= 0) { this.uiT = 0.1; this.render(); }
  }

  private ask() {
    if (this.t < ASK_AT) return;
    const s = this.state;
    if (!this.votes) {
      this.opts = options(s); this.votes = tally(s, this.opts); this.say('ask', ASK_AT);
      sound.play('click', null, { gain: 0.5 });
    }
    const input = this.g.input;
    for (let i = 0; i < this.opts.length; i++) if (input.hit(CHOICE_KEYS[i])) this.pick(this.opts[i]);
    const waited = this.t - ASK_AT;
    // a vote settles it 1.5 s later (the card shows the hands go up); silence leaves it to the crew
    if ((this.votedAt >= 0 && this.t - this.votedAt >= 1.5) || waited >= DECIDE_TIME) this.commit(decide(s, this.vote, this.opts));
  }

  /** The gunner's vote (keys 7/8/9/0, or a tap on the card). */
  pick(c: LimpChoice) {
    if (!this.active || this.choice || !this.votes || !this.opts.includes(c)) return;
    this.vote = c; if (this.votedAt < 0) this.votedAt = this.t;
    sound.play('click', null, { gain: 0.6 });
    this.uiT = 0;
  }

  private commit(c: LimpChoice) {
    const g = this.g, b = g.world.playerBomber!;
    this.choice = c; this.flown = 0;
    // anything but staying with the box takes her out of the formation, alone
    if (c !== 'home') { b.straggling = true; this.state.straggling = true; }
    this.say(c, this.t);
    g.ui.tip(tx(LIMP_TEXT.crewDecided, { choice: tx(choiceLabel(c, this.state.neutral)) }), 3500);
  }

  // German fighters hunt stragglers: a pair at each of HUNTER_TIMES while she is alone (none over neutral air)
  private huntStragglers(b: NonNullable<Game['world']['playerBomber']>) {
    if (this.nextHunter >= HUNTER_TIMES.length || this.t < HUNTER_TIMES[this.nextHunter]) return;
    this.nextHunter++;
    if (!this.state.straggling) return;
    if (this.choice === 'neutral' && this.flown >= ROUTE.neutral.time * 0.4) return;
    if (this.choice === 'ditch') return;
    this.hunters.push(...this.g.midRound.spawnAttackers(b, 2, { from: 'rear', dist: 2200 }));
    this.say('hunters' + this.nextHunter, this.t, LIMP_RADIO.hunters);
  }

  private arrive(c: LimpChoice) {
    const g = this.g, b = g.world.playerBomber!;
    const reason = this.reason;
    this.stop();
    this.resolving = true;
    try {
      if (c === 'ditch') { this.ditch = true; g.flow.finish(true, reason); return; }
      if (c === 'neutral') {
        const n = this.state.neutral ?? 'Switzerland';
        this.interned = n;
        g.world.stats.bombersLost++;   // the group loses the ship as surely as if she had gone down
        b.straggling = true;
        g.flow.finish(true, internReason(n));
        g.ui.banner(LIMP_TEXT.internTag, choiceLabel('neutral', n), 3500);
        return;
      }
      if (c === 'divert') this.diverted = true;
      g.flow.finish(true, c === 'divert' ? LIMP_TEXT.divertReason : reason);
    } finally { this.resolving = false; }
  }

  private say(key: string, _at: number, line: readonly [string, string] = (LIMP_RADIO as Record<string, readonly [string, string]>)[key]) {
    if (this.said.has(key) || !line) return;
    this.said.add(key);
    this.g.world.callout('limp_' + key, line[0], line[1], 0, 3);
  }

  // ---------- the card (simple: fuel, state, then the vote) ----------
  private mount() {
    if (typeof document === 'undefined') return;
    if (!document.getElementById('limpHomeCss')) {
      const st = document.createElement('style'); st.id = 'limpHomeCss'; st.textContent = CSS; document.head.appendChild(st);
    }
    this.root?.remove();
    const r = this.root = document.createElement('div');
    r.id = 'limpHome';
    r.addEventListener('pointerdown', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-limp]');
      if (!el) return;
      e.preventDefault(); e.stopPropagation();
      this.pick(el.dataset.limp as LimpChoice);
    });
    document.body.appendChild(r);
    this.render();
  }

  private render() {
    const r = this.root, s = this.state;
    if (!r) return;
    const fuel = Math.round(s.fuel * 100);
    const status = [tx(LIMP_TEXT.engines, { n: 4 - s.enginesOut })];
    if (s.leaking) status.push(tx(LIMP_TEXT.leak));
    if (s.straggling) status.push(tx(LIMP_TEXT.behind));
    let body = '';
    if (this.choice) {
      const left = distanceLeft(this.choice, this.flown, s.neutral);
      body = `<div class="lh-r">${esc(tx(choiceLabel(this.choice, s.neutral)))}</div><div class="lh-s">${esc(s.fuel <= 0 ? tx(LIMP_TEXT.dry) : tx(LIMP_TEXT.kmTo, { km: left }))}</div>`;
    } else if (this.votes) {
      const t = this.votes = tally(s, this.opts);   // hands change as the gauges fall
      const winner = decide(s, this.vote, this.opts);
      const mine = this.vote;
      body = `<div class="lh-q">${esc(tx(LIMP_TEXT.ask))}</div>` + this.opts.map((c, i) => {
        const n = t.votes[c] + (mine === c ? PLAYER_WEIGHT : 0);
        return `<div class="lh-o${mine === c ? ' mine' : ''}${winner === c ? ' win' : ''}" data-limp="${c}"><kbd>${CHOICE_KEYS[i].slice(5)}</kbd><span class="l">${esc(tx(choiceLabel(c, s.neutral)))}</span><span class="v">${esc(n === 1 ? tx(LIMP_TEXT.vote1) : tx(LIMP_TEXT.votes, { n }))}</span></div>`;
      }).join('');
      // every man's hand, so the nine personalities show: "Engineer: Woodbridge"
      const hand = (seat: string, c: LimpChoice | null, cls: string) =>
        `<span class="${cls}${c && c === winner ? ' on' : ''}">${esc(tx(LIMP_TEXT.seatVote, { seat: tx(seat), choice: c ? tx(shortLabel(c, s.neutral)) : tx(LIMP_TEXT.undecided) }))}</span>`;
      body += `<div class="lh-c">${CREW_SEATS.map((k) => hand(k, t.seat[k], 'cv')).join('')}${hand(LIMP_TEXT.you, mine, 'cv me')}</div>`;
      if (this.opts.includes('neutral')) body += `<div class="lh-n">${esc(tx(LIMP_TEXT.majority, { n: Math.floor(ALL_HANDS / 2) + 1, all: ALL_HANDS }))}</div>`;
      body += `<div class="lh-s">${esc(mine ? tx(LIMP_TEXT.yourVote, { choice: tx(choiceLabel(mine, s.neutral)) }) : tx(LIMP_TEXT.press, { keys: this.opts.map((_, i) => CHOICE_KEYS[i].slice(5)).join('/'), s: Math.max(0, Math.ceil(DECIDE_TIME - (this.t - ASK_AT))) }))}</div>`;
    }
    const html = `<div class="lh-k">${esc(tx(LIMP_TEXT.title))}</div><div class="lh-s">${esc(status.join(' · '))}</div>`
      + `<div class="lh-f"><span>${esc(tx(LIMP_TEXT.fuel))}</span><span class="bar"><i style="width:${Math.min(100, fuel * 2.5)}%"></i></span><b>${fuel}%</b></div>${body}`;
    if (html !== this.html) { this.html = html; r.innerHTML = html; }
    r.classList.toggle('low', s.fuel < 0.08);
  }

  /** End the leg (UI and pins); the outcome flags stay for the debrief. */
  private stop() {
    if (this.hunters.length) { this.g.midRound.unpin(this.hunters); this.hunters.length = 0; }
    this.active = false;
    this.root?.remove(); this.root = null; this.html = '';
  }
  release() { this.stop(); }
  reset() {
    this.stop();
    this.used = this.ditch = this.diverted = this.forceLeak = false; this.interned = null; this.choice = this.vote = null; this.votes = null;
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

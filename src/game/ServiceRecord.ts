// ServiceRecord: wires the career, medals-with-rewards, daily orders, the Daily Run and the
// expanded achievements into the game with as few Game.ts hooks as possible.
//
// Game.ts hooks (one line each):
//   constructor (last line)      this.service = new ServiceRecord(this, ui, { showBriefing: (m) => this.showBriefing(m) });
//   startMenu, after onTitle()   this.service.onTitle();
//   startMission (last line)     this.service.onMissionStart(m);
//   showDebrief, after medals    medals.push(...this.service.bonusMedals(m, r.success, medals));
//   showDebrief (last line)      this.service.onDebrief(m, d, medals);
//
// Everything else is attached from here without touching Game.ts:
//   - world.events.kill is chained (Game's handler runs first) to count kills by type, bosses,
//     streaks and gun positions, and to advance the daily orders live;
//   - abilities.trigger is chained to count Overdrive uses;
//   - Game's private director() and awardPerk() run on the Daily Run's seeded random stream
//     while a Daily Run is in progress (Math.random is swapped only for those calls); the
//     Weekly Challenge (Weekly.ts) runs on its week's seed the same way;
//   - a completed Weekly Challenge pays its once-a-week reward with the medals at the debrief.
import type { Game } from './Game';
import type { UI, DebriefData } from '../ui/UI';
import type { Aircraft } from '../world/Aircraft';
import { CAMPAIGN, survivalMission, type Mission } from './Missions';
import { achievements } from './Achievements';
import {
  type CareerData, type Reward, RANKS, PROMOTION_REWARDS, grantReward, loadCareer, medalDef, rankFor, saveCareer, xpForMission,
} from './Career';
import { type DailyDef, DailyTracker, dailySeed, dayKey, hashString, mulberry32, withRandom } from './Dailies';
import { dailyMode } from '../net/Leaderboard';
import { skillPointsFor } from './Skills';
import { claimWeekly, weeklyKeyOf, weeklySeed, WEEKLY_NOSE_NAME } from './Weekly';
import { pushSave } from '../net/CloudSave';
import { mountLeaderboard } from '../ui/LeaderboardPanel';
import { showCareerScreen } from '../ui/CareerScreen';
import { showTrophyScreen } from '../ui/TrophyScreen';
import { showDailyScreen } from '../ui/DailyScreen';
import { esc, insigniaSvg } from '../ui/serviceCommon';
import { num, tx } from '../i18n';
import '../ui/career.css';

const STREAK_WINDOW = 9;   // seconds between kills to keep a streak (same as Game)
const HEAVY = new Set(['bf110', 'ju88']);
const FAST = new Set(['me262', 'me163']);

export interface ServiceHost { showBriefing(m: Mission): void }

interface MissionBuf {
  m: Mission;
  tracked: boolean;          // false for the tutorial
  dailyKey: string | null;   // set on a Daily Run (the day it was started)
  xpStart: number;
  kills: Record<string, number>;
  bosses: number;
  streak: number;
  bestStreak: number;
  lastKillAt: number;
  stations: Record<string, number>;
  overdrives: number;
  dailies: DailyDef[];       // orders completed during this mission
}

interface RewardLine { label: string; text: string; ribbon?: string; first?: boolean }

// Daily Run mission for a role on a day: Survival with fixed weather and a fixed seed
export function dailyRunMission(role: 'gunner' | 'pilot', key = dayKey()): Mission {
  const rng = mulberry32(dailySeed(key, role) ^ 0x5eed);
  const presets = CAMPAIGN.map((c) => c.weather).filter((w): w is NonNullable<typeof w> => !!w);
  const m = survivalMission(role);
  const pretty = `${key.slice(6, 8)}.${key.slice(4, 6)}.${key.slice(0, 4)}`;
  return {
    ...m, id: `daily-${role}`, title: role === 'gunner' ? 'Daily Run — Gunner' : 'Daily Run — Escort', date: `Daily Run · ${pretty}`,
    weather: presets.length ? presets[Math.floor(rng() * presets.length)] : m.weather,
    briefing: ['Today\'s Daily Run: the same skies and the same enemy schedule for every crew on the board. One score per sortie goes to the daily leaderboard. Make it count.'],
    objectives: ['Survive as many rounds as possible', 'Post a score on today\'s board'],
  };
}

export class ServiceRecord {
  readonly career: CareerData;
  readonly daily = new DailyTracker();
  private buf: MissionBuf | null = null;
  private runSeed: number | null = null;   // Daily Run seed while one is in progress
  private toastHost: HTMLElement | null = null;

  // ui is taken for symmetry with Onboarding / Abilities; the screens build their own layers
  constructor(private game: Game, _ui: UI, private host: ServiceHost) {
    this.career = loadCareer();
    saveCareer(this.career);
    this.daily.onComplete = (d) => this.dailyCompleted(d);
    this.daily.onPerfect = () => {
      this.career.dailyPerfectDays++;
      saveCareer(this.career);
      this.toast(tx('ALL ORDERS COMPLETE'), tx('Clean sheet: every daily order carried out'), '');
    };
    this.chainEvents();
    achievements.checkStats(this.career);
  }

  // ---------------- attachment (no Game.ts edits) ----------------
  private chainEvents() {
    const g = this.game as any;
    const ev = this.game.world.events;
    const prevKill = ev.kill;
    ev.kill = (victim, byPlayer, cause) => {
      prevKill?.(victim, byPlayer, cause);
      if (byPlayer && victim.team === 'axis') this.onKill(victim);
    };
    const ab = this.game.abilities;
    const trigger = ab.trigger.bind(ab);
    ab.trigger = (id, force = false) => {
      const ok = trigger(id, force);
      if (ok && id === 'overdrive' && this.buf?.tracked) { this.buf.overdrives++; this.daily.record('overdrive', 1); }
      return ok;
    };
    // Daily Run: spawns and field upgrades draw from the day's seed. Each spawn group gets its
    // own stream keyed on (seed, round, group) and each field upgrade on (seed, perks held), so
    // group N of round R is the same for everyone however the earlier fighting went (only the
    // group size can still be clamped by how many fighters are already in the air).
    const seeded = (name: string, key: () => string) => {
      const fn = g[name];
      if (typeof fn !== 'function') return;
      g[name] = (...args: unknown[]) => (this.runSeed !== null
        ? withRandom(mulberry32(hashString(`${this.runSeed}:${key()}`)), () => fn.apply(g, args))
        : fn.apply(g, args));
    };
    seeded('director', () => `grp:${g.roundIdx ?? 0}:${g.groups ?? 0}`);
    seeded('awardPerk', () => `perk:${this.game.prog.perks.length}`);
  }

  // ---------------- hooks ----------------
  // Game.startMenu(), after onboarding.onTitle(): Daily Orders, Career and Trophies entries
  onTitle() {
    this.runSeed = null;
    this.buf = null;
    const menu = document.querySelector<HTMLElement>('#title .menu');
    if (!menu) return;
    const before = menu.querySelector('[data-a="armory"]');
    const add = (a: string, html: string, onClick: () => void) => {
      menu.querySelector(`[data-a="${a}"]`)?.remove();
      const b = document.createElement('button');
      b.dataset.a = a;
      b.innerHTML = html;
      b.addEventListener('click', onClick);
      menu.insertBefore(b, before);
    };
    const done = this.daily.doneCount();
    const r = rankFor(this.career.xp);
    add('daily', `${tx('Daily Orders')} <small>${tx('{done}/3 done · Daily Run', { done })}</small>${done < 3 ? `<i class="svc-dot" aria-label="${tx('orders waiting')}"></i>` : ''}`, () => this.openDaily());
    add('career', `${tx('Career')} <small>${tx(r.rank.name)} · ${tx('{n} XP', { n: num(this.career.xp) })}</small>`, () => this.openCareer());
    add('trophies', `${tx('Trophies')} <small>${tx('{n} unlocked', { n: achievements.count() })}</small>`, () => this.openTrophies());
    menu.classList.add('svc-long');
  }

  // Game.startMission(), at the end
  onMissionStart(m: Mission) {
    const daily = m.id.startsWith('daily-') ? this.pendingDailyKey ?? dayKey() : null;
    this.pendingDailyKey = null;
    const week = weeklyKeyOf(m);
    this.runSeed = daily ? dailySeed(daily, m.role) : week ? weeklySeed(week, m.role) : null;
    this.buf = {
      m, tracked: !m.tutorial, dailyKey: daily, xpStart: this.career.xp, kills: {}, bosses: 0, streak: 0, bestStreak: 0,
      lastKillAt: -99, stations: {}, overdrives: 0, dailies: [],
    };
  }
  private pendingDailyKey: string | null = null;

  // Game.showDebrief(), after the built-in medals: the new medals this mission earned
  bonusMedals(m: Mission, success: boolean, medals: string[]): string[] {
    const b = this.buf;
    if (!b?.tracked || b.m !== m) return [];
    const st = this.game.world.stats;
    const out: string[] = [];
    const add = (n: string) => { if (!medals.includes(n) && !out.includes(n)) out.push(n); };
    if (st.kills >= 5) add('Ace in a Day');
    if (m.role === 'gunner' && success && st.shots >= 150 && st.hits / st.shots >= 0.25) add('Gunner\'s Wings');
    if (success && m.duration !== Infinity && st.bombersLost === 0) add('Fortress Defender');
    if (b.bosses > 0) add('Giant Killer');
    return out;
  }

  // Game.showDebrief(), at the end: commit the mission to the record, pay rewards, show them
  onDebrief(m: Mission, d: DebriefData, medals: string[]) {
    const b = this.buf;
    this.runSeed = null;
    if (!b?.tracked || b.m !== m) return;
    const c = this.career, w = this.game.world, prog = this.game.prog;
    const survival = m.duration === Infinity;
    // ---- stats ----
    c.missions++;
    if (d.success) c.wins++;
    if (!d.success && (!w.player?.alive || w.crewWounded >= 4)) c.deaths++;
    c.kills += d.kills;
    c.killsByRole[m.role] += d.kills;
    for (const [t, n] of Object.entries(b.kills)) c.killsByType[t] = (c.killsByType[t] ?? 0) + n;
    for (const [s, n] of Object.entries(b.stations)) c.killsByStation[s] = (c.killsByStation[s] ?? 0) + n;
    c.shots += d.rounds ?? w.stats.shots;
    c.hits += d.hits ?? w.stats.hits;
    c.seconds += Math.max(0, d.time);
    c.bestStreak = Math.max(c.bestStreak, b.bestStreak, d.bestStreak ?? 0);
    c.bosses += b.bosses;
    c.bombersLost += d.bombersLost;
    if (d.success) c.bombersSaved += Math.max(0, d.bombersTotal - d.bombersLost);
    c.overdrives += b.overdrives;
    // ---- daily orders that are judged at the end ----
    if (d.success && !survival && m.number > 0) {
      if (!c.campaignWins.includes(m.id)) c.campaignWins.push(m.id);
      this.daily.record('campaignWins', 1);
      if (d.bombersLost === 0) this.daily.record('noLossWin', 1);
    }
    if (survival) {
      const reached = (d.waves ?? 0) + 1;
      c.bestSurvivalRound = Math.max(c.bestSurvivalRound, reached);
      this.daily.record('survivalRound', reached);
      achievements.onSurvivalWave(reached);
    }
    if ((d.rounds ?? 0) >= 100) this.daily.record('accuracy', Math.floor(d.accuracy * 100));
    if (b.dailyKey) {
      c.dailyRuns++;
      const mode = dailyMode(m.role, keyDate(b.dailyKey));
      c.dailyBest[mode] = Math.max(c.dailyBest[mode] ?? 0, d.score);
      this.daily.record('dailyRun', 1);
    }
    // ---- medals: count each, pay its reward ----
    const lines: RewardLine[] = [];
    for (const name of medals) {
      const def = medalDef(name);
      const n = c.medals[name] ?? 0;
      c.medals[name] = n + 1;
      if (!def) continue;
      const res = grantReward(n === 0 ? def.first : { kind: 'merit', amount: def.repeat }, prog, c.cosmetics);
      lines.push({ label: name, text: res.text, ribbon: def.ribbon, first: n === 0 });
    }
    // ---- weekly challenge: first completion of the week ----
    const wk = claimWeekly(m, d.success, prog);
    if (wk) {
      lines.push({
        label: `Weekly Challenge — week ${+wk.key.slice(4)}`, first: true,
        ribbon: 'repeating-linear-gradient(90deg, #1f2f57 0 8px, #e2b33c 8px 12px, #b3261b 12px 16px, #e2b33c 16px 20px)',
        text: `+${wk.merit} merit · weekly ribbon${wk.nose ? ` · ${WEEKLY_NOSE_NAME} nose art unlocked (hangar)` : ''}`,
      });
    }
    // ---- XP and promotions ----
    const gained = xpForMission({ score: d.score, kills: d.kills, success: d.success, medals: medals.length });
    c.xp += gained;
    const before = rankFor(b.xpStart), after = rankFor(c.xp);
    const promotions: RewardLine[] = [];
    for (let i = before.index + 1; i <= after.index; i++) {
      const r: Reward | null = PROMOTION_REWARDS[i] ?? null;
      const res = r ? grantReward(r, prog, c.cosmetics) : null;
      promotions.push({ label: tx('Promoted to {rank}', { rank: tx(RANKS[i].name) }), text: res?.text ?? '' });
    }
    // skill tree (Skills.ts): points from promotions and from every 3,000 XP past Major
    const sp = skillPointsFor(c.xp) - skillPointsFor(b.xpStart);
    if (sp > 0) promotions.push({ label: sp > 1 ? tx('+{n} skill points', { n: sp }) : tx('+1 skill point'), text: 'Spend in Skills (title menu or hangar)' });
    this.buf = null;   // kept until here so orders completed above are listed as this mission's
    saveCareer(c);
    achievements.checkStats(c);
    pushSave(true);
    this.renderDebrief(d, gained, before.index, lines, promotions, b.dailies);
    if (b.dailyKey) this.swapDailyBoard(m, d, b.dailyKey);
  }

  // ---------------- live tracking ----------------
  private onKill(v: Aircraft) {
    const b = this.buf;
    if (!b?.tracked) return;
    const w = this.game.world;
    const type = (v as any).enemyType || 'fw190';
    b.kills[type] = (b.kills[type] ?? 0) + 1;
    if ((v as any).boss || (v as any).isBoss) b.bosses++;
    b.streak = w.time - b.lastKillAt < STREAK_WINDOW ? b.streak + 1 : 1;
    b.lastKillAt = w.time;
    b.bestStreak = Math.max(b.bestStreak, b.streak);
    const st = b.m.role === 'gunner' ? w.playerStation?.id : undefined;
    if (st) b.stations[st] = (b.stations[st] ?? 0) + 1;
    const dl = this.daily;
    dl.record('kills', 1);
    if (b.m.duration === Infinity) dl.record('survivalKills', 1);
    if (HEAVY.has(type)) dl.record('heavies', 1);
    if (FAST.has(type)) dl.record('jets', 1);
    dl.record(b.m.role === 'pilot' ? 'pilotKills' : 'gunnerKills', 1);
    dl.record('streak', b.streak);
  }

  private dailyCompleted(d: DailyDef) {
    const c = this.career;
    c.dailyDone++;
    c.xp += d.xp;
    this.game.prog.earn(d.merit);
    saveCareer(c);
    this.buf?.dailies.push(d);
    this.toast(tx('DAILY ORDER COMPLETE'), tx(d.text), tx('+{merit} merit · +{xp} XP', { merit: d.merit, xp: d.xp }));
    achievements.checkStats(c);
  }

  // ---------------- screens ----------------
  private openDaily() {
    showDailyScreen({
      tracker: this.daily, career: this.career,
      fly: (role) => { const m = dailyRunMission(role); this.pendingDailyKey = dayKey(); this.host.showBriefing(m); },
      back: () => this.game.startMenu(),
    });
  }
  private openCareer() {
    showCareerScreen(this.career, { back: () => this.game.startMenu(), trophies: () => this.openTrophies() });
  }
  private openTrophies() {
    showTrophyScreen(this.career, { back: () => this.game.startMenu(), career: () => this.openCareer() });
  }

  // ---------------- debrief ----------------
  private renderDebrief(d: DebriefData, gained: number, rankBefore: number, medals: RewardLine[], promos: RewardLine[], dailies: DailyDef[]) {
    const box = document.querySelector<HTMLElement>('#debrief .box');
    if (!box) return;
    box.querySelector('.svc-debrief')?.remove();
    const r = rankFor(this.career.xp);
    const pct = Math.round(r.progress * 100);
    const promoted = r.index > rankBefore;
    const orders = this.daily.list().map((o) => {
      const v = Math.min(o.goal, this.daily.value(o.kind)), done = this.daily.isDone(o), now = dailies.some((x) => x.id === o.id);
      return `<li class="${done ? 'done' : ''} ${now ? 'now' : ''}"><span class="svc-box">${done ? '✔' : ''}</span><span class="svc-otext">${esc(tx(o.text))}</span><span class="svc-oval">${done ? (now ? `+${o.merit}` : tx('done')) : `${v}/${o.goal}`}</span></li>`;
    }).join('');
    const sec = document.createElement('div');
    sec.className = 'svc-debrief';
    sec.innerHTML = `
      <div class="svc-dhead">
        <div class="svc-ins">${insigniaSvg(r.index)}</div>
        <div class="svc-dmain">
          <div class="svc-k">${tx('SERVICE RECORD · {rank}', { rank: esc(tx(r.rank.name).toUpperCase()) })}</div>
          <div class="svc-xpline"><b>${tx('+{n} XP', { n: gained })}</b> · ${tx('{n} XP total', { n: num(this.career.xp) })}${r.next ? ` · ${tx('{n} to {rank}', { n: num(r.next.xp - this.career.xp), rank: esc(tx(r.next.name)) })}` : ` · ${tx('highest rank')}`}</div>
          <div class="svc-bar"><i style="width:${pct}%"></i></div>
        </div>
        ${promoted ? `<div class="svc-stamp svc-stamp-anim">${tx('PROMOTED')}</div>` : ''}
      </div>
      ${promos.length || medals.length ? `<ul class="svc-rewards">
        ${promos.map((p) => `<li class="promo"><span class="svc-rib svc-rib-promo"></span><b>${esc(p.label)}</b><span>${esc(tx(p.text))}</span></li>`).join('')}
        ${medals.map((m) => `<li><span class="svc-rib" style="background:${m.ribbon}"></span><b>${esc(tx(m.label))}</b>${m.first ? `<em>${tx('FIRST AWARD')}</em>` : ''}<span>${esc(tx(m.text))}</span></li>`).join('')}
      </ul>` : ''}
      <div class="svc-k" style="margin-top:12px">${tx('DAILY ORDERS')}</div>
      <ul class="svc-orders">${orders}</ul>`;
    const row = Array.from(box.children).filter((x) => x.classList.contains('row')).pop();
    box.insertBefore(sec, row ?? null);
    const pts = box.querySelector<HTMLElement>('[data-a="armory"]');
    if (pts && d.points !== undefined) pts.textContent = tx('Armory · {n} pts', { n: this.game.prog.points });
  }

  // The Daily Run posts to today's daily board instead of the Survival board
  private swapDailyBoard(m: Mission, d: DebriefData, key: string) {
    const box = document.querySelector<HTMLElement>('#debrief .box');
    if (!box) return;
    box.querySelectorAll('.lb-panel').forEach((p) => p.remove());
    const mode = dailyMode(m.role, keyDate(key));
    mountLeaderboard(box, mode, `DAILY RUN · ${m.role === 'gunner' ? 'B-17 GUNNER' : 'P-51 ESCORT'} · TOP 10`,
      { name: '', mode, score: d.score, kills: d.kills, rounds: d.waves ?? 0 });
  }

  // ---------------- toast ----------------
  private toast(kicker: string, text: string, sub: string) {
    if (typeof document === 'undefined') return;
    if (!this.toastHost || !this.toastHost.isConnected) {
      this.toastHost = document.createElement('div');
      this.toastHost.id = 'svc-toasts';
      document.body.appendChild(this.toastHost);
    }
    const el = document.createElement('div');
    el.className = 'svc-toast';
    el.innerHTML = `<div class="svc-tk">${esc(kicker)}</div><div class="svc-tt">${esc(text)}</div>${sub ? `<div class="svc-ts">${esc(sub)}</div>` : ''}`;
    this.toastHost.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 500); }, 4200);
  }
}

// yyyymmdd -> a Date on that UTC day (for dailyMode)
const keyDate = (k: string) => new Date(Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8), 12));

// Game modes on the Survival screen: Survival (endless rounds), Ace Hunt and Time Attack.
// Each mode is a ModeDef in MODES: it builds its Mission, names its online leaderboard
// (modes allowed by firestore.rules), and may customise the round pacing (Pacing.ts), the
// enemy mix, the spawned fighters and the score. More modes (a Daily Run) are added with
// registerMode(); the Survival screen shows one tab per entry. Custom Battle (CustomBattle.ts)
// and the Weekly Challenge (Weekly.ts) register themselves; their tabs draw their own body
// (ModeDef.panel, CustomBattleScreen.ts). A board of '' means the mode never posts scores.
//
//   Ace Hunt     only elite enemies — aces (high-skill, tougher single-engine fighters), heavies
//                and jets. Few in the air at once, three rounds, scored by aces downed.
//                Leaderboard 'acehunt-<role>'.
//   Time Attack  three minutes, fighters streaming in without pause; score = kills x combo
//                (each kill is worth 100 x the combo multiplier held going in). Ends with the
//                clock. Leaderboard 'timeattack-<role>'.
//
// ModeRunner is the per-mission state: Game builds one and Pacing ticks it every director
// frame; Game asks it for the enemy type and calls onSpawn for each fighter (spawnWave), and
// for the final score and leaderboard mode at the debrief.
import type { Mission, Round } from './Missions';
import { CAMPAIGN, survivalMission } from './Missions';
import type { PaceProfile } from './Pacing';
import type { World } from '../world/World';
import type { UI } from '../ui/UI';
import { Aircraft, Fighter } from '../world/Aircraft';
import { type EnemyType, pickEnemyType } from '../world/EnemyTypes';
import { mountLeaderboard } from '../ui/LeaderboardPanel';
import { sound } from '../audio/Sound';
import { tx } from '../i18n';

export type Role = 'gunner' | 'pilot';

export interface ModeDef {
  id: string;                         // 'survival' | 'acehunt' | 'timeattack' | …
  title: string;
  blurb: string;
  mission(role: Role): Mission;
  matches(m: Mission): boolean;
  board(role: Role): string;          // online leaderboard mode string ('' = never posted)
  boardFor?(m: Mission): string;      // the board for one mission (e.g. the week it was flown in)
  panel?(body: HTMLElement, onPick: (m: Mission) => void): void;   // own tab body on the Survival screen
  pace?: PaceProfile;                 // round pacing (default: build -> breather -> final wave)
  paceFor?(m: Mission): PaceProfile;  // pacing for one mission (custom battles: final wave sized to its numbers)
  elite?: boolean;                    // final-wave banner text
  enemyType?(tier: number): EnemyType;
  onSpawn?(f: Fighter, run: ModeRunner): void;
  // per director frame; may set the mission's debrief line
  tick?(run: ModeRunner, m: Mission, r: Round, t: number, enemies: number): void;
  score?(run: ModeRunner): number;    // the mode's own score (replaces the normal one)
}

const weighted = <T>(w: [T, number][]): T => {
  let r = Math.random() * w.reduce((a, [, p]) => a + p, 0);
  for (const [t, p] of w) { r -= p; if (r <= 0) return t; }
  return w[0][0];
};
const randomWeather = () => { const p = CAMPAIGN.map((c) => c.weather!).filter(Boolean); return p[Math.floor(Math.random() * p.length)]; };
const roleName = (r: Role) => (r === 'gunner' ? 'Gunner' : 'Escort');

const ACE_NAMES = ['Hptm. Krüger', 'Oblt. Hahn', 'Maj. Steiner', 'Lt. Vogt', 'Hptm. Brandt', 'Oblt. Wolff', 'Maj. Falk', 'Lt. Richter', 'Hptm. Lange', 'Oblt. Keller'];

export const SURVIVAL_MODE: ModeDef = {
  id: 'survival', title: 'Survival',
  blurb: 'Endless rounds of fighters, each one larger and more aggressive than the last, with a final wave to close every round. Bombers lost are not replaced.',
  mission: (role) => survivalMission(role),
  matches: (m) => m.id.startsWith('survival-'),
  board: (role) => `survival-${role}`,
};

export const ACE_HUNT: ModeDef = {
  id: 'acehunt', title: 'Ace Hunt', elite: true,
  blurb: 'Only the elite: Jagdgeschwader aces, heavy destroyers and jets. Fewer of them, all of them deadly. Three rounds — scored by the aces you bring down (1000 each).',
  mission: (role) => ({
    id: `acehunt-${role}`, number: 0, title: `Ace Hunt — ${roleName(role)}`, target: 'Jagdgeschwader aces', date: 'Over the Ruhr, spring 1944', role, station: 'waistL',
    briefing: [
      'Intelligence has placed a Jagdgeschwader of experten across our route — men with fifty, a hundred victories painted on their rudders.',
      'They will not come in numbers. They will come in ones and twos, fast, from where you are not looking, and they will not miss. Every ace you bring down is worth a thousand points.',
    ],
    objectives: ['Shoot down the aces — 1000 points each', 'Survive three rounds'],
    bombers: 12, escorts: role === 'pilot' ? 2 : 0, waves: [], weather: randomWeather(),
    round: { duration: 300, start: 6, min: 2, max: 5, skill: [1.3, 1.6], rockets: 0.2 }, rounds: 3, duration: 300, maxBombersLost: 99,
    success: 'The experten are down.',
  }),
  matches: (m) => m.id.startsWith('acehunt-'),
  board: (role) => `acehunt-${role}`,
  pace: { breather: true, final: { min: 6, max: 9 } },
  enemyType: (tier) => weighted<EnemyType>([['fw190', 0.3], ['bf109', 0.25], ['me262', 0.15], ['bf110', 0.15], ['ju88', 0.15], ['me163', tier >= 1 ? 0.06 : 0]]),
  onSpawn(f, run) {
    const fighter = f.enemyType === 'fw190' || f.enemyType === 'bf109' || f.enemyType === 'me262' || f.enemyType === 'me163';
    if (fighter && Math.random() < 0.6) {
      run.makeAce(f);
    } else {
      f.structure *= 1.15; f.maxStructure *= 1.15;
    }
  },
  tick(run, m) {
    m.success = `${run.aces} ace${run.aces === 1 ? '' : 's'} downed and ${run.kills - run.aces} more of the Jagdgeschwader with them. The experten will remember this formation.`;
  },
  score: (run) => run.aces * 1000 + run.heavies * 300 + (run.kills - run.aces - run.heavies) * 150,
};

export const TIME_ATTACK: ModeDef = {
  id: 'timeattack', title: 'Time Attack',
  blurb: 'Three minutes on the clock and fighters streaming in without a pause. Every kill scores 100 × your combo multiplier — keep the combo alive.',
  mission: (role) => ({
    id: `timeattack-${role}`, number: 0, title: `Time Attack — ${roleName(role)}`, target: 'Three minutes', date: 'The clock is running', role, station: 'waistL',
    briefing: ['Three minutes. As many as you can, as fast as you can. Every kill scores a hundred points times your combo — keep shooting to keep it up.'],
    objectives: ['Score as much as you can in three minutes'],
    bombers: 12, escorts: role === 'pilot' ? 2 : 0, waves: [], weather: randomWeather(),
    round: { duration: 180, start: 4, min: 6, max: 14, skill: [0.8, 1.05] }, rounds: 1, duration: 180, maxBombersLost: 99,
    success: 'Time!',
  }),
  matches: (m) => m.id.startsWith('timeattack-'),
  board: (role) => `timeattack-${role}`,
  pace: { breather: false, final: false, stream: true },
  enemyType: () => weighted<EnemyType>([['fw190', 0.6], ['bf109', 0.4]]),
  tick(run, m, r, t) {
    const left = r.duration - t;
    for (const s of [60, 30, 10]) {
      if (left <= s && !run.marks.has(s)) {
        run.marks.add(s);
        run.ui.banner(s === 60 ? 'ONE MINUTE' : s === 30 ? '30 SECONDS' : '10 SECONDS', `${run.kills} kills · ${run.modeScore} points`, 2000);
        if (s <= 30) sound.music.swell();
      }
    }
    if (left <= 0) run.frozen = true;
    m.success = `Time! ${run.kills} kills in three minutes, best combo ×${run.bestCombo.toFixed(1)}.`;
  },
  score: (run) => run.modeScore,
};

// The Survival screen shows these, in order. Survival first; another mode appends itself.
export const MODES: ModeDef[] = [SURVIVAL_MODE, ACE_HUNT, TIME_ATTACK];

export function registerMode(def: ModeDef, index = MODES.length) {
  const i = MODES.findIndex((d) => d.id === def.id);
  if (i >= 0) MODES.splice(i, 1);
  MODES.splice(Math.min(index, MODES.length), 0, def);
}

export function modeFor(m: Mission | null | undefined): ModeDef | null {
  return m ? MODES.find((d) => d.matches(m)) ?? null : null;
}

// Online leaderboard mode string for a mission, or null when no mode claims it (campaign)
export function leaderboardMode(m: Mission): string | null {
  const d = modeFor(m);
  return d ? (d.boardFor ? d.boardFor(m) : d.board(m.role)) : null;
}

// Flak window inside a round with Mission.roundFlak: from 35% to 65% of the round
export const ROUND_FLAK = { from: 0.35, to: 0.65 };
export function roundFlakOn(r: Round, t: number): boolean {
  const d = Number.isFinite(r.duration) ? r.duration : 100;
  return t >= d * ROUND_FLAK.from && t <= d * ROUND_FLAK.to;
}

// Enemy-mix providers for missions no mode claims (the campaign's side raids register one in
// ui/CampaignMap.ts); the first non-null answer wins, null everywhere = the normal mix
export const ENEMY_MIX: ((m: Mission, tier: number) => EnemyType | null)[] = [];
function enemyMixFor(m: Mission, tier: number): EnemyType | null {
  for (const f of ENEMY_MIX) { const t = f(m, tier); if (t) return t; }
  return null;
}

export interface ModeHooks {
  comboMult(): number;
  setScore(n: number): void;
}

export class ModeRunner {
  kills = 0;            // player kills this mission
  aces = 0;
  heavies = 0;
  modeScore = 0;        // Time Attack: sum of 100 x combo per kill
  bestCombo = 1;
  frozen = false;       // Time Attack: the clock ran out, nothing more counts
  marks = new Set<number>();
  private mission: Mission | null = null;
  private lastTime = 0;
  private aceNames: string[] = [];

  constructor(readonly world: World, readonly ui: UI, private hooks: ModeHooks) {
    this.hookKills();
  }

  get def(): ModeDef | null { return modeFor(this.mission); }

  // Pacing.director, every frame of a normal round
  tick(_dt: number, m: Mission, r: Round, t: number, enemies: number) {
    this.check(m);
    if (m.roundFlak) {
      const on = roundFlakOn(r, t);
      if (on && this.world.flakIntensity <= 0) this.world.callout('rflak', 'Navigator', 'Flak coming up — heavy guns below us. Hold steady.', 20, 2);
      this.world.flakIntensity = on ? m.roundFlak : 0;
    }
    const d = this.def;
    if (!d) return;
    d.tick?.(this, m, r, t, enemies);
    if (d.score) this.hooks.setScore(d.score(this));
  }

  // Game.spawnWave: the enemy type for the next fighter (null = the normal mix)
  enemyType(m: Mission | null, tier: number): EnemyType | null {
    this.check(m);
    return this.def?.enemyType?.(tier) ?? (m?.enemyTypes?.length ? pickEnemyType(m.enemyTypes, tier) : m ? enemyMixFor(m, tier) : null);
  }

  onSpawn(f: Fighter) {
    this.def?.onSpawn?.(f, this);
  }

  // Game.showDebrief: the mode's own score replaces the normal one (with its end bonuses)
  finalScore(m: Mission, score: number): number {
    this.check(m);
    const d = this.def;
    return d?.score ? d.score(this) : score;
  }

  // An ace: sharper, tougher, named; the crew calls them out (at most every 45 s)
  makeAce(f: Fighter) {
    (f as any).ace = true;
    f.structure *= 1.6; f.maxStructure *= 1.6;
    const pilot = (this.world as any).pilots?.get(f);
    if (pilot && typeof pilot.skill === 'number') pilot.skill *= 1.2;
    if (!this.aceNames.length) this.aceNames = [...ACE_NAMES].sort(() => Math.random() - 0.5);
    f.label = `${this.aceNames.pop()} (${f.label})`;
    this.world.callout('mode_ace', 'Navigator', 'That one\'s an ace — kill markings all down the tail. Watch him!', 45, 2);
  }

  private check(m: Mission | null) {
    const w = this.world;
    if (m !== this.mission || w.time < this.lastTime - 1e-6) this.reset(m);
    this.lastTime = w.time;
  }

  private reset(m: Mission | null) {
    this.mission = m;
    this.kills = this.aces = this.heavies = this.modeScore = 0;
    this.bestCombo = 1; this.frozen = false; this.marks.clear();
  }

  // Wrap the world's kill event (like MidRound does) to count the player's kills by kind
  private hookKills() {
    const ev = this.world.events;
    const cur = ev.kill as any;
    if (cur?.__modes) return;
    const wrapped = (v: Aircraft, byPlayer: boolean, cause?: string) => {
      const mult = this.hooks.comboMult();     // the multiplier held going in
      cur?.(v, byPlayer, cause);
      if (!byPlayer || v.team !== 'axis' || this.frozen || !this.mission) return;
      this.kills++;
      if (v instanceof Fighter && (v as any).ace) {
        this.aces++;
        if (this.def?.id === 'acehunt') this.ui.feed(`ACE DOWN — ${v.label} · +1000`, 'mine');
      } else if (v instanceof Fighter && (v.enemyType === 'bf110' || v.enemyType === 'ju88')) this.heavies++;
      this.modeScore += Math.round(100 * mult);
      this.bestCombo = Math.max(this.bestCombo, mult);
    };
    (wrapped as any).__modes = true;
    // keep MidRound's marker visible so it does not wrap the chain a second time
    if (cur?.__midRound) (wrapped as any).__midRound = true;
    ev.kill = wrapped as any;
  }
}

// ---------------- Survival screen: mode tabs ----------------

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function injectCss() {
  if (document.getElementById('mode-panel-css')) return;
  const st = document.createElement('style');
  st.id = 'mode-panel-css';
  st.textContent = `
.mode-panel { margin: 14px 0 6px; text-align: left; }
.mode-tabs { display: flex; gap: 6px; flex-wrap: wrap; border-bottom: 1px solid var(--line); }
.mode-tab { background: transparent; color: var(--ink-dim); border: 1px solid transparent; border-bottom: none; padding: 8px 14px; font: inherit; font-size: 14px; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; }
.mode-tab:hover { color: var(--ink); }
.mode-tab.on { color: var(--khaki); border-color: var(--line); background: rgba(0,0,0,0.25); margin-bottom: -1px; }
.mode-body p { color: var(--ink-dim); font-size: 15px; line-height: 1.5; margin: 12px 0; }
.mode-body .btn { padding: 10px 20px; font-size: 15px; }
html[dir="rtl"] .mode-panel { text-align: right; }
html[dir="rtl"] .mode-tab { letter-spacing: 0; }
`;
  document.head.appendChild(st);
}

// Extra blocks drawn above the tabs (the weekly challenge card strip); open(id) switches tab
export type PanelHeader = (el: HTMLElement, open: (tabId: string) => void, tab: string) => void;
export const PANEL_HEADERS: PanelHeader[] = [];

// Tabs, one per mode: description, a start button per role and the mode's online top 10 for
// each role (or the mode's own panel). Mounted into the Survival screen's box; the screen's own
// role buttons are hidden (the Survival tab has the same two) when they are found.
export function mountModePanel(host: HTMLElement, onPick: (m: Mission) => void, startTab = 'survival') {
  injectCss();
  const panel = document.createElement('div');
  panel.className = 'mode-panel';
  const own = host.querySelector<HTMLElement>('[data-r]')?.parentElement;
  if (own) { own.style.display = 'none'; own.after(panel); }
  else host.appendChild(panel);
  const show = (id: string) => {
    const d = MODES.find((x) => x.id === id) ?? MODES[0];
    panel.innerHTML = `<div data-headers></div><div class="mode-tabs">${MODES.map((x) => `<button class="mode-tab${x === d ? ' on' : ''}" data-tab="${esc(x.id)}">${esc(tx(x.title))}</button>`).join('')}</div>
      <div class="mode-body"><p>${esc(tx(d.blurb))}</p>
      <div class="row"><button class="btn" data-mode-role="gunner">${tx('B-17 Gunner')}</button><button class="btn" data-mode-role="pilot">${tx('P-51 Escort')}</button></div>
      <div data-boards></div></div>`;
    panel.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab!)));
    const heads = panel.querySelector<HTMLElement>('[data-headers]')!;
    for (const h of PANEL_HEADERS) h(heads, show, d.id);
    if (d.panel) {
      const body = panel.querySelector<HTMLElement>('.mode-body')!;
      body.innerHTML = '';
      d.panel(body, onPick);
      return;
    }
    panel.querySelectorAll<HTMLButtonElement>('[data-mode-role]').forEach((b) => b.addEventListener('click', () => onPick(d.mission(b.dataset.modeRole as Role))));
    const boards = panel.querySelector<HTMLElement>('[data-boards]')!;
    mountLeaderboard(boards, d.board('gunner'), tx('ONLINE TOP 10 — {mode} · B-17 GUNNER', { mode: tx(d.title).toUpperCase() }));
    mountLeaderboard(boards, d.board('pilot'), tx('ONLINE TOP 10 — {mode} · P-51 ESCORT', { mode: tx(d.title).toUpperCase() }));
  };
  show(startTab);
}

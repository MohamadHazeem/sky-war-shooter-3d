// Survival screen extras: the Custom Battle set-up screen, the Custom Battle tab and the Weekly
// Challenge card (tab + strip above the mode tabs, with the countdown to next Monday).
// Importing this module registers both modes (CustomBattle.ts, Weekly.ts) and their panels.
import {
  type CustomConfig, type Mood, type Skill, ALL_ENEMIES, CUSTOM_MODE, DUSK_MAX_SUN, LIMITS, MOOD_LABEL, MOODS, SEATS, SKILL_DEF, SKILLS,
  buildCustomMission, describeConfig, loadConfig, sanitizeConfig, saveConfig, timeOfDayLabel,
} from '../game/CustomBattle';
import {
  WEEKLY_MERIT, WEEKLY_MODE, WEEKLY_NOSE, WEEKLY_NOSE_NAME, fmtWeekCountdown, msUntilNextWeek, weekKey, weeklyCompletions, weeklyDone,
  weeklyMission, weeklyMode, weeklyScenario,
} from '../game/Weekly';
import { PANEL_HEADERS } from '../game/Modes';
import type { Mission } from '../game/Missions';
import { Progression } from '../game/Upgrades';
import { ENEMY_VARIANTS } from '../world/EnemyTypes';
import { STATIONS } from '../world/B17Layout';
import { mountLeaderboard } from './LeaderboardPanel';
import { esc, onBackKey, showLayer } from './serviceCommon';

function injectCss() {
  if (document.getElementById('cb-css')) return;
  const st = document.createElement('style');
  st.id = 'cb-css';
  st.textContent = `
#cb-screen .box { width: min(760px, 100%); max-height: 92vh; overflow: auto; padding: 28px 32px; text-align: left; }
.cb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 26px; margin-top: 14px; }
.cb-grid .wide { grid-column: 1 / -1; }
@media (max-width: 640px) { .cb-grid { grid-template-columns: 1fr; } #cb-screen .box { padding: 20px 16px; } }
.cb-f { display: flex; flex-direction: column; gap: 6px; }
.cb-l { font-family: 'Special Elite', monospace; color: var(--khaki); font-size: 12px; letter-spacing: 2px; text-transform: uppercase; display: flex; justify-content: space-between; gap: 8px; }
.cb-l b { color: var(--ink); font-weight: 400; letter-spacing: 1px; text-transform: none; font-family: inherit; }
.cb-seg { display: flex; flex-wrap: wrap; gap: 4px; }
.cb-seg button, .cb-chk { background: rgba(0,0,0,0.25); color: var(--ink-dim); border: 1px solid var(--line); padding: 6px 10px; font: inherit; font-size: 13px; letter-spacing: 1px; cursor: pointer; }
.cb-seg button:hover, .cb-chk:hover { color: var(--ink); border-color: var(--khaki); }
.cb-seg button.on { background: var(--khaki); color: #1b1a12; border-color: var(--khaki); }
.cb-seg button:disabled { opacity: 0.35; cursor: default; }
.cb-chks { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }
@media (max-width: 640px) { .cb-chks { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.cb-chk { display: flex; align-items: flex-start; gap: 8px; text-align: left; }
.cb-chk input { accent-color: var(--khaki); margin: 2px 0 0; }
.cb-chk span { display: flex; flex-direction: column; }
.cb-chk small { font-size: 11px; color: var(--ink-dim); opacity: 0.8; letter-spacing: 0; }
.cb-chk.on { color: var(--ink); border-color: rgba(185,167,111,0.6); }
.cb-f input[type=range] { width: 100%; accent-color: var(--khaki); }
.cb-f input[type=range]:disabled { opacity: 0.35; }
.cb-pair { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; align-items: center; font-size: 13px; color: var(--ink-dim); }
.cb-toggles { display: flex; flex-wrap: wrap; gap: 6px; }
.cb-sum { margin-top: 16px; padding: 10px 12px; border: 1px dashed var(--line); color: var(--ink-dim); font-size: 13px; line-height: 1.5; }
.cb-note { color: var(--ink-dim); font-size: 13px; margin: 8px 0 0; }
.cb-actions { margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
.cb-summary { color: var(--ink); font-size: 14px; line-height: 1.5; padding: 10px 12px; border-left: 3px solid var(--khaki); background: rgba(0,0,0,0.2); margin: 10px 0 12px; }
.wk-strip { display: flex; align-items: center; gap: 10px; width: 100%; margin: 0 0 10px; padding: 8px 12px; background: linear-gradient(90deg, rgba(31,47,87,0.55), rgba(0,0,0,0.2)); border: 1px solid rgba(226,179,60,0.45); color: var(--ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.wk-strip:hover { border-color: #e2b33c; }
.wk-strip .k { font-family: 'Special Elite', monospace; color: #e2b33c; letter-spacing: 2px; font-size: 11px; white-space: nowrap; }
.wk-strip .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wk-strip .c { color: var(--ink-dim); white-space: nowrap; font-size: 12px; }
.wk-card { margin: 12px 0; padding: 14px 16px 12px; border: 1px solid rgba(226,179,60,0.5); background: linear-gradient(160deg, rgba(31,47,87,0.5), rgba(0,0,0,0.25) 60%); position: relative; }
.wk-card .k { font-family: 'Special Elite', monospace; color: #e2b33c; letter-spacing: 2px; font-size: 12px; }
.wk-card h3 { margin: 4px 0 6px; font-size: 22px; letter-spacing: 1px; }
.wk-card .hl { color: var(--ink); font-size: 14px; line-height: 1.45; }
.wk-card ul { margin: 8px 0 0; padding-left: 18px; color: var(--ink-dim); font-size: 13px; line-height: 1.55; }
.wk-card .cd { position: absolute; right: 14px; top: 12px; text-align: right; font-size: 11px; letter-spacing: 1px; color: var(--ink-dim); }
.wk-card .cd b { display: block; color: var(--ink); font-size: 15px; letter-spacing: 0; }
.wk-card .rw { margin-top: 10px; font-size: 13px; color: var(--ink); }
.wk-card .rw.done { color: #9fd38a; }
@media (max-width: 560px) { .wk-card .cd { position: static; text-align: left; margin-bottom: 6px; } }
`;
  document.head.appendChild(st);
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const sunLabel = (el: number, mood: Mood) => mood === 'dusk' ? `dusk · ${Math.min(el, DUSK_MAX_SUN)}°` : `${timeOfDayLabel(el)} · ${el}°`;

// ---------------- the set-up screen ----------------
export interface CustomScreenOpts {
  start(m: Mission): void;
  back(): void;
}

export function showCustomBattleScreen(o: CustomScreenOpts) {
  injectCss();
  const el = showLayer('cb-screen');
  let c: CustomConfig = loadConfig();
  const seg = <T extends string>(key: string, list: readonly T[], label: (v: T) => string) =>
    `<div class="cb-seg" data-seg="${key}">${list.map((v) => `<button type="button" data-v="${esc(v)}">${esc(label(v))}</button>`).join('')}</div>`;
  const toggle = (key: string, label: string, sub: string) =>
    `<label class="cb-chk" data-tog="${key}"><input type="checkbox" data-k="${key}"/><span>${esc(label)}<small>${esc(sub)}</small></span></label>`;
  el.innerHTML = `<div class="screen-center"><div class="box panel">
    <div class="kicker">SURVIVAL · YOUR RULES</div><h2 class="h2">Custom Battle</h2>
    <div class="cb-grid">
      <div class="cb-f"><div class="cb-l">Role</div>${seg('role', ['gunner', 'pilot'] as const, (v) => (v === 'gunner' ? 'B-17 Gunner' : 'P-51 Escort'))}</div>
      <div class="cb-f" data-seatbox><div class="cb-l">Gunner seat</div>${seg('station', SEATS, (v) => STATIONS[v].label)}</div>
      <div class="cb-f wide"><div class="cb-l">Enemy types <b data-out="enemies"></b></div>
        <div class="cb-chks">${ALL_ENEMIES.map((t) => `<label class="cb-chk" data-en="${t}"><input type="checkbox" data-enemy="${t}"/><span>${esc(ENEMY_VARIANTS[t].label)}<small>${esc(ENEMY_VARIANTS[t].blurb)}</small></span></label>`).join('')}</div></div>
      <div class="cb-f"><div class="cb-l">Fighters at once <b data-out="fighters"></b></div>
        <div class="cb-pair"><span>min</span><input type="range" data-k="min" min="${LIMITS.fighters[0]}" max="${LIMITS.fighters[1]}" step="1"/>
        <span>max</span><input type="range" data-k="max" min="${LIMITS.fighters[0]}" max="${LIMITS.fighters[1]}" step="1"/></div></div>
      <div class="cb-f"><div class="cb-l">Enemy skill <b data-out="skill"></b></div>${seg('skill', SKILLS, (v: Skill) => SKILL_DEF[v].label)}</div>
      <div class="cb-f"><div class="cb-l">Round length <b data-out="roundLength"></b></div>
        <input type="range" data-k="roundLength" min="${LIMITS.roundLength[0]}" max="${LIMITS.roundLength[1]}" step="30"/></div>
      <div class="cb-f"><div class="cb-l">Rounds <b data-out="rounds"></b></div>
        <input type="range" data-k="rounds" min="${LIMITS.rounds[0]}" max="${LIMITS.rounds[1]}" step="1"/>
        <div class="cb-toggles">${toggle('endless', 'Endless', 'until you are shot down')}</div></div>
      <div class="cb-f"><div class="cb-l">Weather</div>${seg('mood', MOODS, (v) => MOOD_LABEL[v])}</div>
      <div class="cb-f"><div class="cb-l">Time of day <b data-out="sunEl"></b></div>
        <input type="range" data-k="sunEl" min="${LIMITS.sunEl[0]}" max="${LIMITS.sunEl[1]}" step="1" aria-label="Sun elevation: dawn to noon"/>
        <div class="cb-pair" style="grid-template-columns:1fr 1fr 1fr;font-size:11px"><span>dawn / dusk</span><span style="text-align:center">morning</span><span style="text-align:right">noon</span></div></div>
      <div class="cb-f"><div class="cb-l">Battle group <b data-out="boss"></b></div>
        <div class="cb-toggles">${toggle('boss', 'Boss round', 'giant flying warships')}</div>
        <input type="range" data-k="bossRound" min="1" max="10" step="1" aria-label="Boss round"/></div>
      <div class="cb-f"><div class="cb-l">Extras</div>
        <div class="cb-toggles">${toggle('specials', 'Special events', 'aces, Zerstörer, rockets')}${toggle('flak', 'Flak', 'mid-round barrage')}${toggle('escorts', 'Escorts', 'Mustangs on your side')}</div></div>
    </div>
    <div class="cb-sum" data-sum></div>
    <p class="cb-note">Custom battles are not posted to the online leaderboards. Your last set-up is kept.</p>
    <div class="cb-actions"><button class="btn ghost" data-back>Back</button><button class="btn ghost" data-reset>Defaults</button><button class="btn" data-start>Start</button></div>
  </div></div>`;

  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const range = (k: string) => q<HTMLInputElement>(`input[data-k="${k}"]`);
  const tog = (k: string) => q<HTMLInputElement>(`input[data-k="${k}"]`);

  // config -> controls
  const sync = () => {
    c = sanitizeConfig(c);
    el.querySelectorAll<HTMLElement>('[data-seg]').forEach((s) => {
      const v = String((c as any)[s.dataset.seg!]);
      s.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    });
    q<HTMLElement>('[data-seatbox]').style.opacity = c.role === 'gunner' ? '1' : '0.35';
    q<HTMLElement>('[data-seatbox]').querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = c.role !== 'gunner'));
    el.querySelectorAll<HTMLInputElement>('[data-enemy]').forEach((i) => {
      i.checked = c.enemies.includes(i.dataset.enemy as any);
      i.closest('.cb-chk')!.classList.toggle('on', i.checked);
    });
    range('min').value = String(c.min); range('max').value = String(c.max);
    range('roundLength').value = String(c.roundLength);
    range('rounds').value = String(c.rounds || 5); range('rounds').disabled = c.rounds === 0;
    tog('endless').checked = c.rounds === 0;
    range('sunEl').value = String(c.sunEl); range('sunEl').disabled = c.mood === 'dusk';
    tog('boss').checked = c.boss;
    const bossMax = c.rounds === 0 ? LIMITS.rounds[1] : c.rounds;
    range('bossRound').max = String(bossMax); range('bossRound').value = String(c.bossRound);
    range('bossRound').disabled = !c.boss || bossMax <= 1;
    tog('specials').checked = c.specials; tog('flak').checked = c.flak; tog('escorts').checked = c.escorts;
    el.querySelectorAll<HTMLElement>('[data-tog]').forEach((t) => t.classList.toggle('on', tog(t.dataset.tog!).checked));
    const out = (k: string, s: string) => (q<HTMLElement>(`[data-out="${k}"]`).textContent = s);
    out('enemies', `${c.enemies.length} of ${ALL_ENEMIES.length}`);
    out('fighters', `${c.min}–${c.max}`);
    out('skill', SKILL_DEF[c.skill].label);
    out('roundLength', mmss(c.roundLength));
    out('rounds', c.rounds === 0 ? 'endless' : String(c.rounds));
    out('sunEl', sunLabel(c.sunEl, c.mood));
    out('boss', !c.boss ? 'off' : c.rounds === 0 ? `round ${c.bossRound}, then every ${c.bossRound}` : `round ${c.bossRound}`);
    q<HTMLElement>('[data-sum]').textContent = describeConfig(c);
    saveConfig(c);
  };

  // controls -> config
  el.querySelectorAll<HTMLElement>('[data-seg]').forEach((s) => s.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', () => {
    (c as any)[s.dataset.seg!] = b.dataset.v;
    if (s.dataset.seg === 'mood' && b.dataset.v === 'dusk') c.sunEl = Math.min(c.sunEl, DUSK_MAX_SUN);
    sync();
  })));
  el.querySelectorAll<HTMLInputElement>('[data-enemy]').forEach((i) => i.addEventListener('change', () => {
    const t = i.dataset.enemy as CustomConfig['enemies'][number];
    const next = i.checked ? [...c.enemies, t] : c.enemies.filter((x) => x !== t);
    if (next.length) c.enemies = ALL_ENEMIES.filter((x) => next.includes(x));   // at least one type stays ticked
    sync();
  }));
  range('min').addEventListener('input', () => { c.min = +range('min').value; if (c.max < c.min) c.max = c.min; sync(); });
  range('max').addEventListener('input', () => { c.max = +range('max').value; if (c.min > c.max) c.min = c.max; sync(); });
  range('roundLength').addEventListener('input', () => { c.roundLength = +range('roundLength').value; sync(); });
  range('rounds').addEventListener('input', () => { c.rounds = +range('rounds').value; c.bossRound = Math.min(c.bossRound, c.rounds); sync(); });
  tog('endless').addEventListener('change', () => { c.rounds = tog('endless').checked ? 0 : Math.max(1, +range('rounds').value || 5); sync(); });
  range('sunEl').addEventListener('input', () => { c.sunEl = +range('sunEl').value; sync(); });
  tog('boss').addEventListener('change', () => { c.boss = tog('boss').checked; sync(); });
  range('bossRound').addEventListener('input', () => { c.bossRound = +range('bossRound').value; sync(); });
  for (const k of ['specials', 'flak', 'escorts'] as const) tog(k).addEventListener('change', () => { c[k] = tog(k).checked; sync(); });
  q('[data-reset]').addEventListener('click', () => { c = sanitizeConfig(null); sync(); });
  q('[data-back]').addEventListener('click', o.back);
  q('[data-start]').addEventListener('click', () => { saveConfig(c); o.start(buildCustomMission(c)); });
  onBackKey(el, o.back);
  sync();
}

// Back from the set-up screen to the Survival screen (its DOM, mode panel included, is still there)
function backToSurvival(refresh: () => void) {
  const s = document.getElementById('survival');
  if (!s) return;
  document.querySelectorAll('.layer').forEach((l) => l.classList.toggle('show', l === s));
  refresh();
}

// ---------------- Custom Battle tab ----------------
CUSTOM_MODE.panel = function draw(body, onPick) {
  injectCss();
  const c = loadConfig();
  body.innerHTML = `<p>${esc(CUSTOM_MODE.blurb)}</p>
    <div class="cb-summary"><div class="cb-l" style="margin-bottom:4px">Last set-up</div>${esc(describeConfig(c))}</div>
    <div class="row"><button class="btn" data-cb-setup>Set up battle</button><button class="btn ghost" data-cb-fly>Fly last set-up</button></div>`;
  body.querySelector('[data-cb-fly]')!.addEventListener('click', () => onPick(buildCustomMission(loadConfig())));
  body.querySelector('[data-cb-setup]')!.addEventListener('click', () => showCustomBattleScreen({
    start: onPick,
    back: () => backToSurvival(() => draw(body, onPick)),
  }));
};

// ---------------- Weekly Challenge: tab + strip ----------------
function tickCountdown(el: HTMLElement, sel: string) {
  const t = setInterval(() => {
    const out = el.querySelector(sel);
    if (!out || !el.isConnected || !el.closest('.layer.show')) { clearInterval(t); return; }
    out.textContent = fmtWeekCountdown(msUntilNextWeek());
  }, 20000);
}

WEEKLY_MODE.panel = (body, onPick) => {
  injectCss();
  const key = weekKey(), s = weeklyScenario(key), c = s.config;
  const prog = Progression.current;
  const done = prog ? weeklyDone(prog, key) : false;
  const ribbons = prog ? weeklyCompletions(prog) : 0;
  const haveNose = !!prog?.unlocked.has(WEEKLY_NOSE);
  const lines = [
    `${c.rounds} rounds of ${mmss(c.roundLength)} · ${c.min}–${c.max} fighters at once · ${SKILL_DEF[c.skill].label} skill`,
    `${MOOD_LABEL[c.mood]} · ${timeOfDayLabel(c.sunEl, c.mood)}${c.boss ? ` · battle group in round ${c.bossRound}` : ''}`,
    [c.specials ? 'special events' : 'no special events', c.flak ? 'flak' : 'no flak', c.escorts ? 'escorts' : 'no escorts'].join(' · '),
    `Gunners fly the ${STATIONS[c.station].label.toLowerCase()} · the enemy schedule is the same for every crew all week`,
  ];
  body.innerHTML = `<div class="wk-card">
      <div class="cd">NEXT SCENARIO IN<b data-wk-cd>${fmtWeekCountdown(msUntilNextWeek())}</b></div>
      <div class="k">WEEKLY CHALLENGE · WEEK ${s.week}, ${s.year}</div>
      <h3>Operation ${esc(s.operation)}</h3>
      <div class="hl">${esc(s.headline)}</div>
      <ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <div class="rw ${done ? 'done' : ''}">${done
        ? `✔ Completed this week · ${ribbons} weekly ribbon${ribbons === 1 ? '' : 's'}`
        : `Reward for completing it: +${WEEKLY_MERIT} merit, a weekly ribbon${haveNose ? '' : ` and the <b>${esc(WEEKLY_NOSE_NAME)}</b> nose art (weekly-only)`}`}</div>
    </div>
    <div class="row"><button class="btn" data-wk-role="gunner">B-17 Gunner</button><button class="btn" data-wk-role="pilot">P-51 Escort</button></div>
    <div data-boards></div>`;
  body.querySelectorAll<HTMLButtonElement>('[data-wk-role]').forEach((b) => b.addEventListener('click', () => onPick(weeklyMission(b.dataset.wkRole as 'gunner' | 'pilot', key))));
  const boards = body.querySelector<HTMLElement>('[data-boards]')!;
  mountLeaderboard(boards, weeklyMode('gunner', key), `WEEK ${s.week} · B-17 GUNNER · TOP 10`);
  mountLeaderboard(boards, weeklyMode('pilot', key), `WEEK ${s.week} · P-51 ESCORT · TOP 10`);
  tickCountdown(body, '[data-wk-cd]');
};

PANEL_HEADERS.push((el, open, tab) => {
  if (tab === 'weekly') return;
  injectCss();
  const s = weeklyScenario();
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'wk-strip';
  b.innerHTML = `<span class="k">WEEKLY CHALLENGE</span><span class="t">${esc(s.headline)}</span><span class="c">ends in <span data-wk-cd>${fmtWeekCountdown(msUntilNextWeek())}</span></span>`;
  b.addEventListener('click', () => open('weekly'));
  el.appendChild(b);
  tickCountdown(b, '[data-wk-cd]');
});

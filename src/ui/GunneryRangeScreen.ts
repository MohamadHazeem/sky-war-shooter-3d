// Gunnery Range 2.0 screen (Hangar → Aircraft & Armory → Gunnery Range). Rules and records in
// game/GunneryRangeRules.ts, the practice flight in game/GunneryRange.ts.
// Pick a gun position, then a drill (or free practice with your own target, speed, angle and
// range); two switches (lead tutor, ghost of your best run); one primary button. A finished run
// comes back here with its result on top: score, stars, best, the ghost's score.
// Simple-menu rules (Phase 8): one primary button, few choices, Back top-leading, Arabic/RTL.
import { STATIONS, STATION_ORDER, type StationId } from '../world/B17Layout';
import {
  ANGLES, ANGLE_LABEL, DISTS, KIND_LABEL, SPEEDS, SPEED_LABEL, bookRun, drillsFor, freeDrill, loadRange, saveRange,
  type Drill, type RangeRecord, type RangeSave,
} from '../game/GunneryRangeRules';
import type { RangeResult, RangeRun } from '../game/GunneryRange';
import { num, tx } from '../i18n';
import { esc, onBackKey, showLayer } from './serviceCommon';

export interface RangeScreenHost {
  fly(run: RangeRun): void;
  menu(): void;
}

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById('range-css')) return;
  const st = document.createElement('style');
  st.id = 'range-css';
  st.textContent = `
#gunRange { background: radial-gradient(ellipse at 50% 30%, rgba(20,26,22,0.6), rgba(5,7,5,0.94)); overflow-y: auto; }
#gunRange .rng { width: min(1080px, 100%); margin: 0 auto; padding: 20px 22px 28px; box-sizing: border-box; }
.rng h2 { font-size: 34px; margin: 6px 0 2px; letter-spacing: 3px; text-transform: uppercase; }
.rng-sub { margin: 0 0 14px; color: var(--ink-dim); font-family: 'Special Elite', monospace; font-size: 14px; }
.rng h3 { margin: 16px 0 8px; font-size: 13px; letter-spacing: 3px; color: var(--khaki); font-weight: 500; font-family: 'Special Elite', monospace; text-transform: uppercase; }
.rng-seats { display: flex; flex-wrap: wrap; gap: 8px; }
.rng-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
.rng-drill { text-align: start; background: var(--panel); border: 1px solid var(--line); color: var(--ink); padding: 12px 14px; font-family: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 5px; min-height: 44px; }
.rng-drill.sel { border-color: var(--khaki); background: rgba(185,167,111,0.1); box-shadow: inset 0 0 0 1px var(--khaki); }
.rng-drill:focus-visible { outline: 2px solid var(--khaki); outline-offset: 2px; }
.rng-drill .t { font-size: 19px; letter-spacing: 1px; line-height: 1.15; }
.rng-drill .x { font-size: 13px; color: var(--ink-dim); line-height: 1.4; }
.rng-drill .best { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--ink-dim); margin-top: auto; }
.rng-stars { color: #ffc85a; letter-spacing: 2px; }
.rng-stars i { color: rgba(255,255,255,0.2); font-style: normal; }
.rng-free { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px 18px; background: var(--panel); border: 1px solid var(--line); padding: 12px 14px; margin-top: 10px; }
.rng-free .grp { display: flex; flex-direction: column; gap: 6px; }
.rng-free .lbl { font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: var(--ink-dim); }
/* free-practice choices are chips like the gun positions (Phase 8 menu style), not browser selects */
.rng-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.rng-chips .btn { min-height: 36px; padding: 6px 12px; font-size: 15px; letter-spacing: 0.5px; text-transform: none; }
.rng-seats button[aria-pressed="true"], .rng-chips button[aria-pressed="true"] { border-color: var(--khaki); color: var(--khaki); background: rgba(185,167,111,0.1); }
.rng-opts { display: flex; flex-wrap: wrap; gap: 10px 22px; margin-top: 4px; }
.rng-opts label { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; max-width: 440px; min-height: 36px; }
.rng-opts input { width: 20px; height: 20px; margin-top: 2px; accent-color: var(--khaki); flex: none; }
.rng-opts b { display: block; font-weight: 500; }
.rng-opts span { font-size: 13px; color: var(--ink-dim); }
.rng-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 16px; }
.rng-actions .btn.primary-go { font-size: 18px; padding: 12px 26px; }
.rng-result { background: var(--panel); border: 1px solid var(--khaki); border-inline-start: 3px solid var(--khaki); padding: 12px 16px; margin: 4px 0 6px; display: grid; grid-template-columns: auto 1fr; gap: 6px 22px; align-items: center; }
.rng-result.best { border-color: var(--good); border-inline-start-color: var(--good); }
.rng-result .score { font-family: 'IBM Plex Mono', monospace; font-size: 46px; line-height: 1; }
.rng-result .lbl { font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: var(--ink-dim); }
.rng-result .nb { color: var(--good); letter-spacing: 1px; text-transform: uppercase; font-size: 15px; }
.rng-result ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: 14px; }
.rng-result ul b { font-family: 'IBM Plex Mono', monospace; font-weight: 500; }
/* top right in both directions: the kill feed sits top left (cleanHud.css) */
#rangeCard { position: fixed; right: 24px; top: 118px; z-index: 7; width: min(320px, calc(100vw - 32px)); pointer-events: none;
  background: rgba(12,14,9,0.78); border: 1px solid rgba(185,167,111,0.55); border-left: 3px solid var(--khaki);
  padding: 10px 14px; box-sizing: border-box; display: none; }
/* shown at once and fully opaque (no fade: a fade read as a washed-out card over bright sky) */
#rangeCard.show { display: block; }
#rangeCard .k { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 2.5px; color: var(--ink-dim); }
#rangeCard .t { font-size: 21px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--khaki); margin: 3px 0 4px; }
#rangeCard .b { font-size: 14px; line-height: 1.45; color: var(--ink); }
#rangeCard .row { display: flex; align-items: baseline; gap: 14px; margin-top: 2px; }
#rangeCard .sc, #rangeCard .big { font-family: 'IBM Plex Mono', monospace; font-size: 30px; color: var(--ink); }
#rangeCard .gh { font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: #aad7ff; }
#rangeCard .st { margin-top: 4px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--ink-dim); }
@media (max-width: 760px) {
  #gunRange .rng { padding: 14px 16px 24px; }
  .rng h2 { font-size: 26px; }
  .rng-result { grid-template-columns: 1fr; }
  .rng-result .score { font-size: 36px; }
  #rangeCard { top: 64px; right: 12px; width: min(240px, calc(100vw - 24px)); }
}
html[lang=ar] .rng h2, html[lang=ar] #rangeCard .t { letter-spacing: 0; }
`;
  document.head.appendChild(st);
}
export { ensureStyle as ensureRangeStyle };

type Sel = Drill['key'];
let sel: Sel = 'steady';

const starHtml = (n: number) => `<span class="rng-stars" aria-label="${esc(tx('{n} of 3 stars', { n }))}">${'★'.repeat(n)}<i>${'★'.repeat(3 - n)}</i></span>`;

function bestLine(r: RangeRecord | undefined) {
  if (!r) return `<span class="best">${esc(tx('Not flown yet'))}</span>`;
  return `<span class="best">${starHtml(r.stars)} ${esc(tx('Best {n}', { n: num(r.best) }))}${r.ghost ? ' · ' + esc(tx('ghost ready')) : ''}</span>`;
}

function drillCard(d: Drill, rec: RangeRecord | undefined) {
  const on = d.key === sel;
  return `<button type="button" class="rng-drill${on ? ' sel' : ''}" data-drill="${d.key}" aria-pressed="${on}">
    <span class="t">${esc(tx(d.title))}</span><span class="x">${esc(tx(d.text))}</span>${bestLine(rec)}</button>`;
}

function resultPanel(r: RangeResult, booked: ReturnType<typeof bookRun>) {
  const acc = r.shots ? Math.round(r.hits / r.shots * 100) : 0;
  const ghost = r.ghostScore === null ? '' : r.score > r.ghostScore
    ? tx('You beat your ghost by {n}', { n: num(r.score - r.ghostScore) })
    : r.score === r.ghostScore ? tx('Level with your ghost') : tx('Your ghost was {n} ahead', { n: num(r.ghostScore - r.score) });
  const best = booked.newBest
    ? `<span class="nb">${esc(tx(booked.prevBest === null ? 'First score on this drill' : 'New best!'))}</span>`
    : `<span class="lbl">${esc(tx('Best {n}', { n: num(booked.record.best) }))}</span>`;
  return `<div class="rng-result${booked.newBest ? ' best' : ''}" data-result role="status">
    <div><div class="lbl">${esc(tx(r.drill.title))}</div><div class="score">${num(r.score)}</div>${starHtml(booked.stars)}</div>
    <div>${best}<ul>
      <li>${esc(tx('Targets down'))}: <b>${r.downed}/${r.total}</b></li>
      <li>${esc(tx('Hits'))}: <b>${num(r.hits)}</b></li>
      <li>${esc(tx('Accuracy'))}: <b>${acc}%</b></li>
      <li>${esc(tx('Accuracy bonus'))}: <b>+${num(r.bonus)}</b></li>
      ${ghost ? `<li>${esc(ghost)}</li>` : ''}
    </ul></div></div>`;
}

/** The range screen; `result` = a run that just ended (booked here, once). */
export function showGunneryRange(host: RangeScreenHost, result?: RangeResult) {
  ensureStyle();
  const save = loadRange();
  let panel = '';
  if (result) {
    const booked = bookRun(save, result.drill, { score: result.score, ghost: result.ghost });
    saveRange(save);
    panel = resultPanel(result, booked);
    sel = result.drill.key as Sel;
  }
  render(host, save, panel);
}

function render(host: RangeScreenHost, save: RangeSave, panel: string) {
  const root = showLayer('gunRange');
  const p = save.prefs;
  const station = p.station;
  const drills = drillsFor(station);
  const free = freeDrill(station, p.free);
  const opt = <T extends string | number>(name: string, title: string, vals: readonly T[], cur: T, label: (v: T) => string) =>
    `<div class="grp"><span class="lbl" id="rng-${name}">${esc(title)}</span><div class="rng-chips" role="group" aria-labelledby="rng-${name}">${vals.map((v) =>
      `<button type="button" class="btn ghost" data-free="${name}" data-val="${v}" aria-pressed="${v === cur}">${esc(label(v))}</button>`).join('')}</div></div>`;
  root.innerHTML = `<div class="rng"><button class="btn ghost menu-back" data-back>${esc(tx('Back'))}</button>
    <div class="kicker">${esc(tx('GUNNERY RANGE'))}</div><h2>${esc(tx('Practise your gunnery'))}</h2>
    <p class="rng-sub">${esc(tx('Target drones and towed sleeves over the Wash. Nobody shoots back. Every run of a drill flies the same targets, so you can beat your ghost.'))}</p>
    ${panel}
    <h3>${esc(tx('Gun position'))}</h3>
    <div class="rng-seats" role="group" aria-label="${esc(tx('Gun position'))}">${STATION_ORDER.map((id) => `<button type="button" class="btn ghost" data-seat="${id}" aria-pressed="${id === station}">${esc(tx(STATIONS[id].label))}</button>`).join('')}</div>
    <h3>${esc(tx('Drill'))}</h3>
    <div class="rng-list">${drills.map((d) => drillCard(d, save.records[d.id])).join('')}${drillCard(free, save.records[free.id])}</div>
    ${sel === 'free' ? `<div class="rng-free" data-freebox>
      ${opt('kind', tx('Target'), ['drone', 'sleeve'] as const, p.free.kind, (v) => tx(KIND_LABEL[v]))}
      ${opt('speed', tx('Speed'), SPEEDS, p.free.speed, (v) => tx(SPEED_LABEL[v]))}
      ${opt('angle', tx('Angle'), ANGLES, p.free.angle, (v) => tx(ANGLE_LABEL[v]))}
      ${opt('range', tx('Range'), DISTS, p.free.range, (v) => tx('{n} m', { n: v }))}
    </div>` : ''}
    <h3>${esc(tx('Options'))}</h3>
    <div class="rng-opts">
      <label><input type="checkbox" data-opt="tutor"${p.tutor ? ' checked' : ''}><span><b>${esc(tx('Lead tutor'))}</b>${esc(tx('Shows the lead point, the time of flight and coaches your aim.'))}</span></label>
      <label><input type="checkbox" data-opt="ghost"${p.ghost ? ' checked' : ''}><span><b>${esc(tx('Ghost of your best run'))}</b>${esc(tx('A blue ring shows where your best run was aiming, and its score.'))}</span></label>
    </div>
    <div class="rng-actions"><button class="btn primary-go" data-fly>${esc(tx('Start drill'))}</button></div>
  </div>`;
  const persist = () => saveRange(save);
  const again = () => render(host, save, '');
  const back = () => host.menu();
  root.querySelector<HTMLElement>('[data-back]')!.onclick = back;
  onBackKey(root, back);
  root.querySelectorAll<HTMLElement>('[data-seat]').forEach((b) => { b.onclick = () => { p.station = b.dataset.seat as StationId; persist(); again(); }; });
  root.querySelectorAll<HTMLElement>('[data-drill]').forEach((b) => { b.onclick = () => { sel = b.dataset.drill as Sel; again(); root.querySelector<HTMLElement>(`[data-drill="${sel}"]`)?.focus(); }; });
  root.querySelectorAll<HTMLElement>('[data-free]').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.free!, raw = b.dataset.val!;
      const v = k === 'angle' || k === 'range' ? Number(raw) : raw;
      (p.free as unknown as Record<string, unknown>)[k] = v;
      persist(); again();
      root.querySelector<HTMLElement>(`[data-free="${k}"][data-val="${raw}"]`)?.focus();
    };
  });
  root.querySelectorAll<HTMLInputElement>('[data-opt]').forEach((c) => { c.onchange = () => { p[c.dataset.opt as 'tutor' | 'ghost'] = c.checked; persist(); }; });
  root.querySelector<HTMLElement>('[data-fly]')!.onclick = () => {
    const d = sel === 'free' ? freeDrill(station, p.free) : drills.find((x) => x.key === sel) ?? drills[0];
    const ghost = p.ghost ? save.records[d.id]?.ghost ?? null : null;
    host.fly({ drill: d, tutor: p.tutor, ghost });
  };
}


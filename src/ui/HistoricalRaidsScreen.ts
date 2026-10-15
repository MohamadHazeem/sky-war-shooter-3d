// Historical raid mode screens (game/HistoricalRaids.ts holds the data and rules):
// - the raid list: four famous raids with their real numbers and a short note; pick one (and a
//   force for Schweinfurt-Regensburg), one primary "Fly this raid";
// - the end screen on the debrief: your group against history scaled to the same group, the
//   verdict, what really happened, and the way back to the list.
// Simple-menu rules (Phase 8): one primary button, few choices, Back top-leading, Arabic/RTL.
import type { Mission } from '../game/Missions';
import {
  ESCORT_LABEL, FATE_LABEL, RAIDS, VERDICT_TEXT, VERDICT_TITLE, lossRate, loadRecords, pct, raidMission,
  type HistoricalRaid, type RaidComparison, type RaidRecord,
} from '../game/HistoricalRaids';
import { num, tx } from '../i18n';
import { esc, onBackKey, showLayer } from './serviceCommon';

export interface RaidsHost {
  briefing(m: Mission, back: () => void): void;
  menu(): void;
}

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById('hist-css')) return;
  const st = document.createElement('style');
  st.id = 'hist-css';
  st.textContent = `
#histRaids { background: radial-gradient(ellipse at 50% 30%, rgba(26,27,17,0.6), rgba(6,7,4,0.94)); overflow-y: auto; }
#histRaids .hist { width: min(1180px, 100%); margin: 0 auto; padding: 20px 22px 28px; box-sizing: border-box; }
.hist h2 { font-size: 34px; margin: 6px 0 2px; letter-spacing: 3px; text-transform: uppercase; }
.hist-sub { margin: 0 0 14px; color: var(--ink-dim); font-family: 'Special Elite', monospace; font-size: 14px; }
.hist-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; }
.hist-raid { text-align: start; background: var(--panel); border: 1px solid var(--line); color: var(--ink); padding: 14px 16px; font-family: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 6px; }
.hist-raid.sel { border-color: var(--khaki); background: rgba(185,167,111,0.1); box-shadow: inset 0 0 0 1px var(--khaki); }
.hist-raid:focus-visible { outline: 2px solid var(--khaki); outline-offset: 2px; }
.hist-raid .d { font-family: 'Special Elite', monospace; font-size: 12px; letter-spacing: 2px; color: var(--khaki); text-transform: uppercase; }
.hist-raid .t { font-size: 22px; letter-spacing: 1px; line-height: 1.15; }
.hist-nums { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin: 4px 0; }
.hist-nums div { border: 1px solid var(--line); padding: 4px 6px; }
.hist-nums b { display: block; font-family: 'IBM Plex Mono', monospace; font-size: 18px; font-weight: 500; }
.hist-nums span { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: var(--ink-dim); }
.hist-nums .bad b { color: var(--bad); }
.hist-raid .best { font-size: 12px; color: var(--ink-dim); }
.hist-raid .best.better { color: var(--good); }
.hist-detail { background: var(--panel); border: 1px solid var(--line); padding: 14px 16px; margin-top: 14px; }
.hist-detail h3, .hist-report h3 { margin: 0 0 8px; font-size: 13px; letter-spacing: 3px; color: var(--khaki); font-weight: 500; font-family: 'Special Elite', monospace; text-transform: uppercase; }
.hist-detail p, .hist-report p { font-family: 'Special Elite', monospace; font-size: 14px; line-height: 1.55; color: var(--ink-dim); margin: 0 0 8px; }
.hist-forces { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0 4px; }
.hist-forces button[aria-pressed="true"] { border-color: var(--khaki); color: var(--khaki); }
.hist-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 12px; }
.hist-actions .btn.primary-go { font-size: 18px; padding: 12px 26px; }
.hist-report { margin-top: 12px; text-align: start; background: var(--panel); border: 1px solid var(--line); padding: 12px 14px; }
.hist-verdict { font-size: 26px; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 6px; }
.hist-verdict.better { color: var(--good); } .hist-verdict.worse, .hist-verdict.failed { color: var(--bad); }
.hist-table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; font-size: 14px; }
.hist-table th, .hist-table td { text-align: start; padding: 5px 6px; border-bottom: 1px dashed var(--line); }
.hist-table th { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--ink-dim); font-weight: 500; }
.hist-table td b { font-family: 'IBM Plex Mono', monospace; font-weight: 500; }
@media (max-width: 760px) {
  #histRaids .hist { padding: 14px 16px 24px; }
  .hist h2 { font-size: 26px; }
  .hist-table { font-size: 12px; }
}
html[lang=ar] .hist h2, html[lang=ar] .hist-verdict { letter-spacing: 0; }
`;
  document.head.appendChild(st);
}

const n = (v: number) => num(v);
const bestLine = (r: RaidRecord | undefined) => {
  if (!r?.best) return `<span class="best">${esc(tx('Not flown yet'))}</span>`;
  return `<span class="best ${r.best.verdict}">${esc(tx('Your best: {lost} of {total} lost · {verdict}', { lost: r.best.lost, total: r.best.total, verdict: tx(VERDICT_TITLE[r.best.verdict]) }))}</span>`;
};

function raidCard(r: HistoricalRaid, i: number, sel: boolean, rec: RaidRecord | undefined) {
  return `<button type="button" class="hist-raid${sel ? ' sel' : ''}" data-raid="${i}" aria-pressed="${sel}">
    <span class="d">${esc(tx(r.date))}</span><span class="t">${esc(tx(r.title))}</span>
    <div class="hist-nums">
      <div><b>${n(r.dispatched)}</b><span>${esc(tx(r.id === 'bw' ? 'Sorties' : 'Dispatched'))}</span></div>
      <div class="bad"><b>${n(r.lost)}</b><span>${esc(tx('Lost'))}</span></div>
      <div><b>${pct(lossRate(r))}</b><span>${esc(tx('Loss rate'))}</span></div>
    </div>
    ${bestLine(rec)}
  </button>`;
}

let selected = 0, force = 0;

/** The raid list (Hangar → Crew & Skills → Historical Raids). */
export function showHistoricalRaids(host: RaidsHost) {
  ensureStyle();
  const root = showLayer('histRaids');
  const recs = loadRecords();
  const r = RAIDS[selected] ?? RAIDS[0];
  if (force >= r.forces.length) force = 0;
  const f = r.forces[force];
  root.innerHTML = `<div class="hist"><button class="btn ghost menu-back" data-back>${esc(tx('Back'))}</button>
    <div class="kicker">${esc(tx('HISTORICAL RAIDS'))}</div><h2>${esc(tx('Fly the famous raids'))}</h2>
    <p class="hist-sub">${esc(tx('Four raids of the Eighth Air Force with their real numbers. Your group of twelve is measured against what really happened.'))}</p>
    <div class="hist-list">${RAIDS.map((x, i) => raidCard(x, i, i === selected, recs[x.id])).join('')}</div>
    <div class="hist-detail" data-detail>
      <h3>${esc(tx(r.title))} · ${esc(tx(r.date))}</h3>
      <p>${esc(tx(r.note))}</p>
      <p><b>${esc(tx('Escort'))}:</b> ${esc(tx(ESCORT_LABEL[r.escort]))} · <b>${esc(tx('Airmen lost'))}:</b> ${esc(tx('about {n}', { n: n(r.airmen) }))} · <b>${esc(tx('Luftwaffe fighters lost'))}:</b> ${esc(tx('about {n}', { n: n(r.fighters) }))}</p>
      ${r.forces.length > 1 ? `<div class="hist-forces" role="group" aria-label="${esc(tx('Force'))}">${r.forces.map((x, i) => `<button type="button" class="btn ghost" data-force="${i}" aria-pressed="${i === force}">${esc(tx(x.label))}</button>`).join('')}</div>` : ''}
      <p>${esc(tx('Target'))}: ${esc(tx(f.target))}</p>
      <div class="hist-actions"><button class="btn primary-go" data-fly>${esc(tx('Fly this raid'))}</button></div>
    </div>
  </div>`;
  const back = () => host.menu();
  root.querySelector<HTMLElement>('[data-back]')!.onclick = back;
  onBackKey(root, back);
  root.querySelectorAll<HTMLElement>('[data-raid]').forEach((b) => { b.onclick = () => { selected = Number(b.dataset.raid); force = 0; showHistoricalRaids(host); root.querySelector<HTMLElement>('[data-fly]')?.focus(); }; });
  root.querySelectorAll<HTMLElement>('[data-force]').forEach((b) => { b.onclick = () => { force = Number(b.dataset.force); showHistoricalRaids(host); }; });
  root.querySelector<HTMLElement>('[data-fly]')!.onclick = () => host.briefing(raidMission(r.id, force), () => showHistoricalRaids(host));
}

/** BriefingExtras.decorateBriefing: the mode on the kicker. */
export function decorateRaidBriefing(sheet: HTMLElement) {
  const k = sheet.querySelector<HTMLElement>('.kicker');
  if (k) k.textContent = tx('HISTORICAL RAID') + ' · ' + k.textContent;
}

/** End of showDebrief for a historical raid: you against history, and the way back to the list. */
export function mountRaidReport(c: RaidComparison, newBest: boolean, shuttle: boolean, openList: () => void) {
  ensureStyle();
  const host = document.querySelector<HTMLElement>('#debrief .box');
  if (!host) return;
  host.querySelector('.lb-panel')?.remove();
  host.querySelector('[data-hist-report]')?.remove();
  const r = c.raid, res = c.result;
  const fate = res.fate === 'home' && shuttle ? 'Reached North Africa' : FATE_LABEL[res.fate];
  const box = document.createElement('div');
  box.className = 'hist-report';
  box.dataset.histReport = '';
  box.innerHTML = `<h3>${esc(tx('Historical raid · {title}', { title: tx(r.title) }))}</h3>
    <div class="hist-verdict ${c.verdict}">${esc(tx(VERDICT_TITLE[c.verdict]))}</div>
    <p>${esc(tx(VERDICT_TEXT[c.verdict]))}${newBest ? ' ' + esc(tx('A new best for this raid.')) : ''}</p>
    <table class="hist-table">
      <thead><tr><th></th><th>${esc(tx('Your group'))}</th><th>${esc(tx('History, scaled to {n} ships', { n: res.bombersTotal }))}</th><th>${esc(tx('History, the whole raid'))}</th></tr></thead>
      <tbody>
        <tr><th>${esc(tx('Bombers lost'))}</th><td><b>${res.bombersLost}/${res.bombersTotal}</b></td><td><b>${c.histInGroup}/${res.bombersTotal}</b></td><td><b>${n(r.lost)}/${n(r.dispatched)}</b></td></tr>
        <tr><th>${esc(tx('Loss rate'))}</th><td><b>${pct(c.yourRate)}</b></td><td colspan="2"><b>${pct(c.histRate)}</b></td></tr>
        <tr><th>${esc(tx('Fighters downed'))}</th><td><b>${res.kills}</b></td><td><b>${c.histFightersInGroup}</b></td><td>${esc(tx('about {n}', { n: n(r.fighters) }))}</td></tr>
        <tr><th>${esc(tx('Your ship'))}</th><td colspan="3">${esc(tx(fate))}</td></tr>
      </tbody>
    </table>
    <p><b>${esc(tx('What really happened'))}:</b> ${esc(tx(r.outcome))}</p>
    ${r.writtenOff ? `<p>${esc(tx('A further {n} bombers were wrecked on return and never flew again.', { n: r.writtenOff }))}</p>` : ''}
    ${r.claims ? `<p>${esc(tx('The bomber gunners claimed {claims} fighters that day; the Luftwaffe actually lost about {n}.', { claims: n(r.claims), n: n(r.fighters) }))}</p>` : ''}
    <div class="hist-actions"><button class="btn" data-hist>${esc(tx('Back to Historical Raids'))}</button></div>`;
  const row = host.querySelector('.row');
  if (row) row.before(box); else host.appendChild(box);
  box.querySelector<HTMLElement>('[data-hist]')!.onclick = openList;
}

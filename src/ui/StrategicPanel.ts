// Strategic air war UI (game/StrategicWar.ts): the "War industry" card on the campaign map, the
// industry map (a chart of the German target sites, coloured by damage) and the weekly
// newsreel card on the debrief. Simple by design (Phase 8): four bars, one button, one card.
//
// Hooks (ui/CampaignMap.ts): industryCardHtml + wireIndustryCard on the map, mountNewsreel after
// the debrief's intelligence report. The spawn-time enemy-mix hook is registered here.
import { CHART } from './BriefingMap';
import { ENEMY_MIX } from '../game/Modes';
import { randomEnemyType } from '../world/EnemyTypes';
import type { CampaignData } from '../game/CampaignState';
import {
  activeIndustry, industryFactors, industryType, isNeutral, loadStrategic, sectorOutput, SECTORS, SITES,
  type Newsreel, type ReelLine, type Sector, type StrategicData,
} from '../game/StrategicWar';
import { tx, isAr } from '../i18n';

// Story operations: the fighter mix follows the factories that were hit (null = untouched)
ENEMY_MIX.push((m, tier) => {
  const f = activeIndustry(m.id);
  return f ? industryType(randomEnemyType(tier), f, Math.random) : null;
});

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const SECTOR_LABEL: Record<Sector, string> = { aircraft: 'Aircraft factories', bearings: 'Ball bearings', oil: 'Oil', rail: 'Rail' };
const SECTOR_COLOR: Record<Sector, string> = { aircraft: '#c9a54a', bearings: '#9fb7c9', oil: '#b0643a', rail: '#8f9a6a' };

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById('sw-css')) return;
  const st = document.createElement('style');
  st.id = 'sw-css';
  st.textContent = `
.sw-sec { display: grid; grid-template-columns: minmax(0, 1fr) 46px; gap: 2px 10px; align-items: center; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px; }
.sw-sec b { font-family: 'IBM Plex Mono', monospace; font-weight: 500; text-align: end; letter-spacing: 0; }
.sw-sec .cm-bar { grid-column: 1 / -1; margin: 0; }
.sw-note { color: var(--ink-dim); font-family: 'IBM Plex Mono', monospace; font-size: 12px; margin: 6px 0 0; }
.sw-head { font-family: 'Special Elite', monospace; font-size: 13px; margin: 8px 0 0; line-height: 1.4; }
.sw-card .btn { padding: 7px 14px; font-size: 13px; margin-top: 10px; }
.sw-reel { margin-top: 16px; padding: 14px 18px 12px; background: #1b1812; color: #e9dfc4; border: 1px solid #000;
  box-shadow: inset 0 0 0 6px #0c0b08, inset 0 0 60px rgba(0,0,0,0.65); position: relative; text-align: start; }
.sw-reel::before, .sw-reel::after { content: ''; position: absolute; top: 0; bottom: 0; width: 6px;
  background: repeating-linear-gradient(#0c0b08 0 6px, #3a352a 6px 10px); }
.sw-reel::before { left: 0; } .sw-reel::after { right: 0; }
.sw-reel .k { font-family: 'Special Elite', monospace; font-size: 12px; letter-spacing: 3px; color: #b9a76f; text-transform: uppercase; }
.sw-reel h4 { margin: 4px 0 8px; font-family: 'Oswald', sans-serif; font-weight: 500; font-size: 24px; letter-spacing: 2px; text-transform: uppercase; line-height: 1.15; }
.sw-reel p { margin: 0 0 5px; font-family: 'Special Elite', monospace; font-size: 13px; line-height: 1.45; color: #cfc4a6; }
.sw-reel p.good { color: #b8d28a; } .sw-reel p.bad { color: #e59a85; }
.sw-reel .bars { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); gap: 6px 14px; margin: 8px 0 10px; }
.sw-reel .bars div { font-size: 11px; letter-spacing: 0.5px; white-space: nowrap; text-transform: uppercase; color: #cfc4a6; }
.sw-reel .bars b { font-family: 'IBM Plex Mono', monospace; font-weight: 500; color: #e9dfc4; }
.sw-reel .bars i { display: block; height: 5px; margin-top: 3px; background: rgba(255,255,255,0.1); position: relative; }
.sw-reel .bars i u { position: absolute; inset: 0 auto 0 0; }
@media (prefers-reduced-motion: no-preference) { .sw-reel h4 { animation: sw-flicker 2.4s steps(12) 1; } }
@keyframes sw-flicker { 0% { opacity: 0.2; } 10% { opacity: 0.9; } 14% { opacity: 0.55; } 30%, 100% { opacity: 1; } }
.sw-map { position: fixed; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center; background: rgba(6,7,4,0.82); padding: 16px; }
.sw-map .cm-card { width: min(980px, 100%); max-height: 100%; overflow-y: auto; }
.sw-map .grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(240px, 1fr); gap: 14px; align-items: start; }
.sw-map svg { display: block; width: 100%; height: auto; background: #e7dbb8; }
.sw-map .legend { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 12px; color: var(--ink-dim); margin-top: 8px; }
.sw-map .legend span::before { content: '●'; margin-inline-end: 5px; color: var(--c); }
.sw-map .sites { font-size: 13px; line-height: 1.55; color: var(--ink-dim); margin: 0; padding: 0; list-style: none; }
.sw-map .sites li b { color: var(--ink); font-weight: 500; }
@media (max-width: 760px) { .sw-map .grid { grid-template-columns: minmax(0, 1fr); } }
html[lang=ar] .sw-reel .k, html[lang=ar] .sw-reel p, html[lang=ar] .sw-head { font-family: 'Special Elite', 'Noto Naskh Arabic', monospace; letter-spacing: 0; line-height: 1.7; }
html[lang=ar] .sw-reel h4, html[lang=ar] .sw-sec { letter-spacing: 0; }
html[lang=ar] .sw-note { font-family: 'IBM Plex Mono', 'IBM Plex Sans Arabic', monospace; line-height: 1.6; }
html[dir=rtl] .sw-reel .bars i u { inset: 0 0 0 auto; }
`;
  document.head.appendChild(st);
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const translatedVars = (l: ReelLine) => (l.vars ? Object.fromEntries(Object.entries(l.vars).map(([k, v]) => [k, typeof v === 'string' ? tx(v) : v])) : undefined);
const line = (l: ReelLine) => tx(l.text, translatedVars(l));

function sectorBars(d: StrategicData): string {
  return SECTORS.map((s) => {
    const v = sectorOutput(d, s);
    return `<div class="sw-sec"><span>${esc(tx(SECTOR_LABEL[s]))}</span><b>${pct(v)}</b>
      <div class="cm-bar"><i style="width:${Math.round(v * 100)}%;background:${SECTOR_COLOR[s]}"></i></div></div>`;
  }).join('');
}

/** The campaign map's side card: the four sectors and what they mean for the next mission. */
export function industryCardHtml(c: CampaignData): string {
  ensureStyle();
  let d: StrategicData;
  try { d = loadStrategic(c); } catch { return ''; }
  const f = industryFactors(d);
  const note = isNeutral(f) ? tx('Untouched: German industry is at full output') : tx('From industry: fighters x{a} · skill x{b}', { a: f.enemy.toFixed(2), b: f.skill.toFixed(2) });
  return `<div class="cm-card sw-card"><h3>${tx('War industry')}</h3>${sectorBars(d)}
    <p class="sw-note">${esc(note)}</p>
    ${d.reel ? `<p class="sw-head">${esc(line(d.reel.headline))}</p>` : ''}
    <button class="btn ghost" data-sw-map>${tx('Industry map')}</button></div>`;
}

export function wireIndustryCard(root: HTMLElement, c: CampaignData) {
  root.querySelector('[data-sw-map]')?.addEventListener('click', () => showIndustryMap(c));
}

// ---------------- industry map ----------------

const W = 560, H = 440, LON0 = 5.6, LON1 = 15.4, LAT1 = 55.0;
const S = W / ((LON1 - LON0) * CHART.KX);
const X = (lon: number) => (lon - LON0) * CHART.KX * S;
const Y = (lat: number) => (LAT1 - lat) * S;
const f1 = (n: number) => n.toFixed(1);
// neighbouring sites: these labels go on the other side (or above / below) so none overlap
const LABEL_LEFT = new Set(['hannover', 'leuna', 'berlin', 'gelsenkirchen', 'politz']);
const LABEL_DY: Record<string, number> = { berlin: -4, erkner: 9, hamm: 9 };

function mapSvg(d: StrategicData): string {
  const ring = (r: readonly (readonly [number, number])[]) => 'M' + r.map(([lon, lat]) => `${f1(X(lon))} ${f1(Y(lat))}`).join('L') + 'Z';
  const marks = SITES.map((s) => {
    const st = d.sites[s.id];
    const dmg = st?.dmg ?? 0, pending = (st?.queue.length ?? 0) > 0;
    const r = 4 + Math.sqrt(s.output) * 1.2;
    const x = X(s.lon), y = Y(s.lat);
    const fill = SECTOR_COLOR[s.sector];
    const left = LABEL_LEFT.has(s.id), dy = LABEL_DY[s.id] ?? 4;
    return `<g><title>${esc(`${tx(s.name)}, ${tx(s.city)} · ${tx(SECTOR_LABEL[s.sector])} · ${pct(1 - dmg)}`)}</title>
      <circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${fill}" stroke="#2b2518" stroke-width="1.2" opacity="${(1 - dmg * 0.6).toFixed(2)}"/>
      ${dmg > 0.02 ? `<path d="M${f1(x)} ${f1(y)}L${f1(x)} ${f1(y - r)}A${f1(r)} ${f1(r)} 0 ${dmg > 0.5 ? 1 : 0} 1 ${f1(x + r * Math.sin(dmg * 2 * Math.PI))} ${f1(y - r * Math.cos(dmg * 2 * Math.PI))}Z" fill="#2b2518" opacity="0.75"/>` : ''}
      ${pending ? `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r + 4)}" fill="none" stroke="#8e2418" stroke-width="1.4" stroke-dasharray="3 3"/>` : ''}
      <text x="${f1(left ? x - r - 3 : x + r + 3)}" y="${f1(y + dy)}" text-anchor="${left ? 'end' : 'start'}" font-size="11" fill="#2b2518">${esc(tx(s.city))}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="direction:ltr" role="img" aria-label="${esc(tx('Industry map'))}">
    <g fill="#d6c28e" stroke="#4d3b1e" stroke-width="1"><path d="${ring(CHART.MAINLAND)}"/></g>
    <text x="${f1(X(9.6))}" y="${f1(Y(50.4))}" text-anchor="middle" font-style="italic" font-size="15" fill="#4d3b1e" opacity="0.6" letter-spacing="${isAr() ? 0 : 4}">${esc(tx('GERMANY'))}</text>
    ${marks}</svg>`;
}

export function showIndustryMap(c: CampaignData) {
  ensureStyle();
  let d: StrategicData;
  try { d = loadStrategic(c); } catch { return; }
  document.querySelector('.sw-map')?.remove();
  const wrap = document.createElement('div');
  wrap.className = 'sw-map';
  const worst = SITES.filter((s) => (d.sites[s.id]?.dmg ?? 0) > 0.02 || d.sites[s.id]?.queue.length)
    .sort((a, b) => d.sites[b.id].dmg - d.sites[a.id].dmg).slice(0, 6);
  const f = industryFactors(d);
  wrap.innerHTML = `<div class="cm-card" role="dialog" aria-modal="true"><h3>${tx('Industry map')}</h3>
    <div class="grid"><div>${mapSvg(d)}
      <div class="legend">${SECTORS.map((s) => `<span style="--c:${SECTOR_COLOR[s]}">${esc(tx(SECTOR_LABEL[s]))}</span>`).join('')}</div></div>
      <div>${sectorBars(d)}
        <p class="sw-note">${esc(tx('Dark wedge: damage. Dashed ring: damage still on its way to the production lines.'))}</p>
        <ul class="sites">${worst.map((s) => `<li><b>${esc(tx(s.city))}</b> · ${esc(tx(s.name))} · ${pct(1 - d.sites[s.id].dmg)}${d.sites[s.id].queue.length ? ' ⌛' : ''}</li>`).join('') || `<li>${esc(tx('No German works hit yet.'))}</li>`}</ul>
        <p class="sw-note">${esc(tx('Fighter deliveries {a} · pilot training {b} · jets {c}', { a: pct(d.fighters), b: pct(d.pilots), c: pct(f.jets) }))}</p>
      </div></div>
    <div class="cm-foot"><button class="btn" data-sw-back>${tx('Back')}</button></div></div>`;
  // Esc / Backspace close the map only (captured before the campaign screen's own Back key)
  const key = (e: KeyboardEvent) => {
    if (e.code !== 'Escape' && e.code !== 'Backspace') return;
    e.preventDefault(); e.stopImmediatePropagation(); close();
  };
  const close = () => { wrap.remove(); removeEventListener('keydown', key, true); };
  wrap.querySelector('[data-sw-back]')!.addEventListener('click', close);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  addEventListener('keydown', key, true);
  (document.getElementById('campaign') ?? document.body).appendChild(wrap);
  wrap.querySelector<HTMLButtonElement>('[data-sw-back]')?.focus();
}

// ---------------- newsreel ----------------

export function newsreelHtml(r: Newsreel): string {
  ensureStyle();
  const kicker = r.weeks > 1 ? tx('The air war · {n} weeks from {date}', { n: r.weeks, date: tx(r.date) }) : tx('The air war this week · {date}', { date: tx(r.date) });
  const bars = r.sectors.map((s) => {
    const d = s.after - s.before;
    return `<div>${esc(tx(SECTOR_LABEL[s.sector]))} <b>${s.after}%</b>${d ? ` <span style="color:${d < 0 ? '#b8d28a' : '#e59a85'}">${d > 0 ? '+' : '−'}${Math.abs(d)}</span>` : ''}<i><u style="width:${s.after}%;background:${SECTOR_COLOR[s.sector]}"></u></i></div>`;
  }).join('');
  const p = (l: ReelLine) => `<p class="${l.tone ?? ''}">${esc(line(l))}</p>`;
  return `<div class="sw-reel" aria-label="${esc(tx('Newsreel'))}"><div class="k">${esc(kicker)}</div>
    <h4>${esc(line(r.headline))}</h4>${r.lines.map(p).join('')}<div class="bars">${bars}</div>${r.forecast.map(p).join('')}</div>`;
}

/** Debrief: the newsreel card in the intelligence report, above its buttons (nothing for replays). */
export function mountNewsreel(report: HTMLElement, r: Newsreel | null | undefined) {
  if (!r) return;
  const row = report.querySelector(':scope > .row');
  if (row) row.insertAdjacentHTML('beforebegin', newsreelHtml(r));
  else report.insertAdjacentHTML('beforeend', newsreelHtml(r));
}

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
.sw-map svg { display: block; width: min(100%, calc((100vh - 190px) * ${(W / H).toFixed(3)})); min-width: min(100%, 320px); height: auto; margin: 0 auto; background: #e7dbb8; }
.sw-map .legend { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 12px; color: var(--ink-dim); margin-top: 8px; }
.sw-map .legend span::before { content: '●'; margin-inline-end: 5px; color: var(--c); }
.sw-map .legend span.fr::before { content: '—·—'; letter-spacing: -1px; color: #4d3b1e; }
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

// The chart frames every site (Gelsenkirchen in the west to Pölitz in the east, the Baltic coast
// down to Stuttgart and Regensburg) with the campaign map's projection, paper, graticule and frame.
const LON0 = 5.5, LON1 = 15.3, LAT1 = 54.9, LAT0 = 48.3;
const W = 560;
const S = W / ((LON1 - LON0) * CHART.KX);
const H = Math.round((LAT1 - LAT0) * S);
const X = (lon: number) => (lon - LON0) * CHART.KX * S;
const Y = (lat: number) => (LAT1 - lat) * S;
const f1 = (n: number) => n.toFixed(1);
const PAPER = '#e7dbb8', LAND = '#d6c28e', COAST = '#4d3b1e', INK = '#2b2518', GRID = '#7a6240', RIVER = '#4f6f7c';
export const INDUSTRY_CHART = { W, H } as const;
/** Where a site's marker is drawn on the industry chart (viewBox units). */
export function industryXY(s: { id: string; lat: number; lon: number }): [number, number] {
  const o = MARK_SHIFT[s.id];
  return [X(s.lon) + (o?.[0] ?? 0), Y(s.lat) + (o?.[1] ?? 0)];
}
// Misburg lies on Hannover's eastern edge: its marker is pulled clear with a leader line to the true spot.
const MARK_SHIFT: Record<string, [number, number]> = { misburg: [16, -24] };
// Label side per site (r = right, l = left, t = above, b = below), checked in EN and AR so none overlap.
const LABEL_SIDE: Record<string, 'r' | 'l' | 't' | 'b'> = {
  hannover: 'l', leuna: 'l', berlin: 't', gelsenkirchen: 'b', politz: 'l', munster: 'l', erkner: 'b',
  frankfurt: 'l', ludwigshafen: 'l', misburg: 'r', oschersleben: 'b', brunswick: 't', osnabruck: 'l',
};

// Simplified rivers [lon, lat] (the Rhine, Main, Neckar, Danube, Elbe, Saale, Weser, Ems, Oder); each is named along segment `seg`.
const RIVERS: { name: string; seg: number; pts: [number, number][] }[] = [
  { name: 'Rhine', seg: 8, pts: [[7.8, 47.6], [7.6, 48.3], [7.95, 48.75], [8.35, 49.05], [8.46, 49.49], [8.36, 49.85], [8.27, 50.0], [7.9, 49.97], [7.6, 50.36], [7.1, 50.73], [6.96, 50.94], [6.77, 51.23], [6.75, 51.43], [6.6, 51.66], [6.2, 51.84], [5.85, 51.86], [5.3, 51.88], [4.5, 51.9]] },
  { name: 'Main', seg: 5, pts: [[11.6, 50.1], [10.9, 49.9], [10.5, 50.0], [10.23, 50.05], [9.93, 49.79], [9.58, 49.99], [9.15, 49.97], [8.68, 50.1], [8.27, 50.0]] },
  { name: 'Neckar', seg: 3, pts: [[8.6, 48.2], [9.0, 48.6], [9.2, 48.8], [9.22, 49.14], [9.0, 49.35], [8.69, 49.41], [8.46, 49.49]] },
  { name: 'Danube', seg: 8, pts: [[8.5, 47.95], [9.2, 48.1], [9.99, 48.4], [10.8, 48.7], [11.42, 48.76], [11.88, 48.92], [12.1, 49.02], [12.57, 48.88], [12.96, 48.83], [13.46, 48.57], [14.29, 48.31], [15.5, 48.3]] },
  { name: 'Elbe', seg: 10, pts: [[14.6, 50.6], [14.2, 50.85], [13.74, 51.05], [13.47, 51.16], [13.0, 51.56], [12.65, 51.86], [12.24, 51.85], [11.9, 51.95], [11.63, 52.13], [11.97, 52.54], [11.75, 53.0], [11.2, 53.15], [10.57, 53.37], [9.99, 53.55], [9.42, 53.79], [8.7, 53.87]] },
  { name: 'Saale', seg: 1, pts: [[11.92, 50.32], [11.6, 50.65], [11.59, 50.93], [11.81, 51.15], [11.97, 51.48], [11.74, 51.79], [11.9, 51.95]] },
  { name: 'Weser', seg: 1, pts: [[9.65, 51.42], [9.5, 51.75], [9.36, 52.1], [8.92, 52.29], [9.2, 52.64], [9.0, 52.9], [8.8, 53.08], [8.57, 53.55]] },
  { name: 'Ems', seg: 3, pts: [[8.6, 51.8], [8.0, 51.9], [7.44, 52.28], [7.29, 52.69], [7.3, 53.0], [7.2, 53.32]] },
  { name: 'Oder', seg: 5, pts: [[16.0, 51.3], [15.5, 51.85], [15.1, 52.05], [14.65, 52.15], [14.55, 52.35], [14.63, 52.58], [14.28, 53.06], [14.45, 53.3], [14.55, 53.43], [14.3, 53.75]] },
];
// Germany's 1937 frontier where it runs inside the chart: Denmark, Holland, Belgium, France, Bohemia.
const FRONTIER: [number, number][][] = [
  [[8.4, 54.95], [9.0, 54.82], [9.45, 54.82], [9.9, 54.8]],
  [[7.2, 53.25], [7.05, 52.65], [6.7, 52.48], [7.05, 52.23], [6.75, 51.95], [5.95, 51.82], [6.2, 51.5], [5.98, 51.05], [6.1, 50.75], [6.4, 50.32], [6.1, 50.13], [6.5, 49.78], [6.37, 49.47], [7.0, 49.15], [7.6, 49.1], [8.2, 48.97], [7.8, 48.5], [7.55, 47.6]],
  [[15.6, 50.75], [15.0, 50.88], [14.8, 50.85], [14.3, 50.9], [13.5, 50.65], [13.0, 50.45], [12.5, 50.38], [12.1, 50.3], [12.45, 49.75], [12.9, 49.35], [13.6, 48.95], [13.8, 48.6], [13.4, 48.4], [13.0, 47.5]],
];
const SEAS: [string, number, number][] = [['NORTH SEA', 6.75, 54.35], ['BALTIC SEA', 11.4, 54.62]];
const LANDS: [string, number, number][] = [['GERMANY', 11.0, 52.86], ['FRANCE', 6.75, 49.06], ['HOLLAND', 6.2, 52.62]];

const chartFont = () => `'Special Elite', Georgia, serif${isAr() ? ", 'Noto Naskh Arabic'" : ''}`;
const halo = `stroke="${PAPER}" stroke-width="3" paint-order="stroke" stroke-linejoin="round"`;

function mapSvg(d: StrategicData): string {
  const ring = (r: readonly (readonly [number, number])[]) => 'M' + r.map(([lon, lat]) => `${f1(X(lon))} ${f1(Y(lat))}`).join('L') + 'Z';
  const poly = (r: readonly (readonly [number, number])[]) => 'M' + r.map(([lon, lat]) => `${f1(X(lon))} ${f1(Y(lat))}`).join('L');
  const grid: string[] = [];
  for (let la = Math.ceil(LAT0); la <= LAT1; la++) grid.push(`<line x1="0" x2="${W}" y1="${f1(Y(la))}" y2="${f1(Y(la))}"/><text data-lbl="grid" x="14" y="${f1(Y(la) - 3)}">${esc(tx('{n}°N', { n: la }))}</text>`);
  for (let lo = Math.ceil(LON0); lo <= LON1; lo++) grid.push(`<line x1="${f1(X(lo))}" x2="${f1(X(lo))}" y1="0" y2="${H}"/>${lo % 2 || X(lo) > W - 230 ? '' : `<text data-lbl="grid" x="${f1(X(lo) + 3)}" y="${H - 14}">${esc(tx('{n}°E', { n: lo }))}</text>`}`);
  const rivers = RIVERS.map((r) => `<path d="${poly(r.pts)}"/>`).join('');
  const riverNames = RIVERS.map((r) => {
    const [ax, ay] = [X(r.pts[r.seg][0]), Y(r.pts[r.seg][1])], [bx, by] = [X(r.pts[r.seg + 1][0]), Y(r.pts[r.seg + 1][1])];
    let a = Math.atan2(by - ay, bx - ax);
    if (a > Math.PI / 2) a -= Math.PI; else if (a <= -Math.PI / 2) a += Math.PI;   // keep the lettering upright
    const x = (ax + bx) / 2 + Math.sin(a) * 6, y = (ay + by) / 2 - Math.cos(a) * 6;   // just above the stream
    return `<text data-lbl="river" transform="translate(${f1(x)} ${f1(y)}) rotate(${(a * 180 / Math.PI).toFixed(0)})" text-anchor="middle">${esc(tx(r.name))}</text>`;
  }).join('');
  const names = [...SEAS.map(([n, lon, lat]) => `<text data-lbl="sea" x="${f1(X(lon))}" y="${f1(Y(lat))}" text-anchor="middle" font-size="11" fill="${RIVER}" letter-spacing="${isAr() ? 0 : 3}">${esc(tx(n))}</text>`),
    ...LANDS.map(([n, lon, lat], i) => `<text data-lbl="land" x="${f1(X(lon))}" y="${f1(Y(lat))}" text-anchor="middle" font-size="${i ? 10.5 : 17}" fill="${COAST}" opacity="${i ? 0.7 : 0.55}" letter-spacing="${isAr() ? 0 : i ? 2 : 6}">${esc(tx(n))}</text>`)].join('');

  const marks = SITES.map((s) => {
    const st = d.sites[s.id];
    const dmg = st?.dmg ?? 0, pending = (st?.queue.length ?? 0) > 0;
    const r = 4 + Math.sqrt(s.output) * 1.2;
    const [x, y] = industryXY(s);
    const fill = SECTOR_COLOR[s.sector];
    const side = LABEL_SIDE[s.id] ?? 'r';
    const [lx, ly, anchor] = side === 'l' ? [x - r - 3, y + 4, 'end'] : side === 'r' ? [x + r + 3, y + 4, 'start'] : side === 't' ? [x, y - r - 4, 'middle'] : [x, y + r + 11, 'middle'];
    const leader = MARK_SHIFT[s.id] ? `<line x1="${f1(X(s.lon))}" y1="${f1(Y(s.lat))}" x2="${f1(x)}" y2="${f1(y)}" stroke="${INK}" stroke-width=".8"/><circle cx="${f1(X(s.lon))}" cy="${f1(Y(s.lat))}" r="1.8" fill="${INK}"/>` : '';
    return `<g data-site="${s.id}"><title>${esc(`${tx(s.name)}, ${tx(s.city)} · ${tx(SECTOR_LABEL[s.sector])} · ${pct(1 - dmg)}`)}</title>${leader}
      <circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${fill}" stroke="${INK}" stroke-width="1.2" opacity="${(1 - dmg * 0.6).toFixed(2)}"/>
      ${dmg > 0.02 ? `<path d="M${f1(x)} ${f1(y)}L${f1(x)} ${f1(y - r)}A${f1(r)} ${f1(r)} 0 ${dmg > 0.5 ? 1 : 0} 1 ${f1(x + r * Math.sin(dmg * 2 * Math.PI))} ${f1(y - r * Math.cos(dmg * 2 * Math.PI))}Z" fill="${INK}" opacity="0.75"/>` : ''}
      ${pending ? `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r + 4)}" fill="none" stroke="#8e2418" stroke-width="1.4" stroke-dasharray="3 3"/>` : ''}
      <text x="${f1(lx)}" y="${f1(ly)}" text-anchor="${anchor}" font-size="11.5" fill="${INK}" ${halo}>${esc(tx(s.city))}</text></g>`;
  }).join('');

  // scale bar in statute miles (1 degree of latitude is about 69 miles) and a compass
  const bar = (100 / 69.05) * S;
  const scale = `<g data-lbl="scale" transform="translate(18 ${H - 30})" font-size="9" fill="${INK}">
      <rect x="0" y="-4" width="${f1(bar / 2)}" height="4" fill="${INK}"/>
      <rect x="${f1(bar / 2)}" y="-4" width="${f1(bar / 2)}" height="4" fill="${PAPER}" stroke="${INK}" stroke-width=".6"/>
      <text x="0" y="-8">0</text><text x="${f1(bar)}" y="-8" text-anchor="end">${esc(tx('{n} MI', { n: 100 }))}</text></g>`;
  const compass = `<g transform="translate(${W - 36} 44)">
      <circle r="15" fill="${PAPER}" fill-opacity=".7" stroke="${INK}" stroke-width=".8"/>
      <path d="M0 -15L3 0L-3 0Z" fill="${INK}"/><path d="M0 15L3 0L-3 0Z" fill="${PAPER}" stroke="${INK}" stroke-width=".6"/>
      <path d="M-15 0L0 -2.5L15 0L0 2.5Z" fill="none" stroke="${INK}" stroke-width=".6"/>
      <text y="-19" text-anchor="middle" font-size="11" font-weight="700" fill="${INK}">${esc(tx('N (compass)').replace(' (compass)', ''))}</text></g>`;

  return `<svg viewBox="0 0 ${W} ${H}" style="direction:ltr" direction="ltr" role="img" aria-label="${esc(tx('Industry map'))}" font-family="${chartFont()}">
    <defs>
      <pattern id="sw-sea" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 4H8" stroke="${RIVER}" stroke-width=".5" opacity=".35"/></pattern>
      <radialGradient id="sw-vig" cx="50%" cy="50%" r="75%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#3a2a10" stop-opacity=".35"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="${PAPER}"/><rect width="${W}" height="${H}" fill="url(#sw-sea)"/>
    <g fill="${LAND}" stroke="${COAST}" stroke-width="1.1" stroke-linejoin="round"><path d="${ring(CHART.MAINLAND)}"/>
      ${CHART.ISLANDS.map(([lon, lat]) => `<ellipse cx="${f1(X(lon))}" cy="${f1(Y(lat))}" rx="3" ry="1.6" stroke-width=".6"/>`).join('')}</g>
    <g stroke="${GRID}" stroke-width=".5" stroke-dasharray="2 3" opacity=".6" font-size="9" fill="${GRID}">${grid.join('')}</g>
    <g fill="none" stroke="${COAST}" stroke-width="1.1" stroke-dasharray="7 2 1.5 2" opacity=".55">${FRONTIER.map((f) => `<path d="${poly(f)}"/>`).join('')}</g>
    <g fill="none" stroke="${RIVER}" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" opacity=".75">${rivers}</g>
    <g font-size="9" font-style="italic" fill="${RIVER}" ${halo}>${riverNames}</g>
    <g font-style="italic" ${halo}>${names}</g>
    ${marks}
    ${scale}${compass}
    <rect width="${W}" height="${H}" fill="url(#sw-vig)" pointer-events="none"/>
    <rect x="3" y="3" width="${W - 6}" height="${H - 6}" fill="none" stroke="${COAST}" stroke-width="2.6"/>
    <rect x="8" y="8" width="${W - 16}" height="${H - 16}" fill="none" stroke="${COAST}" stroke-width=".6"/>
    <text data-lbl="title" x="${W - 18}" y="${H - 18}" text-anchor="end" font-size="11" fill="${INK}" ${halo}>${esc(tx('GERMAN WAR INDUSTRY · 1943–45'))}</text>
  </svg>`;
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
      <div class="legend">${SECTORS.map((s) => `<span style="--c:${SECTOR_COLOR[s]}">${esc(tx(SECTOR_LABEL[s]))}</span>`).join('')}<span class="fr">${esc(tx('Frontier, 1937'))}</span></div></div>
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
  wrap.querySelector<HTMLButtonElement>('[data-sw-back]')?.focus({ preventScroll: true });
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

// Campaign map: the strategic layer that replaces the flat mission list (game/CampaignState.ts,
// game/SideRaids.ts). A procedurally drawn 1943-44 chart of England, the North Sea and Germany
// (inline SVG, the outlines of BriefingMap.ts) with the base, the story operations in date order,
// their routes and the side raids on offer; gauges for the strategic state, the latest
// intelligence report, the next operation and the raid cards; a timeline of the tour for
// replays; and the end-of-tour summary. Also the debrief's intelligence report panel and the
// campaign line on the briefing sheet (BriefingExtras.ts).
//
// Game hooks: showCampaignMap (Game.showCampaign), mountCampaignReport (end of showDebrief),
// isSideRaid (briefing Back button). Rendered into the #campaign layer UI.ts creates.
import { CAMPAIGN, type Mission } from '../game/Missions';
import { STATIONS } from '../world/B17Layout';
import { CHART, type ChartPlace } from './BriefingMap';
import { ENEMY_MIX } from '../game/Modes';
import {
  CampaignData, ESCORT_THRESHOLD, FORMATION_FULL_AT, FULL_SQUADRON, IntelReport, Outcome, baseOf, campaignDate, currentGap,
  currentIndex, enemyMult, escortAvailability, formationFactor, isCurrentOp, loadCampaign, meritMult, modifiersFor, offeredRaids,
  prepareCampaignMission, raidInGap, recordCampaignOutcome, startNewTour, totals,
} from '../game/CampaignState';
import { isRaidId, raidEnemyType, sideRaidById, type SideRaid } from '../game/SideRaids';
import { tx, isAr } from '../i18n';
import { loadNemesis, mostWanted, reportLines, aceName, bounty, MOST_WANTED_MULT } from '../game/Nemesis';
import { showNemesisScreen } from './NemesisScreen';
import { onBackKey } from './serviceCommon';

export { prepareCampaignMission, campaignMeritMult } from '../game/CampaignState';

// Side raids put up their own defenders (Modes.ts asks for missions no mode claims)
ENEMY_MIX.push((m) => (isRaidId(m.id) ? raidEnemyType(m) : null));

export const isSideRaid = (m: Mission) => isRaidId(m.id);

interface ProgressLike { unlocked: number; medals: Record<string, string[]>; best: Record<string, number> }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const f1 = (n: number) => n.toFixed(1);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const pad2 = (n: number) => String(n).padStart(2, '0');

// ---------------- styles ----------------

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById('cm-css')) return;
  const st = document.createElement('style');
  st.id = 'cm-css';
  st.textContent = `
#campaign { background: radial-gradient(ellipse at 50% 40%, rgba(20,22,14,0.55), rgba(6,7,4,0.92)); overflow-y: auto; }
#campaign .cm { width: min(1320px, 100%); margin: 0 auto; padding: 22px 24px 28px; }
.cm-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 14px; }
.cm-head h2 { font-size: 34px; margin: 2px 0 0; letter-spacing: 3px; text-transform: uppercase; }
.cm-date { font-family: 'Special Elite', monospace; color: var(--ink-dim); font-size: 14px; text-align: right; }
.cm-date b { display: block; color: var(--ink); font-family: 'Oswald', sans-serif; font-size: 22px; letter-spacing: 2px; font-weight: 500; }
.cm-grid { display: grid; grid-template-columns: minmax(0, 1.75fr) minmax(290px, 1fr); gap: 16px; align-items: start; }
.cm-chart { position: relative; padding: 10px; background: #2a2416; border: 1px solid rgba(0,0,0,0.6); box-shadow: 0 12px 40px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.05); }
.cm-chart svg { display: block; width: 100%; height: auto; }
.cm-chart .cm-op { cursor: pointer; }
.cm-chart .cm-op:hover .cm-ring, .cm-chart .cm-op:focus-visible .cm-ring { stroke-width: 3; }
.cm-chart .cm-op:focus-visible { outline: none; }
.cm-chart .cm-op:focus-visible .cm-ring { stroke: #1d3f8f; }
.cm-pulse { animation: cm-pulse 1.6s ease-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes cm-pulse { 0% { opacity: 0.85; transform: scale(0.7); } 100% { opacity: 0; transform: scale(2.1); } }
.cm-march { animation: cm-march 1.2s linear infinite; }
@keyframes cm-march { to { stroke-dashoffset: -20; } }
.cm-side { display: flex; flex-direction: column; gap: 12px; }
.cm-card { background: var(--panel); border: 1px solid var(--line); padding: 14px 16px; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.cm-card h3 { margin: 0 0 10px; font-size: 13px; letter-spacing: 3px; color: var(--khaki); font-weight: 500; font-family: 'Special Elite', monospace; text-transform: uppercase; }
.cm-gauge { margin: 0 0 11px; }
.cm-gauge:last-child { margin-bottom: 0; }
.cm-gauge .row1 { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 14px; letter-spacing: 1px; text-transform: uppercase; }
.cm-gauge .row1 b { font-family: 'IBM Plex Mono', monospace; font-weight: 500; font-size: 15px; letter-spacing: 0; }
.cm-bar { position: relative; height: 8px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.08); margin: 5px 0 3px; }
.cm-bar i { position: absolute; left: 0; top: 0; bottom: 0; transition: width 0.6s ease; }
.cm-bar u { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--ink); opacity: 0.6; }
.cm-gauge small { display: block; color: var(--ink-dim); font-size: 12px; font-family: 'IBM Plex Mono', monospace; }
.cm-intel p { margin: 0 0 7px; font-size: 13px; line-height: 1.45; color: var(--ink-dim); font-family: 'Special Elite', monospace; padding-left: 16px; position: relative; }
.cm-intel p::before { content: '›'; position: absolute; left: 2px; color: var(--khaki); }
.cm-intel p.up::before { content: '▲'; font-size: 9px; top: 3px; }
.cm-intel p.down::before { content: '▼'; font-size: 9px; top: 3px; }
.cm-intel .t { font-size: 15px; letter-spacing: 1px; margin-bottom: 8px; }
.cm-nem { margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--line); }
.cm-nem-t { font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: #e8b923; margin-bottom: 6px; }
.cm-intel .cm-nem p::before { content: '✠'; font-size: 10px; top: 2px; color: #e8b923; }
.cm-intel .cm-nem p.mw { color: #ff9c6e; }
.cm-nem .btn { padding: 6px 12px; font-size: 13px; margin-top: 4px; }
html[lang=ar] .cm-nem-t { letter-spacing: 0; }
.cm-intel .t.ok { color: var(--good); } .cm-intel .t.fail { color: var(--bad); }
.cm-ops { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 2fr); gap: 16px; margin-top: 16px; align-items: stretch; }
.cm-op-card { position: relative; text-align: left; background: rgba(255,255,255,0.03); border: 1px solid var(--line); color: var(--ink); padding: 14px 16px; font-family: inherit; display: flex; flex-direction: column; gap: 4px; transition: border-color 0.15s, background 0.15s; }
.cm-op-card.sel { border-color: var(--khaki); background: rgba(185,167,111,0.09); }
.cm-op-card .num { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--ink-dim); }
.cm-op-card .t { font-size: 21px; letter-spacing: 1px; line-height: 1.15; }
.cm-op-card .tg { font-family: 'Special Elite', monospace; font-size: 13px; color: var(--ink-dim); }
.cm-op-card .tag { position: absolute; right: 12px; top: 12px; font-size: 11px; letter-spacing: 2px; padding: 3px 8px; border: 1px solid var(--line); color: var(--khaki); text-transform: uppercase; }
.cm-op-card .fx { font-size: 12px; color: var(--good); font-family: 'IBM Plex Mono', monospace; margin-top: 2px; }
.cm-op-card .btn { align-self: flex-start; margin-top: 8px; padding: 9px 18px; font-size: 14px; }
.cm-op-card .btn:disabled { opacity: 0.4; cursor: not-allowed; }
.cm-op-card.done { opacity: 0.55; }
.cm-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.cm-chips span { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; padding: 2px 7px; border: 1px solid var(--line); color: var(--ink-dim); }
.cm-chips span.good { color: var(--good); border-color: rgba(159,194,107,0.4); }
.cm-chips span.bad { color: var(--bad); border-color: rgba(217,87,63,0.45); }
.cm-raids .cm-op-card .tag { position: static; align-self: flex-start; margin-bottom: 4px; }
.cm-raids { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; }
.cm-raids-wrap h3 span { color: var(--ink-dim); letter-spacing: 1px; text-transform: none; }
.cm-note { color: var(--ink-dim); font-family: 'Special Elite', monospace; font-size: 14px; line-height: 1.5; margin: 6px 0 0; }
.cm-tl { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 16px; }
.cm-tl button { flex: 1 1 92px; min-width: 92px; text-align: left; background: rgba(255,255,255,0.03); border: 1px solid var(--line); color: var(--ink); padding: 7px 9px; cursor: pointer; font-family: inherit; position: relative; }
.cm-tl button:hover:not(:disabled) { border-color: var(--khaki); }
.cm-tl button:disabled { opacity: 0.32; cursor: not-allowed; }
.cm-tl button.cur { border-color: var(--red); background: rgba(179,50,31,0.14); }
.cm-tl button.done::after { content: '✓'; position: absolute; right: 7px; top: 5px; color: var(--good); font-size: 12px; }
.cm-tl .n { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cm-tl .tt { font-size: 13px; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cm-tl .rd { display: block; font-size: 10px; letter-spacing: 1px; color: var(--khaki); text-transform: uppercase; margin-top: 2px; min-height: 12px; }
.cm-foot { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px; }
.cm-sum .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin: 16px 0; }
.cm-sum .stat { background: rgba(255,255,255,0.03); border: 1px solid var(--line); padding: 10px 12px; }
.cm-sum .stat .v { font-size: 26px; }
.cm-sum .verdict { font-family: 'Special Elite', monospace; color: var(--ink); font-size: 16px; line-height: 1.6; max-width: 820px; }
.cm-sum ol { margin: 8px 0 0; padding-left: 22px; columns: 2 300px; color: var(--ink-dim); font-size: 14px; line-height: 1.7; }
.cm-sum ol .ok { color: var(--good); } .cm-sum ol .fail { color: var(--bad); }
#debrief .cm-report { margin-top: 18px; border-top: 1px solid var(--line); padding-top: 14px; text-align: left; }
#debrief .cm-report .row { margin-top: 10px; }
#debrief .cm-report .btn { padding: 9px 18px; font-size: 14px; }
@media (max-width: 900px) {
  .cm-grid, .cm-ops { grid-template-columns: minmax(0, 1fr); }
  #campaign .cm { padding: 14px 12px 22px; }
  .cm-head h2 { font-size: 26px; }
}
/* phone held sideways: the next operation and side raids first, the chart and gauges below */
@media (max-height: 520px) {
  #campaign .cm { display: flex; flex-direction: column; }
  #campaign .cm-head { order: 0; } #campaign .cm-ops { order: 1; margin: 0 0 16px; } #campaign .cm-grid { order: 2; }
  #campaign .cm-tl { order: 3; } #campaign .cm-foot { order: 4; }
}
@media (prefers-reduced-motion: reduce) { .cm-pulse, .cm-march { animation: none; } }
/* Arabic: Arabic faces behind the typewriter / mono lettering, and the side panels, cards, bars and
   timeline read from the right (the chart itself is a map and keeps its geography) */
html[lang=ar] .cm-date, html[lang=ar] .cm-card h3, html[lang=ar] .cm-intel p, html[lang=ar] .cm-op-card .tg, html[lang=ar] .cm-note,
html[lang=ar] .cm-sum .verdict { font-family: 'Special Elite', 'Noto Naskh Arabic', monospace; }
html[lang=ar] .cm-gauge small, html[lang=ar] .cm-op-card .num, html[lang=ar] .cm-op-card .fx, html[lang=ar] .cm-tl .n { font-family: 'IBM Plex Mono', 'IBM Plex Sans Arabic', monospace; }
html[lang=ar] .cm-intel p, html[lang=ar] .cm-sum .verdict { line-height: 1.7; }
html[lang=ar] .cm-head h2, html[lang=ar] .cm-sum h2 { letter-spacing: 0; }
html[dir=rtl] .cm-date { text-align: left; }
html[dir=rtl] .cm-intel p { padding-left: 0; padding-right: 16px; }
html[dir=rtl] .cm-intel p::before { left: auto; right: 2px; content: '‹'; }
html[dir=rtl] .cm-intel p.up::before { content: '▲'; } html[dir=rtl] .cm-intel p.down::before { content: '▼'; }
html[dir=rtl] .cm-bar i { left: auto; right: 0; }
html[dir=rtl] .cm-op-card { text-align: right; }
html[dir=rtl] .cm-op-card .tag { right: auto; left: 12px; }
html[dir=rtl] .cm-raids .cm-op-card .tag { align-self: flex-start; }
html[dir=rtl] .cm-tl button { text-align: right; }
html[dir=rtl] .cm-tl button.done::after { right: auto; left: 7px; }
html[dir=rtl] .cm-sum ol { padding-left: 0; padding-right: 22px; }
html[dir=rtl] #debrief .cm-report { text-align: right; }
`;
  document.head.appendChild(st);
}

// ---------------- chart ----------------

type Geo = { lat: number; lon: number };
const W = 760, H = 500;
const LON0 = -3.4, LON1 = 15.2;
const LAT1 = 56.3;
const S = W / ((LON1 - LON0) * CHART.KX); // px per projected degree
const X = (lon: number) => (lon - LON0) * CHART.KX * S;
const Y = (lat: number) => (LAT1 - lat) * S;
const P = (g: Geo): [number, number] => [X(g.lon), Y(g.lat)];
const PAPER = '#e7dbb8', LAND = '#d6c28e', COAST = '#4d3b1e', INK = '#2b2518', ROUTE = '#8e2418', RAID = '#1d4f7a', GRID = '#7a6240';

const placeFor = (m: Mission): ChartPlace | undefined => CHART.PLACES.find((p) => m.target.includes(p.key));

function routeOf(p: ChartPlace): Geo[] {
  if (p.home) return [p.from ?? CHART.BERLIN, p, p.eng ?? CHART.NORFOLK, CHART.BASE];
  return [CHART.BASE, p.eng ?? CHART.NORFOLK, ...(p.ip ? [p.ip] : []), p];
}
const pathD = (pts: Geo[]) => 'M' + pts.map((g) => P(g).map(f1).join(' ')).join('L');

// chart lettering: the typewriter face, with an Arabic face for Arabic glyphs (the chart itself stays left-to-right)
const chartFont = () => `'Special Elite', Georgia, serif${isAr() ? ", 'Noto Naskh Arabic'" : ''}`;
const label = (x: number, y: number, text: string, anchor: 'start' | 'end' | 'middle', size = 11, fill = INK, extra = '') =>
  `<text x="${f1(x)}" y="${f1(y)}" text-anchor="${anchor}" font-size="${size}" font-family="${chartFont()}" fill="${fill}" stroke="${PAPER}" stroke-width="3" paint-order="stroke" stroke-linejoin="round" ${extra}>${text}</text>`;

interface ChartOp { key: string; m: Mission; kind: 'story' | 'raid'; state: 'done' | 'current' | 'locked' | 'offer' | 'flown'; letter?: string; success?: boolean }

function chartSvg(d: CampaignData, ops: ChartOp[]): string {
  const ring = (r: [number, number][]) => 'M' + r.map(([lon, lat]) => P({ lat, lon }).map(f1).join(' ')).join('L') + 'Z';
  const grid: string[] = [];
  for (let la = 49; la <= 56; la++) grid.push(`<line x1="0" x2="${W}" y1="${f1(Y(la))}" y2="${f1(Y(la))}"/><text x="6" y="${f1(Y(la) - 3)}">${tx('{n}°N', { n: la })}</text>`);
  for (let lo = -2; lo <= 14; lo += 2) grid.push(`<line x1="${f1(X(lo))}" x2="${f1(X(lo))}" y1="0" y2="${H}"/><text x="${f1(X(lo) + 3)}" y="${H - 6}">${tx(lo < 0 ? '{n}°W' : '{n}°E', { n: Math.abs(lo) })}</text>`);
  const countries = CHART.COUNTRIES.map(([name, g]) => { const [x, y] = P(g); return `<text x="${f1(x)}" y="${f1(y)}" text-anchor="middle" font-style="italic" font-size="13" letter-spacing="${isAr() ? 0 : 3}">${esc(tx(name))}</text>`; });

  // Luftwaffe fighter belt: a hatched zone over the Reich that grows and darkens with its strength
  const lw = d.luftwaffe / 100;
  const [zx, zy] = P({ lat: 52.0, lon: 9.2 });
  const zone = `<ellipse cx="${f1(zx)}" cy="${f1(zy)}" rx="${f1(170 * (0.55 + 0.45 * lw))}" ry="${f1(120 * (0.55 + 0.45 * lw))}" fill="url(#cm-lw)" opacity="${(0.25 + 0.45 * Math.min(1.5, lw) / 1.5).toFixed(2)}" stroke="${ROUTE}" stroke-width="1" stroke-dasharray="2 4"/>` +
    label(zx + 60, zy + 120 * (0.55 + 0.45 * lw) - 8, tx('LUFTWAFFE DAY FIGHTERS · {n}%', { n: Math.round(d.luftwaffe) }), 'middle', 10, ROUTE);

  // Escort radius: how far the little friends can see the bombers in
  const escA = escortAvailability(d);
  const [bx, by] = P(CHART.BASE);
  const er = (2.2 + 9.5 * escA / 100) * S * CHART.KX;
  const escortRing = `<circle cx="${f1(bx)}" cy="${f1(by)}" r="${f1(er)}" fill="none" stroke="${RAID}" stroke-width="1.4" stroke-dasharray="8 5" opacity="0.7"/>` +
    label(bx + er * 0.71 + 4, by - er * 0.71 - 4, tx('ESCORT RADIUS · {n}%', { n: escA }), 'start', 10, RAID);

  // Routes: flown operations faint, the current operation marching, offered raids dashed blue
  const routes: string[] = [];
  for (const o of ops) {
    const p = placeFor(o.m);
    if (!p) continue;
    const pts = routeOf(p);
    if (o.kind === 'story' && o.state === 'done') routes.push(`<path d="${pathD(pts)}" fill="none" stroke="${ROUTE}" stroke-width="1.1" opacity="0.32"/>`);
    else if (o.kind === 'raid' && o.state === 'flown') routes.push(`<path d="${pathD(pts)}" fill="none" stroke="${RAID}" stroke-width="1" stroke-dasharray="2 3" opacity="0.4"/>`);
    else if (o.state === 'current') routes.push(`<path d="${pathD(pts)}" fill="none" stroke="${ROUTE}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="10 10" class="cm-march"/>`);
    else if (o.state === 'offer') routes.push(`<path data-route="${o.key}" d="${pathD(pts)}" fill="none" stroke="${RAID}" stroke-width="1.7" stroke-dasharray="5 4" stroke-linejoin="round" opacity="0.8"/>`);
  }

  // Markers. Several operations can share a city: fan them out around it.
  const seen = new Map<string, number>();
  const marks: string[] = [];
  const order = [...ops].sort((a, b) => (a.state === 'locked' ? -1 : 0) - (b.state === 'locked' ? -1 : 0));
  for (const o of order) {
    const p = placeFor(o.m);
    if (!p) continue;
    const n = seen.get(p.key) ?? 0;
    seen.set(p.key, n + 1);
    let [x, y] = P(p);
    if (n) { const a = -Math.PI / 4 + n * 1.9; x += Math.cos(a) * 17; y += Math.sin(a) * 17; }
    const tip = `<title>${esc(o.kind === 'story' ? tx('Mission {n}: {title}', { n: o.m.number, title: tx(o.m.title) }) : tx(o.m.title))} — ${esc(tx(o.m.target))} (${esc(tx(o.m.date))})</title>`;
    const clickable = o.state === 'done' || o.state === 'current' || o.state === 'offer';
    const attrs = clickable ? `class="cm-op" data-op="${o.key}" tabindex="0" role="button" aria-label="${esc(tx(o.m.title))}"` : '';
    // invisible finger-sized hit area (the markers themselves are ~20 px on a phone)
    const hit = clickable ? `<circle cx="${f1(x)}" cy="${f1(y)}" r="17" fill="transparent"/>` : '';
    if (o.kind === 'story') {
      const fill = o.state === 'done' ? INK : o.state === 'current' ? ROUTE : PAPER;
      const txt = o.state === 'locked' ? GRID : PAPER;
      marks.push(`<g ${attrs} opacity="${o.state === 'locked' ? 0.6 : 1}">${tip}${hit}
        ${o.state === 'current' ? `<circle cx="${f1(x)}" cy="${f1(y)}" r="11" fill="none" stroke="${ROUTE}" stroke-width="2" class="cm-pulse"/>` : ''}
        <circle class="cm-ring" cx="${f1(x)}" cy="${f1(y)}" r="10" fill="${fill}" stroke="${o.state === 'locked' ? GRID : INK}" stroke-width="1.4"/>
        <text x="${f1(x)}" y="${f1(y + 3.8)}" text-anchor="middle" font-size="10.5" font-weight="700" font-family="'IBM Plex Mono', monospace" fill="${txt}">${o.m.number}</text></g>`);
      if (o.state === 'current') marks.push(label(x + 14, y - 12, esc(tx('{place} · NEXT', { place: tx(p.key.toUpperCase()) })), 'start', 12, ROUTE));
    } else {
      const fill = o.state === 'flown' ? (o.success ? RAID : '#777') : PAPER;
      marks.push(`<g ${attrs}>${tip}${hit}
        <rect class="cm-ring" x="${f1(x - 8)}" y="${f1(y - 8)}" width="16" height="16" transform="rotate(45 ${f1(x)} ${f1(y)})" fill="${fill}" stroke="${RAID}" stroke-width="1.6"/>
        <text x="${f1(x)}" y="${f1(y + 4)}" text-anchor="middle" font-size="10.5" font-weight="700" font-family="'IBM Plex Mono', monospace" fill="${o.state === 'flown' ? PAPER : RAID}">${o.letter ?? '•'}</text></g>`);
      if (o.state === 'offer') marks.push(label(x + 13, y + 16, esc(tx(p.key)), 'start', 10.5, RAID));
    }
  }

  const base = `<rect x="${f1(bx - 5)}" y="${f1(by - 5)}" width="10" height="10" fill="${ROUTE}" stroke="${INK}" stroke-width="1"/>` +
    label(bx - 9, by + 17, esc(tx('DEENETHORPE · 401ST BG')), 'middle', 10.5);
  const legend = `<g transform="translate(14 ${H - 92})" font-family="${chartFont()}" font-size="10" fill="${INK}">
    <rect width="186" height="74" fill="${PAPER}" fill-opacity=".85" stroke="${COAST}" stroke-width=".7"/>
    <circle cx="14" cy="14" r="6" fill="${ROUTE}" stroke="${INK}"/><text x="26" y="17">${esc(tx('Next story operation'))}</text>
    <circle cx="14" cy="30" r="6" fill="${INK}"/><text x="26" y="33">${esc(tx('Flown · ○ to come'))}</text>
    <rect x="9" y="41" width="10" height="10" transform="rotate(45 14 46)" fill="${PAPER}" stroke="${RAID}" stroke-width="1.4"/><text x="26" y="49">${esc(tx('Side raid on offer'))}</text>
    <line x1="6" x2="22" y1="62" y2="62" stroke="${RAID}" stroke-dasharray="5 3" stroke-width="1.4"/><text x="26" y="65">${esc(tx('Escort radius / raid route'))}</text></g>`;

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(tx('Campaign map: England, the North Sea and Germany'))}" font-family="Georgia, serif${isAr() ? ", 'Noto Naskh Arabic'" : ''}"${isAr() ? ' direction="ltr"' : ''}>
    <defs>
      <pattern id="cm-sea" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 4H8" stroke="#4f6f7c" stroke-width=".5" opacity=".35"/></pattern>
      <pattern id="cm-lw" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V7" stroke="${ROUTE}" stroke-width="1.6" opacity=".5"/></pattern>
      <radialGradient id="cm-vig" cx="50%" cy="50%" r="75%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#3a2a10" stop-opacity=".35"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="${PAPER}"/>
    <rect width="${W}" height="${H}" fill="url(#cm-sea)"/>
    <g fill="${LAND}" stroke="${COAST}" stroke-width="1.1" stroke-linejoin="round">
      <path d="${ring(CHART.MAINLAND)}"/><path d="${ring(CHART.ENGLAND)}"/>
      ${CHART.ISLANDS.map(([lon, lat]) => { const [x, y] = P({ lat, lon }); return `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="3" ry="1.6" stroke-width=".6"/>`; }).join('')}
    </g>
    <g stroke="${GRID}" stroke-width=".5" stroke-dasharray="2 3" opacity=".6" font-size="9" fill="${GRID}">${grid.join('')}</g>
    <g font-style="italic" fill="${COAST}" stroke="${PAPER}" stroke-width="2.5" paint-order="stroke" stroke-linejoin="round" opacity=".85">${countries.join('')}</g>
    ${zone}
    ${escortRing}
    ${routes.join('')}
    ${base}
    ${marks.join('')}
    ${legend}
    <rect width="${W}" height="${H}" fill="url(#cm-vig)" pointer-events="none"/>
    <rect x="3" y="3" width="${W - 6}" height="${H - 6}" fill="none" stroke="${COAST}" stroke-width="2.6"/>
    <rect x="8" y="8" width="${W - 16}" height="${H - 16}" fill="none" stroke="${COAST}" stroke-width=".6"/>
    ${label(W - 18, H - 20, esc(tx('NORTH SEA & NORTHWEST EUROPE · 1943–44')), 'end', 12)}
  </svg>`;
}

// ---------------- sidebar ----------------

function gaugesHtml(d: CampaignData): string {
  const esc_ = escortAvailability(d);
  const lwPct = Math.round(d.luftwaffe);
  const g = (name: string, value: string, frac: number, color: string, note: string, tick?: number) => `<div class="cm-gauge">
    <div class="row1"><span>${tx(name)}</span><b>${value}</b></div>
    <div class="cm-bar"><i style="width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%;background:${color}"></i>${tick !== undefined ? `<u style="${isAr() ? 'right' : 'left'}:${Math.round(tick * 100)}%"></u>` : ''}</div>
    <small>${esc(note)}</small></div>`;
  const em = enemyMult(d.luftwaffe), ff = formationFactor(d.squadron);
  return `<div class="cm-card"><h3>${tx('Strategic situation')}</h3>
    ${g('Luftwaffe strength', `${lwPct}%`, (d.luftwaffe - 50) / 100, 'var(--bad)', tx('Enemy fighters x{a} · skill x{b}', { a: em.toFixed(2), b: (1 + (em - 1) * 0.5).toFixed(2) }), 0.5)}
    ${g('Squadron strength', `${d.squadron}/${FULL_SQUADRON}`, d.squadron / FULL_SQUADRON, 'var(--khaki)', ff >= 1 ? tx('Full-size formations') : tx('Formations at {n}% — replacements arriving', { n: Math.round(ff * 100) }), FORMATION_FULL_AT / FULL_SQUADRON)}
    ${g('Crew morale', `${Math.round(d.morale)}%`, d.morale / 100, 'var(--good)', tx('Merit x{n}', { n: meritMult(d.morale).toFixed(2) }))}
    ${g('Escort availability', `${esc_}%`, esc_ / 100, '#7fa7c9', esc_ >= ESCORT_THRESHOLD ? tx('P-51s join the gunner missions') : tx('P-51s join gunner missions at {n}%', { n: ESCORT_THRESHOLD }), ESCORT_THRESHOLD / 100)}
  </div>`;
}

// The named Experten in the intelligence report: what they did on the last campaign operation,
// the most wanted man and his bounty, and the way into their dossiers (ui/NemesisScreen.ts)
function experteIntel(): string {
  let st;
  try { st = loadNemesis(); } catch { return ''; }
  const w = mostWanted(st);
  const lines = st.last?.campaign ? st.last.items.flatMap(reportLines) : [];
  return `<div class="cm-nem"><div class="cm-nem-t">${tx('Luftwaffe Experten')}</div>
    ${lines.map((l) => `<p>${esc(l)}</p>`).join('')}
    ${w ? `<p class="mw">${esc(tx('Most wanted: {name} · {n} victories · bounty {b} merit', { name: aceName(w), n: w.victories, b: (bounty(w) * MOST_WANTED_MULT).toLocaleString('en-US') }))}</p>` : ''}
    <button class="btn ghost" data-nem>${tx('Experten dossiers')}</button></div>`;
}

function intelHtml(r: IntelReport | null): string {
  if (!r) return `<div class="cm-card cm-intel"><h3>${tx('Intelligence report')}</h3><p>${tx('No operations flown yet. Group expects heavy fighter opposition over the German coast.')}</p>${experteIntel()}</div>`;
  const cls = (l: IntelReport['lines'][number]) => {
    if (l.from === undefined || l.to === undefined || l.from === l.to) return '';
    const good = l.gauge === 'luftwaffe' ? l.to < l.from : l.to > l.from;
    return l.to > l.from ? `up" style="color:${good ? 'var(--good)' : 'var(--bad)'}` : `down" style="color:${good ? 'var(--good)' : 'var(--bad)'}`;
  };
  return `<div class="cm-card cm-intel"><h3>${tx('Intelligence report')}</h3>
    <div class="t ${r.success ? 'ok' : 'fail'}">${esc(tx(r.title))}</div>
    ${r.lines.map((l) => `<p class="${cls(l)}"><span style="color:var(--ink-dim)">${esc(tx(l.text))}</span></p>`).join('')}${experteIntel()}</div>`;
}

function roleLabel(m: Mission) {
  return m.role === 'gunner' ? `B-17 · ${tx(STATIONS[m.station ?? 'waistL'].label)}` : tx('P-51D escort');
}
function moodLabel(m: Mission) {
  const w = m.weather;
  if (!w) return tx('Fair');
  return tx(w.mood === 'dusk' ? 'Dusk' : w.mood === 'overcast' ? 'Overcast' : w.mood === 'storm' ? 'Storm front' : w.sunEl < 16 ? 'Low sun' : 'Clear');
}

function modChips(d: CampaignData, m: Mission): string {
  const b = baseOf(m);
  const mods = modifiersFor(d, m, { ...b, role: m.role, playerDamaged: m.playerDamaged, duration: m.duration });
  if (!mods) return '';
  const chips: string[] = [];
  chips.push(`<span class="${mods.bombers < b.bombers ? 'bad' : ''}">${tx('Formation {n} ships', { n: `${mods.bombers}${mods.bombers < b.bombers ? `/${b.bombers}` : ''}` })}</span>`);
  chips.push(`<span class="${mods.enemy > 1.005 ? 'bad' : mods.enemy < 0.995 ? 'good' : ''}">${tx('Fighters x{n}', { n: mods.enemy.toFixed(2) })}</span>`);
  if (mods.escortArrive !== undefined) chips.push(`<span class="good">${tx('P-51s at {t}', { t: mmss(mods.escortArrive) })}</span>`);
  chips.push(`<span>${tx('Merit x{n}', { n: mods.meritMult.toFixed(2) })}</span>`);
  chips.push(`<span>${moodLabel(m)}</span>`);
  return `<div class="cm-chips">${chips.join('')}</div>`;
}

// ---------------- screens ----------------

let selected: string | null = null;

function showLayer() {
  document.querySelectorAll('.layer').forEach((l) => l.classList.toggle('show', l.id === 'campaign'));
}

/** Game.showCampaign: the campaign map (or the tour summary when it was just completed). */
export function showCampaignMap(progress: ProgressLike, onPick: (m: Mission) => void, onBack: () => void) {
  ensureStyle();
  const root = document.getElementById('campaign');
  if (!root) return;
  const d = loadCampaign(progress);
  const cur = currentIndex(d), gap = currentGap(d);
  const raids = offeredRaids(d);
  const flown = gap > 0 ? raidInGap(d, gap) : null;

  // the chart's operations: every story mission and this gap's raids, plus raids flown earlier
  const ops: ChartOp[] = CAMPAIGN.map((m, i) => ({
    key: m.id, m, kind: 'story' as const,
    state: d.complete || i < cur ? 'done' as const : i === cur ? 'current' as const : 'locked' as const,
  }));
  raids.forEach((r, k) => ops.push({ key: r.mission.id, m: r.mission, kind: 'raid', state: flown ? (flown.id === r.mission.id ? 'flown' : 'locked') : 'offer', letter: 'ABC'[k], success: flown?.success }));
  for (const r of d.raids) {
    if (r.gap === gap) continue;
    const s = sideRaidById(d.seed, r.id);
    if (s) ops.push({ key: r.id, m: s.mission, kind: 'raid', state: 'flown', letter: '', success: r.success });
  }
  const pickable = new Map<string, Mission>();
  for (const o of ops) if (o.state === 'done' || o.state === 'current' || o.state === 'offer') pickable.set(o.key, o.m);

  const next = d.complete ? null : CAMPAIGN[cur];
  // a replay picked last time (an operation already flown) gives way to the next operation,
  // so after a debrief the "Next operation" card is the highlighted one
  const flownStory = !!selected && selected !== next?.id && CAMPAIGN.some((m) => m.id === selected);
  if (!selected || !pickable.has(selected) || flownStory) selected = next?.id ?? null;

  const nextCard = next ? `<div class="cm-op-card ${selected === next.id ? 'sel' : ''}" data-card="${next.id}">
      <span class="tag">${roleLabel(next)}</span>
      <div class="num">${tx('MISSION {n} OF {total}', { n: pad2(next.number), total: CAMPAIGN.length })} · ${esc(tx(next.date))}</div>
      <div class="t">${esc(tx(next.title))}</div>
      <div class="tg">${esc(tx(next.target))}</div>
      ${modChips(d, next)}
      <button class="btn" data-go="${next.id}">${tx('Brief the crew')}</button>
    </div>` : `<div class="cm-op-card sel">
      <span class="tag">${tx('Tour complete')}</span>
      <div class="num">${esc(tx(CAMPAIGN[CAMPAIGN.length - 1].date))}</div>
      <div class="t">${tx('Twenty-five missions')}</div>
      <div class="tg">${esc(tx("The Sky Queen's crew is going home."))}</div>
      <div class="row" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-summary>${tx('Campaign summary')}</button><button class="btn ghost" data-newtour style="margin-top:8px">${tx('Begin a new tour')}</button></div>
    </div>`;

  const raidCard = (r: SideRaid, k: number) => {
    const m = r.mission, t = r.template;
    const isFlown = flown?.id === m.id, closed = !!flown && !isFlown;
    const status = isFlown ? `<div class="fx" style="color:${flown!.success ? 'var(--good)' : 'var(--bad)'}">${tx(flown!.success ? 'Raid flown — target destroyed' : 'Raid flown — target missed')}</div>` : closed ? `<div class="fx" style="color:var(--ink-dim)">${tx('The window has passed')}</div>` : `<div class="fx">${esc(tx('{fx} · +{n} merit', { fx: tx(t.verb), n: t.reward }))}</div>`;
    return `<div class="cm-op-card ${selected === m.id ? 'sel' : ''} ${flown ? 'done' : ''}" data-card="${m.id}">
      <span class="tag" style="color:#7fa7c9">${'ABC'[k]} · ${esc(tx(t.label))}</span>
      <div class="num">${esc(tx(m.date))} · ${roleLabel(m)}</div>
      <div class="t" style="font-size:18px">${esc(tx(m.target.replace(/^Escort — /, '')))}</div>
      ${status}
      ${flown ? '' : modChips(d, m)}
      ${flown ? '' : `<button class="btn ghost" data-go="${m.id}">${tx('Fly this raid')}</button>`}
    </div>`;
  };
  const raidsBlock = d.complete ? `<p class="cm-note">${tx('The tour is over. Side raids are closed.')}</p>`
    : gap <= 0 ? `<p class="cm-note">${tx('Side raids open after your first mission. Fly Mission 1 to begin the tour.')}</p>`
    : `<div class="cm-raids">${raids.map(raidCard).join('')}</div>
       <p class="cm-note">${flown ? tx('One raid per lull between operations.') : tx('Optional: fly one raid before Mission {n}, or go straight on. What you hit changes the odds on the next big one.', { n: next?.number ?? '' })}</p>`;

  const raidMark = new Map<number, string>();
  for (const r of d.raids) { const s = sideRaidById(d.seed, r.id); if (s) raidMark.set(r.gap, `${r.success ? '◆' : '◇'} ${tx(s.template.label)}`); }
  const timeline = CAMPAIGN.map((m, i) => {
    const st = d.complete || i < cur ? 'done' : i === cur ? 'cur' : '';
    const can = st !== '';
    const med = (progress.medals[m.id] ?? []).length;
    return `<button class="${st}" ${can ? `data-go="${m.id}"` : 'disabled'} title="${esc(`${tx(m.title)} — ${tx(m.target)}`)}">
      <div class="n">${pad2(m.number)} · ${esc(tx(m.date).replace(/ 19(4\d)$/, " '$1"))}</div><div class="tt">${esc(tx(m.title))}</div>
      <span class="rd">${raidMark.get(i + 1) ? esc(raidMark.get(i + 1)!) : med ? (med > 1 ? tx('{n} medals', { n: med }) : tx('1 medal')) : ''}</span></button>`;
  }).join('');

  root.innerHTML = `<div class="cm">
    <div class="cm-head">
      <div><div class="kicker">${tx('401ST BOMB SQUADRON · OPERATIONS ROOM')}${d.tour > 1 ? tx(' · TOUR {n}', { n: d.tour }) : ''}</div><h2>${tx('Campaign')}</h2></div>
      <div class="cm-date">${tx('Campaign date')}<b>${esc(tx(campaignDate(d)))}</b>${tx('{done}/{total} operations', { done: d.storyDone.length, total: CAMPAIGN.length })} · ${(d.raids.length === 1 ? tx('1 side raid') : tx('{n} side raids', { n: d.raids.length }))}</div>
    </div>
    <div class="cm-grid">
      <div class="cm-chart">${chartSvg(d, ops)}</div>
      <div class="cm-side">${gaugesHtml(d)}${intelHtml(d.report)}</div>
    </div>
    <div class="cm-ops">
      <div class="cm-card"><h3>${tx(next ? 'Next operation' : 'Tour of duty')}</h3>${nextCard}</div>
      <div class="cm-card cm-raids-wrap"><h3>${tx('Side raids')}${gap > 0 && next && !d.complete ? ` <span>${tx('· before Mission {n}', { n: next.number })}</span>` : ''}</h3>${raidsBlock}</div>
    </div>
    <div class="cm-tl" aria-label="${tx('Tour timeline')}">${timeline}</div>
    <div class="cm-foot"><button class="btn ghost" data-back>${tx('Back')}</button>${d.complete ? `<button class="btn ghost" data-summary>${tx('Campaign summary')}</button>` : ''}</div>
  </div>`;

  const go = (id: string) => {
    const m = pickable.get(id) ?? CAMPAIGN.find((c) => c.id === id);
    if (!m) return;
    prepareCampaignMission(m, progress);
    onPick(m);
  };
  root.querySelectorAll<HTMLElement>('[data-go]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); go(b.dataset.go!); }));
  // map markers: first click selects (highlights the card), a second click opens the briefing
  root.querySelectorAll<SVGGElement>('.cm-op').forEach((g) => {
    const act = () => {
      const id = g.dataset.op!;
      if (selected === id) { go(id); return; }
      selected = id;
      root.querySelectorAll<HTMLElement>('[data-card]').forEach((c) => c.classList.toggle('sel', c.dataset.card === id));
      root.querySelector<HTMLElement>(`[data-card="${id}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      if (!root.querySelector(`[data-card="${id}"]`)) go(id); // replays have no card: open straight away
    };
    g.addEventListener('click', act);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
  });
  root.querySelectorAll<HTMLElement>('[data-card]').forEach((c) => c.addEventListener('mouseenter', () => {
    root.querySelectorAll<SVGPathElement>('[data-route]').forEach((p) => p.setAttribute('opacity', p.dataset.route === c.dataset.card ? '1' : '0.45'));
  }));
  root.querySelector('[data-back]')!.addEventListener('click', onBack);
  onBackKey(root, onBack);   // Esc / Backspace (and the gamepad's B) go back, like the other menu screens
  root.querySelector('[data-nem]')?.addEventListener('click', () => showNemesisScreen({ back: () => showCampaignMap(progress, onPick, onBack) }));
  root.querySelectorAll('[data-summary]').forEach((b) => b.addEventListener('click', () => showCampaignSummary(progress, onPick, onBack)));
  root.querySelector<HTMLButtonElement>('[data-newtour]')?.addEventListener('click', (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    // two clicks: the first one explains what starts over
    if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = tx('Confirm: new tour (medals and Armory kept)'); return; }
    startNewTour(d);
    selected = null;
    showCampaignMap(progress, onPick, onBack);
  });
  showLayer();
}

function verdict(d: CampaignData): string {
  const t = totals(d);
  const lw = d.luftwaffe;
  const air = lw <= 65 ? 'The German day-fighter arm is a shadow of the force that met you over Emden. You helped break it.'
    : lw <= 85 ? 'The Luftwaffe is still flying, but it is bleeding pilots it cannot replace. The air war has turned.'
    : 'The Luftwaffe is battered but unbroken. The crews who follow you will still have a fight on their hands.';
  const raids = t.raidWins >= 6 ? tx('Your {n} successful side raids kept the pressure on between the big operations.', { n: t.raidWins })
    : t.raidWins > 0 ? (t.raidWins > 1 ? tx('{n} side raids hit home between the big operations.', { n: t.raidWins }) : tx('1 side raid hit home between the big operations.'))
    : tx('You flew the story operations alone, without side raids.');
  const crew = d.morale >= 75 ? 'The crews finish the tour in fine spirits.' : d.morale >= 45 ? 'The crews are tired, but proud.' : 'The crews are worn to the bone. Too many empty bunks.';
  return `${tx(air)} ${raids} ${tx(crew)}`;
}

export function showCampaignSummary(progress: ProgressLike, onPick: (m: Mission) => void, onBack: () => void) {
  ensureStyle();
  const root = document.getElementById('campaign');
  if (!root) return;
  const d = loadCampaign(progress);
  const t = totals(d);
  const medals = CAMPAIGN.reduce((a, m) => a + (progress.medals[m.id]?.length ?? 0), 0);
  const stat = (k: string, v: string | number) => `<div class="stat"><div class="hud-label">${esc(tx(k))}</div><div class="v">${v}</div></div>`;
  root.innerHTML = `<div class="cm cm-sum"><div class="cm-card" style="padding:24px 26px">
    <div class="kicker">${tx('401ST BOMB SQUADRON · TOUR OF DUTY')}${d.tour > 1 ? ` ${d.tour}` : ''} · ${esc(tx(CAMPAIGN[0].date))} – ${esc(tx(CAMPAIGN[CAMPAIGN.length - 1].date))}</div>
    <h2 style="font-size:34px;margin:4px 0 10px;letter-spacing:3px;text-transform:uppercase">${tx(d.complete ? 'Tour complete' : 'Tour in progress')}</h2>
    <p class="verdict">${esc(verdict(d))}</p>
    <div class="stats">
      ${stat('Story operations', `${d.storyDone.length}/${CAMPAIGN.length}`)}
      ${stat('Side raids', `${t.raidWins}/${t.raids}`)}
      ${stat('Sorties flown', t.sorties)}
      ${stat('Confirmed kills', t.kills)}
      ${stat('Fortresses lost', t.lost)}
      ${stat('Medals on record', medals)}
      ${stat('Luftwaffe strength', `${Math.round(d.luftwaffe)}%`)}
      ${stat('Squadron', `${d.squadron}/${FULL_SQUADRON}`)}
      ${stat('Crew morale', `${Math.round(d.morale)}%`)}
      ${stat('Escort', `${escortAvailability(d)}%`)}
    </div>
    <div class="hud-label">${tx('Operations log')}</div>
    <ol>${d.history.map((h) => `<li><span class="${h.success ? 'ok' : 'fail'}">${h.success ? '✓' : '✗'}</span> ${h.kind === 'raid' ? '◆ ' : ''}${esc(tx(h.title))} · ${tx(`${h.kills} kills`)}${h.lost ? ` · ${tx(`${h.lost} lost`)}` : ''}</li>`).join('') || `<li>${tx('No sorties recorded.')}</li>`}</ol>
    <div class="cm-foot"><button class="btn" data-map>${tx('Campaign map')}</button><button class="btn ghost" data-back>${tx('Main menu')}</button></div>
  </div></div>`;
  root.querySelector('[data-map]')!.addEventListener('click', () => showCampaignMap(progress, onPick, onBack));
  root.querySelector('[data-back]')!.addEventListener('click', onBack);
  showLayer();
}

// ---------------- debrief ----------------

export interface Merit { earn(n: number): void }

/**
 * End of Game.showDebrief: record the result in the campaign, pay a raid's merit bonus and show
 * the intelligence report on the debrief, with a way back to the map. No-op for other missions.
 */
export function mountCampaignReport(m: Mission, o: Outcome, prog: Merit, progress: ProgressLike, toMap: () => void) {
  const res = recordCampaignOutcome(m, o, progress);
  if (!res) return;
  if (res.reward) prog.earn(res.reward);
  ensureStyle();
  const host = document.querySelector<HTMLElement>('#debrief .box');
  if (!host) return;
  // side raids have no online board (firestore.rules only knows the story missions)
  if (res.op.kind === 'raid') host.querySelector('.lb-panel')?.remove();
  const r = res.report;
  const box = document.createElement('div');
  box.className = 'cm-report cm-intel';
  box.innerHTML = `<div class="hud-label">${tx('Intelligence report')}</div>
    ${r.lines.map((l) => {
      const ch = l.from !== undefined && l.to !== undefined && l.from !== l.to;
      const good = ch && (l.gauge === 'luftwaffe' ? l.to! < l.from! : l.to! > l.from!);
      return `<p class="${ch ? (l.to! > l.from! ? 'up' : 'down') : ''}" ${ch ? `style="color:${good ? 'var(--good)' : 'var(--bad)'}"` : ''}><span style="color:var(--ink-dim)">${esc(tx(l.text))}</span></p>`;
    }).join('')}
    <div class="row"><button class="btn ${res.data.complete && res.report.effect ? 'ghost' : ''}" data-cm-map>${tx('Campaign map')}</button>${res.data.complete ? `<button class="btn" data-cm-sum>${tx('Campaign summary')}</button>` : ''}</div>`;
  const row = host.querySelector('.row');
  if (row) row.after(box); else host.appendChild(box);
  box.querySelector('[data-cm-map]')!.addEventListener('click', toMap);
  // the map (built by Game with its own callbacks) carries the summary button once the tour is complete
  box.querySelector('[data-cm-sum]')?.addEventListener('click', () => { toMap(); document.querySelector<HTMLElement>('#campaign [data-summary]')?.click(); });
}

// ---------------- briefing sheet ----------------

/** BriefingExtras.decorateBriefing: the campaign's line on the sheet (side raid kicker, modifiers). */
export function decorateCampaignBriefing(sheet: HTMLElement, m: Mission) {
  const raid = isRaidId(m.id);
  if (!raid && !CAMPAIGN.includes(m)) return;
  let d: CampaignData;
  try { d = loadCampaign(null, { noReconcile: true }); } catch { return; }
  const s = raid ? sideRaidById(d.seed, m.id) : null;
  if (raid) {
    const k = sheet.querySelector<HTMLElement>('.kicker');
    if (k) k.textContent = `${tx('SIDE RAID · OPTIONAL OPERATION')}${s ? ` · ${tx(s.template.label).toUpperCase()}` : ''}`;
  }
  if (!isCurrentOp(d, m)) return;
  const mods = modifiersFor(d, m, { ...baseOf(m), role: m.role, playerDamaged: m.playerDamaged, duration: m.duration });
  if (!mods) return;
  const meta = document.createElement('div');
  meta.className = 'bx-meta';
  const items = [
    tx('Campaign: Luftwaffe {n}%', { n: Math.round(d.luftwaffe) }),
    tx('Formation {n} ships', { n: mods.bombers }),
    tx('Morale {n}% · merit x{m}', { n: Math.round(d.morale), m: mods.meritMult.toFixed(2) }),
  ];
  if (s) { const verb = tx(s.template.verb); items.push(tx('On success: {fx} · +{n} merit', { fx: verb.split(': ')[1] ?? verb, n: s.template.reward })); }
  meta.innerHTML = items.map((t, i) => `<span${i === 0 ? ' class="hot"' : ''}>${esc(t)}</span>`).join('');
  (sheet.querySelector('.bx-meta') ?? sheet.querySelector('.target'))?.after(meta);
}

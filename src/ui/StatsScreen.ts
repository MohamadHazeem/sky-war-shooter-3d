// Personal stats page (Phase 11 · 37): the logbook's numbers and three charts on the Career's
// paper — accuracy over time, kills by enemy type and the survival rate. Opened from the Career
// screen. Data: game/StatsLog.ts (one entry per sortie) and the Career's lifetime kills by type.
import { ENEMY_KINDS, type CareerData } from '../game/Career';
import { type Point, type SortieEntry, accuracyCeiling, accuracySeries, percentTicks, killsByType, loadLog, summarize, survivalSeries } from '../game/StatsLog';
import { ENEMY_VARIANTS, type EnemyType } from '../world/EnemyTypes';
import { esc, onBackKey, showLayer } from './serviceCommon';
import { isAr, num, tx } from '../i18n';
import './career.css';
import './shareCard.css';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const CH = 210, PADL = 40, PADR = 12, PADT = 12, PADB = 26;

/** Line chart over sorties: y in 0..yMax, optional dots for each sortie. Mirrors in Arabic (newest on the left). */
export function lineChartSvg(lines: { pts: Point[]; cls: string; dots?: boolean; name: string }[], yMax: number, label: string, CW = 600): string {
  const n = Math.max(2, ...lines.map((l) => l.pts.length));
  const rtl = isAr();
  const px = (i: number) => { const t = n > 1 ? i / (n - 1) : 0; return PADL + (rtl ? 1 - t : t) * (CW - PADL - PADR); };
  const py = (v: number) => PADT + (1 - Math.min(1, v / yMax)) * (CH - PADT - PADB);
  const ticks = yMax === 1 ? [0, 0.25, 0.5, 0.75, 1] : percentTicks(yMax);
  let s = `<svg viewBox="0 0 ${CW} ${CH}" role="img" aria-label="${esc(label)}">`;
  for (const t of ticks) s += `<line class="${t === 0 ? 'st-base' : 'st-grid'}" x1="${PADL}" x2="${CW - PADR}" y1="${py(t)}" y2="${py(t)}"/><text x="${PADL - 6}" y="${py(t) + 4}" text-anchor="end">${pct(t)}</text>`;
  s += `<text x="${rtl ? CW - PADR : PADL}" y="${CH - 6}" text-anchor="${rtl ? 'end' : 'start'}">${esc(tx('older'))}</text><text x="${rtl ? PADL : CW - PADR}" y="${CH - 6}" text-anchor="${rtl ? 'start' : 'end'}">${esc(tx('latest'))}</text>`;
  for (const l of lines) {
    if (!l.dots && l.pts.length > 1) s += `<polyline class="st-line ${l.cls}" points="${l.pts.map((p) => `${px(p.i).toFixed(1)},${py(p.v).toFixed(1)}`).join(' ')}"/>`;
  }
  for (const l of lines) {
    const visible = l.dots || l.pts.length === 1;   // a line's points get hover targets only
    for (const p of l.pts) {
      s += `<g tabindex="0"><title>${esc(tx(p.label))} · ${esc(tx(l.name))}: ${pct(p.v)}</title><circle class="st-hit" cx="${px(p.i)}" cy="${py(p.v)}" r="${visible ? 11 : 7}"/>${visible ? `<circle class="st-dot" cx="${px(p.i)}" cy="${py(p.v)}" r="4.5"/>` : ''}</g>`;
    }
  }
  return s + '</svg>';
}

/** Horizontal bars, one per enemy type, value labelled at the bar end. */
export function barChartSvg(rows: { label: string; v: number }[], label: string, W = 420): string {
  const rh = 26, h = rows.length * rh + 6, max = Math.max(1, ...rows.map((r) => r.v)), lw = 90;
  const rtl = isAr();
  let s = `<svg viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}">`;
  rows.forEach((r, i) => {
    const y = 4 + i * rh, bw = Math.max(r.v ? 4 : 0, (r.v / max) * (W - lw - 50));
    const bx = rtl ? W - lw - bw : lw;
    s += `<g tabindex="0"><title>${esc(r.label)}: ${num(r.v)}</title>`;
    s += `<text x="${rtl ? W - 4 : 4}" y="${y + 15}" text-anchor="${rtl ? 'end' : 'start'}">${esc(r.label)}</text>`;
    s += `<line class="st-base" x1="${rtl ? W - lw : lw}" x2="${rtl ? W - lw : lw}" y1="${y}" y2="${y + 20}"/>`;
    if (bw) s += `<rect class="st-bar" x="${bx}" y="${y + 3}" width="${bw}" height="16" rx="3"/>`;
    s += `<text class="st-val" x="${rtl ? bx - 6 : bx + bw + 6}" y="${y + 16}" text-anchor="${rtl ? 'end' : 'start'}">${num(r.v)}</text></g>`;
  });
  return s + '</svg>';
}

function tile(label: string, value: string, note = '') {
  return `<div class="st-tile"><span>${esc(tx(label))}</span><b>${value}</b>${note ? `<small>${note}</small>` : ''}</div>`;
}

/** Chart widths in CSS pixels, so the SVG text draws at its real size (the sheet's inner width). */
export function chartWidths(viewport: number): { wide: number; half: number } {
  const wide = Math.round(Math.max(280, Math.min(890, viewport - 72)));
  return { wide, half: viewport > 720 ? Math.round((wide - 18) / 2) : wide };
}

export function statsHtml(c: CareerData, log: SortieEntry[], viewport = 1280): string {
  const cw = chartWidths(viewport);
  const sum = summarize(log);
  const acc = accuracySeries(log);
  const surv = survivalSeries(log);
  const types = killsByType(c.killsByType, ENEMY_KINDS).map((t) => ({ label: ENEMY_VARIANTS[t.type as EnemyType]?.label ?? t.type, v: t.kills }));
  const roleRow = (role: 'gunner' | 'pilot', name: string) => {
    const r = summarize(log, role);
    return `<tr><td>${esc(tx(name))}</td><td>${r.sorties ? `${pct(r.survivalRate)} · ${tx('{n} of {m}', { n: num(r.survived), m: num(r.sorties) })}` : '—'}</td></tr>`;
  };
  const empty = (t: string) => `<div class="st-empty">${esc(tx(t))}</div>`;
  const best = sum.best && sum.best.kills > 0 ? `<p>${tx('Best sortie: <b>{title}</b> — {n} kills', { title: esc(tx(sum.best.title)), n: num(sum.best.kills) })}</p>` : '';
  return `<div class="screen-center"><div class="svc-sheet svc-stats">
    <div class="svc-hdr"><span>${esc(tx('WAR DEPARTMENT · ARMY AIR FORCES'))}</span><span>${esc(tx('PERSONAL STATS · FROM YOUR LOGBOOK'))}</span></div>
    <div class="st-tiles">
      ${tile('Sorties logged', num(sum.sorties))}
      ${tile('Survival rate', sum.sorties ? pct(sum.survivalRate) : '—', sum.sorties ? esc(tx('home from {n} of {m}', { n: num(sum.survived), m: num(sum.sorties) })) : '')}
      ${tile('Accuracy', sum.shots ? pct(sum.accuracy) : '—', sum.shots ? esc(tx('{n} hits from {m} rounds', { n: num(sum.hits), m: num(sum.shots) })) : '')}
      ${tile('Confirmed kills', num(c.kills), esc(tx('whole career')))}
    </div>
    <div class="st-charts">
      <div class="st-chart wide">
        <h3>${esc(tx('Accuracy over time'))}</h3>
        <p>${esc(tx('Each dot is a sortie; the line is the average of the last five.'))}</p>
        ${acc.each.length ? lineChartSvg([{ pts: acc.avg, cls: '', name: 'Average of five' }, { pts: acc.each, cls: '', dots: true, name: 'Sortie' }], accuracyCeiling(acc.each.map((p) => p.v)), tx('Accuracy over time'), cw.wide)
          + `<div class="st-legend"><span><i></i>${esc(tx('Average of five'))}</span><span><i class="dot"></i>${esc(tx('Sortie'))}</span></div>` : empty('Fly a sortie and fire your guns to start this chart.')}
        ${best}
      </div>
      <div class="st-chart">
        <h3>${esc(tx('Kills by type'))}</h3>
        <p>${esc(tx('Every confirmed victory of your career.'))}</p>
        ${barChartSvg(types, tx('Kills by type'), cw.half)}
      </div>
      <div class="st-chart">
        <h3>${esc(tx('Survival rate'))}</h3>
        <p>${esc(tx('Share of your last ten sorties you came home from.'))}</p>
        ${surv.length ? lineChartSvg([{ pts: surv, cls: 'surv', name: 'Survival rate' }], 1, tx('Survival rate'), cw.half) : empty('Fly a sortie to start this chart.')}
        <table class="svc-tbl st-roles">${roleRow('gunner', 'As B-17 gunner')}${roleRow('pilot', 'As P-51 pilot')}</table>
      </div>
    </div>
    <div class="row svc-actions"><button class="btn ghost" data-back>${esc(tx('Back'))}</button></div>
  </div></div>`;
}

export function showStatsScreen(c: CareerData, h: { back(): void }) {
  const el = showLayer('svc-stats');
  el.innerHTML = statsHtml(c, loadLog(), innerWidth);
  el.querySelector('[data-back]')!.addEventListener('click', h.back);
  onBackKey(el, h.back);
}

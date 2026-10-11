import type { Mission } from '../game/Missions';
import { tx as txt, isAr } from '../i18n';  // `tx` is the target's x below

// WWII navigation-chart style route map for the mission briefing. Pure function
// of the mission data: the target name picks the destination, the route runs
// base -> English coast -> continental IP -> target and back, and a flak zone
// is hatched on the chart. Outlines are a rough hand-simplified North Sea and
// NW Europe coastline, drawn as inline SVG so it needs no assets or network.

import { CHART, type ChartPlace } from '../world/EuropeChart';
export { CHART, type ChartPlace } from '../world/EuropeChart';
type Geo = { lat: number; lon: number };
type Pt = [lon: number, lat: number];
type Place = ChartPlace;
const { BASE, NORFOLK, BERLIN, PLACES, ENGLAND, MAINLAND, ISLANDS, COUNTRIES, KX } = CHART;

const W = 400, H = 260;                      // viewBox, scales to the sheet width
const ASPECT = W / H;

const PAPER = '#e7dbb8', LAND = '#d6c28e', COAST = '#4d3b1e', INK = '#2b2518';
const ROUTE = '#8e2418', FLAK = '#9c3320', SEA_LINE = '#4f6f7c', GRID = '#7a6240';

const proj = (p: Geo): [number, number] => [p.lon * KX, -p.lat];
const flakRadius = (intensity: number) => 0.2 + 0.18 * intensity; // degrees
const f = (n: number) => n.toFixed(1);

interface Leg { pts: Geo[]; dashed: boolean }

function legsFor(p: Place): Leg[] {
  if (p.home) return [{ pts: [p.from ?? BERLIN, p, p.eng ?? NORFOLK, BASE], dashed: false }];
  const inbound: Geo[] = [BASE, p.eng ?? NORFOLK, ...(p.ip ? [p.ip] : []), p];
  // The homeward track is drawn a little north of the inbound one so both stay visible.
  const homeward = inbound.slice().reverse().map((q) => ({ lat: q.lat + 0.22, lon: q.lon }));
  return [{ pts: inbound, dashed: false }, { pts: homeward, dashed: true }];
}

/** Inline SVG route chart for the briefing, or '' when the mission has no destination (survival). */
export function briefingMapSvg(m: Mission): string {
  const place = PLACES.find((p) => m.target.includes(p.key));
  if (!place) return '';
  const legs = legsFor(place);
  const flakPt = m.flak && !place.home ? { at: proj(place), r: flakRadius(m.flak.intensity) } : null;

  // Fit the route (and flak zone) into the chart, keeping the viewBox aspect.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const grow = (x: number, y: number, r = 0) => {
    x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r);
    y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r);
  };
  for (const leg of legs) for (const q of leg.pts) { const [x, y] = proj(q); grow(x, y); }
  if (flakPt) grow(flakPt.at[0], flakPt.at[1], flakPt.r);
  const pad = 0.9;
  x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  let w = Math.max(x1 - x0, 4.4);
  const h = Math.max(y1 - y0, w / ASPECT);
  w = h * ASPECT;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const s = W / w; // px per degree
  const X = (x: number) => (x - (cx - w / 2)) * s;
  const Y = (y: number) => (y - (cy - h / 2)) * s;
  const pt = (q: Geo): [number, number] => { const [x, y] = proj(q); return [X(x), Y(y)]; };
  const inside = (x: number, y: number, edge = 6) => x > edge && x < W - edge && y > edge && y < H - edge;

  // Coastlines, islands and graticule.
  const ring = (r: Pt[]) => 'M' + r.map(([lon, lat]) => pt({ lat, lon }).map(f).join(' ')).join('L') + 'Z';
  const grid: string[] = [];
  const latMax = -(cy - h / 2), latMin = -(cy + h / 2);
  for (let la = Math.ceil(latMin); la <= latMax; la++) {
    const y = Y(-la);
    // Labels stay clear of the frame and of the scale bar in the bottom-left corner.
    const lbl = y > H - 34 ? '' : `<text x="9" y="${f(y - 3)}">${txt('{n}°N', { n: la })}</text>`;
    grid.push(`<line x1="0" x2="${W}" y1="${f(y)}" y2="${f(y)}"/>${lbl}`);
  }
  const lonW = (cx - w / 2) / KX, lonE = (cx + w / 2) / KX;
  const step = lonE - lonW > 8 ? 2 : 1;
  for (let lo = Math.ceil(lonW / step) * step; lo <= lonE; lo += step) {
    const x = X(lo * KX);
    const lbl = x < 60 ? '' : `<text x="${f(x + 3)}" y="16">${txt(lo < 0 ? '{n}°W' : '{n}°E', { n: Math.abs(lo) })}</text>`;
    grid.push(`<line x1="${f(x)}" x2="${f(x)}" y1="0" y2="${H}"/>${lbl}`);
  }

  const countries = COUNTRIES.flatMap(([name, g]) => {
    const [x, y] = pt(g);
    return inside(x, y, 36) ? [`<text x="${f(x)}" y="${f(y)}" text-anchor="middle" font-style="italic" font-size="11" letter-spacing="${isAr() ? 0 : 2}">${txt(name)}</text>`] : [];
  });

  // Route legs, turn-points and chevrons showing direction of travel.
  const routeParts: string[] = [];
  for (const leg of legs) {
    const pts = leg.pts.map(pt);
    routeParts.push(`<path d="M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}" fill="none" stroke="${ROUTE}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"${leg.dashed ? ' stroke-dasharray="6 4"' : ''}/>`);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      if (Math.hypot(bx - ax, by - ay) < 30) continue;
      const ang = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
      routeParts.push(`<path d="M-3.5 -3L3 0L-3.5 3Z" fill="${ROUTE}" transform="translate(${f((ax + bx) / 2)} ${f((ay + by) / 2)}) rotate(${f(ang)})"/>`);
    }
    for (const [x, y] of pts.slice(1, -1)) routeParts.push(`<circle cx="${f(x)}" cy="${f(y)}" r="2.4" fill="${PAPER}" stroke="${ROUTE}" stroke-width="1.2"/>`);
  }

  // Labels use a paper halo so they stay readable over coast and route.
  const label = (x: number, y: number, text: string, anchor: 'start' | 'end' | 'middle', size = 12) =>
    `<text x="${f(x)}" y="${f(y)}" text-anchor="${anchor}" font-size="${size}" font-family="'Special Elite', Georgia, serif${isAr() ? ", 'Noto Naskh Arabic'" : ''}" fill="${INK}" stroke="${PAPER}" stroke-width="3" paint-order="stroke" stroke-linejoin="round">${text}</text>`;

  const [bx, by] = pt(BASE);
  const baseMark = inside(bx, by)
    ? `<rect x="${f(bx - 4)}" y="${f(by - 4)}" width="8" height="8" fill="${ROUTE}"/>` +
      label(bx + 8, by + 4, txt('DEENETHORPE'), bx > W * 0.6 ? 'end' : 'start', 10)
    : '';

  const [tx, ty] = pt(place);
  const right = tx < W * 0.6;
  const targetMark = place.home
    ? `<circle cx="${f(tx)}" cy="${f(ty)}" r="4" fill="${PAPER}" stroke="${ROUTE}" stroke-width="1.5"/>` +
      label(tx + (right ? 8 : -8), ty + 4, txt('RETURN ROUTE'), right ? 'start' : 'end', 11)
    : `<circle cx="${f(tx)}" cy="${f(ty)}" r="7" fill="none" stroke="${ROUTE}" stroke-width="1.6"/>` +
      `<circle cx="${f(tx)}" cy="${f(ty)}" r="2.4" fill="${ROUTE}"/>` +
      `<path d="M${f(tx - 11)} ${f(ty)}H${f(tx - 8)}M${f(tx + 8)} ${f(ty)}H${f(tx + 11)}M${f(tx)} ${f(ty - 11)}V${f(ty - 8)}M${f(tx)} ${f(ty + 8)}V${f(ty + 11)}" stroke="${ROUTE}" stroke-width="1.2"/>` +
      label(tx + (right ? 11 : -11), ty - 9, txt(place.key.toUpperCase()), right ? 'start' : 'end');

  const flakMark = flakPt
    ? `<circle cx="${f(X(flakPt.at[0]))}" cy="${f(Y(flakPt.at[1]))}" r="${f(flakPt.r * s)}" fill="url(#bm-flak)" stroke="${FLAK}" stroke-width="1" stroke-dasharray="3 2"/>` +
      label(X(flakPt.at[0]), Y(flakPt.at[1]) + flakPt.r * s + 11, txt('FLAK'), 'middle', 10)
    : '';

  // Compass rose, and a scale bar in statute miles (1 degree of latitude is about 69 miles).
  const miPerPx = 69.05 / s;
  const barMi = [10, 25, 50, 100, 200].filter((mi) => mi / miPerPx <= W * 0.28).pop() ?? 10;
  const barLen = barMi / miPerPx;
  const compass = `<g transform="translate(${W - 34} 40)">
      <circle r="15" fill="${PAPER}" fill-opacity=".7" stroke="${INK}" stroke-width=".8"/>
      <path d="M0 -15L3 0L-3 0Z" fill="${INK}"/><path d="M0 15L3 0L-3 0Z" fill="${PAPER}" stroke="${INK}" stroke-width=".6"/>
      <path d="M-15 0L0 -2.5L15 0L0 2.5Z" fill="none" stroke="${INK}" stroke-width=".6"/>
      <text y="-19" text-anchor="middle" font-size="11" font-weight="700" fill="${INK}">${txt('N (compass)').replace(' (compass)', '')}</text></g>`;   // compass north: "N", Arabic "ش"
  const scale = `<g transform="translate(14 ${H - 14})" font-size="9" fill="${INK}">
      <rect x="0" y="-4" width="${f(barLen / 2)}" height="4" fill="${INK}"/>
      <rect x="${f(barLen / 2)}" y="-4" width="${f(barLen / 2)}" height="4" fill="${PAPER}" stroke="${INK}" stroke-width=".6"/>
      <text x="0" y="-8">0</text><text x="${f(barLen)}" y="-8" text-anchor="end">${txt('{n} MI', { n: barMi })}</text></g>`;

  const seaLines = `<pattern id="bm-sea" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 3.5H7" stroke="${SEA_LINE}" stroke-width=".5" opacity=".35"/></pattern>` +
    `<pattern id="bm-flak" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V5" stroke="${FLAK}" stroke-width="1.4"/></pattern>`;

  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${txt('Route chart to {p}', { p: txt(place.key) })}" overflow="hidden" font-family="Georgia, serif${isAr() ? ", 'Noto Naskh Arabic'" : ''}"${isAr() ? ' direction="ltr"' : ''}>
    <defs>${seaLines}</defs>
    <rect width="${W}" height="${H}" fill="${PAPER}"/>
    <rect width="${W}" height="${H}" fill="url(#bm-sea)"/>
    <g fill="${LAND}" stroke="${COAST}" stroke-width="1" stroke-linejoin="round">
      <path d="${ring(MAINLAND)}"/><path d="${ring(ENGLAND)}"/>
      ${ISLANDS.map(([lon, lat]) => { const [x, y] = pt({ lat, lon }); return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="2.4" ry="1.3" stroke-width=".6"/>`; }).join('')}
    </g>
    <g stroke="${GRID}" stroke-width=".5" stroke-dasharray="2 3" opacity=".65" font-size="9" fill="${GRID}">${grid.join('')}</g>
    <g font-style="italic" fill="${COAST}" stroke="${PAPER}" stroke-width="2.5" paint-order="stroke" stroke-linejoin="round">${countries.join('')}</g>
    ${flakMark}
    ${routeParts.join('')}
    ${baseMark}
    ${targetMark}
    ${compass}
    ${scale}
    <rect x="2" y="2" width="${W - 4}" height="${H - 4}" fill="none" stroke="${COAST}" stroke-width="2.4"/>
    <rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="none" stroke="${COAST}" stroke-width=".6"/>
  </svg>`;

  const caption = txt('Route in red') + (place.home ? txt(', homeward leg') : '') + (flakPt ? txt(' · hatched: flak zone') : '') + txt(' · scale in statute miles');
  return `<figure class="brief-map">${svg}<figcaption>${caption}</figcaption></figure>`;
}

// Share cards (Phase 11 · 37): a 1080×1350 image after a mission and after the Tour, made like a
// wartime crew photo pinned to an olive board: a staged photo of the player's aircraft
// (game/ShareStage.ts) as a toned print with a typed caption, a result stamp, four big numbers,
// Fw 190 victory marks (the Tour card lists the crew who came home instead), the medal ribbons
// and the B-17's nose art.
// The card model is pure (game/ShareCardModel.ts); this file draws it and shows a preview with
// Share / Save image. Hooks: MissionFlow.showDebrief (mountShareCard) and TourScreen.finaleView.
import type { Engine } from '../core/Engine';
import type { Mission } from '../game/Missions';
import type { DebriefData } from './UI';
import { loadFonts, shareEngine, shareFile, shareWorld, SHARE_URL } from '../game/Share';
import { captureStaged } from '../game/ShareStage';
import { type CardModel, cardFileName, cardText, missionCard, tourCard } from '../game/ShareCardModel';
import { type TourState, POS_LABEL, finale, manName } from '../game/Tour';
import { bomberName, noseArtId, withName } from '../game/Customize';
import { drawNoseArt } from '../render/NoseArt';
import { CANVAS_MONO, CANVAS_SANS, isAr, tx } from '../i18n';
import { esc } from './serviceCommon';
import './shareCard.css';

export const CARD_W = 1080, CARD_H = 1350;
const TYPED = `'Special Elite', "IBM Plex Sans Arabic", "Courier New", monospace`;
const CREAM = '#f2ead3', KHAKI = '#c9b77a', INK = '#2b2518';
const PRINT = { x: 104, y: 196, w: 872, h: 430, border: 22, foot: 78 };
const TOUR_PRINT_H = 330;   // the tour card's print is shorter: its crew roster sits under the numbers, in place of the marks

type Ctx = CanvasRenderingContext2D;

/** Fits text into maxW by stepping the font size down. */
function fit(g: Ctx, text: string, weight: string, size: number, family: string, maxW: number, min = 14) {
  let s = size;
  g.font = `${weight} ${s}px ${family}`;
  while (g.measureText(text).width > maxW && s > min) { s -= 2; g.font = `${weight} ${s}px ${family}`; }
  return s;
}

/** Deterministic grain (the same card twice looks the same). */
function hash(i: number) { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; }

/** The photo: the frame cropped to the print, toned warm-monochrome with grain and a soft vignette. */
function tonedPhoto(src: HTMLCanvasElement | null, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  if (src && src.width > 0 && src.height > 0) {
    const a = w / h, sa = src.width / src.height;
    const sw = sa > a ? src.height * a : src.width, sh = sa > a ? src.height : src.width / a;
    g.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, w, h);
  } else {
    // no frame to capture: an overcast sky with a formation of specks
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#8d97a0'); sky.addColorStop(1, '#d9d6cc');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(30,30,30,0.7)';
    for (let i = 0; i < 9; i++) g.fillRect(w * (0.3 + (i % 3) * 0.12 + Math.floor(i / 3) * 0.05), h * (0.35 + Math.floor(i / 3) * 0.08), 26, 4);
  }
  try {
    const img = g.getImageData(0, 0, w, h), d = img.data, n = w * h;
    // auto levels: stretch the 0.5th..99.5th luminance percentiles to the full range, then a gentle
    // gamma that brings the median towards mid grey, so a bright sky never prints as a blank sheet
    // and the olive-drab aircraft keeps its detail instead of going black
    const lum = new Float32Array(n), hist = new Uint32Array(256);
    for (let p = 0, i = 0; i < n; p += 4, i++) { const l = (0.3 * d[p] + 0.59 * d[p + 1] + 0.11 * d[p + 2]) / 255; lum[i] = l; hist[Math.min(255, (l * 255) | 0)]++; }
    const pctl = (q: number) => { let acc = 0; for (let b = 0; b < 256; b++) { acc += hist[b]; if (acc >= q * n) return b / 255; } return 1; };
    const lo = pctl(0.005), hi = Math.max(lo + 0.08, pctl(0.995));
    const med = Math.min(0.95, Math.max(0.05, (pctl(0.5) - lo) / (hi - lo)));
    const gamma = Math.min(1.3, Math.max(0.8, Math.log(0.55) / Math.log(med)));
    const cx = w / 2, cy = h / 2, r2 = cx * cx + cy * cy;
    for (let p = 0, i = 0; i < n; p += 4, i++) {
      const x = i % w, y = (i / w) | 0;
      let l = Math.min(1, Math.max(0, (lum[i] - lo) / (hi - lo))) ** gamma;
      l = l * 0.3 + l * l * (3 - 2 * l) * 0.7;                                   // S-curve contrast
      l += 0.5 * l * (1 - l) * (1 - l);                                          // lift the shadows a little
      const v = 1 - 0.34 * (((x - cx) ** 2 + (y - cy) ** 2) / r2);               // vignette
      const gr = (hash(i) - 0.5) * 0.06;                                          // grain
      const t = Math.min(1, Math.max(0, 0.04 + 0.92 * l * v + gr));              // paper toe and shoulder
      d[p] = 255 * Math.min(1, t * 1.05 + 0.02); d[p + 1] = 255 * (t * 0.97 + 0.015); d[p + 2] = 255 * (t * 0.84);
    }
    g.putImageData(img, 0, 0);
  } catch { /* tainted or unavailable: keep the colour frame */ }
  return c;
}

function ribbon(g: Ctx, css: string | null, x: number, y: number, w: number, h: number) {
  // the ribbon CSS is a stripes gradient: re-create its stops as canvas rectangles
  const stops = css ? [...css.matchAll(/(#[0-9a-f]{3,6})\s+([\d.]+)%\s+([\d.]+)%/gi)] : [];
  if (!stops.length) { g.fillStyle = '#6b6f4a'; g.fillRect(x, y, w, h); }
  for (const s of stops) { g.fillStyle = s[1]; g.fillRect(x + (w * +s[2]) / 100, y, Math.ceil((w * (+s[3] - +s[2])) / 100), h); }
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2; g.strokeRect(x, y, w, h);
}

// Fw 190 A side profile (nose left) in a 100×40 box, the shape painted as victory marks under a
// B-17's cockpit: radial cowling and spinner, low canopy, the tall rounded fin, wing and tailplane.
const FW190: [number, number][][] = [
  // fuselage, canopy and fin
  [[0, 21], [1.2, 17.6], [4.5, 16.2], [8, 14.6], [15, 13.2], [23, 13.3], [30, 13.4], [33.5, 10.8], [38, 9.2], [44, 8.8], [48.5, 9.8], [52, 12.2],
   [70, 13.8], [84, 14.6], [86.5, 7.5], [88.5, 4.2], [92, 3.2], [95, 4], [96.2, 7.5], [96.6, 15.5], [99.5, 18.6], [97.5, 21.4], [86, 22.4],
   [70, 24.3], [56, 26.4], [40, 27.6], [24, 27.6], [14, 27], [7, 25.6], [2.4, 23.6]],
  // wing, seen slightly from below so it reads as a wing and not a line
  [[19, 25.5], [46, 25.2], [53, 26.6], [48, 30.6], [24, 31.4], [17.5, 29]],
  // tailplane
  [[79, 17.4], [95, 16.8], [97, 18.4], [92, 19.8], [80, 19.6]],
  // propeller disc edge
  [[-1.2, 5], [0.6, 5], [0.6, 37], [-1.2, 37]],
];

/** A victory mark: the Fw 190 profile, centred on (x, y), `s` px long, facing the reading direction. */
function mark(g: Ctx, x: number, y: number, s: number, flip: boolean) {
  const k = s / 100, f = flip ? -1 : 1;
  g.beginPath();
  for (const poly of FW190) poly.forEach(([px, py], i) => { const X = x + f * (px - 50) * k, Y = y + (py - 20) * k; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
  g.fill();
  g.save();
  // details cut in the board's colour: canopy glazing and frame, the wing's root line, the cowling
  // ring and a Balkenkreuz on the rear fuselage
  const fill = g.fillStyle, P = (px: number, py: number): [number, number] => [x + f * (px - 50) * k, y + (py - 20) * k];
  g.fillStyle = g.strokeStyle = '#23261a';
  g.beginPath();
  [[35.4, 11.8], [38.6, 10.2], [44, 9.9], [47.6, 10.7], [49.4, 12.4], [35.4, 12.7]].forEach(([px, py], i) => { const [X, Y] = P(px, py); if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
  g.fill();
  g.lineWidth = Math.max(1, 0.9 * k);
  g.beginPath();
  for (const [a0, a1] of [[[41.5, 9.4], [41.5, 12.7]], [[19, 25.4], [46, 25.1]], [[9, 15.2], [9, 26.6]]]) { g.moveTo(...P(a0[0], a0[1])); g.lineTo(...P(a1[0], a1[1])); }
  g.stroke();
  const [bx, by] = P(68, 18.8), a = 4.6 * k, b = 1.3 * k;
  g.fillRect(bx - a, by - b, a * 2, b * 2); g.fillRect(bx - b, by - a, b * 2, a * 2);
  g.restore();
  g.fillStyle = fill;
}

/** The print's caption, its values translated too (dates, ship names stay as they are). */
const caption = (c: CardModel) => tx(c.caption.key, Object.fromEntries(Object.entries(c.caption.vars).map(([k, v]) => [k, isAr() ? `\u2068${tx(v)}\u2069` : tx(v)])));   // isolates keep Latin names and dates whole in Arabic

/** Draws the card. `photo` is a captured frame (null draws a stand-in sky). */
export function drawShareCard(c: CardModel, photo: HTMLCanvasElement | null, canvas = document.createElement('canvas')): HTMLCanvasElement {
  canvas.width = CARD_W; canvas.height = CARD_H;
  const g = canvas.getContext('2d')!;
  const W = CARD_W, rtl = isAr();
  const X = (x: number) => (rtl ? W - x : x);                         // mirrors text anchors in Arabic
  const start: CanvasTextAlign = rtl ? 'right' : 'left', end: CanvasTextAlign = rtl ? 'left' : 'right';
  g.direction = rtl ? 'rtl' : 'ltr';

  // ---- the board ----
  const bg = g.createLinearGradient(0, 0, 0, CARD_H);
  bg.addColorStop(0, '#363a26'); bg.addColorStop(1, '#1b1d12');
  g.fillStyle = bg; g.fillRect(0, 0, W, CARD_H);
  g.fillStyle = 'rgba(255,255,255,0.025)';
  for (let y = 0; y < CARD_H; y += 6) g.fillRect(0, y, W, 2);           // canvas weave
  const vig = g.createRadialGradient(W / 2, CARD_H / 2, CARD_H * 0.25, W / 2, CARD_H / 2, CARD_H * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = vig; g.fillRect(0, 0, W, CARD_H);
  g.strokeStyle = 'rgba(201,183,122,0.45)'; g.lineWidth = 3; g.strokeRect(28, 28, W - 56, CARD_H - 56);

  // ---- header ----
  g.textBaseline = 'alphabetic';
  g.fillStyle = KHAKI; g.textAlign = start;
  fit(g, `SKY WAR SHOOTER 3D · ${tx(c.kicker)}`, '600', 22, CANVAS_MONO, W - 150);
  g.fillText(`SKY WAR SHOOTER 3D · ${tx(c.kicker)}`, X(70), 92);
  g.fillStyle = CREAM;
  const title = tx(c.title).toUpperCase();
  fit(g, title, '700', 70, CANVAS_SANS, W - 140, 30);
  g.fillText(title, X(70), 164);

  // ---- the print ----
  const roster = c.crew.length > 0;
  const P = { ...PRINT, h: roster ? TOUR_PRINT_H : PRINT.h }, pw = P.w + P.border * 2, ph = P.h + P.border + P.foot;
  g.save();
  g.translate(W / 2, P.y + ph / 2);
  g.rotate((rtl ? 1 : -1) * 0.014);
  g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 30; g.shadowOffsetY = 12;
  g.fillStyle = '#efe7d2'; g.fillRect(-pw / 2, -ph / 2, pw, ph);
  g.shadowColor = 'transparent';
  g.drawImage(tonedPhoto(photo, P.w, P.h), -pw / 2 + P.border, -ph / 2 + P.border);
  g.strokeStyle = 'rgba(60,45,20,0.35)'; g.lineWidth = 1; g.strokeRect(-pw / 2 + P.border, -ph / 2 + P.border, P.w, P.h);
  // caption typed on the print's foot
  g.fillStyle = INK; g.textAlign = 'center';
  const footY = -ph / 2 + P.border + P.h;
  const cap = caption(c);
  fit(g, cap, '400', 28, TYPED, pw - 60);
  g.fillText(cap, 0, footY + 50);
  // tape on two corners
  g.fillStyle = 'rgba(226,214,170,0.72)';
  for (const sx of [-1, 1]) { g.save(); g.translate(sx * (pw / 2 - 20), -ph / 2 + 4); g.rotate(sx * 0.6); g.fillRect(-56, -16, 112, 32); g.restore(); }
  // result stamp across the print's top corner
  g.save();
  g.translate((rtl ? -1 : 1) * (pw / 2 - 190), -ph / 2 + 92);
  g.rotate(-0.12);
  const st = tx(c.stamp.text);
  const ss = fit(g, st, '700', 40, CANVAS_SANS, 330, 20);
  const sw = g.measureText(st).width + 44;
  g.strokeStyle = c.stamp.good ? 'rgba(52,120,70,0.92)' : 'rgba(170,40,30,0.92)';
  g.fillStyle = g.strokeStyle;
  g.lineWidth = 5; g.strokeRect(-sw / 2, -ss * 0.95, sw, ss * 1.5);
  g.textAlign = 'center'; g.fillText(st, 0, ss * 0.32);
  g.restore();
  g.restore();

  // ---- the numbers ----
  const ty = P.y + ph + 40, tw = (W - 140) / 4;
  c.tiles.forEach((t, i) => {
    const x = 70 + i * tw;
    g.fillStyle = 'rgba(242,234,211,0.06)'; g.fillRect(rtl ? W - x - tw + 8 : x, ty, tw - 8, 110);
    g.fillStyle = KHAKI; g.textAlign = start;
    fit(g, tx(t.label), '600', 17, CANVAS_MONO, tw - 36, 10);
    g.fillText(tx(t.label), X(x + 16), ty + 34);
    g.fillStyle = CREAM;
    fit(g, t.value, '700', 58, CANVAS_SANS, tw - 36, 24);
    g.fillText(t.value, X(x + 16), ty + 94);
  });

  // ---- the crew roster (tour card): two columns, names large enough to read in a feed ----
  let y = ty + 110 + 40;
  if (roster) {
    g.fillStyle = KHAKI; g.textAlign = start; g.font = `600 17px ${CANVAS_MONO}`;
    g.fillText(tx('THE CREW · HOME FROM THE WAR'), X(70), y);
    const colW = (W - 140 - 30) / 2, rows = Math.ceil(c.crew.length / 2), rh = 37;
    c.crew.forEach((m, i) => {
      const x = 70 + Math.floor(i / rows) * (colW + 30), ry = y + 40 + (i % rows) * rh;
      g.fillStyle = 'rgba(242,234,211,0.12)'; g.fillRect(rtl ? W - x - colW : x, ry + 10, colW, 1);
      g.fillStyle = KHAKI; g.textAlign = end;
      fit(g, m.pos, '400', 18, CANVAS_MONO, colW * 0.36, 12);
      g.fillText(m.pos, X(x + colW), ry);
      const posW = g.measureText(m.pos).width;
      g.fillStyle = CREAM; g.textAlign = start;
      fit(g, m.name, '400', 26, TYPED, colW - posW - 18, 14);
      g.fillText(m.name, X(x), ry);
    });
    y += 40 + rows * rh;
  }

  // ---- victory marks (mission card; the tour's kills are on the tile above) ----
  if (!roster) {
    g.fillStyle = KHAKI; g.textAlign = start; g.font = `600 17px ${CANVAS_MONO}`;
    g.fillText(tx('VICTORY MARKS'), X(70), y);
    g.fillStyle = CREAM;
    const perRow = 12, ms = 66, mgap = 8, mrow = 36;
    if (!c.marks) { g.fillStyle = 'rgba(242,234,211,0.55)'; g.font = `400 20px ${TYPED}`; g.fillText(tx('No victories this time'), X(70), y + 40); }
    for (let i = 0; i < c.marks; i++) {
      const col = i % perRow, row = Math.floor(i / perRow);
      mark(g, X(70 + ms / 2 + col * (ms + mgap)), y + 34 + row * mrow, ms, rtl);
    }
    const markRows = Math.max(1, Math.ceil(c.marks / perRow));
    if (c.extraMarks) { g.font = `700 28px ${CANVAS_SANS}`; g.textAlign = end; g.fillText(`+${c.extraMarks}`, X(W - 70), y + 44 + (markRows - 1) * mrow); }
    y += 34 + markRows * mrow + 14;
  }

  // ---- nose art and ribbons ----
  const by = y;
  const noseW = c.nose ? 360 : 0;
  if (c.nose) {
    const nx = rtl ? W - 70 - noseW : 70, nh = 190;
    const panel = g.createLinearGradient(nx, by, nx, by + nh);
    panel.addColorStop(0, '#5a6140'); panel.addColorStop(1, '#3c4229');
    g.fillStyle = panel; g.fillRect(nx, by, noseW, nh);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(nx + 14 + i * ((noseW - 28) / 8), by + 10, 2.4, 0, Math.PI * 2); g.arc(nx + 14 + i * ((noseW - 28) / 8), by + nh - 10, 2.4, 0, Math.PI * 2); g.fill(); }
    try { g.drawImage(drawNoseArt(c.nose.id, c.nose.name), nx + 8, by + 18, noseW - 16, (noseW - 16) / 2); } catch { /* no art: plain panel */ }
  }
  const mx = 70 + (noseW ? noseW + 34 : 0), mw = W - 70 - mx;
  g.textAlign = start; g.fillStyle = KHAKI; g.font = `600 17px ${CANVAS_MONO}`;
  g.fillText(tx('DECORATIONS'), X(mx), by + 18);
  if (!c.medals.length) { g.fillStyle = 'rgba(242,234,211,0.55)'; g.font = `400 20px ${TYPED}`; g.fillText(tx('None awarded'), X(mx), by + 58); }
  c.medals.forEach((m, i) => {
    const y = by + 36 + i * 34;
    ribbon(g, m.ribbon, rtl ? W - mx - 76 : mx, y, 76, 22);
    g.fillStyle = CREAM; g.textAlign = start;
    const label = tx(m.name) + (m.count > 1 ? ` ×${m.count}` : '');
    fit(g, label, '400', 21, CANVAS_MONO, mw - 96, 12);
    g.fillText(label, X(mx + 92), y + 19);
  });
  if (c.moreMedals) { g.fillStyle = 'rgba(242,234,211,0.6)'; g.font = `400 17px ${CANVAS_MONO}`; g.fillText(tx('+{n} more', { n: c.moreMedals }), X(mx + 92), by + 36 + c.medals.length * 34 + 16); }

  // ---- footer ----
  g.fillStyle = 'rgba(242,234,211,0.6)'; g.textAlign = 'center'; g.font = `400 18px ${CANVAS_MONO}`;
  g.fillText(SHARE_URL.replace(/^https:\/\//, '').replace(/\/$/, ''), W / 2, CARD_H - 52);
  return canvas;
}

function toBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
}

/** Photographs the player's aircraft now (a staged camera, see ShareStage) and builds the card. */
export async function buildShareCard(engine: Engine | null, model: CardModel): Promise<HTMLCanvasElement> {
  let photo: HTMLCanvasElement | null = null;
  try { photo = engine ? captureStaged(engine, shareWorld) : null; } catch (e) { console.warn('ShareCard: capture failed', e); }
  await loadFonts();
  return drawShareCard(model, photo);
}

/** The preview: the card image with Share and Close (Esc closes too). */
export async function openShareCard(engine: Engine | null, model: CardModel) {
  document.querySelector('.scard-modal')?.remove();
  const canvas = await buildShareCard(engine, model);
  const blob = await toBlob(canvas);
  const url = URL.createObjectURL(blob);
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const name = cardFileName(model);
  const canShareFile = !!nav.share && !!nav.canShare?.({ files: [new File([blob], name, { type: 'image/png' })] });
  const el = document.createElement('div');
  el.className = 'scard-modal';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', tx('Share card'));
  el.innerHTML = `<div class="scard-box">
    <img class="scard-img" src="${url}" alt="${esc(tx('Share card'))}: ${esc(tx(model.title))}">
    <div class="row scard-actions">
      <button class="btn primary-go" data-go>${esc(tx(canShareFile ? 'Share' : 'Save image'))}</button>
      <button class="btn ghost" data-close>${esc(tx('Close'))}</button>
    </div></div>`;
  document.body.appendChild(el);
  const close = () => { removeEventListener('keydown', key, true); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const key = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
  addEventListener('keydown', key, true);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  el.querySelector<HTMLElement>('[data-close]')!.onclick = close;
  const t = cardText(model);
  el.querySelector<HTMLElement>('[data-go]')!.onclick = () => { void shareFile(blob, name, tx(t.key, { ...t.vars, title: tx(t.vars.title ?? '') }), tx('Card saved')); };
  el.querySelector<HTMLElement>('[data-go]')!.focus();
}

/** Adds a "Share card" button to a share row (the debrief's, from Share.mountShare) or a host element. */
export function mountShareCardButton(host: HTMLElement | null, engine: Engine | null, model: () => CardModel) {
  if (!host) return;
  host.querySelector('[data-share="card"]')?.remove();
  const b = document.createElement('button');
  b.className = 'btn';
  b.dataset.share = 'card';
  b.textContent = `🖼 ${tx('Share card')}`;
  b.addEventListener('click', () => { void openShareCard(engine, model()); });
  host.prepend(b);
}

/** Debrief: "Share card" in the share row (Share.mountShare runs first). */
export function mountMissionShareCard(host: HTMLElement | null, engine: Engine, m: Mission, d: DebriefData) {
  const row = host?.querySelector<HTMLElement>('.share-row') ?? host ?? null;
  mountShareCardButton(row, engine, () => missionCard({
    title: m.title, date: m.date, role: m.role, success: d.success, survival: d.survival, waves: d.waves, kills: d.kills,
    accuracy: d.accuracy, rounds: d.rounds, score: d.personalScore ?? d.score, bombersLost: d.bombersLost, bombersTotal: d.bombersTotal,
    medals: d.medals, ship: bomberName(), nose: noseArtId(),
  }));
}

/** The Tour's finale: "Share tour card" next to "Begin a new tour". The crew's names go in the roster under the numbers. */
export function mountTourShareCard(row: HTMLElement | null, s: TourState) {
  const f = finale(s);
  const trName = (who: string) => { const i = who.indexOf(' '); return i < 0 ? tx(who) : `${tx(who.slice(0, i))} ${tx(who.slice(i + 1))}`; };
  mountShareCardButton(row, shareEngine, () => tourCard({
    sorties: f.sorties, kills: f.kills, ships: f.ships.map(withName), patches: f.patches,
    home: f.home.map((man) => ({ name: trName(manName(man)), pos: tx(POS_LABEL[man.pos]) })),
    fallen: f.fallen.length, wounded: f.wounded.length, medals: f.medals, nose: noseArtId(),
  }));
  row?.querySelector('[data-share="card"]')?.replaceChildren(`🖼 ${tx('Share tour card')}`);
}

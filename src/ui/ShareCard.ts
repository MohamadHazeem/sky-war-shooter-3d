// Share cards (Phase 11 · 37): a 1080×1350 image after a mission and after the Tour, made like a
// wartime crew photo pinned to an olive board: the current frame as a toned print with a typed
// caption (the Tour's print carries the crew's names, like the back of a crew photo), a result
// stamp, four big numbers, painted victory marks, the medal ribbons and the B-17's nose art.
// The card model is pure (game/ShareCardModel.ts); this file draws it and shows a preview with
// Share / Save image. Hooks: MissionFlow.showDebrief (mountShareCard) and TourScreen.finaleView.
import type { Engine } from '../core/Engine';
import type { Mission } from '../game/Missions';
import type { DebriefData } from './UI';
import { captureFrame, loadFonts, shareEngine, shareFile, SHARE_URL } from '../game/Share';
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
    const img = g.getImageData(0, 0, w, h), d = img.data;
    const cx = w / 2, cy = h / 2, r2 = cx * cx + cy * cy;
    for (let p = 0, i = 0; p < d.length; p += 4, i++) {
      const x = i % w, y = (i / w) | 0;
      let l = (0.3 * d[p] + 0.59 * d[p + 1] + 0.11 * d[p + 2]) / 255;
      l = Math.min(1, Math.max(0, (l - 0.5) * 1.3 + 0.5));                  // a little contrast
      const v = 1 - 0.38 * (((x - cx) ** 2 + (y - cy) ** 2) / r2);            // vignette
      const n = (hash(i) - 0.5) * 0.07;                                          // grain
      const t = Math.min(1, Math.max(0, l * v + n));
      d[p] = 255 * Math.min(1, t * 1.06 + 0.03); d[p + 1] = 255 * (t * 0.97 + 0.02); d[p + 2] = 255 * (t * 0.82);
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

/** A small fighter silhouette, painted like the kill marks under a B-17's cockpit. */
function mark(g: Ctx, x: number, y: number, s: number) {
  g.beginPath();
  g.moveTo(x, y - s * 0.5); g.lineTo(x + s * 0.09, y - s * 0.1); g.lineTo(x + s * 0.5, y + s * 0.02); g.lineTo(x + s * 0.5, y + s * 0.14);
  g.lineTo(x + s * 0.08, y + s * 0.12); g.lineTo(x + s * 0.06, y + s * 0.38); g.lineTo(x + s * 0.2, y + s * 0.46); g.lineTo(x + s * 0.2, y + s * 0.52);
  g.lineTo(x - s * 0.2, y + s * 0.52); g.lineTo(x - s * 0.2, y + s * 0.46); g.lineTo(x - s * 0.06, y + s * 0.38); g.lineTo(x - s * 0.08, y + s * 0.12);
  g.lineTo(x - s * 0.5, y + s * 0.14); g.lineTo(x - s * 0.5, y + s * 0.02); g.lineTo(x - s * 0.09, y - s * 0.1); g.closePath();
  g.fill();
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
  const P = PRINT, pw = P.w + P.border * 2, ph = P.h + P.border + P.foot;
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
  if (c.crew.length) {
    const cap = caption(c);
    fit(g, cap, '400', 22, TYPED, pw - 60);
    g.fillText(cap, 0, footY + 30);
    const names = c.crew.join(' · ');
    const half = Math.ceil(c.crew.length / 2);
    const lines = g.measureText(names).width > pw - 60 ? [c.crew.slice(0, half).join(' · '), c.crew.slice(half).join(' · ')] : [names];
    lines.forEach((l, i) => { fit(g, l, '400', 15, TYPED, pw - 50, 10); g.fillText(l, 0, footY + 52 + i * 19); });
  } else {
    const cap = caption(c);
    fit(g, cap, '400', 28, TYPED, pw - 60);
    g.fillText(cap, 0, footY + 50);
  }
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

  // ---- victory marks ----
  const my = ty + 150;
  g.fillStyle = KHAKI; g.textAlign = start; g.font = `600 17px ${CANVAS_MONO}`;
  g.fillText(tx('VICTORY MARKS'), X(70), my);
  g.fillStyle = CREAM;
  const perRow = 19, ms = 36;
  if (!c.marks) { g.fillStyle = 'rgba(242,234,211,0.55)'; g.font = `400 20px ${TYPED}`; g.fillText(tx('No victories this time'), X(70), my + 40); }
  for (let i = 0; i < c.marks; i++) {
    const col = i % perRow, row = Math.floor(i / perRow);
    mark(g, X(70 + ms / 2 + col * (ms + 10)), my + 34 + row * (ms + 8), ms);
  }
  if (c.extraMarks) { g.font = `700 26px ${CANVAS_SANS}`; g.textAlign = end; g.fillText(`+${c.extraMarks}`, X(W - 70), my + 46 + 44); }

  // ---- nose art and ribbons ----
  const by = my + 34 + (c.marks > perRow ? 2 : 1) * (ms + 8) + 20;
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

/** Captures the frame now (synchronously, see Share.captureFrame) and builds the card. */
export async function buildShareCard(engine: Engine | null, model: CardModel): Promise<HTMLCanvasElement> {
  let photo: HTMLCanvasElement | null = null;
  try { photo = engine ? captureFrame(engine) : null; } catch (e) { console.warn('ShareCard: capture failed', e); }
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

/** The Tour's finale: "Share tour card" next to "Begin a new tour". The crew's names go on the print. */
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

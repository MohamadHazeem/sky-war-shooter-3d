import type { Engine } from '../core/Engine';
import type { Game } from './Game';
import '../ui/share.css';
import { tx } from '../i18n';

// Sharing: a screenshot of the current frame with a stamp (game name, mission, score, kills),
// and a one-line result for the debrief. The Web Share API is used where it can carry files
// (phones, Safari, Chrome on Windows/ChromeOS); everywhere else the PNG is downloaded and the
// share text + link go to the clipboard.
//
// The renderer has no preserveDrawingBuffer (it costs performance every frame). The capture
// renders one frame and copies the canvas in the same task, before the browser presents it.

export const GAME_NAME = 'Sky War Shooter 3D';
export const SHARE_URL = 'https://sky-war-shooter-3d.mhamadhazeem2001.workers.dev/';

export interface ShareStamp {
  mission: string;   // shown on the stamp ('Black Thursday', 'Survival — Gunner')
  score: number;
  kills: number;
  role?: 'gunner' | 'pilot';
  note?: string;     // optional extra line ('PHOTO MODE', 'ROUND 4')
}

export interface ResultInfo {
  title: string;
  kills: number;
  score: number;
  success: boolean;
  survival: boolean;
  waves?: number;
  role: 'gunner' | 'pilot';
}

/** "I downed 34 fighters in 'Black Thursday' — Sky War Shooter 3D" */
export function resultText(r: ResultInfo): string {
  const k = r.kills;
  const downed = `I downed ${k} fighter${k === 1 ? '' : 's'}`;
  if (r.survival) return `${downed} and held out for ${r.waves ?? 0} round${r.waves === 1 ? '' : 's'} in '${r.title}' (${r.score.toLocaleString('en-US')} pts) — ${GAME_NAME}`;
  return `${downed} in '${r.title}'${r.success ? '' : ' before going down'} — ${GAME_NAME}`;
}

/** Renders a frame and copies it into a 2D canvas (synchronously, see the note above). */
export function captureFrame(engine: Engine): HTMLCanvasElement {
  // dynamic resolution may have lowered the render scale: shoot at full scale, then put it back
  const scale = engine.renderScale;
  if (scale < 1) { engine.renderScale = 1; engine.resize(); }
  try {
    engine.render(1 / 60);
    const src = engine.renderer.domElement;
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    c.getContext('2d')!.drawImage(src, 0, 0);
    return c;
  } finally {
    if (scale < 1) { engine.renderScale = scale; engine.resize(); }
  }
}

let fontsReady: Promise<unknown> | null = null;
export function loadFonts() {
  if (!fontsReady) {
    fontsReady = Promise.race([
      Promise.all([document.fonts?.load('700 48px Oswald'), document.fonts?.load('400 24px "IBM Plex Mono"')]).catch(() => null),
      new Promise((r) => setTimeout(r, 600)),
    ]);
  }
  return fontsReady;
}

/** Draws the stamp along the bottom of the captured frame. */
export function drawStamp(c: HTMLCanvasElement, s: ShareStamp) {
  const ctx = c.getContext('2d')!;
  const W = c.width, H = c.height;
  const u = Math.max(0.5, Math.min(W / 1280, H / 720));   // scale with the image
  const band = Math.round(118 * u);
  const g = ctx.createLinearGradient(0, H - band * 1.6, 0, H);
  g.addColorStop(0, 'rgba(10,12,8,0)');
  g.addColorStop(0.45, 'rgba(10,12,8,0.55)');
  g.addColorStop(1, 'rgba(10,12,8,0.86)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H - band * 1.6, W, band * 1.6);
  const pad = Math.round(34 * u);
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.75)';
  ctx.shadowBlur = 8 * u;
  // khaki rule above the title
  ctx.fillStyle = '#c9b77a';
  ctx.fillRect(pad, H - pad - 70 * u, 46 * u, 4 * u);
  ctx.fillStyle = '#f2ead3';
  ctx.font = `700 ${Math.round(40 * u)}px Oswald, "Arial Narrow", sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(GAME_NAME.toUpperCase(), pad, H - pad - 26 * u);
  ctx.font = `400 ${Math.round(17 * u)}px "IBM Plex Mono", monospace`;
  ctx.fillStyle = 'rgba(242,234,211,0.82)';
  const sub = [s.mission, s.note].filter(Boolean).join(' · ').toUpperCase();
  ctx.fillText(sub, pad, H - pad);
  // right: score and kills
  ctx.textAlign = 'right';
  const right = W - pad;
  ctx.font = `600 ${Math.round(14 * u)}px "IBM Plex Mono", monospace`;
  ctx.fillStyle = 'rgba(201,183,122,0.95)';
  const kx = right, sx = right - 150 * u;
  ctx.fillText('KILLS', kx, H - pad - 44 * u);
  ctx.fillText('SCORE', sx, H - pad - 44 * u);
  ctx.font = `700 ${Math.round(38 * u)}px Oswald, "Arial Narrow", sans-serif`;
  ctx.fillStyle = '#f2ead3';
  ctx.fillText(String(Math.max(0, Math.round(s.kills))), kx, H - pad - 6 * u);
  ctx.fillText(Math.max(0, Math.round(s.score)).toLocaleString('en-US'), sx, H - pad - 6 * u);
  ctx.font = `400 ${Math.round(12 * u)}px "IBM Plex Mono", monospace`;
  ctx.fillStyle = 'rgba(242,234,211,0.6)';
  ctx.fillText(SHARE_URL.replace(/^https:\/\//, '').replace(/\/$/, ''), right, H - pad + 16 * u);
  ctx.shadowBlur = 0;
}

function slug(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'shot';
}

function toBlob(c: HTMLCanvasElement, type = 'image/png', q?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), type, q));
}

export function shareTextFor(s: ShareStamp) {
  return `${s.kills} kill${s.kills === 1 ? '' : 's'}, ${Math.round(s.score).toLocaleString('en-US')} points in '${s.mission}' — ${GAME_NAME}`;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed';

/** Captures the frame now, stamps it, and shares or downloads it. */
export async function shareScreenshot(engine: Engine, stamp: ShareStamp): Promise<ShareOutcome> {
  let c: HTMLCanvasElement;
  try { c = captureFrame(engine); } catch (e) { console.warn('Share: capture failed', e); toast('Could not capture the screen'); return 'failed'; }
  await loadFonts();
  drawStamp(c, stamp);
  const blob = await toBlob(c);
  const name = `${slug(GAME_NAME)}-${slug(stamp.mission)}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.png`;
  return shareFile(blob, name, shareTextFor(stamp), 'Screenshot saved');
}

/** Shares an image file (Web Share with files) or downloads it and copies the text + link,
 *  then toasts `saved` (+ "· share text and link copied"). Used by the screenshot above and
 *  the replay theatre's share card (Theatre.ts). */
export async function shareFile(blob: Blob, name: string, text: string, saved: string): Promise<ShareOutcome> {
  const file = new File([blob], name, { type: blob.type || 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: GAME_NAME, text: `${text}\n${SHARE_URL}` });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
      // NotAllowedError (user activation expired) and the like: fall through to the download
    }
  }
  download(blob, name);
  const copied = await copyText(`${text} ${SHARE_URL}`);
  toast(copied ? `${saved} · share text and link copied` : saved);
  return 'downloaded';
}

/** Shares the debrief result line (text + link); falls back to the clipboard. */
export async function shareResult(r: ResultInfo): Promise<ShareOutcome> {
  const text = resultText(r);
  if (navigator.share) {
    try {
      await navigator.share({ title: GAME_NAME, text, url: SHARE_URL });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }
  const ok = await copyText(`${text} ${SHARE_URL}`);
  toast(ok ? 'Result and link copied — paste it anywhere' : text);
  return ok ? 'downloaded' : 'failed';
}

let toastEl: HTMLElement | null = null;
let toastTimer = 0;
export function toast(msg: string, ms = 2600) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'share-toast';
    toastEl.setAttribute('role', 'status');
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = tx(msg);
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl?.classList.remove('show'), ms);
}

/**
 * Adds the share buttons to a menu panel (the pause box or the debrief box).
 * `result` adds "Share result" next to "Share screenshot".
 */
export function mountShare(host: HTMLElement | null, engine: Engine, stamp: () => ShareStamp, result?: () => ResultInfo) {
  if (!host) return;
  host.querySelector('.share-row')?.remove();
  const row = document.createElement('div');
  row.className = 'row share-row';
  row.innerHTML = `<button class="btn ghost" data-share="shot">📸 ${tx('Share screenshot')}</button>${result ? `<button class="btn ghost" data-share="result">${tx('Share result')}</button>` : ''}`;
  // pause: right under the menu buttons; debrief: under the action row
  const anchor = host.querySelector('.menu') ?? host.querySelector('.row');
  if (anchor) anchor.insertAdjacentElement('afterend', row); else host.appendChild(row);
  row.querySelector<HTMLButtonElement>('[data-share="shot"]')!.addEventListener('click', () => { void shareScreenshot(engine, stamp()); });
  row.querySelector<HTMLButtonElement>('[data-share="result"]')?.addEventListener('click', () => { void shareResult(result!()); });
}

/** The stamp for the mission in progress (pause menu, photo mode, debrief). */
export function shareStamp(game: Game, note?: string): ShareStamp {
  const m = game.mission;
  return {
    mission: m ? m.title : 'Over the Reich',
    score: game.currentScore,
    kills: game.world.stats.kills,
    role: m?.role,
    note,
  };
}

export let shareEngine: Engine | null = null;
export let shareWorld: Game['world'] | null = null;   // the share cards' staged photo (ShareStage.ts)

/** Wires photo mode's share key/button (called once from main.ts). */
export function installShare(game: Game, engine: Engine) {
  shareEngine = engine;   // share cards (ui/ShareCard.ts) photograph the player's aircraft
  shareWorld = game.world;
  game.photo.onShare = () => { void shareScreenshot(engine, shareStamp(game, 'Photo mode')); };
}

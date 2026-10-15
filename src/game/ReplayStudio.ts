import * as THREE from 'three';
import type { FilmLookSetting } from '../render/FilmParams';
import { MK_KILL, MK_MULTI, MK_BOSS, MK_ACE, MK_CLOSE, MK_NEAR } from './Recorder';

// Replay and photo mode 2.0 (Phase 11 goal 20): the pure parts of the theatre's new tools.
// Theatre.ts drives them; everything here is plain math / data so it is unit tested
// (tests/replayStudio.test.ts).
//
//   chase camera   chaseOffset(): behind and a little above the subject, along its flight path
//   slow motion    momentSpeed(): playback eases down to SLOWMO around every best moment
//   film looks     STUDIO_LOOKS / studioLook(): the theatre's own film stock ('auto' = Settings)
//   image cards    coverCrop() + drawCard(): a 1200x675 card (frame, title, moment, kills)
//   video clips    bestWindow() picks the best moment; pickVideoType() the MediaRecorder WebM type

export type StudioLook = 'auto' | FilmLookSetting;
export const STUDIO_LOOKS: StudioLook[] = ['auto', 'off', 'film', 'kodachrome', 'newsreel'];
export const LOOK_LABEL: Record<StudioLook, string> = {
  auto: 'As in Settings', off: 'Clean', film: 'Film', kodachrome: 'Kodachrome', newsreel: 'Newsreel B&W',
};
/** The film look to apply: the theatre's choice, or the player's Settings one for 'auto'. */
export const studioLook = (choice: StudioLook, settings?: string): string | undefined => (choice === 'auto' ? settings : choice);

// ---------------- slow motion ----------------

export const SLOWMO = 0.2;     // playback speed through a moment
const SLOW_BEFORE = 0.8;       // s before the mark the slow part starts
const SLOW_AFTER = 1.4;        // s after it ends
const RAMP = 0.6;              // s of easing on each side

const smooth = (x: number) => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u); };

/** Playback speed at replay time t: base, eased down to SLOWMO (never faster than base)
 *  around each mark time in times[0..n). No allocation (runs every frame). */
export function momentSpeed(t: number, times: ArrayLike<number>, n: number, base: number): number {
  const slow = Math.min(base, SLOWMO);
  let k = 0;   // 0 = full speed, 1 = fully slow
  for (let i = 0; i < n; i++) {
    const d = t - times[i];
    let w: number;
    if (d < -SLOW_BEFORE) w = smooth((d + SLOW_BEFORE + RAMP) / RAMP);
    else if (d <= SLOW_AFTER) w = 1;
    else w = smooth(1 - (d - SLOW_AFTER) / RAMP);
    if (w > k) k = w;
    if (k >= 1) break;
  }
  return base + (slow - base) * k;
}

// ---------------- best moment for a clip ----------------

export interface StudioMark { t: number; type: number; a?: number; label?: string }
export interface ClipWindow { start: number; end: number; label: string; score: number }

export const CLIP_BEFORE = 4;   // s of replay before the moment
export const CLIP_AFTER = 3;    // s after it
export const CLIP_MAX = 14;     // s of replay at most

/** How much a mark makes a moment worth clipping. */
export function markWeight(type: number, a = 0): number {
  switch (type) {
    case MK_BOSS: return 5;
    case MK_ACE: return 4;
    case MK_MULTI: return 1.5 + Math.max(2, a);
    case MK_CLOSE: return 1.5;
    case MK_NEAR: return 1;
    case MK_KILL: return 1;
    default: return 0.5;
  }
}

/** The replay span of the best moment: the mark whose window [t - 4 s, t + 3 s] holds the
 *  most weight (later wins ties, it is usually the climax). Without marks: the CLIP_BEFORE +
 *  CLIP_AFTER seconds around `at` (the playhead). Always inside [t0, t1]. */
export function bestWindow(marks: readonly StudioMark[], t0: number, t1: number, at: number): ClipWindow {
  let best: StudioMark | null = null, bestScore = 0;
  for (const m of marks) {
    let s = 0;
    for (const o of marks) if (o.t >= m.t - CLIP_BEFORE && o.t <= m.t + CLIP_AFTER) s += markWeight(o.type, o.a);
    if (s >= bestScore) { bestScore = s; best = m; }
  }
  const centre = best ? best.t : at;
  let start = centre - CLIP_BEFORE, end = centre + CLIP_AFTER;
  // later marks of the same fight (each within CLIP_BEFORE of the previous) extend it, up to CLIP_MAX
  if (best) {
    const later = marks.filter((o) => o.t > centre).sort((a, b) => a.t - b.t);
    let last = centre;
    for (const o of later) {
      if (o.t - last > CLIP_BEFORE || o.t + CLIP_AFTER - start > CLIP_MAX) break;
      last = o.t; end = o.t + CLIP_AFTER;
    }
  }
  if (start < t0) { end += t0 - start; start = t0; }
  if (end > t1) { start -= end - t1; end = t1; }
  start = Math.max(t0, start);
  return { start, end: Math.max(start, end), label: best?.label ?? 'Moment', score: bestScore };
}

// ---------------- video clips ----------------

export const VIDEO_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
export const CLIP_FPS = 30;
export const CLIP_BITRATE = 8_000_000;
/** s of real time a recording may run (slow motion stretches the replay span) */
export const CLIP_REAL_MAX = 40;

/** The first WebM type this browser's MediaRecorder can write ('' = none). */
export function pickVideoType(supported: (type: string) => boolean): string {
  for (const t of VIDEO_TYPES) { try { if (supported(t)) return t; } catch { /* */ } }
  return '';
}

/** sky-war-<kind>-<title>-<yyyymmdd-hhmmss>.<ext> */
export function studioFileName(kind: string, title: string, ext: string, d: Date): string {
  const z = (n: number) => String(n).padStart(2, '0');
  const slug = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').slice(0, 48).replace(/^-|-$/g, '');
  const stamp = `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
  return `sky-war-${kind}${slug ? `-${slug}` : ''}-${stamp}.${ext}`;
}

// ---------------- chase camera ----------------

/** Chase camera offset from the subject (world axes): behind along fwd, raised along up.
 *  Big aircraft (radius) get a longer lead. Writes out and returns it. */
export function chaseOffset(fwd: THREE.Vector3, up: THREE.Vector3, radius: number, out: THREE.Vector3): THREE.Vector3 {
  const dist = Math.max(18, radius * 3.2);
  return out.copy(fwd).multiplyScalar(-dist).addScaledVector(up, dist * 0.26);
}

// ---------------- image cards ----------------

export const CARD_W = 1200;
export const CARD_H = 675;

/** Source rectangle [sx, sy, sw, sh] that fills a dw x dh card from a sw x sh frame (cover crop, centred). */
export function coverCrop(sw: number, sh: number, dw: number, dh: number): [number, number, number, number] {
  const k = Math.min(sw / dw, sh / dh);
  const w = dw * k, h = dh * k;
  return [(sw - w) / 2, (sh - h) / 2, w, h];
}

export interface CardInfo {
  game: string;      // game name (kept in Latin letters, it is the brand)
  title: string;     // recording title, already translated
  moment: string;    // moment label, already translated
  stats: string;     // "3 kills in this replay", already translated
  look: string;      // film stock, already translated
  url: string;
  rtl: boolean;
}

/** Draws the card's frame and text over the already drawn image (ctx is CARD_W x CARD_H). */
export function drawCard(ctx: CanvasRenderingContext2D, c: CardInfo) {
  const W = CARD_W, H = CARD_H, pad = 40;
  // darken the bottom for the text, a thin khaki frame around the picture
  const g = ctx.createLinearGradient(0, H * 0.52, 0, H);
  g.addColorStop(0, 'rgba(10,12,8,0)');
  g.addColorStop(0.55, 'rgba(10,12,8,0.6)');
  g.addColorStop(1, 'rgba(10,12,8,0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H * 0.52, W, H * 0.48);
  ctx.strokeStyle = 'rgba(201,183,122,0.85)';
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.direction = c.rtl ? 'rtl' : 'ltr';
  const start = c.rtl ? W - pad - 10 : pad + 10, end = c.rtl ? pad + 10 : W - pad - 10;
  ctx.textAlign = 'start';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 8;
  // kicker: the moment, on a red tab
  ctx.font = '600 20px "IBM Plex Mono", "IBM Plex Sans Arabic", monospace';
  const kw = ctx.measureText(c.moment).width + 28;
  ctx.fillStyle = 'rgba(217,87,63,0.92)';
  ctx.fillRect(c.rtl ? start - kw : start, H - 214, kw, 36);
  ctx.fillStyle = '#f2ead3';
  ctx.fillText(c.moment, c.rtl ? start - 14 : start + 14, H - 188);
  ctx.font = '700 54px Oswald, "IBM Plex Sans Arabic", "Arial Narrow", sans-serif';
  ctx.fillText(c.title, start, H - 116, W - pad * 2 - 20);
  ctx.font = '400 22px "IBM Plex Mono", "IBM Plex Sans Arabic", monospace';
  ctx.fillStyle = 'rgba(242,234,211,0.85)';
  ctx.fillText(`${c.stats} · ${c.look}`, start, H - 76, W - pad * 2 - 20);
  // brand along the bottom edge
  ctx.direction = 'ltr';
  ctx.textAlign = c.rtl ? 'right' : 'left';
  ctx.font = '700 26px Oswald, "Arial Narrow", sans-serif';
  ctx.fillStyle = '#c9b77a';
  ctx.fillText(c.game.toUpperCase(), c.rtl ? W - pad - 10 : pad + 10, H - 36);
  ctx.textAlign = c.rtl ? 'left' : 'right';
  ctx.font = '400 16px "IBM Plex Mono", monospace';
  ctx.fillStyle = 'rgba(242,234,211,0.65)';
  ctx.fillText(c.url.replace(/^https:\/\//, '').replace(/\/$/, ''), end, H - 38);
  ctx.shadowBlur = 0;
}

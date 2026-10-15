// Gun sight styles: the gunner's reticle as an unlockable (Gunner Mastery, Mastery.ts). One
// style is active at a time. It is drawn by the HUD hip reticle (waist guns, top turret:
// GameHud) and on the ball turret's reflector glass (Viewmodels.buildTurret, built once per
// mission). Pure canvas drawing: no three.js, no allocations beyond the colour string the old
// reticle already built each frame.

export type SightId = 'ring' | 'mk9' | 'crosshair' | 'k14' | 'chevron' | 'tracer' | 'deflection';

export interface SightDef {
  id: SightId;
  name: string;
  desc: string;
  rgb: [number, number, number];   // HUD colour (0..255)
  glass: [number, number, number]; // reflector tint (HDR multiplier on a white reticle)
}

export const SIGHTS: SightDef[] = [
  { id: 'ring', name: 'Standard Ring', desc: 'Issue ring with four ticks and a centre dot.', rgb: [255, 236, 190], glass: [3, 1.6, 0.6] },
  { id: 'mk9', name: 'Mk IX Reflector', desc: 'Two rings for range and a fine centre dot, in amber.', rgb: [255, 196, 92], glass: [3, 1.9, 0.5] },
  { id: 'crosshair', name: 'Fine Crosshair', desc: 'Thin cross with range ticks, nothing else in the way.', rgb: [235, 245, 255], glass: [2.2, 2.4, 2.8] },
  { id: 'k14', name: 'Gyro K-14', desc: 'Six diamonds round a centre pipper, like the fighters carry.', rgb: [255, 120, 96], glass: [3.2, 1.0, 0.7] },
  { id: 'chevron', name: 'Ace\'s Chevron', desc: 'A gold chevron over the aim point and a short ring.', rgb: [244, 206, 96], glass: [3, 2.3, 0.6] },
  { id: 'tracer', name: 'Tracer Dot', desc: 'A bright green dot in a broken ring.', rgb: [140, 255, 150], glass: [1.0, 3.0, 1.2] },
  { id: 'deflection', name: 'Deflection Rings', desc: 'Inner and outer lead rings with crossing-speed ticks.', rgb: [150, 220, 255], glass: [1.2, 2.2, 3.2] },
];

const BY_ID = new Map<string, SightDef>(SIGHTS.map((s) => [s.id, s]));
export const sightDef = (id: string): SightDef => BY_ID.get(id) ?? SIGHTS[0];
export const isSightId = (id: unknown): id is SightId => typeof id === 'string' && BY_ID.has(id);

// The active style (MasteryWatch keeps it in step with the player's choice)
let active: SightDef = SIGHTS[0];
export const activeSight = (): SightDef => active;
export function setActiveSight(id: string) { active = sightDef(id); }

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

function ring(g: G, x: number, y: number, r: number) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); }
function dot(g: G, x: number, y: number, r: number) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
function line(g: G, x0: number, y0: number, x1: number, y1: number) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }

// The reticle shape at (x, y) with outer radius r. Stroke / fill style and line width are set
// by the caller; `w` is the base line width (thin features use a fraction of it).
export function drawReticleShape(g: G, id: SightId, x: number, y: number, r: number, w: number) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  switch (id) {
    case 'mk9':
      ring(g, x, y, r);
      g.lineWidth = w * 0.7; ring(g, x, y, r * 0.5); g.lineWidth = w;
      for (const [dx, dy] of DIRS) line(g, x + dx * r * 0.88, y + dy * r * 0.88, x + dx * r * 1.12, y + dy * r * 1.12);
      dot(g, x, y, w * 1.1);
      break;
    case 'crosshair':
      g.lineWidth = w * 0.75;
      line(g, x - r * 1.1, y, x - r * 0.12, y); line(g, x + r * 0.12, y, x + r * 1.1, y);
      line(g, x, y - r * 1.1, x, y - r * 0.12); line(g, x, y + r * 0.12, x, y + r * 1.1);
      for (const k of [0.4, 0.7]) for (const [dx, dy] of DIRS) {
        const px = x + dx * r * k, py = y + dy * r * k, t = r * 0.07;
        line(g, px - dy * t, py - dx * t, px + dy * t, py + dx * t);
      }
      g.lineWidth = w;
      break;
    case 'k14':
      g.lineWidth = w * 0.6; ring(g, x, y, r * 0.95); g.lineWidth = w;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU - Math.PI / 2, px = x + Math.cos(a) * r * 0.95, py = y + Math.sin(a) * r * 0.95, s = r * 0.1;
        g.beginPath(); g.moveTo(px, py - s); g.lineTo(px + s, py); g.lineTo(px, py + s); g.lineTo(px - s, py); g.closePath(); g.fill();
      }
      dot(g, x, y, w * 1.3);
      line(g, x - r * 0.18, y, x - r * 0.06, y); line(g, x + r * 0.06, y, x + r * 0.18, y);
      break;
    case 'chevron':
      g.beginPath(); g.moveTo(x - r * 0.42, y + r * 0.34); g.lineTo(x, y + r * 0.06); g.lineTo(x + r * 0.42, y + r * 0.34); g.stroke();
      g.beginPath(); g.arc(x, y, r * 0.85, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
      g.beginPath(); g.arc(x, y, r * 0.85, Math.PI * 0.2, Math.PI * 0.8); g.stroke();
      dot(g, x, y, w * 1.1);
      break;
    case 'tracer':
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.3; g.beginPath(); g.arc(x, y, r * 0.75, a, a + 0.97); g.stroke(); }
      dot(g, x, y, w * 2.2);
      break;
    case 'deflection':
      ring(g, x, y, r); g.lineWidth = w * 0.7; ring(g, x, y, r * 0.55); g.lineWidth = w;
      for (const [dx, dy] of DIRS) {
        line(g, x + dx * r * 0.55, y + dy * r * 0.55, x + dx * r * 0.7, y + dy * r * 0.7);
        line(g, x + dx * r, y + dy * r, x + dx * r * 1.18, y + dy * r * 1.18);
      }
      for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; dot(g, x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78, w * 0.8); }
      dot(g, x, y, w);
      break;
    default:   // 'ring': the original hip reticle
      ring(g, x, y, r);
      for (const [dx, dy] of DIRS) line(g, x + dx * r * 0.45, y + dy * r * 0.45, x + dx * r * 0.85, y + dy * r * 0.85);
      dot(g, x, y, 1.8);
  }
}

// HUD hip reticle (GameHud): `a` is the opacity
export function drawHudSight(g: G, x: number, y: number, r: number, a: number, s: SightDef = active) {
  g.save();
  g.strokeStyle = `rgba(${s.rgb[0]},${s.rgb[1]},${s.rgb[2]},${a})`; g.fillStyle = g.strokeStyle; g.lineWidth = 1.5;
  g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 3;
  drawReticleShape(g, s.id, x, y, r, 1.5);
  g.restore();
}

// Reflector glass texture (Viewmodels.buildTurret): the standard style keeps its original
// orange drawing; the others are drawn white and tinted by the glass material's colour.
export function drawReflectorSight(g: G, size: number, s: SightDef = active) {
  const c = size / 2;
  g.clearRect(0, 0, size, size);
  if (s.id === 'ring') {
    g.strokeStyle = 'rgba(255,140,40,1)'; g.lineWidth = 3;
    const k = size / 256;
    g.beginPath(); g.arc(c, c, 90 * k, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(255,140,40,1)';
    g.beginPath(); g.arc(c, c, 5 * k, 0, TAU); g.fill();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.fillRect(c + dx * 100 * k - 2 * k, c + dy * 100 * k - 2 * k, (dx ? 20 * dx : 4) * k, (dy ? 20 * dy : 4) * k);
    return;
  }
  g.strokeStyle = 'rgba(255,255,255,1)'; g.fillStyle = 'rgba(255,255,255,1)'; g.lineWidth = 3;
  drawReticleShape(g, s.id, c, c, size * 0.36, 3);
}

// Preview thumbnail for the Locker (data URL, cached)
const thumbs = new Map<string, string>();
export function sightThumb(id: string): string {
  const hit = thumbs.get(id);
  if (hit) return hit;
  if (typeof document === 'undefined') return '';
  const cv = document.createElement('canvas');
  cv.width = cv.height = 96;
  const g = cv.getContext('2d');
  if (!g) return '';
  g.fillStyle = '#26332f'; g.fillRect(0, 0, 96, 96);
  const grd = g.createLinearGradient(0, 0, 0, 96); grd.addColorStop(0, 'rgba(160,190,205,0.35)'); grd.addColorStop(1, 'rgba(20,30,28,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 96, 96);
  const s = sightDef(id);
  g.strokeStyle = `rgb(${s.rgb.join(',')})`; g.fillStyle = g.strokeStyle; g.lineWidth = 2;
  g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 3;
  drawReticleShape(g, s.id, 48, 48, 30, 2);
  const url = cv.toDataURL('image/png');
  thumbs.set(id, url);
  return url;
}

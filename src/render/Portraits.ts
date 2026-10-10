// Procedural crew portraits: a simple stylised head-and-shoulders drawn on a canvas
// (skin, hair, headgear, jacket, a few facial features). No external images.
// portraitUrl() draws once per look and caches the data URL for <img> tags.

export type Headgear = 'crush' | 'helmet' | 'garrison' | 'cap' | 'none';
export type Jacket = 'a2' | 'b3' | 'olive';

export interface PortraitLook {
  skin: string;        // face colour
  hair: string;        // hair (and brows / moustache) colour
  hat: Headgear;
  hatColor?: string;   // body of the cap / helmet
  jacket: Jacket;
  bg: string;          // background disc
  jaw?: number;        // 0.85 narrow .. 1.15 broad
  brows?: number;      // brow tilt: -1 worried .. 1 stern
  smile?: number;      // -1 frown .. 1 grin
  moustache?: boolean;
  stubble?: boolean;
  freckles?: boolean;
  goggles?: boolean;   // flying goggles up on the helmet
  rookie?: boolean;    // grey-washed background, no insignia
  insignia?: 'bars' | 'chevrons' | 'eagle';
}

const cache = new Map<string, string>();

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function ellipse(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string) {
  g.fillStyle = fill;
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
}

// Draw a portrait into a square of side s at (0,0)
export function drawPortrait(g: CanvasRenderingContext2D, L: PortraitLook, s: number) {
  g.save();
  g.scale(s / 100, s / 100);
  const jaw = L.jaw ?? 1, smile = L.smile ?? 0, brows = L.brows ?? 0;

  // background disc (a squadron colour), clipped so everything stays inside
  g.beginPath(); g.arc(50, 50, 49, 0, Math.PI * 2); g.closePath();
  const bgr = g.createRadialGradient(42, 36, 6, 50, 50, 52);
  bgr.addColorStop(0, shade(L.bg, 0.25)); bgr.addColorStop(1, shade(L.bg, -0.35));
  g.fillStyle = L.rookie ? '#5d5f58' : bgr;
  g.fill();
  g.clip();

  // shoulders and jacket
  const jc = L.jacket === 'a2' ? '#6b4128' : L.jacket === 'b3' ? '#5a3a22' : '#4f5432';
  g.fillStyle = jc;
  g.beginPath();
  g.moveTo(8, 104); g.quadraticCurveTo(12, 76, 34, 72); g.lineTo(66, 72); g.quadraticCurveTo(88, 76, 92, 104); g.closePath(); g.fill();
  // collar: sheepskin (B-3) or shirt and tie
  if (L.jacket === 'b3') {
    g.fillStyle = '#e6d6b4';
    g.beginPath(); g.moveTo(30, 72); g.lineTo(50, 92); g.lineTo(70, 72); g.lineTo(76, 84); g.lineTo(50, 100); g.lineTo(24, 84); g.closePath(); g.fill();
  } else {
    g.fillStyle = L.jacket === 'olive' ? '#8b8a62' : '#8f8466';
    g.beginPath(); g.moveTo(38, 72); g.lineTo(50, 88); g.lineTo(62, 72); g.closePath(); g.fill();
    g.fillStyle = '#3d3a26';
    g.beginPath(); g.moveTo(48, 80); g.lineTo(52, 80); g.lineTo(53, 98); g.lineTo(47, 98); g.closePath(); g.fill();
    g.strokeStyle = shade(jc, -0.35); g.lineWidth = 2;
    g.beginPath(); g.moveTo(36, 72); g.lineTo(46, 90); g.moveTo(64, 72); g.lineTo(54, 90); g.stroke();
  }
  // rank on the shoulder
  if (!L.rookie && L.insignia) {
    if (L.insignia === 'chevrons') {
      g.strokeStyle = '#d8c58a'; g.lineWidth = 2;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(14, 90 + i * 4); g.lineTo(20, 85 + i * 4); g.lineTo(26, 90 + i * 4); g.stroke(); }
    } else if (L.insignia === 'bars') {
      g.fillStyle = '#d9d4c4'; g.fillRect(70, 80, 10, 3); g.fillRect(70, 85, 10, 3);
    } else {
      g.fillStyle = '#e1c560'; g.fillRect(70, 81, 10, 3);
    }
  }

  // neck and head
  ellipse(g, 50, 70, 10, 9, shade(L.skin, -0.18));
  g.fillStyle = L.skin;
  g.beginPath();
  g.ellipse(50, 48, 20 * jaw, 25, 0, 0, Math.PI * 2); g.fill();
  // ears
  ellipse(g, 50 - 20 * jaw, 50, 3.5, 6, shade(L.skin, -0.08));
  ellipse(g, 50 + 20 * jaw, 50, 3.5, 6, shade(L.skin, -0.08));
  // cheek shadow
  g.fillStyle = 'rgba(0,0,0,0.08)';
  g.beginPath(); g.ellipse(50, 60, 17 * jaw, 12, 0, 0, Math.PI); g.fill();
  if (L.stubble) {
    g.fillStyle = 'rgba(40,30,20,0.22)';
    g.beginPath(); g.ellipse(50, 62, 15 * jaw, 10, 0, 0.1, Math.PI - 0.1); g.fill();
  }
  if (L.freckles) {
    g.fillStyle = 'rgba(150,80,40,0.45)';
    for (const [x, y] of [[40, 54], [43, 56], [38, 57], [60, 54], [57, 56], [62, 57]]) { g.beginPath(); g.arc(x, y, 0.9, 0, Math.PI * 2); g.fill(); }
  }

  // hair at the sides (and on top when bareheaded)
  g.fillStyle = L.hair;
  if (L.hat === 'none') {
    g.beginPath(); g.ellipse(50, 33, 21 * jaw, 13, 0, Math.PI, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(30, 34); g.quadraticCurveTo(46, 22, 70, 34); g.quadraticCurveTo(52, 30, 30, 38); g.fill();
  } else {
    g.fillRect(50 - 21 * jaw, 36, 4, 12); g.fillRect(50 + 21 * jaw - 4, 36, 4, 12);
  }

  // eyes, brows, nose, mouth
  for (const sx of [-1, 1]) {
    const ex = 50 + sx * 8;
    ellipse(g, ex, 46, 3.4, 2.4, '#f4efe4');
    ellipse(g, ex, 46.3, 1.7, 1.9, '#2b2219');
    g.strokeStyle = L.hair; g.lineWidth = 2.2; g.lineCap = 'round';
    // inner end lower for a stern look, higher for a worried one
    g.beginPath(); g.moveTo(ex - 4 * sx, 40 + brows * 1.5); g.lineTo(ex + 4 * sx, 40 - brows * 0.5); g.stroke();
  }
  g.strokeStyle = shade(L.skin, -0.3); g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(50, 47); g.lineTo(48, 56); g.lineTo(51.5, 57); g.stroke();
  if (L.moustache) {
    g.fillStyle = L.hair;
    g.beginPath(); g.ellipse(50, 60.5, 7, 2.2, 0, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = '#6e3a2c'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(44, 64 - smile * 0.5); g.quadraticCurveTo(50, 64 + smile * 3.5, 56, 64 - smile * 0.5); g.stroke();

  // headgear
  const hc = L.hatColor ?? (L.hat === 'helmet' ? '#5b3a24' : L.hat === 'cap' ? '#4a5a3a' : '#5a5d3c');
  if (L.hat === 'crush') {
    // officer's "fifty-mission crush" cap: soft crown, brown visor, gold badge
    g.fillStyle = hc;
    g.beginPath(); g.ellipse(50, 26, 27, 9, -0.05, 0, Math.PI * 2); g.fill();
    g.fillStyle = shade(hc, -0.25); g.fillRect(29, 26, 42, 7);
    g.fillStyle = '#3a2416';
    g.beginPath(); g.ellipse(50, 34, 21, 4.5, 0, 0, Math.PI); g.fill();
    ellipse(g, 50, 28, 3.6, 3.2, '#d8b84e');
  } else if (L.hat === 'helmet') {
    // leather flying helmet with ear flaps
    g.fillStyle = hc;
    g.beginPath(); g.ellipse(50, 36, 23 * jaw, 20, 0, Math.PI, Math.PI * 2); g.fill();
    g.fillRect(50 - 23 * jaw, 35, 7, 22); g.fillRect(50 + 23 * jaw - 7, 35, 7, 22);
    g.strokeStyle = shade(hc, -0.35); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(50, 16); g.lineTo(50, 34); g.stroke();
    if (L.goggles) {
      g.fillStyle = '#2a2a2a'; g.fillRect(29, 28, 42, 4);
      for (const x of [41, 59]) { ellipse(g, x, 30, 7, 5, '#3c3c3c'); ellipse(g, x, 30, 5, 3.4, '#9fb8c8'); }
    }
  } else if (L.hat === 'garrison') {
    g.fillStyle = hc;
    g.beginPath(); g.moveTo(30, 32); g.lineTo(34, 20); g.lineTo(68, 22); g.lineTo(70, 32); g.closePath(); g.fill();
    g.strokeStyle = shade(hc, -0.3); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(32, 26); g.lineTo(68, 27); g.stroke();
  } else if (L.hat === 'cap') {
    g.fillStyle = hc;
    g.beginPath(); g.ellipse(50, 30, 22, 13, 0, Math.PI, Math.PI * 2); g.fill();
    g.fillRect(28, 29, 44, 4);
    g.fillStyle = shade(hc, -0.3);
    g.beginPath(); g.ellipse(56, 33, 18, 3.5, 0.05, 0, Math.PI); g.fill();
  }

  // rim
  g.restore();
  g.save();
  g.scale(s / 100, s / 100);
  g.strokeStyle = L.rookie ? 'rgba(220,220,210,0.35)' : 'rgba(233,226,207,0.55)';
  g.lineWidth = 2;
  g.beginPath(); g.arc(50, 50, 48, 0, Math.PI * 2); g.stroke();
  g.restore();
}

// Data URL of a portrait (cached per look and size)
export function portraitUrl(look: PortraitLook, size = 64): string {
  const key = JSON.stringify(look) + '|' + size;
  let url = cache.get(key);
  if (url) return url;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) return '';
  drawPortrait(g, look, size);
  url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

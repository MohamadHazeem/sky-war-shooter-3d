import * as THREE from 'three';
import { mulberry } from './Particles';

// Inner skin of the B-17 fuselage for the interior 2.0 (Phase 10 goal 07): bare 24ST aluminium
// sheet, each panel its own shade (mill finish, some milky with corrosion-proofing, some
// polished by hands and boots), zinc-chromate overspray along the frames, lap joints with
// double rivet rows on the stringer and former lines, single rows between, oil-canning on the
// panels, scuffs, grime streaks, stencils.
// One tile = 4 formers (1.92 m) along the fuselage x 4 stringers (0.8 rad) round it; the UVs
// are written by skinUv() to put the rivet lines on the Blender structure's members
// (tools/interior/build_interior.py: formers every 0.48 m from z0 + 0.25, stringers every 0.2 rad).

export const SKIN_TILE_Z = 1.92, SKIN_TILE_T = 0.8;
let set: { map: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture } | null = null;

function canvas(s: number) {
  const c = document.createElement('canvas');
  c.width = c.height = s;
  return { c, g: c.getContext('2d', { willReadFrequently: true })! };
}

export function interiorSkinTextures() {
  if (set) return set;
  const S = 1024, Q = S / 4;     // Q px between rivet lines (one member spacing)
  const rnd = mulberry(1943);
  const col = canvas(S), hgt = canvas(S), rgh = canvas(S);
  col.g.fillStyle = '#8d9092'; col.g.fillRect(0, 0, S, S);
  hgt.g.fillStyle = '#808080'; hgt.g.fillRect(0, 0, S, S);
  rgh.g.fillStyle = '#7a7a7a'; rgh.g.fillRect(0, 0, S, S);
  // panels: 2 x 2 member spacings each, own tint and finish; oil-canning bulge in the height
  for (let py = 0; py < 2; py++) for (let px = 0; px < 2; px++) {
    const x0 = px * 2 * Q, y0 = py * 2 * Q, w = 2 * Q, h = 2 * Q;
    const tone = 120 + Math.floor(rnd() * 50), warm = Math.floor(rnd() * 8);
    col.g.fillStyle = `rgb(${tone + warm},${tone + warm + 2},${tone + 5})`;
    col.g.fillRect(x0, y0, w, h);
    const r = 85 + Math.floor(rnd() * 70);
    rgh.g.fillStyle = `rgb(${r},${r},${r})`;
    rgh.g.fillRect(x0, y0, w, h);
    const grd = hgt.g.createRadialGradient(x0 + w / 2, y0 + h / 2, 0, x0 + w / 2, y0 + h / 2, w * 0.6);
    grd.addColorStop(0, rnd() < 0.5 ? '#8c8c8c' : '#747474'); grd.addColorStop(1, '#808080');
    hgt.g.fillStyle = grd; hgt.g.fillRect(x0, y0, w, h);
  }
  // mill streaks along the rolling direction (round the fuselage: u)
  for (let i = 0; i < 900; i++) {
    const y = rnd() * S, x = rnd() * S, l = 30 + rnd() * 220;
    col.g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '40,40,40'},${0.025 + rnd() * 0.04})`;
    col.g.fillRect(x, y, l, 1 + rnd() * 1.5);
  }
  // zinc-chromate overspray along the former lines (v) and on the stringer lines (u), patchy
  for (let k = 0; k < 4; k++) for (let i = 0; i < 26; i++) {
    const y = k * Q + (rnd() - 0.5) * 26, x = rnd() * S, r = 18 + rnd() * 50;
    const g = col.g.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(150,160,70,${0.18 + rnd() * 0.2})`); g.addColorStop(1, 'rgba(150,160,70,0)');
    col.g.fillStyle = g; col.g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // grime and oil smears, fingerprints round the middle of the panels, scuffs
  for (let i = 0; i < 160; i++) {
    const x = rnd() * S, y = rnd() * S, r = 10 + rnd() * 70;
    const g = col.g.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(30,26,18,${0.06 + rnd() * 0.12})`); g.addColorStop(1, 'rgba(30,26,18,0)');
    col.g.fillStyle = g; col.g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  col.g.lineCap = 'round';
  for (let i = 0; i < 220; i++) {
    const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI, l = 8 + rnd() * 60;
    col.g.strokeStyle = `rgba(${rnd() < 0.6 ? '210,212,214' : '35,33,28'},${0.12 + rnd() * 0.2})`;
    col.g.lineWidth = 0.6 + rnd() * 1.2;
    col.g.beginPath(); col.g.moveTo(x, y); col.g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); col.g.stroke();
  }
  // lap joints: a step in the height and a dark sealant line, on every other member line
  for (let k = 0; k < 4; k += 2) {
    const p = k * Q;
    for (const [ctx, style, w] of [[col.g, 'rgba(25,24,20,0.55)', 2], [hgt.g, '#9a9a9a', 6]] as const) {
      ctx.fillStyle = style;
      ctx.fillRect(p - 1, 0, w, S);
      ctx.fillRect(0, p - 1, S, w);
    }
  }
  // rivets: universal-head domes; double rows on the lap lines, single rows on the others
  const rivet = (x: number, y: number) => {
    const g1 = hgt.g.createRadialGradient(x, y, 0, x, y, 3.2);
    g1.addColorStop(0, '#d8d8d8'); g1.addColorStop(0.7, '#a8a8a8'); g1.addColorStop(1, 'rgba(128,128,128,0)');
    hgt.g.fillStyle = g1; hgt.g.fillRect(x - 4, y - 4, 8, 8);
    const g2 = col.g.createRadialGradient(x - 0.6, y - 0.6, 0, x, y, 3.4);
    g2.addColorStop(0, 'rgba(220,222,224,0.7)'); g2.addColorStop(0.6, 'rgba(120,120,115,0.5)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
    col.g.fillStyle = g2; col.g.fillRect(x - 4, y - 4, 8, 8);
  };
  const pitch = 13;
  for (let k = 0; k < 4; k++) {
    const p = k * Q, rows = k % 2 === 0 ? [-6, 7] : [0];
    for (const o of rows) for (let t = 4; t < S; t += pitch) { rivet(p + o, t); rivet(t, p + o); }
  }
  // stencils
  col.g.fillStyle = 'rgba(30,30,26,0.6)';
  col.g.font = 'bold 15px monospace';
  col.g.fillText('STA. 6', 2 * Q + 40, 3 * Q + 60);
  col.g.fillText('DO NOT STEP', Q + 30, 0.5 * Q);
  col.g.fillStyle = 'rgba(160,20,15,0.55)';
  col.g.fillText('OXYGEN', 3 * Q + 30, 1.5 * Q);

  const map = new THREE.CanvasTexture(col.c);
  map.colorSpace = THREE.SRGBColorSpace;
  const normal = new THREE.CanvasTexture(normalFromHeight(hgt.c, 4));
  const rough = new THREE.CanvasTexture(rgh.c);
  for (const t of [map, normal, rough]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  set = { map, normal, rough };
  return set;
}

function normalFromHeight(src: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const hd = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const { c, g } = canvas(w);
  const out = g.createImageData(w, h);
  const H = (x: number, y: number) => hd[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    out.data[i] = (-dx / l * 0.5 + 0.5) * 255; out.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return c;
}

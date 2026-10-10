import * as THREE from 'three';
import { mulberry } from './Particles';

// Procedural material textures (canvas generated, cached).

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d')! };
}

// Height (0..255 grey) -> tangent-space normal map
function normalFromHeight(src: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const hd = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const { c, g } = canvas(w, h);
  const out = g.createImageData(w, h);
  const H = (x: number, y: number) => hd[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = (-dx / l * 0.5 + 0.5) * 255;
      out.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
      out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  g.putImageData(out, 0, 0);
  return c;
}

let interiorSet: { map: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture } | null = null;

// Riveted aluminium skin painted in faded olive / zinc chromate, with panel seams,
// stringer shadows, chipped paint and grime.
export function interiorTextures() {
  if (interiorSet) return interiorSet;
  const S = 1024;
  const rnd = mulberry(91);
  const col = canvas(S, S), hgt = canvas(S, S), rgh = canvas(S, S);
  // base paint with mottling
  col.g.fillStyle = '#3b3d27'; col.g.fillRect(0, 0, S, S);
  hgt.g.fillStyle = '#808080'; hgt.g.fillRect(0, 0, S, S);
  rgh.g.fillStyle = '#c8c8c8'; rgh.g.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * S, y = rnd() * S, r = 20 + rnd() * 120;
    const grd = col.g.createRadialGradient(x, y, 0, x, y, r);
    const light = rnd() < 0.5;
    grd.addColorStop(0, light ? 'rgba(92,94,62,0.18)' : 'rgba(30,28,18,0.2)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    col.g.fillStyle = grd; col.g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // panels: seams every 256 px horizontally, 192 px vertically (staggered)
  const seamsX = [0, 256, 512, 768], seamsY = [0, 192, 384, 576, 768, 960];
  col.g.strokeStyle = 'rgba(10,10,6,0.85)'; col.g.lineWidth = 3;
  hgt.g.strokeStyle = '#303030'; hgt.g.lineWidth = 4;
  for (const x of seamsX) { for (const c of [col.g, hgt.g]) { c.beginPath(); c.moveTo(x + 1, 0); c.lineTo(x + 1, S); c.stroke(); } }
  for (const y of seamsY) { for (const c of [col.g, hgt.g]) { c.beginPath(); c.moveTo(0, y + 1); c.lineTo(S, y + 1); c.stroke(); } }
  // rivet rows along seams
  const rivet = (x: number, y: number) => {
    const g1 = col.g.createRadialGradient(x - 1, y - 1, 0, x, y, 4);
    g1.addColorStop(0, 'rgba(150,150,120,0.75)'); g1.addColorStop(0.6, 'rgba(70,70,50,0.6)'); g1.addColorStop(1, 'rgba(0,0,0,0)');
    col.g.fillStyle = g1; col.g.fillRect(x - 5, y - 5, 10, 10);
    const g2 = hgt.g.createRadialGradient(x, y, 0, x, y, 4);
    g2.addColorStop(0, '#d0d0d0'); g2.addColorStop(1, 'rgba(128,128,128,0)');
    hgt.g.fillStyle = g2; hgt.g.fillRect(x - 5, y - 5, 10, 10);
  };
  for (const x of seamsX) for (let y = 6; y < S; y += 16) { rivet(x + 9, y); rivet(x - 7 + S, y); }
  for (const y of seamsY) for (let x = 6; x < S; x += 16) { rivet(x, y + 9); rivet(x, y - 7 + S); }
  // chipped paint revealing bare aluminium / zinc chromate primer
  for (let i = 0; i < 140; i++) {
    const x = rnd() * S, y = rnd() * S, r = 0.6 + rnd() * 2.5;
    col.g.fillStyle = rnd() < 0.6 ? 'rgba(120,122,112,0.32)' : 'rgba(100,108,52,0.3)';
    col.g.beginPath(); col.g.ellipse(x, y, r * (1 + rnd() * 2), r, rnd() * 3, 0, Math.PI * 2); col.g.fill();
    rgh.g.fillStyle = 'rgba(90,90,90,0.8)'; rgh.g.beginPath(); rgh.g.arc(x, y, r * 1.5, 0, Math.PI * 2); rgh.g.fill();
  }
  // scratches
  col.g.strokeStyle = 'rgba(140,140,120,0.25)'; col.g.lineWidth = 1;
  for (let i = 0; i < 160; i++) {
    const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI, l = 10 + rnd() * 50;
    col.g.beginPath(); col.g.moveTo(x, y); col.g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); col.g.stroke();
  }
  // stencilled lettering patches
  col.g.fillStyle = 'rgba(200,190,150,0.35)'; col.g.font = 'bold 18px monospace';
  col.g.fillText('DO NOT STEP', 300, 470); col.g.fillText('OXYGEN', 620, 230); col.g.fillText('AMMO 600 RDS', 80, 860);
  const map = new THREE.CanvasTexture(col.c);
  map.colorSpace = THREE.SRGBColorSpace;
  const normal = new THREE.CanvasTexture(normalFromHeight(hgt.c, 3));
  const rough = new THREE.CanvasTexture(rgh.c);
  for (const t of [map, normal, rough]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  interiorSet = { map, normal, rough };
  return interiorSet;
}

let gunSet: { map: THREE.Texture; rough: THREE.Texture; normal: THREE.Texture } | null = null;

// Parkerised steel: fine grain, edge wear, oil sheen variation
export function gunTextures() {
  if (gunSet) return gunSet;
  const S = 256;
  const rnd = mulberry(17);
  const col = canvas(S, S), rgh = canvas(S, S), hgt = canvas(S, S);
  const img = col.g.createImageData(S, S), rimg = rgh.g.createImageData(S, S), himg = hgt.g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const n = rnd();
    const v = 36 + n * 16;
    img.data[i * 4] = v; img.data[i * 4 + 1] = v + 2; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    const r = 150 + rnd() * 70;
    rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = r; rimg.data[i * 4 + 3] = 255;
    himg.data[i * 4] = himg.data[i * 4 + 1] = himg.data[i * 4 + 2] = 120 + n * 20; himg.data[i * 4 + 3] = 255;
  }
  col.g.putImageData(img, 0, 0); rgh.g.putImageData(rimg, 0, 0); hgt.g.putImageData(himg, 0, 0);
  // worn, polished patches
  for (let i = 0; i < 30; i++) {
    const x = rnd() * S, y = rnd() * S, r = 4 + rnd() * 16;
    const grd = col.g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(120,124,120,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    col.g.fillStyle = grd; col.g.fillRect(x - r, y - r, r * 2, r * 2);
    rgh.g.fillStyle = 'rgba(60,60,60,0.5)'; rgh.g.beginPath(); rgh.g.arc(x, y, r * 0.7, 0, Math.PI * 2); rgh.g.fill();
  }
  const map = new THREE.CanvasTexture(col.c); map.colorSpace = THREE.SRGBColorSpace;
  const rough = new THREE.CanvasTexture(rgh.c);
  const normal = new THREE.CanvasTexture(normalFromHeight(hgt.c, 1.5));
  for (const t of [map, rough, normal]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  gunSet = { map, rough, normal };
  return gunSet;
}

let holeTex: THREE.Texture | null = null;
// Bullet hole seen from inside: torn metal ring around a pinpoint of daylight
export function bulletHoleTexture() {
  if (holeTex) return holeTex;
  const S = 64;
  const { c, g } = canvas(S, S);
  const rnd = mulberry(5);
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(8,8,6,0.9)';
  g.beginPath();
  for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI * 2, r = S * (0.3 + rnd() * 0.16); g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); }
  g.fill();
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.2);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.6, 'rgba(255,250,235,0.9)'); grd.addColorStop(1, 'rgba(255,240,220,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(S / 2, S / 2, S * 0.2, 0, Math.PI * 2); g.fill();
  holeTex = new THREE.CanvasTexture(c);
  holeTex.colorSpace = THREE.SRGBColorSpace;
  return holeTex;
}

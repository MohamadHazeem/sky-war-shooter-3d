import { registerHeroMaterial } from '../world/HeroTextures';
import * as THREE from 'three';
import { markOwned } from './Dispose';
import type { Rarity } from '../game/WeaponMods';

// Paint schemes for the player's B-17. The model's skin ('GD-L' material) is an olive drab
// texture with a grey underside; a scheme recolours that texture on a canvas (keeping the
// panel lines, shading and markings) and the player's ship gets its own material copy with
// the new map. Materials are shared between all bombers, so only clones are ever touched.

export interface PaintDef { id: string; name: string; desc: string; rarity: Rarity; free?: boolean; swatch: string }

export const PAINTS: PaintDef[] = [
  { id: 'olive', name: 'Olive Drab', desc: 'Factory finish over neutral grey', rarity: 'common', free: true, swatch: 'linear-gradient(#5a5a2a 55%, #a9adb3 55%)' },
  { id: 'silver', name: 'Natural Metal', desc: 'Bare polished aluminium', rarity: 'rare', swatch: 'linear-gradient(135deg, #e3e6ea, #9ea4ab 60%, #d4d8dd)' },
  { id: 'desert', name: 'Desert Pink', desc: 'North Africa sand-and-pink', rarity: 'epic', swatch: 'linear-gradient(#c79a86 55%, #c9c2b6 55%)' },
  { id: 'invasion', name: 'Invasion Stripes', desc: 'Olive drab with black-and-white bands', rarity: 'legendary', swatch: 'repeating-linear-gradient(90deg, #eee 0 10px, #111 10px 20px), #5a5a2a' },
];

const SKIN = 'GD-L';

// Stripe bands in skin-texture pixels (for a 1024 map): [x0, x1, y0, y1], five bands each
const STRIPES: [number, number, number, number][] = [
  [160, 280, 365, 560], [630, 750, 365, 560],   // wing tops (spanwise mid panels)
  [160, 280, 570, 745], [630, 750, 570, 745],   // wing undersides
  [708, 798, 95, 228],                          // fuselage side (tail to the right)
  [242, 332, 235, 348],                         // fuselage side (tail to the left)
];

// the factory nose script "Sugar" (skin-texture pixels, 1024 map)
const SUGAR = [270, 356, 186, 232];

const cache = new Map<string, THREE.Texture>();

function paintedMap(id: string, src: THREE.Texture): THREE.Texture | null {
  const k = id + '|' + src.uuid;
  const hit = cache.get(k);
  if (hit) return hit;
  const img = src.image as CanvasImageSource & { width: number; height: number };
  if (!img || !img.width) return null;
  const W = img.width, H = img.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const im = g.getImageData(0, 0, W, H), d = im.data;
  // classify: 1 = olive drab paint, 2 = neutral grey underside, 0 = markings / other
  const cls = new Uint8Array(W * H), lum = new Float32Array(W * H);
  let oSum = 0, oN = 0, gSum = 0, gN = 0, oR = 0, oG = 0, oB = 0;
  for (let i = 0, p = 0; p < W * H; i += 4, p++) {
    const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), s = mx > 0 ? (mx - mn) / mx : 0;
    let h = 0;
    if (mx > mn) h = mx === r ? ((gg - b) / (mx - mn)) * 60 : mx === gg ? (2 + (b - r) / (mx - mn)) * 60 : (4 + (r - gg) / (mx - mn)) * 60;
    if (h < 0) h += 360;
    const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    lum[p] = l;
    if (h >= 38 && h <= 95 && s > 0.2 && mx > 0.1 && mx < 0.72) { cls[p] = 1; oSum += l; oN++; oR += d[i]; oG += d[i + 1]; oB += d[i + 2]; }
    else if (s < 0.16 && mx > 0.42 && mx < 0.9) { cls[p] = 2; gSum += l; gN++; }
  }
  const oRef = oN ? oSum / oN : 0.3, gRef = gN ? gSum / gN : 0.7;
  const set = (i: number, r: number, gg: number, b: number) => { d[i] = Math.min(255, r); d[i + 1] = Math.min(255, gg); d[i + 2] = Math.min(255, b); };
  const scale = W / 1024;
  // every scheme (olive included) paints out the factory "Sugar" script on the left nose,
  // where the player's own nose art and name go
  if (oN) {
    const [x0, x1, y0, y1] = SUGAR.map((v) => Math.round(v * scale));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const p = y * W + x;
      if (cls[p] === 2) continue;
      set(p * 4, oR / oN, oG / oN, oB / oN);
      cls[p] = 1; lum[p] = oRef;
    }
  }
  for (let p = 0; p < W * H; p++) {
    const k2 = cls[p];
    if (!k2) continue;
    const i = p * 4;
    const shade = THREE.MathUtils.clamp(lum[p] / (k2 === 1 ? oRef : gRef), 0.35, 1.5);
    if (id === 'silver') {
      // aluminium: the grey underside a touch darker than the polished top
      const v = (k2 === 1 ? 182 : 168) * shade;
      set(i, v * 0.97, v * 0.99, v * 1.02);
    } else if (id === 'desert') {
      if (k2 === 1) set(i, 196 * shade, 146 * shade, 126 * shade);
      else set(i, 206 * shade, 198 * shade, 184 * shade);
    } else if (id === 'invasion') {
      const x = p % W, y = (p / W) | 0;
      for (const [x0, x1, y0, y1] of STRIPES) {
        if (x < x0 * scale || x >= x1 * scale || y < y0 * scale || y >= y1 * scale) continue;
        const band = Math.floor(((x - x0 * scale) / ((x1 - x0) * scale)) * 5);
        const v = (band % 2 === 0 ? 232 : 26) * Math.min(1.15, shade);
        set(i, v, v, v * 0.97);
        break;
      }
    }
  }
  g.putImageData(im, 0, 0);
  const t = src.clone();
  t.source = new THREE.TextureSource(c);
  t.needsUpdate = true;
  cache.set(k, t);
  return t;
}

// Recolour a B-17 model. Restores the original (shared) materials first, so schemes can be
// switched freely; the copies are marked owned and freed when replaced.
export function applyPaint(model: THREE.Object3D, id: string) {
  const stripes = model.getObjectByName('invasion_markings');
  if (stripes) stripes.visible = id === 'invasion';
  const placeholder = !model.getObjectByName('airframe');   // stand-in model: plain colours
  const isSkin = (x: THREE.Material) => x.name === SKIN || /^hero_(skin|neutral_grey)/.test(x.name) || (placeholder && !x.transparent);
  const copies = new Map<THREE.Material, THREE.Material>();
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || o.name === 'noseArt') return;
    const orig = m.userData.paintOrig as THREE.Material | THREE.Material[] | undefined;
    if (orig) {
      for (const c of Array.isArray(m.material) ? m.material : [m.material]) if (c.userData.paint && !copies.has(c)) { copies.set(c, c); c.dispose(); }
      m.material = orig;
      delete m.userData.paintOrig;
    }
  });
  copies.clear();
  if (id === 'olive' && placeholder) return;
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || o.name === 'noseArt') return;
    const src = Array.isArray(m.material) ? m.material : [m.material];
    if (!src.some(isSkin)) return;
    const next = src.map((mat) => {
      if (!isSkin(mat)) return mat;
      let c = copies.get(mat);
      if (!c) {
        const std = mat as THREE.MeshStandardMaterial;
        const cs = markOwned(std.clone());
        cs.userData.paint = id;
        const hero = std.name.startsWith('hero_');
        // Low retains an embedded diffuse atlas, so recolour it without streaming detail.
        const heroLow = hero && std.name.endsWith('_low');
        const map = (!hero || (heroLow && (id === 'silver' || id === 'desert'))) && std.map ? paintedMap(id, std.map) : null;
        if (map) cs.map = map;
        else if (!hero && cs.color && id !== 'invasion') cs.color.multiply(id === 'silver' ? new THREE.Color(1.9, 1.9, 2.0) : new THREE.Color(1.6, 1.15, 1.1));
        if (hero) {
          if (heroLow && map) cs.color.setRGB(1, 1, 1);
          else if (id === 'silver') cs.color.fromArray(std.map ? [1, 1, 1] : [.52, .55, .58]);
          else if (id === 'desert') cs.color.fromArray(std.map ? [2.6, 1.7, 2.3] : [.25, .17, .10]);
          registerHeroMaterial(cs);
        }
        if (id === 'silver') { cs.metalness = hero ? (std.map && !heroLow ? 1 : .82) : .62; cs.roughness = hero ? (std.map && !heroLow ? 1 : .36) : .32; }
        copies.set(mat, c = cs);
      }
      return c;
    });
    m.userData.paintOrig = m.material;
    m.material = Array.isArray(m.material) ? next : next[0];
  });
}

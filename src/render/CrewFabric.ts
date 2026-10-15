import * as THREE from 'three';

// Original tileable microstructure for the crewmen's materials (normal + roughness), generated once
// (in the background, with the interior assets) and mip-filtered at range:
//   leather  pebbled hide grain with soft creases (B-3 jacket, A-3 trousers, boots, gloves, helmet)
//   fleece   curly sheepskin tufts (collars, cuffs, hems, boot tops)
//   canvas   a plain weave (webbing, Mae West, flak vest)
//   skin     fine pores
//   cloth    a generic fine weave
export type FabricKind = 'leather' | 'fleece' | 'canvas' | 'skin' | 'cloth';
export const FABRIC_SIZE = 256;

function rng(seed: number) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

// tileable value noise on a `cells` grid
function valueNoise(size: number, cells: number, seed: number) {
  const r = rng(seed), g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x / size * cells, fy = y / size * cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[(y0 % cells) * cells + x0 % cells], b = g[(y0 % cells) * cells + (x0 + 1) % cells];
    const c = g[((y0 + 1) % cells) * cells + x0 % cells], d = g[((y0 + 1) % cells) * cells + (x0 + 1) % cells];
    out[y * size + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  }
  return out;
}

// tileable cellular noise: distance to the nearest of `cells`^2 jittered points (0 at a point)
function cellular(size: number, cells: number, seed: number) {
  const r = rng(seed), px = new Float32Array(cells * cells), py = new Float32Array(cells * cells);
  for (let i = 0; i < px.length; i++) { px[i] = r(); py[i] = r(); }
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x / size * cells, fy = y / size * cells, cx = Math.floor(fx), cy = Math.floor(fy);
    let best = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gx = cx + i, gy = cy + j, k = ((gy + cells) % cells) * cells + (gx + cells) % cells;
      const dx = gx + px[k] - fx, dy = gy + py[k] - fy, d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    out[y * size + x] = Math.sqrt(best);
  }
  return out;
}

export function fabricPixels(kind: FabricKind | boolean, size = FABRIC_SIZE) {
  const k: FabricKind = kind === true ? 'leather' : kind === false ? 'cloth' : kind;
  const n = size * size, h = new Float32Array(n), ro = new Float32Array(n);
  const TAU = Math.PI * 2;
  if (k === 'leather') {
    const grain = cellular(size, 40, 11), fine = valueNoise(size, 64, 5), crease = valueNoise(size, 6, 9), crease2 = valueNoise(size, 11, 4);
    for (let i = 0; i < n; i++) {
      const c = Math.abs(crease[i] - 0.5), c2 = Math.abs(crease2[i] - 0.5);
      const fold = Math.exp(-c * c * 900) * 0.6 + Math.exp(-c2 * c2 * 1600) * 0.35;     // thin creases where the noise crosses 0.5
      h[i] = Math.min(1, grain[i] * 1.6) * 0.35 + fine[i] * 0.1 - fold * 0.55;
      ro[i] = 0.5 + 0.12 * fine[i] + 0.25 * fold + 0.08 * (1 - Math.min(1, grain[i] * 1.6));
    }
  } else if (k === 'fleece') {
    const tufts = cellular(size, 18, 3), curls = cellular(size, 46, 8), lump = valueNoise(size, 8, 2);
    for (let i = 0; i < n; i++) {
      const t = 1 - Math.min(1, tufts[i] * 1.5), c = 1 - Math.min(1, curls[i] * 1.6);
      h[i] = t * t * 0.7 + c * c * 0.45 + lump[i] * 0.25;
      ro[i] = 0.93 + 0.06 * (1 - t);
    }
  } else if (k === 'canvas') {
    const fine = valueNoise(size, 128, 13), slub = valueNoise(size, 16, 17);
    const threads = 48;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size * threads, v = y / size * threads, i = y * size + x;
      const warp = Math.abs(Math.sin(u * Math.PI)), weft = Math.abs(Math.sin(v * Math.PI));
      const over = (Math.floor(u) + Math.floor(v)) % 2 === 0;
      h[i] = (over ? warp * 0.7 + weft * 0.25 : weft * 0.7 + warp * 0.25) * (0.85 + 0.3 * slub[i]) + fine[i] * 0.08;
      ro[i] = 0.84 + 0.1 * fine[i];
    }
  } else if (k === 'skin') {
    const pores = cellular(size, 70, 21), fine = valueNoise(size, 96, 23), soft = valueNoise(size, 12, 29);
    for (let i = 0; i < n; i++) {
      const p = Math.min(1, pores[i] * 2.2);
      h[i] = p * 0.25 + fine[i] * 0.12 + soft[i] * 0.1;
      ro[i] = 0.5 + 0.12 * (1 - p) + 0.08 * fine[i];
    }
  } else {
    let seed = 7;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      seed = (seed * 16807) % 2147483647;
      const grain = seed / 2147483647, u = x / size * TAU, v = y / size * TAU, i = y * size + x;
      h[i] = 0.24 * Math.sin(u * 32) * Math.sin(v * 32) + grain * 0.12;
      ro[i] = 0.86 + 0.13 * grain;
    }
  }
  // relief per texel: the same look at any size (the features are laid out per tile, not per texel)
  const strength = (k === 'fleece' ? 3.2 : k === 'canvas' ? 2.2 : k === 'skin' ? 0.9 : k === 'leather' ? 2.0 : 1.0) * size / FABRIC_SIZE;
  const normal = new Uint8Array(n * 4), rough = new Uint8Array(n * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const dx = (h[y * size + (x + 1) % size] - h[y * size + (x + size - 1) % size]) * strength;
    const dy = (h[((y + 1) % size) * size + x] - h[((y + size - 1) % size) * size + x]) * strength;
    const len = Math.hypot(dx, dy, 1), j = i * 4;
    normal[j] = Math.round((-dx / len * 0.5 + 0.5) * 255); normal[j + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
    normal[j + 2] = Math.round((1 / len * 0.5 + 0.5) * 255); normal[j + 3] = 255;
    rough[j] = rough[j + 1] = rough[j + 2] = Math.round(255 * Math.min(1, Math.max(0, ro[i]))); rough[j + 3] = 255;
  }
  return { normal, rough };
}

const cache = new Map<FabricKind, { normal: THREE.DataTexture; rough: THREE.DataTexture }>();
export function crewFabric(kind: FabricKind | boolean) {
  const k: FabricKind = kind === true ? 'leather' : kind === false ? 'cloth' : kind;
  const old = cache.get(k);
  if (old) return old;
  const data = fabricPixels(k);
  const make = (pixels: Uint8Array) => {
    const t = new THREE.DataTexture(pixels, FABRIC_SIZE, FABRIC_SIZE);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.anisotropy = 4; t.generateMipmaps = true; t.needsUpdate = true; return t;
  };
  const textures = { normal: make(data.normal), rough: make(data.rough) };
  cache.set(k, textures);
  return textures;
}

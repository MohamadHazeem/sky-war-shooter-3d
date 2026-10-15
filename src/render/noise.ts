import * as THREE from 'three';

// Tileable 3D noise volumes for the volumetric clouds, generated once at startup.
// Shape: R = Perlin-Worley (billowy base), G/B/A = Worley fbm at increasing frequencies.
// Detail: R = Worley erosion; GBA = signed periodic curl for domain distortion.

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function makeWorley(cells: number, seed: number) {
  const pts = new Float32Array(cells * cells * cells * 3);
  for (let z = 0; z < cells; z++)
    for (let y = 0; y < cells; y++)
      for (let x = 0; x < cells; x++) {
        const i = (z * cells * cells + y * cells + x) * 3;
        pts[i] = hash3(x, y, z, seed);
        pts[i + 1] = hash3(x, y, z, seed + 17);
        pts[i + 2] = hash3(x, y, z, seed + 31);
      }
  return (u: number, v: number, w: number): number => {
    const px = u * cells, py = v * cells, pz = w * cells;
    const cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
    let best = 1e9;
    for (let dz = -1; dz <= 1; dz++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const ix = cx + dx, iy = cy + dy, iz = cz + dz;
          const wx = ((ix % cells) + cells) % cells;
          const wy = ((iy % cells) + cells) % cells;
          const wz = ((iz % cells) + cells) % cells;
          const i = (wz * cells * cells + wy * cells + wx) * 3;
          const ox = ix + pts[i] - px, oy = iy + pts[i + 1] - py, oz = iz + pts[i + 2] - pz;
          const d = ox * ox + oy * oy + oz * oz;
          if (d < best) best = d;
        }
    return 1 - Math.min(1, Math.sqrt(best));
  };
}

function makePerlin(period: number, seed: number) {
  const grads: number[][] = [];
  for (let i = 0; i < 256; i++) {
    const t = hash3(i, 0, 0, seed) * Math.PI * 2;
    const zz = hash3(i, 1, 0, seed) * 2 - 1;
    const r = Math.sqrt(1 - zz * zz);
    grads.push([r * Math.cos(t), r * Math.sin(t), zz]);
  }
  const g = (x: number, y: number, z: number) => {
    x = ((x % period) + period) % period;
    y = ((y % period) + period) % period;
    z = ((z % period) + period) % period;
    return grads[Math.floor(hash3(x, y, z, seed + 5) * 255.999)];
  };
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  return (u: number, v: number, w: number): number => {
    const px = u * period, py = v * period, pz = w * period;
    const x0 = Math.floor(px), y0 = Math.floor(py), z0 = Math.floor(pz);
    const fx = px - x0, fy = py - y0, fz = pz - z0;
    let total = 0;
    for (let dz = 0; dz <= 1; dz++)
      for (let dy = 0; dy <= 1; dy++)
        for (let dx = 0; dx <= 1; dx++) {
          const gr = g(x0 + dx, y0 + dy, z0 + dz);
          const dot = gr[0] * (fx - dx) + gr[1] * (fy - dy) + gr[2] * (fz - dz);
          const wx = dx ? fade(fx) : 1 - fade(fx);
          const wy = dy ? fade(fy) : 1 - fade(fy);
          const wz = dz ? fade(fz) : 1 - fade(fz);
          total += dot * wx * wy * wz;
        }
    return total * 0.5 + 0.5;
  };
}

const remap = (v: number, a: number, b: number, c: number, d: number) => c + ((v - a) / (b - a)) * (d - c);

export function createShapeNoise(size = 64): THREE.Data3DTexture {
  const data = new Uint8Array(size * size * size * 4);
  const p1 = makePerlin(4, 1), p2 = makePerlin(8, 2), p3 = makePerlin(16, 3);
  const w1 = makeWorley(4, 11), w2 = makeWorley(8, 12), w3 = makeWorley(16, 13), w4 = makeWorley(32, 14);
  let i = 0;
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size, w = z / size;
        const perlin = p1(u, v, w) * 0.625 + p2(u, v, w) * 0.25 + p3(u, v, w) * 0.125;
        const wa = w1(u, v, w), wb = w2(u, v, w), wc = w3(u, v, w), wd = w4(u, v, w);
        const wfbm = wa * 0.625 + wb * 0.25 + wc * 0.125;
        const pw = Math.max(0, Math.min(1, remap(perlin, wfbm - 1, 1, 0, 1)));
        data[i++] = pw * 255;
        data[i++] = (wb * 0.625 + wc * 0.25 + wd * 0.125) * 255;
        data[i++] = (wc * 0.75 + wd * 0.25) * 255;
        data[i++] = wd * 255;
      }
  const tex = new THREE.Data3DTexture(data, size, size, size);
  tex.format = THREE.RGBAFormat;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

// Curl of A = (sin(y+2z), sin(z+2x), sin(x+2y)). The extra eddies omit their own
// coordinate; cross derivatives cancel in the main curl.
// Integer frequencies make wrap seams continuous.
// Analytic derivatives avoid a second startup volume and runtime finite differences.
export function cloudCurl(u: number, v: number, w: number): [number, number, number] {
  const x = u * Math.PI * 2, y = v * Math.PI * 2, z = w * Math.PI * 2;
  return [
    (2 * Math.cos(x + 2 * y) - Math.cos(z + 2 * x) + .5 * Math.cos(3 * y - z)) / 3.5,
    (2 * Math.cos(y + 2 * z) - Math.cos(x + 2 * y) + .5 * Math.cos(3 * z - x)) / 3.5,
    (2 * Math.cos(z + 2 * x) - Math.cos(y + 2 * z) + .5 * Math.cos(3 * x - y)) / 3.5,
  ];
}

export function createDetailNoise(size = 32): THREE.Data3DTexture {
  const data = new Uint8Array(size * size * size * 4);
  const w1 = makeWorley(4, 21), w2 = makeWorley(8, 22), w3 = makeWorley(16, 23);
  let i = 0;
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size, w = z / size;
        data[i++] = (w1(u, v, w) * 0.625 + w2(u, v, w) * 0.25 + w3(u, v, w) * 0.125) * 255;
        const curl = cloudCurl(u, v, w);
        for (const c of curl) data[i++] = Math.round((c * .5 + .5) * 255);
      }
  const tex = new THREE.Data3DTexture(data, size, size, size);
  tex.format = THREE.RGBAFormat;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

// 2D weather/coverage map (tileable), R = coverage, G = maturity, B = coherent cell core.
export function createWeatherMap(size = 256): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const p1 = makePerlin(4, 41), p2 = makePerlin(8, 42), p3 = makePerlin(16, 43);
  const w1 = makeWorley(6, 44);
  let i = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const n = p1(u, v, 0.3) * 0.6 + p2(u, v, 0.3) * 0.28 + p3(u, v, 0.3) * 0.12;
      const c = Math.max(0, Math.min(1, (n - 0.32) * 2.2 * 0.7 + w1(u, v, 0.5) * 0.45));
      data[i++] = c * 255;
      data[i++] = p2(u, v, 0.8) * 255;
      data[i++] = w1(u, v, 0.5) * 255;
      data[i++] = 255;
    }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

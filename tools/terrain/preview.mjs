// Decodes a built tile and draws a map preview the way the shader reads it (bilinear fields):
// sea/lakes, rivers (side distance < half-width), rails, woods, towns, hill shading.
//   node tools/terrain/preview.mjs <i_j> <out.png> [scale=2]
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import sharp from 'sharp';
import { GRID } from '../../src/world/TerrainGrid.ts';

export function unpack(buf) {
  const b = gunzipSync(buf);
  if (b.toString('latin1', 0, 4) !== 'SWT1') throw new Error('bad tile');
  const images = [];
  let o = 4;
  while (o < b.length) {
    const size = b.readUInt16LE(o), ch = b[o + 2]; o += 3;
    const data = new Uint8Array(size * size * ch);
    for (let k = 0; k < ch; k++) {
      for (let r = 0; r < size; r++) { let prev = 0; for (let c = 0; c < size; c++) { prev = (prev + b[o + r * size + c]) & 255; data[(r * size + c) * ch + k] = prev; } }
      o += size * size;
    }
    images.push({ size, ch, data });
  }
  return images;
}

const [id, out, sc = '2'] = process.argv.slice(2);
if (id) {
  const [lines, cover, relief] = unpack(readFileSync(join(resolve(import.meta.dirname, '../../public/terrain'), `t${id}.bin`)));
  const S = GRID.LINES * Number(sc);
  const bil = (img, u, v, k) => {
    const n = img.size, x = u * n - 0.5, y = v * n - 0.5, x0 = Math.max(0, Math.min(n - 2, Math.floor(x))), y0 = Math.max(0, Math.min(n - 2, Math.floor(y)));
    const fx = Math.min(1, Math.max(0, x - x0)), fy = Math.min(1, Math.max(0, y - y0)), g = (xx, yy) => img.data[(yy * n + xx) * img.ch + k];
    return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy;
  };
  const px = Buffer.alloc(S * S * 3), m = GRID.TILE / S;
  for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) {
    const u = (c + 0.5) / S, v = 1 - (r + 0.5) / S;
    const coast = (bil(lines, u, v, 0) - 127.5) / 127.5 * GRID.COAST_RANGE;
    const side = (bil(lines, u, v, 1) - 127.5) / 127.5 * GRID.SIDE_RANGE, hw = bil(lines, u, v, 2) * 2;
    const rail = (bil(lines, u, v, 3) - 127.5) / 127.5 * GRID.SIDE_RANGE;
    const urban = bil(cover, u, v, 0) / 255, forest = bil(cover, u, v, 1) / 255, grass = bil(cover, u, v, 2) / 255;
    const sx = (bil(relief, u, v, 0) - 127.5) / 127.5 * GRID.SLOPE_RANGE, sy = (bil(relief, u, v, 1) - 127.5) / 127.5 * GRID.SLOPE_RANGE;
    let col;
    if (coast < 0) col = [30, 60, 90];
    else {
      const shade = Math.max(0.4, Math.min(1.5, 1 + (-sx * 0.6 + sy * 0.8) * 4));
      col = [140 - forest * 90 - grass * 30, 130 - forest * 60 + grass * 10, 90 - forest * 50].map((x) => x * shade);
      if (urban > 0.3) col = [150, 90, 80];
      if (hw > 0 && Math.abs(side) < Math.max(hw, m * 0.6)) col = [40, 80, 140];
      if (Math.abs(rail) < m * 0.6) col = [20, 20, 20];
    }
    px.set(col.map((x) => Math.max(0, Math.min(255, x))), (r * S + c) * 3);
  }
  await sharp(px, { raw: { width: S, height: S, channels: 3 } }).png().toFile(out);
  console.log('wrote', out);
}

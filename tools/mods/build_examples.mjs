// Builds the example mod packs in public/mods/ (Phase 11 goal 38; format: docs/MODDING.md).
// Images are drawn here with a tiny supersampled rasteriser and written as PNG data URLs, so the
// examples need no image tools.   node tools/mods/build_examples.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../public/mods');

// ---------- PNG ----------
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
// f(x, y) -> [r, g, b, a] (0-255) or null (transparent), sampled 3x3 per pixel
function draw(w, h, f, ss = 3) {
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
      const c = f(x + (i + 0.5) / ss, y + (j + 0.5) / ss);
      if (!c) continue;
      const ca = (c[3] ?? 255) / 255;
      r += c[0] * ca; g += c[1] * ca; b += c[2] * ca; a += ca;
    }
    const o = (y * w + x) * 4, n = ss * ss;
    if (a > 0) { buf[o] = r / a; buf[o + 1] = g / a; buf[o + 2] = b / a; }
    buf[o + 3] = Math.round((a / n) * 255);
  }
  return 'data:image/png;base64,' + png(w, h, buf).toString('base64');
}
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const inPoly = (pts, x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const starPts = (cx, cy, r, rot = -Math.PI / 2) => Array.from({ length: 10 }, (_, i) => { const a = rot + (i * Math.PI) / 5, rr = i % 2 ? r * 0.4 : r; return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; });
const INK = hex('#17130c'), CREAM = hex('#efe6c8'), RED = hex('#b3261b'), GOLD = hex('#e2b33c'), NAVY = hex('#1f2f57');

// ---------- images ----------
// Tileable camouflage: sums of whole-period waves thresholded into three colours
function camo(size, cols, seed) {
  const T = Math.PI * 2 / size;
  const field = (x, y, k) => Math.sin(T * (2 * x + y) + seed + k) + Math.sin(T * (x - 3 * y) + seed * 2 + k) * 0.8 + Math.sin(T * (5 * x + 2 * y) + seed * 3 + k * 2) * 0.45 + Math.sin(T * (-3 * x + 4 * y) + k) * 0.35;
  return draw(size, size, (x, y) => { const a = field(x, y, 0), b = field(x, y, 1.7); return a > 0.55 ? cols[1] : b > 0.75 ? cols[2] : cols[0]; }, 2);
}

// Checkerboard banner waving across the decal (the "checkertail" fighter-group marking)
function checkerBanner() {
  return draw(512, 256, (x, y) => {
    const wave = Math.sin((x / 512) * Math.PI * 2) * 22;
    const top = 50 + wave, bot = 170 + wave;
    if (x < 22 || x > 490) return null;
    if (y < top - 7 || y > bot + 7) return null;
    if (y < top || y > bot) return INK;
    const cx = Math.floor((x - 22) / 26), cy = Math.floor((y - top) / 24);
    return (cx + cy) % 2 ? INK : GOLD;
  });
}

// A blue roundel with a white star, red ring and a falling bomb
function starRoundel() {
  const star = starPts(150, 118, 70);
  const bomb = (x, y) => { const dx = (x - 360) / 70, dy = (y - 110) / 26; return dx * dx + dy * dy <= 1; };
  const fins = [[268, 80], [304, 104], [304, 116], [268, 140], [280, 110]];
  return draw(512, 256, (x, y) => {
    const d = Math.hypot(x - 150, y - 118);
    if (d <= 100) { if (inPoly(star, x, y)) return CREAM; if (d >= 90) return RED; if (d >= 86) return INK; return NAVY; }
    if (d <= 104) return INK;
    if (bomb(x, y)) { const dx = (x - 360) / 70, dy = (y - 110) / 26; return dx * dx + dy * dy > 0.82 ? INK : (x > 300 && x < 310) ? GOLD : hex('#3d4130'); }
    if (inPoly(fins, x, y)) return hex('#6d6a55');
    for (let k = 0; k < 3; k++) { const yy = 84 + k * 26; if (x > 196 && x < 256 && Math.abs(y - yy - (x - 196) * 0.12) < 2.5) return [239, 230, 200, 220]; }
    return null;
  });
}

// ---------- packs ----------
const extras = {
  format: 'sws3d-mod', version: 1, id: 'eighth-extras', name: 'Mighty Eighth Extras', author: 'Sky War team',
  description: 'An example mod: three missions, two paint schemes and two nose art designs.',
  missions: [
    { id: 'black-thursday', name: 'Black Thursday', target: 'Ball-bearing plants, Schweinfurt', route: 'long', weather: 'clear', sunElevation: 35, seat: 'waistL',
      bombers: 18, skill: 'ace', escorts: 'none', flak: 'heavy',
      waves: [
        { leg: 'in', from: 'front', count: 6, types: ['fw190'] }, { leg: 'in', from: 'high', count: 5, types: ['bf109'] },
        { leg: 'target', from: 'rear', count: 6, types: ['bf110', 'me410'] }, { leg: 'target', from: 'left', count: 4, types: ['ju88'] },
        { leg: 'home', from: 'mixed', count: 8, types: ['fw190', 'bf109'] },
      ] },
    { id: 'jet-scare', name: 'Jet Scare', target: 'Oil refinery, Merseburg', route: 'medium', weather: 'overcast', sunElevation: 20, seat: 'tail',
      bombers: 12, skill: 'veteran', escorts: 'early', flak: 'deadly',
      waves: [
        { leg: 'in', from: 'rear', count: 3, types: ['me262'] }, { leg: 'target', from: 'high', count: 3, types: ['me163'] },
        { leg: 'home', from: 'rear', count: 5, types: ['me262', 'fw190'] },
      ] },
    { id: 'milk-run', name: 'Milk Run', target: 'Airfield, Rheine', route: 'short', weather: 'clear', sunElevation: 50, seat: 'ball',
      bombers: 9, skill: 'recruit', escorts: 'early', flak: 'light',
      waves: [{ leg: 'in', from: 'front', count: 3, types: ['bf109'] }, { leg: 'home', from: 'left', count: 4, types: ['fw190'] }] },
  ],
  paints: [
    { id: 'desert-camo', name: 'Desert Camo', top: '#b08a5a', under: '#c7c9c2', scale: 1, pattern: camo(128, [hex('#b9925f'), hex('#7d6a45'), hex('#5c5236')], 0.7) },
    { id: 'night-black', name: 'Night Black', top: '#26282a', under: '#151617' },
  ],
  noseArt: [
    { id: 'checkertail', name: 'Checkertail', image: checkerBanner(), showName: true },
    { id: 'star-roundel', name: 'Star and Bomb', image: starRoundel(), showName: true },
  ],
};

const crew = {
  format: 'sws3d-mod', version: 1, id: 'hometown-crew', name: 'Hometown Crew', author: 'Sky War team',
  description: 'An example mod: new names and nicknames for the whole crew.',
  crew: {
    brenner: { first: 'Walt', last: 'Hayes', nick: 'Pappy' }, doyle: { first: 'Gene', last: 'Malone', nick: 'Red' },
    stern: { first: 'Abe', last: 'Lindqvist', nick: 'Compass' }, kessler: { first: 'Vic', last: 'Russo', nick: 'Bullseye' },
    mendez: { first: 'Rudy', last: 'Ortiz', nick: 'Sparkplug' }, gallo: { first: 'Benny', last: 'Katz', nick: 'Static' },
    reilly: { first: 'Pete', last: 'Dunn', nick: 'Peanut' }, price: { first: 'Clay', last: 'Barlow', nick: 'Dusty' },
    walsh: { first: 'Artie', last: 'Kowal', nick: 'Clover' }, dawson: { first: 'Lyle', last: 'Becker', nick: 'Owl' },
  },
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'eighth-extras.json'), JSON.stringify(extras, null, 1) + '\n');
writeFileSync(join(OUT, 'hometown-crew.json'), JSON.stringify(crew, null, 2) + '\n');
writeFileSync(join(OUT, 'index.json'), JSON.stringify([
  { id: extras.id, file: 'eighth-extras.json', name: extras.name, description: extras.description },
  { id: crew.id, file: 'hometown-crew.json', name: crew.name, description: crew.description },
], null, 2) + '\n');
console.log('wrote', OUT);

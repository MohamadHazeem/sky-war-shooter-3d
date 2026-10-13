import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SEA_KINDS, type SeaKind } from './SeaCombat';

// Metres, +Z bow. Cached, merged colour geometry: two hull sections and optional fine detail.
export function color(g: THREE.BufferGeometry, hex: number) {
  const c = new THREE.Color(hex), a = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
export function block(x: number, y: number, z: number, w: number, h: number, d: number, col: number) {
  return color(new THREE.BoxGeometry(w, h, d).translate(x, y, z), col);
}
export function merge(parts: THREE.BufferGeometry[]) {
  const flat = parts.map(g => g.index ? g.toNonIndexed() : g);
  const result = mergeGeometries(flat)!;
  for (const g of flat) g.dispose(); for (const g of parts) if (g.index) g.dispose();
  return result;
}
function cylinder(x: number, y: number, z: number, r: number, h: number, col: number, top = r) {
  return color(new THREE.CylinderGeometry(top, r, h, 12).translate(x, y, z), col);
}
function rod(a: number[], b: number[], radius: number, col: number) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.clone().sub(from);
  return color(new THREE.CylinderGeometry(radius, radius, delta.length(), 5).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize())).translate(...from.add(to).multiplyScalar(.5).toArray()), col);
}
const steel = 0x626e73, light = 0x899795, dark = 0x303d43, teak = 0x92816a;
const cache = new Map<SeaKind, THREE.BufferGeometry[]>();

// Ruled hull surfaces: narrow keel, boot topping, flared deck edge and raised forecastle.
function hullSection(L: number, B: number, H: number, fore: boolean, submarine: boolean) {
  const p: number[] = [], cols: number[] = [], uv: number[] = [];
  const c = new THREE.Color();
  const stations = fore ? [0, .16, .3, .4, .47, .5] : [-.5, -.48, -.43, -.32, -.16, 0];
  const width = (t: number) => t >= 0 ? Math.max(.005, 1 - Math.pow(t * 2, 3.2)) : Math.sqrt(Math.max(.015, 1 - Math.pow(-t * 2, 6)));
  const levels = [-4, -.6, .6, H];
  const point = (t: number, k: number, side: number) => [side * B * .5 * width(t) * (k === 0 ? .62 : k === 3 ? 1 : .86), levels[k] + (k === 3 ? Math.pow(Math.abs(t) * 2, 3) * (submarine ? .2 : H * .24) : 0), t * L];
  const tri = (a: number[], b: number[], d: number[], hex: number) => { c.setHex(hex); for (const v of [a, b, d]) { p.push(...v); cols.push(c.r, c.g, c.b); uv.push(v[2] * .08, v[1] * .08); } };
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i], b = stations[i + 1];
    for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
      const v = [point(a, k, side), point(b, k, side), point(b, k + 1, side), point(a, k + 1, side)];
      const tint = k === 0 ? 0x663f38 : k === 1 ? 0x202b30 : submarine ? 0x505d60 : 0x606f77;
      if (side > 0) { tri(v[0], v[2], v[1], tint); tri(v[0], v[3], v[2], tint); }
      else { tri(v[0], v[1], v[2], tint); tri(v[0], v[2], v[3], tint); }
    }
    const v = [point(a, 3, -1), point(b, 3, -1), point(b, 3, 1), point(a, 3, 1)];
    tri(v[0], v[1], v[2], submarine ? dark : teak); tri(v[0], v[2], v[3], submarine ? dark : teak);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}

export function shipGeometry(kind: SeaKind): THREE.BufferGeometry[] {
  const cached = cache.get(kind); if (cached) return cached;
  const s = SEA_KINDS[kind], L = s.length, B = s.beam, H = kind === 'uboat' ? 2 : B * .32;
  const parts: THREE.BufferGeometry[][] = [[], [], [], []];
  const put = (g: THREE.BufferGeometry, z = 0, fine = false) => parts[(z < 0 ? 1 : 0) + (fine ? 2 : 0)].push(g);
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, col = steel, fine = false) => put(block(x, y, z, w, h, d, col), z, fine);
  const cyl = (x: number, y: number, z: number, r: number, h: number, col = steel, top = r) => put(cylinder(x, y, z, r, h, col, top), z);
  const line = (a: number[], b: number[], r = .12, col = dark, fine = true) => put(rod(a, b, r, col), a[2], fine);
  const bridge = (z: number, y: number, w: number, d: number) => {
    box(0, y, z, w, 3.5, d, light); box(0, y + 2, z, w + 1, .5, d + 1, dark);
    for (let x = -w * .4; x <= w * .4; x += 1.4) box(x, y + .6, z + d / 2 + .02, .9, 1, .12, 0x1e333c);
    for (const side of [-1, 1]) for (let k = -1; k <= 1; k++) box(side * (w / 2 + .03), y + .6, z + k * d * .25, .12, 1, 1.2, 0x1e333c);
  };
  const funnel = (z: number, y: number, h: number, r: number) => { cyl(0, y + h / 2, z, r, h, steel); cyl(0, y + h, z, r * 1.1, 1.8, dark); cyl(0, y + h + .92, z, r * .72, .12, 0x10191d); };
  const mast = (z: number, bottom: number, height: number, tripod = false) => {
    line([0, bottom, z], [0, bottom + height, z], .3, dark, false);
    if (tripod) for (const side of [-1, 1]) line([side * B * .15, bottom, z - 4], [0, bottom + height * .72, z], .35, steel, false);
    for (const f of [.6, .86]) line([-B * .27, bottom + height * f, z], [B * .27, bottom + height * f, z], .16, dark, false);
    line([-B * .27, bottom + height * .6, z], [0, bottom + height, z], .055);
    line([B * .27, bottom + height * .6, z], [0, bottom + height, z], .055);
  };
  if (s.shore) {
    box(0, -2.5, 0, B + 2, 5, L + 2, 0x5d6256); // foundation reaches the noisy terrain beneath the 47 m collision shelf
    if (kind === 'tower') {
      box(0, 15, 0, B * .78, 30, L * .78, 0x77786c); box(0, 30, 0, B, 3, L, 0x99988a);
      for (const x of [-1, 1]) for (const z of [-1, 1]) { cyl(x * B * .34, 31, z * L * .34, 7, 5, 0x85877a); cyl(x * B * .34, 33.6, z * L * .34, 5.5, .2, dark); }
      for (let y = 6; y < 29; y += 6) for (const x of [-1, 1]) box(x * B * .392, y, 0, .15, 1.1, 18, dark);
    } else if (kind === 'battery') {
      box(0, 3, -3, B, 6, L * .8, 0x7c8072); box(0, 7.5, 0, B + 3, 3, L, 0x999b87);
      box(0, 4.4, L * .4, B * .72, 2.8, .3, 0x182423);
      for (const x of [-1, 1]) box(x * B * .43, 4, L * .35, B * .15, 8, 9, 0x818777);
      for (let i = 0; i < 22; i++) { const z = -L * .38 + i * 1.4; line([-B * .47, 9.2, z], [B * .47, 9.2, z + 4], .075, i % 3 ? 0x4c5940 : 0x69744c); }
      for (let x = -B * .45; x < B * .5; x += 2) line([x, 9.3, -L * .38], [x + 3, 9.3, L * .38], .07, 0x3e503b);
      for (let i = 0; i < 160; i++) {
        const x = (noise(i * 7, 13) - .5) * B * .9, z = (noise(i * 9, 41) - .5) * L * .75;
        put(color(new THREE.IcosahedronGeometry(1, 0).scale(1.1, .08, 2.2).rotateY(i * 2.4).translate(x, 9.4, z), i % 3 ? 0x45563b : 0x6c704b), z, true);
      }
    } else { cyl(0, 1, 0, B * .55, 2, 0x787d67); if (kind === 'radar') { box(0, 5, -4, 9, 8, 8, 0x7d8274); cyl(0, 11, 0, 1.5, 14); } }
    if (kind === 'flak88') { cyl(0, 2, 0, 1.2, 3, dark); box(0, 1, 0, 9, .7, 1, steel); box(0, 1, 0, 1, .7, 9, steel); }
    if (kind === 'flak88' || kind === 'searchlight') for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2;
      for (let j = 0; j < 3; j++) put(color(new THREE.SphereGeometry(1, 6, 4).scale(1.4, .45, .7).rotateY(-a).translate(Math.sin(a) * B * .5, 1.6 + j * .7, Math.cos(a) * B * .5), 0x8e876b));
    }
    if (kind === 'searchlight') { cyl(0, 6, 0, 1, 10); put(color(new THREE.SphereGeometry(2.2, 12, 8).scale(1, 1, .65).translate(0, 12, 0), 0xb7c4bb)); }
    box(0, .1, 0, B + 6, .2, L + 6, 0x60664d);
  } else {
    put(hullSection(L, B, H, true, kind === 'uboat')); put(hullSection(L, B, H, false, kind === 'uboat'), -1);
    if (kind === 'battleship' || kind === 'cruiser') {
      box(0, H + 2, 0, B * .62, 4, L * .38); box(0, H + 5, L * .08, B * .42, 4, L * .2, light);
      box(0, H + 10, L * .115, B * .29, 12, L * .065); bridge(L * .13, H + 16, B * .45, 9);
      for (const z of kind === 'battleship' ? [-.34, -.24, .24, .34] : [-.33, .25, .35]) {
        const h = Math.abs(z) < .3 ? 6 : 3; cyl(0, H + (h - 2) / 2, L * z, 4.9, h - 2, steel);
      }
      // Stepped bridge galleries, directors, wing searchlights and ventilation banks.
      box(0, H + 9, L * .13, B * .4, .7, 13, dark);
      box(0, H + 12, L * .13, B * .36, .6, 11, light);
      for (const side of [-1, 1]) {
        cyl(side * B * .28, H + 6, L * .06, 1.2, 3);
        put(color(new THREE.SphereGeometry(1.2, 10, 8).scale(1, 1, .7).translate(side * B * .28, H + 8, L * .06), 0xc5c1a1), L * .06, true);
        for (let j = 0; j < 5; j++) box(side * B * .316, H + 2.5, -L * .02 + j * 3, .15, 1.1, 1.8, dark, true);
        line([side * B * .2, H + 5, -L * .09], [side * B * .27, H + 15, -L * .04], .22, steel, false);
        line([side * B * .27, H + 15, -L * .04], [side * B * .44, H + 11, -L * .04], .18, steel, false);
        for (let y = H + 4; y < H + 15; y += .7) line([side * B * .15, y, L * .084], [side * (B * .15 + .8), y, L * .084], .07);
      }
      cyl(0, H + 20, L * .13, 3.5, 5); box(0, H + 23, L * .13, 14, 1.3, 2.4, dark);
      mast(L * .08, H + 12, 25, true); funnel(-L * .025, H + 5, 15, B * .105);
      box(0, H + 5, -L * .13, B * .37, 7, 13, light); mast(-L * .15, H + 8, 21, true);
      box(0, H + 4.5, -L * .07, B * .88, 1, 2, dark); // transverse aircraft catapult
      for (const side of [-1, 1]) for (const z of [-.16, -.02, .14]) {
        const x = side * B * .37;
        cyl(x, H + 1, z * L, 3.2, 2); box(x, H + 3, z * L, 5, 3, 5, light);
        for (const d of [-.8, .8]) line([x + d, H + 3.5, z * L], [x + d, H + 3.5, z * L + (z > 0 ? 9 : -9)], .23, dark, false);
      }
    } else if (kind === 'uboat') {
      // Type VII pressure hull and saddle tanks under the narrow casing.
      for (const side of [-1, 1]) put(color(new THREE.SphereGeometry(1, 20, 10).scale(B * .24, 2, L * .34).translate(side * B * .3, .2, -2), steel));
      cyl(0, 4, 0, 2, 5); put(color(new THREE.CylinderGeometry(2, 2.2, 4, 16).scale(1, 1, 1.7).translate(0, 5, -1), steel)); cyl(0, 6.6, -4, 2.7, .4, dark);
      for (const z of [0, 1.4]) cyl(0, 10, z, .16, 7, dark);
      for (let i = 0; i < 14; i++) { const a = i * Math.PI * 2 / 14; line([Math.sin(a) * 2.6, 6.7, -4 + Math.cos(a) * 2.6], [Math.sin(a) * 2.6, 8, -4 + Math.cos(a) * 2.6], .07); }
      put(color(new THREE.TorusGeometry(2.6, .07, 4, 20).rotateX(Math.PI / 2).translate(0, 8, -4), dark), -4, true);
      line([0, H + .6, L * .43], [0, 8.5, 1], .04); line([0, 8.5, -3], [0, H + .6, -L * .43], .04);
    } else if (kind === 'merchant') {
      for (const z of [-.32, -.13, .29]) { box(0, H + 1, z * L, B * .64, 2, L * .13, dark); box(0, H + 2.1, z * L, B * .6, .3, L * .12, 0x766b54); }
      box(0, H + 4, L * .07, B * .76, 8, L * .14, light); bridge(L * .1, H + 9, B * .78, 8); funnel(0, H + 8, 10, 2.5);
      for (const z of [-.22, .2]) { mast(z * L, H, 23); for (const side of [-1, 1]) { line([0, H + 4, z * L], [side * 4, H + 16, z * L + side * 15], .25, 0x988e70, false); line([0, H + 23, z * L], [side * 4, H + 16, z * L + side * 15], .045); } }
    } else {
      const small = kind === 'eboat';
      box(0, H + 1.5, L * .08, B * .65, 3, L * .3, steel); bridge(L * .13, H + (small ? 3 : 6), B * .64, L * .085);
      if (!small) { box(0, H + 3.6, L * .13, B * .48, 3.5, L * .085); funnel(-L * .03, H + 2, B * .6, B * .13); if (kind === 'destroyer') funnel(-L * .17, H + 2, B * .55, B * .12); mast(L * .05, H + 4, B * 1.6, true); }
      else { mast(0, H + 2, 5); cyl(0, H + .6, L * .3, 1.1, 1); line([0, H + 1.3, L * .3], [0, H + 1.6, L * .42], .12, dark, false); }
      if (kind === 'destroyer') {
        for (const z of [-.09, -.23]) for (let i = -1; i <= 1; i++) line([i * .8, H + 1.7, L * z - 3], [i * .8, H + 1.7, L * z + 3], .35, dark, false);
        // An extra single mount are visual auxiliaries; damage-part count stays unchanged.
        for (const z of [-.24]) { cyl(0, H + 1, L * z, 2, 2); line([0, H + 2, L * z], [0, H + 3, L * z + (z > 0 ? 7 : -7)], .2, dark, false); }
      }
    }
    // Fine deck fittings disappear on Low / beyond 1.8 km, in only two extra draw calls.
    if (kind !== 'uboat') {
      for (const side of [-1, 1]) {
        for (let z = -L * .4; z < L * .43; z += 5) {
          const x = side * B * .46 * (1 - Math.pow(Math.abs(z) / (L * .52), 4));
          line([x, H + .6, z], [x, H + 1.8, z], .065);
          const next = z + 5, nx = side * B * .46 * (1 - Math.pow(Math.abs(next) / (L * .52), 4));
          line([x, H + 1.8, z], [nx, H + 1.8, next], .045);
        }
        for (const z of [-.07, .05]) {
          put(color(new THREE.SphereGeometry(1, 10, 6).scale(B * .055, .65, L * .025).translate(side * B * .34, H + 5, z * L), 0xb4ad91), z, true);
          line([side * B * .26, H + 4, z * L], [side * B * .38, H + 7, z * L], .12);
        }
        line([side * B * .14, H + 1, L * .4], [side * B * .21, H, L * .46], .16);
        box(side * B * .23, H * .5, L * .4, .3, 2.8, .4, dark, true);
        box(side * B * .23, H * .5 - 1, L * .4, 2, .4, .5, dark, true);
      }
      for (let x = -B * .32; x < B * .33; x += .9) box(x, H + .04, 0, .035, .025, L * .64, 0x635d50, true);
      for (const z of [-.36, .37]) { cyl(0, H + .5, z * L, 1, 1, dark); box(0, H + 1, z * L, 3, .4, .5, dark, true); }
    }
  }
  // Empty groups use a degenerate triangle, avoiding a different material/layout on warmup.
  for (const group of parts) if (!group.length) group.push(block(0, 0, 0, 0, 0, 0, dark));
  const result = parts.map(merge); cache.set(kind, result); return result;
}

export function radarGeometry() {
  const dish = color(new THREE.SphereGeometry(5.5, 20, 12, 0, Math.PI * 2, 0, Math.PI * .42).scale(1, .33, 1).rotateX(Math.PI / 2 - .4), 0x788c85);
  return merge([dish, rod([0, 0, 0], [0, 2, 5], .12, dark), block(0, 0, -1, 1.5, 2, 2, steel)]);
}

/** Repeating neutral grain, generated without DOM/canvas so geometry tests run in Node. */
export function detailTexture() {
  const a = new Uint8Array(128 * 128 * 4);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const i = (y * 128 + x) * 4, n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    const v = 169 + (n - Math.floor(n)) * 54 + 25 * Math.sin(y * .35 + Math.sin(x * .04)); a[i] = a[i + 1] = a[i + 2] = v; a[i + 3] = 255;
  }
  const t = new THREE.DataTexture(a, 128, 128); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t;
}

function noise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const hash = (a: number, b: number) => { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); };
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), u), THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
}
export function coastGeometry() {
  const parts: THREE.BufferGeometry[] = [], pos: number[] = [], uv: number[] = [], colors: number[] = [], idx: number[] = [];
  const c = new THREE.Color(), scrub = new THREE.Color(0x756d48);
  // Beach stays below the existing 16 m collision shelf; cliff crest stays below 47 m.
  const xs: number[] = []; for (let x = 2820; x < 3260; x += 20) xs.push(x); for (let x = 3260; x <= 3270; x++) xs.push(x);
  for (let x = 3280; x <= 6000; x += 40) xs.push(x);
  const profile = (x: number) => x < 2900 ? -3 + (x - 2820) * .075 : x <= 3260 ? 3 + (x - 2900) * .034 : x <= 3270 ? 16 + (x - 3260) * 2.8 : 44;
  for (let iz = 0; iz <= 450; iz++) for (let ix = 0; ix < xs.length; ix++) {
    const z = iz * 40 - 9000, n = Math.sin(z * .012) * 14 + Math.sin(z * .039) * 7;
    const cliff = xs[ix] >= 3260 && xs[ix] <= 3270;
    const x = xs[ix] + (xs[ix] < 3260 ? n : xs[ix] < 3280 ? Math.abs(n) : 0);
    let y = profile(xs[ix]) + (noise(x * .025, z * .025) - .5) * (xs[ix] > 3280 ? 4 : 1.5);
    y = Math.min(y, x < 2900 ? 0 : x < 3260 ? 16 : 47);
    pos.push(x, y, z); uv.push(cliff ? z * .06 : x * .13, cliff ? y * .04 : z * .13);
    const grain = noise(x * .022 + 12, z * .022);
    c.setHex(xs[ix] < 3260 ? 0x958e73 : cliff ? 0x62635a : 0x425334);
    if (xs[ix] > 3270) c.lerp(scrub, Math.max(0, grain - .45));
    c.multiplyScalar(.7 + grain * .4 + (cliff ? .15 * Math.sin(y * 1.8 + noise(0, z * .1) * 2) : 0));
    colors.push(c.r, c.g, c.b);
    if (iz < 450 && ix < xs.length - 1) { const a = iz * xs.length + ix, b = a + xs.length; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  }
  const terrain = new THREE.BufferGeometry(); terrain.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); terrain.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); terrain.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); terrain.setIndex(idx); terrain.computeVertexNormals(); parts.push(terrain);
  for (let i = 0; i < 210; i++) {
    const z = i * 85 - 8800 + noise(i, 7) * 65, n = Math.sin(z * .012) * 14 + Math.sin(z * .039) * 7;
    parts.push(color(new THREE.IcosahedronGeometry(9 + i % 13, 1).scale(1, .4, 1.6).translate(3215 + n + (noise(i, 3) - .5) * 90, 14 + i % 4, z), i % 2 ? 0x525c57 : 0x6c7367));
    if (i % 3 === 0) parts.push(color(new THREE.IcosahedronGeometry(7, 1).scale(2, .3, 1).translate(3320 + noise(i, 1) * 450, 46, z), 0x42563b));
    if (i % 2 === 0) parts.push(color(new THREE.IcosahedronGeometry(12 + i % 7, 1).scale(.8, 1.3, 1.9).translate(3268 + Math.abs(n), 24, z + 17), 0x4a544b));
  }
  for (let i = 0; i < 60; i++) { parts.push(block(2335 + i * 15, 7, 650, 14.5, 14, 38, i % 3 ? 0x686f68 : 0x85867b)); if (i < 34) parts.push(block(2340, 7, 658 + i * 15, 38, 14, 14.5, 0x747970)); }
  // Harbour light, lantern gallery and pitched-roof shore buildings.
  parts.push(cylinder(2340, 28, 650, 6, 40, 0xb6b39d, 4), cylinder(2340, 49, 650, 6, 2, dark), cylinder(2340, 53, 650, 3.5, 6, 0x697e7e), cylinder(2340, 57, 650, 5, 2, 0x883f34, 0));
  for (let i = 0; i < 9; i++) {
    const x = 3450 + (i % 3) * 55, z = 520 + Math.floor(i / 3) * 70;
    parts.push(block(x, 52, z, 28, 12, 42, 0x9b9b86));
    parts.push(color(new THREE.CylinderGeometry(0, 1, 1, 4).rotateY(Math.PI / 4).scale(23, 9, 34).translate(x, 62, z), 0x635b4d));
    for (let k = -1; k <= 1; k++) parts.push(block(x - 14.1, 53, z + k * 11, .2, 2.5, 3, dark));
  }
  return merge(parts);
}

export function shorelineGeometry() {
  const p: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= 360; i++) {
    const z = i * 50 - 9000, x = 2860 + Math.sin(z * .012) * 14 + Math.sin(z * .039) * 7;
    p.push(x - 17, 1.5, z, x + 9, 1.5, z); uv.push(0, z / 40, 1, z / 40);
    if (i < 360) { const n = i * 2; idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}

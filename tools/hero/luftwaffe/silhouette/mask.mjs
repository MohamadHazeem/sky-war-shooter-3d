// Binary-mask helpers for the silhouette gate (Uint8Array, 1 = inside, row-major w x h).

/** 8-connected components: [{area, x0, y0, x1, y1, label: Uint8Array(w*h) of this blob}] */
export function components(m, w, h) {
  const seen = new Int32Array(w * h).fill(-1);
  const out = [];
  const stack = [];
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || seen[s] >= 0) continue;
    const id = out.length;
    const label = new Uint8Array(w * h);
    let area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    stack.push(s); seen[s] = id;
    while (stack.length) {
      const p = stack.pop();
      label[p] = 1; area++;
      const x = p % w, y = (p / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (m[q] && seen[q] < 0) { seen[q] = id; stack.push(q); }
      }
    }
    out.push({ area, x0, y0, x1, y1, label });
  }
  return out;
}

/** square-structuring-element dilation (r px) */
export function dilate(m, w, h, r) {
  const t = new Uint8Array(w * h), o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let run = -1e9;
    for (let x = 0; x < w; x++) { if (m[y * w + x]) run = x; if (x - run <= r) t[y * w + x] = 1; }
    run = 1e9;
    for (let x = w - 1; x >= 0; x--) { if (m[y * w + x]) run = x; if (run - x <= r) t[y * w + x] = 1; }
  }
  for (let x = 0; x < w; x++) {
    let run = -1e9;
    for (let y = 0; y < h; y++) { if (t[y * w + x]) run = y; if (y - run <= r) o[y * w + x] = 1; }
    run = 1e9;
    for (let y = h - 1; y >= 0; y--) { if (t[y * w + x]) run = y; if (run - y <= r) o[y * w + x] = 1; }
  }
  return o;
}
export function erode(m, w, h, r) {
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inv[i] = m[i] ? 0 : 1;
  const d = dilate(inv, w, h, r);
  for (let i = 0; i < w * h; i++) inv[i] = d[i] ? 0 : 1;
  return inv;
}
export const closeMask = (m, w, h, r) => erode(dilate(m, w, h, r), w, h, r);
export const openMask = (m, w, h, r) => dilate(erode(m, w, h, r), w, h, r);

/** everything not reachable from the border through empty pixels becomes inside */
export function fillHoles(m, w, h) {
  const out = new Uint8Array(w * h).fill(1);
  const stack = [];
  const push = (x, y) => { const p = y * w + x; if (!m[p] && out[p]) { out[p] = 0; stack.push(p); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const p = stack.pop(), x = p % w, y = (p / w) | 0;
    if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1);
  }
  return out;
}

export function bbox(m, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

/** scanline triangle fill into mask (pixel centres) */
export function fillTri(m, w, h, ax, ay, bx, by, cx, cy) {
  const minY = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 0.5)), maxY = Math.min(h - 1, Math.floor(Math.max(ay, by, cy) - 0.5));
  const E = [[ax, ay, bx, by], [bx, by, cx, cy], [cx, cy, ax, ay]];
  for (let y = minY; y <= maxY; y++) {
    const py = y + 0.5;
    let lo = Infinity, hi = -Infinity;
    for (const [x0, y0, x1, y1] of E) {
      if ((y0 <= py && py < y1) || (y1 <= py && py < y0)) {
        const x = x0 + (x1 - x0) * (py - y0) / (y1 - y0);
        if (x < lo) lo = x; if (x > hi) hi = x;
      }
    }
    if (lo > hi) continue;
    const xa = Math.max(0, Math.ceil(lo - 0.5)), xb = Math.min(w - 1, Math.floor(hi - 0.5));
    for (let x = xa; x <= xb; x++) m[y * w + x] = 1;
  }
}

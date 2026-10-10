// Cracked-glass overlay for the gunner's view. Each heavy hit on the gunner's position adds an
// impact layer: a spider-web of jittered spokes and rings around a bullet hole. The cracks race
// outward for a moment, hold, then fade over LIFE seconds. Geometry is built once per hit in
// unit space (1 = half the short screen side) so it stays correct when the window resizes.

const LIFE = 6;        // seconds a layer stays on screen in total
const HOLD = 0.6;      // seconds at full strength before the fade starts
const SPREAD = 0.35;   // seconds for the cracks to spread out from the impact
const MAX_LAYERS = 3;  // oldest layer is dropped beyond this, so repeated hits stay readable

interface Seg { x0: number; y0: number; x1: number; y1: number; d0: number; d1: number }
interface Pt { x: number; y: number }
interface Layer {
  ix: number; iy: number;   // impact point as fractions of the screen size
  main: Seg[];              // long spokes, drawn heavier
  thin: Seg[];              // branches, rings and shards
  age: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function seg(list: Seg[], ax: number, ay: number, bx: number, by: number) {
  list.push({ x0: ax, y0: ay, x1: bx, y1: by, d0: Math.hypot(ax, ay), d1: Math.hypot(bx, by) });
}

// Walks one jittered crack outward from (x, y). Main spokes record their path in `pts` so the
// rings can join neighbouring spokes at the same radius; branches go into `thin` only.
function walk(out: Seg[], thin: Seg[], pts: Pt[] | null, x: number, y: number, ang: number, len: number, depth: number) {
  let t = 0;
  while (t < len) {
    const l = Math.min(rnd(0.04, 0.075), len - t);
    ang += rnd(-0.16, 0.16);
    const nx = x + Math.cos(ang) * l, ny = y + Math.sin(ang) * l;
    seg(out, x, y, nx, ny);
    if (pts) pts.push({ x: nx, y: ny });
    if (depth < 2 && t > 0.12 && Math.random() < 0.1) {
      walk(thin, thin, null, nx, ny, ang + (Math.random() < 0.5 ? -1 : 1) * rnd(0.35, 0.8), (len - t) * rnd(0.2, 0.35), depth + 1);
    }
    x = nx; y = ny; t += l;
  }
}

// First point on a spoke that has reached radius R, or null if the spoke stopped short of it.
function reach(pts: Pt[], R: number): Pt | null {
  for (const p of pts) if (Math.hypot(p.x, p.y) >= R) return p;
  return null;
}

function buildLayer(ix: number, iy: number): Layer {
  const main: Seg[] = [], thin: Seg[] = [];
  const n = 9 + Math.floor(Math.random() * 5);
  const base = Math.random() * Math.PI * 2;
  const chains: Pt[][] = [];
  for (let i = 0; i < n; i++) {
    const pts: Pt[] = [];
    walk(main, thin, pts, 0, 0, base + (i / n) * Math.PI * 2 + rnd(-0.2, 0.2), rnd(0.5, 1.15), 0);
    chains.push(pts);
  }
  // Rings join neighbouring spokes at a set of radii; some are left broken so it reads as glass
  for (const R of [0.13, 0.23, 0.36, 0.5, 0.66, 0.84]) {
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.15) continue;
      const a = reach(chains[i], R), b = reach(chains[(i + 1) % n], R);
      if (!a || !b) continue;
      // Bow the midpoint back onto the ring radius, with a little sag, so the arc looks like tension
      let mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const len = Math.hypot(mx, my) || 1;
      const k = (R / len) * (1 + rnd(-0.05, 0.05));
      const px = mx * k + rnd(-0.012, 0.012), py = my * k + rnd(-0.012, 0.012);
      seg(thin, a.x, a.y, px, py);
      seg(thin, px, py, b.x, b.y);
    }
  }
  // Small shard ticks scattered around the hole
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, r = rnd(0.03, 0.14);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    seg(thin, x, y, x + Math.cos(a) * 0.035, y + Math.sin(a) * 0.035);
  }
  return { ix, iy, main, thin, age: 0 };
}

// 1 while held, then a smoothstep fade to 0 at LIFE
function fade(age: number): number {
  const t = Math.min(1, Math.max(0, (age - HOLD) / (LIFE - HOLD)));
  return age < HOLD ? 1 : 1 - t * t * (3 - 2 * t);
}

function strokeSegs(ctx: CanvasRenderingContext2D, list: Seg[], cx: number, cy: number, s: number, reveal: number, lw: number, a: number) {
  ctx.beginPath();
  for (const g of list) {
    if (g.d0 > reveal) continue;
    let x1 = g.x1, y1 = g.y1;
    if (g.d1 > reveal) {
      const t = (reveal - g.d0) / (g.d1 - g.d0);
      x1 = g.x0 + (g.x1 - g.x0) * t; y1 = g.y0 + (g.y1 - g.y0) * t;
    }
    ctx.moveTo(cx + g.x0 * s, cy + g.y0 * s);
    ctx.lineTo(cx + x1 * s, cy + y1 * s);
  }
  // Dark edge under a bright line gives the cracks some depth on the glass
  ctx.strokeStyle = `rgba(6,14,24,${0.45 * a})`; ctx.lineWidth = lw + 1.6; ctx.stroke();
  ctx.strokeStyle = `rgba(232,244,255,${0.85 * a})`; ctx.lineWidth = lw; ctx.stroke();
}

export class GlassCracks {
  private layers: Layer[] = [];

  // Called on a heavy hit to the gunner's position
  hit(): void {
    if (this.layers.length >= MAX_LAYERS) this.layers.shift();
    // impact points stay out toward the edges so the sight picture stays clear
    const side = Math.random() < 0.5 ? rnd(0.06, 0.24) : rnd(0.76, 0.94);
    this.layers.push(buildLayer(side, rnd(0.12, 0.88)));
  }

  update(dt: number): void {
    if (!this.layers.length) return;
    for (const L of this.layers) L.age += dt;
    this.layers = this.layers.filter((L) => L.age < LIFE);
  }

  clear(): void {
    this.layers = [];
  }

  // Draws onto the 2D HUD canvas in CSS pixels (the caller has already set the dpr transform)
  draw(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    if (!this.layers.length) return;
    const s = Math.min(W, H) * 0.5;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const L of this.layers) {
      const a = fade(L.age);
      if (a <= 0) continue;
      const p = Math.min(1, L.age / SPREAD);
      const reveal = (1 - (1 - p) * (1 - p)) * 1.25;   // ease-out spread, in unit-space distance
      const cx = L.ix * W, cy = L.iy * H;
      // Frosted, whitened core around the impact
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.6);
      g.addColorStop(0, `rgba(235,246,255,${0.3 * a})`);
      g.addColorStop(0.4, `rgba(205,228,248,${0.1 * a})`);
      g.addColorStop(1, 'rgba(205,228,248,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.6, 0, Math.PI * 2); ctx.fill();
      strokeSegs(ctx, L.main, cx, cy, s, reveal, 1.8, a);
      strokeSegs(ctx, L.thin, cx, cy, s, reveal, 1.0, a);
      // The hole where the round struck
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.026, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(6,12,20,${0.85 * a})`; ctx.fill();
      ctx.strokeStyle = `rgba(240,250,255,${0.9 * a})`; ctx.lineWidth = 1.4; ctx.stroke();
    }
    ctx.restore();
  }
}

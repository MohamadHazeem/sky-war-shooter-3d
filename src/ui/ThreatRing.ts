import { liveMarkerTarget } from './MarkerProjection';
import { recordMarker } from './MarkerAudit';
import * as THREE from 'three';
import type { World } from '../world/World';

/**
 * Clock-face threat ring for the 2D HUD canvas. Enemy fighters within 3 km show as red
 * dots around a clock whose 12 o'clock is the player's nose. Dot size carries altitude
 * against the player (bigger = above, smaller = below). Close fighters are brighter and
 * pulse so the one that is closing fastest stands out.
 */

const RANGE = 3000;      // m, threat horizon
const CLOSE = 1000;      // m, inside this the dot brightens and pulses
const ALT_SCALE = 300;   // m of height difference for a full dot-size step
const INSET = 22;        // matches the .hud-bl inset so the ring lines up with the instruments

let lastFx = 0, lastFz = 1;        // last usable horizontal heading (kept when pitched near-vertical)
let blTop = -1, blCheckT = -1e9;   // cached top edge of the bottom-left HUD block

const _fwd = new THREE.Vector3();
const _to = new THREE.Vector3();

// Ring sits just above the bottom-left instrument block. Measured at most every 250 ms
// to avoid forcing layout each frame.
function hudBlockTop(H: number): number {
  const now = performance.now();
  if (now - blCheckT > 250) {
    blCheckT = now;
    const r = document.getElementById('hBL')?.getBoundingClientRect();
    blTop = r && r.height > 0 ? r.top : -1;
  }
  return blTop > 0 ? blTop : H - 130;
}

export function draw(ctx: CanvasRenderingContext2D, W: number, H: number, world: World, camera: THREE.Camera): void {
  const pl = world.player;
  if (pl && !pl.alive) return;
  // Viewpoint is the player aircraft; fall back to the camera if there is none
  const origin = pl ? pl.pos : camera.position;
  const fwd = pl ? pl.forward(_fwd) : camera.getWorldDirection(_fwd);

  // Horizontal heading only, so climbs and dives don't tilt the clock
  let fx = fwd.x, fz = fwd.z;
  const hl = Math.hypot(fx, fz);
  if (hl > 0.15) { fx /= hl; fz /= hl; lastFx = fx; lastFz = fz; } else { fx = lastFx; fz = lastFz; }
  // Right-hand side of the nose (forward x up)
  const rx = -fz, rz = fx;

  const R = THREE.MathUtils.clamp(Math.min(W, H) * 0.07, 34, 58);
  const cx = INSET + R;
  const cy = Math.max(INSET + R, hudBlockTop(H) - 14 - R);

  ctx.save();

  // Dial
  ctx.fillStyle = 'rgba(8,10,8,0.45)';
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(185,167,111,0.55)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

  // Hour ticks; the 12 o'clock tick is drawn brighter as the nose reference
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let h = 0; h < 12; h++) {
    const a = h * Math.PI / 6;
    const s = Math.sin(a), c = Math.cos(a);
    const inner = R - (h % 3 === 0 ? 7 : 4);
    ctx.moveTo(cx + s * (R - 1), cy - c * (R - 1));
    ctx.lineTo(cx + s * inner, cy - c * inner);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(235,225,180,0.95)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, cy - R + 1); ctx.lineTo(cx, cy - R + 9); ctx.stroke();

  // Own aircraft glyph at the centre, nose up
  ctx.fillStyle = 'rgba(220,215,190,0.9)';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 4.5, cy + 4); ctx.lineTo(cx, cy + 2); ctx.lineTo(cx - 4.5, cy + 4);
  ctx.closePath(); ctx.fill();

  // Threat dots
  const pr = R * 0.8;
  for (const f of world.fighters('axis')) {
    if (!liveMarkerTarget(f) || !world.spotted(f)) continue;
    _to.subVectors(f.pos, origin);
    const d = _to.length();
    if (d > RANGE) continue;
    const ahead = _to.x * fx + _to.z * fz;   // along the nose
    const right = _to.x * rx + _to.z * rz;   // across the nose
    const th = Math.atan2(right, ahead);     // clockwise from 12 o'clock
    const x = cx + Math.sin(th) * pr, y = cy - Math.cos(th) * pr;
    recordMarker('threat-dial', f, 'radar', x, y);
    // Dot size: high = larger, low = smaller
    const rad = 4 + THREE.MathUtils.clamp(_to.y / ALT_SCALE, -1, 1) * 2.2;
    const near = d < CLOSE;
    const fade = 1 - 0.55 * THREE.MathUtils.clamp((d - CLOSE) / (RANGE - CLOSE), 0, 1);
    ctx.globalAlpha = fade * (near ? 0.75 + 0.25 * Math.sin(world.time * 14) : 1);
    ctx.fillStyle = near ? 'rgb(255,95,70)' : 'rgb(225,60,45)';
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

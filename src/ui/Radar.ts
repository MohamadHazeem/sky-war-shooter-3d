import * as THREE from 'three';
import type { World } from '../world/World';
import { Bomber, Fighter } from '../world/Aircraft';

/**
 * Plan-view radar plot, north-up = the formation's heading. Compact in the bottom-left
 * corner (3 km); Tab expands it to a large centred map (8 km) with range rings and the
 * next incoming wave marked where it will arrive, with a countdown, before it appears.
 */

export interface Incoming { pos: THREE.Vector3; eta: number; count: number }

const SMALL_RANGE = 3000;
const BIG_RANGE = 8000;
const INSET = 22;

const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _d = new THREE.Vector3();

let blTop = -1, blCheckT = -1e9;
function hudBlockTop(H: number): number {
  const now = performance.now();
  if (now - blCheckT > 250) {
    blCheckT = now;
    const r = document.getElementById('hBL')?.getBoundingClientRect();
    blTop = r && r.height > 0 ? r.top : -1;
  }
  return blTop > 0 ? blTop : H - 130;
}

export function draw(ctx: CanvasRenderingContext2D, W: number, H: number, world: World, expanded: number, incoming: Incoming | null, time: number) {
  const pl = world.player;
  if (!pl || !pl.alive) return;
  const origin = pl.pos;
  // map frame: up = formation heading (stable; doesn't swing as the player turns)
  _f.copy(world.formationForward).setY(0).normalize();
  _r.set(-_f.z, 0, _f.x); // right of the heading

  const e = THREE.MathUtils.smoothstep(expanded, 0, 1);
  const smallR = THREE.MathUtils.clamp(Math.min(W, H) * 0.08, 38, 64);
  const bigR = Math.min(W, H) * 0.4;
  const R = THREE.MathUtils.lerp(smallR, bigR, e);
  const range = THREE.MathUtils.lerp(SMALL_RANGE, BIG_RANGE, e);
  const scx = INSET + smallR, scy = Math.max(INSET + smallR, hudBlockTop(H) - 14 - smallR);
  const cx = THREE.MathUtils.lerp(scx, W / 2, e), cy = THREE.MathUtils.lerp(scy, H / 2, e);
  const k = R / range;
  const toMap = (p: THREE.Vector3, out: { x: number; y: number; clipped: boolean }) => {
    _d.copy(p).sub(origin);
    let x = _d.dot(_r) * k, y = -_d.dot(_f) * k;
    const len = Math.hypot(x, y);
    out.clipped = len > R - 4;
    if (out.clipped) { x *= (R - 4) / len; y *= (R - 4) / len; }
    out.x = cx + x; out.y = cy + y;
    return out;
  };
  const m = { x: 0, y: 0, clipped: false };

  ctx.save();
  // dial
  ctx.fillStyle = `rgba(6,12,8,${0.5 + 0.25 * e})`;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(120,200,140,0.6)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  // range rings every 1 km (2 km when expanded)
  const step = e > 0.5 ? 2000 : 1000;
  ctx.strokeStyle = 'rgba(120,200,140,0.18)'; ctx.lineWidth = 1;
  for (let rr = step; rr < range; rr += step) { ctx.beginPath(); ctx.arc(cx, cy, rr * k, 0, Math.PI * 2); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
  // sweep
  const sw = (time * 1.6) % (Math.PI * 2);
  const grad = ctx.createConicGradient ? ctx.createConicGradient(sw - Math.PI / 2 - 0.6, cx, cy) : null;
  if (grad) {
    grad.addColorStop(0, 'rgba(120,220,150,0)'); grad.addColorStop(0.095, 'rgba(120,220,150,0.16)'); grad.addColorStop(0.1, 'rgba(120,220,150,0)'); grad.addColorStop(1, 'rgba(120,220,150,0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  }
  if (e > 0.5) {
    ctx.fillStyle = 'rgba(150,220,170,0.8)'; ctx.font = '11px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
    for (let rr = step; rr < range; rr += step) ctx.fillText(`${rr / 1000} km`, cx + 3, cy - rr * k + 12);
    ctx.fillText('HEADING', cx, cy - R - 8);
    ctx.fillText('TAB  close map', cx, cy + R + 18);
  }

  // incoming wave: pulsing sector where the next wave will appear, with countdown
  if (incoming && incoming.eta > 0) {
    toMap(incoming.pos, m);
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);
    ctx.strokeStyle = `rgba(255,80,50,${0.5 + 0.4 * pulse})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(m.x, m.y, 6 + 4 * pulse + 6 * e, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,80,50,0.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(cx, cy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,110,80,0.95)'; ctx.textAlign = 'center';
    ctx.font = `600 ${e > 0.5 ? 13 : 10}px "IBM Plex Mono", monospace`;
    ctx.fillText(e > 0.5 ? `${incoming.count} FIGHTERS  ${Math.ceil(incoming.eta)}s` : `${Math.ceil(incoming.eta)}s`, m.x, m.y - 12 - 6 * e);
  }

  // aircraft
  for (const a of world.aircraft) {
    if (!a.alive || a.remove || a === pl) continue;
    toMap(a.pos, m);
    if (a instanceof Bomber) {
      ctx.fillStyle = 'rgba(110,190,255,0.85)';
      ctx.fillRect(m.x - 2, m.y - 2, 4, 4);
      continue;
    }
    if (!(a instanceof Fighter)) continue;
    const enemy = a.team === 'axis';
    // heading arrow
    const hx = a.vel.dot(_r), hy = -a.vel.dot(_f);
    const ang = Math.atan2(hy, hx);
    const s = enemy ? 5 + 2 * e : 4;
    ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(ang);
    ctx.fillStyle = enemy ? (m.clipped ? 'rgba(255,90,60,0.55)' : 'rgba(255,70,45,1)') : 'rgba(110,190,255,0.9)';
    ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.7, -s * 0.6); ctx.lineTo(-s * 0.7, s * 0.6); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (enemy && e > 0.5 && !m.clipped) {
      ctx.fillStyle = 'rgba(255,120,90,0.9)'; ctx.font = '10px "IBM Plex Mono", monospace'; ctx.textAlign = 'left';
      ctx.fillText(`${a.label} ${(a.pos.distanceTo(origin) / 1000).toFixed(1)}`, m.x + 8, m.y + 3);
    }
  }
  // own aircraft
  ctx.fillStyle = 'rgba(240,230,190,1)';
  ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 4.5, cy + 4); ctx.lineTo(cx, cy + 2); ctx.lineTo(cx - 4.5, cy + 4); ctx.closePath(); ctx.fill();
  if (e < 0.5) {
    ctx.fillStyle = 'rgba(150,220,170,0.7)'; ctx.font = '9px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText('TAB  map', cx, cy + R + 11);
  }
  ctx.restore();
}

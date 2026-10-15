import { liveMarkerTarget } from './MarkerProjection';
import { recordMarker } from './MarkerAudit';
import * as THREE from 'three';
import type { World } from '../world/World';
import { Bomber, Fighter } from '../world/Aircraft';
import { BossShip } from '../world/BossShip';
import { drawBossBlip } from './BossHud';
import { access } from '../core/Accessibility';
import { keyMap } from '../core/KeyMap';
import { radarCues } from '../world/Tactics';
import { tx, CANVAS_MONO } from '../i18n';

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

// Label of the map key (remappable); touch players get a MAP button instead
const mapKey = () => (document.body.classList.contains('touch') ? '' : keyMap.label('map').toUpperCase() + '  ');

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
  const scx = H <= 500 ? W - 120 : W - INSET - smallR, scy = H <= 500 ? H - 120 : H - INSET - smallR - 24;
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
    ctx.fillStyle = 'rgba(150,220,170,0.8)'; ctx.font = `11px ${CANVAS_MONO}`; ctx.textAlign = 'center';
    for (let rr = step; rr < range; rr += step) ctx.fillText(tx('{n} km', { n: rr / 1000 }), cx + 3, cy - rr * k + 12);
    ctx.fillText(tx('HEADING'), cx, cy - R - 8);
    ctx.fillText(`${mapKey()}${tx('close map')}`, cx, cy + R + 18);
  }

  // incoming wave: pulsing sector where the next wave will appear, with countdown
  if (incoming && incoming.eta > 0) {
    toMap(incoming.pos, m);
    recordMarker('incoming-wave', null, 'forecast', m.x, m.y, incoming.pos, null, 0, 'scheduled-wave');
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);
    ctx.strokeStyle = `rgba(255,80,50,${0.5 + 0.4 * pulse})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(m.x, m.y, 6 + 4 * pulse + 6 * e, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,80,50,0.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(cx, cy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,110,80,0.95)'; ctx.textAlign = 'center';
    ctx.font = `600 ${e > 0.5 ? 13 : 10}px ${CANVAS_MONO}`;
    ctx.fillText(e > 0.5 ? tx('{n} FIGHTERS  {s}s', { n: incoming.count, s: Math.ceil(incoming.eta) }) : tx('{n}s', { n: Math.ceil(incoming.eta) }), m.x, m.y - 12 - 6 * e);
  }

  // aircraft (colours from the accessibility palette; colour-blind mode adds shapes)
  const pal = access.palette, cb = access.prefs.colorBlind;
  // enemy tactics (world/Tactics.ts): amber diamond where a coordinated attack is forming up
  for (const c of radarCues) {
    if (!c.on || time > c.until) continue;
    toMap(c.pos, m);
    recordMarker('tactics-cue', null, 'forecast', m.x, m.y, c.pos, null, 0, c.label);
    const pulse = 0.5 + 0.5 * Math.sin(time * 8);
    const s = 6 + 3 * pulse + 4 * e;
    ctx.strokeStyle = `rgba(255,196,60,${0.55 + 0.4 * pulse})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(m.x, m.y - s); ctx.lineTo(m.x + s, m.y); ctx.lineTo(m.x, m.y + s); ctx.lineTo(m.x - s, m.y); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,206,90,0.95)'; ctx.textAlign = 'center';
    ctx.font = `600 ${e > 0.5 ? 12 : 9}px ${CANVAS_MONO}`;
    ctx.fillText(tx(c.label), m.x, m.y - s - 4);
  }

  // aircraft
  for (const a of world.aircraft) {
    if (!liveMarkerTarget(a) || a === pl) continue;
    toMap(a.pos, m);
    if (a instanceof Bomber) {
      recordMarker('friendly-radar', a, 'radar', m.x, m.y);
      ctx.fillStyle = pal.friend;
      ctx.fillRect(m.x - 2, m.y - 2, 4, 4);
      continue;
    }
    if (a instanceof BossShip) { recordMarker('boss-radar', a, 'radar', m.x, m.y); drawBossBlip(ctx, m.x, m.y, e, m.clipped, time, a, a.vel.dot(_r), -a.vel.dot(_f)); continue; }
    if (!(a instanceof Fighter)) continue;
    const enemy = a.team === 'axis';
    if (enemy && !world.spotted(a)) continue;   // Night Fighter: only coned / close raiders show
    if (enemy) recordMarker('radar', a, 'radar', m.x, m.y);
    // heading arrow
    const hx = a.vel.dot(_r), hy = -a.vel.dot(_f);
    const ang = Math.atan2(hy, hx);
    const s = enemy ? 5 + 2 * e : 4;
    ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(ang);
    ctx.fillStyle = enemy ? (m.clipped ? pal.enemyDim : pal.enemy) : pal.friend;
    if (cb && !enemy) {
      // friendly fighters: a dot with a heading tick (enemies stay solid arrowheads)
      ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(2, -0.8, 4, 1.6);
    } else {
      ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.7, -s * 0.6); ctx.lineTo(-s * 0.7, s * 0.6); ctx.closePath(); ctx.fill();
      if (cb) { ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 1; ctx.stroke(); }
    }
    ctx.restore();
    if (enemy && e > 0.5 && !m.clipped) {
      ctx.fillStyle = pal.enemyText; ctx.font = `10px ${CANVAS_MONO}`; ctx.textAlign = 'left';
      ctx.fillText(`${tx(a.label)} ${(a.pos.distanceTo(origin) / 1000).toFixed(1)}`, m.x + 8, m.y + 3);
    }
  }
  // own aircraft
  ctx.fillStyle = 'rgba(240,230,190,1)';
  ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 4.5, cy + 4); ctx.lineTo(cx, cy + 2); ctx.lineTo(cx - 4.5, cy + 4); ctx.closePath(); ctx.fill();
  if (e < 0.5) {
    ctx.fillStyle = 'rgba(150,220,170,0.7)'; ctx.font = `9px ${CANVAS_MONO}`; ctx.textAlign = 'center';
    ctx.fillText(`${mapKey()}${tx('map')}`, cx, cy + R + 11);
  }
  ctx.restore();
}

// Radio/radar jamming (MissionEvents, Phase 11 goal 28): static snow over the dial and a JAMMED stamp
export function jam(ctx: CanvasRenderingContext2D, W: number, H: number, expanded: number) {
  const e = THREE.MathUtils.smoothstep(expanded, 0, 1);
  const smallR = THREE.MathUtils.clamp(Math.min(W, H) * 0.08, 38, 64);
  const R = THREE.MathUtils.lerp(smallR, Math.min(W, H) * 0.4, e);
  const scx = H <= 500 ? W - 120 : W - INSET - smallR, scy = H <= 500 ? H - 120 : H - INSET - smallR - 24;
  const cx = THREE.MathUtils.lerp(scx, W / 2, e), cy = THREE.MathUtils.lerp(scy, H / 2, e);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = 'rgba(20,24,18,0.55)';
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  for (let i = 0; i < 70; i++) {
    const y = cy - R + Math.random() * R * 2, x = cx - R + Math.random() * R * 2;
    ctx.fillStyle = `rgba(200,220,190,${(0.15 + Math.random() * 0.45).toFixed(2)})`;
    ctx.fillRect(x, y, 2 + Math.random() * R * 0.5, 1);
  }
  ctx.restore();
  ctx.save();
  ctx.font = `600 ${Math.round(Math.max(11, R * 0.24))}px Oswald, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(240,190,80,0.95)';
  ctx.fillText(tx('JAMMED'), cx, cy);
  ctx.restore();
}

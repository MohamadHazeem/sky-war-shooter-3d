import { projectMarker, markerAtmosphereAlpha, shownObject, liveMarkerTarget } from './MarkerProjection';
import { recordMarker } from './MarkerAudit';
import * as THREE from 'three';
import type { BossBattle } from '../game/BossBattle';
import type { BossShip, PartKind } from '../world/BossShip';
import { tx, CANVAS_MONO, CANVAS_SANS } from '../i18n';

/**
 * Boss battle HUD on the 2D overlay canvas: the battle group's health bar and one bar per
 * warship across the top, a big flash for breaches / enrages / kills, brackets on every
 * weak point in the world (red and pulsing while a weapon charges, with an edge arrow when
 * it is off screen), a core diamond once a hull is breached, score pop-ups, and the boss
 * blip for the radar (drawBossBlip, called from Radar.draw).
 */

const MONO = CANVAS_MONO;
const KIND_COL: Record<PartKind, string> = {
  turret: '255,196,80', flak: '255,150,60', rockets: '255,150,60', engine: '255,120,60', fuel: '255,80,60', bridge: '235,235,220',
};
const KIND_TAG: Record<PartKind, string> = { turret: 'GUN', flak: 'FLAK', rockets: 'RKT', engine: 'ENG', fuel: 'FUEL', bridge: 'BRDG' };

const _p = new THREE.Vector3();
const _w = new THREE.Vector3();
const _cam = new THREE.Vector3();
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
// one shared result (read immediately by the caller): no per-marker allocation
const PR = { x: 0, y: 0, on: false, behind: false };

function project(cam: THREE.PerspectiveCamera, pos: THREE.Vector3, W: number, H: number) {
  const p = projectMarker(pos, cam);
  _p.set(p.x, p.y, 0);
  PR.behind = !p.front;
  PR.x = (_p.x * 0.5 + 0.5) * W; PR.y = (-_p.y * 0.5 + 0.5) * H;
  PR.on = p.on;
  return PR;
}

function brackets(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const c = s * 0.45;
  ctx.beginPath();
  for (const [sx, sy] of CORNERS) {
    ctx.moveTo(x + sx * s, y + sy * s - sy * c); ctx.lineTo(x + sx * s, y + sy * s); ctx.lineTo(x + sx * s - sx * c, y + sy * s);
  }
  ctx.stroke();
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, lag: number, col: string) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = 'rgba(255,240,210,0.55)'; ctx.fillRect(x, y, w * Math.max(0, lag), h);
  ctx.fillStyle = col; ctx.fillRect(x, y, w * Math.max(0, frac), h);
}

export function drawBossHud(ctx: CanvasRenderingContext2D, W: number, H: number, cam: THREE.PerspectiveCamera, b: BossBattle) {
  const t = b.time;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  // ---------------- top: group bar + one bar per ship ----------------
  if (b.ships.length) {
    const bw = Math.min(560, W * 0.46), x0 = W / 2 - bw / 2, y0 = W < 1250 ? 110 : 78; // narrow screens: below the corner HUD blocks; wide: below the streak meter and the controls hint (top centre, ~16-50 px), which the bars covered at 22
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(232,214,160,0.95)';
    ctx.font = `600 12px ${MONO}`;
    ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 4;
    ctx.fillText(tx(b.groupName), x0, y0 - 6);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(b.groupHealth * 100)}%`, x0 + bw, y0 - 6);
    ctx.shadowBlur = 0;
    bar(ctx, x0, y0, bw, 11, b.groupHealth, b.groupLag, 'rgba(214,52,36,0.95)');
    // ticks at each ship's share
    const n = b.ships.length, gap = 10, sw = (bw - gap * (n - 1)) / n;
    b.ships.forEach((s, i) => {
      const sh = s.ship, x = x0 + i * (sw + gap), y = y0 + 30;
      const dead = s.deathT >= 0;
      ctx.textAlign = 'left';
      ctx.font = `600 10px ${MONO}`;
      ctx.fillStyle = dead ? 'rgba(160,150,130,0.6)' : 'rgba(240,228,200,0.95)';
      ctx.fillText(tx(sh.def.name).toUpperCase(), x, y - 4);
      if (dead) { ctx.fillRect(x, y - 8, ctx.measureText(tx(sh.def.name).toUpperCase()).width, 1); }
      bar(ctx, x, y, sw, 5, sh.health, s.lag, s.enraged ? 'rgba(255,120,40,0.95)' : 'rgba(214,52,36,0.95)');
      // status tag
      let tag = '', col = '170,170,160';
      if (dead) { tag = tx('DESTROYED'); col = '150,140,120'; }
      else if (s.desperate) { tag = tx('LAST STAND'); col = '255,60,40'; }
      else if (sh.breached) { tag = tx('BREACHED'); col = '255,80,50'; }
      else { tag = tx('ARMOURED {n}/{m}', { n: sh.partsLost, m: sh.breachNeed }); col = '190,200,210'; }
      if (s.enraged && !dead && !s.desperate) tag += ' · ' + tx('ENRAGED');
      const blink = (s.desperate || (sh.breached && !dead)) ? 0.65 + 0.35 * Math.sin(t * 8) : 1;
      ctx.fillStyle = `rgba(${col},${0.95 * blink})`;
      ctx.font = `9px ${MONO}`;
      ctx.fillText(tag, x, y + 15);
      if (s.heavy && s.heavy.t < s.heavy.charge && !dead) {
        ctx.fillStyle = `rgba(255,70,40,${0.6 + 0.4 * Math.sin(t * 14)})`;
        ctx.textAlign = 'right';
        ctx.fillText(tx('CHARGING'), x + sw, y - 4);
      }
    });
  }

  // ---------------- in-world markers ----------------
  const focal = H / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
  const camPos = cam.getWorldPosition(_cam);
  for (const s of b.ships) {
    const sh = s.ship;
    if (s.deathT >= 0 || !liveMarkerTarget(sh) || !shownObject(sh.root)) continue;
    const alpha = markerAtmosphereAlpha(sh.pos, cam, 3000);
    if (alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    const d = sh.pos.distanceTo(camPos);
    if (d > 3000) continue;
    const showTags = d < 700;
    for (const part of sh.parts) {
      if (!part.alive) continue;
      sh.partPos(part, _w);
      const pd = _w.distanceTo(camPos);
      if (markerAtmosphereAlpha(_w, cam, 3000) <= 0) continue;
      const pr = project(cam, _w, W, H);
      const charging = part.charge > 0;
      if (!pr.on) {
        if (charging && s.heavy?.part === part) {
          recordMarker('boss-part-arrow', sh, 'edge', pr.x, pr.y, _w, sh.root, 3000, sh.id, part);
          edgeArrow(ctx, W, H, pr, t, `${tx(sh.def.name).toUpperCase()} · ${tx(KIND_TAG[part.kind])}`);
        }
        continue;
      }
      recordMarker('boss-part', sh, 'world', pr.x, pr.y, _w, sh.root, 3000, sh.id, part);
      const sz = THREE.MathUtils.clamp((part.zone.radius / pd) * focal * 0.9, 5, 22);
      if (charging) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 16);
        ctx.strokeStyle = `rgba(255,${50 + 60 * pulse},40,${0.75 + 0.25 * pulse})`;
        ctx.lineWidth = 2.5;
        brackets(ctx, pr.x, pr.y, sz * (1.5 + 0.25 * pulse));
        if (s.heavy?.part === part || part.kind === 'bridge') {
          ctx.fillStyle = 'rgba(255,90,60,0.95)'; ctx.textAlign = 'center'; ctx.font = `700 12px ${MONO}`;
          const left = s.heavy ? Math.max(0, s.heavy.charge - s.heavy.t) : 0;
          ctx.fillText(`! ${tx(KIND_TAG[part.kind])} ${tx('{n}s', { n: left.toFixed(1) })}`, pr.x, pr.y - sz * 1.8 - 4);
        }
      } else {
        const hit = part.hitT < 0.12;
        ctx.strokeStyle = hit ? 'rgba(255,255,255,1)' : `rgba(${KIND_COL[part.kind]},0.85)`;
        ctx.lineWidth = hit ? 2 : 1.4;
        brackets(ctx, pr.x, pr.y, sz);
        // small health tick under damaged parts
        if (part.hp < part.maxHp) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(pr.x - sz, pr.y + sz + 3, sz * 2, 2.5);
          ctx.fillStyle = `rgba(${KIND_COL[part.kind]},0.95)`; ctx.fillRect(pr.x - sz, pr.y + sz + 3, sz * 2 * Math.max(0, part.hp / part.maxHp), 2.5);
        }
      }
      if (showTags && !charging) {
        ctx.fillStyle = `rgba(${KIND_COL[part.kind]},0.8)`; ctx.textAlign = 'center'; ctx.font = `9px ${MONO}`;
        ctx.fillText(tx(KIND_TAG[part.kind]), pr.x, pr.y - sz - 3);
      }
    }
    const c = project(cam, sh.pos, W, H);
    if (c.on) {
      if (sh.breached) {
        recordMarker('boss-core', sh, 'world', c.x, c.y, sh.pos, sh.root, 3000);
        // exposed core: pulsing diamond on the hull
        const pulse = 0.5 + 0.5 * Math.sin(t * 7);
        const r = 11 + 4 * pulse;
        ctx.strokeStyle = `rgba(255,70,45,${0.7 + 0.3 * pulse})`; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(c.x, c.y - r); ctx.lineTo(c.x + r, c.y); ctx.lineTo(c.x, c.y + r); ctx.lineTo(c.x - r, c.y); ctx.closePath(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,90,60,0.95)'; ctx.textAlign = 'center'; ctx.font = `700 10px ${MONO}`;
        ctx.fillText(tx('HULL EXPOSED'), c.x, c.y + r + 13);
      } else if (s.armourPing > 0) {
        recordMarker('boss-armour', sh, 'world', c.x, c.y, sh.pos, sh.root, 3000);
        ctx.fillStyle = `rgba(200,210,220,${Math.min(1, s.armourPing * 2)})`; ctx.textAlign = 'center'; ctx.font = `700 11px ${MONO}`;
        ctx.fillText(tx('ARMOURED'), c.x, c.y + 26);
      }
    }
  }
  ctx.globalAlpha = 1;
  // ram warning
  for (const s of b.ships) {
    const h = s.heavy;
    if (!h || h.kind !== 'ram' || s.deathT >= 0) continue;
    const a = 0.6 + 0.4 * Math.sin(t * 10);
    ctx.fillStyle = `rgba(255,60,40,${a})`; ctx.textAlign = 'center'; ctx.font = `700 26px ${CANVAS_SANS}`;
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 8;
    ctx.fillText(h.t < h.charge ? tx('{name} IS TURNING TO RAM', { name: tx(s.ship.def.name).toUpperCase() }) : tx('RAMMING RUN — SHOOT HER DOWN'), W / 2, H * 0.2);
    ctx.shadowBlur = 0;
  }

  // ---------------- flash text ----------------
  const f = b.flash;
  if (f.t > 0) {
    const a = Math.min(1, f.t / 0.6), pop = 1 + Math.max(0, f.t - 2.3) * 0.6;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 10;
    ctx.fillStyle = `rgba(${f.color},${a})`;
    ctx.font = `600 ${Math.round(40 * pop)}px ${CANVAS_SANS}`;
    ctx.fillText(f.title, W / 2, H * 0.4);
    ctx.font = `600 13px ${MONO}`;
    ctx.fillStyle = `rgba(240,228,200,${a})`;
    ctx.fillText(f.sub, W / 2, H * 0.4 + 24);
    ctx.shadowBlur = 0;
  }

  // ---------------- pop-ups ----------------
  ctx.textAlign = 'center';
  ctx.font = `600 18px ${CANVAS_SANS}`;
  for (const p of b.popups) {
    if (!p.live) continue;
    const pr = project(cam, p.pos, W, H);
    if (pr.behind) continue;
    ctx.fillStyle = `rgba(${p.color},${Math.min(1, p.life / 0.6)})`;
    ctx.fillText(p.text, pr.x, pr.y);
  }
  ctx.restore();
}

function edgeArrow(ctx: CanvasRenderingContext2D, W: number, H: number, pr: { x: number; y: number; behind: boolean }, t: number, label: string) {
  let ex = pr.x - W / 2, ey = pr.y - H / 2;
  if (pr.behind) { ex = -ex; ey = -ey; }
  const ang = Math.atan2(ey, ex);
  const r = Math.min(W, H) * 0.38;
  const x = W / 2 + Math.cos(ang) * r, y = H / 2 + Math.sin(ang) * r;
  const a = 0.6 + 0.4 * Math.sin(t * 14);
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = `rgba(255,60,40,${a})`;
  ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-6, -11); ctx.lineTo(-6, 11); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = `rgba(255,90,60,${a})`; ctx.textAlign = 'center'; ctx.font = `700 10px ${MONO}`;
  ctx.fillText(`! ${label}`, x, y + 24);
}

// Radar blip for a warship: a big red hull outline with its heading (Radar.draw)
export function drawBossBlip(ctx: CanvasRenderingContext2D, x: number, y: number, expanded: number, clipped: boolean, time: number, ship: BossShip, hx: number, hy: number) {
  const s = (ship.def.flagship ? 10 : 8) + 4 * expanded;
  const ang = Math.atan2(hy, hx);
  const pulse = 0.65 + 0.35 * Math.sin(time * 5);
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = clipped ? 'rgba(255,90,60,0.6)' : `rgba(255,60,40,${pulse})`;
  ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.6, -s * 0.75); ctx.lineTo(-s * 0.35, 0); ctx.lineTo(-s * 0.6, s * 0.75); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,200,0.9)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
  if (expanded > 0.5 && !clipped) {
    ctx.fillStyle = 'rgba(255,120,90,0.95)'; ctx.font = `600 10px ${MONO}`; ctx.textAlign = 'left';
    ctx.fillText(tx(ship.def.name).toUpperCase(), x + s + 4, y + 3);
  }
}

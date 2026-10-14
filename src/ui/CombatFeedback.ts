import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { World } from '../world/World';
import type { HitEvent } from '../world/Ballistics';
import { Aircraft, Bomber, Fighter } from '../world/Aircraft';
import { playCue } from '../audio/FeedbackCues';
import { tx, CANVAS_MONO } from '../i18n';

// Clear combat feedback on the HUD canvas:
//   incoming-damage direction  red arcs around the crosshair pointing to where the fire that
//                              hit the player came from (follows the live shooter while shown)
//   "lining up on you"         an enemy fighter attacking/duelling within ~900 m with its guns
//                              laid on the player: a pulsing chevron (around it on screen, at
//                              the screen edge off screen) and a short, rate-limited beep
//   kill feed weapon           killFeedText(): who/what got the kill (player's weapon, an AI
//                              gunner on a named B-17, or an escort)

const ARCS = 6;
const ARC_LIFE = 1.5;          // s an arc stays up after the last hit from that direction
const ARC_MERGE = Math.cos(THREE.MathUtils.degToRad(22));
const WARN_RANGE = 900;        // m
const WARN_CONE = Math.cos(THREE.MathUtils.degToRad(6));
const WARN_MAX = 4;
const BEEP_GAP = 2.2;          // s between beeps
const BEEP_REPEAT = 4.5;       // s before the same threat beeps again

interface Arc { dir: THREE.Vector3; shooter: Aircraft | null; life: number; strength: number; active: boolean }
interface Warn { f: Fighter | null; d: number }

const _to = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _l = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Kill-feed line naming what made the kill. weapon = the player's weapon name when the player gets the credit. */
export function killFeedText(victim: Aircraft, weapon: string | null): string {
  if (weapon) return `${victim.label} destroyed — ${weapon}`;
  const by = victim.lastAttacker;
  if (by instanceof Bomber) return `${victim.label} destroyed — AI gunner, ${by.name}`;
  if (by instanceof Fighter && by.team === 'allied') return `${victim.label} destroyed — Escort P-51`;
  return `${victim.label} destroyed`;
}

export class CombatFeedback {
  private arcs: Arc[] = [];
  private warns: Warn[] = [];
  private nWarn = 0;
  private lastBeep = -99;
  private beeped = new WeakMap<Fighter, number>();
  private clock = 0;

  constructor(private engine: Engine, private world: World) {
    for (let i = 0; i < ARCS; i++) this.arcs.push({ dir: new THREE.Vector3(), shooter: null, life: 0, strength: 0, active: false });
    for (let i = 0; i < WARN_MAX; i++) this.warns.push({ f: null, d: 0 });
  }

  get heavyAttack() { if (this.nWarn >= 2) return true; for (const a of this.arcs) if (a.active) return true; return false; }

  reset() {
    for (const a of this.arcs) { a.active = false; a.shooter = null; }
    for (const w of this.warns) w.f = null;
    this.nWarn = 0;
    this.lastBeep = -99;
  }

  /** Where the player's guns / eyes are: the camera for the gunner, the aircraft for the pilot. */
  private ref(): THREE.Vector3 {
    const pf = this.world.playerFighter;
    return pf && this.world.player === pf ? pf.pos : this.engine.camera.position;
  }

  /** A hit on the player's own aircraft (World.events.playerHitFrom). */
  onPlayerHit(e: HitEvent) {
    const ref = this.ref();
    const sh = e.shooter && !e.shooter.remove ? e.shooter : null;
    if (sh) _to.copy(sh.pos).sub(ref);
    else if (e.bulletVel.lengthSq() > 1) _to.copy(e.bulletVel).multiplyScalar(-1);
    else _to.copy(e.point).sub(ref);           // flak: the side the burst was on
    if (_to.lengthSq() < 1e-6) return;
    _to.normalize();
    const add = e.cannon ? 0.55 : 0.35;
    // merge with an arc already showing that direction
    let slot: Arc | null = null;
    for (const a of this.arcs) if (a.active && (a.shooter === sh || a.dir.dot(_to) > ARC_MERGE)) { slot = a; break; }
    if (!slot) {
      slot = this.arcs[0];
      for (const a of this.arcs) { if (!a.active) { slot = a; break; } if (a.life < slot.life) slot = a; }
      slot.strength = 0;
    }
    slot.active = true;
    slot.dir.copy(_to);
    slot.shooter = sh;
    slot.life = ARC_LIFE;
    slot.strength = Math.min(1, slot.strength + add);
  }

  update(dt: number, active: boolean) {
    this.clock += dt;
    for (const a of this.arcs) if (a.active && (a.life -= dt) <= 0) { a.active = false; a.shooter = null; }
    this.nWarn = 0;
    if (!active) return;
    const w = this.world, pl = w.player;
    if (!pl || !pl.alive) return;
    const ref = this.ref();
    let fresh = false;
    for (const f of w.fighters('axis')) {
      if (!f.alive || f.remove) continue;
      _to.copy(ref).sub(f.pos);
      const d = _to.length();
      if (d > WARN_RANGE || d < 1) continue;
      const p = w.enemyPilot(f);
      if (!p) continue;
      const lining = p.state === 'attack' || p.state === 'duel' || (p.state === 'dogfight' && p.target === pl);
      if (!lining) continue;
      const aim = f.gunAim ?? f.forward(_fwd);
      if (aim.dot(_to) / d < WARN_CONE) continue;
      if (this.nWarn < WARN_MAX) { const s = this.warns[this.nWarn++]; s.f = f; s.d = d; }
      const last = this.beeped.get(f) ?? -99;
      if (this.clock - last > BEEP_REPEAT) fresh = true;
    }
    if (fresh && this.clock - this.lastBeep > BEEP_GAP) {
      this.lastBeep = this.clock;
      for (let i = 0; i < this.nWarn; i++) this.beeped.set(this.warns[i].f!, this.clock);
      playCue('warn', 0.32);
    }
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, hx: number, hy: number) {
    const cam = this.engine.camera;
    let anyArc = false;
    for (const a of this.arcs) if (a.active) { anyArc = true; break; }
    if (!anyArc && this.nWarn === 0) return;
    cam.getWorldQuaternion(_q).invert();
    ctx.save();
    // ---- incoming damage arcs ----
    if (anyArc) {
      const ref = this.ref();
      const r = Math.min(W, H) * 0.085;
      ctx.lineCap = 'round';
      for (const a of this.arcs) {
        if (!a.active) continue;
        if (a.shooter && !a.shooter.remove) {
          _l.copy(a.shooter.pos).sub(ref);
          if (_l.lengthSq() > 1e-6) a.dir.copy(_l).normalize();
        }
        _l.copy(a.dir).applyQuaternion(_q);         // camera space: x right, y up, -z ahead
        const ang = Math.atan2(-_l.y, _l.x);
        // straight ahead the arc would point nowhere useful: a ring segment above instead
        const ahead = _l.z < 0 && _l.x * _l.x + _l.y * _l.y < 0.0004;
        const fade = Math.min(1, a.life / 0.5);
        const al = fade * (0.45 + 0.5 * a.strength);
        const span = 0.32 + 0.22 * a.strength;
        const behind = _l.z > 0.2;                  // behind the view: a wider, outer arc
        const rr = r * (behind ? 1.35 : 1);
        const c = ahead ? -Math.PI / 2 : ang;
        ctx.strokeStyle = `rgba(255,40,25,${(al * 0.35).toFixed(3)})`;
        ctx.lineWidth = 9 + 4 * a.strength;
        ctx.beginPath(); ctx.arc(hx, hy, rr, c - span, c + span); ctx.stroke();
        ctx.strokeStyle = `rgba(255,70,45,${al.toFixed(3)})`;
        ctx.lineWidth = 3 + 1.5 * a.strength;
        ctx.beginPath(); ctx.arc(hx, hy, rr, c - span, c + span); ctx.stroke();
        // a small outward pointer at the centre so the direction reads at a glance
        const cx = hx + Math.cos(c) * (rr - 2), cy = hy + Math.sin(c) * (rr - 2);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(hx + Math.cos(c) * (rr + 11), hy + Math.sin(c) * (rr + 11));
        ctx.lineTo(cx + Math.cos(c + Math.PI / 2) * 6, cy + Math.sin(c + Math.PI / 2) * 6);
        ctx.lineTo(cx - Math.cos(c + Math.PI / 2) * 6, cy - Math.sin(c + Math.PI / 2) * 6);
        ctx.closePath(); ctx.fill();
      }
    }
    // ---- "lining up on you" ----
    if (this.nWarn > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(this.clock * 14);
      ctx.font = `700 11px ${CANVAS_MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < this.nWarn; i++) {
        const f = this.warns[i].f!;
        _s.copy(f.pos).project(cam);
        const on = _s.z < 1 && Math.abs(_s.x) < 0.94 && Math.abs(_s.y) < 0.9;
        const col = `rgba(255,${Math.round(120 + 60 * pulse)},40,${(0.65 + 0.35 * pulse).toFixed(3)})`;
        ctx.strokeStyle = col; ctx.fillStyle = col;
        if (on) {
          // pulsing inward chevrons above and below the fighter, plus a label
          const x = (_s.x * 0.5 + 0.5) * W, y = (-_s.y * 0.5 + 0.5) * H;
          const g = THREE.MathUtils.clamp(3600 / this.warns[i].d, 16, 46) + 4 * pulse;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(x - 9, y - g - 9); ctx.lineTo(x, y - g); ctx.lineTo(x + 9, y - g - 9);
          ctx.moveTo(x - 9, y + g + 9); ctx.lineTo(x, y + g); ctx.lineTo(x + 9, y + g + 9);
          ctx.stroke();
          ctx.fillText(tx('ON YOU'), x, y - g - 18);
        } else {
          // edge chevron toward the attacker
          let ex = _s.x, ey = _s.y;
          if (_s.z > 1) { ex = -ex; ey = -ey; }
          const ang = Math.atan2(-ey, ex);
          const rad = Math.min(W, H) * 0.36;
          const x = W / 2 + Math.cos(ang) * rad, y = H / 2 + Math.sin(ang) * rad;
          ctx.save();
          ctx.translate(x, y); ctx.rotate(ang);
          ctx.lineWidth = 3;
          const s = 1 + 0.25 * pulse;
          ctx.beginPath();
          ctx.moveTo(-6 * s, -11 * s); ctx.lineTo(6 * s, 0); ctx.lineTo(-6 * s, 11 * s);
          ctx.moveTo(-16 * s, -11 * s); ctx.lineTo(-4 * s, 0); ctx.lineTo(-16 * s, 11 * s);
          ctx.stroke();
          ctx.restore();
          ctx.fillText(tx('ON YOU'), x - Math.cos(ang) * 28, y - Math.sin(ang) * 28);
        }
      }
    }
    ctx.restore();
  }
}

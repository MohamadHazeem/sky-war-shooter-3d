import * as THREE from 'three';
import { Bomber, Fighter } from './Aircraft';
import type { World } from './World';
import type { HitEvent } from './Ballistics';

import { FormationDress } from './FormationDress';
import { chutesDue, formationCompression, formationStatus, leadIndex, lossKind, LOSS_PROFILES, FORMATION_RADIO, type FormationLoss, type FormationMember } from './FormationRules';

interface Ship extends FormationMember {
  b: Bomber; home: THREE.Vector3; target: THREE.Vector3; dress: FormationDress | null;
  loss: FormationLoss | null; age: number; emitted: number; counted: boolean;
}
const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _move = new THREE.Vector3();
/** Owns one record per formation slot (at most 18). No per-frame storage growth. */
export class LivingFormation {
  readonly ships: Ship[] = [];
  kills = 0;
  lead: Bomber | null = null;
  deputy: Bomber | null = null;
  private compression = 1;
  private reforming = false;
  private huntAt = 0;
  private anchor = new THREE.Vector3();
  constructor(private w: World) {}
  reset() {
    for (const s of this.ships) s.dress?.dispose();
    this.ships.length = 0; this.kills = 0; this.lead = this.deputy = null; this.compression = 1; this.reforming = false; this.huntAt = 0; this.anchor.set(0, 0, 0);
  }
  add(b: Bomber) {
    const slot = this.ships.length;
    this.ships.push({b, player: b.isPlayer, slot, status: 'station', home: b.slot.clone(), target: b.slot.clone(), dress: b.isPlayer ? null : new FormationDress(b, slot), loss: null, age: 0, emitted: 0, counted: false});
    if (b.isPlayer) this.anchor.copy(b.slot);
    this.elect(false);
  }
  private ship(b: Bomber) { for (const s of this.ships) if (s.b === b) return s; }
  onHit(e: HitEvent) { if (e.target instanceof Bomber && !e.target.isPlayer) this.ship(e.target)?.dress?.hit(e); }
  private elect(announce: boolean) {
    const i = leadIndex(this.ships), d = leadIndex(this.ships, i);
    const lead = i < 0 ? null : this.ships[i].b;
    if (announce && lead && this.lead && lead !== this.lead) this.w.callout('lf_lead', 'Big Friend', FORMATION_RADIO.lead, 8, 2);
    this.lead = lead; this.deputy = d < 0 ? null : this.ships[d].b;
  }
  /** Called after World marks a combat casualty dead; stats remain owned by World. */
  beginLoss(b: Bomber, cause: string, forced?: FormationLoss): boolean {
    const s = this.ship(b); if (!s || b.isPlayer) return false;
    if (s.loss) return true;
    s.status = 'lost'; s.loss = forced ?? lossKind(cause, Math.random()); s.age = s.emitted = 0;
    // where it failed: the wing that was shot away, or the one a fire burned through
    const wl = b.zone('wingL'), wr = b.zone('wingR');
    const side: 1 | -1 = cause === 'wingL' ? 1 : cause === 'wingR' ? -1 : (wl?.hp ?? 1) <= (wr?.hp ?? 1) ? 1 : -1;
    if (!forced && cause === 'fire' && ((wl && wl.hp <= 0) || (wr && wr.hp <= 0)) && Math.random() < 0.55) s.loss = 'fold';
    b.vel.copy(this.w.formationForward).multiplyScalar(64); b.vel.y = -4;
    b.spin.set(0.025, 0.07, (s.slot % 2 ? -1 : 1) * 0.38);
    b.ditched = s.loss === 'ditch';
    b.gliding = s.loss === 'glide' || s.loss === 'ditch';
    if (b.gliding) {
      b.spin.set(0, 0, 0); b.vel.y = -6;
      b.root.rotation.z = 0.025; b.root.rotation.x = 0.07;
      for (const z of b.zones) z.burning = false;
    } else {
      const wing = b.zone(s.loss === 'fold' ? (side > 0 ? 'wingL' : 'wingR') : s.slot % 2 ? 'wingL' : 'wingR'); if (wing) wing.burning = true;
      this.w.effects.explosion(b.pos, b.vel, s.loss === 'explode' ? 1.5 : 0.5);
      if (s.loss === 'fold') {
        this.w.destruction.separate(b, side > 0 ? 3 : 5, false);
      } else if (s.loss === 'split') {
        this.w.destruction.separate(b, 2, false);
      } else if (s.loss === 'explode') {
        this.w.destruction.explode(b);
      }
    }
    this.elect(true);
    return true;
  }
  update(dt: number, low: boolean) {
    const w = this.w; let changed = false;
    for (const s of this.ships) {
      const b = s.b, prev = s.status;
      s.status = formationStatus(prev, b.alive && !b.remove, b.enginesOut, b.integrity, b.straggling);
      if (prev !== s.status) {
        changed = true;
        if (!s.player && s.status === 'straggler') { b.straggling = true; w.callout('lf_straggler', 'Big Friend', FORMATION_RADIO.straggler, 15, 2); }
        else if (!s.player && s.status === 'damaged' && b.engineDead[1]) w.callout('lf_damage', 'Big Friend', FORMATION_RADIO.damage, 25, 1);
      }
      if (s.dress && !b.remove) s.dress.update(w.listener ? b.pos.distanceToSquared(w.listener) : 0, low);
      if (s.loss) this.lossStep(s, dt);
    }
    if (changed) this.elect(true);
    const compression = formationCompression(this.ships);
    if (compression !== this.compression) {
      this.compression = compression; this.reforming = true;
      for (const s of this.ships) s.target.copy(s.home).sub(this.anchor).multiplyScalar(compression).add(this.anchor);
    }
    if (this.reforming) {
      let moving = false;
      for (const s of this.ships) {
        if (s.player || s.status === 'lost' || s.status === 'straggler') continue;
        _move.copy(s.target).sub(s.b.slot);
        const distance = _move.length(); if (distance < 0.15) continue;
        _move.multiplyScalar(Math.min(distance, dt * 2.5) / distance).add(s.b.slot);
        let clear = true;
        for (const o of this.ships) if (o !== s && o.b.alive && _move.distanceToSquared(o.b.slot) < 48 * 48) { clear = false; break; }
        if (clear) { s.b.slot.copy(_move); moving = true; }
      }
      if (!moving) { this.reforming = false; w.callout('lf_reform', 'Pilot', FORMATION_RADIO.reform, 20, 1); }
    }
    // Two opportunists peel off at most every 12 s. Do not commandeer authored tactics or a live firing pass.
    if (w.time >= this.huntAt) {
      this.huntAt = w.time + 12;
      let target: Bomber | null = null;
      for (const s of this.ships) if (!s.player && s.status === 'straggler' && !s.b.scripted && s.b.pos.distanceToSquared(w.formationCenter) < 2500 * 2500) { target = s.b; break; }
      if (target) {
        let n = 0;
        for (const a of w.aircraft) {
          if (!(a instanceof Fighter) || !a.alive || a.team !== 'axis' || a.pos.distanceToSquared(target.pos) > 3000 * 3000) continue;
          const pilot = w.enemyPilot(a);
          if (!pilot || pilot.override || (pilot.state !== 'approach' && pilot.state !== 'break')) continue;
          pilot.engage(w, target, n % 2 ? 'beam' : 'stern'); if (++n === 2) break;
        }
      }
    }
  }
  private lossStep(s: Ship, dt: number) {
    s.age += dt;
    const b = s.b, kind = s.loss!, due = chutesDue(kind, s.age);
    while (s.emitted < due) {
      _p.copy(b.pos); _p.x += (s.emitted % 2 ? -1 : 1) * 3; _p.y -= 2; _p.z -= 5;
      _v.copy(b.vel).multiplyScalar(0.35);
      if (this.w.effects.parachute(_p, _v, 1.4)) b.crewBailed++;
      s.emitted++;
    }
    if (!s.counted && LOSS_PROFILES[kind].chutes > 0 && s.age >= 2.5 + (LOSS_PROFILES[kind].chutes - 1) * 1.1 + 4.2) {
      s.counted = true;
      const n = b.crewBailed;
      if (n >= 3 && n <= 5) this.w.callout('lf_chutes_' + b.id, 'Tail', FORMATION_RADIO[n === 3 ? 'chutes3' : n === 4 ? 'chutes4' : 'chutes5'], 0, 2);
    }
    if (s.age >= LOSS_PROFILES[kind].duration) { b.remove = true; s.loss = null; }
  }
  /** Nearby gunner kills are actual ballistic hits, with no extra player credit. */
  gunnerKill() { this.kills++; this.w.callout('lf_kill', 'Big Friend', FORMATION_RADIO.kill, 18, 1); }
}

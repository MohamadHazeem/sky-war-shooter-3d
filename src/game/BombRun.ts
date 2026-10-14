import * as THREE from 'three';
import type { Game } from './Game';
import { Bomber } from '../world/Aircraft';
import { sound } from '../audio/Sound';
import { VOICE_LINES, type VoiceLineId } from '../audio/voiceLines';
import { weatherNow } from '../render/WeatherState';
import { BOMB_RUN_TEXT, BombRunState, bombingOvercast, flakWalk } from './BombRunState';
import { tx } from '../i18n';
import '../ui/bombRun.css';

/** Gunner-seat drama; owns timing and reuses warmed flak, bomb and ground effects. */
export class BombRun {
  readonly clock = new BombRunState();
  private panel = document.createElement('div');
  private title = document.createElement('strong');
  private detail = document.createElement('span');
  private point = new THREE.Vector3();
  private offset = new THREE.Vector3();
  private flakAt = -1;
  private shell = 0;
  private hit = false;
  private cues = 0;
  private hudAt = -1;
  constructor(private g: Game) {
    this.panel.id = 'bomb-run'; this.panel.hidden = true;
    this.panel.append(this.title, this.detail); document.body.append(this.panel);
  }
  get enabled() { const m = this.g.mission; return !this.g.menuMode && m?.role === 'gunner' && !!m.bombsAway && this.g.coop.role !== 'guest'; }
  get active() { return this.enabled && this.clock.active; }
  get holding() { return this.enabled && this.clock.holdFighters; }
  reset() {
    this.clock.reset(); this.flakAt = this.hudAt = -1; this.shell = this.cues = 0; this.hit = false;
    this.panel.hidden = true; document.body.classList.remove('bomb-run-active'); this.g.world.bombRunHold = this.g.world.bombRunLevel = false;
    this.g.world.bombRunLift = 0; sound.bombBayOpen = false;
  }
  /** Before World: pilots obey the run on the very first IP frame. */
  prepare(dt: number) {
    const g = this.g, w = g.world;
    const live = this.enabled && g.state === 'playing' && !!w.player?.alive;
    if (live) this.clock.advance(w.time + dt, g.mission!.bombsAway!, g.bombardier.releaseTime);
    w.bombRunHold = live && this.clock.holdFighters;
    w.bombRunLevel = live && this.clock.level;
    const age = this.clock.releasedAt < 0 ? -1 : w.time - this.clock.releasedAt;
    w.bombRunLift = live && age >= 0 && age < 6 ? Math.sin(Math.PI * age / 6) * 3 : 0;
    sound.bombBayOpen = live && this.clock.doors;
    if (!live) { this.panel.hidden = true; document.body.classList.remove('bomb-run-active'); }
    // No hangar/perk/final wave can interrupt the run; its combat clock resumes at rally.
    if (live && this.clock.holdFighters && g.mission?.round) g.roundT0 += dt;
  }
  update() {
    const g = this.g, w = g.world, m = g.mission;
    if (!this.enabled || g.state !== 'playing' || !w.player?.alive || !m?.bombsAway) { this.panel.hidden = true; return; }
    if (!g.director.bombsDropped && w.time >= m.bombsAway && (!g.bombardier.active || w.time >= m.bombsAway + 12)) g.bombardier.release(false);
    this.clock.advance(w.time, m.bombsAway, g.bombardier.releaseTime);
    this.panel.hidden = !this.clock.active || g.bombardier.active;
    document.body.classList.toggle('bomb-run-active', this.clock.active);
    if (!this.active) return;
    const t = w.time - m.bombsAway;
    this.cue(0, t >= -28, 'br_ip');
    this.cue(1, t >= -22, 'br_steady');
    this.cue(2, t >= -16, 'br_doors');
    this.cue(3, t >= -10, bombingOvercast(weatherNow.cloud, weatherNow.mood) ? 'br_cloud' : 'br_markers');
    this.cue(4, t >= -5 && this.clock.releasedAt < 0, 'br_count');
    this.cue(5, this.clock.phase === 'rally', 'br_rally');
    if (this.clock.holdFighters) {
      w.flakIntensity = 0; // replaces random barrage with walking boxes
      if (w.time >= this.flakAt) {
        this.flakAt = w.time + .65;
        flakWalk(this.offset, t + 28, this.shell++);
        this.point.copy(w.player.pos).addScaledVector(w.formationForward, this.offset.z);
        this.point.x += w.formationForward.z * this.offset.x;
        this.point.z -= w.formationForward.x * this.offset.x; this.point.y += this.offset.y;
        w.flakBurst(this.point);
      }
      if (!this.hit && t >= -18) { this.hit = true; this.hitNeighbour(); }
    }
    if (w.time < this.hudAt) return;
    this.hudAt = w.time + .1;
    const phase = this.clock.phase;
    this.title.textContent = phase === 'countdown' ? tx(BOMB_RUN_TEXT.countdown, { time: Math.max(0, Math.ceil(-t)) })
      : phase === 'falling' ? tx(BOMB_RUN_TEXT.falling, { time: Math.max(0, Math.ceil(this.clock.releasedAt + 25 - w.time)) })
      : phase === 'idle' || phase === 'complete' ? '' : tx(BOMB_RUN_TEXT[phase]);
    this.detail.textContent = tx(this.clock.releasedAt >= 0 ? BOMB_RUN_TEXT.watch : bombingOvercast(weatherNow.cloud, weatherNow.mood) ? BOMB_RUN_TEXT.overcast : BOMB_RUN_TEXT.clear);
  }
  private cue(bit: number, due: boolean, id: VoiceLineId) {
    if (!due || (this.cues & (1 << bit))) return;
    this.cues |= 1 << bit;
    const line = VOICE_LINES[id]; this.g.world.callout(id, line.speakers[0], line.text, 0, 3);
  }
  private hitNeighbour() {
    const w = this.g.world, pl = w.player!;
    let victim: Bomber | null = null, nearest = Infinity;
    // Prefer the side the gunner can see, without moving ships or forcing a camera cut.
    const arc = w.playerArc();
    for (const a of w.aircraft) {
      if (!(a instanceof Bomber) || !a.alive || a === pl) continue;
      this.offset.copy(a.pos).sub(pl.pos);
      const d = this.offset.lengthSq() * (arc && this.offset.dot(arc) < 0 ? 8 : 1);
      if (d < nearest) { victim = a; nearest = d; }
    }
    if (!victim) return;
    const z = victim.zones.find(zone => zone.engine !== undefined && zone.hp > 0);
    if (z) { z.hp = Math.min(z.hp, Math.max(1, z.maxHp * .35)); z.burning = true; }
    w.flakBurst(victim.pos); w.effects.explosion(victim.pos, victim.vel, .4, 'small');
    this.cue(6, true, 'br_hit');
  }
}

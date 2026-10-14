import * as THREE from 'three';
import type { Game } from './Game';
import type { CoopSession } from './CoopSession';
import { validCrewPing, clockCall, type CrewPing } from '../net/Crew';
import { aircraftMarkerAlpha, projectAircraft } from '../ui/MarkerProjection';
import { hudVisibility } from '../ui/HudDetail';
import { tx } from '../i18n';

/** Reliable crew callouts. Target markers use exactly the normal visibility/projection gates;
 * a direction-only call remains a radio/HUD cue and never reveals an unseen aircraft. */
export class CrewPings {
  private last = new Float64Array(4).fill(-99);
  private markTime = -99;
  private time = 0;
  private current: CrewPing | null = null;
  private label = '';
  private dir = new THREE.Vector3();
  private delta = new THREE.Vector3();
  constructor(private g: Game, private session: CoopSession) {}
  reset() { this.last.fill(-99); this.markTime = -99; this.current = null; this.time = 0; }
  update(dt: number) {
    this.time += dt;
    if (this.g.input.hit('KeyU')) this.mark();
  }
  mark() {
    const c = this.session, g = this.g, pb = g.world.playerBomber;
    if (c.phase !== 'mission' || c.mode !== 'gunner' || g.state !== 'playing' || !pb) return;
    const cam = g.engine.camera;
    cam.getWorldDirection(this.dir);
    let target = -1, best = .97;
    for (const a of g.world.aircraft) {
      if (a.team !== 'axis' || aircraftMarkerAlpha(a, g.world, cam) <= 0) continue;
      const dot = this.delta.copy(a.pos).sub(cam.position).normalize().dot(this.dir);
      if (dot > best) { best = dot; target = c.targetId(a); }
    }
    this.delta.copy(cam.position).addScaledVector(this.dir, 1000);
    pb.worldToLocal(this.delta, this.delta);
    let clock = Math.round(Math.atan2(-this.delta.x, this.delta.z) / (Math.PI * 2) * 12);
    if (clock <= 0) clock += 12;
    const elevation = Math.atan2(this.delta.y, Math.hypot(this.delta.x, this.delta.z));
    const p: CrewPing = { t: 'mark', run: c.epoch, from: c.localId, target, clock, level: elevation > .18 ? 1 : elevation < -.18 ? -1 : 0 };
    if (c.role === 'host') this.receive(p, 0);
    else if (this.time - this.last[c.localId] >= 2) { this.last[c.localId] = this.time; c.broadcast(p); }
  }
  receive(p: unknown, sender?: number) {
    const c = this.session;
    if (c.phase !== 'mission' || c.mode !== 'gunner' || !validCrewPing(p) || p.run !== c.epoch) return;
    if (c.role === 'host') {
      if (sender === undefined || sender < 0 || sender > 3 || this.time - this.last[sender] < 2) return;
      this.last[sender] = this.time;
      p.from = sender;
      const a = c.pingTarget(p.target);
      if (p.target !== -1 && (!a || a.team !== 'axis' || !a.alive || a.remove)) return;
      c.broadcast(p);
    }
    this.current = p; this.markTime = this.time;
    this.label = tx(clockCall(p));
    // Reuse the recorded Tail clock callouts (all 12 directions and three elevations).
    this.g.world.events.radio?.('Tail', clockCall(p), 2);
  }
  draw(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const p = this.current, g = this.g;
    if (!p || this.session.phase !== 'mission' || this.time - this.markTime > 5 || !hudVisibility(g.settings.hudDetail).status) return;
    ctx.save(); ctx.fillStyle = '#ffd477'; ctx.strokeStyle = '#ffd477'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(this.label, W / 2, H * .2);
    const a = this.session.pingTarget(p.target);
    if (a && g.settings.markers && hudVisibility(g.settings.hudDetail).markers) {
      const alpha = aircraftMarkerAlpha(a, g.world, g.engine.camera);
      if (alpha > 0) {
        const q = projectAircraft(a, g.engine.camera);
        if (q.on) {
          ctx.globalAlpha = alpha; const x = (q.x + 1) * W / 2, y = (1 - q.y) * H / 2;
          ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
}

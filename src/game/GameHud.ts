import * as THREE from 'three';
import type { Game } from './Game';
import { roundDef } from './Missions';
import { STATIONS, STATION_ORDER, StationId } from '../world/B17Layout';
import { Fighter } from '../world/Aircraft';
import * as Radar from '../ui/Radar';
import * as Chatter from './RadioChatter';
import { access } from '../core/Accessibility';
import { tx } from '../i18n';

const _v = new THREE.Vector3();

// The in-mission HUD driven from Game.frame(): the DOM panels (objective line, score,
// gunner / pilot readouts, the seat finder, refreshed every 0.08 s) and the 2D canvas
// overlay drawn every frame (target markers, health bars, radar, lead pip, reticles and
// gunsights, hit / kill markers, then GameFeel, CombatFeedback and the cracked glass).
export class GameHud {
  hitMarkerT = 0;
  killMarkerT = 0;
  private hudAcc = 0;
  private threats: Partial<Record<StationId, number>> = {};
  private idleSeatT = 0;
  private lastSeatTip = -99;
  private mapOpen = false;   // Tab toggles the big map
  private mapT = 0;
  private popups: { pos: THREE.Vector3; text: string; life: number }[] = [];

  constructor(private g: Game) {}

  // New mission (MissionFlow.startMission)
  reset() {
    this.mapOpen = false; this.mapT = 0;
  }

  toggleMap() { this.mapOpen = !this.mapOpen; }

  // floating origin shift (Game.floatingOrigin)
  rebase(off: THREE.Vector3) {
    for (const p of this.popups) p.pos.sub(off);
  }

  // hit / kill marker timers (every frame, before the combo update)
  tickMarkers(dt: number) {
    this.hitMarkerT -= dt;
    this.killMarkerT -= dt;
  }

  // score pop-ups, the throttled HUD panel refresh, then the 2D overlay
  frame(dt: number) {
    const g = this.g;
    for (const p of this.popups) { p.life -= dt; p.pos.addScaledVector(g.world.formationForward, 75 * dt); }
    this.popups = this.popups.filter((p) => p.life > 0);
    this.hudAcc += dt;
    if (!g.menuMode && this.hudAcc > 0.08 && (g.state === 'playing' || g.state === 'ending')) { this.hudAcc = 0; this.updateHud(); }
    this.drawOverlay();
  }

  private updateHud() {
    const g = this.g;
    const m = g.mission!;
    const w = g.world;
    const dir = g.director;
    const alive = w.bombers().filter((b) => b.alive).length;
    const enemies = w.activeEnemies().length;
    let objective = m.objectives[0];
    if (m.tutorial) objective = 'Gunnery School — follow the instructions';
    else if (m.round) {
      const r = roundDef(m, g.roundIdx);
      const left = Math.max(0, Math.ceil(r.duration - (w.time - g.roundT0)));
      const rn = Number.isFinite(m.rounds ?? 1) ? `Round ${g.roundIdx + 1}/${m.rounds}` : `Round ${g.roundIdx + 1}`;
      if (g.boss.active) objective = `${rn} — ${g.boss.objective}`; else
      objective = left > 0 ? `${rn} — ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} · ${enemies} fighters` : `${rn} — clear the last ${enemies} fighter${enemies === 1 ? '' : 's'}`;
    }
    else if (m.duration === Infinity) objective = dir.survivalWave ? `Wave ${dir.survivalWave} — ${enemies} fighters remaining` : 'Stand by — enemy fighters approaching';
    else if (m.flak && w.time >= m.flak.start && w.time <= m.flak.end) objective = 'Hold steady through the flak';
    else if (m.escortArrive && !dir.escortsSpawned) objective = `Hold out — escort ETA ${Math.max(0, Math.ceil(m.escortArrive - w.time))}s`;
    else if (enemies > 0) objective = `${enemies} enemy fighter${enemies > 1 ? 's' : ''} attacking`;
    else if (dir.waveIdx < m.waves.length) objective = 'Scan the sky — more fighters expected';
    if (m.role === 'pilot') objective = g.pilotOps.objective(g.roundIdx, m.rounds ?? 1) ?? objective;
    const mm = Math.floor(w.time / 60), ss = Math.floor(w.time % 60);
    g.ui.updateCommon({
      mission: `${m.title.toUpperCase()} · ${mm}:${String(ss).padStart(2, '0')}`,
      objective, kills: g.coop.phase === 'mission' ? g.coop.crewKills : w.stats.kills, score: g.score, formation: `${alive}/${m.bombers} B-17s`,
    });
    g.ui.updateCombo(g.combo.mult, g.combo.fraction);
    if (m.role === 'gunner') {
      const s = g.gunner.state;
      const zones: Record<string, number> = {};
      for (const z of w.playerBomber!.zones) zones[z.name] = Math.max(0, z.hp) / z.maxHp;
      const crew = w.crewWounded ? `Gunner wounded (${w.crewWounded}/4)` : '';
      // crew shouts when a fighter bores in to point-blank range
      const gp = w.playerGunPos();
      if (gp && w.fighters('axis').some((f) => f.alive && f.pos.distanceTo(gp) < 170)) Chatter.onEnemyClose();
      // seat finder: which gun positions have fighters in their field of fire
      g.gunner.threatsByStation(this.threats);
      let best: StationId | null = null, bn = 0;
      for (const id of STATION_ORDER) { const n = this.threats[id] ?? 0; if (n > bn) { bn = n; best = id; } }
      const here = this.threats[g.gunner.station] ?? 0;
      this.idleSeatT = here === 0 && bn > 0 ? this.idleSeatT + 0.08 : 0;
      if (best && this.idleSeatT > 2.5 && w.time - this.lastSeatTip > 7) {
        this.lastSeatTip = w.time;
        g.ui.tip(`${bn} fighter${bn > 1 ? 's' : ''} in the ${STATIONS[best].label.toUpperCase()} arc — press <kbd>${STATIONS[best].key}</kbd>`, 2600);
      }
      g.ui.updateGunnerHud({ station: g.gunner.station, threats: this.threats, best, ammo: s.ammo, heat: s.heat, overheated: s.overheated, reloading: s.reload, zones, crew, wounded: w.crew.wounded });
    } else if (w.playerFighter) {
      const f = w.playerFighter;
      // flight lead warns of a bandit sitting behind the Mustang
      if (f.alive) {
        const fwd = f.forward(_v);
        for (const e of w.fighters('axis')) {
          if (!e.alive) continue;
          const d = e.pos.distanceTo(f.pos);
          if (d < 550 && fwd.dot(e.pos.clone().sub(f.pos).divideScalar(d)) < -0.75) { Chatter.onBanditOnSix(d < 250); break; }
        }
      }
      const zones: Record<string, number> = {};
      for (const z of f.zones) zones[z.name] = Math.max(0, z.hp) / z.maxHp;
      g.ui.updatePilotHud({
        speed: f.fm.speed, alt: f.pos.y, thr: f.fm.throttle, g: f.fm.gLoad, ammo: f.guns.reduce((a, gun) => a + gun.ammo, 0),
        mode: (g.pilot.mode === 'mouseAim' ? 'MOUSE AIM' : 'DIRECT') + ' · ' + (g.pilot.view === 'cockpit' ? 'COCKPIT' : 'CHASE') + (f.fm.stalled ? ' · STALL' : ''), zones,
      });
    }
  }

  private drawLeadPip(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const g = this.g;
    const w = g.world, cam = g.engine.camera;
    const pilot = g.mission?.role === 'pilot';
    const shooter = pilot ? w.playerFighter! : w.playerBomber!;
    const origin = pilot ? shooter.pos : cam.position;
    const aim = pilot ? shooter.forward(new THREE.Vector3()) : g.gunner.aimDirection();
    const muzzle = g.loadout.leadVel || (pilot ? 880 : 870);
    let best: Fighter | null = null, bestAng = THREE.MathUtils.degToRad(pilot ? 18 : 25);
    for (const f of w.fighters('axis')) {
      if (!f.alive || !w.spotted(f)) continue;
      const to = f.pos.clone().sub(origin);
      const d = to.length();
      if (d > 1300) continue;
      const ang = to.normalize().angleTo(aim);
      if (ang < bestAng) { bestAng = ang; best = f; }
    }
    if (!best) return;
    const rel = best.vel.clone().sub(shooter.vel);
    let t = best.pos.distanceTo(origin) / muzzle;
    const p = new THREE.Vector3();
    for (let i = 0; i < 3; i++) { p.copy(best.pos).addScaledVector(rel, t); t = p.distanceTo(origin) / muzzle; }
    p.y += 0.5 * 9.81 * t * t;
    const sp = p.clone().project(cam), tp = best.pos.clone().project(cam);
    if (sp.z > 1 || Math.abs(sp.x) > 1.1 || Math.abs(sp.y) > 1.1) return;
    const x = (sp.x * 0.5 + 0.5) * W, y = (-sp.y * 0.5 + 0.5) * H;
    const tx = (tp.x * 0.5 + 0.5) * W, ty = (-tp.y * 0.5 + 0.5) * H;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,200,90,0.55)'; ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,200,90,0.95)'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 7, y); ctx.lineTo(x, y + 7); ctx.lineTo(x - 7, y); ctx.closePath(); ctx.stroke();
    ctx.restore();
  }

  // 2D overlay: target markers, gunsight, hit markers
  drawOverlay() {
    const g = this.g;
    const ctx = g.ui.ctx;
    const W = innerWidth, H = innerHeight;
    ctx.clearRect(0, 0, W, H);
    if (g.menuMode || !(g.state === 'playing' || g.state === 'ending' || g.state === 'paused')) return;
    if (g.bombardier.active) { g.bombardier.draw(ctx, W, H); return; }
    const cam = g.engine.camera;
    const w = g.world;
    const pl = w.player;
    if (g.settings.markers && pl) {
      for (const a of w.aircraft) {
        if (a === pl || !a.alive) continue;
        const enemy = a.team === 'axis';
        const d = a.pos.distanceTo(cam.position);
        if (d > (enemy ? 2800 : 1800)) continue;
        if (enemy && !w.spotted(a)) continue;   // Night Fighter: only coned / close / firing raiders
        const p = a.pos.clone().project(cam);
        const col = access.markerColor(enemy);
        if (!enemy) {
          // Friendlies: a small blue chevron above the aircraft, no brackets, so they never read as targets
          if (p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1) {
            const x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
            const up = THREE.MathUtils.clamp((a instanceof Fighter ? 1400 : 3200) / d, 10, 46);
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.moveTo(x - 6, y - up - 8); ctx.lineTo(x + 6, y - up - 8); ctx.lineTo(x, y - up); ctx.closePath(); ctx.fill();
            if (d < 900) {
              ctx.font = '10px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
              ctx.fillText(a instanceof Fighter ? 'P-51' : 'B-17', x, y - up - 12);
            }
          }
          continue;
        }
        if (p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1) {
          const x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
          const s = THREE.MathUtils.clamp(3200 / d, 9, 34);
          ctx.strokeStyle = col; ctx.lineWidth = 2;
          ctx.beginPath();
          const c = s * 0.45;
          for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            ctx.moveTo(x + sx * s, y + sy * s - sy * c); ctx.lineTo(x + sx * s, y + sy * s); ctx.lineTo(x + sx * s - sx * c, y + sy * s);
          }
          ctx.stroke();
          access.enemyGlyph(ctx, x, y, s);
          ctx.fillStyle = col; ctx.font = '600 11px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
          const lab = tx(a.label).toUpperCase();
          ctx.fillText(d < 1600 ? `${lab}  ${Math.round(d)}m` : lab, x, y + s + 13);
        } else if (enemy && d < 1500) {
          // edge arrow toward off-screen attacker
          let ex = p.x, ey = p.y;
          if (p.z > 1) { ex = -ex; ey = -ey; }
          const ang = Math.atan2(-ey, ex);
          const r = Math.min(W, H) * 0.42;
          const x = W / 2 + Math.cos(ang) * r, y = H / 2 + Math.sin(ang) * r;
          ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-4, -7); ctx.lineTo(-4, 7); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }
    }
    // Health bars on enemies the player has been hitting
    for (const f of w.fighters('axis')) {
      if (!f.alive || w.time - f.lastPlayerHit > 6) continue;
      const p = f.pos.clone().project(cam);
      if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) continue;
      const d = f.pos.distanceTo(cam.position);
      const x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
      const s = THREE.MathUtils.clamp(2400 / d, 9, 30);
      const bw = 46, frac = f.structureFrac;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - bw / 2 - 1, y - s - 13, bw + 2, 6);
      ctx.fillStyle = frac > 0.5 ? 'rgba(230,200,90,0.95)' : frac > 0.25 ? 'rgba(240,140,50,0.95)' : 'rgba(235,70,50,0.95)';
      ctx.fillRect(x - bw / 2, y - s - 12, bw * frac, 4);
    }
    // Score pop-ups
    for (const pop of this.popups) {
      const p = pop.pos.clone().project(cam);
      if (p.z > 1) continue;
      const a = Math.min(1, pop.life / 0.6);
      ctx.fillStyle = `rgba(255,214,120,${a})`;
      ctx.font = '600 20px Oswald, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(pop.text, (p.x * 0.5 + 0.5) * W, (-p.y * 0.5 + 0.5) * H - (1.6 - pop.life) * 40);
    }
    // Radar plot (bottom-left; Tab expands it into the big map)
    this.mapT += ((this.mapOpen ? 1 : 0) - this.mapT) * Math.min(1, (1 / 60) * 9);
    if (g.mission) Radar.draw(ctx, W, H, w, this.mapT, g.director.incoming, w.time);
    g.boss.drawHud(ctx, W, H, cam);
    // Lead indicator aim aid: pip for the enemy nearest the line of fire ('recruit' = only on Recruit difficulty)
    const leadMode = g.settings.leadPip ?? 'recruit';
    if (pl?.alive && (g.loadout.leadPip || leadMode === 'always' || (leadMode === 'recruit' && g.settings.difficulty === 'recruit'))) this.drawLeadPip(ctx, W, H);
    // Gunner hip reticle: waist guns without the ring sight up (fades as RMB brings the eye down)
    if (g.mission?.role === 'gunner' && ((g.gunner.def.type === 'waist' && g.gunner.ads < 0.6) || g.gunner.def.id === 'top')) {
      const a = g.gunner.def.id === 'top' ? 0.85 : 0.85 * (1 - g.gunner.ads / 0.6);
      const r = Math.min(W, H) * 0.05;
      ctx.save();
      ctx.strokeStyle = `rgba(255,236,190,${a})`; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 3;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2); ctx.stroke();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.beginPath(); ctx.moveTo(W / 2 + dx * r * 0.45, H / 2 + dy * r * 0.45); ctx.lineTo(W / 2 + dx * r * 0.85, H / 2 + dy * r * 0.85); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // Pilot gunsight
    if (g.mission?.role === 'pilot' && w.playerFighter?.alive) {
      const gs = g.pilot.gunsight;
      if (gs.aimVisible) {
        const x = (gs.aimX * 0.5 + 0.5) * W, y = (-gs.aimY * 0.5 + 0.5) * H;
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
      }
      if (gs.visible) {
        const x = (gs.x * 0.5 + 0.5) * W, y = (-gs.y * 0.5 + 0.5) * H;
        const r = Math.min(W, H) * 0.075;
        ctx.save();
        ctx.shadowColor = 'rgba(255,150,40,0.9)'; ctx.shadowBlur = 6;
        ctx.fillStyle = 'rgba(255,170,70,0.95)'; ctx.strokeStyle = 'rgba(255,170,70,0.95)';
        ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const dx = Math.cos(a) * r, dy = Math.sin(a) * r;
          ctx.beginPath(); ctx.moveTo(x + dx, y + dy - 4); ctx.lineTo(x + dx + 3, y + dy); ctx.lineTo(x + dx, y + dy + 4); ctx.lineTo(x + dx - 3, y + dy); ctx.closePath(); ctx.fill();
        }
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(W / 2, H / 2 - 0, 2, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
    if (g.mission?.role === 'pilot') { g.pilot.drawOverlay(ctx, W, H); g.pilotOps.drawOverlay(ctx, W, H, cam); } // K-14 reflector sight, padlock, bombers under attack
    // Hit / kill markers at the aim point
    let hx = W / 2, hy = H / 2;
    if (g.mission?.role === 'pilot') { const gs = g.pilot.gunsight; hx = (gs.x * 0.5 + 0.5) * W; hy = (-gs.y * 0.5 + 0.5) * H; }
    if (this.hitMarkerT > 0 || this.killMarkerT > 0) {
      const kill = this.killMarkerT > 0;
      ctx.strokeStyle = kill ? 'rgba(255,90,60,0.95)' : 'rgba(255,255,255,0.9)';
      ctx.lineWidth = kill ? 2.5 : 1.8;
      const a = kill ? 16 : 10, b = kill ? 6 : 4;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(hx + sx * b, hy + sy * b); ctx.lineTo(hx + sx * a, hy + sy * a); }
      ctx.stroke();
    }
    g.feel.draw(ctx, W, H, hx, hy);
    g.combat.draw(ctx, W, H, hx, hy);
    // Cracked glass sits in front of everything else on the gunner's view
    g.cracks.draw(ctx, W, H);
  }
}

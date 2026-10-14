import * as THREE from 'three';
import type { Game } from './Game';
import type { Bomber } from '../world/Aircraft';
import { companionDitchDue, FORMATION_RADIO } from '../world/FormationRules';
import { CamSnapshot, cineLens, HudHider } from './CineShared';
import { sound } from '../audio/Sound';

/** A damaged neighbour puts down on the return leg. Reuses the already-warmed sea/spray studio. */
export class FormationReturn {
  active = false;
  private used = false;
  private time = 0;
  private ship: Bomber | null = null;
  private pos = new THREE.Vector3();
  private quat = new THREE.Quaternion();
  private snap = new CamSnapshot();
  private hud = new HudHider();
  constructor(private g: Game) {}
  check(): boolean {
    const g = this.g, m = g.mission;
    if (this.used || !m || g.state !== 'playing' || g.endResult || g.coop.role || g.boss.active || g.midRound.setPieces.busy || g.midRound.event || !g.world.player?.alive || g.engine.renderOverride) return false;
    if (m.bombsAway && !g.director.bombsDropped) return false;
    const campaign = m.number > 0 && m.role === 'gunner' && !m.tutorial && Number.isFinite(m.duration);
    for (const s of g.world.livingFormation.ships) {
      const b = s.b;
      if (b.isPlayer || b.scripted || !companionDitchDue(campaign, g.world.time / m.duration, b.enginesOut, b.integrity, b.alive && !b.remove && (b.zone('cockpit')?.hp ?? 0) > 0)) continue;
      this.begin(b); return this.active;
    }
    return false;
  }
  begin(b: Bomber) {
    if (this.used || !b.alive || b.isPlayer) return;
    const g = this.g; this.used = true; this.ship = b; this.time = 0;
    g.world.callout('lf_ditch', 'Big Friend', FORMATION_RADIO.ditch, 0, 3);
    g.world.killAircraft(b, false, 'ditch'); b.falling = false;
    if (g.settings.bookends === false || g.bookends.auto) { b.remove = true; this.ship = null; return; }
    g.cine.interrupt(); this.snap.capture(g.engine); cineLens(g.engine, 48); this.hud.hide(g.ui.canvas);
    this.pos.copy(b.pos); this.quat.copy(b.quat);
    const sea = g.world.ditchingSea;
    sea.scene.add(b.root); b.root.rotation.set(0, 0, 0); b.root.visible = true;
    sea.camera.layers.enableAll();
    g.engine.renderOverride = dt => g.engine.renderStudio(sea.scene, sea.camera, dt);
    this.active = true; this.pose();
  }
  frame(dt: number) {
    if (!this.active) return false;
    const g = this.g;
    if (g.state === 'paused') return true;
    if (g.state !== 'playing') { this.release(); return false; }
    const previous = this.time; this.time += dt;
    if (previous < 11 && this.time >= 11) sound.play('waterImpact', null, {gain: 0.85});
    if (this.time >= 18 || g.input.hit('Escape')) { this.release(); return true; }
    this.pose(); return true;
  }
  private pose() {
    const g = this.g, sea = g.world.ditchingSea, b = this.ship!, t = this.time;
    sea.update(t, g.mission?.weather?.mood === 'night', g.settings.quality === 'low');
    b.root.position.set(0, t < 11 ? 1.6 + (11 - t) * 2.4 : 1.6 - (t - 11) * 0.2, t < 11 ? (t - 11) * 18 : Math.min(35, (t - 11) * 8));
    b.root.rotation.set(t < 11 ? 0.06 : -0.05, 0, Math.sin(t) * 0.012);
    b.updateProps(0); // stopped, feathered engines
    sea.camera.aspect = g.engine.camera.aspect; sea.camera.updateProjectionMatrix();
    sea.camera.position.set(49, 14, b.pos.z + 48); sea.camera.lookAt(b.pos);
    sound.setListener(sea.camera);
  }
  release() {
    if (!this.active) return;
    const g = this.g, b = this.ship!;
    g.world.scene.add(b.root); b.root.position.copy(this.pos); b.root.quaternion.copy(this.quat); b.remove = true;
    g.engine.renderOverride = undefined; this.snap.restore(g.engine); this.hud.restore();
    this.active = false; this.ship = null;
  }
  reset() { this.release(); this.used = false; this.time = 0; }
}

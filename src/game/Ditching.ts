import * as THREE from 'three';
import type { Game } from './Game';
import type { Bomber } from '../world/Aircraft';
import { CamSnapshot, ModelReveal, HudHider, cineLens } from './CineShared';
import { sound, type LoopEmitter } from '../audio/Sound';
import { voice } from '../audio/Voice';
import { tx } from '../i18n';
import { achievements } from './Achievements';
import { coastDistanceKm, shouldDitch, ditchSuccess, DITCH_TEXT, DITCH_RADIO, type DitchState } from './DitchingRules';

export const DITCH_DURATION = 31;
const CONTROL_ZONES = ['wingL', 'wingR', 'tail', 'cockpit'];
const RADIO_TIMES = [0, 5, 15.8, 21, 27];
/** Owns the frame until rescue; the still sea remains behind the debrief until release. */
export class Ditching {
  active = false;
  ditched = false;
  time = 0;
  private holding = false;
  private b: Bomber | null = null;
  private parent: THREE.Object3D | null = null;
  private pos = new THREE.Vector3();
  private quat = new THREE.Quaternion();
  private snap = new CamSnapshot();
  private reveal = new ModelReveal();
  private hud = new HudHider();
  private root: HTMLElement | null = null;
  private caption: HTMLElement | null = null;
  private subtitle: HTMLElement | null = null;
  private nextLine = 0;
  private shot = -1;
  private skip = false;
  private impactPlayed = false;
  private flarePlayed = false;
  private seaSound: LoopEmitter | null = null;
  private zero = new THREE.Vector3();
  private onDone: (() => void) | null = null;
  private readonly skipEvent = (e: Event) => {
    if (e instanceof KeyboardEvent && !['Space', 'Enter', 'Escape'].includes(e.code)) return;
    if (this.time > 0.6) { this.skip = true; e.preventDefault(); e.stopImmediatePropagation(); }
  };
  private rulesBomber: Bomber | null = null;
  private startIntegrity = 1;
  private controls: { hp: number }[] = [];
  private rules: DitchState = { campaign: false, gunner: false, coop: false, controllable: false, enginesOut: 0,
    integrity: 1, leaking: false, progress: 0, coastKm: 0, ending: false };
  constructor(private g: Game) {}

  eligible(ending: boolean): boolean {
    const g = this.g, m = g.mission, b = g.world.playerBomber;
    if (!m || !b || this.ditched || g.endResult) return false;
    const progress = Math.min(1, g.world.time / m.duration);
    // A structurally destroyed ship or dead pilots must retain the bail-out ending.
    const r = this.rules;
    r.controllable = !b.remove && b.alive;
    if (this.rulesBomber !== b) {
      this.rulesBomber = b; this.controls.length = 0;
      // scripted pre-damage (Last Light) sets the baseline; otherwise the ship started whole
      this.startIntegrity = m.playerDamaged ? b.integrity : 1;
      for (const n of CONTROL_ZONES) { const z = b.zone(n); if (z) this.controls.push(z); }
    }
    for (const z of this.controls) if (z.hp <= 0) r.controllable = false;
    r.campaign = !!m.number && !m.tutorial && Number.isFinite(m.duration); r.gunner = m.role === 'gunner';
    r.coop = !!g.coop.role; r.enginesOut = 0; for (const dead of b.engineDead) if (dead) r.enginesOut++; r.integrity = b.integrity;
    r.initialEnginesOut = m.playerDamaged ? 2 : 0;
    r.initialIntegrity = this.startIntegrity;
    r.leaking = g.world.bomberDamage.fuelLeaking; r.progress = progress; r.coastKm = coastDistanceKm(progress); r.ending = ending;
    return shouldDitch(r);
  }

  /** Before Director's shot-down rules, only on the return leg. */
  checkReturn(): boolean {
    if (!this.eligible(false)) return false;
    this.g.flow.finish(false, DITCH_TEXT.failure);
    return true;
  }

  /** Called once by MissionFlow.finish, before bail-out/fly-by/landing. */
  begin(success: boolean, done: () => void): boolean {
    if (!this.eligible(true) && !this.eligible(false)) return false;
    const g = this.g, b = g.world.playerBomber!, m = g.mission!;
    this.ditched = true; this.b = b; this.time = 0; this.nextLine = 0; this.shot = -1; this.skip = false; this.impactPlayed = this.flarePlayed = false;
    const won = ditchSuccess(!!m.bombsAway, g.director.bombsDropped, success || (!m.bombsAway && g.director.roundsComplete));
    g.endResult = { success: won, reason: won ? DITCH_TEXT.success : DITCH_TEXT.failure };
    g.state = 'ending'; g.engine.timeScale = 1; g.slowmo = 0;
    // Record once, even for skipped scenes; avoid World.killAircraft (bail-outs, wrecks, KIA radio).
    if (b.alive) g.world.stats.bombersLost++;
    b.alive = false; b.falling = false;
    if ((b.integrity < 0.3 || Math.random() < 0.35) && g.world.crew.woundRandom()) g.world.crewWounded++;
    achievements.unlock('goldfishClub');
    this.onDone = done;
    if (g.settings.bookends === false || g.bookends.auto) { b.root.visible = false; this.onDone = null; done(); return true; }
    g.cine.interrupt();
    this.active = true; this.parent = b.root.parent; this.pos.copy(b.pos); this.quat.copy(b.root.quaternion);
    this.snap.capture(g.engine); cineLens(g.engine, 48); this.reveal.reveal(b.model);
    this.hud.hide(g.ui.canvas); g.ui.hideAll(); g.input.unlock();
    const sea = g.world.ditchingSea;
    sea.scene.add(b.root); b.root.visible = true; b.root.rotation.set(0, 0, 0);
    sea.camera.layers.enableAll();
    sound.setMode('menu'); sound.prepareField(); voice.stop(); sound.stopSpeech();
    this.seaSound = sound.emitter('seaWash', { ref: 100, reverb: 0 });
    g.engine.renderOverride = dt => g.engine.renderStudio(sea.scene, sea.camera, dt);
    g.bookends.ensureCss();
    this.root = document.createElement('div'); this.root.id = 'ditchCine';
    this.root.innerHTML = '<div class="bar t"></div><div class="bar b"></div><div class="tag show"></div><div class="cap show"></div><div class="hint"></div><div class="sub"></div>';
    this.root.querySelector('.tag')!.textContent = tx(DITCH_TEXT.tag);
    this.root.querySelector('.hint')!.textContent = tx('CLICK TO SKIP');
    this.caption = this.root.querySelector('.cap'); this.subtitle = this.root.querySelector('.sub');
    document.body.appendChild(this.root);
    window.addEventListener('keydown', this.skipEvent, true); window.addEventListener('pointerdown', this.skipEvent, true);
    this.pose(); return true;
  }

  frame(dt: number): boolean {
    if (this.holding && this.g.cine.replaying) this.release();
    if (this.holding && this.g.state === 'debrief' && !this.g.cine.replaying) return true;
    if (!this.active) return false;
    if (this.g.state !== 'ending') { this.release(); return false; }
    this.time += Math.min(0.05, dt);
    if (this.skip || this.time >= DITCH_DURATION) {
      const done = this.onDone; this.onDone = null;
      // Finish the epilogue also when skipped, leaving the rescued crew behind the debrief.
      this.time = DITCH_DURATION; this.pose(); this.cleanup(); this.holding = true;
      done?.(); return true;
    }
    this.pose(); return true;
  }

  private pose() {
    const g = this.g, sea = g.world.ditchingSea, t = this.time, b = this.b!;
    sea.update(t, g.mission?.weather?.mood === 'night', g.settings.quality === 'low');
    const cam = sea.camera; cam.aspect = g.engine.camera.aspect; cam.updateProjectionMatrix();
    const shot = t < 5 ? 0 : t < 9 ? 1 : t < 16 ? 2 : t < 22 ? 3 : 4;
    if (shot !== this.shot) {
      this.shot = shot; g.engine.post.resetHistory();
      if (this.caption) this.caption.textContent = tx(shot <= 1 ? DITCH_TEXT.brace : shot === 2 ? DITCH_TEXT.impact : shot === 3 ? DITCH_TEXT.rafts : DITCH_TEXT.rescue);
    }
    b.root.position.set(0, t < 11 ? 1.6 + (11 - t) * 2.4 : 1.6 - Math.min(4, (t - 11) * 0.2), t < 11 ? (t - 11) * 18 : Math.min(35, (t - 11) * 8));
    b.root.rotation.set(t < 11 ? 0.025 : -Math.min(0.13, (t - 11) * 0.009), 0, Math.sin(t) * 0.018);
    b.root.visible = shot !== 1 && t < 28;
    if (shot === 0) { cam.position.set(48, b.root.position.y + 13, b.root.position.z + 55); cam.lookAt(b.root.position); }
    else if (shot === 1) { cam.position.set(2.35, 102.3, 3); cam.lookAt(-0.35, 100.8, -1.4); }
    else if (shot === 2) { cam.position.set(34, 7, 48); cam.lookAt(0, 1, b.root.position.z); }
    else { cam.position.set(35, 12, 43); cam.lookAt(3, 1, 8); }
    sound.setListener(cam);
    if (!this.seaSound && this.active && sound.fieldBuffer('seaWash', 0)) this.seaSound = sound.emitter('seaWash', { ref: 100, reverb: 0 });
    this.seaSound?.update(cam.position, this.zero, 0.6, 1);
    if (this.nextLine < RADIO_TIMES.length && t >= RADIO_TIMES[this.nextLine]) {
      const index = this.nextLine++, line = DITCH_RADIO[index];
      if (!voice.say(`ditch_${index + 1}`, { priority: 3 })) { sound.radioStatic(); sound.speak(line[1], 7); }
      if (this.subtitle) { this.subtitle.textContent = tx(line[1]); this.subtitle.style.cssText = 'color:white;background:#0009;padding:8px 14px;font-size:18px'; }
    }
    if (!this.impactPlayed && t >= 11) { this.impactPlayed = true; if (t < DITCH_DURATION) sound.play('waterImpact', b.root.position, { gain: 1.1 }); }
    if (!this.flarePlayed && t >= 21) { this.flarePlayed = true; if (t < DITCH_DURATION) sound.play('flarePop', sea.flare.position, { gain: 1 }); }
  }

  private cleanup() {
    this.active = false;
    window.removeEventListener('keydown', this.skipEvent, true); window.removeEventListener('pointerdown', this.skipEvent, true);
    this.root?.remove(); this.root = this.caption = this.subtitle = null;
    this.seaSound?.stop(0.3); this.seaSound = null; voice.stop(); sound.stopSpeech();
    this.snap.restore(this.g.engine); this.hud.restore(); this.reveal.restore();
  }
  release() {
    if (this.active) this.cleanup();
    if (this.holding || this.b) {
      this.g.engine.renderOverride = undefined;
      if (this.b && this.parent) {
        this.parent.add(this.b.root); this.b.root.position.copy(this.pos); this.b.root.quaternion.copy(this.quat); this.b.root.visible = false;
      }
      this.g.engine.post.resetHistory();
    }
    this.b = null; this.parent = null; this.holding = false; this.onDone = null;
  }
  reset() { this.release(); this.ditched = false; }
}

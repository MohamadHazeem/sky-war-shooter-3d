import * as THREE from 'three';
import type { Game } from './Game';
import { Aircraft, Fighter, WRECK_FLOOR } from '../world/Aircraft';
import { ENEMY_VARIANTS, type EnemyType } from '../world/EnemyTypes';
import { segSphere } from '../world/Ballistics';
import { Searchlights } from '../render/Searchlights';
import { updateNightExhaust } from '../render/NightExhaust';
import { weatherNow } from '../render/Weather';
import { access } from '../core/Accessibility';
import { sound } from '../audio/Sound';
import { tx, CANVAS_MONO } from '../i18n';
import { AA_MODE } from './AADefenceMode';
import { AABattlefield, type AAAsset } from './AADefenceScene';
import { aaWave, aaMount, AA_GUNS, traverseAA, tickAAGun, fireAAGun, damageAAAsset, repairAAPit, aaDefeated, aaIntegrity, type AAGroup, type AAMount } from './AADefenceRules';
import './aa-defence.css';

export const AA_RADIO = {
  inbound: 'Control to gun crews: raiders inbound. Protect the tower and the parked Fortresses!',
  major: 'Control: major raid approaching. All gun pits, open fire!',
  repair: 'Control: raid broken up. Repair crews, move out!',
} as const;
interface Raider {
  f: Fighter; group: AAGroup; goal: AAAsset; start: THREE.Vector3; course: THREE.Vector3;
  distance: number; progress: number; fire: number; payload: number; nextDrop: number; screamed: boolean; crashed: boolean;
}
const ZERO = new THREE.Vector3(), FORWARD = new THREE.Vector3(0, 0, 1);
const TRACER: [number, number, number] = [12, 6, 1.4];
const AXIS_TRACER: [number, number, number] = [12, 3, 0.5];
const KEYS = ['Digit1', 'Digit2', 'Digit3'];
const UPGRADES = ['Faster traverse', 'More ammunition', 'Repair base', 'Open third pit'];
const clamp = THREE.MathUtils.clamp;

/** Owns the fixed-gun simulation; the existing airborne controllers/director are bypassed. */
export class AADefence {
  active = false;
  field: AABattlefield | null = null;
  mounts: AAMount[] = [];
  raiders: Raider[] = [];
  wave = 1;
  selected = 0;
  unlocked = 2;
  choosing = false;
  transition = 0;
  traverse = 1;
  ammoMult = 1;
  readonly lights: Searchlights<Fighter>;
  private plan = aaWave(1);
  private groupIndex = 0;
  private waveTime = 0;
  private hudTime = 0;
  private burnTime = 0;
  private recoil = 0;
  private blastShake = 0;
  private smokeTime = 0;
  private savedCirrus = 1;
  private hits = 0;
  private incomingText = '';
  private hitT = 0;
  private targets: Fighter[] = [];
  private panel: HTMLElement | null = null;
  private status: HTMLElement | null = null;
  private health: HTMLMeterElement | null = null;
  private assetText: HTMLElement | null = null;
  private assetBars: HTMLMeterElement[] = [];
  private ammoBar: HTMLMeterElement | null = null;
  private heatBar: HTMLMeterElement | null = null;
  private ammoText: HTMLElement | null = null;
  private gunText: HTMLElement | null = null;
  private choices: HTMLElement | null = null;
  private fromEye = new THREE.Vector3();
  private eye = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private p = new THREE.Vector3();
  private v = new THREE.Vector3();
  private old = new THREE.Vector3();
  private projected = new THREE.Vector3();
  private aimQuat = new THREE.Quaternion();
  private inverseAim = new THREE.Quaternion();
  private aimEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  constructor(private g: Game) {
    this.lights = new Searchlights(g.world.scene, () => this.active && weatherNow.night > 0.5);
  }
  start() {
    this.active = true;
    // The sky dome's stretched cirrus plane fans into dark radial lines from ground level.
    // Keep volumetric weather clouds; suppress only this decorative high-altitude layer.
    this.savedCirrus = this.g.engine.sky.cirrus.value; this.g.engine.sky.cirrus.value = 0;
    this.field = new AABattlefield(this.g.engine.quality);
    this.field.show(this.g.engine.scene);
    this.mounts = [aaMount(0), aaMount(1), aaMount(0)];
    for (let i = 0; i < 3; i++) {
      const pit = this.field.pits[i], target = this.field.assets[i === 1 ? 0 : 1];
      this.mounts[i].yaw = this.mounts[i].wantYaw = Math.atan2(target.pos.x - pit.pos.x, target.pos.z - pit.pos.z);
      this.mounts[i].pitch = this.mounts[i].wantPitch = 0.08;
    }
    this.raiders.length = this.targets.length = 0;
    this.wave = 1; this.selected = 0; this.unlocked = 2; this.choosing = false;
    this.traverse = this.ammoMult = 1; this.blastShake = this.smokeTime = this.transition = this.recoil = this.hudTime = this.burnTime = this.hits = 0;
    this.g.world.playerIncendiary = this.g.world.playerExplosive = this.g.world.playerSplash = 0;
    this.g.world.playerWingDmg = this.g.world.playerExecute = 1;
    this.g.world.ballistics.playerHitScale = 1;
    this.g.world.floorY = 0; WRECK_FLOOR.fighter = -100;
    this.g.world.ballistics.ground = this.groundHit;
    this.g.world.formationForward.set(0, 0, 0);
    this.g.world.formationCenter.copy(this.field.pits[0].pos);
    const lamps = this.field.pits.map(a => a.pos.clone());
    for (const pit of this.field.pits) lamps.push(pit.pos.clone().add(new THREE.Vector3(-150, 0, 250)));
    this.lights.setup(lamps, this.v.set(Math.sin(0.72), 0, Math.cos(0.72)));
    this.camera(0);
    // Compile field, pooled ordnance/casings/craters and searchlights before exposing the view.
    for (const s of this.field.shells) s.mesh.visible = true;
    for (const c of this.field.cases) c.mesh.visible = true;
    for (const c of this.field.craters) c.visible = true;
    this.g.engine.renderer.compile(this.g.engine.scene, this.g.engine.camera);
    for (const s of this.field.shells) s.mesh.visible = false;
    for (const c of this.field.cases) c.mesh.visible = false;
    for (const c of this.field.craters) c.visible = false;
    sound.setMode('ground'); sound.setCabin(null);
    this.beginWave();
  }
  mountHud() {
    document.body.classList.add('aa-mode');
    const panel = this.panel = document.createElement('div'); panel.id = 'aaHud';
    this.status = document.createElement('div'); this.status.className = 'aa-status'; panel.append(this.status);
    const label = document.createElement('label'); label.textContent = tx('Base integrity');
    this.health = document.createElement('meter'); this.health.min = 0; this.health.max = 1; label.append(this.health); panel.append(label);
    this.assetText = document.createElement('div'); this.assetText.className = 'aa-assets'; panel.append(this.assetText);
    this.assetBars.length = 0;
    const icons = { tower: '▥', hangar: '⌂', bomber: '✈', fuel: '▰', pit: '⊕' };
    const counts = { tower: 0, hangar: 0, bomber: 0, fuel: 0, pit: 0 };
    for (const asset of this.field!.assets) {
      const row = document.createElement('label'); row.className = 'aa-asset';
      const icon = document.createElement('span'); icon.textContent = icons[asset.kind]; icon.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span'); label.textContent = tx(asset.label) + ' ' + (++counts[asset.kind]);
      const bar = document.createElement('meter'); bar.min = 0; bar.max = 1; bar.setAttribute('aria-label', label.textContent);
      row.append(icon, label, bar); this.assetText.append(row); this.assetBars.push(bar);
    }
    const bottom = document.createElement('div'); bottom.className = 'aa-gun'; panel.append(bottom);
    this.gunText = document.createElement('div'); this.gunText.className = 'aa-gun-title'; bottom.append(this.gunText);
    const gauges = document.createElement('div'); gauges.className = 'aa-gauges'; bottom.append(gauges);
    for (const name of ['Ammunition', 'Heat']) {
      const label = document.createElement('label'); label.append(tx(name));
      const meter = document.createElement('meter'); meter.min = 0; meter.max = 1; meter.setAttribute('aria-label', tx(name)); label.append(meter);
      if (name === 'Ammunition') { this.ammoBar = meter; this.ammoText = document.createElement('span'); label.append(this.ammoText); }
      else this.heatBar = meter;
      gauges.append(label);
    }
    for (let i = 0; i < 3; i++) {
      const b = document.createElement('button'); b.textContent = (i + 1) + ' · ' + tx(AA_GUNS[i === 1 ? 1 : 0].name);
      b.onclick = () => this.switchPit(i); bottom.append(b);
    }
    const reload = document.createElement('button'); reload.textContent = tx('Reload'); reload.onclick = () => this.reload(); bottom.append(reload);
    const help = document.createElement('div'); help.className = 'aa-help';
    help.textContent = tx('Mouse / drag: aim · Fire: mouse / Space · 1–3: gun pits · R: reload · Right button: zoom'); bottom.append(help);
    this.choices = document.createElement('div'); this.choices.className = 'aa-choices'; this.choices.hidden = true;
    const title = document.createElement('h2'); title.textContent = tx('Wave clear — choose one'); this.choices.append(title);
    for (let i = 0; i < UPGRADES.length; i++) {
      const b = document.createElement('button'); b.textContent = (i + 1) + ' · ' + tx(UPGRADES[i]);
      b.onclick = () => this.choose(i); this.choices.append(b);
    }
    panel.append(this.choices); document.body.append(panel); this.refreshHud();
  }
  release() {
    if (!this.active) return;
    this.active = false; this.choosing = false;
    this.g.engine.sky.cirrus.value = this.savedCirrus;
    this.field?.dispose(); this.field = null; this.lights.clear();
    this.panel?.remove(); this.panel = null; document.body.classList.remove('aa-mode');
    this.raiders.length = this.targets.length = 0;
    this.g.world.ballistics.ground = null; this.g.world.floorY = 250; WRECK_FLOOR.fighter = 3000;
    this.g.world.formationForward.set(0, 0, 1);
    this.g.ui.ctx.clearRect(0, 0, innerWidth, innerHeight);
  }
  switchPit(i: number) {
    if (this.choosing || i < 0 || i >= this.unlocked || i === this.selected || this.g.state !== 'playing') return;
    this.field!.rigs[this.selected].barrel.position.z = 0;
    this.fromEye.copy(this.g.engine.camera.position); this.selected = i; this.transition = 0.65; this.recoil = 0;
  }
  reload() {
    const m = this.mounts[this.selected], kind = this.selected === 1 ? 1 : 0;
    if (m && !m.reload && m.ammo < AA_GUNS[kind].ammo * this.ammoMult) m.reload = AA_GUNS[kind].reload;
  }
  choose(i: number) {
    if (!this.choosing || this.g.state !== 'playing' || i < 0 || i > 3) return;
    if ((i === 0 && this.traverse >= 2.5) || (i === 1 && this.ammoMult >= 3) || (i === 3 && this.unlocked === 3)) return;
    if (i === 0) this.traverse = Math.min(2.5, this.traverse + 0.2);
    if (i === 1) this.ammoMult = Math.min(3, this.ammoMult + 0.25);
    if (i === 2) for (const a of this.field!.assets) {
      // Lost bombers stay lost; buildings can be rebuilt while the tower still stands.
      if (a.kind === 'bomber' && a.hp <= 0) continue;
      a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.4); a.repair = 0; a.object.scale.y = a.originalY;
    }
    if (i === 3) { this.unlocked = 3; const pit = this.field!.pits[2]; pit.hp = pit.maxHp; pit.repair = 0; }
    for (let j = 0; j < 3; j++) { const m = this.mounts[j]; m.ammo = Math.round(AA_GUNS[j === 1 ? 1 : 0].ammo * this.ammoMult); m.heat = m.reload = m.clipReload = 0; m.clip = 4; m.locked = false; }
    this.choosing = false; if (this.choices) this.choices.hidden = true;
    this.wave++; this.g.roundIdx = this.wave - 1; this.g.roundT0 = this.g.world.time;
    this.beginWave(); this.g.input.lock();
  }
  private beginWave() {
    this.plan = aaWave(this.wave); this.waveTime = -4; this.groupIndex = 0;
    // Aircraft are retired by World; compact only at wave boundaries.
    this.raiders.length = this.targets.length = 0;
    if (this.wave > 1) this.g.ui.banner(this.plan.major ? 'Major raid' : tx('Wave {n}', { n: this.wave }), AA_MODE.title, 3000);
    this.g.world.callout('aa_wave', 'Control', this.plan.major ? AA_RADIO.major : AA_RADIO.inbound, 0, 3);
  }
  private spawn(group: AAGroup) {
    const field = this.field!, w = this.g.world;
    for (let i = 0; i < group.count; i++) {
      let index = (this.wave + i + this.groupIndex * 3) % field.assets.length;
      for (let j = 0; j < field.assets.length; j++) {
        const a = field.assets[index];
        if (a.hp > 0 && (a.kind !== 'pit' || field.pits.indexOf(a) < this.unlocked)) break;
        index = (index + 1) % field.assets.length;
      }
      // Level bombers share the same release line, forming a loose vic.
      const goal = group.profile === 'level' ? field.assets[(this.wave + this.groupIndex) % 3] : field.assets[index];
      const course = new THREE.Vector3(-Math.sin(group.bearing), 0, -Math.cos(group.bearing));
      const start = goal.pos.clone().addScaledVector(course, -2600 - i * 110);
      start.x += Math.cos(group.bearing) * (i % 3 - 1) * 65;
      start.z -= Math.sin(group.bearing) * (i % 3 - 1) * 65;
      start.y = group.profile === 'dive' ? 1450 : group.profile === 'level' ? 800 : 155 + i * 12;
      const f = w.spawnEnemy(start, 'headon', 1, false, false, group.type);
      w.clearPilot(f); f.kinematic = true; f.guns.length = 0;
      // Readable at ground ranges, without the six-times enlargement used at 25,000 ft.
      const scale = 0.45; f.model.scale.multiplyScalar(scale); f.radius *= scale;
      for (const z of f.zones) { z.offset.multiplyScalar(scale); z.radius *= scale; }
      f.structure *= 0.8; f.maxStructure = f.structure;
      f.fm.throttle = 0.85;
      this.raiders.push({ f, group, goal, start, course, distance: 2600 + i * 110, progress: 0, fire: 0, payload: group.profile === 'level' ? 5 : group.profile === 'dive' ? 3 : group.profile === 'rocket' ? 2 : 0, nextDrop: 0, screamed: false, crashed: false });
      this.targets.push(f);
    }
  }
  frame(dt: number) {
    const g = this.g, w = g.world;
    if (!this.active || !this.field) return;
    if (this.panel) this.panel.hidden = g.state === 'paused' || g.state === 'debrief' || g.photo.active;
    if (g.state === 'debrief') { if (this.panel) this.panel.hidden = true; g.ui.ctx.clearRect(0, 0, innerWidth, innerHeight); g.input.endFrame(); return; }
    if (g.photo.active) { g.photo.update(); g.ui.ctx.clearRect(0, 0, innerWidth, innerHeight); sound.setListener(g.engine.camera); g.input.endFrame(); return; }
    if (g.state === 'paused') { g.input.endFrame(); return; }
    this.field.base.update(w.time);
    this.field.detail.update(g.engine.camera, w.time, this.targets.length > 0);
    if (this.choosing) {
      for (let i = 0; i < 4; i++) if (g.input.hit('Digit' + (i + 1))) { this.choose(i); break; }
      this.draw(); g.input.endFrame(); return;
    }
    if (g.state === 'playing') {
      this.waveTime += dt;
      while (this.groupIndex < this.plan.groups.length && this.waveTime >= this.plan.groups[this.groupIndex].at) this.spawn(this.plan.groups[this.groupIndex++]);
      this.attacks(dt);
      this.controls(dt);
    }
    this.projectiles(dt);
    w.update(dt);
    if (w.stats.hits > this.hits) { this.hits = w.stats.hits; this.hitT = 0.16; }
    w.formationCenter.copy(this.field.pits[this.selected].pos);
    for (const r of this.raiders) {
      if (!r.f.alive && !r.crashed && (r.f.pos.y <= 8 || r.f.remove)) {
        r.crashed = true; this.p.copy(r.f.pos).setY(1); this.blast(this.p, 30, 0); this.field.wreck(this.p); r.f.remove = true;
      }
    }
    this.burnTime += dt;
    for (const a of this.field.assets) {
      repairAAPit(a, dt);
      if (a.hp <= 0 && a.kind !== 'pit' && this.burnTime >= 0.12) {
        w.effects.trail(a.pos, ZERO, 2, true, a.kind === 'bomber' ? 3 : 7, 0.12);
      }
    }
    for (const wreck of this.field.wrecks) if (wreck.ttl > 0) {
      wreck.ttl -= dt;
      if (this.burnTime >= 0.12) w.effects.trail(wreck.pos, ZERO, 2, true, 3, 0.12);
    }
    if (this.burnTime >= 0.12) this.burnTime = 0;
    this.lights.group.visible = weatherNow.night > 0.5;
    if (weatherNow.night > 0.5) { this.lights.update(dt, this.targets); updateNightExhaust(this.targets, w.effects.glow); }
    this.camera(dt);
    this.smokeTime += dt;
    for (let i = 0; i < this.mounts.length; i++) {
      const mount = this.mounts[i], rig = this.field.rigs[i];
      rig.heat.emissiveIntensity = Math.max(0, mount.heat - 0.45) * 0.9;
      rig.clip.visible = i !== 1 || (!mount.clipReload && !mount.reload);
      if (mount.heat > 0.5 && this.smokeTime >= 0.14) {
        this.p.set(i === 1 ? 0 : 0.32, -0.24, i === 1 ? 2.6 : 1.6); rig.barrel.localToWorld(this.p);
        w.effects.gunSmoke(this.p, ZERO);
      }
    }
    if (this.smokeTime >= 0.14) this.smokeTime = 0;
    g.combo.update(dt); this.hitT = Math.max(0, this.hitT - dt);
    sound.setListener(g.engine.camera); w.listener = g.engine.camera.position;
    w.ballistics.listener.copy(g.engine.camera.position);
    w.ballistics.renderTracers(g.engine.camera, g.engine.renderer.domElement.height);
    g.engine.post.exposure = 1; g.engine.post.vignette = 0.6; g.engine.post.damageFlash *= Math.exp(-dt * 5);
    this.hudTime += dt;
    if (this.hudTime >= 0.12) {
      this.hudTime = 0; this.refreshHud(); sound.updateFighterVoices(w.fighterSoundInfo());
      sound.music.setContext(g.mission?.id, false, this.lights.coned.size);
      sound.music.setThreat(Math.min(1, this.targets.length * 0.045 + (1 - aaIntegrity(this.field.assets)) * 0.4));
    }
    this.draw();
    if (g.state === 'playing') {
      if (aaDefeated(this.field.assets)) g.finish(false, this.field.assets.some(a => a.kind === 'tower' && a.hp <= 0) ? 'The control tower has been destroyed.' : 'All parked bombers have been destroyed.');
      else if (this.waveSettled()) {
        this.choosing = true;
        if (this.choices) {
          this.choices.hidden = false;
          const buttons = this.choices.querySelectorAll('button');
          buttons[0].disabled = this.traverse >= 2.5; buttons[1].disabled = this.ammoMult >= 3; buttons[3].disabled = this.unlocked === 3;
        }
        g.input.unlock(); w.callout('aa_repair', 'Control', AA_RADIO.repair, 0, 3);
      }
    }
    if (g.state === 'ending') g.flow.updateEnding(dt);
    g.input.endFrame();
  }
  private waveSettled() {
    if (this.groupIndex < this.plan.groups.length) return false;
    for (const r of this.raiders) if (r.f.alive && !r.f.remove) return false;
    for (const s of this.field!.shells) if (s.team && s.ttl > 0) return false;
    return true;
  }
  private controls(dt: number) {
    const input = this.g.input;
    for (let i = 0; i < 3; i++) if (input.hit(KEYS[i])) this.switchPit(i);
    if (input.hit('KeyR')) this.reload();
    for (let i = 0; i < 3; i++) tickAAGun(this.mounts[i], i === 1 ? 1 : 0, dt, this.ammoMult);
    const m = this.mounts[this.selected], kind = this.selected === 1 ? 1 : 0;
    m.wantYaw -= input.mouseDX * 0.0024 * input.sensitivity;
    m.wantPitch -= input.mouseDY * 0.0024 * input.sensitivity * (input.invertY ? -1 : 1);
    // Keyboard aiming remains useful without pointer lock and with assistive switches.
    m.wantYaw += ((input.down('ArrowLeft') ? 1 : 0) - (input.down('ArrowRight') ? 1 : 0)) * dt;
    m.wantPitch += ((input.down('ArrowUp') ? 1 : 0) - (input.down('ArrowDown') ? 1 : 0)) * dt;
    traverseAA(m, kind, dt, this.traverse);
    this.camera(0);
    if (this.transition <= 0 && this.field!.pits[this.selected].hp > 0 && (input.mouse(0) || input.down('Space')) && fireAAGun(m, kind)) this.fire(kind);
  }
  private camera(dt: number) {
    if (!this.field) return;
    const m = this.mounts[this.selected], cam = this.g.engine.camera, rig = this.field.rigs[this.selected];
    rig.yaw.rotation.y = m.yaw; rig.pitch.rotation.x = -m.pitch;
    this.aimEuler.set(-m.pitch, m.yaw, 0); this.aimQuat.setFromEuler(this.aimEuler);
    this.dir.set(0, 0, 1).applyQuaternion(this.aimQuat);
    this.eye.set(0, 0.18, -0.8).applyQuaternion(this.aimQuat).add(this.field.pits[this.selected].pos); this.eye.y += 1.5;
    this.transition = Math.max(0, this.transition - dt);
    if (this.transition > 0) cam.position.lerpVectors(this.fromEye, this.eye, 1 - this.transition / 0.65);
    else cam.position.copy(this.eye);
    this.recoil *= Math.exp(-dt * 18);
    rig.barrel.position.z = -this.recoil;
    this.p.copy(cam.position).add(this.dir); cam.up.set(0, 1, 0); cam.lookAt(this.p);
    const fov = this.g.input.mouse(2) ? 42 : 68;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    this.blastShake *= Math.exp(-dt * 4.5);
    const shake = this.blastShake * this.blastShake * access.shake;
    cam.rotateX(Math.sin(this.g.world.time * 63) * shake * 0.024);
    cam.rotateZ(Math.sin(this.g.world.time * 49) * shake * 0.017);
    cam.position.y += Math.sin(this.g.world.time * 71) * shake * 0.04;
    cam.updateMatrixWorld();
  }
  private fire(kind: number) {
    const w = this.g.world, field = this.field!;
    this.p.set(0, -0.24, 2.7).applyQuaternion(this.aimQuat).add(field.pits[this.selected].pos); this.p.y += 1.5;
    if (!kind) {
      for (let i = 0; i < 4; i++) {
        this.p.set((i % 2 ? 1 : -1) * 0.32, -0.17 - Math.floor(i / 2) * 0.27, 1.68).applyQuaternion(this.aimQuat).add(field.pits[this.selected].pos); this.p.y += 1.5;
        this.v.copy(this.dir); this.v.x += (Math.random() - 0.5) * 0.008; this.v.y += (Math.random() - 0.5) * 0.008;
        this.v.normalize().multiplyScalar(AA_GUNS[0].speed);
        w.ballistics.fire(this.p, this.v, 'allied', 16, true, TRACER, null, false, true, 3);
        w.effects.playerMuzzle(this.p, this.dir, ZERO);
      }
      w.stats.shots += 4;
    } else {
      let range = 1100, best = 0.96;
      for (const r of this.raiders) if (r.f.alive && !r.f.remove) {
        this.v.copy(r.f.pos).sub(this.p); const d = this.v.length(), dot = this.v.normalize().dot(this.dir);
        if (dot > best) { best = dot; range = clamp(d, 120, 1800); }
      }
      this.shell(this.p, this.v.copy(this.dir).multiplyScalar(850), range / 850, false, 140, false);
      w.ballistics.fire(this.p, this.v, 'allied', 0, true, TRACER, null, true, false, range / 850);
      w.stats.shots++;
    }
    this.recoil = kind ? 0.22 : 0.1;
    if (kind) w.effects.playerMuzzle(this.p, this.dir, ZERO);
    sound.playerGun(true, !!kind, true);
    let emitted = 0;
    for (const c of field.cases) if (c.ttl <= 0) {
      c.ttl = 2.4; c.mesh.visible = true;
      c.mesh.scale.set(kind ? 0.045 : 0.024, kind ? 0.045 : 0.024, kind ? 0.28 : 0.12);
      this.p.set(kind ? 0.22 : (emitted % 2 ? -0.5 : 0.5), -0.22, 0.05).applyQuaternion(this.aimQuat).add(field.pits[this.selected].pos); this.p.y += 1.5;
      c.mesh.position.copy(this.p);
      c.vel.set((emitted % 2 ? -1 : 1) * (1.6 + Math.random()), 1 + Math.random(), -1.2).applyQuaternion(this.aimQuat);
      if (++emitted >= (kind ? 1 : 4)) break;
    }
  }
  private attacks(dt: number) {
    for (const r of this.raiders) {
      const f = r.f; if (!f.alive || f.remove) continue;
      this.old.copy(f.pos); r.progress += r.group.speed * dt;
      f.pos.copy(r.start).addScaledVector(r.course, r.progress);
      const remaining = r.distance - r.progress;
      if (r.group.profile === 'dive') {
        const dive = clamp((r.progress - 850) / 1300, 0, 1);
        f.pos.y = 1450 - dive * 1240 + Math.max(0, r.progress - 2350) * 0.6;
        if (dive > 0.2 && !r.screamed) { sound.distantWhine(f.pos, 0.8); r.screamed = true; }
      } else if (r.group.profile !== 'level') f.pos.y = r.start.y + Math.max(0, r.progress - r.distance) * 0.18;
      f.vel.copy(f.pos).sub(this.old).divideScalar(Math.max(dt, 0.0001)); f.fm.vel.copy(f.vel);
      this.v.copy(f.vel).normalize(); f.quat.setFromUnitVectors(FORWARD, this.v);
      r.fire -= dt; r.nextDrop -= dt;
      if ((r.group.profile === 'strafe' || r.group.profile === 'rocket') && remaining < 850 && remaining > 40 && r.fire <= 0) {
        r.fire = 0.18;
        this.v.copy(r.goal.pos).sub(f.pos); this.v.x += (Math.random() - 0.5) * 30; this.v.z += (Math.random() - 0.5) * 30; this.v.normalize().multiplyScalar(800);
        this.g.world.ballistics.fire(f.pos, this.v, 'axis', 3.5 + Math.min(4, this.wave * 0.15), true, AXIS_TRACER, f, true, false, 3);
      }
      const fall = Math.sqrt(2 * f.pos.y / 9.81);
      const release = r.group.profile === 'dive' ? remaining < 460 && f.pos.y < 650 : r.group.profile === 'rocket' ? remaining < 850 : remaining < fall * r.group.speed;
      if (r.payload > 0 && release && r.nextDrop <= 0) {
        const rocket = r.group.profile === 'rocket', time = rocket ? f.pos.distanceTo(r.goal.pos) / 350 : fall;
        this.v.copy(r.goal.pos).sub(f.pos); this.v.y = rocket ? this.v.y : 0;
        this.v.x += (r.payload - 2) * 13; this.v.z += (r.payload - 2) * 16;
        this.v.divideScalar(Math.max(0.2, time));
        this.shell(f.pos, this.v, time + 1, true, rocket ? 65 : r.group.profile === 'level' ? 45 : 85, rocket);
        if (rocket) sound.play('rocket', f.pos, { gain: 0.7 });
        r.payload--; r.nextDrop = rocket ? 0.4 : 0.35;
      }
      if (r.progress > r.distance + 2300) f.remove = true;
    }
  }
  private shell(pos: THREE.Vector3, vel: THREE.Vector3, ttl: number, team: boolean, damage: number, rocket: boolean) {
    for (const s of this.field!.shells) if (s.ttl <= 0) {
      s.ttl = ttl; s.team = team; s.damage = damage; s.rocket = rocket;
      s.mesh.position.copy(pos); s.vel.copy(vel); s.mesh.visible = true; s.mesh.scale.set(team ? 0.35 : 0.12, team ? 0.35 : 0.12, team ? 2.4 : 0.6); return;
    }
  }
  private projectiles(dt: number) {
    for (const s of this.field!.shells) {
      if (s.ttl <= 0) continue;
      s.ttl -= dt; this.old.copy(s.mesh.position);
      if (!s.rocket) s.vel.y -= 9.81 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      this.v.copy(s.vel).normalize(); s.mesh.quaternion.setFromUnitVectors(FORWARD, this.v);
      if (s.rocket && s.team) this.g.world.effects.trail(s.mesh.position, ZERO, 1, true, 0.2, dt);
      if (!s.team) {
        for (const r of this.raiders) if (r.f.alive && !r.f.remove && segSphere(this.old.x, this.old.y, this.old.z, s.mesh.position.x, s.mesh.position.y, s.mesh.position.z, r.f.pos.x, r.f.pos.y, r.f.pos.z, 26) >= 0) { s.ttl = 0; break; }
        if (s.ttl <= 0) this.airburst(s.mesh.position, s.damage);
      } else if (s.mesh.position.y <= 1 || s.ttl <= 0) {
        this.p.copy(s.mesh.position).setY(1); this.blast(this.p, 52, s.damage); s.ttl = 0;
      }
      s.mesh.visible = s.ttl > 0;
    }
    for (const c of this.field!.cases) if (c.ttl > 0) {
      c.ttl -= dt; c.vel.y -= 9.81 * dt; c.mesh.position.addScaledVector(c.vel, dt); c.mesh.rotation.x += dt * 9;
      if (c.mesh.position.y < 0.19) { c.mesh.position.y = 0.19; c.vel.y = Math.abs(c.vel.y) * 0.25; c.vel.x *= 0.65; c.vel.z *= 0.65; }
      c.mesh.visible = c.ttl > 0;
    }
  }
  private airburst(pos: THREE.Vector3, damage: number) {
    const w = this.g.world; w.effects.flak(pos); sound.flakBurst(pos, 0.4);
    let hit = false;
    for (const r of this.raiders) if (r.f.alive && !r.f.remove) {
      const d = pos.distanceTo(r.f.pos); if (d > 48) continue;
      const f = r.f, dmg = damage * (1 - d / 60); f.structure -= dmg; f.damageTaken += dmg; f.playerDamage += dmg; f.lastPlayerHit = w.time;
      w.stats.damage += dmg; hit = true;
      if (f.structure <= 0) w.killAircraft(f, true, 'flak');
    }
    if (hit) { w.stats.hits++; this.hitT = 0.18; this.g.combo.onHit(); sound.confirm('hit_confirm'); }
  }
  private blast(pos: THREE.Vector3, radius: number, damage: number) {
    const w = this.g.world;
    w.effects.explosion(pos, ZERO, 0.65); w.effects.spawnDebris(pos, ZERO, 5, true);
    sound.play('explosion', pos, { gain: 0.8 }); this.field!.crater(pos, 9);
    if (damage) for (const a of this.field!.assets) {
      const d = pos.distanceTo(a.pos);
      if (d < radius + a.radius) this.damageAsset(a, damage * Math.max(0.15, 1 - Math.max(0, d - a.radius) / radius));
    }
    const near = Math.max(0, 1 - pos.distanceTo(this.eye) / 100);
    if (near > 0) {
      this.blastShake = Math.min(1, this.blastShake + near);
      this.g.engine.post.damageFlash = 0.12 * near * access.flash;
      for (let i = 0; i < 10; i++) {
        w.effects.groundDust(pos);
      }
    }
  }
  damageAsset(a: AAAsset, damage: number) {
    if (!damageAAAsset(a, damage)) return;
    if (a.kind === 'pit') this.g.ui.feed(tx('Gun crew wounded — repairing'), 'loss');
    else {
      a.object.scale.y = a.originalY * 0.3;
      this.g.world.effects.explosion(a.pos, ZERO, a.kind === 'fuel' ? 2 : 0.8);
      this.g.world.effects.spawnDebris(a.pos, ZERO, 8, true);
      this.field!.crater(a.pos, a.radius);
      this.g.ui.feed(tx('{asset} destroyed', { asset: tx(a.label) }), 'loss');
    }
  }
  private groundHit = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, axis: boolean, damage: number): boolean => {
    if (!this.field) return false;
    if (axis) for (const a of this.field.assets) {
      if (a.hp <= 0) continue;
      if (segSphere(ax, ay, az, bx, by, bz, a.pos.x, a.pos.y + (a.kind === 'pit' ? 1 : 6), a.pos.z, a.radius) >= 0) {
        this.damageAsset(a, damage); this.p.set(bx, Math.max(0.3, by), bz); this.g.world.effects.sparks(this.p, ZERO); return true;
      }
    }
    if (by > 0) return false;
    this.p.set(bx, 0.4, bz); this.g.world.effects.gunSmoke(this.p, ZERO);
    return true;
  };
  onKill(victim: Aircraft, byPlayer: boolean) {
    if (!byPlayer || victim.team !== 'axis' || this.g.state !== 'playing') return;
    const base = ENEMY_VARIANTS[(victim as Fighter).enemyType as EnemyType]?.score ?? 100;
    const pts = Math.round(base * this.g.combo.scoreMult);
    this.g.score += pts; this.g.combo.onKill(); this.hitT = 0.4;
    this.g.tally.recordKill(1, victim.pos.distanceTo(this.eye), null);
    this.g.ui.feed(victim.label + ' · +' + pts, 'mine'); sound.confirm('kill_confirm');
  }
  private refreshHud() {
    if (!this.status || !this.field) return;
    const m = this.mounts[this.selected], a = this.field.pits[this.selected], gun = AA_GUNS[this.selected === 1 ? 1 : 0];
    const next = this.plan.groups[this.groupIndex];
    this.incomingText = next ? tx('Incoming raid · {seconds}s', { seconds: Math.max(0, Math.ceil(next.at - this.waveTime)) }) : '';
    this.status.textContent = tx('Wave {n}', { n: this.wave }) + '   ·   ' + tx('Score') + ' ' + this.g.score + '   ·   ' + tx('Kills') + ' ' + this.g.world.stats.kills + '   ×' + this.g.combo.scoreMult.toFixed(1);
    this.health!.value = aaIntegrity(this.field.assets);
    for (let i = 0; i < this.field.assets.length; i++) {
      const asset = this.field.assets[i], bar = this.assetBars[i]; bar.value = asset.hp / asset.maxHp;
      bar.parentElement!.classList.toggle('lost', asset.hp <= 0);
      bar.parentElement!.classList.toggle('locked', asset.kind === 'pit' && this.field.pits.indexOf(asset) >= this.unlocked);
    }
    this.ammoBar!.value = m.ammo / Math.round(gun.ammo * this.ammoMult);
    this.heatBar!.value = m.heat; this.heatBar!.classList.toggle('hot', m.heat > 0.75);
    this.ammoText!.textContent = m.ammo + ' / ' + Math.round(gun.ammo * this.ammoMult);
    this.gunText!.textContent = tx(gun.name) + ' · ' + tx('Gun integrity') + ' ' + Math.ceil(a.hp / a.maxHp * 100) + '% · ' +
      (a.repair > 0 ? tx('Gun crew wounded — repairing') + ' ' + Math.ceil(a.repair) : m.reload ? tx('Reloading') + ' ' + m.reload.toFixed(1) : m.clipReload ? tx('Loading clip') : m.locked ? tx('Barrel overheated') : this.selected === 1 ? tx('Clip {n}/4', { n: m.clip }) : '');
    const buttons = this.panel!.querySelectorAll<HTMLButtonElement>('.aa-gun > button');
    for (let i = 0; i < 3; i++) { buttons[i].disabled = i >= this.unlocked; buttons[i].classList.toggle('selected', i === this.selected); }
  }
  private draw() {
    const ctx = this.g.ui.ctx, width = innerWidth, height = innerHeight, cam = this.g.engine.camera;
    ctx.clearRect(0, 0, width, height);
    if (this.choosing) return;
    this.inverseAim.copy(this.aimQuat).invert();
    ctx.font = '12px ' + CANVAS_MONO; ctx.textAlign = 'center';
    for (const r of this.raiders) {
      if (!r.f.alive || r.f.remove) continue;
      this.projected.copy(r.f.pos).project(cam);
      const x = (this.projected.x * 0.5 + 0.5) * width, y = (-this.projected.y * 0.5 + 0.5) * height;
      const visible = this.projected.z < 1 && this.projected.z > -1 && x > 35 && x < width - 35 && y > 120 && y < height - 110;
      ctx.strokeStyle = this.lights.coned.has(r.f) ? '#fcf4b0' : '#e3a07b'; ctx.fillStyle = ctx.strokeStyle;
      if (visible) {
        ctx.strokeRect(x - 16, y - 12, 32, 24); ctx.fillText(r.f.label, x, y - 19);
        ctx.fillRect(x - 16, y + 17, 32 * r.f.structureFrac, 2);
      } else {
        this.v.copy(r.f.pos).sub(cam.position).applyQuaternion(this.inverseAim);
        const angle = Math.atan2(this.v.x, this.v.z);
        const xx = clamp(width / 2 - Math.sin(angle) * width * 0.46, 25, width - 25);
        const yy = this.v.z < 0 ? height - 150 : 130;
        ctx.beginPath(); ctx.moveTo(xx, yy - 9); ctx.lineTo(xx - 7, yy + 6); ctx.lineTo(xx + 7, yy + 6); ctx.closePath(); ctx.fill();
      }
    }
    if (this.incomingText) {
      ctx.fillStyle = '#e2c87f';
      ctx.fillText(this.incomingText, width / 2, 116);
    }
    if (this.hitT > 0) {
      ctx.strokeStyle = '#ffe2a0'; ctx.beginPath();
      ctx.moveTo(width / 2 - 8, height / 2 - 8); ctx.lineTo(width / 2 + 8, height / 2 + 8);
      ctx.moveTo(width / 2 + 8, height / 2 - 8); ctx.lineTo(width / 2 - 8, height / 2 + 8); ctx.stroke();
    }
  }
}

import * as THREE from 'three';
import type { Game } from './Game';
import { Atmos } from '../render/Atmosphere';
import { CRUISE } from '../world/World';
import { impactPattern, bombingScore, strikePhotoAltitude, releaseDue, BOMB_FALL, ON_TARGET_RADIUS, type BombImpact } from './BombingMath';
import { achievements } from './Achievements';
import { saveCareer } from './Career';
import { tx } from '../i18n';
import { keyMap } from '../core/KeyMap';
import '../ui/bombardier.css';

export const BOMBARDIER_TEXT = {
  offer: 'Take bombsight', title: 'NORDEN · AUTOPILOT LINK', leave: 'Return to guns', release: 'Release bombs',
  wait: 'Hold for cloud gap', left: 'Course left', right: 'Course right', faster: 'Rate faster', slower: 'Rate slower',
  hint: 'Arrows / stick: course & rate · Space / RT: release · B / LT: hold · N / Y: leave',
  help: 'Keep the aiming point on the cross-hairs. Match the rate to stop its drift. Release is automatic; hold for a cloud gap.',
  status: 'Course {course}° · Rate {rate} m/s · Release in {time} s',
  falling: 'Bombs falling · {time} s', photo: 'Strike photo', caption: '{percent} % within 1,000 ft of the aiming point',
  bonus: 'Bombing score +{score}', best: 'Best bombing',
  pilot: "Bombardier, she's all yours.", good: 'Good pattern! The aiming point is covered.',
  poor: 'The pattern is wide. We will check the strike photograph.',
} as const;

export interface BombingResult { percent: number; score: number; photo: string }

/** Owns only the optional nose seat. Unattended missions retain the existing automatic drop. */
export class Bombardier {
  active = false;
  offered = false;
  range = 0;
  rate = CRUISE * 0.9;
  course = 0;
  result: BombingResult | null = null;
  private releasedAt = -1;
  get releaseTime() { return this.releasedAt; }
  private impacts: BombImpact[] = [];
  private baseHeading = 0;
  private jolt = 0;
  private lastJolt = -1;
  private visible = true;
  private fov = 65;
  private uiClock = 0;
  private nose = new THREE.Vector3();
  private look = new THREE.Vector3();
  private root = document.createElement('div');
  private offer = document.createElement('button');
  private status = document.createElement('div');

  constructor(private g: Game) {
    this.root.id = 'bombardier';
    this.offer.id = 'bombardier-offer';
    this.offer.className = 'btn';
    this.offer.onclick = () => this.enter();
    this.root.innerHTML = `<div class="bs-title">${tx(BOMBARDIER_TEXT.title)}</div><p>${tx(BOMBARDIER_TEXT.help)}</p><div class="bs-controls"></div>`;
    const controls = this.root.querySelector('.bs-controls')!;
    const button = (label: string, code: string, held = false) => {
      const b = document.createElement('button'); b.textContent = tx(label); b.className = 'btn ghost'; b.dataset.label = label;
      if (held) {
        b.onpointerdown = e => { e.preventDefault(); b.setPointerCapture(e.pointerId); g.input.hold(code, true); };
        b.onpointerup = b.onpointercancel = b.onlostpointercapture = () => g.input.hold(code, false);
      } else b.onclick = () => g.input.tap(code);
      controls.appendChild(b);
    };
    button(BOMBARDIER_TEXT.left, 'ArrowLeft', true); button(BOMBARDIER_TEXT.right, 'ArrowRight', true);
    button(BOMBARDIER_TEXT.faster, 'ArrowUp', true); button(BOMBARDIER_TEXT.slower, 'ArrowDown', true);
    button(BOMBARDIER_TEXT.wait, 'KeyB', true); button(BOMBARDIER_TEXT.release, 'Space'); button(BOMBARDIER_TEXT.leave, 'KeyN');
    this.status.className = 'bs-status'; this.root.appendChild(this.status);
    document.body.append(this.root, this.offer); this.hide();
  }

  private hide() { this.root.hidden = true; this.offer.hidden = true; }
  reset() {
    this.leave(); this.offered = false; this.result = null; this.releasedAt = -1; this.impacts = [];
    this.uiClock = 0; this.course = 0; this.rate = CRUISE * 0.9; this.jolt = 0; this.lastJolt = -1; this.hide();
  }
  get awaitingImpact() { return !!this.result && !this.result.photo; }
  get available() {
    const g = this.g, m = g.mission;
    return g.state === 'playing' && !g.menuMode && m?.role === 'gunner' && !!m.bombsAway &&
      g.world.time >= m.bombsAway - 30 && !g.director.bombsDropped && !!g.world.player?.alive && g.coop.role !== 'guest';
  }
  enter() {
    if (!this.available || this.active) return;
    const g = this.g, w = g.world;
    this.root.querySelector('.bs-title')!.textContent = tx(BOMBARDIER_TEXT.title);
    this.root.querySelector('p')!.textContent = tx(BOMBARDIER_TEXT.help);
    for (const b of this.root.querySelectorAll('button')) b.textContent = tx(b.dataset.label!);
    this.active = true; this.fov = g.engine.camera.fov; this.visible = w.player!.root.visible;
    this.course = 0; this.uiClock = 0;
    this.baseHeading = Math.atan2(w.formationForward.x, w.formationForward.z);
    this.range = (g.target.aimPoint.x - Atmos.originOffset.x - w.formationCenter.x) * w.formationForward.x + (g.target.aimPoint.y - Atmos.originOffset.z - w.formationCenter.z) * w.formationForward.z + 180;
    g.target.playerControlled = true;
    g.input.buttons = 0; g.gunner.firing = false;
    this.root.hidden = false; this.offer.hidden = true; document.body.classList.add('bombsight');
    g.engine.post.resetHistory();
  }
  leave() {
    if (!this.active) { this.hide(); return; }
    if (this.active) {
      if (this.g.world.player) this.g.world.player.root.visible = this.visible;
      this.g.engine.camera.fov = this.fov; this.g.engine.camera.up.set(0, 1, 0); this.g.engine.camera.updateProjectionMatrix();
      this.g.engine.post.resetHistory();
    }
    this.active = false; this.g.target.playerControlled = false;
    document.body.classList.remove('bombsight'); this.hide();
    for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyB']) this.g.input.hold(code, false);
  }
  /** Before TargetArea/Director: owns the release gate, including abandoning the seat. */
  update(dt: number) {
    const g = this.g, w = g.world, inp = g.input;
    if (g.state !== 'playing' || !w.player?.alive) { this.leave(); return; }
    if (this.available && !this.offered) {
      this.offered = true;
      this.offer.textContent = `${tx(BOMBARDIER_TEXT.offer)} · ${keyMap.label('bombsight')} / Y`;
      w.callout('bombardier_offer', 'Pilot', BOMBARDIER_TEXT.pilot, 0, 3);
    }
    this.offer.hidden = !this.available || this.active;
    if (inp.hit('KeyN')) { if (this.active) this.leave(); else this.enter(); }
    if (!this.active) return;
    if (this.releasedAt < 0) {
      this.course = THREE.MathUtils.clamp(this.course + (Number(inp.down('ArrowRight')) - Number(inp.down('ArrowLeft'))) * dt * 0.012 + inp.mouseDX * 0.000025, -0.06, 0.06);
      const rateInput = Number(inp.down('ArrowUp')) - Number(inp.down('ArrowDown'));
      this.rate = THREE.MathUtils.clamp(this.rate + rateInput * dt * 12 - inp.mouseDY * 0.015, CRUISE * 0.55, CRUISE * 1.5);
      const yaw = this.baseHeading + this.course;
      w.formationForward.set(Math.sin(yaw), 0, Math.cos(yaw));
      this.range -= this.rate * dt;
      const beat = Math.floor(w.time / 2.7);
      if (w.flakIntensity > 0 && beat !== this.lastJolt) {
        this.lastJolt = beat; this.jolt = Math.sin(beat * 7.13) * w.flakIntensity * 65;
        this.range += Math.cos(beat * 4.7) * w.flakIntensity * 35;
      }
      this.jolt *= Math.exp(-dt * 0.6);
      if ((!g.bombRun.enabled || w.time >= g.mission!.bombsAway! - 5) && (inp.hit('Space') || inp.mouseHit(0) || releaseDue(this.range, CRUISE, inp.mouse(2), w.time, g.mission!.bombsAway! + 12))) this.release();
    } else if (w.time >= this.releasedAt + BOMB_FALL + 5) this.leave();
    this.uiClock -= dt;
    if (this.uiClock <= 0) {
      this.uiClock = 0.1;
      this.status.textContent = this.result ? (w.time < this.releasedAt + BOMB_FALL ? tx(BOMBARDIER_TEXT.falling, { time: Math.ceil(this.releasedAt + BOMB_FALL - w.time) }) : tx(BOMBARDIER_TEXT.caption, { percent: this.result.percent })) : tx(BOMBARDIER_TEXT.status, {
        course: (this.course * 180 / Math.PI).toFixed(1), rate: this.rate.toFixed(0), time: Math.max(0, (this.range - CRUISE * BOMB_FALL * 0.93) / this.rate).toFixed(1),
      });
    }
  }
  release(manual = true) {
    if (this.releasedAt >= 0) return;
    const g = this.g, w = g.world, aim = g.target.aimPoint, f = w.formationForward;
    this.impacts = impactPattern({ x: w.formationCenter.x + Atmos.originOffset.x - aim.x, z: w.formationCenter.z + Atmos.originOffset.z - aim.y,
      forwardX: f.x, forwardZ: f.z, speed: CRUISE, windX: Atmos.wind.x, windZ: Atmos.wind.z, joltX: this.jolt, joltZ: this.jolt * 0.4 }, Math.min(36, w.bombers().filter(b => b.alive).length * 3));
    const score = bombingScore(this.impacts);
    if (!manual) score.score = 0;
    this.result = { percent: score.percent, score: score.score, photo: '' };
    this.releasedAt = w.time;
    g.target.bombsAway(this.impacts); g.director.bombsDropped = true; g.score += 200 + score.score;
    if (manual) {
      g.service.career.bestBombing = Math.max(g.service.career.bestBombing, score.percent); saveCareer(g.service.career);
      if (score.pickle) achievements.unlock('pickleBarrel');
    }
    w.callout('bombs', 'Bombardier', "Bombs away! Let's get out of here!", 0, 3);
  }
  /** After cinematic/shake layers: the gyroscope stabilises the nose eyepiece. */
  camera() {
    if (!this.active) return;
    const g = this.g, w = g.world, cam = g.engine.camera;
    this.nose.set(0, -1.5, 11); w.player!.localToWorld(this.nose, this.nose);
    cam.position.copy(this.nose); w.player!.root.visible = false;
    this.look.copy(w.formationCenter).addScaledVector(w.formationForward, Math.max(0, this.range)); this.look.y = 0;
    this.look.x += this.jolt + Atmos.wind.x * BOMB_FALL;
    this.look.z += Atmos.wind.z * BOMB_FALL;
    if (this.result) this.look.set(g.target.aimPoint.x - Atmos.originOffset.x, 0, g.target.aimPoint.y - Atmos.originOffset.z);
    cam.up.set(-w.formationForward.x, 0, -w.formationForward.z); cam.lookAt(this.look);
    if (cam.fov !== 28) { cam.fov = 28; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }
  draw(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const x = W / 2, y = H / 2, r = Math.min(W * 0.38, H * 0.41);
    ctx.save(); ctx.fillStyle = '#080c0df2';
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(x, y, r, 0, Math.PI * 2, true); ctx.fill('evenodd');
    ctx.strokeStyle = '#c8d9ac'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
    for (let i = -4; i <= 4; i++) { ctx.moveTo(x + i * r / 5, y - 5); ctx.lineTo(x + i * r / 5, y + 5); }
    ctx.moveTo(x + 10, y); ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.strokeStyle = '#111b16'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = '#c8d9ac'; ctx.lineWidth = 1; ctx.stroke();
    // The two travelling indexes show drift and rate knob displacement.
    const drift = x + this.course / 0.06 * r * 0.55, rate = y + (this.rate / CRUISE - 1) * r;
    ctx.strokeStyle = '#111b16'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(drift, y - 22); ctx.lineTo(drift, y + 22); ctx.moveTo(x - 22, rate); ctx.lineTo(x + 22, rate); ctx.stroke();
    ctx.font = '12px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#c8d9ac';
    ctx.fillText(tx(BOMBARDIER_TEXT.hint), x, H - 14);
    ctx.restore();
  }
  /** One recon frame after impacts, even if the gunner has already left the seat. */
  capture() {
    if (!this.result || this.result.photo || this.g.world.time < this.releasedAt + BOMB_FALL + 4) return;
    const g = this.g, cam = g.engine.camera, aim = g.target.aimPoint;
    const pos = cam.position.clone(), quat = cam.quaternion.clone(), up = cam.up.clone(), fov = cam.fov;
    // A close recon view; pull back when a missed pattern extends beyond the target.
    const altitude = strikePhotoAltitude(this.impacts, cam.aspect);
    cam.position.set(aim.x - Atmos.originOffset.x, altitude, aim.y - Atmos.originOffset.z);
    cam.up.set(0, 0, -1); this.look.copy(cam.position).setY(0); cam.lookAt(this.look); cam.fov = 48; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    g.engine.post.resetHistory(); g.engine.clouds.resetHistory();
    g.engine.render(1 / 60);
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = Math.round(640 / cam.aspect);
    const ctx = canvas.getContext('2d')!;
    ctx.filter = 'grayscale(1) sepia(0.35)'; ctx.drawImage(g.engine.renderer.domElement, 0, 0, canvas.width, canvas.height); ctx.filter = 'none';
    const scale = canvas.height / (2 * altitude * Math.tan(24 * Math.PI / 180));
    ctx.strokeStyle = '#ffe4a0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(canvas.width / 2, canvas.height / 2, ON_TARGET_RADIUS * scale, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffcf79';
    for (const p of this.impacts) { ctx.beginPath(); ctx.arc(canvas.width / 2 + p.x * scale, canvas.height / 2 + p.z * scale, 2, 0, Math.PI * 2); ctx.fill(); }
    this.result.photo = canvas.toDataURL('image/jpeg', 0.78);
    cam.position.copy(pos); cam.quaternion.copy(quat); cam.up.copy(up); cam.fov = fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); g.engine.post.resetHistory();
    g.world.callout('bombardier_result', 'Bombardier', this.result.percent > 80 ? BOMBARDIER_TEXT.good : BOMBARDIER_TEXT.poor, 0, 3);
  }
}

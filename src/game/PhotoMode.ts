import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Input } from '../core/Input';
import type { World } from '../world/World';
import { tx } from '../i18n';

// Photo mode (F during a mission): the simulation freezes (Engine.paused, and Game skips
// its world update while active) and a free-fly camera takes over. Everything the
// camera or post stack is changed by is saved on entry and put back exactly on exit,
// so the mission continues from the same view it was frozen in.

// Parts of the player's B-17 that the gunner view hides from the inside (GunnerController).
// They are shown again while photographing so the aircraft reads correctly from outside.
export const GUNNER_HIDDEN = ['interior', 'glass', 'crew', 'gun_waist_left', 'gun_waist_right', 'turret_top', 'turret_ball', 'gun_tail'];

const BASE_SPEED = 25;          // m/s; Shift multiplies by 4, the mouse wheel scales it
const MAX_PITCH = 1.55;         // just under 90 degrees, keeps the Euler decomposition sane
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _want = new THREE.Vector3();

interface Saved {
  parent: THREE.Object3D | null;
  index: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  paused: boolean;
  post: { nearFocus: number; dofStrength: number; noBlurDist: number; motionBlur: number; damageFlash: number; flash: number };
  hudShown: boolean;
}

export class PhotoMode {
  active = false;
  private saved: Saved | null = null;
  private yaw = 0;
  private pitch = 0;
  private roll = 0;
  private vel = new THREE.Vector3();
  private speedMul = 1;
  private lastT = 0;
  private revealed: THREE.Object3D[] = [];
  private hint: HTMLElement | null = null;
  private hintT = 0;
  private shareBtn: HTMLButtonElement | null = null;
  /** Share the current view (Enter or the on-screen button); wired in game/Share.ts */
  onShare?: () => void;

  constructor(private engine: Engine, private input: Input, private world: World) {
    window.addEventListener('keydown', (e) => {
      if (this.active && e.code === 'Enter' && !e.repeat && this.onShare) { e.preventDefault(); this.onShare(); }
    });
  }

  toggle() { if (this.active) this.exit(); else this.enter(); }

  private enter() {
    if (this.active) return;
    const cam = this.engine.camera;
    const post = this.engine.post;
    const parent = cam.parent;
    this.saved = {
      parent,
      index: parent ? parent.children.indexOf(cam) : -1,
      position: cam.position.clone(),
      quaternion: cam.quaternion.clone(),
      scale: cam.scale.clone(),
      paused: this.engine.paused,
      post: { nearFocus: post.nearFocus, dofStrength: post.dofStrength, noBlurDist: post.noBlurDist, motionBlur: post.motionBlur, damageFlash: post.damageFlash, flash: post.flash },
      hudShown: false,
    };
    // Free camera lives directly in the scene; attach keeps the current world pose
    this.engine.scene.attach(cam);
    // Start from the current view, keeping its roll (the bomber banks)
    _e.setFromQuaternion(cam.quaternion, 'YXZ');
    this.pitch = _e.x; this.yaw = _e.y; this.roll = _e.z;
    this.vel.set(0, 0, 0);
    this.speedMul = 1;
    this.lastT = performance.now();

    this.engine.paused = true;
    post.nearFocus = 0.1;
    post.dofStrength = 0;
    post.noBlurDist = 1e6;
    post.motionBlur = 0;
    post.damageFlash = 0;
    post.flash = 0;
    post.resetHistory();

    // Show the aircraft parts the gunner view had hidden
    const model = this.world.playerBomber?.model;
    model?.traverse((o) => {
      if (GUNNER_HIDDEN.includes(o.name) && !o.visible) { o.visible = true; this.revealed.push(o); }
    });

    const hud = document.getElementById('hud');
    this.saved.hudShown = !!hud?.classList.contains('show');
    hud?.classList.remove('show');
    this.showHint();
    this.active = true;
  }

  // Restores the camera, post settings, visibility and HUD exactly as they were on enter.
  exit() {
    if (!this.active || !this.saved) return;
    const s = this.saved;
    const cam = this.engine.camera;
    const post = this.engine.post;
    this.active = false;
    this.saved = null;

    if (s.parent) {
      s.parent.add(cam);
      // put the camera back at its original child slot (render order stays identical)
      const kids = s.parent.children;
      const cur = kids.indexOf(cam);
      if (cur >= 0 && s.index >= 0) { kids.splice(cur, 1); kids.splice(Math.min(s.index, kids.length), 0, cam); }
    } else {
      cam.removeFromParent();
    }
    cam.position.copy(s.position);
    cam.quaternion.copy(s.quaternion);
    cam.scale.copy(s.scale);

    post.nearFocus = s.post.nearFocus;
    post.dofStrength = s.post.dofStrength;
    post.noBlurDist = s.post.noBlurDist;
    post.motionBlur = s.post.motionBlur;
    post.damageFlash = s.post.damageFlash;
    post.flash = s.post.flash;
    post.resetHistory();   // no motion-blur smear from the jump back

    this.engine.paused = s.paused;
    for (const o of this.revealed) o.visible = false;
    this.revealed = [];

    if (s.hudShown) document.getElementById('hud')?.classList.add('show');
    this.hideHint();
    if (this.shareBtn) this.shareBtn.style.display = 'none';
    this.vel.set(0, 0, 0);
  }

  // Called once per frame while active, instead of the mission update.
  update() {
    const cam = this.engine.camera;
    const inp = this.input;
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.lastT) / 1000));
    this.lastT = now;

    // Mouse look (same feel as the pilot's mouse aim)
    const sens = 0.0016 * inp.sensitivity;
    const inv = inp.invertY ? -1 : 1;
    this.yaw -= inp.mouseDX * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - inp.mouseDY * sens * inv, -MAX_PITCH, MAX_PITCH);
    cam.quaternion.copy(_q.setFromEuler(_e.set(this.pitch, this.yaw, this.roll, 'YXZ')));

    if (inp.wheel) this.speedMul = THREE.MathUtils.clamp(this.speedMul * Math.pow(1.25, -inp.wheel), 0.1, 8);

    // WASD flies along the view (W/S forward-back, A/D strafe), Q/E move along world up
    _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const ax = (inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0);
    const az = (inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0);
    const ay = (inp.down('KeyE') ? 1 : 0) - (inp.down('KeyQ') ? 1 : 0);
    _want.set(0, 0, 0).addScaledVector(_fwd, az).addScaledVector(_right, ax).addScaledVector(WORLD_UP, ay);
    if (_want.lengthSq() > 1) _want.normalize();
    const shift = inp.down('ShiftLeft') || inp.down('ShiftRight');
    _want.multiplyScalar(BASE_SPEED * this.speedMul * (shift ? 4 : 1));
    // ease the velocity so the camera glides instead of snapping
    this.vel.lerp(_want, 1 - Math.exp(-dt * 8));
    cam.position.addScaledVector(this.vel, dt);

    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.hideHint();
    }
  }

  private showHint() {
    if (!this.hint) {
      const h = document.createElement('div');
      h.style.cssText = 'position:fixed;left:22px;bottom:22px;z-index:7;pointer-events:none;font:12px/1.6 "IBM Plex Mono","IBM Plex Sans Arabic",monospace;letter-spacing:1px;color:rgba(255,255,255,0.92);text-shadow:0 1px 4px rgba(0,0,0,0.9);display:none';
      document.body.appendChild(h);
      this.hint = h;
    }
    this.hint.textContent = tx(this.onShare ? 'PHOTO MODE · WASD move · mouse look · Q/E down/up · Shift faster · wheel speed · Enter share · F exit' : 'PHOTO MODE · WASD move · mouse look · Q/E down/up · Shift faster · wheel speed · F exit');
    this.hint.style.display = 'block';
    this.hintT = 6;
    if (this.onShare) {
      if (!this.shareBtn) {
        const b = document.createElement('button');
        b.className = 'btn ghost photo-share';
        b.textContent = '📸 Share screenshot';
        b.addEventListener('click', (e) => { e.stopPropagation(); this.onShare?.(); });
        document.body.appendChild(b);
        this.shareBtn = b;
      }
      this.shareBtn.style.display = 'block';
    }
  }

  private hideHint() {
    this.hintT = 0;
    if (this.hint) this.hint.style.display = 'none';
  }
}

import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import { GUNNER_HIDDEN } from './PhotoMode';
import { hudRuntime } from '../ui/HudDetail';

// Shared pieces for the cinematic cameras (Cinematics.ts kill cam / fly-by, Replay.ts):
//   CamSnapshot  everything a cinematic changes on the camera and post stack, saved on entry
//                and put back exactly on exit (parent, pose, FOV, near/far, zoom, DOF)
//   ModelReveal  shows the parts of the player's B-17 the gunner view hides from inside
//   HudHider     hides the HUD layer, the 2D overlay canvas and the ability bar
//   CineOverlay  letterbox bars (or a 4:3 pillarbox for 16 mm gun-camera film), caption, skip
//                hint, fade and the title card (DOM); HUD detail Minimal drops the captions

export class CamSnapshot {
  saved = false;
  parent: THREE.Object3D | null = null;
  readonly pos = new THREE.Vector3();
  readonly quat = new THREE.Quaternion();
  fov = 62; near = 0.1; far = 1000; zoom = 1;
  nearFocus = 0.4; dofStrength = 1; noBlurDist = 1.4;

  /** Remember the camera as the active controller left it, then move it into the scene. */
  capture(engine: Engine) {
    const cam = engine.camera, post = engine.post;
    this.parent = cam.parent;
    this.pos.copy(cam.position);
    this.quat.copy(cam.quaternion);
    this.saveLens(engine);
    this.nearFocus = post.nearFocus; this.dofStrength = post.dofStrength; this.noBlurDist = post.noBlurDist;
    this.saved = true;
    if (cam.parent !== engine.scene) engine.scene.attach(cam);
  }

  /** Refresh the remembered pose/lens from the controller's latest output (no-alloc). */
  refresh(engine: Engine) {
    const cam = engine.camera, post = engine.post;
    this.pos.copy(cam.position);
    this.quat.copy(cam.quaternion);
    this.saveLens(engine);
    this.nearFocus = post.nearFocus; this.dofStrength = post.dofStrength; this.noBlurDist = post.noBlurDist;
  }

  private saveLens(engine: Engine) {
    const cam = engine.camera;
    this.fov = cam.fov; this.near = cam.near; this.far = cam.far; this.zoom = cam.zoom;
  }

  /** Put the controller's own FOV/zoom/near/far back (before the controllers run: the P-51
   *  view eases its FOV from the previous frame's value). */
  restoreLens(engine: Engine) {
    const cam = engine.camera;
    if (cam.fov === this.fov && cam.near === this.near && cam.far === this.far && cam.zoom === this.zoom) return;
    cam.fov = this.fov; cam.near = this.near; cam.far = this.far; cam.zoom = this.zoom;
    cam.updateProjectionMatrix();
  }

  restore(engine: Engine) {
    if (!this.saved) return;
    const cam = engine.camera, post = engine.post;
    if (this.parent && cam.parent !== this.parent) this.parent.add(cam);
    else if (!this.parent) cam.removeFromParent();
    cam.position.copy(this.pos);
    cam.quaternion.copy(this.quat);
    this.restoreLens(engine);
    post.nearFocus = this.nearFocus; post.dofStrength = this.dofStrength; post.noBlurDist = this.noBlurDist;
    post.resetHistory();   // no motion-blur smear across the cut
    this.saved = false;
  }
}

/** Cinematic lens settings: no near-field DOF, nothing blurred by distance. */
export function cineLens(engine: Engine, fov: number) {
  const cam = engine.camera, post = engine.post;
  if (cam.fov !== fov || cam.zoom !== 1) { cam.fov = fov; cam.zoom = 1; cam.updateProjectionMatrix(); }
  post.nearFocus = 0.1;
  post.dofStrength = 0;
  post.noBlurDist = 1e6;
}

export class ModelReveal {
  private list: THREE.Object3D[] = [];
  reveal(model: THREE.Object3D | null | undefined) {
    if (!model) return;
    model.traverse((o) => { if (!o.visible && GUNNER_HIDDEN.includes(o.name)) { o.visible = true; this.list.push(o); } });
  }
  restore() {
    for (const o of this.list) o.visible = false;
    this.list.length = 0;
  }
}

export class HudHider {
  private els: HTMLElement[] = [];
  private prev: string[] = [];
  hide(canvas: HTMLCanvasElement) {
    if (this.els.length) return;
    for (const el of [document.getElementById('hud'), canvas, document.getElementById('abilityBar')]) {
      if (!el) continue;
      this.els.push(el); this.prev.push(el.style.visibility);
      el.style.visibility = 'hidden';
    }
  }
  restore() {
    for (let i = 0; i < this.els.length; i++) this.els[i].style.visibility = this.prev[i];
    this.els.length = 0; this.prev.length = 0;
  }
}

const CSS = `
#cine { position: fixed; inset: 0; pointer-events: none; z-index: 9; }
#cine .cb { position: absolute; left: 0; right: 0; height: 0; background: #000; transition: height .32s cubic-bezier(.2,.7,.2,1); }
#cine .cb.t { top: 0; } #cine .cb.b { bottom: 0; }
#cine.on .cb { height: 10.5vh; }
#cine .cp { position: absolute; top: 0; bottom: 0; width: 0; background: #000; transition: width .32s cubic-bezier(.2,.7,.2,1); }
#cine .cp.l { left: 0; } #cine .cp.r { right: 0; }
#cine.on.academy .cb { height: 0; }
#cine.on.academy .cp { width: max(0px, calc((100vw - 133.333vh) / 2)); }
#cine .cap, #cine .hint, #cine .tag { position: absolute; opacity: 0; transition: opacity .3s; white-space: nowrap; }
#cine.on .cap, #cine.on .hint, #cine.on .tag { opacity: 1; }
#cine .cap { left: 4vw; bottom: 3.4vh; font: 600 17px/1 Oswald, "Arial Narrow", "Noto Kufi Arabic", sans-serif; letter-spacing: 4px; color: #f1e6c8; }
#cine .tag { left: 4vw; top: 3.6vh; font: 600 11px/1 "IBM Plex Mono", "IBM Plex Sans Arabic", monospace; letter-spacing: 3px; color: #d9573f; }
#cine .hint { right: 4vw; bottom: 3.6vh; font: 11px/1 "IBM Plex Mono", "IBM Plex Sans Arabic", monospace; letter-spacing: 2px; color: rgba(255,255,255,.55); }
#cine .fd { position: absolute; inset: 0; background: #000; opacity: 0; }
#cine .card { position: absolute; left: 0; right: 0; top: 19%; text-align: center; opacity: 0; transform: translateY(10px); transition: opacity .6s, transform .9s cubic-bezier(.2,.7,.2,1); }
#cine .card.show { opacity: 1; transform: none; }
#cine .card .a { font: 700 clamp(30px, 6vw, 68px)/1 Oswald, "Arial Narrow", "Noto Kufi Arabic", sans-serif; letter-spacing: .32em; color: #f4ead0; text-shadow: 0 2px 18px rgba(0,0,0,.65); }
#cine .card .b { margin-top: 14px; font: clamp(12px, 1.4vw, 16px)/1.4 "Special Elite", "Courier New", "Noto Naskh Arabic", monospace; letter-spacing: 3px; color: rgba(244,234,208,.85); text-shadow: 0 1px 8px rgba(0,0,0,.8); }
html[dir=rtl] #cine .cap, html[dir=rtl] #cine .tag, html[dir=rtl] #cine .hint, html[dir=rtl] #cine .card .a, html[dir=rtl] #cine .card .b { letter-spacing: 0; }
`;

export class CineOverlay {
  private root: HTMLElement | null = null;
  private cap!: HTMLElement;
  private tag!: HTMLElement;
  private hint!: HTMLElement;
  private fd!: HTMLElement;
  private card!: HTMLElement;
  private cardA!: HTMLElement;
  private cardB!: HTMLElement;
  private fade = 0;
  private cardOn = false;

  private ensure() {
    if (this.root?.isConnected) return;
    if (!document.getElementById('cineCss')) {
      const s = document.createElement('style');
      s.id = 'cineCss'; s.textContent = CSS;
      document.head.appendChild(s);
    }
    const r = document.createElement('div');
    r.id = 'cine';
    r.innerHTML = '<div class="cb t"></div><div class="cb b"></div><div class="cp l"></div><div class="cp r"></div><div class="tag"></div><div class="cap"></div><div class="hint"></div><div class="card"><div class="a"></div><div class="b"></div></div><div class="fd"></div>';
    document.body.appendChild(r);
    this.root = r;
    this.tag = r.querySelector('.tag')!; this.cap = r.querySelector('.cap')!; this.hint = r.querySelector('.hint')!;
    this.fd = r.querySelector('.fd')!; this.card = r.querySelector('.card')!;
    this.cardA = r.querySelector('.card .a')!; this.cardB = r.querySelector('.card .b')!;
    this.fade = 0; this.cardOn = false;
  }

  /** Letterbox in (with its texts) or out. academy: a 4:3 pillarbox instead (16 mm film). */
  show(on: boolean, tag = '', caption = '', hint = '', academy = false) {
    this.ensure();
    // HUD detail Minimal: picture only (the skip hint stays: it is how to get the gun back)
    if (hudRuntime.detail === 'minimal') { tag = ''; caption = ''; }
    if (on) { this.tag.textContent = tag; this.cap.textContent = caption; this.hint.textContent = hint; }
    this.root!.classList.toggle('on', on);
    this.root!.classList.toggle('academy', on && academy);
    if (!on) this.setCard(false);
  }

  /** Full-screen black, 0..1 (set every frame by the sequences; skips redundant writes). */
  setFade(a: number) {
    const v = a < 0.01 ? 0 : a > 0.99 ? 1 : Math.round(a * 100) / 100;
    if (v === this.fade) return;
    this.ensure();
    this.fade = v;
    this.fd.style.opacity = String(v);
  }

  setCard(on: boolean, a = '', b = '') {
    if (on === this.cardOn) return;
    this.ensure();
    this.cardOn = on;
    if (on) { this.cardA.textContent = a; this.cardB.textContent = b; }
    this.card.classList.toggle('show', on);
  }
}

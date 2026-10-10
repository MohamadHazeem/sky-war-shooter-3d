import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { Engine } from '../core/Engine';
import type { World } from '../world/World';
import type { Fighter } from '../world/Aircraft';
import { steerTo } from '../world/AI';
import { DogfightAI } from '../world/DogfightAI';
import { instantiate, hasModel } from '../world/Models';
import { markOwned } from '../render/Dispose';
import { sound } from '../audio/Sound';
import { KeyAim, KEY_AIM_RATE } from './KeyAim';
import { PilotFX } from './PilotFX';

const G = 9.81;
const UP = new THREE.Vector3(0, 1, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const FLIP = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, Math.PI); // model +Z forward -> camera -Z
const CONVERGENCE = 250;     // m: the six .50s are harmonised on one point this far ahead
const MUZZLE = 880;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _as = new THREE.Vector3();
const _at = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();

// Reflector glass of the K-14 sight, model frame (m): centre, half width, half height, tilt.
// It stands on the sight body right on the pilot's line of sight (eye at y 0.775, z -1.174).
const GLASS = { c: new THREE.Vector3(0, 0.772, -0.72), hw: 0.062, hh: 0.046, tilt: 0.35 };

// P-51D player control: "mouse aim" (the aircraft is flown toward where you look,
// like an instructor holding the stick) or direct mouse-as-stick; cockpit or chase view.
// Cockpit: the head is thrown about by the G load (lean, sink, counter-bank) and the airframe
// vibrates; the K-14 reflector sight is collimated (drawn on the gun line, clipped to its
// glass). Chase: a lagging camera that keeps the tracer stream in view. T padlocks a bandit.
export class PilotController {
  plane: Fighter | null = null;
  aimYaw = 0;
  assist = 1;   // aim assist strength 0..1 (Settings)
  aimPitch = 0;
  view: 'cockpit' | 'chase' = 'chase';
  mode: 'mouseAim' | 'direct' = 'mouseAim';
  baseFov = 62;   // set from Settings; cockpit (+8) and chase (+2) keep their original offsets
  // low-level operations (StrafeOps): ground height under a scene point; the chase camera stays above it
  groundAt: ((x: number, z: number) => number) | null = null;
  sightLit = false; // night missions: the K-14's lamp is turned up (brighter reticle, glow on the glass)
  private glassMat: THREE.MeshPhysicalMaterial | null = null;
  private cockpit: THREE.Object3D | null = null;
  private glass: THREE.Object3D | null = null;
  eyeOffset = new THREE.Vector3(0, 0.775, -1.174);
  gBlack = 0;     // 0..1 blackout
  freeLook = false;
  private lookYaw = 0;
  private lookPitch = 0;
  private lookW = 0;          // 0 = head follows the aim point, 1 = free look / padlock angles
  throttleCmd = 0.85;
  // x/y: gyro reticle (NDC); visible stays false: the reticle is drawn by drawOverlay
  readonly gunsight = { x: 0, y: 0, visible: false, aimX: 0, aimY: 0, aimVisible: false, leadMil: 0, range: CONVERGENCE };
  private prevQuat = new THREE.Quaternion();
  private omegaSmooth = new THREE.Vector3();
  private sightDir = new THREE.Vector3(0, 0, 1);
  private sightTarget: Fighter | null = null;
  private keyAim = new KeyAim();
  readonly fx: PilotFX;
  // padlock (T): the camera tracks a bandit while the mouse keeps flying the aircraft
  padlock: Fighter | null = null;
  private padW = 0;
  private padLost = 0;
  private padNote = '';
  // cockpit head: spring-damped offset (model frame) and counter-bank roll
  private head = new THREE.Vector3();
  private headVel = new THREE.Vector3();
  private headRoll = 0;
  private vib = new THREE.Vector3();
  // chase camera: offset from the aircraft (smoothed = lag), view direction and up
  private chaseOff = new THREE.Vector3(0, 3, -13);
  private chaseDir = new THREE.Vector3(0, 0, 1);
  private chaseUp = new THREE.Vector3(0, 1, 0);
  private time = 0;

  constructor(private engine: Engine, private world: World, private input: Input) {
    this.fx = new PilotFX(world);
  }

  attach(plane: Fighter) {
    this.plane = plane;
    const f = plane.forward(_v);
    this.aimYaw = Math.atan2(f.x, f.z);
    this.aimPitch = Math.asin(THREE.MathUtils.clamp(f.y, -1, 1));
    this.prevQuat.copy(plane.quat);
    this.sightDir.copy(f);
    this.padlock = null; this.padW = 0; this.lookW = 0; this.lookYaw = this.lookPitch = 0;
    this.head.set(0, 0, 0); this.headVel.set(0, 0, 0); this.headRoll = 0;
    this.chaseOff.copy(f).multiplyScalar(-13).addScaledVector(UP, 3);
    this.chaseDir.copy(f); this.chaseUp.copy(UP);
    this.harmonise(plane);
    if (hasModel('p51d_cockpit')) {
      this.cockpit = instantiate('p51d_cockpit');
      plane.model.add(this.cockpit);
    }
    this.glass = this.makeGlass();
    plane.model.add(this.glass);
    this.fx.attach(plane);
    this.applyViewVisibility();
  }

  detach() {
    if (this.cockpit) this.cockpit.removeFromParent();
    if (this.glass) this.glass.removeFromParent();
    this.cockpit = this.glass = null;
    this.fx.detach();
    this.plane = null;
    this.padlock = null;
  }

  // Wing guns converge on the aircraft's axis CONVERGENCE m ahead, gravity drop included
  private harmonise(p: Fighter) {
    const tof = CONVERGENCE / MUZZLE;
    const drop = 0.5 * G * tof * tof;
    for (const g of p.guns) g.dir.set(-g.offset.x, drop - g.offset.y, CONVERGENCE - g.offset.z).normalize();
  }

  // The K-14 sight: a dark body on the coaming and its tilted reflector glass, a faint tinted
  // pane the reticle is "projected" onto
  private makeGlass() {
    const g = new THREE.Group();
    g.name = 'k14_sight';
    const mat = markOwned(new THREE.MeshPhysicalMaterial({ color: 0x9fb4a8, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.glassMat = mat;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(GLASS.hw * 2, GLASS.hh * 2), mat);
    glass.position.copy(GLASS.c);
    glass.rotation.x = -GLASS.tilt;
    glass.renderOrder = 6;
    glass.name = 'k14_glass';
    const metal = markOwned(new THREE.MeshStandardMaterial({ color: 0x1d1f1c, roughness: 0.55, metalness: 0.5 }));
    // the sight body sits low, under the glass, out of the line of sight
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.17), metal);
    body.position.set(0, GLASS.c.y - GLASS.hh - 0.03, GLASS.c.z + 0.03);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.08, 14).rotateZ(Math.PI / 2), metal);
    head.position.set(0, body.position.y + 0.012, body.position.z - 0.075);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(GLASS.hw * 2 + 0.008, 0.006, 0.012), metal);
    frame.position.set(0, GLASS.c.y - GLASS.hh * Math.cos(GLASS.tilt), GLASS.c.z + GLASS.hh * Math.sin(GLASS.tilt));
    for (const m of [glass, body, head, frame]) { m.castShadow = false; g.add(m); }
    return g;
  }

  private applyViewVisibility() {
    if (!this.plane) return;
    // From the cockpit the spinning prop is barely perceptible
    for (const pr of this.plane.props) (pr.disc.material as THREE.MeshBasicMaterial).opacity = this.view === 'cockpit' ? 0.3 : 1;
    if (this.cockpit) this.cockpit.visible = this.view === 'cockpit';
    if (this.glass) this.glass.visible = this.view === 'cockpit';
    // hide the pilot figure from inside the cockpit
    this.plane.model.traverse((o) => {
      if (/pilot/i.test(o.name)) o.visible = this.view !== 'cockpit';
    });
  }

  // Aim assist: bend the mouse-aim point onto the lead point of the fighter nearest to it
  private applyAssist(p: Fighter, dt: number) {
    if (this.assist <= 0) return;
    const aim = this.aimDir(_as);
    const cone = 0.1 * (0.6 + 0.4 * this.assist);
    let best = cone, ty = 0, tp = 0;
    for (const e of this.world.fighters('axis')) {
      if (!e.alive) continue;
      const d = e.pos.distanceTo(p.pos);
      if (d > 1200) continue;
      const tof = d / MUZZLE;
      _at.copy(e.vel).sub(p.vel).multiplyScalar(tof).add(e.pos);
      _at.y += 0.5 * G * tof * tof;
      _at.sub(p.pos).normalize();
      const ang = _at.angleTo(aim);
      if (ang < best) { best = ang; ty = Math.atan2(_at.x, _at.z); tp = Math.asin(THREE.MathUtils.clamp(_at.y, -1, 1)); }
    }
    if (best >= cone) return;
    const pull = Math.min(1, dt * (2 + 4 * (1 - best / cone)) * this.assist);
    let dy = ty - this.aimYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.aimYaw += dy * pull;
    this.aimPitch += (tp - this.aimPitch) * pull;
  }

  aimDir(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.aimYaw) * Math.cos(this.aimPitch), Math.sin(this.aimPitch), Math.cos(this.aimYaw) * Math.cos(this.aimPitch));
  }

  // ---------- padlock ----------
  // The bandit nearest the middle of the view (angle first, then range)
  private pickPadlock(): Fighter | null {
    const cam = this.engine.camera;
    const look = cam.getWorldDirection(_v3);
    let best: Fighter | null = null, bs = Infinity;
    for (const e of this.world.fighters('axis')) {
      if (!e.alive) continue;
      const to = _v.copy(e.pos).sub(cam.position);
      const d = to.length();
      if (d > 3500) continue;
      const s = THREE.MathUtils.radToDeg(to.divideScalar(d).angleTo(look)) + d / 120;
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }

  private updatePadlock(dt: number) {
    const inp = this.input;
    if (inp.hit('KeyT')) {
      if (this.padlock) { this.padlock = null; this.padNote = ''; }
      else {
        this.padlock = this.pickPadlock(); this.padLost = 0;
        this.padNote = this.padlock ? '' : 'NO TARGET';
        if (this.padlock) sound.play('click', null, { gain: 0.35, rate: 1.4 });
      }
    }
    const t = this.padlock;
    if (t) {
      // a kill holds the view on the falling wreck for a moment, then lets go
      if (!t.alive || t.remove) this.padLost += dt;
      if (this.padLost > 1.6 || t.remove || (this.plane && t.pos.distanceTo(this.plane.pos) > 4500)) this.padlock = null;
    }
    const target = this.padlock ? 1 : 0;
    this.padW += (target - this.padW) * (1 - Math.exp(-dt * (target ? 5 : 2.6)));
    if (this.padW < 0.002) this.padW = 0;
  }

  update(dt: number) {
    const p = this.plane;
    if (!p) return;
    this.time += dt;
    const inp = this.input;
    const fm = p.fm;
    if (inp.hit('KeyV')) { this.view = this.view === 'cockpit' ? 'chase' : 'cockpit'; this.applyViewVisibility(); }
    if (inp.hit('KeyM')) this.mode = this.mode === 'mouseAim' ? 'direct' : 'mouseAim';
    this.freeLook = inp.down('KeyC');
    this.updatePadlock(dt);

    // Throttle
    if (inp.down('KeyW')) this.throttleCmd = Math.min(1.1, this.throttleCmd + dt * 0.5);
    if (inp.down('KeyS')) this.throttleCmd = Math.max(0, this.throttleCmd - dt * 0.5);
    // gamepad throttle lever (rate) and the touch throttle slider (absolute, one-shot)
    const an = inp.analog;
    if (an.throttle) this.throttleCmd = THREE.MathUtils.clamp(this.throttleCmd + an.throttle * dt * 0.6, 0, 1.1);
    if (an.throttleSet !== null) { this.throttleCmd = THREE.MathUtils.clamp(an.throttleSet, 0, 1.1); an.throttleSet = null; }
    fm.throttle = this.throttleCmd;
    fm.limiter = this.mode === 'mouseAim';

    const sens = 0.0016 * inp.sensitivity;
    const push = inp.edgePush();
    const mdx = inp.mouseDX + push.x * 900 * dt, mdy = inp.mouseDY + push.y * 700 * dt;
    // keyboard aim (arrows / I-J-K-L), an accessibility alternative to the mouse
    this.keyAim.update(inp, dt);
    const kr = KEY_AIM_RATE * dt;
    if (p.alive) {
      if (this.freeLook && !this.padlock) {
        this.lookYaw -= mdx * sens * 1.4 + this.keyAim.x * kr;
        this.lookPitch = THREE.MathUtils.clamp(this.lookPitch - mdy * sens * 1.4 + this.keyAim.y * kr, -1.2, 1.4);
      } else {
        if (this.mode === 'mouseAim') {
          this.aimYaw -= mdx * sens + this.keyAim.x * kr;
          this.aimPitch = THREE.MathUtils.clamp(this.aimPitch - mdy * sens * (inp.invertY ? -1 : 1) + this.keyAim.y * kr * (inp.invertY ? -1 : 1), -1.5, 1.5);
          this.applyAssist(p, dt);
          const dir = this.aimDir(_v);
          // the instructor eases the pull when slow, so a long chase doesn't bleed the Mustang dry
          steerTo(fm, dir, 1.1, THREE.MathUtils.clamp((fm.speed - 70) / 70, 0.6, 1));
        } else {
          fm.pitch = THREE.MathUtils.clamp(fm.pitch - mdy * sens * 3 * (inp.invertY ? -1 : 1), -1, 1) * Math.exp(-dt * 2.5);
          fm.roll = THREE.MathUtils.clamp(fm.roll + mdx * sens * 3, -1, 1) * Math.exp(-dt * 3);
          fm.yaw = 0;
          const f = p.forward(_v);
          this.aimYaw = Math.atan2(f.x, f.z);
          this.aimPitch = Math.asin(THREE.MathUtils.clamp(f.y, -1, 1));
        }
      }
      // keyboard overrides
      if (inp.down('KeyA')) fm.yaw = 0.8;
      if (inp.down('KeyD')) fm.yaw = -0.8;
      if (inp.down('KeyQ')) fm.roll = -1;
      if (inp.down('KeyE')) fm.roll = 1;
      if (an.roll) fm.roll = an.roll;          // gamepad left stick
      if (an.yaw) fm.yaw = -an.yaw * 0.8;
      p.trigger = inp.mouse(0) || inp.down('Space');
      if (p.trigger && p.guns.every((g) => g.ammo <= 0) && inp.mouseHit(0)) sound.play('click', null, { gain: 0.5 });
    } else {
      p.trigger = false;
    }

    // G-forces: blackout above ~6.5 g sustained, recovers slowly
    const g = fm.gLoad;
    if (g > 6.2) this.gBlack = Math.min(1, this.gBlack + (g - 6.2) * dt * 0.35);
    else this.gBlack = Math.max(0, this.gBlack - dt * 0.4);

    const eng = p.zone('engine');
    sound.setPlayerEngine(fm.throttle, fm.speed, eng ? 1 - Math.max(0, eng.hp) / eng.maxHp : 0);
    this.updateLook(dt);
    this.updateCamera(dt);
    this.updateGunsight(dt);
    this.fx.update(dt, this.view, this.engine.camera.position);
    this.glassMat?.emissive.setRGB(this.sightLit ? 0.06 : 0, this.sightLit ? 0.028 : 0, this.sightLit ? 0.006 : 0);
    this.tracerStream(p);
  }

  // The chase view shows the tracer stream: every other round is a tracer while it is up
  // (the loadout's own cadence is remembered and restored in the cockpit)
  private tracerBase = new WeakMap<object, { base: number; set: number }>();
  private tracerStream(p: Fighter) {
    for (const gun of p.guns) {
      let t = this.tracerBase.get(gun);
      if (!t || t.set !== gun.tracerEvery) this.tracerBase.set(gun, t = { base: gun.tracerEvery, set: gun.tracerEvery }); // loadout changed it
      t.set = gun.tracerEvery = this.view === 'chase' ? Math.min(t.base, 2) : t.base;
    }
  }

  // Head / view angles relative to the airframe: aim-follow, free look, or padlock (blended)
  private updateLook(dt: number) {
    const p = this.plane!;
    const t = this.padlock;
    if (t) {
      // free look snaps onto the bandit (neck limits), and follows it smoothly
      const local = _v.copy(t.pos).sub(p.pos).applyQuaternion(_q.copy(p.quat).invert()).normalize();
      const yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -2.7, 2.7);
      const pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(local.y, -1, 1)), -0.6, 1.45);
      let dy = yaw - this.lookYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      const k = 1 - Math.exp(-dt * 9);
      this.lookYaw += dy * k; this.lookPitch += (pitch - this.lookPitch) * k;
    } else if (!this.freeLook) {
      this.lookYaw *= Math.exp(-dt * 4); this.lookPitch *= Math.exp(-dt * 4);
    }
    const want = this.freeLook || t ? 1 : 0;
    this.lookW += (want - this.lookW) * (1 - Math.exp(-dt * (want ? 10 : 3.5)));
  }

  private updateCamera(dt: number) {
    const p = this.plane!;
    const cam = this.engine.camera;
    if (cam.parent !== this.engine.scene) this.engine.scene.add(cam);
    const fm = p.fm;
    const kick = this.fx.kick;
    // airframe vibration: engine, high-speed / high-G buffet, stall shudder, the guns
    const stall = fm.alpha > fm.p.alphaStall * 0.82 ? 1 : 0;
    const amp = 0.00035 * (0.5 + fm.throttle) + 0.0012 * Math.max(0, (fm.speed - 200) / 60) + 0.0008 * Math.max(0, fm.gLoad - 5)
      + 0.004 * stall + 0.0028 * kick;
    this.vib.lerp(_v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1), 0.55);
    if (this.view === 'cockpit') {
      // G-force head lean: the head is pushed against the specific force, on a spring
      const qi = _q.copy(p.quat).invert();
      const fb = _v.copy(fm.load).applyQuaternion(qi); // x left, y up, z fwd
      const tgt = _v2.set(
        THREE.MathUtils.clamp(-fb.x / G * 0.06 + fm.omega.z * 0.012, -0.08, 0.08),
        THREE.MathUtils.clamp(-(fb.y / G - 1) * 0.012, -0.065, 0.025),
        THREE.MathUtils.clamp(-fb.z / G * 0.03 - kick * 0.008, -0.035, 0.04));
      this.headVel.addScaledVector(_v3.copy(tgt).sub(this.head), 90 * dt).multiplyScalar(Math.exp(-14 * dt));
      this.head.addScaledVector(this.headVel, dt);
      const eye = p.localToWorld(_v.copy(this.eyeOffset).add(this.head).addScaledVector(this.vib, amp * 0.6), _v);
      cam.position.copy(eye);
      // head angles: follow the aim point (mouse aim) blended with free look / padlock
      let ay = 0, ap = 0;
      if (this.mode === 'mouseAim') {
        const aimLocal = this.aimDir(_v2).applyQuaternion(_q.copy(p.quat).invert());
        ay = THREE.MathUtils.clamp(Math.atan2(aimLocal.x, aimLocal.z), -1.6, 1.6) * 0.85;
        ap = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(aimLocal.y, -1, 1)), -0.6, 1.3) * 0.85;
      } else {
        // direct stick: glance into the turn
        ay = THREE.MathUtils.clamp(fm.omega.y * 0.25, -0.2, 0.2);
        ap = THREE.MathUtils.clamp(fm.omega.x * 0.12, -0.05, 0.14);
      }
      const yaw = THREE.MathUtils.lerp(ay, this.lookYaw, this.lookW);
      const pitch = THREE.MathUtils.lerp(ap, this.lookPitch, this.lookW);
      // the neck holds the head a little toward the horizon against the bank
      const bank = Math.asin(THREE.MathUtils.clamp(-fm.right(_v3).y, -1, 1));
      const rollT = THREE.MathUtils.clamp(bank * 0.1 - fm.omega.z * 0.02, -0.14, 0.14);
      this.headRoll += (rollT - this.headRoll) * (1 - Math.exp(-dt * 5));
      _q2.setFromEuler(_e.set(-pitch, yaw, 0, 'YXZ'));
      cam.quaternion.copy(p.quat).multiply(_q2).multiply(FLIP);
      cam.rotateZ(this.headRoll);
      cam.rotateX(this.vib.x * amp);
      cam.rotateY(this.vib.y * amp);
      this.engine.post.nearFocus = 0.35;
      this.engine.post.dofStrength = 0.5;
      this.engine.post.noBlurDist = 2.5;
      // RMB zoom keeps the original 45/70 ratio so magnification is the same at any base FOV
      cam.fov += ((this.baseFov + 8) * (this.input.mouse(2) ? 45 / 70 : 1) - cam.fov) * Math.min(1, dt * 8);
    } else {
      // chase: behind the aim direction (or the free-look direction), lagging the aircraft
      const look = this.freeLook && !this.padlock
        ? _v2.set(0, 0, 1).applyEuler(_e.set(-this.lookPitch, this.aimYaw + this.lookYaw, 0, 'YXZ'))
        : this.aimDir(_v2);
      this.chaseUp.lerp(_v3.copy(p.up(_v3)).lerp(UP, 0.5).normalize(), 1 - Math.exp(-dt * 4)).normalize();
      const off = _v.copy(look).multiplyScalar(-13).addScaledVector(this.chaseUp, 3);
      const t = this.padlock;
      const pw = THREE.MathUtils.smoothstep(this.padW, 0, 1);
      if (t && pw > 0) {
        // padlock: swing round behind our own aircraft on the line to the bandit
        const toT = _at.copy(t.pos).sub(p.pos).normalize();
        off.lerp(_as.copy(toT).multiplyScalar(-15).addScaledVector(UP, 4), pw);
      }
      this.chaseOff.lerp(off, 1 - Math.exp(-dt * 6));
      cam.position.copy(p.pos).add(this.chaseOff);
      if (this.groundAt) cam.position.y = Math.max(cam.position.y, this.groundAt(cam.position.x, cam.position.z) + 1.5);
      const dir = _v.copy(look);
      if (t && pw > 0) dir.lerp(_as.copy(t.pos).sub(cam.position).normalize(), pw).normalize();
      this.chaseDir.lerp(dir, 1 - Math.exp(-dt * 10)).normalize();
      _m.lookAt(cam.position, _v3.copy(cam.position).add(this.chaseDir), this.chaseUp);
      cam.quaternion.setFromRotationMatrix(_m);
      cam.rotateX(this.vib.x * amp * 0.5);
      cam.rotateY(this.vib.y * amp * 0.5);
      this.engine.post.nearFocus = 0.1;
      this.engine.post.dofStrength = 0;
      this.engine.post.noBlurDist = 25;
      const speedFov = THREE.MathUtils.clamp((fm.speed - 160) / 30, 0, 4);
      cam.fov += ((this.baseFov + 2 + speedFov) * (this.input.mouse(2) ? 40 / 64 : 1) - cam.fov) * Math.min(1, dt * 8);
    }
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // G blackout via vignette
    this.engine.post.vignette = 0.9 + this.gBlack * 6;
    this.engine.post.exposure = 1 - this.gBlack * 0.6;
  }

  // The bandit the sight is being used on: padlocked, else the one nearest the gun line
  private findSightTarget(p: Fighter, fwd: THREE.Vector3): Fighter | null {
    if (this.padlock?.alive && this.padlock.pos.distanceTo(p.pos) < 1100) return this.padlock;
    let best: Fighter | null = null, ba = 0.17;
    for (const e of this.world.fighters('axis')) {
      if (!e.alive) continue;
      const to = _v.copy(e.pos).sub(p.pos);
      const d = to.length();
      if (d > 1100) continue;
      const a = to.divideScalar(d).angleTo(fwd);
      if (a < ba) { ba = a; best = e; }
    }
    return best;
  }

  // K-14 gyro gunsight: reticle displaced by the turn rate * time of flight (lead), with the
  // range taken from the bandit in the sight (the pilot twisting the range grip)
  private updateGunsight(dt: number) {
    const p = this.plane!;
    const cam = this.engine.camera;
    // angular velocity estimate (world)
    const dq = _q.copy(this.prevQuat).invert().premultiply(p.quat);
    const angle = 2 * Math.acos(THREE.MathUtils.clamp(dq.w, -1, 1));
    const axis = _v3.set(dq.x, dq.y, dq.z);
    if (axis.lengthSq() > 1e-10) axis.normalize().multiplyScalar(angle / Math.max(dt, 1e-3));
    else axis.set(0, 0, 0);
    this.omegaSmooth.lerp(axis, 1 - Math.exp(-dt * 8));
    this.prevQuat.copy(p.quat);
    const fwd = p.forward(new THREE.Vector3());
    const tgt = this.sightTarget = this.findSightTarget(p, fwd);
    const wantRange = tgt ? THREE.MathUtils.clamp(tgt.pos.distanceTo(p.pos), 150, 1000) : CONVERGENCE;
    this.gunsight.range += (wantRange - this.gunsight.range) * (1 - Math.exp(-dt * 4));
    const range = this.gunsight.range;
    const tof = range / MUZZLE;
    // lead: rotate the gun line forward by omega * tof (where the target will be)
    const lead = fwd.clone();
    const w = this.omegaSmooth.length();
    if (w > 1e-4) lead.applyAxisAngle(_v.copy(this.omegaSmooth).divideScalar(w), -Math.min(0.12, w * tof));
    // gravity drop beyond the harmonisation range
    const pt = _v2.copy(p.pos).addScaledVector(lead, range);
    pt.y -= 0.5 * G * (tof * tof - (CONVERGENCE / MUZZLE) ** 2) * 0.8;
    // the gyro is damped: the reticle drifts gently rather than jumping
    this.sightDir.lerp(pt.sub(p.pos).normalize(), 1 - Math.exp(-dt * 9)).normalize();
    const sp = _v.copy(p.pos).addScaledVector(this.sightDir, range).project(cam);
    this.gunsight.x = sp.x; this.gunsight.y = sp.y;
    this.gunsight.visible = false; // drawn by drawOverlay, not by Game's old reticle
    this.gunsight.leadMil = Math.min(0.12, w * tof) * 1000;
    // mouse-aim marker
    if (this.mode === 'mouseAim') {
      const ap = _v.copy(p.pos).addScaledVector(this.aimDir(_v3), 500).project(cam);
      this.gunsight.aimVisible = ap.z < 1;
      this.gunsight.aimX = ap.x; this.gunsight.aimY = ap.y;
    } else this.gunsight.aimVisible = false;
  }

  // ---------- 2D overlay (Game.drawOverlay hook) ----------
  drawOverlay(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const p = this.plane;
    if (!p || !p.alive) return;
    const cam = this.engine.camera;
    const toScr = (v: THREE.Vector3) => { const s = v.project(cam); return { x: (s.x * 0.5 + 0.5) * W, y: (-s.y * 0.5 + 0.5) * H, ok: s.z < 1 }; };
    const ppr = H / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)); // pixels per radian
    const g = this.gunsight;
    const sx = (g.x * 0.5 + 0.5) * W, sy = (-g.y * 0.5 + 0.5) * H;
    const tgt = this.sightTarget;
    const range = tgt ? tgt.pos.distanceTo(p.pos) : Infinity;
    const inRange = range < 420;
    // stadiametric ring: framed wingspan at the set range
    const span = tgt ? 10.5 * tgt.model.scale.x : 0;
    const cockpit = this.view === 'cockpit';
    const ringR = tgt ? THREE.MathUtils.clamp((span / 2 / g.range) * ppr, H * 0.03, H * (cockpit ? 0.068 : 0.1)) : H * (cockpit ? 0.05 : 0.065);
    ctx.save();
    if (cockpit && this.glass) {
      // reflector: the reticle only exists on the glass
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
        const l = _v.set(a * GLASS.hw, b * GLASS.hh, 0).applyEuler(_e.set(-GLASS.tilt, 0, 0)).add(GLASS.c);
        return toScr(p.localToWorld(l, _v));
      });
      if (corners.some((c) => !c.ok)) { ctx.restore(); this.drawPadlock(ctx, W, H, toScr); return; }
      ctx.beginPath();
      corners.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
      ctx.closePath();
      ctx.fillStyle = this.sightLit ? 'rgba(255,160,70,0.045)' : 'rgba(160,190,170,0.05)';
      ctx.fill();
      ctx.clip();
    }
    const lit = this.sightLit;
    const a = lit ? 1 : cockpit ? 0.95 : 0.75;
    const col = inRange ? (lit ? 'rgba(255,215,130,1)' : `rgba(255,190,90,${a})`) : (lit ? 'rgba(255,175,85,1)' : `rgba(255,150,60,${a * 0.85})`);
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.shadowColor = lit ? 'rgba(255,140,40,1)' : 'rgba(255,120,30,0.9)'; ctx.shadowBlur = lit ? (cockpit ? 14 : 9) : cockpit ? 7 : 4;
    // fixed reticle: the gun line at the harmonisation range (a cross with a gap)
    const bp = toScr(_v.copy(p.pos).addScaledVector(p.forward(_v2), CONVERGENCE));
    if (bp.ok) {
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(bp.x + dx * 6, bp.y + dy * 6); ctx.lineTo(bp.x + dx * 15, bp.y + dy * 15); }
      ctx.stroke();
    }
    // gyro reticle: pipper and six diamonds
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(sx, sy, 2.4, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const x = sx + Math.cos(ang) * ringR, y = sy + Math.sin(ang) * ringR;
      ctx.beginPath(); ctx.moveTo(x, y - 4.5); ctx.lineTo(x + 3.2, y); ctx.lineTo(x, y + 4.5); ctx.lineTo(x - 3.2, y); ctx.closePath(); ctx.fill();
    }
    if (inRange) {
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(sx, sy, ringR, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // range readout under the sight (outside the glass so it stays legible)
    if (tgt && range < 1100) {
      ctx.save();
      ctx.font = '600 11px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = inRange ? 'rgba(255,200,110,0.95)' : 'rgba(255,170,90,0.7)';
      ctx.fillText(inRange ? `IN RANGE ${Math.round(range)}m` : `${Math.round(range)}m`, sx, sy + ringR + 16);
      ctx.restore();
    }
    this.drawPadlock(ctx, W, H, toScr);
  }

  private drawPadlock(ctx: CanvasRenderingContext2D, W: number, H: number, toScr: (v: THREE.Vector3) => { x: number; y: number; ok: boolean }) {
    const p = this.plane!;
    const t = this.padlock;
    ctx.save();
    ctx.font = '600 11px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
    if (!t) {
      if (this.padNote) { ctx.fillStyle = 'rgba(255,220,150,0.8)'; ctx.fillText(this.padNote, W / 2, H * 0.62); }
      ctx.restore();
      return;
    }
    const d = t.pos.distanceTo(p.pos);
    const s = toScr(_v.copy(t.pos));
    const col = t.alive ? 'rgba(120,255,170,0.95)' : 'rgba(255,120,90,0.9)';
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.8;
    const bfm = this.world.enemyPilot(t)?.state === 'dogfight' ? DogfightAI.of(t) : undefined;
    const note = !t.alive ? 'SPLASHED' : bfm ? bfm.label : '';
    if (s.ok && s.x > 0 && s.x < W && s.y > 0 && s.y < H) {
      const r = THREE.MathUtils.clamp(5200 / d, 16, 44);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - r); ctx.lineTo(s.x + r, s.y); ctx.lineTo(s.x, s.y + r); ctx.lineTo(s.x - r, s.y); ctx.closePath();
      ctx.stroke();
      const closure = -_v2.copy(t.vel).sub(p.vel).dot(_v3.copy(t.pos).sub(p.pos).normalize());
      ctx.fillText(`LOCK ${Math.round(d)}m ${closure >= 0 ? '+' : ''}${Math.round(closure * 2.237)}mph`, s.x, s.y - r - 8);
      if (note) ctx.fillText(note, s.x, s.y + r + 26);
    } else {
      // off screen: arrow on the edge pointing at him
      let ex = s.x - W / 2, ey = s.y - H / 2;
      if (!s.ok) { ex = -ex; ey = -ey; }
      const ang = Math.atan2(ey, ex);
      const rr = Math.min(W, H) * 0.36;
      const x = W / 2 + Math.cos(ang) * rr, y = H / 2 + Math.sin(ang) * rr;
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-6, -10); ctx.lineTo(-6, 10); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillText(`LOCK ${Math.round(d)}m`, x, y + 24);
    }
    ctx.restore();
  }
}

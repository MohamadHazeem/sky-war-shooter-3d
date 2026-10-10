import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { Engine } from '../core/Engine';
import type { World } from '../world/World';
import type { Fighter } from '../world/Aircraft';
import { steerTo } from '../world/AI';
import { instantiate, hasModel } from '../world/Models';
import { sound } from '../audio/Sound';
import { KeyAim, KEY_AIM_RATE } from './KeyAim';

const _v = new THREE.Vector3();
const _as = new THREE.Vector3();
const _at = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

// P-51D player control: "mouse aim" (the aircraft is flown toward where you look,
// like an instructor holding the stick) or direct mouse-as-stick; cockpit or chase view.
export class PilotController {
  plane: Fighter | null = null;
  aimYaw = 0;
  assist = 1;   // aim assist strength 0..1 (Settings)
  aimPitch = 0;
  view: 'cockpit' | 'chase' = 'chase';
  mode: 'mouseAim' | 'direct' = 'mouseAim';
  baseFov = 62;   // set from Settings; cockpit (+8) and chase (+2) keep their original offsets
  private camPos = new THREE.Vector3();
  private camQuat = new THREE.Quaternion();
  private cockpit: THREE.Object3D | null = null;
  eyeOffset = new THREE.Vector3(0, 0.775, -1.174);
  gBlack = 0;     // 0..1 blackout
  freeLook = false;
  private lookYaw = 0;
  private lookPitch = 0;
  throttleCmd = 0.85;
  readonly gunsight = { x: 0, y: 0, visible: false, aimX: 0, aimY: 0, aimVisible: false, leadMil: 0 };
  private prevQuat = new THREE.Quaternion();
  private omegaSmooth = new THREE.Vector3();
  private keyAim = new KeyAim();

  constructor(private engine: Engine, private world: World, private input: Input) {}

  attach(plane: Fighter) {
    this.plane = plane;
    const f = plane.forward(_v);
    this.aimYaw = Math.atan2(f.x, f.z);
    this.aimPitch = Math.asin(THREE.MathUtils.clamp(f.y, -1, 1));
    this.camPos.copy(plane.pos);
    this.camQuat.copy(plane.quat);
    this.prevQuat.copy(plane.quat);
    if (hasModel('p51d_cockpit')) {
      this.cockpit = instantiate('p51d_cockpit');
      plane.model.add(this.cockpit);
      this.cockpit.visible = this.view === 'cockpit';
    }
    this.applyViewVisibility();
  }

  detach() {
    if (this.cockpit) this.cockpit.removeFromParent();
    this.cockpit = null;
    this.plane = null;
  }

  private applyViewVisibility() {
    if (!this.plane) return;
    // From the cockpit the spinning prop is barely perceptible
    for (const pr of this.plane.props) (pr.disc.material as THREE.MeshBasicMaterial).opacity = this.view === 'cockpit' ? 0.3 : 1;
    if (this.cockpit) this.cockpit.visible = this.view === 'cockpit';
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
      const tof = d / 880;
      _at.copy(e.vel).sub(p.vel).multiplyScalar(tof).add(e.pos);
      _at.y += 0.5 * 9.81 * tof * tof;
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

  update(dt: number) {
    const p = this.plane;
    if (!p) return;
    const inp = this.input;
    const fm = p.fm;
    if (inp.hit('KeyV')) { this.view = this.view === 'cockpit' ? 'chase' : 'cockpit'; this.applyViewVisibility(); }
    if (inp.hit('KeyM')) this.mode = this.mode === 'mouseAim' ? 'direct' : 'mouseAim';
    this.freeLook = inp.down('KeyC');

    // Throttle
    if (inp.down('KeyW')) this.throttleCmd = Math.min(1.1, this.throttleCmd + dt * 0.5);
    if (inp.down('KeyS')) this.throttleCmd = Math.max(0, this.throttleCmd - dt * 0.5);
    fm.throttle = this.throttleCmd;
    fm.limiter = this.mode === 'mouseAim';

    const sens = 0.0016 * inp.sensitivity;
    const push = inp.edgePush();
    const mdx = inp.mouseDX + push.x * 900 * dt, mdy = inp.mouseDY + push.y * 700 * dt;
    // keyboard aim (arrows / I-J-K-L), an accessibility alternative to the mouse
    this.keyAim.update(inp, dt);
    const kr = KEY_AIM_RATE * dt;
    if (p.alive) {
      if (this.freeLook) {
        this.lookYaw -= mdx * sens * 1.4 + this.keyAim.x * kr;
        this.lookPitch = THREE.MathUtils.clamp(this.lookPitch - mdy * sens * 1.4 + this.keyAim.y * kr, -1.2, 1.4);
      } else {
        this.lookYaw *= Math.exp(-dt * 6); this.lookPitch *= Math.exp(-dt * 6);
        if (this.mode === 'mouseAim') {
          this.aimYaw -= mdx * sens + this.keyAim.x * kr;
          this.aimPitch = THREE.MathUtils.clamp(this.aimPitch - mdy * sens * (inp.invertY ? -1 : 1) + this.keyAim.y * kr * (inp.invertY ? -1 : 1), -1.5, 1.5);
          this.applyAssist(p, dt);
          const dir = this.aimDir(_v);
          steerTo(fm, dir, 1.1, 1);
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
    this.updateCamera(dt);
    this.updateGunsight(dt);
  }

  private updateCamera(dt: number) {
    const p = this.plane!;
    const cam = this.engine.camera;
    if (cam.parent !== this.engine.scene) this.engine.scene.add(cam);
    const look = new THREE.Quaternion();
    if (this.view === 'cockpit') {
      const eye = p.localToWorld(this.eyeOffset, _v);
      cam.position.copy(eye);
      // head follows the aim direction relative to the airframe, limited like a real neck
      const base = p.quat.clone();
      if (this.mode === 'mouseAim' && !this.freeLook) {
        const aimLocal = this.aimDir(_v2).applyQuaternion(_q.copy(p.quat).invert());
        const yaw = THREE.MathUtils.clamp(Math.atan2(aimLocal.x, aimLocal.z), -1.6, 1.6);
        const pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(aimLocal.y, -1, 1)), -0.6, 1.3);
        look.setFromEuler(new THREE.Euler(-pitch * 0.85, yaw * 0.85, 0, 'YXZ'));
      } else {
        look.setFromEuler(new THREE.Euler(-this.lookPitch, this.lookYaw, 0, 'YXZ'));
      }
      cam.quaternion.copy(base).multiply(look).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
      this.engine.post.nearFocus = 0.35;
      this.engine.post.dofStrength = 0.5;
      this.engine.post.noBlurDist = 2.5;
      // RMB zoom keeps the original 45/70 ratio so magnification is the same at any base FOV
      cam.fov += ((this.baseFov + 8) * (this.input.mouse(2) ? 45 / 70 : 1) - cam.fov) * Math.min(1, dt * 8);
    } else {
      // chase camera behind the aim direction
      const dir = this.freeLook ? _v2.set(0, 0, 1).applyEuler(new THREE.Euler(-this.lookPitch, this.aimYaw + this.lookYaw, 0, 'YXZ')) : this.aimDir(_v2);
      const target = _v.copy(p.pos).addScaledVector(dir, -12).add(new THREE.Vector3(0, 2.6, 0).applyQuaternion(p.quat));
      this.camPos.lerp(target, 1 - Math.exp(-dt * 12));
      cam.position.copy(this.camPos);
      const m = new THREE.Matrix4().lookAt(cam.position, cam.position.clone().addScaledVector(dir, 100), new THREE.Vector3(0, 1, 0).applyQuaternion(p.quat).lerp(new THREE.Vector3(0, 1, 0), 0.5));
      cam.quaternion.setFromRotationMatrix(m);
      this.engine.post.nearFocus = 0.1;
      this.engine.post.dofStrength = 0;
      this.engine.post.noBlurDist = 25;
      cam.fov += ((this.baseFov + 2) * (this.input.mouse(2) ? 40 / 64 : 1) - cam.fov) * Math.min(1, dt * 8);
    }
    cam.updateProjectionMatrix();
    // G blackout via vignette
    this.engine.post.vignette = 0.9 + this.gBlack * 6;
    this.engine.post.exposure = 1 - this.gBlack * 0.6;
  }

  // K-14 gyro gunsight: reticle displaced by the turn rate * time of flight (lead)
  private updateGunsight(dt: number) {
    const p = this.plane!;
    const cam = this.engine.camera;
    // angular velocity estimate (world)
    const dq = _q.copy(this.prevQuat).invert().premultiply(p.quat);
    const angle = 2 * Math.acos(THREE.MathUtils.clamp(dq.w, -1, 1));
    const axis = new THREE.Vector3(dq.x, dq.y, dq.z);
    if (axis.lengthSq() > 1e-10) axis.normalize().multiplyScalar(angle / Math.max(dt, 1e-3));
    else axis.set(0, 0, 0);
    this.omegaSmooth.lerp(axis, 1 - Math.exp(-dt * 8));
    this.prevQuat.copy(p.quat);
    const range = 300;
    const tof = range / 880;
    const fwd = p.forward(new THREE.Vector3());
    // lead: rotate boresight forward by omega * tof (where the target will be)
    const lead = fwd.clone().applyAxisAngle(this.omegaSmooth.clone().normalize(), -Math.min(0.12, this.omegaSmooth.length() * tof));
    if (this.omegaSmooth.lengthSq() < 1e-8) lead.copy(fwd);
    // gravity drop
    const pt = p.pos.clone().addScaledVector(lead, range);
    pt.y += 0.5 * 9.81 * tof * tof * 0.3;
    const sp = pt.project(cam);
    this.gunsight.visible = sp.z < 1 && Math.abs(sp.x) < 1.2 && Math.abs(sp.y) < 1.2;
    this.gunsight.x = sp.x; this.gunsight.y = sp.y;
    this.gunsight.leadMil = Math.min(0.12, this.omegaSmooth.length() * tof) * 1000;
    // mouse-aim marker
    if (this.mode === 'mouseAim') {
      const ap = p.pos.clone().addScaledVector(this.aimDir(_v), 500).project(cam);
      this.gunsight.aimVisible = ap.z < 1;
      this.gunsight.aimX = ap.x; this.gunsight.aimY = ap.y;
    } else this.gunsight.aimVisible = false;
  }
}

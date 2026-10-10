import * as THREE from 'three';

// Lightweight but physically grounded fixed-wing model: thrust from engine power,
// parasitic + induced drag, lift from angle of attack with stall, weathervane
// stability and control authority that scales with dynamic pressure.
export interface FlightParams {
  power: number;          // thrust ~ power / v (m/s^2 * m/s)
  dragK: number;          // parasitic drag coefficient (a = k v^2)
  inducedK: number;       // induced drag coefficient (a = k n^2 / v^2)
  liftK: number;          // lift per rad AoA per v^2
  alphaStall: number;     // rad
  maxG: number;
  rollRate: number;       // rad/s at full authority
  pitchRate: number;      // rad/s commanded at full authority (further limited by lift)
  yawRate: number;
  vAuthority: number;     // m/s at which controls reach full effect
  stability: number;      // weathervane strength
}

export const P51_PARAMS: FlightParams = {
  power: 470, dragK: 6.2e-5, inducedK: 5200, liftK: 0.0125, alphaStall: 0.28, maxG: 8,
  rollRate: 2.4, pitchRate: 1.15, yawRate: 0.45, vAuthority: 85, stability: 3.2,
};

export const FW190_PARAMS: FlightParams = {
  power: 445, dragK: 6.6e-5, inducedK: 5800, liftK: 0.0122, alphaStall: 0.27, maxG: 7.5,
  rollRate: 2.9, pitchRate: 1.05, yawRate: 0.42, vAuthority: 85, stability: 3.2,
};

const G = 9.81;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _f = new THREE.Vector3();
const _u = new THREE.Vector3();
const _r = new THREE.Vector3();
const _a = new THREE.Vector3();
const _w = new THREE.Vector3();
const _ld = new THREE.Vector3();

export class FlightModel {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  vel = new THREE.Vector3();
  omega = new THREE.Vector3(); // body rates: x = pitch(+ nose up), y = yaw(+ nose left), z = roll(+ right wing down)
  throttle = 0.8;
  pitch = 0; roll = 0; yaw = 0; // control inputs [-1,1]
  thrustScale = 1; // reduced by engine damage
  rollBias = 0;    // from wing damage
  gLoad = 1;
  alpha = 0;
  speed = 0;
  stalled = false;
  crashed = false;
  minAlt = 300;
  limiter = true; // AoA/G limiter (mouse aim + AI); direct stick flying can stall

  constructor(public p: FlightParams, pos: THREE.Vector3, quat: THREE.Quaternion) {
    this.pos = pos;
    this.quat = quat;
  }

  forward(out = new THREE.Vector3()) { return out.set(0, 0, 1).applyQuaternion(this.quat); }
  up(out = new THREE.Vector3()) { return out.set(0, 1, 0).applyQuaternion(this.quat); }
  right(out = new THREE.Vector3()) { return out.set(-1, 0, 0).applyQuaternion(this.quat); }

  step(dt: number) {
    const p = this.p;
    _qi.copy(this.quat).invert();
    _v.copy(this.vel).applyQuaternion(_qi); // body-frame velocity (x left, y up, z fwd)
    const v = Math.max(this.vel.length(), 1);
    this.speed = v;
    this.alpha = Math.atan2(-_v.y, Math.max(_v.z, 1));
    const beta = Math.atan2(_v.x, Math.max(_v.z, 1));
    const auth = THREE.MathUtils.clamp(v / p.vAuthority, 0.15, 1.2);
    const auth2 = Math.min(1, auth * auth);

    // Lift with stall break
    const as = p.alphaStall;
    let cl: number;
    const aa = Math.abs(this.alpha);
    if (aa < as) cl = this.alpha;
    else cl = Math.sign(this.alpha) * Math.max(0, as - (aa - as) * 1.6);
    this.stalled = aa > as * 1.05;
    let lift = p.liftK * v * v * cl;
    const maxLift = p.maxG * G;
    lift = THREE.MathUtils.clamp(lift, -maxLift * 0.5, maxLift);
    this.gLoad = lift / G;

    // Forces (as accelerations)
    this.forward(_f);
    this.up(_u);
    this.right(_r);
    const vdir = _w.copy(this.vel).divideScalar(v);
    _a.set(0, 0, 0);
    _a.addScaledVector(_f, this.throttle * this.thrustScale * p.power / Math.max(v, 35));
    const induced = p.inducedK * (this.gLoad * this.gLoad) / (v * v);
    _a.addScaledVector(vdir, -(p.dragK * v * v + induced + (this.stalled ? 6 : 0)));
    // lift perpendicular to velocity, in the plane of the body up axis
    _ld.copy(_u).addScaledVector(vdir, -_u.dot(vdir)).normalize();
    _a.addScaledVector(_ld, lift);
    // side force from fuselage/fin
    _a.addScaledVector(_r, beta * v * v * 0.0018);
    _a.y -= G;
    this.vel.addScaledVector(_a, dt);

    // Angular dynamics: approach commanded rates; weathervane toward velocity
    const tc = 1 - Math.exp(-dt / 0.12);
    let pitchCmd = this.pitch * p.pitchRate * auth2;
    if (this.limiter) {
      // Keep AoA below the stall and the load below max G (the "instructor" won't stall you)
      const aLim = Math.min(p.alphaStall * 0.88, (p.maxG * G) / (p.liftK * v * v));
      if (pitchCmd > 0) pitchCmd *= THREE.MathUtils.clamp((aLim - this.alpha) / 0.07, -1, 1);
      else if (pitchCmd < 0) pitchCmd *= THREE.MathUtils.clamp((aLim * 0.5 + this.alpha) / 0.07, -1, 1);
    }
    const rollCmd = (this.roll + this.rollBias) * p.rollRate * auth2;
    const yawCmd = this.yaw * p.yawRate * auth2;
    // natural pitch/yaw stability pulls nose back toward the flight path
    const stab = p.stability * auth;
    this.omega.x += (pitchCmd - this.alpha * stab * 0.35 - this.omega.x) * tc;
    this.omega.y += (yawCmd + beta * stab * 0.5 - this.omega.y) * tc;
    this.omega.z += (rollCmd - this.omega.z) * tc;
    // Stall: nose drops and wing may drop
    if (this.stalled) {
      this.omega.x -= 0.9 * dt;
      this.omega.z += Math.sin(this.pos.x * 0.37 + this.pos.z * 0.11) * 1.2 * dt;
    }
    // Integrate orientation: x=pitch about local -X? local X axis points left; nose-up is rotation about -X? Use explicit axes.
    // Positive pitch (nose up): rotate about local +X (left) by -angle -> nose (+Z) goes up (+Y)
    const ax = -this.omega.x * dt, ay = this.omega.y * dt, az = this.omega.z * dt;
    _q.setFromEuler(new THREE.Euler(ax, ay, az, 'XYZ'));
    this.quat.multiply(_q).normalize();

    this.pos.addScaledVector(this.vel, dt);
  }
}

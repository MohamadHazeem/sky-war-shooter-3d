import * as THREE from 'three';

// Flight physics for falling wreckage: a rigid body with flat-plate aerodynamics, in real units
// (metres, kg, the real size of the aircraft; the 6x render scale of the enemies is applied only
// when drawing). Each plate is one structural part seen along the three body axes:
//
//   y plate  the planform (wings, tailplane): a lifting surface with a rigging incidence, so a
//            wing still lifts when the body flies straight; normal force ~2*pi*alpha, stalling
//            into ~2 broadside. Its centre of pressure sits a quarter chord ahead of the centroid
//            at small angles and moves back to it at 90 degrees: a loose panel flutters and
//            tumbles, as real ones do.
//   x plate  the side area (fin, fuselage sides), same law: weathervanes the hulk into the wind
//   z plate  the frontal area: plain drag
//
// Forces act at the plate centroids, using the local airflow (body velocity plus rotation), which
// also damps the rotation. What follows from that alone: the hulk that lost a wing rolls toward
// the stump (the other wing still lifts) and autorotates; a hulk without its tail pitches over
// (the wing's lift is behind the centre of mass); detached panels decelerate hard and flutter down
// at their terminal speed; an engine falls like a stone. No allocation per step.

export const RHO = 0.55;     // kg/m^3, ~7,600 m
const G = 9.81;
const W_MAX = 14;            // rad/s cap (numerical safety; real tumbling stays below)
const SUB_DT = 1 / 120;
const CZ = 0.35;             // frontal drag coefficient

export interface Plate {
  c: THREE.Vector3;   // centroid relative to the centre of mass, body frame (m)
  ax: number; ay: number; az: number;   // projected areas along body x, y, z (m^2)
  chord: number;      // m, centre-of-pressure travel on the y and x plates
  inc: number;        // rad, incidence of the y plate (positive: leading edge up)
}

export function makePlate(): Plate { return { c: new THREE.Vector3(), ax: 0, ay: 0, az: 0, chord: 1, inc: 0 }; }

// normal-force coefficient over sin(alpha): the lift slope at small angles, ~2 broadside
const cf = (sa: number, slope: number) => Math.min(slope, (1.25 + 0.7 * sa) / Math.max(sa, 1e-3));

const _vb = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3(), _fb = new THREE.Vector3();
const _t = new THREE.Vector3(), _tc = new THREE.Vector3(), _cp = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3();
const _iw = new THREE.Vector3(), _g = new THREE.Vector3(), _dq = new THREE.Quaternion(), _qi = new THREE.Quaternion();

export class Body {
  readonly pos = new THREE.Vector3();      // centre of mass, world
  readonly vel = new THREE.Vector3();      // world, m/s
  readonly quat = new THREE.Quaternion();  // body to world
  readonly w = new THREE.Vector3();        // angular velocity, body frame (rad/s)
  readonly inertia = new THREE.Vector3(1, 1, 1);  // principal moments along the body axes (kg m^2)
  mass = 1;
  thrust = 0;          // N along body +z (an engine still running), fades with thrustTau
  thrustTau = 2.5;
  aero = 1;            // scale on the aerodynamic forces
  slope = 2 * Math.PI; // lift slope of the plates (a torn, buckled panel lifts far worse than a wing)
  readonly plates: Plate[] = [];
  nPlates = 0;

  /** Force and torque of the air on the body (body frame) at the current state. */
  airload(force: THREE.Vector3, torque: THREE.Vector3) {
    force.set(0, 0, 0); torque.set(0, 0, 0);
    _vb.copy(this.vel).applyQuaternion(_qi.copy(this.quat).invert());
    for (let i = 0; i < this.nPlates; i++) {
      const p = this.plates[i];
      _u.crossVectors(this.w, p.c).add(_vb);
      const s2 = _u.lengthSq();
      if (s2 < 1e-4) continue;
      const speed = Math.sqrt(s2), k = 0.5 * RHO * speed * this.aero;
      // y plate, tilted by its incidence
      if (p.ay > 0) {
        _n.set(0, Math.cos(p.inc), -Math.sin(p.inc));
        const un = _u.dot(_n), sa = Math.abs(un) / speed;
        _fb.copy(_n).multiplyScalar(-k * p.ay * un * cf(sa, this.slope));
        _d.copy(_u).addScaledVector(_n, -un);
        const dl = _d.length();
        _cp.copy(p.c);
        if (dl > 1e-4) _cp.addScaledVector(_d, (0.25 * p.chord * (1 - sa)) / dl);
        force.add(_fb); torque.add(_tc.crossVectors(_cp, _fb));
      }
      if (p.ax > 0) {
        const sa = Math.abs(_u.x) / speed;
        _fb.set(-k * p.ax * _u.x * cf(sa, this.slope), 0, 0);
        _d.set(0, _u.y, _u.z);
        const dl = _d.length();
        _cp.copy(p.c);
        if (dl > 1e-4) _cp.addScaledVector(_d, (0.25 * p.chord * (1 - sa)) / dl);
        force.add(_fb); torque.add(_tc.crossVectors(_cp, _fb));
      }
      if (p.az > 0) {
        _fb.set(0, 0, -k * p.az * _u.z * CZ);
        force.add(_fb); torque.add(_tc.crossVectors(p.c, _fb));
      }
    }
  }

  step(dt: number) {
    if (dt <= 0) return;
    const n = Math.min(6, Math.ceil(dt / SUB_DT));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.sub(h);
  }

  private sub(h: number) {
    this.airload(_f, _t);
    // linear: air + gravity + thrust (world frame)
    _f.z += this.thrust;
    if (this.thrust > 0) this.thrust *= Math.exp(-h / this.thrustTau);
    _f.applyQuaternion(this.quat).divideScalar(this.mass);
    _g.set(0, -G, 0);
    this.vel.addScaledVector(_f, h).addScaledVector(_g, h);
    this.pos.addScaledVector(this.vel, h);
    // angular (Euler's equations, principal axes): I w' = T - w x (I w)
    const I = this.inertia, w = this.w;
    _iw.set(I.x * w.x, I.y * w.y, I.z * w.z);
    _t.sub(_d.crossVectors(w, _iw));
    w.x += (_t.x / I.x) * h; w.y += (_t.y / I.y) * h; w.z += (_t.z / I.z) * h;
    w.multiplyScalar(Math.exp(-0.12 * h));
    const wl = w.length();
    if (wl > W_MAX) w.multiplyScalar(W_MAX / wl);
    if (!Number.isFinite(wl)) w.set(0, 0, 0);
    // integrate the orientation with the body rates (right-multiplied)
    const a = Math.min(wl, W_MAX) * h;
    if (a > 1e-9) { _d.copy(w).divideScalar(wl); _dq.setFromAxisAngle(_d, a); this.quat.multiply(_dq).normalize(); }
  }
}

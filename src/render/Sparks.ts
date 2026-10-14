import * as THREE from 'three';
import { TracerRenderer } from './Particles';

// Hot sparks and fragments drawn as motion-stretched streaks (Effects 2.0): a glowing head with a
// tail along its velocity (the distance it covers in `STREAK` s), cooling from white-yellow to dull
// red, bent down by gravity and slowed by drag. Hit sparks, flak fragments and explosion embers
// read as fast-flying metal instead of round dots. One additive instanced draw (TracerRenderer's
// streak shader: HDR core, soft glow, at least ~1.5 px wide); pooled, nothing allocated per spawn.
const STREAK = 0.035;

export class Sparks {
  readonly tr: TracerRenderer;
  private n = 0;
  private p: Float32Array; private v: Float32Array; private c0: Float32Array; private c1: Float32Array;
  private life: Float32Array; private age: Float32Array; private w: Float32Array; private drag: Float32Array; private grav: Float32Array;

  constructor(readonly max = 900) {
    this.tr = new TracerRenderer(max);
    this.tr.mesh.renderOrder = 21;
    const F = (k: number) => new Float32Array(max * k);
    this.p = F(3); this.v = F(3); this.c0 = F(3); this.c1 = F(3); this.life = F(1); this.age = F(1); this.w = F(1); this.drag = F(1); this.grav = F(1);
    // the streak width floor needs the camera's pixel size: set it as the mesh is drawn
    this.tr.mesh.onBeforeRender = (r, _s, cam) => {
      const pc = cam as THREE.PerspectiveCamera;
      if (!pc.isPerspectiveCamera) return;
      const h = r.getRenderTarget()?.height ?? r.domElement.height;
      this.tr.uniforms.uPx.value = (2 * Math.tan(THREE.MathUtils.degToRad(pc.fov) / 2)) / Math.max(1, h);
    };
  }

  get count() { return this.n; }

  // c0: colour (HDR) at birth, c1 at death; width in m
  spawn(pos: THREE.Vector3, vel: THREE.Vector3, life: number, width: number, c0: readonly number[], c1: readonly number[], drag = 2.5, gravity = 9.81) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.p[i * 3] = pos.x; this.p[i * 3 + 1] = pos.y; this.p[i * 3 + 2] = pos.z;
    this.v[i * 3] = vel.x; this.v[i * 3 + 1] = vel.y; this.v[i * 3 + 2] = vel.z;
    this.c0[i * 3] = c0[0]; this.c0[i * 3 + 1] = c0[1]; this.c0[i * 3 + 2] = c0[2];
    this.c1[i * 3] = c1[0]; this.c1[i * 3 + 1] = c1[1]; this.c1[i * 3 + 2] = c1[2];
    this.life[i] = life; this.age[i] = 0; this.w[i] = width; this.drag[i] = drag; this.grav[i] = gravity;
  }

  private kill(i: number) {
    const j = --this.n;
    if (i === j) return;
    for (let q = 0; q < 3; q++) {
      this.p[i * 3 + q] = this.p[j * 3 + q]; this.v[i * 3 + q] = this.v[j * 3 + q];
      this.c0[i * 3 + q] = this.c0[j * 3 + q]; this.c1[i * 3 + q] = this.c1[j * 3 + q];
    }
    this.life[i] = this.life[j]; this.age[i] = this.age[j]; this.w[i] = this.w[j]; this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j];
  }

  rebase(off: THREE.Vector3) {
    for (let i = 0; i < this.n; i++) { this.p[i * 3] -= off.x; this.p[i * 3 + 1] -= off.y; this.p[i * 3 + 2] -= off.z; }
  }

  clear() { this.n = 0; this.tr.begin(); this.tr.flush(); }

  update(dt: number) {
    const tr = this.tr;
    tr.begin();
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.kill(i); continue; }
      const k = i * 3;
      const d = Math.exp(-this.drag[i] * dt);
      this.v[k] *= d; this.v[k + 1] = this.v[k + 1] * d - this.grav[i] * dt; this.v[k + 2] *= d;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      const t = this.age[i] / this.life[i];
      const f = (1 - t) * (1 - t * 0.5);
      const r = (this.c0[k] + (this.c1[k] - this.c0[k]) * t) * f;
      const g = (this.c0[k + 1] + (this.c1[k + 1] - this.c0[k + 1]) * t) * f;
      const b = (this.c0[k + 2] + (this.c1[k + 2] - this.c0[k + 2]) * t) * f;
      const x = this.p[k], y = this.p[k + 1], z = this.p[k + 2];
      tr.push(x - this.v[k] * STREAK, y - this.v[k + 1] * STREAK, z - this.v[k + 2] * STREAK, x, y, z, r, g, b, this.w[i]);
      i++;
    }
    tr.flush();
  }
}

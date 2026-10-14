import * as THREE from 'three';
import { TracerRenderer } from './Particles';

// Decorative exchanges use a fixed ring: no ballistics/AI entities, no per-frame allocations.
export class StreamTracers {
  readonly renderer: TracerRenderer;
  private data: Float32Array;
  private head = 0;
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  constructor(readonly capacity = 96) {
    this.renderer = new TracerRenderer(capacity);
    this.data = new Float32Array(capacity * 8);
    this.clear();
  }
  clear() { this.data.fill(0); for (let i = 0; i < this.capacity; i++) this.data[i * 8 + 6] = -1e9; this.renderer.begin(); this.renderer.flush(); }
  emit(x: number, y: number, z: number, tx: number, ty: number, tz: number, time: number, allied: boolean) {
    const dx = tx - x, dy = ty - y, dz = tz - z, len = Math.hypot(dx,dy,dz);
    if (len < 1) return;
    const i = (this.head++ % this.capacity) * 8, d = this.data;
    d[i] = x; d[i+1] = y; d[i+2] = z;
    d[i+3] = dx / len * 1050; d[i+4] = dy / len * 1050; d[i+5] = dz / len * 1050 - 75;
    d[i+6] = time; d[i+7] = allied ? 1 : 0;
  }
  update(time: number, matrix: THREE.Matrix4, camera: THREE.PerspectiveCamera, height: number) {
    const d = this.data, a = this.a, b = this.b, r = this.renderer;
    r.begin();
    for (let i = 0; i < d.length; i += 8) {
      const age = time - d[i+6];
      if (age < 0 || age > 0.55) continue;
      a.set(d[i]+d[i+3]*age, d[i+1]+d[i+4]*age, d[i+2]+d[i+5]*age).applyMatrix4(matrix);
      const tail = Math.max(0, age - 0.065);
      b.set(d[i]+d[i+3]*tail, d[i+1]+d[i+4]*tail, d[i+2]+d[i+5]*tail).applyMatrix4(matrix);
      const fade = Math.min(1, (0.55-age)*8) * Math.exp(-a.distanceTo(camera.position)/22000);
      r.push(b.x,b.y,b.z,a.x,a.y,a.z, 5*fade, (d[i+7] ? 2.6 : 4.2)*fade, 0.7*fade, 0.22);
    }
    r.end(camera,height);
  }
}

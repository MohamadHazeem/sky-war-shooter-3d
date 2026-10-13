import * as THREE from 'three';
import { weatherNow } from '../render/WeatherState';
import { TracerRenderer } from '../render/Particles';
import { Atmos } from '../render/Atmosphere';

const COUNT = 256;
const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
  uniforms: { sky: { value: new THREE.Color() } },
  vertexShader: `attribute vec4 tint; varying vec2 st; varying vec4 ink; varying float dist;
    void main(){st=uv;ink=tint; vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
      vec2 size=vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
      center.xy+=position.xy*size;dist=length(center.xyz);gl_Position=projectionMatrix*center;}`,
  fragmentShader: `varying vec2 st; varying vec4 ink; varying float dist; uniform vec3 sky;
    void main(){vec2 p=st*2.-1.;float r=length(p);float noise=.76+.24*sin(p.x*15.+sin(p.y*12.))*sin(p.y*17.+p.x*8.);
      float a=pow(max(0.,1.-r),1.35)*noise*ink.a;vec3 col=mix(ink.rgb,sky*.7,1.-exp(-dist*.00006));
      gl_FragColor=vec4(col,a);}` });
const geometry = new THREE.PlaneGeometry(1, 1);
const v = new THREE.Vector3(), scale = new THREE.Vector3(), q = new THREE.Quaternion(), matrix = new THREE.Matrix4();

/** Bounded, allocation-free naval exhaust, gun smoke/flash and water columns. Sea-local coordinates. */
export class SeaEffects {
  readonly mesh: THREE.InstancedMesh;
  readonly tracers = new TracerRenderer(128);
  private tint = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 4), 4);
  private data = new Float32Array(COUNT * 10); // x,y,z, age,life,size, vx,vy,vz,type
  private cursor = 0;
  constructor() {
    const geo = geometry.clone(); geo.setAttribute('tint', this.tint);
    this.mesh = new THREE.InstancedMesh(geo, material, COUNT); this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.tracers.mesh.onBeforeRender = (renderer, _scene, camera) => {
      const d = this.data, origin = this.mesh.parent?.position;
      this.tracers.begin();
      for (let i = 0; i < d.length; i += 10) if (d[i + 4] > 0 && d[i + 9] === 3) {
        const x = d[i] + (origin?.x ?? 0), y = d[i + 1] + (origin?.y ?? 0), z = d[i + 2] + (origin?.z ?? 0);
        this.tracers.push(x - d[i + 6] * .018, y - d[i + 7] * .018, z - d[i + 8] * .018, x, y, z, 8, 2.3, .5, .14);
      }
      this.tracers.end(camera as THREE.PerspectiveCamera, renderer.domElement.height);
    };
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.tint.setUsage(THREE.DynamicDrawUsage);
  }
  clear() { this.data.fill(0); this.mesh.count = 0; this.cursor = 0; }
  emit(pos: THREE.Vector3, size: number, type = 0, vx = 0, vy = 2, vz = 0) {
    const i = this.cursor * 10; this.cursor = (this.cursor + 1) % COUNT;
    const d = this.data; d[i] = pos.x; d[i + 1] = pos.y; d[i + 2] = pos.z; d[i + 3] = 0;
    d[i + 4] = type === 1 ? .14 : type === 2 ? 2.3 : type === 3 ? 1.6 : 6; d[i + 5] = size;
    d[i + 6] = vx; d[i + 7] = vy; d[i + 8] = vz; d[i + 9] = type;
  }
  splash(pos: THREE.Vector3, size = 1) { for (let i = 0; i < 5; i++) this.emit(pos, size * (2 + i * .6), 2, Math.sin(i * 2.4) * size * 2, (9 + i * 3) * size, Math.cos(i * 2.4) * size * 2); }
  update(dt: number) {
    material.uniforms.sky.value.copy(Atmos.horizon);
    const d = this.data; let n = 0;
    for (let i = 0; i < d.length; i += 10) {
      if (d[i + 4] <= 0) continue;
      d[i + 3] += dt; if (d[i + 3] >= d[i + 4]) { d[i + 4] = 0; continue; }
      const t = d[i + 3] / d[i + 4], type = d[i + 9], size = d[i + 5] * (type === 1 ? 1 + t : 1 + t * 3);
      d[i] += d[i + 6] * dt; d[i + 1] += d[i + 7] * dt; d[i + 2] += d[i + 8] * dt;
      if (type === 2) d[i + 7] -= dt * 18;
      if (type === 3) continue;
      v.set(d[i], Math.max(type === 2 ? 1 : -1000, d[i + 1]), d[i + 2]); scale.set(size, size * (type === 2 ? 2 : 1), size);
      matrix.compose(v, q, scale); this.mesh.setMatrixAt(n, matrix);
      const light = .35 + (1 - weatherNow.night) * .65;
      this.tint.setXYZW(n++, type === 1 ? 8 : (type === 2 ? .64 : .16) * light, type === 1 ? 3.7 : (type === 2 ? .75 : .17) * light, type === 1 ? .7 : (type === 2 ? .77 : .18) * light, (1 - t) * (type === 1 ? 1 : .65));
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; this.tint.needsUpdate = true;
  }
}
export function warmSeaEffects() {
  const fx = new SeaEffects(); fx.emit(v.set(0, 0, 0), 8); fx.update(0); return fx.mesh;
}

import * as THREE from 'three';
import { ParticleSystem, type ParticleOpts, mulberry } from '../render/Particles';

/** One curved spray-sheet draw and one existing atlas-particle draw. All storage is fixed. */
export class DitchingSpray {
  readonly particles = new ParticleSystem(320, false);
  readonly sheet: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private time = 0;
  private next = 0;
  private color = new THREE.Color();
  private pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private opts: ParticleOpts = { pos: this.pos, vel: this.vel, color0: this.color, life: 1,
    size0: 0.4, size1: 1.6, alpha0: 0.4, alpha1: 0, rise: -9.81, rotVel: 0.15 };
  private drops = (() => {
    const rnd = mulberry(61);
    return Array.from({ length: 420 }, (_, i) => {
      const source = i % 5, side = i % 2 ? -1 : 1;
      const x = source === 0 ? side * 1.3 : [-10, -5, 5, 10][source - 1];
      const mist = i % 3 === 0;
      return { at: 11 + i / 185, x, z: source === 0 ? 12 : 3,
        vx: side * (4 + rnd() * 14), vy: 3 + rnd() * 8, vz: 5 + rnd() * 13,
        size: mist ? 1.1 + rnd() : 0.15 + rnd() * 0.5, mist, jitter: rnd() };
    });
  })();

  constructor(scene: THREE.Scene) {
    const positions: number[] = [], uv: number[] = [], lanes: number[] = [], indices: number[] = [];
    // Nose and four nacelles, each throwing a fan to port and starboard.
    for (let source = 0; source < 5; source++) for (const side of [-1, 1]) {
      const base = positions.length / 3;
      for (let y = 0; y <= 8; y++) for (let x = 0; x <= 20; x++) {
        positions.push(0, 0, 0); uv.push(x / 20, y / 8);
        lanes.push(source === 0 ? side * 1.3 : [-10, -5, 5, 10][source - 1], source === 0 ? 12 : 3, side, source * 0.075);
      }
      for (let y = 0; y < 8; y++) for (let x = 0; x < 20; x++) {
        const a = base + y * 21 + x; indices.push(a, a + 1, a + 21, a + 1, a + 22, a + 21);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('lane', new THREE.Float32BufferAttribute(lanes, 4)); geo.setIndex(indices);
    const material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, light: { value: new THREE.Color() } },
      vertexShader: `attribute vec4 lane; uniform float time; varying vec2 st; varying float age; varying float height;
        void main(){ st=uv; float launch=lane.w+uv.y*.65; age=time-11.-launch;
          float u=max(0.,age); float fan=uv.x;
          vec3 p=vec3(lane.x+lane.z*(3.+fan*16.)*u, .18+(5.+sin(fan*3.14159)*3.)*u-4.905*u*u,
            lane.y+launch*8.+(19.-fan*12.)*u);
          height=p.y; gl_Position=projectionMatrix*viewMatrix*vec4(p,1.); }`,
      fragmentShader: `uniform vec3 light; varying vec2 st; varying float age; varying float height;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
        void main(){float lace=noise(st*vec2(37.,17.));
          float edge=smoothstep(0.,.12,st.x)*smoothstep(0.,.12,1.-st.x)*smoothstep(0.,.18,st.y)*smoothstep(0.,.18,1.-st.y);
          float a=edge*smoothstep(0.,.1,age)*(1.-smoothstep(.35,1.65,age))*smoothstep(0.,.45,height);
          a*=smoothstep(.23,.65,lace)*.42;
          gl_FragColor=vec4(light*(.75+.25*lace),a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    });
    this.sheet = new THREE.Mesh(geo, material); this.sheet.frustumCulled = false;
    scene.add(this.sheet, this.particles.mesh);
  }

  update(t: number, night: boolean, low = false) {
    if (t < this.time) { this.time = 0; this.next = 0; this.particles.clear(); }
    // Studio sky lighting, rather than the high-altitude world's Atmos light state.
    this.color.setRGB(night ? 0.18 : 0.7, night ? 0.23 : 0.8, night ? 0.3 : 0.84);
    this.sheet.material.uniforms.light.value.copy(this.color);
    this.sheet.material.uniforms.time.value = t;
    this.sheet.visible = t > 11 && t < 14;
    while (this.next < this.drops.length && this.drops[this.next].at <= t) {
      const d = this.drops[this.next++];
      this.advance(d.at);
      if (low && this.next % 2 === 0) continue;
      const o = this.opts;
      this.pos.set(d.x + (d.jitter - 0.5), 0.3, d.z + (d.at - 11) * 8);
      const force = 1 - (d.at - 11) * 0.18;
      this.vel.set(d.vx * force, d.vy * force, d.vz * force);
      // Expire at water contact; gravity carries the visible spray back down.
      o.life = (this.vel.y + Math.sqrt(this.vel.y * this.vel.y + 2 * 9.81 * 0.3)) / 9.81;
      o.size0 = d.size; o.size1 = d.size * (d.mist ? 2.8 : 1.5);
      o.alpha0 = d.mist ? 0.25 : 0.65;
      this.particles.spawn(o);
    }
    this.advance(t);
  }
  private advance(t: number) {
    // Bounded substeps also support deterministic dev-hook seeks and skipping to rescue.
    while (this.time < t) {
      const dt = Math.min(1 / 60, t - this.time); this.time += dt;
      if (this.particles.count) this.particles.update(dt);
    }
  }
}

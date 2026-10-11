import * as THREE from 'three';
import { weatherNow } from './WeatherState';
import { precipitationCount } from './WeatherPresets';
import { Atmos } from './Atmosphere';

/** One instanced draw in the existing transparent pass, no CPU particle simulation. */
export class Precipitation {
  readonly velocity = new THREE.Vector3();
  readonly uniforms = {
    uTime: { value: 0 }, uRain: { value: 0 }, uSnow: { value: 0 },
    uFlow: { value: new THREE.Vector3() }, uOffset: { value: new THREE.Vector3() }, uLight: { value: 1 },
  };
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly bolt: THREE.Line;
  private boltLife = 0;
  constructor(scene: THREE.Scene) {
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index; geo.attributes = quad.attributes;
    const seeds = new Float32Array(1400 * 3);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    geo.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 3));
    geo.instanceCount = 0;
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `attribute vec3 seed;
        uniform float uTime, uRain, uSnow; uniform vec3 uFlow, uOffset;
        varying vec2 vUv; varying float vAlpha;
        void main() {
          vec3 size = vec3(80.,60.,80.);
          vec3 flow = uFlow;
          vec3 p = (fract(seed + uOffset/size)-.5)*size;
          p.x += sin(uTime*.7+seed.x*30.)*uSnow;
          vec4 vp = viewMatrix*vec4(cameraPosition+p,1.);
          vec3 vf = mat3(viewMatrix)*flow;
          vec2 along = normalize(vf.xy+vec2(.001));
          vec2 across = vec2(-along.y,along.x);
          float len = mix(clamp(length(flow)*.018,.45,3.5),.10,uSnow);
          vp.xy += across*position.x*mix(.035,.10,uSnow) + along*position.y*len;
          gl_Position = projectionMatrix*vp;
          vUv=uv;
          vAlpha = smoothstep(3.,9.,length(p))*(1.-smoothstep(30.,40.,length(p.xz))) * max(uRain,uSnow);
        }`,
      fragmentShader: `uniform float uSnow,uLight; varying vec2 vUv; varying float vAlpha;
        void main() {
          float shape=mix((1.-abs(vUv.x*2.-1.))*sin(vUv.y*3.14159),1.-smoothstep(.25,.5,length(vUv-.5)),uSnow);
          float a=shape*vAlpha*mix(.38,.85,uSnow);
          if(a<.005) discard;
          gl_FragColor=vec4(vec3(.72,.8,.88)*uLight,a);
        }`,
    }));
    this.mesh.name = 'weather-precipitation'; this.mesh.frustumCulled = false;
    this.mesh.userData.noRebase = true;
    const boltGeo = new THREE.BufferGeometry();
    boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(36), 3));
    this.bolt = new THREE.Line(boltGeo, new THREE.LineBasicMaterial({ color: 0xcbdcff, transparent: true, opacity: 0, depthWrite: false }));
    this.bolt.name = 'weather-lightning'; this.bolt.frustumCulled = false;
    scene.add(this.mesh, this.bolt);
  }
  update(dt: number, time: number, quality: string) {
    const w = weatherNow, u = this.uniforms;
    this.mesh.geometry.instanceCount = w.rain + w.snow > .001 ? precipitationCount(quality, w.effects) : 0;
    u.uTime.value = time; u.uRain.value = w.rain; u.uSnow.value = w.snow;
    u.uFlow.value.copy(Atmos.wind).sub(this.velocity);
    u.uFlow.value.y -= 24 - 21 * w.snow;
    const offset = u.uOffset.value.addScaledVector(u.uFlow.value, dt);
    offset.x %= 80; offset.y %= 60; offset.z %= 80;
    u.uLight.value = .8 + Atmos.sunIntensity * .12;
    this.boltLife = Math.max(0, this.boltLife - dt);
    this.bolt.visible = w.effects && this.boltLife > 0;
    (this.bolt.material as THREE.LineBasicMaterial).opacity = w.effects ? Math.min(1, this.boltLife * 8) : 0;
  }
  /** Rare visible cloud-to-cloud stroke, visual only: never damages the player. */
  strike(camera: THREE.Camera) {
    if (!weatherNow.effects) return;
    const p = this.bolt.geometry.attributes.position;
    const a = Math.random() * Math.PI * 2;
    const x = camera.position.x + Math.cos(a) * 1300, z = camera.position.z + Math.sin(a) * 1300;
    for (let i = 0; i < 12; i++) p.setXYZ(i, x + Math.sin(i * 7.3) * 35, camera.position.y + 700 - i * 100, z + Math.cos(i * 3.7) * 30);
    p.needsUpdate = true; this.boltLife = .24;
  }
  warm(render: () => void) {
    const count = this.mesh.geometry.instanceCount;
    this.mesh.geometry.instanceCount = 1;
    const visible = this.bolt.visible; this.bolt.visible = true;
    try { render(); } finally { this.mesh.geometry.instanceCount = count; this.bolt.visible = visible; }
  }
}

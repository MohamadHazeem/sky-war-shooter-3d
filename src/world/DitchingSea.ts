import * as THREE from 'three';
import { DitchingSpray } from './DitchingSpray';

const box = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.SphereGeometry(1, 8, 6);
const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
const yellow = mat(0xe5af25), rubber = mat(0x534731), skin = mat(0xcfa27e), coat = mat(0x4e493d);
const hull = mat(0x27323a), deck = mat(0xb2b4a7), glass = mat(0x253c4b), white = mat(0xe4dfce);
function mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m;
}
function man() {
  const g = new THREE.Group();
  mesh(g, box, coat, 0, 0.55, 0, 0.42, 0.65, 0.3).rotation.x = -0.35;
  mesh(g, box, yellow, 0, 0.7, 0.14, 0.46, 0.35, 0.17);
  mesh(g, sphere, skin, 0, 0.89, 0.39, 0.18, 0.21, 0.18);
  mesh(g, box, coat, 0, 0.25, 0.3, 0.43, 0.25, 0.65);
  for (const side of [-1, 1]) {
    mesh(g, box, coat, side * 0.28, 0.56, 0.27, 0.13, 0.5, 0.15).rotation.x = -0.6;
    mesh(g, sphere, skin, side * 0.28, 0.33, 0.43, 0.09, 0.09, 0.09);
  }
  return g;
}

/** Fixed pools, a single analytic ocean shader, no new textures or reflection targets. */
export class DitchingSea {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 6000);
  readonly sea: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly rafts: THREE.Group[] = [];
  readonly crew: THREE.Group[] = [];
  readonly brace = new THREE.Group();
  readonly launch = new THREE.Group();
  readonly flare = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: 0xff6633 }));
  readonly spray: DitchingSpray;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  constructor() {
    this.scene.background = new THREE.Color(0x77868c);
    // Same light counts as the world. Fog lives in the ocean shader (no bomber material variant).
    const sun = new THREE.DirectionalLight(0xe4e7dc, 2.5); sun.position.set(-100, 180, 100);
    this.sun = sun; this.hemi = new THREE.HemisphereLight(0xb6c7d0, 0x41484b, 2);
    this.scene.add(sun, this.hemi);
    const material = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, night: { value: 0 } },
      vertexShader: `varying vec3 p; uniform float time;
        void main(){ vec3 v=position; v.z+=sin(v.x*.09+time*1.4)*.32+sin(v.y*.13-time)*.18;
          vec4 w=modelMatrix*vec4(v,1.); p=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `varying vec3 p; uniform float time; uniform float night;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
        float caps(vec2 q){
          vec2 id=floor(q), f=fract(q); float h=hash(id);
          float center=.25+.5*hash(id+19.);
          float width=.035+.09*hash(id+7.);
          float across=abs(f.y-center+.035*sin(f.x*11.+h*30.));
          float ends=smoothstep(.05,.2,f.x)*(1.-smoothstep(.35+h*.58,.95,f.x));
          return (1.-smoothstep(width*.25,width,across))*ends*smoothstep(.38,.85,h);
        }
        void main(){ float a=p.x*.09+time*1.4+noise(p.xz*.025)*4., b=-p.z*.13-time+noise(p.zx*.018)*5.;
          vec3 n=normalize(vec3(-.14*cos(a),1.,.11*cos(b)));
          vec3 v=normalize(cameraPosition-p); float f=pow(1.-max(dot(n,v),0.),3.);
          float distance=length(cameraPosition-p);
          // Two offset wind-aligned scales, random occupancy, width, length and brightness.
          vec2 wind=vec2(p.x*.94+p.z*.34,-p.x*.34+p.z*.94);
          wind.x-=time*1.8;
          float streak=caps(wind/vec2(19.,8.))+caps((wind+vec2(43.,17.))/vec2(31.,13.))*.55;
          streak*=mix(.18,1.,noise(wind*.075))* (1.-smoothstep(80.,650.,distance));
          float impact=max(0.,time-11.); float travel=min(35.,impact*8.);
          vec2 q=p.xz-vec2(0.,12.);
          float broken=.45+.55*noise(p.xz*.6+time*.15);
          float radius=length(q*vec2(1.,.7));
          float ring=exp(-pow((radius-(3.+impact*3.8))/(1.1+impact*.22),2.));
          ring*=exp(-impact*.22);
          float tail=travel+10.-p.z;
          float wakeWidth=3.+max(0.,tail)*.25;
          float wake=exp(-pow((abs(p.x)-wakeWidth)/1.6,2.));
          wake*=smoothstep(-2.,4.,tail)*(1.-smoothstep(32.,55.,tail));
          wake+=exp(-pow(p.x/5.,2.))*smoothstep(0.,4.,tail)*(1.-smoothstep(14.,38.,tail))*.4;
          float foam=(ring+wake*.65)*broken*smoothstep(0.,.4,impact)*exp(-max(0.,impact-5.)*.09);
          float glint=pow(max(0.,dot(reflect(-normalize(vec3(-.4,.6,.6)),n),v)),110.);
          vec3 c=mix(vec3(.065,.13,.16),vec3(.29,.38,.4),f)+streak*.11+foam*vec3(.22,.27,.28)+glint*vec3(.7,.72,.62);
          c*=.85+.1*(sin(a)+sin(b)*.45); c*=mix(1.,.38,night); c=mix(c,mix(vec3(.19,.24,.27),vec3(.035,.055,.085),night),smoothstep(150.,1800.,length(cameraPosition-p)));
          gl_FragColor=vec4(c,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`, side: THREE.DoubleSide });
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(10000, 10000, 100, 100), material);
    this.sea.rotation.x = -Math.PI / 2; this.scene.add(this.sea);
    const tube = new THREE.TorusGeometry(1.55, 0.29, 6, 18);
    for (let i = 0; i < 2; i++) {
      const raft = new THREE.Group();
      mesh(raft, sphere, rubber, 0, 0, 0, 1.5, 0.14, 2.1);
      const rim = mesh(raft, tube, yellow, 0, 0.18, 0, 1, 1.4, 1); rim.rotation.x = -Math.PI / 2;
      this.scene.add(raft); this.rafts.push(raft);
      for (let j = 0; j < 5; j++) { const c = man(); this.crew.push(c); this.brace.add(c); }
    }
    // Cutaway of the radio compartment: padded bulkhead, bench, floor and braced crew.
    mesh(this.brace, box, hull, 0, -0.1, 0, 5.8, 0.2, 7);
    mesh(this.brace, box, deck, 0, 1.3, -3.4, 5.8, 2.8, 0.15);
    mesh(this.brace, box, rubber, 0, 0.1, 0, 3.5, 0.25, 6);
    for (const x of [-2.9, 2.9]) mesh(this.brace, box, hull, x, 1.4, 0, 0.15, 3, 7);
    mesh(this.brace, box, hull, 0, 2.9, 0, 5.8, 0.12, 7);
    const rib = new THREE.TorusGeometry(2.8, 0.055, 4, 18, Math.PI);
    for (const z of [-2.8, -1.4, 0, 1.4, 2.8]) mesh(this.brace, rib, deck, 0, 0.15, z, 1, 0.94, 1);
    this.brace.position.set(0, 100, 0); this.scene.add(this.brace);
    // RAF high-speed rescue launch: narrow hull, raised bow, cabin, mast and roundels.
    mesh(this.launch, sphere, hull, 0, 0.5, 0, 2.2, 1.1, 9);
    mesh(this.launch, box, deck, 0, 1.1, -0.5, 3.6, 0.25, 13);
    mesh(this.launch, box, deck, 0, 2, 0.8, 2.9, 1.6, 4);
    mesh(this.launch, box, glass, 0, 2.25, 2.84, 2.55, 0.7, 0.08);
    mesh(this.launch, box, hull, 0, 3.5, -0.7, 0.12, 3.5, 0.12);
    mesh(this.launch, box, white, 0.65, 4.4, -0.7, 1.3, 0.75, 0.04);
    const roundel = new THREE.CircleGeometry(0.65, 20);
    for (const side of [-1, 1]) {
      const r = new THREE.Group(); r.position.set(side * 1.47, 2, 0.8); r.rotation.y = side * Math.PI / 2;
      mesh(r, roundel, new THREE.MeshBasicMaterial({ color: 0x17375c, side: THREE.DoubleSide }), 0, 0, 0, 1, 1, 1);
      mesh(r, roundel, white, 0, 0, 0.01, 0.68, 0.68, 1);
      mesh(r, roundel, new THREE.MeshBasicMaterial({ color: 0xaf3f34, side: THREE.DoubleSide }), 0, 0, 0.02, 0.35, 0.35, 1);
      this.launch.add(r);
    }
    this.scene.add(this.launch, this.flare); this.flare.scale.setScalar(0.35);
    this.spray = new DitchingSpray(this.scene);
  }
  /** Called by World.prewarm with all materials visible, before play. */
  warm(render: (scene?: THREE.Scene) => void, bomber: THREE.Object3D) {
    this.scene.traverse(o => { o.frustumCulled = false; });
    const parent = bomber.parent, pos = bomber.position.clone(), hidden: THREE.Object3D[] = [];
    bomber.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    this.scene.add(bomber); bomber.position.set(0, 2, 0);
    this.camera.position.set(50, 30, 70); this.camera.lookAt(0, 0, 0); this.camera.layers.enableAll();
    this.spray.update(11.6, false);
    try { render(this.scene); } finally {
      this.spray.update(0, false);
      if (parent) parent.add(bomber); else bomber.removeFromParent();
      bomber.position.copy(pos); for (const o of hidden) o.visible = false;
    }
  }
  update(t: number, night: boolean, low = false) {
    this.sun.intensity = night ? 0.7 : 2.5; this.hemi.intensity = night ? 0.65 : 2;
    this.sea.material.uniforms.time.value = t; this.sea.material.uniforms.night.value = night ? 1 : 0;
    (this.scene.background as THREE.Color).setHex(night ? 0x303e51 : 0x77868c);
    this.brace.visible = t >= 5 && t < 9;
    for (let i = 0; i < 10; i++) {
      const c = this.crew[i], raft = this.rafts[i < 5 ? 0 : 1];
      if (t < 16) {
        if (c.parent !== this.brace) this.brace.add(c);
        c.position.set(i % 2 ? 0.85 : -0.85, 0.2, Math.floor(i / 2) * 1.1 - 2.5);
      } else {
        if (c.parent !== raft) raft.add(c);
        c.position.set(i % 2 ? 0.65 : -0.65, 0, (i % 5) * 0.58 - 1.15);
      }
    }
    for (let i = 0; i < 2; i++) {
      const r = this.rafts[i]; r.visible = t >= 16;
      const u = Math.max(0, t - 16); r.position.set((i ? -1 : 1) * (5 + Math.min(6, u)), 0.35 + Math.sin(t * 1.2 + i) * 0.2, 7 + u * 0.35);
      r.scale.setScalar(Math.min(1, 0.2 + u)); r.rotation.z = Math.sin(t + i) * 0.045;
    }
    this.launch.visible = t >= 22; this.launch.position.set(20, 0, -100 + Math.min(100, Math.max(0, t - 22) * 15));
    this.launch.rotation.z = Math.sin(t) * 0.025;
    this.flare.visible = t >= 21 && t < 27;
    this.flare.position.set(10, 2 + Math.max(0, t - 21) * 8, 9);
    this.spray.update(t, night, low);
  }
}

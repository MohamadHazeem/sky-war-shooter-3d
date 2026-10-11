import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SeaCombat, SEA_KINDS, type SeaKind, type SeaPart } from './SeaCombat';
import { weatherNow } from '../render/WeatherState';
import { Atmos } from '../render/Atmosphere';

const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.18 });
const gunMat = new THREE.MeshStandardMaterial({ color: 0x626d6a, roughness: 0.7 });
const charMat = new THREE.MeshStandardMaterial({ color: 0x242423, roughness: 1 });
export const ordnanceMat = new THREE.MeshStandardMaterial({ color: 0x59624b, roughness: 0.6 });
const foamMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { time: { value: 0 } },
  vertexShader: 'varying vec2 st; void main(){st=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `varying vec2 st; uniform float time;
    void main(){float w=.04+st.y*.45; float edge=abs(abs(st.x-.5)-w);
      float a=(1.-smoothstep(.012,.08,edge))*(1.-st.y)*(.5+.5*sin(st.y*93.-time*6.)*sin(st.x*121.));
      gl_FragColor=vec4(.7,.85,.86,a*.42);}` });
const sprayMat = new THREE.MeshBasicMaterial({ color: 0xb6d0d1, transparent: true, opacity: .46, depthWrite: false });
const oilMat = new THREE.MeshBasicMaterial({ color: 0x121c22, transparent: true, opacity: 0.58, depthWrite: false });
const beamMat = new THREE.MeshBasicMaterial({ color: 0xc8d9ee, transparent: true, opacity: 0.065, depthWrite: false, side: THREE.DoubleSide });
const waterMat = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, rough: { value: 0 }, night: { value: 0 }, sun: { value: new THREE.Vector3() }, sky: { value: new THREE.Color() } },
  vertexShader: `varying vec3 p; uniform float time; uniform float rough;
    void main(){vec3 v=position; v.z+=(sin(v.x*.017+time)*.7+sin(v.y*.026-time*1.3)*.4)*(1.+rough*3.);
      vec4 w=modelMatrix*vec4(v,1.);p=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader: `varying vec3 p; uniform float time,rough,night; uniform vec3 sun; uniform vec3 sky;
    float hash(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
    float caps(vec2 q){vec2 id=floor(q),f=fract(q);float h=hash(id);
      float y=.18+.6*hash(id+17.);float w=.012+.06*hash(id+9.);
      float edge=abs(f.y-y+.025*sin(f.x*9.+h*20.));
      return (1.-smoothstep(w*.25,w,edge))*smoothstep(.06,.23,f.x)*(1.-smoothstep(.4+h*.4,.95,f.x))*smoothstep(.58,.92,h);}
    void main(){vec2 q=p.xz;float warp=noise(q*.008)*6.;
      float a=q.x*.045+q.y*.023+time*1.7+warp;
      float b=q.y*.079-q.x*.031-time*1.3+noise(q*.014+21.)*5.;
      vec3 n=normalize(vec3(-cos(a)*(.09+rough*.14),1.,cos(b)*(.07+rough*.13)));
      vec3 v=normalize(cameraPosition-p);float f=pow(1.-max(0.,dot(n,v)),3.);
      float glint=pow(max(0.,dot(reflect(-normalize(sun),n),v)),120.);
      vec2 wind=vec2(q.x*.94+q.y*.34-time*2.,-q.x*.34+q.y*.94);
      float foam=caps(wind/vec2(24.,11.))+caps((wind+vec2(43.,17.))/vec2(39.,17.))*.45;
      float farFade=1.-smoothstep(900.,9000.,length(cameraPosition-p));
      vec3 col=mix(vec3(.018,.10,.125),sky*.58,f)+glint*vec3(.9,.8,.58)+foam*(.08+rough*.2)*farFade;
      col*=1.-night*.85;float haze=1.-exp(-length(cameraPosition-p)*.000017);
      gl_FragColor=vec4(mix(col,sky*.7,haze),1.);}` });
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const wakeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const oilGeo = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
const beamGeo = new THREE.ConeGeometry(70, 800, 12, 1, true).translate(0, -400, 0).rotateX(Math.PI);
const gunGeo = mergeGeometries([new THREE.BoxGeometry(5, 3, 5), new THREE.CylinderGeometry(.5, .65, 12, 8).rotateX(Math.PI / 2).translate(0, 1, 6)])!;
const turretGeo = mergeGeometries([new THREE.BoxGeometry(11, 5, 10), ...[-2, 2].map(x => new THREE.CylinderGeometry(.65, .8, 21, 8).rotateX(Math.PI / 2).translate(x, 1, 11))])!;
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const geometries = new Map<SeaKind, [THREE.BufferGeometry, THREE.BufferGeometry]>();
function color(g: THREE.BufferGeometry, hex: number) {
  const c = new THREE.Color(hex), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
function block(x: number, y: number, z: number, w: number, h: number, d: number, col: number) { return color(new THREE.BoxGeometry(w, h, d).translate(x, y, z), col); }
function merge(parts: THREE.BufferGeometry[]) {
  const flat = parts.map(g => g.index ? g.toNonIndexed() : g);
  const result = mergeGeometries(flat)!;
  for (const g of flat) g.dispose(); for (const g of parts) if (g.index) g.dispose();
  return result;
}
function shipGeometry(kind: SeaKind): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const cached = geometries.get(kind); if (cached) return cached;
  const s = SEA_KINDS[kind], L = s.length, B = s.beam, H = kind === 'uboat' ? 2 : B * .32;
  const halves: THREE.BufferGeometry[][] = [[], []];
  if (s.shore) {
    const h = kind === 'tower' ? 32 : 8;
    halves[0].push(block(0, h / 2, 0, B, h, L, 0x777769), block(0, h + 1, 0, B + 3, 2, L + 3, 0x929080));
    if (kind === 'searchlight') halves[0].push(color(new THREE.SphereGeometry(3, 12, 8).translate(0, 12, 0), 0xb5c6c6));
    if (kind === 'battery') { halves[0].push(block(0, 5, L / 2 + .2, B * .6, 2, .5, 0x151b1b)); }
    if (kind === 'radar') {
      halves[0].push(block(0, 17, 0, 2, 20, 2, 0x38423e));
      halves[0].push(color(new THREE.SphereGeometry(11, 12, 8, 0, Math.PI).scale(1, 1, .24).rotateX(-.4).translate(0, 25, 0), 0xa1aaa0));
    }
    halves[1].push(block(0, .1, 0, B + 5, .2, L + 5, 0x5c6251));
  } else {
    // Two complete longitudinal half-hulls. Splitting them never needs clipping or a shader variant.
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? 1 : -1, shape = new THREE.Shape();
      shape.moveTo(-B / 2, 0); shape.lineTo(-B * .48, L * .32); shape.lineTo(-B * .3, L * .46); shape.lineTo(0, L / 2);
      shape.lineTo(B * .3, L * .46); shape.lineTo(B * .48, L * .32); shape.lineTo(B / 2, 0); shape.closePath();
      const hull = new THREE.ExtrudeGeometry(shape, { depth: H + 4, bevelEnabled: false, steps: 1 }).rotateX(-Math.PI / 2);
      if (sign === 1) hull.rotateY(Math.PI);
      hull.translate(0, -4, 0);
      halves[side].push(color(hull, 0x414f55));
      halves[side].push(block(0, H + .3, sign * L * .2, B * .79, .7, L * .35, kind === 'merchant' ? 0x635e53 : 0xaaa18a));
      halves[side].push(block(0, -.3, sign * L * .22, B * .98, 1.4, L * .37, 0x85483d));
    }
    const p = halves[0];
    if (kind === 'merchant') {
      for (const z of [-.32, -.12, .3]) halves[z > 0 ? 0 : 1].push(block(0, H + 4, z * L, B * .65, 7, L * .13, 0x747064));
      p.push(block(0, H + 10, .08 * L, B * .72, 20, L * .12, 0xc2bba4));
    } else if (kind === 'uboat') p.push(block(0, 6, 0, 4, 9, 12, 0x778079), block(0, 12, 1, .6, 7, .6, 0x424a46));
    else {
      p.push(block(0, H + B * .17, L * .03, B * .52, B * .34, L * .24, 0x7c8786));
      p.push(block(0, H + B * .43, L * .08, B * .43, B * .2, L * .07, 0xb0b6ad));
      p.push(block(0, H + B * .43, L * .09 + L * .036, B * .44, B * .065, .6, 0x27363c));
      for (const z of [-.06, -.15]) halves[1].push(block(0, H + B * .3, z * L, B * .24, B * .65, L * .055, 0x565f5e), block(0, H + B * .63, z * L, B * .25, 1.5, L * .058, 0x202526));
      p.push(block(0, H + B * .9, .06 * L, 1, B, 1, 0x46544f), block(0, H + B * 1.22, .06 * L, B * .45, .6, .7, 0x46544f));
    }
  }
  const result: [THREE.BufferGeometry, THREE.BufferGeometry] = [merge(halves[0]), merge(halves[1])]; geometries.set(kind, result); return result;
}

export class SeaShip {
  readonly combat: SeaCombat;
  readonly root = new THREE.Group();
  readonly halves: THREE.Mesh[];
  readonly mounts: (THREE.Mesh | null)[];
  readonly wake = new THREE.Mesh(wakeGeo, foamMat);
  readonly oil = new THREE.Mesh(oilGeo, oilMat);
  readonly beam: THREE.Mesh | null;
  readonly salvo = new THREE.Vector3();
  salvoT = -1; gunT = 2; heavyT = 12; effectT = 0; credited = false;
  heading = 0; age = 0; baseY = 0;
  constructor(readonly kind: SeaKind, readonly index: number) {
    this.combat = new SeaCombat(kind);
    this.halves = shipGeometry(kind).map(g => new THREE.Mesh(g, hullMat));
    for (const h of this.halves) { this.root.add(h); h.castShadow = true; }
    this.mounts = this.combat.parts.map(p => {
      if (p.kind !== 'flak' && p.kind !== 'turret') return null;
      const mesh = new THREE.Mesh(p.kind === 'flak' ? gunGeo : turretGeo, gunMat);
      mesh.position.set(p.x, p.y, p.z); mesh.castShadow = true; this.root.add(mesh); return mesh;
    });
    this.wake.scale.set(this.combat.spec.beam * 4, 1, this.combat.spec.length * 2);
    this.oil.scale.set(this.combat.spec.beam * 2, 1, this.combat.spec.length * .7);
    this.oil.visible = false;
    this.beam = kind === 'searchlight' ? new THREE.Mesh(beamGeo, beamMat) : null;
    if (this.beam) { this.beam.position.y = 12; this.root.add(this.beam); }
  }
  partPosition(p: SeaPart, out: THREE.Vector3) { return out.set(p.x, p.y, p.z).applyQuaternion(this.root.quaternion).add(this.root.position); }
  update(dt: number, time: number, rough: number) {
    const c = this.combat, s = c.spec; this.age += dt; c.update(dt);
    if (c.alive) {
      if (this.kind === 'eboat') this.heading += Math.sin(this.age * .45 + this.index) * dt * .26;
      // Convoys circle the bounded operating area rather than disappearing over the horizon.
      if (!s.shore && Math.hypot(this.root.position.x, this.root.position.z) > 4200) this.heading += dt * .2;
      const speed = s.speed * (c.dive === 'submerged' ? .6 : 1);
      this.root.position.x += Math.sin(this.heading) * speed * dt; this.root.position.z += Math.cos(this.heading) * speed * dt;
    }
    if (!s.shore) {
      this.root.position.y = Math.sin(time + this.index) * (.3 + rough * 1.6) - c.depth;
      this.root.rotation.set(Math.sin(time * .7 + this.index) * (.008 + rough * .035), this.heading, Math.sin(time * .55 + this.index) * (.008 + rough * .04), 'YXZ');
      if (c.sink !== 'afloat') {
        const t = c.sinkTime, big = s.length >= 140;
        this.root.rotation.z += Math.min(.9, t * .037); this.root.position.y -= t * (big ? .62 : .95);
        if (big && t > 8) for (let i = 0; i < 2; i++) { this.halves[i].rotation.x = (i ? 1 : -1) * Math.min(.6, (t - 8) * .035); this.halves[i].position.z = (i ? -1 : 1) * (t - 8) * .7; }
      }
    }
    if (s.shore && c.sink !== 'afloat') for (const half of this.halves) { half.material = charMat; half.scale.y = Math.max(.25, 1 - c.sinkTime * .05); }
    this.root.visible = c.sink !== 'sunk' && c.dive !== 'escaped';
    for (let i = 0; i < this.mounts.length; i++) { const m = this.mounts[i]; if (m) { m.material = c.parts[i].hp > 0 && c.sink === 'afloat' ? gunMat : charMat; if (c.parts[i].hp <= 0) m.rotation.z = .35; } }
    this.wake.visible = !s.shore && c.sink === 'afloat' && c.dive !== 'escaped';
    this.wake.position.copy(this.root.position); this.wake.position.y = 1.2;
    this.wake.rotation.y = this.heading; this.wake.translateZ(-s.length * .9);
    if (c.dive === 'submerged') this.wake.scale.set(12, 1, 70);
    this.oil.visible = !s.shore && c.sink !== 'afloat'; this.oil.position.copy(this.root.position).setY(1.4);
    if (this.beam) { this.beam.visible = weatherNow.night > .3 && c.alive; this.beam.rotation.set(.4 * Math.sin(time * .25), 0, .4 * Math.cos(time * .25)); }
  }
}

export class SeaWorld {
  readonly root = new THREE.Group();
  readonly ships: SeaShip[] = [];
  readonly water = new THREE.Mesh(new THREE.PlaneGeometry(70000, 70000, 160, 160), waterMat);
  readonly coast: THREE.Mesh;
  readonly spray = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 5, 4), sprayMat, 96);
  time = 0;
  constructor() {
    this.root.visible = false; this.water.rotation.x = -Math.PI / 2; this.root.add(this.water);
    const rocks: THREE.BufferGeometry[] = [];
    rocks.push(block(3900, 8, 0, 2000, 16, 18000, 0xa39b7e), block(4200, 27, 0, 1800, 40, 18000, 0x65705a));
    for (let i = 0; i < 60; i++) rocks.push(color(new THREE.IcosahedronGeometry(90 + (i % 5) * 16, 0).scale(1, .36, 1.7).translate(3260 + Math.sin(i * 1.7) * 50, 19, i * 280 - 8200), 0x8a8b79));
    rocks.push(block(2780, 7, 650, 900, 14, 38, 0x6b7470), block(2340, 7, 900, 38, 14, 500, 0x6b7470));
    this.coast = new THREE.Mesh(merge(rocks), hullMat); this.root.add(this.coast, this.spray); this.spray.frustumCulled = false; this.spray.count = 0;
  }
  groundAt = (x: number, _z: number) => x - this.root.position.x >= 3260 ? 47 : x - this.root.position.x >= 2900 ? 16 : 0;
  clear() { for (const s of this.ships) { s.root.removeFromParent(); s.wake.removeFromParent(); s.oil.removeFromParent(); } this.ships.length = 0; this.spray.count = 0; }
  add(kind: SeaKind, x: number, z: number, heading = 0) {
    const s = new SeaShip(kind, this.ships.length); s.root.position.set(x, SEA_KINDS[kind].shore ? 47 : 0, z); s.heading = heading; s.root.rotation.y = heading;
    this.ships.push(s); this.root.add(s.root, s.wake, s.oil); return s;
  }
  update(dt: number, low: boolean) {
    this.time += dt; const rough = weatherNow.mood === 'storm' ? 1 : weatherNow.mood === 'overcast' ? .35 : 0;
    waterMat.uniforms.time.value = foamMat.uniforms.time.value = this.time; waterMat.uniforms.rough.value = rough;
    waterMat.uniforms.night.value = weatherNow.night; waterMat.uniforms.sun.value.copy(Atmos.sunDir); waterMat.uniforms.sky.value.copy(Atmos.horizon);
    let n = 0;
    for (const s of this.ships) {
      s.update(dt, this.time, rough);
      if (s.combat.spec.shore || s.combat.resolved) continue;
      const count = low ? 2 : rough ? 8 : 4;
      for (let i = 0; i < count && n < 96; i++) {
        const phase = (this.time * .9 + i / count) % 1, side = i % 2 ? -1 : 1;
        const sinking = s.combat.sink !== 'afloat' || s.combat.dive !== 'surfaced';
        _v.set(side * (s.combat.spec.beam * .4 + phase * (4 + rough * 10)), sinking ? 1 + Math.sin(phase * Math.PI) * 1.5 : 1 + Math.sin(phase * Math.PI) * (2 + rough * 5), sinking ? Math.sin(i * 7) * s.combat.spec.length * .4 : s.combat.spec.length * .42 - phase * 20).applyAxisAngle(THREE.Object3D.DEFAULT_UP, s.heading).add(s.root.position); _v.y = Math.max(1.2, _v.y);
        _scale.set(1 + phase * 1.4, sinking ? .4 : 1.5 + rough * 2, 1 + phase * 2); _m.compose(_v, _q, _scale); this.spray.setMatrixAt(n++, _m);
      }
    }
    this.spray.count = n; this.spray.instanceMatrix.needsUpdate = true;
  }
}

/** Render every material/layout once in World's existing warm pass; retain materials for reuse. */
export function prewarmSea(scene: THREE.Scene, at: THREE.Vector3) {
  const root = new THREE.Group(); root.position.copy(at);
  const mats = [hullMat, gunMat, charMat, ordnanceMat, foamMat, oilMat, beamMat, waterMat];
  for (let i = 0; i < mats.length; i++) { const m = new THREE.Mesh(i === 0 ? shipGeometry('eboat')[0] : boxGeo, mats[i]); m.position.x = (i - 4) * 3; root.add(m); }
  // Instanced spray uses the same basic-material program warmed here.
  const inst = new THREE.InstancedMesh(boxGeo, sprayMat, 1); root.add(inst); scene.add(root);
  return () => root.removeFromParent();
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { shipGeometry, coastGeometry, shorelineGeometry, radarGeometry, detailTexture } from './SeaModels';
import { SeaCombat, SEA_KINDS, isHeavySeaKind, type SeaKind, type SeaPart } from './SeaCombat';
import { SeaEffects, warmSeaEffects } from './SeaEffects';
import { weatherNow } from '../render/WeatherState';
import { Atmos } from '../render/Atmosphere';

const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.18 });
const gunMat = new THREE.MeshStandardMaterial({ color: 0x626d6a, roughness: 0.7 });
const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: detailTexture(), roughness: 1 });
// Keep steep, textured terrain nonnegative before the HDR/ACES pipeline. Warm this variant below.
terrainMat.onBeforeCompile = shader => { shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight = max(outgoingLight, vec3(0.0));\n#include <opaque_fragment>'); };
terrainMat.customProgramCacheKey = () => 'sea-terrain-hdr-v1';
const charMat = new THREE.MeshStandardMaterial({ color: 0x242423, roughness: 1 });
export const ordnanceMat = new THREE.MeshStandardMaterial({ color: 0x59624b, roughness: 0.6 });
const foamMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { time: { value: 0 } },
  vertexShader: 'varying vec2 st; void main(){st=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `varying vec2 st; uniform float time;
    void main(){float w=.04+st.y*.45; float edge=abs(abs(st.x-.5)-w);
      float a=(1.-smoothstep(.012,.08,edge))*(1.-st.y)*(.5+.5*sin(st.y*93.-time*6.)*sin(st.x*121.));
      gl_FragColor=vec4(.7,.85,.86,a*.42);}` });
const sprayMat = new THREE.MeshBasicMaterial({ color: 0xb6d0d1, transparent: true, opacity: .22, depthWrite: false });
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
const radarGeo = radarGeometry();
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const wakeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const oilGeo = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
const beamGeo = new THREE.ConeGeometry(70, 800, 12, 1, true).translate(0, -400, 0).rotateX(Math.PI);
const gunBase = mergeGeometries([new THREE.CylinderGeometry(1.5, 2, 2, 10), new THREE.BoxGeometry(3, 2.2, 2).translate(0, 1, 0)])!;
const turretBase = mergeGeometries([new THREE.CylinderGeometry(4.8, 5.3, 2, 12).translate(0, -1, 0), new THREE.CylinderGeometry(6.2, 7, 4.2, 5).rotateY(Math.PI).scale(1, 1, 1.05).translate(0, 1, 0), new THREE.BoxGeometry(13, .8, 1.2).translate(0, 3.5, -2)])!;
const heavyBarrel = new THREE.CylinderGeometry(.38, .7, 18, 10).rotateX(Math.PI / 2).translate(0, 0, 10);
const lightBarrel = new THREE.CylinderGeometry(.13, .28, 7, 8).rotateX(Math.PI / 2).translate(0, 0, 4);
const shoreFoamMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { time: { value: 0 } },
  vertexShader: 'varying vec2 st; void main(){st=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `varying vec2 st; uniform float time; void main(){
    float wave=sin(st.x*18.+st.y*2.-time*1.7)*.5+.5;
    float edge=max(0.,sin(clamp(st.x,0.,1.)*3.14159)); float fleck=.5+.5*sin(st.y*53.+sin(st.x*47.));
    gl_FragColor=vec4(.55,.68,.67,clamp(edge*pow(max(0.,wave),4.)*(.18+fleck*.3),0.,1.));}` });
const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _scale = new THREE.Vector3();
export class SeaShip {
  readonly combat: SeaCombat;
  readonly root = new THREE.Group();
  readonly halves: THREE.Mesh[];
  readonly detail: THREE.Mesh[];
  readonly barrels: (THREE.Group | null)[];
  readonly radar: THREE.Mesh | null;
  readonly mounts: (THREE.Mesh | null)[];
  readonly wake = new THREE.Mesh(wakeGeo, foamMat);
  readonly oil = new THREE.Mesh(oilGeo, oilMat);
  readonly beam: THREE.Mesh | null;
  readonly salvo = new THREE.Vector3();
  salvoT = -1; gunT = 2; heavyT = 12; effectT = 0; credited = false;
  heading = 0; age = 0; baseY = 0; exhaustT = 0;
  constructor(readonly kind: SeaKind, readonly index: number) {
    this.combat = new SeaCombat(kind);
    const geometry = shipGeometry(kind);
    this.halves = geometry.slice(0, 2).map(g => new THREE.Mesh(g, this.combat.spec.shore ? terrainMat : hullMat));
    this.detail = geometry.slice(2).map((g, i) => { const m = new THREE.Mesh(g, hullMat); this.halves[i].add(m); return m; });
    this.barrels = this.combat.parts.map(() => null);
    this.radar = kind === 'radar' ? new THREE.Mesh(radarGeo, hullMat) : null;
    if (this.radar) { this.radar.position.y = 20; this.root.add(this.radar); }
    for (const h of this.halves) { this.root.add(h); h.castShadow = true; }
    this.mounts = this.combat.parts.map((p, i) => {
      if (p.kind !== 'flak' && p.kind !== 'turret') return null;
      const heavy = p.kind === 'turret' && (kind === 'battleship' || kind === 'cruiser');
      const mesh = new THREE.Mesh(heavy ? turretBase : gunBase, gunMat);
      const barrels = new THREE.Group(); barrels.position.y = heavy ? 1 : .7;
      for (const x of heavy ? [-1.8, 1.8] : [0]) { const barrel = new THREE.Mesh(heavy ? heavyBarrel : lightBarrel, gunMat); barrel.position.x = x; barrels.add(barrel); }
      mesh.add(barrels); this.barrels[i] = barrels;
      mesh.rotation.y = p.z < 0 ? Math.PI : 0;
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
        const t = c.sinkTime, big = isHeavySeaKind(this.kind);
        this.root.rotation.z += Math.min(.9, t * .037); this.root.position.y -= t * (big ? .62 : .95);
        if (big && t > 8) for (let i = 0; i < 2; i++) { this.halves[i].rotation.x = (i ? 1 : -1) * Math.min(.6, (t - 8) * .035); this.halves[i].position.z = (i ? -1 : 1) * (t - 8) * .7; }
      }
    }
    if (s.shore && c.sink !== 'afloat') for (const half of this.halves) { half.material = charMat; half.scale.y = Math.max(.25, 1 - c.sinkTime * .05); }
    this.root.visible = c.sink !== 'sunk' && c.dive !== 'escaped';
    for (let i = 0; i < this.mounts.length; i++) { const m = this.mounts[i]; if (m) { m.material = c.parts[i].hp > 0 && c.sink === 'afloat' ? gunMat : charMat; if (c.parts[i].hp <= 0) m.rotation.z = .35; const barrels = this.barrels[i]; if (barrels) for (const b of barrels.children) (b as THREE.Mesh).material = m.material; } }
    this.wake.visible = !s.shore && c.sink === 'afloat' && c.dive !== 'escaped';
    this.wake.position.copy(this.root.position); this.wake.position.y = 1.2;
    this.wake.rotation.y = this.heading; this.wake.translateZ(-s.length * .9);
    if (c.dive === 'submerged') this.wake.scale.set(12, 1, 70);
    this.oil.visible = !s.shore && c.sink !== 'afloat'; this.oil.position.copy(this.root.position).setY(1.4);
    if (this.radar && c.alive) this.radar.rotation.y += dt * .4;
    if (this.beam) { this.beam.visible = weatherNow.night > .3 && c.alive; this.beam.rotation.set(.4 * Math.sin(time * .25), 0, .4 * Math.cos(time * .25)); }
  }
}

export class SeaWorld {
  readonly root = new THREE.Group();
  readonly ships: SeaShip[] = [];
  readonly effects = new SeaEffects();
  readonly water = new THREE.Mesh(new THREE.PlaneGeometry(70000, 70000, 160, 160), waterMat);
  readonly coast: THREE.Mesh;
  readonly spray = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6), sprayMat, 96);
  time = 0;
  constructor() {
    this.root.visible = false; this.water.rotation.x = -Math.PI / 2; this.root.add(this.water, this.effects.mesh, this.effects.tracers.mesh);
    this.coast = new THREE.Mesh(coastGeometry(), terrainMat);
    this.root.add(this.coast, new THREE.Mesh(shorelineGeometry(), shoreFoamMat), this.spray); this.spray.frustumCulled = false; this.spray.count = 0;
  }
  groundAt = (x: number, _z: number) => x - this.root.position.x >= 3260 ? 47 : x - this.root.position.x >= 2900 ? 16 : 0;
  clear() { this.effects.clear(); for (const s of this.ships) { s.root.removeFromParent(); s.wake.removeFromParent(); s.oil.removeFromParent(); } this.ships.length = 0; this.spray.count = 0; }
  add(kind: SeaKind, x: number, z: number, heading = 0) {
    const s = new SeaShip(kind, this.ships.length); s.root.position.set(x, SEA_KINDS[kind].shore ? 47 : 0, z); s.heading = heading; s.root.rotation.y = heading;
    this.ships.push(s); this.root.add(s.root, s.wake, s.oil); return s;
  }
  fireGun(s: SeaShip, index: number, heavy = false) {
    const p = s.combat.parts[index], mount = s.mounts[index], barrel = s.barrels[index];
    if (!mount || !barrel) return;
    const twin = p.kind === 'turret' && (s.kind === 'battleship' || s.kind === 'cruiser');
    for (let b = 0; b < (twin ? 2 : 1); b++) {
      _v.set(twin ? (b ? 1.8 : -1.8) : 0, 0, twin ? 19 : 7.5).applyQuaternion(barrel.quaternion).add(barrel.position).applyQuaternion(mount.quaternion).add(mount.position).applyQuaternion(s.root.quaternion).add(s.root.position);
      this.effects.emit(_v, heavy ? 14 : twin ? 5 : 2.5, 1, 0, 0);
      this.effects.emit(_v, heavy ? 10 : twin ? 3 : 1.2, 0, 3, 2, -2);
      if (p.kind === 'flak') {
        _dir.set(0, 0, 780).applyQuaternion(barrel.quaternion).applyQuaternion(mount.quaternion).applyQuaternion(s.root.quaternion);
        for (let j = 0; j < 3; j++) { _v.addScaledVector(_dir, .035); this.effects.emit(_v, 1, 3, _dir.x, _dir.y, _dir.z); }
      }
    }
  }
  update(dt: number, low: boolean, viewer?: THREE.Vector3) {
    this.time += dt; const rough = weatherNow.mood === 'storm' ? 1 : weatherNow.mood === 'overcast' ? .35 : 0;
    waterMat.uniforms.time.value = foamMat.uniforms.time.value = shoreFoamMat.uniforms.time.value = this.time; waterMat.uniforms.rough.value = rough;
    waterMat.uniforms.night.value = weatherNow.night; waterMat.uniforms.sun.value.copy(Atmos.sunDir); waterMat.uniforms.sky.value.copy(Atmos.horizon);
    let n = 0;
    for (const s of this.ships) {
      s.update(dt, this.time, rough);
      const detailed = !low && (!viewer || _v.copy(s.root.position).add(this.root.position).distanceToSquared(viewer) < 1800 * 1800);
      for (const mesh of s.detail) mesh.visible = detailed;
      if (s.combat.spec.shore || s.combat.resolved) continue;
      s.exhaustT -= dt;
      if (s.combat.alive && s.exhaustT <= 0 && s.kind !== 'uboat' && s.kind !== 'eboat') {
        s.exhaustT = low ? .7 : .22;
        const spec = s.combat.spec, h = spec.beam * .32;
        const capital = s.kind === 'battleship' || s.kind === 'cruiser';
        const y = h + (capital ? 21 : s.kind === 'merchant' ? 19 : 3 + spec.beam * .6);
        _v.set(0, y, capital ? -spec.length * .025 : s.kind === 'merchant' ? 0 : -spec.length * .03).applyQuaternion(s.root.quaternion).add(s.root.position);
        this.effects.emit(_v, capital ? 5 : 2.4, 0, 5, 2, -3);
        if (s.kind === 'destroyer') { _v.set(0, h + 3 + spec.beam * .55, -spec.length * .17).applyQuaternion(s.root.quaternion).add(s.root.position); this.effects.emit(_v, 2.2, 0, 5, 2, -3); }
      }
      const count = low ? 2 : rough ? 8 : 4;
      for (let i = 0; i < count && n < 96; i++) {
        const phase = (this.time * .9 + i / count) % 1, side = i % 2 ? -1 : 1;
        const sinking = s.combat.sink !== 'afloat' || s.combat.dive !== 'surfaced';
        _v.set(side * (s.combat.spec.beam * .4 + phase * (4 + rough * 10)), sinking ? 1 + Math.sin(phase * Math.PI) * 1.5 : 1 + Math.sin(phase * Math.PI) * (2 + rough * 5), sinking ? Math.sin(i * 7) * s.combat.spec.length * .4 : s.combat.spec.length * .42 - phase * 20).applyAxisAngle(THREE.Object3D.DEFAULT_UP, s.heading).add(s.root.position); _v.y = Math.max(1.2, _v.y);
        _scale.set(.4 + phase * .8, sinking ? .25 : .7 + rough, .4 + phase); _m.compose(_v, _q, _scale); this.spray.setMatrixAt(n++, _m);
      }
    }
    this.effects.update(dt);
    this.spray.count = n; this.spray.instanceMatrix.needsUpdate = true;
  }
}

/** Render every material/layout once in World's existing warm pass; retain materials for reuse. */
export function prewarmSea(scene: THREE.Scene, at: THREE.Vector3) {
  const root = new THREE.Group(); root.position.copy(at);
  const mats = [hullMat, gunMat, charMat, ordnanceMat, foamMat, oilMat, beamMat, waterMat, terrainMat, shoreFoamMat];
  for (let i = 0; i < mats.length; i++) { const m = new THREE.Mesh((i === 0 || mats[i] === terrainMat) ? shipGeometry('eboat')[0] : boxGeo, mats[i]); m.position.x = (i - 4) * 3; root.add(m); }
  // Instanced spray uses the same basic-material program warmed here.
  const inst = new THREE.InstancedMesh(boxGeo, sprayMat, 1); root.add(inst); const fx = warmSeaEffects(); root.add(fx); scene.add(root);
  return () => { root.removeFromParent(); fx.geometry.dispose(); fx.dispose(); };
}

import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { Engine } from '../core/Engine';
import { World } from '../world/World';
import { Bomber } from '../world/Aircraft';
import { dirFromYawPitch, STATIONS, StationDef, StationId, wrapAngle } from '../world/B17Layout';
import { buildM2, buildTailInterior, buildTurret, buildWaistInterior, GunModel } from './Viewmodels';
import { sound } from '../audio/Sound';
import { bulletHoleTexture } from '../render/Textures';
import { Atmos } from '../render/Atmosphere';

interface StationState {
  def: StationDef;
  yaw: number; pitch: number;       // current (relative to rest)
  tYaw: number; tPitch: number;     // target
  vYaw: number; vPitch: number;
  ammo: number; maxAmmo: number;
  heat: number; overheated: boolean;
  reload: number;
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const R = () => Math.random() * 2 - 1;

// First-person B-17 gunner: heavy, sprung gun traverse, recoil, barrel heat, belts.
export class GunnerController {
  station: StationId = 'waistL';
  private states = new Map<StationId, StationState>();
  private rig = new THREE.Group();        // attached to the bomber, at the pivot
  private gunPivot = new THREE.Group();   // rotates yaw/pitch
  private interiors: Partial<Record<StationId, THREE.Object3D>> = {};
  private guns: Partial<Record<StationId, GunModel[]>> = {};
  private waistInterior: THREE.Group | null = null;
  private muzzleLight = new THREE.PointLight(0xffb060, 0, 6, 2);
  private cooldown = 0;
  private shotCount = 0;
  private recoilT = 0;
  private shake = 0;
  zoom = false;
  fov = 62;
  bomber: Bomber | null = null;
  private casings: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  private casingGeo = new THREE.CylinderGeometry(0.0105, 0.0105, 0.099, 8);
  private casingMat = new THREE.MeshStandardMaterial({ color: 0xc48a3c, roughness: 0.3, metalness: 1 });
  firing = false;
  private holes: THREE.Object3D[] = [];
  private holeMat: THREE.MeshBasicMaterial | null = null;
  private beamMat: THREE.ShaderMaterial | null = null;
  onSwitch?: (st: StationDef) => void;
  transition = 0; // >0 while crawling to another station (screen fades)
  private pendingStation: StationId | null = null;

  constructor(private engine: Engine, private world: World, private input: Input) {
    for (const id of Object.keys(STATIONS) as StationId[]) {
      const def = STATIONS[id];
      const max = def.type === 'waist' ? 600 : def.id === 'top' ? 750 : 1000;
      this.states.set(id, { def, yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, vYaw: 0, vPitch: 0, ammo: max, maxAmmo: max, heat: 0, overheated: false, reload: 0 });
    }
    this.rig.add(this.gunPivot);
    // Lights live permanently in the scene (intensity 0 when unused) so attaching or
    // detaching the gunner never changes the light count and forces shader recompiles.
    this.muzzleLight.userData.noRebase = true;
    engine.scene.add(this.muzzleLight);

  }

  attach(bomber: Bomber, station: StationId) {
    this.detach();
    this.bomber = bomber;
    bomber.root.add(this.rig);
    // Interior + guns are built once per mission
    const wl = STATIONS.waistL.pivot, wr = STATIONS.waistR.pivot;
    this.waistInterior = buildWaistInterior((wl.z + wr.z) / 2, wl.z, wr.z);
    bomber.root.add(this.waistInterior);
    this.interiors.waistL = this.waistInterior;
    this.interiors.waistR = this.waistInterior;
    this.guns.waistL = [buildM2({ ringSight: true, belt: true, beltSide: 1 })];
    this.guns.waistR = [buildM2({ ringSight: true, belt: true, beltSide: -1 })];
    const top = buildTurret('top');
    this.guns.top = top.guns;
    this.interiors.top = top.group;
    const ball = buildTurret('ball');
    this.guns.ball = ball.guns;
    this.interiors.ball = ball.group;
    const tail = buildTailInterior();
    this.interiors.tail = tail;
    const tg: GunModel[] = [];
    for (const sx of [1, -1]) {
      const m = buildM2({ ringSight: false, belt: false, beltSide: 1 });
      m.group.position.set(sx * 0.15, 0, 0);
      tg.push(m);
    }
    // ring-and-post sight on a bracket above the guns, on the gunner's eye line
    const sightGun = buildM2({ ringSight: true, belt: false, beltSide: 1 });
    sightGun.group.traverse((o) => { if ((o as THREE.Mesh).isMesh && !(o as THREE.Mesh).geometry.type.startsWith('Torus') && (o as THREE.Mesh).geometry.type !== 'SphereGeometry') o.visible = false; });
    sightGun.group.position.set(0, 0.12, 0.25);
    this.interiors.tail.add(sightGun.group);
    this.guns.tail = tg;
    this.setStation(station, true);
  }

  detach() {
    this.applyModelVisibility(null);
    if (this.bomber) {
      this.bomber.root.remove(this.rig);
      if (this.waistInterior) this.bomber.root.remove(this.waistInterior);
    }
    this.gunPivot.clear();
    this.rig.children.filter((c) => c !== this.gunPivot).forEach((c) => this.rig.remove(c));
    this.muzzleLight.intensity = 0;
    for (const c of this.casings) c.m.removeFromParent();
    this.casings = [];
    for (const h of this.holes) h.removeFromParent();
    this.holes = [];
    this.bomber = null;
  }

  // A round passed through the fuselage (bomber-local point and direction): punch
  // entry/exit holes in the waist interior, with daylight and sunbeams through them.
  fuselageHit(local: THREE.Vector3, dir: THREE.Vector3) {
    const wi = this.waistInterior;
    if (!wi || !this.bomber) return;
    const a = 1.08, b = 1.12, yC = 0.15;
    const wl = STATIONS.waistL.pivot;
    const z0 = wl.z - 3.1, z1 = wl.z + 3.1;
    const d = dir.clone().normalize();
    const o = local.clone().addScaledVector(d, -4);
    const A = (d.x / a) ** 2 + (d.y / b) ** 2;
    const B = 2 * (o.x * d.x / (a * a) + (o.y - yC) * d.y / (b * b));
    const C = (o.x / a) ** 2 + ((o.y - yC) / b) ** 2 - 1;
    const disc = B * B - 4 * A * C;
    if (A < 1e-6 || disc < 0) return;
    const sq = Math.sqrt(disc);
    const sunLocal = Atmos.sunDir.clone().applyQuaternion(this.bomber.root.quaternion.clone().invert());
    for (const t of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
      const p = o.clone().addScaledVector(d, t);
      if (p.z < z0 || p.z > z1) continue;
      // no holes in the open windows
      if (Math.abs(p.z - wl.z) < 0.42 && p.y > 0.05 && p.y < 0.72) continue;
      const n = new THREE.Vector3(p.x / (a * a), (p.y - yC) / (b * b), 0).normalize();
      this.addHole(p, n, sunLocal);
    }
  }

  private addHole(p: THREE.Vector3, n: THREE.Vector3, sunLocal: THREE.Vector3) {
    const wi = this.waistInterior!;
    this.holeMat ??= new THREE.MeshBasicMaterial({ map: bulletHoleTexture(), transparent: true, depthWrite: false, color: new THREE.Color(3.2, 3.1, 2.9), polygonOffset: true, polygonOffsetFactor: -2 });
    this.beamMat ??= new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color() } },
      vertexShader: /* glsl */ `
        varying float vF; varying float vL;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec3 n = normalize(mat3(modelMatrix) * normal);
          vec3 v = normalize(cameraPosition - wp.xyz);
          vF = abs(dot(n, v));
          vL = uv.y;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol; varying float vF; varying float vL;
        void main() {
          float a = pow(vF, 4.0) * smoothstep(0.0, 0.05, 1.0 - vL) * smoothstep(0.0, 0.45, vL) * (0.3 + 0.7 * vL);
          gl_FragColor = vec4(uCol * a, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.beamMat.uniforms.uCol.value.copy(Atmos.sunColor).multiplyScalar(Atmos.sunIntensity * 0.028);
    const g = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.045 + Math.random() * 0.03, 0.045 + Math.random() * 0.03), this.holeMat);
    hole.position.copy(p).addScaledVector(n, -0.006);
    hole.lookAt(hole.position.clone().sub(n));
    hole.rotateZ(Math.random() * 6.28);
    g.add(hole);
    if (n.dot(sunLocal) > 0.06) {
      const len = 2.8;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.075, len, 10, 1, true), this.beamMat);
      const into = sunLocal.clone().negate();
      beam.position.copy(p).addScaledVector(into, len / 2);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sunLocal);
      g.add(beam);
    }
    wi.add(g);
    this.holes.push(g);
    if (this.holes.length > 36) { const old = this.holes.shift()!; old.removeFromParent(); old.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); }
    // splinters and dust inside the fuselage
    const wpos = this.bomber!.localToWorld(p.clone().addScaledVector(n, -0.05));
    this.world.effects.sparks(wpos, this.bomber!.vel, false);
  }

  requestStation(id: StationId) {
    if (id === this.station || this.transition > 0) return;
    this.pendingStation = id;
    this.transition = 0.9;
    sound.play('click', null, { gain: 0.3 });
  }

  private setStation(id: StationId, immediate = false) {
    this.station = id;
    const def = STATIONS[id];
    this.world.playerStation = def;
    this.rig.position.copy(def.pivot);
    this.gunPivot.clear();
    // rig-local interiors (turrets, tail) rotate with the guns; the waist interior is fixed to the airframe
    for (const k of ['top', 'ball', 'tail'] as StationId[]) {
      const o = this.interiors[k];
      if (o) o.removeFromParent();
    }
    if (this.waistInterior) this.waistInterior.visible = def.type === 'waist';
    const guns = this.guns[id]!;
    for (const g of guns) this.gunPivot.add(g.group);
    if (def.type === 'turret') this.gunPivot.add(this.interiors[id]!);
    if (def.type === 'tail') this.gunPivot.add(this.interiors.tail!);
    const s = this.states.get(id)!;
    if (immediate) { s.yaw = s.tYaw = 0; s.pitch = s.tPitch = 0; }
    this.applyModelVisibility(id);
    this.onSwitch?.(def);
  }

  // Hide parts of the player's own B-17 that would sit inside the first-person view
  private applyModelVisibility(id: StationId | null) {
    const m = this.bomber?.model;
    if (!m) return;
    const hide: Record<string, boolean> = {
      interior: id !== null,
      glass: id !== null,
      crew: id === 'tail',
      gun_waist_left: id === 'waistL',
      gun_waist_right: id === 'waistR',
      turret_top: id === 'top',
      turret_ball: id === 'ball',
      gun_tail: id === 'tail',
    };
    m.traverse((o) => { if (o.name in hide) o.visible = !hide[o.name]; });
  }

  get state() { return this.states.get(this.station)!; }
  get def() { return STATIONS[this.station]; }

  resetAmmo() {
    for (const s of this.states.values()) { s.ammo = s.maxAmmo; s.heat = 0; s.overheated = false; s.reload = 0; }
  }

  update(dt: number) {
    if (!this.bomber) return;
    const inp = this.input;
    const s = this.state;
    const def = s.def;

    // Station switching
    if (this.transition > 0) {
      const before = this.transition;
      this.transition -= dt;
      if (before > 0.45 && this.transition <= 0.45 && this.pendingStation) { this.setStation(this.pendingStation); this.pendingStation = null; }
      if (this.transition < 0) this.transition = 0;
    }
    for (const id of Object.keys(STATIONS) as StationId[]) if (inp.hit('Digit' + STATIONS[id].key)) this.requestStation(id);

    // Aim: mouse moves the target; the gun follows on a damped spring (heavy mount)
    const sens = 0.0018 * inp.sensitivity * (this.zoom ? 0.55 : 1);
    const push = inp.edgePush();
    const mdx = inp.mouseDX + push.x * 900 * dt, mdy = inp.mouseDY + push.y * 700 * dt;
    s.tYaw -= mdx * sens;
    s.tPitch -= mdy * sens * (inp.invertY ? -1 : 1);
    if (def.yaw[1] - def.yaw[0] < Math.PI * 1.99) s.tYaw = THREE.MathUtils.clamp(s.tYaw, def.yaw[0], def.yaw[1]);
    else s.tYaw = wrapAngle(s.tYaw);
    s.tPitch = THREE.MathUtils.clamp(s.tPitch, def.pitch[0] - def.rest.pitch, def.pitch[1] - def.rest.pitch);
    const k = def.type === 'waist' ? 190 : 260, damp = def.type === 'waist' ? 22 : 28;
    let dy = s.tYaw - s.yaw;
    if (def.yaw[1] - def.yaw[0] >= Math.PI * 1.99) dy = wrapAngle(dy);
    s.vYaw += (dy * k - s.vYaw * damp) * dt;
    s.vPitch += ((s.tPitch - s.pitch) * k - s.vPitch * damp) * dt;
    s.yaw += s.vYaw * dt;
    s.pitch += s.vPitch * dt;

    // Zoom (squint down the sight)
    this.zoom = inp.mouse(2);
    const targetFov = this.zoom ? 34 : 62;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 10);

    // Reload
    if (s.reload > 0) {
      s.reload -= dt;
      if (s.reload <= 0) { s.ammo = s.maxAmmo; this.guns[this.station]?.forEach((g) => { if (g.belt) { g.belt.visibleRounds = 999; g.belt.update(); } }); }
    } else if (inp.hit('KeyR') && s.ammo < s.maxAmmo) {
      s.reload = def.type === 'waist' ? 4.5 : 6;
      sound.play('click', null, { gain: 0.5, rate: 0.7 });
    }

    // Fire
    this.cooldown -= dt;
    s.heat = Math.max(0, s.heat - dt * (s.overheated ? 0.22 : 0.16));
    if (s.overheated && s.heat < 0.45) s.overheated = false;
    const wantFire = inp.mouse(0) && this.transition <= 0 && s.reload <= 0 && !s.overheated && s.ammo > 0 && this.bomber.alive;
    this.firing = wantFire;
    const guns = this.guns[this.station]!;
    const rate = def.twin ? 13 * 2 : 13;
    if (wantFire) {
      while (this.cooldown <= 0) {
        this.cooldown += 1 / rate;
        const g = guns[this.shotCount % guns.length];
        this.fireRound(g, def);
        this.shotCount++;
        s.ammo--;
        s.heat += def.twin ? 0.0075 : 0.011;
        if (s.heat >= 1) { s.overheated = true; this.world.callout('hot', 'Pilot', 'Short bursts! You\'ll burn out that barrel!', 15); }
        if (s.ammo <= 0) break;
      }
    } else if (this.cooldown < 0) this.cooldown = 0;
    if (s.ammo === 0 && inp.mouseHit(0)) sound.play('click', null, { gain: 0.6 });

    // Recoil animation & lights
    this.recoilT = Math.max(0, this.recoilT - dt * 14);
    this.shake = Math.max(0, this.shake - dt * 6);
    for (const g of guns) for (const r of g.recoil) r.position.z = -this.recoilT * 0.022;
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 120);

    // Apply gun orientation
    const yaw = def.rest.yaw + s.yaw, pitch = def.rest.pitch + s.pitch;
    this.gunPivot.rotation.set(0, 0, 0);
    this.gunPivot.quaternion.setFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ'));

    this.updateCasings(dt);
    this.updateCamera(dt);
    this.world.playerAimDir.copy(this.aimDirection());
  }

  private fireRound(g: GunModel, def: StationDef) {
    const b = this.bomber!;
    const muzzle = g.muzzles[0].getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(g.muzzles[0].getWorldQuaternion(_q));
    const spread = 0.0022;
    dir.x += R() * spread; dir.y += R() * spread; dir.z += R() * spread;
    dir.normalize();
    const vel = dir.clone().multiplyScalar(870).add(b.vel);
    const tracer = this.shotCount % 3 === 0;
    this.world.ballistics.fire(muzzle, vel, 'allied', 12, tracer, [10, 2.6, 0.9], b, false, true);
    this.world.stats.shots++;
    if (this.shotCount % 2 === 0) this.world.effects.playerMuzzle(muzzle, dir, b.vel);
    if (this.shotCount % 2 === 0) this.world.effects.gunSmoke(muzzle, b.vel.clone().multiplyScalar(0.9));
    this.muzzleLight.position.copy(muzzle).addScaledVector(dir, -0.4);
    this.muzzleLight.intensity = 3 + Math.random() * 2;
    this.recoilT = 1;
    this.shake = Math.min(1, this.shake + 0.35);
    // Recoil kick disturbs aim (gunner fights it)
    const s = this.state;
    s.vYaw += R() * 0.09;
    s.vPitch += 0.05 + Math.random() * 0.07;
    sound.playerGun(def.twin);
    g.belt?.advance(1);
    if (g.belt && s.ammo < 60) { g.belt.visibleRounds = Math.max(0, Math.floor(s.ammo * 0.8)); }
    this.ejectCasing(g);
  }

  private ejectCasing(g: GunModel) {
    if (this.casings.length > 50) { const c = this.casings.shift()!; c.m.removeFromParent(); }
    const m = new THREE.Mesh(this.casingGeo, this.casingMat);
    const p = g.ejectPort.getWorldPosition(new THREE.Vector3());
    this.bomber!.root.worldToLocal(p);
    m.position.copy(p);
    m.castShadow = true;
    this.bomber!.root.add(m);
    const v = new THREE.Vector3(R() * 0.4, -1.2 - Math.random(), R() * 0.4);
    this.casings.push({ m, v, life: 1.2 });
  }

  private updateCasings(dt: number) {
    const floorY = -0.85;
    for (const c of this.casings) {
      c.life -= dt;
      c.v.y -= 9.81 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += 15 * dt; c.m.rotation.z += 9 * dt;
      if (c.m.position.y < floorY) { c.m.position.y = floorY; c.v.y *= -0.3; c.v.x *= 0.5; c.v.z *= 0.5; if (Math.random() < 0.2) sound.play('casing', null, { gain: 0.05 }); }
    }
    this.casings = this.casings.filter((c) => { if (c.life <= 0) c.m.removeFromParent(); return c.life > 0; });
  }

  private updateCamera(dt: number) {
    const cam = this.engine.camera;
    const def = this.def;
    const guns = this.guns[this.station]!;
    // eye: behind the sight (waist/tail) or centred in the turret between the guns
    const eye = def.type === 'turret' ? new THREE.Vector3(0, 0.05, -0.05) : guns[0].eye.clone();
    if (def.type === 'tail') eye.set(0, 0.242, -0.2);
    // buffeting and gun shake
    const t = this.world.time;
    const buffet = 0.0025;
    eye.x += Math.sin(t * 13.1) * buffet * 0.5 + R() * this.shake * 0.004;
    eye.y += Math.sin(t * 17.3) * buffet * 0.4 + R() * this.shake * 0.004;
    eye.z += -this.recoilT * 0.012;
    const worldEye = this.gunPivot.localToWorld(eye);
    cam.position.copy(worldEye);
    if (cam.parent !== this.engine.scene) this.engine.scene.add(cam);
    const q = this.gunPivot.getWorldQuaternion(new THREE.Quaternion());
    // camera looks down -Z; gun forward is +Z
    cam.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    if (this.shake > 0) cam.rotateZ(R() * this.shake * 0.003);
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
    this.engine.post.nearFocus = def.type === 'waist' ? 0.42 : def.type === 'tail' ? 0.5 : 0.4;
    this.engine.post.dofStrength = 1;
    this.engine.post.noBlurDist = 1.4;
  }

  aimDirection(out = new THREE.Vector3()) {
    return out.set(0, 0, 1).applyQuaternion(this.gunPivot.getWorldQuaternion(_q));
  }
}

export { dirFromYawPitch };

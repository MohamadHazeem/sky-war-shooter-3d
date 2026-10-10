import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { Engine } from '../core/Engine';
import { World } from '../world/World';
import { Bomber } from '../world/Aircraft';
import { dirFromYawPitch, STATIONS, StationDef, StationId, wrapAngle, STATION_ORDER, inArc } from '../world/B17Layout';
import { buildM2, buildTailInterior, buildTurret, buildWaistInterior, GunModel } from './Viewmodels';
import { Loadout, Progression } from './Upgrades';
import type { Fighter } from '../world/Aircraft';
import { sound } from '../audio/Sound';
import { bulletHoleTexture } from '../render/Textures';
import { Atmos } from '../render/Atmosphere';
import { DustMotes } from './DustMotes';
import { KeyAim, KEY_AIM_RATE } from './KeyAim';
import { crewSeatLoadout } from './CrewRoster';

interface StationState {
  def: StationDef;
  yaw: number; pitch: number;       // current (relative to rest)
  tYaw: number; tPitch: number;     // target
  vYaw: number; vPitch: number;
  ammo: number; maxAmmo: number; baseAmmo: number;
  heat: number; overheated: boolean;
  reload: number;
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const R = () => Math.random() * 2 - 1;

// First-person B-17 gunner: heavy, sprung gun traverse, recoil, barrel heat, belts.

const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
export class GunnerController {
  station: StationId = 'waistL';
  private states = new Map<StationId, StationState>();
  private rig = new THREE.Group();        // attached to the bomber, at the pivot
  private gunPivot = new THREE.Group();   // rotates yaw/pitch
  private interiors: Partial<Record<StationId, THREE.Object3D>> = {};
  private guns: Partial<Record<StationId, GunModel[]>> = {};
  private waistInterior: THREE.Group | null = null;
  private dust: DustMotes | null = null;
  private sunLocal = new THREE.Vector3();
  private muzzleLight = new THREE.PointLight(0xffb060, 0, 6, 2);
  private cooldown = 0;
  private shotCount = 0;
  private recoilT = 0;
  private shake = 0;
  private beltTickT = 0; // time until the next low-ammo belt tick
  zoom = false;
  fov = 62;
  assist = 1;    // aim assist strength 0..1 (Settings)
  rateBoost = 1; // Berserker perk
  assistTarget: Fighter | null = null;
  private assistYaw = 0;
  private assistPitch = 0;
  ads = 0;       // 0 = over-the-gun view, 1 = eye down the ring sight (RMB)
  hipWaist = new THREE.Vector3(0, 0.14, 0.7);  // head offset in the unzoomed view (gun frame)
  baseFov = 62;   // set from Settings; zoom-in keeps the original 34/62 magnification ratio
  bomber: Bomber | null = null;
  private casings: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  private burstT = 0;        // seconds the trigger has been held continuously
  private clatterClock = 0;  // time until the next spent-brass tinkle on the floor
  private casingGeo = new THREE.CylinderGeometry(0.0105, 0.0105, 0.099, 8);
  private casingMat = new THREE.MeshStandardMaterial({ color: 0xc48a3c, roughness: 0.3, metalness: 1 });
  firing = false;
  private holes: THREE.Object3D[] = [];
  private holeMat: THREE.MeshBasicMaterial | null = null;
  private beamMat: THREE.ShaderMaterial | null = null;
  onSwitch?: (st: StationDef) => void;
  onNotice?: (text: string) => void;
  loadout: Loadout = new Progression().loadout(); // upgrades + perks (set by Game)
  transition = 0; // >0 while crawling to another station (screen fades)
  private pendingStation: StationId | null = null;
  private keyAim = new KeyAim();

  constructor(private engine: Engine, private world: World, private input: Input) {
    for (const id of Object.keys(STATIONS) as StationId[]) {
      const def = STATIONS[id];
      const max = def.type === 'waist' ? 600 : def.id === 'top' ? 750 : 1000;
      this.states.set(id, { def, yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, vYaw: 0, vPitch: 0, ammo: max, maxAmmo: max, baseAmmo: max, heat: 0, overheated: false, reload: 0 });
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
    // sunlit dust specks in the waist section, hidden with the interior
    this.dust?.dispose();
    this.dust = new DustMotes(new THREE.Vector3(0, STATIONS.waistL.pivot.y, (wl.z + wr.z) / 2), wl.z, wr.z);
    this.waistInterior.add(this.dust.points);
    this.interiors.waistL = this.waistInterior;
    this.interiors.waistR = this.waistInterior;
    this.guns.waistL = [buildM2({ ringSight: true, belt: true, beltSide: 1 })];
    this.guns.waistR = [buildM2({ ringSight: true, belt: true, beltSide: -1 })];
    const top = buildTurret('top');
    top.sight.visible = false; // the eye sits above it now; the HUD reticle takes over
    this.guns.top = top.guns;
    this.interiors.top = top.group;
    const ball = buildTurret('ball');
    this.guns.ball = ball.guns;
    this.interiors.ball = ball.group;
    const tail = buildTailInterior();
    this.interiors.tail = tail;
    const tg: GunModel[] = [];
    {
      const m = buildM2({ ringSight: false, belt: true, beltSide: 1 });
      m.group.position.set(0, -0.04, 0);
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
    this.burstT = 0;
    this.clatterClock = 0;
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

  // Upgrades/perks changed (belts are unlimited: ammo stays topped up)
  applyLoadout(l: Loadout, _refill = false) {
    this.loadout = crewSeatLoadout(l, () => this.station); // + the seat bonus of the crewman at the gun
    for (const s of this.states.values()) s.ammo = s.maxAmmo;
  }

  // Crew Chief perk: a kill cools the barrel
  coolBarrel() {
    const s = this.state;
    s.heat = Math.max(0, s.heat - 0.4); s.overheated = false;
  }

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
    const lock = this.findAssistTarget(def);
    // aim friction: the mouse slows down while the sight is on a fighter's lead point
    const sens = 0.0018 * inp.sensitivity * (this.zoom ? 0.55 : 1) * (1 - 0.4 * lock * this.assist);
    const push = inp.edgePush();
    const mdx = inp.mouseDX + push.x * 900 * dt, mdy = inp.mouseDY + push.y * 700 * dt;
    s.tYaw -= mdx * sens;
    s.tPitch -= mdy * sens * (inp.invertY ? -1 : 1);
    // keyboard traverse (arrows / I-J-K-L) moves the same target, slower when sighting
    this.keyAim.update(inp, dt);
    const kr = KEY_AIM_RATE * (this.zoom ? 0.55 : 1) * dt;
    s.tYaw -= this.keyAim.x * kr;
    s.tPitch += this.keyAim.y * kr * (inp.invertY ? -1 : 1);
    // aim magnetism: draw the sight onto the lead point of the fighter nearest the crosshair
    if (lock > 0 && this.assist > 0) {
      const pull = Math.min(1, dt * (2.5 + 5 * lock) * this.assist);
      let ey = this.assistYaw - s.tYaw;
      if (def.yaw[1] - def.yaw[0] >= Math.PI * 1.99) ey = wrapAngle(ey);
      s.tYaw += ey * pull;
      s.tPitch += (this.assistPitch - s.tPitch) * pull;
    }
    if (def.yaw[1] - def.yaw[0] < Math.PI * 1.99) s.tYaw = THREE.MathUtils.clamp(s.tYaw, def.yaw[0], def.yaw[1]);
    else s.tYaw = wrapAngle(s.tYaw);
    s.tPitch = THREE.MathUtils.clamp(s.tPitch, def.pitch[0] - def.rest.pitch, def.pitch[1] - def.rest.pitch);
    const tv = this.loadout.traverse;
    const k = (def.type === 'waist' ? 190 : 260) * tv * tv, damp = (def.type === 'waist' ? 22 : 28) * tv;
    let dy = s.tYaw - s.yaw;
    if (def.yaw[1] - def.yaw[0] >= Math.PI * 1.99) dy = wrapAngle(dy);
    s.vYaw += (dy * k - s.vYaw * damp) * dt;
    s.vPitch += ((s.tPitch - s.pitch) * k - s.vPitch * damp) * dt;
    s.yaw += s.vYaw * dt;
    s.pitch += s.vPitch * dt;

    // Zoom (squint down the sight)
    this.zoom = inp.mouse(2);
    const targetFov = this.zoom ? this.baseFov * (34 / 62) : this.baseFov;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 10);

    // Reload
    if (s.reload > 0) {
      s.reload -= dt;
      if (s.reload <= 0) { s.ammo = s.maxAmmo; this.guns[this.station]?.forEach((g) => { if (g.belt) { g.belt.visibleRounds = 999; g.belt.update(); } }); }
    } else if ((inp.hit('KeyR') && s.ammo < s.maxAmmo) || s.ammo <= 0) {
      if (s.ammo <= 0) this.onNotice?.('RELOADING — new ammunition box');
      s.reload = def.type === 'waist' ? 4.5 : 6;
      sound.play('click', null, { gain: 0.5, rate: 0.7 });
    }

    // Fire
    this.cooldown -= dt;
    s.heat = Math.max(0, s.heat - dt * (s.overheated ? 0.22 : 0.16));
    if (s.overheated && s.heat < 0.45) s.overheated = false;
    const wantFire = (inp.mouse(0) || inp.down('Space')) && this.transition <= 0 && s.reload <= 0 && !s.overheated && s.ammo > 0 && this.bomber.alive;
    this.firing = wantFire;
    this.brassClatter(dt, wantFire);
    // Low belt warning: a metallic tick every 0.6 s while firing with under 60 rounds left
    if (wantFire && s.ammo < 60) {
      this.beltTickT -= dt;
      if (this.beltTickT <= 0) { this.beltTickT = 0.6; sound.play('beltTick', null, { gain: 0.55, reverb: 0.4 }); }
    } else this.beltTickT = 0;
    const guns = this.guns[this.station]!;
    const W = this.loadout.weapon;
    const rate = W.rate * this.loadout.rate * this.rateBoost;
    if (wantFire) {
      while (this.cooldown <= 0) {
        this.cooldown += 1 / rate;
        const g = guns[this.shotCount % guns.length];
        this.fireRound(g, def);
        this.shotCount++;
        // unlimited belts: the counter never runs down
        s.heat += W.heat * this.loadout.heat;
        if (s.heat >= 1) { s.overheated = true; this.onNotice?.('BARREL OVERHEATED — let it cool'); this.world.callout('hot', 'Pilot', 'Short bursts! You\'ll burn out that barrel!', 15); }
        if (s.ammo <= 0) break;
      }
    } else if (this.cooldown < 0) this.cooldown = 0;
    if (s.ammo === 0 && (inp.mouseHit(0) || inp.hit('Space'))) sound.play('click', null, { gain: 0.6 });

    // Recoil animation & lights
    this.recoilT = Math.max(0, this.recoilT - dt * 14);
    this.shake = Math.max(0, this.shake - dt * 6);
    for (const g of guns) for (const r of g.recoil) r.position.z = -this.recoilT * 0.022;
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 120);

    // Apply gun orientation
    const yaw = def.rest.yaw + s.yaw, pitch = def.rest.pitch + s.pitch;
    this.gunPivot.rotation.set(0, 0, 0);
    this.gunPivot.quaternion.setFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ'));

    for (const g of guns) g.belt?.tick(dt);
    this.updateCasings(dt);
    // dust motes only matter while the waist interior is on screen
    if (this.dust && this.waistInterior?.visible) {
      this.sunLocal.copy(Atmos.sunDir).applyQuaternion(this.bomber.root.getWorldQuaternion(_q).invert());
      this.dust.update(dt, this.sunLocal, this.engine.renderer.domElement.height);
    }
    this.updateCamera(dt);
    this.world.playerAimDir.copy(this.aimDirection());
  }

  // Aim assist: the enemy whose lead point is closest to where the gun is laid, inside a
  // cone (wider when unzoomed). Returns 0..1 lock strength and stores the lead angles.
  private findAssistTarget(def: StationDef): number {
    this.assistTarget = null;
    const b = this.bomber;
    if (!b || this.assist <= 0) return 0;
    const s = this.state;
    const cone = (this.zoom ? 0.07 : 0.12) * (0.6 + 0.4 * this.assist);
    const pivot = b.localToWorld(_pa.copy(def.pivot));
    let best = cone;
    for (const f of this.world.fighters('axis')) {
      if (!f.alive) continue;
      const d = f.pos.distanceTo(pivot);
      if (d > 1400) continue;
      const tof = d / (this.loadout.weapon.velocity * this.loadout.velocity);
      _pb.copy(f.vel).sub(b.vel).multiplyScalar(tof).add(f.pos);
      _pb.y += 0.5 * 9.81 * tof * tof;
      const local = b.worldToLocal(_pb).sub(def.pivot);
      const yaw = Math.atan2(local.x, local.z) - def.rest.yaw;
      const pitch = Math.asin(THREE.MathUtils.clamp(local.y / local.length(), -1, 1)) - def.rest.pitch;
      const ang = Math.hypot(wrapAngle(yaw - s.tYaw) * Math.cos(def.rest.pitch + s.tPitch), pitch - s.tPitch);
      if (ang < best) { best = ang; this.assistTarget = f; this.assistYaw = s.tYaw + wrapAngle(yaw - s.tYaw); this.assistPitch = pitch; }
    }
    return this.assistTarget ? 1 - best / cone : 0;
  }

  // Seat finder: enemy fighters inside each gun position's field of fire (within 1.3 km)
  threatsByStation(out: Partial<Record<StationId, number>> = {}) {
    const b = this.bomber;
    for (const id of STATION_ORDER) out[id] = 0;
    if (!b) return out;
    for (const f of this.world.fighters('axis')) {
      if (!f.alive || f.pos.distanceTo(b.pos) > 1300) continue;
      for (const id of STATION_ORDER) {
        const def = STATIONS[id];
        if (inArc(def, b.worldToLocal(_pa.copy(f.pos)).sub(def.pivot))) out[id]!++;
      }
    }
    return out;
  }

  private fireRound(g: GunModel, def: StationDef) {
    const b = this.bomber!;
    const muzzle = g.muzzles[0].getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(g.muzzles[0].getWorldQuaternion(_q));
    const W = this.loadout.weapon;
    const spread = W.spread * this.loadout.spread;
    dir.x += R() * spread; dir.y += R() * spread; dir.z += R() * spread;
    dir.normalize();
    const vel = dir.clone().multiplyScalar(W.velocity * this.loadout.velocity).add(b.vel);
    const tracer = this.shotCount % W.tracerEvery === 0;
    this.world.ballistics.fire(muzzle, vel, 'allied', W.damage * this.loadout.damage, tracer, W.tracer, b, !!W.cannon, true);
    this.world.stats.shots++;
    if (this.shotCount % 2 === 0) this.world.effects.playerMuzzle(muzzle, dir, b.vel);
    if (this.shotCount % 2 === 0) this.world.effects.gunSmoke(muzzle, b.vel.clone().multiplyScalar(0.9));
    this.muzzleLight.position.copy(muzzle).addScaledVector(dir, -0.4);
    this.muzzleLight.intensity = 3 + Math.random() * 2;
    this.recoilT = 1;
    this.shake = Math.min(1, this.shake + 0.35);
    // Recoil kick disturbs aim (gunner fights it)
    const s = this.state;
    s.vYaw += R() * 0.09 * this.loadout.recoil;
    s.vPitch += (0.05 + Math.random() * 0.07) * this.loadout.recoil;
    sound.playerGun(false, !!W.cannon);
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

  // Long bursts: spent brass rattles across the bomber floor. Tinkles come faster and
  // louder the longer the trigger is held; random pitch and timing keep it from looping.
  private brassClatter(dt: number, firing: boolean) {
    if (!firing) { this.burstT = 0; this.clatterClock = 0; return; }
    if (this.burstT === 0) this.clatterClock = 0.25; // brief lag so the first shots lead in
    this.burstT += dt;
    this.clatterClock -= dt;
    if (this.clatterClock > 0) return;
    const k = Math.min(1, this.burstT / 3); // full clatter after ~3 s of continuous fire
    const rate = 2 + 9 * k; // tinkles per second
    this.clatterClock = (1 / rate) * (0.6 + Math.random() * 0.8);
    sound.play('casing', null, {
      gain: (0.015 + 0.05 * k) * (0.7 + Math.random() * 0.6),
      rate: 0.9 + Math.random() * 0.35,
      reverb: 0.25,
    });
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
    // top turret: head raised in the dome so the ship's own back drops out of the picture
    const eye = def.type === 'turret' ? new THREE.Vector3(0, def.id === 'top' ? 0.32 : 0.05, def.id === 'top' ? -0.12 : -0.05) : guns[0].eye.clone();
    if (def.type === 'tail') eye.set(0, 0.242, -0.2);
    // Unzoomed, the head sits up and forward over the gun so the receiver and window frame
    // drop out of the picture; RMB brings the eye down onto the ring sight.
    this.ads += ((this.zoom ? 1 : 0) - this.ads) * Math.min(1, dt * 9);
    const hip = 1 - this.ads;
    if (def.type === 'waist') {
      eye.addScaledVector(this.hipWaist, hip);
      // the ring would fill the screen from this close: show it only once the eye is on it
      for (const g of guns) for (const o of g.sight) o.visible = this.ads > 0.6;
    }
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

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
import { access } from '../core/Accessibility';
import { heatHaze } from '../render/HeatHaze';
import { crewSeatLoadout } from './CrewRoster';
import { LivingInterior } from './LivingInterior';
import { Brass } from './Brass';
import { TAIL_FLOOR, TAIL_HALF_WIDTH, FREE_LOOK_YAW, FREE_LOOK_UP, stationShafts, disposeStationDetails } from './TurretInteriors';
import { GunnerGlass } from './GlassFx';

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
const _up = new THREE.Vector3(0, 1, 0);
const R = () => Math.random() * 2 - 1;
const OVERDRIVE_TRACER: [number, number, number] = [14, 5.5, 1.6]; // white-hot tracer during Overdrive

// First-person B-17 gunner: heavy, sprung gun traverse, recoil, barrel heat, belts.

const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _mouth = new THREE.Vector3();
const _vent = new THREE.Vector3();
const _ventX = new THREE.Vector3();
const _cq = new THREE.Quaternion();
const _ce = new THREE.Euler();
const _flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const LOOK_YAW = FREE_LOOK_YAW;
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
  private crewLight = new THREE.PointLight(0xffb060, 0, 5, 2);   // the other waist gunner's muzzle flash
  // living interior: the other waist gunner, crew glimpses, brass pile, shafts, frost, breath
  private living: LivingInterior;
  private tailBrass: Brass | null = null;
  private ballShafts = stationShafts('ball');
  private tailShafts = stationShafts('tail');
  private shaftSun = new THREE.Vector3();
  readonly glassFx: GunnerGlass;   // rain, glints, oil, frost and cracks on the turret / tail glass (GlassFx.ts)
  cold = 0.5;      // 0..1 how cold the mission is (frost on the windows; set by Game per mission)
  // free look (hold C): the head turns away from the gun to look around the compartment
  look = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private cooldown = 0;
  private shotCount = 0;
  private recoilT = 0;
  private shake = 0;
  private beltTickT = 0; // time until the next low-ammo belt tick
  zoom = false;
  fov = 62;
  assist = 1;    // aim assist strength 0..1 (Settings)
  rateBoost = 1; // Berserker perk (x1.35 more while the Overdrive ability runs)
  // Abilities (src/game/Abilities.ts): Overdrive = no barrel heat + hot tracers and a glowing
  // barrel (overdrive 0..1 is the visual intensity); Focus = bullet-time, where aimTimeScale
  // (1 / engine.timeScale) keeps the gun traverse and sight responsive in real time.
  heatFree = false;
  noOverheat = false; // skill tree Iron Lungs: at full heat the gun slows to 75% instead of seizing
  overdrive = 0;
  aimTimeScale = 1;
  private odGlow = new Map<GunModel, THREE.Mesh>();
  private odGeo: THREE.CylinderGeometry | null = null;
  private odMat: THREE.MeshBasicMaterial | null = null;
  private odShown = false;
  assistTarget: Fighter | null = null;
  private assistYaw = 0;
  private assistPitch = 0;
  private adsK = 0;
  // 0 = over-the-gun view, 1 = eye down the ring sight (RMB) or turned into the cabin (free look)
  get ads() { return Math.max(this.adsK, this.look); }
  hipWaist = new THREE.Vector3(0, 0.14, 0.7);  // head offset in the unzoomed view (gun frame)
  baseFov = 62;   // set from Settings; zoom-in keeps the original 34/62 magnification ratio
  bomber: Bomber | null = null;
  private burstT = 0;        // seconds the trigger has been held continuously
  private clatterClock = 0;  // time until the next spent-brass tinkle on the floor
  firing = false;
  jammed = false;   // MidRound/RandomEvents: this gun position is jammed (R clears it)
  private holes: THREE.Object3D[] = [];
  private holeMat: THREE.MeshBasicMaterial | null = null;
  private beamMat: THREE.ShaderMaterial | null = null;
  private skyBeamMat: THREE.ShaderMaterial | null = null; // fainter, cooler shafts through holes facing away from the sun
  // shared unit geometries for holes and light shafts (scaled per hole, never disposed)
  private holeGeo = new THREE.PlaneGeometry(1, 1);
  private beamGeo = new THREE.CylinderGeometry(0.16, 1, 1, 10, 1, true);
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
    this.crewLight.userData.noRebase = true;
    engine.scene.add(this.crewLight);
    this.living = new LivingInterior(world, this.crewLight);
    this.glassFx = new GunnerGlass(engine, world);

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
    ball.group.add(this.ballShafts.group);
    const tail = buildTailInterior();
    this.interiors.tail = tail;
    tail.add(this.tailShafts.group);
    const tg: GunModel[] = [];
    for (const side of [-1, 1] as const) {
      const m = buildM2({ ringSight: false, belt: true, beltSide: side, beltPoints: [
        new THREE.Vector3(0, 0.035, -0.02), new THREE.Vector3(side * 0.16, 0.01, -0.23),
        new THREE.Vector3(side * 0.18, -0.04, -0.75), new THREE.Vector3(side * 0.20, -0.04, -1.80),
      ] });
      m.group.position.set(side * 0.18, -0.04, 0);
      tg.push(m);
    }
    // ring-and-post sight on a bracket above the guns, on the gunner's eye line
    const sightGun = buildM2({ ringSight: true, belt: false, beltSide: 1 });
    // only the ring and the bead near the muzzle stay (the receiver's rivets and charging-handle
    // knob are spheres too: they floated in the air across the tail window)
    sightGun.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const type = m.geometry.type;
      if (!(type.startsWith('Torus') || (type === 'SphereGeometry' && m.position.z > 0.9))) o.visible = false;
    });
    sightGun.group.position.set(0, 0.12, 0.25);
    // Sight follows the gun, while the cone, seat and glass stay on the airframe.
    tg[0].group.add(sightGun.group);
    sightGun.group.position.x = 0.18;
    sightGun.group.position.y = 0.16;
    const sightBracket = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.196, 0.018),
      (tail.getObjectByName('tailConeSeatWheelWellAndCables') as THREE.Mesh).material);
    // The shared material is vertex-coloured, so the bracket supplies its colour too.
    sightBracket.geometry.setAttribute('color', new THREE.BufferAttribute(
      new Float32Array(sightBracket.geometry.getAttribute('position').count * 3).fill(0.04), 3));
    sightBracket.position.set(0.18, 0.118, 0.30);
    tg[0].group.add(sightBracket);
    this.tailBrass = new Brass(-1.3, 0.4, TAIL_FLOOR, TAIL_HALF_WIDTH, false);
    tail.add(this.tailBrass.flying, this.tailBrass.pile);
    this.guns.tail = tg;
    this.glassFx.attach(bomber, { top: top.group, ball: ball.group, tail });
    this.living.build(bomber, this.waistInterior, (wl.z + wr.z) / 2, wl.z, wr.z, this.guns.waistL[0], this.guns.waistR[0]);
    this.lookYaw = this.lookPitch = this.look = 0;
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
    this.living.detach();
    for (const id of ['ball', 'tail'] as const) {
      const detail = this.interiors[id]?.getObjectByName(id + 'LivingInterior');
      if (detail) { disposeStationDetails(detail); detail.removeFromParent(); }
    }
    this.ballShafts.group.removeFromParent(); this.tailShafts.group.removeFromParent();
    this.tailBrass?.dispose(); this.tailBrass = null;
    sound.setTurretTraverse(0);
    this.glassFx.detach();
    this.burstT = 0;
    this.clatterClock = 0;
    for (const h of this.holes) h.removeFromParent();
    this.holes = [];
    for (const m of this.odGlow.values()) m.removeFromParent();
    this.odGlow.clear();
    this.odShown = false;
    this.bomber = null;
  }

  // A round passed through the fuselage (bomber-local point and direction): punch
  // entry/exit holes in the waist interior, with daylight and sunbeams through them.
  // Cannon and flak hits tear bigger holes with a spray of splinter holes around them,
  // throw sparks and blow insulation, paint chips and dust through the compartment.
  fuselageHit(local: THREE.Vector3, dir: THREE.Vector3) {
    const wi = this.waistInterior;
    if (!wi || !this.bomber) return;
    const heavy = this.world.bomberDamage.lastHeavy;
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
    const onSkin = (p: THREE.Vector3) => p.z >= z0 && p.z <= z1 && !(Math.abs(p.z - wl.z) < 0.42 && p.y > 0.05 && p.y < 0.72); // no holes in the open windows
    const normal = (p: THREE.Vector3) => new THREE.Vector3(p.x / (a * a), (p.y - yC) / (b * b), 0).normalize();
    let first = true;
    for (const t of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
      const p = o.clone().addScaledVector(d, t);
      if (!onSkin(p)) continue;
      const n = normal(p);
      this.addHole(p, n, sunLocal, heavy ? (first ? 3.2 : 2.2) : 1, heavy || first);
      if (heavy && first) {
        // splinters: a scatter of small holes around the entry
        const th = Math.atan2((p.y - yC) / b, p.x / a);
        for (let k = 0; k < 3 + Math.floor(Math.random() * 3); k++) {
          const tk = th + R() * 0.22;
          const q = new THREE.Vector3(Math.cos(tk) * a, yC + Math.sin(tk) * b, p.z + R() * 0.35);
          if (onSkin(q)) this.addHole(q, normal(q), sunLocal, 0.6 + Math.random() * 0.5, false);
        }
      }
      first = false;
    }
  }

  private addHole(p: THREE.Vector3, n: THREE.Vector3, sunLocal: THREE.Vector3, size = 1, debris = true) {
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
    this.skyBeamMat ??= this.beamMat.clone();
    this.beamMat.uniforms.uCol.value.copy(Atmos.sunColor).multiplyScalar(Atmos.sunIntensity * 0.028);
    this.skyBeamMat.uniforms.uCol.value.setRGB(0.55, 0.66, 0.85).multiplyScalar(0.012 + Atmos.sunIntensity * 0.004);
    const g = new THREE.Group();
    const hole = new THREE.Mesh(this.holeGeo, this.holeMat);
    const hs = (0.045 + Math.random() * 0.03) * size;
    hole.scale.set(hs, hs * (0.8 + Math.random() * 0.45), 1);
    hole.position.copy(p).addScaledVector(n, -0.006);
    hole.lookAt(hole.position.clone().sub(n));
    hole.rotateZ(Math.random() * 6.28);
    g.add(hole);
    const sunward = n.dot(sunLocal) > 0.06;
    // a sunbeam through holes facing the sun; a fainter cool shaft of skylight through the rest
    if (sunward || size >= 1) {
      const len = sunward ? 2.8 : 1.6;
      const beam = new THREE.Mesh(this.beamGeo, sunward ? this.beamMat : this.skyBeamMat);
      const r = 0.075 * Math.sqrt(size) * (sunward ? 1 : 0.8);
      beam.scale.set(r, len, r);
      const into = sunward ? sunLocal : n;
      beam.position.copy(p).addScaledVector(into, -len / 2);
      beam.quaternion.setFromUnitVectors(_up, into);
      g.add(beam);
    }
    wi.add(g);
    this.holes.push(g);
    if (this.holes.length > 48) this.holes.shift()!.removeFromParent();
    if (!debris) return;
    // splinters and dust inside the fuselage; big hits blow debris through the compartment
    const b = this.bomber!;
    const wpos = b.localToWorld(p.clone().addScaledVector(n, -0.05));
    this.world.effects.sparks(wpos, b.vel, size > 2);
    const inward = n.clone().negate().applyQuaternion(b.quat);
    this.world.bomberDamage.interiorDebris(wpos, inward, size > 2 ? 16 : 3);
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
    if (this.waistInterior) this.waistInterior.visible = def.type === 'waist' || id === 'tail';
    const guns = this.guns[id]!;
    for (const g of guns) this.gunPivot.add(g.group);
    if (def.type === 'turret') this.gunPivot.add(this.interiors[id]!);
    if (def.type === 'tail') { this.interiors.tail!.rotation.y = Math.PI; this.rig.add(this.interiors.tail!); }
    this.lookYaw = this.lookPitch = this.look = 0;
    sound.setTurretTraverse(0);
    this.living.setStation(id); // the other waist gun goes to its crewman
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
      crew: id === 'tail' || id === 'waistL' || id === 'waistR', // the interior has its own crew (LivingInterior)
      // at either waist window both external waist guns go: the interior has its own
      gun_waist_left: id === 'waistL' || id === 'waistR',
      gun_waist_right: id === 'waistL' || id === 'waistR',
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
    const adt = dt * this.aimTimeScale; // aim/sight time: real time during bullet-time

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
    let mdx = inp.mouseDX + push.x * 900 * adt, mdy = inp.mouseDY + push.y * 700 * adt;
    // free look (hold C): the mouse turns the head, the gun stays laid where it was
    const looking = inp.down('KeyC') && this.transition <= 0;
    if (looking) {
      const ls = 0.0024 * inp.sensitivity;
      const ly = LOOK_YAW[def.type];
      this.lookYaw = THREE.MathUtils.clamp(this.lookYaw - mdx * ls, -ly, ly);
      this.lookPitch = THREE.MathUtils.clamp(this.lookPitch - mdy * ls * (inp.invertY ? -1 : 1), -1.25, def.id === 'ball' ? FREE_LOOK_UP : 1.15);
      mdx = mdy = 0;
    } else {
      const back = Math.min(1, adt * 7);
      this.lookYaw -= this.lookYaw * back;
      this.lookPitch -= this.lookPitch * back;
    }
    this.look += ((looking ? 1 : 0) - this.look) * Math.min(1, adt * 8);
    s.tYaw -= mdx * sens;
    s.tPitch -= mdy * sens * (inp.invertY ? -1 : 1);
    // keyboard traverse (arrows / I-J-K-L) moves the same target, slower when sighting
    this.keyAim.update(inp, adt);
    const kr = KEY_AIM_RATE * (this.zoom ? 0.55 : 1) * adt;
    if (!looking) { s.tYaw -= this.keyAim.x * kr; s.tPitch += this.keyAim.y * kr * (inp.invertY ? -1 : 1); }
    // aim magnetism: draw the sight onto the lead point of the fighter nearest the crosshair
    if (!looking && lock > 0 && this.assist > 0) {
      const pull = Math.min(1, adt * (2.5 + 5 * lock) * this.assist);
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
    s.vYaw += (dy * k - s.vYaw * damp) * adt;
    s.vPitch += ((s.tPitch - s.pitch) * k - s.vPitch * damp) * adt;
    s.yaw += s.vYaw * adt;
    s.pitch += s.vPitch * adt;

    // Zoom (squint down the sight)
    this.zoom = inp.mouse(2);
    const targetFov = this.zoom ? this.baseFov * (34 / 62) : this.baseFov;
    this.fov += (targetFov - this.fov) * Math.min(1, adt * 10);

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
    const wantFire = (inp.mouse(0) || inp.down('Space')) && !this.jammed && this.transition <= 0 && s.reload <= 0 && !s.overheated && s.ammo > 0 && this.bomber.alive;
    this.firing = wantFire;
    this.brassClatter(dt, wantFire);
    // Low belt warning: a metallic tick every 0.6 s while firing with under 60 rounds left
    if (wantFire && s.ammo < 60) {
      this.beltTickT -= dt;
      if (this.beltTickT <= 0) { this.beltTickT = 0.6; sound.play('beltTick', null, { gain: 0.55, reverb: 0.4 }); }
    } else this.beltTickT = 0;
    const guns = this.guns[this.station]!;
    const W = this.loadout.weapon;
    const rate = W.rate * this.loadout.rate * this.rateBoost * (this.noOverheat && s.heat > 0.97 ? 0.75 : 1);
    if (wantFire) {
      while (this.cooldown <= 0) {
        this.cooldown += 1 / rate;
        const g = guns[this.shotCount % guns.length];
        this.fireRound(g, def);
        this.shotCount++;
        // unlimited belts: the counter never runs down
        if (!this.heatFree) s.heat += W.heat * this.loadout.heat;
        if (s.heat >= 1 && this.noOverheat) s.heat = 1;
        else if (s.heat >= 1) { s.overheated = true; this.onNotice?.('BARREL OVERHEATED — let it cool'); this.world.callout('hot', 'Pilot', 'Short bursts! You\'ll burn out that barrel!', 15); }
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
    this.gunPivot.quaternion.setFromEuler(_ce.set(-pitch, yaw, 0, 'YXZ'));

    sound.setTurretTraverse(def.id === 'ball' ? Math.hypot(s.vYaw, s.vPitch) : 0);
    this.tailBrass?.update(dt);
    for (const g of guns) g.belt?.tick(dt);
    this.updateOverdriveFx(guns);
    // dust motes only matter while the waist interior is on screen
    if (this.dust && this.waistInterior?.visible) {
      this.sunLocal.copy(Atmos.sunDir).applyQuaternion(this.bomber.root.getWorldQuaternion(_q).invert());
      this.dust.update(dt, this.sunLocal, this.engine.renderer.domElement.height);
    }
    this.updateCamera(adt);
    this.world.playerAimDir.copy(this.aimDirection());
    this.updateLiving(dt);
    this.glassFx.update(dt, this.station, this.adsK, this.cold);
    if (this.station === 'ball' || this.station === 'tail') {
      this.interiors[this.station]!.getWorldQuaternion(_q).invert();
      this.shaftSun.copy(Atmos.sunDir).applyQuaternion(_q);
      (this.station === 'ball' ? this.ballShafts : this.tailShafts).update(this.shaftSun);
    }
  }

  // Living interior: crew, brass, sun shafts, frost and the gunner's own breath
  private updateLiving(dt: number) {
    const b = this.bomber!;
    if (!(this.dust && this.waistInterior?.visible)) this.sunLocal.copy(Atmos.sunDir).applyQuaternion(b.root.getWorldQuaternion(_q).invert());
    // mask exhaust: just below and ahead of the eye, venting down and forward (gun frame)
    const eye = this.eyeLocal;
    _mouth.set(eye.x, eye.y - 0.07, eye.z - 0.02).applyQuaternion(this.gunPivot.quaternion).add(this.rig.position);
    // the A-14's exhalation valves vent forward and a little to either side of the chin; the warm
    // breath drifts up past the receiver into the bottom of the sight picture
    _vent.set(0, 0.12, 1).applyQuaternion(this.gunPivot.quaternion);
    _ventX.set(0.3, 0, 0).applyQuaternion(this.gunPivot.quaternion);
    const effort = Math.min(1, this.burstT * 0.5 + this.shake);
    // Closed stations vent down and sideways: a faint edge puff, below the sight.
    if (this.def.type !== 'waist') {
      _mouth.y -= 0.10;
      _vent.set(0, -0.55, 0.65).applyQuaternion(this.gunPivot.quaternion);
      _ventX.set(0.5, 0, 0).applyQuaternion(this.gunPivot.quaternion);
    }
    const eyeIn = this.def.type === 'waist' ? this.ads : this.ads * 0.45;
    this.living.update(dt, this.station, this.sunLocal, eyeIn, this.cold, _mouth, _vent, _ventX, 0.27 + 0.28 * effort, this.engine.renderer.domElement.height);
  }

  // Overdrive: a red-hot glow along the exposed barrel (and through the cooling-jacket holes),
  // flickering with the rate of fire. Meshes are made once per gun and only toggled after.
  private updateOverdriveFx(guns: GunModel[]) {
    const k = this.overdrive;
    if (k <= 0 && !this.odShown) return;
    this.odShown = k > 0;
    if (k > 0 && !this.odMat) {
      this.odGeo = new THREE.CylinderGeometry(0.0175, 0.0175, 0.62, 12, 1, true).rotateX(Math.PI / 2);
      this.odMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.7, 0.18), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    }
    if (this.odMat) this.odMat.opacity = k * (this.firing ? 0.55 + 0.15 * Math.sin(this.world.time * 47) : 0.4);
    this.muzzleLight.color.setHex(k > 0 ? 0xff7a2c : 0xffb060);
    for (const g of guns) {
      let m = this.odGlow.get(g);
      if (!m && k > 0 && this.odGeo && this.odMat) {
        const muzzle = g.muzzles[0];
        m = new THREE.Mesh(this.odGeo, this.odMat);
        m.position.copy(muzzle.position).z -= 0.43;
        muzzle.parent?.add(m);
        this.odGlow.set(g, m);
      }
      if (m) m.visible = k > 0;
    }
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
    const od = this.overdrive > 0;
    const tracer = this.shotCount % (od ? 2 : W.tracerEvery) === 0;
    this.world.ballistics.fire(muzzle, vel, 'allied', W.damage * this.loadout.damage, tracer, od ? OVERDRIVE_TRACER : W.tracer, b, !!W.cannon, true);
    this.world.stats.shots++;
    if (this.shotCount % 2 === 0) this.world.effects.playerMuzzle(muzzle, dir, b.vel);
    if (this.shotCount % 2 === 0) heatHaze.emit(muzzle, 0.3, 1, 0.16, 'shimmer', dir);   // muzzle blast shimmer (HeatHaze.ts)
    if (this.shotCount % 2 === 0) this.world.effects.gunSmoke(muzzle, b.vel.clone().multiplyScalar(0.9));
    this.muzzleLight.position.copy(muzzle).addScaledVector(dir, -0.75); // at the window: the flash lights the compartment
    this.muzzleLight.intensity = 3 + Math.random() * 2;
    this.recoilT = 1;
    this.shake = Math.min(1, this.shake + 0.35);
    // Recoil kick disturbs aim (gunner fights it)
    const s = this.state;
    s.vYaw += R() * 0.09 * this.loadout.recoil;
    s.vPitch += (0.05 + Math.random() * 0.07) * this.loadout.recoil;
    sound.playerGun(this.station === 'ball' || this.station === 'tail', !!W.cannon, this.station === 'ball');
    g.belt?.advance(1);
    if (g.belt && s.ammo < 60) { g.belt.visibleRounds = Math.max(0, Math.floor(s.ammo * 0.8)); }
    this.ejectCasing(g);
  }

  private ejectCasing(g: GunModel) {
    const br = this.station === 'tail' ? this.tailBrass : this.living.brass;
    if (!br || !this.bomber) return;
    g.ejectPort.getWorldPosition(_pa);
    if (this.station === 'tail') this.interiors.tail!.worldToLocal(_pa);
    else this.bomber.root.worldToLocal(_pa);
    br.eject(_pa, _pb.set(R() * 0.4, -1.2 - Math.random(), R() * 0.4), this.def.type === 'waist' || this.station === 'tail');
  }

  // Long bursts: spent brass rattles across the bomber floor. Tinkles come faster and
  // louder the longer the trigger is held; random pitch and timing keep it from looping.
  private brassClatter(dt: number, firing: boolean) {
    if (!firing || this.station === 'ball') { this.burstT = 0; this.clatterClock = 0; return; }
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

  private eyeLocal = new THREE.Vector3(); // eye in the gun frame (before shake), for the breath

  private updateCamera(dt: number) {
    const cam = this.engine.camera;
    const def = this.def;
    const guns = this.guns[this.station]!;
    // eye: behind the sight (waist/tail) or centred in the turret between the guns
    // top turret: head raised in the dome so the ship's own back drops out of the picture
    const eye = _eye;
    if (def.type === 'turret') eye.set(0, def.id === 'top' ? 0.32 : 0.05, def.id === 'top' ? -0.12 : -0.05);
    else if (def.type === 'tail') eye.set(0, 0.242, -0.2);
    else eye.copy(guns[0].eye);
    // Unzoomed, the head sits up and forward over the gun so the receiver and window frame
    // drop out of the picture; RMB brings the eye down onto the ring sight. Free look (C)
    // brings the head back inside too, standing a little taller behind the gun.
    this.adsK += ((this.zoom ? 1 : 0) - this.adsK) * Math.min(1, dt * 9);
    const eyeIn = this.ads;
    if (def.type === 'waist') {
      eye.addScaledVector(this.hipWaist, 1 - eyeIn);
      eye.y += 0.05 * this.look * (1 - this.adsK);
      // the ring would fill the screen from this close: show it only once the eye is on it
      for (const g of guns) for (const o of g.sight) o.visible = eyeIn > 0.6;
    }
    this.eyeLocal.copy(eye);
    // buffeting and gun shake
    const t = this.world.time;
    const buffet = 0.0025;
    const shake = this.shake * access.shake;  // 'reduce screen shake' setting
    eye.x += Math.sin(t * 13.1) * buffet * 0.5 + R() * shake * 0.004;
    eye.y += Math.sin(t * 17.3) * buffet * 0.4 + R() * shake * 0.004;
    eye.z += -this.recoilT * 0.012;
    // airframe vibration from dead / windmilling engines and a shot-up tail (smooth, no jitter)
    const bz = this.world.bomberDamage.buzz;
    if (bz > 0) {
      eye.x += (Math.sin(t * 71.3) * 0.7 + Math.sin(t * 19.1 + 0.4) * 0.3) * 0.0016 * bz;
      eye.y += (Math.sin(t * 83.9 + 1.3) * 0.7 + Math.sin(t * 23.7) * 0.3) * 0.0019 * bz;
    }
    const worldEye = this.gunPivot.localToWorld(eye);
    cam.position.copy(worldEye);
    if (cam.parent !== this.engine.scene) this.engine.scene.add(cam);
    // camera looks down -Z; gun forward is +Z. Free look turns the head about the airframe's
    // vertical, so the horizon stays level while looking down the fuselage.
    if (this.look > 0.001 || Math.abs(this.lookYaw) > 1e-4 || Math.abs(this.lookPitch) > 1e-4) {
      const s = this.state;
      const pitch = THREE.MathUtils.clamp(def.rest.pitch + s.pitch + this.lookPitch, -1.35, 1.35);
      _ce.set(-pitch, def.rest.yaw + s.yaw + this.lookYaw, 0, 'YXZ');
      this.bomber!.root.getWorldQuaternion(_cq);
      cam.quaternion.copy(_cq).multiply(_q.setFromEuler(_ce)).multiply(_flip);
    } else {
      this.gunPivot.getWorldQuaternion(_cq);
      cam.quaternion.copy(_cq).multiply(_flip);
    }
    if (shake > 0) cam.rotateZ(R() * shake * 0.003);
    if (bz > 0) { cam.rotateZ(Math.sin(t * 57.1) * 0.0012 * bz * access.shake); cam.rotateX(Math.sin(t * 63.7 + 0.7) * 0.0009 * bz * access.shake); }
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

import * as THREE from 'three';
import type { World } from '../world/World';
import type { Bomber, Fighter } from '../world/Aircraft';
import { STATIONS, StationId, wrapAngle } from '../world/B17Layout';
import type { CrewId } from '../world/Crew';
import { envRef } from '../render/EnvRef';
import { Atmos } from '../render/Atmosphere';
import { GunModel, WAIST_DOOR_TOP, WAIST_DOOR_W, TUNNEL_A, TUNNEL_B, TUNNEL_Y } from './Viewmodels';
import { CrewFigure, FigureLook, lookOf, newPose, lerpPose, Pose, figureMaterial } from './CrewFigure';
import { crewRoster, manDef } from './CrewRoster';
import { Brass, brassGeometry, brassMaterial, linkGeometry, linkMaterial } from './Brass';
import { SunShafts, WindowFrost, BreathFog, shaftMaterial, shaftVolumeMaterial, frostMaterial, breathMaterial } from './InteriorFx';
import { sound } from '../audio/Sound';
import { CrewActor } from './CrewActor';
import { InteriorKit, KIT_FWD_Z } from './InteriorKit';
import { interiorLight } from './InteriorAssets';

// The living B-17 interior around the waist guns (GunnerController owns one):
//  - the other waist gunner, manning his M2 at the opposite window: tracks the target the
//    AI gunner of that station has (World.crewGunner), fires with muzzle flash, light, recoil
//    and brass; slumps when he is wounded, and a rookie takes his gun a little later
//  - glimpses of the rest of the crew: the radio room door forward (operator at his set),
//    the top of the ball turret in the floor turning with its AI aim, and the tail gunner's
//    back at the far end of the tunnel aft
//  - spent brass piling up on the walkway (Brass), sun shafts, frost and breath (InteriorFx)
// Everything sits inside the fuselage, away from the player's own window, so the hip view
// over the gun stays clear. Built once per mission; the per-frame path does not allocate.
// Interior 2.0 (Medium and up, once the Blender assets are in: build(..., high)): the kit of
// InteriorKit (structure, equipment, radio room, bomb bay) replaces the procedural details, and
// the crew are skinned CrewActors playing their clips (idle / fire on the gun, hit and down when
// wounded, a man kneeling to help him, the radio operator sitting at his sets, the tail gunner
// kneeling at his guns) instead of the posed CrewFigures; the sun shafts are ray-marched.

const A = 1.08, B = 1.12, YC = 0.15;
const FLOOR_TOP = YC - B * 0.78 + 0.015;
const R = () => Math.random() * 2 - 1;
const AI_RATE = 12;                       // rounds per second (World.bomberGunners, single gun)
const REPLACE_AFTER = 14;                 // s until a rookie takes a wounded gunner's place
const GRIP = new THREE.Vector3(0.085, -0.02, -0.52);   // spade grips, gun frame
const FIG_BACK = 0.74, FIG_SIDE = 0.1;    // where the gunner stands behind his pivot
const BALL_Y = -1.15;                     // centre of the ball turret's top dome (its top just clears the floor)

type Waist = 'waistL' | 'waistR';
type Man = CrewFigure | CrewActor;
const HELP_FROM = 3.5;                     // s after a man goes down until someone kneels by him
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();

// Materials shared by every mission (programs compile once; warmLivingInterior pre-renders them)
let mats: Record<'dark' | 'metal' | 'wall' | 'wallBack' | 'radioRoom' | 'radio' | 'glow' | 'sky' | 'olive', THREE.Material> | null = null;
function interiorMats() {
  if (mats) return mats;
  const std = (c: number, r: number, m: number, e = 0x000000, ei = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, envMap: envRef.tex, envMapIntensity: 0.08, emissive: e, emissiveIntensity: ei });
  mats = {
    dark: std(0x141410, 0.8, 0.3),
    metal: std(0x2c2f2a, 0.5, 0.6),
    wall: std(0x1d1c15, 0.9, 0.1, 0x2a2014, 0.25),       // dim walls of the radio room / tunnel, faint warm bounce
    wallBack: Object.assign(std(0x1d1c15, 0.9, 0.1, 0x2a2014, 0.25), { side: THREE.BackSide }),
    radioRoom: Object.assign(std(0x2a281e, 0.9, 0.1, 0x3a2812, 0.7), { side: THREE.BackSide }),  // lamp-lit radio room
    radio: std(0x2a2c26, 0.6, 0.4, 0x0c0a06, 0.4),
    olive: std(0x30331f, 0.7, 0.2),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.3, 0.45) }),    // radio dial lamps
    sky: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.05, 1.3) }),     // radio-room roof hatch
  };
  return mats;
}

interface Station {
  id: Waist; crew: CrewId;
  yaw: THREE.Group; pitch: THREE.Group;
  gun: GunModel | null;
  man: Man | null; manLook: string;
  down: Man | null; downT: number; downFrom: THREE.Vector3; downYaw0: number;
  helper: CrewActor | null;
  woundT: number;                  // s since the man at the gun was hit (-1 = fine)
  aimYaw: number; aimPitch: number; vYaw: number; vPitch: number;
  cooldown: number; recoilT: number; shots: number; idle: number;
}

const _camW = new THREE.Vector3();

export class LivingInterior {
  brass: Brass | null = null;
  private bomber: Bomber | null = null;
  private waist: THREE.Group | null = null;
  private statics: THREE.Group | null = null;
  private shafts: SunShafts | null = null;
  private frost: WindowFrost | null = null;
  private breath: BreathFog | null = null;
  private st: Station | null = null;
  private other: Waist | null = null;
  private ballYaw = new THREE.Group();
  private ballPitch = new THREE.Group();
  private radioMan: THREE.Mesh | null = null;
  private tailMan: THREE.Mesh | null = null;
  private tailGlimpse = new THREE.Group();
  private tailBase = new THREE.Vector3();
  private radioBase = new THREE.Vector3();
  private frostT = 0;
  private pose = newPose();
  private aimPose = newPose();
  private slumpPose = newPose();
  private guns: Partial<Record<Waist, GunModel>> = {};
  private airframe: AirframeSwap[] = [];
  private cabinOn = false;
  private high = false;                   // interior 2.0 for this mission
  private kit: InteriorKit | null = null;
  private radioActor: CrewActor | null = null;
  private tailActor: CrewActor | null = null;
  bombsAboard = true;                     // GunnerController: the bomb bay's load (hidden after bombs away)

  // swap the player's airframe to the copy without the structure inside the cabin
  private cabinGeometry(on: boolean) {
    if (on === this.cabinOn) return;
    this.cabinOn = on;
    for (const a of this.airframe) a.mesh.geometry = on ? a.clean : a.orig;
  }

  constructor(private world: World, private flash: THREE.PointLight) {
    const s = this.slumpPose;
    s.hip.set(0, 0.13, 0); s.lean = -0.42; s.roll = 0.22; s.headPitch = 0.95; s.headYaw = 0.45;
    s.handL.set(0.12, 0.42, 0.24); s.handR.set(-0.34, 0.05, 0.12);
    s.footL.set(0.16, 0.06, 0.6); s.footR.set(-0.1, 0.06, 0.48);
  }

  // GunnerController.attach: the waist interior was just built (at the bomber origin)
  build(bomber: Bomber, waist: THREE.Group, zc: number, leftZ: number, rightZ: number, gunL: GunModel, gunR: GunModel, high = false) {
    this.detach();
    this.bomber = bomber;
    this.waist = waist;
    this.high = high && CrewActor.available();
    this.guns = { waistL: gunL, waistR: gunR };
    this.statics ??= this.buildStatics(zc);
    waist.add(this.statics);
    if (this.high) this.kit = new InteriorKit(waist);
    this.shafts ??= new SunShafts(leftZ, rightZ);
    this.shafts.setVolumetric(this.high);
    waist.add(this.shafts.group);
    this.frost ??= new WindowFrost(leftZ, rightZ);
    waist.add(this.frost.group);
    this.frostT = 0;
    this.brass = new Brass(zc - 3.1, zc + 3.1);
    bomber.root.add(this.brass.flying);
    waist.add(this.brass.pile);
    this.breath ??= new BreathFog();
    bomber.root.add(this.breath.points);
    this.dressCrew();
    this.airframe = cabinAirframe(bomber, zc, this.high ? KIT_FWD_Z : undefined);
    this.cabinOn = false;
    // The cut-down airframe is only for an eye inside the cabin: photo mode, kill cam, theatre and
    // other outside cameras take over without this update running, so decide per render from
    // where the camera actually is (Scene.onBeforeRender runs before the scene is culled/sorted).
    this.world.scene.onBeforeRender = (_r, _s, cam) => {
      if (!this.waist) return;
      // eye in bomber space: inside the fuselage section around the waist (the hip view leans
      // ~1 m out of the window, so allow a little beyond the skin)
      const l = bomber.root.worldToLocal(cam.getWorldPosition(_camW));
      const inBall = Math.abs(l.x) < 0.65 && Math.abs(l.y - STATIONS.ball.pivot.y) < 0.65 && Math.abs(l.z - STATIONS.ball.pivot.z) < 0.7;
      this.cabinGeometry(inBall || this.waist.visible && Math.abs(l.x) < 1.9 && Math.abs(l.y) < 2.2 && l.z > STATIONS.tail.pivot.z - 0.35 && l.z < zc + 4.5);
    };
  }

  detach() {
    this.world.scene.onBeforeRender = () => {};
    this.cabinGeometry(false);
    this.airframe = [];
    this.brass?.dispose();
    this.brass = null;
    this.breath?.points.removeFromParent();
    if (this.st) {
      this.st.man?.dispose(); this.st.down?.dispose(); this.st.helper?.dispose();
      this.st.yaw.removeFromParent();
      this.st = null;
    }
    this.radioActor?.dispose(); this.radioActor = null;
    this.tailActor?.dispose(); this.tailActor = null;
    if (this.radioMan) this.radioMan.visible = true;
    if (this.tailMan) this.tailMan.visible = true;
    this.kit?.undo(); this.kit = null;
    this.statics?.removeFromParent();
    this.shafts?.group.removeFromParent();
    this.frost?.group.removeFromParent();
    this.flash.intensity = 0;
    this.other = null;
    this.bomber = null;
    this.waist = null;
  }

  // GunnerController.setStation (after the player's own guns are on his mount): the other
  // waist gun goes to its crewman
  setStation(id: StationId) {
    if (this.tailMan) this.tailMan.visible = id !== 'tail' && !this.tailActor;
    if (this.tailActor) this.tailActor.root.visible = id !== 'tail';
    this.tailGlimpse.visible = id !== 'tail';
    const other: Waist | null = id === 'waistL' ? 'waistR' : id === 'waistR' || id === 'tail' ? 'waistL' : null;
    if (!other || other === this.other || !this.waist) return;
    this.other = other;
    const def = STATIONS[other];
    if (this.st) { this.st.man?.dispose(); this.st.down?.dispose(); this.st.helper?.dispose(); this.st.yaw.removeFromParent(); }
    const yaw = new THREE.Group(), pitch = new THREE.Group();
    yaw.position.copy(def.pivot);
    yaw.add(pitch);
    this.waist.add(yaw);
    const gun = this.guns[other] ?? null;
    if (gun) {
      pitch.add(gun.group);
      for (const o of gun.sight) o.visible = true;
    }
    this.st = {
      id: other, crew: other, yaw, pitch, gun, man: null, manLook: '', down: null, downT: 0, downFrom: new THREE.Vector3(), downYaw0: 0, helper: null,
      woundT: -1, aimYaw: 0, aimPitch: 0, vYaw: 0, vPitch: 0, cooldown: 0, recoilT: 0, shots: 0, idle: Math.random() * 10,
    };
    // a man already hit at that gun is lying beside it, a rookie on the grips
    if (this.world.crew.wounded.has(other)) {
      this.st.down = this.newFigure(this.lookAt(other, false));
      this.layDown(this.st, true);
      this.st.woundT = REPLACE_AFTER;
    }
    this.mount(this.st, this.world.crew.wounded.has(other));
  }

  private lookAt(crew: CrewId, rookie: boolean): FigureLook {
    const id = rookie ? null : crewRoster.occupant(crew);
    return id ? lookOf(manDef(id).look) : lookOf(null, true);
  }

  private newFigure(l: FigureLook): Man { return this.high ? new CrewActor(l) : new CrewFigure(l); }

  // put a (fresh) man on the grips of the station gun
  private mount(s: Station, rookie: boolean) {
    const key = rookie ? 'rookie' : String(crewRoster.occupant(s.crew));
    if (s.man && s.manLook === key) return;
    s.man?.dispose();
    s.man = this.newFigure(this.lookAt(s.crew, rookie));
    s.manLook = key;
    if (s.man instanceof CrewActor) s.man.play('idle', 0, Math.random());
    s.man.root.position.set(STATIONS[s.id].pivot.x > 0 ? -FIG_SIDE : FIG_SIDE, FLOOR_TOP - STATIONS[s.id].pivot.y, -FIG_BACK);
    s.yaw.add(s.man.root);
  }

  // the man at the gun is hit: he goes down beside it (instant = already lying there)
  private layDown(s: Station, instant: boolean) {
    const f = s.down!;
    const side = STATIONS[s.id].pivot.x > 0 ? 1 : -1;
    const wz = STATIONS[s.id].pivot.z;
    if (!instant && f.root.parent) {
      f.root.getWorldPosition(s.downFrom);
      this.waist!.worldToLocal(s.downFrom);
      s.downYaw0 = s.yaw.rotation.y;
    }
    this.waist!.add(f.root);
    if (instant) { s.downT = 1; s.downFrom.set(...downSpot(f, side, wz)); s.downYaw0 = downYaw(f, side); } else s.downT = 0;
    if (f instanceof CrewActor) f.play(instant ? 'down' : 'hit', instant ? 0 : 0.08);
  }

  // Roster looks for the static crew (radio operator, tail gunner): rebuilt each mission
  private dressCrew() {
    const g = this.statics!;
    if (this.high) {
      // interior 2.0: the radio operator at his table and the tail gunner at his guns, playing
      // their clips (low-detail bodies: they are only seen metres away, through doors)
      if (this.radioMan) this.radioMan.visible = false;
      if (this.tailMan) this.tailMan.visible = false;
      const r = new CrewActor(this.lookAt('radio', false), { far: true });
      r.root.position.copy(this.radioBase); r.root.rotation.y = Math.PI / 2;
      r.play('sit', 0, Math.random());
      g.add(r.root);
      this.radioActor = r;
      const t = new CrewActor(this.lookAt('tail', false), { far: true });
      t.root.position.copy(this.tailBase); t.root.position.y -= 0.02; t.root.rotation.y = Math.PI;
      t.play('kneel', 0, Math.random());
      g.add(t.root);
      this.tailActor = t;
      return;
    }
    this.radioMan?.removeFromParent(); this.radioMan?.geometry.dispose();
    this.tailMan?.removeFromParent(); this.tailMan?.geometry.dispose();
    // radio operator: seated at his table on the left, writing in the log
    {
      const f = new CrewFigure(this.lookAt('radio', false));
      const p = newPose();
      p.hip.set(0, 0.47, 0); p.lean = 0.32; p.headPitch = 0.25; p.headYaw = 0.2;
      p.handL.set(0.2, 0.74, 0.38); p.handR.set(-0.08, 0.75, 0.42);
      p.footL.set(0.15, 0.06, 0.42); p.footR.set(-0.13, 0.06, 0.36);
      f.apply(p);
      this.radioMan = f.bake();
      this.radioMan.position.copy(this.radioBase);
      this.radioMan.rotation.y = 0.5;
      g.add(this.radioMan);
    }
    // tail gunner: kneeling at his guns, facing aft
    {
      const f = new CrewFigure(this.lookAt('tail', false));
      const p = newPose();
      p.hip.set(0, 0.24, 0); p.lean = 0.18; p.headPitch = -0.12;
      p.handL.set(0.13, 0.55, 0.42); p.handR.set(-0.13, 0.55, 0.42);
      p.footL.set(0.13, 0.05, -0.12); p.footR.set(-0.13, 0.05, -0.12);
      f.apply(p);
      this.tailMan = f.bake();
      this.tailMan.position.copy(this.tailBase);
      this.tailMan.rotation.y = Math.PI;
      g.add(this.tailMan);
    }
  }

  // ---------- static glimpses: radio room, ball turret top, tail tunnel ----------
  private buildStatics(zc: number): THREE.Group {
    const g = new THREE.Group();
    g.name = 'livingStatics';
    const M = interiorMats();
    const z1 = zc + 3.2, z0 = zc - 3.2;
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, shadow = true) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; g.add(o); return o;
    };
    // --- radio room, through the open door in the forward bulkhead ---
    const n0 = g.children.length;
    const rLen = 1.7;
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, rLen, 24, 1, true).rotateX(Math.PI / 2), M.radioRoom);
    shell.scale.set(A * 0.99, B * 0.99, 1);
    shell.position.set(0, YC, z1 + rLen / 2);
    shell.receiveShadow = true;
    shell.name = 'radioShell';
    g.add(shell);
    box(1.3, 0.03, rLen, 0, FLOOR_TOP - 0.015, z1 + rLen / 2, M.dark);
    // forward wall (bomb-bay bulkhead) with its own closed door
    const fw = new THREE.Mesh(new THREE.CircleGeometry(1, 24), M.wall);
    fw.scale.set(A, B, 1); fw.position.set(0, YC, z1 + rLen); fw.rotation.y = Math.PI; g.add(fw);
    box(0.5, 1.1, 0.03, 0, FLOOR_TOP + 0.55, z1 + rLen - 0.02, M.olive);
    // operator's table on the left with the liaison receiver and transmitter above it
    box(0.42, 0.035, 0.85, 0.6, 0.02, z1 + 0.85, M.dark);
    box(0.32, 0.2, 0.4, 0.66, 0.15, z1 + 0.65, M.radio);
    box(0.32, 0.26, 0.38, 0.68, 0.4, z1 + 1.05, M.radio);
    box(0.26, 0.18, 0.3, 0.7, 0.46, z1 + 0.62, M.radio);
    // command sets stacked on the right
    box(0.3, 0.6, 0.45, -0.66, -0.25, z1 + 0.9, M.radio);
    // dial lamps: tiny warm glows on the set faces (unlit, they read in the gloom)
    const lamp = new THREE.CircleGeometry(0.014, 10);
    for (const [x, y, z, ry] of [[0.5, 0.17, z1 + 0.6, -Math.PI / 2], [0.5, 0.17, z1 + 0.72, -Math.PI / 2], [0.52, 0.42, z1 + 0.98, -Math.PI / 2], [0.52, 0.42, z1 + 1.12, -Math.PI / 2], [0.57, 0.48, z1 + 0.6, -Math.PI / 2], [-0.5, -0.12, z1 + 0.82, Math.PI / 2], [-0.5, -0.2, z1 + 1.0, Math.PI / 2]] as [number, number, number, number][]) {
      const l = new THREE.Mesh(lamp, M.glow);
      l.position.set(x, y, z); l.rotation.y = ry; g.add(l);
    }
    // roof hatch: a patch of daylight overhead
    const hatch = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.6), M.sky);
    hatch.rotation.x = Math.PI / 2;
    hatch.position.set(0, YC + B * 0.97, z1 + 0.95);
    g.add(hatch);
    // operator's seat
    this.radioBase.set(0.33, FLOOR_TOP, z1 + 0.55);
    box(0.34, 0.05, 0.34, 0.33, FLOOR_TOP + 0.43, z1 + 0.55, M.olive);
    box(0.05, 0.42, 0.05, 0.33, FLOOR_TOP + 0.21, z1 + 0.55, M.metal);
    // the door itself, hinged on the left post and swung open into the waist
    const dh = WAIST_DOOR_TOP - FLOOR_TOP - 0.02, phi = 1.3, hx = WAIST_DOOR_W / 2;
    const door = box(WAIST_DOOR_W, dh, 0.035, hx - Math.cos(phi) * hx, FLOOR_TOP + dh / 2 + 0.01, z1 - 0.04 - Math.sin(phi) * hx, M.olive);
    door.rotation.y = -phi;
    const handle = box(0.025, 0.1, 0.05, 0, 0, 0, M.metal, false);
    g.remove(handle); door.add(handle); handle.position.set(-hx + 0.06, 0.05, 0.03);
    // everything of the radio room but its shell: replaced by the kit on Medium and up
    const radio = new THREE.Group();
    radio.name = 'radioLegacy';
    for (const o of g.children.slice(n0)) if (o !== shell) radio.add(o);
    g.add(radio);

    // --- ball turret: the top of the ball and its support in the floor, turning with its aim ---
    const bz = STATIONS.ball.pivot.z;
    this.ballYaw.position.set(0, BALL_Y, bz);
    this.ballYaw.add(this.ballPitch);
    const armour = new THREE.MeshStandardMaterial({ color: 0x2b2e28, roughness: 0.45, metalness: 0.65, envMap: envRef.tex, envMapIntensity: 0.25 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.62, 28, 10, 0, Math.PI * 2, 0, 0.62), armour);
    dome.castShadow = true; dome.receiveShadow = true;
    this.ballPitch.add(dome);
    // hatch, hinges and grab handles: they show the ball rolling in elevation
    const hatchM = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 20), M.metal);
    hatchM.position.set(0, 0.6, -0.08); hatchM.rotation.x = -0.13;
    this.ballPitch.add(hatchM);
    for (const s of [1, -1]) {
      const hdl = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 12, Math.PI), M.metal);
      hdl.position.set(s * 0.11, 0.625, -0.08); hdl.rotation.y = Math.PI / 2;
      this.ballPitch.add(hdl);
    }
    // azimuth gearbox and support column rising from the ball (turns with it)
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.2, 12), M.metal);
    col.position.set(0, 0.62 + 0.09, 0);
    this.ballYaw.add(col);
    const gear = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.18), M.dark);
    gear.position.set(0, 0.84, 0.05);
    this.ballYaw.add(gear);
    g.add(this.ballYaw);
    const ringR = Math.sqrt(0.62 ** 2 - (FLOOR_TOP - BALL_Y) ** 2) + 0.02;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.03, 6, 32).rotateX(Math.PI / 2), M.metal);
    ring.position.set(0, FLOOR_TOP + 0.01, bz);
    g.add(ring);

    // --- tail tunnel aft of the waist, narrowing to the tail gunner's position ---
    g.add(this.tailGlimpse);
    const zt = STATIONS.tail.pivot.z + 0.55;
    const rings = 9;
    const pos: number[] = [], idx: number[] = [];
    const segs = 20;
    const prof = (u: number) => ({ a: THREE.MathUtils.lerp(TUNNEL_A + 0.02, 0.44, u), b: THREE.MathUtils.lerp(TUNNEL_B + 0.02, 0.5, u), y: THREE.MathUtils.lerp(TUNNEL_Y, 0.3, u), z: THREE.MathUtils.lerp(z0, zt - 0.3, u) });
    for (let i = 0; i <= rings; i++) {
      const p = prof(i / rings);
      for (let j = 0; j <= segs; j++) { const t = (j / segs) * Math.PI * 2; pos.push(Math.cos(t) * p.a, p.y + Math.sin(t) * p.b, p.z); }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j, b = a + segs + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    tg.setIndex(idx);
    tg.computeVertexNormals();
    const tunnel = new THREE.Mesh(tg, M.wall);
    tunnel.receiveShadow = true;
    tunnel.name = 'tailTunnel';
    this.tailGlimpse.add(tunnel);
    // formers along the tunnel and the catwalk
    for (let i = 1; i < rings; i += 2) {
      const p = prof(i / rings);
      const f = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 4, 24), M.dark);
      f.scale.set(p.a - 0.02, p.b - 0.02, 1); f.position.set(0, p.y, p.z);
      this.tailGlimpse.add(f);
    }
    const p0 = prof(0), pEnd = prof(1);
    const wy0 = p0.y - p0.b * 0.85, wy1 = pEnd.y - pEnd.b * 0.85;
    const walk = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, Math.hypot(pEnd.z - z0, wy1 - wy0)), M.wall);
    walk.position.set(0, (wy0 + wy1) / 2, (z0 + pEnd.z) / 2);
    walk.rotation.x = Math.atan2(wy1 - wy0, Math.abs(pEnd.z - z0));
    walk.name = 'tailCatwalk';
    this.tailGlimpse.add(walk);
    // tail gunner's compartment: a short cocoon with the window open to the sky behind him
    const tz = zt - 0.3;
    const cocoon = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.4, 0.8, 18, 1, true).rotateX(Math.PI / 2), M.wallBack);
    cocoon.scale.set(1, 1.12, 1);
    cocoon.position.set(0, 0.3, tz - 0.4);
    this.tailGlimpse.add(cocoon);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.03, 4, 20), M.dark);
    frame.scale.set(1, 1.1, 1); frame.position.set(0, 0.32, tz - 0.8);
    this.tailGlimpse.add(frame);
    this.tailBase.set(0, 0.3 - 0.44 * 1.12 + 0.05, tz - 0.25);
    return g;
  }

  // ---------- per frame ----------
  // station: the player's; sunLocal: toward the sun (bomber-local); eyeIn: 0 hip .. 1 eye inside
  // (ADS / free look); cold 0..1; mouth/vent: the player's mask exhaust (bomber-local)
  update(dt: number, station: StationId, sunLocal: THREE.Vector3, eyeIn: number, cold: number, mouth: THREE.Vector3, vent: THREE.Vector3, ventX: THREE.Vector3, breathRate: number, viewH: number, cam?: THREE.Camera) {
    this.cam = cam ?? null;
    const b = this.bomber;
    if (!b) return;
    this.brass?.update(dt);
    const light = 0.12 + 0.05 * Atmos.sunIntensity;
    const daylight = 0.45 + 0.13 * Atmos.sunIntensity;   // breath catches the light from the window
    // breath: only with the eye down on the sight (or turned into the cabin)
    const side = station === 'waistL' ? 1 : station === 'waistR' ? -1 : 0;
    _d.set(side * 0.18, 0.02, -0.22);
    this.breath?.update(dt, mouth, vent, ventX, _d, eyeIn * (0.55 + 0.45 * cold), breathRate, daylight, viewH);
    if (!this.waist?.visible) { this.flash.intensity = 0; return; }
    this.frostT += dt;
    // frost creeps in over the first few minutes of a cold mission; the player's own window
    // keeps only a thin rim while he looks out past the frame
    const grow = cold * (0.3 + 0.7 * THREE.MathUtils.smoothstep(this.frostT, 0, 240));
    const own = 0.35 + 0.65 * eyeIn;
    this.frost?.update(grow * (side > 0 ? own : 1), grow * (side < 0 ? own : 1), light);
    this.shafts?.update(sunLocal, side, own, dt);
    if (this.high) {
      // daylight bouncing round the inside: more of it with the sun pouring through a window
      interiorLight(THREE.MathUtils.smoothstep(Math.max(sunLocal.x, -sunLocal.x), 0.05, 0.5));
      if (this.kit?.bombs) this.kit.bombs.visible = this.bombsAboard;
    }
    this.updateBall(b);
    this.updateGlimpses(dt);
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 120);
    if (this.st) this.updateGunner(dt, this.st, b);
  }

  private updateBall(b: Bomber) {
    const bg = b.guns.get('ball');
    if (!bg) return;
    this.ballYaw.rotation.y = Math.atan2(bg.cur.x, bg.cur.z);
    this.ballPitch.rotation.x = -Math.asin(THREE.MathUtils.clamp(bg.cur.y, -1, 1));
  }

  private cam: THREE.Camera | null = null;

  // a clip-driven man in the background: hit once when wounded, then lying still
  private glimpseActor(a: CrewActor, hurt: boolean, clip: 'sit' | 'kneel', dt: number) {
    if (hurt && a.clip === clip) a.play('hit', 0.1);
    else if (hurt && a.clip === 'hit' && a.clipDone) a.play('down', 0.4);
    else if (!hurt && a.clip !== clip) a.play(clip, 0.5);
    a.update(dt);
  }

  private updateGlimpses(dt: number) {
    const t = this.world.time, crew = this.world.crew.wounded;
    if (this.radioActor) this.glimpseActor(this.radioActor, crew.has('radio'), 'sit', dt);
    if (this.tailActor && this.tailActor.root.visible) this.glimpseActor(this.tailActor, crew.has('tail'), 'kneel', dt);
    if (this.tailMan) {
      const g = this.world.crewGunner('tail');
      const firing = !!g && g.burst > 0 && !!g.target?.alive;
      const hurt = crew.has('tail');
      this.tailMan.position.copy(this.tailBase);
      this.tailMan.rotation.set(hurt ? 0.25 : 0, Math.PI, hurt ? 0.45 : Math.sin(t * 0.7) * 0.02);
      if (hurt) this.tailMan.position.y -= 0.08;
      else if (firing) { this.tailMan.position.x += R() * 0.006; this.tailMan.position.z += R() * 0.006; }
    }
    if (this.radioMan) {
      const hurt = crew.has('radio');
      this.radioMan.position.copy(this.radioBase);
      this.radioMan.rotation.set(hurt ? 0.3 : Math.sin(t * 0.4) * 0.015, 0.5 + (hurt ? 0 : Math.sin(t * 0.13) * 0.08), hurt ? -0.35 : 0);
      if (hurt) this.radioMan.position.y -= 0.1;
    }
  }

  private updateGunner(dt: number, s: Station, b: Bomber) {
    const def = STATIONS[s.id];
    const hit = this.world.crew.wounded.has(s.crew);
    // --- wounds and replacements ---
    if (hit && s.woundT < 0) {
      s.woundT = 0;
      s.down?.dispose();
      s.down = s.man; s.man = null; s.manLook = '';
      if (s.down) this.layDown(s, false);
    }
    if (s.woundT >= 0) {
      s.woundT += dt;
      if (!s.man && s.woundT >= REPLACE_AFTER) this.mount(s, true);
      if (!hit) {
        // the round is over: the wounded man has been carried forward
        s.woundT = -1;
        s.down?.dispose(); s.down = null;
        if (!s.man) this.mount(s, crewRoster.occupant(s.crew) === null);
      }
    } else if (!s.man) this.mount(s, crewRoster.occupant(s.crew) === null);
    if (s.down) this.animateDown(dt, s);
    this.updateHelper(dt, s);

    // --- aim: the AI gunner's target, or a slow search of the sky ---
    const g = this.world.crewGunner(s.id);
    const target: Fighter | null = g?.target && g.target.alive ? g.target : null;
    let wantYaw: number, wantPitch: number;
    s.idle += dt;
    if (!s.man) { wantYaw = 0; wantPitch = -0.55; }             // nobody on the grips: the gun sags
    else if (target) {
      b.worldToLocal(_v.copy(target.pos)).sub(def.pivot);
      wantYaw = wrapAngle(Math.atan2(_v.x, _v.z) - def.rest.yaw);
      wantPitch = Math.asin(THREE.MathUtils.clamp(_v.y / _v.length(), -1, 1)) - def.rest.pitch;
    } else {
      wantYaw = Math.sin(s.idle * 0.21) * 0.55 + Math.sin(s.idle * 0.53) * 0.15;
      wantPitch = Math.sin(s.idle * 0.17 + 1) * 0.18 + 0.05;
    }
    wantYaw = THREE.MathUtils.clamp(wantYaw, def.yaw[0], def.yaw[1]);
    wantPitch = THREE.MathUtils.clamp(wantPitch, def.pitch[0] - def.rest.pitch, def.pitch[1] - def.rest.pitch);
    const k = s.man ? 90 : 30, damp = s.man ? 16 : 9;
    s.vYaw += ((wantYaw - s.aimYaw) * k - s.vYaw * damp) * dt;
    s.vPitch += ((wantPitch - s.aimPitch) * k - s.vPitch * damp) * dt;
    s.aimYaw += s.vYaw * dt; s.aimPitch += s.vPitch * dt;

    // --- fire: mirror the AI gunner's burst with flash, light, recoil and brass ---
    const firing = !!s.man && !!target && !!g && g.burst > 0;
    s.cooldown -= dt;
    if (firing && s.gun) {
      while (s.cooldown <= 0) {
        s.cooldown += 1 / AI_RATE;
        this.crewShot(s, b);
      }
    } else if (s.cooldown < 0) s.cooldown = 0;
    s.recoilT = Math.max(0, s.recoilT - dt * 14);
    const shake = s.recoilT * 0.006;
    s.yaw.rotation.set(0, def.rest.yaw + s.aimYaw + R() * shake, 0);
    s.pitch.rotation.set(-(def.rest.pitch + s.aimPitch) + R() * shake, 0, 0);
    if (s.gun) {
      for (const r of s.gun.recoil) r.position.z = -s.recoilT * 0.022;
      s.gun.belt?.tick(dt);
    }
    if (s.man instanceof CrewActor) this.poseActor(s, firing, dt);
    else if (s.man) this.poseGunner(s, firing);
  }

  // interior 2.0: a crewman kneels by the wounded gunner (out of the player's sight when he
  // arrives), working on him until the rookie takes the gun
  private updateHelper(dt: number, s: Station) {
    const want = this.high && !!s.down && s.woundT >= HELP_FROM && !s.man;
    if (!want) { if (s.helper) { s.helper.dispose(); s.helper = null; } return; }
    const side = STATIONS[s.id].pivot.x > 0 ? 1 : -1, wz = STATIONS[s.id].pivot.z;
    if (!s.helper) {
      _v.set(-side * 0.2, FLOOR_TOP, wz + 0.95);
      if (this.cam && this.waist) {
        // only appear where the player is not looking
        this.waist.localToWorld(_w.copy(_v));
        _d.setFromMatrixPosition(this.cam.matrixWorld);
        _w.sub(_d).normalize();
        this.cam.getWorldDirection(_d);
        if (_w.dot(_d) > 0.45) return;
      }
      const h = new CrewActor(lookOf(null, true));
      h.root.position.copy(_v);
      h.root.rotation.y = side * Math.PI / 2;
      h.play('help', 0, Math.random());
      this.waist!.add(h.root);
      s.helper = h;
    }
    s.helper.update(dt);
  }

  // interior 2.0: the skinned man on the grips: his clip (fire / idle) under hands IK'd onto
  // the spade grips, a crouch and lean under a high target, the head down along the gun
  private poseActor(s: Station, firing: boolean, dt: number) {
    const a = s.man as CrewActor;
    a.play(firing ? 'fire' : 'idle', 0.25);
    a.update(dt);
    const p = s.aimPitch + STATIONS[s.id].rest.pitch;
    const cp = Math.cos(p), sp = Math.sin(p);
    const root = a.root.position;
    const up = Math.max(0, sp), down = Math.max(0, -sp);
    for (const side of [1, -1]) {
      const gx = side * GRIP.x, gy = GRIP.y, gz = GRIP.z;
      (side > 0 ? this.aimPose.handL : this.aimPose.handR).set(gx - root.x, gy * cp + gz * sp - root.y, -gy * sp + gz * cp - root.z);
    }
    a.gunPose(this.aimPose.handL, this.aimPose.handR, 0.06 + 0.3 * up, 0.12 + 0.35 * up - 0.1 * down, -0.15 - p * 0.6);
  }

  private crewShot(s: Station, b: Bomber) {
    const gun = s.gun!;
    const m = gun.muzzles[0];
    const p = m.getWorldPosition(_v);
    const dir = _d.set(0, 0, 1).applyQuaternion(m.getWorldQuaternion(_q));
    s.shots++;
    if (s.shots % 2 === 0) this.world.effects.playerMuzzle(p, dir, b.vel);
    sound.crewGun(p);   // his M2 two metres away: positional, inside the fuselage reverb
    // flash just inside the window lights up the compartment
    this.flash.position.copy(p).addScaledVector(dir, -0.85);
    this.flash.intensity = 2.5 + Math.random() * 2;
    s.recoilT = 1;
    gun.belt?.advance(1);
    // brass out of the ejection port, onto the walkway
    if (this.brass) {
      gun.ejectPort.getWorldPosition(_w);
      b.root.worldToLocal(_w);
      this.brass.eject(_w, _v.set(R() * 0.4, -1.2 - Math.random(), R() * 0.4), true);
    }
  }

  // Figure pose for a man on the grips: hands on the spade grips (which ride up and down
  // as the gun elevates), crouching under a high target, head laid along the gun.
  private poseGunner(s: Station, firing: boolean) {
    const P = this.aimPose;
    const p = s.aimPitch + STATIONS[s.id].rest.pitch;
    const cp = Math.cos(p), sp = Math.sin(p);
    const root = s.man!.root.position;
    const up = Math.max(0, sp);
    P.hip.set(0, 0.68 - 0.14 * up + 0.05 * Math.max(0, -sp), 0);
    P.lean = 0.28 + 0.3 * up;
    P.roll = 0;
    P.headPitch = -P.lean - p * 0.85;
    P.headYaw = 0;
    for (const side of [1, -1]) {
      // grip in the yaw frame (pitch group rotated by -p about X), then into the figure frame
      const gx = side * GRIP.x, gy = GRIP.y, gz = GRIP.z;
      const h = side > 0 ? P.handL : P.handR;
      h.set(gx - root.x, gy * cp + gz * sp - root.y, -gy * sp + gz * cp - root.z - 0.03);
    }
    P.footL.set(0.15, 0.07, 0.14); P.footR.set(-0.15, 0.07, -0.12);
    if (firing) { P.hip.x += R() * 0.005; P.hip.z += R() * 0.006; P.headYaw += R() * 0.01; }
    // breathing
    P.hip.y += Math.sin(this.world.time * 1.7 + s.idle) * 0.004;
    (s.man as CrewFigure).apply(P);
  }

  // the wounded man sliding down beside his gun, then lying still
  private animateDown(dt: number, s: Station) {
    const f = s.down!;
    const side = STATIONS[s.id].pivot.x > 0 ? 1 : -1;
    const wz = STATIONS[s.id].pivot.z;
    s.downT = Math.min(1, s.downT + dt / 0.9);
    const k = s.downT * s.downT * (3 - 2 * s.downT);
    if (f instanceof CrewActor) {
      // the clip does the falling; the body slides to where he ends up lying along the walkway
      const [tx, , tz] = downSpot(f, side, wz), tYaw = downYaw(f, side);
      f.root.position.set(THREE.MathUtils.lerp(s.downFrom.x, tx, k), FLOOR_TOP, THREE.MathUtils.lerp(s.downFrom.z, tz, k));
      f.root.rotation.set(0, s.downYaw0 + wrapAngle(tYaw - s.downYaw0) * k, 0);
      if (f.clip === 'hit' && f.clipDone) f.play('down', 0.5);
      f.update(dt);
      return;
    }
    const tx = side * 0.34, tz = wz + 0.42, tYaw = -side * Math.PI / 2;
    f.root.position.set(THREE.MathUtils.lerp(s.downFrom.x, tx, k), FLOOR_TOP, THREE.MathUtils.lerp(s.downFrom.z, tz, k));
    f.root.rotation.set(0, s.downYaw0 + wrapAngle(tYaw - s.downYaw0) * k, 0);
    if (s.downT < 1 || !f.root.userData.still) {
      lerpPose(this.aimPose, this.slumpPose, k, this.pose);
      (f as CrewFigure).apply(this.pose);
      f.root.userData.still = s.downT >= 1;
    }
  }
}

// Where a wounded waist gunner ends up: the posed figure sits slumped by his gun; the skinned
// man lies on his back along the walkway, head aft, clear of the man who takes the gun
function downSpot(f: Man, side: number, wz: number): [number, number, number] {
  return f instanceof CrewActor ? [side * 0.3, FLOOR_TOP, wz + 1.35] : [side * 0.34, FLOOR_TOP, wz + 0.42];
}
function downYaw(f: Man, side: number) { return f instanceof CrewActor ? 0 : -side * Math.PI / 2; }

// The B-17 model has structure (tail-wheel well, the dorsal fin running down into the
// fuselage, the radio-room hatch) inside the volume of the cabin we build, where it would poke
// through the waist, radio room and tail tunnel. Everything inside our cabin shell is hidden
// from the outside by it anyway, so the player's own bomber gets a copy of its airframe
// geometry with those triangles collapsed, swapped in only while the waist interior is shown
// (external views of the Sky Queen keep the untouched model). One copy per source geometry.
type AirframeSwap = { mesh: THREE.Mesh; orig: THREE.BufferGeometry; clean: THREE.BufferGeometry };
const cleanCache = new WeakMap<THREE.BufferGeometry, { zFwd: number; clean: THREE.BufferGeometry }>();
// zFwdKit: interior 2.0 also clears the bomb bay ahead of the radio room
export function cabinAirframe(b: Bomber, zc: number, zFwdKit?: number): AirframeSwap[] {
  const zFwd = zFwdKit ?? zc + 3.2 + 1.7, zAft = STATIONS.tail.pivot.z + 0.2;
  const z0 = zc - 3.2, zt = STATIONS.tail.pivot.z + 0.25;
  const c = new THREE.Vector3();
  const inside = (p: THREE.Vector3) => {
    // The ball's access throat must not be capped by the external model's belly skin.
    if (Math.abs(p.x) < 0.48 && Math.abs(p.z - STATIONS.ball.pivot.z) < 0.65 && p.y > -1.7 && p.y < -0.4) return true;
    if (p.z > zFwd || p.z < zAft) return false;
    if (p.z >= z0) return (p.x / (A * 0.985)) ** 2 + ((p.y - YC) / (B * 0.985)) ** 2 < 1 && p.y > FLOOR_TOP - 0.03;
    const u = THREE.MathUtils.clamp((z0 - p.z) / (z0 - zt), 0, 1);
    const a = THREE.MathUtils.lerp(TUNNEL_A, 0.44, u), bb = THREE.MathUtils.lerp(TUNNEL_B, 0.5, u), y = THREE.MathUtils.lerp(TUNNEL_Y, 0.3, u);
    return (p.x / a) ** 2 + ((p.y - y) / bb) ** 2 < 1;
  };
  b.root.updateMatrixWorld(true);
  const toLocal = new THREE.Matrix4().copy(b.root.matrixWorld).invert();
  const out: AirframeSwap[] = [];
  b.model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !o.name.startsWith('airframe') || !m.geometry.index) return;
    const orig = m.geometry;
    const cached = cleanCache.get(orig);
    let clean = cached && cached.zFwd === zFwd ? cached.clean : undefined;
    if (!clean) {
      clean = orig.clone();
      const M = new THREE.Matrix4().multiplyMatrices(toLocal, m.matrixWorld);
      const pos = orig.getAttribute('position'), idx = clean.index!;
      const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      for (let t = 0; t < idx.count; t += 3) {
        for (let k = 0; k < 3; k++) p[k].fromBufferAttribute(pos, idx.getX(t + k)).applyMatrix4(M);
        // any of the corners, edge midpoints or the centre inside the cabin
        let hit = false;
        for (let k = 0; k < 7 && !hit; k++) {
          if (k < 3) c.copy(p[k]);
          else if (k < 6) c.copy(p[k - 3]).add(p[(k - 2) % 3]).multiplyScalar(0.5);
          else c.copy(p[0]).add(p[1]).add(p[2]).divideScalar(3);
          hit = inside(c);
        }
        if (!hit) continue;
        const v = idx.getX(t);
        idx.setX(t + 1, v); idx.setX(t + 2, v);
      }
      cleanCache.set(orig, { zFwd, clean });
    }
    out.push({ mesh: m, orig, clean });
  });
  return out;
}

// How cold a mission is (0..1) for the frost on the waist windows: every mission is flown at
// -30 to -50 C, but the winter ones are the worst. Game hook: gunner.cold = missionCold(mission).
const MONTH_COLD: Record<string, number> = { january: 1, february: 1, march: 0.8, april: 0.6, may: 0.45, june: 0.35, july: 0.3, august: 0.35, september: 0.5, october: 0.7, november: 0.9, december: 1 };
export function missionCold(m: { date?: string; weather?: { mood?: string } } | null | undefined): number {
  const month = m?.date?.toLowerCase().match(/[a-z]+/)?.[0] ?? '';
  const base = MONTH_COLD[month] ?? 0.6;
  return Math.min(1, base + (m?.weather?.mood === 'storm' ? 0.2 : 0));
}

// World.prewarm hook: compile every material the living interior uses (vertex-coloured crew,
// instanced brass, shafts, frost, breath, radio room) before play.
export function warmLivingInterior(scene: THREE.Scene, at: THREE.Vector3): () => void {
  const M = interiorMats();
  const objs: THREE.Object3D[] = [];
  const box = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const fig = new THREE.Mesh(box, figureMaterial());
  // vertexColors needs a colour attribute on the warm-up geometry too
  const colGeo = box.clone();
  colGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colGeo.getAttribute('position').count * 3).fill(0.5), 3));
  fig.geometry = colGeo;
  fig.castShadow = true;
  objs.push(fig);
  const inst = new THREE.InstancedMesh(brassGeometry(), brassMaterial(), 1);
  inst.setMatrixAt(0, new THREE.Matrix4());
  inst.castShadow = true;
  objs.push(inst);
  const links = new THREE.InstancedMesh(linkGeometry(), linkMaterial(), 1);
  links.setMatrixAt(0, new THREE.Matrix4()); links.castShadow = true; objs.push(links);
  const sg = box.clone();
  sg.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(sg.getAttribute('position').count), 1));
  sg.setAttribute('aU', new THREE.BufferAttribute(new Float32Array(sg.getAttribute('position').count), 1));
  objs.push(new THREE.Mesh(sg, shaftMaterial()));
  objs.push(new THREE.Mesh(sg, shaftVolumeMaterial()));
  const fg = box.clone();
  fg.setAttribute('aD', new THREE.BufferAttribute(new Float32Array(fg.getAttribute('position').count), 1));
  objs.push(new THREE.Mesh(fg, frostMaterial()));
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  bg.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array([0.05]), 1));
  bg.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array([0.01]), 1));
  const pts = new THREE.Points(bg, breathMaterial());
  pts.frustumCulled = false;
  objs.push(pts);
  for (const m of Object.values(M)) objs.push(new THREE.Mesh(box, m));
  objs.forEach((o, i) => { o.position.copy(at); o.position.y += 2 + (i % 4) * 0.5; o.position.x += Math.floor(i / 4) * 0.5; o.frustumCulled = false; scene.add(o); });
  return () => {
    objs.forEach((o) => scene.remove(o));
    box.dispose(); colGeo.dispose(); fg.dispose(); bg.dispose(); sg.dispose();
  };
}

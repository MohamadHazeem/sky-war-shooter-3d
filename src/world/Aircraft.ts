import * as THREE from 'three';
import { instantiate, ModelKind, PropInfo, setupProps } from './Models';
import { FlightModel, FlightParams } from './FlightModel';

export type Team = 'allied' | 'axis';

// Height (m) below which a falling wreck is removed. Low-level operations (StrafeOps.ts) lower it
// and blow wrecks up on the terrain themselves.
export const WRECK_FLOOR = { fighter: 3000, bomber: 3500 };

export interface HitZone {
  name: string;
  offset: THREE.Vector3;
  radius: number;
  hp: number;
  maxHp: number;
  engine?: number;      // engine index (prop index)
  critical?: boolean;   // destroying it destroys the aircraft
  burning?: boolean;
}

let nextId = 1;
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();

export interface Gun {
  offset: THREE.Vector3; // muzzle in model frame
  dir: THREE.Vector3;    // model frame
  rate: number;          // rounds/s
  muzzleVel: number;
  damage: number;
  spread: number;        // rad
  tracerEvery: number;
  tracerColor: [number, number, number];
  cannon?: boolean;
  cooldown: number;
  count: number;         // rounds fired (for tracer cadence)
  ammo: number;
}

export function makeGun(o: Partial<Gun> & { offset: THREE.Vector3 }): Gun {
  return {
    dir: new THREE.Vector3(0, 0, 1), rate: 13, muzzleVel: 870, damage: 11, spread: 0.003,
    tracerEvery: 3, tracerColor: [9, 2.6, 0.9], cooldown: Math.random() * 0.05, count: 0, ammo: Infinity,
    ...o,
  };
}

export abstract class Aircraft {
  readonly id = nextId++;
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  readonly props: PropInfo[];
  readonly vel = new THREE.Vector3();
  zones: HitZone[] = [];
  radius = 8;
  alive = true;       // still flying under control
  falling = false;    // shot down, going down
  remove = false;     // delete from world
  fallTime = 0;
  spin = new THREE.Vector3();
  lastAttacker: Aircraft | null = null;
  propSpin: number[] = [];
  engineDead: boolean[] = [];
  smokeAcc = 0;
  label = '';
  damageTaken = 0;
  hitFlash = 0;
  isPlayer = false;
  // overall structural strength: many hits wear an aircraft down even if no single
  // part is shot away
  structure = Infinity;
  maxStructure = Infinity;
  get structureFrac() { return this.maxStructure === Infinity ? 1 : Math.max(0, this.structure) / this.maxStructure; }
  playerDamage = 0;
  lastPlayerHit = -99;

  constructor(public readonly kind: ModelKind, public readonly team: Team, propRadius: number) {
    this.model = instantiate(kind);
    this.root.add(this.model);
    this.props = setupProps(this.model, propRadius);
    this.propSpin = this.props.map(() => Math.random() * 6);
    this.engineDead = this.props.map(() => false);
  }

  get pos() { return this.root.position; }
  get quat() { return this.root.quaternion; }

  forward(out = new THREE.Vector3()) { return out.set(0, 0, 1).applyQuaternion(this.root.quaternion); }
  up(out = new THREE.Vector3()) { return out.set(0, 1, 0).applyQuaternion(this.root.quaternion); }

  localToWorld(local: THREE.Vector3, out = new THREE.Vector3()) {
    return out.copy(local).applyQuaternion(this.root.quaternion).add(this.root.position);
  }
  worldToLocal(world: THREE.Vector3, out = new THREE.Vector3()) {
    return out.copy(world).sub(this.root.position).applyQuaternion(_q.copy(this.root.quaternion).invert());
  }

  zone(name: string) { return this.zones.find((z) => z.name === name); }

  get integrity(): number {
    let hp = 0, max = 0;
    for (const z of this.zones) { hp += Math.max(0, z.hp); max += z.maxHp; }
    return max > 0 ? hp / max : 0;
  }

  updateProps(dt: number, rpmFactor = 1) {
    for (let i = 0; i < this.props.length; i++) {
      const p = this.props[i];
      const dead = this.engineDead[i] || !this.alive;
      const speed = dead ? (this.falling ? 3 : 1.2) : 70 * rpmFactor;
      this.propSpin[i] += speed * dt;
      const spinning = speed > 20;
      p.node.quaternion.copy(p.base).multiply(_qz.setFromAxisAngle(_zAxis, this.propSpin[i]));
      p.disc.visible = spinning;
      // Slowly sway the disc texture against the spin (~4.5 s period at full rpm) so the
      // blade banding and streaks shimmer instead of sitting as a static tint.
      p.disc.rotation.z = Math.sin(this.propSpin[i] * 0.02 + i * 1.7) * 0.18;
      for (const b of p.blades) b.visible = !spinning;
    }
  }

  abstract update(dt: number, time: number): void;
}

const _q = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);
const _yAxis = new THREE.Vector3(0, 1, 0);
const _xAxis = new THREE.Vector3(1, 0, 0);
const _qa = new THREE.Quaternion();

export class Fighter extends Aircraft {
  readonly fm: FlightModel;
  guns: Gun[] = [];
  trigger = false;
  ai: any = null; // set by AI controller
  pilotKilled = false;
  bailedOut = false;
  dropTankAttached = false;
  dropTank: THREE.Object3D | null = null;
  rockets = 0;            // Wgr. 21 tubes still loaded
  fireRockets = false;    // set by the AI when it wants to launch
  rocketTubes: THREE.Object3D[] = [];
  gunAim: THREE.Vector3 | null = null; // world direction guns are laid on (AI), overrides boresight

  enemyType = '';          // EnemyType for axis aircraft (score, radio)

  constructor(kind: ModelKind, team: Team, params: FlightParams, propRadius = kind === 'p51d' ? 1.7 : 1.65) {
    super(kind, team, propRadius);
    this.fm = new FlightModel(params, this.root.position, this.root.quaternion);
    this.radius = 7;
    const H = (name: string, x: number, y: number, z: number, r: number, hp: number, extra: Partial<HitZone> = {}) =>
      this.zones.push({ name, offset: new THREE.Vector3(x, y, z), radius: r, hp, maxHp: hp, ...extra });
    // Zones fitted to the converted models (Fw 190 A-8 / P-51D share the layout closely)
    H('engine', 0, 0.0, 1.15, 0.9, 130, { engine: 0 });
    H('cockpit', 0, 0.62, -1.35, 0.6, 95, { critical: true });
    H('fuselage', 0, 0.1, -3.4, 0.75, 170, { critical: true });
    H('tail', 0, 0.55, -5.75, 1.05, 120, { critical: true });
    // a fighter that loses a wing panel is finished
    H('wingL', 2.6, -0.3, -0.25, 1.45, 150, { critical: true });
    H('wingR', -2.6, -0.3, -0.25, 1.45, 150, { critical: true });
  }

  // Enlarge the aircraft (model, hit zones, guns) — used for the enemy fighters so they
  // read clearly on screen at combat ranges.
  setScale(k: number) {
    this.model.scale.setScalar(k);
    for (const z of this.zones) { z.offset.multiplyScalar(k); z.radius *= k; }
    for (const g of this.guns) g.offset.multiplyScalar(k);
    this.radius *= k;
  }

  update(dt: number) {
    if (this.alive) {
      const eng = this.zone('engine')!;
      this.fm.thrustScale = eng.hp > 0 ? 0.55 + 0.45 * (eng.hp / eng.maxHp) : 0;
      const wl = this.zone('wingL')!, wr = this.zone('wingR')!;
      this.fm.rollBias = ((1 - wl.hp / wl.maxHp) - (1 - wr.hp / wr.maxHp)) * -0.25;
      this.fm.step(dt);
      this.vel.copy(this.fm.vel);
    } else if (this.falling) {
      this.fallTime += dt;
      this.vel.y -= 9.81 * dt * 0.8;
      this.vel.multiplyScalar(Math.exp(-0.05 * dt));
      this.root.position.addScaledVector(this.vel, dt);
      const e = new THREE.Euler(this.spin.x * dt, this.spin.y * dt, this.spin.z * dt);
      this.root.quaternion.multiply(_q.setFromEuler(e));
      if (this.root.position.y < WRECK_FLOOR.fighter || this.fallTime > 40) this.remove = true;
    }
    this.updateProps(dt, this.fm.throttle * 0.6 + 0.6);
  }
}

// B-17G: four engines, five gun stations. Flies in formation kinematically.
export class Bomber extends Aircraft {
  slot = new THREE.Vector3();      // offset within the formation (formation frame)
  wobblePhase = Math.random() * 100;
  wobbleAmp = 1;
  straggling = false;
  gunners: { station: string; offset: THREE.Vector3; cooldown: number; target: Aircraft | null; burst: number; arc: (d: THREE.Vector3) => boolean }[] = [];
  crewBailed = 0;
  bombsAway = false;
  name = '';
  // Animated gun positions (driven by the AI crews): desired + current aim, model frame
  guns = new Map<string, { yaw?: THREE.Object3D; pitch?: THREE.Object3D; single?: THREE.Object3D; rest: THREE.Vector3; qy: THREE.Quaternion; qp: THREE.Quaternion; cur: THREE.Vector3; want: THREE.Vector3 | null }>();

  constructor() {
    super('b17', 'allied', 1.77);
    const find = (n: string) => this.model.getObjectByName(n) ?? undefined;
    const turret = (key: string, y: string, p: string, rest: THREE.Vector3) => {
      const yaw = find(y), pitch = find(p);
      if (yaw) this.guns.set(key, { yaw, pitch, rest, qy: yaw.quaternion.clone(), qp: pitch?.quaternion.clone() ?? new THREE.Quaternion(), cur: rest.clone(), want: null });
    };
    const single = (key: string, n: string, rest: THREE.Vector3) => {
      const o = find(n);
      if (o) this.guns.set(key, { single: o, rest, qy: o.quaternion.clone(), qp: new THREE.Quaternion(), cur: rest.clone(), want: null });
    };
    turret('top', 'turret_top', 'turret_top_guns', new THREE.Vector3(0, 0, 1));
    turret('ball', 'turret_ball', 'turret_ball_guns', new THREE.Vector3(0, 0, 1));
    turret('chin', 'turret_chin', 'turret_chin_guns', new THREE.Vector3(0, 0, 1));
    single('waistL', 'gun_waist_left', new THREE.Vector3(1, 0, 0));
    single('waistR', 'gun_waist_right', new THREE.Vector3(-1, 0, 0));
    single('tail', 'gun_tail', new THREE.Vector3(0, 0, -1));
    this.radius = 18;
    const H = (name: string, x: number, y: number, z: number, r: number, hp: number, extra: Partial<HitZone> = {}) =>
      this.zones.push({ name, offset: new THREE.Vector3(x, y, z), radius: r, hp, maxHp: hp, ...extra });
    // Zones fitted to the converted B-17G (nose +6.5 m, tail -16.6 m)
    H('nose', 0, -0.25, 5.4, 1.2, 170);
    H('cockpit', 0, 0.75, 2.6, 1.2, 190, { critical: true });
    H('fuselageFwd', 0, 0.2, -0.6, 1.5, 300);
    H('fuselageMid', 0, 0.15, -4.4, 1.4, 300);
    H('fuselageAft', 0, 0.25, -8.9, 1.25, 260);
    H('tail', 0, 1.9, -14.0, 2.2, 400, { critical: true });
    H('engine1', 6.5, -0.15, 2.0, 1.1, 130, { engine: 0 });
    H('engine2', 3.0, -0.5, 2.5, 1.1, 130, { engine: 1 });
    H('engine3', -3.0, -0.5, 2.5, 1.1, 130, { engine: 2 });
    H('engine4', -6.5, -0.15, 2.0, 1.1, 130, { engine: 3 });
    H('wingL', 6.0, 0.0, 0.2, 2.5, 420, { critical: true });
    H('wingLtip', 11.6, 0.3, -0.9, 2.1, 180);
    H('wingR', -6.0, 0.0, 0.2, 2.5, 420, { critical: true });
    H('wingRtip', -11.6, 0.3, -0.9, 2.1, 180);
  }

  update(dt: number) {
    let rpm = 1;
    if (this.falling) {
      this.fallTime += dt;
      this.vel.y -= 9.81 * dt * 0.35;
      this.vel.y = Math.max(this.vel.y, -70);
      this.root.position.addScaledVector(this.vel, dt);
      const e = new THREE.Euler(this.spin.x * dt, this.spin.y * dt, this.spin.z * dt);
      this.root.quaternion.multiply(_q.setFromEuler(e));
      if (this.root.position.y < WRECK_FLOOR.bomber || this.fallTime > 75) this.remove = true;
      rpm = 0.4;
    }
    this.animateGuns(dt);
    this.updateProps(dt, rpm);
  }

  get enginesOut() { return this.engineDead.filter(Boolean).length; }

  // Swing turrets and flexible guns toward their crews' targets
  animateGuns(dt: number) {
    const k = 1 - Math.exp(-dt * 3);
    for (const g of this.guns.values()) {
      const want = g.want ?? g.rest;
      g.cur.lerp(want, k).normalize();
      if (g.single) {
        g.single.quaternion.copy(_qa.setFromUnitVectors(g.rest, g.cur)).multiply(g.qy);
      } else if (g.yaw) {
        const yaw = Math.atan2(g.cur.x, g.cur.z);
        const pitch = Math.asin(THREE.MathUtils.clamp(g.cur.y, -1, 1));
        g.yaw.quaternion.copy(g.qy).multiply(_qa.setFromAxisAngle(_yAxis, yaw));
        if (g.pitch) g.pitch.quaternion.copy(g.qp).multiply(_qa.setFromAxisAngle(_xAxis, -pitch));
      }
      g.want = null;
    }
  }
}

export { _m, _v };

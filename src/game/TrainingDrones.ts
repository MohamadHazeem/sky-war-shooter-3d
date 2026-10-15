import * as THREE from 'three';
import type { Game } from './Game';
import type { Fighter } from '../world/Aircraft';
import { inArc, dirFromYawPitch, STATIONS, StationId } from '../world/B17Layout';

// Training targets flown on rails in the bomber's frame: a slow weave inside one gun
// position's field of fire, so a target never leaves the window it was put in. Shared by
// the Gunnery School (Tutorial.ts) and the station lessons (LessonRunner.ts).

export interface DroneSpec {
  dist: number;                   // m from the gun's pivot
  y0: number; p0: number;         // centre of the weave, relative to the station's rest direction (rad)
  ay: number; ap: number;         // weave amplitudes (rad)
  w: number;                      // weave rate (rad/s)
  closing?: number;               // m/s: the drone flies in towards the gun...
  minDist?: number;               // ...down to this range (default 250 m)
  toughness?: number;             // share of a fighter's structure (default 0.35)
}

export interface Drone {
  f: Fighter;
  station: StationId;
  dist: number;
  y0: number; p0: number;
  ay: number; ap: number;
  w: number;
  closing: number; minDist: number;
  t: number;
  bank: number;
  head: number;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1);
const _up = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Vector3();

export class TrainingDrones {
  drones: Drone[] = [];

  constructor(private game: Game) {}

  anyAlive() { return this.drones.some((d) => d.f.alive); }

  // leftovers leave quietly
  clear() {
    for (const d of this.drones) if (d.f.alive) d.f.remove = true;
    this.drones = [];
  }

  inStationArc(id: StationId, pos: THREE.Vector3) {
    const b = this.game.world.playerBomber;
    if (!b) return false;
    const st = STATIONS[id];
    return inArc(st, b.worldToLocal(pos, _v).sub(st.pivot));
  }

  spawn(station: StationId, o: DroneSpec) {
    const w = this.game.world;
    const st = STATIONS[station];
    // keep the whole weave inside the station's limits
    const ylim = (st.yaw[1] - st.yaw[0]) >= Math.PI * 1.99 ? Infinity : Math.min(-st.yaw[0], st.yaw[1]) - 0.08;
    const y0 = THREE.MathUtils.clamp(o.y0, -ylim + o.ay, ylim - o.ay);
    const d: Drone = {
      f: null as unknown as Fighter, station, dist: o.dist, y0, p0: o.p0, ay: o.ay, ap: o.ap, w: o.w,
      closing: o.closing ?? 0, minDist: o.minDist ?? 250, t: 0, bank: 0, head: NaN,
    };
    const pos = this.dronePos(d, new THREE.Vector3());
    const f = w.spawnEnemy(pos, 'beam', 0.5, false, false, 'fw190');
    harmless(f, o.toughness ?? 0.35);
    (w as any).pilots?.delete?.(f);   // flown on rails below, not by the AI
    d.f = f;
    const orig = f.update.bind(f);
    (f as any).update = (dt: number, time: number) => {
      if (!f.alive) { orig(dt); return; }
      this.fly(d, dt);
      f.updateProps(dt, 0.9);
      void time;
    };
    this.fly(d, 0);
    this.drones.push(d);
    return d;
  }

  private dronePos(d: Drone, out: THREE.Vector3) {
    const b = this.game.world.playerBomber!;
    const st = STATIONS[d.station];
    const yaw = st.rest.yaw + d.y0 + d.ay * Math.sin(d.w * d.t);
    const pitch = st.rest.pitch + d.p0 + d.ap * Math.sin(2 * d.w * d.t + 1);
    const local = dirFromYawPitch(yaw, pitch, out).multiplyScalar(d.dist).add(st.pivot);
    return b.localToWorld(local, out);
  }

  private fly(d: Drone, dt: number) {
    const f = d.f;
    const b = this.game.world.playerBomber;
    if (!b) return;
    d.t += dt;
    if (d.closing > 0) d.dist = Math.max(d.minDist, d.dist - d.closing * dt);
    const p = this.dronePos(d, _v);
    if (dt > 0) {
      const vel = _v2.copy(p).sub(f.pos).divideScalar(dt);
      f.vel.lerp(vel, Math.min(1, dt * 8));
    } else f.vel.copy(b.vel);
    f.fm.vel.copy(f.vel);
    f.root.position.copy(p);
    // nose along the flight path, banking into the weave
    const head = Math.atan2(f.vel.x, f.vel.z);
    if (dt > 0 && Number.isFinite(d.head)) {
      let dh = head - d.head;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      d.bank += (THREE.MathUtils.clamp(-dh / dt * 2.5, -0.9, 0.9) - d.bank) * Math.min(1, dt * 3);
    }
    d.head = head;
    if (f.vel.lengthSq() > 1) {
      _m.lookAt(f.vel, ZERO, _up);
      f.root.quaternion.setFromRotationMatrix(_m).multiply(_q.setFromAxisAngle(_z, d.bank));
    }
  }
}

// No guns, no rockets, a thinner skin: a training target
export function harmless(f: Fighter, toughness: number) {
  f.guns = [];
  f.rockets = 0;
  f.fireRockets = false;
  f.structure = f.maxStructure = f.maxStructure * toughness;
  for (const z of f.zones) { z.maxHp *= toughness; z.hp = z.maxHp; }
}

import { Bomber } from './Aircraft';
import { bombingOvercast } from '../game/BombRunState';
import { weatherNow } from '../render/WeatherState';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createTargetSmoke, syncTargetSmoke } from '../render/TargetSmoke';
import { setFarTerrain, targetRiverAxis } from '../render/FarTerrain';
import { Atmos } from '../render/Atmosphere';
import { targetUniforms, TGT_IMPACTS, TGT_PLUMES } from '../render/TargetGround';
import { cloudTargetUniforms } from '../render/Clouds';
import { sound } from '../audio/Sound';
import type { Engine } from '../core/Engine';
import type { Mission } from '../game/Missions';
import type { BombImpact } from '../game/BombingMath';
import { CRUISE, type World } from './World';

// The bombing run's payoff on missions with `bombsAway`:
//  - the target city below (drawn by the sky shader, TargetGround.ts) and a break in the
//    low cloud deck over it (Clouds.ts),
//  - every bomber in the formation salvoing a stick of bombs that fall away and shrink into
//    the haze (one instanced mesh, kept at least ~1.5 px wide so the stream reads at range),
//  - after the (compressed) fall, a carpet of impacts rippling across the target: flashes,
//    shock rings, burn scars, lasting fires, a ground pall and leaning smoke columns, plus
//    secondary explosions, a low rumble and crew radio,
//  - flak batteries' muzzle flashes on the ground during the flak window.
// Self-contained: Game calls update() each frame, clear() on mission start, bombsAway() at
// release. The world's floating-origin shift reaches the bombs through the mesh position.

export const FALL = 25;            // s from release to impact (a real fall from 7.6 km is ~45 s)
const CITY_R = 2600;               // m, built-up radius of the target city
const STICK = 8;                   // bombs per aircraft
const STICK_GAP = 0.22;            // s between bombs of a stick
const DRAG_LAG = 0.93;             // share of the release speed a bomb keeps over the fall (horizontal)
const GROUPS = 3;                  // impact slots per bomber (a stick lands as three clusters)
const SECONDARY = 4;               // slots kept for secondary explosions
const MAX_BOMBS = 160;
const R = () => Math.random() * 2 - 1;

interface Bomb { pos: THREE.Vector3; vel: THREE.Vector3; age: number }
interface Pending { at: number; bomber: { alive: boolean; vel: THREE.Vector3; pos: THREE.Vector3; localToWorld(v: THREE.Vector3): THREE.Vector3 }; slot: number; i: number }
interface Impact { x: number; z: number; t: number; r: number; n: number; heard: boolean }

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

function bombGeometry(): THREE.BufferGeometry {
  // 500 lb GP bomb: body along +Z (nose forward) with a box tail of crossed fins
  const body = new THREE.CapsuleGeometry(0.2, 1.1, 3, 8).rotateX(Math.PI / 2);
  const fin1 = new THREE.BoxGeometry(0.5, 0.025, 0.32).translate(0, 0, -0.78);
  const fin2 = new THREE.BoxGeometry(0.025, 0.5, 0.32).translate(0, 0, -0.78);
  const g = mergeGeometries([body, fin1, fin2].map((p) => (p.index ? p.toNonIndexed() : p)))!;
  g.computeVertexNormals();
  return g;
}

export class TargetArea {
  readonly mesh: THREE.InstancedMesh;
  private mission: Mission | null = null;
  private lastTime = 0;
  private active = false;
  private aim = new THREE.Vector2();       // absolute ground x, z of the aim point
  playerControlled = false;
  private pattern: readonly BombImpact[] | null = null;
  get aimPoint() { return this.aim; }
  private released = false;
  private releaseT = 0;
  private pending: Pending[] = [];
  private bombs: Bomb[] = [];
  private impacts: (Impact | null)[] = [];
  private plumes: { slot: number; t: number; s: number }[] = [];
  private secondaries: number[] = [];
  private flak = 0;
  private lastRumble = -99;
  private said = new Set<string>();

  constructor(private engine: Engine, private world: World) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x4b4e3c, roughness: 0.55, metalness: 0.35 });
    this.mesh = new THREE.InstancedMesh(bombGeometry(), mat, MAX_BOMBS);
    this.mesh.name = 'target_bombs';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    engine.scene.add(this.mesh, createTargetSmoke());
    this.disable();
  }

  // Mission start / quit: drop all state (the next update() re-arms from the mission)
  clear() {
    this.playerControlled = false; this.pattern = null;
    this.pending = [];
    this.bombs = [];
    this.impacts = [];
    this.plumes = [];
    this.secondaries = [];
    this.released = false;
    this.active = false;
    this.mission = null;
    this.said.clear();
    this.mesh.count = 0;
    this.disable();
    setFarTerrain(null, this.world, CRUISE, FALL * DRAG_LAG);
  }

  // Bomb release: every bomber in the formation salvos its stick, the lead ship first
  bombsAway(pattern: readonly BombImpact[] | null = null) {
    if (this.released) return;
    this.released = true;
    this.pattern = pattern;
    const w = this.world;
    this.releaseT = w.time;
    const bombers = w.bombers().filter((b) => b.alive);
    bombers.forEach((b, j) => {
      // the box toggles on the leader: wingmen a beat later, low element later still
      const delay = Math.min(2.4, j * 0.17) + Math.random() * 0.35;
      for (let i = 0; i < STICK; i++) this.pending.push({ at: w.time + delay + i * STICK_GAP, bomber: b, slot: j * GROUPS + Math.min(GROUPS - 1, Math.floor(i * GROUPS / STICK)), i });
    });
    // secondary explosions in the works, well after the carpet
    this.secondaries = [6, 11.5, 19, 34].map((s) => FALL + s + Math.random() * 2);
  }

  update(dt: number, mission: Mission | null, managedRelease = false) {
    const w = this.world;
    if (mission !== this.mission || w.time < this.lastTime - 0.5) {
      this.clear();
      this.mission = mission;
      setFarTerrain(mission, w, CRUISE, FALL * DRAG_LAG);
      if (mission?.bombsAway) this.arm(mission);
    }
    this.lastTime = w.time;
    // floating origin: the engine shifted the mesh; carry the shift into the bomb positions
    if (this.mesh.position.lengthSq() > 0) {
      for (const b of this.bombs) b.pos.add(this.mesh.position);
      this.mesh.position.set(0, 0, 0);
    }
    if (!this.active || !mission?.bombsAway) return;
    const t = w.time;
    if (!this.released && !managedRelease && !this.playerControlled && t >= mission.bombsAway) this.bombsAway(); // in case the game did not call it
    const clock = this.released ? t - this.releaseT : t - mission.bombsAway;
    if (dt > 0) {
      this.releaseDue(t);
      this.fall(dt);
      this.landings(clock, dt, mission);
    }
    for (const a of w.aircraft) if (a instanceof Bomber) a.bayOpen = clock > -16 && clock < 10 && !w.bombRunHold;
    this.radio(clock, mission);
    this.draw();
    this.sync(clock, dt, mission);
  }

  private arm(m: Mission) {
    const w = this.world;
    this.active = true;
    targetUniforms.uTgtLook.value = m.targetLook ?? 0;
    // aim point: where the formation's bombs will land when released on schedule
    const ahead = CRUISE * Math.max(0, m.bombsAway! - w.time) + CRUISE * FALL * DRAG_LAG;
    this.aim.set(
      w.formationCenter.x + Atmos.originOffset.x + w.formationForward.x * ahead,
      w.formationCenter.z + Atmos.originOffset.z + w.formationForward.z * ahead);
    const a = Math.atan2(w.formationForward.x, w.formationForward.z) + 0.55;
    targetUniforms.uTgtRot.value.set(Math.cos(a), Math.sin(a));
    const river = targetRiverAxis();   // the real map: the city's streets and docks follow its river
    if (river) targetUniforms.uTgtRot.value.copy(river);
    targetUniforms.uTgt.value.set(this.aim.x, this.aim.y, CITY_R, 1);
  }

  private disable() {
    targetUniforms.uTgt.value.w = 0;
    targetUniforms.uTgtLook.value = 0;
    targetUniforms.uTgtClock.value = -1000;
    targetUniforms.uFlakGround.value = 0;
    for (const v of targetUniforms.uImpacts.value) v.set(0, 0, 0, 0);
    for (const v of targetUniforms.uPlumes.value) v.set(0, 0, 0, 0);
    targetUniforms.uImpBound.value.set(0, 0, 0);
    cloudTargetUniforms.uGap.value.set(0, 0, 0, 0);
    cloudTargetUniforms.uGlow.value.set(0, 0, 1, 0);
    this.flak = 0;
  }

  private releaseDue(t: number) {
    if (!this.pending.length) return;
    const w = this.world;
    const center = w.formationCenter;
    const fwd = w.formationForward;
    this.pending = this.pending.filter((p) => {
      if (t < p.at) return true;
      const b = p.bomber;
      if (!b.alive) return false;
      const pos = b.localToWorld(new THREE.Vector3(R() * 0.2, -1.7, 1.0 - (p.i % 4) * 0.35));
      if (this.bombs.length < MAX_BOMBS) {
        this.bombs.push({ pos, vel: b.vel.clone().add(new THREE.Vector3(R() * 0.4, -1.2 - Math.random() * 0.6, R() * 0.3)), age: 0 });
      }
      // where this bomb lands, relative to the aim point: below the formation one fall later,
      // with the box's spread opened out (a real carpet is wider than the formation) and
      // each stick walking along the track
      const side = _s.set(fwd.z, 0, -fwd.x);
      const rel = _v.copy(pos).sub(center);
      const lat = rel.dot(side) * 2.6 + R() * 70;
      const along = rel.dot(fwd) * 1.6 + (p.i - STICK / 2) * 55 + R() * 60 + CRUISE * FALL * DRAG_LAG;
      const x = this.pattern?.[p.slot]?.x ?? center.x + Atmos.originOffset.x - this.aim.x + side.x * lat + fwd.x * along;
      const z = this.pattern?.[p.slot]?.z ?? center.z + Atmos.originOffset.z - this.aim.y + side.z * lat + fwd.z * along;
      if (p.slot < TGT_IMPACTS - SECONDARY) {
        const imp = this.impacts[p.slot];
        if (!imp) {
          this.impacts[p.slot] = { x, z, t: t - this.releaseT + FALL + Math.random() * 0.3, r: 60, n: 1, heard: false };
          if (p.slot % 5 === 0 && this.plumes.length < TGT_PLUMES - 2) this.plumes.push({ slot: p.slot, t: t - this.releaseT + FALL + 1, s: 1 });
        } else {
          imp.x = (imp.x * imp.n + x) / (imp.n + 1);
          imp.z = (imp.z * imp.n + z) / (imp.n + 1);
          imp.n++;
          imp.r = 55 + imp.n * 16;
        }
      }
      return false;
    });
  }

  private fall(dt: number) {
    const k = 9.81 / (280 * 280); // terminal velocity ~280 m/s
    this.bombs = this.bombs.filter((b) => {
      b.age += dt;
      const sp = b.vel.length();
      b.vel.addScaledVector(b.vel, -k * sp * dt);
      b.vel.y -= 9.81 * dt;
      b.pos.addScaledVector(b.vel, dt);
      b.pos.x += weatherNow.windX * dt; b.pos.z += weatherNow.windZ * dt;
      return b.age < FALL && b.pos.y > 200;
    });
  }

  // Impacts as they land: rumble on the interphone, secondaries in the works
  private landings(clock: number, dt: number, m: Mission) {
    if (!this.released) return;
    for (const imp of this.impacts) {
      if (!imp || imp.heard || clock < imp.t) continue;
      imp.heard = true;
      if (clock - this.lastRumble > 0.22) {
        this.lastRumble = clock;
        sound.play('explosionFar', null, { gain: 0.32, rate: 0.3 + Math.random() * 0.12, reverb: 1 });
      }
    }
    for (let i = 0; i < this.secondaries.length; i++) {
      const st = this.secondaries[i];
      if (clock < st || clock - dt >= st) continue;
      const landed = this.impacts.filter((x): x is Impact => !!x);
      const base = landed[Math.floor(Math.random() * landed.length)];
      const slot = TGT_IMPACTS - SECONDARY + i;
      const x = (base?.x ?? 0) + R() * 220, z = (base?.z ?? 0) + R() * 220;
      this.impacts[slot] = { x, z, t: st, r: 150 + Math.random() * 60, n: 1, heard: true };
      if (this.plumes.length < TGT_PLUMES) this.plumes.push({ slot, t: st + 0.5, s: 1.4 });
      sound.play('explosionFar', null, { gain: 0.45, rate: 0.26 + Math.random() * 0.08, reverb: 1 });
      if (i === 1) this.say('secondary', m.role === 'gunner' ? 'Tail' : 'Big Friend', 'Secondary explosion! Something big just went up down there!', 3);
    }
  }

  private say(key: string, speaker: string, text: string, priority = 2) {
    if (this.said.has(key)) return;
    this.said.add(key);
    this.world.callout('tgt_' + key, speaker, text, 0, priority);
  }

  private radio(clock: number, m: Mission) {
    const gunner = m.role === 'gunner';
    if (clock > -16 && clock < -10 && gunner && !this.world.bombRunHold) this.say('doors', 'Bombardier', 'Bomb bay doors coming open. Hold her steady…', 3);
    if (!this.released) return;
    const first = Math.min(...this.impacts.filter((x): x is Impact => !!x).map((x) => x.t));
    if (!Number.isFinite(first)) return;
    if (!this.pattern && clock > first + 1.2) this.say('hit', gunner ? 'Ball Turret' : 'Big Friend', gunner ? 'Look at that… we hit it square!' : 'Bombs on target! Look at it burn!', 3);
    if (!this.pattern && clock > first + 9 && gunner) this.say('burn', 'Tail', 'Smoke all the way to the river. The whole works is burning!', 2);
  }

  // Instance matrices: aligned with the fall, scaled up with range so a bomb stays ~1.5 px
  // wide until it is a few kilometres away, then shrinks to nothing in the haze
  private draw() {
    const cam = this.engine.camera;
    const pxA = (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / Math.max(1, this.engine.renderer.domElement.height);
    let n = 0;
    for (const b of this.bombs) {
      const dist = b.pos.distanceTo(cam.position);
      const s = THREE.MathUtils.clamp((dist * pxA * 1.5) / 0.4, 1, 3.5);
      _q.setFromUnitVectors(Z, _v.copy(b.vel).normalize());
      _m.compose(b.pos, _q, _s.setScalar(s));
      this.mesh.setMatrixAt(n++, _m);
    }
    this.mesh.count = n;
    if (n) this.mesh.instanceMatrix.needsUpdate = true;
  }

  private sync(clock: number, dt: number, m: Mission) {
    syncTargetSmoke();
    const u = targetUniforms;
    u.uTgt.value.set(this.aim.x, this.aim.y, CITY_R, 1);
    u.uTgtClock.value = clock;
    u.uTgtWind.value.set(Atmos.wind.x, Atmos.wind.z);
    // flak batteries fire through the flak window (eased in and out)
    const fl = this.world.bombRunHold || (m.flak && this.world.flakIntensity > 0) ? 1 : 0;
    this.flak += (fl - this.flak) * Math.min(1, dt * 0.8);
    u.uFlakGround.value = this.flak < 0.01 ? 0 : this.flak;
    let glow = 0;
    // bounding circle of every impact's flash, scar and pall (lets most pixels skip the loop)
    let cx = 0, cz = 0, cn = 0;
    for (const imp of this.impacts) if (imp) { cx += imp.x; cz += imp.z; cn++; }
    if (cn) { cx /= cn; cz /= cn; }
    let br = 0;
    const wind = Math.hypot(Atmos.wind.x, Atmos.wind.z);
    for (let i = 0; i < TGT_IMPACTS; i++) {
      const imp = this.impacts[i];
      const v = u.uImpacts.value[i];
      if (!imp) { v.set(0, 0, 0, 0); continue; }
      v.set(imp.x, imp.z, imp.t, imp.r);
      const age = clock - imp.t;
      const pall = 3 * (imp.r * 1.3 + 22 * Math.sqrt(Math.max(0, age))) + wind * Math.min(Math.max(0, age), 120) * 0.7;
      br = Math.max(br, Math.hypot(imp.x - cx, imp.z - cz) + Math.max(imp.r * 6, pall));
      if (age > 0) glow += Math.exp(-age * 2.5) * 0.5 + 0.03 * Math.exp(-age / 300);
    }
    u.uImpBound.value.set(cx, cz, br);
    for (let k = 0; k < TGT_PLUMES; k++) {
      const p = this.plumes[k];
      const v = u.uPlumes.value[k];
      const imp = p ? this.impacts[p.slot] : null;
      if (!p || !imp) {
        // Earlier waves: two permanent columns in the existing warmed smoke batch.
        if (k >= TGT_PLUMES - 2) v.set(k === TGT_PLUMES - 2 ? -600 : 500, -350, -180, 1.2);
        else v.set(0, 0, 0, 0);
        continue;
      }
      v.set(imp.x, imp.z, p.t, p.s);
    }
    // the deck parts over the target; fires light it from below
    const lx = this.aim.x - Atmos.originOffset.x, lz = this.aim.y - Atmos.originOffset.z;
    cloudTargetUniforms.uGap.value.set(lx, lz, 4800, bombingOvercast(weatherNow.cloud, weatherNow.mood) ? 0.08 : this.playerControlled ? 0.5 + 0.35 * Math.sin(this.world.time * 0.3) : 0.85);
    cloudTargetUniforms.uGlow.value.set(lx, lz, 3200, Math.min(1.5, glow * 0.25));
  }
}

import * as THREE from 'three';
import type { Fighter, HitZone } from './Aircraft';
import type { Effects } from './Effects';
import type { ParticleOpts, ParticleSystem } from '../render/Particles';
import { ENEMY_SCALE } from './World';
import type { HitEvent } from './Ballistics';
import { hitPanel } from './DamagePanel';
import { access } from '../core/Accessibility';
import { deathOwned } from './FighterDeath';

// Staged battle damage on enemy fighters, driven by structureFrac:
//   >85% clean, <=85% grey wisps, <=65% engine smoke + torn skin, <=45% oily black
//   trail, sputtering engine, flickering fire, wobble, <=25% burning hard, embers.
// Crossing a stage throws off debris once. All emitters are throttled to fixed ticks,
// thinned with distance and skipped beyond FAR; no allocations on the per-frame path.

const STAGE_AT = [0.85, 0.65, 0.45, 0.25]; // structureFrac at which stages 1..4 begin
const TICK = 0.05;       // s between emitter ticks (near)
const TICK_MID = 0.1;    // s between ticks beyond MID
const MID = 1200;        // m
const FAR = 2500;        // m: no emission at all beyond this
const SMOKE_SOFT = 6500; // smoke pool (9000) fill above which continuous smoke is thinned
const SMOKE_HARD = 8200; // ... and stopped
const GLOW_HARD = 4300;  // glow pool (5000)
const MAX_HOLES = 7;
const FALL_EMIT = 8;     // s a shot-down (burning) fighter keeps the stage-4 column going

// Torn skin: bare-metal rim around a black hole; embers once it burns. One shared
// geometry, three shared materials made at load. MeshStandardMaterial, front side, no
// maps: the same shader program as the Effects debris (pre-warmed), so no compile.
const HOLE_GEO = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 7).rotateX(Math.PI / 2);
const decalMat = (color: number, rough: number, metal: number) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const RIM_MAT = decalMat(0x4d4a44, 0.62, 0.5);   // sooty torn metal, not a bright outline (as PlayerBomberDamage)
const HOLE_MAT = decalMat(0x0b0a09, 1, 0);
const EMBER_MAT = decalMat(0x0b0a09, 1, 0);
EMBER_MAT.emissive.setRGB(3.2, 0.9, 0.12); // linear HDR, blooms
let emberTime = -1;

// Colours (no per-spawn tuples)
const C_WISP: [number, number, number] = [0.8, 0.79, 0.77];
const C_GREY: [number, number, number] = [0.4, 0.39, 0.38];
const C_GREY1: [number, number, number] = [0.55, 0.54, 0.53];
const C_OIL: [number, number, number] = [0.06, 0.055, 0.05];
const C_OIL1: [number, number, number] = [0.13, 0.12, 0.115];
const C_COLUMN: [number, number, number] = [0.035, 0.03, 0.028];
const C_PAINT: [number, number, number] = [0.6, 0.55, 0.46];
const C_FRAG: [number, number, number] = [0.07, 0.065, 0.06];
const C_FLASH: [number, number, number] = [38, 24, 9];
const C_SPARK: [number, number, number] = [30, 18, 6];
const C_SPARK1: [number, number, number] = [8, 2, 0.5];
const C_FLAME: [number, number, number] = [10, 4, 0.9];
const C_FLAME1: [number, number, number] = [2, 0.4, 0.05];
const C_POP: [number, number, number] = [16, 7, 1.6];

// Model-local (unscaled) emitter points, Fw 190 layout: +Z nose, +X left wing
const ENG_SMOKE = new THREE.Vector3(0, 0.3, 0.75);  // top of the cowling, behind the prop
const ENG_FIRE = new THREE.Vector3(0.6, -0.05, 1.55); // exhaust stacks (x mirrored)

interface Hole { obj: THREE.Mesh; zone: number }

interface State {
  stage: number;
  acc: number;
  sputter: number;   // s until the next engine cough / small explosion
  wobble: number;    // 0..1
  phase: number;
  hp: Float32Array;  // zone hp at the last update, to find where hits landed
  recent: number;    // zone index that lost hp most recently, -1 none
  holes: Hole[];
  skin: THREE.Mesh[]; // airframe meshes holes are cut into
  glass: THREE.Object3D | null;
  baseQuat: THREE.Quaternion;
  propSpeed: Float32Array;
  propAngle: Float32Array;
  holeCount: number;
}

const states = new WeakMap<Fighter, State>();

// scratch
const _l = new THREE.Vector3();
const _w = new THREE.Vector3();
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _z = new THREE.Vector3(0, 0, 1);
const _ray = new THREE.Raycaster();
const R = () => Math.random() * 2 - 1;
const O: ParticleOpts = { pos: _p, life: 1, size0: 1, size1: 1, color0: C_GREY };

function emit(sys: ParticleSystem, pos: THREE.Vector3, vel: THREE.Vector3 | undefined, life: number, s0: number, s1: number,
  c0: [number, number, number], c1: [number, number, number] | undefined, a0: number, a1: number,
  frame: number, drag: number, rise: number, lit: boolean, rotVel?: number) {
  O.pos = pos; O.vel = vel; O.life = life; O.size0 = s0; O.size1 = s1; O.color0 = c0; O.color1 = c1;
  O.alpha0 = a0; O.alpha1 = a1; O.frame = frame; O.drag = drag; O.rise = rise; O.lit = lit; O.rotVel = rotVel;
  sys.spawn(O);
}

export const stageOf = (frac: number) => {
  let s = 0;
  while (s < 4 && frac <= STAGE_AT[s]) s++;
  return s;
};

// Called from DamageLook.setup, after the enemy is scaled.
export function setup(f: Fighter) {
  if (states.has(f)) return;
  const skin: THREE.Mesh[] = [];
  let airframe: THREE.Object3D | null = null;
  f.model.traverse((o) => { if (!airframe && o.name === 'airframe') airframe = o; });
  (airframe ?? f.model).traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.geometry.type === 'CircleGeometry') return;
    for (let p: THREE.Object3D | null = m; p && p !== f.model; p = p.parent) if (/^prop_|^glass|^pilot|^cooling/.test(p.name)) return;
    skin.push(m);
  });
  states.set(f, {
    stage: 0, acc: Math.random() * TICK, sputter: 0.5, wobble: 0, phase: Math.random() * 100,
    hp: Float32Array.from(f.zones, (z) => z.hp), recent: -1,
    holes: Array.from({ length: MAX_HOLES }, () => {
      const rim = new THREE.Mesh(HOLE_GEO, RIM_MAT), obj = new THREE.Mesh(HOLE_GEO, HOLE_MAT);
      rim.add(obj); rim.visible = false; f.model.add(rim);
      return { obj, zone: 0 };
    }), holeCount: 0, propSpeed: new Float32Array(f.props.length).fill(70), propAngle: Float32Array.from(f.propSpin), skin, glass: f.model.getObjectByName('glass') ?? null, baseQuat: f.model.quaternion.clone(),
  });
}

// 0..1 handling degradation from damage (0 above 45% structure). For the flight/AI code.
export function damageWobble(f: Fighter) { return states.get(f)?.wobble ?? 0; }

export function damageStage(f: Fighter) { return states.get(f)?.stage ?? 0; }

// Per-frame, for every fighter (no-op unless set up).
export function update(f: Fighter, dt: number, worldTime: number, fx: Effects, listener: THREE.Vector3 | null) {
  const st = states.get(f);
  if (!st || f.remove) return;
  const dist = listener ? f.pos.distanceTo(listener) : 0;
  const near = dist < FAR;

  // shared ember glow flickers once per frame
  if (emberTime !== worldTime) {
    emberTime = worldTime;
    EMBER_MAT.emissiveIntensity = 0.7 + 0.3 * Math.sin(worldTime * 23) * Math.sin(worldTime * 7.3);
  }

  // where did hits land since last frame?
  const zones = f.zones;
  for (let i = 0; i < zones.length; i++) {
    if (zones[i].hp < st.hp[i]) st.recent = i;
    st.hp[i] = zones[i].hp;
  }
  // Props lose the blur disc as the engine coughs, then windmill or seize.
  for (let i = 0; i < f.props.length; i++) {
    let hp = 1;
    for (const z of zones) if (z.engine === i) hp = Math.max(0, z.hp / z.maxHp);
    const failed = f.engineDead[i] || !f.alive;
    const target = failed ? (hp <= 0 ? 0 : 6) : hp < 0.45 ? 9 + hp * 24 : 70;
    st.propSpeed[i] += (target - st.propSpeed[i]) * (1 - Math.exp(-dt * 2));
    st.propAngle[i] += st.propSpeed[i] * dt;
    if (target === 70) continue;
    const prop = f.props[i];
    prop.node.quaternion.copy(prop.base).multiply(_q.setFromAxisAngle(_z, st.propAngle[i]));
    prop.disc.visible = st.propSpeed[i] > 20;
    for (const blade of prop.blades) blade.visible = !prop.disc.visible;
  }

  if (!f.alive) {
    // burning spin down: keep the stage-4 fire and column so the death reads continuous
    if (f.falling && near && f.fallTime < FALL_EMIT && !deathOwned(f)) {
      st.acc += dt;
      if (st.acc >= TICK) { st.acc = 0; emitStage(f, st, 4, fx, dt, true); }
    }
    return;
  }

  // stage crossings: one-off bursts and torn skin (all crossed stages, even if skipped)
  const stage = stageOf(f.structureFrac);
  while (st.stage < stage) {
    st.stage++;
    cross(f, st, st.stage, fx, near);
  }

  // wobble (visual only: the model sways inside its root, flight path untouched)
  st.wobble = stage >= 3 ? 0.25 + 0.75 * Math.min(1, (STAGE_AT[2] - f.structureFrac) / STAGE_AT[2]) : 0;
  if (st.wobble > 0) {
    const t = worldTime + st.phase, w = st.wobble;
    _e.set(0.025 * w * Math.sin(t * 2.9), 0.035 * w * Math.sin(t * 1.7), 0.07 * w * Math.sin(t * 2.1) + 0.03 * w * Math.sin(t * 5.3));
    f.model.quaternion.copy(st.baseQuat).multiply(_q.setFromEuler(_e));
  }

  if (stage === 0 || !near) return;
  st.acc += dt;
  const tick = dist > MID ? TICK_MID : TICK;
  if (st.acc < tick) return;
  const step = st.acc;
  st.acc = 0;
  emitStage(f, st, stage, fx, step, false);
}

// The ballistic sphere is larger than the skin. Project the entry onto the actual
// panel, with a zone-centre fallback for aim-assisted grazing rounds. Event-only rays.
export function impact(f: Fighter, e: HitEvent, fx: Effects, listener: THREE.Vector3 | null) {
  const st = states.get(f);
  const dist = listener ? f.pos.distanceTo(listener) : 0;
  if (!st || dist > FAR) return;
  f.root.updateMatrixWorld(true);
  _n.copy(e.bulletVel).sub(f.vel).normalize();
  if (_n.lengthSq() < 0.1) _n.copy(f.pos).sub(e.point).normalize();
  _p.copy(e.point).addScaledVector(_n, -f.radius * 2);
  _ray.set(_p, _n); _ray.far = f.radius * 4;
  if (!hitPanel(st.skin, _ray.ray, _ray.far, _w)) {
    f.localToWorld(e.zone.offset, _w);
    _ray.ray.direction.copy(_w).sub(_p).normalize();
    if (!hitPanel(st.skin, _ray.ray, _ray.far, _w)) _w.copy(e.point);
  }
  const scale = Math.min(2.4, Math.max(0.65, dist / 300));
  if (fx.glow.count < GLOW_HARD) {
    emit(fx.glow, _w, f.vel, 0.07, scale, scale * 1.8, C_FLASH, undefined, access.flash, 0, 1, 0, 0, false);
    for (let i = 0; i < 3; i++) {
      _v.set(R(), R(), R()).multiplyScalar(22).add(f.vel);
      emit(fx.glow, _w, _v, 0.18, scale * 0.3, 0.08, C_SPARK, C_SPARK1, access.flash, 0, 1, 2.5, -9, false);
    }
  }
}

// All damage decal variants are rendered during World.prewarm (including hot embers).
export function warmDamageStages(scene: THREE.Scene, at: THREE.Vector3) {
  const meshes = [RIM_MAT, HOLE_MAT, EMBER_MAT].map(mat => {
    const mesh = new THREE.Mesh(HOLE_GEO, mat); mesh.position.copy(at); scene.add(mesh); return mesh;
  });
  return () => { for (const mesh of meshes) mesh.removeFromParent(); };
}

// One-off on entering a stage
function cross(f: Fighter, st: State, stage: number, fx: Effects, near: boolean) {
  const k = ENEMY_SCALE / 2.4;
  const zi = st.recent >= 0 ? st.recent : worstZone(f);
  const z = f.zones[zi];
  // torn skin: 1 patch at 85%, 2 more at 65% and 45%, 2 more at 25%
  const add = stage === 1 ? 1 : 2;
  for (let i = 0; i < add; i++) tearSkin(f, st, i === 0 ? zi : worstZone(f, zi), stage);
  if (stage === 3 && st.glass?.visible) st.glass.visible = false; // canopy shot away
  if (stage === 4) for (let i = 0; i < st.holeCount; i++) st.holes[i].obj.material = EMBER_MAT;
  if (!near) return;
  f.localToWorld(z.offset, _w);
  if (stage === 1) {
    fx.spawnDebris(_w, f.vel, 2, false, undefined, k * 1.5);
    for (let i = 0; i < 3; i++) {
      _v.set(R(), R(), R()).multiplyScalar(8).add(f.vel);
      emit(fx.smoke, _w, _v, 1.4, 1 * k, 4.5 * k, C_PAINT, undefined, 0.65, 0, 0, 1.8, 0, true);
    }
  } else if (stage === 2) {
    fx.spawnDebris(_w, f.vel, 5, false, undefined, k * 1.5);
    fx.sparks(_w, f.vel, false);
    for (let i = 0; i < 4; i++) {
      _v.set(R(), R(), R()).multiplyScalar(10).add(f.vel);
      emit(fx.smoke, _w, _v, 2, 1.5 * k, 6.5 * k, C_GREY, undefined, 0.75, 0, 0, 1.5, 0, true);
    }
  } else if (stage === 3) {
    fx.spawnDebris(_w, f.vel, 4, false, undefined, k * 1.5);
    fx.sparks(_w, f.vel, true);
    if (st.glass) {
      // perspex shards glinting off the cockpit
      f.localToWorld(_l.set(0, 0.7, -1.3).multiplyScalar(ENEMY_SCALE), _p);
      for (let i = 0; i < 6; i++) {
        _v.set(R(), R() + 0.8, R()).normalize().multiplyScalar(12 + Math.random() * 18).add(f.vel);
        emit(fx.glow, _p, _v, 0.5 + Math.random() * 0.4, 0.35 * k, 0.15 * k, C_FLASH, C_SPARK1, 0.6, 0, 1, 1.2, -9, false);
      }
    }
  } else {
    f.localToWorld(_l.copy(ENG_SMOKE).multiplyScalar(ENEMY_SCALE), _p);
    fx.spawnDebris(_p, f.vel, 6, true, undefined, k * 1.5);
    fx.sparks(_p, f.vel, true);
    emit(fx.glow, _p, f.vel, 0.3, 4 * k, 9 * k, C_POP, C_FLAME1, 1, 0, 2, 2, 0, false, 2);
  }
}

// Continuous emitters for the current stage; dt = time since the last tick
function emitStage(f: Fighter, st: State, stage: number, fx: Effects, dt: number, falling: boolean) {
  const k = ENEMY_SCALE / 2.4;
  const smokeOk = fx.smoke.count < SMOKE_HARD && (fx.smoke.count < SMOKE_SOFT || Math.random() < 0.5);
  const glowOk = fx.glow.count < GLOW_HARD;
  _v.copy(f.vel).multiplyScalar(0.25); // trail drifts behind, carried a little
  f.localToWorld(_l.copy(ENG_SMOKE).multiplyScalar(ENEMY_SCALE), _w);

  // light wisps from the damaged area (stages 1-2), from a hole if there is one
  if (stage <= 2 && smokeOk && Math.random() < (stage === 1 ? 0.45 : 0.6)) {
    wispPoint(f, st, _p);
    _n.set(R(), R() + 0.3, R()).multiplyScalar(2).add(_v);
    emit(fx.smoke, _p, _n, stage === 1 ? 2.2 : 3, 0.6 * k, (stage === 1 ? 3.5 : 5) * k, stage === 1 ? C_WISP : C_GREY1, undefined,
      stage === 1 ? 0.32 : 0.42, 0, 0, 0.8, 0.4, true);
  }

  if (stage >= 2 && smokeOk) for (const z of f.zones) {
    if (z.engine === undefined && z.name !== 'engine') continue;
    f.localToWorld(z.offset, _p);
    _n.copy(f.vel).multiplyScalar(0.68); _n.y -= 2;
    emit(fx.smoke, _p, _n, 1.3, 0.3 * k, 1.2 * k,
      stage >= 3 ? C_OIL : C_WISP, undefined, 0.65, 0, 0, 0.2, -2, true);
  }

  if (stage === 2 && smokeOk) {
    // darker continuous engine smoke
    emit(fx.smoke, _w, _v, 6, 1.3 * k, 8 * k, C_GREY, C_GREY1, 0.55, 0, 0, 0.6, 0.4, true);
  }

  if (stage === 3) {
    // oily black trail, chugging: the engine coughs out a fat puff every so often
    if (smokeOk && Math.random() < 0.8) emit(fx.smoke, _w, _v, 9, 1.6 * k, 12 * k, C_OIL, C_OIL1, 0.78, 0, 0, 0.6, 0.35, true);
    st.sputter -= dt;
    if (st.sputter <= 0) {
      st.sputter = 0.3 + Math.random() * 0.6;
      if (smokeOk) for (let i = 0; i < 3; i++) {
        _n.set(R(), R(), R()).multiplyScalar(5).add(_v);
        emit(fx.smoke, _w, _n, 3.5, 2 * k, 7 * k, C_OIL, C_OIL1, 0.9, 0, 0, 1.4, 0.3, true);
      }
      if (glowOk) emit(fx.glow, _w, f.vel, 0.12, 1.6 * k, 2.6 * k, C_POP, C_FLAME1, 1, 0, 2, 0, 0, false, 2);
    }
    // flickering flame licking out of the exhaust stacks
    if (glowOk && Math.random() < 0.55) {
      f.localToWorld(_l.copy(ENG_FIRE).multiplyScalar(ENEMY_SCALE), _p);
      if (Math.random() < 0.5) { f.localToWorld(_l.set(-ENG_FIRE.x, ENG_FIRE.y, ENG_FIRE.z).multiplyScalar(ENEMY_SCALE), _p); }
      emit(fx.glow, _p, _v, 0.2 + Math.random() * 0.15, 1.3 * k, 0.5 * k, C_FLAME, C_FLAME1, 1, 0, 2, 0, 0, false, 3);
    }
  }

  if (stage === 4) {
    // heavy fire: flames streaming back from the cowling, a dense black column behind
    if (glowOk) for (let i = 0; i < 3; i++) {
      _p.copy(_w).addScaledVector(f.vel, -Math.random() * 0.03);
      _p.x += R() * 0.6 * k; _p.y += R() * 0.4 * k;
      emit(fx.glow, _p, _v, 0.45 + Math.random() * 0.35, 2.4 * k, 0.8 * k, C_FLAME, C_FLAME1, 1, 0, 2, 0, 0, false, 3);
    }
    if (smokeOk) {
      emit(fx.smoke, _w, _v, 10, 2.4 * k, 15 * k, C_COLUMN, C_OIL1, 0.92, 0, 0, 0.6, 0.3, true);
      if (Math.random() < 0.6) emit(fx.smoke, _w, _v, 7, 3 * k, 11 * k, C_COLUMN, C_OIL1, 0.85, 0, 0, 0.9, 0.3, true);
    }
    // embers / glowing skin around the holes
    if (glowOk && st.holeCount && Math.random() < 0.7) {
      st.holes[(Math.random() * st.holeCount) | 0].obj.getWorldPosition(_p);
      _n.set(R(), R() + 0.5, R()).multiplyScalar(4).add(_v);
      emit(fx.glow, _p, _n, 0.35, 1.1 * k, 0.4 * k, C_FLAME, C_FLAME1, 1, 0, 2, 0.5, 0, false, 4);
    }
    // frequent small explosions popping somewhere on the airframe
    st.sputter -= dt;
    if (st.sputter <= 0 && !falling) {
      st.sputter = 0.25 + Math.random() * 0.45;
      const z = f.zones[(Math.random() * f.zones.length) | 0];
      _l.set(R(), R(), R()).multiplyScalar(z.radius * 0.4).add(z.offset);
      f.localToWorld(_l, _p);
      if (glowOk) {
        emit(fx.glow, _p, f.vel, 0.14, 2.5 * k, 5.5 * k, C_FLASH, C_FLAME1, 1, 0, 1, 0, 0, false);
        for (let i = 0; i < 5; i++) {
          _n.set(R(), R(), R()).normalize().multiplyScalar(20 + Math.random() * 35).add(f.vel);
          emit(fx.glow, _p, _n, 0.25 + Math.random() * 0.25, 0.4 * k, 0.1 * k, C_SPARK, C_SPARK1, 1, 0, 1, 2.5, -9, false);
        }
      }
      if (smokeOk) emit(fx.smoke, _p, _v, 2.5, 1.5 * k, 6 * k, C_OIL, C_OIL1, 0.85, 0, 0, 1.2, 0.3, true);
    }
  }
}

function wispPoint(f: Fighter, st: State, out: THREE.Vector3) {
  if (st.holeCount) {
    st.holes[(Math.random() * st.holeCount) | 0].obj.getWorldPosition(out);
    return;
  }
  const z = f.zones[st.recent >= 0 ? st.recent : 0];
  _l.copy(z.offset);
  _l.y += z.radius * 0.5;
  f.localToWorld(_l, out);
}

function worstZone(f: Fighter, not = -1) {
  let best = 0, bestFrac = 2;
  for (let i = 0; i < f.zones.length; i++) {
    if (i === not) continue;
    const z = f.zones[i];
    const frac = z.hp / z.maxHp + Math.random() * 0.15; // ties broken at random
    if (frac < bestFrac) { bestFrac = frac; best = i; }
  }
  return best;
}

// Cut a torn patch into the skin over a zone: ray-cast onto the airframe from outside
// (event-only, a few hundred triangles) and seat a rim + hole there, model-parented so
// it rides along and is carried onto the wreck pieces by Wrecks' clone.
function tearSkin(f: Fighter, st: State, zi: number, stage: number) {
  if (st.holeCount >= MAX_HOLES || !st.skin.length) return;
  const z = f.zones[zi];
  const sc = f.model.scale.x;
  const wing = z.name.startsWith('wing');
  // outward direction in model space: wings from above/below, the body from around
  if (wing) _n.set(R() * 0.3, Math.random() < 0.7 ? 1 : -1, R() * 0.3);
  else _n.set(R(), R() * 0.8 + 0.35, R() * 0.25);
  _n.normalize();
  f.root.updateMatrixWorld(true);
  const rr = (0.6 * z.radius) / sc; // spread patches over the zone
  _l.copy(z.offset).divideScalar(sc).addScaledVector(_n, z.radius / sc + 2.5);
  _l.x += R() * rr * (wing ? 1 : 0.3); _l.z += R() * rr;
  f.model.localToWorld(_p.copy(_l));
  _w.copy(_n).transformDirection(f.model.matrixWorld).negate();
  _ray.set(_p, _w);
  _ray.far = z.radius * 2 + 2.5 * sc;
  if (!hitPanel(st.skin, _ray.ray, _ray.far, _p, _w)) return;
  // into model space: position and outward surface normal
  _m.copy(f.model.matrixWorld).invert();
  _p.applyMatrix4(_m);
  _w.transformDirection(_m);
  if (_w.dot(_n) < 0) _w.negate();
  _p.addScaledVector(_w, 0.012);
  const size = (stage <= 1 ? 0.35 : stage === 2 ? 0.5 : 0.6) * (0.8 + Math.random() * 0.4);
  const h = st.holes[st.holeCount++];
  h.zone = zi;
  const rim = h.obj.parent as THREE.Mesh;
  rim.visible = true;
  rim.position.copy(_p);
  rim.quaternion.setFromUnitVectors(_z, _w).multiply(_q.setFromAxisAngle(_z, Math.random() * Math.PI));
  rim.scale.set(size * (1 + Math.random() * 0.5), size, 1);
  const hole = h.obj;
  hole.material = stage >= 4 ? EMBER_MAT : HOLE_MAT;
  hole.position.set(0, 0, 0.02);
  hole.scale.set(0.72, 0.62 + Math.random() * 0.2, 1);
  hole.rotation.z = Math.random() * Math.PI;
  rim.castShadow = hole.castShadow = false;
}

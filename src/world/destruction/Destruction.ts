import * as THREE from 'three';
import type { World } from '../World';
import { WRECK_FLOOR, type Aircraft, type Fighter } from '../Aircraft';
import type { HitEvent } from '../Ballistics';
import { sound } from '../../audio/Sound';
import { claimDeath, ejectPilot } from '../FighterDeath';
import { Body } from './Aero';
import { Structure, planEnding, EV_DETACH, EV_EXPLODE, EV_IGNITE, type Plan } from './FailureModel';
import { CORE, FATAL, HP_SHARE, NOSE, PARENT, PART_COUNT, PART_ZONE, TAIL, isWing, kindSpec, sideOf, subtree } from './Parts';
import { sourceMeshes, splitOf, type Chunk, type SplitModel } from './Split';

// Physical destruction of the enemy aircraft (Phase 10 goal 09).
//
//   hit location  every round is booked to the structural part it lands on (Parts.ts) in the
//                 failure model (FailureModel.ts): parts fail, tanks catch fire, fire spreads,
//                 burns parts through and cooks the tanks off
//   separation    a failed part comes off as a rigid body cut from the real mesh along the part
//                 boundary (Split.ts). The aircraft flies on without it (a lost wingtip) or falls
//                 as a hulk; both fly flat-plate physics (Aero.ts): the hulk rolls toward a
//                 missing wing and autorotates, noses over without its tail; panels flutter,
//                 engines drop
//   explosion     a tank going up shatters its part into shards and throws the others off whole
//   bail-out      a doomed aircraft's pilot gets out: before the kill when a fuel fire is beyond
//                 saving, or from the falling hulk
//   debris        heavy pieces can strike other aircraft (rare: it takes a near miss)
//
// Which ending a kill gets stays with FighterDeath, which asks plan() first. Pieces are pooled
// (POOL roots, their meshes reused); geometry is shared per model kind; the dead aircraft hands its
// own material copies to its pieces (a lease, disposed with the last of them). Per frame: no
// allocations; emitters on fixed ticks, thinned with range and capped by the particle pools.
// Co-op: bits() / applyBits() carry the part state in snapshots, deathCode() / forceDeath() the ending.

const POOL = 72;
const TICK = 0.05, TICK_MID = 0.1, MID = 1200, FAR = 2600;
const SMOKE_HARD = 8200, GLOW_HARD = 4300;
const PART_LIFE = 18, SHARD_LIFE = 9;
const FIRE_STRUCT = 16;      // structure per second a full fuel fire eats (credited like World.fires)
const HIT_MASS = 120;        // kg: lighter pieces hurt nobody
const WING_INC = 0.07;       // rad: wing rigging incidence plus the trimmed angle of attack
const ALL = (1 << PART_COUNT) - 1;

interface Lease { mats: THREE.Material[]; refs: number }

interface Hulk {
  body: Body;
  offset: THREE.Vector3;       // centre of mass in the root frame (scaled)
  modelQ: THREE.Quaternion;    // the model's rotation inside its root
  mask: number;                // parts still on it
  age: number;
  bailAt: number;              // s; Infinity: nobody gets out
  lost: number;                // the part that came off (its torn joint smokes and burns)
  jointFire: boolean;
  acc: number;
  last: THREE.Vector3;
  hasLast: boolean;
}

interface St {
  f: Fighter;
  s: Structure;
  split: SplitModel;
  mats: THREE.Material[];      // per source primitive: the aircraft's own material copies
  live: THREE.Mesh[][] | null; // per part, its meshes on the aircraft once the airframe is split
  plan: Plan;
  code: number;                // the ending that played (co-op), -1 none yet
  forced: number;              // co-op guest: the host's ending, -1 none
  bailAt: number;              // alive and doomed: when the pilot gives up (0: not scheduled)
  forceBail: boolean;
  hulk: Hulk | null;
  lease: Lease | null;         // held by the aircraft until it is removed
  acc: number;
  last: Float32Array;          // per part: the last fire emission point (world), for a continuous ribbon
  hasLast: number;             // bit per part
}

interface Piece {
  root: THREE.Group;
  frame: THREE.Group;          // the model frame (scaled), offset so the root pivots on the centre of mass
  meshes: THREE.Mesh[];
  extra: THREE.Object3D[];     // nodes carried over from the aircraft (props, tubes, skin patches)
  body: Body;
  active: boolean;
  age: number; life: number;
  fire: number; smoke: number;
  emit: THREE.Vector3;         // model frame: where it burns / smokes (its torn joint)
  com: THREE.Vector3;          // model frame
  scale: number;
  last: THREE.Vector3; hasLast: boolean; acc: number;
  lease: Lease | null;
  mass: number; size: number;
  hit: number[];               // ids of aircraft it has struck
  source: Aircraft | null;
  credit: boolean;             // the player shot the aircraft it came from
  whoosh: boolean;
  shard: boolean;
}

export interface DeathPlan { kind: 'fireball' | 'wing' | 'tail' | 'bailout' | null; part: number; bail: boolean }
export interface ForcedDeath { kind: number; part: number; bail: boolean }

const R = () => Math.random() * 2 - 1;
const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _l = new THREE.Vector3(), _c = new THREE.Vector3();
const _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _iq = new THREE.Quaternion();
const _plan: DeathPlan = { kind: null, part: -1, bail: false };
const _forced: ForcedDeath = { kind: 0, part: 0, bail: false };
const MERGED: Chunk = { subs: [], com: new THREE.Vector3(), area: 0, mass: 0, inertia: new THREE.Vector3(), ax: 0, ay: 0, az: 0, chord: 1, size: 1, tris: 0, u2: new THREE.Vector3() };

export class Destruction {
  private states = new WeakMap<Fighter, St>();
  private tracked: St[] = [];
  private hulks: St[] = [];
  private pieces: Piece[] = [];
  /** The inside of the skin: seen through the hole where a part came off. */
  readonly innerMat = new THREE.MeshStandardMaterial({ color: 0x1b1814, roughness: 0.95, metalness: 0.2 });
  readonly stats = { separations: 0, explosions: 0, shards: 0, bailouts: 0, debrisHits: 0, fires: 0 };

  constructor(private w: World) {}

  // ------------------------------------------------------------------ structure
  /** The aircraft's structure (made on first use). Axis fighters only. */
  state(f: Fighter): St | null {
    let st = this.states.get(f);
    if (st) return st;
    if (f.team !== 'axis' || !f.model) return null;
    const split = splitOf(f.kind, f.model);
    const hp: number[] = [];
    for (let p = 0; p < PART_COUNT; p++) hp.push((f.zone(PART_ZONE[p])?.maxHp ?? 150) * HP_SHARE[p]);
    st = {
      f, s: new Structure(hp, kindSpec(f.kind).fuel, Math.imul(f.id, 2654435761) >>> 0), split,
      mats: sourceMeshes(f.model).map(({ mesh }) => (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)),
      live: null, plan: { ending: 'none', part: CORE, bail: false }, code: -1, forced: -1, bailAt: 0, forceBail: false,
      hulk: null, lease: null, acc: Math.random() * TICK, last: new Float32Array(PART_COUNT * 3), hasLast: 0,
    };
    this.states.set(f, st);
    this.tracked.push(st);
    return st;
  }

  structure(f: Fighter) { return this.states.get(f)?.s ?? null; }

  /** A round struck an axis fighter (World has booked the damage to its zone). */
  onHit(f: Fighter, e: HitEvent) {
    if (f.team !== 'axis' || f.remove) return;
    const st = this.state(f);
    if (!st) return;
    f.worldToLocal(_l.copy(e.point), _l).divideScalar(f.model.scale.x);
    const part = st.split.classify(_l.x, _l.y, _l.z);
    if (st.s.hit(part, e.damage, e.cannon, e.playerShot ? this.w.playerIncendiary * 0.5 : 0, e.playerShot)) this.events(st, e.playerShot);
  }

  private events(st: St, byPlayer: boolean) {
    const s = st.s, f = st.f, n = s.nEv;
    for (let i = 0; i < n; i++) {
      const kind = s.evKind[i], part = s.evPart[i];
      if (kind === EV_IGNITE) this.ignited(st, part);
      else if (kind === EV_EXPLODE) {
        if (f.alive) this.w.killAircraft(f, s.playerFire || byPlayer, 'fuel');
        else this.explodeNow(st);
        return;
      } else if (kind === EV_DETACH) {
        // a vital part gone kills (FighterDeath then plays the break-up); a wingtip just comes off
        if (f.alive && FATAL[part]) this.w.killAircraft(f, byPlayer || s.playerFire, PART_ZONE[part]);
        if (!f.remove) this.detachLive(st, part);
      }
    }
  }

  private ignited(st: St, part: number) {
    const f = st.f, fx = this.w.effects;
    this.stats.fires++;
    if (part === NOSE) { const eng = f.zone('engine'); if (eng) eng.burning = true; }
    this.toWorld(st, st.split.parts[part].fuel, _p);
    const d = this.near(_p);
    if (d > FAR) return;
    fx.explosion(_p, f.vel, 0.28, 'small');
    fx.sparks(_p, f.vel, true);
    if (d < 900) sound.play('whump', _p, { gain: 0.8, ref: 90 });
  }

  private near(p: THREE.Vector3) { const L = this.w.listener; return L ? p.distanceTo(L) : 0; }
  /** Model-frame point -> world (matrixWorld as of the last update). */
  private toWorld(st: St, local: THREE.Vector3, out: THREE.Vector3) { return out.copy(local).applyMatrix4(st.f.model.matrixWorld); }

  // ------------------------------------------------------------------ endings (FighterDeath asks)
  /** The ending the damage calls for; kind null: nothing structural, the caller picks its own. */
  plan(f: Fighter, cause: string): DeathPlan {
    _plan.kind = null; _plan.part = -1; _plan.bail = false;
    const st = this.state(f);
    if (!st) return _plan;
    if (st.forceBail) { _plan.kind = 'bailout'; return _plan; }
    const pl = planEnding(st.s, cause, st.s.rnd(), st.s.rnd(), st.plan);
    _plan.kind = pl.ending === 'explode' ? 'fireball' : pl.ending === 'wing' ? 'wing' : pl.ending === 'tail' ? 'tail' : null;
    _plan.part = pl.part; _plan.bail = pl.bail;
    return _plan;
  }

  /** FighterDeath tells which ending played (its KINDS index), for the co-op kill event. */
  record(f: Fighter, kind: number, part: number, bail: boolean) {
    const st = this.state(f);
    if (st) st.code = (kind & 7) | ((Math.max(0, part) & 7) << 3) | (bail ? 64 : 0);
  }
  deathCode(f: Fighter) { return this.states.get(f)?.code ?? -1; }
  /** Co-op guest: play the host's ending for this aircraft. */
  forceDeath(f: Fighter, code: number) { const st = this.state(f); if (st && code >= 0) st.forced = code; }
  forcedDeath(f: Fighter): ForcedDeath | null {
    const st = this.states.get(f);
    if (!st || st.forced < 0) return null;
    _forced.kind = st.forced & 7; _forced.part = (st.forced >> 3) & 7; _forced.bail = !!(st.forced & 64);
    return _forced;
  }

  /** Part-state bits for co-op snapshots (FailureModel.bits). */
  bits(f: Fighter) { return this.states.get(f)?.s.bits() ?? 0; }
  /** Co-op guest: the host's part state. Parts that came off since come off here too; fires show. */
  applyBits(f: Fighter, b: number) {
    if (!b && !this.states.has(f)) return;
    const st = this.state(f);
    if (!st) return;
    const before = st.s.detached;
    st.s.applyBits(b);
    const gone = st.s.detached & ~before;
    if (!gone || st.s.exploded) return;
    for (let p = 0; p < PART_COUNT; p++) {
      if (!(gone & (1 << p)) || (PARENT[p] >= 0 && gone & (1 << PARENT[p]))) continue;
      this.detachLive(st, p);
    }
  }

  // ------------------------------------------------------------------ separation
  /** The part (and what hangs from it) breaks away; a dead aircraft becomes a falling hulk. */
  separate(f: Fighter, part: number, bail: boolean) {
    const st = this.state(f);
    if (!st) return;
    if (st.s.attached(part)) { st.s.detach(part); st.s.nEv = 0; }
    this.detachLive(st, part);
    if (!f.alive && !st.hulk) this.makeHulk(st, part, bail);
  }

  /** Where the part meets the aircraft (world): for the caller's sparks and sounds. */
  jointWorld(f: Fighter, part: number, out: THREE.Vector3) {
    const st = this.state(f);
    if (!st) return out.copy(f.pos);
    f.root.updateMatrixWorld(true);
    return this.toWorld(st, st.split.parts[part].joint, out);
  }

  private shown(st: St, p: number) { const l = st.live![p]; return l.length > 0 && l[0].visible; }

  /** Split the airframe into its parts (once), hide this part and launch it as a piece. */
  private detachLive(st: St, part: number) {
    const f = st.f;
    this.ensureLive(st);
    const mask = subtree(part);
    const group: number[] = [];
    for (let p = 0; p < PART_COUNT; p++) if (mask & (1 << p) && this.shown(st, p)) group.push(p);
    if (!group.length) return;
    f.root.updateMatrixWorld(true);
    const piece = this.spawn(st, group, this.leaseOf(st), false);
    for (const p of group) for (const m of st.live![p]) m.visible = false;
    if (!piece) return;
    const sc = f.model.scale.x, side = sideOf(part);
    // pushed off the joint: outward and back, a little up
    _v.set(side * (3 + Math.random() * 3), 1.5 + Math.random() * 2, -2 - Math.random() * 2).multiplyScalar(Math.sqrt(sc));
    piece.body.vel.add(_v.applyQuaternion(f.quat));
    // torn off with a twist: it tumbles from the start (pitch as well as roll, so it never glides)
    if (part === TAIL) piece.body.w.add(_w.set(-(1.5 + Math.random() * 1.5), R() * 0.8, R() * 1.2));
    else piece.body.w.add(_w.set((Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 2), R() * 0.8, side * (1.5 + Math.random() * 2.5)));
    piece.fire = st.s.fire[part] > 0 ? 1 : isWing(part) && st.s.fuel[part] > 0 && Math.random() < 0.6 ? 0.7 : 0;
    piece.smoke = 0.7;
    piece.emit.copy(st.split.parts[part].joint);
    this.carry(st, piece, mask);
    this.stats.separations++;
    if (this.near(piece.root.position) < 1600) sound.play('tear', piece.root.position, { gain: 1.1, ref: 120, reverb: 0.5 });
    // flying on without a wingtip: it rolls toward the stump
    if (f.alive && isWing(part)) f.rollTrim -= 0.35 * side;
  }

  /** Hide the airframe; draw it as part meshes from now on (shared geometry, the aircraft's materials). */
  private ensureLive(st: St) {
    if (st.live) return;
    const srcs = sourceMeshes(st.f.model);
    st.live = Array.from({ length: PART_COUNT }, () => []);
    for (let p = 0; p < PART_COUNT; p++) {
      for (const sub of st.split.parts[p].subs) {
        const src = srcs[sub.src]?.mesh;
        if (!src?.parent) continue;
        for (const inner of [false, true]) {
          const m = new THREE.Mesh(inner ? sub.inner : sub.geo, inner ? this.innerMat : st.mats[sub.src]);
          m.userData.destructionPiece = true;
          m.position.copy(src.position); m.quaternion.copy(src.quaternion); m.scale.copy(src.scale);
          m.castShadow = !inner; m.receiveShadow = true;
          src.parent.add(m);
          st.live[p].push(m);
        }
      }
    }
    for (const { mesh } of srcs) mesh.visible = false;
  }

  /** Move the nodes riding on these parts (props, rocket tubes, skin patches) onto the piece. */
  private carry(st: St, piece: Piece, mask: number) {
    const list: THREE.Object3D[] = [];
    for (const child of st.f.model.children) {
      if (child.name === 'airframe' || child.userData.destructionPiece) continue;
      let part = child.name ? st.split.nodePart.get(child.name) : undefined;
      if (part === undefined) {
        if (!(child as THREE.Mesh).isMesh && !child.children.length) continue;
        part = st.split.classify(child.position.x, child.position.y, child.position.z);
      }
      if (mask & (1 << part)) list.push(child);
    }
    if (!list.length) return;
    piece.root.updateMatrixWorld(true);
    for (const o of list) { piece.frame.attach(o); piece.extra.push(o); }
  }

  // ------------------------------------------------------------------ explosion
  /** A tank goes up: its part shatters, the others are thrown off whole, the aircraft is gone. */
  explode(f: Fighter) {
    const st = this.state(f);
    if (st) this.explodeNow(st); else f.remove = true;
  }

  private explodeNow(st: St) {
    const f = st.f, s = st.s, fx = this.w.effects;
    if (f.remove) return;
    this.ensureLive(st);
    f.root.updateMatrixWorld(true);
    // the seat of the blast: the fiercest fuel fire, else the biggest tank
    let seat = CORE, best = -1;
    for (let p = 0; p < PART_COUNT; p++) {
      if (!this.shown(st, p)) continue;
      const k = s.fire[p] * 2 + s.fuel[p];
      if (k > best) { best = k; seat = p; }
    }
    const lease = this.leaseOf(st), sc = f.model.scale.x, kick = Math.sqrt(sc / 6);
    const blast = this.toWorld(st, st.split.parts[seat].fuel, _s);
    const twin = f.enemyType === 'bf110' || f.enemyType === 'ju88' || f.enemyType === 'he111' || f.enemyType === 'me410';
    const away = (piece: Piece, speed: number) => {
      _v.copy(piece.root.position).sub(blast);
      const d = _v.length();
      if (d > 1e-3) _v.divideScalar(d); else _v.set(R(), R(), R()).normalize();
      _v.x += R() * 0.3; _v.y += R() * 0.3 + 0.1; _v.z += R() * 0.3;
      piece.body.vel.addScaledVector(_v.normalize(), speed * kick);
    };
    // the seat in shards
    if (this.shown(st, seat)) for (const shard of st.split.parts[seat].shards) {
      const piece = this.spawnChunk(st, shard, lease, true);
      if (!piece) break;
      away(piece, 28 + Math.random() * 42);
      piece.body.w.set(R() * 5, R() * 5, R() * 5);
      piece.fire = Math.random() < 0.55 ? 1 : 0;
      piece.smoke = 0.8;
      piece.emit.copy(shard.com);
      piece.life = SHARD_LIFE * (0.7 + Math.random() * 0.6);
      this.stats.shards++;
    }
    // the rest whole, each with what hangs from it
    let done = 1 << seat;
    for (let p = 0; p < PART_COUNT; p++) {
      if (done & (1 << p) || !this.shown(st, p)) continue;
      const group = [p];
      for (let c = 0; c < PART_COUNT; c++) if (c !== p && !(done & (1 << c)) && this.shown(st, c) && subtree(p) & (1 << c)) group.push(c);
      for (const g of group) done |= 1 << g;
      const piece = this.spawn(st, group, lease, false);
      if (!piece) continue;
      away(piece, 14 + Math.random() * 16);
      piece.body.w.add(_w.set(R() * 2.5, R() * 2.5, R() * 3));
      piece.fire = s.fire[p] > 0 || Math.random() < 0.7 ? 1 : 0;
      piece.smoke = 1;
      piece.emit.copy(st.split.parts[p].joint);
      this.carry(st, piece, subtree(p) & ~(1 << seat));
    }
    for (const list of st.live!) for (const m of list) m.visible = false;
    s.detached = ALL;
    s.exploded = true;
    // the blast (FighterDeath adds the secondary pops)
    fx.explosion(blast, f.vel, 1.5, twin ? 'heavy' : 'fighter');
    sound.play('explosion', blast, { gain: 1.6, ref: 160, reverb: 0.75, size: twin ? 'heavy' : undefined });
    if (this.near(blast) < 500) sound.play('debris', blast, { gain: 0.8, ref: 40 });
    if (this.w.player) this.w.events.shake?.(Math.max(0, 1 - blast.distanceTo(this.w.player.pos) / 300));
    f.root.visible = false;
    f.remove = true;
    if (st.hulk) this.dropHulk(st);
    this.stats.explosions++;
  }

  // ------------------------------------------------------------------ hulk
  private makeHulk(st: St, lost: number, bail: boolean) {
    const f = st.f, body = new Body();
    body.slope = 5;   // what is left still has its wings (bent, holed)
    const h: Hulk = {
      body, offset: new THREE.Vector3(), modelQ: f.model.quaternion.clone(), mask: 0, age: 0, bailAt: Infinity, lost,
      jointFire: Math.random() < 0.6 || st.s.fire[lost] > 0, acc: 0, last: new THREE.Vector3(), hasLast: false,
    };
    st.hulk = h;
    for (let p = 0; p < PART_COUNT; p++) if (this.shown(st, p)) h.mask |= 1 << p;
    this.massHulk(st, true);
    body.vel.copy(f.vel);
    // the instant it goes: the lost wing's lift is gone (it rolls toward it); without its tail the nose drops
    const side = sideOf(lost);
    if (isWing(lost)) body.w.set(R() * 0.3, side * 0.3, -side * (1.6 + Math.random() * 1.2));
    else if (lost === TAIL) body.w.set(1.4 + Math.random() * 0.9, R() * 0.3, R() * 0.8);
    // the engine runs on for a moment
    if (h.mask & (1 << NOSE) && (f.zone('engine')?.hp ?? 0) > 0 && f.kind !== 'me163') { body.thrust = body.mass * 2.2; body.thrustTau = 2.5; }
    if (bail && (f.zone('cockpit')?.hp ?? 1) > 0 && !f.pilotKilled && !f.bailedOut) h.bailAt = 0.9 + Math.random() * 2;
    f.spin.set(0, 0, 0);
    claimDeath(f);
    this.leaseOf(st);
    this.hulks.push(st);
  }

  /** Mass, inertia and plates of what is left of the aircraft. */
  private massHulk(st: St, first: boolean) {
    const h = st.hulk!, b = h.body, f = st.f, parts = st.split.parts;
    let M = 0;
    _c.set(0, 0, 0);
    for (let p = 0; p < PART_COUNT; p++) if (h.mask & (1 << p)) { M += parts[p].mass; _c.addScaledVector(parts[p].com, parts[p].mass); }
    if (M <= 0) return;
    _c.divideScalar(M);
    let ix = 0, iy = 0, iz = 0;
    b.nPlates = 0;
    for (let p = 0; p < PART_COUNT; p++) {
      if (!(h.mask & (1 << p))) continue;
      const c = parts[p], dx = c.com.x - _c.x, dy = c.com.y - _c.y, dz = c.com.z - _c.z;
      ix += c.inertia.x + c.mass * (dy * dy + dz * dz);
      iy += c.inertia.y + c.mass * (dx * dx + dz * dz);
      iz += c.inertia.z + c.mass * (dx * dx + dy * dy);
      const pl = plateAt(b, b.nPlates++);
      pl.c.set(dx, dy, dz); pl.ax = c.ax; pl.ay = c.ay; pl.az = c.az; pl.chord = c.chord;
      pl.inc = isWing(p) ? WING_INC : 0;
    }
    b.mass = M; b.inertia.set(ix, iy, iz);
    // the centre of mass in the root frame; the body pose is the model's
    const sc = f.model.scale.x;
    _w.copy(h.offset);
    h.offset.copy(_c).multiplyScalar(sc).applyQuaternion(h.modelQ).add(f.model.position);
    if (first) {
      b.quat.copy(f.quat).multiply(h.modelQ);
      b.pos.copy(h.offset).applyQuaternion(f.quat).add(f.pos);
    } else b.pos.add(_v.copy(h.offset).sub(_w).applyQuaternion(f.quat));
  }

  private dropHulk(st: St) {
    const i = this.hulks.indexOf(st);
    if (i >= 0) this.hulks.splice(i, 1);
    st.hulk = null;
  }

  private hulkTick(st: St, dt: number) {
    const f = st.f, h = st.hulk!, b = h.body;
    h.age += dt;
    let mask = 0;
    for (let p = 0; p < PART_COUNT; p++) if (this.shown(st, p)) mask |= 1 << p;
    if (mask !== h.mask) { h.mask = mask; this.massHulk(st, false); }   // the fire burned another part off
    b.step(dt);
    f.quat.copy(b.quat).multiply(_iq.copy(h.modelQ).invert());
    f.pos.copy(b.pos).sub(_v.copy(h.offset).applyQuaternion(f.quat));
    f.vel.copy(b.vel);
    f.spin.set(0, 0, 0);
    if (f.pos.y < WRECK_FLOOR.fighter || h.age > 40) { f.remove = true; return; }
    if (h.age >= h.bailAt) { h.bailAt = Infinity; ejectPilot(f, this.w); this.stats.bailouts++; }
    // the torn joint: a smoke stream, fire from the ruptured lines, for the first seconds
    const dist = this.near(b.pos), fx = this.w.effects;
    if (dist > FAR || h.age > 9) { h.hasLast = false; return; }
    h.acc += dt;
    if (h.acc < (dist > MID ? TICK_MID : TICK)) return;
    const span = h.acc;
    h.acc = 0;
    if (fx.smoke.count > SMOKE_HARD || fx.glow.count > GLOW_HARD) { h.hasLast = false; return; }
    f.root.updateMatrixWorld(true);
    this.toWorld(st, st.split.parts[h.lost].joint, _p);
    const fire = h.jointFire && h.age < 6, k = f.model.scale.x / 6;
    fx.trail(_p, b.vel, fire ? 1 : 0.6, fire, (fire ? 1.2 : 0.9) * k, span, h.hasLast ? h.last : undefined);
    h.last.copy(_p); h.hasLast = true;
  }

  // ------------------------------------------------------------------ pieces
  private alloc(): Piece {
    for (const p of this.pieces) if (!p.active) return p;
    if (this.pieces.length < POOL) {
      const root = new THREE.Group(), frame = new THREE.Group();
      root.add(frame);
      root.visible = false;
      root.userData.destructionPiece = true;
      this.w.scene.add(root);
      const p: Piece = {
        root, frame, meshes: [], extra: [], body: new Body(), active: false, age: 0, life: 0, fire: 0, smoke: 0,
        emit: new THREE.Vector3(), com: new THREE.Vector3(), scale: 1, last: new THREE.Vector3(), hasLast: false, acc: 0,
        lease: null, mass: 0, size: 0, hit: [], source: null, credit: false, whoosh: false, shard: false,
      };
      this.pieces.push(p);
      return p;
    }
    // the pool is full: the oldest piece makes way
    let old = this.pieces[0];
    for (const p of this.pieces) if (p.age > old.age) old = p;
    this.release(old);
    return old;
  }

  /** A piece made of these parts (merged mass properties when several). */
  private spawn(st: St, parts: number[], lease: Lease, shard: boolean): Piece | null {
    if (parts.length === 1) return this.spawnChunk(st, st.split.parts[parts[0]], lease, shard);
    const m = MERGED;
    m.subs.length = 0; m.mass = 0; m.com.set(0, 0, 0); m.ax = m.ay = m.az = 0; m.chord = 0.3; m.size = 0.5; m.tris = 0;
    for (const p of parts) { const c = st.split.parts[p]; m.mass += c.mass; m.com.addScaledVector(c.com, c.mass); }
    if (m.mass <= 0) return null;
    m.com.divideScalar(m.mass);
    let ix = 0, iy = 0, iz = 0;
    for (const p of parts) {
      const c = st.split.parts[p], dx = c.com.x - m.com.x, dy = c.com.y - m.com.y, dz = c.com.z - m.com.z;
      for (const s of c.subs) m.subs.push(s);
      ix += c.inertia.x + c.mass * (dy * dy + dz * dz); iy += c.inertia.y + c.mass * (dx * dx + dz * dz); iz += c.inertia.z + c.mass * (dx * dx + dy * dy);
      m.ax += c.ax; m.ay += c.ay; m.az += c.az; m.chord = Math.max(m.chord, c.chord);
      m.size = Math.max(m.size, Math.sqrt(dx * dx + dy * dy + dz * dz) + c.size); m.tris += c.tris;
    }
    m.inertia.set(ix, iy, iz);
    return this.spawnChunk(st, m, lease, shard);
  }

  private spawnChunk(st: St, c: Chunk, lease: Lease, shard: boolean): Piece | null {
    if (!c.tris) return null;
    const f = st.f, p = this.alloc(), sc = f.model.scale.x;
    p.active = true; p.age = 0; p.life = shard ? SHARD_LIFE : PART_LIFE; p.fire = 0; p.smoke = 0; p.acc = Math.random() * TICK;
    p.hasLast = false; p.whoosh = false; p.shard = shard; p.hit.length = 0;
    p.mass = c.mass; p.size = c.size; p.scale = sc; p.com.copy(c.com);
    p.source = f; p.credit = f.playerDamage > 0 && f.playerDamage >= f.damageTaken * 0.2;
    // pose: the model's world transform, pivoting about the chunk's centre of mass
    f.model.matrixWorld.decompose(_v, _q, _w);
    p.root.position.copy(c.com).applyMatrix4(f.model.matrixWorld);
    p.root.quaternion.copy(_q);
    p.frame.scale.setScalar(sc);
    p.frame.position.copy(c.com).multiplyScalar(-sc);
    p.root.visible = true;
    const near = this.near(p.root.position) < 700;
    let i = 0;
    for (const sub of c.subs) {
      for (const inner of [false, true]) {
        let m = p.meshes[i];
        if (!m) { m = new THREE.Mesh(); m.matrixAutoUpdate = false; m.userData.destructionPiece = true; p.frame.add(m); p.meshes.push(m); }
        m.geometry = inner ? sub.inner : sub.geo;
        m.material = inner ? this.innerMat : st.mats[sub.src];
        m.matrix.copy(sub.toModel);
        m.matrixWorldNeedsUpdate = true;
        m.visible = true;
        m.castShadow = !inner && (!shard || near);
        m.receiveShadow = !inner;
        i++;
      }
    }
    for (; i < p.meshes.length; i++) p.meshes[i].visible = false;
    // the body: moving as that point of the aircraft did (a spinning hulk's rotation included)
    const b = p.body, h = st.hulk;
    b.pos.copy(p.root.position); b.quat.copy(_q);
    if (h) {
      _w.copy(h.body.w).applyQuaternion(h.body.quat);
      b.vel.copy(h.body.vel).add(_v.crossVectors(_w, _l.subVectors(b.pos, h.body.pos)));
      b.w.copy(h.body.w);
    } else { b.vel.copy(f.vel); b.w.set(0, 0, 0); }
    // torn pieces: ragged, buckled surfaces that lift poorly and drag hard
    b.mass = c.mass; b.inertia.copy(c.inertia); b.thrust = 0; b.aero = 1.4; b.slope = 2.4;
    b.nPlates = 1;
    const pl = plateAt(b, 0);
    pl.c.set(0, 0, 0); pl.ax = c.ax; pl.ay = c.ay; pl.az = c.az; pl.chord = c.chord; pl.inc = 0;
    p.lease = lease; lease.refs++;
    return p;
  }

  private release(p: Piece) {
    if (!p.active) return;
    p.active = false;
    p.root.visible = false;
    for (const o of p.extra) { o.removeFromParent(); disposeTree(o); }
    p.extra.length = 0;
    for (const m of p.meshes) m.visible = false;
    if (p.lease) this.unlease(p.lease);
    p.lease = null; p.source = null;
  }

  // The aircraft's own material copies outlive it while its pieces use them
  private leaseOf(st: St): Lease {
    if (st.lease) return st.lease;
    const mats: THREE.Material[] = [];
    st.f.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        if (mat?.userData?.owned && !mats.includes(mat)) { mats.push(mat); mat.userData.owned = false; }
      }
    });
    st.lease = { mats, refs: 1 };   // the aircraft's own reference, dropped when it is removed
    return st.lease;
  }
  private unlease(l: Lease) {
    if (--l.refs > 0) return;
    for (const m of l.mats) m.dispose();
    l.mats.length = 0;
  }

  // ------------------------------------------------------------------ per frame
  /** puppet: co-op guest (the host decides; here only motion and visuals). */
  update(dt: number, puppet = false) {
    if (dt <= 0) return;
    let n = 0;
    for (const st of this.tracked) {
      const f = st.f;
      if (f.remove || !f.root.parent) {
        if (st.lease) { this.unlease(st.lease); st.lease = null; }
        if (st.hulk) this.dropHulk(st);
        continue;
      }
      this.tracked[n++] = st;
      if (!puppet) this.structureTick(st, dt);
      if (!f.remove && st.s.burning) this.fireTrails(st, dt);
    }
    this.tracked.length = n;
    for (let i = this.hulks.length - 1; i >= 0; i--) this.hulkTick(this.hulks[i], dt);
    for (const p of this.pieces) if (p.active) this.pieceTick(p, dt, puppet);
  }

  private structureTick(st: St, dt: number) {
    const f = st.f, s = st.s, w = this.w;
    const eng = f.zone('engine');
    if (eng?.burning && s.fire[NOSE] <= 0 && s.attached(NOSE)) { s.nEv = 0; s.ignite(NOSE, f.playerDamage > 0); this.stats.fires++; }
    if (!s.burning) return;
    if (s.tick(dt)) this.events(st, false);
    if (f.remove || !f.alive) return;
    // a fuel fire eats the airframe (credited to whoever lit it)
    let fuelFire = 0;
    for (let p = 0; p < PART_COUNT; p++) if (s.attached(p) && s.fuel[p] > 0) fuelFire += s.fire[p];
    if (fuelFire > 0) {
      const d = dt * FIRE_STRUCT * Math.min(1.5, fuelFire);
      f.structure -= d;
      if (s.playerFire) f.playerDamage += d;
      if (f.structure <= 0) { w.killAircraft(f, s.playerFire, 'fire'); return; }
    }
    // beyond saving: the pilot gets out (FighterDeath plays the bail-out)
    if (s.doomed() && (f.zone('cockpit')?.hp ?? 1) > 0 && !f.pilotKilled) {
      if (!st.bailAt) st.bailAt = w.time + 1.2 + Math.random() * 2.2;
      else if (w.time >= st.bailAt) { st.forceBail = true; w.killAircraft(f, s.playerFire, 'fire'); }
    }
  }

  // Flames from every burning part still on the aircraft (alive, falling or a hulk)
  private fireTrails(st: St, dt: number) {
    const f = st.f, fx = this.w.effects, s = st.s;
    if (!f.root.visible) return;
    const dist = this.near(f.pos);
    if (dist > FAR) { st.hasLast = 0; return; }
    st.acc += dt;
    if (st.acc < (dist > MID ? TICK_MID : TICK)) return;
    const span = st.acc;
    st.acc = 0;
    if (fx.smoke.count > SMOKE_HARD || fx.glow.count > GLOW_HARD) { st.hasLast = 0; return; }
    const k = f.model.scale.x / 6;
    for (let p = 0; p < PART_COUNT; p++) {
      if (s.fire[p] <= 0 || !s.attached(p)) continue;
      if (p === NOSE && !st.hulk && f.zone('engine')?.burning) continue;   // World / FighterDeath draw the engine fire
      this.toWorld(st, st.split.parts[p].fuel, _p);
      const b = p * 3, has = st.hasLast & (1 << p);
      if (has) _l.set(st.last[b], st.last[b + 1], st.last[b + 2]);
      fx.trail(_p, f.vel, 1, true, (0.8 + 1.1 * s.fire[p]) * k, span, has ? _l : undefined);
      st.last[b] = _p.x; st.last[b + 1] = _p.y; st.last[b + 2] = _p.z;
      st.hasLast |= 1 << p;
    }
  }

  private pieceTick(p: Piece, dt: number, puppet: boolean) {
    const b = p.body, w = this.w;
    p.age += dt;
    p.life -= dt;
    b.step(dt);
    p.root.position.copy(b.pos);
    p.root.quaternion.copy(b.quat);
    const dist = this.near(b.pos);
    if (p.life <= 0 || dist > 5000 || b.pos.y < WRECK_FLOOR.fighter) { this.release(p); return; }
    // a heavy piece tumbling past close by: the rush of it
    if (!p.whoosh && !p.shard && dist < 40 + p.size * p.scale) {
      p.whoosh = true;
      sound.play('whoosh', b.pos, { gain: Math.min(1.3, 0.5 + p.mass / 800), ref: 50, delay: false });
    }
    if (!puppet && p.mass >= HIT_MASS && p.age < 10 && p.hit.length < 3) this.strike(p);
    // trail from the torn joint
    if (dist > FAR) { p.hasLast = false; return; }
    p.acc += dt;
    if (p.acc < (dist > MID ? TICK_MID : TICK)) return;
    const span = p.acc;
    p.acc = -Math.random() * 0.01;
    const fx = w.effects;
    const burning = p.fire > 0 && p.age < (p.shard ? 4 : 11);
    if (!burning && (p.smoke <= 0 || p.age > (p.shard ? 3 : 8))) { p.hasLast = false; return; }
    if (fx.smoke.count > SMOKE_HARD || fx.glow.count > GLOW_HARD) { p.hasLast = false; return; }
    _p.copy(p.emit).sub(p.com).multiplyScalar(p.scale).applyQuaternion(b.quat).add(b.pos);
    const k = (p.scale / 6) * (p.shard ? 0.45 : 0.9), fade = Math.min(1, p.life / 4);
    fx.trail(_p, b.vel, burning ? 1 : 0.55 * fade, burning, k * (burning ? 0.6 + 0.6 * p.fire : 0.8), span, p.hasLast ? p.last : undefined);
    p.last.copy(_p); p.hasLast = true;
  }

  // Debris striking an aircraft: a heavy knock on the zone it hits
  private strike(p: Piece) {
    const w = this.w, b = p.body, reach = p.size * p.scale * 0.6;
    for (const a of w.aircraft) {
      if (!a.alive || a.remove || a === p.source || p.hit.includes(a.id)) continue;
      const r = a.radius + reach;
      if (a.pos.distanceToSquared(b.pos) > r * r) continue;
      let zone = a.zones[0], bd = Infinity;
      for (const z of a.zones) {
        const d = a.localToWorld(z.offset, _w).distanceTo(b.pos) - z.radius;
        if (d < bd) { bd = d; zone = z; }
      }
      if (!zone || bd > reach) continue;
      p.hit.push(a.id);
      const rel = _v.copy(b.vel).sub(a.vel).length();
      if (rel < 12) continue;
      const dmg = Math.min(160, Math.max(15, (rel * p.mass) / 900));
      a.localToWorld(zone.offset, _w);
      _l.copy(b.pos).lerp(_w, 0.6);
      w.debrisHit({ target: a, zone, point: _l.clone(), damage: dmg, cannon: true, shooter: null, bulletVel: b.vel.clone(), playerShot: p.credit && a.team === 'axis' });
      w.effects.sparks(_l, a.vel, true);
      sound.play('hitHeavy', _l, { gain: 1, ref: 80 });
      this.stats.debrisHits++;
    }
  }

  // ------------------------------------------------------------------ world plumbing
  rebase(off: THREE.Vector3) {
    for (const p of this.pieces) if (p.active) { p.body.pos.sub(off); p.root.position.copy(p.body.pos); p.last.sub(off); }
    for (const st of this.hulks) { st.hulk!.body.pos.sub(off); st.hulk!.last.sub(off); }
    for (const st of this.tracked) st.hasLast = 0;
  }

  clear() {
    for (const p of this.pieces) this.release(p);
    for (const st of this.tracked) if (st.lease) { this.unlease(st.lease); st.lease = null; }
    this.tracked.length = 0;
    this.hulks.length = 0;
    this.states = new WeakMap();
    for (const k of Object.keys(this.stats) as (keyof Destruction['stats'])[]) this.stats[k] = 0;
  }

  /** Mission start: split the loaded enemy models now (not at the first kill) and warm the inner-skin material. */
  warm(scene: THREE.Scene, at: THREE.Vector3, models: { kind: string; model: THREE.Object3D }[]) {
    for (const m of models) splitOf(m.kind, m.model);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.innerMat);
    mesh.position.copy(at); mesh.castShadow = true;
    scene.add(mesh);
    return () => { mesh.removeFromParent(); mesh.geometry.dispose(); };
  }

  /** Live pieces and hulks (dev / perf). */
  counts() { let pieces = 0; for (const p of this.pieces) if (p.active) pieces++; return { pieces, hulks: this.hulks.length, pool: this.pieces.length, tracked: this.tracked.length }; }
}

function plateAt(b: Body, i: number) {
  while (b.plates.length <= i) b.plates.push({ c: new THREE.Vector3(), ax: 0, ay: 0, az: 0, chord: 1, inc: 0 });
  return b.plates[i];
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (m.geometry?.userData?.owned) m.geometry.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) if (mat.userData?.owned) mat.dispose();
  });
}

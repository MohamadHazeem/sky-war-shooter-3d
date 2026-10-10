import * as THREE from 'three';
import type { Aircraft } from '../world/Aircraft';

// Mission recorder for the Replay theatre (Theatre.ts).
//
// Keeps the last 90 s of the mission in fixed typed arrays (nothing is allocated while
// recording, apart from one meta entry the first time an aircraft is seen):
//   keyframes  12 Hz (game time): up to 48 aircraft (player first, then nearest), each
//              id, flags (alive, player, burning, damage stage 0..4), position (float32,
//              scene coordinates of that frame) and attitude (int16 quaternion); the
//              player's camera (relative to the player's aircraft when there is one,
//              so the gunner's eye stays locked to the interior), its FOV; the floating
//              origin offset of the frame (float64) so a rebase between frames is exact.
//   gun slots  the player's guns: rounds with tracers fired since the previous keyframe,
//              muzzle and direction in the aircraft's frame, muzzle speed, tracer colour.
//              Tracers are re-synthesised from this on playback.
//   events     kills (victim, killer, where: an aircraft seen no longer alive), explosions,
//              flak bursts (Theatre wraps Effects), gun start/stop.
//   marks      "best moments": player kills, multi-kills, boss and ace kills, close calls.
//
// Memory: 1081 frames x 48 slots x 25 B ~ 1.3 MB plus ~0.2 MB of camera/gun/event data.
// Cost: one scan of the aircraft list every 1/12 s (~0.05 ms), a few float writes per shot.
//
// Playback reads a ClipData: the same layout made linear (oldest first) by toClip(). A
// ClipData holds only typed arrays and plain values, so it can be stored as is in
// IndexedDB (saved moments).

export const REC_HZ = 12;
export const REC_SECONDS = 90;
export const MAX_ENT = 48;
export const GUN_SLOTS = 6;
export const RING_FRAMES = REC_HZ * REC_SECONDS + 1;
export const MAX_EVENTS = 2048;
export const MAX_MARKS = 96;
const STEP = 1 / REC_HZ;
const NEAR_R = 6000;           // m: aircraft recorded within this range of the player/camera
const Q = 32767;               // int16 quaternion scale
const SLOT_MATCH = 0.35;       // m: a shot within this of a slot's last muzzle is that gun
const SLOT_IDLE = 0.6;         // s without a shot frees a gun slot
const MULTI_GAP = 9;           // s: kills closer than this build a multi-kill (Game's streak window)
const CLOSE_DROP = 0.12;       // integrity lost within CLOSE_WIN that marks a close call
const CLOSE_WIN = 2;           // s
const CLOSE_COOLDOWN = 8;

// entity flags
export const F_ALIVE = 1, F_PLAYER = 2, F_FIRE = 4;
export const stageOf = (flags: number) => (flags >> 3) & 7;
// events
export const EV_KILL = 1, EV_EXPLOSION = 2, EV_FLAK = 3, EV_GUN_ON = 4, EV_GUN_OFF = 5;
// marks
export const MK_KILL = 1, MK_MULTI = 2, MK_BOSS = 3, MK_ACE = 4, MK_CLOSE = 5, MK_NEAR = 6;

export interface EntityMeta { id: number; kind: string; scale: number; team: number; label: string; radius: number; player: boolean }

/** Linear (oldest first) recording, as played back and as stored. */
export interface ClipData {
  v: 1;
  frames: number;
  t: Float64Array;          // frames
  off: Float64Array;        // frames*3: floating-origin offset of the frame
  n: Uint8Array;            // frames: entities in the frame
  cam: Float32Array;        // frames*8: x y z qx qy qz qw fovDeg
  camRel: Uint8Array;       // frames: 1 = cam is in the player's aircraft frame (entity slot 0)
  id: Int32Array;           // frames*MAX_ENT
  flags: Uint8Array;        // frames*MAX_ENT
  pos: Float32Array;        // frames*MAX_ENT*3 (scene coordinates of the frame)
  quat: Int16Array;         // frames*MAX_ENT*4
  gN: Uint8Array;           // frames*GUN_SLOTS: tracer rounds fired since the previous frame
  gOff: Float32Array;       // frames*GUN_SLOTS*3: muzzle, aircraft frame
  gDir: Int16Array;         // frames*GUN_SLOTS*3: direction, aircraft frame
  gSpd: Float32Array;       // frames*GUN_SLOTS: muzzle speed relative to the aircraft
  gCol: Uint8Array;         // frames*GUN_SLOTS*3: tracer colour x20 (HDR)
  evN: number;
  evT: Float64Array; evType: Uint8Array; evA: Int32Array; evB: Int32Array;
  evP: Float64Array;        // *3, absolute (scene + origin offset)
  evV: Float32Array;        // *3
  evS: Float32Array;
  mkN: number;
  mkT: Float64Array; mkType: Uint8Array; mkA: Int32Array; mkB: Int32Array;
  meta: EntityMeta[];
  playerId: number;
  role: string;
  title: string;
}

export function emptyClip(frames: number, events: number, marks: number): ClipData {
  return {
    v: 1, frames,
    t: new Float64Array(frames), off: new Float64Array(frames * 3), n: new Uint8Array(frames),
    cam: new Float32Array(frames * 8), camRel: new Uint8Array(frames),
    id: new Int32Array(frames * MAX_ENT), flags: new Uint8Array(frames * MAX_ENT),
    pos: new Float32Array(frames * MAX_ENT * 3), quat: new Int16Array(frames * MAX_ENT * 4),
    gN: new Uint8Array(frames * GUN_SLOTS), gOff: new Float32Array(frames * GUN_SLOTS * 3),
    gDir: new Int16Array(frames * GUN_SLOTS * 3), gSpd: new Float32Array(frames * GUN_SLOTS),
    gCol: new Uint8Array(frames * GUN_SLOTS * 3),
    evN: 0, evT: new Float64Array(events), evType: new Uint8Array(events), evA: new Int32Array(events), evB: new Int32Array(events),
    evP: new Float64Array(events * 3), evV: new Float32Array(events * 3), evS: new Float32Array(events),
    mkN: 0, mkT: new Float64Array(marks), mkType: new Uint8Array(marks), mkA: new Int32Array(marks), mkB: new Int32Array(marks),
    meta: [], playerId: -1, role: 'gunner', title: '',
  };
}

// ---------------- ring buffer ----------------

/** Index bookkeeping of a fixed-capacity ring: logical 0 = oldest. */
export class FrameRing {
  head = 0;     // physical slot the next push writes
  count = 0;
  constructor(readonly cap: number) {}
  /** Claims the next slot (overwriting the oldest when full) and returns it. */
  push(): number {
    const p = this.head;
    this.head = (this.head + 1) % this.cap;
    if (this.count < this.cap) this.count++;
    return p;
  }
  /** Physical slot of logical index i (0 = oldest). */
  phys(i: number) { return (this.head - this.count + i + this.cap * 2) % this.cap; }
  clear() { this.head = 0; this.count = 0; }
}

// ---------------- lookup + interpolation ----------------

/** Largest frame index i with t[i] <= time, clamped to [0, frames - 2] (0 for < 2 frames). */
export function findFrame(c: ClipData, time: number): number {
  const n = c.frames;
  if (n < 2) return 0;
  if (time <= c.t[0]) return 0;
  if (time >= c.t[n - 1]) return n - 2;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (c.t[mid] <= time) lo = mid; else hi = mid;
  }
  return Math.min(lo, n - 2);
}

/** Slot of aircraft id in frame f (-1 if absent). hint: slot to try first. */
export function findSlot(c: ClipData, f: number, id: number, hint = -1): number {
  const n = c.n[f], b = f * MAX_ENT;
  if (hint >= 0 && hint < n && c.id[b + hint] === id) return hint;
  for (let s = 0; s < n; s++) if (c.id[b + s] === id) return s;
  return -1;
}

/** Pose of slot s in frame f, in the playback frame (scene = frame offset - base + stored). */
export function readPose(c: ClipData, f: number, s: number, base: THREE.Vector3, outPos: THREE.Vector3, outQuat: THREE.Quaternion) {
  const k = f * MAX_ENT + s, o = f * 3;
  outPos.set(c.pos[k * 3] + (c.off[o] - base.x), c.pos[k * 3 + 1] + (c.off[o + 1] - base.y), c.pos[k * 3 + 2] + (c.off[o + 2] - base.z));
  outQuat.set(c.quat[k * 4] / Q, c.quat[k * 4 + 1] / Q, c.quat[k * 4 + 2] / Q, c.quat[k * 4 + 3] / Q).normalize();
}

const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();

/** Interpolated pose of aircraft id at time t. Returns its flags (of the earlier frame) or
 *  -1 when it is not in that frame. outVel (optional) gets its velocity (m/s). */
export function samplePose(c: ClipData, time: number, id: number, base: THREE.Vector3,
  outPos: THREE.Vector3, outQuat: THREE.Quaternion, outVel?: THREE.Vector3, hint = -1): number {
  if (c.frames === 0) return -1;
  const f = findFrame(c, time);
  const sa = findSlot(c, f, id, hint);
  if (sa < 0) return -1;
  readPose(c, f, sa, base, outPos, outQuat);
  const flags = c.flags[f * MAX_ENT + sa];
  if (c.frames < 2) { outVel?.set(0, 0, 0); return flags; }
  const sb = findSlot(c, f + 1, id, sa);
  if (sb < 0) { outVel?.set(0, 0, 0); return flags; }
  readPose(c, f + 1, sb, base, _pb, _qb);
  const ta = c.t[f], tb = c.t[f + 1];
  const u = tb > ta ? THREE.MathUtils.clamp((time - ta) / (tb - ta), 0, 1) : 0;
  if (outVel) { if (tb > ta) outVel.subVectors(_pb, outPos).divideScalar(tb - ta); else outVel.set(0, 0, 0); }
  outPos.lerp(_pb, u);
  outQuat.slerp(_qb, u);
  return flags;
}

/** Interpolated recorded camera at time t: pose in the playback frame and FOV (degrees).
 *  A camera stored in the player's frame is placed with the player's interpolated pose. */
export function sampleCamera(c: ClipData, time: number, base: THREE.Vector3, outPos: THREE.Vector3, outQuat: THREE.Quaternion): number {
  if (c.frames === 0) return 60;
  const f = findFrame(c, time), g = Math.min(c.frames - 1, f + 1);
  const ta = c.t[f], tb = c.t[g];
  const u = tb > ta ? THREE.MathUtils.clamp((time - ta) / (tb - ta), 0, 1) : 0;
  const a = f * 8, b = g * 8, cm = c.cam;
  const rel = c.camRel[f] === 1 && c.camRel[g] === 1;
  _pa.set(cm[a], cm[a + 1], cm[a + 2]).lerp(_pb.set(cm[b], cm[b + 1], cm[b + 2]), u);
  _qa.set(cm[a + 3], cm[a + 4], cm[a + 5], cm[a + 6]).normalize().slerp(_qb.set(cm[b + 3], cm[b + 4], cm[b + 5], cm[b + 6]).normalize(), u);
  const fov = cm[a + 7] + (cm[b + 7] - cm[a + 7]) * u;
  if (rel && samplePose(c, time, c.id[f * MAX_ENT], base, outPos, outQuat) >= 0) {
    // world = player * local
    _pa.applyQuaternion(outQuat);
    outPos.add(_pa);
    outQuat.multiply(_qa);
  } else {
    const o = f * 3;
    if (rel) { outPos.copy(_pa); outQuat.copy(_qa); }   // (player missing: best effort)
    else {
      outPos.set(_pa.x + (c.off[o] - base.x), _pa.y + (c.off[o + 1] - base.y), _pa.z + (c.off[o + 2] - base.z));
      outQuat.copy(_qa);
    }
  }
  return fov;
}

/** Copy of frames [f0, f1] (and the events/marks in that time span) as a new clip. */
export function sliceClip(c: ClipData, t0: number, t1: number): ClipData {
  let f0 = 0, f1 = c.frames - 1;
  while (f0 < c.frames - 1 && c.t[f0 + 1] <= t0) f0++;
  while (f1 > f0 && c.t[f1 - 1] >= t1) f1--;
  const nf = Math.max(0, f1 - f0 + 1);
  let ne = 0, nm = 0;
  const ta = nf ? c.t[f0] : 0, tb = nf ? c.t[f1] : 0;
  for (let i = 0; i < c.evN; i++) if (c.evT[i] >= ta && c.evT[i] <= tb) ne++;
  for (let i = 0; i < c.mkN; i++) if (c.mkT[i] >= ta && c.mkT[i] <= tb) nm++;
  const o = emptyClip(nf, ne, nm);
  o.t.set(c.t.subarray(f0, f0 + nf));
  o.off.set(c.off.subarray(f0 * 3, (f0 + nf) * 3));
  o.n.set(c.n.subarray(f0, f0 + nf));
  o.cam.set(c.cam.subarray(f0 * 8, (f0 + nf) * 8));
  o.camRel.set(c.camRel.subarray(f0, f0 + nf));
  o.id.set(c.id.subarray(f0 * MAX_ENT, (f0 + nf) * MAX_ENT));
  o.flags.set(c.flags.subarray(f0 * MAX_ENT, (f0 + nf) * MAX_ENT));
  o.pos.set(c.pos.subarray(f0 * MAX_ENT * 3, (f0 + nf) * MAX_ENT * 3));
  o.quat.set(c.quat.subarray(f0 * MAX_ENT * 4, (f0 + nf) * MAX_ENT * 4));
  o.gN.set(c.gN.subarray(f0 * GUN_SLOTS, (f0 + nf) * GUN_SLOTS));
  o.gOff.set(c.gOff.subarray(f0 * GUN_SLOTS * 3, (f0 + nf) * GUN_SLOTS * 3));
  o.gDir.set(c.gDir.subarray(f0 * GUN_SLOTS * 3, (f0 + nf) * GUN_SLOTS * 3));
  o.gSpd.set(c.gSpd.subarray(f0 * GUN_SLOTS, (f0 + nf) * GUN_SLOTS));
  o.gCol.set(c.gCol.subarray(f0 * GUN_SLOTS * 3, (f0 + nf) * GUN_SLOTS * 3));
  for (let i = 0; i < c.evN; i++) {
    if (c.evT[i] < ta || c.evT[i] > tb) continue;
    const j = o.evN++;
    o.evT[j] = c.evT[i]; o.evType[j] = c.evType[i]; o.evA[j] = c.evA[i]; o.evB[j] = c.evB[i]; o.evS[j] = c.evS[i];
    for (let k = 0; k < 3; k++) { o.evP[j * 3 + k] = c.evP[i * 3 + k]; o.evV[j * 3 + k] = c.evV[i * 3 + k]; }
  }
  for (let i = 0; i < c.mkN; i++) {
    if (c.mkT[i] < ta || c.mkT[i] > tb) continue;
    const j = o.mkN++;
    o.mkT[j] = c.mkT[i]; o.mkType[j] = c.mkType[i]; o.mkA[j] = c.mkA[i]; o.mkB[j] = c.mkB[i];
  }
  const ids = new Set<number>();
  for (let i = 0; i < nf * MAX_ENT; i++) if ((i % MAX_ENT) < o.n[Math.floor(i / MAX_ENT)]) ids.add(o.id[i]);
  o.meta = c.meta.filter((m) => ids.has(m.id)).map((m) => ({ ...m }));
  o.playerId = c.playerId; o.role = c.role; o.title = c.title;
  return o;
}

/** Name of a mark for the timeline. */
export function markLabel(type: number, a: number): string {
  switch (type) {
    case MK_MULTI: return a === 2 ? 'Double kill' : a === 3 ? 'Triple kill' : `${a}× kill`;
    case MK_BOSS: return 'Boss kill';
    case MK_ACE: return 'Ace down';
    case MK_CLOSE: return 'Close call';
    case MK_NEAR: return 'Near miss';
    default: return 'Kill';
  }
}

// ---------------- recorder ----------------

/** What the recorder reads from the world each keyframe. */
export interface RecSource {
  time: number;
  aircraft: readonly Aircraft[];
  player: Aircraft | null;
}

const _v = new THREE.Vector3();
const _cp = new THREE.Vector3();
const _cs = new THREE.Vector3();
const _cq = new THREE.Quaternion();
const _iq = new THREE.Quaternion();

export class Recorder {
  readonly ring = new FrameRing(RING_FRAMES);
  readonly buf = emptyClip(RING_FRAMES, MAX_EVENTS, MAX_MARKS);   // ring storage (physical order)
  private evHead = 0; private evCount = 0;
  private mkHead = 0; private mkCount = 0;
  private acc = 0;
  private lastT = -1;
  private meta = new Map<number, EntityMeta>();
  private nearA: (Aircraft | null)[] = new Array(MAX_ENT).fill(null);
  private nearD = new Float64Array(MAX_ENT);
  /** Origin offset of the scene (Atmos.originOffset), read for every frame and event. */
  origin = new THREE.Vector3();
  /** True while a mission is in play: the effect/kill wrappers record only then. */
  live = false;
  playerId = -1;
  role = 'gunner';
  title = '';
  // gun slots (accumulated between keyframes)
  private gCount = new Uint8Array(GUN_SLOTS);
  private gShot = new Uint8Array(GUN_SLOTS);     // any round this keyframe
  private gWas = new Uint8Array(GUN_SLOTS);      // firing in the previous keyframe
  private gLast = new Float64Array(GUN_SLOTS).fill(-1e9);
  private gOff = new Float32Array(GUN_SLOTS * 3);
  private gDir = new Float32Array(GUN_SLOTS * 3);
  private gSpd = new Float32Array(GUN_SLOTS);
  private gCol = new Float32Array(GUN_SLOTS * 3);
  // marks
  private lastKillT = -1e9;
  private multiIdx = -1;
  private streak = 0;
  private hp = new Float32Array(CLOSE_WIN * REC_HZ).fill(1);
  private hpI = 0;
  private lastClose = -1e9;
  private lastNear = -1e9;
  private lastKillId = -1;
  private dead = new WeakSet<Aircraft>();   // aircraft whose kill was logged

  get frames() { return this.ring.count; }
  get duration() { return this.ring.count < 2 ? 0 : this.timeAt(this.ring.count - 1) - this.timeAt(0); }
  timeAt(i: number) { return this.buf.t[this.ring.phys(i)]; }
  get eventCount() { return this.evCount; }
  get markCount() { return this.mkCount; }

  reset() {
    this.ring.clear();
    this.evHead = this.evCount = 0;
    this.mkHead = this.mkCount = 0;
    this.acc = 0; this.lastT = -1;
    this.meta.clear();
    this.gCount.fill(0); this.gShot.fill(0); this.gWas.fill(0); this.gLast.fill(-1e9);
    this.lastKillT = -1e9; this.multiIdx = -1; this.streak = 0;
    this.hp.fill(1); this.hpI = 0; this.lastClose = this.lastNear = -1e9;
    this.lastKillId = -1;
    this.dead = new WeakSet();
    this.playerId = -1;
  }

  // ---------- events (from the wrappers / Cinematics) ----------

  /** Any aircraft destroyed (seen by record(): alive turned false). */
  kill(time: number, victim: Aircraft, byPlayer: boolean) {
    if (victim.id === this.lastKillId) return;   // the same kill seen through two wrappers
    this.lastKillId = victim.id;
    this.noteMeta(victim);
    const killer = byPlayer && this.playerId >= 0 ? this.playerId : victim.lastAttacker?.id ?? -1;
    this.event(time, EV_KILL, victim.id, killer, victim.pos, victim.vel, byPlayer ? 1 : 0);
  }

  /** Credited player kill: marks. streak = kills in quick succession (Game's count). */
  playerKill(time: number, victim: Aircraft, streak: number, boss: boolean, ace: boolean) {
    this.noteMeta(victim);
    if (boss) this.mark(time, MK_BOSS, victim.id);
    else if (ace) this.mark(time, MK_ACE, victim.id);
    else this.mark(time, MK_KILL, victim.id);
    // multi-kill: one mark that grows (and moves to the latest kill) while the streak runs
    this.streak = time - this.lastKillT < MULTI_GAP ? Math.max(this.streak + 1, streak) : Math.max(1, streak);
    this.lastKillT = time;
    if (this.streak >= 2) {
      const mi = this.multiIdx;
      // (the slot may have been reused by later marks: the serial tells)
      if (mi >= 0 && this.buf.mkType[mi] === MK_MULTI && this.buf.mkB[mi] === this.multiSerial && time - this.buf.mkT[mi] < MULTI_GAP) {
        this.buf.mkT[mi] = time; this.buf.mkA[mi] = this.streak;
      } else { this.multiIdx = this.mark(time, MK_MULTI, this.streak); this.multiSerial = this.buf.mkB[this.multiIdx]; }
    }
  }

  event(time: number, type: number, a: number, b: number, pos: THREE.Vector3 | null, vel: THREE.Vector3 | null, s: number) {
    const i = this.evHead, c = this.buf;
    this.evHead = (this.evHead + 1) % MAX_EVENTS;
    if (this.evCount < MAX_EVENTS) this.evCount++;
    c.evT[i] = time; c.evType[i] = type; c.evA[i] = a; c.evB[i] = b; c.evS[i] = s;
    const o = this.origin;
    if (pos) { c.evP[i * 3] = pos.x + o.x; c.evP[i * 3 + 1] = pos.y + o.y; c.evP[i * 3 + 2] = pos.z + o.z; }
    else { c.evP[i * 3] = c.evP[i * 3 + 1] = c.evP[i * 3 + 2] = 0; }
    if (vel) { c.evV[i * 3] = vel.x; c.evV[i * 3 + 1] = vel.y; c.evV[i * 3 + 2] = vel.z; }
    else { c.evV[i * 3] = c.evV[i * 3 + 1] = c.evV[i * 3 + 2] = 0; }
  }

  private serial = 1;          // mark serial numbers (mkB)
  private multiSerial = -1;

  /** Adds a best-moment mark; returns its slot. */
  mark(time: number, type: number, a: number): number {
    const i = this.mkHead, c = this.buf;
    this.mkHead = (this.mkHead + 1) % MAX_MARKS;
    if (this.mkCount < MAX_MARKS) this.mkCount++;
    c.mkT[i] = time; c.mkType[i] = type; c.mkA[i] = a; c.mkB[i] = this.serial++;
    return i;
  }

  /** A player shot (Ballistics.fire wrapper): muzzle/velocity in world space. */
  shot(time: number, owner: Aircraft, pos: THREE.Vector3, vel: THREE.Vector3, tracer: boolean, color: readonly number[]) {
    _iq.copy(owner.quat).invert();
    const lx = pos.x - owner.pos.x, ly = pos.y - owner.pos.y, lz = pos.z - owner.pos.z;
    _v.set(lx, ly, lz).applyQuaternion(_iq);
    // the slot of this gun: nearest recent muzzle, else a free (idle) slot
    let best = -1, bd = SLOT_MATCH * SLOT_MATCH;
    for (let s = 0; s < GUN_SLOTS; s++) {
      if (time - this.gLast[s] > SLOT_IDLE) continue;
      const dx = this.gOff[s * 3] - _v.x, dy = this.gOff[s * 3 + 1] - _v.y, dz = this.gOff[s * 3 + 2] - _v.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = s; }
    }
    if (best < 0) {
      let oldest = Infinity;
      for (let s = 0; s < GUN_SLOTS; s++) if (this.gLast[s] < oldest && this.gShot[s] === 0) { oldest = this.gLast[s]; best = s; }
      if (best < 0) return;
    }
    const s = best;
    this.gLast[s] = time;
    this.gOff[s * 3] = _v.x; this.gOff[s * 3 + 1] = _v.y; this.gOff[s * 3 + 2] = _v.z;
    _v.copy(vel).sub(owner.vel);
    const spd = _v.length();
    if (spd > 1e-3) {
      _v.divideScalar(spd).applyQuaternion(_iq);
      this.gDir[s * 3] = _v.x; this.gDir[s * 3 + 1] = _v.y; this.gDir[s * 3 + 2] = _v.z;
      this.gSpd[s] = spd;
    }
    this.gShot[s] = 1;
    if (tracer) {
      if (this.gCount[s] < 255) this.gCount[s]++;
      this.gCol[s * 3] = color[0]; this.gCol[s * 3 + 1] = color[1]; this.gCol[s * 3 + 2] = color[2];
    }
  }

  // ---------- keyframes ----------

  /** Once per frame while the mission is in play (dt = game time). cam = the player's view. */
  record(dt: number, src: RecSource, cam: THREE.PerspectiveCamera, bossCleared = false) {
    if (dt <= 0) return;
    this.acc += dt;
    if (this.acc < STEP && this.ring.count > 0) return;
    this.acc %= STEP;
    if (src.time <= this.lastT) return;
    this.lastT = src.time;
    const c = this.buf, f = this.ring.push();
    const o = this.origin;
    c.t[f] = src.time;
    c.off[f * 3] = o.x; c.off[f * 3 + 1] = o.y; c.off[f * 3 + 2] = o.z;
    const pl = src.player && !src.player.remove ? src.player : null;
    let n = 0;
    if (pl) {
      this.playerId = pl.id;
      n = this.writeEnt(f, n, pl, F_PLAYER);
    }
    // nearest others (insertion into fixed slots: no sorting allocations)
    cam.updateWorldMatrix(true, false);
    cam.matrixWorld.decompose(_cp, _cq, _cs);
    const ref = pl ? pl.pos : _cp;
    const na = this.nearA, nd = this.nearD, cap = MAX_ENT - n;
    let m = 0;
    let nearHit = false;
    const list = src.aircraft;
    for (let li = 0; li < list.length; li++) {
      const a = list[li];
      if (!a.alive && !this.dead.has(a)) {
        // shot down since the previous keyframe (credited as World does: a fair share of the damage)
        this.dead.add(a);
        const credited = !!pl && a !== pl && (a.lastAttacker === pl || a.playerDamage >= a.damageTaken * 0.2) && a.playerDamage > 0;
        this.kill(src.time, a, credited);
      }
      if (a === pl || a.remove) continue;
      const d = a.pos.distanceToSquared(ref);
      if (pl && a.alive && a.team !== pl.team) {
        const r = pl.radius + a.radius * 0.5 + 12;
        if (d < r * r) nearHit = true;
      }
      if (d > NEAR_R * NEAR_R) continue;
      if (m === cap && d >= nd[cap - 1]) continue;
      let i = m < cap ? m++ : cap - 1;
      while (i > 0 && nd[i - 1] > d) { nd[i] = nd[i - 1]; na[i] = na[i - 1]; i--; }
      nd[i] = d; na[i] = a;
    }
    for (let i = 0; i < m; i++) { n = this.writeEnt(f, n, na[i]!, 0); na[i] = null; }
    c.n[f] = n;
    // camera: in the player's frame when there is one
    const k = f * 8;
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) / Math.max(1e-3, cam.zoom)));
    if (pl) {
      _iq.copy(pl.quat).invert();
      _cp.sub(pl.pos).applyQuaternion(_iq);
      _cq.premultiply(_iq);
      c.camRel[f] = 1;
    } else c.camRel[f] = 0;
    c.cam[k] = _cp.x; c.cam[k + 1] = _cp.y; c.cam[k + 2] = _cp.z;
    c.cam[k + 3] = _cq.x; c.cam[k + 4] = _cq.y; c.cam[k + 5] = _cq.z; c.cam[k + 6] = _cq.w;
    c.cam[k + 7] = fov;
    // guns
    const g = f * GUN_SLOTS;
    for (let s = 0; s < GUN_SLOTS; s++) {
      c.gN[g + s] = this.gCount[s];
      c.gSpd[g + s] = this.gSpd[s];
      for (let j = 0; j < 3; j++) {
        c.gOff[(g + s) * 3 + j] = this.gOff[s * 3 + j];
        c.gDir[(g + s) * 3 + j] = Math.round(THREE.MathUtils.clamp(this.gDir[s * 3 + j], -1, 1) * Q);
        c.gCol[(g + s) * 3 + j] = Math.min(255, Math.round(this.gCol[s * 3 + j] * 20));
      }
      const on = this.gShot[s];
      if (on !== this.gWas[s]) this.event(src.time, on ? EV_GUN_ON : EV_GUN_OFF, s, this.playerId, null, null, 0);
      this.gWas[s] = on;
      this.gCount[s] = 0; this.gShot[s] = 0;
    }
    // close calls: a real chunk of integrity gone in two seconds and still flying, or a
    // bandit passing within a few metres
    if (pl) {
      const hpNow = pl.alive ? pl.integrity : 0;
      let hpMax = hpNow;
      for (let i = 0; i < this.hp.length; i++) if (this.hp[i] > hpMax) hpMax = this.hp[i];
      this.hp[this.hpI] = hpNow; this.hpI = (this.hpI + 1) % this.hp.length;
      if (pl.alive && hpMax - hpNow > CLOSE_DROP && src.time - this.lastClose > CLOSE_COOLDOWN) { this.lastClose = src.time; this.mark(src.time, MK_CLOSE, pl.id); }
      if (nearHit && src.time - this.lastNear > CLOSE_COOLDOWN) { this.lastNear = src.time; this.mark(src.time, MK_NEAR, pl.id); }
    }
    if (bossCleared && !this.bossMarked) { this.bossMarked = true; this.mark(src.time, MK_BOSS, -1); }
    if (!bossCleared) this.bossMarked = false;
  }
  private bossMarked = false;

  private writeEnt(f: number, n: number, a: Aircraft, extra: number) {
    if (n >= MAX_ENT) return n;
    const c = this.buf, k = f * MAX_ENT + n;
    c.id[k] = a.id;
    let frac = a.integrity;
    const sf = a.structureFrac;
    if (sf < frac) frac = sf;
    const stage = frac > 0.85 ? 0 : frac > 0.65 ? 1 : frac > 0.45 ? 2 : frac > 0.25 ? 3 : 4;
    let fire = a.falling;
    if (!fire) for (let i = 0; i < a.zones.length; i++) if (a.zones[i].burning) { fire = true; break; }
    c.flags[k] = extra | (a.alive ? F_ALIVE : 0) | (fire ? F_FIRE : 0) | (stage << 3);
    const p = a.pos, q = a.quat;
    c.pos[k * 3] = p.x; c.pos[k * 3 + 1] = p.y; c.pos[k * 3 + 2] = p.z;
    c.quat[k * 4] = Math.round(q.x * Q); c.quat[k * 4 + 1] = Math.round(q.y * Q);
    c.quat[k * 4 + 2] = Math.round(q.z * Q); c.quat[k * 4 + 3] = Math.round(q.w * Q);
    this.noteMeta(a);
    return n + 1;
  }

  private noteMeta(a: Aircraft) {
    if (this.meta.has(a.id)) return;
    const label = (a as { name?: string }).name || a.label || (a.kind === 'b17' ? 'B-17' : a.kind === 'p51d' ? 'P-51' : a.kind);
    this.meta.set(a.id, { id: a.id, kind: a.kind, scale: a.model.scale.x, team: a.team === 'axis' ? 1 : 0, label, radius: a.radius, player: a.isPlayer });
  }

  /** Linear copy of everything recorded (or the [t0, t1] part of it). */
  toClip(t0 = -Infinity, t1 = Infinity): ClipData {
    const r = this.ring, b = this.buf;
    // the whole ring in logical order first
    const nf = r.count;
    const lin = emptyClip(nf, this.evCount, this.mkCount);
    for (let i = 0; i < nf; i++) {
      const p = r.phys(i);
      lin.t[i] = b.t[p]; lin.n[i] = b.n[p]; lin.camRel[i] = b.camRel[p];
      lin.off.set(b.off.subarray(p * 3, p * 3 + 3), i * 3);
      lin.cam.set(b.cam.subarray(p * 8, p * 8 + 8), i * 8);
      lin.id.set(b.id.subarray(p * MAX_ENT, (p + 1) * MAX_ENT), i * MAX_ENT);
      lin.flags.set(b.flags.subarray(p * MAX_ENT, (p + 1) * MAX_ENT), i * MAX_ENT);
      lin.pos.set(b.pos.subarray(p * MAX_ENT * 3, (p + 1) * MAX_ENT * 3), i * MAX_ENT * 3);
      lin.quat.set(b.quat.subarray(p * MAX_ENT * 4, (p + 1) * MAX_ENT * 4), i * MAX_ENT * 4);
      lin.gN.set(b.gN.subarray(p * GUN_SLOTS, (p + 1) * GUN_SLOTS), i * GUN_SLOTS);
      lin.gSpd.set(b.gSpd.subarray(p * GUN_SLOTS, (p + 1) * GUN_SLOTS), i * GUN_SLOTS);
      lin.gOff.set(b.gOff.subarray(p * GUN_SLOTS * 3, (p + 1) * GUN_SLOTS * 3), i * GUN_SLOTS * 3);
      lin.gDir.set(b.gDir.subarray(p * GUN_SLOTS * 3, (p + 1) * GUN_SLOTS * 3), i * GUN_SLOTS * 3);
      lin.gCol.set(b.gCol.subarray(p * GUN_SLOTS * 3, (p + 1) * GUN_SLOTS * 3), i * GUN_SLOTS * 3);
    }
    // events and marks oldest first
    for (let i = 0; i < this.evCount; i++) {
      const p = (this.evHead - this.evCount + i + MAX_EVENTS) % MAX_EVENTS, j = lin.evN++;
      lin.evT[j] = b.evT[p]; lin.evType[j] = b.evType[p]; lin.evA[j] = b.evA[p]; lin.evB[j] = b.evB[p]; lin.evS[j] = b.evS[p];
      for (let k = 0; k < 3; k++) { lin.evP[j * 3 + k] = b.evP[p * 3 + k]; lin.evV[j * 3 + k] = b.evV[p * 3 + k]; }
    }
    for (let i = 0; i < this.mkCount; i++) {
      const p = (this.mkHead - this.mkCount + i + MAX_MARKS) % MAX_MARKS, j = lin.mkN++;
      lin.mkT[j] = b.mkT[p]; lin.mkType[j] = b.mkType[p]; lin.mkA[j] = b.mkA[p]; lin.mkB[j] = b.mkB[p];
    }
    sortMarks(lin);
    lin.meta = [...this.meta.values()].map((m) => ({ ...m }));
    lin.playerId = this.playerId; lin.role = this.role; lin.title = this.title;
    return sliceClip(lin, t0, t1);
  }
}

// marks are appended in time order except a multi-kill mark that moved forward
function sortMarks(c: ClipData) {
  for (let i = 1; i < c.mkN; i++) {
    let j = i;
    while (j > 0 && c.mkT[j - 1] > c.mkT[j]) {
      const swap = <T extends { [k: number]: number }>(a: T) => { const x = a[j]; a[j] = a[j - 1]; a[j - 1] = x; };
      swap(c.mkT); swap(c.mkType); swap(c.mkA); swap(c.mkB);
      j--;
    }
  }
}

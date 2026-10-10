import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { World } from '../world/World';
import { Aircraft, Fighter } from '../world/Aircraft';
import { instantiate, ModelKind } from '../world/Models';
import type { ParticleOpts } from '../render/Particles';

// Best-moment replay.
//
// Recording: a ring buffer of transforms for the last 8 s at 20 Hz (game time): the camera,
// the player's aircraft and the 10 enemy aircraft nearest the player. Positions are stored
// relative to the formation centre, which makes them immune to floating-origin rebases and
// lets the clip be replayed around the formation as it is flying now. No meshes are kept.
//
// Clip selection: every player kill is logged with a weight (1, +1 heavy, +2 boss/ace,
// +0.5 per streak step). Two seconds after a kill, the 6 s window ending then (4 s before
// the kill, 2 s after) is scored by the kills inside it; the best window of the mission is
// copied into a fixed clip buffer. Nothing is allocated while recording.
//
// Playback (debrief): the recorded transforms are driven onto the live player aircraft
// (or a proxy clone when it is gone) and onto proxy clones of the enemies (any live
// original is hidden meanwhile), with a smoothed third-person camera that keeps the
// player's aircraft and the next victim in frame. Playback slows down around each kill;
// kills replay with an explosion, falling wrecks trail smoke.

const HZ = 20;
const STEP = 1 / HZ;
const RING = 8 * HZ;          // samples kept (8 s)
const CLIP = 6 * HZ;          // samples in the best-moment clip (6 s)
const ENT = 12;               // entities per sample: camera, player, 10 enemies
const EF = 9;                 // floats per entity: id, flags, x y z, qx qy qz qw
const STRIDE = 2 + ENT * EF;  // per sample: time, entity count, entities
const KILLS = 32;
const CLIP_KILLS = 16;
const AFTER = 2;              // s after a kill the window closes
const WINDOW = 6;
const NEAR_R = 3000;          // m: enemies recorded within this range of the player
const F_ALIVE = 1, F_PLAYER = 2, F_CAM = 4;
const SLOW = 0.35;            // playback speed around a kill

interface Meta { kind: ModelKind; scale: number }
interface Proxy { id: number; obj: THREE.Object3D; dead: boolean; smokeT: number }

const _p = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Vector3();
const _sq = new THREE.Quaternion();   // player's attitude this frame
const _cp = new THREE.Vector3();      // recorded camera (fallback view)
const _cq = new THREE.Quaternion();
const _d = new THREE.Vector3();
const _side = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _look = new THREE.Vector3();
const _zero = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const C_SMOKE: [number, number, number] = [0.16, 0.15, 0.14];
const C_SMOKE1: [number, number, number] = [0.3, 0.29, 0.28];
const SMOKE: ParticleOpts = { pos: _p, life: 2.6, size0: 5, size1: 22, color0: C_SMOKE, color1: C_SMOKE1, alpha0: 0.75, alpha1: 0, frame: 0, drag: 0.6, rise: 1.2, lit: true };

export class Replay {
  private ring = new Float64Array(RING * STRIDE);
  private head = 0;
  private count = 0;
  private acc = 0;
  private kills = new Float64Array(KILLS * 3);    // t, id, weight
  private killN = 0;
  private pendingAt = -1;
  private clip = new Float64Array(CLIP * STRIDE);
  private clipN = 0;
  private clipScore = 0;
  private clipKills = new Float64Array(CLIP_KILLS * 2); // t, id
  private clipKillN = 0;
  private meta = new Map<number, Meta>();
  private nearA: (Aircraft | null)[] = new Array(ENT - 2).fill(null);
  private nearD = new Float64Array(ENT - 2);

  // playback
  active = false;
  private pt = 0;
  private idx = 0;
  private nextKill = 0;
  private proxies: Proxy[] = [];
  private byId = new Map<number, Proxy>();
  private hidden: THREE.Object3D[] = [];
  private playerId = -1;
  private livePlayer: Aircraft | null = null;
  private playerSaved = { rel: new THREE.Vector3(), quat: new THREE.Quaternion(), fighter: false };
  private camRel = new THREE.Vector3();
  private lookRel = new THREE.Vector3();
  private camInit = false;
  private onDone: (() => void) | null = null;

  constructor(private engine: Engine, private world: World) {}

  get hasClip() { return this.clipN > 1 && this.clipScore > 0; }

  /** New mission: forget everything. */
  reset() {
    if (this.active) this.stop();
    this.head = 0; this.count = 0; this.acc = 0;
    this.killN = 0; this.pendingAt = -1;
    this.clipN = 0; this.clipScore = 0; this.clipKillN = 0;
    this.meta.clear();
  }

  // ---------------- recording ----------------

  /** Player kill (credited). weight scores the window it falls in. */
  onKill(victim: Aircraft, weight: number) {
    const k = (this.killN % KILLS) * 3;
    this.kills[k] = this.world.time; this.kills[k + 1] = victim.id; this.kills[k + 2] = weight;
    this.killN++;
    this.noteMeta(victim);
    this.pendingAt = this.world.time + AFTER;
  }

  /** Once per frame while the mission is in play (dt = game time). cam = controller view. */
  record(dt: number, cam: THREE.Camera) {
    if (dt <= 0) return;
    this.acc += dt;
    if (this.acc < STEP) return;
    this.acc %= STEP;
    const w = this.world, fc = w.formationCenter;
    const base = this.head * STRIDE;
    const r = this.ring;
    r[base] = w.time;
    let n = 0;
    n = this.writeEnt(base, n, -1, F_CAM, cam.position, cam.quaternion, fc);
    const pl = w.player;
    if (pl && !pl.remove) {
      n = this.writeEnt(base, n, pl.id, F_PLAYER | (pl.alive ? F_ALIVE : 0), pl.pos, pl.quat, fc);
      this.noteMeta(pl);
    }
    // nearest enemies (insertion into fixed slots, no sorting allocations)
    const ref = pl && !pl.remove ? pl.pos : cam.position;
    const na = this.nearA, nd = this.nearD, cap = ENT - 2;
    let m = 0;
    const list = w.aircraft;
    for (let li = 0; li < list.length; li++) {
      const a = list[li];
      if (a.team !== 'axis' || a.remove) continue;
      const d = a.pos.distanceToSquared(ref);
      if (d > NEAR_R * NEAR_R) continue;
      if (m === cap && d >= nd[cap - 1]) continue;
      let i = m < cap ? m++ : cap - 1;
      while (i > 0 && nd[i - 1] > d) { nd[i] = nd[i - 1]; na[i] = na[i - 1]; i--; }
      nd[i] = d; na[i] = a;
    }
    for (let i = 0; i < m; i++) {
      const a = na[i]!;
      n = this.writeEnt(base, n, a.id, a.alive ? F_ALIVE : 0, a.pos, a.quat, fc);
      this.noteMeta(a);
      na[i] = null;
    }
    r[base + 1] = n;
    this.head = (this.head + 1) % RING;
    if (this.count < RING) this.count++;
    if (this.pendingAt >= 0 && w.time >= this.pendingAt) this.capture();
  }

  /** Close a window still waiting for its 2 s tail (the mission ended first). */
  flush() { if (this.pendingAt >= 0) this.capture(); }

  private writeEnt(base: number, n: number, id: number, flags: number, pos: THREE.Vector3, q: THREE.Quaternion, fc: THREE.Vector3) {
    if (n >= ENT) return n;
    const o = base + 2 + n * EF, r = this.ring;
    r[o] = id; r[o + 1] = flags;
    r[o + 2] = pos.x - fc.x; r[o + 3] = pos.y - fc.y; r[o + 4] = pos.z - fc.z;
    r[o + 5] = q.x; r[o + 6] = q.y; r[o + 7] = q.z; r[o + 8] = q.w;
    return n + 1;
  }

  private noteMeta(a: Aircraft) {
    if (!this.meta.has(a.id)) this.meta.set(a.id, { kind: a.kind, scale: a.model.scale.x });
  }

  private capture() {
    this.pendingAt = -1;
    const n = Math.min(this.count, CLIP);
    if (n < 2) return;
    const oldest = (this.head - this.count + RING) % RING;
    const first = (oldest + this.count - n) % RING;
    const newest = (oldest + this.count - 1) % RING;
    const tEnd = this.ring[newest * STRIDE];
    const tStart = Math.max(this.ring[first * STRIDE], tEnd - WINDOW);
    let score = 0;
    const kn = Math.min(this.killN, KILLS);
    for (let i = 0; i < kn; i++) {
      const t = this.kills[i * 3];
      if (t >= tStart && t <= tEnd) score += this.kills[i * 3 + 2];
    }
    if (score <= this.clipScore) return;
    this.clipScore = score;
    // copy the samples oldest -> newest
    for (let s = 0; s < n; s++) {
      const src = ((first + s) % RING) * STRIDE, dst = s * STRIDE;
      for (let j = 0; j < STRIDE; j++) this.clip[dst + j] = this.ring[src + j];
    }
    this.clipN = n;
    // kills inside the clip, in time order (the log is chronological from killN - kn)
    this.clipKillN = 0;
    for (let i = 0; i < kn && this.clipKillN < CLIP_KILLS; i++) {
      const k = ((this.killN - kn + i) % KILLS) * 3;
      const t = this.kills[k];
      if (t < tStart || t > tEnd) continue;
      this.clipKills[this.clipKillN * 2] = t;
      this.clipKills[this.clipKillN * 2 + 1] = this.kills[k + 1];
      this.clipKillN++;
    }
  }

  // ---------------- playback ----------------

  /** Builds the proxies and starts the clip. done() runs when it ends or is stopped. */
  start(done: () => void): boolean {
    if (!this.hasClip || this.active) return false;
    const w = this.world, scene = this.engine.scene;
    this.onDone = done;
    // player: recorded id of the first sample that has one
    this.playerId = -1;
    for (let s = 0; s < this.clipN && this.playerId < 0; s++) {
      const b = s * STRIDE, n = this.clip[b + 1];
      for (let e = 0; e < n; e++) if (this.clip[b + 2 + e * EF + 1] & F_PLAYER) { this.playerId = this.clip[b + 2 + e * EF]; break; }
    }
    const live = w.aircraft.find((a) => a.id === this.playerId && !a.remove && a.alive) ?? null;
    this.livePlayer = live;
    if (live) {
      this.playerSaved.rel.copy(live.pos).sub(w.formationCenter);
      this.playerSaved.quat.copy(live.quat);
      this.playerSaved.fighter = live instanceof Fighter;
    }
    // proxies for every recorded enemy (and for the player when the original is gone)
    for (let s = 0; s < this.clipN; s++) {
      const b = s * STRIDE, n = this.clip[b + 1];
      for (let e = 0; e < n; e++) {
        const o = b + 2 + e * EF, id = this.clip[o], flags = this.clip[o + 1];
        if (flags & F_CAM || this.byId.has(id) || (flags & F_PLAYER && live)) continue;
        const meta = this.meta.get(id);
        if (!meta) continue;
        const root = new THREE.Group();
        const model = instantiate(meta.kind);
        model.scale.setScalar(meta.scale);
        root.add(model);
        root.visible = false;
        scene.add(root);
        const p: Proxy = { id, obj: root, dead: false, smokeT: 0 };
        this.proxies.push(p);
        this.byId.set(id, p);
        const orig = w.aircraft.find((a) => a.id === id && !a.remove);
        if (orig && orig.root.visible) { orig.root.visible = false; this.hidden.push(orig.root); }
      }
    }
    this.pt = this.clip[0];
    this.idx = 0;
    this.nextKill = 0;
    this.camInit = false;
    this.active = true;
    this.update(0);
    return true;
  }

  /** The player's aircraft model while replaying (live object), for revealing gunner-hidden parts. */
  get liveModel() { return this.livePlayer?.model ?? null; }

  stop() {
    if (!this.active) return;
    this.active = false;
    for (const p of this.proxies) p.obj.removeFromParent();   // geometry/materials are shared with the model cache
    this.proxies.length = 0;
    this.byId.clear();
    for (const o of this.hidden) o.visible = true;
    this.hidden.length = 0;
    const live = this.livePlayer;
    if (live && !live.remove && this.playerSaved.fighter) {
      // the P-51's flight model reads root.position: put it back in its place in the formation frame
      live.pos.copy(this.playerSaved.rel).add(this.world.formationCenter);
      live.quat.copy(this.playerSaved.quat);
    }
    this.livePlayer = null;
    const cb = this.onDone; this.onDone = null;
    cb?.();
  }

  /** Per frame while active; real = real seconds. Drives the transforms and the camera. */
  update(real: number) {
    if (!this.active) return;
    const c = this.clip, w = this.world, fc = w.formationCenter;
    const tEnd = c[(this.clipN - 1) * STRIDE];
    // slow around each kill
    let speed = 1;
    for (let i = 0; i < this.clipKillN; i++) {
      const dt = this.pt - this.clipKills[i * 2];
      if (dt > -0.35 && dt < 0.7) { speed = SLOW; break; }
    }
    this.pt += real * speed;
    if (this.pt >= tEnd) { this.stop(); return; }
    while (this.idx < this.clipN - 2 && c[(this.idx + 1) * STRIDE] <= this.pt) this.idx++;
    const a = this.idx * STRIDE, b = (this.idx + 1) * STRIDE;
    const ta = c[a], tb = c[b];
    const f = tb > ta ? THREE.MathUtils.clamp((this.pt - ta) / (tb - ta), 0, 1) : 0;

    for (let i = 0; i < this.proxies.length; i++) this.proxies[i].obj.visible = false;
    const na = c[a + 1], nb = c[b + 1];
    let haveS = false, haveE = false, haveCam = false, eBest = Infinity;
    // focus: the next victim in the clip (or the last one)
    let focusId = -2;
    for (let i = 0; i < this.clipKillN; i++) { focusId = this.clipKills[i * 2 + 1]; if (this.clipKills[i * 2] >= this.pt) break; }
    for (let e = 0; e < na; e++) {
      const oa = a + 2 + e * EF, id = c[oa], flags = c[oa + 1];
      // matching entity in the next sample
      let ob = -1;
      for (let k = 0; k < nb; k++) if (c[b + 2 + k * EF] === id) { ob = b + 2 + k * EF; break; }
      _p.set(c[oa + 2], c[oa + 3], c[oa + 4]);
      _q.set(c[oa + 5], c[oa + 6], c[oa + 7], c[oa + 8]);
      if (ob >= 0) {
        _p.lerp(_p2.set(c[ob + 2], c[ob + 3], c[ob + 4]), f);
        _q.slerp(_q2.set(c[ob + 5], c[ob + 6], c[ob + 7], c[ob + 8]), f);
      }
      if (flags & F_CAM) {
        if (!haveCam) { _cp.copy(_p); _cq.copy(_q); haveCam = true; }  // recorded view: fallback camera
        continue;
      }
      if (flags & F_PLAYER) {
        _s.copy(_p); _sq.copy(_q); haveS = true;
        const obj = this.livePlayer && !this.livePlayer.remove ? this.livePlayer.root : this.byId.get(id)?.obj;
        if (obj) { obj.position.copy(_p).add(fc); obj.quaternion.copy(_q); obj.visible = true; }
        continue;
      }
      const px = this.byId.get(id);
      if (!px) continue;
      px.obj.position.copy(_p).add(fc);
      px.obj.quaternion.copy(_q);
      px.obj.visible = true;
      px.dead = !(flags & F_ALIVE);
      if (px.dead) {
        px.smokeT -= real;
        if (px.smokeT <= 0 && w.effects.smoke.count < 8000) { px.smokeT = 0.07; _p.copy(px.obj.position); w.effects.smoke.spawn(SMOKE); }
      }
      // focus enemy: the next victim, else the nearest to the player
      if (id === focusId) { _e.copy(px.obj.position).sub(fc); haveE = true; eBest = -1; }
      else if (eBest >= 0 && haveS) {
        const d = px.obj.position.distanceToSquared(_d.copy(_s).add(fc));
        if (d < eBest) { eBest = d; _e.copy(px.obj.position).sub(fc); haveE = true; }
      }
    }
    // kills: an explosion where the victim is (its proxy hides once it is gone from the record)
    while (this.nextKill < this.clipKillN && this.clipKills[this.nextKill * 2] <= this.pt) {
      const px = this.byId.get(this.clipKills[this.nextKill * 2 + 1]);
      if (px) w.effects.explosion(_p.copy(px.obj.position), _zero, 1.2);
      this.nextKill++;
    }
    this.placeCamera(real, haveS, haveE, haveCam);
  }

  // Third-person camera: behind and beside the player's aircraft, looking past it at the
  // victim, smoothed in the formation frame.
  private placeCamera(real: number, haveS: boolean, haveE: boolean, haveCam: boolean) {
    const cam = this.engine.camera, fc = this.world.formationCenter;
    const meta = this.meta.get(this.playerId);
    const big = meta?.kind === 'b17' || (this.livePlayer?.radius ?? 0) > 12;
    const dist = big ? 70 : 30;
    if (haveS) {
      // look past the player at the victim; with none, sit behind the player (nose is +Z)
      if (haveE) _d.copy(_s).sub(_e); else _d.set(0, 0, -1).applyQuaternion(_sq);
      _d.y *= 0.5;
      if (_d.lengthSq() < 1e-6) _d.set(0, 0, -1);
      _d.normalize();
      _side.crossVectors(UP, _d);
      if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0);
      _side.normalize();
      _tgt.copy(_s).addScaledVector(_d, dist * 0.8).addScaledVector(_side, dist * 0.55).addScaledVector(UP, dist * 0.3);
      if (haveE) {
        const far = _s.distanceTo(_e) > 900;
        _look.copy(_s).lerp(_e, far ? 0.25 : 0.42);
      } else _look.copy(_s);
    } else if (haveCam) {
      _tgt.copy(_cp);
      _look.copy(_cp).add(_d.set(0, 0, -50).applyQuaternion(_cq));
    } else return;
    if (!this.camInit) { this.camRel.copy(_tgt); this.lookRel.copy(_look); this.camInit = true; }
    else {
      this.camRel.lerp(_tgt, 1 - Math.exp(-real * 2.2));
      this.lookRel.lerp(_look, 1 - Math.exp(-real * 3.5));
    }
    cam.position.copy(this.camRel).add(fc);
    cam.lookAt(_look.copy(this.lookRel).add(fc));
  }
}

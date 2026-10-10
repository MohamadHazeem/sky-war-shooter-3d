import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  Recorder, FrameRing, findFrame, findSlot, samplePose, sampleCamera, sliceClip, markLabel,
  REC_HZ, RING_FRAMES, MAX_ENT, F_ALIVE, F_PLAYER, F_FIRE, stageOf,
  EV_KILL, EV_GUN_ON, EV_GUN_OFF, EV_EXPLOSION, MK_KILL, MK_MULTI, MK_ACE, MK_CLOSE,
} from '../src/game/Recorder';
import type { Aircraft } from '../src/world/Aircraft';

const STEP = 1 / REC_HZ;
let nextId = 1000;

interface Fake {
  id: number; kind: string; team: 'allied' | 'axis'; alive: boolean; remove: boolean; falling: boolean;
  pos: THREE.Vector3; quat: THREE.Quaternion; vel: THREE.Vector3; radius: number; label: string; isPlayer: boolean;
  integrity: number; structureFrac: number; zones: { burning?: boolean }[]; model: { scale: { x: number } }; lastAttacker: Fake | null;
}

function plane(o: Partial<Fake> = {}): Fake {
  return {
    id: nextId++, kind: 'fw190', team: 'axis', alive: true, remove: false, falling: false,
    pos: new THREE.Vector3(), quat: new THREE.Quaternion(), vel: new THREE.Vector3(), radius: 8, label: 'Fw 190', isPlayer: false,
    integrity: 1, structureFrac: 1, zones: [], model: { scale: { x: 6 } }, lastAttacker: null, ...o,
  };
}
const ac = (f: Fake) => f as unknown as Aircraft;

/** Records `frames` keyframes; move(i) is called before each. */
function run(rec: Recorder, world: { time: number; aircraft: Fake[]; player: Fake | null }, frames: number, cam: THREE.PerspectiveCamera, move?: (i: number) => void) {
  for (let i = 0; i < frames; i++) {
    world.time += STEP;
    move?.(i);
    rec.record(STEP, world as unknown as { time: number; aircraft: Aircraft[]; player: Aircraft | null }, cam);
  }
}

describe('FrameRing', () => {
  it('keeps logical order oldest first and wraps over the oldest slot', () => {
    const r = new FrameRing(4);
    const slots = [r.push(), r.push(), r.push()];
    expect(slots).toEqual([0, 1, 2]);
    expect(r.count).toBe(3);
    expect([0, 1, 2].map((i) => r.phys(i))).toEqual([0, 1, 2]);
    r.push(); r.push(); r.push();          // 6 pushes into 4 slots: logical 0 is the 3rd push
    expect(r.count).toBe(4);
    expect([0, 1, 2, 3].map((i) => r.phys(i))).toEqual([2, 3, 0, 1]);
    r.clear();
    expect(r.count).toBe(0);
    expect(r.push()).toBe(0);
  });
});

describe('Recorder ring buffer', () => {
  let rec: Recorder;
  let cam: THREE.PerspectiveCamera;
  beforeEach(() => { rec = new Recorder(); cam = new THREE.PerspectiveCamera(60, 1, 0.1, 1000); });

  it('records at 12 Hz of game time, not per frame', () => {
    const w = { time: 0, aircraft: [] as Fake[], player: null };
    for (let i = 0; i < 120; i++) { w.time += 1 / 60; rec.record(1 / 60, w as never, cam); }
    // 2 s at 60 fps -> ~24 keyframes (the first is taken at once)
    expect(rec.frames).toBeGreaterThanOrEqual(23);
    expect(rec.frames).toBeLessThanOrEqual(25);
  });

  it('keeps only the last 90 s and returns them oldest first', () => {
    const pl = plane({ team: 'allied', kind: 'b17', isPlayer: true, radius: 16 });
    const w = { time: 0, aircraft: [pl], player: pl };
    run(rec, w, RING_FRAMES + 200, cam, () => pl.pos.x += 10);
    expect(rec.frames).toBe(RING_FRAMES);
    const c = rec.toClip();
    expect(c.frames).toBe(RING_FRAMES);
    for (let i = 1; i < c.frames; i++) expect(c.t[i]).toBeGreaterThan(c.t[i - 1]);
    expect(c.t[c.frames - 1]).toBeCloseTo(w.time, 6);
    expect(c.t[c.frames - 1] - c.t[0]).toBeCloseTo((RING_FRAMES - 1) * STEP, 4);
    // newest sample holds the newest position; the oldest 200 frames were overwritten
    expect(c.pos[(c.frames - 1) * MAX_ENT * 3]).toBeCloseTo(pl.pos.x, 3);
    expect(c.pos[0]).toBeCloseTo(10 * 201, 3);
    expect(c.id[0]).toBe(pl.id);
    expect(c.flags[0] & F_PLAYER).toBeTruthy();
  });

  it('caps the aircraft per frame and keeps the nearest, player first', () => {
    const pl = plane({ team: 'allied', isPlayer: true });
    const others = Array.from({ length: 80 }, (_, i) => plane({ pos: new THREE.Vector3(0, 0, 100 + i * 10) }));
    const w = { time: 0, aircraft: [...others.slice().reverse(), pl], player: pl };
    run(rec, w, 2, cam);
    const c = rec.toClip();
    expect(c.n[1]).toBe(MAX_ENT);
    expect(c.id[MAX_ENT]).toBe(pl.id);
    const ids = Array.from(c.id.subarray(MAX_ENT + 1, MAX_ENT * 2));
    expect(ids).toEqual(others.slice(0, MAX_ENT - 1).map((o) => o.id));
  });

  it('stores damage stage, fire and alive flags', () => {
    const a = plane({ structureFrac: 0.5, zones: [{ burning: true }] });
    const b = plane({ alive: false, falling: true, integrity: 0.1, pos: new THREE.Vector3(0, 0, 50) });
    const w = { time: 0, aircraft: [a, b], player: null };
    run(rec, w, 1, cam);
    const c = rec.toClip();
    const fa = c.flags[findSlot(c, 0, a.id)], fb = c.flags[findSlot(c, 0, b.id)];
    expect(stageOf(fa)).toBe(2);
    expect(fa & F_FIRE).toBeTruthy();
    expect(fa & F_ALIVE).toBeTruthy();
    expect(stageOf(fb)).toBe(4);
    expect(fb & F_ALIVE).toBe(0);
  });
});

describe('interpolation', () => {
  const base = new THREE.Vector3();
  const pos = new THREE.Vector3(), q = new THREE.Quaternion(), vel = new THREE.Vector3();
  let rec: Recorder;
  let cam: THREE.PerspectiveCamera;
  beforeEach(() => { rec = new Recorder(); cam = new THREE.PerspectiveCamera(60, 1, 0.1, 1000); });

  it('finds frames by time (binary search, clamped)', () => {
    const w = { time: 0, aircraft: [] as Fake[], player: null };
    run(rec, w, 50, cam);
    const c = rec.toClip();
    expect(findFrame(c, -5)).toBe(0);
    expect(findFrame(c, 999)).toBe(c.frames - 2);
    for (const i of [0, 7, 30, 48]) {
      expect(findFrame(c, c.t[i])).toBe(i);
      expect(findFrame(c, (c.t[i] + c.t[i + 1]) / 2)).toBe(i);
    }
  });

  it('lerps position, slerps attitude and derives velocity between keyframes', () => {
    const a = plane();
    const w = { time: 0, aircraft: [a], player: null };
    run(rec, w, 2, cam, (i) => {
      a.pos.set(i * 12, 0, 0);
      a.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * Math.PI / 2);
    });
    const c = rec.toClip();
    const mid = (c.t[0] + c.t[1]) / 2;
    expect(samplePose(c, mid, a.id, base, pos, q, vel)).toBeGreaterThanOrEqual(0);
    expect(pos.x).toBeCloseTo(6, 3);
    const expectQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
    expect(q.angleTo(expectQ)).toBeLessThan(1e-3);
    expect(vel.x).toBeCloseTo(12 * REC_HZ, 2);
    // clamped at the ends
    samplePose(c, c.t[1] + 10, a.id, base, pos, q);
    expect(pos.x).toBeCloseTo(12, 3);
  });

  it('is continuous across a floating-origin rebase between keyframes', () => {
    const a = plane();
    const w = { time: 0, aircraft: [a], player: null };
    run(rec, w, 3, cam, (i) => {
      const absolute = 1000 + i * 30;                // the aircraft flies on steadily
      if (i === 2) rec.origin.set(900, 0, 0);        // world shifted by 900 m before frame 2
      a.pos.set(absolute - rec.origin.x, 0, 0);
    });
    const c = rec.toClip();
    // playback frame = the latest origin: the aircraft is at absolute - 900
    const b = new THREE.Vector3(900, 0, 0);
    samplePose(c, (c.t[1] + c.t[2]) / 2, a.id, b, pos, q, vel);
    expect(pos.x).toBeCloseTo(1000 + 45 - 900, 3);
    expect(vel.x).toBeCloseTo(30 * REC_HZ, 2);
    samplePose(c, c.t[0], a.id, b, pos, q);
    expect(pos.x).toBeCloseTo(100, 3);
  });

  it('reports an aircraft absent from the frame, and holds the last pose when it vanishes next', () => {
    const a = plane(), b = plane({ pos: new THREE.Vector3(5, 0, 0) });
    const w = { time: 0, aircraft: [a, b] as Fake[], player: null };
    run(rec, w, 1, cam);
    w.aircraft = [a];
    run(rec, w, 1, cam);
    const c = rec.toClip();
    expect(samplePose(c, (c.t[0] + c.t[1]) / 2, b.id, base, pos, q, vel)).toBeGreaterThanOrEqual(0);
    expect(pos.x).toBeCloseTo(5, 4);
    expect(vel.lengthSq()).toBe(0);
    expect(samplePose(c, c.t[0], 424242, base, pos, q)).toBe(-1);
  });

  it('keeps the camera locked to the player when recorded in its frame', () => {
    const pl = plane({ team: 'allied', isPlayer: true });
    const w = { time: 0, aircraft: [pl], player: pl };
    run(rec, w, 2, cam, (i) => {
      pl.pos.set(i * 100, 0, 0);
      cam.position.set(pl.pos.x + 1, 2, 0);        // eye 1 m ahead and 2 m up
    });
    const c = rec.toClip();
    expect(c.camRel[0]).toBe(1);
    const p = new THREE.Vector3(), cq = new THREE.Quaternion();
    sampleCamera(c, (c.t[0] + c.t[1]) / 2, base, p, cq);
    expect(p.x).toBeCloseTo(51, 3);
    expect(p.y).toBeCloseTo(2, 3);
  });
});

describe('events, guns and marks', () => {
  let rec: Recorder;
  let cam: THREE.PerspectiveCamera;
  beforeEach(() => { rec = new Recorder(); cam = new THREE.PerspectiveCamera(60, 1, 0.1, 1000); });

  it('records kills with killer and absolute position', () => {
    const pl = plane({ team: 'allied', isPlayer: true });
    const v = plane({ pos: new THREE.Vector3(10, 20, 30) });
    rec.origin.set(1000, 0, 0);
    const w = { time: 0, aircraft: [pl, v], player: pl };
    run(rec, w, 1, cam);
    rec.kill(w.time, ac(v), true);
    rec.kill(w.time, ac(v), true);          // same kill seen twice: ignored
    const c = rec.toClip();
    expect(c.evN).toBe(1);
    expect(c.evType[0]).toBe(EV_KILL);
    expect(c.evA[0]).toBe(v.id);
    expect(c.evB[0]).toBe(pl.id);
    expect(c.evP[0]).toBe(1010);
  });

  it('logs a kill once when an aircraft stops being alive, credited by the player\'s share', () => {
    const pl = plane({ team: 'allied', isPlayer: true });
    const v = plane({ pos: new THREE.Vector3(0, 0, 200) }) as Fake & { playerDamage: number; damageTaken: number };
    v.playerDamage = 50; v.damageTaken = 100;
    const w = { time: 0, aircraft: [pl, v] as Fake[], player: pl };
    run(rec, w, 2, cam);
    v.alive = false; v.falling = true;
    run(rec, w, 3, cam);
    const c = rec.toClip();
    const kills = [];
    for (let i = 0; i < c.evN; i++) if (c.evType[i] === EV_KILL) kills.push(i);
    expect(kills.length).toBe(1);
    expect(c.evA[kills[0]]).toBe(v.id);
    expect(c.evB[kills[0]]).toBe(pl.id);
    expect(c.evS[kills[0]]).toBe(1);
  });

  it('turns the player shots into gun slots with on/off events', () => {
    const pl = plane({ team: 'allied', isPlayer: true, kind: 'p51d' });
    const w = { time: 0, aircraft: [pl], player: pl };
    run(rec, w, 1, cam);
    const muzzle = new THREE.Vector3(2, 0, 1), vel = new THREE.Vector3(0, 0, 870);
    for (let i = 0; i < 4; i++) rec.shot(w.time, ac(pl), muzzle, vel, i % 2 === 0, [9, 2.6, 0.9]);
    rec.shot(w.time, ac(pl), new THREE.Vector3(-2, 0, 1), vel, true, [9, 2.6, 0.9]);   // the other wing
    run(rec, w, 1, cam);
    run(rec, w, 1, cam);                    // no shots: guns stop
    const c = rec.toClip();
    expect(c.gN[1 * 6 + 0]).toBe(2);
    expect(c.gN[1 * 6 + 1]).toBe(1);
    expect(c.gOff[(1 * 6 + 1) * 3]).toBeCloseTo(-2, 4);
    expect(c.gDir[(1 * 6) * 3 + 2]).toBe(32767);
    expect(c.gSpd[1 * 6]).toBeCloseTo(870, 2);
    const on = [], off = [];
    for (let i = 0; i < c.evN; i++) { if (c.evType[i] === EV_GUN_ON) on.push(c.evA[i]); if (c.evType[i] === EV_GUN_OFF) off.push(c.evA[i]); }
    expect(on.sort()).toEqual([0, 1]);
    expect(off.sort()).toEqual([0, 1]);
  });

  it('marks kills, grows one multi-kill mark through a streak, flags aces and close calls', () => {
    const pl = plane({ team: 'allied', isPlayer: true });
    const w = { time: 0, aircraft: [pl], player: pl };
    run(rec, w, 12, cam);
    rec.playerKill(w.time, ac(plane()), 1, false, false);
    run(rec, w, 24, cam);
    rec.playerKill(w.time, ac(plane()), 2, false, false);
    run(rec, w, 24, cam);
    const third = w.time;
    rec.playerKill(third, ac(plane()), 3, false, true);
    pl.integrity = 0.7;                     // 30% gone at once: close call
    run(rec, w, 2, cam);
    const c = rec.toClip(-Infinity);
    const types = Array.from(c.mkType.subarray(0, c.mkN));
    expect(types.filter((x) => x === MK_KILL).length).toBe(2);
    expect(types.filter((x) => x === MK_ACE).length).toBe(1);
    expect(types.filter((x) => x === MK_MULTI).length).toBe(1);
    expect(types.filter((x) => x === MK_CLOSE).length).toBe(1);
    const mi = types.indexOf(MK_MULTI);
    expect(c.mkA[mi]).toBe(3);
    expect(c.mkT[mi]).toBe(third);
    expect(markLabel(MK_MULTI, 3)).toBe('Triple kill');
    for (let i = 1; i < c.mkN; i++) expect(c.mkT[i]).toBeGreaterThanOrEqual(c.mkT[i - 1]);
  });

  it('slices a time window with its events, marks and metas', () => {
    const pl = plane({ team: 'allied', isPlayer: true });
    const e = plane();
    const w = { time: 0, aircraft: [pl, e] as Fake[], player: pl };
    run(rec, w, 60, cam);
    rec.event(2.0, EV_EXPLOSION, -1, -1, new THREE.Vector3(), null, 1);
    rec.event(4.5, EV_EXPLOSION, -1, -1, new THREE.Vector3(), null, 1);
    rec.mark(2.1, MK_ACE, e.id);
    const c = rec.toClip();
    const s = sliceClip(c, 1.5, 3.0);
    expect(s.t[0]).toBeLessThanOrEqual(1.5);
    expect(s.t[s.frames - 1]).toBeGreaterThanOrEqual(3.0 - 1e-9);
    expect(s.frames).toBeLessThan(c.frames);
    expect(s.evN).toBe(1);
    expect(s.mkN).toBe(1);
    expect(s.meta.map((m) => m.id).sort()).toEqual([pl.id, e.id].sort());
    // the slice is independent of the source
    s.pos[0] = 12345;
    expect(c.pos[0]).not.toBe(12345);
  });
});

import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Game } from '../game/Game';
import { CAMPAIGN } from '../game/Missions';
import { applyWeather } from '../render/Weather';
import { STATIONS, type StationId } from '../world/B17Layout';
import type { Fighter } from '../world/Aircraft';
import type { EnemyType } from '../world/EnemyTypes';
import { CORE, NOSE, TAIL, WING_L } from '../world/destruction/Parts';

// Development-only: the Phase 10 goal 09 destruction sequences, played from a gunner's seat with
// a seeded scene, rounds booked through the real hit path (World.onHit -> zones -> failure model),
// and the frames saved through the dev server (docs/phase10/shots/09/).
//   await sws.destruction.capture('wing')        -> wing shot off (waist gun)
//   await sws.destruction.capture('tail')        -> tail separation (tail gun)
//   await sws.destruction.capture('fuel')        -> fuel-tank fire and explosion (top turret)
//   await sws.destruction.capture('engine')      -> engine fire, the pilot bails out (waist gun)
//   await sws.destruction.capture('all')         -> all four
//   sws.destruction.perf()                       -> frame times: a quiet scene vs eight break-ups at once
// Leaves the live loop stopped while it runs (frames are stepped by hand); sws.engine.start() resumes.

type Seq = 'wing' | 'tail' | 'fuel' | 'engine';
interface Setup { station: StationId; at: THREE.Vector3; rel: THREE.Vector3; heading: THREE.Vector3; type: EnemyType; times: number[] }

// Enemy placement in the bomber's frame (m; +x left, +z forward), its speed relative to the bomber
// (m/s, bomber frame) and the capture times (s after the first round)
const SETUPS: Record<Seq, Setup> = {
  wing: { station: 'waistL', at: new THREE.Vector3(165, 22, 45), rel: new THREE.Vector3(-8, -2, -55), heading: new THREE.Vector3(-0.15, 0, -1), type: 'fw190', times: [0.05, 0.6, 1.4, 2.6, 4.2] },
  tail: { station: 'tail', at: new THREE.Vector3(25, 18, -210), rel: new THREE.Vector3(0, -2, 45), heading: new THREE.Vector3(0, 0, 1), type: 'bf109', times: [0.05, 0.5, 1.2, 2.2, 3.6] },
  fuel: { station: 'top', at: new THREE.Vector3(-90, 120, 260), rel: new THREE.Vector3(10, -6, -40), heading: new THREE.Vector3(0.2, -0.1, -1), type: 'fw190', times: [0.6, 1.6, 2.4, 2.8, 4.0] },
  engine: { station: 'waistL', at: new THREE.Vector3(175, 12, 90), rel: new THREE.Vector3(-6, -1, -45), heading: new THREE.Vector3(-0.1, 0, -1), type: 'fw190', times: [0.1, 0.8, 1.6, 2.6, 4.5] },
};

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function destructionQa(engine: Engine, game: Game) {
  const w = game.world, gun = game.gunner;
  let target: Fighter | null = null;
  const clearOthers = () => { for (const a of w.aircraft) if (a.team === 'axis' && a !== target) a.remove = true; };

  function aimAt(id: StationId, p: THREE.Vector3) {
    const pb = w.playerBomber!, def = STATIONS[id];
    const local = pb.worldToLocal(p.clone()).sub(def.pivot);
    let yaw = Math.atan2(local.x, local.z) - def.rest.yaw;
    while (yaw > Math.PI) yaw -= 2 * Math.PI;
    while (yaw < -Math.PI) yaw += 2 * Math.PI;
    const pitch = Math.asin(local.y / local.length()) - def.rest.pitch;
    const s = (gun as any).states.get(id);
    s.yaw = s.tYaw = THREE.MathUtils.clamp(yaw, def.yaw[0], def.yaw[1]);
    s.pitch = s.tPitch = THREE.MathUtils.clamp(pitch, def.pitch[0], def.pitch[1]);
    s.vYaw = s.vPitch = 0;
  }

  // what to keep in the sight: the hulk, else the middle of the wreckage
  const focus = new THREE.Vector3();
  function follow(f: Fighter) {
    if (!f.remove && f.root.visible) { focus.lerp(f.pos, 0.35); return; }
    const ps = (w.destruction as any).pieces.filter((p: any) => p.active && p.source === f);
    if (!ps.length) return;
    const c = new THREE.Vector3();
    for (const p of ps) c.add(p.body.pos);
    focus.lerp(c.divideScalar(ps.length), 0.25);
  }

  /** A seeded mission, the gun manned, one enemy placed off the gun (kinematic: we fly it). */
  function setup(seq: Seq) {
    const S = SETUPS[seq];
    engine.renderer.setAnimationLoop(null);
    game.bookends.auto = true;
    const m = { ...CAMPAIGN[0], station: S.station };
    game.startMission(m);
    applyWeather(engine, { ...m.weather!, sunEl: 32, sunAz: 150, low: 0.55, high: 0.35 } as any);
    target = null;
    for (let i = 0; i < 90; i++) { clearOthers(); engine.frame(1 / 60, false); }
    (gun as any).setStation(S.station, true);
    const pb = w.playerBomber!;
    const pos = pb.localToWorld(S.at.clone());
    const f = w.spawnEnemy(pos, 'beam', 1, false, false, S.type);
    target = f;
    f.kinematic = true;
    const dir = S.heading.clone().applyQuaternion(pb.quat).normalize();
    f.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    f.vel.copy(pb.vel).add(S.rel.clone().applyQuaternion(pb.quat));
    f.fm.vel.copy(f.vel);
    focus.copy(f.pos);
    aimAt(S.station, focus);
    return f;
  }

  /** One frame: fly the enemy while it lives, keep the gun on the action. */
  function step(f: Fighter, render: boolean) {
    clearOthers();
    if (f.alive) f.pos.addScaledVector(f.vel, 1 / 60);
    follow(f);
    aimAt(SETUPS[current].station, focus);
    engine.frame(1 / 60, render);
  }
  let current: Seq = 'wing';

  /** Rounds landing at a model-frame point (unscaled metres), booked through World.onHit. */
  function rounds(f: Fighter, x: number, y: number, z: number, n: number, dmg = 12, cannon = false) {
    const sc = f.model.scale.x;
    for (let i = 0; i < n && !f.remove; i++) {
      f.root.updateMatrixWorld(true);
      const local = new THREE.Vector3(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4).multiplyScalar(sc);
      const point = f.localToWorld(local, new THREE.Vector3());
      let zone = f.zones[0], bd = Infinity;
      for (const zz of f.zones) { const d = zz.offset.distanceTo(local) - zz.radius; if (d < bd) { bd = d; zone = zz; } }
      const from = engine.camera.position;
      w.ballistics.onHit?.({ target: f, zone, point, damage: dmg, cannon, shooter: w.playerBomber, bulletVel: point.clone().sub(from).normalize().multiplyScalar(850), playerShot: true });
    }
  }

  async function save(name: string, width = 960) {
    const src = engine.renderer.domElement;
    const c = document.createElement('canvas');
    c.width = width; c.height = Math.round(width * src.height / src.width);
    c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.8));
    const res = await fetch(`/__dev/save?path=docs/phase10/shots/09/${name}.jpg`, { method: 'POST', body: blob });
    return res.ok ? `docs/phase10/shots/09/${name}.jpg` : `save failed ${res.status}`;
  }

  /** Play a sequence; save the frames at its capture times. Returns what happened. */
  async function capture(seq: Seq | 'all', saveFrames = true): Promise<any> {
    if (seq === 'all') { const out: any = {}; for (const s of Object.keys(SETUPS) as Seq[]) out[s] = await capture(s, saveFrames); return out; }
    const rnd = Math.random;
    Math.random = mulberry(1944 + seq.length);
    current = seq;
    const log: string[] = [], files: string[] = [];
    try {
      const f = setup(seq);
      const d = w.destruction;
      for (let i = 0; i < 20; i++) step(f, false);
      engine.post.resetHistory();
      if (saveFrames) { for (let i = 0; i < 10; i++) step(f, true); files.push(await save(`${seq}-0-before`)); }
      // the damage
      if (seq === 'wing') rounds(f, 2.0, -0.2, -0.1, 40, 14);                 // the left wing root
      else if (seq === 'tail') rounds(f, 0, 0.5, -5.1, 40, 14);               // the rear fuselage / tailplane
      else if (seq === 'fuel') {
        // cannon shells into the fuselage tank until it burns; the pilot is dead at the stick
        for (let i = 0; i < 30 && !(d.structure(f)?.fire[CORE] ?? 0); i++) rounds(f, 0, 0.1, -2.6, 1, 6, true);
        const s = d.structure(f)!;
        if (!s.fire[CORE]) s.ignite(CORE, true);
        f.pilotKilled = true;
        s.fire[CORE] = 0.8; s.hot[CORE] = 1.4;
      } else {
        // engine shot up: it catches fire, the pilot gets out (the co-op path forces the same ending)
        d.forceDeath(f, 3 | (NOSE << 3) | 64);
        rounds(f, 0, 0.2, 2.6, 30, 14);
        if (f.alive) w.killAircraft(f, true, 'engine');
      }
      log.push(`after rounds: alive=${f.alive} kind=${d.deathCode(f)} bits=${d.bits(f).toString(2)} pieces=${d.counts().pieces}`);
      let t = 0, k = 0;
      const S = SETUPS[seq];
      while (k < S.times.length) {
        const due = S.times[k];
        const render = saveFrames && t > due - 0.12;
        step(f, render);
        t += 1 / 60;
        if (t >= due) {
          if (saveFrames) files.push(await save(`${seq}-${k + 1}-t${due.toFixed(1).replace('.', '_')}`));
          log.push(`t=${due}: alive=${f.alive} remove=${f.remove} pieces=${d.counts().pieces} hulks=${d.counts().hulks} stats=${JSON.stringify(d.stats)}`);
          k++;
        }
      }
      return { seq, log, files, programs: engine.renderer.info.programs?.length };
    } finally {
      Math.random = rnd;
    }
  }

  /** Frame time with eight enemies close by: all flying, then all coming apart at once. */
  function perf(n = 120) {
    const rnd = Math.random;
    Math.random = mulberry(77);
    try {
      current = 'wing';
      const f0 = setup('wing');
      f0.remove = true;
      const pb = w.playerBomber!;
      const fs: Fighter[] = [];
      for (let i = 0; i < 8; i++) {
        const e = w.spawnEnemy(pb.localToWorld(new THREE.Vector3(120 + i * 25, -30 + i * 12, 150 - i * 40)), 'beam', 1, false, false, i % 2 ? 'bf109' : 'fw190');
        e.kinematic = true; e.vel.copy(pb.vel); fs.push(e);
      }
      target = null;
      const keep = () => { for (const a of w.aircraft) if (a.team === 'axis' && !fs.includes(a as Fighter)) a.remove = true; };
      const bench = () => {
        const t: number[] = [];
        for (let i = 0; i < n; i++) { keep(); for (const e of fs) if (e.alive) e.pos.addScaledVector(e.vel, 1 / 60); t.push(engine.timedFrame(1 / 60)); }
        t.sort((a, b) => a - b);
        return { avg: +(t.reduce((a, b) => a + b, 0) / n).toFixed(2), p50: +t[n >> 1].toFixed(2), p95: +t[Math.floor(n * 0.95)].toFixed(2), max: +t[n - 1].toFixed(2), calls: engine.renderer.info.render.calls, tris: engine.renderer.info.render.triangles };
      };
      aimAt('waistL', pb.localToWorld(new THREE.Vector3(200, 20, 0)));
      for (let i = 0; i < 30; i++) { keep(); engine.frame(1 / 60, true); }
      const quiet = bench();
      // eight break-ups at once: wings, tails, tanks
      const d = w.destruction;
      fs.forEach((e, i) => {
        if (i % 4 === 0) d.forceDeath(e, 0);                         // fireball: shards + whole parts
        else if (i % 4 === 1) d.forceDeath(e, 1 | (WING_L << 3));    // wing off: hulk + wing
        else if (i % 4 === 2) d.forceDeath(e, 2 | (TAIL << 3));      // tail off
        else d.structure(e) ?? d.state(e);
        if (i % 4 === 3) { d.structure(e)!.ignite(CORE, true); return; }
        w.killAircraft(e, true, 'fuselage');
      });
      const busy = bench();
      const after = d.counts();
      return { quiet, busy, after, stats: { ...d.stats }, programs: engine.renderer.info.programs?.length, quality: engine.quality };
    } finally {
      Math.random = rnd;
    }
  }

  return { capture, perf, setup, rounds };
}

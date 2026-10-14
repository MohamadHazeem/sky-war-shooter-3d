import * as THREE from 'three';
import type { Engine, Quality } from '../core/Engine';
import type { Game } from '../game/Game';
import { CAMPAIGN, type Mission } from '../game/Missions';
import { applyWeather } from '../render/Weather';
import { Atmos } from '../render/Atmosphere';
import { farTerrainDev } from '../render/FarTerrain';

// Development-only: fixed ground-from-altitude views for Phase 10 goal 04 (docs/phase10/04-ground.md).
// Same mission, time, weather and camera before and after a change, so captures compare 1:1.
//   await sws.ground.setup('down')         ball turret looking straight down over farmland
//   await sws.ground.setup('horizon')      left waist window, looking out at the horizon
//   await sws.ground.setup('coast')        the Dutch coast crossing on the way home (m6)
//   await sws.ground.setup('target')       Emden burning, 45 s after bombs away (m1)
//   await sws.ground.save('down-after')    JPEG through tools/terrain/save-shots.mjs (port 5314)
// Hidden tabs do not run requestAnimationFrame: everything here is driven by engine.frame().
export type GroundShot = 'down' | 'horizon' | 'coast' | 'target' | 'snow' | 'autumn' | 'glint';

interface ShotDef { mission: string; t: number; cam: 'down' | 'waist' | 'forward' | 'target' | 'sun'; low?: number; high?: number; sunEl?: number; sunAz?: number }
const DEFS: Record<GroundShot, ShotDef> = {
  down: { mission: 'm1', t: 40, cam: 'down', low: 0.42, high: 0.3 },
  horizon: { mission: 'm1', t: 40, cam: 'waist', low: 0.42, high: 0.3 },
  coast: { mission: 'm6', t: 60, cam: 'forward', low: 0.4, high: 0.3 },
  target: { mission: 'm1', t: 130, cam: 'target', low: 0.5, high: 0.3 },
  snow: { mission: 'm3', t: 60, cam: 'forward', low: 0.35, high: 0.3 },
  autumn: { mission: 'm8', t: 60, cam: 'waist', low: 0.4, high: 0.3 },
  glint: { mission: 'm6', t: 60, cam: 'sun', low: 0.35, high: 0.3, sunEl: 32 },
};

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function groundShots(engine: Engine, game: Game) {
  const w = game.world;
  const clearEnemies = () => { for (const a of w.aircraft) if (a.team === 'axis') a.remove = true; };

  async function setup(name: GroundShot, o: { quality?: Quality; fov?: number } = {}) {
    const def = DEFS[name];
    window.dispatchEvent(new Event('resize'));   // pick up an emulated viewport size
    const rnd = Math.random;
    Math.random = mulberry(1944);
    try {
      if (o.quality) { game.settings.quality = o.quality; game.applySettings(); }
      const mission = CAMPAIGN.find((m) => m.id === def.mission) as Mission;
      game.startMission(mission);
      (engine as any).livingSky?.reset();
      const wx = { ...mission.weather!, low: def.low ?? mission.weather!.low, high: def.high ?? mission.weather!.high, front: undefined, preset: undefined,
        sunEl: def.sunEl ?? mission.weather!.sunEl, sunAz: def.sunAz ?? mission.weather!.sunAz };
      (game as any).setWeather(wx);
      applyWeather(engine, wx);
      // fly to the shot's mission time without drawing (30 Hz is enough for the formation)
      while (w.time < def.t) { clearEnemies(); engine.frame(1 / 30, false); if (game.state !== 'playing') break; }
      // terrain data streams in asynchronously: give it a moment, then settle the temporal passes
      for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 50)); clearEnemies(); engine.frame(1 / 60, false); }
    } finally { Math.random = rnd; }
    game.gunner.detach();
    const pb = w.playerBomber!;
    const cam = engine.camera;
    const fwd = w.formationForward.clone().setY(0).normalize();
    const left = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const at = new THREE.Vector3();
    cam.up.set(0, 1, 0);
    if (def.cam === 'down') {
      cam.position.copy(pb.pos).add(new THREE.Vector3(0, -3, 0));
      at.copy(cam.position).add(new THREE.Vector3(0, -1000, 0)).addScaledVector(fwd, 120);
      cam.fov = o.fov ?? 60;
    } else if (def.cam === 'waist') {
      // the left waist window, aft of the wing
      cam.position.copy(pb.pos).addScaledVector(left, 1.4).addScaledVector(fwd, -6.5).add(new THREE.Vector3(0, 0.6, 0));
      at.copy(cam.position).addScaledVector(left, 1000).add(new THREE.Vector3(0, -190, 0));
      cam.fov = o.fov ?? 62;
    } else if (def.cam === 'forward') {
      cam.position.copy(pb.pos).add(new THREE.Vector3(0, -3, 0)).addScaledVector(fwd, 12);
      at.copy(cam.position).addScaledVector(fwd, 1000).add(new THREE.Vector3(0, -700, 0));
      cam.fov = o.fov ?? 62;
    } else if (def.cam === 'sun') {
      const sun = new THREE.Vector3(Atmos.sunDir.x, 0, Atmos.sunDir.z).normalize();
      cam.position.copy(pb.pos).add(new THREE.Vector3(0, -3, 0));
      at.copy(cam.position).addScaledVector(sun, 1000).add(new THREE.Vector3(0, -620, 0));
      cam.fov = o.fov ?? 62;
    } else {
      const aim = game.target.aimPoint;
      cam.position.copy(pb.pos).add(new THREE.Vector3(0, -3, 0));
      at.set(aim.x - Atmos.originOffset.x, 0, aim.y - Atmos.originOffset.z);
      cam.fov = o.fov ?? 50;
    }
    cam.lookAt(at);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    engine.post.resetHistory();
    for (let i = 0; i < 24; i++) engine.render(1 / 60);
    return { mission: def.mission, t: +w.time.toFixed(1), cam: cam.position.toArray().map((v) => Math.round(v)) };
  }

  async function save(file: string, port = 5314) {
    engine.render(1 / 60);
    const url = engine.renderer.domElement.toDataURL('image/jpeg', 0.92);
    const r = await fetch(`http://localhost:${port}/save?file=${encodeURIComponent(file + '.jpg')}`, { method: 'POST', body: url });
    return r.text();
  }

  // Render-only frame times on the frozen view (GPU synced with a 1-pixel readback, like sws.bench)
  function bench(n = 120) {
    const gl = engine.renderer.getContext(), px = new Uint8Array(4);
    const one = () => { const t0 = performance.now(); engine.render(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
    for (let i = 0; i < 12; i++) one();
    const t: number[] = [];
    for (let i = 0; i < n; i++) t.push(one());
    t.sort((a, b) => a - b);
    return { avg: +(t.reduce((a, b) => a + b, 0) / n).toFixed(2), p95: +t[Math.floor(n * 0.95)].toFixed(2), programs: engine.renderer.info.programs?.length };
  }

  // Terrain cost on the current view: full detail vs the Low ground (one fetch), alternating
  function ab(n = 120, rounds = 3) {
    const out: Record<string, number[]> = { full: [], low: [] };
    for (let r = 0; r < rounds; r++) {
      for (const k of ['full', 'low'] as const) {
        farTerrainDev.quality = k === 'low' ? 0 : -1;
        out[k].push(bench(n).avg);
      }
    }
    farTerrainDev.quality = -1;
    const mean = (a: number[]) => +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
    return { full: mean(out.full), low: mean(out.low), delta: +(mean(out.full) - mean(out.low)).toFixed(2), runs: out, w: engine.renderer.domElement.width, h: engine.renderer.domElement.height };
  }

  return { setup, save, bench, ab, DEFS };
}

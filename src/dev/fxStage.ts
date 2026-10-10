import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Game } from '../game/Game';

// Development-only explosion stage for screenshots, shader warm-up checks and benchmarks.
// Load it from the console of the dev server (nothing imports it):
//   const fx = await import('/src/dev/fxStage.ts'); fx.install();
//   sws.fx.setup();                  // survival mission, world paused, effects cleared
//   sws.fx.spawn('fighter', 160, 12) // 'fighter' | 'heavy' | 'flak' | 'boss'; steps of 1/60 s
//   sws.fx.step(30)                  // advance the effects only, re-render, freeze the frame
//   sws.fx.hide()                    // drop the frozen frame overlay
//   sws.fx.bench(360)                // GPU-synced frame time while explosions and flak go off
// The frozen frame is shown as an <img> over the canvas so a screenshot catches exactly the
// rendered frame. renderer.info.programs is returned before/after so first-use shader
// compiles show up.

interface Sws { engine: Engine; game: Game; step: (n: number, dt?: number, render?: boolean) => void; survivalMission: (r: string) => any; boss: () => void; bench: (n: number) => any }

let at = new THREE.Vector3();
let t = 0;
let progs0 = 0;

function seeded(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function install() {
  const sws = (window as any).sws as Sws;
  const E = sws.engine, g = sws.game;
  const fx = () => g.world.effects;
  const programs = () => E.renderer.info.programs?.length ?? 0;
  const hide = () => { const i = document.getElementById('fxshot'); if (i) i.style.display = 'none'; };
  const step = (n: number) => {
    for (let i = 0; i < n; i++) fx().update(1 / 60);
    t += n / 60;
    E.camera.lookAt(at);
    E.camera.updateMatrixWorld(true);
    E.post.resetHistory();
    for (let i = 0; i < 3; i++) E.render(0);
    let img = document.getElementById('fxshot') as HTMLImageElement | null;
    if (!img) {
      img = document.createElement('img');
      img.id = 'fxshot';
      img.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;pointer-events:none';
      document.body.appendChild(img);
    }
    img.src = E.renderer.domElement.toDataURL('image/jpeg', 0.9);
    img.style.display = 'block';
    const f = fx();
    return { t: +t.toFixed(2), programs0: progs0, programs: programs(), glow: f.glow.count, smoke: f.smoke.count, vol: f.vol.count };
  };
  const api = {
    setup(seed = 77) {
      hide();
      E.paused = false;
      const rnd = Math.random;
      Math.random = seeded(seed);
      g.startMission(sws.survivalMission('gunner'));
      sws.step(270, 1 / 60, true);
      Math.random = rnd;
      fx().clear();
      sws.step(2, 1 / 60, true);
      E.paused = true;
      return programs();
    },
    spawn(kind: 'fighter' | 'heavy' | 'flak' | 'boss' | 'small', dist = 160, steps = 8, k = 5) {
      const p = E.camera.getWorldPosition(new THREE.Vector3());
      const d = E.camera.getWorldDirection(new THREE.Vector3());
      at = p.addScaledVector(d, dist);
      t = 0;
      progs0 = programs();
      const v0 = new THREE.Vector3();
      if (kind === 'flak') fx().flak(at);
      else if (kind === 'boss') fx().warshipBlast(at, v0, k);
      else fx().explosion(at, v0, kind === 'small' ? 0.5 : 1.5, kind);
      return step(steps);
    },
    step,
    hide,
    resume() { hide(); E.paused = false; },
    // Frame time with an explosion every 20 frames and flak every 9, 150-450 m ahead
    bench(n = 360, seed = 99) {
      hide();
      E.paused = false;
      const rnd = Math.random;
      Math.random = seeded(seed);
      const gl = E.renderer.getContext(), px = new Uint8Array(4), ts: number[] = [];
      const p = new THREE.Vector3(), d = new THREE.Vector3();
      let peakVol = 0, peakGlow = 0, peakSmoke = 0;
      const p0 = programs();
      for (let i = 0; i < n; i++) {
        if (i % 20 === 0 || i % 9 === 0) {
          E.camera.getWorldPosition(p); E.camera.getWorldDirection(d);
          const q = p.clone().addScaledVector(d, 150 + Math.random() * 300);
          q.x += (Math.random() - 0.5) * 200; q.y += (Math.random() - 0.5) * 80;
          if (i % 20 === 0) fx().explosion(q, g.world.playerBomber?.vel ?? new THREE.Vector3(), i % 60 === 0 ? 1.5 : 0.5);
          else fx().flak(q);
        }
        const t0 = performance.now();
        E.frame(1 / 60, true);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        ts.push(performance.now() - t0);
        const f = fx();
        peakVol = Math.max(peakVol, f.vol.count); peakGlow = Math.max(peakGlow, f.glow.count); peakSmoke = Math.max(peakSmoke, f.smoke.count);
      }
      Math.random = rnd;
      ts.sort((a, b) => a - b);
      return {
        avg: +(ts.reduce((a, b) => a + b, 0) / n).toFixed(2), p50: +ts[n >> 1].toFixed(2), p95: +ts[Math.floor(n * 0.95)].toFixed(2),
        programsBefore: p0, programsAfter: programs(), peakVol, peakGlow, peakSmoke,
      };
    },
  };
  (window as any).sws.fx = api;
  return api;
}

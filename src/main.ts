import { Engine } from './core/Engine';
import { Input } from './core/Input';
import { UI } from './ui/UI';
import { Game } from './game/Game';
import { essentialsRequested, loadEssentials, loadInBackground, isMissionReady } from './core/Preload';
import { CAMPAIGN, survivalMission } from './game/Missions';
import './style.css';

async function boot() {
  const ui = new UI();
  const app = document.getElementById('app')!;
  ui.loading(0.05, 'Starting the engines…');
  // Only what the menu needs (see core/Preload.ts), downloading while the renderer starts;
  // the rest streams in behind the menu
  let engineUp = false;
  const essentials = loadEssentials((f) => { if (engineUp) ui.loading(0.1 + f * 0.8, 'Loading aircraft…'); });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // let the loading screen paint, and the essential requests go out before the renderer setup
  await Promise.all([sleep(30), Promise.race([essentialsRequested, sleep(400)])]);
  let engine: Engine;
  try {
    engine = new Engine(app);
  } catch (e) {
    ui.loading(0, 'WebGL 2 is required. Please use a recent desktop browser with hardware acceleration enabled.');
    throw e;
  }
  engineUp = true;
  ui.loading(0.1, 'Loading aircraft…');
  await essentials;
  ui.loading(0.9, 'Forming up over England…');
  const input = new Input(engine.renderer.domElement);
  const game = new Game(engine, input, ui);
  game.startMenu();
  game.warmupShaders();
  // Warm up shaders before revealing the menu
  engine.render(1 / 60);
  engine.start();
  ui.loading(1);
  performance.mark('menu'); // time to menu (tools/serve_throttled.mjs measurements)
  setTimeout(() => document.getElementById('loading')!.classList.remove('show'), 250);
  loadInBackground();
  (window as any).game = game;
  (window as any).engine = engine;
  // Debug hooks used by automated playtests (tools/playtest)
  (window as any).sws = {
    CAMPAIGN, survivalMission,
    // Step the simulation manually (headless playtests): n frames of dt seconds
    step: (n: number, dt = 1 / 60, render = false) => { for (let i = 0; i < n; i++) engine.frame(dt, render || i === n - 1); },
    shot: (q = 0.85) => { engine.render(1 / 60); return engine.renderer.domElement.toDataURL('image/jpeg', q); },
  };
  (window as any).sws.assetsReady = () => isMissionReady();
  if (import.meta.env.DEV) {
    const { autoplay } = await import('./dev/autoplay');
    const { tutorialAutoplay } = await import('./dev/tutorialAutoplay');
    (window as any).sws.tutorialAutoplay = (o?: any) => tutorialAutoplay(engine, game, o);
    Object.assign((window as any).sws, { game, engine });
    Object.assign((window as any).sws, { event: (n: any) => game.midRound.devEvent(n), objective: (n: any) => game.midRound.devObjective(n) });
    // Boss battle now (starts a survival mission first when not flying): sws.boss('pilot')
    (window as any).sws.boss = (role: 'gunner' | 'pilot' = 'gunner') => {
      if (game.state !== 'playing' || !game.mission) game.startMission(survivalMission(role));
      game.boss.force();
    };
    // Frame-time benchmark: n rendered frames, GPU synced with a 1-pixel readback each frame
    (window as any).sws.bench = (n = 120, render = true) => {
      const gl = engine.renderer.getContext(), px = new Uint8Array(4), t: number[] = [];
      for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        engine.frame(1 / 60, render);
        if (render) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        t.push(performance.now() - t0);
      }
      t.sort((a, b) => a - b);
      const avg = t.reduce((a, b) => a + b, 0) / n;
      const info = engine.renderer.info;
      return { avg: +avg.toFixed(2), p50: +t[n >> 1].toFixed(2), p95: +t[Math.floor(n * 0.95)].toFixed(2), max: +t[n - 1].toFixed(2), calls: info.render.calls, tris: info.render.triangles, programs: info.programs?.length, w: engine.renderer.domElement.width, h: engine.renderer.domElement.height };
    };
    // autoplay starts a mission synchronously: it appears once every model and gameplay sound is in
    while (!isMissionReady()) await new Promise((r) => setTimeout(r, 100));
    (window as any).sws.autoplay = (m: any, steps?: number) => autoplay(engine, game, m, steps);
  }
}

boot();

import { Engine } from './core/Engine';
import { Input } from './core/Input';
import { UI } from './ui/UI';
import { Game } from './game/Game';
import { loadModels } from './world/Models';
import { CAMPAIGN, survivalMission } from './game/Missions';
import './style.css';

async function boot() {
  const ui = new UI();
  const app = document.getElementById('app')!;
  ui.loading(0.05, 'Starting the engines…');
  await new Promise((r) => setTimeout(r, 30));
  let engine: Engine;
  try {
    engine = new Engine(app);
  } catch (e) {
    ui.loading(0, 'WebGL 2 is required. Please use a recent desktop browser with hardware acceleration enabled.');
    throw e;
  }
  ui.loading(0.25, 'Loading aircraft…');
  await loadModels((f) => ui.loading(0.25 + f * 0.6, 'Loading aircraft…'));
  ui.loading(0.9, 'Forming up over England…');
  const input = new Input(engine.renderer.domElement);
  const game = new Game(engine, input, ui);
  game.startMenu();
  game.warmupShaders();
  // Warm up shaders before revealing the menu
  engine.render(1 / 60);
  engine.start();
  ui.loading(1);
  setTimeout(() => document.getElementById('loading')!.classList.remove('show'), 250);
  (window as any).game = game;
  (window as any).engine = engine;
  // Debug hooks used by automated playtests (tools/playtest)
  (window as any).sws = {
    CAMPAIGN, survivalMission,
    // Step the simulation manually (headless playtests): n frames of dt seconds
    step: (n: number, dt = 1 / 60, render = false) => { for (let i = 0; i < n; i++) engine.frame(dt, render || i === n - 1); },
    shot: (q = 0.85) => { engine.render(1 / 60); return engine.renderer.domElement.toDataURL('image/jpeg', q); },
  };
  if (import.meta.env.DEV) {
    const { autoplay } = await import('./dev/autoplay');
    (window as any).sws.autoplay = (m: any, steps?: number) => autoplay(engine, game, m, steps);
    Object.assign((window as any).sws, { game, engine });
  }
}

boot();

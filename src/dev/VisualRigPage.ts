import { rigOptions, seededRandom, RIG_VERSION, RIG_DT, RIG_SEED, RIG_SETTLE, RIG_STEPS, type RigShot } from './VisualRigConfig';

// This entry has no static game imports: random module initializers see the seed, too.
async function boot() {
  if (!import.meta.env.DEV) throw new Error('The visual rig is development-only');
  const options = rigOptions(location.search);
  const shots: RigShot[] = await (await fetch('/tools/visual-shots.json')).json();
  const shot = shots.find(s => s.id === options.shot);
  if (!shot) throw new Error(`Unknown shot: ${options.shot}`);
  Math.random = seededRandom(options.seed);
  const realNow = performance.now.bind(performance);
  // Dedicated page only. Never read or overwrite the player's local storage.
  const storage = new Map<string, string>([
    ['sws3d.settings.v2', JSON.stringify({ quality: options.quality, bookends: false, analytics: false, killcam: false, autoQuality: false })],
    ['sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true })],
  ]);
  Object.defineProperty(window, 'localStorage', { value: {
    getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, String(v)),
    removeItem: (k: string) => storage.delete(k), clear: () => storage.clear(),
    key: (i: number) => [...storage.keys()][i] ?? null, get length() { return storage.size; },
  } });
  await import('../style.css');
  const [{ createRigBackend }, { UI }, { Input }, { Game }, preload, { setupRigShot }] = await Promise.all([
    import('./VisualRigBackend'), import('../ui/UI'), import('../core/Input'), import('../game/Game'),
    import('../core/Preload'), import('./VisualRigScene'),
  ]);
  await preload.loadEssentials(() => {});
  preload.loadInBackground();
  while (!preload.isMissionReady()) await new Promise(r => setTimeout(r, 30));
  // Loading and decodes cannot consume the scene's random stream or clock.
  Math.random = seededRandom(options.seed);
  let tick = 0;
  Object.defineProperty(performance, 'now', { value: () => tick * RIG_DT * 1000 });
  Date.now = () => Date.UTC(1943, 9, 8, 12) + tick * RIG_DT * 1000;
  const ui = new UI();
  const adapter = await createRigBackend(document.getElementById('app')!, options.backend);
  const engine = adapter.engine;
  const input = new Input(engine.renderer.domElement);
  input.lock = () => {};
  const game = new Game(engine, input, ui);
  engine.livingSky.bind(game.world);
  game.bookends.auto = true;
  engine.setQuality(options.quality);
  // No Engine.start(), auto graphics, live input, director, or wall-clock animation loop.
  Math.random = seededRandom(options.seed);
  const facts = setupRigShot(engine, game, shot, () => { tick++; engine.frame(RIG_DT, false); });
  engine.onFrame = undefined;
  engine.beforeFrame = undefined;
  // Hide all game chrome; the standalone development page has no player-facing controls.
  const style = document.createElement('style');
  style.textContent = 'body > :not(#app):not(script):not(style){display:none!important} #app{position:fixed;inset:0} #app>canvas{display:block}';
  document.head.append(style);
  engine.camera.updateMatrixWorld(true);
  engine.post.resetHistory(); engine.clouds.resetHistory();
  for (let i = 0; i < RIG_SETTLE; i++) await adapter.render(RIG_DT);
  await adapter.sync();
  const canvas = engine.renderer.domElement;
  const metadata = {
    version: RIG_VERSION, ...options, label: shot.label, pillars: shot.pillars,
    backendActual: adapter.backend, deviceInfo: adapter.deviceInfo, seedDefault: RIG_SEED, dt: RIG_DT, steps: RIG_STEPS,
    settleFrames: RIG_SETTLE, time: engine.time, worldTime: game.world.time,
    viewport: [innerWidth, innerHeight], renderSize: [canvas.width, canvas.height],
    camera: { position: engine.camera.position.toArray(), quaternion: engine.camera.quaternion.toArray(), fov: engine.camera.fov }, ...facts,
  };
  (window as any).visualRig = {
    ready: true, shots, metadata, engine, game,
    // Serialize immediately after rendering (WebGL drawing buffers need not be preserved).
    png: async () => { await adapter.render(0); await adapter.sync(); return canvas.toDataURL('image/png'); },
    benchmark: async (n = 60) => {
      const times: number[] = [];
      const programsBefore = engine.renderer.info.programs?.length;
      for (let i = 0; i < n; i++) {
        const t = realNow(); await adapter.render(RIG_DT); await adapter.sync(); times.push(realNow() - t);
      }
      const programsAfter = engine.renderer.info.programs?.length;
      if (programsBefore !== programsAfter) throw new Error('Shader compilation during the measured frames');
      times.sort((a, b) => a - b);
      return { samples: n, programsBefore, programsAfter, mean: times.reduce((a, b) => a + b, 0) / n, p50: times[Math.floor(n / 2)], p95: times[Math.min(n - 1, Math.floor(n * .95))],
        method: 'frozen render + GPU fence; excludes simulation, includes synchronization' };
    },
  };
}
boot().catch(e => { (window as any).visualRig = { error: String(e) }; console.error(e); });

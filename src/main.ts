import { Engine } from './core/Engine';
import { Input } from './core/Input';
import { UI } from './ui/UI';
import { Game } from './game/Game';
import { essentialsRequested, loadEssentials, loadInBackground, isMissionReady } from './core/Preload';
import { CAMPAIGN, survivalMission } from './game/Missions';
import { DeviceControls } from './game/DeviceControls';
import { installShare } from './game/Share';
import { AutoGraphics } from './game/AutoGraphics';
import { analytics } from './net/Analytics';
import './style.css';
import './ui/cleanHud.css';

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
  engine.livingSky.bind(game.world);   // distant boxes, dogfights and flak fly with our formation
  engine.bomberStream.bind(game.world);   // the bomber stream around our box (render/BomberStream.ts)
  const devices = new DeviceControls(engine, input, game);   // touch, gamepad, accessibility
  installShare(game, engine);                                 // photo mode: Enter / button shares the view
  analytics.install(engine, game, () => devices.pad.connected); // anonymous per-mission stats (opt-out in Settings)
  game.startMenu();
  game.warmupShaders();
  // Warm up shaders before revealing the menu
  engine.render(1 / 60);
  engine.start();
  ui.loading(1);
  performance.mark('menu'); // time to menu (tools/serve_throttled.mjs measurements)
  setTimeout(() => document.getElementById('loading')!.classList.remove('show'), 250);
  loadInBackground();
  // First launch: benchmark the idle menu and pick the graphics preset (Settings → Detect re-runs it)
  const autoGfx = new AutoGraphics(engine, game);
  (window as any).game = game;
  (window as any).engine = engine;
  // Debug hooks used by automated playtests (tools/playtest)
  (window as any).sws = {
    CAMPAIGN, survivalMission, devices,
    // Step the simulation manually (headless playtests): n frames of dt seconds
    step: (n: number, dt = 1 / 60, render = false) => { for (let i = 0; i < n; i++) engine.frame(dt, render || i === n - 1); },
    shot: (q = 0.85) => { engine.render(1 / 60); return engine.renderer.domElement.toDataURL('image/jpeg', q); },
    // Graphics auto-pick: sws.detectGraphics({ sync: true }) runs the benchmark now (frames back to
    // back, so it works in hidden tabs); sws.autoGfx.last holds the last run's frame stats
    autoGfx,
    detectGraphics: (o?: { sync?: boolean }) => autoGfx.run(o),
  };
  (window as any).sws.assetsReady = () => isMissionReady();
  if (import.meta.env.DEV) {
    const { markerCapture, captureMarkerAudit } = await import('./ui/MarkerAudit');
    markerCapture.enabled = true;
    (window as any).sws.markerAuditRun = async (progress?: (s: string) => void) => {
      const { runMarkerScenarios } = await import('./dev/MarkerScenarios');
      return runMarkerScenarios((window as any).sws, progress);
    };
    (window as any).sws.markerAudit = () => captureMarkerAudit(engine.camera, innerWidth, innerHeight, game.world.aircraft, game.world.spotted);
    const { checkHudOverlaps } = await import('./ui/HudOverlap');
    (window as any).sws.hudOverlaps = checkHudOverlaps;
    const { autoplay } = await import('./dev/autoplay');
    const campaignDev = await import('./game/CampaignState');
    (window as any).sws.secondTour = {
      // Dev-only: finish the story through its migration path, then use the real summary UI.
      finishStory: () => {
        game.progress.unlocked = CAMPAIGN.length - 1;
        game.progress.medals[CAMPAIGN.at(-1)!.id] = ['Air Medal'];
        game.saveProgress();
        campaignDev.saveCampaign(campaignDev.migrateFromProgress(game.progress, 7));
        game.showCampaign();
      },
      current: () => campaignDev.currentStory(campaignDev.loadCampaign(game.progress)),
      state: () => campaignDev.loadCampaign(game.progress),
    };
    const { tutorialAutoplay } = await import('./dev/tutorialAutoplay');
    (window as any).sws.tutorialAutoplay = (o?: any) => tutorialAutoplay(engine, game, o);
    Object.assign((window as any).sws, { game, engine });
    Object.assign((window as any).sws, { event: (n: any) => game.midRound.devEvent(n), objective: (n: any) => game.midRound.devObjective(n) });
    // Force a survivable ditch after loading a gunner campaign mission; no setting overrides.
    (window as any).sws.ditch = (bombsDropped = true) => {
      if (!isMissionReady()) return 'Wait for sws.assetsReady()';
      if (game.state !== 'playing' || game.mission?.role !== 'gunner' || !game.mission.number) {
        const auto = game.bookends.auto; game.bookends.auto = true;
        game.startMission(CAMPAIGN[0]); game.bookends.auto = auto;
      }
      const b = game.world.playerBomber!;
      for (let i = 0; i < 3; i++) { b.engineDead[i] = true; b.zone(`engine${i + 1}`)!.hp = 0; }
      game.director.bombsDropped = bombsDropped;
      game.finish(bombsDropped, '');
      return { active: game.ditching.active, result: game.endResult };
    };
    // Formation set piece now (gunner mission in progress): sws.drama('flakHit' | 'collision' | 'bombBay' | 'straggler' | 'littleFriends'); sws.drama() lists them
    (window as any).sws.drama = (n?: any) => (n ? game.midRound.devDrama(n) : 'flakHit, collision, bombBay, straggler, littleFriends');
    // Sharing / trailer / social card tools (docs/TRAILER.md): sws.trailer(), sws.ogCard(), sws.analytics.last
    const { trailer } = await import('./dev/Trailer');
    const { ogCard } = await import('./dev/OgCard');
    Object.assign((window as any).sws, {
      analytics,
      trailer: (o?: any) => trailer(engine, game, o),
      ogCard: (o?: any) => ogCard(engine, game, o),
    });
    // Weather fronts / night effects: sws.weather.front() (progress), .now (weatherNow), .flares (pool)
    const wx = await import('./render/Weather');
    (window as any).sws.weather = { front: wx.frontState, now: wx.weatherNow, get flares() { return game.world.effects.flares; } };
    // Boss battle now (starts a survival mission first when not flying): sws.boss('pilot')
    (window as any).sws.boss = (role: 'gunner' | 'pilot' = 'gunner') => {
      if (game.state !== 'playing' || !game.mission) game.startMission(survivalMission(role));
      game.boss.force();
    };
    // Special event / enemy tactic now (starts a survival mission first when not flying): sws.special('ace'), sws.special() lists them
    (window as any).sws.special = (name?: string, role: 'gunner' | 'pilot' = 'gunner') => {
      if (game.state !== 'playing' || !game.mission) game.startMission(survivalMission(role));
      return game.specials.dev(name);
    };
    // Frame-time benchmark: n rendered frames, GPU synced with a 1-pixel readback each frame
    (window as any).sws.bench = (n = 120, render = true) => {
      const t: number[] = [];
      for (let i = 0; i < n; i++) {
        if (render) { t.push(engine.timedFrame(1 / 60)); continue; }
        const t0 = performance.now();
        engine.frame(1 / 60, false);
        t.push(performance.now() - t0);
      }
      t.sort((a, b) => a - b);
      const avg = t.reduce((a, b) => a + b, 0) / n;
      const info = engine.renderer.info;
      return { avg: +avg.toFixed(2), p50: +t[n >> 1].toFixed(2), p95: +t[Math.floor(n * 0.95)].toFixed(2), max: +t[n - 1].toFixed(2), calls: info.render.calls, tris: info.render.triangles, programs: info.programs?.length, w: engine.renderer.domElement.width, h: engine.renderer.domElement.height };
    };
    // autoplay starts a mission synchronously: it appears once every model and gameplay sound is in
    while (!isMissionReady()) await new Promise((r) => setTimeout(r, 100));
    (window as any).sws.autoplay = (m: any, steps?: number, opts?: any) => autoplay(engine, game, m, steps, opts);
    // Balance harness: queued autoplay runs, one per page load (src/dev/balance.ts, docs/BALANCE.md)
    const { installBalance } = await import('./dev/balance');
    installBalance(engine, game);
    // Before/after screenshot gallery (tools/gallery/README.md)
    const { gallery } = await import('./dev/gallery');
    (window as any).sws.gallery = gallery(engine, game);
    // Cloud path A/B render times on the gallery cameras (src/dev/cloudBench.ts)
    const { cloudBench } = await import('./dev/cloudBench');
    (window as any).sws.cloudBench = cloudBench(engine, (window as any).sws.gallery);
    // Visual QA sweep: NaN / black / blown-white detector and view helpers (src/dev/visualQa.ts)
    const { visualQa } = await import('./dev/visualQa');
    (window as any).sws.vqa = visualQa(engine, game);
    const { streamShots } = await import('./dev/streamShots');   // bomber stream captures / A-B timing
    (window as any).sws.streamShots = streamShots(engine, game, (window as any).sws.vqa, (window as any).sws.bench);
    const { hitFeedbackQa } = await import('./dev/hitFeedbackQa');
    (window as any).sws.hitFeedback = hitFeedbackQa(engine, game);
    // Destruction sequences from the gunner seats, saved to docs/phase10/shots/09 (src/dev/destructionQa.ts)
    const { destructionQa } = await import('./dev/destructionQa');
    (window as any).sws.destruction = destructionQa(engine, game);
    const { seaQa } = await import('./dev/seaQa');
    (window as any).sws.sea = seaQa(engine, game);
    const { cineQa } = await import('./dev/cineQa');
    (window as any).sws.cine = cineQa(engine, game);   // combat director / film look (src/dev/cineQa.ts)
    // Enemy AI 2.0 sequences from the gunner seats; #ai11 runs them unattended (src/dev/aiQa.ts)
    const { aiQa, aiAuto } = await import('./dev/aiQa');
    (window as any).sws.aiQa = aiQa(engine, game);
    void aiAuto(engine, game);
    // Ground-from-altitude rig views (Phase 10 goal 04): sws.ground.setup('down'), .save(name), .bench()
    const { groundShots } = await import('./dev/groundShots');
    (window as any).sws.ground = groundShots(engine, game);
    // B-17 interior 2.0 station captures (Phase 10 goal 07): await sws.interiorShots('after')
    const { interiorShots } = await import('./dev/interiorShots');
    (window as any).sws.interiorShots = interiorShots(engine, game);
  }
}

boot();

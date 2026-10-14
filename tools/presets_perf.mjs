// Phase 10/12: seeded, rendered heavy-combat autoplay through the real game loop.
// Uses an existing Playwright bundled headless shell, never the desktop Chrome application.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { smallJpeg } from './visual_rig.mjs';
const stage = process.argv[2] ?? 'after';
const out = `docs/phase10/shots/12/${stage}`;
const url = process.env.PERF_URL ?? 'http://127.0.0.1:5312';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--disable-frame-rate-limit', '--disable-gpu-vsync', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
await fs.mkdir(out, { recursive: true });
try {
  for (const tier of (process.env.PERF_TIERS ?? 'low,medium,high,ultra,cinematic').split(',')) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && /WebGL|THREE|shader/i.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(tier => {
      window.requestAnimationFrame = () => 0;
      localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: tier, bookends: false, autoQuality: false, analytics: false, volume: 0, radio: false, music: false, killCam: true, cineDirector: 'off' }));
      let seed = 19431008; Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    }, tier);
    await page.goto(url);
    await page.waitForFunction(() => window.sws?.autoplay && sws.assetsReady(), null, { timeout: 180000, polling: 100 });
    const result = await page.evaluate(async ({ tier, steps }) => {
      const e = window.engine, g = window.game, s = window.sws;
      const { loadInteriorAssets } = await import('/src/game/InteriorAssets.ts');
      const { loadHeroTextures } = await import('/src/world/HeroTextures.ts');
      const { loadFlipbooks } = await import('/src/render/Flipbooks.ts');
      if (tier !== 'low') await Promise.all([loadInteriorAssets(), loadHeroTextures(e.renderer), loadFlipbooks()]);
      g.input.lock = () => {}; e.renderScale = 1; e.resize();
      const gl = e.renderer.getContext(), pixel = new Uint8Array(4), ext = gl.getExtension('WEBGL_debug_renderer_info');
      const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      // Finish asynchronous stream baking on the menu before mission warmup.
      s.step(32, 1 / 60, true); sync();
      let compileCalls = 0; const compiled = [], sources = [], warmSources = [];
      const compile = gl.compileShader.bind(gl);
      gl.compileShader = (...a) => { compileCalls++; sources.push(gl.getShaderSource(a[0])); compiled.push((gl.getShaderSource(a[0]) ?? '').split('\n').filter(l => /SHADER_NAME|NUM_CLIPPING_PLANES|USE_SKINNING|USE_INSTANCING|USE_MAP|USE_NORMALMAP/.test(l) && l.startsWith('#define')).join(' ')); return compile(...a); };
      const original = e.frame.bind(e), times = [], compileEvents = [];
      let frames = 0, peakEnemies = 0, initialPrograms = 0;
      e.frame = dt => {
        if (!frames) { initialPrograms = e.renderer.info.programs.length; sync(); compileCalls = 0; compiled.length = 0; warmSources.push(...sources); sources.length = 0; }
        const before = compileCalls, t = performance.now();
        original(dt, true); sync();
        const ms = performance.now() - t;
        // First two seconds retained separately, not silently removed from shader checks.
        if (frames >= 120) times.push(ms);
        if (compileCalls !== before) compileEvents.push({ frame: frames, time: g.world.time, calls: compileCalls - before });
        if (frames % 60 === 0) peakEnemies = Math.max(peakEnemies, g.world.fighters('axis').length);
        frames++;
      };
      let log; const warm = g.world.prewarm.bind(g.world);
      const refresh = g.world.warmMission?.bind(g.world);
      const retainedBefore = [g.world.warmKeep.length, g.world.wrecks.warm.length];
      let warmCalls=0, refreshCalls=0;
      g.world.prewarm=(...args)=>{warmCalls++; return warm(...args);};
      if (refresh) g.world.warmMission=(...args)=>{refreshCalls++; return refresh(...args);};
      try {
        log = s.autoplay({ ...s.CAMPAIGN[0], id: 'perf-heavy', bombers: 18, escorts: 4, waves: [],
          round: { start: 0, duration: 120, min: 18, max: 24, skill: [.8, 1], rockets: .25 },
          rounds: 1, flak: { start: 0, end: 120, intensity: .7 }, bombsAway: undefined,
          duration: 300, maxBombersLost: 99, specials: false, midRound: false, boss: false,
        }, steps, { skill: 0 });
      } finally { e.frame = original; gl.compileShader = compile; g.world.prewarm = warm; if (refresh) g.world.warmMission = refresh; }
      times.sort((a, b) => a - b);
      return { tier, viewport: [innerWidth, innerHeight], renderSize: [e.renderer.domElement.width, e.renderer.domElement.height],
        gpu: gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER), frames, samples: times.length,
        mean: times.reduce((a, b) => a + b, 0) / times.length, p50: times[times.length >> 1], p95: times[Math.floor(times.length * .95)],
        warmCalls, refreshCalls, retainedBefore, retainedAfter: [g.world.warmKeep.length, g.world.wrecks.warm.length], initialPrograms, finalPrograms: e.renderer.info.programs.length, compileCalls, compileEvents, compiled, shaderTrace: { sources, warmSources },
        peakEnemies, stream: e.bomberStream.stats(), log, menuMs: performance.getEntriesByName('menu')[0]?.startTime,
        method: 'Fixed-step autoplay (30 s unscaled at default steps; slow motion may shorten world time); every frame rendered and GPU fenced; timing after 120 frames; shader checks from first gameplay frame; fixed DRS 1',
      };
    }, { tier, steps: Number(process.env.PERF_STEPS ?? 600) });
    const shot = await page.evaluate(() => sws.shot(.8));
    await fs.writeFile(`${out}/combat-${tier}.jpg`, await smallJpeg(Buffer.from(shot.split(',')[1], 'base64')));
    if (process.env.PERF_TRACE || result.compileCalls) await fs.writeFile(`/tmp/presets-shaders-${tier}.json`, JSON.stringify(result.shaderTrace));
    delete result.shaderTrace;
    results.push({ ...result, errors });
    await fs.writeFile(`${out}/combat.json`, JSON.stringify({ browser: browser.version(), results }, null, 2) + '\n');
    console.log(`${tier}: ${result.mean.toFixed(2)} / ${result.p95.toFixed(2)} ms, enemies ${result.peakEnemies}, compile calls ${result.compileCalls}, errors ${errors.length}`);
    await context.close();
  }
} finally { await browser.close(); }

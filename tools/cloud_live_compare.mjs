// Replay the cloud subset of the fixed rig in the deployed production game.
// Uses its public game/engine hooks and its own weather/density code; no renderer replacement.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const local = process.env.CLOUD_URL ?? 'http://127.0.0.1:5323';
const live = 'https://sky-war-shooter-3d.mhamadhazeem2001.workers.dev';
const out = 'docs/phase11/shots/03/live';
const reference = JSON.parse(await fs.readFile('docs/phase11/shots/03/before/manifest.json', 'utf8'));
const detail = JSON.parse(await fs.readFile('docs/phase11/shots/03/detail/metrics.json', 'utf8'));
for (const view of ['sun-gap', 'sun-gap-towers', 'cloud-shoulder']) {
  const d = detail.records.find(r => r.view === view && r.mode === 'after');
  reference.shots.push({ shot: view, camera: d.camera, renderSize: [1920,1080], detail: true });
}
const shots = JSON.parse(await fs.readFile('tools/visual-shots.json', 'utf8'));
const config = (await (await fetch(`${local}/src/dev/VisualRigConfig.ts`)).text()).replace(/^export /gm, '').replace(/\/\/# sourceMappingURL=.*$/gm, '');
const scene = (await (await fetch(`${local}/src/dev/VisualRigScene.ts`)).text()).replace(/^import .*;\n/gm, '').replace(/^export /gm, '').replace(/\/\/# sourceMappingURL=.*$/gm, '');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE, args: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] : [] });
await fs.mkdir(out, { recursive: true });
const results = [];
try {
  for (const ref of reference.shots) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && /THREE|shader|WebGL/i.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(() => {
      // Freeze the ordinary game loop. The rig advances fixed frames explicitly.
      window.requestAnimationFrame = () => 0;
      localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'high', bookends: false, autoQuality: false, analytics: false, killcam: false }));
      localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true }));
    });
    await page.goto(live);
    await page.waitForFunction(() => window.sws?.assetsReady(), null, { timeout: 180000, polling: 100 });
    // Let optional production textures finish their asynchronous load before freezing time.
    await page.waitForTimeout(2000);
    const result = await page.evaluate(({ config, scene, shot, ref }) => {
      const e = window.engine, g = window.game;
      const THREE = { Vector3: e.camera.position.constructor };
      const CAMPAIGN = sws.CAMPAIGN;
      const u = e.clouds.uniforms;
      const Atmos = { lowBase: u.uLow.value.x, windOffset: u.uWind.value, originOffset: new THREE.Vector3() };
      const applyWeather = (_, weather) => g.setWeather(weather);
      const run = new Function('engine', 'game', 'THREE', 'CAMPAIGN', 'Atmos', 'applyWeather', 'shot', 'ref', `${config}\n${scene}\n
        Math.random = seededRandom(RIG_SEED);
        let tick = 0;
        Object.defineProperty(performance, 'now', { configurable:true, value: () => tick * RIG_DT * 1000 });
        Date.now = () => Date.UTC(1943,9,8,12) + tick * RIG_DT * 1000;
        game.input.lock = () => {}; game.bookends.auto = true;
        engine.setQuality('high'); game.world.effects.setQuality('high');
        engine.beforeFrame = undefined;
        const facts = setupRigShot(engine, game, shot, () => { tick++; engine.frame(RIG_DT, false); });
        engine.onFrame = undefined;
        if (ref.detail) game.setWeather({sunEl:ref.shot.startsWith('sun-gap')?7:32,sunAz:250,low:.55,high:.25,...(ref.shot.startsWith('sun-gap')?{mood:'dusk'}:{})});
        engine.camera.position.fromArray(ref.camera.position);
        engine.camera.quaternion.fromArray(ref.camera.quaternion);
        engine.camera.fov = ref.camera.fov;
        engine.camera.updateProjectionMatrix(); engine.camera.updateMatrixWorld(true);
        engine.post.resetHistory(); engine.clouds.resetHistory();
        for(let i=0; i<RIG_SETTLE; i++) engine.render(RIG_DT);
        engine.render(0);
        return { ...facts, camera:ref.camera, time:engine.time, worldTime:game.world.time,
          renderSize:[engine.renderer.domElement.width,engine.renderer.domElement.height],
          png:engine.renderer.domElement.toDataURL('image/png'),
          cloudShader:engine.clouds.tMat.fragmentShader };
      `);
      return run(e, g, THREE, CAMPAIGN, Atmos, applyWeather, shot, ref);
    }, { config, scene, shot: shots.find(s => s.id === (ref.detail ? 'formation-chase' : ref.shot)), ref });
    assert.equal(result.formationCount, 18);
    assert.ok(Math.abs(result.time - 6) < 1e-8);
    assert.deepEqual(result.renderSize, ref.renderSize);
    assert.deepEqual(errors, []);
    const { png, cloudShader, ...metadata } = result;
    const bytes = Buffer.from(png.split(',')[1], 'base64');
    await fs.writeFile(`${out}/${ref.shot}.jpg`, await sharp(bytes).resize(960).jpeg({ quality: 82 }).toBuffer());
    results.push({ shot:ref.shot, ...metadata, url:live, cloudShaderHash:createHash('sha256').update(cloudShader).digest('hex'), errors });
    console.log(`LIVE ${ref.shot}: captured`);
    await context.close();
  }
  await fs.writeFile(`${out}/manifest.json`, JSON.stringify({ capturedAt: new Date().toISOString(), note:'Production game replay of VisualRigScene; camera locked to before manifest. Production startup differs from isolated rig startup.', shots: results }, null, 2));
} finally { await browser.close(); }

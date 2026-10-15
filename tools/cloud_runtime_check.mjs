// Additional goal 03 browser checks. Requires goal 00's development rig page.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE, args: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] : [] });
const dir = process.env.CLOUD_OUTPUT ?? 'docs/phase10/shots/03';
const url = process.env.CLOUD_URL ?? 'http://127.0.0.1:5303';
await fs.mkdir(dir, { recursive: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /THREE|shader|WebGL/i.test(m.text())) errors.push(m.text()); });
  await page.goto(`${url}/tools/visual-rig.html?shot=top-formation&quality=high`);
  await page.waitForFunction(() => window.visualRig?.ready, null, { timeout: 180000 });
  const raw = await page.evaluate(async () => {
    // Resolve the exact URL already loaded by the rig (including Vite's HMR stamp),
    // otherwise direct imports can create a second singleton after a source edit.
    const liveModule = name => import(performance.getEntriesByType('resource').find(r => new URL(r.name).pathname === `/src/render/${name}.ts`)?.name ?? `/src/render/${name}.ts`);
    const { Atmos } = await liveModule('Atmosphere');
    const { applyWeather } = await liveModule('Weather');
    const { weatherNow } = await liveModule('WeatherState');
    const { rainTarget } = await import(performance.getEntriesByType('resource').find(r => new URL(r.name).pathname === '/src/game/GlassFx.ts').name);
    const { cloudShadowUniforms } = await liveModule('CloudShadow');
    const { cloudOcclusionUniforms } = await liveModule('CloudOcclusion');
    const e = visualRig.engine, g = visualRig.game, c = e.clouds;
    const frames = async (n = 32) => { for (let i = 0; i < n; i++) { e.render(1/60); if (i % 8 === 0) await new Promise(r => setTimeout(r, 10)); } await new Promise(r => setTimeout(r, 30)); };
    applyWeather(e, { sunEl: 40, sunAz: 140, low: 1, high: .5 });
    e.camera.position.set(180, Atmos.lowBase + 500, 400); e.camera.updateMatrixWorld(true);
    await frames();
    // Weather coverage is not a solid slab: find a real occupied cell, rather than
    // assuming an arbitrary point lies inside the procedural cloud.
    const tried = [];
    for (let i = 0; i < 12 && weatherNow.cloudInside < .1; i++) {
      e.camera.position.set(180 + (i % 4) * 1800, Atmos.lowBase + 500, 400 + Math.floor(i / 4) * 1800);
      e.camera.updateMatrixWorld(true); await frames();
      tried.push({ position: e.camera.position.toArray(), density: weatherNow.cloudInside });
    }
    // Move the aircraft and real turret glass to the sampled cloud location.
    const cloudEye = e.camera.position.clone();
    g.gunner.update(0);
    g.gunner.bomber.pos.add(cloudEye.sub(e.camera.position));
    g.gunner.bomber.root.updateMatrixWorld(true); g.gunner.update(0);
    await frames();
    const inside = weatherNow.cloudInside, wetTarget = rainTarget(0), insideSun = e.sun.intensity;
    for (let i = 0; i < 240; i++) g.gunner.glassFx.update(1/60, 'top', 0, 0);
    const wet = g.gunner.glassFx.paneForDev('top').wet;
    const condensation = g.gunner.glassFx.paneForDev('top').condensation;
    e.render(0);
    const cloudGlassPng = e.renderer.domElement.toDataURL('image/png');
    weatherNow.effects = false;
    const effectsOff = rainTarget(0); weatherNow.effects = true;
    // Cuts immediately reject old reprojected cloud colour and old asynchronous probes.
    g.gunner.bomber.pos.y += 8700 - e.camera.position.y;
    g.gunner.bomber.root.updateMatrixWorld(true); g.gunner.update(0);
    e.camera.fov = 35; e.camera.updateProjectionMatrix(); e.render(1/60);
    const cutHistory = c.resolveMat.uniforms.uHistOK.value;
    await frames();
    const outside = weatherNow.cloudInside;
    for (let i=0;i<240;i++) g.gunner.glassFx.update(1/60,'top',0,0);
    const condensationAfterExit = g.gunner.glassFx.paneForDev('top').condensation;
    await frames();
    e.render(0);
    const exitGlassPng = e.renderer.domElement.toDataURL('image/png');
    // Rebase the shadow lookup alongside the world; texture contents remain reusable.
    const x = c.groundShadowBox.x, z = c.groundShadowBox.y;
    const delta = e.camera.position.clone().set(10000, 0, -10000);
    c.rebase(delta);
    const rebased = [c.groundShadowBox.x - x, c.groundShadowBox.y - z];
    c.rebase(delta.negate());
    // Probe real GPU density above the former 5.9 km deck, across a 30 km
    // region. This verifies actual vertical cloud volume, not added screen haze.
    applyWeather(e, { sunEl:40, sunAz:140, low:.55, high:.2 });
    await frames(8);
    const towers = [];
    const probe = new Uint8Array(4);
    for (const altitude of [6000,7000,7800]) {
      let occupied = 0, maxDensity = 0;
      for (let z = -15000; z <= 15000; z += 3000) for (let x = -15000; x <= 15000; x += 3000) {
        c.uniforms.uCamPos.value.set(x,altitude,z);
        c.quad.material = c.probeMat;
        e.renderer.setRenderTarget(c.probeRT); c.quad.render(e.renderer);
        e.renderer.readRenderTargetPixels(c.probeRT,0,0,1,1,probe);
        occupied += probe[1] > 12 ? 1 : 0; maxDensity = Math.max(maxDensity,probe[1]/255);
      }
      towers.push({altitude,occupied,samples:121,maxDensity});
    }
    await frames(8);
    const programs = e.renderer.info.programs.length;
    applyWeather(e, { sunEl: 7, sunAz: 250, low: .6, high: .4, mood: 'dusk' }); await frames();
    applyWeather(e, { sunEl: 30, sunAz: 170, low: .97, high: .98, mood: 'storm' }); await frames();
    const programsAfter = e.renderer.info.programs.length;
    const history = c.hist[c.idx], pixels = new Uint16Array(history.width * history.height * 4);
    e.renderer.readRenderTargetPixels(history, 0, 0, history.width, history.height, pixels);
    let nonfinite = 0;
    for (const half of pixels) if ((half & 0x7c00) === 0x7c00) nonfinite++;

    e.setQuality('low'); await frames();
    const low = { temporal: c.temporal, steps: c.steps, scale: c.scale, inside: weatherNow.cloudInside,
      shadows: cloudShadowUniforms.uCloudShadowOn.value, veil: cloudOcclusionUniforms.uCloudVeilOn.value };
    return { cloudGlassPng, exitGlassPng, condensation, condensationAfterExit, towers, nonfinite, tried, inside, outside, wetTarget, wet, effectsOff, insideSun, cutHistory, rebased, programs, programsAfter, low };
  });
  const { cloudGlassPng, exitGlassPng, ...result } = raw;
  for (const [name, png] of [['cloud-glass',cloudGlassPng],['exit-glass',exitGlassPng]])
    await fs.writeFile(`${dir}/${name}.jpg`, await sharp(Buffer.from(png.split(',')[1],'base64')).resize(960).jpeg({quality:82}).toBuffer());
  console.log(JSON.stringify(result, null, 2));
  assert.ok(result.inside > .05, 'Density probe inside cloud');
  assert.ok(result.towers[1].occupied > 0, 'Real cloud volume reaches 7 km');
  assert.ok(result.wet > .01 && result.wetTarget > .01, 'Cloud wets real turret glass');
  assert.equal(result.outside, 0);
  assert.ok(result.condensation > .05 && result.condensationAfterExit > 0 && result.condensationAfterExit < result.condensation, 'Cloud film builds then evaporates after exit');
  assert.equal(result.effectsOff, 0);
  assert.equal(result.cutHistory, 0);
  assert.deepEqual(result.rebased, [-10000, 10000]);
  assert.equal(result.programs, result.programsAfter, 'Weather does not recompile shaders');
  assert.deepEqual(result.low, { temporal: false, steps: 20, scale: .18, inside: 0, shadows: 0, veil: 0 });
  assert.equal(result.nonfinite, 0, 'Cloud history has no NaN/Inf');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${dir}/low.jpg`, type: 'jpeg', quality: 65 });
  // Exercise the normal game entry too: its default High tier can bypass setQuality.
  await page.addInitScript(() => {
    localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'high', bookends: false, autoQuality: false, analytics: false }));
    localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true }));
  });
  await page.goto(url);
  await page.waitForFunction(() => window.sws?.assetsReady() && sws.vqa, null, { timeout: 180000 });
  const main = await page.evaluate(async () => {
    sws.vqa.freeze(); sws.game.input.lock = () => {};
    sws.game.startMission(sws.survivalMission('gunner')); sws.step(180, 1/60);
    sws.game.ui.fade(false); sws.engine.render(1/60);
    const { atmosUniforms } = await import(performance.getEntriesByType('resource').find(r => new URL(r.name).pathname === '/src/render/Atmosphere.ts').name);
    return { quality: sws.engine.quality, temporal: sws.engine.clouds.temporal, atmosphere: atmosUniforms.uAtmosQuality.value, state: sws.game.state };
  });
  assert.equal(main.quality, 'high'); assert.equal(main.temporal, true); assert.equal(main.atmosphere, 1);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${dir}/main-game.jpg`, type: 'jpeg', quality: 65 });
  await fs.writeFile(`${dir}/runtime.json`, JSON.stringify({ ...result, main, errors }, null, 2) + '\n');
} finally { await browser.close(); }

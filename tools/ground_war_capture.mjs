// Goal 25 extension of the Phase 10 rig: identical clocks, weather and cameras on live/main.
// Uses only the installed Playwright bundled headless shell. No desktop browser or writes to live.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { smallJpeg } from './visual_rig.mjs';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE ?? path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const out = 'docs/phase11/shots/25', detailOut = 'docs/phase6/shots/25-review';
await Promise.all([out, detailOut].map(dir => fs.mkdir(dir, { recursive: true })));
const afterOnly = process.argv.includes('--after-only');
const results = afterOnly ? JSON.parse(await fs.readFile(`${out}/comparison.json`, 'utf8')).filter(r => r.tag.startsWith('live')) : [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE,
  args: ['--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
try {
  for (const [tag, url, quality] of [
    ['live', 'https://sky-war-shooter-3d.mhamadhazeem2001.workers.dev', 'high'],
    ['live-low', 'https://sky-war-shooter-3d.mhamadhazeem2001.workers.dev', 'low'],
    ['after', 'http://127.0.0.1:5325', 'high'], ['low', 'http://127.0.0.1:5325', 'low'],
  ]) {
    if (afterOnly && tag.startsWith('live')) continue;
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
    await context.addInitScript(q => {
      window.requestAnimationFrame = () => 0; window.groundRealNow = performance.now.bind(performance);
      let seed = 19431008;
      Math.random = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
      localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: q, bookends: false, analytics: false, autoQuality: false, killcam: false }));
      localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true }));
    }, quality);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && /THREE|WebGL|shader/i.test(m.text())) errors.push(m.text()); });
    console.log('loading', tag);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.sws?.assetsReady(), null, { polling: 100, timeout: 180000 });
    const scripts = await page.evaluate(() => [...document.scripts].map(s => s.src).filter(Boolean));
    await page.evaluate(() => {
      const g = window.game, e = window.engine, w = g.world;
      g.input.lock = () => {}; g.bookends.auto = true;
      let seed = 19431008;
      Math.random = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
      const mission = { ...sws.CAMPAIGN[0], id: 'ground25-qa', number: 0, role: 'gunner', station: 'ball', bombers: 18,
        waves: [], duration: 10000, bombsAway: 3, escorts: 0, escortArrive: undefined,
        flak: { start: 0, end: 1000, intensity: 1 }, specials: false, midRound: false, boss: false,
        weather: { sunEl: 48, sunAz: 205, low: .08, high: .08, contrails: true, wind: { speed: 11, direction: 75 } } };
      g.startMission(mission); e.time = w.time = 0;
      e.onFrame = dt => { w.update(dt); w.flakIntensity = 1; g.target.update(dt, mission); }; e.beforeFrame = undefined;
      sws.step(360, 1 / 60, false); e.onFrame = undefined; g.gunner.detach();
      window.groundQA = { mission, center: w.formationCenter.toArray(), player: w.player.pos.toArray(), quaternion: w.player.quat.toArray() };
      const style = document.createElement('style');
      style.textContent = 'body > :not(#app):not(script):not(style){display:none!important} #app{position:fixed;inset:0}'; document.head.append(style);
    });
    for (const [shot, clock, look] of [['bomb-release', 6, 0], ['walking-strikes', 29, 0], ['burning-city', 90, 0], ['wind-columns', 90, 0], ['airfield-rail', 90, 3], ['bombsight-takeoff', 76.2, 3], ['bombsight-moving', 78.2, 3]]) {
      const reference = results.find(r => r.tag === 'live' && r.shot === shot);
      const facts = await page.evaluate(({ shot, clock, look, reference }) => {
        const g = window.game, e = window.engine, w = g.world, m = window.groundQA.mission;
        g.bombardier.leave();
        w.formationCenter.fromArray(window.groundQA.center);
        w.player.pos.fromArray(window.groundQA.player); w.player.quat.fromArray(window.groundQA.quaternion);
        m.targetLook = look;
        // Fixed ground target: advance the real release/impact clocks, leave the formation pose frozen.
        while (w.time < clock - 0.001) { w.time += 1 / 60; e.time = w.time; g.target.update(1 / 60, m); }
        w.flakIntensity = 1; m.flak = { start: 0, end: 1000, intensity: 1 };
        g.target.update(1 / 60, m);
        // targetLook is an arm-time value in production; changing layout is fixture-only.
        if (look) { m.target = 'Aircraft assembly, Leipzig'; m.date = '20 February 1944'; g.target.clear(); w.time = 0; g.target.update(0, m, true); w.time = clock; g.target.update(0, m, true); g.target.update(2, m, true); }
        const aim = g.target.aimPoint, cam = e.camera;
        cam.position.set(aim.x - 2400, 7620, aim.y - 3400);
        cam.up.set(0, 1, 0); cam.lookAt(aim.x, 0, aim.y); cam.fov = look ? 42 : 58;
        if (shot === 'wind-columns') { cam.position.set(aim.x - 6500, 7620, aim.y - 8500); cam.lookAt(aim.x, 2500, aim.y); }
        if (shot.startsWith('bombsight-')) {
          // A staged formation pass above the airfield, using the real nose eyepiece at 25,000 ft.
          // Restore the original formation before the next fixture so target/map placement is identical.
          const axis = e.sky.material.uniforms.uTgtRot.value;
          const x = aim.x + axis.x * 600 + axis.y * 1300;
          const z = aim.y + axis.y * 600 - axis.x * 1300;
          w.formationCenter.set(x, 7621.5, z);
          w.player.pos.set(x, 7621.5, z - 11); w.player.quat.identity(); w.player.root.updateMatrixWorld(true);
          g.director.bombsDropped = false;
          g.bombardier.enter(); g.bombardier.range = 0;
          g.bombardier.camera();
        }
        if (reference) { cam.position.fromArray(reference.camera.position); cam.quaternion.fromArray(reference.camera.quaternion); cam.fov = reference.camera.fov; }
        cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
        e.post.resetHistory(); e.clouds.resetHistory();
        for (let i = 0; i < 24; i++) e.render(1 / 60);
        return { clock: w.time, target: aim.toArray(), look, camera: { position: cam.position.toArray(), quaternion: cam.quaternion.toArray(), fov: cam.fov }, formation: w.bombers().length, bombsight: g.bombardier.active, flak: e.sky.material.uniforms.uFlakGround.value };
      }, { shot, clock, look, reference });
      assert.ok(facts.flak > .95, `${tag}/${shot}: the barrage must be active`);
      if (shot.startsWith('bombsight-')) {
        assert.equal(facts.bombsight, true); assert.equal(facts.camera.position[1], 7620); assert.equal(facts.camera.fov, 28);
      }
      if (reference) { assert.deepEqual(facts.camera, reference.camera); assert.deepEqual(facts.target, reference.target); }
      await page.waitForFunction(() => window.engine.sky.material.uniforms.uFarMapped.value === 1, null, { polling: 100, timeout: 60000 });
      await page.evaluate(look => {
        const e = window.engine;
        window.game.target.update(0, window.groundQA.mission, look > 0);
        e.post.resetHistory(); e.clouds.resetHistory();
        for (let i = 0; i < 24; i++) e.render(1 / 60);
      }, look);
      const data = await page.evaluate(shot => {
        const raw = sws.shot(.98);
        if (!shot.startsWith('bombsight-')) return raw;
        const source = window.engine.renderer.domElement;
        const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(source, 0, 0);
        window.game.bombardier.draw(ctx, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', .98);
      }, shot);
      if (shot.startsWith('bombsight-')) {
        const raw = Buffer.from(data.split(',')[1], 'base64');
        await fs.writeFile(`${detailOut}/${tag}-${shot}-full.jpg`, await smallJpeg(raw, 1920));
        const meta = await sharp(raw).metadata();
        await sharp(raw).extract({ left: Math.floor(meta.width * .30), top: Math.floor(meta.height * .22), width: Math.floor(meta.width * .4), height: Math.floor(meta.height * .56) }).jpeg({ quality: 95 }).toFile(`${detailOut}/${tag}-${shot}-crop.jpg`);
      }
      await fs.writeFile(`${out}/${tag}-${shot}.jpg`, await smallJpeg(Buffer.from(data.split(',')[1], 'base64'), 1280));
      const perf = await page.evaluate(() => {
        const e = window.engine, gl = e.renderer.getContext(), samples = [], pixel = new Uint8Array(4), before = e.renderer.info.programs.length;
        for (let i = 0; i < 30; i++) { const t = window.groundRealNow(); e.render(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); samples.push(window.groundRealNow() - t); }
        samples.sort((a, b) => a - b);
        return { mean: samples.reduce((a, b) => a + b, 0) / samples.length, p95: samples[28], programsBefore: before, programsAfter: e.renderer.info.programs.length,
          renderSize: [e.renderer.domElement.width, e.renderer.domElement.height],
          groundClock: e.sky.material.uniforms.uTgtClock.value,
          freight: e.sky.material.uniforms.uFreight?.value ?? null,
          sorties: e.sky.material.uniforms.uGroundSorties?.value.map(v => v.toArray()) ?? null };
      });
      if (look) assert.ok(Math.abs(perf.groundClock - (clock - 3)) < 1e-6, 'Airfield clock must not restart on capture');
      assert.equal(errors.length, 0, errors.join('\n')); assert.equal(perf.programsBefore, perf.programsAfter);
      results.push({ tag, url, scripts, quality, shot, ...facts, perf, errors });
      await fs.writeFile(`${out}/comparison.json`, JSON.stringify(results, null, 2) + '\n');
      console.log(tag, shot, perf.mean.toFixed(1));
    }
    if (!tag.startsWith('live')) {
      const motion = await page.evaluate(() => {
        const g = window.game, e = window.engine, u = e.sky.material.uniforms;
        const before = { train: u.uFreight.value, altitude: u.uGroundSorties.value[0].z, target: g.target.aimPoint.toArray() };
        g.world.time += 2; g.target.update(0, window.groundQA.mission, true);
        e.render(1 / 60);
        const after = { train: u.uFreight.value, altitude: u.uGroundSorties.value[0].z, target: g.target.aimPoint.toArray() };
        g.target.clear();
        return { before, after, reset: { bombs: g.target.mesh.count, target: u.uTgt.value.w, aircraft: u.uGroundSorties.value.map(v => v.w) } };
      });
      assert.ok(Math.abs(motion.after.train - motion.before.train - 26) < 1e-6);
      assert.ok(Math.abs(motion.after.altitude - motion.before.altitude - 46) < 1e-6);
      assert.deepEqual(motion.after.target, motion.before.target);
      assert.deepEqual(motion.reset, { bombs: 0, target: 0, aircraft: [0, 0, 0] });
      results.at(-1).motion = motion;
      await fs.writeFile(`${out}/comparison.json`, JSON.stringify(results, null, 2) + '\n');
    }
    await context.close();
  }
  for (const shot of ['bomb-release', 'walking-strikes', 'burning-city', 'wind-columns', 'airfield-rail', 'bombsight-takeoff', 'bombsight-moving']) {
    const tiles = await Promise.all(['live', 'after'].map(async (tag, i) => ({ input: await sharp(`${out}/${tag}-${shot}.jpg`).resize(800).toBuffer(), left: i * 800, top: 28 })));
    const label = Buffer.from('<svg width="1600" height="28"><rect width="100%" height="28" fill="#17202a"/><text x="12" y="20" fill="white" font-family="sans-serif" font-size="16">LIVE main</text><text x="812" y="20" fill="white" font-family="sans-serif" font-size="16">Goal 25</text></svg>');
    const sheet = await sharp({ create: { width: 1600, height: 478, channels: 3, background: '#17202a' } }).composite([{ input: label, left: 0, top: 0 }, ...tiles]).png().toBuffer();
    await fs.writeFile(`${out}/compare-${shot}.jpg`, await smallJpeg(sheet, 1600));
  }
  const lowTiles = await Promise.all(['live-low', 'low'].map(async (tag, i) => ({ input: await sharp(`${out}/${tag}-airfield-rail.jpg`).resize(960).toBuffer(), left: i * 960, top: 0 })));
  await sharp({ create: { width: 1920, height: 540, channels: 3, background: '#17202a' } }).composite(lowTiles).jpeg({ quality: 92 }).toFile(`${out}/compare-low-airfield-rail.jpg`);

  const motionTiles = await Promise.all(['takeoff', 'moving'].map(async (phase, i) => ({ input: await fs.readFile(`${detailOut}/after-bombsight-${phase}-crop.jpg`), left: i * 768, top: 28 })));
  const motionLabel = Buffer.from('<svg width="1536" height="28"><rect width="100%" height="28" fill="#17202a"/><text x="12" y="20" fill="white" font-family="sans-serif" font-size="16">25,000 ft · 76.2 s</text><text x="780" y="20" fill="white" font-family="sans-serif" font-size="16">Same camera · 78.2 s (+2 seconds)</text></svg>');
  const motionSheet = await sharp({ create: { width: 1536, height: 632, channels: 3, background: '#17202a' } }).composite([{ input: motionLabel, left: 0, top: 0 }, ...motionTiles]).png().toBuffer();
  await fs.writeFile(`${detailOut}/motion-detail.jpg`, await smallJpeg(motionSheet, 1536));

} finally { await browser.close(); }

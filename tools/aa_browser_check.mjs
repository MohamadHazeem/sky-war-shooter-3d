// Local, isolated Chrome test. No score submissions. Vite must run on 5271.
// PLAYWRIGHT_MODULE=/installed/playwright/index.mjs node tools/aa_browser_check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.stack));
page.on('console', m => { if (m.type() === 'error' && /THREE|WebGL|shader/i.test(m.text())) errors.push(m.text()); });
// Local verification must never send gameplay analytics, cloud saves or scores.
await context.route(/https:\/\/.*(googleapis|firebaseio|firestore|identitytoolkit|securetoken).*/, route => route.abort());
await context.addInitScript(() => {
  localStorage.setItem('sws3d.seenVersion', '1.0');
  localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true }));
});
const shots = 'docs/phase7/shots/01';
await fs.mkdir(shots, { recursive: true });
const result = {};
const shot = async (name, frames = 2) => {
  await page.evaluate(frames => { sws.game.ui.fade(false); sws.step(frames, 1 / 60, true); }, frames);
  await page.waitForTimeout(450); // let the normal mission fade complete
  await page.screenshot({ path: shots + '/' + name + '.jpg', type: 'jpeg', quality: 70 });
};
try {
  await page.goto('http://127.0.0.1:5271/');
  await page.waitForFunction(() => window.sws?.assetsReady() && window.sws?.bench, { timeout: 120000 });
  await page.evaluate(() => {
    sws.engine.loopOverride = () => {};
    sws.game.settings.quality = 'low'; sws.game.applySettings();
    sws.game.settings.bookends = false;
  });
  // Test actual menu registration and briefing path.
  await page.locator('#title [data-a="survival"]').click();
  await page.locator('[data-tab="survival-aa"]').click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.locator('#briefing [data-go]').click();
  await page.waitForFunction(() => sws.game.aa.active);
  await page.evaluate(() => sws.step(480, 1 / 60));
  await page.waitForTimeout(4000);
  await shot('day');
  result.initial = await page.evaluate(() => ({ wave: sws.game.aa.wave, aircraft: sws.game.aa.raiders.length, assets: sws.game.aa.field.assets.length }));
  assert.equal(result.initial.assets, 11);
  // Headless stepping needs no pointer lock; test the explicit pause boundary.
  await page.evaluate(() => { sws.game.input.everLocked = false; sws.game.input.lock = () => {}; sws.game.input.unlock(); });
  // Pause is a hard simulation/input boundary.
  result.pause = await page.evaluate(() => {
    const g = sws.game, t = g.world.time, yaw = g.aa.mounts[0].yaw;
    g.pause(); g.input.mouseDX = 300; sws.step(60); const unchanged = g.world.time === t && g.aa.mounts[0].yaw === yaw;
    g.resume(); return unchanged;
  });
  assert.equal(result.pause, true);
  // Ideal lead bot uses actual gun traverse, heat, ballistics, reloads and damage.
  // Engine.frame(false) avoids rendering every single bot decision; sws.step renders checkpoints.
  result.play = await page.evaluate(() => {
    const g = sws.game, aa = g.aa, dt = 1 / 60, waves = [];
    aa.switchPit(1);
    let frames = 0;
    for (; frames < 24000 && aa.wave < 4 && g.state === 'playing'; frames++) {
      if (aa.choosing) { waves.push({ wave: aa.wave, kills: g.world.stats.kills, score: g.score }); aa.choose(2); }
      const m = aa.mounts[aa.selected], eye = g.engine.camera.position;
      let pick = null, best = Infinity;
      for (const r of aa.raiders) if (r.f.alive && !r.f.remove) {
        const d = r.f.pos.distanceTo(eye); if (d < best) { pick = r.f; best = d; }
      }
      if (pick) {
        const t = best / 850;
        const x = pick.pos.x + pick.vel.x * t - eye.x, z = pick.pos.z + pick.vel.z * t - eye.z;
        const y = pick.pos.y + pick.vel.y * t - eye.y + 4.905 * t * t;
        m.wantYaw = Math.atan2(x, z); m.wantPitch = Math.atan2(y, Math.hypot(x, z));
        const error = Math.abs(Math.atan2(Math.sin(m.yaw - m.wantYaw), Math.cos(m.yaw - m.wantYaw)));
        g.input.setVirtualButtons('aa-test', error < 0.08 && Math.abs(m.pitch - m.wantPitch) < 0.08 && best < 1800 ? 1 : 0);
      } else g.input.setVirtualButtons('aa-test', 0);
      sws.engine.frame(dt, false);
    }
    g.input.setVirtualButtons('aa-test', 0); sws.step(1);
    return { frames, waves, wave: aa.wave, state: g.state, score: g.score, shots: g.world.stats.shots, hits: g.world.stats.hits, kills: g.world.stats.kills, health: aa.field.assets.map(a => [a.kind, Math.round(a.hp)]) };
  });
  console.log('play', result.play);
  assert.equal(result.play.wave, 4);
  assert.ok(result.play.kills > 0 && result.play.hits > 0);
  await shot('wave-four');

  // Dive screenshot uses a naturally spawned wave-two Ju 88; no aircraft repositioning.
  await page.evaluate(async () => {
    const { aaMission } = await import('/src/game/AADefenceMode.ts');
    const g = sws.game; g.startMission(aaMission('clear'));
    sws.step(4200, 1 / 60); if (g.aa.choosing) g.aa.choose(2);
    sws.step(1720, 1 / 60);
    const aa = g.aa, r = aa.raiders.find(r => r.group.profile === 'dive' && r.f.alive);
    if (!r) throw Error('No dive bomber');
    const m = aa.mounts[aa.selected], eye = g.engine.camera.position;
    m.wantYaw = Math.atan2(r.f.pos.x - eye.x, r.f.pos.z - eye.z);
    m.wantPitch = Math.atan2(r.f.pos.y - eye.y, Math.hypot(r.f.pos.x - eye.x, r.f.pos.z - eye.z));
    sws.step(90, 1 / 60);
  });
  await page.waitForTimeout(3300);
  await shot('dive-attack');
  result.dive = await page.evaluate(() => sws.game.aa.raiders.filter(r => r.group.profile === 'dive').map(r => ({ height: r.f.pos.y, vy: r.f.vel.y, screamed: r.screamed, payload: r.payload })));
  assert.ok(result.dive.some(r => r.vy < -50 && r.screamed));

  // Destruction fixture: apply real asset damage to a hangar, then let effects run.
  await page.evaluate(() => {
    const g = sws.game, aa = g.aa, a = aa.field.assets.find(a => a.kind === 'hangar');
    aa.damageAsset(a, a.maxHp);
    const m = aa.mounts[aa.selected], eye = g.engine.camera.position;
    m.wantYaw = Math.atan2(a.pos.x - eye.x, a.pos.z - eye.z); m.wantPitch = 0.04;
    sws.step(180);
  });
  await shot('destroyed-hangar');
  result.destroyed = await page.evaluate(() => sws.game.aa.field.assets.filter(a => a.kind === 'hangar').map(a => a.hp));
  assert.equal(result.destroyed[0], 0);

  await page.evaluate(async () => {
    const { aaMission } = await import('/src/game/AADefenceMode.ts');
    sws.game.startMission(aaMission('night')); sws.step(850);
    const aa = sws.game.aa, m = aa.mounts[0]; m.wantYaw = 0.7; m.wantPitch = 0.3; sws.step(160);
    sws.game.input.setVirtualButtons('aa-test', 1); sws.step(20, 1 / 60, true);
  });
  await page.waitForTimeout(4000);
  await page.evaluate(() => { sws.step(35, 1 / 60, true); });
  await page.evaluate(() => { sws.game.aa.mounts[0].cooldown = 0; });
  await shot('night', 1);
  await page.evaluate(() => sws.game.input.setVirtualButtons('aa-test', 0));
  result.night = await page.evaluate(() => ({ lights: sws.game.aa.lights.count, bullets: sws.game.world.ballistics.n }));
  assert.equal(result.night.lights, 6);

  // Same browser/resolution/preset, after a warm-up; GPU readback included.
  result.benchAA = await page.evaluate(() => { sws.step(60, 1 / 60, true); const programsBefore = sws.engine.renderer.info.programs.length; return { programsBefore, ...sws.bench(120) }; });
  assert.equal(result.benchAA.programs, result.benchAA.programsBefore);
  await page.evaluate(() => { sws.game.startMission(sws.CAMPAIGN[0]); sws.step(600); });
  result.cleanup = await page.evaluate(() => ({ active: sws.game.aa.active, ground: sws.game.world.ballistics.ground !== null, field: !!sws.engine.scene.getObjectByName('aa-defence'), floor: sws.game.world.floorY }));
  assert.deepEqual(result.cleanup, { active: false, ground: false, field: false, floor: 250 });
  result.benchNormal = await page.evaluate(() => { sws.step(60, 1 / 60, true); return sws.bench(120); });
  // Original airfield defence still starts with a flying P-51 and its raid director.
  result.raid = await page.evaluate(async () => {
    const { raidMission } = await import('/src/game/RaidDefence.ts');
    sws.game.startMission(raidMission()); sws.step(600);
    return { active: sws.game.pilotOps.raid.active, pilot: !!sws.game.world.playerFighter, aa: sws.game.aa.active };
  });
  assert.deepEqual(result.raid, { active: true, pilot: true, aa: false });
  // Damage and repair integration, third-pit choice, both defeat conditions and debrief.
  result.lifecycle = await page.evaluate(async () => {
    const { aaMission } = await import('/src/game/AADefenceMode.ts');
    const g = sws.game; g.startMission(aaMission('clear')); sws.step(2);
    const aa = g.aa, p = aa.field.pits[0];
    aa.damageAsset(p, 999); g.input.setVirtualButtons('aa-test', 1);
    sws.step(120); const blocked = g.world.stats.shots === 0 && p.hp === 0;
    g.input.setVirtualButtons('aa-test', 0); sws.step(620);
    const repaired = p.hp > 0 && p.repair === 0;
    sws.step(3600);
    const offered = aa.choosing; aa.choose(3); aa.switchPit(2); sws.step(60);
    const third = aa.unlocked === 3 && aa.selected === 2 && aa.transition === 0;
    aa.damageAsset(aa.field.assets.find(a => a.kind === 'tower'), 9999); sws.step(360);
    const tower = g.state === 'debrief' && g.endResult.reason.includes('tower');
    g.startMission(aaMission('clear'));
    for (const a of aa.field.assets) if (a.kind === 'bomber') aa.damageAsset(a, 9999);
    sws.step(360);
    const bombers = g.state === 'debrief' && g.endResult.reason.includes('bombers');
    return { blocked, repaired, offered, third, tower, bombers };
  });
  assert.ok(Object.values(result.lifecycle).every(Boolean));

  // Smoke-test the quad through Ballistics against a stationary target fixture.
  result.quad = await page.evaluate(async () => {
    const { aaMission } = await import('/src/game/AADefenceMode.ts');
    const g = sws.game; g.startMission(aaMission('clear')); sws.step(2);
    const aa = g.aa, eye = g.engine.camera.position, m = aa.mounts[0];
    m.yaw = m.wantYaw = 0; m.pitch = m.wantPitch = 0.3; sws.step(1);
    const pos = g.engine.camera.position.clone().addScaledVector(aa.dir, 250);
    const f = g.world.spawnEnemy(pos, 'headon', 1, false, false, 'fw190'); g.world.clearPilot(f);
    f.kinematic = true; f.fm.vel.set(0,0,0); f.vel.set(0,0,0);
    g.input.setVirtualButtons('aa-test', 1); sws.step(180);
    g.input.setVirtualButtons('aa-test', 0);
    return { hits: g.world.stats.hits, kills: g.world.stats.kills, ammo: m.ammo };
  });
  assert.ok(result.quad.hits > 0 && result.quad.kills > 0 && result.quad.ammo < 480);

  // Late-wave fixture covers rocket attacks, jets and the major-raid branch.
  result.late = await page.evaluate(async () => {
    const { aaMission } = await import('/src/game/AADefenceMode.ts');
    const g = sws.game; g.startMission(aaMission('overcast'));
    const aa = g.aa; aa.wave = 10; g.roundIdx = 9; aa.beginWave();
    for (const a of aa.field.assets) a.hp = a.maxHp = 100000; // isolate late profiles from the loss condition tested above
    sws.step(4500);
    return { major: aa.plan.major, types: [...new Set(aa.raiders.map(r => r.f.enemyType))], rockets: aa.raiders.filter(r => r.group.profile === 'rocket').map(r => r.payload), finite: g.world.aircraft.every(f => Number.isFinite(f.pos.x + f.pos.y + f.pos.z)) };
  });
  assert.equal(result.late.major, true); assert.equal(result.late.finite, true);
  assert.ok(result.late.types.includes('me262') && result.late.types.includes('me163'));

  await page.setViewportSize({ width: 800, height: 500 });
  await page.evaluate(async () => {
    const { setLang } = await import('/src/i18n/index.ts'); setLang('ar');
    const { access } = await import('/src/core/Accessibility.ts'); access.set('touch', 'on');
  });
  // Reload so the existing device HUD is also constructed in Arabic.
  await page.reload();
  await page.waitForFunction(() => window.sws?.assetsReady() && window.sws?.bench, { timeout: 120000 });
  await page.evaluate(async () => {
    sws.engine.loopOverride = () => {}; sws.game.settings.quality = 'low'; sws.game.applySettings();
    sws.game.input.everLocked = false; sws.game.input.lock = () => {};
    const { aaMission } = await import('/src/game/AADefenceMode.ts');
    sws.game.startMission(aaMission('dusk')); sws.step(60);
  });
  await page.locator('#aaHud .aa-gun > button').nth(1).click();
  await page.evaluate(() => { sws.step(60); });
  result.touchArabic = await page.evaluate(() => ({
    selected: sws.game.aa.selected, rtl: document.documentElement.dir,
    text: document.querySelector('#aaHud').textContent.includes('سلامة القاعدة'),
    touch: document.querySelector('#touchHud').classList.contains('show'),
    noOverflow: document.documentElement.scrollWidth <= innerWidth,
  }));
  assert.equal(result.touchArabic.selected, 1); assert.equal(result.touchArabic.rtl, 'rtl'); assert.equal(result.touchArabic.text, true);
  assert.equal(result.touchArabic.touch, true); assert.equal(result.touchArabic.noOverflow, true);
  assert.equal(await page.locator('#aaHud .aa-status').textContent().then(s => /Wave|Score|Kills/.test(s)), false);
  await page.waitForTimeout(4000); await shot('arabic-touch');

  // Decode all three generated clips in the actual browser audio implementation.
  result.voice = await page.evaluate(async () => {
    const manifest = await (await fetch('/audio/voice/manifest.json')).json(), context = new OfflineAudioContext(1, 1, 16000), clips = [];
    for (const id of ['aa_inbound', 'aa_major', 'aa_repair']) {
      const clip = manifest.clips[id];
      const buffer = await context.decodeAudioData(await (await fetch('/audio/voice/' + clip.file)).arrayBuffer());
      clips.push({ id, duration: buffer.duration, channels: buffer.numberOfChannels });
    }
    return clips;
  });
  assert.ok(result.voice.every(v => v.channels === 1 && v.duration > 2));
  result.errors = errors;
  await fs.writeFile(shots + '/verification.json', JSON.stringify(result, null, 2) + '\n');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(result, null, 2));
} finally { result.errors = errors; await fs.writeFile(shots + '/verification.json', JSON.stringify(result, null, 2) + '\n'); await browser.close(); }

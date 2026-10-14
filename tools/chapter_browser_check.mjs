// Run the worktree's Vite on 5294. Uses an already-installed Playwright and Chrome.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const shots = 'docs/phase9/shots/04';
await fs.mkdir(shots, { recursive: true });
const errors = [], results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'low', bookends: false, analytics: false, hudDetail: 'standard' }));
    localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true }));
    let seed = 42; Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  });
  await page.goto('http://127.0.0.1:5294');
  await page.waitForFunction(() => window.sws?.autoplay && sws.vqa, { timeout: 120000 });
  await page.evaluate(async () => {
    sws.engine.loopOverride = () => {}; sws.game.input.lock = () => {};
    window.chapter = (await import('/src/game/DeepPenetration.ts')).DEEP_PENETRATION;
    sws.game.showCampaign();
  });
  assert.equal(await page.locator('[data-chapter]').isDisabled(), true);
  await page.evaluate(() => sws.secondTour.finishStory());
  await page.locator('[data-chapter]').click();
  assert.equal(await page.locator('[data-dp]:not([disabled])').count(), 1);
  await page.screenshot({ path: `${shots}/chapter-unlocked.jpg`, type: 'jpeg', quality: 65 });
  for (let i = 0; i < 5; i++) {
    const id = `dp${i + 1}`;
    await page.locator(`[data-dp="${id}"]`).click();
    await page.evaluate(() => { sws.step(1); sws.game.ui.fade(false); });
    assert.equal(await page.locator('#briefing .bx-play').count(), 1);
    await page.screenshot({ path: `${shots}/${id}-briefing.jpg`, type: 'jpeg', quality: 65 });
    // Decode the shipped voice clips through the real browser audio decoder.
    const audio = await page.evaluate(async i => {
      const ctx = new AudioContext(), m = chapter[i], durations = [];
      for (let j = 1; j <= m.briefing.length; j++) {
        const r = await fetch(`/audio/voice/brief_${m.id}_${j}.m4a`);
        durations.push((await ctx.decodeAudioData(await r.arrayBuffer())).duration);
      }
      await ctx.close(); return durations;
    }, i);
    const run = await page.evaluate(async i => {
      const m = chapter[i], g = sws.game, engine = sws.engine;
      const frame = engine.frame.bind(engine), moments = [], seen = new Set();
      const spawn = g.world.spawnEnemy.bind(g.world), enemyTypes = new Set();
      g.world.spawnEnemy = (...args) => { const f = spawn(...args); enemyTypes.add(f.enemyType); return f; };
      engine.frame = (dt, render) => {
        if (g.state === 'ending') { g.bookends.auto = false; window.room.auto = false; }
        frame(dt, render);
        const t = g.world.time;
        if (g.state !== 'playing') return;
        // Capture the actual scheduled scene, including any staging delay.
        const active = g.midRound.setPieces.active;
        if (!seen.has('moment') && ((active && active.t >= (active.t0 ?? 0) + 3) || (m.signature.id === 'straggler' && t >= 70))) {
          seen.add('moment'); g.ui.fade(false);
          const pos = engine.camera.position.clone(), quat = engine.camera.quaternion.clone();
          const subject = active?.b ?? active?.bandit ?? g.midRound.event?.b;
          if (subject) {
            engine.camera.position.copy(subject.pos).add({ x: 130, y: 55, z: 170 });
            engine.camera.lookAt(subject.pos);
          }
          moments.push({ name: 'moment', t, subject: subject?.name, image: sws.shot(.65) });
          engine.camera.position.copy(pos); engine.camera.quaternion.copy(quat);
        }
        if (!seen.has('target') && t >= m.bombsAway + 30) {
          seen.add('target');
          // Observation camera only: no mission changes. Look down at the target's real aim point.
          const pos = engine.camera.position.clone(), quat = engine.camera.quaternion.clone();
          const { Atmos } = window.targetModules;
          const aim = g.targetArea?.aimPoint ?? g.target?.aimPoint;
          if (aim) engine.camera.lookAt(aim.x - Atmos.originOffset.x, 0, aim.y - Atmos.originOffset.z);
          moments.push({ name: 'target', t, image: sws.shot(.65) });
          engine.camera.position.copy(pos); engine.camera.quaternion.copy(quat);
        }
      };
      window.targetModules = await import('/src/render/Atmosphere.ts');
      window.room = (await import('/src/ui/CrewRoomScene.ts')).crewRoomScene;
      let log;
      try { log = sws.autoplay(m, 18000); }
      finally { engine.frame = frame; g.world.spawnEnemy = spawn; }
      return { id: m.id, log, metrics: (await import('/src/dev/autoplay.ts')).lastMetrics,
        tactics: g.specials.tactics.log, pieces: g.midRound.setPieces.log,
        enemyTypes: [...enemyTypes], moments, audioReady: true };
    }, i);
    for (const moment of run.moments) {
      await fs.writeFile(`${shots}/${id}-${moment.name}.jpg`, Buffer.from(moment.image.split(',')[1], 'base64'));
      delete moment.image;
    }
    run.audioDurations = audio; results.push(run);
    await fs.writeFile(`${shots}/verification.json`, JSON.stringify({ errors, results }, null, 2));
    console.log(id, run.metrics.success, run.metrics.t, run.metrics.kills, run.pieces);
    assert.equal(run.metrics.timeout, false, run.log);
    assert.equal(run.metrics.success, true, run.log);
    assert.equal(run.pieces.filter(s => /s set piece \w+$/.test(s)).length, 1);
    if (i > 0) assert.ok(run.pieces.some(s => s.endsWith('done')), run.pieces.join(' / '));
    assert.equal(run.tactics.filter(s => s.includes(' pack ')).length, 1);
    assert.ok(run.moments.some(m => m.name === 'moment'));
    if (i < 4) assert.ok(!run.enemyTypes.includes('me262'));
    await page.screenshot({ path: `${shots}/${id}-debrief.jpg`, type: 'jpeg', quality: 65 });
    await page.evaluate(() => { sws.game.showCampaign(); });
    await page.locator('[data-chapter]').click();
  }
  assert.equal(await page.locator('[data-dp]:not([disabled])').count(), 5);
  await page.screenshot({ path: `${shots}/chapter-complete.jpg`, type: 'jpeg', quality: 65 });
  // Real captured debrief -> crew room, with the regular automatic bypass disabled.
  await page.evaluate(async () => {
    const { crewRoomScene } = await import('/src/ui/CrewRoomScene.ts');
    crewRoomScene.auto = false;
    crewRoomScene.play(chapter[4], () => sws.game.showCampaign());
  });
  await page.waitForFunction(() => document.querySelector('#crewRoom .crm-sub .txt')?.textContent.trim(), { timeout: 30000 });
  await page.screenshot({ path: `${shots}/crew-room.jpg`, type: 'jpeg', quality: 65 });
  await page.evaluate(() => localStorage.setItem('sws3d.lang', 'ar'));
  await page.reload();
  await page.waitForFunction(() => window.sws?.autoplay, { timeout: 120000 });
  await page.evaluate(() => { sws.engine.loopOverride = () => {}; sws.game.input.lock = () => {}; sws.game.showCampaign(); });
  await page.locator('[data-chapter]').click();
  await page.screenshot({ path: `${shots}/chapter-arabic.jpg`, type: 'jpeg', quality: 65 });
  await page.locator('[data-dp="dp1"]').click();
  await page.evaluate(() => { sws.step(1); sws.game.ui.fade(false); });
  await page.screenshot({ path: `${shots}/briefing-arabic.jpg`, type: 'jpeg', quality: 65 });
  await fs.writeFile(`${shots}/verification.json`, JSON.stringify({ errors, results }, null, 2));
  assert.deepEqual(errors, []);
} finally { await browser.close(); }

// Supplemental chapter UI / target-layout checks; Vite must be running on port 5294.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const shots = 'docs/phase9/shots/04', errors = [], layouts = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error' && /WebGLProgram|Shader Error|GL_INVALID|Uncaught/.test(msg.text())) errors.push(msg.text()); });
  await page.addInitScript(() => {
    localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'medium', bookends: false, analytics: false }));
    localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true }));
  });
  await page.goto('http://127.0.0.1:5294');
  await page.waitForFunction(() => window.sws?.autoplay, { timeout: 120000 });
  await page.evaluate(() => { sws.engine.loopOverride = () => {}; sws.game.input.lock = () => {}; sws.secondTour.finishStory(); });
  await page.locator('[data-secondtour]').click();
  const before = await page.evaluate(() => sws.secondTour.current().id);
  await page.locator('[data-chapter]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('[data-dp]:not([disabled])').count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: `${shots}/chapter-mobile.jpg`, type: 'jpeg', quality: 65 });
  await page.locator('#campaign [data-back]').click();
  assert.equal(await page.evaluate(() => sws.secondTour.current().id), before);
  await page.setViewportSize({ width: 1280, height: 800 });
  for (let i = 0; i < 5; i++) {
    const result = await page.evaluate(async i => {
      const { DEEP_PENETRATION } = await import('/src/game/DeepPenetration.ts');
      const { targetUniforms } = await import('/src/render/TargetGround.ts');
      const { Atmos } = await import('/src/render/Atmosphere.ts');
      const g = sws.game, m = DEEP_PENETRATION[i];
      g.startMission(m); sws.step(3); g.ui.fade(false);
      // Reference inspection of silhouettes; real mission weather is captured by the autoplay check.
      g.setWeather({ sunEl: 45, sunAz: 190, low: .1, high: .1, preset: 'clear' });
      const aim = g.target.aimPoint;
      sws.engine.camera.position.set(aim.x - Atmos.originOffset.x, 4500, aim.y - Atmos.originOffset.z + 1500);
      sws.engine.camera.lookAt(aim.x - Atmos.originOffset.x, 0, aim.y - Atmos.originOffset.z);
      sws.engine.post.resetHistory(); sws.engine.clouds.resetHistory();
      sws.engine.post.motionBlur = 0; sws.engine.post.dofStrength = 0;
      sws.engine.render(1 / 60);
      return { id: m.id, referenceWeather: 'clear', look: targetUniforms.uTgtLook.value, image: sws.shot(.65), programs: sws.engine.renderer.info.programs.length };
    }, i);
    assert.equal(result.look, i + 1);
    await fs.writeFile(`${shots}/${result.id}-layout-medium.jpg`, Buffer.from(result.image.split(',')[1], 'base64'));
    delete result.image; layouts.push(result);
  }
  // Hold weather, station, camera and mission fixed: only the new layout uniform changes.
  const layoutPrograms = await page.evaluate(async () => {
    const { targetUniforms } = await import('/src/render/TargetGround.ts');
    const counts = [];
    for (let look = 0; look <= 5; look++) {
      targetUniforms.uTgtLook.value = look; sws.engine.render(1 / 60);
      counts.push(sws.engine.renderer.info.programs.length);
    }
    return counts;
  });
  assert.equal(new Set(layoutPrograms).size, 1, 'changing only target layout must not compile new shaders');
  const reset = await page.evaluate(async () => {
    sws.game.startMission(sws.CAMPAIGN[0]); sws.step(3);
    return (await import('/src/render/TargetGround.ts')).targetUniforms.uTgtLook.value;
  });
  assert.equal(reset, 0);
  await page.evaluate(async () => {
    sws.game.startMenu();
    const { crewRoomScene } = await import('/src/ui/CrewRoomScene.ts');
    crewRoomScene.preview('dp5');
  });
  await page.waitForFunction(() => document.querySelector('#crewRoom .crm-sub .txt')?.textContent.trim(), { timeout: 30000 });
  await page.screenshot({ path: `${shots}/crew-room-dialogue.jpg`, type: 'jpeg', quality: 65 });
  await fs.writeFile(`${shots}/ui-verification.json`, JSON.stringify({ errors, secondTourBefore: before, secondTourAfter: before, layouts, layoutPrograms, reset }, null, 2));
  assert.deepEqual(errors, []);
} finally { await browser.close(); }

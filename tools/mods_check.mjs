// Phase 11 goal 38 (mod support) browser check and captures. Vite must be running on port 5338:
//   npx vite --port 5338 --strictPort
//   PLAYWRIGHT_MODULE=/abs/path/playwright/index.mjs PLAYWRIGHT_EXECUTABLE=/abs/path/chrome-headless-shell \
//     tools/heavy.sh node tools/mods_check.mjs
// Bundled headless shell only (never channel 'chrome'). Writes docs/phase11/shots/38/*.jpg and check.json:
// the Mods screen (empty, both examples installed, a broken file rejected, a mod switched off) in English
// and Arabic at desktop and phone size; mod paint and nose art tiles in Customize; the player's B-17 in
// the air wearing the mod's camouflage and nose art; a mod mission flown to the debrief; the renamed crew.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const URL0 = process.env.SWS_URL ?? 'http://127.0.0.1:5338';
const out = 'docs/phase11/shots/38';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE, args: ['--autoplay-policy=no-user-gesture-required', ...(process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [])] });
const errors = [], report = {};
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 70, timeout: 120000 });
const only = process.env.ONLY?.split(',');
const want = (k) => !only || only.includes(k);

async function open(lang, viewport, quality = 'low') {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && /Uncaught|TypeError|ReferenceError|WebGLProgram/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(([lang, quality]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality, bookends: false, analytics: false }));
    localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true, tutorialDone: true }));
    localStorage.setItem('sws3d.lang', lang);
  }, [lang, quality]);
  await page.goto(URL0 + '/');
  await page.waitForFunction(() => window.sws?.autoplay && window.sws.game, { timeout: 180000 });
  await page.evaluate(() => { sws.engine.loopOverride = () => {}; sws.game.input.lock = () => {}; });
  return page;
}
const noHScroll = (page) => page.evaluate(() => {
  const s = document.querySelector('#mods-screen .box');
  return document.documentElement.scrollWidth <= innerWidth && (!s || s.scrollWidth <= s.clientWidth + 1);
});
const openMods = async (page) => {
  await page.evaluate(() => sws.game.menus.hangar('aircraft'));
  await page.click('#hangarHub [data-route="mods"]');
  await page.waitForSelector('#mods-screen.show [data-examples] [data-ex]');
};
const installExamples = async (page) => {
  for (const f of ['eighth-extras.json', 'hometown-crew.json']) {
    await page.click(`#mods-screen [data-ex="${f}"]`);
    await page.waitForSelector(`#mods-screen [data-ex="${f}"][disabled]`);
  }
  await page.waitForTimeout(300);   // images decode
};
const BROKEN = JSON.stringify({ format: 'sws3d-mod', version: 1, id: 'Broken Mod', name: 'Broken', missions: [{ id: 'm1', waves: [{ count: 40, types: ['spitfire'] }] }], paints: [{ id: 'p1', name: 'P', top: 'red' }], noseArt: [{ id: 'n1', name: 'N', image: 'https://example.com/a.png' }] });

// ---- 1. the Mods screen, English desktop: empty, examples installed, a broken file, a mod off ----
if (want('screen')) {
  const page = await open('en', { width: 1280, height: 800 });
  await openMods(page);
  await shot(page, 'mods-empty-en');
  await installExamples(page);
  report.installed = await page.$$eval('#mods-screen .mod-card[data-id]', (c) => c.map((x) => x.dataset.id));
  assert.deepEqual(report.installed, ['eighth-extras', 'hometown-crew']);
  report.flyButtons = await page.$$eval('#mods-screen [data-fly]', (b) => b.length);
  assert.equal(report.flyButtons, 3);
  await shot(page, 'mods-installed-en');
  await page.setInputFiles('#mods-screen [data-file]', { name: 'broken-mod.json', mimeType: 'application/json', buffer: Buffer.from(BROKEN) });
  await page.waitForSelector('#mods-screen .mods-msg.bad');
  report.brokenErrors = await page.$$eval('#mods-screen .mods-msg.bad li', (l) => l.map((x) => x.textContent));
  assert.ok(report.brokenErrors.length >= 4, 'broken file lists its problems');
  await shot(page, 'mods-broken-en');
  // switch the crew mod off: the roster goes back to the original names
  const nameOf = () => page.evaluate(async () => (await import('/src/game/CrewRoster.ts')).MEN.find((m) => m.id === 'dawson').first);
  report.crewOn = await nameOf();
  await page.click('#mods-screen .mod-card[data-id="hometown-crew"] [data-sw]');
  report.crewOff = await nameOf();
  assert.equal(report.crewOn, 'Lyle'); assert.equal(report.crewOff, 'Joe');
  await page.click('#mods-screen .mod-card[data-id="hometown-crew"] [data-sw]');
  report.noHScrollDesktop = await noHScroll(page);
  report.stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sws3d.mods.v1')).map((m) => [m.pack.id, m.enabled]));
  // crew panel shows the new names
  await page.evaluate(() => sws.game.menus.open('crew', () => {}));
  await page.waitForTimeout(200);
  report.crewPanel = await page.$eval('#crewMenu', (e) => e.textContent.includes('Becker'));
  assert.ok(report.crewPanel, 'crew panel shows mod names');
  await shot(page, 'crew-renamed-en');
  // Customize: the mod tiles, pick the mod nose art and paint
  await page.evaluate(() => sws.game.menus.open('customize', () => {}));
  await page.waitForSelector('[data-cos="nose:mod.eighth-extras.checkertail"]');
  await page.click('[data-cos="nose:mod.eighth-extras.star-roundel"]');
  await page.click('[data-cos="paint:mod.eighth-extras.desert-camo"]');
  report.bomber = await page.evaluate(() => sws.game.prog.bomber);
  assert.equal(report.bomber.paint, 'mod.eighth-extras.desert-camo');
  await page.$eval('[data-cos="nose:mod.eighth-extras.checkertail"]', (e) => e.scrollIntoView({ block: 'center' }));
  await shot(page, 'customize-mod-tiles-en');
  await page.close();
}

// ---- 2. Arabic, desktop and phone ----
if (want('ar')) for (const [label, vp] of [['ar', { width: 1280, height: 800 }], ['phone-ar', { width: 390, height: 844 }], ['phone-en', { width: 390, height: 844 }]]) {
  const page = await open(label.endsWith('en') ? 'en' : 'ar', vp);
  await openMods(page);
  await installExamples(page);
  await page.setInputFiles('#mods-screen [data-file]', { name: 'broken-mod.json', mimeType: 'application/json', buffer: Buffer.from(BROKEN) });
  await page.waitForSelector('#mods-screen .mods-msg.bad');
  report['noHScroll-' + label] = await noHScroll(page);
  assert.ok(report['noHScroll-' + label], 'no horizontal scroll ' + label);
  if (label === 'ar') report.arabicError = await page.$eval('#mods-screen .mods-msg.bad', (e) => e.textContent.slice(0, 160));
  await shot(page, 'mods-' + label);
  await page.$eval('#mods-screen .mod-card[data-id]', (e) => e.scrollIntoView({ block: 'start' }));
  await shot(page, 'mods-' + label + '-list');
  await page.close();
}

// ---- 3. in the air: the player's B-17 in the mod's camouflage with the mod's nose art; fly a mod mission ----
if (want('air')) for (const quality of ['high', 'low']) {
  const page = await open('en', { width: 1280, height: 720 }, quality);
  await openMods(page);
  await installExamples(page);
  await page.evaluate(() => { const b = sws.game.prog.bomber; b.paint = 'mod.eighth-extras.desert-camo'; b.nose = 'mod.eighth-extras.star-roundel'; b.name = 'Sandy Annie'; sws.game.prog.save(); });
  await page.click('#mods-screen [data-fly="black-thursday"]');
  await page.waitForSelector('#briefing.show');
  report['briefing-' + quality] = await page.$eval('#briefing', (e) => e.textContent.includes('Black Thursday'));
  if (quality === 'high') await shot(page, 'briefing-mod-mission-en');
  // start the briefed mission and let assets settle
  await page.evaluate(() => { const b = document.querySelector('#briefing [data-start], #briefing .btn:not(.ghost)'); b?.click(); });
  await page.waitForFunction(() => sws.game.state === 'playing' || sws.game.world.playerBomber, { timeout: 120000 });
  await page.waitForFunction(() => sws.assetsReady(), { timeout: 180000 });
  await page.evaluate(() => sws.step(30, 1 / 30));
  await page.waitForTimeout(quality === 'high' ? 6000 : 1500);   // hero detail textures stream in
  const info = await page.evaluate(() => {
    const b = sws.game.world.playerBomber;
    const skin = [];
    b.model.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (m.userData.paint) skin.push([m.name, m.userData.paint, !!m.userData.modMap]); });
    return { name: b.name, nose: !!b.model.getObjectByName('noseArt'), skin: skin.slice(0, 6), mission: sws.game.mission?.title ?? null };
  });
  report['air-' + quality] = info;
  assert.ok(info.nose, 'nose art decal on the player bomber');
  assert.ok(info.skin.some((s) => s[1] === 'mod.eighth-extras.desert-camo'), 'mod paint on the skin');
  for (const [name, off, look] of [['nose', [9, 1.2, 7], [0, 0, 3.4]], ['side', [16, 5, -2], [0, 0, 0]], ['above', [6, 14, -8], [0, 0, 0]]]) {
    const url = await page.evaluate(([off, look]) => {
      const T = sws.game.world.playerBomber.root, cam = sws.engine.camera;
      T.updateMatrixWorld(true);
      const p = T.localToWorld(cam.position.clone().set(...off)), l = T.localToWorld(cam.position.clone().set(...look));
      cam.position.copy(p); cam.lookAt(l); cam.updateMatrixWorld(true);
      sws.game.world.playerBomber.model.visible = true;
      for (let i = 0; i < 12; i++) sws.engine.render(1 / 60);   // the same view for a few frames: temporal AA / motion blur settle
      return sws.shot(0.8);
    }, [off, look]);
    await fs.writeFile(`${out}/air-${name}-${quality}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  }
  if (quality === 'high') {
    // fly the mod mission to the end with the autoplay bot
    const res = await page.evaluate(() => sws.autoplay(sws.game.mission, 60 * 60 * 12));
    report.autoplay = String(res).slice(0, 400);
    report.debriefShown = await page.evaluate(() => !!document.querySelector('#debrief.show, .layer.show .me-rate'));
    await shot(page, 'debrief-mod-mission-en');
  }
  await page.close();
}

report.errors = errors;
await fs.writeFile(`${out}/check.json`, JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(errors, []);

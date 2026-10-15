// Phase 11 goal 07 (The Tour) browser check: the tour board, a real tour sortie (briefing, mission,
// debrief report), carried damage and repair patches in the waist, the event card, Arabic + phone
// layouts and the finale. Vite must be running on port 5327 (npx vite --port 5327 --strictPort).
// Uses Playwright's bundled headless shell only (PLAYWRIGHT_MODULE may name an existing module).
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

let chromium;
for (const c of [process.env.PLAYWRIGHT_MODULE, 'playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')].filter(Boolean)) {
  try { ({ chromium } = await import(path.isAbsolute(c) ? pathToFileURL(c).href : c)); break; } catch { /* next */ }
}
if (!chromium) throw new Error('Set PLAYWRIGHT_MODULE to an existing playwright/index.mjs');
const URL = process.env.TOUR_URL ?? 'http://127.0.0.1:5327';
const shots = 'docs/phase11/shots/07';
await fs.mkdir(shots, { recursive: true });
// PLAYWRIGHT_EXECUTABLE may name an already-installed headless shell (never the desktop Chrome app)
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE, args: ['--autoplay-policy=no-user-gesture-required', ...(process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [])] });
const errors = [], facts = {};
const shot = (page, name) => page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 70 });
const canvasShot = async (page, name) => {
  const url = await page.evaluate(() => sws.shot(0.8));
  await fs.writeFile(`${shots}/${name}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
};
async function open(lang, viewport = { width: 1280, height: 800 }, context = null) {
  const ctx = context ?? await browser.newContext({ viewport, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && /WebGLProgram|Shader Error|GL_INVALID|Uncaught|TypeError/.test(m.text())) errors.push(`${lang}: ${m.text()}`); });
  await page.addInitScript((lang) => {
    if (!sessionStorage.getItem('tour-check')) {
      sessionStorage.setItem('tour-check', '1');
      localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'high', bookends: false, analytics: false, crewRoom: false }));
      localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true, tutorialDone: true }));
    }
    localStorage.setItem('sws3d.lang', lang);
  }, lang);
  await page.goto(URL);
  await page.waitForFunction(() => window.sws?.tour && window.sws?.game, { timeout: 120000 });
  await page.evaluate(() => { sws.engine.loopOverride = () => {}; sws.game.input.lock = () => {}; });
  return { page, ctx };
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

try {
  const { page, ctx } = await open('en');
  // -- the entry point and the intro
  await page.evaluate(() => { localStorage.removeItem('sws3d.tour.v1'); sws.game.menus.hangar(); });
  assert.equal(await page.locator('#hangarHub [data-route="tour"]').count(), 1, 'Hangar → Crew & Skills shows The Tour');
  await page.locator('#hangarHub [data-route="tour"]').click();
  await page.locator('#tour [data-begin]').waitFor();
  await shot(page, 'intro-en');
  await page.locator('#tour [data-begin]').click();
  await page.locator('#tour [data-fly]').waitFor();
  await shot(page, 'board-start-en');
  assert.ok(await noOverflow(page));
  // -- fly mission 1 for real: the second target on the orders
  await page.locator('#tour [data-opt="1"]').click();
  await page.locator('#tour [data-fly]').click();
  await page.locator('#briefing .sheet').waitFor();
  facts.briefingKicker = await page.locator('#briefing .kicker').first().textContent();
  assert.match(facts.briefingKicker, /THE TOUR/);
  await shot(page, 'briefing-en');
  await page.waitForFunction(() => sws.assetsReady(), { timeout: 120000 });
  await page.locator('#briefing [data-go]').click();
  await page.waitForFunction(() => sws.game.state === 'playing', { timeout: 60000 });
  facts.mission1 = await page.evaluate(() => {
    sws.step(90, 1 / 60, true);
    const g = sws.game, a = g.tour.active;
    const programs0 = sws.engine.renderer.info.programs.length;
    sws.step(240, 1 / 60, true);
    return { id: g.mission.id, active: !!a, stage: a?.stage, factor: g.world.aiGunnerFactor, programs0, programs1: sws.engine.renderer.info.programs.length };
  });
  assert.equal(facts.mission1.id, 'tour-1-1');
  assert.ok(facts.mission1.active);
  // end it as a success and read the debrief's tour report
  await page.evaluate(() => { sws.game.director.bombsDropped = true; sws.game.finish(true, ''); for (let i = 0; i < 1500 && sws.game.state !== 'debrief'; i++) sws.step(1, 1 / 30); });
  await page.locator('#debrief [data-tour-report]').waitFor({ timeout: 30000 });
  facts.debriefReport = await page.locator('#debrief [data-tour-report]').innerText();
  assert.equal(await page.locator('#debrief [data-a="retry"]').count(), 0);
  await page.locator('#debrief [data-tour-report]').scrollIntoViewIfNeeded();
  await shot(page, 'debrief-report-en');
  await page.locator('#debrief [data-tour]').click();
  await page.locator('#tour .tour-head').waitFor();
  facts.afterFirst = await page.evaluate(() => { const s = sws.tour.state(); return { done: s.done, sorties: s.sorties, event: s.event, patches: s.ship.patches }; });
  assert.equal(facts.afterFirst.done, 1);
  if (facts.afterFirst.event) { await shot(page, 'event-en'); await page.locator('#tour [data-choice="0"]').click(); }

  // -- ten more missions, with damage, wounds and a loss: the board mid-tour
  await page.evaluate(() => {
    const dmg = { engine2: 0.3, engine3: 0.7, fuselageMid: 0.45, fuselageAft: 0.6, wingL: 0.6, tail: 0.75, nose: 0.8 };
    sws.tour.sim(6, { zones: dmg, danger: 3 });
    sws.tour.sim(1, { zones: dmg, wounded: ['ball', 'waistR'], serious: ['ball'] });
    sws.tour.sim(1, { zones: dmg, wounded: ['tail'], serious: ['tail'], success: false });
    sws.tour.sim(2, { zones: dmg, danger: 4 });
    sws.game.showTour();
  });
  facts.midTour = await page.evaluate(() => { const s = sws.tour.state(); return { done: s.done, patches: s.ship.patches, wear: s.ship.wear, crew: s.crew.map((m) => `${m.pos}:${m.last}:${m.status}:${m.missions}`), gone: s.gone.map((m) => m.last), event: s.event, morale: s.morale, fatigue: s.fatigue }; });
  await shot(page, facts.midTour.event ? 'board-event-en' : 'board-mid-en');
  if (facts.midTour.event) { await page.locator('#tour [data-choice="0"]').click(); await shot(page, 'board-mid-en'); }

  // -- the carried damage in a mission: zone strength, and the patches from the top turret,
  //    outside and in the waist (each pair: same frame and camera, patches hidden for "before")
  const pair = async (name) => {
    await page.evaluate(() => { for (let i = 0; i < 3; i++) sws.engine.render(1 / 60); });
    await canvasShot(page, `${name}-after`);
    const programs = await page.evaluate(() => {
      const p = sws.game.tour.patches, n0 = sws.engine.renderer.info.programs.length;
      p.group.visible = p.outside.visible = false;
      for (let i = 0; i < 3; i++) sws.engine.render(1 / 60);
      return [n0, sws.engine.renderer.info.programs.length];
    });
    await canvasShot(page, `${name}-before`);
    await page.evaluate(() => { const p = sws.game.tour.patches; p.group.visible = p.outside.visible = true; });
    return programs;
  };
  facts.carried = await page.evaluate(() => {
    const g = sws.game, s = sws.tour.state();
    const m = sws.tour.mission(0); m.station = 'top';
    const programs0 = sws.engine.renderer.info.programs.length;
    g.startMission(m);
    sws.step(200, 1 / 60, true);
    const st = g.gunner.state; st.yaw = st.tYaw = 2.4; st.pitch = st.tPitch = -0.12;   // aft over the right wing
    sws.step(40, 1 / 60, true);
    sws.engine.onFrame = () => {};
    const b = g.world.playerBomber;
    return { id: g.mission.id, patches: s.ship.patches, outside: g.tour.patches.outside.children.filter((q) => q.visible).length,
      zones: Object.fromEntries(b.zones.map((q) => [q.name, +(q.hp / q.maxHp).toFixed(3)])), factor: g.world.aiGunnerFactor, programs0, programs1: sws.engine.renderer.info.programs.length };
  });
  assert.ok(facts.carried.outside > 0, 'patches on the skin');
  assert.ok(facts.carried.zones.engine3 < 1, 'carried engine wear');
  facts.programsTop = await pair('top-turret-patches');
  await page.evaluate(() => {
    const g = sws.game, b = g.world.playerBomber, cam = sws.engine.camera, V = cam.position.constructor;
    g.gunner.detach();
    cam.position.copy(b.localToWorld(new V(12, 9, 8))); cam.up.set(0, 1, 0); cam.lookAt(b.localToWorld(new V(1, 0, -3))); cam.fov = 50;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  });
  facts.programsOutside = await pair('outside-patches');
  facts.waist = await page.evaluate(async () => {
    const { STATIONS } = await import('/src/world/B17Layout.ts');
    const g = sws.game, m = sws.tour.mission(0); m.station = 'waistL';
    g.startMission(m);
    sws.step(120, 1 / 60, true);
    const b = g.world.playerBomber, cam = sws.engine.camera, V = cam.position.constructor, z = STATIONS.waistL.pivot.z;
    // the visual rig's waist-interior camera
    cam.position.copy(b.localToWorld(new V(0.1, 0.45, z + 1.7))); cam.up.set(0, 1, 0); cam.lookAt(b.localToWorld(new V(-1, 0.35, z - 0.8))); cam.fov = 74;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    sws.engine.onFrame = () => {};
    return { shown: g.tour.patches.group.children.filter((q) => q.visible).length, attached: !!g.tour.patches.group.parent };
  });
  assert.ok(facts.waist.attached && facts.waist.shown > 0, 'patches hang in the waist');
  facts.programsWaist = await pair('waist-patches');
  for (const p of [facts.programsTop, facts.programsOutside, facts.programsWaist]) assert.equal(p[0], p[1], 'the patches compile nothing new');
  await page.evaluate(() => sws.game.startMenu());

  // -- the finale
  await page.evaluate(() => { sws.tour.sim(30); sws.game.showTour(); });
  await page.locator('#tour .tour-finale').waitFor();
  await shot(page, 'finale-en');
  const saved = await page.evaluate(() => localStorage.getItem('sws3d.tour.v1'));
  await ctx.close();

  // -- Arabic: a mid-tour board (desktop and phone) and the finale
  for (const [name, viewport] of [['ar', { width: 1280, height: 800 }], ['ar-phone', { width: 390, height: 844 }]]) {
    const ar = await open('ar', viewport);
    await ar.page.evaluate((saved) => {
      const s = JSON.parse(saved);
      // back to mission 12 with the same crew, ship and log
      Object.assign(s, { done: 11, complete: false, event: 'pass', report: null });
      s.crew.forEach((m) => { if (m.status === 'done') m.status = 'fit'; });
      s.crew[6].status = 'wounded'; s.crew[6].out = 2;
      localStorage.setItem('sws3d.tour.v1', JSON.stringify(s));
      sws.game.showTour();
    }, saved);
    await ar.page.locator('#tour .tour-event').waitFor();
    await shot(ar.page, `board-event-${name}`);
    assert.ok(await noOverflow(ar.page), `${name}: no horizontal scroll`);
    await ar.page.locator('#tour [data-choice="1"]').click();
    await shot(ar.page, `board-${name}`);
    assert.ok(await noOverflow(ar.page), `${name}: no horizontal scroll`);
    if (name === 'ar') {
      await ar.page.locator('#tour [data-fly]').click();
      await ar.page.locator('#briefing .sheet').waitFor();
      await shot(ar.page, 'briefing-ar');
      facts.arBriefingLatin = await ar.page.evaluate(() => [...document.querySelectorAll('#briefing .brief-text p, #briefing h2, #briefing .target')].map((p) => p.textContent).filter((t) => /[a-z]{4,}/.test(t.replace(/Sky Queen|B-17G|Second Chance|Lady Luck|Round Trip Ticket|Homeward Angel|Miss Deenethorpe|Last Ticket/g, ''))));
    }
    await ar.ctx.close();
  }
  facts.errors = errors;
  await fs.writeFile(`${shots}/check.json`, JSON.stringify(facts, null, 2));
  assert.deepEqual(errors, []);
  assert.deepEqual(facts.arBriefingLatin, []);
  console.log(JSON.stringify(facts, null, 2));
} finally { await browser.close(); }

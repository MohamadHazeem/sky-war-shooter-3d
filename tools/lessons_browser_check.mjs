// Station lessons (Phase 11 · 21): evidence shots and checks in the real game.
// Run against a dev server: npx vite --port 5199 --strictPort, then
//   node tools/lessons_browser_check.mjs [port]
// Frames are driven with sws.step (headless tabs do not run requestAnimationFrame).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const pw = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const { chromium } = pw.chromium ? pw : pw.default;
const port = process.argv[2] ?? '5199';
const shots = 'docs/phase11/shots/21-station-tutorials';
await fs.mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader'] });
const errors = [], results = {};

async function open(viewport, touch = false) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await context.route(/https:\/\/.*(googleapis|firebaseio|firestore|identitytoolkit|securetoken).*/, (r) => r.abort());
  await context.addInitScript(() => {
    if (sessionStorage.getItem('init')) return;
    sessionStorage.setItem('init', '1');
    localStorage.clear();
    localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'low', bookends: false, difficulty: 'veteran' }));
    localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true, tutorialDone: true }));
    localStorage.setItem('sws3d.lang', 'en');
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && /THREE|WebGL|shader|Lesson|Training/i.test(m.text())) errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForFunction(() => window.sws?.assetsReady?.(), { timeout: 180000 });
  await page.evaluate((touch) => {
    const g = sws.game; sws.engine.loopOverride = () => {}; g.input.lock = () => {};
    if (touch) document.body.classList.add('touch');
    g.startMenu(); sws.step(10, 1 / 60);
  }, touch);
  return { context, page };
}
const shot = async (page, name, render = true) => {
  if (render) await page.evaluate(() => { sws.step(3, 1 / 60, true); sws.game.hud.frame?.(0.05); });
  await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 70 });
};
// the lesson steps: run frames until the runner sits in the step with this id
const toStep = (page, id) => page.evaluate((id) => {
  const L = sws.game.onboarding.lessons;
  for (let i = 0; i < 4000; i++) {
    if (L.phase === 'step' && L.step?.id === id) return true;
    if (L.phase === 'step') L.skip = true;
    sws.engine.frame(1 / 60, false);
  }
  return false;
}, id);
// skip the rest of the running lesson (completes it, so the next one unlocks)
const finish = (page) => page.evaluate(() => {
  const L = sws.game.onboarding.lessons;
  for (let i = 0; i < 6000 && L.active; i++) { if (L.phase === 'step') L.skip = true; sws.engine.frame(1 / 60, false); }
});
const card = (page) => page.evaluate(() => {
  const c = document.getElementById('tutCard');
  const k = c?.querySelector('.k');
  return { text: c?.innerText ?? '', headerOneLine: k ? k.getBoundingClientRect().height < 20 : null };
});
const rows = (page) => page.evaluate(() => [...document.querySelectorAll('.tr-row')].map((r) => ({
  id: r.dataset.row, status: r.querySelector('.tr-status')?.textContent, next: r.classList.contains('primary'),
})).concat([{ meta: document.querySelector('.tr-meta')?.textContent }]));

try {
  const { context, page } = await open({ width: 1280, height: 720 });

  // 1. Training screen, first visit: every row fits 720p
  await page.evaluate(() => sws.game.onboarding.openTraining(() => sws.game.startMenu()));
  results.screenFirst = await rows(page);
  results.sheetFit = await page.evaluate(() => {
    const s = document.querySelector('.training-sheet'), last = [...document.querySelectorAll('.tr-row')].pop().getBoundingClientRect();
    return { scrollH: s.scrollHeight, clientH: s.clientHeight, lastRowBottom: Math.round(last.bottom), innerH: innerHeight };
  });
  assert.ok(results.sheetFit.lastRowBottom <= 720, 'all five rows fit 720p');
  await shot(page, 'training-screen-en', false);

  // 2. Waist: the lead pip mid-step (sight held off the pip so the step is still running)
  await page.evaluate(() => { sws.game.ui.hideAll(); sws.game.onboarding.startLesson('waist'); });
  assert.ok(await toStep(page, 'hold'));
  results.waistHold = await page.evaluate(() => {
    const g = sws.game; sws.step(75, 1 / 60);
    return { pip: g.hud.forceLeadPip, assist: g.gunner.assist, acc: g.onboarding.lessons.acc, step: g.onboarding.lessons.step.id };
  });
  assert.equal(results.waistHold.pip, true); assert.equal(results.waistHold.assist, 0); assert.equal(results.waistHold.step, 'hold');
  results.waistCard = await card(page);
  assert.ok(results.waistCard.headerOneLine, 'card header on one line');
  await shot(page, 'waist-pip-en');
  // the pip with the sight on it: the "fire at the lead" step
  assert.ok(await toStep(page, 'withPip'));
  await page.evaluate(() => sws.step(60, 1 / 60));
  await shot(page, 'waist-withpip-en');

  // 3. Finish the waist lesson (remaining steps skipped) and come back to the Training screen
  await finish(page);
  results.screenAfter = await rows(page);
  const after = Object.fromEntries(results.screenAfter.filter((r) => r.id).map((r) => [r.id, r]));
  assert.equal(after.waist.status, 'Done'); assert.equal(after.top.status, 'New'); assert.equal(after.top.next, true);
  assert.equal(after.ball.status, 'Locked'); assert.match(results.screenAfter.at(-1).meta, /1 \/ 4/);
  await shot(page, 'training-after-en', false);

  // 4. Top: convergence, a drone closing from 1150 m, rounds fired out of range counted
  await page.evaluate(() => { sws.game.ui.hideAll(); sws.game.onboarding.startLesson('top'); });
  assert.ok(await toStep(page, 'wait'));
  results.topWait = await page.evaluate(() => {
    const g = sws.game; sws.step(150, 1 / 60);
    g.input.setVirtualButtons('test', 1); sws.step(50, 1 / 60); g.input.setVirtualButtons('test', 0); sws.step(20, 1 / 60);
    const L = g.onboarding.lessons; return { wasted: L.wasted, dist: Math.round(L.range.drones[0]?.dist ?? 0) };
  });
  results.topCard = await card(page);
  assert.match(results.topCard.text, /Range \d+ m/); assert.ok(results.topWait.wasted > 0);
  await shot(page, 'top-convergence-en');
  await finish(page);

  // 5. Ball: short bursts (one long one flagged), then the forced jam card
  await page.evaluate(() => { sws.game.ui.hideAll(); sws.game.onboarding.startLesson('ball'); });
  assert.ok(await toStep(page, 'bursts'));
  results.ballBursts = await page.evaluate(() => {
    const g = sws.game, i = g.input;
    i.setVirtualButtons('test', 1); sws.step(30, 1 / 60); i.setVirtualButtons('test', 0); sws.step(30, 1 / 60);
    i.setVirtualButtons('test', 1); sws.step(90, 1 / 60); i.setVirtualButtons('test', 0); sws.step(10, 1 / 60);
    const L = g.onboarding.lessons; return { bursts: L.bursts, long: L.longBursts };
  });
  results.ballCard = await card(page);
  assert.equal(results.ballBursts.bursts, 1); assert.equal(results.ballBursts.long, 1);
  await shot(page, 'ball-bursts-en');
  assert.ok(await toStep(page, 'jam'));
  await page.evaluate(() => sws.step(40, 1 / 60));
  results.ballJam = await page.evaluate(() => ({ jam: sws.game.gunner.gunState('ball').jam }));
  results.ballJamCard = await card(page);
  assert.equal(results.ballJam.jam, true);
  await shot(page, 'ball-jam-en');
  await finish(page);

  // 6. Tail: the mask hose comes loose, the picture greys, press O
  await page.evaluate(() => { sws.game.ui.hideAll(); sws.game.onboarding.startLesson('tail'); });
  assert.ok(await toStep(page, 'hose'));
  results.tailHose = await page.evaluate(() => { const l = sws.game.gunner.survival; sws.step(420, 1 / 60); return { oxygen: l.oxygen, hypoxia: +l.hypoxia.toFixed(2) }; });
  results.tailCard = await card(page);
  assert.equal(results.tailHose.oxygen, true); assert.ok(results.tailHose.hypoxia > 0.3);
  await shot(page, 'tail-oxygen-en');
  results.tailReconnect = await page.evaluate(() => { const g = sws.game; g.input.tap('KeyO'); sws.step(2, 1 / 60); return { oxygen: g.gunner.survival.oxygen, phase: g.onboarding.lessons.phase }; });
  assert.equal(results.tailReconnect.oxygen, false);

  // 7. Arabic: the Training screen right to left
  await page.evaluate(async () => {
    sws.game.onboarding.lessons.stop(); sws.game.startMenu();
    const i18n = await import('/src/i18n/index.ts'); i18n.setLang('ar');
    sws.game.onboarding.openTraining(() => sws.game.startMenu());
  });
  results.arabic = await page.evaluate(() => ({ dir: document.documentElement.dir, title: document.querySelector('.training-sheet h2')?.textContent, meta: document.querySelector('.tr-meta')?.textContent }));
  assert.equal(results.arabic.dir, 'rtl');
  await shot(page, 'training-ar', false);
  // and an Arabic lesson card
  await page.evaluate(() => { sws.game.ui.hideAll(); sws.game.onboarding.startLesson('top'); });
  assert.ok(await toStep(page, 'wait'));
  await page.evaluate(() => sws.step(90, 1 / 60));
  results.arCard = await card(page);
  await shot(page, 'top-convergence-ar');
  await context.close();

  // 8. Phone (landscape, touch): the lesson card with the touch "Skip step" button
  const phone = await open({ width: 844, height: 390 }, true);
  await phone.page.evaluate(() => { sws.game.onboarding.startLesson('waist'); });
  assert.ok(await toStep(phone.page, 'hold'));
  await phone.page.evaluate(() => sws.step(60, 1 / 60));
  results.phoneCard = await card(phone.page);
  results.phoneSkip = await phone.page.evaluate(() => { const b = document.querySelector('#tutCard [data-skip]').getBoundingClientRect(); return { text: document.querySelector('#tutCard [data-skip]').textContent, h: b.height, right: b.right, innerW: innerWidth }; });
  assert.equal(results.phoneSkip.text, 'Skip step'); assert.ok(results.phoneSkip.h >= 44);
  await shot(phone.page, 'waist-pip-phone');
  // the touch button really skips the step
  await phone.page.tap('#tutCard [data-skip]');
  results.phoneSkipWorks = await phone.page.evaluate(() => { sws.step(1, 1 / 60); return sws.game.onboarding.lessons.phase; });
  assert.equal(results.phoneSkipWorks, 'done');
  // phone Training screen scrolls, with the ▼ hint while rows lie below
  await phone.page.evaluate(() => { sws.game.onboarding.lessons.stop(); sws.game.onboarding.openTraining(() => sws.game.startMenu()); });
  results.phoneSheet = await phone.page.evaluate(() => { const s = document.querySelector('.training-sheet'); return { scrolls: s.scrollHeight > s.clientHeight, more: s.classList.contains('more') }; });
  await shot(phone.page, 'training-phone', false);
  await phone.context.close();
} catch (e) {
  errors.push(String(e?.stack ?? e));
} finally {
  await browser.close();
}
console.log(JSON.stringify(results, null, 1));
if (errors.length) { console.error('ERRORS', errors); process.exit(1); }

// Phase 11 goal 08 (Gunner Mastery) checks and captures. Vite must be running on port 5328:
//   npx vite --port 5328 --strictPort
//   SWS_LIVE=https://sky-war-shooter-3d.mhamadhazeem2001.workers.dev PLAYWRIGHT_MODULE=/abs/path/playwright/index.mjs \
//     PLAYWRIGHT_EXECUTABLE=/abs/path/chrome-headless-shell tools/heavy.sh node tools/mastery_ui_check.mjs
// Bundled headless shell only (never channel 'chrome'). Writes docs/phase11/shots/08/*.jpg and
// docs/phase11/shots/08/check.json: a real gunner mission flown by the autoplay bot must book
// kills, rounds fired and hits per station; the debrief shows the mastery report; the screen's
// five tabs render in English and Arabic, at desktop and phone size, without horizontal scroll.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const URL0 = process.env.SWS_URL ?? 'http://127.0.0.1:5328';
const out = 'docs/phase11/shots/08';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE, args: ['--autoplay-policy=no-user-gesture-required', ...(process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [])] });
const errors = [], report = {};
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 70 });

async function open(lang, viewport) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && /Uncaught|TypeError|ReferenceError|WebGLProgram/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript((lang) => {
    localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'low', bookends: false, analytics: false }));
    localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true, tutorialDone: true }));
    localStorage.setItem('sws3d.lang', lang);
  }, lang);
  await page.goto(URL0);
  await page.waitForFunction(() => window.sws?.autoplay && window.sws.game?.mastery, { timeout: 180000 });
  await page.evaluate(() => { sws.engine.loopOverride = () => {}; sws.game.input.lock = () => {}; });
  return page;
}

const noHScroll = (page) => page.evaluate(() => {
  const s = document.querySelector('#mastery .menu-sheet');
  return document.documentElement.scrollWidth <= innerWidth && (!s || s.scrollWidth <= s.clientWidth + 1);
});

// A career that has flown a while: commits that mirror real missions (the bot run below adds a real one)
const seed = (page) => page.evaluate(() => {
  const g = sws.game, b = g.mastery.book;
  const t = (st, kills, o = {}) => ({ stations: { [st]: { kills, shots: kills * 32, hits: kills * 9, time: kills * 22, deflection: 0, aces: 0, long: 0, heavy: 0, clean: 0, xp: kills * 10, ...o } }, huntPoints: kills * 14, huntKills: kills, win: true });
  b.commit(t('ball', 160, { deflection: 41, aces: 6, long: 12, heavy: 18, clean: 5, xp: 160 * 10 + 41 * 10 + 6 * 25 + 120 + 90 }), g.prog);
  b.commit(t('waistL', 70, { deflection: 14, long: 4, heavy: 7, clean: 2 }), g.prog);
  b.commit(t('top', 34, { deflection: 9, aces: 1 }), g.prog);
  b.commit(t('tail', 22, { long: 8 }), g.prog);
  b.commit(t('waistR', 6), g.prog);
  g.mastery.syncSight();
});

// The same hangar view on a given server, through the title menu only (the LIVE build has no dev hooks)
async function hangarShot(url, name) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => {
    localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'low', bookends: false, analytics: false }));
    localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true, tutorialDone: true }));
    localStorage.setItem('sws3d.lang', 'en');
  });
  await page.goto(url);
  await page.locator('#title [data-a="hangar"]').click({ timeout: 180000 });
  await page.locator('#hangarHub [data-tab="crew"]').waitFor();
  await page.waitForTimeout(500);
  await shot(page, name);
  await page.close();
}

try {
  // ---- 0. quality gate: the hangar on LIVE main and on this branch ----
  if (process.env.SWS_LIVE) await hangarShot(process.env.SWS_LIVE, 'before-live-hangar-crew');
  await hangarShot(URL0, 'after-hangar-crew');

  // ---- 1. a real gunner mission: per-station shots / hits / kills ----
  const page = await open('en', { width: 1280, height: 800 });
  const run = await page.evaluate(() => {
    const g = sws.game, before = JSON.parse(JSON.stringify(g.mastery.book.d.stations));
    const res = sws.autoplay(sws.CAMPAIGN[0], 9000, { skill: 0 });
    const m = sws.autoplayMetrics?.() ?? null;
    return { res: String(res).slice(0, 200), before, after: g.mastery.book.d.stations, last: g.mastery.last, state: g.state, stats: g.world.stats, m };
  });
  const sum = (o, k) => Object.values(o).reduce((a, r) => a + r[k], 0);
  report.mission = { result: run.res, state: run.state, worldStats: run.stats,
    shots: sum(run.after, 'shots') - sum(run.before, 'shots'), hits: sum(run.after, 'hits') - sum(run.before, 'hits'), kills: sum(run.after, 'kills') - sum(run.before, 'kills'),
    stations: run.last?.stations?.map((s) => ({ id: s.id, gained: s.gained, rank: s.after.rank, ...s.tally })), hunt: run.last?.hunt, rewards: run.last?.rewards?.map((r) => r.text) };
  assert.equal(run.state, 'debrief', 'the bot mission reaches the debrief');
  assert.ok(report.mission.shots > 0 && report.mission.shots === run.stats.shots, `rounds fired booked per station (${report.mission.shots} vs ${run.stats.shots})`);
  assert.ok(report.mission.hits > 0 && report.mission.hits === run.stats.hits, 'hits booked per station');
  assert.equal(report.mission.kills, run.stats.kills, 'kills booked per station');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#debrief .ms-debrief').count(), 1, 'debrief mastery report');
  await page.locator('#debrief .ms-debrief').scrollIntoViewIfNeeded();
  await shot(page, 'debrief-mastery');
  await page.locator('#debrief .ms-debrief').screenshot({ path: `${out}/debrief-mastery-section.jpg`, type: 'jpeg', quality: 75 });

  // ---- 2. the screen, every tab (English, desktop) ----
  await seed(page);
  await page.evaluate(() => sws.game.menus.hangar('crew'));
  await shot(page, 'hangar-crew-tab');
  await page.evaluate(() => sws.game.mastery.open(() => sws.game.startMenu()));
  for (const tab of ['stations', 'challenges', 'hunt', 'locker', 'stats']) {
    await page.locator(`#mastery [data-tab="${tab}"]`).click();
    await page.waitForTimeout(150);
    assert.ok(await noHScroll(page), `no horizontal scroll: ${tab}`);
    await shot(page, `en-${tab}`);
  }
  // equip a sight and a patch from the Locker; the HUD and the ball turret pick it up
  await page.locator('#mastery [data-tab="locker"]').click();
  await page.locator('#mastery [data-equip="sight:chevron"]').click();
  await page.locator('#mastery [data-equip="patch:ballbearing"]').click();
  report.locker = await page.evaluate(() => ({ sight: sws.game.mastery.book.d.sight, patch: sws.game.mastery.book.d.patch }));
  assert.deepEqual(report.locker, { sight: 'chevron', patch: 'ballbearing' });
  await shot(page, 'en-locker-equipped');
  // in flight: the waist hip reticle and the ball turret's reflector
  await page.evaluate(() => { sws.autoplay(sws.CAMPAIGN[0], 40, { skill: 0 }); });
  for (const st of ['waistL', 'ball']) {
    report[`flight-${st}`] = await page.evaluate((st) => {
      const g = sws.game;
      g.gunner.requestStation(st);
      for (let i = 0; i < 30; i++) sws.step(10, 1 / 60, true);
      document.querySelectorAll('#achv-toasts, #hudToast').forEach((e) => e.remove());
      g.ui.fade?.(false);
      return { state: g.state, station: g.world.playerStation?.id };
    }, st);
    await page.waitForTimeout(1200);
    await shot(page, `flight-sight-${st}`);
  }
  await page.close();

  // ---- 3. Arabic, desktop and phone ----
  const ar = await open('ar', { width: 1280, height: 800 });
  await seed(ar);
  await ar.evaluate(() => sws.game.mastery.open(() => sws.game.startMenu()));
  for (const tab of ['stations', 'hunt', 'locker']) { await ar.locator(`#mastery [data-tab="${tab}"]`).click(); await ar.waitForTimeout(150); await shot(ar, `ar-${tab}`); }
  report.arabicDir = await ar.evaluate(() => document.documentElement.dir);
  assert.equal(report.arabicDir, 'rtl');
  await ar.setViewportSize({ width: 390, height: 844 });
  for (const tab of ['stations', 'stats', 'locker']) {
    await ar.locator(`#mastery [data-tab="${tab}"]`).click(); await ar.waitForTimeout(150);
    assert.ok(await noHScroll(ar), `phone, no horizontal scroll: ${tab}`);
    await shot(ar, `ar-phone-${tab}`);
  }
  await ar.close();
  const ph = await open('en', { width: 390, height: 844 });
  await seed(ph);
  await ph.evaluate(() => sws.game.mastery.open(() => sws.game.startMenu()));
  for (const tab of ['stations', 'challenges', 'hunt']) { await ph.locator(`#mastery [data-tab="${tab}"]`).click(); await ph.waitForTimeout(150); assert.ok(await noHScroll(ph), `phone: ${tab}`); await shot(ph, `en-phone-${tab}`); }
  await ph.close();
} finally {
  report.errors = errors;
  await fs.writeFile(`${out}/check.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
assert.deepEqual(errors, [], 'no page errors');
console.log(JSON.stringify(report, null, 2));

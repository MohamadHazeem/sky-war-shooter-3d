// Adaptive difficulty (Phase 11 · 29): Settings switch and debrief tile, English / Arabic, desktop / phone.
//   npx vite --port 5429 --strictPort &   node tools/adaptive_ui_shots.mjs [--port 5429]
// Playwright's bundled headless shell only (never channel 'chrome').
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const i = process.argv.indexOf('--port'), PORT = i > 0 ? process.argv[i + 1] : '5429';
const OUT = 'docs/phase11/shots/29';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [], checks = [];
try {
  for (const [name, vp, lang] of [['desktop-en', { width: 1280, height: 720 }, 'en'], ['desktop-ar', { width: 1280, height: 720 }, 'ar'], ['phone-ar', { width: 390, height: 844 }, 'ar']]) {
    const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
    await context.route(/https:\/\/.*(googleapis|firebaseio|firestore|identitytoolkit|securetoken).*/, (r) => r.abort());
    await context.addInitScript((lang) => {
      localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'low', bookends: false, crewRoom: false, difficulty: 'veteran' }));
      localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true }));
      localStorage.setItem('sws3d.lang', lang);
    }, lang);
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await page.goto(`http://127.0.0.1:${PORT}/`, { timeout: 180000 });
    await page.waitForFunction(() => window.sws?.assetsReady?.(), null, { timeout: 180000 });
    await page.evaluate((lang) => { window.sws.engine.loopOverride = () => {}; window.sws.setLang?.(lang); window.sws.game.ui.openSettings(() => {}); }, lang);
    if (lang === 'ar') await page.locator('#settings [data-lang]').selectOption('ar');
    await page.locator('#settings [data-k="adaptive"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/settings-${name}.jpg`, type: 'jpeg', quality: 70 });
    // the switch writes the setting and the director follows it
    await page.locator('#settings [data-k="adaptive"]').selectOption('false');
    checks.push({ name, off: await page.evaluate(() => window.sws.game.settings.adaptive === false && window.sws.game.adaptive.enabled === false) });
    await page.locator('#settings [data-k="adaptive"]').selectOption('true');
    checks.push({ name, on: await page.evaluate(() => window.sws.game.settings.adaptive === true && window.sws.game.adaptive.enabled === true) });
    // debrief tile (the real debrief screen with a mission's numbers)
    await page.evaluate(() => {
      document.querySelector('#settings').classList.remove('show');
      window.sws.game.ui.debrief({ success: true, title: 'Baptism of Fire', reason: "Emden's U-boat pens took a beating. Good shooting, gunner — you'll make a veteran yet.", kills: 14, accuracy: 0.21, bombersLost: 2, bombersTotal: 12, time: 372, score: 4210, medals: [], nextAvailable: true, rounds: 2410, hits: 506, bestStreak: 3, closestKill: 240, merit: 4210, adaptive: 'eased' }, { next() {}, retry() {}, menu() {}, armory() {} });
    });
    await page.screenshot({ path: `${OUT}/debrief-${name}.jpg`, type: 'jpeg', quality: 70 });
    checks.push({ name, tile: await page.locator('#debrief .stats').innerText() });
    await context.close();
  }
} finally { await browser.close(); }
await fs.writeFile(`${OUT}/ui-checks.json`, JSON.stringify({ checks, errors }, null, 1));
console.log(JSON.stringify({ checks, errors }, null, 1));

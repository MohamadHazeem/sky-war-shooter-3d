// Save system 2.0 (Phase 11 · 36): recovery screen at boot for a damaged profile (English / Arabic,
// desktop / phone), repair and continue, the Settings → Cloud save row, export and import.
//   npx vite --port 5236 --strictPort &   node tools/save_system_shots.mjs [--port 5236]
// (PLAYWRIGHT_MODULE / PLAYWRIGHT_EXECUTABLE may point at an npx playwright and its bundled headless shell)
// Playwright's bundled headless shell only (never channel 'chrome').
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const i = process.argv.indexOf('--port'), PORT = i > 0 ? process.argv[i + 1] : '5236';
const URL = `http://127.0.0.1:${PORT}/`;
const OUT = 'docs/phase11/shots/36';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE || undefined });
const errors = [], checks = {};
const shot = (page, n) => page.screenshot({ path: `${OUT}/${n}.jpg`, type: 'jpeg', quality: 72 });

async function context(vp, lang) {
  const c = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, acceptDownloads: true });
  await c.route(/https:\/\/.*(googleapis|firebaseio|firestore|identitytoolkit|securetoken).*/, (r) => r.abort());
  // seed a pre-2.0 profile once (init scripts run again on every reload)
  await c.addInitScript((lang) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'low', bookends: false, crewRoom: false, difficulty: 'veteran' }));
    localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true }));
    localStorage.setItem('sws3d.lang', lang);
    localStorage.setItem('sws3d.career.v1', JSON.stringify({ v: 1, serial: '31 234 567', enlisted: 1, xp: 4200, missions: 12, kills: 61 }));
    localStorage.setItem('sws3d.progress.v1', JSON.stringify({ unlocked: 5, medals: {}, best: {}, survival: [], layout: 2 }));
  }, lang);
  const page = await c.newPage();
  page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));
  return { c, page };
}
const menuUp = (page) => page.waitForFunction(() => window.sws?.assetsReady?.(), null, { timeout: 180000 });

try {
  for (const [name, vp, lang] of [['desktop-en', { width: 1280, height: 720 }, 'en'], ['desktop-ar', { width: 1280, height: 720 }, 'ar'], ['phone-ar', { width: 390, height: 844 }, 'ar']]) {
    const { c, page } = await context(vp, lang);
    await page.goto(URL, { timeout: 180000 });
    await menuUp(page);
    const first = await page.evaluate(() => ({ meta: JSON.parse(localStorage.getItem('sws3d.save.meta')), backups: JSON.parse(localStorage.getItem('swsbak.index') ?? '[]').length }));
    // a mission later: progress moves, a mission-end backup is made
    await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('sws3d.career.v1')); c.xp += 650; c.missions += 1; localStorage.setItem('sws3d.career.v1', JSON.stringify(c)); });
    await page.evaluate(async () => { const m = await import('/src/game/SaveSystem.ts'); m.makeBackup(localStorage, 'mission', Date.now()); });
    // then the career store gets cut short (a crash mid-write)
    await page.evaluate(() => localStorage.setItem('sws3d.career.v1', '{"v":1,"serial":"31 234 567","xp":48'));
    await page.reload();
    await page.waitForSelector('#saveRecovery li', { timeout: 120000 });
    await page.waitForTimeout(400);
    await shot(page, `recovery-damaged-${name}`);
    const listed = await page.locator('#saveRecovery [data-restore]').count();
    // repair, then continue to the menu
    await page.locator('#saveRecovery [data-repair]').click();
    await page.waitForTimeout(200);
    if (name === 'desktop-en') await shot(page, `recovery-repaired-${name}`);
    await page.locator('#saveRecovery [data-continue]').click();
    await menuUp(page);
    const after = await page.evaluate(() => ({ career: JSON.parse(localStorage.getItem('sws3d.career.v1') ?? 'null'), undo: !!localStorage.getItem('swsbak.undo'), screen: !!document.getElementById('saveRecovery') }));
    checks[name] = { firstBoot: first, backupsListed: listed, careerRebuilt: !!after.career && after.career.xp === 0, undoKept: after.undo, screenClosed: !after.screen };

    if (name !== 'phone-ar') {
      // restore the mission-end backup from the recovery screen (Settings → Backups and recovery)
      await page.evaluate(() => { window.sws.engine.loopOverride = () => {}; window.sws.game.ui.openSettings(() => {}); });
      await page.locator('#settings .settings-advanced summary').click();
      await page.locator('#settings .cloud').scrollIntoViewIfNeeded();
      await shot(page, `settings-cloud-${name}`);
      await page.locator('#settings [data-recover]').click();
      await page.waitForSelector('#saveRecovery li');
      await shot(page, `recovery-manual-${name}`);
      if (name === 'desktop-en') {
        const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#saveRecovery [data-export]').click()]);
        const file = path.join(os.tmpdir(), `sws-profile-export-${process.pid}.json`);
        await dl.saveAs(file);
        const env = JSON.parse(await fs.readFile(file, 'utf8'));
        checks.export = { format: env.format, schema: env.schema, keys: Object.keys(env.keys).length, name: dl.suggestedFilename() };
        // restore: two taps, then the page reloads with the backup
        const mission = page.locator('#saveRecovery [data-restore]').first();
        await mission.click(); await mission.click();
        await page.waitForEvent('load', { timeout: 60000 });
        await menuUp(page);
        checks.restore = await page.evaluate(() => JSON.parse(localStorage.getItem('sws3d.career.v1')).xp);
        // import the exported file on a fresh device
        const fresh = await context(vp, 'en');
        await fresh.page.goto(URL, { timeout: 180000 });
        await menuUp(fresh.page);
        await fresh.page.evaluate(() => { window.sws.engine.loopOverride = () => {}; window.sws.game.ui.openSettings(() => {}); });
        await fresh.page.locator('#settings .settings-advanced summary').click();
        const [chooser] = await Promise.all([fresh.page.waitForEvent('filechooser'), fresh.page.locator('#settings [data-import]').click()]);
        await chooser.setFiles(file);
        await fresh.page.waitForEvent('load', { timeout: 60000 });
        await menuUp(fresh.page);
        checks.import = await fresh.page.evaluate(() => JSON.parse(localStorage.getItem('sws3d.career.v1') ?? 'null')?.xp ?? null);
        await fs.rm(file, { force: true });
        await fresh.c.close();
      }
    }
    await c.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ checks, errors }, null, 1));

// Museum and codex (Phase 11 goal 30): opens Hangar → Museum with a seeded record (some kills,
// encounters, medals and two flown operations) and saves the aircraft card sections and the codex
// shelves for each language and size.
//   npx vite --port 5330 --strictPort &   then
//   SIZES=1280x720,844x390 LANGS=en,ar node tools/museum_check.mjs docs/phase11/shots/30
// Uses an installed Playwright (PLAYWRIGHT_MODULE), headless shell only.
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const out = process.argv[2], url = process.argv[3] ?? 'http://127.0.0.1:5330';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sizes = (process.env.SIZES ?? '1280x720,844x390').split(',').map((s) => s.split('x').map(Number));
const langs = (process.env.LANGS ?? 'en,ar').split(',');
const errors = [], log = [];
const career = { v: 1, serial: '31 234 567', enlisted: 1, xp: 900, missions: 6, wins: 4, deaths: 0, kills: 23, killsByType: { fw190: 12, bf109: 4, me262: 1 },
  killsByRole: { gunner: 23, pilot: 0 }, killsByStation: {}, shots: 0, hits: 0, seconds: 0, bestBombing: 0, bestStreak: 0, bosses: 0, bombersSaved: 0, bombersLost: 0,
  medals: { 'Air Medal': 4, 'Purple Heart': 1, 'Distinguished Flying Cross': 1 }, cosmetics: [], overdrives: 0, campaignWins: ['m1', 'm2'], bestSurvivalRound: 0,
  dailyDone: 0, dailyPerfectDays: 0, dailyRuns: 0, dailyBest: {} };
const museum = { seen: { fw190: 5, bf109: 3, me262: 1, p51d: 2, p47d: 4, spitfire9: 1, bf110: 1 }, known: { bf109: 3 } };
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 70 });
try {
  for (const lang of langs) for (const [width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 900 });
    await context.route(/https:\/\/(?!(?:fonts\.googleapis\.com|fonts\.gstatic\.com)\/).*(googleapis|firebaseio|firestore|identitytoolkit|securetoken).*/, (r) => r.abort());
    await context.addInitScript(({ lang, career, museum }) => {
      localStorage.setItem('sws3d.lang', lang);
      localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'low', bookends: false }));
      localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true, tutorialDone: true }));
      localStorage.setItem('sws3d.career.v1', JSON.stringify(career));
      localStorage.setItem('sws3d.museum.v1', JSON.stringify(museum));
    }, { lang, career, museum });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.sws?.assetsReady?.(), null, { timeout: 180000 });
    await page.evaluate(() => document.fonts.ready);
    const tag = `${lang}-${width}x${height}`;
    const ready = (id) => page.waitForFunction((id) => { const s = sws.game.extras.gallery.state; return s.ready && s.shown === id; }, id, { timeout: 120000 });
    await page.evaluate(() => sws.game.extras.openGallery('fw190'));
    await ready('fw190');
    await page.waitForTimeout(500);
    await shot(page, `specs-fw190-${tag}`);
    for (const sec of ['history', 'facts']) { await page.evaluate((s) => sws.game.extras.gallery.section(s), sec); await page.waitForTimeout(250); await shot(page, `${sec}-fw190-${tag}`); }
    // the facts were read: no "new" mark on the Facts tab or on the list entry while they are shown
    const factsFresh = await page.evaluate(() => !!document.querySelector('#acGallery .ag-sec .fresh, #acGallery .ag-list [data-id="fw190"].fresh'));
    await page.evaluate(() => { const g = sws.game.extras.gallery; g.select('p47d'); g.section('crew'); });
    await ready('p47d');
    await page.waitForTimeout(500);
    await shot(page, `crew-p47d-${tag}`);
    await page.evaluate(() => { const g = sws.game.extras.gallery; g.select('b17'); g.section('crew'); });
    await ready('b17');
    await page.waitForTimeout(500);
    await shot(page, `crew-b17-${tag}`);
    await page.evaluate(() => { const g = sws.game.extras.gallery; g.select('spitfire9'); g.section('specs'); });
    await ready('spitfire9');
    await page.waitForTimeout(500);
    await shot(page, `specs-spitfire-${tag}`);
    const spitfire = await page.evaluate(() => { const c = document.querySelector('#acGallery .ag-card'); return { header: c.querySelector('.ag-k').textContent, more: c.classList.contains('more') }; });
    if (spitfire.more) {   // the scroll hint goes away at the bottom of the card
      await page.evaluate(() => { const c = document.querySelector('#acGallery .ag-card'); c.scrollTop = c.scrollHeight; });
      await page.waitForTimeout(150);
      spitfire.moreAtEnd = await page.evaluate(() => document.querySelector('#acGallery .ag-card').classList.contains('more'));
      await shot(page, `specs-spitfire-scrolled-${tag}`);
    }
    await page.evaluate(() => document.querySelector('#acGallery [data-tab="codex"]').click());
    await page.waitForTimeout(250);
    await shot(page, `codex-crew-${tag}`);
    for (const shelf of ['medals', 'ops']) {
      await page.evaluate((s) => document.querySelector(`#acGallery [data-shelf="${s}"]`).click(), shelf);
      if (shelf === 'ops') await page.evaluate(() => document.querySelectorAll('#acGallery [data-entry]')[1].click());
      await page.waitForTimeout(250);
      await shot(page, `codex-${shelf}-${tag}`);
    }
    // a locked operation
    await page.evaluate(() => document.querySelectorAll('#acGallery [data-entry]')[4].click());
    await page.waitForTimeout(150);
    await shot(page, `codex-ops-locked-${tag}`);
    log.push({ tag, factsFresh, spitfire, state: await page.evaluate(() => sws.game.extras.gallery.state), overflowX: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ log, errors }, null, 1));

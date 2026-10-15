// Limping home (Phase 11 goal 12): the return-leg vote card next to the live HUD. For each language, size and HUD
// detail it starts the Bremen leg (two engines out, holed tank), adds kill-feed lines, measures sws.hudOverlaps()
// and saves the card before and after the gunner's vote.
//   npx vite --port 5312 --strictPort &   then
//   SIZES=1280x720,1024x500 LANGS=en,ar DETAILS=standard,full TAG=desktop node tools/limping_home_card_check.mjs docs/phase11/shots/12/after
// Sizes under 900 px wide are run as touch devices. Uses an installed Playwright (PLAYWRIGHT_MODULE), headless shell only.
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const out = process.argv[2], url = process.argv[3] ?? 'http://127.0.0.1:5312';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [], errors = [];
const sizes = (process.env.SIZES ?? '1280x720,1024x500,844x390,667x375').split(',').map((s) => s.split('x').map(Number));
const langs = (process.env.LANGS ?? 'en,ar').split(',');
const details = (process.env.DETAILS ?? 'standard,full').split(',');
try {
  for (const lang of langs) for (const [width, height] of sizes) {
    const touch = width < 900;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: false });
    await context.route(/https:\/\/(?!(?:fonts\.googleapis\.com|fonts\.gstatic\.com)\/).*(googleapis|firebaseio|firestore|identitytoolkit|securetoken).*/, (r) => r.abort());
    await context.addInitScript(({ lang }) => {
      localStorage.setItem('sws3d.lang', lang);
      localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'low', bookends: false }));
      localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true }));
      let seed = 42; Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    }, { lang });
    const page = await context.newPage(); page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.sws?.assetsReady() && sws.hudOverlaps, null, { timeout: 180000 });
    await page.evaluate(() => { sws.engine.loopOverride = () => {}; sws.game.input.lock = () => {}; });
    await page.evaluate(() => document.fonts.ready);
    for (const detail of details) {
      const info = await page.evaluate((detail) => {
        const g = sws.game; g.settings.hudDetail = detail; g.applySettings();
        g.limping.reset(); g.endResult = null;
        if (g.state === 'playing') g.startMenu();
        const lh = sws.limp(2, true, 1);   // Bremen: two engines out and a holed tank
        sws.step(60 * 6.5, 1 / 60, false);
        sws.step(2, 1 / 60); g.ui.fade(false);
        return { active: lh.active, fuel: lh.state.fuel, html: document.querySelector('#limpHome')?.textContent };
      }, detail);
      // kill feed entries at the moment of the shot (they expire on a real-time timer)
      await page.evaluate(() => { for (let i = 0; i < 4; i++) sws.game.ui.feed('Fw 190 destroyed — Browning M2', 'mine'); });
      await page.waitForTimeout(300);
      const key = `${detail}-${lang}-${width}x${height}`;
      const ov = await page.evaluate(() => sws.hudOverlaps());
      const card = ov.rects.find((r) => r.id === 'limpHome');
      results.push({ key, ids: ov.rects.map((r) => r.id + ':' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(',')), info: info.active, card, limpIssues: ov.issues.filter((i) => i.includes('limpHome')), otherIssues: ov.issues.filter((i) => !i.includes('limpHome')) });
      await page.screenshot({ path: `${out}/vote-${key}.jpg`, type: 'jpeg', quality: 62 });
      if (detail === 'standard') {
        // the gunner's vote: Sweden (key 8 on this card)
        await page.evaluate(() => { const lh = sws.game.limping; lh.pick('neutral'); sws.step(3, 1 / 60); });
        await page.evaluate(() => { for (let i = 0; i < 4; i++) sws.game.ui.feed('Fw 190 destroyed — Browning M2', 'mine'); });
        await page.waitForTimeout(150);
        await page.screenshot({ path: `${out}/voted-${key}.jpg`, type: 'jpeg', quality: 62 });
        results.push({ key: key + ' voted', issues: (await page.evaluate(() => sws.hudOverlaps())).issues.filter((i) => i.includes('limpHome')) });
      }
    }
    await context.close();
  }
} finally { await browser.close(); }
await fs.writeFile(`${out}/overlaps-${process.env.TAG ?? 'run'}.json`, JSON.stringify({ results: results.map(({ ids, ...r }) => r), errors }, null, 1) + '\n');
console.log(JSON.stringify({ results, errors }, null, 1));

// Goal 32 (more languages): French, German and Spanish in the running game.
// Vite from this worktree on 5832 (`npx vite --port 5832 --strictPort`). Playwright's bundled headless
// shell only (never channel 'chrome'). Shots: docs/phase11/shots/32/.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const URL = process.env.URL ?? 'http://127.0.0.1:5832';
const shots = 'docs/phase11/shots/32';
await fs.mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [], report = [];

async function open(lang, [width, height]) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 900 });
  await context.route(/https:\/\/(?!(?:fonts\.googleapis\.com|fonts\.gstatic\.com)\/).*(googleapis|firebaseio|firestore|identitytoolkit|securetoken).*/, (r) => r.abort());
  await context.addInitScript(({ lang }) => {
    if (lang) localStorage.setItem('sws3d.lang', lang);
    localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'low', bookends: false }));
    localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true }));
    localStorage.setItem('sws3d.seenVersion', '1.0');
    let seed = 42; Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  }, { lang });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));
  await page.goto(URL);
  await page.waitForFunction(() => window.sws?.assetsReady?.() && window.sws.game, null, { timeout: 120000 });
  await page.evaluate(() => { sws.engine.loopOverride = () => {}; sws.game.input.lock = () => {}; });
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

// Text that overflows its box (clipped buttons, labels)
const overflow = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(`${sel} button, ${sel} label, ${sel} h1, ${sel} h2`)]
  .filter((e) => e.offsetParent && e.scrollWidth > e.clientWidth + 2).map((e) => e.textContent.trim().slice(0, 40)), sel);

try {
  // LANGS=en captures the English baseline of the same shots
  const LANGS = (process.env.LANGS ?? 'fr,de,es').split(',');
  for (const lang of LANGS) {
    const { context, page } = await open(lang, [1280, 720]);
    // boot waited for the language pack: the first menu is already translated
    assert.equal(await page.evaluate(() => document.documentElement.lang), lang);
    const fly = await page.locator('#title [data-a="campaign"]').innerText();
    if (lang !== 'en') assert.ok(!/Fly a Mission/.test(fly), `${lang}: title still English: ${fly}`);
    report.push({ lang, title: fly.split('\n')[0], overflowTitle: await overflow(page, '#title') });
    await page.screenshot({ path: `${shots}/title-${lang}.jpg`, type: 'jpeg', quality: 70 });

    await page.locator('#title [data-a="settings"]').click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#settings [data-lang]').inputValue(), lang);
    report.push({ lang, overflowSettings: await overflow(page, '#settings') });
    await page.screenshot({ path: `${shots}/settings-${lang}.jpg`, type: 'jpeg', quality: 70 });

    await page.evaluate(() => { sws.game.showBriefing(sws.CAMPAIGN[2], () => sws.game.startMenu()); sws.step(1, 1 / 60); });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${shots}/briefing-${lang}.jpg`, type: 'jpeg', quality: 70 });

    await page.evaluate(() => { const g = sws.game; g.startMission(sws.CAMPAIGN[2]); sws.step(900, 1 / 60); g.ui.fade(false); });
    await page.evaluate(() => { sws.game.ui.subtitle('Pilot', "Bandits, nine o'clock level!"); sws.step(1, 1 / 60, true); });
    await page.waitForTimeout(400);
    const sub = await page.locator('#subs').innerText().catch(() => '');
    report.push({ lang, subtitle: sub });
    await page.screenshot({ path: `${shots}/hud-${lang}.jpg`, type: 'jpeg', quality: 70 });
    await context.close();
  }

  // Switching from the title-screen picker (English start), then the phone layout
  if (!process.env.LANGS) {
    const { context, page } = await open('en', [1280, 720]);
    await page.locator('#title .title-lang select').selectOption('de');
    await page.waitForFunction(() => document.documentElement.lang === 'de' && !/Fly a Mission/.test(document.querySelector('#title [data-a="campaign"]').textContent));
    assert.equal(await page.evaluate(() => localStorage.getItem('sws3d.lang')), 'de');
    await page.screenshot({ path: `${shots}/title-switch-en-to-de.jpg`, type: 'jpeg', quality: 70 });
    await page.locator('#title .title-lang select').selectOption('en');
    await page.waitForFunction(() => /Fly a Mission/.test(document.querySelector('#title [data-a="campaign"]').textContent));
    await context.close();
  }
  for (const lang of LANGS) {
    const { context, page } = await open(lang, [844, 390]);
    report.push({ lang, phone: true, overflowTitle: await overflow(page, '#title') });
    await page.screenshot({ path: `${shots}/title-phone-${lang}.jpg`, type: 'jpeg', quality: 70 });
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ report, errors }, null, 1));
assert.deepEqual(errors, []);

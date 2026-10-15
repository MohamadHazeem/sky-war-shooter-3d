// Phase 11 · 14 settings shots: the gamepad hint after a remap with left-handed sticks (English),
// and the Accessibility / Touch & gamepad sections in Arabic (headers, subtitle preview).
//   node tools/a11y_settings_shots.mjs --url http://127.0.0.1:5401 --out docs/phase6/shots/phase11-14
// Start Vite separately. Uses an already installed Playwright (PLAYWRIGHT_MODULE); no downloads.
import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({ options: { url: { type: 'string', default: 'http://127.0.0.1:5401' }, out: { type: 'string', default: 'docs/phase6/shots/phase11-14' } } });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
await fs.mkdir(a.out, { recursive: true });
const errors = [];
// Fire moved to RB (Next gun position took RT), left-handed sticks on
const pad = JSON.stringify({ fire: 5, zoom: 6, reload: 2, bombsight: 3, prevGun: 4, nextGun: 7, map: 12, ping: 15, wingAttack: 14, wingProtect: 13, mustangs: 0, overdrive: 1, focus: 10, look: 11 });
const jobs = [
  { name: 'settings-gamepad-remapped', lang: 'en', access: { padSwap: true }, scrollTo: '[data-pad]' },
  { name: 'settings-ar-a11y', lang: 'ar', access: { cbMode: 'blueYellow', colorBlind: true, subSize: 'XL', oneHand: true }, scrollTo: '.a11y-sub' },
  { name: 'settings-ar-pad', lang: 'ar', access: { padSwap: true }, scrollTo: '[data-pad]' },
];
try {
  for (const job of jobs) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.route(/https:\/\/(?!(?:fonts\.googleapis\.com|fonts\.gstatic\.com)\/).*(googleapis|firebaseio|firestore|identitytoolkit|securetoken).*/, (r) => r.abort());
    await context.addInitScript(({ lang, access, pad }) => {
      localStorage.setItem('sws3d.lang', lang);
      localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'low', bookends: false, autoQuality: false, analytics: false }));
      localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true }));
      localStorage.setItem('sws3d.access.v1', JSON.stringify(access));
      localStorage.setItem('sws3d.pad.v1', pad);
      // a connected standard-mapping pad with nothing pressed (Gamepad API mock)
      const g = { id: 'Mock Xbox pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
      navigator.getGamepads = () => [g, null, null, null];
    }, { lang: job.lang, access: job.access, pad });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${job.name}: ${e.message}`));
    await page.goto(a.url);
    await page.waitForFunction(() => window.sws?.game, null, { timeout: 180000 });
    await page.evaluate(() => { window.sws.engine.loopOverride = () => {}; return document.fonts.ready; });
    await page.locator('#title [data-a="settings"]').click();
    await page.locator('#settings summary').first().click().catch(() => {});
    await page.locator(job.scrollTo).first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
    console.log(job.name, JSON.stringify(await page.locator('[data-pad]').first().textContent()));
    await page.screenshot({ path: `${a.out}/${job.name}.jpg`, type: 'jpeg', quality: 72 });
    await context.close();
  }
} finally { await browser.close(); }
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }

// Phase 11 goal 31 (historical raid mode) browser check: Hangar entry → raid list → a force →
// briefing → a real raid sortie → debrief with the you-vs-history end screen → back to the list;
// Arabic desktop and phone layouts. Vite must be running on port 5331 (npx vite --port 5331 --strictPort).
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
const URL = process.env.RAIDS_URL ?? 'http://127.0.0.1:5331';
const shots = 'docs/phase11/shots/31';
await fs.mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE, args: ['--autoplay-policy=no-user-gesture-required', ...(process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [])] });
const errors = [], facts = {};
const shot = (page, name, full = false) => page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 70, fullPage: full });
async function open(lang, viewport = { width: 1280, height: 800 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && /WebGLProgram|Shader Error|GL_INVALID|Uncaught|TypeError/.test(m.text())) errors.push(`${lang}: ${m.text()}`); });
  await page.addInitScript((lang) => {
    if (!sessionStorage.getItem('raids-check')) {
      sessionStorage.setItem('raids-check', '1');
      localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'low', bookends: false, analytics: false, crewRoom: false }));
      localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true, tutorialDone: true }));
      localStorage.removeItem('sws3d.raids.v1');
    }
    localStorage.setItem('sws3d.lang', lang);
  }, lang);
  await page.goto(URL);
  await page.waitForFunction(() => window.sws?.game, { timeout: 120000 });
  await page.addStyleTag({ content: '#hudToast { display: none !important; }' });
  await page.evaluate(() => { sws.engine.loopOverride = () => {}; sws.game.input.lock = () => {}; });
  return { page, ctx };
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

/** Fly the selected raid for real, then end it with `lost` of the group down. */
async function fly(page, lost, name) {
  await page.locator('#histRaids [data-fly]').click();
  await page.locator('#briefing .sheet').waitFor();
  const kicker = await page.locator('#briefing .kicker').first().textContent();
  await shot(page, `briefing-${name}`);
  await page.waitForFunction(() => sws.assetsReady(), { timeout: 120000 });
  await page.locator('#briefing [data-go]').click();
  await page.waitForFunction(() => sws.game.state === 'playing', { timeout: 60000 });
  const flight = await page.evaluate((lost) => {
    sws.step(240, 1 / 60, true);
    const g = sws.game;
    const out = { id: g.mission.id, date: g.mission.date, fighters: g.world.fighters?.filter?.((f) => f.alive).length ?? null };
    g.world.stats.bombersLost = lost;
    g.director.bombsDropped = true; g.finish(true, '');
    for (let i = 0; i < 1500 && g.state !== 'debrief'; i++) sws.step(1, 1 / 30);
    return out;
  }, lost);
  await page.locator('#debrief [data-hist-report]').waitFor({ timeout: 30000 });
  await page.locator('#debrief [data-hist-report]').scrollIntoViewIfNeeded();
  return { kicker, ...flight, report: await page.locator('#debrief [data-hist-report]').innerText() };
}

try {
  // -- English: entry, list, Schweinfurt force, a sortie with two losses (16 % = "as in history")
  const { page, ctx } = await open('en');
  await page.evaluate(() => sws.game.menus.hangar());
  assert.equal(await page.locator('#hangarHub [data-route="raids"]').count(), 1, 'Hangar → Crew & Skills shows Historical Raids');
  await shot(page, 'hangar-en');
  await page.locator('#hangarHub [data-route="raids"]').click();
  await page.locator('#histRaids [data-fly]').waitFor();
  await shot(page, 'list-en');
  assert.ok(await noOverflow(page));
  await page.locator('#histRaids [data-force="1"]').click();
  facts.force = await page.locator('#histRaids [data-detail]').innerText();
  assert.match(facts.force, /Ball-bearing plants, Schweinfurt/);
  facts.sr = await fly(page, 2, 'sr-en');
  assert.match(facts.sr.kicker, /HISTORICAL RAID/);
  assert.equal(facts.sr.id, 'hist-sr-1');
  assert.match(facts.sr.report, /As in history/i);
  assert.match(facts.sr.report, /60\/376/);
  await shot(page, 'debrief-sr-en');
  await page.locator('#debrief [data-hist]').click();
  await page.locator('#histRaids [data-fly]').waitFor();
  facts.listAfter = await page.locator('#histRaids [data-raid="0"]').innerText();
  assert.match(facts.listAfter, /Your best: 2 of 12 lost/i);
  // -- Black Thursday with no losses: better than history
  await page.locator('#histRaids [data-raid="1"]').click();
  facts.bt = await fly(page, 0, 'bt-en');
  assert.match(facts.bt.report, /Better than history/i);
  assert.match(facts.bt.report, /17 bombers were wrecked/i);
  await shot(page, 'debrief-bt-en');
  facts.records = await page.evaluate(() => JSON.parse(localStorage.getItem('sws3d.raids.v1')));
  await ctx.close();

  // -- Arabic desktop: list and a Berlin debrief
  const ar = await open('ar');
  await ar.page.evaluate(() => sws.game.showHistoricalRaids());
  await ar.page.locator('#histRaids [data-fly]').waitFor();
  await ar.page.locator('#histRaids [data-raid="3"]').click();
  await shot(ar.page, 'list-ar');
  assert.ok(await noOverflow(ar.page));
  facts.listArLatin = await ar.page.locator('#histRaids .hist').evaluate((el) => (el.innerText.match(/[A-Za-z]{3,}/g) ?? []));
  facts.bn = await fly(ar.page, 3, 'bn-ar');
  await shot(ar.page, 'debrief-bn-ar');
  await ar.ctx.close();

  // -- Arabic phone
  const ph = await open('ar', { width: 390, height: 844 });
  await ph.page.evaluate(() => sws.game.showHistoricalRaids());
  await ph.page.locator('#histRaids [data-fly]').waitFor();
  await shot(ph.page, 'list-ar-phone', true);
  facts.phoneOverflow = !(await noOverflow(ph.page));
  assert.equal(facts.phoneOverflow, false, 'no horizontal scroll on the phone');
  await ph.ctx.close();
} finally {
  facts.errors = errors;
  await fs.writeFile(`${shots}/check.json`, JSON.stringify(facts, null, 2));
  await browser.close();
}
assert.deepEqual(errors, [], 'no page errors');
console.log('historical raids browser check: OK');

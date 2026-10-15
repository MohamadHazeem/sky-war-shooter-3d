// Phase 11 goal 27 (mission editor and sharing) checks and captures. Vite must be running on port 5327:
//   npx vite --port 5327 --strictPort
//   PLAYWRIGHT_MODULE=/abs/path/playwright/index.mjs PLAYWRIGHT_EXECUTABLE=/abs/path/chrome-headless-shell \
//     tools/heavy.sh node tools/mission_editor_check.mjs
// Bundled headless shell only (never channel 'chrome'). Writes docs/phase11/shots/27/*.jpg and check.json:
// a ?mission= link opens the shared card; the mission it builds is flown to the debrief by the autoplay
// bot with only the editor's enemy types spawning; the debrief rating lands in the library; the editor,
// the library tab and a damaged link render in English and Arabic, at desktop and phone size.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const URL0 = process.env.SWS_URL ?? 'http://127.0.0.1:5327';
const out = 'docs/phase11/shots/27';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE, args: ['--autoplay-policy=no-user-gesture-required', ...(process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [])] });
const errors = [], report = {};
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 70, timeout: 120000 });

// the mission a friend shares: Me 262s and Me 163s only, dusk, heavy flak
const SPEC = {
  name: 'Jet Hunt', target: 6, route: 'short', mood: 'dusk', sunEl: 6, station: 'tail', bombers: 9, skill: 'recruit', escorts: 'late', flak: 2,
  waves: [
    { leg: 'in', from: 'rear', count: 3, types: ['me262'] },
    { leg: 'target', from: 'high', count: 2, types: ['me163'] },
    { leg: 'home', from: 'mixed', count: 3, types: ['me262', 'me163'] },
  ],
};

async function open(lang, viewport, query = '') {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && /Uncaught|TypeError|ReferenceError|WebGLProgram/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript((lang) => {
    localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'low', bookends: false, analytics: false }));
    localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true, tutorialDone: true }));
    localStorage.setItem('sws3d.lang', lang);
  }, lang);
  await page.goto(URL0 + '/' + query);
  await page.waitForFunction(() => window.sws?.autoplay && window.sws.game, { timeout: 180000 });
  await page.evaluate(() => { sws.engine.loopOverride = () => {}; sws.game.input.lock = () => {}; });
  return page;
}
const noHScroll = (page, sel) => page.evaluate((sel) => {
  const s = document.querySelector(sel);
  return document.documentElement.scrollWidth <= innerWidth && (!s || s.scrollWidth <= s.clientWidth + 1);
}, sel);
const codeOf = (page, spec) => page.evaluate(async (spec) => (await import('/src/game/MissionEditor.ts')).encodeMission(spec), spec);

// ---- 1. a shared link: the card, the briefing, the flight, the debrief rating ----
{
  const probe = await open('en', { width: 1280, height: 800 });
  const code = await codeOf(probe, SPEC);
  await probe.close();
  report.code = code;
  const page = await open('en', { width: 1280, height: 800 }, `?mission=${code}`);
  await page.locator('#me-shared.show [data-start]').waitFor({ timeout: 30000 });
  assert.ok(!(await page.evaluate(() => location.search.includes('mission='))), 'the link is consumed (a reload does not open it again)');
  await page.waitForTimeout(400);
  await shot(page, 'shared-card-en');
  await page.locator('#me-shared [data-start]').click();
  await page.locator('#briefing.show').waitFor();
  await page.waitForTimeout(400);
  await shot(page, 'briefing-en');
  // fly it with the autoplay bot; record every enemy type that spawns
  const flight = await page.evaluate(async (spec) => {
    const ME = await import('/src/game/MissionEditor.ts');
    const m = ME.buildUserMission(spec);
    const w = sws.game.world, types = {};
    const spawn = w.spawnEnemy.bind(w);
    w.spawnEnemy = (...a) => { const f = spawn(...a); types[f.enemyType] = (types[f.enemyType] ?? 0) + 1; return f; };
    const res = sws.autoplay(m, 30000, { skill: 0 });
    w.spawnEnemy = spawn;
    return { res, types, state: sws.game.state, flakMax: m.flak?.intensity, bombsAway: m.bombsAway, waves: m.waves.length };
  }, SPEC);
  report.flight = flight;
  assert.equal(flight.state, 'debrief', 'the mission flies to the debrief');
  assert.deepEqual(Object.keys(flight.types).sort(), ['me163', 'me262'], `only the editor's types spawn: ${JSON.stringify(flight.types)}`);
  await page.locator('#debrief .me-rate').waitFor();
  await page.locator('#debrief .me-rate [data-star="4"]').click();
  await page.evaluate(() => document.querySelector('#debrief .me-rate')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  await shot(page, 'debrief-rating-en');
  report.library = await page.evaluate(async () => (await import('/src/game/MissionEditor.ts')).loadLibrary());
  assert.equal(report.library[0].rating, 4);
  assert.equal(report.library[0].plays, 1);
  await page.close();
}

// ---- 2. the library tab and the editor, English and Arabic, desktop and phone ----
async function editorShots(lang, viewport, tag) {
  const page = await open(lang, viewport);
  await page.evaluate(async (spec) => {
    const ME = await import('/src/game/MissionEditor.ts');
    ME.addToLibrary(ME.encodeMission(spec), false);
    ME.rateMission(ME.encodeMission(spec), 5);
    ME.addToLibrary(ME.encodeMission(ME.DEFAULT_SPEC), true);
    sws.game.menus.survival('editor');
  }, SPEC);
  await page.locator('#survival.show .me-lib').waitFor();
  await page.evaluate(() => document.querySelector('#survival details')?.setAttribute('open', ''));
  await page.evaluate(() => document.querySelector('#survival .mode-panel')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  await shot(page, `library-${tag}`);
  report[`libraryNoHScroll-${tag}`] = await noHScroll(page, '#survival .box');
  await page.locator('#survival [data-me-new]').click();
  await page.locator('#me-screen.show [data-waves]').waitFor();
  await page.locator('#me-screen [data-add]').click();
  await page.waitForTimeout(300);
  await shot(page, `editor-${tag}`);
  report[`editorNoHScroll-${tag}`] = await noHScroll(page, '#me-screen .box');
  await page.evaluate(() => document.querySelectorAll('#me-screen details').forEach((d) => d.setAttribute('open', '')));
  await page.evaluate(() => { const b = document.querySelector('#me-screen .box'); b.scrollTop = b.scrollHeight; });
  await page.waitForTimeout(300);
  await shot(page, `editor-${tag}-end`);
  report[`editorWaves-${tag}`] = await page.locator('#me-screen .me-wave').count();
  await page.close();
}
await editorShots('en', { width: 1280, height: 800 }, 'en');
await editorShots('ar', { width: 1280, height: 800 }, 'ar');
await editorShots('en', { width: 390, height: 844 }, 'phone-en');
await editorShots('ar', { width: 390, height: 844 }, 'phone-ar');

// ---- 3. Arabic shared card and a damaged link ----
{
  const page = await open('ar', { width: 1280, height: 800 }, `?mission=${report.code}`);
  await page.locator('#me-shared.show [data-start]').waitFor({ timeout: 30000 });
  await page.waitForTimeout(300);
  await shot(page, 'shared-card-ar');
  await page.close();
  const bad = report.code.slice(0, 6) + (report.code[6] === 'A' ? 'B' : 'A') + report.code.slice(7);
  const p2 = await open('en', { width: 1280, height: 800 }, `?mission=${bad}`);
  await p2.locator('#me-shared.show [data-back]').waitFor({ timeout: 30000 });
  report.damaged = await p2.locator('#me-shared .cb-note').textContent();
  await shot(p2, 'damaged-link-en');
  await p2.close();
}

report.errors = errors;
await fs.writeFile(`${out}/check.json`, JSON.stringify(report, null, 2));
await browser.close();
for (const k of Object.keys(report)) if (/NoHScroll/.test(k)) assert.ok(report[k], k);
assert.deepEqual(errors, [], 'no page errors');
console.log(JSON.stringify(report, null, 2));

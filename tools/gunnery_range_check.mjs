// Phase 11 goal 35 (Gunnery Range 2.0) browser check: Hangar entry → range screen → real drills
// flown by a scripted gunner (mouse-aim target angles + short bursts, leading like the tutor says):
// a crossing-drone drill (tutor on), the same drill again against its ghost, a towed-sleeve drill,
// free practice, and the Arabic desktop / phone layouts.
// Vite must be running: npx vite --port 5435 --strictPort. Playwright's bundled headless shell only
// (PLAYWRIGHT_MODULE may name an existing playwright/index.mjs, PLAYWRIGHT_EXECUTABLE the shell).
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
const URL = process.env.RANGE_URL ?? 'http://127.0.0.1:5435';
const shots = 'docs/phase11/shots/35';
await fs.mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE, args: ['--autoplay-policy=no-user-gesture-required', ...(process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [])] });
const errors = [], facts = {};
const shot = (page, name) => page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 72 });

async function open(lang, viewport = { width: 1280, height: 800 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && /WebGLProgram|Shader Error|GL_INVALID|Uncaught|TypeError/.test(m.text())) errors.push(`${lang}: ${m.text()}`); });
  await page.addInitScript((lang) => {
    if (!sessionStorage.getItem('range-check')) {
      sessionStorage.setItem('range-check', '1');
      localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'medium', bookends: false, analytics: false, crewRoom: false, leadPip: 'never' }));
      localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true, tutorialDone: true, missions: 5 }));
      localStorage.removeItem('sws3d.range.v1');
    }
    localStorage.setItem('sws3d.lang', lang);
  }, lang).catch(() => {});
  await page.goto(URL);
  await page.waitForFunction(() => window.sws?.game, { timeout: 120000 });
  await page.addStyleTag({ content: '#hudToast { display: none !important; }' });
  await page.evaluate(() => {
    sws.engine.loopOverride = () => {}; sws.game.input.lock = () => {};
    // a scripted gunner: eases the sight onto the tutor's lead point (plus an error) and fires short bursts
    window.__rangeBot = (frames, err = 0, stopAt = Infinity) => {
      const g = sws.game, r = g.onboarding.range, gun = g.gunner, inp = g.input, w = g.world;
      let burst = 0;
      for (let k = 0; k < frames && r.active && r.phase !== 'result' && r.t < stopAt; k++) {
        inp.locked = true; inp.buttons = 0;
        const tg = r.current, pb = w.playerBomber;
        if (tg && pb && !tg.downed && !(tg.f && !tg.f.alive)) {
          const cam = g.engine.camera.position;
          const d = tg.pos.distanceTo(cam), tof = d / 870 * 1.08;
          const rel = tg.vel.clone().sub(pb.vel);
          const p = tg.pos.clone().addScaledVector(rel, tof * (1 + err));
          p.y += 0.5 * 9.81 * tof * tof;
          const def = gun.state.def;
          const local = pb.worldToLocal(p).sub(def.pivot);
          let dy = Math.atan2(local.x, local.z) - def.rest.yaw;
          while (dy > Math.PI) dy -= 2 * Math.PI;
          while (dy < -Math.PI) dy += 2 * Math.PI;
          const pr = Math.asin(local.y / local.length()) - def.rest.pitch;
          const s = gun.state;
          s.tYaw += (dy - s.tYaw) * 0.3; s.tPitch += (pr - s.tPitch) * 0.3;
          burst = (burst + 1 / 60) % 0.8;
          if (Math.abs(dy - s.yaw) < 0.04 && Math.abs(pr - s.pitch) < 0.04 && d < 1100 && !s.overheated && burst < 0.5) inp.buttons |= 1;
        }
        sws.step(1, 1 / 60, false);
      }
      inp.buttons = 0;
      sws.step(1, 1 / 60, true);
      return { t: r.t, phase: r.phase, score: r.score, downed: r.downed, coach: r.coach };
    };
  });
  return { page, ctx };
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

async function start(page, drill) {
  await page.locator(`#gunRange [data-drill="${drill}"]`).click();
  await page.locator('#gunRange [data-fly]').click();
  await page.waitForFunction(() => sws.game.state === 'playing' && sws.game.onboarding.range.active, { timeout: 60000 });
  await page.waitForFunction(() => sws.assetsReady(), { timeout: 120000 });
}
/** Fly the rest of the drill, then wait for the range screen with its result. */
async function finish(page, err) {
  await page.evaluate((err) => { for (let i = 0; i < 40 && sws.game.onboarding.range.active; i++) window.__rangeBot(600, err); for (let i = 0; i < 400 && !document.querySelector('#gunRange.show [data-result]'); i++) sws.step(10, 1 / 60); }, err);
  await page.locator('#gunRange [data-result]').waitFor({ timeout: 30000 });
  return page.locator('#gunRange [data-result]').innerText();
}

try {
  // -- English: entry, screen, crossing drones with the lead tutor
  const { page, ctx } = await open('en');
  await page.evaluate(() => sws.game.menus.hangar('aircraft'));
  assert.equal(await page.locator('#hangarHub [data-route="range"]').count(), 1, 'Hangar → Aircraft & Armory shows the Gunnery Range');
  await shot(page, 'hangar-en');
  await page.locator('#hangarHub [data-route="range"]').click();
  await page.locator('#gunRange [data-fly]').waitFor();
  await shot(page, 'range-en');
  assert.ok(await noOverflow(page));
  await start(page, 'crossers');
  facts.intro = await page.evaluate(() => window.__rangeBot(170));
  await shot(page, 'run-intro-en');
  // into the second pass, then a frame with the tutor's lead ring on the target
  facts.mid = await page.evaluate(() => window.__rangeBot(6000, 0.25, sws.game.onboarding.range.length * 0.32));
  await shot(page, 'tutor-en');
  facts.card = await page.locator('#rangeCard').innerText();
  facts.first = await finish(page, 0);
  facts.firstRecord = await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('sws3d.range.v1')).records['waistL-crossers']; return { best: r.best, stars: r.stars, runs: r.runs, ghost: r.ghost?.yaw.length }; });
  assert.ok(facts.firstRecord.ghost > 100, 'a ghost was saved with the first best');
  await shot(page, 'result-en');

  // -- the same drill again, sloppier (too little lead), against the ghost
  await start(page, 'crossers');
  facts.ghostRun = await page.evaluate(() => window.__rangeBot(6000, -0.45, sws.game.onboarding.range.length * 0.45));
  await shot(page, 'ghost-en');
  facts.ghostCard = await page.locator('#rangeCard').innerText();
  assert.match(facts.ghostCard, /Ghost/);
  facts.second = await finish(page, -0.45);
  assert.match(facts.second, /ghost/i);
  await shot(page, 'result-ghost-en');

  // -- towed sleeve: close-up of the sleeve and tow cable with the tutor
  await start(page, 'sleeve');
  facts.sleeveMid = await page.evaluate(() => {
    const out = window.__rangeBot(6000, 0, 4 + 2.4);
    sws.game.gunner.adsK = 1; sws.step(20, 1 / 60, true);
    return out;
  });
  await shot(page, 'sleeve-en');
  facts.sleeve = await finish(page, 0);

  // -- free practice: the four choices
  await page.locator('#gunRange [data-drill="free"]').click();
  await page.locator('#gunRange [data-free="speed"]').selectOption('fast');
  await page.locator('#gunRange [data-free="angle"]').selectOption('90');
  await shot(page, 'free-en');
  facts.freeSaved = await page.evaluate(() => JSON.parse(localStorage.getItem('sws3d.range.v1')).prefs.free);
  assert.equal(facts.freeSaved.speed, 'fast');
  await ctx.close();

  // -- Arabic: the screen, a run card, the phone layout
  const ar = await open('ar');
  await ar.page.evaluate(() => sws.game.showGunneryRange());
  await ar.page.locator('#gunRange [data-fly]').waitFor();
  await shot(ar.page, 'range-ar');
  facts.arLatin = await ar.page.evaluate(() => (document.querySelector('#gunRange .rng').innerText.match(/[A-Za-z]{3,}/g) ?? []).slice(0, 10));
  await start(ar.page, 'steady');
  await ar.page.evaluate(() => window.__rangeBot(6000, 0, 9));
  await shot(ar.page, 'run-ar');
  facts.arCard = await ar.page.locator('#rangeCard').innerText();
  await ar.ctx.close();
  const phone = await open('ar', { width: 390, height: 844 });
  await phone.page.evaluate(() => sws.game.showGunneryRange());
  await phone.page.locator('#gunRange [data-fly]').waitFor();
  facts.phoneOverflow = !(await noOverflow(phone.page));
  await shot(phone.page, 'range-ar-phone');
  await phone.ctx.close();
} finally {
  facts.errors = errors;
  await fs.writeFile(`${shots}/check.json`, JSON.stringify(facts, null, 2));
  await browser.close();
}
console.log(JSON.stringify(facts, null, 2));
if (errors.length) process.exitCode = 1;

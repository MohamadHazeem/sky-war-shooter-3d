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
  await page.addStyleTag({ content: '#hudToast { display: none !important; } #fade { transition: none !important; }' });
  await page.evaluate(() => {
    sws.engine.loopOverride = () => {}; sws.game.input.lock = () => {};
    // a scripted gunner: eases the sight onto the tutor's lead point (plus an error) and fires short bursts
    window.__rangeBot = (frames, err = 0, stopAt = Infinity) => {
      const g = sws.game, r = g.onboarding.range, gun = g.gunner, inp = g.input, w = g.world;
      let burst = 0;
      for (let k = 0; k < frames && r.active && r.phase !== 'result' && r.t < stopAt; k++) {
        inp.locked = true; inp.buttons = window.__zoom ? 4 : 0;
        const tg = r.current, pb = w.playerBomber;
        if (tg && pb && !tg.downed && !(tg.f && !tg.f.alive)) {
          const cam = g.engine.camera.position;
          const d = tg.pos.distanceTo(cam);
          // the tutor's lead point (err scales the lead: -0.45 = too little), else a rough one
          let p;
          if (r.leadOn) p = tg.pos.clone().lerp(r.lead, 1 + err);
          else { const tof = d / 870 * 1.08; p = tg.pos.clone().addScaledVector(tg.vel.clone().sub(pb.vel), tof * (1 + err)); p.y += 0.5 * 9.81 * tof * tof; }
          const def = gun.state.def;
          const local = pb.worldToLocal(p).sub(def.pivot);
          let dy = Math.atan2(local.x, local.z) - def.rest.yaw;
          while (dy > Math.PI) dy -= 2 * Math.PI;
          while (dy < -Math.PI) dy += 2 * Math.PI;
          const pr = Math.asin(local.y / local.length()) - def.rest.pitch;
          const s = gun.state;
          s.tYaw += (dy - s.tYaw) * 0.3; s.tPitch += (pr - s.tPitch) * 0.3;
          burst = (burst + 1 / 60) % 0.8;
          if (!window.__hold && Math.abs(dy - s.yaw) < 0.02 && Math.abs(pr - s.pitch) < 0.02 && d < 1100 && !s.overheated && burst < 0.5) inp.buttons |= 1;
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
  // -- English: entry, screen, crossing drones with the lead tutor (RANGE_AR_ONLY=1 skips to the Arabic part)
  if (!process.env.RANGE_AR_ONLY) {
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
  facts.ghostShown = await page.evaluate(() => sws.game.onboarding.range.ghostShown);
  assert.ok(facts.ghostShown, 'the ghost marker is on screen in the ghost shot');
  await shot(page, 'ghost-en');
  facts.ghostCard = await page.locator('#rangeCard').innerText();
  assert.match(facts.ghostCard, /Ghost/);
  facts.second = await finish(page, -0.45);
  assert.match(facts.second, /ghost/i);
  await shot(page, 'result-ghost-en');

  // -- towed sleeve at the drilled range (600 m): the sleeve, cable and tow ship with the tutor,
  // then a closer framing through the ring sight (right mouse)
  await start(page, 'sleeve');
  // track without firing so the first sleeve is whole on its cable for the shot
  facts.sleeveMid = await page.evaluate(() => { window.__hold = true; const o = window.__rangeBot(6000, 0, 4 + 3); window.__hold = false; return o; });
  facts.card2 = await page.evaluate(() => { const s = getComputedStyle(document.getElementById('rangeCard')); return s.display + ' ' + s.opacity; });
  assert.equal(facts.card2, 'block 1', 'the run card is fully shown');
  // the tow ship (×8, tow-target yellow) is a readable aircraft on screen, not a speck
  facts.towPx = await page.evaluate(() => {
    const g = sws.game, f = g.onboarding.range.current.f, cam = g.engine.camera;
    const fovPx = innerHeight / (2 * Math.tan(cam.fov * Math.PI / 360));
    return { dist: Math.round(f.pos.distanceTo(cam.position)), px: Math.round(f.radius * 2 / f.pos.distanceTo(cam.position) * fovPx) };
  });
  assert.ok(facts.towPx.px >= 40, `tow ship ${facts.towPx.px} px across`);
  await shot(page, 'sleeve-en');
  await page.evaluate(() => { window.__zoom = window.__hold = true; window.__rangeBot(40, 0); window.__hold = false; });
  // aim view: the tutor's plate must sit wholly outside the physical ring sight
  facts.sleevePlate = await page.evaluate(() => ({ ...sws.game.onboarding.range.plate }));
  {
    const p = facts.sleevePlate;
    assert.ok(p.ringR > 60, 'the ring sight was found in aim view');
    const dx = p.ringX - Math.min(Math.max(p.ringX, p.x), p.x + p.w), dy = p.ringY - Math.min(Math.max(p.ringY, p.y), p.y + p.h);
    assert.ok(Math.hypot(dx, dy) >= p.ringR, 'the lead plate is clear of the ring sight');
  }
  await shot(page, 'sleeve-close-en');
  await page.evaluate(() => { window.__zoom = false; });
  facts.sleeve = await finish(page, 0);

  // -- free practice: the four choices
  await page.locator('#gunRange [data-drill="free"]').click();
  await page.locator('#gunRange [data-free="speed"][data-val="fast"]').click();
  await page.locator('#gunRange [data-free="angle"][data-val="90"]').click();
  await page.locator('#gunRange [data-free="kind"][data-val="sleeve"]').click();
  facts.freeSelects = await page.locator('#gunRange select').count();
  // every choice group keeps its chips on one row
  facts.freeRows = await page.evaluate(() => [...document.querySelectorAll('#gunRange .rng-chips')].map((c) => new Set([...c.children].map((b) => b.offsetTop)).size));
  assert.ok(facts.freeRows.every((n) => n === 1), `free-practice chip rows ${facts.freeRows}`);
  assert.equal(facts.freeSelects, 0, 'free practice uses chips, not browser selects');
  await shot(page, 'free-en');
  facts.freeSaved = await page.evaluate(() => JSON.parse(localStorage.getItem('sws3d.range.v1')).prefs.free);
  assert.equal(facts.freeSaved.speed, 'fast');
  assert.equal(facts.freeSaved.kind, 'sleeve');
  await ctx.close();
  }

  // -- Arabic: the screen, a run card, the phone layout
  const ar = await open('ar');
  await ar.page.evaluate(() => sws.game.showGunneryRange());
  await ar.page.locator('#gunRange [data-fly]').waitFor();
  await shot(ar.page, 'range-ar');
  facts.arLatin = await ar.page.evaluate(() => (document.querySelector('#gunRange .rng').innerText.match(/[A-Za-z]{3,}/g) ?? []).slice(0, 10));
  assert.deepEqual(facts.arLatin, []);
  await start(ar.page, 'steady');
  await ar.page.evaluate(() => window.__rangeBot(6000, 0, 9));
  await shot(ar.page, 'run-ar');
  facts.arCard = await ar.page.locator('#rangeCard').innerText();
  // Arabic letters join: no tracking on the card or the drill cards, Arabic-capable fonts
  facts.arSpacing = await ar.page.evaluate(() => {
    const q = (s) => [...document.querySelectorAll(s)];
    const els = [...q('#rangeCard, #rangeCard *'), ...q('#gunRange, #gunRange *')];
    return { tracked: els.filter((e) => !['normal', '0px'].includes(getComputedStyle(e).letterSpacing)).length,
      cardFont: getComputedStyle(document.querySelector('#rangeCard .k')).fontFamily };
  });
  assert.equal(facts.arSpacing.tracked, 0, 'no letter-spacing on Arabic range text');
  assert.match(facts.arSpacing.cardFont, /Arabic/);
  await ar.ctx.close();
  const phone = await open('ar', { width: 390, height: 844 });
  await phone.page.evaluate(() => sws.game.showGunneryRange());
  await phone.page.locator('#gunRange [data-fly]').waitFor();
  facts.phoneOverflow = !(await noOverflow(phone.page));
  assert.equal(facts.phoneOverflow, false);
  facts.phoneSpacing = await phone.page.evaluate(() => [...document.querySelectorAll('#gunRange, #gunRange *')].filter((e) => !['normal', '0px'].includes(getComputedStyle(e).letterSpacing)).length);
  assert.equal(facts.phoneSpacing, 0);
  await shot(phone.page, 'range-ar-phone');
  await phone.ctx.close();
} finally {
  facts.errors = errors;
  await fs.writeFile(`${shots}/${process.env.RANGE_AR_ONLY ? 'check-ar.json' : 'check.json'}`, JSON.stringify(facts, null, 2));
  await browser.close();
}
console.log(JSON.stringify(facts, null, 2));
if (errors.length) process.exitCode = 1;

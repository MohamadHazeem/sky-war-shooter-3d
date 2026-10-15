// Phase 11 · 14 in-flight proof: the gunner HUD in each colour-blind palette against bright cloud,
// and a hit on the B-17 with Reduce flashes off / on. The same script runs against main and the
// branch (only the stored preferences differ: main has a single colour-blind switch and one
// "reduce motion and flashes" switch), so both sides use the same mission, seed, camera and enemies.
//   node tools/a11y_hud_shots.mjs --url http://127.0.0.1:5401 --tree branch --out docs/phase6/shots/phase11-14/flight
// Start Vite separately. Uses an already installed Playwright (PLAYWRIGHT_MODULE); no downloads.
import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({ options: { url: { type: 'string', default: 'http://127.0.0.1:5401' }, tree: { type: 'string', default: 'branch' },
  out: { type: 'string', default: 'docs/phase6/shots/phase11-14/flight' }, quality: { type: 'string', default: 'medium' }, only: { type: 'string', default: '' } } });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
await fs.mkdir(a.out, { recursive: true });

const branch = a.tree === 'branch';
// main only knows colorBlind on/off: every palette shot of main shows its single colour-blind mode
const palettes = branch ? ['off', 'redGreen', 'blueYellow', 'contrast'] : ['off', 'redGreen'];
const jobs = [
  ...palettes.map((cb) => ({ name: `hud-${cb}`, prefs: { cbMode: cb, colorBlind: cb !== 'off', reduceMotion: false, reduceFlash: false }, hit: false })),
  ...[false, true].map((rf) => ({ name: `hit-flash-${rf ? 'reduced' : 'normal'}`, prefs: { cbMode: 'off', colorBlind: false, reduceMotion: false, reduceFlash: rf }, hit: true })),
].filter((j) => !a.only || a.only.split(',').includes(j.name));
// main: one switch covers motion and flashes, so the "reduced" shot turns it on
if (!branch) for (const j of jobs) if (j.prefs.reduceFlash) j.prefs.reduceMotion = true;

const errors = [];
try {
  for (const job of jobs) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await context.route(/https:\/\/(?!(?:fonts\.googleapis\.com|fonts\.gstatic\.com)\/).*(googleapis|firebaseio|firestore|identitytoolkit|securetoken).*/, (r) => r.abort());
    await context.addInitScript(({ prefs, quality }) => {
      localStorage.setItem('sws3d.lang', 'en');
      localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality, bookends: false, autoQuality: false, analytics: false, killcam: false, markers: true, hudDetail: 'full' }));
      localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true }));
      localStorage.setItem('sws3d.access.v1', JSON.stringify(prefs));
      let seed = 1943; Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    }, { prefs: job.prefs, quality: a.quality });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${job.name}: ${e.message}`));
    await page.goto(a.url);
    await page.waitForFunction(() => window.sws?.assetsReady?.() && window.sws.game, null, { timeout: 180000 });
    await page.evaluate(() => document.fonts.ready);
    const info = await page.evaluate(async ({ hit }) => {
      const s = window.sws, g = s.game, e = s.engine, w = g.world;
      e.loopOverride = () => {}; g.input.lock = () => {};
      const m = { ...s.survivalMission('gunner') };
      m.maxBombersLost = 99;
      // high sun over a bright cloud deck; the tail gun looks back and down onto it
      m.weather = { sunEl: 48, sunAz: 205, low: 0.75, high: 0.25, contrails: true };
      g.startMission(m); g.input.unlock();
      w.playerDamageScale = 0;
      s.step(240, 1 / 60);
      g.ui.fade(false);
      for (const f of w.activeEnemies()) f.remove = true;
      s.step(2, 1 / 60);
      // waist gun: enemies against the cloud below and the formation (friend markers) around
      g.gunner.state.yaw = -0.15; g.gunner.state.pitch = -0.12;
      s.step(30, 1 / 60);
      const cam = e.camera, dir = new cam.position.constructor(), pos = new cam.position.constructor();
      cam.getWorldDirection(dir);
      const side = new cam.position.constructor().crossVectors(dir, cam.up).normalize();
      const out = [];
      for (const [d, sx, sy] of [[420, -90, -30], [650, 120, -60], [900, -220, 10], [1200, 260, -110]]) {
        pos.copy(cam.position).addScaledVector(dir, d).addScaledVector(side, sx); pos.y += sy;
        const f = w.spawnEnemy(pos, 'beam', 0.5, false); f.lastPlayerHit = w.time; out.push(f);
      }
      // threats on other seats (dashed seat borders) and two wounded crew (dashed crew rows)
      for (const k of [-1, 1]) { pos.copy(cam.position).addScaledVector(dir, -500).addScaledVector(side, 300 * k); const f = w.spawnEnemy(pos, 'beam', 0.5, false); f.lastPlayerHit = w.time; }
      w.crew?.wounded?.add?.('tail'); w.crew?.wounded?.add?.('ball');
      s.step(6, 1 / 60);
      if (hit) {
        g.input.setVirtualButtons('shots', 1);   // firing: muzzle light on
        s.step(4, 1 / 60);
        const f = out[0];
        for (let i = 0; i < 3; i++) g.combat.onPlayerHit({ shooter: f, point: w.player.pos, bulletVel: f.vel, cannon: true });
        s.step(2, 1 / 60);
      }
      g.ui.subtitle('Pilot', "Bandits, nine o'clock level!");
      g.hud.frame(0.05);
      e.render(1 / 60);
      return { access: JSON.parse(localStorage.getItem('sws3d.access.v1')), body: document.body.className, enemies: w.activeEnemies().length,
        threatSeats: document.querySelectorAll('#hStations span.threat').length, flash: s.game.feel?.flash ?? null };
    }, { hit: job.hit });
    await page.waitForTimeout(job.hit ? 60 : 250);
    await page.screenshot({ path: `${a.out}/${a.tree}-${job.name}.jpg`, type: 'jpeg', quality: 72 });
    console.log(job.name, JSON.stringify(info));
    await context.close();
  }
} finally { await browser.close(); }
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }

// Accessibility HUD capture rig (Phase 11 goal 14): the real game page, a frozen gunner
// scene with fighters against a bright cloud deck, the full HUD (markers, seat finder, crew
// list) and fixed accessibility preferences. The same script runs against any server, so
// main and a branch are captured identically:
//   node tools/a11y_hud_rig.mjs --url http://127.0.0.1:5302 --out docs/phase11/shots/14/main --shots off,redGreen
//   node tools/a11y_hud_rig.mjs --url http://127.0.0.1:5301 --out docs/phase11/shots/14/after
// Shots: off | redGreen | blueYellow | contrast (colour-blind palettes, threat seats + wounded crew),
//        flashOn | flashOff (B-17 just hit while firing: red vignette, damage flash, muzzle light).
// Development server only (needs window.sws). Bundled headless shell, no downloads, no GPU needed
// (SwiftShader); each shot is a fresh page with a seeded Math.random.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

// an existing Playwright install (as tools/visual_rig.mjs): PLAYWRIGHT_MODULE=/abs/path/index.mjs, or the package
let chromium;
for (const c of [process.env.PLAYWRIGHT_MODULE, 'playwright'].filter(Boolean)) {
  try { ({ chromium } = await import(path.isAbsolute(c) ? pathToFileURL(c).href : c)); break; } catch { /* next */ }
}
if (!chromium) throw new Error('Set PLAYWRIGHT_MODULE to an existing playwright/index.mjs (no packages are installed)');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const url = arg('url', 'http://127.0.0.1:5301');
const out = path.resolve(arg('out', 'docs/phase11/shots/14/after'));
const ALL = ['off', 'redGreen', 'blueYellow', 'contrast', 'flashOff', 'flashOn'];
const ids = arg('shots', ALL.join(',')).split(',');
const SEED = 19431008;
const QUALITY = arg('quality', 'medium');

// prefs for main (colorBlind / one reduceMotion switch) and the branch (cbMode / reduceFlash) alike
function prefs(id) {
  const cbMode = ['redGreen', 'blueYellow', 'contrast'].includes(id) ? id : 'off';
  const calm = id === 'flashOn';
  return { colorBlind: cbMode !== 'off', cbMode, subSize: 'M', subBg: 0.55, reduceMotion: calm, reduceFlash: calm, touch: 'off', touchSens: 1 };
}

async function capture(browser, id) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([seed, access, quality]) => {
    let s = seed;
    Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    if (sessionStorage.getItem('rig')) return;
    sessionStorage.setItem('rig', '1');
    localStorage.clear();
    localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality, bookends: false, analytics: false, killcam: false, autoQuality: false, markers: true, hudDetail: 'full' }));
    localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true }));
    localStorage.setItem('sws3d.access.v1', JSON.stringify(access));
  }, [SEED, prefs(id), QUALITY]);
  await page.goto(url + '/');
  await page.waitForFunction(() => window.sws?.assetsReady?.() && window.sws.game, null, { timeout: 240000 });
  const facts = await page.evaluate(async (id) => {
    const { game: g, engine: e } = window.sws;
    e.loopOverride = () => {};            // frames are stepped below, not by requestAnimationFrame
    g.bookends.auto = true;
    g.settings.markers = true; g.settings.hudDetail = 'full';
    const m = { ...window.sws.survivalMission('gunner'), station: 'waistL', maxBombersLost: 99, specials: false, midRound: false, boss: false,
      weather: { sunEl: 46, sunAz: 150, low: 0.8, high: 0.2 } };
    g.startMission(m);
    g.input.unlock?.();
    const w = g.world;
    w.playerDamageScale = 0;
    window.sws.step(60);
    // waist gun looking a little down onto the sunlit cloud deck
    const s = g.gunner.state;
    s.yaw = s.tYaw = 0.1; s.pitch = s.tPitch = -0.2; s.vPitch = s.vYaw = 0;
    window.sws.step(2);
    const cam = e.camera, b = w.playerBomber;
    const fwd = cam.getWorldDirection(cam.position.clone());
    const right = fwd.clone().cross(cam.up).normalize();
    const up = right.clone().cross(fwd).normalize();
    // fighters in view against the cloud, plus two on other sides so other seats light up as threats
    const spots = [[420, -60, -25], [650, 120, 10], [900, -230, -40], [1200, 280, 30], [520, 260, -70]];
    for (const [d, x, y] of spots) {
      const p = cam.position.clone().addScaledVector(fwd, d).addScaledVector(right, x).addScaledVector(up, y);
      const f = w.spawnEnemy(p, 'beam', 0.5, false); f.lastPlayerHit = w.time;
    }
    const bq = b.quat;
    for (const v of [[0, 30, -700], [0, -40, 700]]) {
      const p = b.pos.clone().add(cam.up.clone().set(...v).applyQuaternion(bq));
      w.spawnEnemy(p, 'beam', 0.5, false);
    }
    w.crew.wound('tail'); w.crew.wound('ball');
    window.sws.step(20);
    if (id.startsWith('flash')) {
      g.input.setVirtualButtons('a11y-rig', 1);   // firing: muzzle flash and light
      window.sws.step(8);
      g.damageT = 1;                               // B-17 just hit: red vignette + damage flash
      // render the first frame whose gun is mid-shot (muzzle light on)
      for (let i = 0; i < 12; i++) { window.sws.step(1, 1 / 60, true); if ((g.gunner.muzzleLight?.intensity ?? 1) > 0) break; }
    } else window.sws.step(1, 1 / 60, true);
    const threats = [...document.querySelectorAll('#hStations span.threat')].map((x) => x.dataset.s);
    const wounded = [...document.querySelectorAll('#hCrewList .wnd')].map((x) => x.dataset.c);
    return { state: g.state, threats, wounded, enemies: w.activeEnemies().length, body: document.body.className, flash: e.post.damageFlash, muzzle: g.gunner.muzzleLight?.intensity ?? null };
  }, id);
  // mission start fades in from black on a 50 ms timer + 0.35 s CSS transition (wall clock)
  await page.waitForFunction(() => getComputedStyle(document.getElementById('fade')).opacity === '0', null, { timeout: 300000 });
  const png = await page.screenshot({ type: 'png', timeout: 300000 });
  await fs.writeFile(path.join(out, `${id}.jpg`), await sharp(png).jpeg({ quality: 80, mozjpeg: true }).toBuffer());
  await context.close();
  if (errors.length) facts.errors = errors;
  return facts;
}

await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const manifest = { url, seed: SEED, shots: {} };
try {
  for (const id of ids) {
    if (!ALL.includes(id)) throw new Error(`Unknown shot ${id}`);
    manifest.shots[id] = await capture(browser, id);
    console.log(id, JSON.stringify(manifest.shots[id]));
  }
} finally { await browser.close(); }
await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

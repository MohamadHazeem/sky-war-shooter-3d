// Phase 11 goal 37: share cards (mission debrief + Tour finale) and the personal stats page.
// Seeds a logbook, flies one autoplay sortie to a real debrief, opens the card previews and the
// stats page (desktop, phone, Arabic) and saves JPEGs to docs/phase11/shots/37/. Headless shell only.
//   npx vite --port 5337 --strictPort &  node tools/share_cards_shots.mjs
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

let chromium;
for (const c of [process.env.PLAYWRIGHT_MODULE, 'playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')].filter(Boolean)) {
  try { ({ chromium } = await import(path.isAbsolute(c) ? pathToFileURL(c).href : c)); break; } catch { /* next */ }
}
const URL = process.env.SHOTS_URL ?? 'http://127.0.0.1:5337';
const OUT = 'docs/phase11/shots/37';
await fs.mkdir(OUT, { recursive: true });
// the bundled headless shell; PLAYWRIGHT_EXECUTABLE overrides it (e.g. a newer cached build than the module expects)
let executablePath = process.env.PLAYWRIGHT_EXECUTABLE;
if (!executablePath) {
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const dirs = (await fs.readdir(cache).catch(() => [])).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse();
  for (const d of dirs) {
    const exe = path.join(cache, d, `chrome-headless-shell-mac-${process.arch}`, 'chrome-headless-shell');
    if (await fs.access(exe).then(() => true, () => false)) { executablePath = exe; break; }
  }
}
const browser = await chromium.launch({ headless: true, executablePath, args: ['--autoplay-policy=no-user-gesture-required', ...(process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [])] });
const errors = [];

// a plausible logbook: 30 sorties, accuracy creeping up, a few losses
function seed(lang) {
  const titles = ['Black Thursday', 'Schweinfurt', 'Regensburg', 'Bremen', 'Kiel', 'Survival — Gunner'];
  const log = Array.from({ length: 30 }, (_, i) => {
    const shots = 120 + ((i * 37) % 200);
    const acc = Math.min(0.42, 0.1 + i * 0.008 + (((i * 7) % 5) - 2) * 0.02);
    return { t: Date.now() - (30 - i) * 864e5, id: `m${i}`, title: titles[i % titles.length], role: i % 4 === 3 ? 'pilot' : 'gunner',
      success: i % 6 !== 2, survived: ![2, 8, 9, 20].includes(i), kills: (i * 3) % 9, shots, hits: Math.round(shots * acc), score: 900 + i * 120, medals: [], types: {} };
  });
  return { lang, log };
}

async function page(lang, viewport) {
  const p = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));
  await p.addInitScript(({ lang, log }) => {
    localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'low', bookends: false, analytics: false, crewRoom: false }));
    localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true, tutorialDone: true }));
    localStorage.setItem('sws3d.lang', lang);
    if (!localStorage.getItem('sws3d.statslog.v1')) {
      localStorage.setItem('sws3d.statslog.v1', JSON.stringify({ v: 1, log }));
      localStorage.setItem('sws3d.career.v1', JSON.stringify({ v: 1, serial: '34 512 907', enlisted: Date.now() - 30 * 864e5, xp: 9000, missions: 30, wins: 25, deaths: 4, kills: 118,
        killsByType: { fw190: 46, bf109: 38, bf110: 14, ju88: 9, me262: 7, me163: 2, he111: 2 }, killsByRole: { gunner: 96, pilot: 22 }, killsByStation: {}, shots: 6000, hits: 1500 }));
    }
  }, seed(lang));
  await p.goto(URL);
  await p.waitForFunction(() => window.sws?.autoplay && window.sws?.tour && sws.assetsReady(), { timeout: 180000 });
  await p.evaluate(() => { sws.engine.loopOverride = () => {}; sws.game.input.lock = () => {}; });
  await noToasts(p);
  return p;
}

// achievement toasts from the seeded career/sortie are not part of the screens under test
const noToasts = (p) => p.addStyleTag({ content: '#hudToast, #achv-toasts { display: none !important; }' });

async function saveCard(p, name) {
  await p.waitForSelector('.scard-modal img', { timeout: 30000 });
  await p.waitForFunction(() => document.querySelector('.scard-modal img')?.complete);
  const jpg = await p.evaluate(async () => {
    const img = document.querySelector('.scard-modal img');
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/jpeg', 0.84).split(',')[1];
  });
  await fs.writeFile(`${OUT}/${name}-card.jpg`, Buffer.from(jpg, 'base64'));
  await p.screenshot({ path: `${OUT}/${name}-preview.jpg`, type: 'jpeg', quality: 70 });
  await p.evaluate(() => document.querySelector('.scard-modal [data-close]').click());
}

try {
  for (const lang of ['en', 'ar']) {
    const p = await page(lang, { width: 1280, height: 800 });
    // a real sortie to its debrief
    const res = await p.evaluate(() => { const log = sws.autoplay(sws.CAMPAIGN[0], 9000); return { state: sws.game.state, head: log.split('\n').slice(0, 2).join(' / ') }; });
    console.log(lang, res);
    await p.evaluate(() => sws.step(2, 1 / 60, true));
    await p.screenshot({ path: `${OUT}/${lang}-debrief.jpg`, type: 'jpeg', quality: 70 });
    await p.click('[data-share="card"]');
    await saveCard(p, `${lang}-mission`);
    // stats page
    await p.evaluate(() => sws.game.service.openCareer());
    await p.click('[data-stats]');
    await p.waitForSelector('#svc-stats.show svg');
    await p.screenshot({ path: `${OUT}/${lang}-stats.jpg`, type: 'jpeg', quality: 72, fullPage: false });
    await p.evaluate(() => document.querySelector('#svc-stats .screen-center')?.scrollTo(0, 99999));
    // the tour finale
    await p.evaluate(() => { sws.tour.begin(19431008); sws.tour.sim(30); sws.tour.open(); });
    await p.evaluate(() => sws.step(2, 1 / 60, true));
    await p.click('.tour-finale [data-share="card"]');
    await saveCard(p, `${lang}-tour`);
    await p.close();
  }
  // phone: stats page and the card preview
  const ph = await page('en', { width: 390, height: 844 });
  await ph.evaluate(() => sws.game.service.openCareer());
  await ph.click('[data-stats]');
  await ph.waitForSelector('#svc-stats.show svg');
  await ph.screenshot({ path: `${OUT}/phone-stats.jpg`, type: 'jpeg', quality: 70, fullPage: true });
  await ph.evaluate(() => { sws.tour.begin(19431008); sws.tour.sim(30); sws.tour.open(); });
  await ph.click('.tour-finale [data-share="card"]');
  await ph.waitForSelector('.scard-modal img');
  await ph.screenshot({ path: `${OUT}/phone-preview.jpg`, type: 'jpeg', quality: 70 });
  await ph.close();
} finally {
  console.log('errors', errors);
  await browser.close();
}

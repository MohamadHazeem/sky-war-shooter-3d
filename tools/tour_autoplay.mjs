// Phase 11 goal 07: fly real tour sorties with the autoplay bot and print what the tour booked
// (credit, carried wear, patches, wounds, morale/fatigue). Vite on 5327; headless shell only.
//   node tools/tour_autoplay.mjs [sorties=3]
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

let chromium;
for (const c of [process.env.PLAYWRIGHT_MODULE, 'playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')].filter(Boolean)) {
  try { ({ chromium } = await import(path.isAbsolute(c) ? pathToFileURL(c).href : c)); break; } catch { /* next */ }
}
const URL = process.env.TOUR_URL ?? 'http://127.0.0.1:5327';
const sorties = Number(process.argv[2] ?? 3);
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE, args: ['--autoplay-policy=no-user-gesture-required', ...(process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [])] });
const errors = [], runs = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'low', bookends: false, analytics: false, crewRoom: false }));
    localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true, tutorialDone: true }));
    localStorage.setItem('sws3d.lang', 'en');
  });
  await page.goto(URL);
  await page.waitForFunction(() => window.sws?.tour && window.sws?.autoplay && sws.assetsReady(), { timeout: 180000 });
  await page.evaluate(() => { sws.engine.loopOverride = () => {}; sws.game.input.lock = () => {}; sws.tour.begin(19431008); });
  for (let i = 0; i < sorties; i++) {
    const r = await page.evaluate(() => {
      let s = sws.tour.state();
      if (s.event) s = sws.tour.resolve(0);
      const before = { done: s.done, sorties: s.sorties, patches: s.ship.patches, morale: s.morale, fatigue: s.fatigue };
      const m = sws.tour.mission(0);
      const log = sws.autoplay(m, 9000);
      const after = sws.tour.state();
      const g = sws.game, pb = g.world.playerBomber;
      return { mission: m.id, title: m.title, result: log.split('\n').slice(0, 3).join(' / '), end: g.endResult, ditched: g.ditching.ditched, bomberAlive: pb?.alive, before,
        after: { done: after.done, sorties: after.sorties, patches: after.ship.patches, wear: after.ship.wear, morale: after.morale, fatigue: after.fatigue,
          crew: after.crew.filter((c) => c.status !== 'fit').map((c) => `${c.pos}:${c.last}:${c.status}`), gone: after.gone.map((c) => `${c.last}:${c.status}`), event: after.event },
        report: after.report?.lines.map((l) => l.text.replace(/\{(\w+)\}/g, (_, k) => l.vars?.[k] ?? k)) };
    });
    runs.push(r);
    console.log(JSON.stringify(r, null, 1));
    await page.evaluate(() => sws.game.startMenu());
  }
  await fs.writeFile('docs/phase11/shots/07/autoplay.json', JSON.stringify({ runs, errors }, null, 2));
  console.log('errors', errors);
} finally { await browser.close(); }

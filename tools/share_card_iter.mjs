// Phase 11 goal 37 helper: renders the mission share card from the menu formation with STAGE
// overrides, for tuning the staged camera quickly (no sortie flown). Headless shell only.
//   npx vite --port 5337 --strictPort &  node tools/share_card_iter.mjs <out-dir> '[{"pos":[-30,7,38],"look":[2,-1,-6],"fov":38}]'
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

let chromium;
for (const c of [process.env.PLAYWRIGHT_MODULE, 'playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')].filter(Boolean)) {
  try { ({ chromium } = await import(path.isAbsolute(c) ? pathToFileURL(c).href : c)); break; } catch { /* next */ }
}

const URL = process.env.SHOTS_URL ?? 'http://127.0.0.1:5337';
const [out = '.', json = '[{}]'] = process.argv.slice(2);
const variants = JSON.parse(json);
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
const dir = (await fs.readdir(cache)).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()[0];
const executablePath = path.join(cache, dir, `chrome-headless-shell-mac-${process.arch}`, 'chrome-headless-shell');
const browser = await chromium.launch({ headless: true, executablePath, args: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [] });
try {
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await p.addInitScript(() => {
    localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'low', bookends: false, analytics: false, crewRoom: false }));
    localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true, tutorialDone: true }));
  });
  await p.goto(URL);
  await p.waitForFunction(() => window.sws?.assetsReady?.(), null, { timeout: 180000 });
  await p.evaluate(() => { sws.engine.loopOverride = () => {}; sws.step(120, 1 / 60, true); });
  for (const [i, v] of variants.entries()) {
    const jpg = await p.evaluate(async (v) => {
      const [{ STAGE, captureStaged }, { shareWorld }, { drawShareCard }, { missionCard }] = await Promise.all(
        ['/src/game/ShareStage.ts', '/src/game/Share.ts', '/src/ui/ShareCard.ts', '/src/game/ShareCardModel.ts'].map((m) => import(m)));
      const s = STAGE[v.kind ?? 'bomber'];
      if (v.pos) s.pos.fromArray(v.pos);
      if (v.look) s.look.fromArray(v.look);
      if (v.fov) s.fov = v.fov;
      const photo = captureStaged(sws.engine, shareWorld);
      const c = drawShareCard(missionCard({ title: 'Baptism of Fire', date: '27 September 1943', role: 'gunner', success: true, survival: false, kills: 41, accuracy: 0.77, rounds: 900,
        score: 30635, bombersLost: 3, bombersTotal: 9, medals: { 'Air Medal': 1 }, ship: 'Sky Queen', nose: 'pinup' }), photo);
      return c.toDataURL('image/jpeg', 0.8).split(',')[1];
    }, v);
    await fs.writeFile(path.join(out, `v${i}.jpg`), Buffer.from(jpg, 'base64'));
  }
} finally { await browser.close(); }

// Adaptive difficulty director (Phase 11 · 29): balance runs with autoplay bots of different skill,
// director on vs off. Needs this worktree's Vite dev server (sws.autoplay is dev-only):
//   npx vite --port 5429 --strictPort &
//   tools/heavy.sh node tools/adaptive_balance.mjs [--port 5429] [--only m1] [--out docs/phase11/shots/29/balance.json]
// Playwright's bundled headless shell only (never channel 'chrome'). One fresh page per run.
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg('--port', '5429'), OUT = arg('--out', 'docs/phase11/shots/29/balance.json'), ONLY = arg('--only', '');
// bots: the near-perfect bot (skill 1), the human-level bot (skill 0, docs/BALANCE.md) and a
// rookie (skill 0 with 2.4x the human aim error and the human reaction delays)
const BOTS = { bot: { skill: 1 }, human: { skill: 0 }, rookie: { skill: 0, aimErr: 0.06 } };
// JOBS='[{"mission":"m4","bot":"human","adaptive":false}]' runs only those
const JOBS = process.env.JOBS ? JSON.parse(process.env.JOBS) : [];
// missions: m1 (B-17 gunner campaign, round director). 'survival:pilot' / 'survival:gunner' run 6 min
// of Survival via JOBS (the pilot bot dies suddenly in Survival, so it is no calibration source). The
// P-51 campaign missions run PilotOps' scripted rounds, which the director does not drive.
if (!process.env.JOBS) for (const mission of ['m1']) for (const bot of Object.keys(BOTS)) for (const adaptive of [false, true]) {
  JOBS.push({ mission, bot, adaptive });
}
const jobs = JOBS.filter((j) => !ONLY || j.mission === ONLY);
const browser = await chromium.launch({ headless: true });
// resume: runs already in OUT are kept and skipped
const results = await fs.readFile(OUT, 'utf8').then(JSON.parse).catch(() => []);
const done = (j) => results.some((r) => r.mission === j.mission && r.bot === j.bot && r.adaptive === j.adaptive);
try {
  for (const job of jobs) {
    if (done(job)) continue;
    const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
    await context.route(/https:\/\/.*(googleapis|firebaseio|firestore|identitytoolkit|securetoken).*/, (r) => r.abort());
    await context.addInitScript((adaptive) => {
      localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'low', bookends: false, crewRoom: false, difficulty: 'veteran', adaptive }));
      localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true }));
    }, job.adaptive);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${PORT}/`, { timeout: 180000 });
    await page.waitForFunction(() => window.sws?.assetsReady?.() && window.sws.autoplay, null, { timeout: 180000 });
    const t0 = Date.now();
    const r = await page.evaluate(({ job, bot }) => {
      const g = window.sws.game; window.sws.engine.loopOverride = () => {}; g.input.lock = () => {};
      const m = job.mission.startsWith('survival:') ? window.sws.survivalMission(job.mission.split(':')[1]) : window.sws.CAMPAIGN.find((c) => c.id === job.mission);
      const trace = []; let multSum = 0, n = 0;
      window.sws.autoplay(m, job.mission.startsWith('survival:') ? 7200 : 24000, { ...bot, onStep: (k) => {
        if (k % 20) return;
        const s = g.adaptive.state(); multSum += s.mult; n++;
        if (k % 400 === 0) trace.push(s);
      } });
      const w = g.world, end = g.endResult;
      return { success: end?.success ?? null, reason: end?.reason ?? g.state, t: Math.round(w.time), kills: w.stats.kills, accuracy: +(w.stats.hits / Math.max(1, w.stats.shots)).toFixed(3),
        bombersLost: w.stats.bombersLost, spawned: w.stats.enemiesSpawned, endHp: +(w.player?.integrity ?? 0).toFixed(2), meanMult: +(multSum / Math.max(1, n)).toFixed(3),
        final: g.adaptive.state(), debriefTile: document.querySelector('#debrief .stats')?.textContent?.includes('Adaptive difficulty') ?? false, trace };
    }, { job, bot: BOTS[job.bot] });
    results.push({ ...job, ...r, realS: Math.round((Date.now() - t0) / 1000), errors });
    console.log(`${job.mission} ${job.bot.padEnd(6)} adaptive ${job.adaptive ? 'on ' : 'off'} | ${r.success ? 'pass' : 'FAIL'} ${r.t}s kills ${r.kills} acc ${r.accuracy} lost ${r.bombersLost} spawned ${r.spawned} endHp ${r.endHp} | meanMult ${r.meanMult} final ${JSON.stringify(r.final)}`);
    await context.close();
    await fs.mkdir(OUT.replace(/\/[^/]+$/, ''), { recursive: true });
    await fs.writeFile(OUT, JSON.stringify(results, null, 1));
  }
} finally { await browser.close(); }

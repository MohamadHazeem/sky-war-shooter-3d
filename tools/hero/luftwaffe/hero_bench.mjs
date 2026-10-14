// Stress bench for the Luftwaffe models: 24 enemy fighters of the five types spread from 120 m to
// 1500 m in front of the left waist gunner, frozen, then sws.bench. Run against this branch and against
// a checkout of the base commit (old FlightGear models) to compare.
//   PLAYWRIGHT_MODULE=... node tools/hero/luftwaffe/hero_bench.mjs <label> [quality ...]
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const label = process.argv[2] ?? 'after';
const qualities = process.argv.slice(3).length ? process.argv.slice(3) : ['high', 'low'];
const URL = `http://127.0.0.1:${process.env.PORT ?? 5305}`;
const out = { label, runs: [] };
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  for (const quality of qualities) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    await context.route(/https:\/\/.*(googleapis|firebaseio|firestore|identitytoolkit|securetoken).*/, (r) => r.abort());
    await context.addInitScript((q) => {
      localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: q, bookends: false, difficulty: 'recruit', aimAssist: 'high' }));
      localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true }));
    }, quality);
    const page = await context.newPage();
    await page.goto(URL);
    await page.waitForFunction(() => window.sws?.assetsReady(), null, { timeout: 180000 });
    const r = await page.evaluate(async () => {
      sws.engine.loopOverride = () => {};
      const g = sws.game; g.input.lock = () => {};
      g.startMission(sws.survivalMission('gunner')); g.setWeather('clear');
      g.director.direct = () => {}; g.midRound.update = () => {};
      sws.step(120, 1 / 60); g.ui.fade(false); g.ui.tip('', 0);
      const { loadModels } = await import('/src/world/Models.ts');
      await loadModels();
      const w = g.world;
      g.gunner.requestStation('waistL'); sws.step(90, 1 / 60);
      for (const a of w.aircraft) if (a.team === 'axis') { a.root.visible = false; a.remove = true; }
      sws.step(2, 1 / 60);
      const cam = sws.engine.camera, V = cam.position.constructor;
      const cp = new V(), cd = new V(); cam.getWorldPosition(cp); cam.getWorldDirection(cd);
      const bq = w.playerBomber.root.quaternion, bf = new V(0, 0, 1).applyQuaternion(bq), bu = new V(0, 1, 0).applyQuaternion(bq);
      const right = new V().crossVectors(cd, bu).normalize();
      const types = ['bf109', 'fw190', 'me262', 'bf110', 'ju88'];
      const fs = [];
      for (let i = 0; i < 24; i++) {
        const d = 120 + 1380 * (i / 23) ** 1.5;
        const pos = cp.clone().addScaledVector(cd, d).addScaledVector(right, (i % 2 ? 1 : -1) * d * 0.25 * ((i * 7) % 5) / 5).addScaledVector(bu, ((i * 3) % 7 - 3) * d * 0.04);
        const f = w.spawnEnemy(pos, 'stern', 1, false, false, types[i % 5]);
        f.kinematic = true; f.ai = null; f.root.position.copy(pos);
        f.root.quaternion.setFromUnitVectors(new V(0, 0, 1), bf.clone().applyAxisAngle(bu, i * 0.7));
        fs.push(f);
      }
      // keep them alive and frozen through the bench (the AI is off, kinematic: only props + controls run)
      sws.step(30, 1 / 60, true);
      const bench = sws.bench(240);
      // whole-frame totals (every pass): the renderer resets its counters per render() call otherwise
      const rr = sws.engine.renderer, info = rr.info;
      info.autoReset = false; info.reset();
      sws.engine.frame(0, true);
      const calls = info.render.calls, triangles = info.render.triangles;
      info.autoReset = true;
      return { bench, calls, triangles, programs: info.programs.length, geometries: info.memory.geometries, textures: info.memory.textures, alive: fs.filter((f) => !f.remove).length };
    });
    out.runs.push({ quality, ...r });
    await context.close();
  }
} finally {
  await browser.close();
}
await fs.mkdir('docs/phase10/shots/05', { recursive: true });
await fs.writeFile(`docs/phase10/shots/05/bench-${label}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

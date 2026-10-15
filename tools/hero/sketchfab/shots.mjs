// Phase 10 goal 05 captures: turntables of the Luftwaffe models and in-game views from the B-17 gun
// stations (waist at 150 m, tail view of a diving Bf 109, head-on wedge of Fw 190s), plus a bench.
// Needs this worktree's Vite (npx vite --port 5305 --strictPort) and Playwright's bundled headless shell
// (never channel 'chrome': it takes over the owner's mouse):
//   PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs node tools/hero/luftwaffe/hero_shots.mjs after [--no-turntables] [--no-game] [--quality high]
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`);
const tag = process.argv[2] ?? 'after';
const flag = (f) => process.argv.includes(f);
const qi = process.argv.indexOf('--quality');
const quality = qi > 0 ? process.argv[qi + 1] : 'high';
const PORT = process.env.PORT ?? 5330;
const URL = `http://127.0.0.1:${PORT}`;
const shots = process.env.SHOTS ?? 'docs/phase11/shots/01b';
const KINDS = (process.env.KINDS ?? 'bf109,fw190').split(',');
await fs.mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const out = { tag, turntables: {}, game: {}, errors: [] };
try {
  if (!flag('--no-turntables')) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    page.on('pageerror', (e) => out.errors.push(e.message));
    for (const kind of KINDS) {
      const variants = tag === 'before' ? [['', 'lod=0']] : [['', 'lod=0'], ['-close', 'lod=0&close=1'], ['-lod1', 'lod=1'], ['-lod2', 'lod=2'],
        ['-ace', 'lod=0&ace=1'], ['-ktx2', 'lod=0&ktx2=1'], ['-pilot', 'lod=0&pilot=1']];
      for (const [sfx, qs] of variants) {
        await page.goto(`${URL}/tools/hero/luftwaffe/turntable.html?kind=${kind}&${qs}`);
        const r = await page.waitForFunction(() => window.ready, null, { timeout: 60000 }).then((h) => h.jsonValue());
        out.turntables[kind + sfx] = r;
        await page.screenshot({ path: `${shots}/${tag}-turntable-${kind}${sfx}.jpg`, type: 'jpeg', quality: 80 });
      }
    }
    await page.close();
  }
  if (!flag('--no-game')) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    await context.route(/https:\/\/.*(googleapis|firebaseio|firestore|identitytoolkit|securetoken).*/, (r) => r.abort());
    await context.addInitScript((q) => {
      localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: q, bookends: false, difficulty: 'recruit', aimAssist: 'high' }));
      localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true }));
    }, quality);
    if (process.env.VISUAL_FIGHTER_BASELINE) await context.route(/\/models\/(bf109|fw190)(\.glb|_(base|normal|orm)\.ktx2|_ace\.webp)(\?.*)?$/, async r => {
      const file = new globalThis.URL(r.request().url()).pathname.split('/').pop();
      await r.fulfill({status:200,body:await fs.readFile(`${process.env.VISUAL_FIGHTER_BASELINE}/${file}`)});
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => out.errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => window.sws?.assetsReady(), null, { timeout: 180000 });
    await page.evaluate(async () => {
      sws.engine.loopOverride = () => {};
      let seed=19441008;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      const g = sws.game; g.input.lock = () => {};
      g.director.direct=()=>{};
      g.startMission(sws.survivalMission('gunner')); g.setWeather('clear');
      g.director.direct = () => {}; g.midRound.update = () => {};
      sws.step(120, 1 / 60); g.ui.fade(false); g.ui.tip('', 0);
      for(const a of g.world.aircraft)if(a.team!=='axis')a.kinematic=true;
      const { loadModels } = await import('/src/world/Models.ts');
      await loadModels();
    });
    // place fighters relative to the gunner's camera and render one frame
    const scene = async (name, station, setup) => {
      const info = await page.evaluate(([station, setup]) => {
        const THREE = sws.THREE ?? null;
        const g = sws.game, w = g.world;
        g.gunner.requestStation(station); sws.step(90, 1 / 60);
        for (const a of w.aircraft) if (a.team === 'axis') { a.root.visible = false; a.remove = true; }
        sws.step(2, 1 / 60);
        const cam = sws.engine.camera;
        const V = cam.position.constructor;
        // aim: try a few yaws for 'forward' setups
        if (setup.forward) {
          const fwd = new V(0, 0, 1).applyQuaternion(w.playerBomber.root.quaternion);
          let best = -2, by = 0;
          for (let y = -Math.PI; y < Math.PI; y += Math.PI / 12) {
            g.gunner.state.yaw = g.gunner.state.tYaw = y; g.gunner.state.pitch = g.gunner.state.tPitch = 0.04; sws.step(2, 1 / 60, false);
            const d = new V(); cam.getWorldDirection(d);
            if (d.dot(fwd) > best) { best = d.dot(fwd); by = y; }
          }
          g.gunner.state.yaw = g.gunner.state.tYaw = by; sws.step(20, 1 / 60, false);
        } else {
          g.gunner.state.yaw = g.gunner.state.tYaw = setup.yaw ?? 0; g.gunner.state.pitch = g.gunner.state.tPitch = setup.pitch ?? 0;
          sws.step(30, 1 / 60, false);
        }
        const cp = new V(), cd = new V();
        cam.getWorldPosition(cp); cam.getWorldDirection(cd);
        const bq = w.playerBomber.root.quaternion;
        const bf = new V(0, 0, 1).applyQuaternion(bq), bu = new V(0, 1, 0).applyQuaternion(bq);
        const right = new V().crossVectors(cd, bu).normalize();
        const made = [];
        for (const p of setup.planes) {
          const pos = cp.clone().addScaledVector(cd, p.dist).addScaledVector(bu, p.up ?? 0).addScaledVector(right, p.right ?? 0).addScaledVector(bf, p.fwd ?? 0);
          const f = w.spawnEnemy(pos, 'stern', 1, false, false, p.type);
          f.kinematic = true; f.ai = null;
          f.root.position.copy(pos);
          let dir;
          if (p.face === 'camera') dir = cp.clone().sub(pos).normalize();
          else if (p.face === 'parallel') dir = bf.clone();
          else dir = bf.clone().negate();
          if (p.dive) dir.addScaledVector(bu, -p.dive).normalize();
          f.root.quaternion.setFromUnitVectors(new V(0, 0, 1), dir);
          if (p.bank) f.root.quaternion.multiply(new f.root.quaternion.constructor().setFromAxisAngle(new V(0, 0, 1), p.bank));
          f.fm.vel.copy(dir).multiplyScalar(150);
          f.root.updateMatrixWorld(true);
          made.push({ type: p.type, kind: f.kind, d: Math.round(pos.distanceTo(cp)) });
        }
        sws.step(1, 1 / 600, false);
        for (const a of w.aircraft) if (a.team === 'axis' && a.kinematic) { a.root.updateMatrixWorld(true); }
        return made;
      }, [station, setup]);
      await page.evaluate(() => { sws.engine.frame(0, true); sws.game.hud.frame(0); });
      await page.screenshot({ path: `${shots}/${tag}-${name}.jpg`, type: 'jpeg', quality: 82 });
      out.game[name] = info;
    };
    for (const type of KINDS) {
      await scene(`waist150-${type}`, 'waistL', { yaw: 0, pitch: 0, planes: [{ type, dist: 150, face: 'parallel', fwd: 0 }] });
    }
    await scene('tail-diving-bf109', 'tail', { yaw: 0, pitch: 0, planes: [{ type: 'bf109', dist: 210, up: 22, right: 18, face: 'camera', dive: 0.0, bank: 0.35 }] });
    await scene('headon-fw190-wedge', 'top', { forward: true, planes: [
      { type: 'fw190', dist: 420, up: 8, face: 'camera' },
      { type: 'fw190', dist: 470, up: 10, right: 70, face: 'camera' },
      { type: 'fw190', dist: 470, up: 6, right: -70, face: 'camera' },
      { type: 'fw190', dist: 520, up: 12, right: 140, face: 'camera' },
      { type: 'fw190', dist: 520, up: 4, right: -140, face: 'camera' },
    ] });
    out.game.bench = await page.evaluate(() => sws.bench(120));
    out.game.programs = await page.evaluate(() => sws.engine.renderer.info.programs.length);
    out.game.memory = await page.evaluate(() => sws.engine.renderer.info.memory);
  }
} finally {
  await fs.writeFile(`${shots}/${tag}${flag('--no-game') ? '-turntables' : flag('--no-turntables') ? '-game' : ''}-checks.json`, JSON.stringify(out, null, 2));
  await browser.close();
}
console.log(JSON.stringify(out, null, 2));

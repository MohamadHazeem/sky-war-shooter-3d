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
    if (process.env.VISUAL_FIGHTER_BASELINE) await page.route(/\/models\/(bf109|fw190)(\.glb|_(base|normal|orm)\.ktx2|_ace\.webp)(\?.*)?$/, async r => {
      const file = new globalThis.URL(r.request().url()).pathname.split('/').pop();
      await r.fulfill({status:200,body:await fs.readFile(`${process.env.VISUAL_FIGHTER_BASELINE}/${file}`)});
    });
    for (const kind of KINDS) {
      const variants = tag === 'before' ? [['', 'lod=0'], ['-close', 'lod=0&close=1']] : [['', 'lod=0'], ['-close', 'lod=0&close=1'], ['-lod1', 'lod=1'], ['-lod2', 'lod=2'],
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
    const { captureRig } = await import('../../visual_rig.mjs');
    out.game = await captureRig(['--url', URL, '--out', `${shots}/${tag === 'before' ? 'live' : 'after'}`,
      '--shots', 'waist-fw190,tail-bf109,waist-fw190-close,tail-bf109-close,headon-fw190-wedge,headon-fw190-zoom,waist-fw190-broadside,waist-bf109-broadside',
      ...(tag === 'before' ? [] : ['--camera-from', `${shots}/live/manifest.json`])]);
  }
} finally {
  await fs.writeFile(`${shots}/${tag}${flag('--no-game') ? '-turntables' : flag('--no-turntables') ? '-game' : ''}-checks.json`, JSON.stringify(out, null, 2));
  await browser.close();
}
console.log(JSON.stringify(out, null, 2));

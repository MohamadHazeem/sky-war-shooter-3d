// Requires goal 00's VisualRig page and an existing local Playwright installation.
// Start this worktree with npx vite --port 5303 --strictPort first.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE, args: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] : [] });
const output = process.argv[2] ?? 'docs/phase10/shots/03/performance.json';
const results = [];
const single = process.argv.includes('--single-frames');
const quick = process.argv.includes('--quick');
try {
  for (const quality of (quick ? ['high'] : single ? ['high', 'ultra'] : ['high', 'ultra', 'low'])) for (const shot of (single || quick ? ['sunset', 'formation-chase'] : ['sunset', 'overcast-rain', 'cloud-flythrough', 'ball-europe', 'formation-chase'])) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && /THREE|shader|WebGL/i.test(m.text())) errors.push(m.text()); });
    await page.goto(`${process.env.CLOUD_URL ?? 'http://127.0.0.1:5303'}/tools/visual-rig.html?shot=${shot}&quality=${quality}`);
    await page.waitForFunction(() => window.visualRig?.ready || window.visualRig?.error, null, { timeout: 180000 });
    const result = await page.evaluate(async single => {
      if (visualRig.error) throw new Error(visualRig.error);
      const { cloudBench } = await import('/src/dev/cloudBench.ts');
      const e = visualRig.engine;
      const bench = cloudBench(e, { setup() {} });
      const timing = await bench.clouds(single ? 48 : 9, single ? 1 : 16);
      const { weatherNow } = await import(performance.getEntriesByType('resource').find(r => new URL(r.name).pathname === '/src/render/WeatherState.ts').name);
      return { ...timing, device: visualRig.metadata.deviceInfo, inside: weatherNow.cloudInside, sunShadow: e.clouds.sunShadow };
    }, single);
    assert.deepEqual(errors, []);
    assert.equal(result.programsBefore, result.programsAfter, 'No runtime cloud shader compilation');
    results.push({ shot, ...result, errors });
    console.log(`${quality} ${shot}: ${result.median.toFixed(2)} ms (${result.method})`);
    await page.close();
  }
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(results, null, 2) + '\n');
  for (const r of results) if (r.quality !== 'low')
    assert.ok(r.median < (r.quality === 'high' ? 4 : 6), `${r.quality} ${r.shot} exceeds cloud budget: ${r.median.toFixed(2)} ms`);
} finally { await browser.close(); }

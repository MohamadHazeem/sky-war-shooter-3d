// Alternate baseline/current cloud shaders on the same frozen fixture and GPU.
// No game source mutation, deployment, or desktop browser; compile outside timed batches.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const url = process.env.CLOUD_URL ?? 'http://127.0.0.1:5323';
const baseline = execFileSync('git', ['show', '4b8dd75:src/render/Clouds.ts'], { encoding:'utf8' }).split('const cloudFrag = /* glsl */ `')[1].split('`;')[0];
const browser = await chromium.launch({ headless:true, executablePath:process.env.PLAYWRIGHT_EXECUTABLE, args:process.platform === 'darwin' ? ['--use-gl=angle','--use-angle=metal','--enable-gpu'] : [] });
const results = [];
try {
  for (const quality of ['high','ultra']) for (const shot of ['sunset','formation-chase','overcast-rain']) {
    const page = await browser.newPage({ viewport:{ width:1920,height:1080 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if(m.type() === 'error' && /THREE|shader|WebGL/i.test(m.text())) errors.push(m.text()); });
    await page.goto(`${url}/tools/visual-rig.html?shot=${shot}&quality=${quality}`);
    await page.waitForFunction(() => window.visualRig?.ready || window.visualRig?.error, null, { timeout:180000 });
    const result = await page.evaluate(async baseline => {
      if(visualRig.error) throw new Error(visualRig.error);
      const { cloudBench } = await import('/src/dev/cloudBench.ts');
      const { skyGLSL } = await import('/src/render/Atmosphere.ts');
      const { depthGLSL } = await import('/src/render/Clouds.ts');
      const { CLOUD_LIGHTS } = await import('/src/render/CloudLights.ts');
      const before = new Function('skyGLSL','depthGLSL','CLOUD_LIGHTS', 'return `' + baseline + '`')(skyGLSL,depthGLSL,CLOUD_LIGHTS);
      const e = visualRig.engine, c = e.clouds, after = c.tMat.fragmentShader;
      const bench = cloudBench(e, { setup() {} }), samples = [];
      for(const name of ['before','after','after','before']) {
        for(const mat of [c.tMat,c.shadowMat,c.probeMat]) { mat.fragmentShader = name === 'before' ? before : after; mat.needsUpdate = true; }
        c.resetHistory();
        for(let i=0;i<24;i++) e.render(1/60);
        const timing = await bench.clouds(5,8);
        samples.push({ name, ...timing });
      }
      return { samples, device:visualRig.metadata.deviceInfo };
    }, baseline);
    assert.deepEqual(errors, []);
    results.push({ quality,shot,...result,errors });
    console.log(`${quality} ${shot}: ${result.samples.map(s => s.name + ' ' + s.median.toFixed(2)).join(', ')} ms`);
    await page.close();
  }
  await fs.writeFile('docs/phase11/shots/03/performance-ab.json', JSON.stringify(results,null,2)+'\n');
} finally { await browser.close(); }

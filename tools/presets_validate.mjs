// Phase 10/12 controller and weak-device checks. Uses only bundled headless Chromium.
import fs from 'node:fs/promises';
import { smallJpeg } from './visual_rig.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
const out = 'docs/phase10/shots/12/after';
const mode = process.env.PERF_VALIDATE_MODE;
const results = mode ? JSON.parse(await fs.readFile(`${out}/validation.json`, 'utf8')) : { drs: [], lowStress: [], auto: [] };
if (mode === 'stress') results.lowStress = [];
await fs.mkdir(out, { recursive: true });
const stats = a => { a.sort((a,b)=>a-b); return { mean: a.reduce((a,b)=>a+b,0)/a.length, p95: a[Math.floor(a.length*.95)] }; };
try {
  for (const tier of (mode ? [] : ['high','ultra','cinematic'])) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`http://127.0.0.1:5312/tools/visual-rig.html?shot=formation-chase&quality=${tier}`);
    await page.waitForFunction(() => window.visualRig?.ready || window.visualRig?.error, null, { timeout: 180000 });
    const data = await page.evaluate(async () => {
      const rig = window.visualRig; if (rig.error) throw Error(rig.error);
      const e = rig.engine, windows = [], samples = [];
      e.resetDynamicResolution(1); e.resize(); e.refreshHz = 60;
      // Hidden tabs have no rAF: feed measured render cost (at least a 60 Hz interval)
      // into the real controller. This measures render headroom, not full gameplay FPS.
      for (let i=0;i<720;i++) {
        const ms = (await rig.benchmark(1)).mean;
        const dt = Math.max(1000/60, ms)/1000;
        e.time += dt; e.dynamicResolution(dt);
        if (i>=540) samples.push(ms);
        if (i%60===59) windows.push({ frame:i+1, scale:e.renderScale, ms });
      }
      return { scale:e.renderScale, target:e.targetMs, samples, windows, renderSize:[e.renderer.domElement.width,e.renderer.domElement.height] };
    });
    const {samples,...rest}=data;
    results.drs.push({tier,...rest,...stats(samples), method:'720 frozen-scene frames; real GPU-fenced render cost fed to DRS; last 180 measured; simulation excluded'});
    await fs.writeFile(`${out}/validation.json`,JSON.stringify(results,null,2)+'\n');
    console.log('DRS',tier,{scale:rest.scale,...stats(samples)});
    await page.close();
  }
  for (const stress of ['cpu4','cpu4-fill4']) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:5312/tools/visual-rig.html?shot=formation-chase&quality=low');
    await page.waitForFunction(() => window.visualRig?.ready, null, { timeout: 180000 });
    if(stress==='cpu4-fill4') await page.evaluate(async()=>{
      // Resize the actual engine targets: a bare import of Engine.ts can be a distinct
      // module instance when Vite has attached HMR timestamps to the rig imports.
      const e=visualRig.engine, r=e.renderer; e.pixelRatio*=2;
      const pw=Math.floor(e.width*e.pixelRatio), ph=Math.floor(e.height*e.pixelRatio);
      r.setPixelRatio(e.pixelRatio); r.setSize(e.width,e.height);
      e.skyCache.setSize(pw,ph); e.sceneRT.setSize(pw,ph); e.hdrRT.setSize(pw,ph);
      const {QUALITY}=await import('/src/core/Engine.ts'); e.clouds.setQuality(QUALITY.low,pw,ph);
      e.post.setSize(pw,ph); e.temporal.setSize(pw,ph); e.heatHaze.setSize(pw,ph);
    });
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    const data=await page.evaluate(async()=>{
      const r=window.visualRig,e=r.engine; await r.benchmark(12);
      return {timing:await r.benchmark(120), renderSize:[e.renderer.domElement.width,e.renderer.domElement.height],
        temporal:e.temporal.enabled,haze:e.heatHaze.enabled,cloudTemporal:e.clouds.temporal};
    });
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
    const png=await page.evaluate(()=>visualRig.png());
    await fs.writeFile(`${out}/low-${stress}.jpg`,await smallJpeg(Buffer.from(png.split(',')[1],'base64')));
    results.lowStress.push({stress,...data,errors,method:'CDP CPU 4x slowdown; fill4 is 4x Low pixel budget (GPU workload proxy, not GPU frequency throttling)'});
    await fs.writeFile(`${out}/validation.json`,JSON.stringify(results,null,2)+'\n');
    console.log('Low stress',stress,data.timing.mean);
    await page.close();
  }
  for(const weak of (mode ? [] : [false,true])){
    const page=await browser.newPage({viewport:{width:1920,height:1080}});
    await page.addInitScript(weak=>{
      window.requestAnimationFrame=()=>0;
      localStorage.setItem('sws3d.onboarding.v1',JSON.stringify({promptDismissed:true}));
      localStorage.setItem('sws3d.settings.v2',JSON.stringify({quality:'high',bookends:false,volume:0,radio:false,music:false,analytics:false}));
      if(weak){Object.defineProperty(navigator,'hardwareConcurrency',{value:2});Object.defineProperty(navigator,'deviceMemory',{value:4});}
    },weak);
    await page.goto('http://127.0.0.1:5312');
    await page.waitForFunction(()=>window.sws?.autoplay&&sws.assetsReady(),null,{timeout:180000,polling:100});
    const cdp=await page.context().newCDPSession(page);
    if(weak)await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    const data=await page.evaluate(async()=>({pick:await sws.detectGraphics({sync:true}),cores:navigator.hardwareConcurrency,memoryGB:navigator.deviceMemory}));
    results.auto.push({weak,...data});await fs.writeFile(`${out}/validation.json`,JSON.stringify(results,null,2)+'\n');console.log('Auto',weak,data.pick?.quality);
    await page.close();
  }
  await fs.writeFile(`${out}/validation.json`,JSON.stringify(results,null,2)+'\n');
} finally { await browser.close(); }

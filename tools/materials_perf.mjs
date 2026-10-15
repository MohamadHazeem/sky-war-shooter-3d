// Re-measure frozen rig costs without another task-owned browser competing for the GPU.
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const quality=process.argv[2]??'high',budget=quality==='low'?6:11;
assert.ok(['high','low'].includes(quality));
const root='docs/phase11/shots/02',reference=JSON.parse(await fs.readFile(`${root}/${quality==='low'?'low':'after'}/manifest.json`));

const sourceRevision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),capturedAt=new Date().toISOString();
const results=[];
const selected=process.argv[3]?.split(',');
for(const shot of reference.shots.filter(s=>!selected||selected.includes(s.shot))){
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu','--disable-frame-rate-limit','--disable-gpu-vsync','--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:5322/tools/visual-rig.html?shot=${shot.shot}&quality=${quality}`);
  await page.waitForFunction(()=>window.visualRig?.ready,null,{timeout:180000});
  await page.evaluate(pose=>window.visualRig.lockCamera(pose),shot.camera);
  // Let shader/JIT initialization and initial resource uploads settle before timing.
  const warmup=await page.evaluate(()=>window.visualRig.benchmark(180));
  const batches=[await page.evaluate(()=>window.visualRig.benchmark(180))];
  const mean=batches.reduce((s,b)=>s+b.mean,0)/batches.length;
  const p95=Math.max(...batches.map(b=>b.p95));
  const critical=quality==='high';
  const reflectionVisible=await page.evaluate(()=>window.visualRig.engine.reflectionVisible);
  results.push({shot:shot.shot,mean,p95,budget,reflectionVisible,warmup,passes:mean<=budget && (!critical || p95<budget),batches,errors});
  await fs.writeFile(process.env.MATERIALS_PERF_OUTPUT??`${root}/performance${quality==='low'?'-low':''}.json`,JSON.stringify({sourceRevision,capturedAt,method:'180 warm-up frames followed by one continuous 180-frame rig benchmark per shot; a fresh browser process per fixture releases all prior scene/GPU resources. Frozen simulation, GPU fenced; p95 of all 180 frames. No other task-owned capture concurrent.',results},null,2)+'\n');
  console.log(`${shot.shot}: ${mean.toFixed(2)} ms, p95 ${p95.toFixed(2)} / ${budget} ms`);assert.equal(errors.length,0);await page.close();
 }finally{await browser.close();}
}
assert.ok(results.every(r=>r.passes),`${quality} ${budget} ms mean budget and critical-view p95 gate`);

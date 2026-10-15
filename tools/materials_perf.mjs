// Re-measure frozen rig costs without another task-owned browser competing for the GPU.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const quality=process.argv[2]??'high',budget=quality==='low'?6:11;
assert.ok(['high','low'].includes(quality));
const root='docs/phase11/shots/02',reference=JSON.parse(await fs.readFile(`${root}/${quality==='low'?'low':'after'}/manifest.json`));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu','--disable-frame-rate-limit','--disable-gpu-vsync','--autoplay-policy=no-user-gesture-required']});
const results=[];
try{
 for(const shot of reference.shots){
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:5322/tools/visual-rig.html?shot=${shot.shot}&quality=${quality}`);
  await page.waitForFunction(()=>window.visualRig?.ready,null,{timeout:180000});
  await page.evaluate(pose=>window.visualRig.lockCamera(pose),shot.camera);
  const batches=[];for(let i=0;i<3;i++)batches.push(await page.evaluate(()=>window.visualRig.benchmark()));
  const mean=batches.reduce((s,b)=>s+b.mean,0)/batches.length;
  results.push({shot:shot.shot,mean,budget,passes:mean<=budget,batches,errors});
  await fs.writeFile(`${root}/performance${quality==='low'?'-low':''}.json`,JSON.stringify({method:'Three 60-frame rig benchmarks per shot; frozen simulation, GPU fenced. No other task-owned capture concurrent.',results},null,2)+'\n');
  console.log(`${shot.shot}: ${mean.toFixed(2)} ms / ${budget} ms`);assert.equal(errors.length,0);await page.close();
 }
}finally{await browser.close();}
assert.ok(results.every(r=>r.passes),`${quality} ${budget} ms mean budget`);

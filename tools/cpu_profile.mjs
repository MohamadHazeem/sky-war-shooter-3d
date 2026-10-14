// CPU samples and scene inventory for the Phase 10 performance fixtures.
import fs from 'node:fs/promises';
import os from 'node:os';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? `${os.homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`);
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE, args: ['--use-angle=metal', '--enable-gpu', '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
try {
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 await page.goto(`http://127.0.0.1:5312/tools/visual-rig.html?shot=${process.env.PERF_SHOT ?? 'formation-chase'}&quality=${process.env.PERF_TIER ?? 'low'}`);
 await page.waitForFunction(()=>window.visualRig?.ready || window.visualRig?.error,null,{timeout:180000});
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.PERF_CPU ?? 1)});
 await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 const result=await page.evaluate(async()=>{
  const v=window.visualRig;if(v.error)throw Error(v.error);
  const e=v.engine,r=e.renderer;r.info.autoReset=false;r.info.reset();
  const timing=await v.benchmark(120), draws=r.info.render.calls/120;
  const groups=e.scene.children.map(o=>{let nodes=0,meshes=0,visible=0;o.traverse(x=>{nodes++;if(x.isMesh)meshes++;});o.traverseVisible(x=>{if(x.isMesh)visible++;});return {name:o.name,type:o.type,nodes,meshes,visible};});
  return {timing,draws,groups};
 });
 const {profile}=await cdp.send('Profiler.stop');
 const counts=new Map();for(const id of profile.samples ?? [])counts.set(id,(counts.get(id)??0)+1);
 result.cpu=profile.nodes.map(n=>({name:n.callFrame.functionName,url:n.callFrame.url,line:n.callFrame.lineNumber,samples:counts.get(n.id)??0})).filter(n=>n.samples).sort((a,b)=>b.samples-a.samples).slice(0,50);
 const out=process.env.PERF_OUTPUT ?? 'docs/phase10/shots/12b/after';await fs.mkdir(out,{recursive:true});await fs.writeFile(`${out}/cpu-${process.env.PERF_TIER ?? 'low'}.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify({timing:result.timing,draws:result.draws,cpu:result.cpu.slice(0,12)}));
}finally{await browser.close();}

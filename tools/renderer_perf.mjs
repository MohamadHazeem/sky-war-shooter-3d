// Fresh-session benchmark, separate from screenshot encoding and repeated scene construction.
import fs from 'node:fs/promises';
const output=process.env.RENDERER_OUTPUT??'docs/phase10/shots/01';
await fs.mkdir(output,{recursive:true});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--disable-frame-rate-limit','--disable-gpu-vsync']});
try{
 const p=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 await p.addInitScript(()=>{window.requestAnimationFrame=()=>0;localStorage.setItem('sws3d.settings.v2',JSON.stringify({quality:'high',bookends:false,volume:0,radio:false}));let seed=1943;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:5301');await p.waitForFunction(()=>window.sws?.vqa&&sws.assetsReady(),null,{timeout:120000,polling:100});
 await p.evaluate(()=>{sws.vqa.freeze();sws.game.input.lock=()=>{};sws.gallery.setup('fw190');sws.step(48,1/60,true);});
 const device=await p.evaluate(()=>{const gl=sws.engine.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {ua:navigator.userAgent,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};});
 const perf=[];
 for(const tier of ['low','medium','high','ultra','cinematic']){
  const result=await p.evaluate(tier=>{
   const e=sws.engine;sws.vqa.quality(tier);e.renderScale=1;e.resize();sws.gallery.setup('fw190');sws.step(64,1/60,true);
   // Drain queued warm-up work BEFORE timing. Otherwise the first measured readback
   // includes dozens of earlier frames and creates a false 75–440 ms outlier.
   const gl=e.renderer.getContext();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
   const before=new Set(e.renderer.info.programs.map(p=>p.id));
   const samples=[];for(let batch=0;batch<3;batch++)samples.push(sws.bench(90));
   return {tier,samples,newPrograms:e.renderer.info.programs.filter(p=>!before.has(p.id)).map(p=>p.name)};
  },tier);perf.push(result);console.log(JSON.stringify(result));
 }
 await fs.writeFile(`${output}/performance.json`,JSON.stringify({device,viewport:[1920,1080],samplesPerBatch:90,batches:3,method:'sws.bench: fixed 1/60 simulation, GPU-synchronised readback, DRS disabled, Chrome frame-rate limit/vsync disabled; warm-up GPU queue drained before samples; fresh browser without image encoding',perf,errors},null,2));
}finally{await browser.close();}

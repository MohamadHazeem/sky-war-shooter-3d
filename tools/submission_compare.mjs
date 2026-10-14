// Same frozen pose through the original and batched submission paths.
import fs from 'node:fs/promises';
import os from 'node:os';
import {smallJpeg} from './visual_rig.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? `${os.homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`);
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--use-angle=metal','--enable-gpu']});
const counts=[];
const out='docs/phase10/shots/12b/comparison';await fs.mkdir(out,{recursive:true});
try{
 for(const shot of ['formation-chase','waist-interior','damaged-neighbour']){
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:5312/tools/visual-rig.html?shot=${shot}&quality=high`);
  await page.waitForFunction(()=>window.visualRig?.ready||window.visualRig?.error,null,{timeout:180000});
  const shots=await page.evaluate(async()=>{
   const v=visualRig,e=v.engine;if(v.error)throw Error(v.error);
   const result={};
   for(const mode of ['batched','original']){
    if(mode==='original') e.submission.prepare=(s)=>{s.updateMatrixWorld(true);return s;};
    e.temporal.reset();e.post.resetHistory();e.clouds.resetHistory();
    for(let i=0;i<24;i++)e.render(1/60);
    e.renderer.info.autoReset=false;e.renderer.info.reset();e.render(1/60);
    const draws=e.renderer.info.render.calls;e.renderer.info.autoReset=true;
    result[mode]={png:await v.png(),draws};
   }
   return result;
  });
  if(errors.length)throw Error(errors.join('\n'));
  for(const [mode,data]of Object.entries(shots)){await fs.writeFile(`${out}/${shot}-${mode}.jpg`,await smallJpeg(Buffer.from(data.png.split(',')[1],'base64')));counts.push({shot,mode,draws:data.draws});}
  console.log(shot);await page.close();
 }
 await fs.writeFile(`${out}/draws.json`,JSON.stringify(counts,null,2)+'\n');
}finally{await browser.close();}

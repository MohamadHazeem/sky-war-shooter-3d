// Station switching, floating-origin histories and the WebGL multi-draw fallback.
import fs from 'node:fs/promises';
import os from 'node:os';
import {smallJpeg} from './visual_rig.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? `${os.homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`);
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--use-angle=metal','--enable-gpu']});
const out='docs/phase10/shots/12b/validation';await fs.mkdir(out,{recursive:true});const results=[];
try{
 for(const fallback of [false,true]){
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/WebGL|THREE|shader/.test(m.text()))errors.push(m.text());});
  if(fallback)await page.addInitScript(()=>{const get=WebGL2RenderingContext.prototype.getExtension;WebGL2RenderingContext.prototype.getExtension=function(n){return n==='WEBGL_multi_draw'?null:get.call(this,n);};});
  await page.goto('http://127.0.0.1:5312/tools/visual-rig.html?shot=waist-fw190&quality=high');
  await page.waitForFunction(()=>window.visualRig?.ready||window.visualRig?.error,null,{timeout:180000});
  const data=await page.evaluate(async()=>{
   const v=visualRig;if(v.error)throw Error(v.error);const e=v.engine,g=v.game,gl=e.renderer.getContext();
   let compiles=0;const compile=gl.compileShader.bind(gl);gl.compileShader=(s)=>{compiles++;return compile(s);};
   const stations=[];
   for(const id of ['waistL','waistR','top','ball','tail','waistL']){
    g.gunner.setStation(id,true);g.gunner.update(1/60);
    for(let i=0;i<4;i++)e.render(1/60);
    stations.push({id,programs:e.renderer.info.programs.length,compiles});
   }
   // Real rebase invalidates temporal history before the next draw.
   const offset=e.camera.position.clone();offset.y=0;e.rebase(offset);e.camera.position.sub(offset);
   const invalidated=!e.temporal.valid;for(let i=0;i<4;i++)e.render(1/60);
   gl.compileShader=compile;
   return {multiDraw:!!gl.getExtension('WEBGL_multi_draw'),stations,compiles,invalidated,png:await v.png()};
  });
  await fs.writeFile(`${out}/${fallback?'fallback':'stations'}.jpg`,await smallJpeg(Buffer.from(data.png.split(',')[1],'base64')));delete data.png;
  if(errors.length)throw Error(errors.join('\n'));results.push({...data,errors});console.log(fallback?'fallback':'native',JSON.stringify(results.at(-1)));await page.close();
 }
 await fs.writeFile(`${out}/submission.json`,JSON.stringify(results,null,2)+'\n');
}finally{await browser.close();}

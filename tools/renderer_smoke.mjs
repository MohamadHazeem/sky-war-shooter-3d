// Runtime assertions including hardware without WebGPU and without reversed-Z support.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const output=process.env.RENDERER_OUTPUT??'docs/phase10/shots/01';
await fs.mkdir(output,{recursive:true});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const results=[];
try{
 for(const forward of [false,true]){
  const context=await browser.newContext({viewport:{width:1920,height:1080}});
  await context.addInitScript(forward=>{
   Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true});
   if(forward){const get=WebGL2RenderingContext.prototype.getExtension;WebGL2RenderingContext.prototype.getExtension=function(name){return name==='EXT_clip_control'?null:get.call(this,name);};}
   localStorage.setItem('sws3d.settings.v2',JSON.stringify({quality:'low',bookends:false,volume:0,radio:false}));
  },forward);
  const p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&/THREE|shader|WebGL/i.test(m.text()))errors.push(m.text());});
  await p.goto('http://127.0.0.1:5301');await p.waitForFunction(()=>window.sws?.vqa&&sws.assetsReady(),null,{timeout:120000});
  await p.evaluate(()=>{sws.vqa.freeze();sws.game.input.lock=()=>{};sws.gallery.setup('fw190');sws.step(48,1/60,true);});
  const result=await p.evaluate(async forward=>{
   const e=sws.engine,T=sws.vqa.THREE;
   const scans=[],programs=[];
   for(const quality of ['low','high','ultra','cinematic','medium','low']){
    sws.vqa.quality(quality);sws.step(24,1/60,true);
    const before=new Set(e.renderer.info.programs.map(p=>p.id));
    sws.step(80,1/60,true);const added=e.renderer.info.programs.filter(p=>!before.has(p.id)).map(p=>p.id);
    const hdr=sws.vqa.scanHdr();programs.push({quality,added});scans.push({quality,hdr});
   }
   sws.vqa.quality('high');sws.gallery.setup('fw190');sws.step(48,1/60,true);
   const before=new Set(e.renderer.info.programs.map(p=>p.id));
   sws.vqa.mood('night');sws.step(24,1/60,true);sws.vqa.mood('clear');sws.step(24,1/60,true);
   const weatherPrograms=e.renderer.info.programs.filter(p=>!before.has(p.id)).map(p=>({id:p.id,name:p.name,key:p.cacheKey}));
   const texturesBefore=e.renderer.info.memory.textures;
   for(let i=0;i<8;i++)e.refreshLighting(false);
   const texturesAfter=e.renderer.info.memory.textures;
   const projection=e.camera.projectionMatrix.clone();e.render(1/60);
   const projectionRestored=projection.equals(e.camera.projectionMatrix);
   e.rebase(new T.Vector3(15000,0,0));sws.step(2,1/60,true);
   e.camera.position.x+=200;e.render(1/60);const cut=sws.vqa.scanHdr();
   const temporal=e.temporal,ao=sws.vqa.scanHdr(temporal.aoHistory[temporal.index].texture,temporal.aoHistory[temporal.index].width,temporal.aoHistory[temporal.index].height,1000);
   const resolved=sws.vqa.scanHdr(temporal.colorHistory[temporal.index].texture,temporal.colorHistory[temporal.index].width,temporal.colorHistory[temporal.index].height,1000);
   const beforeWeather=e.scene.environment;
   sws.game.setWeather({sunEl:40,sunAz:180,low:.7,high:.5,front:{at:0,to:'overcast',duration:6}});
   const envStart=e.scene.environment;sws.step(240,1/60,false);const frontUpdated=e.scene.environment!==envStart;
   // Studio and mirrored cascade light slots must also compile/render with no missing uniforms.
   const studio=new T.Scene();studio.add(new T.HemisphereLight(0xffffff,0x555555,1));
   for(let i=0;i<3;i++){const l=new T.DirectionalLight(0xffffff,i===0?3:0);l.castShadow=true;l.position.set(3,5,3);studio.add(l,l.target);}
   const mesh=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial());studio.add(mesh);
   const camera=new T.PerspectiveCamera(60,16/9,.1,100);camera.position.z=5;await e.compileStudio(studio,camera);e.renderStudio(studio,camera,1/60);
   const studioScan=sws.vqa.scanHdr();
   // Validate a moving object's velocity on the GPU, including the projection jitter.
   const ts=new T.Scene(),box=new T.Mesh(new T.BoxGeometry(2,2,1),new T.MeshStandardMaterial());ts.add(box);ts.add(new T.HemisphereLight());
   const tc=new T.PerspectiveCamera(60,1,.1,100);tc.position.z=8;tc.updateMatrixWorld();
   const tr=e.temporal;tr.setSize(64,64);tr.reset();
   const target=new T.WebGLRenderTarget(64,64,{type:T.HalfFloatType,depthTexture:new T.DepthTexture(64,64,T.FloatType)});
   function draw(){tc.updateMatrixWorld();tr.begin(tc);e.renderer.setRenderTarget(target);e.renderer.render(ts,tc);tr.render(e.renderer,ts,tc,target,target.depthTexture);tr.end(tc);}
   draw();const previousVP=tr.prevVP.clone();box.position.x=.1;draw();
   const pixel=new Uint16Array(4);e.renderer.readRenderTargetPixels(tr.velocity,32,32,1,1,pixel);
   const vector=Array.from(pixel,v=>T.DataUtils.fromHalfFloat(v));
   // At the centre of the front face the object's translation is .1m. Camera is stationary;
   // expected X includes the saved/current jitter difference.
   const old=new T.Vector4(-.1,0,.5,1).applyMatrix4(previousVP);const now=new T.Vector4(0,0,.5,1).applyMatrix4(tr.prevVP);
   const expected=(old.x/old.w-now.x/now.w)*.5;
   target.dispose();box.geometry.dispose();box.material.dispose();e.resize();
   return {forward,webgpu:!!navigator.gpu,webgl2:e.renderer.getContext() instanceof WebGL2RenderingContext,reversed:e.reversed,scans,programs,weatherPrograms,texturesBefore,texturesAfter,projectionRestored,cut,ao,resolved,frontUpdated,studioScan,vector,expected};
  },forward);
  const jpg=await p.evaluate(()=>{sws.vqa.quality('low');sws.gallery.setup('waist');sws.step(24,1/60,true);return sws.shot(.65);});
  await fs.writeFile(`${output}/fallback-${forward?'forward':'reversed'}-low.jpg`,Buffer.from(jpg.split(',')[1],'base64'));
  if(!forward){
   await p.evaluate(()=>sws.game.startMenu());await p.locator('#title [data-a="settings"]').click();
   await p.locator('#settings summary').click();
   await p.locator('[data-k="quality"]').selectOption('cinematic');await p.locator('[data-k="lensDirt"]').selectOption('false');
   result.settings=await p.evaluate(()=>({quality:sws.engine.quality,lensDirt:sws.engine.post.lensDirt,saved:JSON.parse(localStorage.getItem('sws3d.settings.v2')).lensDirt}));
   assert.equal(result.settings.quality,'cinematic');assert.equal(result.settings.lensDirt,false);assert.equal(result.settings.saved,false);
   await p.evaluate(()=>sws.engine.render(1/60));await p.screenshot({path:`${output}/settings-en.jpg`,type:'jpeg',quality:65});
   await p.locator('[data-lang]').selectOption('ar');await p.locator('#settings summary').click();assert.equal(await p.locator('option[value="cinematic"]').textContent(),'سينمائية');
   assert.match(await p.locator('[data-k="lensDirt"]').locator('..').textContent(),/اتساخ العدسة/);
   await p.evaluate(()=>sws.engine.render(1/60));await p.screenshot({path:`${output}/settings-ar.jpg`,type:'jpeg',quality:65});
  }
  result.errors=errors;results.push(result);
  console.log(JSON.stringify(result,null,2));
  await fs.mkdir(output,{recursive:true});await fs.writeFile(`${output}/smoke.json`,JSON.stringify(results,null,2));
  assert.equal(errors.length,0);assert.equal(result.webgpu,false);assert.equal(result.webgl2,true);assert.equal(result.reversed,!forward);
  assert.ok(Math.abs(result.vector[0]-result.expected)<.001,'object motion vector');assert.equal(result.vector[3],1);
  assert.equal(result.projectionRestored,true);assert.equal(result.frontUpdated,true);
  assert.ok(result.texturesAfter<=result.texturesBefore+1,'PMREM textures must not leak');
  assert.equal(result.weatherPrograms.length,0,'Weather must reuse warmed shaders');
  for(const r of result.programs)assert.equal(r.added.length,0,r.quality+' compiled mid-game');
  for(const scan of [...result.scans.map(s=>s.hdr),result.cut,result.ao,result.resolved,result.studioScan])assert.equal(scan.nan,0);
  await context.close();
 }
}finally{await browser.close();}

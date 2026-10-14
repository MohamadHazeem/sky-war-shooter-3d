// GPU evidence for contact AO, self/formation shadow reception and spatial cloud shadows.
// Use an existing Playwright installation, with Vite on 5301. No dependencies downloaded.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const output=process.env.RENDERER_OUTPUT??'docs/phase10/shots/01b';
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try {
 for(const forward of [false,true]){
  const context=await browser.newContext({viewport:{width:960,height:540}});
  await context.addInitScript(forward=>{
   window.requestAnimationFrame=()=>0;
   localStorage.setItem('sws3d.settings.v2',JSON.stringify({quality:'high',bookends:false,volume:0,radio:false}));
   if(forward){const get=WebGL2RenderingContext.prototype.getExtension;WebGL2RenderingContext.prototype.getExtension=function(name){return name==='EXT_clip_control'?null:get.call(this,name);};}
  },forward);
  const p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  p.on('console',m=>{if(m.type()==='error'&&/THREE|shader|WebGL/i.test(m.text()))errors.push(m.text());});
  await p.goto('http://127.0.0.1:5301');
  await p.waitForFunction(()=>window.sws?.vqa&&sws.assetsReady(),null,{timeout:120000,polling:100});
  const result=await p.evaluate(async()=>{
   const T=sws.vqa.THREE,e=sws.engine,r=e.renderer,tr=e.temporal;
   const SunCascades=e.cascades.constructor;
   const resource=path=>performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname===path).name;
   const {auditMaterial}=await import(resource('/src/render/MaterialAudit.ts'));
   const {cloudSurfaceUniforms:u}=await import(resource('/src/render/CloudSurfaceShadow.ts'));
   const {Atmos}=await import(resource('/src/render/Atmosphere.ts'));
   const scene=new T.Scene(),camera=new T.PerspectiveCamera(50,1,.05,100);
   camera.position.set(2,2.5,4);camera.lookAt(0,0,0);camera.updateMatrixWorld();
   const material=new T.MeshStandardMaterial({color:0xaaaaaa,roughness:.7});auditMaterial(material);
   const floor=new T.Mesh(new T.BoxGeometry(8,.1,8),material);floor.receiveShadow=true;scene.add(floor);
   const wall=new T.Mesh(new T.BoxGeometry(.2,2,3),material);wall.position.set(0,1,-.5);wall.castShadow=true;wall.receiveShadow=true;
   const sun=new T.DirectionalLight();scene.add(sun,sun.target);
   const cascades=new SunCascades(scene,sun,e.reversed);cascades.quality(1024,12,true);
   Atmos.sunDir.set(.7,1,.3).normalize();cascades.update(camera,4);u.swsCloudOn.value=0;
   const target=new T.WebGLRenderTarget(128,128,{type:T.HalfFloatType,depthTexture:new T.DepthTexture(128,128,T.FloatType)});
   tr.setSize(128,128);tr.enabled=true;
   const buffer=new Uint16Array(128*128*4),aoBuffer=new Uint16Array(64*64*4);
   const read=()=>{r.readRenderTargetPixels(target,0,0,128,128,buffer);return Array.from(buffer,T.DataUtils.fromHalfFloat);};
   function render(){camera.updateMatrixWorld();tr.begin(camera);r.setRenderTarget(target);r.render(scene,camera);tr.render(r,scene,camera,target,target.depthTexture);tr.end(camera);}
   function ao(){tr.reset();for(let i=0;i<24;i++)render();r.readRenderTargetPixels(tr.aoHistory[tr.index],0,0,64,64,aoBuffer);let count=0,sum=0,min=1,dark=0;for(let i=0;i<aoBuffer.length;i+=4){const value=T.DataUtils.fromHalfFloat(aoBuffer[i]),depth=T.DataUtils.fromHalfFloat(aoBuffer[i+1]);if(depth>0&&depth<.099){count++;sum+=value;min=Math.min(min,value);if(value<.9)dark++;}}return {mean:sum/count,min,dark,count};}
   const flat=ao();scene.add(wall);cascades.reset();cascades.update(camera,4);const corner=ao();
   // Eliminate temporal jitter for paired shadow visibility measurements.
   tr.enabled=false;
   function raw(){r.setRenderTarget(target);r.render(scene,camera);return read();}
   function diff(a,b){let changed=0,max=0;for(let i=0;i<a.length;i+=4){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);if(d>.03)changed++;}return {max,changed};}
   const shaded=raw();floor.receiveShadow=wall.receiveShadow=false;const unshaded=raw();
   const shadows=diff(shaded,unshaded);
   // A synthetic two-zone upper-deck transmittance map proves the light is sampled
   // spatially on the receivers, independently of camera-based sun dimming.
   const cloud=new T.DataTexture(new Uint8Array([0,0,0,255,255,0,0,255,0,0,0,255,255,0,0,255]),2,2);
   cloud.needsUpdate=true;cloud.minFilter=cloud.magFilter=T.NearestFilter;
   u.swsCloudShadow.value=cloud;u.swsCloudBox.value.set(0,0,12);u.swsCloudSun.value.set(0,1,0);u.swsCloudBase.value=3;u.swsCloudOn.value=1;
   const clouded=raw();u.swsCloudOn.value=0;const clear=raw();const cloudShadow=diff(clouded,clear);
   // A bright rigid object moves off its old footprint: history must not leave a trail.
   floor.visible=wall.visible=false;scene.background=new T.Color(0);
   const mover=new T.Mesh(new T.BoxGeometry(.5,.5,.5),new T.MeshBasicMaterial({color:0xffffff}));scene.add(mover);
   camera.position.set(0,0,4);camera.lookAt(0,0,0);camera.updateMatrixWorld();
   mover.position.x=-.8;tr.enabled=true;tr.reset();for(let i=0;i<24;i++)render();
   mover.position.x=.8;render();
   const ghostPixel=new Uint16Array(4),currentPixel=new Uint16Array(4);
   r.readRenderTargetPixels(tr.colorHistory[tr.index],36,64,1,1,ghostPixel);
   r.readRenderTargetPixels(tr.colorHistory[tr.index],92,64,1,1,currentPixel);
   const disocclusion={oldFootprint:T.DataUtils.fromHalfFloat(ghostPixel[0]),newFootprint:T.DataUtils.fromHalfFloat(currentPixel[0])};
   cloud.dispose();target.dispose();floor.geometry.dispose();wall.geometry.dispose();material.dispose();mover.geometry.dispose();mover.material.dispose();
   return {reversed:e.reversed,flat,corner,shadows,cloudShadow,disocclusion};
  });
  results.push({...result,errors});await fs.writeFile(`${output}/visible-runtime.json`,JSON.stringify(results,null,2));
  assert.equal(errors.length,0);assert.equal(result.reversed,!forward);
  assert.ok(result.flat.mean>.97,'Open plane stays unoccluded');
  assert.ok(result.corner.dark>result.flat.dark+50&&result.corner.mean<result.flat.mean-.005,'Horizon AO resolves the wall/floor crevice');
  assert.ok(result.shadows.max>.1&&result.shadows.changed>20,'Opaque geometry casts visible shadows');
  assert.ok(result.disocclusion.oldFootprint<.02&&result.disocclusion.newFootprint>.9,'No TAA trail at the old object footprint');
  assert.ok(result.cloudShadow.max>.1&&result.cloudShadow.changed>20,'Cloud map visibly modulates receiver lighting');
  console.log(JSON.stringify(result));await context.close();
 }
}finally{await browser.close();}

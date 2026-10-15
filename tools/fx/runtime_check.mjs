// Supplemental temporal/pool checks for Phase 11 FX. Start Vite on 5324.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {smallJpeg} from '../visual_rig.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE??path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const out='docs/phase11/shots/04/runtime';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
const results=[];
try{
 for(const quality of ['high','low']){
  const page=await browser.newPage({viewport:{width:1920,height:1080}});const errors=[],atlasRequests=[];
  page.on('request',r=>{if(/\/fx\/fx_[ab]\.webp/.test(r.url()))atlasRequests.push(r.url());});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/THREE|WebGL|shader/i.test(m.text()))errors.push(m.text());});
  await page.goto(`http://127.0.0.1:5324/tools/visual-rig.html?shot=explosion-close&quality=${quality}`);
  await page.waitForFunction(()=>window.visualRig?.ready||window.visualRig?.error,null,{timeout:180000});
  assert.equal(await page.evaluate(()=>window.visualRig.error),undefined);
  const report=await page.evaluate(async quality=>{
   const r=window.visualRig,e=r.engine,fx=r.game.world.effects;
   const before=e.renderer.info.programs.length;
   const counts=[];
   for(let i=0;i<96;i++){fx.update(1/60);e.heatHaze.update(1/60);if(i%8===0)e.render(1/60);}
   counts.push({age:2,flip:fx.flip.count,ribbons:fx.ribbons.active});
   return {quality,before,counts,atlasSize:[fx.flip.mesh.material.uniforms.tA.value.image.width,fx.flip.mesh.material.uniforms.tA.value.image.height],flipOn:fx.flipOn,flipMax:fx.flip.max,frameMs:await r.benchmark(60)};
  },quality);
  const save=async name=>{const data=await page.evaluate(()=>window.visualRig.png());await fs.writeFile(`${out}/${quality}-${name}.jpg`,await smallJpeg(Buffer.from(data.split(',')[1],'base64')));};
  await save('explosion-2s');
  report.linger=await page.evaluate(()=>{
   const r=window.visualRig,fx=r.game.world.effects;
   for(let i=0;i<360;i++){fx.update(1/60);r.engine.heatHaze.update(1/60);}
   r.engine.post.resetHistory();for(let i=0;i<24;i++)r.engine.render(1/60);
   return {age:8,flip:fx.flip.count,ribbons:fx.ribbons.active,smoke:fx.smoke.count,programs:r.engine.renderer.info.programs.length};
  });
  await save('smoke-8s');
  assert.equal(report.before,report.linger.programs,'No runtime shader variants');
  if(quality==='high'){assert(report.flipOn);assert(report.linger.flip>0,'Smoke persists after the fire');}
  else {assert.equal(report.flipOn,false);assert.deepEqual(atlasRequests,[],'Low does not download atlas');}
  if(quality==='high')assert.deepEqual(report.atlasSize,[4096,3072]);
  report.expired=await page.evaluate(()=>{const fx=window.visualRig.game.world.effects;for(let i=0;i<2400;i++)fx.update(1/60);return {flip:fx.flip.count,ribbons:fx.ribbons.active};});
  assert.deepEqual(report.expired,{flip:0,ribbons:0});
  if(quality==='low'){
   report.flakFallback=await page.evaluate(()=>{
    const r=window.visualRig,fx=r.game.world.effects;
    const Vector3=r.engine.camera.position.constructor;
    fx.clear();fx.flak(r.engine.camera.position.clone().addScaledVector(r.engine.camera.getWorldDirection(new Vector3()),150));fx.update(.05);
    return {volumes:fx.vol.count,smoke:fx.smoke.count,glow:fx.glow.count,flip:fx.flip.count};
   });
   assert.equal(report.flakFallback.volumes,0);assert.equal(report.flakFallback.flip,0);
   assert(report.flakFallback.smoke>0 && report.flakFallback.glow>0);
  }
  if(quality==='high'){
   report.lowSwitch=await page.evaluate(()=>{
    const r=window.visualRig,fx=r.game.world.effects;
    fx.flak(r.engine.camera.position);const started=fx.flip.count;
    fx.setQuality('low');return {started,flip:fx.flip.count,ribbons:fx.ribbons.active,sparks:fx.sparkFx.count,flipOn:fx.flipOn};
   });
   assert(report.lowSwitch.started>0);
   assert.deepEqual({...report.lowSwitch,started:undefined},{started:undefined,flip:0,ribbons:0,sparks:0,flipOn:false});
  }
  assert.deepEqual(errors,[]);results.push({...report,errors});
  await page.close();
 }
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 try {
  await page.goto('http://127.0.0.1:5324/tools/visual-rig.html?shot=damaged-neighbour&quality=high');
  await page.waitForFunction(()=>window.visualRig?.ready||window.visualRig?.error,null,{timeout:180000});
  assert.equal(await page.evaluate(()=>window.visualRig.error),undefined);
  const fuel=await page.evaluate(()=>{
   const r=window.visualRig,e=r.engine,fx=r.game.world.effects;
   const data=fx.flip.mesh.geometry.getAttribute('iD'),n=fx.flip.mesh.geometry.instanceCount;
   let flowing=0;for(let i=0;i<n;i++)if(Math.abs(data.getX(i))+Math.abs(data.getY(i))+Math.abs(data.getZ(i))>0.01)flowing++;
   const shimmers=e.heatHaze.transients.slice(0,e.heatHaze.live).filter(p=>!p.ripple&&p.age<p.life).length;
   const hazeSize=[e.heatHaze.rt.width,e.heatHaze.rt.height];
   e.setQuality('medium');const mediumHaze=e.heatHaze.enabled;
   const lights = fx.lights.filter(s => s.life > 0).map(s => ({range:s.light.distance,intensity:s.intensity}));
   return {flowing,shimmers,mediumHaze,lights,hazeSize};
  });
  assert(fuel.flowing>0);assert(fuel.shimmers>0);assert.equal(fuel.mediumHaze,false);
  assert.deepEqual(fuel.hazeSize,[480,270]);
  assert(fuel.lights.length>0);assert(fuel.lights.every(l=>l.range<=7 && l.intensity<=145));
  results.push({fuel});
 } finally {await page.close();}
 // Same isolated burst, camera and lighting sampled across time: a still cannot prove rolling edges.
 const temporal=await browser.newPage({viewport:{width:1920,height:1080}});
 try {
  await temporal.goto('http://127.0.0.1:5324/tools/visual-rig.html?shot=flak-barrage&quality=high');
  await temporal.waitForFunction(()=>window.visualRig?.ready,null,{timeout:180000});
  await temporal.evaluate(async()=>{
   const Vector3=window.visualRig.engine.camera.position.constructor;
   const r=window.visualRig,fx=r.game.world.effects,c=r.engine.camera;
   fx.clear();fx.flak(c.position.clone().addScaledVector(c.getWorldDirection(new Vector3()),110));
  });
  const frames=[];let age=0;
  for(const next of [.06,.16,.4,1.2,3]){
   await temporal.evaluate(dt=>{const r=window.visualRig;for(let t=0;t<dt-1e-6;t+=1/120)r.game.world.effects.update(Math.min(1/120,dt-t));r.engine.post.resetHistory();for(let i=0;i<24;i++)r.engine.render(1/60);},next-age);age=next;
   const data=await temporal.evaluate(()=>window.visualRig.png());
   const frame=await sharp(Buffer.from(data.split(',')[1],'base64')).resize(480,270).toBuffer();
   frames.push({input:frame,left:(frames.length)*480,top:28});
  }
  const label=Buffer.from(`<svg width="2400" height="28"><rect width="2400" height="28" fill="#151b22"/>${[.06,.16,.4,1.2,3].map((t,i)=>`<text x="${i*480+12}" y="20" fill="white" font-family="sans-serif" font-size="16">Flak: ${t} s</text>`).join('')}</svg>`);
  const strip=await sharp({create:{width:2400,height:298,channels:3,background:'#151b22'}}).composite([...frames,{input:label,left:0,top:0}]).png().toBuffer();
  await fs.writeFile(`${out}/flak-timeline.jpg`,await smallJpeg(strip,2400));
 } finally {await temporal.close();}
}finally{await fs.writeFile(`${out}/checks.json`,JSON.stringify(results,null,2)+'\n');await browser.close();}
console.log(results);

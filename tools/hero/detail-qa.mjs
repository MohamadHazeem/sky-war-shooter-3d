// Supplemental 15–40 m detail views in the production capture-rig scene.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { smallJpeg } from '../visual_rig.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const tag=process.argv[2] ?? 'after', quality=process.env.DETAIL_QUALITY ?? 'high';
const out=`docs/phase11/shots/01/${tag}`;await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--use-angle=metal','--enable-gpu']});
const report={quality,views:[],errors:[]};
try {
 for(const kind of (process.env.DETAIL_KINDS ?? 'b17,fw190,bf109,me262,bf110,ju88').split(',')) {
  const context=await browser.newContext({viewport:{width:1920,height:1080},serviceWorkers:'block'});
  if(process.env.DETAIL_BASELINE) await context.route('**/models/**',async route=>{
   const relative=new URL(route.request().url()).pathname.slice('/models/'.length);
   await route.fulfill({path:path.join(process.env.DETAIL_BASELINE,relative)});
  });
  if(process.env.DETAIL_FALLBACK) await context.route('**/*.ktx2',route=>route.abort());
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(`http://127.0.0.1:5321/tools/visual-rig.html?shot=b17-beauty&quality=${quality}`);
  await page.waitForFunction(()=>window.visualRig?.ready||window.visualRig?.error,null,{timeout:180000});
  const state=await page.evaluate(async ({kind,ktx,night})=>{
   const r=window.visualRig;if(r.error)throw Error(r.error);
   const THREE=await import('/node_modules/three/build/three.module.js');
   const w=r.game.world,b=w.playerBomber;
   // Mesh counts affect Three.js UUID random draws during scene construction. Lock the
   // subject transform explicitly so asset changes cannot alter the comparison pose.
   b.pos.set(110,7620,390);b.quat.identity();b.root.updateMatrixWorld(true);
   if(ktx){
    const hero=await import('/src/world/HeroLook.ts');hero.enableHeroKtx2(r.engine.renderer);
    const models=await import('/src/world/Models.ts');
    // Wait on loaded source skins before cloning the fighter's damage material.
    for(let tries=0;tries<200;tries++){
     const probe=models.instantiate(kind);let ready=false;
     probe.traverse(o=>{if(o.isMesh && o.material.name===`hero_${kind}`)ready=!!o.material.map?.isCompressedTexture;});
     if(ready)break;
     if(tries===199)throw Error('KTX2 did not become ready');
     await new Promise(resolve=>setTimeout(resolve,25));
    }
   }
   if(night){
    const {applyWeather}=await import('/src/render/Weather.ts');
    const {RIG_WEATHER}=await import('/src/dev/VisualRigConfig.ts');
    applyWeather(r.engine,RIG_WEATHER.night);
    const {updateExhausts}=await import('/src/world/Exhaust.ts');
    for(let i=0;i<2;i++)updateExhausts(w.aircraft,w.effects.glow);
    w.effects.glow.update(0);
   }
   let a=b;
   if(kind!=='b17'){
    a=w.spawnEnemy(b.pos.clone().add(new THREE.Vector3(0,60,0)),'beam',1,false,false,kind);
    a.quat.copy(b.quat);a.root.updateMatrixWorld(true);
   }
   for(const plane of w.aircraft)plane.root.visible=plane===a;
   const scale=a.model.scale.x;
   const from=new THREE.Vector3(kind==='b17'?10:12,kind==='b17'?(night?-5:5):5,kind==='b17'?12:10).multiplyScalar(scale).applyQuaternion(a.quat).add(a.pos);
   const at=new THREE.Vector3(0,0,kind==='b17'?2:-1).multiplyScalar(scale).applyQuaternion(a.quat).add(a.pos);
   const cam=r.engine.camera;cam.position.copy(from);cam.lookAt(at);cam.fov=kind==='b17'?46:20;
   await r.lockCamera({position:cam.position.toArray(),quaternion:cam.quaternion.toArray(),fov:cam.fov});
   const textures=[];a.model.traverse(o=>{if(o.isMesh && o.material.name?.startsWith('hero_') && o.material.normalMap)textures.push({name:o.material.name,compressed:!!o.material.map?.isCompressedTexture,normalSize:[o.material.normalMap.image?.width,o.material.normalMap.image?.height]});});
   return {kind,glow:night?{count:w.effects.glow.count,alpha:Array.from(w.effects.glow.iCol.array.slice(0,8)),visible:w.effects.glow.mesh.visible,night:(await import('/src/render/WeatherState.ts')).weatherNow.night}:undefined,subject:{position:a.pos.toArray(),quaternion:a.quat.toArray()},modelRange:from.distanceTo(at)/scale,camera:r.metadata.camera,textures:[...new Map(textures.map(t=>[t.name,t])).values()]};
  },{kind,ktx:!!process.env.DETAIL_KTX2 && kind!=='b17',night:!!process.env.DETAIL_NIGHT});
  const data=await page.evaluate(()=>window.visualRig.png());
  await fs.writeFile(`${out}/close-${kind}.jpg`,await smallJpeg(Buffer.from(data.split(',')[1],'base64'),1440));
  state.frameMs=await page.evaluate(()=>window.visualRig.benchmark(45));report.views.push(state);
  await context.close();console.log(kind,state.modelRange,state.frameMs.mean);
 }
} finally {await browser.close();await fs.writeFile(`${out}/detail.json`,JSON.stringify(report,null,2)+'\n');}
if(report.errors.length)throw Error(report.errors.join('\n'));

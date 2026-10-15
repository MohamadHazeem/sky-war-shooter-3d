// Supplemental 15–40 m detail views in the production capture-rig scene.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { smallJpeg } from '../visual_rig.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const tag=process.argv[2] ?? 'after', quality=process.env.DETAIL_QUALITY ?? 'high';
const out=`docs/phase11/shots/01/${tag}`;await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--use-angle=metal','--enable-gpu']});
const report=process.env.DETAIL_MERGE?JSON.parse(await fs.readFile(`${out}/detail.json`)):{quality,seed:19431008,views:[],errors:[]};
if(report.quality!==quality)throw Error('Partial recapture quality mismatch');
report.complete=false;
try {
 for(const kind of (process.env.DETAIL_KINDS ?? 'b17,fw190,bf109,me262,bf110,ju88,b17-30m,fw190-30m,b17-dusk,b17-beauty,waist-fw190,tail-bf109').split(',')) {
  const fixture=['b17-beauty','waist-fw190','tail-bf109'].includes(kind);
  const context=await browser.newContext({viewport:{width:1920,height:1080},serviceWorkers:'block'});
  if(process.env.DETAIL_BASELINE) await context.route('**/models/**',async route=>{
   const relative=new URL(route.request().url()).pathname.slice('/models/'.length);
   await route.fulfill({path:path.join(process.env.DETAIL_BASELINE,relative)});
  });
  if(process.env.DETAIL_FALLBACK) await context.route('**/*.ktx2',route=>route.abort());
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(`http://127.0.0.1:5321/tools/visual-rig.html?shot=${fixture?kind:'b17-beauty'}&quality=${quality}`);
  await page.waitForFunction(()=>window.visualRig?.ready||window.visualRig?.error,null,{timeout:180000});
  const state=await page.evaluate(async ({view,fixture,ktx,night})=>{
   const kind=view.split('-')[0], range30=view.endsWith('-30m'), dusk=view.endsWith('-dusk');
   const r=window.visualRig;if(r.error)throw Error(r.error);
   const THREE=await import('/node_modules/three/build/three.module.js');
   const w=r.game.world,b=w.playerBomber;
   // Mesh counts affect Three.js UUID random draws during scene construction. Lock the
   // subject transform explicitly so asset changes cannot alter the comparison pose.
   for(const [i,plane] of w.bombers().entries()){
    plane.pos.set(110+(i%3-1)*85,7620+Math.floor(i/3)*22,295-Math.floor(i/3)*95);
    plane.quat.identity();
   }
   b.pos.set(110,7620,390);
   // Lock moving model parts too: no asset-dependent prop/turret RNG in comparisons.
   const articulated=/^(prop_\d+|blades_.*|ctl_.*|turret_.*)$/;
   const freezeParts=a=>a.model.traverse(o=>{
    if(articulated.test(o.name)) { o.rotation.set(0,0,0);o.updateMatrix(); }
   });
   for(const plane of w.aircraft){freezeParts(plane);plane.root.updateMatrixWorld(true);}
   if(fixture && view!=='b17-beauty'){
    const gun=r.game.gunner,st=gun.state;
    st.yaw=st.tYaw=st.pitch=st.tPitch=st.vYaw=st.vPitch=0;
    gun.update(0);r.engine.camera.updateMatrixWorld(true);
    const enemy=w.aircraft.find(a=>a.team==='axis') ?? w.aircraft.find(a=>a.kind===(view==='waist-fw190'?'fw190':'bf109'));
    if(!enemy)throw Error('Missing fixture fighter');
    const tail=view==='tail-bf109';
    enemy.pos.copy(r.engine.camera.position).addScaledVector(r.engine.camera.getWorldDirection(new THREE.Vector3()),tail?180:150);
    enemy.quat.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...(tail?[.15,-.65,1]:[-1,-.08,.3])).normalize());
    enemy.root.rotateZ(tail?.4:-.45);enemy.root.updateMatrixWorld(true);
   }
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
   if(!fixture){
    const {applyWeather}=await import('/src/render/Weather.ts');
    const {RIG_WEATHER}=await import('/src/dev/VisualRigConfig.ts');
    applyWeather(r.engine,dusk?{...RIG_WEATHER.sunset,sunAz:55,sunEl:10,low:.15}:night?RIG_WEATHER.night:{...RIG_WEATHER.clear,sunAz:55,sunEl:38,low:.15});
    const {updateExhausts}=await import('/src/world/Exhaust.ts');
    for(let i=0;i<2;i++)updateExhausts(w.aircraft,w.effects.glow);
    w.effects.glow.update(0);
   }
   let a=b;
   if(!fixture && kind!=='b17'){
    a=w.spawnEnemy(b.pos.clone().add(new THREE.Vector3(0,60,0)),'beam',1,false,false,kind);
    a.quat.copy(b.quat);freezeParts(a);a.root.updateMatrixWorld(true);
   }
   if(!fixture)for(const plane of w.aircraft)plane.root.visible=plane===a;
   const scale=a.model.scale.x;
   const from=new THREE.Vector3(kind==='b17'?10:12,kind==='b17'?(night?-5:5):5,kind==='b17'?12:10).multiplyScalar(scale).applyQuaternion(a.quat).add(a.pos);
   const at=new THREE.Vector3(0,0,kind==='b17'?2:-1).multiplyScalar(scale).applyQuaternion(a.quat).add(a.pos);
   const cam=r.engine.camera;
   if(!fixture){
    if(range30){const offset=from.clone().sub(at).normalize().multiplyScalar(30*scale);from.copy(at).add(offset);
     if(Math.abs(from.distanceTo(at)/scale-30)>1e-6)throw Error('Invalid 30 m camera range');}
    cam.position.copy(from);cam.lookAt(at);cam.fov=kind==='b17'?46:20;
   }else if(view==='b17-beauty'){
    cam.position.copy(b.localToWorld(new THREE.Vector3(19,8,24)));cam.lookAt(b.pos);cam.fov=45;
   }
   await r.lockCamera({position:cam.position.toArray(),quaternion:cam.quaternion.toArray(),fov:cam.fov});
   const pose=plane=>{
    const parts=[];plane.model.traverse(o=>{if(articulated.test(o.name))parts.push({name:o.name,quaternion:o.quaternion.toArray()});});
    return {kind:plane.kind,position:plane.pos.toArray(),quaternion:plane.quat.toArray(),scale:plane.model.scale.toArray(),parts:parts.sort((a,b)=>a.name.localeCompare(b.name))};
   };
   const textures=[];a.model.traverse(o=>{if(o.isMesh && o.material.name?.startsWith('hero_') && o.material.normalMap)textures.push({name:o.material.name,compressed:!!o.material.map?.isCompressedTexture,normalSize:[o.material.normalMap.image?.width,o.material.normalMap.image?.height]});});
   return {kind:view,weather:dusk?{sunEl:10,sunAz:55,low:.15,mood:'dusk'}:night?{mood:'night'}:!fixture?{sunEl:38,sunAz:55,low:.15}:r.metadata.weather,fixture,aircraft:fixture?w.aircraft.map(pose):undefined,glow:(night||dusk)?{count:w.effects.glow.count,alpha:Array.from(w.effects.glow.iCol.array.slice(0,8)),visible:w.effects.glow.mesh.visible,night:(await import('/src/render/WeatherState.ts')).weatherNow.night}:undefined,subject:pose(a),modelRange:fixture?cam.position.distanceTo(b.pos)/scale:from.distanceTo(at)/scale,camera:r.metadata.camera,textures:[...new Map(textures.map(t=>[t.name,t])).values()]};
  },{view:kind,fixture,ktx:!!process.env.DETAIL_KTX2 && !fixture && !kind.startsWith('b17'),night:!!process.env.DETAIL_NIGHT});
  // Compact exact pose fingerprints avoid repeating thousands of identical pivots.
  for(const pose of [state.subject,...(state.aircraft ?? [])]){
   const parts=pose.parts;pose.parts={count:parts.length,sha256:createHash('sha256').update(JSON.stringify(parts)).digest('hex')};
  }
  const data=await page.evaluate(()=>window.visualRig.png());
  await fs.writeFile(`${out}/${fixture?kind:'close-'+kind}.jpg`,await smallJpeg(Buffer.from(data.split(',')[1],'base64'),1440));
  state.frameMs=await page.evaluate(()=>window.visualRig.benchmark(45));const previous=report.views.findIndex(v=>v.kind===kind);
  if(previous<0)report.views.push(state);else report.views[previous]=state;
  await context.close();console.log(kind,state.modelRange,state.frameMs.mean);
 }
 report.complete=true;
} finally {await browser.close();await fs.writeFile(`${out}/detail.json`,JSON.stringify(report,null,2)+'\n');}
if(report.errors.length)throw Error(report.errors.join('\n'));

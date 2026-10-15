// Uses an already installed Playwright; never installs a browser or dependency.
import fs from 'node:fs/promises';
import sharp from 'sharp';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out=process.env.HERO_QA_OUT || 'docs/phase10/shots/02c';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--autoplay-policy=no-user-gesture-required']});
const results={};
try {
 for(const mode of (process.env.HERO_QA_MODES?.split(',') ?? ['legacy','hero','fallback','low-start'])) {
  const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
  await context.addInitScript(mode=>{
   localStorage.setItem('sws3d.lang','en');localStorage.setItem('sws3d.settings.v2',JSON.stringify({quality:mode==='low-start'?'low':'high',bookends:false}));localStorage.setItem('sws3d.onboarding.v1',JSON.stringify({promptDismissed:true}));
   let seed=1944;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  },mode);
  if(mode==='legacy')await context.route('**/models/hero/b17.glb',route=>route.fulfill({path:'public/models/b17.glb',contentType:'model/gltf-binary'}));
  if(mode==='fallback')await context.route('**/models/hero/*.ktx2',route=>route.request().url().endsWith('/base.ktx2')?route.fulfill({body:Buffer.from('invalid KTX2 for fallback QA')}):route.abort());
  const page=await context.newPage(),errors=[],warnings=[],detailRequests=[];page.on('request',r=>{if(/models\/hero\/.*\.(ktx2|webp)$/.test(r.url()))detailRequests.push(r.url());});page.on('pageerror',e=>{errors.push(e.message);console.log(mode,'ERROR',e.stack);});page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
  console.log(mode,'loading');await page.goto(process.env.HERO_QA_URL || 'http://127.0.0.1:5302');console.log(mode,'page loaded');await page.waitForFunction(()=>window.sws?.assetsReady()&&sws.vqa,null,{timeout:120000});
  console.log(mode,'ready');
  if(mode==='low-start'){
   const state=await page.evaluate(()=>{sws.vqa.freeze();sws.gallery.setup('formation');return {quality:sws.engine.quality,hero:!!sws.game.world.playerBomber.model.getObjectByName('B17G_HERO'),props:sws.game.world.playerBomber.props.length,bench:sws.bench(45)};});
   results[mode]={...state,detailRequests,errors,warnings};await context.close();console.log(mode,JSON.stringify(results[mode]));continue;
  }
  await page.evaluate(async()=>{sws.vqa.freeze();await import('/src/world/HeroTextures.ts').then(m=>m.loadHeroTextures(sws.engine.renderer));});
  const shot=async name=>{const data=await page.evaluate(()=>{sws.engine.time=12;sws.engine.post.resetHistory();for(let i=0;i<24;i++)sws.engine.render(1/60);return sws.shot();});await sharp(Buffer.from(data.split(',')[1],'base64')).resize({width:1100}).jpeg({quality:84}).toFile(`${out}/${mode}-${name}.jpg`);};
  for(const camera of ['formation','waist']) {await page.evaluate(c=>sws.gallery.setup(c),camera);await shot(camera);}
  await page.evaluate(()=>{sws.gallery.setup('formation');const b=sws.game.world.playerBomber,V=sws.vqa.THREE.Vector3;sws.vqa.look(b.localToWorld(new V(25,11,29)),b.localToWorld(new V(0,0,-3)),46);});await shot('beauty');
  await page.evaluate(()=>{const b=sws.game.world.playerBomber,V=sws.vqa.THREE.Vector3;sws.vqa.look(b.localToWorld(new V(15,8,32)),b.localToWorld(new V(-20,-4,-28)),60);});await shot('formation-detail');

  await page.evaluate(()=>{const b=sws.game.world.playerBomber,V=sws.vqa.THREE.Vector3;sws.vqa.look(b.localToWorld(new V(10,4,12)),b.localToWorld(new V(0,0,2)),46);});await shot('close');
  const propsAtRpm=await page.evaluate(()=>{const b=sws.game.world.playerBomber;return [0,.15,.5,1].map(rpm=>{b.updateProps(.1,rpm);return {rpm,blades:b.props.every(p=>p.blades.every(o=>o.visible)),disc:b.props[0].disc.visible,opacity:b.props[0].disc.material.opacity};});});
  if(mode==='hero') {await page.evaluate(()=>sws.game.world.playerBomber.updateProps(.1,.15));await shot('idle');await page.evaluate(()=>sws.game.world.playerBomber.updateProps(.1,1));}

  const state=await page.evaluate(()=>{const b=sws.game.world.playerBomber, mats=new Map();b.model.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(/^hero_skin/.test(m.name)&&!m.name.includes('_low'))mats.set(m.name,{compressed:!!m.map?.isCompressedTexture,width:m.map?.image?.width,height:m.map?.image?.height,normal:!!m.normalMap,ao:!!m.aoMap});});const stencil=b.model.getObjectByName('part_core_hero_stencils_lod');return {stencil:!!stencil,hero:!!b.model.getObjectByName('B17G_HERO'),props:b.props.length,textures:[...mats.values()],scan:sws.vqa.scan(),bench:sws.bench(45)};});
  {
   await page.evaluate(async()=>{const b=sws.game.world.playerBomber;const {applyPaint}=await import('/src/render/Paint.ts');applyPaint(b.model,'silver');const V=sws.vqa.THREE.Vector3;sws.vqa.look(b.localToWorld(new V(25,11,29)),b.localToWorld(new V(0,0,-3)),46);});await shot('silver');
   if(mode!=='legacy') {
   await page.evaluate(async()=>{const b=sws.game.world.playerBomber;const {applyPaint}=await import('/src/render/Paint.ts');applyPaint(b.model,'olive');b.controls.setGear(0);b.controls.update(3,true);b.engineDead[0]=true;b.updateProps(.1);const V=sws.vqa.THREE.Vector3;sws.vqa.look(b.localToWorld(new V(19,-10,22)),b.localToWorld(new V(0,0,-3)),48);});await shot('mechanics');
   state.mechanics=await page.evaluate(()=>{const b=sws.game.world.playerBomber;return {bay:b.model.getObjectByName('bomb_bay_L').rotation.z,gear:b.model.getObjectByName('gear_L').rotation.x,deadDisc:b.props[0].disc.visible,runningDisc:b.props[1].disc.visible};});
   state.lods=await page.evaluate(()=>{const b=sws.game.world.playerBomber,V=sws.vqa.THREE.Vector3;b.controls.setGear(1);b.controls.update(10,false);b.engineDead[0]=false;b.updateProps(.1);let result=[];for(const [quality,distance] of [['high',60],['high',300],['high',900],['low',60]]){sws.vqa.quality(quality);sws.vqa.look(b.localToWorld(new V(distance,20,20)),b.pos,50,3);let levels=[0,0,0];b.model.traverse(o=>{if(o.isLOD)o.levels.forEach((l,i)=>{if(l.object.visible)levels[i]++;});});result.push({quality,distance,levels});}return result;});
   }
   await page.evaluate(()=>{sws.vqa.quality('low');sws.gallery.setup('formation');});await shot('low-formation');
   await page.evaluate(()=>{const b=sws.game.world.playerBomber,V=sws.vqa.THREE.Vector3;sws.vqa.look(b.localToWorld(new V(25,11,29)),b.localToWorld(new V(0,0,-3)),46);});await shot('low-beauty');
   state.lowBench=await page.evaluate(()=>sws.bench(45));
   await page.evaluate(async()=>{const {applyPaint}=await import('/src/render/Paint.ts');applyPaint(sws.game.world.playerBomber.model,'silver');const b=sws.game.world.playerBomber,V=sws.vqa.THREE.Vector3;sws.vqa.look(b.localToWorld(new V(25,11,29)),b.localToWorld(new V(0,0,-3)),46);});await shot('low-silver');
   await page.evaluate(async()=>{const {applyPaint}=await import('/src/render/Paint.ts');applyPaint(sws.game.world.playerBomber.model,'olive');});
   state.programs=await page.evaluate(()=>{const b=sws.game.world.playerBomber,V=sws.vqa.THREE.Vector3;sws.vqa.quality('high');for(const distance of [60,300,900,60])sws.vqa.look(b.localToWorld(new V(distance,20,20)),b.pos,50,4);const before=new Set(sws.engine.renderer.info.programs.map(p=>p.id));for(const distance of [60,300,900,60])sws.vqa.look(b.localToWorld(new V(distance,20,20)),b.pos,50,4);return {before:before.size,after:sws.engine.renderer.info.programs.length,added:sws.engine.renderer.info.programs.filter(p=>!before.has(p.id)).length};});
  }
  results[mode]={...state,propsAtRpm,errors,warnings};await context.close();console.log(mode,JSON.stringify(results[mode]));
 }
}finally{await browser.close();await fs.writeFile(`${out}/browser.json`,JSON.stringify(results,null,2)+'\n');}
if(Object.values(results).some(r=>r.errors.length))throw Error('Browser errors');
if(results['low-start'] && (results['low-start'].quality!=='low'||results['low-start'].detailRequests.length))throw Error('Low startup streamed detail');
if(results.hero && (results.hero.props!==4||results.hero.textures.length===0))throw Error('Hero pivot/material contract');
if((results.hero && !results.hero.textures.every(t=>t.compressed))||(results.fallback && !results.fallback.textures.every(t=>!t.compressed)))throw Error('Texture fallback contract');

if(results.legacy && results.hero) for(const view of ['close','beauty','waist','formation','silver','low-beauty','formation-detail','low-silver']) {
 const images=await Promise.all(['legacy','hero'].map(mode=>sharp(`${out}/${mode}-${view}.jpg`).resize(960).toBuffer()));
 const {height}=await sharp(images[0]).metadata();
 const label=Buffer.from(`<svg width="1920" height="44"><rect width="1920" height="44" fill="#17202a"/><g fill="white" font-family="sans-serif" font-size="23"><text x="20" y="30">LEGACY | ${view}</text><text x="980" y="30">HERO | ${view}</text></g></svg>`);
 await sharp({create:{width:1920,height:height+44,channels:3,background:'#17202a'}}).composite([{input:label,top:0,left:0},{input:images[0],left:0,top:44},{input:images[1],left:960,top:44}]).jpeg({quality:88}).toFile(`${out}/compare-${view}.jpg`);
}

if(results.hero && (!results.hero.propsAtRpm.every(p=>p.blades)||results.hero.propsAtRpm[1].disc||!results.hero.propsAtRpm[3].disc))throw Error('Hero RPM visibility regression');

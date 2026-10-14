// Existing Playwright only: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tools/renderer_check.mjs before|after
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const stage = process.argv[2] ?? 'after';
const out = `docs/phase10/shots/01/${stage}`;
const reference=stage==='after'?JSON.parse(await fs.readFile('docs/phase10/shots/01/before/results.json','utf8')):null;
await fs.mkdir(out, {recursive:true});
const browser = await chromium.launch({channel:'chrome', headless:true, args:['--autoplay-policy=no-user-gesture-required']});
const ctx = await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const errors=[]; const results={shots:[],perf:[],errors};
// Pose arrays are machine input; keep them compact so the reviewable metrics stay readable.
function encode(result){
 const snapshots=result.shots.map(shot=>shot.snapshot);
 const printable={...result,shots:result.shots.map((shot,i)=>({...shot,snapshot:'POSE'+i}))};
 return JSON.stringify(printable,null,2).replace(/"POSE(\d+)"/g,(_,i)=>JSON.stringify(snapshots[Number(i)]));
}
await ctx.addInitScript(()=>{
 // Keep boot/menu scheduling out of the seeded simulation. Every frame is explicit.
 window.requestAnimationFrame=()=>0;
 localStorage.setItem('sws3d.settings.v2',JSON.stringify({quality:'high',bookends:false,volume:0,radio:false,music:false}));
 localStorage.setItem('sws3d.onboarding.v1',JSON.stringify({promptDismissed:true}));
 let seed=1943;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
});
const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error' && /THREE|shader|WebGL|GL_INVALID/i.test(m.text()))errors.push(m.text());});
try {
 await page.goto('http://127.0.0.1:5301');
 await page.waitForFunction(()=>window.sws?.vqa&&sws.assetsReady(),null,{timeout:180000,polling:100});
 await page.evaluate(()=>{sws.vqa.freeze();sws.game.input.lock=()=>{};});
 results.device=await page.evaluate(()=>{const gl=sws.engine.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {ua:navigator.userAgent,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),webgl2:gl instanceof WebGL2RenderingContext,reversed:sws.engine.reversed};});
 const names=['waist','tail','top','ball','beauty','formation','cloudsea','sunset','overcast','night','explosion','flak','damaged','interior','bomb-run','p51'];
 for(const name of names){
  const ref=reference?.shots.find(s=>s.name===name)?.snapshot;
  const data=await page.evaluate(async ({name,ref})=>{
   const s=sws,g=s.game,e=s.engine,T=s.vqa.THREE;
   const atmosphereURL=performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname==='/src/render/Atmosphere.ts').name;
   const {Atmos}=await import(atmosphereURL);
   e.time=0;s.gallery.setup(name==='beauty'?'formation':name==='sunset'?'sunlow':['formation','cloudsea','p51','top'].includes(name)?name:'fw190');
   if(name==='beauty')s.gallery.surface('paint-olive');
   if(name==='tail'||name==='ball'){s.vqa.gunner(name);s.step(1,1/60,false);}
   if(name==='interior'){s.vqa.gunner('waistR',{lookYaw:1.4,lookPitch:-.1});s.step(1,1/60,false);}
   if(name==='overcast'||name==='night')s.vqa.mood(name);
   if(name==='bomb-run'){
    g.startMission(s.CAMPAIGN.find(m=>m.id==='m11'));s.step(360,1/60,false);g.gunner.detach();
    const aim=g.target.aimPoint;e.camera.position.set(aim.x-Atmos.originOffset.x,7600,aim.y-Atmos.originOffset.z);e.camera.up.set(0,0,-1);e.camera.lookAt(e.camera.position.x,0,e.camera.position.z);e.camera.fov=48;e.camera.updateProjectionMatrix();
   }
   if(name==='overcast')g.setWeather({sunEl:40,sunAz:180,low:.9,high:.95,mood:'overcast',preset:'lightRain'});
   // Persist root poses as well as the camera: audio cooldowns may consume random values
   // during simulation. The paired render must compare exactly the same staged geometry.
   const groups=e.scene.children.filter(o=>o.isGroup);
   if(ref){
    if(groups.length!==ref.groups.length)throw new Error(name+' root count mismatch');
    e.camera.position.fromArray(ref.camera.position);e.camera.quaternion.fromArray(ref.camera.quaternion);e.camera.up.fromArray(ref.camera.up);e.camera.fov=ref.camera.fov;e.camera.updateProjectionMatrix();
    groups.forEach((o,i)=>{o.position.fromArray(ref.groups[i].p);o.quaternion.fromArray(ref.groups[i].q);o.scale.fromArray(ref.groups[i].s);o.updateMatrixWorld(true);});
    Atmos.windOffset.fromArray(ref.wind);Atmos.originOffset.fromArray(ref.origin);
   }
   e.camera.updateMatrixWorld();
   const snapshot={camera:{position:e.camera.position.toArray(),quaternion:e.camera.quaternion.toArray(),up:e.camera.up.toArray(),fov:e.camera.fov},groups:groups.map(o=>({p:o.position.toArray(),q:o.quaternion.toArray(),s:o.scale.toArray()})),wind:Atmos.windOffset.toArray(),origin:Atmos.originOffset.toArray()};
   let seed=1943;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
   const at=e.camera.position.clone().addScaledVector(e.camera.getWorldDirection(new T.Vector3()),60);
   if(name==='explosion')g.world.effects.explosion(at,new T.Vector3(),1.5);
   if(name==='flak')for(let i=0;i<12;i++)g.world.effects.flak(at.clone().add(new T.Vector3((i%4-2)*20,Math.floor(i/4)*10,30)));
   if(name==='damaged'){
    const b=g.world.bombers().filter(b=>b!==g.world.playerBomber).sort((a,b)=>Math.abs(a.pos.clone().project(e.camera).x)-Math.abs(b.pos.clone().project(e.camera).x))[0];
    for(let i=0;i<18;i++)g.world.effects.trail(b.pos.clone().add(new T.Vector3(0,0,-i*2)),new T.Vector3(),2,true,2,.4);
   }
   if(name==='tail'){const f=g.world.spawnEnemy(at.clone().add(new T.Vector3(0,12,0)),'stern',1,false,false,'bf109');f.root.lookAt(e.camera.position);f.root.rotateZ(.7);}
   g.world.effects.update(.25);e.precipitation.update(1/60,e.time,e.quality);
   e.post.resetHistory();e.clouds.resetHistory();
   for(let i=0;i<32;i++)e.render(1/60);
   const camera={position:e.camera.position.toArray(),quaternion:e.camera.quaternion.toArray(),fov:e.camera.fov};
   const scan=s.vqa.scan({ldr:false});e.render(1/60);
   return {snapshot,jpg:e.renderer.domElement.toDataURL('image/jpeg',.65),scan,camera,programs:e.renderer.info.programs.length};
  },{name,ref});
  await fs.writeFile(`${out}/${name}.jpg`,Buffer.from(data.jpg.split(',')[1],'base64'));delete data.jpg;
  results.shots.push({name,...data});console.log(stage,name,JSON.stringify(data.scan));
 }
 for(const tier of stage==='before'?['low','medium','high','ultra']:['low','medium','high','ultra','cinematic']){
  const r=await page.evaluate(tier=>{const s=sws,e=s.engine;s.vqa.quality(tier);e.renderScale=1;e.resize();s.gallery.setup('fw190');s.step(32,1/60,true);const programs=e.renderer.info.programs.length;const stats=s.bench(90);return {tier,...stats,newPrograms:stats.programs-programs};},tier);
  results.perf.push(r);console.log(r);
 }
 await fs.writeFile(`${out}/results.json`,encode(results));
 if(process.argv.includes('--probe'))results.probe=await page.evaluate(async()=>{const {probe}=await import('/src/dev/rendererProbe.ts');return probe();});
 await fs.writeFile(`${out}/results.json`,encode(results));
 console.log('errors',errors);
 assert.equal(errors.length,0,'Browser/shader errors');
 for(const shot of results.shots)assert.equal(shot.scan.hdr.nan,0,shot.name+' HDR NaN');
} finally {await browser.close();}

// Same six-second formation, poses, light and camera on LIVE production and this task.
// Run through tools/heavy.sh. Uses only the installed Playwright headless shell.
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
const pw=process.env.PLAYWRIGHT_MODULE ?? path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const {chromium}=await import(pathToFileURL(pw).href);
const out='docs/phase11/shots/23';
const live='https://sky-war-shooter-3d.mhamadhazeem2001.workers.dev';
const local=process.env.ESCORT_URL ?? 'http://127.0.0.1:5423';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--use-angle=metal','--enable-gpu','--autoplay-policy=no-user-gesture-required']});
const results=[];
const shots=['p47d','spitfire9','stream','p47d-close','spitfire9-close'];
try {
 for(const [tag,url,quality] of [['live',live,'high'],['after',local,'high'],['low',local,'low']]) {
  const context=await browser.newContext({viewport:{width:1920,height:1080},serviceWorkers:'block'});
  await context.addInitScript(q=>{
   let seed=19431008;Math.random=()=>{seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};
   window.requestAnimationFrame=()=>0;
   localStorage.setItem('sws3d.settings.v2',JSON.stringify({quality:q,bookends:false,analytics:false,autoQuality:false,killcam:false}));
   localStorage.setItem('sws3d.onboarding.v1',JSON.stringify({promptDismissed:true}));
  },quality);
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/THREE|WebGL|shader/i.test(m.text()))errors.push(m.text());});
  console.log('loading',tag);
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.sws?.assetsReady(),null,{timeout:180000,polling:100});
  console.log('ready',tag);
  const scripts=await page.evaluate(()=>[...document.scripts].map(s=>s.src).filter(Boolean));
  const setup=await page.evaluate(()=>{
   let seed=19431008;Math.random=()=>{seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};
   const g=window.game,e=window.engine,w=g.world;
   g.input.lock=()=>{};g.bookends.auto=true;
   g.startMission({...sws.CAMPAIGN[0],id:'escort-qa',number:0,role:'gunner',bombers:18,waves:[],duration:10000,escorts:0,escortArrive:undefined,flak:undefined,specials:false,midRound:false,boss:false,
    weather:{sunEl:40,sunAz:140,low:.55,high:.2,contrails:true}});
   e.onFrame=dt=>w.update(dt);e.beforeFrame=undefined;e.time=0;w.time=0;
   sws.step(360,1/60,false);e.onFrame=undefined;g.gunner.detach();
   const b=w.playerBomber,V=(x,y,z)=>b.pos.clone().set(x,y,z);
   const fighters=['p47d','spitfire9'].map((kind,i)=>w.spawnEscort(b.pos.clone().add(V(i? -24:24,5,9)),V(i?-24:24,5,9),kind));
   fighters.forEach(f=>{f.quat.copy(b.quat);f.updateProps(1/60,1);f.root.updateMatrixWorld(true);});
   window.escortQA={fighters,V};
   const style=document.createElement('style');style.textContent='body > :not(#app):not(script):not(style){display:none!important} #app{position:fixed;inset:0}';document.head.append(style);
   return {kinds:fighters.map(f=>f.kind),worldTime:w.time,quality:e.quality,formation:w.bombers().length};
  });
  for(const shot of shots) {
   if(tag==='low'&&shot.endsWith('-close'))continue;
   const reference=results.find(r=>r.tag==='live'&&r.shot===shot);
   const fact=await page.evaluate(({shot,reference})=>{
    const g=window.game,e=window.engine,{fighters,V}=window.escortQA,b=g.world.playerBomber;
    if(reference) {
     fighters.forEach((a,i)=>{a.pos.fromArray(reference.poses[i].position);a.quat.fromArray(reference.poses[i].quaternion);a.root.updateMatrixWorld(true);});
     b.pos.fromArray(reference.bomberPose.position);b.quat.fromArray(reference.bomberPose.quaternion);b.root.updateMatrixWorld(true);
    }
    const f=fighters[shot.startsWith('spitfire9')?1:0];
    fighters.forEach(a=>a.root.visible=shot==='stream'||a===f);
    const target=shot==='stream'?b.pos.clone().add(V(0,3,6)):f.pos.clone();
    const offset=shot==='stream'?V(44,21,54):shot.endsWith('-close')?V(9,4.5,11):V(13,6.5,16);
    e.camera.position.copy(target).add(offset);e.camera.up.set(0,1,0);e.camera.lookAt(target);e.camera.fov=shot==='stream'?52:42;e.camera.updateProjectionMatrix();e.camera.updateMatrixWorld(true);
    if(reference){e.camera.position.fromArray(reference.camera.position);e.camera.quaternion.fromArray(reference.camera.quaternion);e.camera.fov=reference.camera.fov;e.camera.updateProjectionMatrix();e.camera.updateMatrixWorld(true);}
    e.post.resetHistory();e.clouds.resetHistory();for(let i=0;i<24;i++)e.render(1/60);
    return {shot,bomberPose:{position:b.pos.toArray(),quaternion:b.quat.toArray()},camera:{position:e.camera.position.toArray(),quaternion:e.camera.quaternion.toArray(),fov:e.camera.fov},poses:fighters.map(a=>({kind:a.kind,position:a.pos.toArray(),quaternion:a.quat.toArray()})),programs:e.renderer.info.programs.length};
   },{shot,reference});
   const data=await page.evaluate(()=>sws.shot(.86));
   const source=Buffer.from(data.split(',')[1],'base64'),size=await sharp(source).metadata();
   await fs.writeFile(`${out}/${tag}-${shot}.jpg`,await sharp(source).resize(1280).jpeg({quality:83}).toBuffer());
   const perf=await page.evaluate(()=>{
    const e=window.engine,gl=e.renderer.getContext(),times=[];
    const before=e.renderer.info.programs.length;
    for(let i=0;i<30;i++){const t=performance.now();e.render(1/60);gl.finish();times.push(performance.now()-t);}
    times.sort((a,b)=>a-b);return {mean:times.reduce((a,b)=>a+b,0)/times.length,p95:times[28],method:'30 frozen full-render frames + gl.finish; excludes simulation',programsBefore:before,programsAfter:e.renderer.info.programs.length};
   });
   if(errors.length)throw new Error(`${tag}/${shot}: ${errors.join('; ')}`);
   if(perf.programsBefore!==perf.programsAfter)throw new Error(`${tag}/${shot}: shader compiled during measurement`);
   results.push({tag,url,scripts,quality,renderSize:[size.width,size.height],savedSize:[1280,720],...setup,...fact,perf,errors});
   console.log(tag,shot,setup.kinds,perf.mean.toFixed(1),errors);
  }
  if(tag==='after') {
   const flight=await page.evaluate(()=>{
    const g=window.game,e=window.engine,w=g.world;
    g.startMission({...sws.CAMPAIGN[0],id:'escort-flight-qa',number:0,role:'pilot',bombers:12,escorts:3,waves:[],duration:10000,escortArrive:undefined,flak:undefined,specials:false,midRound:false,boss:false});
    e.onFrame=dt=>w.update(dt);sws.step(900,1/60,false);e.onFrame=undefined;
    const allies=w.aircraft.filter(a=>a.team==='allied'&&a.kind!=='b17');
    return allies.map(a=>({kind:a.kind,player:a.isPlayer,position:a.pos.toArray(),speed:a.vel.length(),alive:a.alive}));
   });
   if(!['p47d','spitfire9'].every(k=>flight.some(a=>a.kind===k&&a.alive&&a.position.every(Number.isFinite)&&a.position[1]>1000&&a.speed>50)))throw new Error('Escort flight smoke failed');
   await fs.writeFile(`${out}/flight-smoke.json`,JSON.stringify(flight,null,2)+'\n');
  }
  await context.close();
 }
 await fs.writeFile(`${out}/comparison.json`,JSON.stringify(results,null,2)+'\n');
 for(const shot of shots){
  const width=shot.endsWith('-close')?960:640,height=width*9/16;
  const a=await sharp(`${out}/live-${shot}.jpg`).resize(width).toBuffer(),b=await sharp(`${out}/after-${shot}.jpg`).resize(width).toBuffer();
  const label=Buffer.from(`<svg width="${width*2}" height="28"><rect width="100%" height="28" fill="#17202a"/><text x="12" y="20" fill="white" font-family="sans-serif" font-size="16">LIVE main — P-51 escorts</text><text x="${width+12}" y="20" fill="white" font-family="sans-serif" font-size="16">Goal 23 — mixed escorts</text></svg>`);
  await sharp({create:{width:width*2,height:height+28,channels:3,background:'#17202a'}}).composite([{input:label,left:0,top:0},{input:a,left:0,top:28},{input:b,left:width,top:28}]).jpeg({quality:85}).toFile(`${out}/compare-${shot}.jpg`);
 }
} finally {await browser.close();}

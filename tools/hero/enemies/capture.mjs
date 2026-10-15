// Enemy extension of the Phase 10 six-second visual rig. Same poses/cameras on LIVE and task.
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {pathToFileURL} from 'node:url';import sharp from 'sharp';
import {smallJpeg} from '../../visual_rig.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE??path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--use-angle=metal','--enable-gpu','--autoplay-policy=no-user-gesture-required']});
const out='docs/phase11/shots/24';await fs.mkdir(out,{recursive:true});
const afterOnly=process.argv.includes('--after-only');
const results=afterOnly?JSON.parse(await fs.readFile(`${out}/comparison.json`,'utf8')).filter(r=>r.tag==='live'):[];
try {
 for(const [tag,url,quality] of [['live','https://sky-war-shooter-3d.mhamadhazeem2001.workers.dev','high'],['after','http://127.0.0.1:5424','high'],['low','http://127.0.0.1:5424','low']]){
  if(afterOnly&&tag==='live')continue;
  const context=await browser.newContext({viewport:{width:1920,height:1080},serviceWorkers:'block'});
  await context.addInitScript(q=>{let seed=19431008;Math.random=()=>{seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};window.requestAnimationFrame=()=>0;
   localStorage.setItem('sws3d.settings.v2',JSON.stringify({quality:q,bookends:false,analytics:false,autoQuality:false,killcam:false}));
   localStorage.setItem('sws3d.onboarding.v1',JSON.stringify({promptDismissed:true}));},quality);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/THREE|WebGL|shader/i.test(m.text()))errors.push(m.text());});
  console.log('loading',tag);await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.sws?.assetsReady(),null,{timeout:180000,polling:100});
  const scripts=await page.evaluate(()=>[...document.scripts].map(s=>s.src).filter(Boolean));
  const setup=await page.evaluate(tag=>{
   let seed=19431008;Math.random=()=>{seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};
   const g=window.game,e=window.engine,w=g.world;g.input.lock=()=>{};g.bookends.auto=true;
   g.startMission({...sws.CAMPAIGN[0],id:'enemy24-qa',number:0,role:'gunner',bombers:18,waves:[],duration:10000,escorts:0,escortArrive:undefined,flak:undefined,specials:false,midRound:false,boss:false,
    weather:{sunEl:40,sunAz:140,low:.55,high:.2,contrails:true}});
   e.onFrame=dt=>w.update(dt);e.beforeFrame=undefined;e.time=0;w.time=0;sws.step(360,1/60,false);e.onFrame=undefined;g.gunner.detach();
   const b=w.playerBomber,V=(x,y,z)=>b.pos.clone().set(x,y,z);
   const fighters=['me410','me163',tag==='live'?'ju88':'ju88g'].map(kind=>w.spawnEnemy(b.pos.clone().add(V(140,20,0)),'stern',1,false,false,kind));
   fighters.forEach(f=>{f.quat.copy(b.quat);f.updateProps(1/60,1);f.root.updateMatrixWorld(true);});window.enemyQA={fighters,V};
   const style=document.createElement('style');style.textContent='body > :not(#app):not(script):not(style){display:none!important} #app{position:fixed;inset:0}';document.head.append(style);
   return{worldTime:w.time,formation:w.bombers().length,quality:e.quality};
  },tag);
  for(const [index,shot] of ['me410','me163','ju88g'].entries()){
   const reference=results.find(r=>r.tag==='live'&&r.shot===shot);
   const facts=await page.evaluate(({index,reference})=>{
    const e=window.engine,{fighters,V}=window.enemyQA,f=fighters[index];fighters.forEach(a=>a.root.visible=a===f);
    if(reference){f.pos.fromArray(reference.pose.position);f.quat.fromArray(reference.pose.quaternion);}
    const scale=f.model.scale.x;const offset=index===1?V(8,4.5,10):V(14,6,16);
    e.camera.position.copy(f.pos).addScaledVector(offset,scale);e.camera.up.set(0,1,0);e.camera.lookAt(f.pos.clone().add(V(0,0,-1.5*scale)));e.camera.fov=42;
    if(reference){e.camera.position.fromArray(reference.camera.position);e.camera.quaternion.fromArray(reference.camera.quaternion);e.camera.fov=reference.camera.fov;}
    e.camera.updateProjectionMatrix();e.camera.updateMatrixWorld(true);f.root.updateMatrixWorld(true);
    e.post.resetHistory();e.clouds.resetHistory();for(let i=0;i<24;i++)e.render(1/60);
    return{kind:f.kind,scale,pose:{position:f.pos.toArray(),quaternion:f.quat.toArray()},camera:{position:e.camera.position.toArray(),quaternion:e.camera.quaternion.toArray(),fov:e.camera.fov}};
   },{index,reference});
   const data=await page.evaluate(()=>sws.shot(.9));await fs.writeFile(`${out}/${tag}-${shot}.jpg`,await smallJpeg(Buffer.from(data.split(',')[1],'base64'),1280));
   const perf=await page.evaluate(()=>{const e=window.engine,gl=e.renderer.getContext(),times=[],before=e.renderer.info.programs.length;for(let i=0;i<30;i++){let t=performance.now();e.render(1/60);gl.finish();times.push(performance.now()-t);}times.sort((a,b)=>a-b);return{mean:times.reduce((a,b)=>a+b,0)/times.length,p95:times[28],programsBefore:before,programsAfter:e.renderer.info.programs.length,method:'30 frozen full-render frames plus gl.finish; shared machine'};});
   if(errors.length)throw Error(errors.join('\n'));if(perf.programsBefore!==perf.programsAfter)throw Error('Unexpected shader compilation');
   results.push({tag,url,scripts,shot,...setup,...facts,perf,errors});console.log(tag,shot,perf.mean.toFixed(1));
  }
  await context.close();
 }
 await fs.writeFile(`${out}/comparison.json`,JSON.stringify(results,null,2)+'\n');
 for(const shot of ['me410','me163','ju88g']){
  const tiles=await Promise.all(['live','after'].map(async(tag,i)=>({input:await sharp(`${out}/${tag}-${shot}.jpg`).resize(800).toBuffer(),left:i*800,top:28})));
  const label=Buffer.from('<svg width="1600" height="28"><rect width="100%" height="28" fill="#17202a"/><text x="12" y="20" fill="white" font-family="sans-serif" font-size="16">LIVE main</text><text x="812" y="20" fill="white" font-family="sans-serif" font-size="16">Goal 24</text></svg>');
  const sheet=await sharp({create:{width:1600,height:478,channels:3,background:'#17202a'}}).composite([{input:label,left:0,top:0},...tiles]).png().toBuffer();await fs.writeFile(`${out}/compare-${shot}.jpg`,await smallJpeg(sheet,1600));
 }
}finally{await browser.close();}

// Real world/pilot/ballistics smoke, manually stepped in the bundled headless shell.
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {pathToFileURL}from'node:url';import assert from 'node:assert/strict';import {smallJpeg}from'../../visual_rig.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE??path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--use-angle=metal','--enable-gpu']});
const results=[];const out='docs/phase11/shots/24';await fs.mkdir(out,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;localStorage.setItem('sws3d.settings.v2',JSON.stringify({quality:'high',autoQuality:false,analytics:false,bookends:false,killcam:false}));});
 await page.goto('http://127.0.0.1:5424');await page.waitForFunction(()=>window.sws?.assetsReady(),null,{polling:100,timeout:180000});
 for(const kind of ['me163','me410','ju88g']){
  const result=await page.evaluate(kind=>{
   const g=window.game,e=window.engine,w=g.world,tx=g.specials.tactics;g.input.lock=()=>{};g.bookends.auto=true;
   g.startMission({...sws.CAMPAIGN[0],id:'enemy24-flight',number:0,role:'gunner',bombers:3,waves:[],duration:10000,escorts:0,escortArrive:undefined,flak:undefined,specials:false,midRound:false,boss:false,
    weather:kind==='ju88g'?{sunEl:-8,sunAz:140,low:.4,high:.2,night:true}:{sunEl:40,sunAz:140,low:.55,high:.2}});
   tx.reset();w.aiGunnerFactor=0;w.playerFocus=1;g.gunner.detach();e.beforeFrame=undefined;
   const f=tx.spawn(kind,1)[0],b=w.playerBomber;f.structure=f.maxStructure=100000;for(const z of f.zones)z.hp=z.maxHp=100000;
   const group=kind==='me163'?tx.comet(f):kind==='me410'?tx.bigGun([f],{place:3000}):tx.nightFighter(f);
   const startY=f.pos.y;let maxY=startY,minRange=Infinity,shellFrames=0,obliqueFrames=0,shot=null;
   e.onFrame=dt=>{tx.update(dt);w.update(dt);};
   for(let i=0;i<4500;i++){
    sws.step(1,1/60,false);maxY=Math.max(maxY,f.pos.y);minRange=Math.min(minRange,f.pos.distanceTo(b.pos));
    if(tx.shells.some(s=>s.on))shellFrames++;
    if(f.obliqueTrigger){obliqueFrames++;if(!shot){
     const V=(x,y,z)=>f.pos.clone().set(x,y,z);
     e.camera.position.copy(f.pos).add(V(160,40,-120));e.camera.lookAt(f.pos.clone().lerp(b.pos,.4));e.camera.fov=60;e.camera.updateProjectionMatrix();e.camera.updateMatrixWorld(true);
     e.post.resetHistory();e.clouds.resetHistory();for(let j=0;j<6;j++)e.render(1/60);shot=sws.shot(.88);
    }}
   }
   e.onFrame=undefined;
   return{kind,model:f.kind,hero:f.model.userData.hero,fuel:f.rocketFuel,throttle:f.fm.throttle,thrustScale:f.fm.thrustScale,state:w.enemyPilot(f)?.state,climb:maxY-startY,minRange,shellFrames,obliqueFrames,shots:f.guns.map(g=>({oblique:!!g.oblique,count:g.count,ammo:g.ammo})),position:f.pos.toArray(),shot};
  },kind);
  if(result.shot){await fs.writeFile(`${out}/night-attack.jpg`,await smallJpeg(Buffer.from(result.shot.split(',')[1],'base64'),1280));delete result.shot;}
  console.log(result);results.push(result);
 }
 assert.equal(errors.length,0,errors.join('\n'));
 assert.ok(results.every(r=>r.hero===r.kind&&r.position.every(Number.isFinite)));
 const k=results[0];assert.ok(k.fuel===0&&k.thrustScale===0&&k.climb>200,'Komet climbs, burns out and stays unpowered');
 assert.ok(results[1].shellFrames>0,'Hornisse fires ballistic BK 5 shells');
 assert.ok(results[2].obliqueFrames>0&&results[2].shots.some(g=>g.oblique&&g.count>0),'Ju 88 G fires its actual upward mounts');
 await fs.writeFile(`${out}/flight-smoke.json`,JSON.stringify({method:'75 s per type; real World.update, Tactics, EnemyPilot, FlightModel and Ballistics; allied gun damage suppressed, enemy durable to isolate tactics',results,errors},null,2)+'\n');
}finally{await browser.close();}

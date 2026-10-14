// Run with existing Playwright and worktree Vite on 5293; no RAF-dependent simulation.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--autoplay-policy=no-user-gesture-required']});
const shots='docs/phase9/shots/03', results=[], errors=[];
await fs.mkdir(shots,{recursive:true});
try {
 const context=await browser.newContext({viewport:{width:1280,height:720}});
 await context.route(/https:\/\/.*(googleapis|firebaseio|firestore|identitytoolkit|securetoken).*/,r=>r.abort());
 await context.addInitScript(()=>{
  localStorage.setItem('sws3d.settings.v2',JSON.stringify({quality:'low',bookends:false,difficulty:'recruit',aimAssist:'high'}));
  localStorage.setItem('sws3d.onboarding.v1',JSON.stringify({promptDismissed:true}));
 });
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error' && /THREE|WebGL|shader/i.test(m.text())) errors.push(m.text());});
 await page.goto('http://127.0.0.1:5293');
 await page.waitForFunction(()=>window.sws?.assetsReady(),null,{timeout:120000});
 await page.evaluate(()=>{
  sws.engine.loopOverride=()=>{};const g=sws.game;g.input.lock=()=>{};
  g.startMission(sws.survivalMission('gunner'));g.setWeather('clear');
  g.director.direct=()=>{};g.midRound.update=()=>{};g.gunner.resetAmmo();
  sws.step(120,1/60);g.ui.fade(false);g.ui.tip('',0);
 });
 const capture=async(name)=>{
  await page.evaluate(()=>{sws.engine.frame(0,true);sws.game.hud.frame(0);});
  await page.screenshot({path:`${shots}/${name}.jpg`,type:'jpeg',quality:65});
 };
 for(const quality of ['low','high']) {
  await page.evaluate(quality=>{const g=sws.game;g.settings.quality=quality;g.applySettings();},quality);
  for(const station of ['waistL','waistR','top','ball','tail']) {
   await page.evaluate(station=>{
    const g=sws.game;g.input.setVirtualButtons('qa',4);g.gunner.requestStation(station);sws.step(90,1/60);
    g.gunner.resetAmmo();g.gunner.state.yaw=g.gunner.state.tYaw=0;g.gunner.state.pitch=g.gunner.state.tPitch=0;
    sws.step(30,1/60,true);
   },station);
   await capture(`${quality}-${station}-1-ready`);
   const before=await page.evaluate(()=>sws.engine.renderer.info.programs.length);
   await page.evaluate(()=>{sws.game.input.setVirtualButtons('qa',5);sws.step(15,1/60,true);});
   await capture(`${quality}-${station}-2-burst`);
   await page.evaluate(()=>{sws.step(480,1/60);sws.game.input.setVirtualButtons('qa',4);sws.step(1,1/60,true);});
   await capture(`${quality}-${station}-3-hot`);
   const result=await page.evaluate(()=>({station:sws.game.gunner.station,heat:sws.game.gunner.state.heat,
    programs:sws.engine.renderer.info.programs.length,links:sws.game.gunner.links.flying.count,
    spring:sws.game.gunner.state.recoil.pitch.x,haze:[...sws.game.gunner.barrelHaze.values()].map(h=>h.strength),
    slides:[...sws.game.gunner.slides.values()].map(s=>s.x)}));
   results.push({quality,before,...result});
   assert.equal(result.programs,before);assert.ok(result.heat>.35);assert.ok(result.links>0);assert.ok(result.haze.some(h=>h>0));
   await page.evaluate(()=>sws.step(90,1/60));
   await capture(`${quality}-${station}-4-settled`);
   assert.ok(await page.evaluate(()=>Math.abs(sws.game.gunner.state.recoil.pitch.x)<.00001));
  }
  results.push({quality,bench:await page.evaluate(()=>sws.bench(60))});
 }
 // Independent barrel kick, exact tracer cadence, convergence and no Ace assist in the live controller.
 const mechanics=await page.evaluate(async()=>{
  const g=sws.game;g.input.setVirtualButtons('qa',0);g.gunner.requestStation('top');sws.step(90,1/60);
  g.settings.difficulty='ace';g.applySettings();g.gunner.resetAmmo();
  const rounds=[],b=g.world.ballistics,fire=b.fire;
  b.fire=function(p,v,team,d,tracer,...args){if(args[3]===true)rounds.push({p:p.toArray(),v:v.toArray(),tracer});return fire.call(this,p,v,team,d,tracer,...args);};
  const start=g.world.stats.shots;g.input.setVirtualButtons('qa',1);sws.step(1,1/60);
  const slides=g.gunner.guns.top.map(gun=>g.gunner.slides.get(gun).x);
  sws.step(46,1/60);g.input.setVirtualButtons('qa',0);b.fire=fire;
  const {access}=await import('/src/core/Accessibility.ts');
  const r=g.gunner.state.recoil; r.kick('top',1,false,0,13);r.update(.02,'top');
  const normal=r.vibration(access.shake);access.set('reduceMotion',true);const reduced=r.vibration(access.shake);
  return {shots:g.world.stats.shots-start,tracers:rounds.map(r=>r.tracer),slides,assist:g.gunner.assist,
    hitScale:b.playerHitScale,normal,reduced};
 });
 results.push({mechanics});assert.equal(mechanics.assist,0);assert.equal(mechanics.hitScale,1);
 assert.equal(mechanics.slides.length,2);
 assert.equal(mechanics.slides.filter(x=>Math.abs(x)>.0001).length,1);
 assert.ok(Math.abs(mechanics.reduced/mechanics.normal-.25)<1e-8);
 assert.ok(mechanics.tracers.length>=9);assert.equal(mechanics.tracers.filter(Boolean).length,2);
 await capture('high-top-reduced-motion');
 await page.evaluate(()=>{sws.game.startMenu();sws.step(1,1/60);});
 assert.equal(await page.evaluate(()=>sws.game.gunner.barrelHaze.size),0);
 assert.equal(errors.length,0,errors.join('\n'));
} finally {
 await fs.writeFile(`${shots}/checks.json`,JSON.stringify({results,errors},null,2));await browser.close();
}
console.log(JSON.stringify({results,errors},null,2));

// Existing Playwright installation only; run with this worktree's Vite on port 5293.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({headless:true,channel:'chrome',args:['--autoplay-policy=no-user-gesture-required']});
const tag=process.argv[2] ?? 'after';
const results=[], errors=[];
try {
 for (const difficulty of ['recruit','veteran','ace']) for (const skill of [0,1]) {
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  await context.route(/https:\/\/.*(googleapis|firebaseio|firestore|identitytoolkit|securetoken).*/,r=>r.abort());
  await context.addInitScript(({difficulty})=>{
   localStorage.setItem('sws3d.settings.v2',JSON.stringify({quality:'low',bookends:false,difficulty,aimAssist:'high'}));
   localStorage.setItem('sws3d.onboarding.v1',JSON.stringify({promptDismissed:true}));
  },{difficulty});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5293');
  await page.waitForFunction(()=>window.sws?.autoplay && sws.assetsReady(),null,{timeout:120000});
  const result=await page.evaluate(async({skill,difficulty})=>{
   sws.engine.loopOverride=()=>{};sws.game.input.lock=()=>{};
   let seed=903;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
   const log=sws.autoplay(sws.CAMPAIGN[0],16000,{skill});
   const g=sws.game,w=g.world;
   return {difficulty,skill,metrics:{shots:w.stats.shots,hits:w.stats.hits,accuracy:w.stats.hits/Math.max(1,w.stats.shots),kills:w.stats.kills,bombersLost:w.stats.bombersLost,t:w.time,state:g.state,success:g.endResult?.success,assist:g.gunner.assist,hitScale:w.ballistics.playerHitScale},log};
  },{skill,difficulty});
  assert.ok(result.metrics.shots>0); assert.equal(result.metrics.state,'debrief');
  results.push(result);console.log(JSON.stringify({difficulty,skill,...result.metrics}));
  await context.close();
 }
 assert.equal(errors.length,0,errors.join('\n'));
} finally {
 await fs.writeFile(`docs/phase9/reports/03-${tag}.json`,JSON.stringify({results,errors},null,2));
 await browser.close();
}

// Run this worktree's Vite on 5292. Uses the existing Playwright installation / Chrome.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({headless:true,channel:'chrome',args:['--autoplay-policy=no-user-gesture-required']});
const shots='docs/phase9/shots/02', errors=[], results=[];
await fs.mkdir(shots,{recursive:true});
try {
  for (const [seat,quality,cloud] of [['waistL','medium',false],['ball','low',false],['ball','low',true]]) {
    const page=await browser.newPage({viewport:{width:1280,height:720}});
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(({quality,cloud})=>{
      localStorage.setItem('sws3d.settings.v2',JSON.stringify({quality,bookends:false,analytics:false,hudDetail:'standard',difficulty:'recruit',killcam:false}));
      localStorage.setItem('sws3d.onboarding.v1',JSON.stringify({promptDismissed:true}));
      if(cloud)localStorage.setItem('sws3d.lang','ar');
      let seed=42;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
    },{quality,cloud});
    await page.goto(process.env.BOMB_RUN_URL ?? 'http://[::1]:5292/');
    await page.waitForFunction(()=>window.sws?.assetsReady()&&sws.vqa,null,{timeout:120000});
    await page.evaluate(({seat,cloud})=>{
      const g=sws.game;sws.engine.loopOverride=()=>{};g.input.lock=()=>{};
      g.startMission(sws.CAMPAIGN.find(m=>m.id==='m1'));g.gunner.setStation(seat,true);g.ui.fade(false);
      if(cloud)g.setWeather({sunEl:30,sunAz:150,low:.95,high:.95,mood:'overcast',preset:'heavyRain'});
      window.probe={phases:[],bursts:[],heldShots:0,returnShots:0,spawns:[],programs:0,programIds:[]};
      const burst=g.world.flakBurst.bind(g.world);
      g.world.flakBurst=p=>{probe.bursts.push({t:g.world.time,range:p.distanceTo(g.world.player.pos)});burst(p);};
      const spawn=g.director.spawnWave.bind(g.director);
      g.director.spawnWave=w=>{probe.spawns.push({t:g.world.time,phase:g.bombRun.clock.phase});spawn(w);};
      const frame=g.engine.onFrame;
      g.engine.onFrame=dt=>{frame(dt);if(g.bombRun.holding)for(const f of g.world.fighters('axis'))if(f.trigger)probe.heldShots++;
        if(g.world.time>114)for(const f of g.world.fighters('axis'))if(f.trigger)probe.returnShots++;
        const ph=g.bombRun.clock.phase;if(probe.phases.at(-1)?.phase!==ph)probe.phases.push({phase:ph,t:g.world.time});};
    },{seat,cloud});
    const snapshots=[];
    for(const target of [57.3,67.5,70,81,85.6,94,111.5,115,120,150]) {
      const state=await page.evaluate(({target,seat})=>{
        const g=sws.game;
        let budget=18000;
        while(g.world.time<target && budget-->0 && !['ending','debrief'].includes(g.state)) {
          document.querySelector('#perks.show .pcard')?.click();document.querySelector('#hangar.show [data-go]')?.click();
          g.engine.frame(1/60,false);
        }
        g.ui.fade(false);
        if(seat==='ball') {
          // Traverse the real turret toward the target, within its normal physical limits.
          const d=g.world.formationForward.clone().multiplyScalar((g.mission.bombsAway-g.world.time)*75+75*25*.93);
          d.y=-g.world.player.pos.y;d.applyQuaternion(g.world.player.quat.clone().invert());
          const st=g.gunner.states.get('ball'),def=st.def;
          let yaw=Math.atan2(d.x,d.z)-def.rest.yaw;while(yaw>Math.PI)yaw-=Math.PI*2;while(yaw< -Math.PI)yaw+=Math.PI*2;
          st.yaw=st.tYaw=yaw;st.pitch=st.tPitch=Math.atan2(d.y,Math.hypot(d.x,d.z))-def.rest.pitch;st.vYaw=st.vPitch=0;
          g.gunner.update(0);
        }
        g.engine.render(1/60);
        if(target===57.3){probe.programs=g.engine.renderer.info.programs.length;probe.programIds=g.engine.renderer.info.programs.map(p=>p.id);}
        return {target,time:g.world.time,state:g.state,phase:g.bombRun.clock.phase,held:g.world.bombRunHold,level:g.world.bombRunLevel,
          bombs:g.target.mesh.count,release:g.bombardier.releaseTime,result:g.bombardier.result?{percent:g.bombardier.result.percent,photo:!!g.bombardier.result.photo}:null,
          programs:g.engine.renderer.info.programs.length,newPrograms:g.engine.renderer.info.programs.filter(p=>!probe.programIds.includes(p.id)).map(p=>({id:p.id,key:p.cacheKey,name:p.name})),fighters:g.world.fighters('axis').map(f=>({d:f.pos.distanceTo(g.world.player.pos),state:g.world.pilots.get(f)?.state})),spawned:g.world.stats.enemiesSpawned,wind:window.swsSound?.bombBayOpen};
      },{target,seat});
      snapshots.push(state);
      assert.ok(state.time>=target-.1,JSON.stringify(state));
      if(target!==150) await page.screenshot({path:`${shots}/${cloud?'overcast-ar':seat}-${target}.jpg`,type:'jpeg',quality:65});
    }
    const probe=await page.evaluate(()=>window.probe);
    results.push({seat,quality,cloud,snapshots,probe});
    assert.equal(probe.heldShots,0);
    assert.ok(snapshots.filter(s=>s.target<=120).every(s=>s.newPrograms.length===0),'no shaders compile during the run');
    assert.ok(probe.bursts.some(b=>b.range<130));
    assert.ok(!probe.spawns.some(s=>['inbound','level','doors','countdown','away','falling','strike'].includes(s.phase)));
    assert.ok(snapshots.find(s=>s.target===85.6).bombs>0);
    assert.equal(snapshots.find(s=>s.target===120).phase,'complete');
    assert.ok(snapshots.at(-1).result?.photo);
    assert.ok(probe.returnShots>0 || probe.spawns.some(s=>s.t>114),'fighters must re-engage after rally');
    // Render the actual debrief with the automatic strike photo.
    await page.evaluate(()=>{const g=sws.game;g.finish(true,g.mission.success);g.showDebrief();});
    await page.screenshot({path:`${shots}/${cloud?'overcast-ar':seat}-debrief.jpg`,type:'jpeg',quality:65});
    assert.equal(await page.locator('.strike-photo img').count(),1);
    if(cloud) {
      const manual=await page.evaluate(()=>{
        const g=sws.game;g.startMission(sws.CAMPAIGN.find(m=>m.id==='m1'));g.ui.fade(false);
        const advance=target=>{let n=20000;while(g.world.time<target&&n-->0){document.querySelector('#perks.show .pcard')?.click();document.querySelector('#hangar.show [data-go]')?.click();g.engine.frame(1/60,false);}};
        advance(60);const pausedAt=g.world.time;g.pause();sws.step(60);const paused=g.world.time===pausedAt;g.resume();
        g.bombardier.enter();const entered=g.bombardier.active;g.input.buttons=4;
        advance(96);const held=g.bombardier.releaseTime<0;
        advance(97.2);const release=g.bombardier.releaseTime,score=g.score;
        g.bombardier.release();const once=g.score===score;
        g.startMenu();const clean=!g.bombRun.active&&!g.world.bombRunHold&&!g.world.bombRunLevel&&!window.swsSound.bombBayOpen;
        return {paused,entered,held,release,once,clean};
      });
      results.at(-1).manual=manual;
      assert.ok(manual.paused && manual.entered && manual.held && manual.once && manual.clean,JSON.stringify(manual));
      assert.ok(manual.release>=97 && manual.release<97.05);
      const campaign=await page.evaluate(async()=>{
        const log=sws.autoplay(sws.CAMPAIGN[0],12000),g=sws.game;
        return {log,state:g.state,success:g.endResult?.success,time:g.world.time,round:g.roundIdx+1,kills:g.world.stats.kills,phase:g.bombRun.clock.phase,photo:!!g.bombardier.result?.photo};
      });
      results.at(-1).campaign=campaign;
      assert.equal(campaign.state,'debrief');assert.equal(campaign.success,true);
      assert.equal(campaign.phase,'complete');assert.ok(campaign.photo);
    }
    await page.close();
  }
  assert.deepEqual(errors,[]);
} finally {
  await fs.writeFile(`${shots}/verification.json`,JSON.stringify({errors,results},null,2));
  await browser.close();
}
console.log(JSON.stringify(results.map(r=>({seat:r.seat,cloud:r.cloud,phases:r.probe.phases,snapshots:r.snapshots})),null,2));

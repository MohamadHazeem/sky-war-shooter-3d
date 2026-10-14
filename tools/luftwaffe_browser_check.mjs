// Start this worktree's Vite on 5284. Uses installed Playwright and Chrome.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const shots = 'docs/phase8/shots/04';
await fs.mkdir(shots, { recursive: true });
const errors = [], results = [];
try {
  const page = await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror', e=>errors.push(e.message));
  await page.addInitScript(()=>{
    localStorage.setItem('sws3d.settings.v2',JSON.stringify({quality:'low',bookends:false,analytics:false,hudDetail:'standard'}));
    localStorage.setItem('sws3d.onboarding.v1',JSON.stringify({promptDismissed:true}));
    let seed=42;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  });
  await page.goto('http://127.0.0.1:5284');
  await page.waitForFunction(()=>window.sws?.assetsReady() && sws.vqa,{timeout:120000});
  await page.evaluate(()=>{sws.engine.loopOverride=()=>{};sws.game.input.lock=()=>{};});
  for (const [id,seat] of [['sturm','top'],['hornisse','waistL'],['airBomb','top'],['jetSlash','tail'],['multiAxis','waistL']]) {
    await page.reload();
    await page.waitForFunction(()=>window.sws?.assetsReady() && sws.vqa,{timeout:120000});
    await page.evaluate(()=>{sws.engine.loopOverride=()=>{};sws.game.input.lock=()=>{};});
    await page.evaluate(({id,seat})=>{
      const g=sws.game;window.packId=id;
      g.startMission({...sws.survivalMission('gunner'),specials:false,midRound:false,boss:false,round:{duration:300,start:299,min:0,max:0,skill:[1,1]},escorts:0});
      g.director.direct=()=>{};sws.step(2);g.ui.fade(false);g.gunner.setStation(seat);
      g.ui.tipUntil=0;
      g.specials.tactics.launchPack(id);
      const lead=g.specials.tactics.groups[0]?.members[0]?.f;
      if(id==='hornisse' && lead) g.gunner.setStation(lead.pos.x>g.world.player.pos.x?'waistL':'waistR',true);
      window.probe={shots:[],bombs:[],phases:[],damage:[],programs:sws.engine.renderer.info.programs.length};
      const tx=g.specials.tactics,fire=tx.fireShell.bind(tx),drop=tx.dropAirBomb.bind(tx);
      tx.fireShell=(f,t,m)=>{probe.shots.push({at:g.world.time,range:f.pos.distanceTo(t.pos)});fire(f,t,m);};
      tx.dropAirBomb=f=>{probe.bombs.push({at:g.world.time,pos:f.pos.clone().sub(g.world.player.pos).toArray()});drop(f);};
      const hit=g.world.ballistics.onHit;
      g.world.ballistics.onHit=ev=>{if(ev.cannon)probe.damage.push({at:g.world.time,damage:ev.damage});hit?.(ev);};
    },{id,seat});
    let previous=0;
    for (const t of [0,4,8,10,12.5,16,20,24,28,32,36]) {
      if(t) await page.evaluate(n=>sws.step(n,1/60),Math.round((t-previous)*60));
      previous=t;
      const state=await page.evaluate(()=>{
        const g=sws.game,tx=g.specials.tactics;
        const f=g.world.fighters('axis').find(f=>f.alive && (window.packId!=='multiAxis' || f.pos.x>g.world.player.pos.x));
        // Aim the actual gunner camera at the lead target, staying inside station limits.
        if(f){const d=f.pos.clone().sub(g.world.player.pos).applyQuaternion(g.world.player.quat.clone().invert());
          const state=g.gunner.states.get(g.gunner.station),def=state.def;
          let yaw=Math.atan2(d.x,d.z)-def.rest.yaw;while(yaw>Math.PI)yaw-=2*Math.PI;while(yaw< -Math.PI)yaw+=2*Math.PI;
          state.yaw=state.tYaw=Math.max(def.yaw[0],Math.min(def.yaw[1],yaw));
          state.pitch=state.tPitch=Math.max(def.pitch[0],Math.min(def.pitch[1],Math.atan2(d.y,Math.hypot(d.x,d.z))))-def.rest.pitch;
          state.vYaw=state.vPitch=0;}
        sws.step(1);g.engine.render(1/60);
        return {time:g.world.time,programsAfter:g.engine.renderer.info.programs.length,groups:tx.groups.map(g=>({kind:g.kind,t:g.t,phase:g.phase,m:g.members.map(m=>({phase:m.phase,shots:m.shots,range:m.f.pos.distanceTo(sws.game.world.player.pos)}))})),...probe};
      });
      results.push({id,t,...state});
      if([0,8,12.5,16,20].includes(t)) await page.screenshot({path:`${shots}/${id}-${t}.jpg`,type:'jpeg',quality:65});
    }
  }
  // Real director integration, then minimal HUD and Arabic lesson rendering.
  await page.reload();
  await page.waitForFunction(()=>window.sws?.assetsReady() && sws.vqa,{timeout:120000});
  const scheduling=await page.evaluate(()=>{
    const g=sws.game;sws.engine.loopOverride=()=>{};g.input.lock=()=>{};
    g.startMission(sws.CAMPAIGN.find(m=>m.id==='m2'));sws.step(1800,1/60);g.ui.fade(false);
    return {log:g.specials.tactics.log,state:g.state};
  });
  assert.equal(scheduling.log.filter(x=>x.includes('pack sturm')).length,1);
  await page.evaluate(()=>{
    const g=sws.game;g.settings.hudDetail='minimal';g.applySettings();
    g.ui.tipUntil=0;document.getElementById('tip').classList.remove('show');
    g.specials.tactics.launchPack('airBomb');sws.step(1);
  });
  assert.equal(await page.locator('#tip').isVisible(),false);
  await page.screenshot({path:`${shots}/minimal.jpg`,type:'jpeg',quality:65});
  await page.evaluate(()=>localStorage.setItem('sws3d.lang','ar'));
  await page.reload();
  await page.waitForFunction(()=>window.sws?.assetsReady() && sws.vqa,{timeout:120000});
  await page.evaluate(()=>{
    const g=sws.game;sws.engine.loopOverride=()=>{};g.input.lock=()=>{};
    g.startMission(sws.survivalMission('gunner'));g.director.direct=()=>{};sws.step(2);g.ui.fade(false);
    g.gunner.setStation('top',true);g.settings.hudDetail='standard';g.applySettings();g.ui.tipUntil=0;
    g.specials.tactics.launchPack('sturm');sws.step(120,1/60);
  });
  await page.waitForTimeout(100);
  assert.match(await page.locator('#tip').innerText(),/تكتيك/);
  await page.screenshot({path:`${shots}/arabic.jpg`,type:'jpeg',quality:65});
  await fs.writeFile(`${shots}/verification.json`,JSON.stringify({errors,scheduling,results},null,2));
  assert.deepEqual(errors,[]);
  for(const r of results.filter(r=>r.t===36)){
    if(r.id==='hornisse'){assert.ok(r.shots.length>=2);for(const s of r.shots){assert.ok(s.range>=800 && s.range<=1200);assert.ok(s.at>=3.8);}}
    if(r.id==='airBomb'){assert.ok(r.bombs.length>0);assert.ok(r.bombs.every(b=>b.at>=8));assert.ok(r.damage.some(d=>d.damage!==14 && d.at>=12.5));}
  }
  console.log(JSON.stringify(results.filter(r=>r.t===36).map(r=>({id:r.id,shots:r.shots,bombs:r.bombs,damageHits:r.damage.length})),null,2));
} finally { await browser.close(); }

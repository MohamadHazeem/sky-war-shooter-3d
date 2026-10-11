// Run against your own Vite server on 5262. Uses an already installed Playwright; no installs.
// PLAYWRIGHT_MODULE may point to an existing Playwright index.mjs outside this checkout.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import fs from 'node:fs';
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, args:['--autoplay-policy=no-user-gesture-required']});
const errors=[];
const make = async(name)=>{
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 await context.addInitScript(({name})=>{localStorage.setItem('sws3d.settings.v2',JSON.stringify({quality:'low',gfxAuto:'done',volume:0,radio:false,music:false})); localStorage.setItem('sws3d.pilotName',name);},{name});
 const p=await context.newPage();p.on('pageerror',e=>errors.push(name+': '+e.message));
 p.on('console',m=>{if(m.type()==='warning' && /Co-op/.test(m.text())) console.log(name,m.text());});
 await p.goto('http://127.0.0.1:5262/');await p.waitForFunction(()=>window.sws?.assetsReady() && sws.game.coop,null,{timeout:120000});
 await p.evaluate(()=>{sws.engine.renderer.setAnimationLoop(null);sws.game.input.lock=()=>{};sws.game.coop.screen.menu();});return p;
};
try {
const host=await make('Reed'),guest=await make('Walsh');
await host.locator('[data-host]').click();
await host.waitForFunction(()=>sws.game.coop.code.length===6,null,{timeout:45000});
const code=await host.evaluate(()=>sws.game.coop.code);console.log('ROOM',code);
await guest.locator('.joinrow input').fill(code);await guest.locator('[data-join]').click();
await Promise.all([host,guest].map(p=>p.waitForFunction(()=>sws.game.coop.connected,null,{timeout:45000})));
console.log('CONNECTED');
await host.locator('[data-start]').click();
await Promise.all([host,guest].map(p=>p.waitForFunction(()=>sws.game.state==='playing',null,{timeout:30000})));
for(let i=0;i<10;i++){await host.evaluate(()=>sws.step(6,1/60));await guest.evaluate(()=>sws.step(6,1/60));}

// Make the first survival round short and deterministic; real simulation, firing and hit handlers.
await host.evaluate(()=>{
 const g=sws.game,w=g.world;
 g.mission.flatRounds=true;g.mission.round.duration=12;g.mission.round.start=999;g.mission.rounds=1;
 g.mission.escortArrive=undefined;g.mission.bombsAway=undefined;
 const fire=w.ballistics.fire;
 w.ballistics.fire=function(...args){if(args[6]?.remoteGunner)window.qaRemote=args[6];return fire.apply(this,args);};
 window.qaTargets=[0,1,2].map(i=>w.spawnEnemy(w.playerBomber.pos.clone().add({x:250+i*25,y:10,z:40}), 'beam',1,false,false,'fw190'));
});
await guest.evaluate(()=>{sws.game.coop.devFire=true;});
for(let i=0;i<6;i++){await guest.evaluate(()=>sws.step(6,1/60));await host.evaluate(()=>sws.step(6,1/60));}
await host.evaluate(()=>{
 const g=sws.game,w=g.world;
 if(!window.qaRemote)throw Error('Guest never fired real rounds on host');
 // Host fires through its real gun; controlled impacts avoid flaky aiming in this protocol regression.
 const gun=g.gunner;gun.fireRound(gun.guns[gun.station][0],gun.def);
 w.ballistics.clear(); // substitute the controlled impacts below for these real fired rounds
});
await host.evaluate(()=>{
 const g=sws.game,w=g.world;
 for(let i=0;i<qaTargets.length;i++){
  const target=qaTargets[i];const zone=target.zone('engine');
  w.ballistics.onHit({target,zone,point:target.pos.clone(),damage:10000,cannon:false,shooter:i===0?w.playerBomber:qaRemote,bulletVel:target.vel.clone(),playerShot:i===0});
 }
});
await guest.evaluate(()=>{sws.game.coop.devFire=false;});
for(let i=0;i<10;i++){await host.evaluate(()=>sws.step(6,1/60));await guest.evaluate(()=>sws.step(6,1/60));}
const state=p=>p.evaluate(()=>({state:sws.game.state,score:sws.game.score,kills:sws.game.world.stats.kills,stats:sws.game.coop.stats,crew:sws.game.coop.crewKills,career:sws.game.service.career.kills,html:document.body.innerText}));
let h=await state(host),g=await state(guest);
console.log('SHARED',JSON.stringify({host:{score:h.score,kills:h.kills,crew:h.crew},guest:{score:g.score,kills:g.kills,crew:g.crew},stats:h.stats}));
if(h.score!==g.score || h.crew!==3 || g.crew!==3 || h.kills!==1 || g.kills!==2)throw Error('Shared score / own kills mismatch');
if(!h.html.includes('Walsh (partner) destroyed'))throw Error('Missing named partner kill feed');
fs.mkdirSync('docs/phase6/shots/04',{recursive:true});
await host.screenshot({path:'docs/phase6/shots/04/host-score.jpg',type:'jpeg',quality:65});
await guest.screenshot({path:'docs/phase6/shots/04/guest-score.jpg',type:'jpeg',quality:65});
// Exercise inter-round host hangar before the final result. Merit is deferred to the shared debrief.
await host.evaluate(()=>{const g=sws.game;g.mission.rounds=2;g.flow.endRound(g.mission);});
if(await host.locator('#crate').count()){
 await host.locator('#crate').click();
 if(await host.locator('#crate.reveal:not(.out)').count())await host.locator('#crate').click();
 await host.locator('#crate').waitFor({state:'detached'});
}
await host.locator('#hangar [data-go]').click();
for(let i=0;i<8;i++){await host.evaluate(()=>sws.step(6,1/60));await guest.evaluate(()=>sws.step(6,1/60));}
// Clear the short final survival round using the actual round director.
for(let i=0;i<300;i++){
 await host.evaluate(()=>{const w=sws.game.world;for(const a of w.fighters('axis'))if(a.alive){a.playerDamage=-1;a.lastAttacker=null;w.killAircraft(a,false);}sws.step(12,1/60);});await guest.evaluate(()=>sws.step(12,1/60));
 if(await host.evaluate(()=>sws.game.state==='debrief'))break;
}
console.log('END STATES',await host.evaluate(()=>({state:sws.game.state,time:sws.game.world.time,result:sws.game.endResult})),await guest.evaluate(()=>({state:sws.game.state,phase:sws.game.coop.phase})));
await guest.waitForFunction(()=>sws.game.state==='debrief',null,{timeout:10000});
h=await state(host);g=await state(guest);
const result=await host.evaluate(()=>sws.game.coop.result);
console.log('RESULT',JSON.stringify(result));
console.log('CAREERS',h.career,g.career);
if(h.score!==g.score||h.career!==1||g.career!==2)throw Error('Debrief/career mismatch');
if(!/Crew score/i.test(g.html)||!g.html.includes('XP')||!/Return to co-op lobby/i.test(g.html))throw Error('Incomplete guest debrief');
await host.screenshot({path:'docs/phase6/shots/04/host-debrief.jpg',type:'jpeg',quality:65});
await guest.screenshot({path:'docs/phase6/shots/04/guest-debrief.jpg',type:'jpeg',quality:65});
// Duplicate result must never pay twice, nor may a stale snapshot alter the final score.
const before=await guest.evaluate(()=>({xp:sws.game.service.career.xp,points:sws.game.prog.points}));
await guest.evaluate(result=>{sws.game.coop.onEvent(result);sws.game.coop.onSnap({t:'s',run:result.run,tm:999,a:[],score:0,host:{},guest:{}});},result);
const after=await guest.evaluate(()=>({xp:sws.game.service.career.xp,points:sws.game.prog.points,score:sws.game.score}));
if(before.xp!==after.xp||before.points!==after.points||after.score!==result.crew.score)throw Error('Duplicate/stale packet altered result');
await host.locator('#debrief [data-a=retry]').click();
if(!await host.locator('#coop [data-start]').isDisabled())throw Error('Host can start before guest returns');
await guest.locator('#debrief [data-a=retry]').click();
await host.waitForFunction(()=>sws.game.coop.partnerReady);
await guest.screenshot({path:'docs/phase6/shots/04/guest-lobby.jpg',type:'jpeg',quality:65});
await guest.evaluate(async()=>{const i18n=await import('/src/i18n/index.ts');i18n.setLang('ar');sws.game.coop.renderLobby(sws.game.coop.lobbyStatus);});
await guest.screenshot({path:'docs/phase6/shots/04/guest-lobby-ar.jpg',type:'jpeg',quality:65});
await host.locator('#coop [data-start]').click();
await guest.waitForFunction(()=>sws.game.coop.run===2&&sws.game.state==='playing');
for(let i=0;i<5;i++){await host.evaluate(()=>sws.step(6,1/60));await guest.evaluate(()=>sws.step(6,1/60));}
console.log('SECOND RUN',await host.evaluate(()=>({run:sws.game.coop.run,score:sws.game.score,guest:sws.game.coop.guestScore,remote:[...sws.game.world.remoteStations]})));
if(await guest.evaluate(()=>sws.game.score!==0||sws.game.world.stats.kills!==0))throw Error('Second run did not reset');
// Pause-menu restart must reset both peers to the same new epoch.
await host.evaluate(()=>sws.game.pause());
await host.locator('#pause [data-a=restart]').click();
await guest.waitForFunction(()=>sws.game.coop.run===3&&sws.game.state==='playing');
for(let i=0;i<5;i++){await host.evaluate(()=>sws.step(6,1/60));await guest.evaluate(()=>sws.step(6,1/60));}
if(await host.evaluate(()=>sws.game.coop.run!==3||sws.game.score!==0))throw Error('Pause restart did not reset both peers');
await guest.evaluate(()=>sws.game.coop.leave());
await host.waitForFunction(()=>!sws.game.coop.connected);
if(await host.evaluate(()=>sws.game.world.remoteStations.size!==0||sws.game.state!=='playing'))throw Error('Disconnect did not restore AI / solo play');
console.log('PASS shared HUDs, personal debriefs, duplicate handling, lobby readiness, second run, pause restart, disconnect');
console.log('ERRORS',errors);if(errors.length)throw Error(errors.join('\n'));
fs.writeFileSync('docs/phase6/shots/04/browser-result.json',JSON.stringify({crew:result.crew,host:result.host,guest:result.guest,hostCareerKills:h.career,guestCareerKills:g.career,errors},null,2));
}finally{await browser.close();}

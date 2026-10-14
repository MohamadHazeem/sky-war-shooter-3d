// Run against this worktree's Vite on 5283; uses an existing Playwright installation.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const shots = 'docs/phase8/shots/03';
await fs.mkdir(shots, { recursive: true });
const errors = [], results = [];
try {
 const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
 await context.route(/https:\/\/.*(googleapis|firebaseio|firestore|identitytoolkit|securetoken).*/, r => r.abort());
 await context.addInitScript(() => {
   localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality:'low', bookends:false, difficulty:'veteran' }));
   localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({promptDismissed:true}));
 });
 const page = await context.newPage();
 page.on('pageerror', e => errors.push(e.message));
 page.on('console', msg => { if (msg.type() === 'error' && /THREE|WebGL|shader/i.test(msg.text())) errors.push(msg.text()); });
 await page.goto('http://127.0.0.1:5283');
 await page.waitForFunction(() => window.sws?.assetsReady(), {timeout:120000});
 await page.evaluate(() => {
   const g = sws.game; sws.engine.loopOverride = () => {}; g.input.lock = () => {};
   g.startMission(sws.survivalMission('gunner')); sws.step(120,1/60);
   g.setWeather('clear');g.director.direct = () => {}; g.midRound.update = () => {};
   g.world.crewWounded = 0; g.gunner.resetAmmo(); g.ui.fade(false);
   g.input.setVirtualButtons('test', 4); sws.step(90,1/60);
 });
 const shot = async name => {
   await page.evaluate(() => {sws.step(6,1/60,true);sws.game.hud.frame(.1);});
   await page.screenshot({path:`${shots}/${name}.jpg`,type:'jpeg',quality:65});
 };
 await shot('01-normal-low');
 await page.evaluate(() => {const l=sws.game.gunner.survival;l.hit(false,()=>0);l.oxygenTime=30;sws.step(60,1/60);});
 await shot('02-oxygen-low');
 results.push(await page.evaluate(() => {
   const g=sws.game, l=g.gunner.survival; const before=l.hypoxia;
   g.input.tap('KeyO');sws.step(1,1/60);const connected=!l.oxygen;sws.step(510,1/60);
   return {test:'oxygen reconnect/recovery',before,connected,recovered:l.hypoxia===0};
 }));
 await page.evaluate(() => {
   const g=sws.game;g.gunner.survival.circuit=60;g.gunner.survival.chill=1;g.gunner.state.idle=110;
 });
 await shot('03-frozen-receiver-low');
 results.push(await page.evaluate(() => {
   const g=sws.game,before=g.world.stats.shots;g.input.setVirtualButtons('test',5);sws.step(40,1/60);g.input.setVirtualButtons('test',4);
   return {test:'frozen burst',frost:g.gunner.state.frost,shots:g.world.stats.shots-before};
 }));
 await page.evaluate(() => {const g=sws.game;g.gunner.survival.circuit=0;g.gunner.state.jam=true;g.input.hold('KeyR',true);sws.step(40,1/60);});
 await shot('04-jam-handle-low');
 results.push(await page.evaluate(() => {const g=sws.game;sws.step(60,1/60);g.input.hold('KeyR',false);return {test:'hold clears jam',cleared:!g.gunner.state.jam};}));
 await page.evaluate(() => {const g=sws.game;g.gunner.state.ammo=36;});
 await shot('05-short-belt-low');
 await page.evaluate(() => {const g=sws.game;g.input.tap('KeyR');sws.step(120,1/60);});
 await shot('06-reloading-low');
 results.push(await page.evaluate(() => {const g=sws.game;sws.step(180,1/60);return {test:'reload',ammo:g.gunner.state.ammo,reserve:g.gunner.state.reserve};}));
 await page.evaluate(() => {const g=sws.game;g.world.crewWounded=3;sws.step(300,1/60);});
 await shot('07-wound-low');
 results.push(await page.evaluate(() => {const g=sws.game;const before=g.gunner.survival.wound;g.world.crewWounded=0;sws.step(600,1/60);return {test:'dressing recovery',before,after:g.gunner.survival.wound};}));
 await page.evaluate(() => {const g=sws.game;g.gunner.requestStation('top');sws.step(70,1/60);g.gunner.state.ammo=100;});
 await shot('08-turret-supply-low');
 results.push(await page.evaluate(() => {const g=sws.game;sws.step(750,1/60);return {test:'fixed box supply',ammo:g.gunner.state.ammo};}));
 // Arabic, high-quality frost and normal return to menu.
 await page.evaluate(() => {sws.game.pause();sws.game.ui.openSettings(()=>{});});
 await page.locator('#settings [data-lang]').selectOption('ar');
 await page.evaluate(() => {const g=sws.game;g.ui.hud('gunner');g.resume();g.settings.quality='high';g.applySettings();g.gunner.requestStation('tail');sws.step(70,1/60);g.input.setVirtualButtons('test',0);g.gunner.state.tYaw=.35;g.gunner.survival.circuit=60;g.gunner.survival.chill=1;g.gunner.glassFx.t=240;sws.step(600,1/60);g.ui.tip('',0);g.ui.subtitle('Radio','Oxygen connected. Breathe easy.');});
 await shot('09-turret-cold-ar-high');
 assert.match(await page.locator('#subs').innerText(), /[\u0600-\u06ff]/);
 await page.evaluate(() => {sws.game.startMenu();sws.step(1,1/60);});
 results.push(await page.evaluate(() => ({test:'menu clears vision',hypoxia:sws.engine.post.hypoxia})));
 await context.close();
 assert.equal(errors.length,0,errors.join('\n'));
 assert.ok(results[0].connected && results[0].recovered);
 assert.ok(results[1].frost===0 && results[1].shots>0);
 assert.ok(results[2].cleared);assert.equal(results[3].ammo,600);
 assert.ok(results[4].after<.01);assert.equal(results[5].ammo,750);assert.equal(results[6].hypoxia,0);
} finally {await fs.writeFile(`${shots}/checks.json`,JSON.stringify({results,errors},null,2));await browser.close();}
console.log(JSON.stringify({results,errors},null,2));

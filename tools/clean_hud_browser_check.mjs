// Vite from this worktree on 5282. Uses an already installed Playwright; no downloads.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const shots = 'docs/phase8/shots/02';
await fs.mkdir(shots, { recursive: true });
const results = [], errors = [], checks = [];
try {
for (const lang of ['en', 'ar']) for (const [width, height] of [[1280,720], [1920,1080], [844,390]]) {
 const context = await browser.newContext({ viewport: { width, height }, hasTouch: width === 844 });
 // Keep verification local; never send analytics or score submissions.
 await context.route(/https:\/\/(?!(?:fonts\.googleapis\.com|fonts\.gstatic\.com)\/).*(googleapis|firebaseio|firestore|identitytoolkit|securetoken).*/, r => r.abort());
 await context.addInitScript(({lang}) => {
   localStorage.setItem('sws3d.lang', lang);
   localStorage.setItem('sws3d.settings.v2', JSON.stringify({quality:'low',bookends:false}));
   localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({promptDismissed:true}));
   let seed=42; Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 }, {lang});
 const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
 await page.goto('http://127.0.0.1:5282');
 await page.waitForFunction(() => window.sws?.assetsReady() && sws.hudOverlaps, {timeout:120000});
 await page.evaluate(() => {sws.engine.loopOverride=()=>{};sws.game.input.lock=()=>{};});
 await page.evaluate(() => document.fonts.ready);
 for (const role of ['gunner','pilot']) {
   await page.evaluate(role => {const g=sws.game;g.startMission(sws.survivalMission(role));sws.step(900,1/60);g.ui.fade(false);}, role);
   for (const detail of ['minimal','standard','full']) {
     await page.evaluate(async detail => {
       const g=sws.game;const programs=g.engine.renderer.info.programs.length;g.settings.hudDetail=detail;g.applySettings();if(g.engine.renderer.info.programs.length!==programs)throw new Error('HUD setting compiled a shader');
       const f=g.world.fighters('axis')[0];
       g.combat.onPlayerHit({shooter:f,point:g.world.player.pos,bulletVel:f.vel,cannon:true});
       g.feel.onKill(f,100);g.score=100;g.hud.frame(.1);
       for (let i=0;i<4;i++) g.ui.feed('Fw 190 destroyed — Browning M2','mine');
       // Import the same Vite module instance as the game, including any HMR timestamp.
       const url=performance.getEntriesByType('resource').find(e=>e.name.includes('/src/game/Achievements.ts')).name;
       const {achievements}=await import(url); delete achievements.unlocked.firstBlood;achievements.unlock('firstBlood');
       sws.step(1,1/60);
     }, detail);
     await page.waitForTimeout(400);
     await page.evaluate(()=>{sws.game.ui.subtitle('Pilot',"Bandits, nine o'clock level!");sws.game.engine.render(1/60);});
     const key=`after-${role === 'gunner' ? '' : 'pilot-'}${detail}-${lang}-${width}`;
     results.push({key,...await page.evaluate(()=>sws.hudOverlaps())});
     for (const selector of ['#hBL','#hBR','#subs']) assert.equal(await page.locator(selector).isVisible(),true,`${key}: ${selector}`);
     assert.equal(await page.locator('#hud .hud-tl').isVisible(),detail !== 'minimal');
     assert.equal(await page.locator('#feed').isVisible(),detail !== 'minimal');
     if (detail === 'standard') for (const slot of await page.locator('#abilityBar .ab-slot:not(.ready)').all()) assert.equal(await slot.isVisible(),false);
     checks.push(await page.evaluate(({detail,lang,key})=>({key,lang:document.documentElement.lang,expectedLang:lang,heavy:sws.game.combat.heavyAttack,
       feed:document.querySelector('#feed').childElementCount,toastVisible:!!document.querySelector('#hudToast.show')?.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),detail}),{detail,lang,key}));
     await page.screenshot({path:`${shots}/${key}.jpg`,type:'jpeg',quality:65});
     if (detail === 'standard' && role === 'gunner' && width === 1280) {
       await page.evaluate(()=>{sws.game.combat.reset();sws.game.hud.frame(.1);});
       await page.waitForTimeout(100);
       assert.equal(await page.locator('#hudToast.show').isVisible(),true);
       await page.screenshot({path:`${shots}/after-standard-calm-${lang}-${width}.jpg`,type:'jpeg',quality:65});
     }
     if (detail === 'full' && role === 'gunner') {
       await page.evaluate(()=>{sws.event('engineFire');sws.objective('protect');sws.special('ace');sws.step(1,1/60);});
       await page.waitForTimeout(450);
       results.push({key:`stress-${lang}-${width}`,...await page.evaluate(()=>sws.hudOverlaps())});
       await page.screenshot({path:`${shots}/stress-${lang}-${width}.jpg`,type:'jpeg',quality:65});
     }
   }
 }
 // The actual Settings entry point, preserving all mounted Advanced controls.
 await page.evaluate(()=>{sws.game.startMenu();sws.step(1,1/60);});
 await page.locator('#title [data-a="settings"]').click();
 await page.waitForTimeout(100);
 await page.screenshot({path:`${shots}/settings-after-${lang}-${width}.jpg`,type:'jpeg',quality:65});
 assert.equal(await page.locator('.settings-advanced').getAttribute('open'),null);
 assert.equal(await page.locator('#settings [data-k="fov"]').isVisible(),false);
 await page.locator('#settings [data-k="hudDetail"]').selectOption('minimal');
 await page.locator('#settings [data-k="difficulty"]').selectOption('ace');
 await page.locator('#settings [data-graphics]').selectOption('medium');
 await page.locator('#settings summary').click();
 assert.equal(await page.locator('#settings [data-k="fov"]').isVisible(),true);
 await page.locator('#settings [data-k="fov"]').fill('72');
 await page.locator('#settings [data-k="fov"]').dispatchEvent('input');
 await page.locator('#settings [data-k="voiceVolume"]').fill('0.35');
 await page.locator('#settings [data-k="voiceVolume"]').dispatchEvent('input');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('sws3d.settings.v2')));
 assert.equal(saved.hudDetail,'minimal');assert.equal(saved.difficulty,'ace');assert.equal(saved.quality,'medium');assert.equal(saved.fov,72);assert.equal(saved.voiceVolume,.35);
 if (width === 1280 && lang === 'en') {
   await page.locator('#settings [data-back]').click();
   await page.evaluate(()=>{const g=sws.game;g.startMission(sws.survivalMission('gunner'));g.flow.endRound(g.mission);});
   await page.locator('#hangar [data-settings]').click();
   assert.equal(await page.locator('#settings.show').isVisible(),true);
   assert.equal(await page.locator('#hangar.show').count(),0);
   await page.locator('#settings [data-k="hudDetail"]').focus();await page.keyboard.press('Space');
   assert.equal(await page.evaluate(()=>sws.game.state),'paused');
   await page.locator('#settings [data-back]').click();
   assert.equal(await page.locator('#hangar.show').isVisible(),true);
 }
 await context.close();
}
await fs.writeFile(`${shots}/overlaps.json`,JSON.stringify({results,checks,errors},null,2));
console.log(JSON.stringify({issues:results.filter(r=>r.issues.length).map(r=>({key:r.key,issues:r.issues})),errors},null,2));
assert.equal(errors.length,0);
for (const c of checks) {assert.equal(c.lang,c.expectedLang);if(c.detail!=='full')assert.equal(c.toastVisible,false);if(c.detail==='standard')assert.ok(c.feed<=3);}
assert.ok(results.every(r=>!r.issues.length),'HUD overlaps (see overlaps.json)');
} finally { await browser.close(); }

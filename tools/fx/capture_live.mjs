// Capture the deployed production renderer with the SAME VisualRigScene fixture.
// Instrumentation exposes existing symbols only; no production effect code/assets are substituted.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { transform } from 'esbuild';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const pw = process.env.PLAYWRIGHT_MODULE ?? path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(pw).href);
import { smallJpeg } from '../visual_rig.mjs';
const origin = 'https://sky-war-shooter-3d.mhamadhazeem2001.workers.dev';
const out = 'docs/phase11/shots/04/live';
const html = await (await fetch(origin)).text();
const script = new URL(html.match(/src="(\.\/assets\/index-[^"]+\.js)"/)[1], origin).href;
const source = await (await fetch(script)).text();
// Resolve only the small set of fixture dependencies, checking unique semantic anchors.
const requireMatch = (pattern, text = source) => {
 const m = text.match(pattern); if (!m) throw new Error(`Live build changed: ${pattern}`); return m[1];
};
const atmosphere = requireMatch(/([$\w]+)\.sunElevationDeg=\w+\.sunEl/);
const vector = requireMatch(/windOffset:new ([$\w]+)/);
const campaign = requireMatch(/window\.sws=\{CAMPAIGN:([$\w]+)/);
const enclosingFunction = marker => {
 const at = source.indexOf(marker); if (at < 0) throw Error(`Missing ${marker}`);
 return [...source.slice(0,at).matchAll(/function ([$\w]+)\(/g)].at(-1)[1];
};
const weather = enclosingFunction(source.match(/\w+\.sunElevationDeg=\w+\.sunEl/)[0]);
const loadFlip = enclosingFunction('fx/fx_a.webp');
const searchlightAt = source.indexOf('coned=new Set');
if (searchlightAt < 0) throw Error('Missing searchlight class');
const searchlights = [...source.slice(0,searchlightAt).matchAll(/var ([$\w]+)=class/g)].at(-1)[1];
const loadHero = requireMatch(/\.quality!==`low`&&([$\w]+)\(\w+\.renderer\)/);
const compile = async path => (await transform((await fs.readFile(path, 'utf8')).replace(/^import .*;\n/gm, '').replace(/export /g, ''), { loader: 'ts' })).code;
const config = await compile('src/dev/VisualRigConfig.ts');
const fixture = await compile('src/dev/VisualRigScene.ts');
const extra = `\nwindow.__liveRig=(()=>{const THREE={Vector3:${vector}}, Atmos=${atmosphere}, applyWeather=${weather}, Searchlights=${searchlights}, CAMPAIGN=${campaign};\n${config}\n${fixture}\nreturn {setupRigShot,seededRandom,load:async()=>{await ${loadFlip}();await ${loadHero}(window.engine.renderer);}};})();`;
const shots = JSON.parse(await fs.readFile('tools/visual-shots.json'));
const ids = ['explosion-close','flak-barrage','night-flak','damaged-neighbour'];
await fs.mkdir(out,{recursive:true});
const manifest = {complete:false, origin,script,sha256:createHash('sha256').update(source).digest('hex'),fetchedAt:new Date().toISOString(),method:'Deployed bundle + unchanged VisualRigScene fixture; expose production symbols, freeze clocks/RAF',shots:[]};
const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu','--autoplay-policy=no-user-gesture-required']});
try {
 for(const id of ids){
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,serviceWorkers:'block'});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/THREE|WebGL|shader/i.test(m.text()))errors.push(m.text());});
  await context.route('**/*',route=>{
   // Pin the fetched HTML as well: a deployment between shots must not switch bundles.
   if(route.request().url()===origin+'/')return route.fulfill({body:html,contentType:'text/html'});
   if(route.request().url()===script)return route.fulfill({body:source+extra,contentType:'application/javascript'});
   return new URL(route.request().url()).origin===origin?route.continue():route.abort();
  });
  await page.addInitScript(()=>{
   let seed=19431008;Math.random=()=>{seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};
   requestAnimationFrame=()=>1;cancelAnimationFrame=()=>{};
   localStorage.setItem('sws3d.settings.v2',JSON.stringify({quality:'high',bookends:false,analytics:false,killcam:false,autoQuality:false}));
   localStorage.setItem('sws3d.onboarding.v1',JSON.stringify({promptDismissed:true}));
  });
  try{
   await page.goto(origin);
   await page.waitForFunction(()=>window.sws?.assetsReady(),null,{timeout:180000,polling:100});
   await page.evaluate(()=>window.__liveRig.load());
   const metadata=await page.evaluate(async shot=>{
    const e=window.engine,g=window.game,r=window.__liveRig,realNow=performance.now.bind(performance);
    let tick=0;Object.defineProperty(performance,'now',{value:()=>tick/60*1000});Date.now=()=>Date.UTC(1943,9,8,12)+tick/60*1000;
    g.input.lock=()=>{};g.bookends.auto=true;e.livingSky.bind(g.world);e.bomberStream.bind(g.world);e.setQuality('high');g.world.effects.setQuality('high');
    Math.random=r.seededRandom(19431008);
    const facts=r.setupRigShot(e,g,shot,()=>{tick++;e.frame(1/60,false);});
    e.onFrame=undefined;e.beforeFrame=undefined;
    const style=document.createElement('style');style.textContent='body > :not(#app):not(script):not(style){display:none!important} #app{position:fixed;inset:0} #app>canvas{display:block}';document.head.append(style);
    e.camera.updateMatrixWorld(true);e.post.resetHistory();e.clouds.resetHistory();
    for(let i=0;i<24;i++)e.render(1/60);
    const gl=e.renderer.getContext(),px=new Uint8Array(4);const sync=()=>gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);sync();
    const times=[];const before=e.renderer.info.programs.length;
    for(let i=0;i<60;i++){const t=realNow();e.render(1/60);sync();times.push(realNow()-t);}times.sort((a,b)=>a-b);
    return {version:2,shot:shot.id,seed:19431008,backend:'webgl2',quality:'high',weather:facts.weather,viewport:[1920,1080],renderSize:[e.renderer.domElement.width,e.renderer.domElement.height],steps:360,time:e.time,worldTime:g.world.time,camera:{position:e.camera.position.toArray(),quaternion:e.camera.quaternion.toArray(),fov:e.camera.fov},...facts,frameMs:{mean:times.reduce((a,b)=>a+b,0)/60,p50:times[30],p95:times[57],programsBefore:before,programsAfter:e.renderer.info.programs.length}};
   },shots.find(s=>s.id===id));
   const data=await page.evaluate(()=>{engine.render(0);return engine.renderer.domElement.toDataURL('image/png');});
   const png=Buffer.from(data.split(',')[1],'base64');
   await fs.writeFile(`${out}/${id}.png`,png);await fs.writeFile(`${out}/${id}.jpg`,await smallJpeg(png));
   if(errors.length)throw Error(errors.join('\n'));
   manifest.shots.push({...metadata,errors});console.log(id,metadata.frameMs);
  }finally{await context.close();}
 }
 manifest.complete=true;
}finally{await fs.writeFile(`${out}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');await browser.close();}

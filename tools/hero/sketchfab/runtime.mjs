import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??`${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`);
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--use-angle=metal','--enable-gpu']});
const results=[];
try{
 for(const mode of ['high','low','fallback']){
  const errors=[],context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
  await context.addInitScript(quality=>{localStorage.setItem('sws3d.settings.v2',JSON.stringify({quality,bookends:false}));localStorage.setItem('sws3d.onboarding.v1',JSON.stringify({promptDismissed:true}));},mode==='low'?'low':'high');
  await context.route(/https:\/\/.*(googleapis|firebaseio|firestore|identitytoolkit|securetoken).*/,r=>r.abort());
  if(mode==='fallback')await context.route(/\/models\/(bf109|fw190)_.*\.ktx2/,r=>r.fulfill({status:404,body:''}));
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:5330');await p.waitForFunction(()=>window.sws?.assetsReady(),null,{timeout:180000});
  await p.evaluate(()=>{sws.engine.loopOverride=()=>{};sws.game.input.lock=()=>{};});
  await p.evaluate(async()=>{const {instantiate}=await import('/src/world/Models.ts');window.fighterMapsReady=()=>['bf109','fw190'].every(k=>{let compressed=false;instantiate(k).traverse(o=>{if(o.material?.name===`hero_${k}`)compressed ||= !!o.material.map?.isCompressedTexture;});return compressed;});});
  if(mode!=='fallback')await p.waitForFunction(()=>window.fighterMapsReady(),null,{timeout:60000});
  const result=await p.evaluate(async mode=>{
   const {instantiate}=await import('/src/world/Models.ts');const {sourceMeshes}=await import('/src/world/destruction/Split.ts');
   const kinds={};for(const kind of ['bf109','fw190']){
    const model=instantiate(kind);model.updateMatrixWorld(true);
    const camera=sws.engine.camera.clone();camera.position.set(0,0,8);camera.updateMatrixWorld(true);
    model.traverse(o=>{if(o.isLOD)o.update(camera);});
    const parts=Array(7).fill(0);
    for(const {mesh,part}of sourceMeshes(model))parts[part]+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;
    let compressed=false,lod2=false;model.traverse(o=>{if(o.material?.name===`hero_${kind}`)compressed ||= !!o.material.map?.isCompressedTexture;if(o.name==='part_fuselage_lod2')lod2=o.visible;});
    kinds[kind]={parts,compressed,lod2};
   }
   const destruction={};if(mode==='high'){const {destructionQa}=await import('/src/dev/destructionQa.ts');const qa=destructionQa(sws.engine,sws.game);for(const s of ['wing','tail'])destruction[s]=await qa.capture(s,false);}
   return {mode,kinds,destruction};
  },mode);
  results.push({...result,errors});console.log(JSON.stringify(result));
  for(const kind of Object.values(result.kinds)){
   assert.ok(kind.parts.every(n=>n>0),'all seven structural parts have geometry');
   assert.equal(kind.compressed,mode!=='fallback','compressed or embedded fallback as requested');
   assert.equal(kind.lod2,mode==='low','Low forces the far geometry; High retains close detail');
  }
  assert.deepEqual(errors,[]);await context.close();
 }
}finally{await browser.close();await fs.writeFile('docs/phase11/shots/01b/runtime.json',JSON.stringify(results,null,2)+'\n');}
console.log(JSON.stringify(results,null,2));

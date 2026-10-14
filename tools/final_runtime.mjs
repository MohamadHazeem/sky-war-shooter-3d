import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { smallJpeg } from './visual_rig.mjs';
if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to an existing Playwright module; this check does not install browsers.');
const {chromium} = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const out = 'docs/phase10/shots/13/runtime'; await fs.mkdir(out,{recursive:true});
const browser = await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=metal']});
const results = [];
async function pageFor(shot, quality='high', baselineCrew=false) {
  const context = await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,serviceWorkers:'block'});
  if(baselineCrew) {
    const body = execFileSync('git',['show','40569f3:public/models/crew.glb']);
    await context.route('**/models/crew.glb', r=>r.fulfill({body,contentType:'model/gltf-binary'}));
  }
  const page = await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error' && /THREE|WebGL|shader/i.test(m.text())) errors.push(m.text());});
  await page.goto(`http://127.0.0.1:5313/tools/visual-rig.html?shot=${shot}&quality=${quality}`);
  await page.waitForFunction(()=>window.visualRig?.ready||window.visualRig?.error,null,{timeout:180000});
  assert.equal(await page.evaluate(()=>window.visualRig.error),undefined);
  return {page,context,errors};
}
async function save(page,name) {
  const data=await page.evaluate(()=>window.visualRig.png());
  await fs.writeFile(`${out}/${name}.jpg`,await smallJpeg(Buffer.from(data.split(',')[1],'base64')));
}
try {
  for(const quality of (process.argv.includes('--crew-only')?[]:process.argv.includes('--quick')?['high']:['high','low'])) for(const kind of (process.argv.includes('--quick')?['b17']:['b17','p51d'])) {
    const {page,context,errors}=await pageFor('b17-beauty',quality);
    const before=await page.evaluate(async kind=>{
      const {engine:e,game:g}=window.visualRig,w=g.world;
      const T=await import('/node_modules/three/build/three.module.js');
      const target=kind==='b17'?w.bombers().find(b=>b!==w.playerBomber):w.spawnEscort(w.playerBomber.pos.clone(),new T.Vector3());
      target.pos.copy(w.playerBomber.pos).add(new T.Vector3(0,40,180));
      target.vel.set(0,0,90); target.kinematic=true;
      e.camera.position.copy(target.pos).add(new T.Vector3(65,22,-80));e.camera.lookAt(target.pos);e.camera.fov=45;e.camera.updateProjectionMatrix();
      target.root.updateMatrixWorld(true);e.post.resetHistory();
      for(let i=0;i<24;i++)e.render(1/60);
      window.finalTarget=target;window.finalPrograms=e.renderer.info.programs.map(p=>p.cacheKey);
      return {programs:e.renderer.info.programs.length, kind:target.kind};
    },kind);
    await save(page,`${quality}-${kind}-intact`);
    const after=await page.evaluate(kind=>{
      const {engine:e,game:g}=window.visualRig,w=g.world,f=window.finalTarget;
      // Force the ending only for the fighter; B-17 goes through LivingFormation's cause rule.
      if(kind==='p51d') w.destruction.forceDeath(f,1|(3<<3));
      w.killAircraft(f,false,'wingL');
      for(let i=0;i<45;i++) {w.destruction.update(1/60);w.effects.update(1/60);e.camera.position.copy(f.pos).add({x:65,y:22,z:-80});e.camera.lookAt(f.pos);e.render(1/60);}
      const pieces=w.destruction.piecesOf(f);
      return {counts:w.destruction.counts(),programs:e.renderer.info.programs.length,alive:f.alive,falling:f.falling,finite:pieces.every(p=>Number.isFinite(p.body.pos.length())),
        newPrograms:e.renderer.info.programs.filter(p=>!window.finalPrograms.includes(p.cacheKey)).map(p=>({key:p.cacheKey,vertex:e.renderer.getContext().getShaderSource(p.vertexShader).slice(-3000),fragment:e.renderer.getContext().getShaderSource(p.fragmentShader).slice(-3000)})),mass:pieces.reduce((n,p)=>n+p.mass,0),sourceTriangles:w.destruction.state(f).split.parts.reduce((n,p)=>n+p.tris,0)};
    },kind);
    assert.ok(after.counts.pieces>0 && after.counts.hulks===1);assert.equal(after.falling,false);assert.ok(after.finite);if(after.programs!==before.programs) console.log(JSON.stringify(after.newPrograms));assert.equal(after.programs,before.programs,'No breakup shader compilation');
    await save(page,`${quality}-${kind}-wing-off`);
    const exploded=await page.evaluate(()=>{
      const {engine:e,game:g}=window.visualRig,w=g.world,f=window.finalTarget;
      w.destruction.explode(f);
      for(let i=0;i<30;i++){w.destruction.update(1/60);w.effects.update(1/60);e.render(1/60);}
      const pieces=w.destruction.piecesOf(f);
      return {counts:w.destruction.counts(),shards:pieces.filter(p=>p.shard).length,finite:pieces.every(p=>Number.isFinite(p.body.pos.length())),programs:e.renderer.info.programs.length};
    });
    assert.ok(exploded.shards>0 && exploded.finite);assert.equal(exploded.programs,before.programs,'No explosion shader compilation');
    await save(page,`${quality}-${kind}-exploded`);
    assert.deepEqual(errors,[]);
    results.push({quality,kind,before,after,exploded,errors});
    await context.close(); console.log(`${quality} ${kind}: ${after.counts.pieces} pieces, programs ${before.programs} -> ${after.programs}`);
  }
  let crewCamera;
  for(const baseline of (process.argv.includes('--quick')?[]:[true,false])) {
    const {page,context,errors}=await pageFor('waist-interior','high',baseline);
    const camera=await page.evaluate(fixed=>{
      const {engine:e}=window.visualRig;
      const actor=window.visualRig.game.gunner.living.st.man;
      const head=actor.bone.head;
      if(!head)throw Error('Waist gunner head missing');
      const target=e.camera.position.clone();head.getWorldPosition(target);target.y-=0.45;
      e.camera.position.sub(target).normalize().multiplyScalar(1.65).add(target);
      if(fixed){e.camera.position.fromArray(fixed.position);target.fromArray(fixed.target);}
      e.camera.lookAt(target);e.camera.fov=45;e.camera.updateProjectionMatrix();e.post.resetHistory();
      for(let i=0;i<24;i++)e.render(1/60);
      return {position:e.camera.position.toArray(),target:target.toArray()};
    },crewCamera);
    crewCamera=camera;
    await save(page,`crew-${baseline?'before':'after'}`);assert.deepEqual(errors,[]);results.push({crew:baseline?'before':'after',camera,errors});
    await context.close();
  }
} finally {await browser.close();await fs.writeFile(`${out}/${process.argv.includes('--crew-only')?'crew-checks':'checks'}.json`,JSON.stringify(results,null,2)+'\n');}

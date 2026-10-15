// Supplemental fixed cloud-only views and temporal stability, on the existing rig.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const baseline = execFileSync('git',['show','4b8dd75:src/render/Clouds.ts'],{encoding:'utf8'}).split('const cloudFrag = /* glsl */ `')[1].split('`;')[0];
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:process.platform === 'darwin' ? ['--use-gl=angle','--use-angle=metal','--enable-gpu'] : []});
const dir = 'docs/phase11/shots/03/detail';
await fs.mkdir(dir,{recursive:true});
try {
  const page = await browser.newPage({viewport:{width:1920,height:1080}});
  const errors = [];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error' && /THREE|shader|WebGL/i.test(m.text())) errors.push(m.text());});
  await page.goto(`${process.env.CLOUD_URL ?? 'http://127.0.0.1:5323'}/tools/visual-rig.html?shot=formation-chase&quality=high`);
  await page.waitForFunction(()=>window.visualRig?.ready,null,{timeout:180000});
  const records=[];
  for(const view of (process.env.CLOUD_VIEWS?.split(',') ?? ['sun-gap','sun-gap-towers','cloud-shoulder'])) for(const mode of (process.argv.includes('--after-only') ? ['after'] : ['before','after'])) {
    const data=await page.evaluate(async ({baseline,view,mode})=>{
      const { Atmos, skyGLSL } = await import('/src/render/Atmosphere.ts');
      const { depthGLSL } = await import('/src/render/Clouds.ts');
      const { CLOUD_LIGHTS } = await import('/src/render/CloudLights.ts');
      const { DataUtils } = await import('/node_modules/.vite/deps/three.js');
      const e=visualRig.engine,g=visualRig.game,c=e.clouds;
      c.filmOriginal ??= c.tMat.fragmentShader;
      c.filmSync ??= c.syncUniforms.bind(c);
      c.syncUniforms = (...args) => { c.filmSync(...args); if (mode === 'before') { c.uniforms.uLow.value.y = 5900; c.uniforms.uLow.value.w = 3; } };
      const before=new Function('skyGLSL','depthGLSL','CLOUD_LIGHTS','return `'+baseline+'`')(skyGLSL,depthGLSL,CLOUD_LIGHTS);
      for(const mat of [c.tMat,c.shadowMat,c.probeMat]) {mat.fragmentShader=mode==='before'?before:c.filmOriginal;mat.needsUpdate=true;}
      const weather={sunEl:view.startsWith('sun-gap')?7:32,sunAz:250,low:.55,high:.25,...(view.startsWith('sun-gap')?{mood:'dusk'}:{})};
      g.setWeather(weather);
      const cam=e.camera;
      cam.position.set(view==='sun-gap-towers'?-10000:-6000,view==='sun-gap-towers'?7000:view==='sun-gap'?5100:5500,400);
      // Read the active renderer singleton after weather sync. A bare Vite import
      // can be a second Atmos instance after HMR and point this camera at old sun.
      e.render(0);
      const dir=c.uniforms.uSunDir.value.clone();
      if(view==='cloud-shoulder') {dir.x=-dir.x;dir.y=-.12;}
      cam.lookAt(cam.position.clone().addScaledVector(dir,10000));cam.fov=58;
      cam.updateProjectionMatrix();cam.updateMatrixWorld(true);
      e.post.resetHistory();c.resetHistory();
      c.settleProbeForCapture(e.renderer,cam,e.time);
      for(let i=0;i<24;i++) e.render(1/60); // match the production fixture settling interval
      e.render(0);
      const png=e.renderer.domElement.toDataURL('image/png');
      // Frozen cloud-transmittance residuals measure march noise independently of
      // grain, TAA, post exposure, and different cloud coverage between versions.
      let prior=null,total=0,count=0,max=0;
      for(let frame=0;frame<16;frame++) {
        e.render(1/60);
        const rt=c.hist[c.idx],px=new Uint16Array(rt.width*rt.height*4);
        e.renderer.readRenderTargetPixels(rt,0,0,rt.width,rt.height,px);
        if(prior) for(let i=3;i<px.length;i+=4) {
          const a=DataUtils.fromHalfFloat(px[i]),b=DataUtils.fromHalfFloat(prior[i]);
          if(!Number.isFinite(a)) throw new Error('Nonfinite cloud history');
          const delta=Math.abs(a-b);total+=delta;count++;max=Math.max(max,delta);
        }
        prior=px;
      }
      return {png,weather,camera:{position:cam.position.toArray(),quaternion:cam.quaternion.toArray(),fov:cam.fov},meanAlphaDelta:total/count,maxAlphaDelta:max};
    },{baseline,view,mode});
    const {png,...metrics}=data;
    await fs.writeFile(`${dir}/${view}-${mode}.jpg`,await sharp(Buffer.from(png.split(',')[1],'base64')).resize(960).jpeg({quality:82}).toBuffer());
    records.push({view,mode,...metrics});
    console.log(`${view} ${mode}: mean alpha residual ${metrics.meanAlphaDelta.toFixed(5)}`);
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(`${dir}/metrics.json`,JSON.stringify({records,errors},null,2)+'\n');
} finally {await browser.close();}

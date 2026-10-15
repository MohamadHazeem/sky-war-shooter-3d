// Port 5322, existing bundled headless shell only. Run through tools/heavy.sh.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const browser = await chromium.launch({headless:true, executablePath:process.env.PLAYWRIGHT_EXECUTABLE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu','--autoplay-policy=no-user-gesture-required']});
const output='docs/phase11/shots/02/runtime.json', results=[];
try {
 for(const quality of ['high','low']) {
  const context=await browser.newContext({viewport:{width:1920,height:1080},serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(/THREE|shader|WebGL|feedback loop|GL_INVALID/i.test(m.text()) && ['error','warning'].includes(m.type()))errors.push(m.text());});
  await page.goto(`http://127.0.0.1:5322/tools/visual-rig.html?shot=top-formation&quality=${quality}`);
  await page.waitForFunction(()=>window.visualRig?.ready||window.visualRig?.error,null,{timeout:180000});
  const result=await page.evaluate(async()=>{
   const {engine:e,game:g}=window.visualRig,r=e.renderer;
   const resource=path=>performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname===path)?.name??path;
   const T=await import(performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname.endsWith('/three.js')).name);
   const {GLASS_REFLECTION_GLSL,reflectionUniforms:u,bindGlassReflection}=await import(resource('/src/render/GlassReflection.ts'));
   // A controlled view-space surface reflects a coloured opaque receiver at a known depth.
   const depth=new T.DataTexture(new Float32Array([2+.5*.3*Math.pow(2.25,5)-.1]),1,1,T.RedFormat,T.FloatType);depth.needsUpdate=true;
   const color=new T.DataTexture(new Uint8Array([220,80,30,255]),1,1);color.needsUpdate=true;
   const camera=new T.PerspectiveCamera(140,1,.03,1000);
   bindGlassReflection(color,depth,camera,true);
   const mat=new T.ShaderMaterial({uniforms:u,vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:GLASS_REFLECTION_GLSL+'\nvoid main(){gl_FragColor=swsGlassReflection(vec3(0.,0.,-2.),vec3(.8660254,0.,.5));}',depthTest:false,depthWrite:false});
   const scene=new T.Scene(),quad=new T.Mesh(new T.PlaneGeometry(2,2),mat);scene.add(quad);
   const target=new T.WebGLRenderTarget(4,4),pixel=new Uint8Array(4);
   const sample=()=>{r.setRenderTarget(target);r.render(scene,camera);r.readRenderTargetPixels(target,2,2,1,1,pixel);return [...pixel];};
   const hit=sample();depth.image.data[0]=1;depth.needsUpdate=true;const miss=sample();
   depth.image.data[0]=65000;depth.needsUpdate=true;const sky=sample();u.swsReflectionOn.value=0;const off=sample();
   r.setRenderTarget(null);target.dispose();depth.dispose();color.dispose();quad.geometry.dispose();mat.dispose();
   // Restore world textures before checking the warmed aircraft render path.
   e.render(1/60);g.world.prewarm(()=>e.render(1/60),e.camera);
   const gl=r.getContext(),compile=gl.compileShader.bind(gl);let compiles=0;
   gl.compileShader=(shader)=>{compiles++;compile(shader);};
   const programs=r.info.programs.length;
   for(let i=0;i<36;i++)e.render(1/60);
   const glError=gl.getError();gl.compileShader=compile;
   return {quality:e.quality,hit,miss,sky,off,glError,compiles,programsBefore:programs,programsAfter:r.info.programs.length,reflectionOn:u.swsReflectionOn.value};
  });
  results.push({...result,errors});await fs.writeFile(output,JSON.stringify(results,null,2)+'\n');
  assert.equal(errors.length,0,errors.join('\n'));assert.equal(result.glError,0);
  assert.ok(result.hit[0]>200 && result.hit[3]>200,'Opaque receiver reflected');
  assert.equal(result.miss[3],0,'Foreground depth rejected');assert.ok(result.sky[3]>100,'Sky fallback sampled');assert.equal(result.off[3],0);
  assert.equal(result.compiles,0);assert.equal(result.programsBefore,result.programsAfter);
  assert.equal(result.reflectionOn,quality==='low'?0:1);console.log(result);await context.close();
 }
} finally {await browser.close();}

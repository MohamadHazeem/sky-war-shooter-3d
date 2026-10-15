// Paired gunner-glass ablation and aircraft-probe coverage diagnostic. Run via tools/heavy.sh.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { smallJpeg } from './visual_rig.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu','--disable-frame-rate-limit','--disable-gpu-vsync']});
const root='docs/phase11/shots/02';
try {
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 page.on('console',m=>{if(m.type()==='error')console.log(m.text().slice(0,400));});
 await page.goto('http://127.0.0.1:5322/tools/visual-rig.html?shot=turret-glass');
 await page.waitForFunction(()=>window.visualRig?.ready||window.visualRig?.error,null,{timeout:180000});
 const data=await page.evaluate(()=>visualRig.png());
 await fs.writeFile(`${root}/gunner-reflection.jpg`,await smallJpeg(Buffer.from(data.split(',')[1],'base64')));
 const result=await page.evaluate(async()=>{
  const {engine:e,game:g}=visualRig,r=e.renderer,pane=g.gunner.glassFx.paneForDev('top');
  const shared=pane.mat.uniforms.swsReflectionOn;pane.mat.uniforms.swsReflectionOn={value:0};
  e.post.resetHistory();for(let i=0;i<24;i++)e.render(1/60);
  const off=await visualRig.png();pane.mat.uniforms.swsReflectionOn=shared;
  const original=pane.mat.fragmentShader;
  // White = actual aircraft geometry in the reflected direction; the sky is excluded.
  pane.mat.fragmentShader=original
   .replace('vec3 col = vec3(0.0);','float probeCoverage=0.;vec3 col = vec3(0.0);')
   .replace('sky=mix(sky,aircraft.rgb,aircraft.a);','probeCoverage=aircraft.a;sky=mix(sky,aircraft.rgb,aircraft.a);')
   .replace('gl_FragColor = vec4(col * keep, a);','gl_FragColor=vec4(vec3(probeCoverage),1.);');
  pane.mat.needsUpdate=true;
  e.post.resetHistory();for(let i=0;i<24;i++)e.render(1/60);
  const mask=await visualRig.png();
  const probe=e.glassProbe, pixels=new Uint16Array(256*256*4), faces=[];
  for(let f=0;f<6;f++){r.readRenderTargetPixels(probe.target,0,0,256,256,pixels,f);let covered=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])covered++;faces.push(covered);}
  return {off,mask,info:{faces,ready:probe.mask,active:pane.mat.uniforms.swsFormationOn.value,materials:e.submission.scene.children.filter(o=>o.material).map(o=>o.material.name).filter(n=>n.includes('hero')).slice(0,10)}};
 });
 console.log(result.info);
 await fs.writeFile(`${root}/gunner-probe.json`,JSON.stringify(result.info,null,2)+'\n');
 for(const key of ['off','mask'])await fs.writeFile(`${root}/gunner-${key}.jpg`,await smallJpeg(Buffer.from(result[key].split(',')[1],'base64')));
} finally {await browser.close();}

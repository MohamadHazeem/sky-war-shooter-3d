import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??`${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`);
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE});
const out='docs/phase11/shots/01b',errors=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.message));
 for(const [name,query] of [
  ['own-seated-crew','kind=seated-crew&cam=.95,.25,1.5&at=0,-.42,0&fov=43'],
  ['own-p51-pilot','kind=p51d&cam=1.3,1.3,.4&at=0,.3,-.95&fov=48'],
  ['own-b17-crew','kind=hero/b17&cam=2,1.7,5.2&at=0,.5,2.55&fov=48']
 ]){
  await page.goto(`http://127.0.0.1:5330/tools/hero/luftwaffe/turntable.html?${query}`);await page.waitForFunction(()=>window.ready);
  await page.screenshot({path:`${out}/${name}.jpg`,quality:80});
 }
 await fs.writeFile(`${out}/crew-checks.json`,JSON.stringify({errors},null,2)+'\n');if(errors.length)throw new Error(errors.join('\n'));
}finally{await browser.close();}

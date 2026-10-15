// Four fixed views per shipped escort, with the actual KTX2 maps. Run through heavy.sh.
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';
const pw=process.env.PLAYWRIGHT_MODULE ?? path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const {chromium}=await import(pathToFileURL(pw).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE});
const stats={};
try {
 const page=await browser.newPage({viewport:{width:1400,height:900}});
 page.on('pageerror',e=>{throw e;});
 for(const kind of ['p47d','spitfire9']) {
  await page.goto(`${process.env.ESCORT_URL ?? 'http://127.0.0.1:5423'}/tools/hero/luftwaffe/turntable.html?kind=${kind}&ktx2=1`);
  await page.waitForFunction(()=>window.ready,null,{timeout:120000});
  stats[kind]=await page.evaluate(()=>window.ready);
  await page.screenshot({path:`docs/phase11/shots/23/${kind}-turntable.jpg`,type:'jpeg',quality:80});
 }
 await fs.writeFile('docs/phase11/shots/23/turntables.json',JSON.stringify(stats,null,2)+'\n');
 console.log(stats);
} finally {await browser.close();}

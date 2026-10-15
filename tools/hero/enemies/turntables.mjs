import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import os from 'node:os';import path from 'node:path';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE??path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE});
const out='docs/phase11/shots/24';await fs.mkdir(out,{recursive:true});
try{const page=await browser.newPage({viewport:{width:1400,height:900}});for(const kind of ['me410','me163','ju88g']){
 await page.goto(`http://127.0.0.1:5424/tools/hero/luftwaffe/turntable.html?kind=${kind}&ktx2=1`);
 await page.waitForFunction(()=>window.ready,null,{timeout:120000});
 console.log(kind,await page.evaluate(()=>window.ready));
 await page.screenshot({path:`${out}/${kind}-turntable.jpg`,type:'jpeg',quality:80});
}}finally{await browser.close();}

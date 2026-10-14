// Run against tools/serve_throttled.mjs dist --port 5312 --mbps 10 --rtt 60.
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=metal','--enable-gpu']});
try {
 const page=await browser.newPage({viewport:{width:1920,height:1080},serviceWorkers:'block'});
 await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5312' ? route.continue() : route.abort());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
   window.requestAnimationFrame=()=>0;
   localStorage.setItem('sws3d.settings.v2',JSON.stringify({volume:0,radio:false,music:false,analytics:false}));
 });
 await page.goto('http://127.0.0.1:5312', {waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>performance.getEntriesByName('menu').length>0,null,{timeout:180000,polling:100});
 const result=await page.evaluate(()=>{
  const menu=performance.getEntriesByName('menu')[0].startTime;
  const resources=performance.getEntriesByType('resource').filter(r=>r.responseEnd<=menu).map(r=>({name:new URL(r.name).pathname,transferBytes:r.transferSize,bodyBytes:r.encodedBodySize,endMs:r.responseEnd}));
  return {menuMs:menu,domContentLoadedMs:performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,resources,
   transferBytesBeforeMenu:resources.reduce((s,r)=>s+r.transferBytes,0),quality:window.engine.quality};
 });
 await fs.writeFile('docs/phase10/shots/12/after/first-load.json',JSON.stringify({...result,errors,method:'Production build; fresh HTTP cache/storage; service worker blocked; shared 10 Mbit/s link, 60 ms request latency; external requests blocked; engine animation stopped; performance.mark(menu)'},null,2)+'\n');
 console.log({menuMs:result.menuMs,transferBytes:result.transferBytesBeforeMenu,errors});
} finally {await browser.close();}

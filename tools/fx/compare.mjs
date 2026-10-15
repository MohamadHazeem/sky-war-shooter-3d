// Matched live/after acceptance sheets; abort on mismatched fixtures.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {smallJpeg} from '../visual_rig.mjs';
const root='docs/phase11/shots/04';
const live=JSON.parse(await fs.readFile(`${root}/live/manifest.json`));
const after=JSON.parse(await fs.readFile(`${root}/after/manifest.json`));
assert(live.complete&&after.complete);
for(const a of after.shots){
 const b=live.shots.find(s=>s.shot===a.shot);assert(b);
 for(const key of ['version','seed','quality','weather','viewport','renderSize','steps','camera'])assert.deepEqual(a[key],b[key],`${a.shot}: ${key}`);
 const parts=[];
 for(const [i,dir] of ['live','after'].entries()){
  const label=Buffer.from(`<svg width="960" height="32"><rect width="960" height="32" fill="#151b22"/><text x="12" y="23" fill="white" font-family="sans-serif" font-size="18">${dir==='live'?'LIVE main':'Phase 11 / 04'} — ${a.shot}</text></svg>`);
  parts.push({input:await sharp(`${root}/${dir}/${a.shot}.png`).resize(960,540).png().toBuffer(),left:i*960,top:32});
  parts.push({input:label,left:i*960,top:0});
 }
 const sheet=await sharp({create:{width:1920,height:572,channels:3,background:'#151b22'}}).composite(parts).png().toBuffer();
 await fs.writeFile(`${root}/compare-${a.shot}.jpg`,await smallJpeg(sheet,1920));
}
console.log('All four fixtures match: camera, weather, seed, simulation steps and image size.');

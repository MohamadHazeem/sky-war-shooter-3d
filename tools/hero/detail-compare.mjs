import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { smallJpeg } from '../visual_rig.mjs';
const dir='docs/phase11/shots/01';
const closeBefore=JSON.parse(await fs.readFile(`${dir}/before/detail.json`));
const closeAfter=JSON.parse(await fs.readFile(`${dir}/after/detail.json`));
assert.ok(closeBefore.complete && closeAfter.complete);
assert.equal(closeBefore.seed,closeAfter.seed);
assert.equal(closeBefore.quality,closeAfter.quality);
assert.equal(closeBefore.views.length,closeAfter.views.length);
assert.deepEqual(closeBefore.errors,[]);assert.deepEqual(closeAfter.errors,[]);
for(let i=0;i<closeBefore.views.length;i++){
 const a=closeBefore.views[i],b=closeAfter.views[i];assert.equal(a.kind,b.kind);assert.deepEqual(a.subject,b.subject);assert.deepEqual(a.aircraft,b.aircraft);assert.deepEqual(a.weather,b.weather);assert.ok(Math.abs(a.modelRange-b.modelRange)<1e-6);
 for(const key of ['position','quaternion'])a.camera[key].forEach((x,j)=>assert.ok(Math.abs(x-b.camera[key][j])<1e-7));
 assert.equal(a.camera.fov,b.camera.fov);
 if(a.kind.endsWith('-30m'))assert.ok(Math.abs(a.modelRange-30)<1e-6,'30 m fixture must actually be at 30 m');
}
for(const shot of closeBefore.views.map(v=>v.fixture?v.kind:`close-${v.kind}`)) {
 const images=await Promise.all(['before','after'].map(p=>sharp(`${dir}/${p}/${shot}.jpg`).resize(960).toBuffer()));
 const h=(await sharp(images[0]).metadata()).height;
 const label=Buffer.from(`<svg width="1920" height="34"><rect width="1920" height="34" fill="#16212a"/><g fill="white" font-size="20" font-family="sans-serif"><text x="12" y="24">LIVE MAIN ASSETS · ${shot}</text><text x="972" y="24">PHASE 11 · ${shot}</text></g></svg>`);
 const sheet=await sharp({create:{width:1920,height:h+34,channels:3,background:'#16212a'}}).composite([{input:images[0],left:0,top:34},{input:images[1],left:960,top:34},{input:label,left:0,top:0}]).png().toBuffer();
 await fs.writeFile(`${dir}/compare-${shot}.jpg`,await smallJpeg(sheet,1920));
}
console.log('Matching cameras, aircraft poses, range, weather and preset gates passed.');

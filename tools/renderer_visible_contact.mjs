// Compare the goal-00 fixtures without changing camera, weather or seed.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const root=process.argv[2]??'docs/phase10/shots/01b';
const before=JSON.parse(await fs.readFile(`${root}/before/manifest.json`));
const after=JSON.parse(await fs.readFile(`${root}/after/manifest.json`));
assert.ok(before.complete&&after.complete);
assert.equal(before.seed,after.seed);assert.equal(before.quality,after.quality);
const tiles=[];
for(let i=0;i<before.shots.length;i++){
 const shot=before.shots[i],next=after.shots[i];
 assert.equal(shot.shot,next.shot);assert.deepEqual(shot.camera,next.camera);assert.deepEqual(shot.weather,next.weather);
 for(const [j,stage] of ['before','after'].entries()){
  const left=(i%2)*640+j*320,top=Math.floor(i/2)*202;
  const label=Buffer.from(`<svg width="320" height="22"><rect width="320" height="22" fill="#14212a"/><text x="8" y="16" fill="#eee6d1" font-family="sans-serif" font-size="12">${shot.shot} · ${stage}</text></svg>`);
  tiles.push({input:label,left,top},{input:await sharp(`${root}/${stage}/${shot.shot}.jpg`).resize(320,180).toBuffer(),left,top:top+22});
 }
}
await sharp({create:{width:1280,height:Math.ceil(before.shots.length/2)*202,channels:3,background:'#14212a'}}).composite(tiles).jpeg({quality:76,mozjpeg:true}).toFile(`${root}/comparison.jpg`);
console.log(`Matched all ${before.shots.length} cameras, weather fixtures and seeds.`);

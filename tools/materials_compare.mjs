import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { smallJpeg } from './visual_rig.mjs';
const root='docs/phase11/shots/02';
const before=JSON.parse(await fs.readFile(`${root}/before/manifest.json`)),after=JSON.parse(await fs.readFile(`${root}/after/manifest.json`));
assert.ok(before.complete && after.complete);
for(const b of before.shots){const a=after.shots.find(s=>s.shot===b.shot);for(const key of ['version','seed','quality','camera','weather','steps','renderSize','formationPose','flakPositions','terrainMapped','terrainTextures'])assert.deepEqual(a[key],b[key],`${b.shot}: ${key}`);}
for(const [index,ids] of [['surfaces',['b17-beauty','top-formation','p51-cockpit']],['lighting',['waist-interior','sunset','night-flak']],['gunner-shadows',['turret-glass','close-shadow','formation-glints']]]){
 const layers=[];
 for(let row=0;row<ids.length;row++)for(let col=0;col<2;col++){
  const phase=col?'after':'before';
  const png=await sharp(`${root}/${phase}/${ids[row]}.jpg`).resize(640,360).extend({top:25,background:'#151a22'}).png().toBuffer();
  const label=Buffer.from(`<svg width="640" height="385"><text x="10" y="18" fill="white" font-size="14">${phase==='before'?'LIVE MAIN SOURCE':'AFTER'} · ${ids[row]}</text></svg>`);
  layers.push({input:await sharp(png).composite([{input:label}]).png().toBuffer(),left:col*640,top:row*385});
 }
 const image=await sharp({create:{width:1280,height:1155,channels:3,background:'#151a22'}}).composite(layers).png().toBuffer();
 await fs.writeFile(`${root}/comparison-${index}.jpg`,await smallJpeg(image,1280));
}
console.log('Matched camera, weather, seed, preset, fixture version, aircraft/flak poses, terrain hashes and native render size for all nine pairs.');

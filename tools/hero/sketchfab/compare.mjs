import {existsSync,readFileSync,copyFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const dir='docs/phase11/shots/01b',w=960,h=540,head=30;
async function sheet(a,b,name){
 if(!existsSync(a)||!existsSync(b))throw new Error(`Missing comparison input ${name}`);
 const tile=async(file,label)=>sharp({create:{width:w,height:h+head,channels:3,background:'#18212b'}}).composite([
  {input:await sharp(file).resize(w,h,{fit:'contain'}).toBuffer(),left:0,top:head},
  {input:Buffer.from(`<svg width="${w}" height="${head}"><text x="10" y="21" fill="white" font-family="sans-serif" font-size="16">${label}</text></svg>`),left:0,top:0}
 ]).png().toBuffer();
 await sharp({create:{width:w*2,height:h+head,channels:3,background:'#18212b'}}).composite([
  {input:await tile(a,'LIVE main fighter assets'),left:0,top:0},{input:await tile(b,'Phase 11 / revised Sketchfab hero'),left:w,top:0}
 ]).jpeg({quality:88}).toFile(`${dir}/compare-${name}.jpg`);
}
for(const kind of ['bf109','fw190'])for(const suffix of ['', '-close'])await sheet(`${dir}/before-turntable-${kind}${suffix}.jpg`,`${dir}/after-turntable-${kind}${suffix}.jpg`,`turntable-${kind}${suffix}`);
const before=JSON.parse(readFileSync(`${dir}/live/manifest.json`)),after=JSON.parse(readFileSync(`${dir}/after/manifest.json`));
assert.ok(before.complete&&after.complete);
for(const a of before.shots){
 const b=after.shots.find(s=>s.shot===a.shot);assert.ok(b);
 for(const key of ['camera','enemy','enemies','weather','time','worldTime','effectsCleared'])assert.deepEqual(a[key],b[key],`${a.shot}: ${key}`);
 await sheet(`${dir}/live/${a.shot}.jpg`,`${dir}/after/${a.shot}.jpg`,a.shot);
 // Replace the rejected old filenames too: no stale ad-hoc combat captures in the report.
 const alias={'waist-fw190-broadside':'waist150-fw190','waist-bf109-broadside':'waist150-bf109','tail-bf109':'tail-diving-bf109','headon-fw190-wedge':'headon-fw190-wedge'}[a.shot];
 if(!alias)continue;
 for(const [tag,folder]of [['before','live'],['after','after']])copyFileSync(`${dir}/${folder}/${a.shot}.jpg`,`${dir}/${tag}-${alias}.jpg`);
 if(alias!==a.shot)copyFileSync(`${dir}/compare-${a.shot}.jpg`,`${dir}/compare-${alias}.jpg`);
}
console.log('All fighter camera, aircraft, weather, clock and effect-state comparisons match.');

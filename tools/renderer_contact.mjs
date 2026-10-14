import fs from 'node:fs/promises';
import sharp from 'sharp';
const root='docs/phase10/shots/01';
const {shots}=JSON.parse(await fs.readFile(`${root}/before/results.json`,'utf8'));
const tiles=[];
for(let i=0;i<shots.length;i++)for(let j=0;j<2;j++){
 const stage=j?'after':'before',name=shots[i].name,left=(i%2)*640+j*320,top=Math.floor(i/2)*202;
 const label=Buffer.from(`<svg width="320" height="22"><rect width="320" height="22" fill="#14212a"/><text x="8" y="16" fill="#eee6d1" font-family="sans-serif" font-size="13">${name} · ${stage}</text></svg>`);
 tiles.push({input:label,left,top});tiles.push({input:await sharp(`${root}/${stage}/${name}.jpg`).resize(320,180).toBuffer(),left,top:top+22});
}
await sharp({create:{width:1280,height:Math.ceil(shots.length/2)*202,channels:3,background:'#14212a'}}).composite(tiles).jpeg({quality:70}).toFile(`${root}/comparison.jpg`);

import fs from 'node:fs/promises';
import sharp from 'sharp';
import {smallJpeg} from './visual_rig.mjs';
const root='docs/phase11/shots/02';
for(const [name,shot,rect] of [
 ['shadow-detail','close-shadow',{left:880,top:435,width:640,height:240}],
 ['canopy-detail','p51-cockpit',{left:200,top:80,width:650,height:800}],
]){
 const tiles=[];
 for(let i=0;i<2;i++){
  const phase=i?'after':'before';
  const input=await sharp(`${root}/${phase}/${shot}.png`).extract(rect).resize(640).extend({top:28,background:'#151a22'}).png().toBuffer();
  const label=Buffer.from(`<svg width="640" height="28"><text x="10" y="20" fill="white" font-size="15">${i?'AFTER':'LIVE MAIN'} · ${name}</text></svg>`);
  tiles.push({input:await sharp(input).composite([{input:label,top:0,left:0}]).png().toBuffer(),left:i*640,top:0});
 }
 const height=Math.round(rect.height*640/rect.width)+28;
 const img=await sharp({create:{width:1280,height,channels:3,background:'#151a22'}}).composite(tiles).png().toBuffer();
 await fs.writeFile(`${root}/${name}.jpg`,await smallJpeg(img,1280));
}

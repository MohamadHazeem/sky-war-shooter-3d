import {existsSync} from 'node:fs';
import sharp from 'sharp';
const dir='docs/phase11/shots/01b',w=800,h=450,head=30;
async function sheet(a,b,name){
 if(!existsSync(a)||!existsSync(b))throw new Error(`Missing comparison input ${name}`);
 const tile=async(file,label)=>sharp({create:{width:w,height:h+head,channels:3,background:'#18212b'}}).composite([
  {input:await sharp(file).resize(w,h,{fit:'contain'}).toBuffer(),left:0,top:head},
  {input:Buffer.from(`<svg width="${w}" height="${head}"><text x="10" y="21" fill="white" font-family="sans-serif" font-size="16">${label}</text></svg>`),left:0,top:0}
 ]).png().toBuffer();
 await sharp({create:{width:w*2,height:h+head,channels:3,background:'#18212b'}}).composite([
  {input:await tile(a,'LIVE main / legacy'),left:0,top:0},{input:await tile(b,'Phase 11 / Sketchfab hero'),left:w,top:0}
 ]).jpeg({quality:82}).toFile(`${dir}/compare-${name}.jpg`);
}
for(const kind of ['bf109','fw190'])for(const name of [`turntable-${kind}`,`waist150-${kind}`])await sheet(`${dir}/before-${name}.jpg`,`${dir}/after-${name}.jpg`,name);
for(const name of ['tail-diving-bf109','headon-fw190-wedge'])await sheet(`${dir}/before-${name}.jpg`,`${dir}/after-${name}.jpg`,name);
for(const name of ['waist-fw190','tail-bf109'])await sheet(`${dir}/live/${name}.jpg`,`${dir}/after/${name}.jpg`,name);

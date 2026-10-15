// Fixed-metre source overlays: documents the intentional silhouette changes, no per-view fitting.
import fs from 'node:fs/promises';import sharp from 'sharp';import {triangles}from'../luftwaffe/silhouette/check.mjs';import {fillTri}from'../luftwaffe/silhouette/mask.mjs';
const out='docs/phase11/shots/24',W=480,H=420,ppm=20;await fs.mkdir(out,{recursive:true});
const report={method:'Fixed 20 pixels/metre, same origin in every view. Cyan: registered GPL source (Me 410 baseline is the old Bf 110 stand-in); orange: new model; grey: overlap. IoU documents intended changes, not a claim of agreement with an independent recognition drawing.'};
for(const [kind,base,span,length]of[['me410','bf110',16.35,12.48],['me163','me163',9.3,5.7],['ju88g','ju88',20.08,15.5]]){
 let source=await triangles(`tools/convert_models/output/${base}.glb`),hero=await triangles(`public/models/${kind}.glb`);
 if(kind==='me163')source=source.map(p=>[p[0]*9.3/8.816232,p[1],p[2]*5.7/5.898076]);
 // Barrel/aerial protrusions deliberately excluded only for Me 410 airframe length measurement.
 const body=kind==='me410'?hero.filter(p=>p[2]<=4.45):hero;
 const bounds={span:hero.reduce((v,p)=>Math.max(v,p[0]),-Infinity)-hero.reduce((v,p)=>Math.min(v,p[0]),Infinity),length:body.reduce((v,p)=>Math.max(v,p[2]),-Infinity)-body.reduce((v,p)=>Math.min(v,p[2]),Infinity)};
 report[kind]={published:{span,length},measured:bounds,spanError:Math.abs(bounds.span/span-1),lengthError:Math.abs(bounds.length/length-1),views:{}};
 if(report[kind].spanError>.05||report[kind].lengthError>.05)throw Error(`Dimension gate: ${kind}`);
 const images=[];
 for(const[i,view]of['top','side','front'].entries()){
  const project=p=>view==='top'?[-p[0],-p[2]]:view==='side'?[-p[2],-p[1]]:[-p[0],-p[1]];
  const masks=[source,hero].map(tris=>{const m=new Uint8Array(W*H),pts=tris.map(p=>{const[x,y]=project(p);return[W/2+x*ppm,H/2+y*ppm];});for(let j=0;j<pts.length;j+=3)fillTri(m,W,H,...pts[j],...pts[j+1],...pts[j+2]);return m;});
  let intersection=0,union=0;const raw=Buffer.alloc(W*H*3);for(let j=0;j<W*H;j++){const a=masks[0][j],b=masks[1][j];intersection+=a&&b?1:0;union+=a||b?1:0;raw.set(a&&b?[192,206,212]:a?[38,192,220]:b?[255,144,62]:[22,31,42],j*3);}
  report[kind].views[view]={iou:intersection/union};const label=Buffer.from(`<svg width="480" height="420"><text x="12" y="24" fill="white" font-size="16" font-family="sans-serif">${kind} / ${view} — fixed metres</text></svg>`);
  images.push({input:await sharp(raw,{raw:{width:W,height:H,channels:3}}).composite([{input:label}]).png().toBuffer(),left:W*i,top:0});
 }
 await sharp({create:{width:W*3,height:H,channels:3,background:'#161f2a'}}).composite(images).jpeg({quality:82}).toFile(`${out}/${kind}-silhouette.jpg`);
}
await fs.writeFile(`${out}/silhouette.json`,JSON.stringify(report,null,2)+'\n');console.log(report);

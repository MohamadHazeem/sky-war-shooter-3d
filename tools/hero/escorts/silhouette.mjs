// Source-shape overlay in fixed model metres; no anisotropic fit or per-view alignment.
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { triangles } from '../luftwaffe/silhouette/check.mjs';
import { fillTri } from '../luftwaffe/silhouette/mask.mjs';
const out='docs/phase11/shots/23',W=480,H=450,ppm=32;
await fs.mkdir(out,{recursive:true});
const report={method:'Unmodified FlightGear conversion (cyan) against shipped LOD0 (orange); fixed 32 px/metre; same origin, no fitting. Prop blades excluded; new spinner included.'};
for(const kind of ['p47d','spitfire9']) {
 const source=await triangles(`tools/convert_models/output/${kind}.glb`),hero=await triangles(`public/models/${kind}.glb`);
 const images=[];
 report[kind]={};
 for(const [i,view] of ['top','side','front'].entries()){
  const project=p=>view==='top'?[-p[0],-p[2]]:view==='side'?[-p[2],-p[1]]:[-p[0],-p[1]];
  const masks=[source,hero].map(tris=>{
   const m=new Uint8Array(W*H),pts=tris.map(p=>{const [x,y]=project(p);return [W/2+x*ppm,H/2+y*ppm];});
   for(let j=0;j<pts.length;j+=3)fillTri(m,W,H,...pts[j],...pts[j+1],...pts[j+2]);
   return m;
  });
  let intersection=0,union=0;const raw=Buffer.alloc(W*H*3);
  for(let j=0;j<W*H;j++){
   const a=masks[0][j],b=masks[1][j];intersection+=a&&b?1:0;union+=a||b?1:0;
   const c=a&&b?[192,206,212]:a?[38,192,220]:b?[255,144,62]:[22,31,42];raw.set(c,j*3);
  }
  report[kind][view]={iou:intersection/union};
  const text=Buffer.from(`<svg width="480" height="450"><text x="12" y="24" fill="white" font-size="16" font-family="sans-serif">${kind} / ${view} — fixed scale</text></svg>`);
  images.push({input:await sharp(raw,{raw:{width:W,height:H,channels:3}}).composite([{input:text}]).png().toBuffer(),left:W*i,top:0});
 }
 await sharp({create:{width:W*3,height:H,channels:3,background:'#161f2a'}}).composite(images).jpeg({quality:85}).toFile(`${out}/${kind}-silhouette.jpg`);
}
await fs.writeFile(`${out}/silhouette.json`,JSON.stringify(report,null,2)+'\n');
console.log(report);

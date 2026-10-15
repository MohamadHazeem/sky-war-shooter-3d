// Bind high-poly build provenance to the exact shipped GLBs.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
const report={};
for(const kind of ['b17','bf109','fw190','me262','bf110','ju88']){
 const p=kind==='b17'?'public/models/hero/b17.glb':`public/models/${kind}.glb`;
 const build=JSON.parse(readFileSync(kind==='b17'?'tools/hero/output/build.json':`tools/hero/luftwaffe/out/${kind}_report.json`));
 const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
 report[kind]={artifactSha256:createHash('sha256').update(readFileSync(p)).digest('hex'),reliefVertices:build.reliefVertices,bakeSize:1024,
  normalKtx2Sha256:hash(kind==='b17'?'public/models/hero/normal.ktx2':`public/models/${kind}_normal.ktx2`),
  normalWebpSha256:kind==='b17'?hash('public/models/hero/normal.webp'):undefined,
  triangles:kind==='b17'?build.trianglesByLod:{0:build.lod0,1:build.lod1,2:build.lod2},glbBytes:statSync(p).size};
}
writeFileSync('docs/phase11/shots/01/bakes.json',JSON.stringify(report,null,2)+'\n');

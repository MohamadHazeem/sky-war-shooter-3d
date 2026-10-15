// Bind high-poly build provenance to the exact shipped GLBs.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
const report={};
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
import { retainedRevision } from './retain-main.mjs';
for(const kind of ['b17','bf109','fw190','me262','bf110','ju88']){
 const p=kind==='b17'?'public/models/hero/b17.glb':`public/models/${kind}.glb`;
 const build=kind==='b17'?JSON.parse(readFileSync('tools/hero/output/build.json')):{};
 const doc=await io.read(p), triangles={0:0,1:0,2:0};
 for(const node of doc.getRoot().listNodes()) {
  if(!node.getMesh())continue;let level=0;
  for(let n=node;n;n=n.getParentNode()){const m=n.getName().match(/_lod([012])$/i);if(m){level=Number(m[1]);break;}}
  for(const primitive of node.getMesh().listPrimitives())triangles[level]+=(primitive.getIndices()?.getCount()??primitive.getAttribute('POSITION').getCount())/3;
 }
 const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
 report[kind]={artifactSha256:createHash('sha256').update(readFileSync(p)).digest('hex'),reliefVertices:kind==='b17'?build.reliefVertices:undefined,bakeSize:1024,
  retainedSource:kind!=='b17'?retainedRevision:undefined,
  normalKtx2Sha256:hash(kind==='b17'?'public/models/hero/normal.ktx2':`public/models/${kind}_normal.ktx2`),
  normalWebpSha256:kind==='b17'?hash('public/models/hero/normal.webp'):undefined,
  triangles,glbBytes:statSync(p).size};
}
writeFileSync('docs/phase11/shots/01/bakes.json',JSON.stringify(report,null,2)+'\n');

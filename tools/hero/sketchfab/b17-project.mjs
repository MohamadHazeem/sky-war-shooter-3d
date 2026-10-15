// Revalidate the shipped B-17 after replacing crew; consume decoded shipped geometry, not a build intermediate.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {Matrix4,Vector3} from 'three';
import {writeFileSync,mkdirSync} from 'node:fs';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const result={};
for(const [name,file]of [['hero','public/models/hero/b17.glb'],['legacy','public/models/b17.glb']]){
 const doc=await io.read(file),triangles=[],min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const n of doc.getRoot().listNodes()){
  let skip=false;for(let p=n;p&&p.getName()!=='Root';p=p.getParentNode())if(/_LOD[12]|invasion|antenna_wire|prop_/.test(p.getName()))skip=true;
  if(skip||!n.getMesh())continue;
  const matrix=new Matrix4().fromArray(n.getWorldMatrix());
  for(const p of n.getMesh().listPrimitives()){
   const pos=p.getAttribute('POSITION'),ix=p.getIndices(),vs=[];
   for(let i=0;i<pos.getCount();i++){const v=new Vector3().fromArray(pos.getElement(i,[0,0,0])).applyMatrix4(matrix).toArray();vs.push(v);for(let c=0;c<3;c++){min[c]=Math.min(min[c],v[c]);max[c]=Math.max(max[c],v[c]);}}
   for(let i=0;i<(ix?.getCount()??pos.getCount());i+=3)triangles.push([0,1,2].map(j=>vs[ix?ix.getScalar(i+j):i+j]));
  }
 }
 result[name]={triangles,bounds:[min,max]};
}
mkdirSync('tools/hero/output',{recursive:true});writeFileSync('tools/hero/output/projections.json',JSON.stringify(result));

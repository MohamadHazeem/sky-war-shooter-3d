// Preserve mechanical pivots and LOD names while compressing mesh buffers.
import {NodeIO, Document} from '@gltf-transform/core';
import {ALL_EXTENSIONS, KHRTextureBasisu} from '@gltf-transform/extensions';
import {meshopt,textureCompress} from '@gltf-transform/functions';
import {MeshoptEncoder, MeshoptDecoder} from 'meshoptimizer';
import sharp from 'sharp';
import { finishNormalPng } from './normal-finish.mjs';
import { retainBomberCrew } from './retain-main.mjs';
import {mkdirSync,writeFileSync,statSync,copyFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const src=resolve('tools/hero/output'),out=resolve('public/models/hero');mkdirSync(out,{recursive:true});
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const doc=await io.read(src+'/b17.glb');
// GLTFLoader names unnamed nodes after their mesh. Never let these shadow a pivot.
doc.getRoot().listMeshes().forEach((m,i)=>m.setName('hero_geometry_'+i));
for(const n of doc.getRoot().listNodes()) if(n.getMesh()) {
  n.addChild(doc.createNode('').setMesh(n.getMesh()).setExtras({meshOf:n.getName()}));n.setMesh(null);
}
for(const m of doc.getRoot().listMaterials()) {
  if(m.getMetallicRoughnessTexture())m.setOcclusionTexture(m.getMetallicRoughnessTexture()).setOcclusionStrength(.55);
  if(m.getName()==='hero_stencils')m.setAlphaMode('MASK').setAlphaCutoff(.4).setDoubleSided(true);
  if(/marking|walkway/.test(m.getName()))m.setDoubleSided(true);
}
await retainBomberCrew(doc);
const stencilTexture=doc.getRoot().listMaterials().find(m=>m.getName()==='hero_stencils').getBaseColorTexture();
stencilTexture.setName('hero_stencils').setURI('hero_stencils.png');
await doc.transform(textureCompress({encoder:sharp,targetFormat:'webp',quality:95,resize:[512,512],pattern:/^(?!hero_stencils(?:\.|$))/}),textureCompress({encoder:sharp,targetFormat:'webp',lossless:true,pattern:/^hero_stencils$/}),meshopt({encoder:MeshoptEncoder,level:'high',quantizeTexcoord:14}));
await io.write(out+'/b17.glb',doc);
const ktx=process.env.TOKTX, basis=process.env.BASISU;
const names=['base','normal','orm','silver','silver-orm'];
for(const name of names) {
  const input=src+'/'+name+'-detail.png';
  if(name==='normal') writeFileSync(input,await finishNormalPng(src+'/'+name+'.png',1024));
  else await sharp(src+'/'+name+'.png').resize(['base','silver'].includes(name)?2048:1024).png().toFile(input);
  await sharp(input).webp({quality:95,lossless:!['base','silver'].includes(name)}).toFile(out+'/'+name+'.webp');
  if(ktx) execFileSync(ktx,['--t2','--encode','uastc','--uastc_quality','2','--zcmp','18','--genmipmap','--assign_oetf',['base','silver'].includes(name)?'srgb':'linear',out+'/'+name+'.ktx2',input],{stdio:'inherit'});
  else if(basis) execFileSync(basis,['-ktx2','-uastc','-uastc_level','2','-uastc_rdo_l',name==='normal'?'0.8':'2.0','-mipmap',...(name==='normal'?['-normal_map']:[]),...(['base','silver'].includes(name)?['-srgb']:['-linear']),'-file',input,'-output_file',out+'/'+name+'.ktx2'],{stdio:'inherit'});
}
if(ktx || basis) {
  for(const f of ['basis_transcoder.js','basis_transcoder.wasm'])copyFileSync('node_modules/three/examples/jsm/libs/basis/'+f,out+'/'+f);
  copyFileSync('tools/hero/BASIS-LICENSE.txt',out+'/BASIS-LICENSE.txt');
  // An interoperable glTF material library accompanies the lazy runtime texture set.
  const library=new Document();library.createExtension(KHRTextureBasisu).setRequired(true);
  const textures=['base','normal','orm'].map(n=>library.createTexture(n).setImage(readFileSync(out+'/'+n+'.ktx2')).setMimeType('image/ktx2').setURI(n+'.ktx2'));
  library.createMaterial('hero_detail').setBaseColorTexture(textures[0]).setNormalTexture(textures[1]).setMetallicRoughnessTexture(textures[2]).setOcclusionTexture(textures[2]);
  await io.write(out+'/detail.gltf',library);
}
const files=['b17.glb',...names.map(n=>n+'.webp'),...((ktx||basis)?names.map(n=>n+'.ktx2'):[]),...((ktx||basis)?['basis_transcoder.js','basis_transcoder.wasm','BASIS-LICENSE.txt','detail.gltf']:[])];
const bytes=Object.fromEntries(files.map(n=>[n,statSync(out+'/'+n).size]));
if(Object.values(bytes).reduce((a,b)=>a+b,0)>15*1024*1024)throw Error('B-17 download budget exceeded');
writeFileSync(out+'/manifest.json',JSON.stringify({format:(ktx||basis)?'ktx2':'webp',fallback:'webp',source:'FlightGear B-17 949abb7615da96104a72c2b1a351a05d60a0bf3c',textureSize:2048,files:bytes},null,2)+'\n');
console.log(bytes);

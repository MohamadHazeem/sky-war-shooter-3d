// Replace inherited FlightGear figures with our authored seated crew, preserving aircraft pivots.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {copyToDocument, prune, unpartition, meshopt, transformPrimitive, dequantizePrimitive} from '@gltf-transform/functions';
import {MeshoptDecoder, MeshoptEncoder} from 'meshoptimizer';
import {Matrix4} from 'three';
import {pathToFileURL} from 'node:url';
import {readFileSync, writeFileSync, statSync} from 'node:fs';
export const inheritedCrew = /ww2_pilot_old|pilotWWII|pilot-b|germanpilotsuit|germanheadgear|pilotsuit-ger|headgear-ger|^pilot1$/i;
export async function replaceCrew(doc, source) {
  const root=doc.getRoot();
  const crewMaterial = name => inheritedCrew.test(name) || /^crew(Cloth|Leather|Hard|Fleece|Skin|Rubber|Webbing|Metal|Lens|Stitch)$/.test(name);
  const targets=root.listNodes().filter(n=>n.getMesh() && (n.getExtras().crewSource || n.getMesh().listPrimitives().some(p=>inheritedCrew.test(p.getMaterial()?.getName()??''))));
  if(!targets.length)return 0;
  const sourceNode=source.getRoot().listNodes().find(n=>n.getMesh());
  const own=sourceNode.getMesh();
  const sourceMatrix=new Matrix4().fromArray(sourceNode.getWorldMatrix());
  const map=copyToDocument(doc,source,own.listPrimitives());
  const base=own.listPrimitives().map(p=>map.get(p));
  let count=0;
  for(const target of targets){
    const old=target.getMesh();
    const bomber=root.listNodes().some(n=>n.getName()==='eye_copilot');
    const names=bomber?['eye_pilot','eye_copilot','eye_bombardier','eye_tail']:['eye_pilot'];
    const mesh=doc.createMesh('own_seated_aircrew');
    for(const p of old.listPrimitives())if(!crewMaterial(p.getMaterial()?.getName()??''))mesh.addPrimitive(p);
    for(const name of names){
      const eye=root.listNodes().find(n=>n.getName()===name);
      if(!eye)throw new Error(`Missing ${name}`);
      const place=new Matrix4().fromArray(eye.getWorldMatrix());
      // Eye markers can inherit gun pivots; tail crew faces aft.
      const pos=place.elements.slice(12,15);place.identity().makeTranslation(...pos);
      if(name==='eye_tail')place.multiply(new Matrix4().makeRotationY(Math.PI));
      const local=new Matrix4().fromArray(target.getWorldMatrix()).invert().multiply(place).multiply(sourceMatrix);
      for(const p of base){
        const cp=p.clone();
        // transformPrimitive mutates accessors, so every seated copy owns its attributes.
        for(const semantic of cp.listSemantics())cp.setAttribute(semantic,cp.getAttribute(semantic).clone());
        if(cp.getIndices())cp.setIndices(cp.getIndices().clone());
        // Transform normals as floats: normalized integer writes in transformPrimitive
        // otherwise collapse their directions before the final meshopt encoding.
        dequantizePrimitive(cp);
        transformPrimitive(cp,local.elements);mesh.addPrimitive(cp);
      }
      count++;
    }
    target.setMesh(mesh).setExtras({...target.getExtras(),crewSource:'project:tools/hero/sketchfab/seated.py',crewPose:'sit'});
  }
  for(const n of root.listNodes())if(inheritedCrew.test(n.getName()))n.setName(n.getName().replace(inheritedCrew,'own_seated_crew'));
  await doc.transform(prune({keepLeaves:true,keepAttributes:true,keepExtras:true}), unpartition());
  return count;
}
if(import.meta.url===pathToFileURL(process.argv[1]).href){
 await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
 const source=await io.read('public/models/seated-crew.glb');
 for(const file of process.argv.slice(2)){
  const doc=await io.read(file);const count=await replaceCrew(doc,source);if(!count)continue;
  if(!file.startsWith('tools/convert_models/output/'))await doc.transform(meshopt({encoder:MeshoptEncoder,level:'high'}));
  await io.write(file,doc);console.log(`${file}: ${count} original crew`);
 }
 const path='public/models/hero/manifest.json';const m=JSON.parse(readFileSync(path));if(m.files['b17.glb']!==undefined){m.files['b17.glb']=statSync('public/models/hero/b17.glb').size;writeFileSync(path,JSON.stringify(m,null,2)+'\n');}
}

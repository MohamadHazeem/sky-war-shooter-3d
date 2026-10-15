// Keep the approved fighter conversion and authored crew that landed during this review.
// Inputs are pinned repository artifacts, never an unversioned live download.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsClearcoat, KHRMaterialsIOR } from '@gltf-transform/extensions';
import { copyToDocument, dequantizePrimitive, transformPrimitive, meshopt, prune, unpartition } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { Matrix4, Vector3 } from 'three';
export const retainedRevision = '683275db';
const artifact = file => new Uint8Array(execFileSync('git', ['show', `${retainedRevision}:${file}`], { maxBuffer: 30*1024*1024 }));
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
export async function retainBomberCrew(doc) {
  const source = await io.readBinary(artifact('public/models/hero/b17.glb'));
  const crew = source.getRoot().listNodes().find(n => n.getExtras().crewSource);
  const target = doc.getRoot().listNodes().find(n => n.getMesh()?.listPrimitives().some(p => /ww2_pilot_old/.test(p.getMaterial()?.getName()??'')));
  if (!crew || !target) throw Error('Retained bomber crew missing');
  const primitives = crew.getMesh().listPrimitives();
  const copied = copyToDocument(doc, source, primitives);
  const matrix = new Matrix4().fromArray(target.getWorldMatrix()).invert().multiply(new Matrix4().fromArray(crew.getWorldMatrix()));
  const mesh = doc.createMesh('approved_seated_crew');
  for (const p of primitives) {
    const cp=copied.get(p);dequantizePrimitive(cp);
    const near = new Vector3().fromArray(p.getAttribute('POSITION').getMin([])).applyMatrix4(new Matrix4().fromArray(crew.getWorldMatrix()));
    let placement=matrix;
    if(near.z>3.6) {
      // The approved seated figure was authored for cockpit legroom. Fit its
      // nose copy behind the dome and above the actual bombardier floor.
      const eye=source.getRoot().listNodes().find(n=>n.getName()==='eye_bombardier').getWorldMatrix().slice(12,15);
      const fit=new Matrix4().makeTranslation(eye[0],eye[1]+.22,eye[2]-.24).multiply(new Matrix4().makeScale(.72,.72,.72)).multiply(new Matrix4().makeTranslation(-eye[0],-eye[1],-eye[2]));
      placement=new Matrix4().fromArray(target.getWorldMatrix()).invert().multiply(fit).multiply(new Matrix4().fromArray(crew.getWorldMatrix()));
    }
    transformPrimitive(cp,placement.elements);mesh.addPrimitive(cp);
    // Untextured crew still carries the uniform mesh attribute contract.
    if(!cp.getAttribute('TEXCOORD_0')) cp.setAttribute('TEXCOORD_0',doc.createAccessor().setType('VEC2').setArray(new Float32Array(cp.getAttribute('POSITION').getCount()*2)).setBuffer(doc.getRoot().listBuffers()[0]));
  }
  target.setMesh(mesh).setExtras({...target.getExtras(),crewSource:'project:tools/hero/sketchfab/seated.py',retainedRevision});
  for (const node of doc.getRoot().listNodes()) node.setName(node.getName().replace('ww2_pilot_old', 'own_seated_crew'));
  await doc.transform(prune({keepLeaves:true,keepAttributes:true,keepExtras:true}), unpartition());
}
export async function retainFighter(kind) {
  const doc = await io.readBinary(artifact(`public/models/${kind}.glb`));
  const glass=doc.getRoot().listMaterials().find(m=>m.getName()===`hero_${kind}_glass`);
  glass.setExtension('KHR_materials_clearcoat',doc.createExtension(KHRMaterialsClearcoat).createClearcoat().setClearcoatFactor(.35).setClearcoatRoughnessFactor(.08));
  glass.setExtension('KHR_materials_ior',doc.createExtension(KHRMaterialsIOR).createIOR().setIOR(1.46));
  glass.setBaseColorFactor([.12,.145,.15,.085]).setAlphaMode('BLEND').setRoughnessFactor(.045).setMetallicFactor(0).setDoubleSided(true);
  await doc.transform(meshopt({encoder:MeshoptEncoder,level:'high',quantizeTexcoord:14}));
  await io.write(`public/models/${kind}.glb`,doc);
  for(const suffix of ['_ace.webp','_base.ktx2','_normal.ktx2','_orm.ktx2'])writeFileSync(`public/models/${kind}${suffix}`,artifact(`public/models/${kind}${suffix}`));
}

#!/usr/bin/env node
// Compresses the Blender outputs of tools/interior for the web (node tools/interior/compress.mjs in.glb out.glb):
//  - the vertex colour the generators painted becomes COLOR_0 (Blender writes an extra white
//    COLOR_0 for the material's colour node and the painted layer as COLOR_1)
//  - unused data pruned, then meshopt (quantization + EXT_meshopt_compression), as
//    tools/compress_models.mjs does for the aircraft. three's GLTFLoader decodes it with the
//    MeshoptDecoder that world/Models.ts already registers.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { statSync } from 'node:fs';

const [src, dst] = process.argv.slice(2);
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  const c1 = prim.getAttribute('COLOR_1');
  if (c1) { prim.setAttribute('COLOR_0', c1); prim.setAttribute('COLOR_1', null); }
  // the painted colours never use alpha: RGB only
}
// mesh names follow their nodes (Blender names a copied mesh 'crewBody.001'): the game finds parts by name
for (const node of doc.getRoot().listNodes()) node.getMesh()?.setName(node.getName());
// names of mesh nodes and materials are kept (the game looks them up)
await doc.transform(dedup(), prune({ keepAttributes: false }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
await io.write(dst, doc);
console.log(`${dst}: ${(statSync(src).size / 1024).toFixed(0)} KB -> ${(statSync(dst).size / 1024).toFixed(0)} KB`);

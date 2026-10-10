#!/usr/bin/env node
// Compresses the converted aircraft models for the web:
//   tools/convert_models/output/*.glb  (uncompressed, from build_all.sh)  ->  public/models/*.glb
//
//   npm run models:compress                  # every model
//   node tools/compress_models.mjs b17 fw190 # just some
//
// Steps (glTF Transform, the library behind @gltf-transform/cli):
//   1. Named mesh nodes get their mesh moved onto an unnamed child node (extras.meshOf = name).
//      Quantization stores a dequantize scale/offset in the transform of the node that holds the
//      mesh; this keeps it off the pivots and markers the game animates or looks up by name
//      (prop_*, fan_*, cooling_fan, turret_*, gun_*, airframe, glass...), so their transforms
//      stay exactly as converted. Models.ts reads extras.meshOf back where it matters.
//   2. Textures -> WebP (EXT_texture_webp, decoded natively by three's GLTFLoader).
//   3. Meshopt: vertex/index reorder, quantization (KHR_mesh_quantization) and
//      EXT_meshopt_compression, same as `gltf-transform meshopt --level high`.
//      Models.ts registers three's MeshoptDecoder.
// Node names, empty marker nodes (muzzle_*, eye_*, window_*, exhaust_*) and the hierarchy
// are kept: nothing is flattened, joined, instanced or pruned.
import { readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.MODELS_SRC ?? join(REPO, 'tools/convert_models/output');
const OUT = process.env.MODELS_OUT ?? join(REPO, 'public/models');
const WEBP_QUALITY = Number(process.env.WEBP_QUALITY ?? 88);

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
});

// Step 1 (see header)
function isolateNamedMeshes(doc) {
  let n = 0;
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || node.getName() === '') continue;
    const holder = doc.createNode('').setMesh(mesh).setExtras({ meshOf: node.getName() });
    node.setMesh(null).addChild(holder);
    n++;
  }
  return n;
}

const want = process.argv.slice(2);
const files = readdirSync(SRC).filter((f) => f.endsWith('.glb') && (!want.length || want.includes(basename(f, '.glb'))));
if (!files.length) { console.error(`no .glb files in ${SRC}`); process.exit(1); }
mkdirSync(OUT, { recursive: true });
let inTotal = 0, outTotal = 0;
for (const f of files) {
  const src = join(SRC, f), dst = join(OUT, f);
  const doc = await io.read(src);
  const nodesBefore = doc.getRoot().listNodes().map((x) => x.getName()).filter(Boolean).sort().join(',');
  const moved = isolateNamedMeshes(doc);
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality: WEBP_QUALITY, effort: 90 }),
    meshopt({ encoder: MeshoptEncoder, level: 'high', quantizeTexcoord: 14 }),
  );
  const nodesAfter = doc.getRoot().listNodes().map((x) => x.getName()).filter(Boolean).sort().join(',');
  if (nodesBefore !== nodesAfter) throw new Error(`${f}: node names changed`);
  await io.write(dst, doc);
  const a = statSync(src).size, b = statSync(dst).size;
  inTotal += a; outTotal += b;
  console.log(`${f.padEnd(20)} ${(a / 1024).toFixed(0).padStart(6)} KB -> ${(b / 1024).toFixed(0).padStart(6)} KB  (${((b / a) * 100).toFixed(0)}%, ${moved} meshes moved off named nodes)`);
}
console.log(`${'total'.padEnd(20)} ${(inTotal / 1048576).toFixed(2).padStart(6)} MB -> ${(outTotal / 1048576).toFixed(2).padStart(6)} MB`);

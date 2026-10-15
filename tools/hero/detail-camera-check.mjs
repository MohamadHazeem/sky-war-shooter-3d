// Isolate camera obstruction from material/detail changes in the authored B-17.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
async function shell(file) {
  const doc = await io.read(file), records = [];
  for (const node of doc.getRoot().listNodes()) for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
    const material = primitive.getMaterial()?.getName();
    if (!/^hero_(skin|glass)(_low)?$/.test(material)) continue;
    const hash = createHash('sha256');
    for (const accessor of [primitive.getAttribute('POSITION'), primitive.getIndices()]) {
      if (accessor) { const a = accessor.getArray(); hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); }
    }
    records.push(JSON.stringify([material, hash.digest('hex'), node.getWorldMatrix()]));
  }
  assert.ok(records.length > 0);
  return { primitives: records.length, geometryAndTransforms: createHash('sha256').update(records.sort().join('\n')).digest('hex') };
}
const live = await shell(`${process.env.DETAIL_BASELINE}/hero/b17.glb`);
const revised = await shell('public/models/hero/b17.glb');
assert.deepEqual(revised, live, 'Exterior skin/glass geometry and transforms must match live');
await fs.writeFile('docs/phase11/shots/01/camera-diagnosis.json', JSON.stringify({live, revised, identical: true,
  scope: 'All hero_skin/hero_glass primitives, including Low: position/index buffers and world transforms. Materials intentionally differ.',
  conclusion: 'No new skin/glass geometry obstruction. Camera-only replay was invalid because the independently simulated bomber pose differed. Gunner views must derive the camera from the locked bomber and production gun mount.'
}, null, 2) + '\n');
console.log('Live/revised B-17 skin and glass geometry/transforms are identical.');

// Development aid: list the distinct vertex colours of each mesh in a glb (node tools/interior/inspect_colors.mjs file.glb)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    for (const sem of prim.listSemantics().filter((s) => s.startsWith('COLOR'))) {
      const a = prim.getAttribute(sem);
      const seen = new Map();
      const el = [];
      for (let i = 0; i < a.getCount(); i++) {
        a.getElement(i, el);
        const k = el.slice(0, 3).map((v) => v.toFixed(3)).join(',');
        seen.set(k, (seen.get(k) ?? 0) + 1);
      }
      console.log(mesh.getName(), prim.getMaterial()?.getName(), sem, a.getComponentType(), a.getNormalized(), [...seen.entries()].slice(0, 12));
    }
  }
}

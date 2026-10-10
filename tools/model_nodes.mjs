// QA: prints every node of a .glb (name, mesh, children) and its textures, read with glTF Transform
// (works on meshopt / WebP compressed files too). Used to check that compression kept the node
// names and pivots the game relies on (prop_*, fan_*, gun_*, muzzle_*, eye_*, turret_*).
//
//   node tools/model_nodes.mjs public/models/b17.glb [--all]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const all = process.argv.includes('--all');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const f of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  const doc = await io.read(f);
  const root = doc.getRoot();
  console.log(`== ${f}`);
  for (const t of root.listTextures()) console.log(`   texture ${t.getMimeType()} ${t.getSize()?.join('x')} ${((t.getImage()?.byteLength ?? 0) / 1024).toFixed(0)} KB`);
  const fmt = (a) => a.map((v) => +v.toFixed(3)).join(',');
  const walk = (n, d) => {
    const m = n.getMesh();
    const named = n.getName() !== '';
    if (all || named || m) {
      console.log(`   ${'  '.repeat(d)}${named ? n.getName() : '(unnamed)'}${m ? ` [mesh ${m.listPrimitives().length}p]` : ''} t=${fmt(n.getTranslation())} r=${fmt(n.getRotation())} s=${fmt(n.getScale())}`);
    }
    for (const c of n.listChildren()) walk(c, d + 1);
  };
  for (const s of root.listScenes()) for (const n of s.listChildren()) walk(n, 0);
}

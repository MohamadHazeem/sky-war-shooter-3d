import {NodeIO, getBounds} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
for(const file of process.argv.slice(2)) {
 const d=await io.read(file); console.log(file);
 for(const n of d.getRoot().listNodes()) if(n.getMesh()) console.log(n.getName(), JSON.stringify(getBounds(n)),n.getMesh().listPrimitives().map(p=>[p.getMaterial()?.getName(),p.getIndices()?.getCount()/3]));
}

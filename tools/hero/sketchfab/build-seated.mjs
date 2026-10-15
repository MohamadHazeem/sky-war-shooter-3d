// Run through tools/heavy.sh. Blender evaluates our existing sit clip, then meshopt packs it.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {meshopt,prune} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const dir=mkdtempSync(join(tmpdir(),'sws-seated-'));
try {
 const source=await io.read('public/models/crew.glb');
 for(const e of source.getRoot().listExtensionsUsed())if(['EXT_meshopt_compression','KHR_mesh_quantization'].includes(e.extensionName))e.dispose();
 await io.write(join(dir,'crew.glb'),source);
 execFileSync(process.env.BLENDER??'/Applications/Blender.app/Contents/MacOS/Blender',['-b','-t','4','--python-exit-code','1','-P','tools/hero/sketchfab/seated.py','--',join(dir,'crew.glb'),join(dir,'seated.glb')],{stdio:'inherit'});
 const doc=await io.read(join(dir,'seated.glb'));
 doc.getRoot().listNodes()[0].setExtras({source:'project:tools/interior/build_crew.py',pose:'sit, head forward'});
 await doc.transform(prune({keepAttributes:true}),meshopt({encoder:MeshoptEncoder,level:'high'}));
 await io.write('public/models/seated-crew.glb',doc);
} finally { rmSync(dir,{recursive:true,force:true}); }

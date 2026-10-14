import {it,expect} from 'vitest';
import * as THREE from 'three';
import {cabinAirframe} from '../src/game/LivingInterior';
import type {Bomber} from '../src/world/Aircraft';

it('cuts Low hero window caps in cabin copies without changing shared or detailed skins',()=>{
  const root=new THREE.Group(),model=new THREE.Group();root.add(model);
  const meshes:THREE.Mesh[]=[];
  for(const [part,level] of [['core',2],['tail',2],['core',0]] as const){
    const g=new THREE.BufferGeometry();
    const p=part==='core'?[.97,.3,-6.7,.97,.5,-6.7,.97,.4,-6.9]:[-.1,.4,-15.58,.1,.4,-15.58,0,.6,-15.58];
    g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex([0,1,2]);
    const mesh=new THREE.Mesh(g);mesh.name='hero_geometry';meshes.push(mesh);
    const lod=new THREE.Group();lod.name=`part_${part}_hero_skin_lod_LOD${level}`;lod.add(mesh);model.add(lod);
  }
  expect(cabinAirframe({root,model} as unknown as Bomber,-7.44)).toEqual([]);
  const swaps=cabinAirframe({root,model} as unknown as Bomber,-7.44,undefined,true);
  expect(swaps.map(s=>s.mesh)).toEqual(meshes.slice(0,2));
  for(const s of swaps){
    expect(Array.from(s.clean.index!.array)).toEqual([0,0,0]);
    expect(Array.from(s.orig.index!.array)).toEqual([0,1,2]);
    expect(s.mesh.geometry).toBe(s.orig);
  }
  expect(Array.from(meshes[2].geometry.index!.array)).toEqual([0,1,2]);
});

import {it, expect} from 'vitest';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {GunnerController} from '../src/game/GunnerController';
import type {StationId} from '../src/world/B17Layout';

it('hides the actual hero interior across LODs for gun views and restores it on detach',()=>{
  const bytes=readFileSync('public/models/hero/b17.glb');
  const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  const root=new THREE.Group();
  for(const name of ['airframe_hero_interior_lod','airframe_hero_glass_lod','airframe_hero_ww2_pilot_old_lod','part_core_hero_skin_lod']) {
    expect(gltf.nodes.some((n:{name:string})=>n.name===name)).toBe(true);
    const node=new THREE.Group();node.name=name;root.add(node);
    const detailed=new THREE.Group(), low=new THREE.Group();low.visible=false;node.add(detailed,low);
  }
  const view=GunnerController.prototype as unknown as {applyModelVisibility(this:{bomber:{model:THREE.Group}},id:StationId|null):void};
  for(const id of ['waistL','waistR','tail'] as const) {
    view.applyModelVisibility.call({bomber:{model:root}},id);
    expect(root.children.slice(0,3).every(o=>!o.visible)).toBe(true);
    expect(root.children[3].visible).toBe(true);
  }
  view.applyModelVisibility.call({bomber:{model:root}},null);
  expect(root.children.every(o=>o.visible)).toBe(true);
  expect(root.children.every(o=>o.children[0].visible&&!o.children[1].visible)).toBe(true);
});

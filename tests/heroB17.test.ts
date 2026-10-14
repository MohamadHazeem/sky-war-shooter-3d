import {describe, expect, it, beforeAll} from 'vitest';
import * as THREE from 'three';
import {readFileSync, statSync} from 'node:fs';
import {HeroLOD, HeroB17Controls, prepareHeroLODs, setHeroQuality, heroLevel, warmHeroLODs} from '../src/world/HeroB17';
import {NodeIO, type Document} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {getBounds} from '@gltf-transform/functions';

let asset: Document;
beforeAll(async () => {
  await MeshoptDecoder.ready;
  asset = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}).read('public/models/hero/b17.glb');
});
describe('shipped B-17 asset contract', () => {
  it('retains damage sections and articulated pivots at metre scale', () => {
    const nodes = asset.getRoot().listNodes();
    const names = nodes.map(n=>n.getName());
    for(const name of ['B17G_HERO','airframe','wingL','wingR','tail','tailL','tailR', 'engine1','engine2','engine3','engine4',
      'prop_1','prop_2','prop_3','prop_4','turret_top','turret_top_guns','turret_ball','turret_ball_guns','turret_chin','turret_chin_guns',
      'gun_tail','gun_cheek_left','gun_cheek_right','gun_waist_left','gun_waist_right','gear_L','gear_R','gear_tail','flap_L','flap_R','bomb_bay_L','bomb_bay_R']) expect(names).toContain(name);
    const box = getBounds(asset.getRoot().listScenes()[0]);
    expect(box.max[0]-box.min[0]).toBeCloseTo(31.62,1);
    expect(box.max[2]-box.min[2]).toBeGreaterThan(22);
    expect(box.max[2]-box.min[2]).toBeLessThan(24);
    const tire=nodes.find(n=>n.getName()==='gear_L_hero_tire_lod_LOD0')!;
    const tireBox=getBounds(tire);expect(tireBox.max[1]).toBeLessThan(.1);expect(tireBox.min[1]).toBeGreaterThan(-1.6);
    // Each prop axis points forward, and positions match engine hit-zone ordering.
    for(let i=1;i<=4;i++) {
      const m=nodes.find(n=>n.getName()===`prop_${i}`)!.getWorldMatrix();
      expect(m[10]).toBeCloseTo(1); expect(m[12]).toBeCloseTo([6.5,3.02,-3.02,-6.5][i-1],1);
    }
  });
  it('has three successively cheaper mesh levels with no lost pivots', () => {
    const totals=[0,0,0];
    for(const n of asset.getRoot().listNodes().filter(n=>n.getName().endsWith('_lod'))) {
      expect(n.listChildren()).toHaveLength(3);
      for(let i=0;i<3;i++) {
        const level=n.listChildren().find(c=>c.getName().endsWith('_LOD'+i));expect(level).toBeDefined();
        for(const c of level!.listChildren())for(const p of c.getMesh()?.listPrimitives()??[])totals[i]+=(p.getIndices()?.getCount()??0)/3;
      }
    }
    expect(totals[0]).toBeGreaterThan(20000);expect(totals[1]).toBeLessThan(totals[0]*.5);expect(totals[2]).toBeLessThan(totals[1]*.35);
  });
  it('ships meshopt, UVs, normal/ORM maps and transmission under the download budget', () => {
    const r=asset.getRoot();
    expect(r.listExtensionsRequired().map(e=>e.extensionName)).toContain('EXT_meshopt_compression');
    const skin=r.listMaterials().find(m=>m.getName()==='hero_skin')!;
    expect(skin.getBaseColorTexture()).toBeTruthy();expect(skin.getNormalTexture()).toBeTruthy();expect(skin.getOcclusionTexture()).toBeTruthy();
    expect(r.listMaterials().some(m=>!!m.getExtension('KHR_materials_transmission'))).toBe(true);
    for(const m of r.listMeshes())for(const p of m.listPrimitives())expect(p.getAttribute('TEXCOORD_0')).toBeTruthy();
    const manifest=JSON.parse(readFileSync('public/models/hero/manifest.json','utf8'));
    let total=0;for(const name of Object.keys(manifest.files))total+=statSync('public/models/hero/'+name).size;
    expect(total).toBeLessThan(15*1024*1024);
  });
});
function fixture(){
  const root=new THREE.Group(),part=new THREE.Group();part.name='wing_lod';root.add(part);
  for(let i=0;i<3;i++){const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());mesh.name='wing_LOD'+i;part.add(mesh);}
  prepareHeroLODs(root);return root;
}
describe('runtime B-17 LOD and animation',()=>{
  it('chooses distance levels, forces Low on clones, restores High and warms every variant',()=>{
    const root=fixture().clone(true);const lod=root.getObjectByName('heroLOD') as HeroLOD;
    const camera=new THREE.PerspectiveCamera();root.updateMatrixWorld(true);
    setHeroQuality(false);camera.position.z=250;camera.updateMatrixWorld();lod.update(camera);
    expect(lod.levels.map(l=>l.object.visible)).toEqual([false,true,false]);
    setHeroQuality(true);camera.position.z=1;camera.updateMatrixWorld();lod.update(camera);
    expect(lod.levels.map(l=>l.object.visible)).toEqual([false,false,true]);
    const restore=warmHeroLODs(root);expect(lod.levels.every(l=>l.object.visible)).toBe(true);expect(lod.autoUpdate).toBe(false);restore();
    setHeroQuality(false);lod.update(camera);expect(lod.levels.map(l=>l.object.visible)).toEqual([true,false,false]);
    expect(heroLevel(900,false)).toBe(2);expect(heroLevel(1,true)).toBe(2);
  });
  it('animates mechanical pivots without moving the airframe or coupling clones',()=>{
    const root=new THREE.Group();for(const name of ['gear_L','gear_R','gear_tail','flap_L','flap_R','bomb_bay_L','bomb_bay_R']){const n=new THREE.Group();n.name=name;root.add(n);}
    const clone=root.clone(true),control=new HeroB17Controls(root);control.setGear(1);control.update(2,true);
    expect(root.getObjectByName('gear_L')!.rotation.x).toBeCloseTo(Math.PI/2);
    expect(root.getObjectByName('bomb_bay_L')!.rotation.z).toBeGreaterThan(1);
    expect(root.getObjectByName('bomb_bay_R')!.rotation.z).toBeLessThan(-1);
    expect(clone.getObjectByName('bomb_bay_L')!.rotation.z).toBeCloseTo(0);
    control.setGear(0);expect(root.getObjectByName('flap_L')!.rotation.x).toBeCloseTo(-.52);
    control.update(10,false);expect(root.getObjectByName('bomb_bay_L')!.rotation.z).toBeCloseTo(0);
  });
});

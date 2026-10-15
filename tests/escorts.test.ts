import * as THREE from 'three';
import { World } from '../src/world/World';
import { describe, expect, it, vi } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { getBounds } from '@gltf-transform/functions';
import { ESCORT_TYPES, escortKind, isEscortKind } from '../src/world/EscortTypes';
import { ALL_MODELS, ESSENTIAL_MODELS } from '../src/world/Models';
import { PHRASES } from '../src/i18n/phrases';
import { kindOf } from '../src/game/CoopSession';
import { Fighter } from '../src/world/Aircraft';

vi.mock('../src/world/Models', async importOriginal => {
 const actual = await importOriginal<typeof import('../src/world/Models')>();
 return { ...actual, instantiate: () => new THREE.Group(), setupProps: () => [] };
});

describe('escort roster', () => {
 it('cycles deterministically without changing the existing count', () => {
  expect(Array.from({length:6},(_,i)=>escortKind(i))).toEqual(['p47d','spitfire9','p51d','p47d','spitfire9','p51d']);
  expect(isEscortKind('fw190')).toBe(false);
 });
 it('loads menu escorts before spawning, translates their labels and keeps support firepower equal', () => {
  for(const kind of ['p47d','spitfire9'] as const){
   expect(ALL_MODELS).toContain(kind);expect(ESSENTIAL_MODELS).toContain(kind);
   expect(PHRASES[ESCORT_TYPES[kind].label]).toBeTruthy();

  }
 });
 it('spawns distinct armed escorts with AI, preserving support DPS and the player Mustang', () => {
  const pilots = new Map();
  const w = Object.assign(Object.create(World.prototype), { scene: new THREE.Scene(), aircraft: [], pilots, formationForward: new THREE.Vector3(0,0,1) }) as World;
  const pos=new THREE.Vector3(25,7600,30),slot=new THREE.Vector3(80,100,0);
  const mustang=w.spawnEscort(pos,slot);
  const dps=(f:Fighter)=>f.guns.reduce((n,g)=>n+g.rate*g.damage,0);
  for(const kind of ['p47d','spitfire9'] as const){
   const f=w.spawnEscort(pos,slot,kind);
   expect(f.kind).toBe(kind); expect(f.team).toBe('allied'); expect(pilots.has(f)).toBe(true);
   expect(f.pos.equals(pos)).toBe(true); expect(f.vel.length()).toBeCloseTo(140);
   expect(f.guns).toHaveLength(ESCORT_TYPES[kind].muzzles.length*2);
   expect(dps(f)).toBeCloseTo(dps(mustang));
   for(const gun of f.guns) expect(gun.dir.z).toBeGreaterThan(.99);
   expect(f.fm.p).toBe(ESCORT_TYPES[kind].params);
  }
  expect(w.spawnPlayerFighter(pos,w.formationForward).kind).toBe('p51d');
 });
 it('preserves escort types on the co-op wire and the legacy P-51 code', () => {
  for(const kind of ['p47d','spitfire9','p51d'] as const){
   const fighter=Object.assign(Object.create(Fighter.prototype),{team:'allied',kind});
   expect(kindOf(fighter)).toBe(kind==='p51d'?'P':kind);
  }
 });
});

describe('shipped FlightGear escort geometry', async () => {
 await MeshoptDecoder.ready;
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
 for(const [kind,span,length] of [['p47d',12.43,11.0],['spitfire9',11.23,9.46]] as const){
  it(`${kind} matches published dimensions within 5%, retains gun mounts and cheaper LODs`, async()=>{
   const doc=await io.read(`public/models/${kind}.glb`),root=doc.getRoot();
   const bounds=getBounds(root.listScenes()[0]);
   expect(Math.abs((bounds.max[0]-bounds.min[0])/span-1)).toBeLessThan(.05);
   expect(Math.abs((bounds.max[2]-bounds.min[2])/length-1)).toBeLessThan(.05);
   const nodes=root.listNodes();
   const triangles=(name:string)=>{let n=0;nodes.find(o=>o.getName()===name)!.traverse(o=>o.getMesh()?.listPrimitives().forEach(p=>n+=(p.getIndices()?.getCount()??p.getAttribute('POSITION')!.getCount())/3));return n;};
   expect(triangles('part_fuselage_lod2')).toBeLessThan(3200);
   expect(triangles('part_fuselage_lod1')).toBeGreaterThan(triangles('part_fuselage_lod2'));
   for(let i=0;i<ESCORT_TYPES[kind].muzzles.length;i++){
    const marker=nodes.find(n=>n.getName()===`muzzle_left_${i+1}`)!;
    expect(marker).toBeTruthy();
    marker.getWorldTranslation().forEach((v,j)=>expect(v).toBeCloseTo(ESCORT_TYPES[kind].muzzles[i][j],2));
   }
  });
 }
});

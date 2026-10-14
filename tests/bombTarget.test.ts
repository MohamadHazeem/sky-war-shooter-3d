import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/world/World', () => ({ CRUISE: 75 }));
import * as THREE from 'three';
import { TargetArea } from '../src/world/TargetArea';
import { targetUniforms } from '../src/render/TargetGround';
import { CAMPAIGN } from '../src/game/Missions';
function setup() {
  const bomber = { alive: true, pos: new THREE.Vector3(0, 7600, 0), vel: new THREE.Vector3(0, 0, 75), localToWorld: (p: THREE.Vector3) => p.add(bomber.pos) };
  const world = { time: 0, aircraft: [], formationCenter: bomber.pos.clone(), formationForward: new THREE.Vector3(0, 0, 1), bombers: () => [bomber], flakIntensity: 0, callout: () => {} };
  const engine = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), renderer: { domElement: { height: 720 } } };
  const target = new TargetArea(engine as never, world as never), mission = CAMPAIGN.find(m => m.id === 'm3')!;
  target.update(0, mission);
  return { target, world, mission };
}
describe('bomb release integration', () => {
  it('holds both the target fallback and carpet until the player releases', () => {
    const {target, world, mission} = setup(); target.playerControlled = true;
    world.time = mission.bombsAway! + 1; target.update(1, mission);
    expect(targetUniforms.uImpacts.value.every(v => v.w === 0)).toBe(true);
    const pattern = [{x:10,z:20},{x:-30,z:40},{x:50,z:-60}]; target.bombsAway(pattern);
    world.time += 4; target.update(4, mission);
    for(let i=0;i<3;i++) {expect(targetUniforms.uImpacts.value[i].x).toBe(pattern[i].x);expect(targetUniforms.uImpacts.value[i].y).toBe(pattern[i].z);}
    target.bombsAway([{x:999,z:999}]); world.time += 1;target.update(1,mission);
    expect(targetUniforms.uImpacts.value[0].x).toBe(10);
  });
  it('leaves unattended drops automatic and clears ownership on reset', () => {
    const {target,world,mission} = setup();world.time=mission.bombsAway!;target.update(0,mission);
    world.time+=4;target.update(4,mission);expect(targetUniforms.uImpacts.value.some(v=>v.w>0)).toBe(true);
    target.playerControlled=true;target.clear();expect(target.playerControlled).toBe(false);expect(targetUniforms.uImpacts.value.every(v=>v.w===0)).toBe(true);
  });
});

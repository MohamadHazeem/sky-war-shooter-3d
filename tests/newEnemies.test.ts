import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Fighter } from '../src/world/Aircraft';
import { ENEMY_VARIANTS } from '../src/world/EnemyTypes';
import { fitNewEnemyWeapons } from '../src/world/NewEnemyWeapons';
import { burnRocket, KOMET_BOOST, radarContact, schrageSolution, SCHRAGE_Y, SCHRAGE_Z } from '../src/world/NewEnemyRules';
import { World } from '../src/world/World';
import { Tactics } from '../src/world/Tactics';
import { EnemyPilot } from '../src/world/AI';
import { dressEnemy } from '../src/world/EnemyDress';
import { PHRASES } from '../src/i18n/phrases';
import { ALL_ENEMIES } from '../src/game/CustomBattle';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { getBounds } from '@gltf-transform/functions';

vi.mock('../src/world/Models', async original => ({ ...await original<typeof import('../src/world/Models')>(), instantiate: () => new THREE.Group(), setupProps: () => [] }));
function fighter(type: 'me163' | 'me410' | 'ju88g') {
  const v = ENEMY_VARIANTS[type];
  const f = new Fighter(type, 'axis', v.params, v.propRadius);
  f.enemyType = type; dressEnemy(f, type, true); fitNewEnemyWeapons(f);
  f.pos.set(0, 7600, 0); f.fm.vel.set(0, 0, 180);
  return f;
}
describe('new enemy combat', () => {
  it('consumes only powered fuel and never restores thrust after exhaustion', () => {
    expect(burnRocket(10, 0, 100)).toBe(10);
    expect(burnRocket(10, .5, 4)).toBe(8);
    expect(burnRocket(0, 1, 4)).toBe(0);
    const f = fighter('me163'); f.kinematic = true;
    expect(f.rocketFuel).toBe(KOMET_BOOST);
    for (let i = 0; i < 40; i++) { f.fm.throttle = 1; f.update(1); }
    expect(f.rocketFuel).toBe(0); expect(f.fm.thrustScale).toBe(0); expect(f.fm.throttle).toBe(0);
    f.fm.throttle = 1; f.update(1 / 60); expect(f.fm.thrustScale).toBe(0);
  });
  it('fits the rocket with two finite-ammunition cannon and the Hornisse with its own model', () => {
    const f = fighter('me163'); expect(f.guns).toHaveLength(2);
    expect(f.guns.every(g => g.cannon && g.ammo === 60)).toBe(true);
    expect(ENEMY_VARIANTS.me410.model).toBe('me410');
    expect(fighter('me410').zones.filter(z => z.engine !== undefined)).toHaveLength(2);
  });
  it('acquires a forward radar return and rejects distant or rear contacts', () => {
    expect(radarContact(1200, .8)).toBe(true);
    expect(radarContact(5000, 1)).toBe(false); expect(radarContact(1200, -.8)).toBe(false);
    expect(schrageSolution(160, 1, 155)).toBe(true);
    expect(schrageSolution(160, .9, 155)).toBe(false);
    expect(schrageSolution(160, 1, -155)).toBe(false);
    expect(schrageSolution(50, 1, 48)).toBe(false);
  });
  it('keeps upward guns independent of forward triggers and AI aim; burns finite ammunition', () => {
    const f = fighter('ju88g'), shots: THREE.Vector3[] = [];
    for (const g of f.guns) g.cooldown = 0;
    const w = { ballistics: { fire: (_p: unknown, v: THREE.Vector3) => shots.push(v.clone()) }, effects: { muzzleFlash: vi.fn() } } as unknown as World;
    f.gunAim = new THREE.Vector3(1, 0, 0); f.obliqueTrigger = true;
    World.prototype.fireGuns.call(w, f, 1 / 60);
    expect(shots).toHaveLength(2);
    for (const v of shots) { expect(v.y / v.z).toBeCloseTo(SCHRAGE_Y / SCHRAGE_Z, 0); expect(Math.abs(v.x)).toBeLessThan(4); }
    expect(f.guns.filter(g => g.oblique).every(g => g.ammo === 99)).toBe(true);
    shots.length = 0; f.obliqueTrigger = false; f.trigger = true;
    for (const g of f.guns) g.cooldown = 0;
    World.prototype.fireGuns.call(w, f, 1 / 60);
    expect(shots).toHaveLength(4); expect(shots.every(v => v.x > 690)).toBe(true);
    shots.length = 0; f.trigger = false; f.obliqueTrigger = true;
    for (const g of f.guns) { g.cooldown = 0; g.ammo = 1; }
    World.prototype.fireGuns.call(w, f, .5);
    expect(shots).toHaveLength(2); // a slow frame cannot fire past the final round
    expect(f.guns.filter(g => g.oblique).every(g => g.ammo === 0)).toBe(true);
  });
  it('night attack waits for lock and warning, fires only below, releases a lost target', () => {
    const f = fighter('ju88g'), p = new EnemyPilot(f, 'stern');
    const target = { alive: true, pos: new THREE.Vector3(0, 7600, 0), vel: new THREE.Vector3(0, 0, 75), straggling: false };
    const w = { formationCenter: target.pos, formationForward: new THREE.Vector3(0,0,1), time: 0,
      bombers: () => [target], enemyPilot: () => p, playerFocus: 0, enemyAimMult: 1, callout: vi.fn() } as unknown as World;
    const tx = new Tactics(w), group = tx.nightFighter(f)!;
    const m = group.members[0];
    for (let i=0;i<29;i++) { group.update(.1); group.fly(m,.1); }
    expect(m.phase).toBe(0); expect(f.obliqueTrigger).toBe(false);
    group.update(.2);group.fly(m,.2);expect(m.phase).toBe(1);
    f.pos.copy(target.pos).add(new THREE.Vector3(0,-160,-40)); f.quat.identity(); f.fm.vel.copy(target.vel); f.vel.copy(target.vel);
    group.fly(m,1);expect(f.obliqueTrigger).toBe(false);
    group.fly(m,3.1);expect(f.obliqueTrigger).toBe(false); // burst duration clamps a large delta
    m.shots=0;m.reload=0;group.fly(m,.016);expect(f.obliqueTrigger).toBe(true);
    f.pos.y=target.pos.y+160;group.fly(m,.016);expect(f.obliqueTrigger).toBe(false);
    target.alive=false;group.fly(m,.016);expect(p.state).toBe('withdraw');expect(p.override).toBeNull();
    tx.reset();
  });
  it('flies a radar intercept into an actual fixed-mount firing opportunity', () => {
    const f=fighter('ju88g'),p=new EnemyPilot(f,'stern'); f.setScale(4.5);
    const target={alive:true,pos:new THREE.Vector3(0,7600,0),vel:new THREE.Vector3(0,0,75),straggling:false};
    const w={formationCenter:target.pos,formationForward:new THREE.Vector3(0,0,1),time:0,bombers:()=>[target],enemyPilot:()=>p,playerFocus:0,enemyAimMult:1,callout:vi.fn()} as unknown as World;
    const tx=new Tactics(w),g=tx.nightFighter(f)!,m=g.members[0];let firing=0,minRange=Infinity;
    for(let i=0;i<4500&&!m.released;i++){
      target.pos.addScaledVector(target.vel,1/60);g.update(1/60);g.fly(m,1/60);f.update(1/60);
      if(f.obliqueTrigger)firing++;minRange=Math.min(minRange,f.pos.distanceTo(target.pos));
    }
    expect(minRange).toBeLessThan(230);expect(firing).toBeGreaterThan(10);tx.reset();
  });
  it('exposes and translates the night fighter selection and warning', () => {
    expect(ALL_ENEMIES).toContain('ju88g');
    expect(PHRASES['Ju 88 G']).toBeTruthy(); expect(PHRASES['NIGHT FIGHTER']).toBeTruthy();
  });
});

describe('new enemy model dimensions and fittings', async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  for (const [kind, span, length] of [['me410',16.35,12.48],['me163',9.3,5.7],['ju88g',20.08,15.5]] as const) {
    it(`${kind} keeps dimensions within 5% and its recognition fittings`, async () => {
      const doc=await io.read(`public/models/${kind}.glb`),nodes=doc.getRoot().listNodes();
      // Me 410 length is the airframe, excluding the protruding BK 5 barrel.
      const bounds=getBounds(doc.getRoot().listScenes()[0]);
      expect(Math.abs((bounds.max[0]-bounds.min[0])/span-1)).toBeLessThan(.05);
      if(kind!=='me410')expect(Math.abs((bounds.max[2]-bounds.min[2])/length-1)).toBeLessThan(.05);
      const names=nodes.map(n=>n.getName());
      for(const name of kind==='me410'?['ctl_rudder','muzzle_bk5','barbette_left','barbette_right']:kind==='ju88g'?['muzzle_schrage_L','muzzle_schrage_R','ctl_rudder']:['exhaust','fan_1','ctl_aileron_L','ctl_aileron_R','ctl_rudder'])expect(names).toContain(name);
      if(kind==='me410'){ expect(names).not.toContain('ctl_rudder_L');expect(names).not.toContain('gun_rear'); }
    });
  }
});

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { AIR_BOMB, PACK, PACK_IDS, STURM, sturmSlot, scheduledTactic, TacticSchedule } from '../src/world/LuftwaffeTactics';
import { CAMPAIGN, survivalMission } from '../src/game/Missions';
import { PHRASES } from '../src/i18n/phrases';

// World imports renderer/audio; the tactical runtime needs only a small simulation host.
vi.mock('../src/world/World', () => ({ CRUISE: 75 }));
vi.mock('../src/audio/Sound', () => ({ sound: { play: vi.fn() } }));
import { Tactics, BK5 } from '../src/world/Tactics';
import type { World } from '../src/world/World';
import { FlightModel, FW190_PARAMS } from '../src/world/FlightModel';
import type { Fighter } from '../src/world/Aircraft';

function harness() {
  const pilots = new Map();
  const bomber = { alive: true, pos: new THREE.Vector3(0, 5000, 0), vel: new THREE.Vector3(0,0,75), quat: new THREE.Quaternion(), team:'allied', zones:[{hp:100,maxHp:100}], zone:()=>null };
  const world = {
    time:0, formationCenter:bomber.pos.clone(), formationForward:new THREE.Vector3(0,0,1), playerBomber:bomber, player:bomber,
    playerFocus:1, enemyAimMult:1, aircraft:[bomber], bombers:()=>[bomber], enemyPilot:(f: Fighter)=>pilots.get(f),
    callout:vi.fn(), dropTank:vi.fn(), stationArc:(s:string)=>new THREE.Vector3(s==='waistL'?1:-1,0,0),
    effects:{glow:{spawn:vi.fn()},flashLight:vi.fn(),explosion:vi.fn()},ballistics:{onHit:vi.fn()},
    spawnEnemy(_pos:THREE.Vector3,_attack:string,skill:number,_tank:boolean,_rockets:boolean,type:string){
      const root=new THREE.Object3D(),fm=new FlightModel(FW190_PARAMS,root.position,root.quaternion);
      const f={alive:true,remove:false,pos:root.position,quat:root.quaternion,root,fm,vel:fm.vel,enemyType:type,model:new THREE.Object3D(),maxStructure:100,structure:100,zones:[{hp:100,maxHp:100}],forward:(out:THREE.Vector3)=>out.set(0,0,1).applyQuaternion(root.quaternion)} as unknown as Fighter;
      pilots.set(f,{me:f,skill,override:null,state:'approach',timer:0,breakDir:new THREE.Vector3(),engage:vi.fn(),attackCount:0});return f;
    },
  };
  const tx=new Tactics(world as unknown as World);
  return {world,tx,bomber,pilots};
}

describe('Luftwaffe lessons',()=>{
  it('unlocks five lessons progressively, revisits them, and respects scenario restrictions',()=>{
    const base=CAMPAIGN[0];
    expect(scheduledTactic(base,0)).toBeNull();
    for(let i=0;i<5;i++) expect(scheduledTactic({...base,id:`m${2+i*2}`,number:2+i*2},0)).toBe(PACK_IDS[i]);
    const survival=survivalMission('gunner');
    expect(scheduledTactic(survival,0)).toBeNull();
    for(let i=0;i<5;i++)expect(scheduledTactic(survival,i+1)).toBe(PACK_IDS[i]);
    expect(scheduledTactic(survival,6)).toBe('sturm');
    for(const patch of [{role:'pilot' as const},{tutorial:true},{specials:false},{enemyTypes:['fw190'] as const},{id:'custom-gunner'}])
      expect(scheduledTactic({...base,number:12,...patch} as typeof base,0)).toBeNull();
  });
  it('waits for warning space, pacing, air cap and enough round time; sends once per round',()=>{
    const plan=new TacticSchedule(),m={...CAMPAIGN[0],id:'m2',number:2};
    expect(plan.next(m,0,24,80,0,false)).toBeNull();
    expect(plan.next(m,0,25,34,0,false)).toBeNull();
    expect(plan.next(m,0,25,80,25,false)).toBeNull();
    expect(plan.next(m,0,25,80,0,true)).toBeNull();
    expect(plan.next(m,0,25,80,24,false)).toBe('sturm');
    expect(plan.next(m,0,35,70,0,false)).toBeNull();
    expect(plan.next(m,1,25,80,0,false)).toBe('sturm');
    plan.reset();expect(plan.next(m,0,25,80,0,false)).toBe('sturm');
  });
  it('has Arabic for every instruction, warning and cue',()=>{
    for(const def of Object.values(PACK))for(const text of [def.tip,def.radio,def.cue])expect(PHRASES[text],text).toBeTruthy();
  });
});

describe('tactical runtime',()=>{
  it('places 6–12 armoured fighters level in a separated wedge with over ten seconds warning',()=>{
    for(const count of [1,6,8,12,20]) {
      const {tx,bomber}=harness(),g=tx.launchPack('sturm',count)!;
      expect(g.members.length).toBe(Math.max(6,Math.min(12,count)));
      for(let i=0;i<g.members.length;i++) {
        const m=g.members[i],slot=sturmSlot(i,new THREE.Vector3());
        expect(m.f.pos.clone().sub(bomber.pos).toArray()).toEqual([-slot.x || 0,0,STURM.distance+slot.z]);
        expect(m.f.structure).toBeCloseTo(155);expect(m.f.zones[0].hp).toBeCloseTo(155);
        for(let j=0;j<i;j++)expect(m.f.pos.distanceTo(g.members[j].f.pos)).toBeGreaterThan(60);
      }
      expect((STURM.distance-STURM.fireRange)/STURM.closing).toBeGreaterThan(10);
      tx.reset();expect(g.members.every(m=>m.p.override===null)).toBe(true);
    }
  });
  it('releases both pincer groups together, never before eight seconds',()=>{
    const {tx}=harness(),g=tx.launchPack('multiAxis')!;
    expect(g.members.map(m=>m.side)).toEqual([1,-1,1,-1]);
    for(const m of g.members)m.f.pos.copy(m.target!.pos).add(new THREE.Vector3(-m.slot.x,m.slot.y,m.slot.z));
    tx.update(7.9);expect(g.phase).toBe(0);
    tx.update(.1);expect(g.phase).toBe(1);expect(g.members.every(m=>m.p.override===null)).toBe(true);
  });
  it('aims both jet heights astern and prevents early gun attacks',()=>{
    const {tx,bomber}=harness();tx.launchPack('jetSlash');
    expect(tx.groups.length).toBe(2);
    expect(tx.groups[0].members[0].f.pos.y).toBeLessThan(bomber.pos.y);
    expect(tx.groups[1].members[0].f.pos.y).toBeGreaterThan(bomber.pos.y);
    for(const g of tx.groups){const m=g.members[0];expect(m.f.pos.z).toBeLessThan(-3000);tx.update(1);g.fly(m,1);expect(m.phase).toBe(0);}
  });
  it('does not drop during warning, and killing bombers before release prevents bombs',()=>{
    const {tx,world}=harness(),g=tx.launchPack('airBomb')!;
    const drop=vi.spyOn(tx,'dropAirBomb');
    tx.update(AIR_BOMB.warning-.1);
    for(const m of g.members)g.fly(m,.1);
    expect(drop).not.toHaveBeenCalled();
    for(const m of g.members)m.f.alive=false;
    tx.update(20);expect(tx.groups.length).toBe(0);expect(drop).not.toHaveBeenCalled();
    expect(world.effects.explosion).not.toHaveBeenCalled();
  });
  it('fuses bombs at 4.5 seconds, survives rebases, damages through ballistics, and resets the pool',()=>{
    const {tx,world,bomber}=harness(),f=tx.spawn('bf109',1)[0];
    f.pos.copy(bomber.pos).y+=72*AIR_BOMB.fuse+.5*9.81*AIR_BOMB.fuse**2;f.vel.copy(bomber.vel);
    tx.dropAirBomb(f);tx.update(4.4);expect(world.ballistics.onHit).not.toHaveBeenCalled();
    const off=new THREE.Vector3(1000,0,5000);world.formationCenter.sub(off);bomber.pos.sub(off);
    tx.update(.2);expect(world.ballistics.onHit).toHaveBeenCalledOnce();expect(world.ballistics.onHit.mock.calls[0][0].damage).toBeCloseTo(AIR_BOMB.damage);
    expect(world.effects.explosion).toHaveBeenCalledOnce();tx.update(5);expect(world.effects.explosion).toHaveBeenCalledOnce();
    tx.dropAirBomb(f);tx.reset();tx.update(5);expect(world.effects.explosion).toHaveBeenCalledOnce();
  });
  it('gives the cannon an explicit aim warning and a strict 800–1200 m fire band',()=>{
    expect(BK5.aimTime).toBeGreaterThanOrEqual(3.8);expect([BK5.minR,BK5.maxR]).toEqual([800,1200]);
  });
  it('enforces the cannon range on both shells and cannot bypass its aim timer',()=>{
    const {tx,bomber}=harness(),g=tx.launchPack('hornisse')!,m=g.members[0];
    vi.spyOn(g as unknown as {lay:()=>number},'lay').mockReturnValue(0);
    const fire=vi.spyOn(tx,'fireShell').mockImplementation(()=>{});
    m.phase=1;m.t=BK5.aimTime-.01;m.f.pos.copy(bomber.pos).x+=1000;
    g.fly(m,.01);expect(fire).not.toHaveBeenCalled();
    m.t=BK5.aimTime+.01;m.f.pos.x=1300;g.fly(m,.01);expect(fire).not.toHaveBeenCalled();
    m.f.pos.x=1000;g.fly(m,.01);expect(fire).toHaveBeenCalledOnce();
    m.reload=0;m.f.pos.x=700;g.fly(m,.01);expect(fire).toHaveBeenCalledOnce();
    m.f.pos.x=1201;g.fly(m,.01);expect(fire).toHaveBeenCalledOnce();
    m.f.pos.x=1100;g.fly(m,.01);expect(fire).toHaveBeenCalledTimes(2);
  });
  it('only teaches once even across mission resets, but repeats radio warnings',()=>{
    const {tx,world}=harness();tx.lesson=vi.fn();tx.launchPack('sturm');tx.reset();tx.launchPack('sturm');
    expect(tx.lesson).toHaveBeenCalledOnce();expect(world.callout).toHaveBeenCalledTimes(2);
  });
});

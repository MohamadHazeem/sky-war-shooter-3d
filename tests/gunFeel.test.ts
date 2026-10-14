import { describe, it, expect } from 'vitest';
import { Vector3, PerspectiveCamera, InstancedBufferGeometry } from 'three';
import { GunRecoil, RecoilSpring, barrelCooling } from '../src/game/GunRecoil';
import { bulletDrop, converge, flightTime, gunLead, travelFactor, tracerBurn, TWIN_CONVERGENCE } from '../src/world/Gunnery';
import { Ballistics } from '../src/world/Ballistics';
import { weatherNow } from '../src/render/WeatherState';

describe('mount recoil', () => {
  it('builds barrel heat in a sustained burst and cools faster when released', () => {
    const heatPerSecond = 13 * .011 - barrelCooling(true, false);
    expect(heatPerSecond * 8).toBeGreaterThan(.35);
    expect(1 / heatPerSecond).toBeGreaterThan(12);
    expect(barrelCooling(false, false)).toBeGreaterThan(barrelCooling(true, false));
    expect(barrelCooling(true, true)).toBe(.22);
  });
  it('has the same spring trajectory at 30, 60 and 144 Hz', () => {
    const values = [30, 60, 144].map(hz => {
      const s = new RecoilSpring(); s.v = 1;
      for (let i = 0; i < hz; i++) s.update(1 / hz, 22, 12);
      return s.x;
    });
    expect(values[0]).toBeCloseTo(values[1], 12);
    expect(values[1]).toBeCloseTo(values[2], 12);
  });
  it('flexes more at the waist, reduces Recruit drift, and settles after a burst', () => {
    const waist = new GunRecoil(), turret = new GunRecoil(), recruit = new GunRecoil();
    for (let i = 0; i < 10; i++) {
      waist.kick('waistL',1,false,1,13); turret.kick('ball',1,false,1,13); recruit.kick('waistL',1,true,1,13);
      waist.update(1/13,'waistL'); turret.update(1/13,'ball'); recruit.update(1/13,'waistL');
    }
    expect(waist.pitch.x).toBeGreaterThan(turret.pitch.x * 2);
    expect(recruit.pitch.x).toBeCloseTo(waist.pitch.x*.55,10);
    expect(waist.pitch.x).toBeLessThan(.01);
    waist.update(1,'waistL'); expect(Math.abs(waist.pitch.x)).toBeLessThan(.00001);
    waist.reset(); expect(waist.pitch.x).toBe(0); expect(waist.yaw.v).toBe(0);
  });
  it('vibrates at shot cadence and scales every pulse with accessibility', () => {
    const r = new GunRecoil(); r.kick('top',1,false,0,20); r.update(.0125,'top');
    expect(r.vibration(1)).toBeGreaterThan(.7);
    expect(r.vibration(.25)).toBeCloseTo(r.vibration(1)/4,12);
    expect(r.vibration(0)).toBe(0);
    r.kick('top',1,false,0,10); r.update(.0125,'top');
    expect(r.vibration(1)).toBeLessThan(.6);
  });
});

describe('period gunnery', () => {
  it('converges both offset muzzles at 300 m, also on a rotated station', () => {
    for (const yaw of [0,Math.PI/2,Math.PI]) {
      const axis = new Vector3(0,1,0), pivot = new Vector3(123,500,40);
      const point = new Vector3(0,0,TWIN_CONVERGENCE).applyAxisAngle(axis,yaw).add(pivot);
      for (const side of [-1,1]) {
        const muzzle = new Vector3(side*.45,-.04,1.2).applyAxisAngle(axis,yaw).add(pivot);
        const dir = converge(new Vector3(),muzzle,point);
        expect(muzzle.clone().addScaledVector(dir,muzzle.distanceTo(point)).distanceTo(point)).toBeLessThan(1e-10);
      }
    }
  });
  it('predicts slower travel and drop at range without hitscan', () => {
    const t = flightTime(800,870);
    expect(t).toBeGreaterThan(800/870); expect(t).toBeLessThan(1);
    expect(travelFactor(t)*870).toBeCloseTo(800,8);
    expect(bulletDrop(t)).toBeGreaterThan(4);
    expect(flightTime(0,870)).toBe(0);
  });
  it.each([30,60,144])('lead hits a crossing/climbing target with inherited bomber velocity at %i Hz', hz => {
    weatherNow.windX = weatherNow.windZ = 0;
    const origin=new Vector3(0,2000,0), target=new Vector3(0,2000,800);
    const velocity=new Vector3(100,5,-30), bomber=new Vector3(0,0,90), hold=new Vector3();
    gunLead(hold,origin,target,velocity,bomber,870);
    const b=new Ballistics(2);
    b.fire(origin,hold.sub(origin).normalize().multiplyScalar(870).add(bomber),'allied',1,false,[1,1,1],null);
    let closest=Infinity,elapsed=0;
    b.ground=(ax,ay,az,bx,by,bz)=>{
      const start=new Vector3(ax,ay,az).sub(target).addScaledVector(velocity,-elapsed);
      const delta=new Vector3(bx-ax,by-ay,bz-az).addScaledVector(velocity,-1/hz);
      const u=Math.max(0,Math.min(1,-start.dot(delta)/delta.lengthSq()));
      closest=Math.min(closest,start.addScaledVector(delta,u).length()); return false;
    };
    for(let i=0;i<hz*1.5;i++){b.update(1/hz,[]);elapsed+=1/hz;}
    expect(closest).toBeLessThan(.7);
    expect(target.toArray()).toEqual([0,2000,800]);
  });
  it('burns tracers out without removing their live bullets, including swap removal', () => {
    expect(tracerBurn(1)).toBe(1); expect(tracerBurn(1.35)).toBeCloseTo(.5); expect(tracerBurn(1.55)).toBe(0);
    const b=new Ballistics(3), v=new Vector3(0,0,870);
    b.fire(new Vector3(),v,'allied',1,true,[1,1,1],null,false,true,.01);
    b.fire(new Vector3(),v,'allied',1,true,[1,1,1],null,false,true);
    for(let i=0;i<100;i++) b.update(1/60,[]);
    expect(b.n).toBe(1);
    // No ribbon after burnout, though the round still travels and can hit.
    // The renderer has no GPU requirement for filling its buffers.
    b.renderTracers(new PerspectiveCamera(),720);
    expect((b.tracers.mesh.geometry as InstancedBufferGeometry).instanceCount).toBe(0);
  });
});

import {it,expect} from 'vitest';
import {fabricPixels,crewFabric} from '../src/render/CrewFabric';
it('keeps normalized relief, bounded roughness and distinct cloth/leather response',()=>{
  for(const leather of [false,true]){
    const p=fabricPixels(leather);
    expect(p).toEqual(fabricPixels(leather));
    for(let i=0;i<p.normal.length;i+=4){
      const n=[p.normal[i],p.normal[i+1],p.normal[i+2]].map(x=>x/255*2-1);
      // Each decoded component has at most 1/255 rounding error.
      expect(Math.abs(Math.hypot(...n)-1)).toBeLessThan(Math.sqrt(3)/255);
      expect(n[2]).toBeGreaterThan(.7);
      expect(p.rough[i+1]).toBeGreaterThan(180);
    }
  }
  expect(fabricPixels(true).rough).not.toEqual(fabricPixels(false).rough);
  expect(crewFabric(true)).toBe(crewFabric(true));
});

import { expect, it } from 'vitest';
import { DepthSort } from '../src/render/DepthSort';
it('matches stable depth order for arbitrary pool compaction, ties and changing counts', () => {
  const capacity=2400, sort=new DepthSort(capacity), order=new Int32Array(capacity), keys=new Float32Array(capacity);
  let seed=17;
  for(const n of [0,1,3,32,2400,13,2400]) {
    const expected=[];
    for(let i=0;i<n;i++) {seed=(Math.imul(seed,1664525)+1013904223)>>>0;order[i]=capacity-i;keys[i]=seed%91;expected.push({id:order[i],key:keys[i]});}
    expected.sort((a,b)=>b.key-a.key); sort.sort(order,keys,n);
    expect(Array.from(order.slice(0,n))).toEqual(expected.map(x=>x.id));
    expect(Array.from(keys.slice(0,n))).toEqual(expected.map(x=>x.key));
  }
});

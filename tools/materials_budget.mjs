// Acceptance gates for this review; timings come from GPU-fenced native-resolution runs.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='docs/phase11/shots/02';
const read=async file=>JSON.parse(await fs.readFile(`${root}/${file}`));
const high=await read('performance.json'),low=await read('performance-low.json');
assert.equal(high.results.length,9);assert.equal(low.results.length,3);
for(const [tier,data,budget] of [['High',high,11],['Low',low,6]])for(const r of data.results){
 assert.ok(r.mean<=budget,`${tier} ${r.shot}: mean ${r.mean} > ${budget} ms`);
 if(tier==='High')assert.ok(r.p95<11,`${r.shot}: p95 ${r.p95} >= 11 ms`);
 assert.equal(r.errors.length,0);
 for(const b of r.batches)assert.equal(b.programsBefore,b.programsAfter);
}
const budgets={low:6,medium:9,high:11,ultra:14,cinematic:20};
const combat=await read('combat/combat.json');assert.deepEqual(combat.results.map(r=>r.tier),Object.keys(budgets));
const throttled=await read('combat-throttled/combat.json');assert.equal(throttled.results.length,1);
for(const r of [...combat.results,...throttled.results]){
 const budget=r.cpuThrottle===4?16.7:budgets[r.tier];
 assert.ok(r.mean<=budget,`${r.tier} ${r.cpuThrottle}x CPU: ${r.mean} > ${budget} ms`);
 assert.ok(r.frames>=1800);assert.equal(r.compileCalls,0);assert.equal(r.errors.length,0);
 assert.deepEqual(r.renderSize,[1920,1080]);
}
assert.equal(throttled.results[0].cpuThrottle,4);
console.log('PASS: all 9 High p95 gates, Low rig, five combat means and 4x CPU Low; no shader compiles/errors.');

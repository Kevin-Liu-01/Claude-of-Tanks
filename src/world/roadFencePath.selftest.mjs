import assert from 'node:assert/strict';
import { roadFencePath, fencePathSampler } from './roadFencePath.ts';
const road = [[0,0],[0,10],[2,14],[6,18],[10,20],[20,20],[30,20]];
const left = roadFencePath(road,0,3,7.6), right = roadFencePath(road,3,6,7.6);
assert.deepEqual(left.at(-1),right[0],'adjacent physical station runs share the same corner');
const path = roadFencePath(road,0,6,7.6), sampler = fencePathSampler(path);
assert.equal(path.length,road.length,'every geometric arc vertex survives the sparse-station run');
assert.ok(sampler.length>Math.hypot(path.at(-1)[0]-path[0][0],path.at(-1)[1]-path[0][1]),
  'a fence follows the bent road instead of cutting the corner');
for(let distance=0;distance<=sampler.length;distance+=1){
 const point=sampler.at(distance);assert.ok(point.every(Number.isFinite));
 assert.ok(point[0]<=30&&point[1]<=27.61,'bounded offset, no corner spikes');
}
assert.deepEqual(sampler.at(1e6),path.at(-1),'rounding fence counts never extends past the authored route');
assert.deepEqual(roadFencePath([[0,0],[0,10],[0,20]],0,2,7.6),[[-7.6,0],[-7.6,10],[-7.6,20]]);
console.log('road fence path: curved span, shared endpoints, bounded offsets and distance sampling passed');

// Exercise the actual module builder: extra curve vertices must not create
// extra fences or extra random choices, and a sparse station spans the arc.
const { readFileSync } = await import('node:fs');
const { stripTypeScriptTypes } = await import('node:module');
const { FENCE_SEG } = await import('./maps/inhabitKit.ts');
const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const start = source.indexOf('  function placeFenceRun('), end = source.indexOf('  /** Seeded ring scatter', start);
assert.ok(start > 0 && end > start);
function actual(points) {
  const placed = []; let draws = 0;
  const build = new Function('fencePathSampler', 'FENCE_SEG', 'heightField', 'noVeg', 'drng', 'addDestructible',
    `${stripTypeScriptTypes(source.slice(start,end))}; return placeFenceRun;`)(
      fencePathSampler, FENCE_SEG, { _roadDist: () => 10, getHeightAt: () => 0 }, () => false,
      () => { draws++; return 0.5; }, (...args) => placed.push(args));
  build('fenceplank', points[0][0], points[0][1], points.at(-1)[0], points.at(-1)[1], 0.3, points);
  return { placed, draws };
}
const sparse = actual([[0,0],[0,30]]), dense = actual(Array.from({length:31},(_,i)=>[0,i]));
assert.deepEqual(dense,sparse,'one module/RNG sequence follows distance, independent of curve tessellation');
const actualArc = actual(path);
assert.equal(actualArc.placed.length,Math.round(sampler.length/FENCE_SEG));
assert.ok(actualArc.placed.some(p=>p[1]>10),'actual modules reach the far end of the sparse station interval');
assert.ok(new Set(actualArc.placed.map(p=>p[4].toFixed(3))).size>3,'module yaw follows the road bend');
console.log('actual fence construction: fixed station span, arc orientation and tessellation-independent RNG passed');

import assert from 'node:assert/strict';
import { seatStaggeredTrackGround } from './staggeredTrackGround.ts';

// Reproduce the large Type 89 stagger: the last flat cell still ends at
// z=-2.0 while the re-laid rear wrap starts at -1.82. That reversal points
// a shoe's inward guide down through the ground.
const course=[[-2,.056],[-1.95,.056],[-1,.056],[0,.056],[1,.056],[2,.056],[2.3,.30],[-2.3,.30]];
const endpoints=[1,1,0,1,0,0, 0,0,1,0,1,1, 0,1,1,0,1,0, 0,0,1,0,1,1];
const rest=new Float32Array(course.length*24*3);
for(let segment=0;segment<course.length;segment++)for(let vertex=0;vertex<24;vertex++){
  const point=course[(segment+endpoints[vertex])%course.length],i=(segment*24+vertex)*3;
  rest.set([vertex%2?.2:-.2,point[1]+(vertex%2?.013:-.013),point[0]],i);
}
const native=rest.slice();
seatStaggeredTrackGround(native,rest,course,[-2,-1,0,1,2],[-1.82,-.82,.18,1.18,2.18],.056);
for(let i=0;i<rest.length;i+=3){
  assert.equal(native[i],rest[i],'no lateral resize');
  assert.equal(native[i+1],rest[i+1],'no floor lift or band thinning');
  if(rest[i+1]<.1)assert(Math.abs(native[i+2]-rest[i+2]-.18)<1e-6,'flat course follows the real axles');
  else assert.equal(native[i+2],rest[i+2],'upper course stays fixed');
}
const centres=course.slice(0,6).map((_,i)=>native[(i*24+2)*3+2]);
assert(centres.every((z,i)=>!i||z>centres[i-1]),'no reversed flat segment');
assert(-1.82>-1.95,'negative control: old unshifted ground segment would reverse');
assert.throws(()=>seatStaggeredTrackGround(native,rest,course,[-2,0,1],[0,2,1],.056),/increasing/);
console.log('Staggered track ground: reversed-cell regression and preserved carrier stock passed');

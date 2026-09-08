import assert from 'node:assert/strict';
import {continuousShoeFloor,shoeConformanceAlpha,assertShoeFloorFrame} from './continuousShoeFloor.ts';

for(const old of[-.12,-.015,0,.024,Infinity]){
 assert.equal(continuousShoeFloor(old),old,'non-opted rigs retain the original exact floor');
 for(const certificate of[-.13,-.03,.01])assert.equal(continuousShoeFloor(old,certificate),Math.min(old,certificate));
}
for(const invalid of[NaN,Infinity,-Infinity])assert.throws(()=>continuousShoeFloor(0,invalid),/finite complete-course proof/);
for(const dt of[-1,0,1/120,1/60,1/30,1/15,.12,1]){
 assert.equal(shoeConformanceAlpha(dt,false),1-Math.exp(-Math.max(0,Math.min(dt,.12))*20),'unchanged established damping');
 assert.equal(shoeConformanceAlpha(dt,true),1,'first certified sample reaches actual support immediately');
}
const identity={position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}},rootScale={x:1,y:1,z:1};
assert.doesNotThrow(()=>assertShoeFloorFrame(identity,rootScale));
for(const part of['position','rotation','scale'])for(const axis of['x','y','z']){
 const invalid=structuredClone(identity);invalid[part][axis]+=.01;
 assert.throws(()=>assertShoeFloorFrame(invalid,rootScale),/certified identity hull/);
}
for(const axis of['x','y','z'])assert.throws(()=>assertShoeFloorFrame(identity,{...rootScale,[axis]:.9}),/unit root scale/);
console.log('continuousShoeFloor: PASS explicit certificate, frame/scale guards, lower body retention, unmarked defaults, first contact and original damping');

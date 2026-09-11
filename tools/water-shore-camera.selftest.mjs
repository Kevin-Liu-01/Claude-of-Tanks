import assert from 'node:assert/strict';
import {selectWaterShoreViews} from './water-shore-camera.mjs';
const water = {x: -80, z: 0, r: 45};
const field = {
  size: 256, getHeightAt: () => 0,
  getWaterMaskAt: (x, z) => Math.hypot(x + 80, z) < 40 && Math.abs(z) > 5 ? 1 : 0,
};
const select = heightField => selectWaterShoreViews({heightField, waters: [water]})[0];
const pose = select(field);
assert.ok(!pose.unresolved, 'finds the real shoreline despite a dry authored center and off-map naive camera');
assert.ok(pose.position.every(Number.isFinite));
assert.ok(Math.max(Math.abs(pose.position[0]), Math.abs(pose.position[2])) <= 104);
assert.equal(pose.cameraMask, 0); assert.equal(pose.targetMask, 1);
assert.ok(pose.wetSamples >= 6 && pose.terrainSightlineClearanceM >= .3);
assert.deepEqual(select(field), pose, 'deterministic camera selection');
assert.ok(select({...field, getWaterMaskAt: () => 0}).unresolved, 'dry ground or ice never certifies as liquid');
assert.ok(select({...field, getHeightAt: (x, z) => 20 * x + 20 * z}).unresolved, 'steep masked banks never qualify as water targets');
assert.equal(selectWaterShoreViews({heightField:field, waters:[]}).length, 0);
const neighboringOnly = {size:256,getHeightAt:()=>0,
  getWaterMaskAt:(x,z)=>Math.hypot(x-48,z)<7?1:0};
assert.ok(selectWaterShoreViews({heightField:neighboringOnly,waters:[{x:0,z:0,r:40} ]})[0].unresolved,
  'a neighboring body inside the old1.2r search cannot stand in for this dry body');
const authored = {x:-80,z:0,r:45,radii:Array(16).fill(.6)};
const own = selectWaterShoreViews({heightField:field,waters:[authored]})[0];
assert.ok(own.unresolved || Math.hypot(own.target[0]+80,own.target[2])<=27,
  'authored coves use their actual narrower inscribed core');
console.log('Water evidence cameras require in-bounds dry banks, actual liquid, broad flat targets and clear terrain sightlines');

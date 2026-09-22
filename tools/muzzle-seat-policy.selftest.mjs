import assert from 'node:assert/strict';
import { muzzleSeatAxialFit, physicalMuzzleRimSample } from './muzzle-seat-policy.mjs';
const legacy = {revision:'terminal-surface-fit-r2',lipAdvanceM:-.009,lipFrontM:.0009,
  markerGapM:0,annulusForwardM:.0006,discForwardM:.0003};
assert.ok(muzzleSeatAxialFit(legacy));
assert.ok(!muzzleSeatAxialFit({...legacy,discForwardM:-.2}), 'legacy declarations cannot claim an unverified recess');
// 2026-09-22 (owner: holes are added, not carved, to save triangles): the flat ring is lip and annular
// face in one plane, so the r3 annulus plane equals the lip front; the seat law is unchanged.
const flatRing = {...legacy,revision:'terminal-surface-fit-r3',annulusForwardM:.0009};
assert.ok(muzzleSeatAxialFit(flatRing), 'r3 flat-ring seats pass with the annulus at the lip front');
assert.ok(!muzzleSeatAxialFit({...flatRing,annulusForwardM:.002}), 'r3 annulus cannot stand ahead of the lip front');
assert.ok(!muzzleSeatAxialFit({...flatRing,discForwardM:.0001}), 'r3 keeps the disc-depth floor');
assert.ok(!muzzleSeatAxialFit({...flatRing,revision:'terminal-surface-fit-r4'}), 'unknown revisions never pass');
const physical = {...legacy,revision:'physical-recess-r1',supportSource:'authored-physical-bore',
  physicalBoreDepthM:.2,measuredMinimumDepthM:.2,measuredMaximumRimOffsetM:0,
  discForwardM:-.1995,physicalDiscDepthM:.1995};
assert.ok(muzzleSeatAxialFit(physical));
for (const change of [{physicalDiscDepthM:0},{measuredMinimumDepthM:0},
  {measuredMaximumRimOffsetM:.05},{physicalBoreDepthM:NaN},{discForwardM:0},
  {lipFrontM:.01},{physicalDiscDepthM:undefined},{supportSource:'nominal-spec'}]) {
  assert.ok(!muzzleSeatAxialFit({...physical,...change}), JSON.stringify(change));
}
console.log('muzzle-seat-policy: seated legacy mouths and measured recesses pass; unsupported declarations fail');

const lip = {revision:'physical-recess-r1',physicalInnerRadiusM:.05,
  measuredOuterRadiusM:.12,physicalRimProjectionM:.0371,measuredProjectionM:.0371};
const hit = {radiusM:.098,zM:.0371,gunOwned:true};
assert.ok(physicalMuzzleRimSample(lip,hit));
for(const change of [{radiusM:.04},{radiusM:.13},{zM:.06},{zM:-.02},{gunOwned:false},{zM:NaN}]) {
  assert.ok(!physicalMuzzleRimSample(lip,{...hit,...change}),JSON.stringify(change));
}
assert.ok(!physicalMuzzleRimSample({...lip,measuredProjectionM:0},hit));
assert.ok(!physicalMuzzleRimSample({...lip,revision:'terminal-surface-fit-r2'},hit));

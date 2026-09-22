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
// 2026-09-22 (owner: holes are added, not carved, to save triangles): a verified physical mouth's own
// flush annulus is its rim now that no barrel-paint fallback rim shadows it (KF41 44 mm brake, ZTZ-100).
const flush = {revision:'physical-recess-r1',physicalInnerRadiusM:.0175,
  measuredOuterRadiusM:.044,physicalRimProjectionM:0,measuredProjectionM:5.7e-8};
assert.ok(physicalMuzzleRimSample(flush,{radiusM:.0365,zM:5.7e-8,gunOwned:true}), 'flush physical annulus is the rim');
for (const change of [{radiusM:.0175},{radiusM:.0445},{zM:.002},{zM:-.002},{gunOwned:false}]) {
  assert.ok(!physicalMuzzleRimSample(flush,{radiusM:.0365,zM:0,gunOwned:true,...change}), JSON.stringify(change));
}
assert.ok(!physicalMuzzleRimSample({...flush,measuredProjectionM:.003},{radiusM:.0365,zM:0,gunOwned:true}),
  'a flush declaration cannot hide measured projecting stock');

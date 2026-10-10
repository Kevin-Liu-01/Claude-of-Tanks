import assert from 'node:assert/strict';
import { muzzleSeatAxialFit, physicalMuzzleRimSample, muzzleBoreLuminance, sampleMuzzleRingSeams } from './muzzle-seat-policy.mjs';
import * as THREE from 'three';

// Actual annular stock: shrinking must preserve the physical test radius.
// Missing sectors and foreground solids must fail the expanded ray course.
for (const factor of [1, .90]) {
  const material = new THREE.MeshBasicMaterial({side: THREE.DoubleSide});
  const ring = new THREE.Mesh(new THREE.RingGeometry(.02, .03, 18), material);
  ring.scale.setScalar(factor); ring.updateMatrixWorld(true);
  const sample = objects => phase => Array.from({length:16}, (_, i) => {
    const angle = i * Math.PI / 8 + phase, radius = .03 * .83 * factor;
    return new THREE.Raycaster(new THREE.Vector3(Math.cos(angle)*radius, Math.sin(angle)*radius, 1),
      new THREE.Vector3(0,0,-1)).intersectObjects(objects)[0]?.object === ring;
  });
  assert(sampleMuzzleRingSeams(sample([ring])).required.every(Boolean), 'closed ring passes after resizing');
  const original = ring.geometry;
  ring.geometry = new THREE.RingGeometry(.02,.03,18,1,.01,2*Math.PI-.02);
  assert(!sampleMuzzleRingSeams(sample([ring])).required.every(Boolean), 'finite missing sector remains a failure');
  ring.geometry.dispose(); ring.geometry = original;
  const obstruction = new THREE.Mesh(new THREE.BoxGeometry(.01,.01,.01), material);
  obstruction.position.set(.03*.83*factor,0,.1); obstruction.updateMatrixWorld(true);
  assert(!sampleMuzzleRingSeams(sample([ring,obstruction])).required.every(Boolean), 'foreground stock cannot impersonate the rim');
  ring.geometry.dispose(); obstruction.geometry.dispose(); material.dispose();
}
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

// A 30 mm aperture inside a wide brake remains black; the brake's painted face
// must not contaminate the center average. A covered or missing aperture still
// fails the unchanged dark-center contract.
const pixels = new Uint8ClampedArray(256 * 256 * 4);
const paintAperture = (centerLuma) => {
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const level = Math.hypot(x - 127.5, y - 127.5) <= 15 ? centerLuma : 110;
    pixels.set([level, level, level, 255], (y * 256 + x) * 4);
  }
};
const aperture = {revision:'physical-recess-r1',physicalInnerRadiusM:.015,outerRadiusM:.067};
const darkCenter = (reading) => reading.innerLuma < 80
  && reading.surroundLuma - reading.innerLuma > 15;
paintAperture(17);
const actual = muzzleBoreLuminance(pixels, 256, 256, 82, aperture);
assert.ok(darkCenter(actual), 'measured autocannon aperture reads recessed');
assert.ok(actual.innerPixelCount > 300, 'the aperture has substantial pixel coverage');
assert.ok(!darkCenter(muzzleBoreLuminance(pixels, 256, 256, 82)),
  'the old nominal-radius window reproduces the false rejection');
for (const level of [90, 110, 255]) {
  paintAperture(level);
  assert.ok(!darkCenter(muzzleBoreLuminance(pixels, 256, 256, 82, aperture)),
    `blocked, flat or missing aperture cannot pass (${level})`);
}
for (const inner of [0, -.01, NaN, .067, .08]) {
  assert.throws(() => muzzleBoreLuminance(pixels, 256, 256, 82,
    {...aperture,physicalInnerRadiusM:inner}), /valid measured aperture/);
}
console.log('muzzle-seat-policy: physical-aperture luminance and occlusion controls passed');

for (const revision of ['carved-physical-recess-r1','physical-recess-r2']) {
  const recessed = {revision,physicalBoreDepthM:.12,physicalInnerRadiusM:.04,
    supportOuterRadiusM:.07,physicalRimProjectionM:0,measuredMinimumDepthM:.12,
    measuredMaximumDepthM:.12,measuredMaximumWallErrorM:.001,
    measuredMaximumRimOffsetM:0,lipFrontM:0,annulusForwardM:0,discForwardM:-.12};
  assert.ok(muzzleSeatAxialFit(recessed), 'measured real recess passes without a front mask');
  for (const change of [{measuredMinimumDepthM:0},{measuredMaximumDepthM:.3},
    {measuredMaximumWallErrorM:.02},{measuredMaximumRimOffsetM:.005},
    {measuredMinimumDepthM:undefined},{physicalBoreDepthM:NaN},
    {supportOuterRadiusM:.03},{lipFrontM:.001},{discForwardM:0}]) {
    assert.ok(!muzzleSeatAxialFit({...recessed,...change}), JSON.stringify(change));
  }
}
console.log('muzzle-seat-policy: carved and authored recesses reject caps, missing walls and detached rims');

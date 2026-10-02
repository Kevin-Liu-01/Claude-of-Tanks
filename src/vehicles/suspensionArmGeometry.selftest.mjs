import assert from 'node:assert/strict';
import * as THREE from 'three';
import { dimensionedSuspensionArm } from './suspensionArmGeometry.ts';
import { resolveSuspensionDimensions, resolveSuspensionShape } from './suspensionDimensions.ts';

// 2026-10-01 (owner: retire frozen pins): the three pinned buffer digests of the no-opt-in arm (captured
// from c26b31942) are gone. Its live shape contract: every vertex lies on one of the two flat axial faces at
// +/- width/2, the rounded endpoint forgings span z = +/-(0.5 + 0.12), and each end keeps its measured height.
for (const [width, pivotHeight, axleHeight] of [[.16559, .192, .21828], [.10, .20, .15], [.07, .12, .24]]) {
  const geometry = dimensionedSuspensionArm(width, pivotHeight, axleHeight);
  const position = geometry.getAttribute('position');
  let minZ = Infinity, maxZ = -Infinity, pivot = 0, axle = 0;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    assert.ok(Math.abs(Math.abs(x) - width / 2) < 1e-6, 'no-opt-in arm keeps its flat measured axial faces');
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    if (z <= -.5 + 1e-6) pivot = Math.max(pivot, Math.abs(y));
    if (z >= .5 - 1e-6) axle = Math.max(axle, Math.abs(y));
  }
  assert.ok(Math.abs(minZ + .62) < 1e-6 && Math.abs(maxZ - .62) < 1e-6, 'rounded endpoint forgings bound the arm');
  assert.ok(Math.abs(pivot - pivotHeight / 2) < 1e-6, 'pivot forging keeps its measured height');
  assert.ok(Math.abs(axle - axleHeight / 2) < 1e-6, 'axle forging keeps its measured height');
  geometry.dispose();
}

const source = {
  armWidthM: .06962, armAxialShearM: .09597, armHeightM: .192, armAxleHeightM: .21828,
  armCenterAbsXM: 1.07335, anchorBossWidthM: .28297, anchorBossRadiusM: .14897,
  anchorBossCenterAbsXM: .85961, axleBossWidthM: .23257, axleBossRadiusM: .08630,
  axleBossCenterAbsXM: 1.16893, anchorLiftM: .20832, anchorTrailM: .485275,
};
const horizontal = resolveSuspensionDimensions({ ...source, anchorLiftM: 0 });
assert.equal(horizontal.anchorLiftM, 0, 'a measured horizontal arm retains exactly zero lift');
assert.ok(Object.isFrozen(horizontal), 'zero-lift dimensions retain the immutable result contract');
assert.equal(resolveSuspensionShape({ ...source, anchorLiftM: 0 }, .4, .3, {
  anchorLiftRatio: .3, armWidthRatio: .3, jointRadiusRatio: .2, jointWidthRatio: .3,
}).lift, 0, 'zero lift is not replaced by a generic positive fallback');
for (const value of [-.001, NaN, Infinity, 1.001]) {
  assert.throws(() => resolveSuspensionDimensions({ ...source, anchorLiftM: value }),
    /anchorLiftM/, 'negative, nonfinite and excessive lift remain invalid');
}
for (const key of ['armWidthM', 'armCenterAbsXM', 'anchorBossWidthM', 'anchorBossRadiusM',
  'anchorBossCenterAbsXM', 'axleBossWidthM', 'axleBossRadiusM', 'axleBossCenterAbsXM',
  'armHeightM', 'armAxleHeightM', 'anchorTrailM']) {
  assert.throws(() => resolveSuspensionDimensions({ ...source, [key]: 0 }),
    undefined, `${key} still requires a strictly positive value`);
}
assert.equal(resolveSuspensionDimensions(undefined), undefined, 'default recipe remains untouched');
const geometry = dimensionedSuspensionArm(.06962, .192, .21828, .09597);
const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const mesh = new THREE.Mesh(geometry, material);
mesh.position.x = 1.07335;
mesh.updateMatrixWorld(true);
const ray = z => new THREE.Raycaster(new THREE.Vector3(2, 0, z),
  new THREE.Vector3(-1, 0, 0)).intersectObject(mesh)[0];
assert.ok(Math.abs(ray(-.55).point.x - 1.060185) < .00002,
  'source anchor end is narrow and inboard, not the full diagonal AABB');
assert.ok(Math.abs(ray(.55).point.x - 1.156155) < .00002,
  'source axle end retains its measured outboard contact');
assert.ok(Math.abs(ray(0).point.x - 1.10816) < .00002,
  'joining web carries the source axial offset between endpoint forgings');
const shape = resolveSuspensionShape(source, .34531, .3484, {
  anchorLiftRatio: .3, armWidthRatio: .3, jointRadiusRatio: .2, jointWidthRatio: .3,
});
assert.ok(Math.abs(shape.assemblyHalfDepth - .082795) < 1e-10,
  'receipt retains the entire sheared envelope: no falsely narrowed AABB clearance');
for (const value of [NaN, Infinity, -.501, .501]) {
  assert.throws(() => resolveSuspensionDimensions({ ...source, armAxialShearM: value }));
  assert.throws(() => dimensionedSuspensionArm(.07, .2, .2, value));
}
assert.throws(() => resolveSuspensionDimensions({ ...source, armHeightM: undefined,
  armAxleHeightM: undefined }), /axial shear/);
geometry.dispose();
material.dispose();
console.log('suspensionArmGeometry.selftest: three no-opt-in arm shapes, true source axial shear and complete receipt bounds passed');

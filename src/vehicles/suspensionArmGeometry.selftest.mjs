import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { dimensionedSuspensionArm } from './suspensionArmGeometry.ts';
import { resolveSuspensionDimensions, resolveSuspensionShape } from './suspensionDimensions.ts';

const hash = geometry => {
  const result = createHash('sha256');
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    result.update(name).update(Buffer.from(attribute.array.buffer));
  }
  if (geometry.index) result.update(Buffer.from(geometry.index.array.buffer));
  return result.digest('hex');
};
// Independently captured from the unchanged c26b31942 implementation, before
// invoking the new optional shear branch. Positions/normals/UV/index included.
for (const [dimensions, expected] of [
  [[.16559, .192, .21828], 'e6ec191cfbbf71148dc99f9d7008fd513f9103500df7d851b76e5215f079b01c'],
  [[.10, .20, .15], '3521d67d58bb4ff4648a6810c65913794bdf56f8e24ca0d934ead069c11b555c'],
  [[.07, .12, .24], '6744c220ae26d4511c0d81e7ce3772c3802aea925232aaabb0bbec5516d7a478'],
]) {
  const geometry = dimensionedSuspensionArm(...dimensions);
  assert.equal(hash(geometry), expected, 'no opt-in preserves every original geometry buffer');
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
console.log('suspensionArmGeometry.selftest: three legacy buffers, true source axial shear and complete receipt bounds passed');

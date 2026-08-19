import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';
import { getSpec, MODEL_SOURCE } from '../specs.js';
import { tankTier } from '../tier.js';
import { wheelPatternFor } from '../wheelPatterns.js';

const spec = getSpec('mbt70');
assert(spec, 'MBT-70 is registered');
assert.equal(tankTier('mbt70'), 10, 'MBT-70 occupies the German Tier X missile lane');
assert.equal(MODEL_SOURCE.mbt70?.source, 'procedural', 'playable never loads the comparison GLB');
assert.equal(spec.authorship?.runtimeExternalGeometry, false, 'runtime external geometry is prohibited');
assert.equal(spec.nation, 'Germany', 'garage nation is Germany');
assert.equal(spec.gun.caliberMm, 152);
assert.equal(spec.gun.primaryGuided, true, 'launcher ATGM is the normal primary weapon');
assert.equal(spec.gun.shells.length, 1, 'no fictional conventional selector round');
assert.equal(spec.gun.shells[0].guided, true);
assert.equal(spec.armor.turretPivot[2], 0.47,
  'extended bustle is balanced by moving the complete turret rig forward');
assert.equal(wheelPatternFor(spec).id, 'split-rim-ten',
  'M1A1 donor keeps the Abrams split-rim wheel identity');
assert(spec.armor.modules.some((module) => module.module === 'missileRack'),
  'authored turret magazine exposes a missile-rack damage volume');
assert(spec.armor.crew.every((crew) => crew.turretLocal),
  'all three MBT-70 crew stations are authored inside the turret');

const tank = createTank('mbt70', null, { proceduralOnly: true, geometryReceipt: true });
await Promise.resolve();
const bounds = new THREE.Box3().setFromObject(tank.root);
const size = bounds.getSize(new THREE.Vector3());
assert.ok(Math.abs(size.z - spec.dims.overallLengthM) < 0.08,
  `complete length follows the M1A1-derived launcher envelope (${size.z.toFixed(3)})`);
assert.ok(Math.abs(size.x - spec.dims.widthM) < 0.08,
  `complete width follows the 3.51 m source datum (${size.x.toFixed(3)})`);
assert.ok(size.y > 3.25 && size.y < 3.36,
  `commander station remains seated on the low rounded turret (${size.y.toFixed(3)})`);
for (const name of ['rig_hull', 'rig_turret', 'rig_gun', 'rig_muzzle']) {
  assert(tank.root.getObjectByName(name), `${name} articulation exists`);
}
const turretBounds = new THREE.Box3().setFromObject(tank.root.getObjectByName('rig_turret'));
assert.ok(turretBounds.min.z < -2.55,
  `Abrams-like bustle and attached basket extend aft (${turretBounds.min.z.toFixed(3)})`);
assert(tank.root.getObjectByName('gearTrackBandL') && tank.root.getObjectByName('gearTrackBandR'),
  'both continuous track loops exist');
assert.equal(tank.root.getObjectByName('gearRoadWheelDiscs')?.count, 14,
  'M1A1 donor running gear retains seven road wheels per exposed side');
assert.deepEqual(tank.root.getObjectByName('rig_hull')?.userData.nativeWheelPatterns,
  ['split-rim-ten'], 'native running gear records one Abrams wheel pattern');
assert(tank.root.getObjectByName('muzzleBoreShadowDisc'), '152 mm launcher has an open bore');
tank.dispose();

console.log('mbt70Fidelity.selftest: source proportions, procedural ownership, anatomy and ATGM contract pass');

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';
import { getSpec, MODEL_SOURCE } from '../specs.js';
import { tankTier } from '../tier.js';
import { wheelPatternFor } from '../wheelPatterns.js';
import { resolveCamoVisual } from '../materials.js';
import { createTankState, SIM_DT } from '../../sim/movement.js';

const spec = getSpec('mbt70');
assert(spec, 'MBT-70 is registered');
assert.equal(tankTier('mbt70'), 10, 'MBT-70 occupies the German Tier X missile lane');
assert.equal(MODEL_SOURCE.mbt70?.source, 'procedural', 'playable never loads the comparison GLB');
assert.equal(spec.authorship?.runtimeExternalGeometry, false, 'runtime external geometry is prohibited');
assert.equal(spec.nation, 'Germany', 'garage nation is Germany');
const factoryVisual = resolveCamoVisual(spec, 'factory');
assert.equal(factoryVisual.scheme, 'nato', 'factory paint uses a restrained German three-tone pattern');
assert.equal(factoryVisual.base, '#56564d', 'factory paint cannot regress to the old bright olive-green coat');
assert.equal(spec.gun.caliberMm, 152);
assert.equal(spec.gun.primaryGuided, true, 'launcher ATGM is the normal primary weapon');
assert.equal(spec.gun.shells.length, 1, 'no fictional conventional selector round');
assert.equal(spec.gun.shells[0].guided, true);
assert.equal(typeof spec.hydropneumaticAim, 'object',
  'MBT-70 suspension aim owns an explicit physical travel envelope');
assert.ok(spec.hydropneumaticAim.compressionM >= 0.60 && spec.hydropneumaticAim.droopM >= 0.60,
  'MBT-70 carries enough wheel travel to reshape its long seven-wheel course');
assert.equal(spec.armor.turretPivot[2], 0.57,
  'extended bustle is balanced by moving the complete turret rig forward');
assert.equal(spec.dims.overallLengthM, 9.37,
  'published envelope follows the additional complete-rig forward seat');
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
const gunRig = tank.root.getObjectByName('rig_gun');
const mantlet = gunRig.userData.mbt70MantletReceipt;
assert.equal(mantlet?.profile, 'parabolic-arrow',
  'cast shield uses the MBT-70 rounded-arrow/parabolic contour');
assert.equal(mantlet?.circularMainShield, false,
  'main mantlet cannot regress to a circular cylinder or torus');
assert.equal(mantlet?.orientation, 'vertical',
  'compound mantlet stands vertically around the launcher axis');
assert.ok(mantlet.heightM > mantlet.widthM * 2,
  'cast shield is a tall semi-cylindrical mass, not a horizontal plate');
assert.ok(mantlet.planStations >= 13 && mantlet.ringCount >= 5,
  'mantlet has enough plan and elevation stations to hold the compound curve');
assert.ok(mantlet.rearOverlapM >= 0.30,
  'mantlet root penetrates the turret nose instead of floating ahead of it');
assert.equal(mantlet.xm150Sleeve, true);
assert.equal(mantlet.nearMuzzleSensor, true);
assert.deepEqual(tank.root.getObjectByName('rig_turret').userData.mbt70TurretReceipt, {
  forwardOffsetM: 0.57,
  structuralWidthM: 3.48,
  hullWidthM: 3.51,
  abramsLikeBustle: true,
  rearQuarterArmorRetained: true,
});
assert.ok(Math.abs(tank.root.getObjectByName('rig_turret').userData.mbt70TurretReceipt.structuralWidthM
  - spec.dims.widthM) <= 0.04,
  'structural turret shell spans the same visual width as the hull');
const turretBounds = new THREE.Box3().setFromObject(tank.root.getObjectByName('rig_turret'));
const bustleAftLocal = turretBounds.min.z - spec.armor.turretPivot[2];
assert.ok(bustleAftLocal < -3.05,
  `Abrams-like bustle and attached basket retain their local aft reach (${bustleAftLocal.toFixed(3)})`);
assert(tank.root.getObjectByName('gearTrackBandL') && tank.root.getObjectByName('gearTrackBandR'),
  'both continuous track loops exist');
assert.equal(tank.root.getObjectByName('gearRoadWheelDiscs')?.count, 14,
  'M1A1 donor running gear retains seven road wheels per exposed side');
assert.deepEqual(tank.root.getObjectByName('rig_hull')?.userData.nativeWheelPatterns,
  ['split-rim-ten'], 'native running gear records one Abrams wheel pattern');
assert(tank.root.getObjectByName('muzzleBoreShadowDisc'), '152 mm launcher has an open bore');

// The hydropneumatic pose must articulate the complete inherited Abrams gear,
// not leave a rigid belt and wheel train sliding through the floor. This is a
// render-rig contract: read the actual instance matrices and band vertices.
const state = createTankState(spec, new THREE.Vector3(), 0);
state.visualPitch = THREE.MathUtils.degToRad(10);
tank.setGroundSampler(() => 0);
const band = tank.root.getObjectByName('gearTrackBandL');
const restBand = Float32Array.from(band.geometry.getAttribute('position').array);
for (let frame = 0; frame < 48; frame++) tank.syncFromState(state, SIM_DT);

const wheels = tank.root.getObjectByName('gearRoadWheelTires');
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
let minWheelY = Infinity;
let maxWheelY = -Infinity;
for (let instance = 0; instance < wheels.count; instance++) {
  wheels.getMatrixAt(instance, matrix);
  position.setFromMatrixPosition(matrix);
  minWheelY = Math.min(minWheelY, position.y);
  maxWheelY = Math.max(maxWheelY, position.y);
}
assert.ok(maxWheelY - minWheelY >= 0.38,
  `MBT-70 hydraulic posture visibly staggers the road wheels (${(maxWheelY - minWheelY).toFixed(3)} m)`);

const deformedBand = band.geometry.getAttribute('position').array;
let maxBandTravel = 0;
for (let i = 1; i < deformedBand.length; i += 3) {
  maxBandTravel = Math.max(maxBandTravel, Math.abs(deformedBand[i] - restBand[i]));
}
assert.ok(maxBandTravel >= 0.34,
  `MBT-70 loaded track run reshapes with the wheels (${maxBandTravel.toFixed(3)} m)`);
tank.dispose();

// The MBT-70 shortens and re-seats its complete donor hull after construction.
// Terrain samples must use those transformed wheel stations, not the M1A1's
// stale pre-transform coordinates.
const contactTank = createTank('mbt70', null, { proceduralOnly: true, geometryReceipt: true });
const contactHull = contactTank.root.getObjectByName('rig_hull');
const frontWheelZ = contactHull.userData.runningGearReceipts[0].wheelZs[0];
const frontWheelWorldZ = frontWheelZ * contactHull.scale.z + contactHull.position.z;
contactTank.setGroundSampler((_x, z) => Math.abs(z - frontWheelWorldZ) < 0.015 ? 0.25 : 0);
const contactState = createTankState(spec, new THREE.Vector3(), 0);
for (let frame = 0; frame < 48; frame++) contactTank.syncFromState(contactState, SIM_DT);
const contactWheels = contactTank.root.getObjectByName('gearRoadWheelTires');
let raisedFrontWheelY = -Infinity;
for (let instance = 0; instance < contactWheels.count; instance++) {
  contactWheels.getMatrixAt(instance, matrix);
  position.setFromMatrixPosition(matrix);
  if (Math.abs(position.z - frontWheelZ) < 1e-3) {
    raisedFrontWheelY = Math.max(raisedFrontWheelY, position.y);
  }
}
assert.ok(raisedFrontWheelY >= 0.72,
  `terrain conformance samples the re-seated front station (${raisedFrontWheelY.toFixed(3)} m local Y)`);
contactTank.dispose();

console.log('mbt70Fidelity.selftest: source proportions, procedural ownership, anatomy and ATGM contract pass');

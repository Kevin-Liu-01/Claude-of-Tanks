import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.js';
import { getSpec } from './specs.js';
import { createTankState } from '../sim/movement.js';

const visual = createTank('m1a2', null, {
  proceduralOnly: true,
  geometryReceipt: true,
  batchStatic: true,
  battleDetailLod: true,
});
const root = visual.root;
const turret = root.getObjectByName('rig_turret');
const gun = root.getObjectByName('rig_gun');
const recoil = root.getObjectByName('rig_recoil');
const wheelMesh = root.getObjectByName('gearRoadWheelTires')
  || root.getObjectByName('gearRoadWheelDiscs');
const trackBand = root.getObjectByName('gearTrackBandL');
const detailGroups = [];
root.traverse((object) => {
  if (object.userData.battleDetailGroup) detailGroups.push({ object, parent: object.parent });
});

assert.ok(turret && gun && recoil && wheelMesh && trackBand,
  'probe tank exposes its articulated gun and running gear');
assert.ok(detailGroups.length > 0, 'probe tank exposes distance-managed battle detail');

const restWheels = Array.from(wheelMesh.instanceMatrix.array);
const restBand = Array.from(trackBand.geometry.getAttribute('position').array);
const state = createTankState(getSpec('m1a2'), new THREE.Vector3(12, 0.7, -9), 0.83);
state.visualPitch = 0.13;
state.visualRoll = -0.09;
state.turretYaw = 0.61;
state.gunPitch = 0.17;
state.trackScroll.l = 7.2;
state.trackScroll.r = 5.8;
state._susp.p = 0.025;
state._susp.r = -0.018;
state._swayEst = 0.011;

visual.setGroundSampler(() => 1.4);
for (let i = 0; i < 10; i++) visual.syncFromState(state, 0.08, 150);
visual.recoilKick();
visual.syncFromState(state, 0.12, 150);
visual.hitFlinch(0.8, -0.2, 2.4, state.yaw);
visual.setTrackState('trackL', true);
visual.setDestroyed({ pop: true, ageS: 0.42 });

assert.ok(Math.abs(root.rotation.x) > 0.05 && Math.abs(root.rotation.z) > 0.05,
  'battle pose rocks the hull away from its showroom rest pose');
assert.ok(Math.abs(turret.rotation.y) > 0.4 && Math.abs(gun.rotation.x) > 0.1,
  'battle pose articulates the turret and gun');
assert.ok(Math.abs(recoil.position.z) > 0.05, 'battle recoil leaves the gun out of battery');
assert.notDeepEqual(Array.from(wheelMesh.instanceMatrix.array), restWheels,
  'terrain conformance and track scroll move the running gear');
assert.notDeepEqual(Array.from(trackBand.geometry.getAttribute('position').array), restBand,
  'terrain conformance deforms the track band');
assert.ok(detailGroups.every(({ object }) => object.parent === null),
  'distant battle pose detaches cosmetic detail');
assert.equal(trackBand.visible, false, 'battle damage can throw the selected track');
assert.equal(visual.isDestroyed(), true, 'battle destruction can leave a wreck presentation');

visual.resetForGaragePresentation();

assert.ok(Math.abs(root.rotation.x) < 1e-9 && Math.abs(root.rotation.y) < 1e-9
  && Math.abs(root.rotation.z) < 1e-9, 'garage reset neutralizes the battle hull attitude');
assert.ok(Math.abs(turret.rotation.x) < 1e-9 && Math.abs(turret.rotation.y) < 1e-9
  && Math.abs(turret.rotation.z) < 1e-9, 'garage reset centers the turret');
assert.ok(Math.abs(gun.rotation.x) < 1e-9 && Math.abs(gun.rotation.y) < 1e-9
  && Math.abs(gun.rotation.z) < 1e-9, 'garage reset levels the gun');
assert.ok(Math.abs(recoil.position.z) < 1e-9 && Math.abs(recoil.rotation.z) < 1e-9,
  'garage reset returns the gun to battery');
assert.deepEqual(Array.from(wheelMesh.instanceMatrix.array), restWheels,
  'garage reset restores the authored wheel course');
assert.deepEqual(Array.from(trackBand.geometry.getAttribute('position').array), restBand,
  'garage reset restores the authored track band');
assert.ok(detailGroups.every(({ object, parent }) => object.parent === parent),
  'garage reset restores inspection-quality cosmetic detail');
assert.equal(trackBand.visible, true, 'garage reset restores a thrown track');
assert.equal(visual.isDestroyed(), false, 'garage reset restores an intact tank');

visual.dispose();

// ERA is a separately instanced damage layer, so exercise it on a vehicle that
// owns real clusters instead of relying on the Abrams no-op path above.
const eraVisual = createTank('m60a3', null, {
  proceduralOnly: true,
  geometryReceipt: true,
  batchStatic: false,
});
const eraMatrices = new Map();
eraVisual.root.traverse((object) => {
  if (object.isInstancedMesh) {
    eraMatrices.set(object, Array.from(object.instanceMatrix.array));
  }
});
eraVisual.stripEra('m60a3_turret_era_front_R');
assert.ok([...eraMatrices].some(([object, rest]) =>
  !rest.every((value, index) => value === object.instanceMatrix.array[index])),
  'battle damage can remove an ERA cluster');
eraVisual.resetForGaragePresentation();
for (const [object, rest] of eraMatrices) {
  assert.deepEqual(Array.from(object.instanceMatrix.array), rest,
    'garage reset re-seats every instanced ERA brick');
}
eraVisual.dispose();

console.log('garagePresentation.selftest: battle visual returns to canonical garage pose');

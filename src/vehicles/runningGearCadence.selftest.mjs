import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { createTankState } from '../sim/movement.ts';

const visual = createTank('m1a2', null, {
  proceduralOnly: true,
  geometryReceipt: true,
  battleDetailLod: true,
});
const state = createTankState(getSpec('m1a2'), new THREE.Vector3(), 0);
visual.setGroundSampler(() => 0);

let pads = null;
visual.root.traverse((object) => {
  if (!pads && object.name === 'gearTrackPads') pads = object;
});
assert.ok(pads?.instanceMatrix, 'test tank exposes articulated track instances');

for (let i = 0; i < 90; i++) visual.syncFromState(state, 1 / 60, 20);
const settledVersion = pads.instanceMatrix.version;
for (let i = 0; i < 30; i++) visual.syncFromState(state, 1 / 60, 20);
assert.equal(pads.instanceMatrix.version, settledVersion,
  'parked visible tank does not re-upload unchanged wheel and shoe matrices');

state.trackScroll.l += 0.08;
state.trackScroll.r += 0.08;
visual.syncFromState(state, 1 / 60, 20);
assert.ok(pads.instanceMatrix.version > settledVersion,
  'track motion invalidates and uploads the articulated chain');

visual.setVisible(false);
const hiddenVersion = pads.instanceMatrix.version;
state.pos.z += 3;
state.trackScroll.l += 0.4;
state.trackScroll.r += 0.4;
visual.syncFromState(state, 1 / 60, 20);
assert.equal(pads.instanceMatrix.version, hiddenVersion,
  'hidden tank retains its last exact running-gear buffers');

visual.setVisible(true);
visual.syncFromState(state, 1 / 60, 20);
assert.ok(pads.instanceMatrix.version > hiddenVersion,
  'reappearing tank catches running gear up in one exact update');

const culledVersion = pads.instanceMatrix.version;
state.pos.z += 2;
state.trackScroll.l += 0.2;
state.trackScroll.r += 0.2;
visual.syncFromState(state, 1 / 60, 20, null, false);
assert.equal(pads.instanceMatrix.version, culledVersion,
  'off-screen guard suppresses hidden running-gear uploads');
visual.syncFromState(state, 1 / 60, 20, null, true);
assert.ok(pads.instanceMatrix.version > culledVersion,
  'camera re-entry restores exact running-gear pose immediately');

visual.dispose();
console.log('runningGearCadence.selftest: PASS');

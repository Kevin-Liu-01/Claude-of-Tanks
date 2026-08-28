import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.js';
import { createTankState } from '../sim/movement.ts';
import './runningGearCadence.selftest.mjs';

const visual = createTank('m1a2', null, {
  proceduralOnly: true,
  geometryReceipt: true,
  batchStatic: true,
  battleDetailLod: true,
});
const state = createTankState(getSpec('m1a2'), new THREE.Vector3(), 0);
const records = [];
const markingMeshes = [];
visual.root.traverse((object) => {
  if (object.userData.battleDetailGroup) records.push({ object, parent: object.parent });
  if (object.userData.vehicleMarking) markingMeshes.push(object);
});

assert(records.length > 0, 'battle bot installs articulation-local detail groups');
assert(visual.root.userData.battleDetailObjectCount >= records.length,
  'detail receipt counts the retained source objects');
assert(Number.isInteger(visual.root.userData.staticBatchSavedDraws),
  'battle build publishes deterministic static-batch savings');
const endWheelBatches = [];
visual.root.traverse((object) => {
  if (object.name === 'gearEndWheelBody') endWheelBatches.push(object);
});
assert(endWheelBatches.length > 0 && endWheelBatches.every((object) =>
  object.isBatchedMesh && object.instanceCount === 4),
'battle running gear batches sprocket/idler geometry without dropping independent animation state');

visual.syncFromState(state, 0, 150);
assert(records.every(({ object }) => object.parent === null),
  'far battle detail detaches completely from scene traversal');

visual.syncFromState(state, 0, 80);
assert(records.every(({ object, parent }) => object.parent === parent),
  'close combat restores each detail group to its articulation parent');

visual.syncFromState(state, 0, 150);
visual.setDestroyed({ ageS: 0 });
assert(records.every(({ object }) => object.parent === null),
  'distant destruction captures burn detail without presenting a one-frame cosmetic burst');
assert(markingMeshes.length > 0 && markingMeshes.every((object) => object.visible === false),
  'merged battle markings still hide on destruction');

visual.syncFromState(state, 0);
assert(records.every(({ object, parent }) => object.parent === parent),
  'inspection and killcam framing restore the captured charred detail');
visual.syncFromState(state, 0, 150);
assert(records.every(({ object }) => object.parent === null),
  'a distant wreck sheds captured detail after inspection');
visual.dispose();
assert(records.every(({ object, parent }) => object.parent === parent),
  'dispose reattaches detached detail so root traversal owns every resource');

console.log(`battleDetailLod.selftest: ${records.length} detachable articulation groups passed`);

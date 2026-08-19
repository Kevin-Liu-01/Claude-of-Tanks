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
const state = createTankState(getSpec('m1a2'), new THREE.Vector3(), 0);
const records = [];
visual.root.traverse((object) => {
  if (object.userData.battleDetailGroup) records.push({ object, parent: object.parent });
});

assert(records.length > 0, 'battle bot installs articulation-local detail groups');
assert(visual.root.userData.battleDetailObjectCount >= records.length,
  'detail receipt counts the retained source objects');

visual.syncFromState(state, 0, 150);
assert(records.every(({ object }) => object.parent === null),
  'far battle detail detaches completely from scene traversal');

visual.syncFromState(state, 0, 80);
assert(records.every(({ object, parent }) => object.parent === parent),
  'close combat restores each detail group to its articulation parent');

visual.syncFromState(state, 0, 150);
visual.setDestroyed({ ageS: 0 });
assert(records.every(({ object, parent }) => object.parent === parent),
  'destruction restores detail before the burn-material capture');

visual.syncFromState(state, 0, 150);
assert(records.every(({ object }) => object.parent === null),
  'a distant wreck may shed detail again after its burn capture');
visual.dispose();
assert(records.every(({ object, parent }) => object.parent === parent),
  'dispose reattaches detached detail so root traversal owns every resource');

console.log(`battleDetailLod.selftest: ${records.length} detachable articulation groups passed`);

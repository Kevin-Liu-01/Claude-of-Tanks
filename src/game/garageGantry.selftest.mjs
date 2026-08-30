import assert from 'node:assert/strict';

import { auditVerdantGantryConnectivity, VERDANT_GANTRY } from './garageGantry.ts';

const receipt = auditVerdantGantryConnectivity();
assert.ok(Object.values(receipt).every(Boolean),
  `every gantry load path must be connected: ${JSON.stringify(receipt)}`);
assert.ok(VERDANT_GANTRY.bridgeLength / 2 > VERDANT_GANTRY.endZ,
  'the bridge must overlap both end crossheads');
assert.ok(VERDANT_GANTRY.crossheadWidth / 2 > VERDANT_GANTRY.postX,
  'each crosshead must overlap both upright posts');

console.log('garageGantry.selftest: feet, posts, crossheads, side rails, and bridge form one connected structure');

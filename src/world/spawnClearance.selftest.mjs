import assert from 'node:assert/strict';
import { isClearOfSpawns } from './spawnClearance.ts';

const spawns = Object.freeze([
  Object.freeze({ x: -222, z: -386 }),
  Object.freeze({ x: 80, z: 120 }),
]);

assert.equal(isClearOfSpawns(-222, -386, spawns, 36), false,
  'the spawn point itself is protected');
assert.equal(isClearOfSpawns(-222, -350.01, spawns, 36), false,
  'points inside the protected camera corridor are rejected');
assert.equal(isClearOfSpawns(-222, -350, spawns, 36), true,
  'the clearance boundary remains available for deterministic placement');
// Owner review 2026-09-13: the rim forest now uses a 20 m disc (vegetation.ts
// RIM_SPAWN_CLEARANCE_M) — the tank and its chase camera stay clear while the
// stand the reference build had around Fjord/Alpine spawns comes back.
assert.equal(isClearOfSpawns(-222, -366.01, spawns, 20), false,
  '20 m: the chase-camera corridor behind the spawn is still protected');
assert.equal(isClearOfSpawns(-222, -366, spawns, 20), true,
  '20 m: rim trees may stand just outside the corridor');
assert.equal(isClearOfSpawns(0, 0, spawns, 36), true,
  'points outside every spawn disc remain available');
assert.equal(isClearOfSpawns(0, 0, spawns, -1), true,
  'negative clearance is clamped to zero');

console.log('spawnClearance self-test passed');

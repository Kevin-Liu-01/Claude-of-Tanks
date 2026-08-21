import assert from 'node:assert/strict';
import { createHeightField } from './terrain.js';

const field = createHeightField(1337);

let warmed = 0;
for (const _tile of field.warmFastTilesAround([{ x: 0, z: 0, radiusM: 64 }])) warmed++;
assert.equal(warmed, 25, '64 m deployment warm covers the centered 5x5 tile neighborhood');

let single = 0;
for (const _tile of field.warmFastTilesAround([{ x: 240, z: -170, radiusM: 0 }])) single++;
assert.equal(single, 1, 'bot deployment warm touches only its current tile');

for (const [x, z] of [[0.25, 0.75], [31.9, -32.1], [240.4, -169.6], [-511, 510]]) {
  const exact = field.getHeightAt(x, z);
  const fast = field.getHeightAtFast(x, z);
  assert.ok(Math.abs(exact - fast) < 0.08,
    `fast terrain stays inside visual suspension tolerance at ${x},${z}`);
}

console.log('terrainFastGrid selftest: chunked deployment warm and 32 m fallback tiles passed');

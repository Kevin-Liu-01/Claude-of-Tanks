import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHeightField } from './terrain.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const main = fs.readFileSync(path.join(here, '..', 'main.js'), 'utf8');
const vegetation = fs.readFileSync(path.join(here, 'vegetation.js'), 'utf8');
assert.match(main,
  /const hfProxy = \{[\s\S]{0,900}getHeightAtFast:[\s\S]{0,500}getHeightAtExact:/,
  'camera, HUD and FX receive both cached live terrain and exact capture terrain');
assert.match(main,
  /return !shotMode && heightField\.getHeightAtFast[\s\S]{0,180}heightField\.getHeightAt\(x, z\)/,
  'ordinary presentation uses the cached height grid while deterministic shots stay exact');
assert.match(vegetation,
  /const grassAhead = grassFadeEnd \+ \(movedFromSpawn > 28 \? CHUNK_SIZE \* 0\.5 : 32\)/,
  'live grass streaming keeps a bounded half-chunk lookahead without changing its fade band');

const field = createHeightField(1337);

let warmed = 0;
for (const _tile of field.warmFastTilesAround([{ x: 0, z: 0, radiusM: 64 }])) warmed++;
assert.equal(warmed, 81, '64 m deployment warm covers the centered 9x9 tile neighborhood');

let single = 0;
for (const _tile of field.warmFastTilesAround([{ x: 240, z: -170, radiusM: 0 }])) single++;
assert.equal(single, 1, 'bot deployment warm touches only its current tile');

for (const [x, z] of [[0.25, 0.75], [31.9, -32.1], [240.4, -169.6], [-511, 510]]) {
  const exact = field.getHeightAt(x, z);
  const fast = field.getHeightAtFast(x, z);
  assert.ok(Math.abs(exact - fast) < 0.08,
    `fast terrain stays inside visual suspension tolerance at ${x},${z}`);
}

console.log('terrainFastGrid selftest: chunked deployment warm and 16 m fallback tiles passed');

const liquid = createHeightField(1337, {
  terrain: {
    softLakes: true,
    lakes: [{ x: 80, z: 30, r: 42, level: -2 }],
    marshes: [{ x: -70, z: -20, r: 36, dip: 1.1 }],
  },
  splat: { seaLake: true },
});
assert.ok(liquid.getWaterMaskAt(80, 30) > 0.95, 'liquid lake core is queryable');
assert.ok(liquid.getWaterMaskAt(-70, -20) > 0.95, 'liquid marsh core is queryable');
assert.equal(liquid.getWaterMaskAt(0, 0), 0, 'dry terrain reports no liquid coverage');

const ice = createHeightField(1337, {
  terrain: {
    frozenMarshes: true,
    lakes: [{ x: 80, z: 30, r: 42, level: -2 }],
    marshes: [{ x: -70, z: -20, r: 36, dip: 1.1 }],
  },
  splat: { seaLake: true },
});
assert.equal(ice.getWaterMaskAt(80, 30), 0, 'frozen lake never emits a liquid wake');
assert.equal(ice.getWaterMaskAt(-70, -20), 0, 'frozen marsh never emits a liquid wake');

console.log('terrainFastGrid selftest: liquid coverage query distinguishes water from ice');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHeightField } from './terrain.ts';
import winter from './maps/winter.ts';
import { createCacheExperiment } from '../../tools/terrain-fast-cache-benchmark.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const main = fs.readFileSync(path.join(here, '..', 'main.ts'), 'utf8');
const liveProxy = fs.readFileSync(path.join(here, 'liveHeightFieldProxy.ts'), 'utf8');
const vegetation = fs.readFileSync(path.join(here, 'vegetation.ts'), 'utf8');
assert.match(main,
  /const hfProxy = createLiveHeightFieldProxy\(\{[\s\S]{0,180}useExactHeight: \(\) => shotMode/,
  'main delegates terrain mode and world lifetime to the typed proxy');
assert.match(liveProxy,
  /getHeightAtFast\(x: number, z: number\)[\s\S]{0,500}getHeightAtExact\(x: number, z: number\)/,
  'camera, HUD and FX receive both cached live terrain and exact capture terrain');
assert.match(liveProxy,
  /return useExactHeight\(\)[\s\S]{0,120}heightField\.getHeightAt\(x, z\)[\s\S]{0,80}fastHeight/,
  'ordinary presentation uses the cached height grid while deterministic shots stay exact');
assert.match(vegetation,
  /const grassAhead = grassFadeEnd \+ \(movedFromSpawn > 28 \? CHUNK_SIZE \* 0\.5 : 32\)/,
  'live grass streaming keeps a bounded half-chunk lookahead without changing its fade band');
assert.match(vegetation,
  /mesh\.computeBoundingSphere\(\);\s*mesh\.frustumCulled = true;/,
  'static midfield chunks retain exact density while Three culls the rear hemisphere');

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

// The comparator is the immutable ff68c3d6c tile implementation, not a second
// invocation of the newly edited runtime. Only its analytic terrain is shared.
const winterField = createHeightField(1337, winter);
const priorGrid = createCacheExperiment('tile', winterField.getHeightAt);
const samplePoints = [[0.25, 0.75], [15.9999, 16.0001], [-496, -495.9999],
  [-512, -512], [512, 512], [1e9, -1e9], [NaN, 0], [0, NaN], [NaN, NaN],
  [Infinity, 0], [0, -Infinity], [Infinity, -Infinity]];
for (let index = 0; index < 64; index++) {
  samplePoints.push([((index * 173 + 37) % 1024) - 511.625,
    ((index * 293 + 91) % 1024) - 511.875]);
}
for (const [x, z] of samplePoints) {
  assert.equal(winterField.getHeightAtFast(x, z), priorGrid.getHeightAtFast(x, z),
    `actual Winter cache preserves old Float32/bilinear result at ${x},${z}`);
}
// A fast read no longer pretends the rest of its tile is warmed. Finishing it
// remains one finite generator job; later requests skip that completed tile.
const warmOrigin = [{ x: 0, z: 0, radiusM: 0 }];
assert.deepEqual([...winterField.warmFastTilesAround(warmOrigin)], [2080]);
assert.deepEqual([...winterField.warmFastTilesAround(warmOrigin)], []);
for (let index = 0; index < 32; index++) {
  const x = index / 2, z = 15.875 - index / 2;
  assert.equal(winterField.getHeightAtFast(x, z), priorGrid.getHeightAtFast(x, z));
}
console.log('terrainFastGrid selftest: actual Winter matches prior cache at borders, NaN/Infinity and partial warm');

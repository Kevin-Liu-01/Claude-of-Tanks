import assert from 'node:assert/strict';
import { stampHardstandRoadGrids, stampHardstandRoadMask } from './hardstandSurface.ts';
import { createHeightField } from './terrain.ts';
import airfield from './maps/airfield.ts';

const size = 65, mapSize = 256;
const distances = new Float32Array(size * size).fill(1000);
const heights = new Float32Array(size * size).fill(10);
const distanceBuffer = distances.buffer, heightBuffer = heights.buffer;
const strip = { x: 0, z: 0, width: 36, length: 180, level: 3, grade: 0.005 };
stampHardstandRoadGrids([strip], distances, heights, size, mapSize, () => 10);
assert.equal(distances.buffer, distanceBuffer); assert.equal(heights.buffer, heightBuffer);
for (let z = -80; z <= 80; z += 4) for (let x = -16; x <= 16; x += 4) {
  const at = ((z + 128) / 4) * size + (x + 128) / 4;
  assert.ok(distances[at] < 3.8);
  assert.ok(Math.abs(heights[at] - (3 + z * 0.005)) < 1e-6,
    'the entire pavement width is one plane, not two flattened wheel lanes');
}
const pixels = new Uint8ClampedArray(128 * 128 * 4).fill(37);
const pixelBuffer = pixels.buffer;
stampHardstandRoadMask([strip], pixels, 128, mapSize);
assert.equal(pixels.buffer, pixelBuffer, 'pavement reuses the existing road mask buffer');
for (let z = -80; z <= 80; z += 2) for (let x = -16; x <= 16; x += 2) {
  const at = (((z + 128) / 2) * 128 + (x + 128) / 2) * 4;
  assert.equal(pixels[at], 255); assert.equal(pixels[at + 1], 0);
  assert.equal(pixels[at + 2], 37); assert.equal(pixels[at + 3], 37,
    'hardstands do not overwrite wetness or village channels');
}

for (const seed of [1337, 2049]) {
  const field = createHeightField(seed, airfield);
  const without = createHeightField(seed, {
    ...airfield, terrain: { ...airfield.terrain, hardstands: [] },
  });
  const centre = field.getHeightAt(0, 0);
  const grade = (field.getHeightAt(0, 300) - field.getHeightAt(0, -300)) / 600;
  assert.ok(Math.abs(grade) <= 0.01001);
  for (let z = -380; z <= 380; z += 20) {
    for (const x of [-18, -17.9, -16, -8, 0, 8, 16, 17.9, 18]) {
      assert.ok(Math.abs(field.getHeightAt(x, z) - (centre + grade * z)) < 2e-6,
        'the real airfield has continuous graded full-width pavement');
      assert.equal(field.getGroundType(x, z), 'hard');
      assert.equal(field._noVeg(x, z), true);
    }
  }
  for (const spawn of [airfield.spawns.player, ...airfield.spawns.enemies]) {
    assert.equal(field.getHeightAt(spawn.x, spawn.z), without.getHeightAt(spawn.x, spawn.z),
      'the bounded runway never changes deployment pad elevations');
  }
  // Apron roads meet the strip via the same elevation grid. Their immediate
  // threshold crosses no new raised kerb or disconnected pavement step.
  for (const z of [-180, -20, 140]) {
    assert.ok(Math.abs(field.getHeightAt(18.2, z) - field.getHeightAt(17.8, z)) < 0.12);
  }
}
console.log('hardstandSurface.selftest: full-width plane, pavement mask, dry drive and connected aprons passed');

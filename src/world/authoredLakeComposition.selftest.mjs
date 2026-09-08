import assert from 'node:assert/strict';
import { createHeightField } from './terrain.ts';
import { shorelineDistance, shorelineRadiusAt, shorelineWetnessFromDistance } from './shoreline.ts';
import { composeLakeHeight } from './lakeHeightComposition.ts';
import polders from './maps/polders.ts';

// Pin the old arithmetic independently of the new helper, including frozen
// sheets and partially protected settlement banks. This is exact, not epsilon
// parity: existing maps must not change from opting another map into contours.
function legacyComposition(lakes, levels, banks, x, z, height, settlement) {
  let wetness = 0;
  const smoothstep = (a, b, value) => {
    const t = Math.min(1, Math.max(0, (value - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let index = 0; index < lakes.length; index++) {
    const band = banks ? banks[index] : 1.32;
    const distance = shorelineDistance(lakes[index], x, z, band);
    if (banks && wetness < 1 && distance < .96) {
      wetness = Math.max(wetness, shorelineWetnessFromDistance(distance, true));
    }
    if (distance < band) {
      let weight = smoothstep(band, .94, distance);
      if (banks && settlement > 0) {
        const original = smoothstep(1.32, .94, distance);
        weight += (original - weight) * settlement;
      }
      height += (levels[index] - height) * weight;
    }
  }
  return { height, wetness };
}
const legacyLakes = [{ x: -28, z: 12, r: 38 }, { x: 9, z: -19, r: 24 }, { x: 67, z: 31, r: 43 }];
const legacyLevels = new Float64Array([-2.6, 1.4, -5.4]);
const legacyOut = { height: 0, wetness: 0 };
let legacySamples = 0;
for (const banks of [null, new Float64Array([1.6, 2.8, 1.32])]) {
  for (const settlement of [0, .35, 1]) for (let z = -100; z <= 100; z += 4) for (let x = -100; x <= 120; x += 4) {
    const height = 7 + Math.sin(x * .1) * Math.cos(z * .07);
    const expected = legacyComposition(legacyLakes, legacyLevels, banks, x, z, height, settlement);
    composeLakeHeight(legacyLakes, legacyLevels, banks, false, x, z, height, settlement, legacyOut);
    assert.deepEqual(legacyOut, expected);
    if (!banks) {
      composeLakeHeight(legacyLakes, legacyLevels, null, true, x, z, height, settlement, legacyOut);
      assert.deepEqual(legacyOut, expected, 'frozen/initialization path remains legacy even with authored contours');
    }
    legacySamples++;
  }
}

// Preserve the actual rejected draft that exposed overlapping grading aprons:
// its fully wet SE core (155.22,-257) was pulled from -2.6 to
// -2.6351450763333073 / -2.6011023396632216 / -2.6779939091839027.
// Keep this fixture even if authoring later separates or broadens the basins.
const lakes = polders.terrain.lakes.map((lake, index) => index !== 2 ? lake : {
  x: 166, z: -6, r: 73, level: -3.3,
  radii: [.76, .78, .73, .63, .66, .95, .61, .28, .24, .31, .47, .66, .91, .89, .81, .75],
});
const config = { ...polders, terrain: { ...polders.terrain, lakes } };
let permutationSamples = 0, coreBoundarySamples = 0;
for (const seed of [1337, 2049, 7719]) {
  const field = createHeightField(seed, config);
  const permutations = [lakes.toReversed(), [lakes[2], lakes[4], lakes[0], lakes[3], lakes[1]]]
    .map(order => createHeightField(seed, { ...config, terrain: { ...config.terrain, lakes: order } }));
  for (const candidate of [field, ...permutations]) {
    assert.equal(candidate.getWaterMaskAt(155.22, -257), 1);
    assert.equal(candidate.getHeightAt(155.22, -257), -2.6,
      'another basin grading apron never changes the fully wet core');
  }
  for (let z = -410; z <= 430; z += 20) for (let x = -330; x <= 350; x += 20) {
    for (const candidate of permutations) {
      assert.ok(Math.abs(field.getHeightAt(x, z) - candidate.getHeightAt(x, z)) < 1e-10,
        `custom lake composition is order-independent at ${x},${z}`);
      assert.equal(field.getWaterMaskAt(x, z), candidate.getWaterMaskAt(x, z));
      assert.equal(field._noVeg(x, z), candidate._noVeg(x, z));
      permutationSamples++;
    }
  }
  for (const lake of lakes) for (let station = 0; station < 64; station++) {
    const angle = station * Math.PI / 32, radius = shorelineRadiusAt(lake, angle);
    const x = lake.x + Math.cos(angle) * radius * .94, z = lake.z + Math.sin(angle) * radius * .94;
    if (field._roadDist(x, z) < 24) continue;
    const inside = field.getHeightAt(x - Math.cos(angle) * .0001, z - Math.sin(angle) * .0001);
    const outside = field.getHeightAt(x + Math.cos(angle) * .0001, z + Math.sin(angle) * .0001);
    assert.ok(Math.abs(inside - lake.level) < 1e-10, 'exact-core side keeps the authored level');
    assert.ok(Math.abs(outside - inside) < .000001,
      `no apron/core discontinuity at ${x},${z}: ${outside - inside}`);
    coreBoundarySamples++;
  }
}
assert.ok(permutationSamples > 8000 && coreBoundarySamples >= 900);
console.log(`authoredLakeComposition: ${legacySamples} exact legacy samples, actual cross-apron flat-core regression, ${permutationSamples} permutation samples and ${coreBoundarySamples} continuous core-boundary samples PASS`);

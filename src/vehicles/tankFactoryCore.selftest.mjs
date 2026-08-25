import assert from 'node:assert/strict';
import {
  KIT,
  configureTankFactory,
  createTank,
  robustFloorY,
} from './tankFactoryCore.js';

function referenceRobustFloorY(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  if (sorted.length < 12) return sorted[0];
  for (let i = 0; i + 11 < sorted.length; i++) {
    if (sorted[i + 11] - sorted[i] <= 0.015) return sorted[i];
  }
  return sorted[0];
}

assert.equal(robustFloorY([]), undefined);
assert.equal(robustFloorY([0.2, -0.4, 0.1]), -0.4);
assert.equal(robustFloorY([
  ...Array.from({ length: 90 }, (_, i) => -2 + i * 0.02),
  ...Array.from({ length: 12 }, (_, i) => 0.25 + i * 0.001),
]), 0.25, 'dense shell beyond the initial prefix remains exact');
assert.equal(robustFloorY(Array.from({ length: 100 }, (_, i) => i * 0.1)), 0,
  'an array with no dense shell falls back to its absolute minimum');

let floorSeed = 0x51f15e;
const floorRandom = () => {
  floorSeed = (Math.imul(floorSeed, 1664525) + 1013904223) >>> 0;
  return floorSeed / 0x100000000;
};
for (let sample = 0; sample < 80; sample++) {
  const length = 1 + Math.floor(floorRandom() * 1400);
  const values = Array.from({ length }, () =>
    Math.round((floorRandom() * 8 - 4) * 10000) / 10000);
  assert.equal(robustFloorY(values), referenceRobustFloorY(values),
    `bounded floor selection matches a full sort for randomized sample ${sample}`);
}

assert.deepEqual(KIT.grilleIndices(true, 6, 3), [0, 1, 2, 3, 4, 5]);
assert.deepEqual(KIT.grilleIndices(false, 6, 3), [0, 3, 5]);
assert.deepEqual(KIT.grilleIndices(false, 4, 8), [0, 1, 2, 3]);
assert.deepEqual(KIT.grilleIndices(false, 1, 1), [0]);
assert.strictEqual(
  KIT.grilleIndices(false, 6, 3),
  KIT.grilleIndices(false, 6, 3),
  'low-detail grille samples are cached and immutable',
);
assert.throws(() => KIT.grilleIndices(false, 0, 3), RangeError);

assert.throws(
  () => createTank('m4a3e8', null, { proceduralOnly: true, geometryReceipt: true }),
  /Import tankFactory\.js/,
  'the internal core rejects use before the public fleet facade configures it',
);
assert.throws(
  () => configureTankFactory({ canonicalBuilderPacks: null, profiledBuilders: {}, fittings: {} }),
  /canonicalBuilderPacks must be an array/,
);
assert.throws(
  () => configureTankFactory({
    canonicalBuilderPacks: [['duplicate', { m4a3e8() {} }]],
    profiledBuilders: {},
    fittings: {},
  }),
  /Duplicate canonical builder m4a3e8/,
);
assert.throws(
  () => configureTankFactory({
    canonicalBuilderPacks: [],
    profiledBuilders: { invalid: null },
    fittings: {},
  }),
  /Profiled builder invalid must be a function/,
);
assert.throws(
  () => configureTankFactory({ canonicalBuilderPacks: [], profiledBuilders: {}, fittings: {} }),
  /Missing tank fitting spareTrackLinks/,
);

const noOp = () => {};
configureTankFactory({
  canonicalBuilderPacks: [],
  profiledBuilders: {},
  fittings: { spareTrackLinks: noOp, antennaWhip: noOp, pintleMG: noOp },
});
assert.throws(
  () => configureTankFactory({ canonicalBuilderPacks: [], profiledBuilders: {}, fittings: {} }),
  /already configured/,
  'configuration is a one-shot boot gate',
);

const tank = createTank('m4a3e8', null, { proceduralOnly: true, geometryReceipt: true });
assert.equal(tank.root.name, 'tank_m4a3e8');
tank.dispose();

console.log('tankFactoryCore.selftest: configuration guards and core builder passed');

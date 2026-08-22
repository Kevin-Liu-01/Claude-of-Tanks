import assert from 'node:assert/strict';
import { KIT, configureTankFactory, createTank } from './tankFactoryCore.js';

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

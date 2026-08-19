import assert from 'node:assert/strict';
import { configureTankFactory, createTank } from './tankFactoryCore.js';

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

import assert from 'node:assert/strict';
import {
  CAMO_PATTERN_IDS,
  CUSTOM_CAMO_ID,
  customCamoPatternId,
  factoryThemePatternId,
  isBuiltInCamoId,
  isPlainGreenFactoryVisual,
  networkCamoId,
  normalizeCustomCamo,
  parseCustomCamoPatternId,
} from './camoPolicy.js';

assert.equal(isBuiltInCamoId('summer'), true);
assert.equal(isBuiltInCamoId(CUSTOM_CAMO_ID), false,
  'custom paint is never accepted as public match metadata');
assert.equal(networkCamoId(CUSTOM_CAMO_ID), 'factory');
assert.equal(networkCamoId('unknown'), 'factory');
assert.equal(networkCamoId(CAMO_PATTERN_IDS.at(-1)), CAMO_PATTERN_IDS.at(-1));

const plainGreen = {
  id: 'example', nation: 'Sweden', era: 'modern',
  visual: { scheme: 'solid', base: '#45513f', patches: [] },
};
assert.equal(isPlainGreenFactoryVisual(plainGreen.visual), true);
assert.equal(factoryThemePatternId(plainGreen), 'm90');
assert.equal(factoryThemePatternId({
  ...plainGreen,
  visual: { scheme: 'nato', base: '#45513f', patches: ['#252a24', '#73563a'] },
}), null, 'authored patterned factory paint must remain untouched');

const custom = normalizeCustomCamo({
  style: 'digital', base: '#123456', colorA: '#abcdef', colorB: '#010203', repeat: 75,
});
const encoded = customCamoPatternId(custom);
assert.deepEqual(parseCustomCamoPatternId(encoded), custom,
  'custom cache key round-trips every painter input');
assert.equal(parseCustomCamoPatternId('custom~invalid'), null);
assert.deepEqual(normalizeCustomCamo({ style: 'bad', base: 'red', repeat: 999 }), {
  style: 'blotch', base: '#46513d', colorA: '#252a24', colorB: '#73563a', repeat: 100,
});

console.log('camoPolicy.selftest: network boundary and custom pattern codec passed');

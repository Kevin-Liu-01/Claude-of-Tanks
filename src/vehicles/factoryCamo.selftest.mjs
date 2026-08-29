import assert from 'node:assert/strict';
import './tankFactory.ts';
import { ALL_TANK_IDS, getSpec } from './specs.ts';
import {
  SIGNATURE_CAMO_TANK_IDS,
  defaultCamoPatternId,
  hasSignatureCamo,
} from './camoPolicy.ts';
import { getCamoSelection, resolveCamoVisual } from './materials.ts';

const standards = {
  USA: ['desert', '#a88e63', '#b9a175', ['#755c42', '#91784f', '#c3ad82']],
  Germany: ['stripes', '#45494b', '#565b5e', ['#292d2f', '#62676a', '#353a3c']],
  Russia: ['solid', '#44553b', '#5a6448', []],
  UK: ['stripes', '#414c38', '#4a5540', ['#1e201d']],
  France: ['nato', '#344651', '#425663', ['#26343c', '#586b75']],
  China: ['digital', '#4b573e', '#59654a', ['#68704f', '#35422f', '#252b22']],
  Italy: ['stripes', '#474b4c', '#585d5f', ['#34393a', '#272b2c']],
  Japan: ['stripes', '#39463a', '#445144', ['#63523c', '#2e392f']],
  Poland: ['digital', '#313b38', '#47504a', ['#202725', '#4e5750', '#67685e']],
  'South Korea': ['digital', '#465341', '#5e6753', ['#2d352c', '#69604b', '#81765b']],
  Sweden: ['splinter', '#34493c', '#4b5b4c', ['#202b26', '#5c644c', '#81745a']],
  Israel: ['solid', '#6f7566', '#7b8172', []],
  Ukraine: ['digital', '#4c5142', '#666956', ['#30352d', '#625b46', '#77705a']],
};

const nationKey = (nation) => (
  nation === 'USSR' || nation === 'USSR/Russia' || nation === 'Russia' ? 'Russia' : nation
);
const paletteKey = (visual) => JSON.stringify([
  visual.scheme, visual.base, visual.weather, visual.patches || [], visual.camoScale,
]);

let standardized = 0;
for (const id of ALL_TANK_IDS) {
  const spec = getSpec(id);
  const standard = standards[nationKey(spec.nation)];
  const resolved = resolveCamoVisual(spec, 'factory');
  if (!standard) continue;
  standardized += 1;
  assert.deepEqual(
    [resolved.scheme, resolved.base, resolved.weather, resolved.patches || []],
    standard,
    `${id} must use the ${nationKey(spec.nation)} national Factory recipe`,
  );
}

assert.ok(standardized >= 120, 'nearly the whole playable fleet must have a national Factory owner');

for (const id of SIGNATURE_CAMO_TANK_IDS) {
  assert.ok(ALL_TANK_IDS.includes(id), `${id} Signature entry must name a playable tank`);
  assert.equal(hasSignatureCamo(id), true);
  assert.equal(defaultCamoPatternId(id), 'signature', `${id} must initially wear its Signature finish`);
  assert.notEqual(
    paletteKey(resolveCamoVisual(getSpec(id), 'signature')),
    paletteKey(resolveCamoVisual(getSpec(id), 'factory')),
    `${id} Signature must remain visibly differentiated from national Factory`,
  );
}

assert.equal(defaultCamoPatternId('m1a2'), 'factory');
assert.equal(getCamoSelection('abramsx'), 'signature',
  'an unset personality vehicle must select Signature even without browser storage');
assert.equal(getCamoSelection('m1a2'), 'factory',
  'an unset standard vehicle must select national Factory');

const previousLocalStorage = globalThis.localStorage;
globalThis.localStorage = {
  getItem: (key) => key === 'cot.camo.abramsx' ? 'factory' : null,
  setItem: () => {},
};
try {
  assert.equal(getCamoSelection('abramsx'), 'factory',
    'an explicit player Factory selection must override the Signature default');
} finally {
  if (previousLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousLocalStorage;
}

console.log(`factoryCamo.selftest: ${standardized} national Factory coats and ${SIGNATURE_CAMO_TANK_IDS.length} Signature defaults passed`);

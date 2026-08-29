import assert from 'node:assert/strict';
import './tankFactory.ts';
import { ALL_TANK_IDS, getSpec } from './specs.ts';
import {
  FACTORY_CAMO_PATTERN_BY_NATION,
  SHARED_CAMO_PRESETS,
  SIGNATURE_CAMO_TANK_IDS,
  defaultCamoPatternId,
  hasSignatureCamo,
  signatureCamoPatternId,
} from './camoPolicy.ts';
import { getCamoSelection, resolveCamoVisual } from './materials.ts';

const standards = {
  USA: ['desert', '#b09466', '#c4ad7d', ['#7a5f43', '#947c52', '#cbb489']],
  Germany: ['stripes', '#48503f', '#626956', ['#293128', '#605640', '#746d58']],
  Russia: ['solid', '#3f5138', '#4a5c42', []],
  UK: ['stripes', '#414c38', '#4a5540', ['#1e201d']],
  France: ['nato', '#3e4d3a', '#48573f', ['#5b4a38', '#1d1f1c']],
  China: ['digital', '#4d573f', '#57614a', ['#6f684c', '#39412f', '#23261e']],
  Italy: ['stripes', '#48533e', '#53604a', ['#384431', '#2c3529']],
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
  const signaturePatternId = signatureCamoPatternId(id);
  assert.ok(signaturePatternId, `${id} must own a named reusable Signature finish`);
  assert.equal(defaultCamoPatternId(id), signaturePatternId,
    `${id} must initially wear its named Signature finish`);
  assert.notEqual(
    paletteKey(resolveCamoVisual(getSpec(id), signaturePatternId)),
    paletteKey(resolveCamoVisual(getSpec(id), 'factory')),
    `${id} Signature must remain visibly differentiated from national Factory`,
  );
}

for (const [nation, patternId] of Object.entries(FACTORY_CAMO_PATTERN_BY_NATION)) {
  assert.ok(SHARED_CAMO_PRESETS.some((preset) => preset.id === patternId),
    `${nation} Factory owns a reusable named service preset`);
}

const abramsXOnAbrams = resolveCamoVisual(getSpec('m1a2'), 'sig_abramsx');
const abramsXOnT90 = resolveCamoVisual(getSpec('t90m'), 'sig_abramsx');
assert.equal(paletteKey(abramsXOnAbrams), paletteKey(abramsXOnT90),
  'a named vehicle colorway renders identically on tanks from different nations');

assert.equal(defaultCamoPatternId('m1a2'), 'factory');
assert.equal(getCamoSelection('abramsx'), 'sig_abramsx',
  'an unset personality vehicle must select its named Signature preset without browser storage');
assert.equal(getCamoSelection('m1a2'), 'factory',
  'an unset standard vehicle must select national Factory');

const previousLocalStorage = globalThis.localStorage;
globalThis.localStorage = {
  getItem: (key) => {
    if (key === 'cot.camo.abramsx') return 'factory';
    if (key === 'cot.camo.m551_sheridan') return 'signature';
    return null;
  },
  setItem: () => {},
};
try {
  assert.equal(getCamoSelection('abramsx'), 'factory',
    'an explicit player Factory selection must override the Signature default');
  assert.equal(getCamoSelection('m551_sheridan'), 'sig_m551_sheridan',
    'the legacy tank-relative Signature id migrates to its named reusable preset');
} finally {
  if (previousLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousLocalStorage;
}

console.log(`factoryCamo.selftest: ${standardized} donor-owned Factory coats and ${SIGNATURE_CAMO_TANK_IDS.length} reusable Signature defaults passed`);

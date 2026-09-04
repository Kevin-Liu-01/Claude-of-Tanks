import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  CAMO_CATALOG_PATTERN_IDS,
  CAMO_PATTERN_IDS,
  CAMO_PATTERN_LABEL,
  CAMO_TAG_IDS,
  CAMO_TAG_LABEL,
  CUSTOM_CAMO_ASSETS,
  CUSTOM_CAMO_BRUSHES,
  CUSTOM_CAMO_ID,
  CUSTOM_CAMO_STYLES,
  FACTORY_CAMO_PATTERN_BY_NATION,
  SHARED_CAMO_PRESETS,
  SIGNATURE_CAMO_TANK_IDS,
  camoNationTag,
  camoMatchesTag,
  camoPatternTags,
  customCamoPatternId,
  defaultCamoPatternId,
  factoryCamoPatternIdFor,
  hasSignatureCamo,
  isBuiltInCamoId,
  networkCamoId,
  normalizeCustomCamo,
  parseCustomCamoPatternId,
  sharedCamoPreset,
  signatureCamoPatternId,
} from './camoPolicy.ts';

assert.equal(isBuiltInCamoId('summer'), true);
assert.equal(isBuiltInCamoId(CUSTOM_CAMO_ID), false,
  'custom paint is never accepted as public match metadata');
assert.equal(networkCamoId(CUSTOM_CAMO_ID), 'factory');
assert.equal(networkCamoId('unknown'), 'factory');
assert.equal(networkCamoId(CAMO_PATTERN_IDS.at(-1)), CAMO_PATTERN_IDS.at(-1));
assert.equal(sharedCamoPreset(null), null);
assert.equal(sharedCamoPreset('not-a-preset'), null);
assert.equal(isBuiltInCamoId('signature'), true,
  'first-party vehicle Signature finishes are match-safe built-ins');
assert.equal(CAMO_CATALOG_PATTERN_IDS.includes('signature'), false,
  'the legacy generic Signature id stays out of the named player catalog');
assert.equal(CAMO_CATALOG_PATTERN_IDS.length, CAMO_PATTERN_IDS.length - 1);
assert.equal(defaultCamoPatternId('abramsx'), 'sig_abramsx');
assert.equal(defaultCamoPatternId('t90'), 'sig_t90');
assert.equal(defaultCamoPatternId('t90sm'), 'sig_t90sm');
assert.equal(defaultCamoPatternId('t90ms'), 'sig_t90ms');
assert.equal(defaultCamoPatternId('m1a2'), 'factory');
for (const id of ['m46_patton', 'm47_patton', 'm48', 'm2a2_bradley']) {
  assert.equal(defaultCamoPatternId(id), 'summer', `${id} should initially wear Summer camouflage`);
}
assert.ok(SIGNATURE_CAMO_TANK_IDS.length >= 45,
  'the requested personality fleet must remain explicit and substantial');
assert.ok(SHARED_CAMO_PRESETS.length >= 60,
  'service references and every requested personality colorway remain reusable');
assert.equal(new Set(SHARED_CAMO_PRESETS.map(({ id }) => id)).size, SHARED_CAMO_PRESETS.length,
  'reusable camouflage preset ids stay unique');
for (const preset of SHARED_CAMO_PRESETS) {
  assert.ok(CAMO_PATTERN_IDS.includes(preset.id), `${preset.id} is a selectable built-in pattern`);
  assert.equal(sharedCamoPreset(preset.id), preset, `${preset.id} resolves to its canonical recipe`);
  assert.ok(CAMO_PATTERN_LABEL[preset.id], `${preset.id} has a garage label`);
  assert.ok(preset.visual.base && preset.visual.weather, `${preset.id} owns a complete palette`);
}
for (const tankId of SIGNATURE_CAMO_TANK_IDS) {
  const patternId = signatureCamoPatternId(tankId);
  assert.ok(patternId, `${tankId} owns a named Signature preset`);
  assert.equal(sharedCamoPreset(patternId)?.sourceTankId, tankId,
    `${tankId} selects its own reusable colorway`);
}
assert.equal(FACTORY_CAMO_PATTERN_BY_NATION.USA, 'service_usa_desert');
assert.equal(FACTORY_CAMO_PATTERN_BY_NATION.Germany, 'service_leo2a6m');
assert.equal(FACTORY_CAMO_PATTERN_BY_NATION.Russia, 'service_t90m');
assert.equal(factoryCamoPatternIdFor('USSR', 'ww2'), 'service_soviet_ww2');
assert.equal(factoryCamoPatternIdFor('USSR/Russia', 'cold-war'), 'service_soviet_coldwar');
assert.equal(factoryCamoPatternIdFor('Russia', 'modern'), 'service_t90m');
assert.equal(factoryCamoPatternIdFor('Russia', 'ww2'), 'service_soviet_ww2');
assert.equal(factoryCamoPatternIdFor('Russia', 'cold-war'), 'service_soviet_coldwar');
assert.equal(FACTORY_CAMO_PATTERN_BY_NATION.France, 'service_leclerc_xlr');
assert.equal(factoryCamoPatternIdFor(null, 'modern'), null);
assert.equal(factoryCamoPatternIdFor('Atlantis', 'modern'), null);

const camoTagIds = new Set(CAMO_TAG_IDS);
assert.equal(camoTagIds.size, CAMO_TAG_IDS.length, 'camouflage tag ids stay unique');
for (const tagId of CAMO_TAG_IDS) {
  assert.ok(CAMO_TAG_LABEL[tagId], `${tagId} has a visible filter label`);
}
for (const patternId of CAMO_PATTERN_IDS) {
  const tags = camoPatternTags(patternId);
  assert.ok(tags.length > 0, `${patternId} belongs to at least one camouflage tag`);
  assert.equal(new Set(tags).size, tags.length, `${patternId} has no duplicate tags`);
  for (const tagId of tags) assert.ok(camoTagIds.has(tagId), `${patternId} uses known tag ${tagId}`);
}
assert.deepEqual(camoPatternTags('factory', 'Germany'), ['de', 'factory']);
assert.deepEqual(camoPatternTags('signature', 'Ukraine'), ['ua', 'signature', 'special']);
assert.deepEqual(camoPatternTags('service_leo2a6m'), ['de', 'woodland', 'stripes', 'factory']);
assert.deepEqual(camoPatternTags('sig_ua_t80bv'), ['ua', 'woodland', 'digital', 'signature', 'special']);
assert.deepEqual(camoPatternTags('sig_t90a_burlak'), ['ru', 'woodland', 'digital', 'signature', 'special']);
assert.deepEqual(camoPatternTags('service_soviet_coldwar'), ['ru', 'woodland', 'organic', 'historical', 'factory']);
assert.deepEqual(camoPatternTags('sig_t90ms'), ['ru', 'desert', 'geometric', 'signature', 'special']);
assert.deepEqual(camoPatternTags('sig_merkava3c'), ['il', 'desert', 'digital', 'signature', 'special']);
assert.equal(camoNationTag(null), null);
assert.equal(camoNationTag('Atlantis'), null);
assert.deepEqual(camoPatternTags(null), []);
assert.deepEqual(camoPatternTags('not-a-pattern'), []);
assert.deepEqual(camoPatternTags('factory', 'Atlantis'), ['factory']);
assert.equal(camoMatchesTag('merdc', 'France', 'usa'), true,
  'historical national association remains independent of selected tank');
assert.equal(camoMatchesTag('digitaldesert', 'USA', 'desert'), true);
assert.equal(camoMatchesTag('digitaldesert', 'USA', 'winter'), false);
assert.equal(camoMatchesTag('unknown', 'USA', 'all'), true,
  'All remains the non-destructive catalog view');
assert.equal(hasSignatureCamo('abramsx'), true);
assert.equal(hasSignatureCamo('m1a2'), false);
assert.equal(hasSignatureCamo(null), false);
assert.equal(signatureCamoPatternId('m1a2'), null);
assert.equal(signatureCamoPatternId('marder1a3'), null,
  'a service-preset source does not accidentally become a Signature default');
assert.equal(signatureCamoPatternId(null), null);
assert.equal(defaultCamoPatternId(null), 'factory');

const custom = normalizeCustomCamo({
  style: 'digital', base: '#123456', colorA: '#abcdef', colorB: '#010203', repeat: 75,
});
assert.deepEqual(custom, {
  style: 'digital', base: '#123456', colorA: '#abcdef', colorB: '#010203', repeat: 75,
  repeatX: 3, repeatY: 2, rotation: 0, mirror: true, strokes: [],
});
const encoded = customCamoPatternId(custom);
assert.equal(encoded, 'custom~digital~123456~abcdef~010203~75');
assert.deepEqual(parseCustomCamoPatternId(encoded), custom,
  'custom cache key round-trips every painter input');
const drawn = normalizeCustomCamo({
  style: 'drawn', base: '#123456', colorA: '#abcdef', colorB: '#010203',
  repeatX: 5, repeatY: 3, rotation: -45, mirror: false,
  strokes: [
    { color: 0, size: 12, brush: 'spray', points: [[4, 8], [37, 44], [91, 72]] },
    { color: 1, size: 6, brush: 'eraser', points: [[18, 90]] },
    { color: 1, size: 18, brush: 'stamp', asset: 'chevron', rotation: 30, points: [[50, 50]] },
  ],
});
const expectedDrawn = {
  style: 'drawn', base: '#123456', colorA: '#abcdef', colorB: '#010203', repeat: 55,
  repeatX: 5, repeatY: 3, rotation: -45, mirror: false,
  strokes: [
    { color: 0, size: 12, brush: 'spray', asset: 'star', rotation: 0, points: [[4, 8], [37, 44], [91, 72]] },
    { color: 1, size: 6, brush: 'eraser', asset: 'star', rotation: 0, points: [[18, 90]] },
    { color: 1, size: 18, brush: 'stamp', asset: 'chevron', rotation: 30, points: [[50, 50]] },
  ],
};
assert.deepEqual(drawn, expectedDrawn);
const encodedDrawn = 'custom3~123456~abcdef~010203~5~3~-45~0~' +
  '0,12,spray,star,0,4.8_37.44_91.72;1,6,eraser,star,0,18.90;' +
  '1,18,stamp,chevron,30,50.50';
assert.equal(customCamoPatternId(drawn), encodedDrawn);
assert.deepEqual(parseCustomCamoPatternId(encodedDrawn), expectedDrawn,
  'drawn vector tiles decode to an independent expected recipe');
assert.deepEqual(
  parseCustomCamoPatternId(encodedDrawn.replace('123456~abcdef~010203', '123456~ABCDEF~010203')),
  expectedDrawn,
  'encoded hexadecimal colors normalize to lowercase',
);
assert.deepEqual(normalizeCustomCamo(null), {
  style: 'drawn', base: '#46513d', colorA: '#252a24', colorB: '#73563a', repeat: 55,
  repeatX: 3, repeatY: 2, rotation: 0, mirror: true, strokes: [],
});
assert.deepEqual(normalizeCustomCamo({
  strokes: [null, {}, { points: [null] }, { points: [] }],
}).strokes, []);
assert.deepEqual(normalizeCustomCamo('not-an-object'), normalizeCustomCamo());
assert.deepEqual(normalizeCustomCamo({
  base: '#112233', colorA: '#445566', colorB: '#778899', mirror: false,
  strokes: [
    { color: 0, size: 4, brush: 'flat', asset: 'leaf', rotation: -12, points: [[0, 100]] },
    { color: 1, size: 9, brush: 'invalid', asset: 'invalid', rotation: 15, points: [[25, 75]] },
  ],
}), {
  style: 'drawn', base: '#112233', colorA: '#445566', colorB: '#778899', repeat: 55,
  repeatX: 3, repeatY: 2, rotation: 0, mirror: false,
  strokes: [
    { color: 0, size: 4, brush: 'flat', asset: 'leaf', rotation: -12, points: [[0, 100]] },
    { color: 1, size: 9, brush: 'round', asset: 'star', rotation: 15, points: [[25, 75]] },
  ],
});
for (const base of ['x#123456', '#123456x', '#1', '#zzzzzz']) {
  assert.equal(normalizeCustomCamo({ base }).base, '#46513d', `${base} is not an exact six-digit hex color`);
}
const overlongPoints = Array.from({ length: 97 }, (_, index) => [index % 101, index % 101]);
const overlongStrokes = Array.from({ length: 97 }, () => ({ points: [[50, 50]] }));
assert.equal(normalizeCustomCamo({ strokes: [{ points: overlongPoints }] }).strokes[0].points.length, 96);
assert.equal(normalizeCustomCamo({ strokes: overlongStrokes }).strokes.length, 96);
const mirroredDrawn = customCamoPatternId(normalizeCustomCamo());
assert.equal(mirroredDrawn.includes('~1~'), true, 'default drawn paint records mirroring');
assert.deepEqual(parseCustomCamoPatternId('custom3~123456~abcdef~010203~2~3~0~1~'), {
  style: 'drawn', base: '#123456', colorA: '#abcdef', colorB: '#010203', repeat: 55,
  repeatX: 2, repeatY: 3, rotation: 0, mirror: true, strokes: [],
});
assert.deepEqual(
  parseCustomCamoPatternId('custom3~123456~abcdef~010203~2~3~0~1~0,8,round,star,0,_10.20__30.40_')?.strokes[0].points,
  [[10, 20], [30, 40]],
  'empty point separators do not create synthetic brush points',
);
assert.equal(parseCustomCamoPatternId(`prefix-${encodedDrawn}`), null);
assert.deepEqual(parseCustomCamoPatternId(
  'custom2~123456~abcdef~010203~2~3~0~1~0,8,10.20_30.40',
), {
  style: 'drawn', base: '#123456', colorA: '#abcdef', colorB: '#010203', repeat: 55,
  repeatX: 2, repeatY: 3, rotation: 0, mirror: true,
  strokes: [{
    color: 0, size: 8, brush: 'round', asset: 'star', rotation: 0,
    points: [[10, 20], [30, 40]],
  }],
}, 'legacy custom2 recipes upgrade to the round brush');
assert.equal(parseCustomCamoPatternId(
  'prefix-custom2~123456~abcdef~010203~2~3~0~1~0,8,10.20_30.40',
), null);
assert.equal(parseCustomCamoPatternId(
  'custom2~123456~abcdef~010203~2~3~0~1~0,8,_10.20__30.40_',
)?.strokes[0].points.length, 2);
assert.deepEqual(parseCustomCamoPatternId(
  'custom2~ABCDEF~FEDCBA~123ABC~2~3~-45~0~1,8,10.20_30.40',
), {
  style: 'drawn', base: '#abcdef', colorA: '#fedcba', colorB: '#123abc', repeat: 55,
  repeatX: 2, repeatY: 3, rotation: -45, mirror: false,
  strokes: [{
    color: 1, size: 8, brush: 'round', asset: 'star', rotation: 0,
    points: [[10, 20], [30, 40]],
  }],
});
assert.deepEqual(parseCustomCamoPatternId('custom2~123456~abcdef~010203~2~3~0~1~')?.strokes, []);
assert.deepEqual(parseCustomCamoPatternId('custom~digital~ABCDEF~FEDCBA~123ABC~75'), {
  style: 'digital', base: '#abcdef', colorA: '#fedcba', colorB: '#123abc', repeat: 75,
  repeatX: 3, repeatY: 2, rotation: 0, mirror: true, strokes: [],
});
assert.equal(parseCustomCamoPatternId('prefix-custom~digital~123456~abcdef~010203~75'), null);
assert.equal(parseCustomCamoPatternId('custom~digital~123456~abcdef~010203~75-suffix'), null);
assert.equal(parseCustomCamoPatternId(null), null);
assert.equal(parseCustomCamoPatternId('custom~invalid'), null);
assert.deepEqual(normalizeCustomCamo({ style: 'bad', base: 'red', repeat: 999 }), {
  style: 'drawn', base: '#46513d', colorA: '#252a24', colorB: '#73563a', repeat: 100,
  repeatX: 3, repeatY: 2, rotation: 0, mirror: true, strokes: [],
});

const nations = [
  null, 'USA', 'Germany', 'Russia', 'USSR', 'USSR/Russia', 'UK', 'France',
  'China', 'Italy', 'Japan', 'Poland', 'South Korea', 'Sweden', 'Israel',
  'Ukraine', 'Atlantis',
];
const eras = [null, 'interwar', 'ww2', 'cold-war', 'modern'];
const catalogContract = {
  brushes: CUSTOM_CAMO_BRUSHES,
  assets: CUSTOM_CAMO_ASSETS,
  customId: CUSTOM_CAMO_ID,
  styles: CUSTOM_CAMO_STYLES,
  patterns: CAMO_PATTERN_IDS,
  catalog: CAMO_CATALOG_PATTERN_IDS,
  patternLabels: CAMO_PATTERN_LABEL,
  tagIds: CAMO_TAG_IDS,
  tagLabels: CAMO_TAG_LABEL,
  presets: SHARED_CAMO_PRESETS,
  factory: FACTORY_CAMO_PATTERN_BY_NATION,
  signatures: SIGNATURE_CAMO_TANK_IDS,
  tagsByPatternAndNation: CAMO_PATTERN_IDS.flatMap((patternId) => (
    nations.map((nation) => [patternId, nation, camoPatternTags(patternId, nation)])
  )),
  factoryByNationAndEra: nations.flatMap((nation) => (
    eras.map((era) => [nation, era, factoryCamoPatternIdFor(nation, era)])
  )),
  defaultCustom: normalizeCustomCamo(),
};
assert.equal(
  createHash('sha256').update(JSON.stringify(catalogContract)).digest('hex'),
  '3e4c8d4a617a9b21823e2fb06a92ed7e11e8df9b3985f5d1db589c413b34791c',
  'camouflage ids, labels, palettes and national/era routing change only through an intentional contract update',
);

console.log('camoPolicy.selftest: network boundary and custom pattern codec passed');

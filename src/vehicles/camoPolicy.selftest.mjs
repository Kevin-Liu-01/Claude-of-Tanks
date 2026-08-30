import assert from 'node:assert/strict';
import {
  CAMO_CATALOG_PATTERN_IDS,
  CAMO_PATTERN_IDS,
  CAMO_PATTERN_LABEL,
  CAMO_TAG_IDS,
  CAMO_TAG_LABEL,
  CUSTOM_CAMO_ID,
  FACTORY_CAMO_PATTERN_BY_NATION,
  SHARED_CAMO_PRESETS,
  SIGNATURE_CAMO_TANK_IDS,
  camoMatchesTag,
  camoPatternTags,
  customCamoPatternId,
  defaultCamoPatternId,
  factoryCamoPatternIdFor,
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
assert.equal(FACTORY_CAMO_PATTERN_BY_NATION.France, 'service_leclerc_xlr');

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
assert.equal(camoMatchesTag('merdc', 'France', 'usa'), true,
  'historical national association remains independent of selected tank');
assert.equal(camoMatchesTag('digitaldesert', 'USA', 'desert'), true);
assert.equal(camoMatchesTag('digitaldesert', 'USA', 'winter'), false);
assert.equal(camoMatchesTag('unknown', 'USA', 'all'), true,
  'All remains the non-destructive catalog view');

const custom = normalizeCustomCamo({
  style: 'digital', base: '#123456', colorA: '#abcdef', colorB: '#010203', repeat: 75,
});
const encoded = customCamoPatternId(custom);
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
assert.deepEqual(parseCustomCamoPatternId(customCamoPatternId(drawn)), drawn,
  'drawn vector tiles round-trip every repeat and brush input');
assert.equal(parseCustomCamoPatternId(
  'custom2~123456~abcdef~010203~2~3~0~1~0,8,10.20_30.40',
)?.strokes[0].brush, 'round', 'legacy custom2 recipes upgrade to the round brush');
assert.equal(parseCustomCamoPatternId('custom~invalid'), null);
assert.deepEqual(normalizeCustomCamo({ style: 'bad', base: 'red', repeat: 999 }), {
  style: 'drawn', base: '#46513d', colorA: '#252a24', colorB: '#73563a', repeat: 100,
  repeatX: 3, repeatY: 2, rotation: 0, mirror: true, strokes: [],
});

console.log('camoPolicy.selftest: network boundary and custom pattern codec passed');

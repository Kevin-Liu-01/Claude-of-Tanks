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
  stockCamoPatternIdFor, camoInCollection, camoCollectionFor, CAMO_COUNTRY_TAG_IDS,
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
assert.equal(defaultCamoPatternId('abramsx'), 'factory');
assert.equal(stockCamoPatternIdFor('abramsx'), 'sig_abramsx');
assert.equal(defaultCamoPatternId('t90'), 'factory');
assert.equal(stockCamoPatternIdFor('t90'), 'sig_t90');
assert.equal(defaultCamoPatternId('t90sm'), 'factory');
assert.equal(stockCamoPatternIdFor('t90sm'), 'sig_t90sm');
assert.equal(defaultCamoPatternId('t90ms'), 'factory');
assert.equal(stockCamoPatternIdFor('t90ms'), 'sig_t90ms');
assert.equal(defaultCamoPatternId('m1a2'), 'factory');
for (const id of ['m46_patton', 'm47_patton', 'm48', 'm2a2_bradley']) {
  assert.equal(defaultCamoPatternId(id), 'factory');
  assert.equal(stockCamoPatternIdFor(id), 'summer', `${id} should initially wear Summer camouflage`);
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
assert.equal(FACTORY_CAMO_PATTERN_BY_NATION.USA, 'service_usa_desert', "round 32: Factory is the nation's service pattern again");
assert.equal(FACTORY_CAMO_PATTERN_BY_NATION.Germany, 'service_leo2a6m');
assert.equal(FACTORY_CAMO_PATTERN_BY_NATION.Russia, 'service_t90m');
assert.equal(factoryCamoPatternIdFor('USSR', 'ww2'), 'service_soviet_ww2', 'Soviet wartime hulls wear the wartime service scheme');
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
// The new signature appends one network ID; every preceding catalog byte stays fixed.
assert.equal(CAMO_PATTERN_IDS[CAMO_PATTERN_IDS.indexOf('national_usa') - 1], 'sig_tos1a_tagil'); // round 31: the base list ends here; national colours and generated paints follow
assert.equal(defaultCamoPatternId('tos1a_tagil'), 'factory');
assert.equal(stockCamoPatternIdFor('tos1a_tagil'), 'sig_tos1a_tagil');
assert.equal(CAMO_PATTERN_LABEL.sig_tos1a_tagil, 'TOS-1A Steppe Bands');
const precedingCatalog = structuredClone(catalogContract);
// The owner renamed this vehicle without changing its saved paint ID or recipe.
assert.equal(CAMO_PATTERN_LABEL.service_strv122, 'Strv 121 Splinter');
precedingCatalog.patternLabels.service_strv122 = 'Strv 122 Splinter';
// The new American concept adds exactly one authored paint. Validate its
// complete recipe, then retain the earlier catalog hashes unchanged.
// round 32: authored paints are named for nation and pattern, never a vehicle (the Griffin's tri-tone is a second US
// Army three-tone coat beside the Abrams family's)
assert.equal(CAMO_PATTERN_LABEL.paint_griffin_viper, 'US Army Three-Tone Woodland II');
assert.equal(networkCamoId('paint_griffin_viper'), 'paint_griffin_viper');
assert.equal(defaultCamoPatternId('griffin_viper'), 'factory');
assert.equal(hasSignatureCamo('griffin_viper'), false);
assert.deepEqual(sharedCamoPreset('paint_griffin_viper'), {
  id: 'paint_griffin_viper', sourceTankId: 'griffin_viper',
  tags: ['usa', 'woodland', 'organic', 'signature'],
  visual: { scheme: 'nato', base: '#555d42', weather: '#777864',
    patches: ['#343a32', '#827756'], camoScale: .5 },
});
precedingCatalog.patterns = precedingCatalog.patterns.filter(id => id !== 'paint_griffin_viper');
precedingCatalog.catalog = precedingCatalog.catalog.filter(id => id !== 'paint_griffin_viper');
delete precedingCatalog.patternLabels.paint_griffin_viper;
precedingCatalog.presets = precedingCatalog.presets.filter(row => row.id !== 'paint_griffin_viper');
precedingCatalog.tagsByPatternAndNation = precedingCatalog.tagsByPatternAndNation.filter(([id]) => id !== 'paint_griffin_viper');
precedingCatalog.patterns = precedingCatalog.patterns.filter(id => id !== 'sig_tos1a_tagil');
precedingCatalog.catalog = precedingCatalog.catalog.filter(id => id !== 'sig_tos1a_tagil');
delete precedingCatalog.patternLabels.sig_tos1a_tagil;
precedingCatalog.presets = precedingCatalog.presets.filter(row => row.id !== 'sig_tos1a_tagil');
precedingCatalog.signatures = precedingCatalog.signatures.filter(id => id !== 'tos1a_tagil');
precedingCatalog.tagsByPatternAndNation = precedingCatalog.tagsByPatternAndNation.filter(([id]) => id !== 'sig_tos1a_tagil');
// Preserve the preceding full catalog receipt after reversing only the earlier
// four appended paints, Sabra default, and three corrected brand labels.
const addedPaints = ['mono', 'carbon', 'prism', 'sig_sabra_mk2_x'];
// round 31: the national colours and the generated authored paints append after the base catalog, so these four
// close the BASE list (the TOS-1A signature now follows them there) rather than the whole one
const basePreceding = precedingCatalog.patterns.filter((id) => !id.startsWith('national_') && !id.startsWith('paint_'));
assert.deepEqual(basePreceding.slice(-4), addedPaints);
assert.equal(CAMO_PATTERN_IDS[CAMO_PATTERN_IDS.indexOf('sig_tos1a_tagil') + 1], 'national_usa', 'the national colours follow the base catalog');
assert.ok(CAMO_PATTERN_IDS.at(-1).startsWith('paint_'), 'the generated authored paints close the catalog');
assert.deepEqual(addedPaints.slice(0, 3).map(id => CAMO_PATTERN_LABEL[id]), ['Mono', 'Carbon', 'Prism']);
assert.deepEqual(['openai', 'xai', 'gemini'].map(id => CAMO_PATTERN_LABEL[id]), ['OpenAI', 'X', 'Gemini']);
assert.equal(defaultCamoPatternId('sabra_mk2_x'), 'factory');
assert.equal(stockCamoPatternIdFor('sabra_mk2_x'), 'sig_sabra_mk2_x');
const historicalCatalog = structuredClone(precedingCatalog);
historicalCatalog.patterns = historicalCatalog.patterns.filter(id => !addedPaints.includes(id));
historicalCatalog.catalog = historicalCatalog.catalog.filter(id => !addedPaints.includes(id));
for (const id of addedPaints) delete historicalCatalog.patternLabels[id];
Object.assign(historicalCatalog.patternLabels, { openai: 'OpenAI Mono', xai: 'xAI Carbon', gemini: 'Gemini Prism' });
historicalCatalog.presets = historicalCatalog.presets.filter(row => row.id !== 'sig_sabra_mk2_x');
historicalCatalog.signatures = historicalCatalog.signatures.filter(id => id !== 'sabra_mk2_x');
historicalCatalog.tagsByPatternAndNation = historicalCatalog.tagsByPatternAndNation.filter(([id]) => !addedPaints.includes(id));
assert.equal(createHash('sha256').update(JSON.stringify(historicalCatalog)).digest('hex'),
// round 32 (2026-09-21): digest re-based — Factory = national service pattern again, deduplicated authored paints
// round 46 (2026-09-23): digest re-based — the hidden fleet retired: sig_merkava4 (unregistered Mk 4 donor) and the
// six generated paints whose lead hulls left (paint_tiger1, paint_panther_g, paint_sturmtiger, paint_t95,
// paint_isu122s, paint_m26_pershing) are no longer catalog entries
  'b0c1da0b18bdbfc65a9a240b9f023d4559884ed73792dafc0a9d2b1740044ab0',
  'all other catalog fields, order, recipes, tags and national routing remain exact');
assert.equal(
  createHash('sha256').update(JSON.stringify(precedingCatalog)).digest('hex'),
  // round 32 (2026-09-21): digest re-based — Factory = national service pattern again, deduplicated authored paints
  // round 46 (2026-09-23): digest re-based — hidden fleet retired (see the historical digest note above)
  'ff60bcb3ca8e0e53c767ad0de9b0061a74b3e33462157f7d3b308c56b007af3c', // September 20 official marks, independent prints, Sabra default.
  'camouflage ids, labels, palettes and national/era routing change only through an intentional contract update',
);

console.log('camoPolicy.selftest: network boundary and custom pattern codec passed');

// Every selectable finish stays reachable. Flags contain shared fleet recipes,
// not generic seasonal art that happened to carry a historical country tag.
for (const id of CAMO_CATALOG_PATTERN_IDS) {
  assert.ok(camoInCollection(id, 'default') || CAMO_COUNTRY_TAG_IDS.some(n => camoInCollection(id, n)), id);
  assert.ok(camoInCollection(id, camoCollectionFor(id)), `${id}: saved selection opens its collection`);
}
assert.equal(camoInCollection('factory', 'default'), true);
assert.equal(camoInCollection('service_t90m', 'default'), true);
assert.equal(camoInCollection('sig_merkava3d_x', 'default'), false);
assert.equal(camoInCollection('sig_merkava3d_x', 'il'), true);
assert.equal(camoInCollection('sig_merkava3d_x', 'usa'), false);
assert.equal(camoInCollection('summer', 'usa'), false);
assert.equal(camoInCollection('normandy44', 'usa'), false);

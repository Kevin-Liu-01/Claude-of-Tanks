import assert from 'node:assert/strict';
import {
  CAMO_PATTERN_IDS,
  CAMO_TAG_IDS,
  CAMO_TAG_LABEL,
  CUSTOM_CAMO_ID,
  SIGNATURE_CAMO_TANK_IDS,
  camoMatchesTag,
  camoPatternTags,
  customCamoPatternId,
  defaultCamoPatternId,
  isBuiltInCamoId,
  networkCamoId,
  normalizeCustomCamo,
  parseCustomCamoPatternId,
} from './camoPolicy.ts';

assert.equal(isBuiltInCamoId('summer'), true);
assert.equal(isBuiltInCamoId(CUSTOM_CAMO_ID), false,
  'custom paint is never accepted as public match metadata');
assert.equal(networkCamoId(CUSTOM_CAMO_ID), 'factory');
assert.equal(networkCamoId('unknown'), 'factory');
assert.equal(networkCamoId(CAMO_PATTERN_IDS.at(-1)), CAMO_PATTERN_IDS.at(-1));
assert.equal(isBuiltInCamoId('signature'), true,
  'first-party vehicle Signature finishes are match-safe built-ins');
assert.equal(defaultCamoPatternId('abramsx'), 'signature');
assert.equal(defaultCamoPatternId('m1a2'), 'factory');
assert.ok(SIGNATURE_CAMO_TANK_IDS.length >= 45,
  'the requested personality fleet must remain explicit and substantial');

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

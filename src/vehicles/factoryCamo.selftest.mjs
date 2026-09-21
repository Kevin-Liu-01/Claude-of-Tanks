import assert from 'node:assert/strict';
import './tankFactory.ts';
import { ALL_TANK_IDS, SAVED_TANK_IDS, DEVELOPMENT_TANK_IDS, PRODUCTION_TANK_IDS, getSpec } from './specs.ts';
import {
  CAMO_CATALOG_PATTERN_IDS,
  CAMO_PATTERN_IDS,
  FACTORY_CAMO_PATTERN_BY_NATION,
  NATIONAL_CAMO_PATTERN_IDS,
  SHARED_CAMO_PRESETS,
  SIGNATURE_CAMO_TANK_IDS,
  camoMatchesTag,
  camoNationTag,
  camoPatternTags,
  defaultCamoPatternId,
  factoryCamoPatternIdFor,
  hasSignatureCamo,
  sharedCamoPreset,
  signatureCamoPatternId,
} from './camoPolicy.ts';
import { getCamoSelection, resolveCamoVisual } from './materials.ts';

// Round 31 (owner 2026-09-20): "make our tank specific camos into their own camos ... then make factory camos be
// their tank specific camos, but then add national color schemes that are just the monocolor ones". Factory is the
// vehicle's own authored paint; the national colours are plain single-colour schemes, one per nation; the authored
// paints (authoredPaintCatalog.ts) make every distinct fleet recipe selectable on any hull.

// a plain coat carries no pattern knobs, so solids compare by colour alone (the generator normalises them the same way)
const paletteKey = (visual) => JSON.stringify(visual.scheme === 'solid'
  ? ['solid', visual.base, visual.weather]
  : [visual.scheme, visual.base, visual.weather, visual.patches || [], visual.camoScale]);
const nationKey = (nation) => (
  nation === 'USSR' || nation === 'USSR/Russia' || nation === 'Russia' ? 'Russia' : nation
);

// --- Factory = the authored paint, for every tank in the fleet
let checked = 0;
for (const id of ALL_TANK_IDS) {
  const spec = getSpec(id);
  const authored = spec.visual;
  if (!authored?.base) continue;
  const resolved = resolveCamoVisual(spec, 'factory');
  assert.equal(paletteKey(resolved), paletteKey(authored), `${id}: Factory is the vehicle's own authored paint`);
  checked += 1;
}
assert.ok(checked >= 190, `the whole fleet resolves Factory (${checked})`);

// --- national colour schemes: one plain colour per nation, selectable, tagged factory + nation
assert.equal(NATIONAL_CAMO_PATTERN_IDS.length, 13);
for (const [nation, patternId] of Object.entries(FACTORY_CAMO_PATTERN_BY_NATION)) {
  assert.ok(NATIONAL_CAMO_PATTERN_IDS.includes(patternId), `${nation}: the national scheme is a national_* id`);
  const preset = sharedCamoPreset(patternId);
  assert.ok(preset, `${nation}: the national colour is a shared preset`);
  assert.equal(preset.visual.scheme, 'solid', `${nation}: the national colour is monocolor`);
  assert.equal(preset.visual.patches.length, 0);
  assert.ok(preset.tags.includes('factory') && preset.tags.includes(camoNationTag(nation)), `${nation}: tagged factory + nation`);
  assert.ok(CAMO_CATALOG_PATTERN_IDS.includes(patternId), `${nation}: the national colour is in the player catalog`);
  assert.equal(factoryCamoPatternIdFor(nation, 'modern'), patternId);
  const onAbrams = resolveCamoVisual(getSpec('m1a2'), patternId);
  assert.equal(onAbrams.scheme, 'solid'); assert.equal(onAbrams.base, preset.visual.base, `${nation}: any hull wears the national colour`);
}
for (const [nation, era] of [['USSR', 'ww2'], ['USSR/Russia', 'cold-war'], ['Russia', 'modern']]) {
  assert.equal(factoryCamoPatternIdFor(nation, era), 'national_ru', `${nation}/${era}: Soviet-era hulls share the Russian colour`);
}
assert.equal(factoryCamoPatternIdFor(null, 'modern'), null);
assert.equal(factoryCamoPatternIdFor('Atlantis', 'modern'), null);
// the patterned national service coats stay selectable (they just no longer stand in for Factory)
for (const id of ['service_usa_desert', 'service_t90m', 'service_soviet_ww2', 'service_soviet_coldwar', 'service_merkava2d']) {
  assert.ok(CAMO_CATALOG_PATTERN_IDS.includes(id), `${id} stays in the catalog`);
}

// --- every distinct authored recipe is selectable on every hull: as a Signature/Service preset or an authored paint
const presetKeys = new Set(SHARED_CAMO_PRESETS.map((preset) => paletteKey(preset.visual)));
let paints = 0;
for (const id of ALL_TANK_IDS) {
  const spec = getSpec(id); const authored = spec.visual;
  if (!authored?.base) continue;
  const key = paletteKey(resolveCamoVisual(spec, 'factory'));
  assert.ok(presetKeys.has(key), `${id}: the authored paint is a selectable preset for every hull`);
}
for (const patternId of CAMO_PATTERN_IDS) {
  if (!patternId.startsWith('paint_')) continue;
  paints += 1;
  const preset = sharedCamoPreset(patternId);
  assert.ok(preset && preset.sourceTankId && ALL_TANK_IDS.includes(preset.sourceTankId), `${patternId}: named after a fleet vehicle`);
  assert.ok(preset.tags.includes('signature'), `${patternId}: filed under Signature`);
  assert.ok(camoPatternTags(patternId).length >= 3, `${patternId}: nation, environment and construction tags`);
  const sourceVisual = getSpec(preset.sourceTankId).visual;
  assert.equal(paletteKey(preset.visual), paletteKey(sourceVisual), `${patternId}: carries its lead vehicle's exact recipe`);
  assert.equal(paletteKey(resolveCamoVisual(getSpec('m1a2'), patternId)), paletteKey(resolveCamoVisual(getSpec('t90m'), patternId)),
    `${patternId}: renders identically on hulls from different nations`);
}
assert.ok(paints >= 40, `the authored paint catalog covers the fleet (${paints} entries)`);
// identical authored paints were combined: no paint_* entry repeats any other preset's recipe (two legacy
// service/signature pairs and the IDF grey predate this round and are left as they are)
{
  const byRecipe = new Map();
  for (const preset of SHARED_CAMO_PRESETS) {
    const key = paletteKey(preset.visual);
    if (!byRecipe.has(key)) byRecipe.set(key, []);
    byRecipe.get(key).push(preset.id);
  }
  for (const [, ids] of byRecipe) {
    if (ids.length < 2) continue;
    assert.ok(!ids.some((id) => id.startsWith('paint_')), `authored paints never repeat a named recipe: ${ids.join(', ')}`);
  }
  const nationals = SHARED_CAMO_PRESETS.filter((preset) => preset.id.startsWith('national_'));
  assert.equal(new Set(nationals.map((preset) => preset.visual.base)).size, nationals.length, 'every nation has its own colour');
}

// --- Signature defaults are unchanged
assert.deepEqual(SIGNATURE_CAMO_TANK_IDS.filter(id => !ALL_TANK_IDS.includes(id)), ['merkava4'],
  'The saved Mk4 is the only explicitly approved non-release Signature owner');
assert.ok(SAVED_TANK_IDS.includes('merkava4') && DEVELOPMENT_TANK_IDS.includes('merkava4'));
assert.equal(PRODUCTION_TANK_IDS.includes('merkava4'), false);
for (const id of SIGNATURE_CAMO_TANK_IDS) {
  if (id !== 'merkava4') assert.ok(ALL_TANK_IDS.includes(id), `${id} Signature entry must name a release tank`);
  assert.equal(hasSignatureCamo(id), true);
  const signaturePatternId = signatureCamoPatternId(id);
  assert.ok(signaturePatternId, `${id} must own a named reusable Signature finish`);
  assert.equal(defaultCamoPatternId(id), signaturePatternId, `${id} must initially wear its named Signature finish`);
  const signature = resolveCamoVisual(getSpec(id), signaturePatternId);
  assert.notEqual(signature.scheme, 'solid', `${id} Signature must be a real patterned finish`);
  assert.ok((signature.patches || []).length >= 2, `${id} Signature must retain a multi-tone pattern palette`);
}
const requestedIsraeliDefaults = [
  'merkava2d', 'merkava3d_x', 'merkava4', 'merkava4_x', 'merkava4_trophy', 'merkava4_barak', 'namer_ifv', 'sabra_mk2_x',
];
for (const id of requestedIsraeliDefaults) {
  assert.ok(SIGNATURE_CAMO_TANK_IDS.includes(id), `${id} must retain its requested Signature entry`);
  assert.equal(defaultCamoPatternId(id), `sig_${id}`, `${id} owns its distinct requested default`);
  assert.equal(getCamoSelection(id), `sig_${id}`, `${id} initially presents its default when unset`);
}
const russianDigitalSignatures = ['bmpt_t90', 't90sm', 't90a_burlak', 't90m', 't90m_proryv', 't90a', 't90a_vladimir'];
for (const id of russianDigitalSignatures) {
  const patternId = signatureCamoPatternId(id);
  assert.equal(resolveCamoVisual(getSpec(id), patternId).scheme, 'digital', `${id} keeps its Russian digital Signature`);
}
assert.equal(resolveCamoVisual(getSpec('t90'), defaultCamoPatternId('t90')).scheme, 'stripes');
assert.equal(resolveCamoVisual(getSpec('t90ms'), defaultCamoPatternId('t90ms')).scheme, 'desert');

// --- the Special catalog audit: every special pattern is multi-tone (national colours and authored paints are not special)
const specialPatternIds = CAMO_CATALOG_PATTERN_IDS.filter((patternId) => camoMatchesTag(patternId, 'USA', 'special'));
assert.ok(specialPatternIds.length >= 59, 'the complete named Signature and novelty Special catalog is audited');
for (const patternId of specialPatternIds) {
  const visual = resolveCamoVisual(getSpec('m1a2'), patternId);
  assert.notEqual(visual.scheme, 'solid', `${patternId} Special camo must not resolve to a flat one-color finish`);
  assert.ok((visual.patches || []).length >= 2, `${patternId} Special camo must expose a multi-tone pattern palette`);
}
for (const patternId of NATIONAL_CAMO_PATTERN_IDS) assert.ok(!specialPatternIds.includes(patternId), `${patternId} is a national colour, not a novelty`);

const abramsXOnAbrams = resolveCamoVisual(getSpec('m1a2'), 'sig_abramsx');
const abramsXOnT90 = resolveCamoVisual(getSpec('t90m'), 'sig_abramsx');
assert.equal(paletteKey(abramsXOnAbrams), paletteKey(abramsXOnT90), 'a named vehicle colorway renders identically on tanks from different nations');

// --- selection defaults and persistence
assert.equal(defaultCamoPatternId('m1a2'), 'factory');
for (const id of ['m46_patton', 'm47_patton', 'm48', 'm2a2_bradley']) {
  assert.equal(defaultCamoPatternId(id), 'summer', `${id} must initially select Summer`);
  assert.equal(getCamoSelection(id), 'summer');
  assert.equal(resolveCamoVisual(getSpec(id), 'summer').scheme, 'nato');
}
assert.equal(getCamoSelection('abramsx'), 'sig_abramsx');
assert.equal(getCamoSelection('m1a2'), 'factory');
const previousLocalStorage = globalThis.localStorage;
globalThis.localStorage = {
  getItem: (key) => {
    if (key === 'cot.camo.abramsx') return 'factory';
    if (key === 'cot.camo.m551_sheridan') return 'signature';
    if (requestedIsraeliDefaults.some(id => key === `cot.camo.${id}`)) return 'factory';
    return null;
  },
  setItem: () => {},
};
try {
  assert.equal(getCamoSelection('abramsx'), 'factory', 'an explicit player Factory selection must override the Signature default');
  assert.equal(getCamoSelection('m551_sheridan'), 'sig_m551_sheridan', 'the legacy tank-relative Signature id migrates to its named reusable preset');
  for (const id of requestedIsraeliDefaults) assert.equal(getCamoSelection(id), 'factory');
  for (const pattern of ['factory', 'winter', 'suits', 'openai', 'xai', 'gemini', 'mono', 'carbon', 'prism', 'national_il', 'paint_leo2a5']) {
    globalThis.localStorage.getItem = key => key === 'cot.camo.sabra_mk2_x' ? pattern : null;
    assert.equal(getCamoSelection('sabra_mk2_x'), pattern, `Sabra's default does not replace an explicit saved ${pattern} choice`);
  }
  globalThis.localStorage.getItem = key => key === 'cot.camo.sabra_mk2_x' ? 'custom' : key === 'cot.camoCustom.v1.sabra_mk2_x' ? '{}' : null;
  assert.equal(getCamoSelection('sabra_mk2_x'), 'custom', 'Sabra preserves device-local custom paint');
} finally {
  if (previousLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousLocalStorage;
}

console.log(`factoryCamo.selftest: Factory is the authored paint on ${checked} hulls, ${NATIONAL_CAMO_PATTERN_IDS.length} national colours, ${paints} authored paints, ${SIGNATURE_CAMO_TANK_IDS.length} Signature defaults`);

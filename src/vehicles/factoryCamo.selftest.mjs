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
  CAMO_PATTERN_LABEL,
  camoPatternTags,
  defaultCamoPatternId,
  factoryCamoPatternIdFor,
  stockCamoPatternIdFor,
  hasSignatureCamo,
  sharedCamoPreset,
  signatureCamoPatternId,
} from './camoPolicy.ts';
import { getCamoSelection, resolveCamoVisual, hasCamoPaint, setCamoBiome } from './materials.ts';
import { tankDisplayName } from './tankLabels.ts';

// Factory is the stock recipe, including the fleet’s named and era-specific defaults.
// a plain coat carries no pattern knobs, so solids compare by colour alone (the generator normalises them the same way)
const paletteKey = (visual) => JSON.stringify(visual.scheme === 'solid'
  ? ['solid', visual.base, visual.weather]
  : [visual.scheme, visual.base, visual.weather, visual.patches || [], visual.camoScale]);
// the generator folds coats within one shade (14/255 per channel) into one paint
const COLOUR_TOLERANCE = 14;
const rgb = (hex) => { const n = parseInt(String(hex).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const sameShade = (a, b) => rgb(a).every((c, i) => Math.abs(c - rgb(b)[i]) <= COLOUR_TOLERANCE);
const coloursOf = (v) => [v.base, v.weather, ...((v.scheme || 'solid') === 'solid' ? [] : (v.patches || []))].map((c) => String(c).toLowerCase());
const nearRecipe = (a, b) => (a.scheme || 'solid') === (b.scheme || 'solid') && coloursOf(a).length === coloursOf(b).length
  && coloursOf(a).every((c, i) => sameShade(c, coloursOf(b)[i]));

// --- Every Factory restores stock paint, including the historical exceptions.
let checked = 0;
for (const id of ALL_TANK_IDS) {
  const spec = getSpec(id);
  if (!spec.visual?.base) continue;
  const stockId = stockCamoPatternIdFor(id, spec.nation, spec.era);
  const resolved = resolveCamoVisual(spec, 'factory');
  assert.equal(defaultCamoPatternId(id), 'factory', id);
  if (stockId) {
    assert.equal(paletteKey(resolved), paletteKey(resolveCamoVisual(spec, stockId)), `${id}: Factory preserves its stock recipe`);
    assert.equal(resolved.patternSeedId, stockId, `${id}: Factory aliases the reusable recipe's exact layout`);
  } else assert.equal(paletteKey(resolved), paletteKey(spec.visual), `${id}: unknown nation retains authored paint`);
  checked += 1;
}
assert.ok(checked >= 190, `the whole fleet resolves Factory (${checked})`);
for (const [nation, era, expected] of [
  ['USSR', 'ww2', 'service_soviet_ww2'], ['USSR', 'interwar', 'service_soviet_ww2'], ['USSR/Russia', 'cold-war', 'service_soviet_coldwar'],
  ['Russia', 'modern', 'service_t90m'], ['USA', 'modern', 'service_usa_desert'], ['USA', 'ww2', 'service_usa_desert'],
  ['Germany', 'ww2', 'service_leo2a6m'], ['Israel', 'modern', 'service_merkava2d'],
]) assert.equal(factoryCamoPatternIdFor(nation, era), expected, `${nation}/${era} Factory routing`);
assert.equal(factoryCamoPatternIdFor(null, 'modern'), null);
assert.equal(factoryCamoPatternIdFor('Atlantis', 'modern'), null);
assert.deepEqual(Object.values(FACTORY_CAMO_PATTERN_BY_NATION).filter((id) => !id.startsWith('service_')), [],
  'every national Factory routing is a Service pattern');

// --- national colour schemes: one plain colour per nation, selectable on any hull, filed under the nation (not Factory)
assert.equal(NATIONAL_CAMO_PATTERN_IDS.length, 13);
const ENVIRONMENT_TAGS = ['woodland', 'desert', 'winter', 'urban', 'tropical'];
for (const patternId of NATIONAL_CAMO_PATTERN_IDS) {
  const preset = sharedCamoPreset(patternId);
  assert.ok(preset, `${patternId}: the national colour is a shared preset`);
  assert.equal(preset.visual.scheme, 'solid', `${patternId}: the national colour is monocolor`);
  assert.equal(preset.visual.patches.length, 0);
  assert.ok(preset.tags.some((tag) => tag !== 'geometric' && !ENVIRONMENT_TAGS.includes(tag)), `${patternId}: filed under its nation`);
  assert.ok(!preset.tags.includes('factory'), `${patternId}: the plain colour is a selectable scheme, not the Factory coat`);
  assert.ok(CAMO_CATALOG_PATTERN_IDS.includes(patternId), `${patternId}: the national colour is in the player catalog`);
  const onAbrams = resolveCamoVisual(getSpec('m1a2'), patternId);
  assert.equal(onAbrams.scheme, 'solid'); assert.equal(onAbrams.base, preset.visual.base, `${patternId}: any hull wears the national colour`);
}
{
  const nationals = SHARED_CAMO_PRESETS.filter((preset) => preset.id.startsWith('national_'));
  assert.equal(new Set(nationals.map((preset) => preset.visual.base)).size, nationals.length, 'every nation has its own colour');
}
// the patterned national service coats stay selectable in the catalog as well as standing in for Factory
for (const id of ['service_usa_desert', 'service_t90m', 'service_soviet_ww2', 'service_soviet_coldwar', 'service_merkava2d']) {
  assert.ok(CAMO_CATALOG_PATTERN_IDS.includes(id), `${id} stays in the catalog`);
}

// --- every authored recipe is selectable on every hull, exactly once, under a nation + pattern name
const presetRecipes = SHARED_CAMO_PRESETS.map((preset) => preset.visual);
let paints = 0;
for (const id of ALL_TANK_IDS) {
  const spec = getSpec(id); const authored = spec.visual;
  if (!authored?.base) continue;
  assert.ok(presetRecipes.some((visual) => nearRecipe(visual, authored)), `${id}: the authored paint is a selectable preset (within one shade)`);
}
const NATION_WORDS = /^(US Army|Bundeswehr|Russian|Soviet|British|French|PLA|Italian|JGSDF|Polish|ROK|Swedish|IDF|Ukrainian|Atlantean|Wehrmacht) /;
for (const patternId of CAMO_PATTERN_IDS) {
  if (!patternId.startsWith('paint_')) continue;
  paints += 1;
  const preset = sharedCamoPreset(patternId);
  assert.ok(preset && preset.sourceTankId && ALL_TANK_IDS.includes(preset.sourceTankId), `${patternId}: led by a fleet vehicle`);
  assert.ok(preset.tags.includes('signature'), `${patternId}: filed under Signature`);
  assert.ok(camoPatternTags(patternId).length >= 3, `${patternId}: nation, environment and construction tags`);
  const label = CAMO_PATTERN_LABEL[patternId];
  assert.match(label, NATION_WORDS, `${patternId}: named for its nation and pattern (${label})`);
  assert.ok(!label.includes(tankDisplayName(getSpec(preset.sourceTankId))), `${patternId}: never named after a vehicle (${label})`);
  const sourceVisual = getSpec(preset.sourceTankId).visual;
  assert.equal(paletteKey(preset.visual), paletteKey(sourceVisual), `${patternId}: carries its lead vehicle's exact recipe`);
  assert.equal(paletteKey(resolveCamoVisual(getSpec('m1a2'), patternId)), paletteKey(resolveCamoVisual(getSpec('t90m'), patternId)),
    `${patternId}: renders identically on hulls from different nations`);
}
// 2026-09-23: 19 -> 13 entries when the six retired hidden hulls that led paints left the fleet.
assert.ok(paints >= 10 && paints <= 30, `the authored paint catalog is compact (${paints} entries)`);
// no duplicates: no paint_* repeats (or shades) any other preset's recipe, and paint labels are unique and never
// reuse another catalog label
{
  const paintPresets = SHARED_CAMO_PRESETS.filter((preset) => preset.id.startsWith('paint_'));
  for (const paint of paintPresets) {
    for (const other of SHARED_CAMO_PRESETS) {
      if (other === paint) continue;
      assert.ok(!nearRecipe(paint.visual, other.visual), `${paint.id} duplicates ${other.id}`);
    }
  }
  const paintLabels = paintPresets.map((preset) => CAMO_PATTERN_LABEL[preset.id]);
  assert.equal(new Set(paintLabels).size, paintLabels.length, 'every authored paint label is unique');
  const otherLabels = new Set(Object.entries(CAMO_PATTERN_LABEL).filter(([id]) => !id.startsWith('paint_')).map(([, label]) => label));
  for (const label of paintLabels) assert.ok(!otherLabels.has(label), `paint label "${label}" is not another catalog label`);
}

// --- Signature defaults are unchanged
assert.deepEqual(SIGNATURE_CAMO_TANK_IDS.filter(id => !ALL_TANK_IDS.includes(id)), [],
  'every Signature owner is a release tank (the saved Mk4 donor retired 2026-09-23)');
for (const id of SIGNATURE_CAMO_TANK_IDS) {
  assert.ok(ALL_TANK_IDS.includes(id), `${id} Signature entry must name a release tank`);
  assert.equal(hasSignatureCamo(id), true);
  const signaturePatternId = signatureCamoPatternId(id);
  assert.ok(signaturePatternId, `${id} must own a named reusable Signature finish`);
  assert.equal(defaultCamoPatternId(id), 'factory');
  assert.equal(stockCamoPatternIdFor(id), signaturePatternId, `${id}: named stock paint is preserved`);
  const signature = resolveCamoVisual(getSpec(id), signaturePatternId);
  assert.notEqual(signature.scheme, 'solid', `${id} Signature must be a real patterned finish`);
  assert.ok((signature.patches || []).length >= 2, `${id} Signature must retain a multi-tone pattern palette`);
}
const requestedIsraeliDefaults = [
  'merkava2d', 'merkava3d_x', 'merkava4_x', 'merkava4_trophy', 'merkava4_barak', 'namer_ifv', 'sabra_mk2_x',
];
for (const id of requestedIsraeliDefaults) {
  assert.ok(SIGNATURE_CAMO_TANK_IDS.includes(id), `${id} must retain its requested Signature entry`);
  assert.equal(stockCamoPatternIdFor(id), `sig_${id}`, `${id} owns its distinct requested default`);
  assert.equal(getCamoSelection(id), 'factory', `${id} initially presents Factory when unset`);
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
  assert.equal(defaultCamoPatternId(id), 'factory');
  assert.equal(stockCamoPatternIdFor(id), 'summer', `${id} preserves its temperate stock finish`);
  assert.equal(getCamoSelection(id), 'factory');
  assert.equal(resolveCamoVisual(getSpec(id), 'summer').scheme, 'nato');
}
assert.equal(getCamoSelection('abramsx'), 'factory');
assert.equal(getCamoSelection('m1a2'), 'factory');
setCamoBiome('verdant');
assert.equal(hasCamoPaint('m48'), true, 'Factory preserves the temperate stock recipe’s seasonal bonus');
assert.equal(hasCamoPaint('m1a2'), false, 'reorganizing paint does not add a bonus to desert stock on woodland');
setCamoBiome('desert');
assert.equal(hasCamoPaint('m48'), false, 'temperate Factory paint still mismatches desert');
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
  for (const pattern of ['factory', 'winter', 'suits', 'openai', 'xai', 'gemini', 'mono', 'carbon', 'prism', 'national_il', 'paint_kv2']) {
    globalThis.localStorage.getItem = key => key === 'cot.camo.sabra_mk2_x' ? pattern : null;
    assert.equal(getCamoSelection('sabra_mk2_x'), pattern, `Sabra's default does not replace an explicit saved ${pattern} choice`);
  }
  globalThis.localStorage.getItem = key => key === 'cot.camo.sabra_mk2_x' ? 'custom' : key === 'cot.camoCustom.v1.sabra_mk2_x' ? '{}' : null;
  assert.equal(getCamoSelection('sabra_mk2_x'), 'custom', 'Sabra preserves device-local custom paint');
} finally {
  if (previousLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousLocalStorage;
}

console.log(`factoryCamo.selftest: Factory restores stock paint on ${checked} hulls, ${NATIONAL_CAMO_PATTERN_IDS.length} national colours, ${paints} authored paints, ${SIGNATURE_CAMO_TANK_IDS.length} named stock recipes`);

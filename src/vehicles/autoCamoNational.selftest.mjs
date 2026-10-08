import assert from 'node:assert/strict';
import './tankFactory.ts';
import { ALL_TANK_IDS, getSpec } from './specs.ts';
import {
  AUTO_CAMO_BIOMES, AUTO_CAMO_ENVIRONMENTS, CAMO_CATALOG_PATTERN_IDS, CAMO_COUNTRY_TAG_IDS, CAMO_PATTERN_IDS,
  CAMO_PATTERN_LABEL, NATIONAL_AUTO_CAMO, SHARED_CAMO_PRESETS,
  autoCamoBiomeId, autoCamoPatternIdFor, camoNationTag, camoPatternTags, isBuiltInCamoId, nationalAutoCamoSchemes,
  nationFieldsPixelCamo, networkCamoId, sharedCamoPreset,
} from './camoPolicy.ts';
import {
  hasCamoPaint, resolveCamoVisual, resolveMultiplayerCamoPattern, setCamoBiome, setCamoOverride,
} from './materials.ts';

// Tank-accessories round 3 (2026-10-07): the blind critics of battle wave 196 on Sirocco Wadi saw "every nation in
// the same three-tone desert scheme". AUTO now paints each vehicle's NATIONAL scheme for the battlefield's environment
// and keeps the shared biome pool only for a nation without one (camoPolicy.ts NATIONAL_AUTO_CAMO).

const COUNTRY_TAGS = new Set(CAMO_COUNTRY_TAG_IDS);
const nationTags = (patternId) => camoPatternTags(patternId).filter((tag) => COUNTRY_TAGS.has(tag));
const legacyPick = (pool, key) => { // the camo r2 draw, kept bit for bit
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return pool[(h >>> 0) % pool.length];
};

// --- the table: concrete, match-safe schemes, each the row nation's own or nation-neutral
assert.deepEqual([...AUTO_CAMO_ENVIRONMENTS], ['woodland', 'desert', 'winter', 'urban']);
assert.deepEqual(Object.keys(NATIONAL_AUTO_CAMO).sort(), [...CAMO_COUNTRY_TAG_IDS].sort(), 'one table row per catalog nation');
let schemes = 0;
for (const [nation, table] of Object.entries(NATIONAL_AUTO_CAMO)) {
  assert.ok(Object.isFrozen(table), `${nation}: the table is immutable`);
  assert.ok(table.woodland?.length, `${nation}: every nation has its own woodland scheme`);
  for (const [environment, rows] of Object.entries(table)) {
    assert.ok(AUTO_CAMO_ENVIRONMENTS.includes(environment), `${nation}.${environment} is an AUTO environment`);
    assert.ok(Object.isFrozen(rows) && rows.length, `${nation}.${environment}: frozen, non-empty rows`);
    rows.forEach((candidate, index) => {
      assert.ok(candidate.schemes.length, `${nation}.${environment}[${index}] names a scheme`);
      // an era-free row answers every era, so it must be the last row of its environment
      if (!candidate.eras) assert.equal(index, rows.length - 1, `${nation}.${environment}: the every-era row closes the list`);
      for (const patternId of candidate.schemes) {
        schemes++;
        assert.ok(isBuiltInCamoId(patternId) && networkCamoId(patternId) === patternId,
          `${nation}.${environment}: ${patternId} is a built-in, match-safe catalog scheme`);
        assert.ok(!['auto', 'factory', 'signature'].includes(patternId), `${nation}.${environment}: ${patternId} is concrete`);
        const owners = nationTags(patternId);
        assert.ok(owners.every((tag) => tag === nation),
          `${nation}.${environment}: ${patternId} is never another nation's scheme (${owners.join(',')})`);
      }
    });
  }
}

// --- the plain theatre colours: catalog solids filed under their nation and the desert, each a new paint (more
// than a shade, 14/255 per channel, from every other preset), selectable and match-safe like any built-in
const shadeApart = (a, b) => [1, 3, 5].some((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) > 14);
for (const [patternId, nation] of [['carc_tan', 'usa'], ['light_stone', 'uk']]) {
  const theatre = sharedCamoPreset(patternId);
  assert.ok(theatre && CAMO_CATALOG_PATTERN_IDS.includes(patternId) && CAMO_PATTERN_LABEL[patternId], `${patternId}: a labelled catalog preset`);
  assert.equal(theatre.visual.scheme, 'solid', `${patternId}: the existing solid painter`);
  assert.deepEqual([...theatre.tags], [nation, 'desert', 'geometric'], `${patternId}: filed under ${nation} and desert`);
  for (const other of SHARED_CAMO_PRESETS) {
    if (other.id === patternId || other.visual.scheme !== 'solid') continue;
    assert.ok(shadeApart(theatre.visual.base, other.visual.base), `${patternId} is not a shade of ${other.id}`);
  }
}
assert.ok(CAMO_PATTERN_IDS.indexOf('carc_tan') > CAMO_PATTERN_IDS.indexOf('gt'), 'appended after every serialized id');

// --- the biomes: every pool concrete, every environment known; unknown and inherited map ids read as verdant
for (const [biomeId, biome] of Object.entries(AUTO_CAMO_BIOMES)) {
  assert.ok(biome.environment === null || AUTO_CAMO_ENVIRONMENTS.includes(biome.environment), `${biomeId}: environment`);
  assert.ok(biome.pool.length, `${biomeId}: a non-empty shared pool`);
  for (const patternId of biome.pool) assert.ok(patternId === 'urban' || isBuiltInCamoId(patternId), `${biomeId}: ${patternId}`);
}
// (fleet lane 2026-10-08: every real battlefield now names its own theatre row, battleTheatreCamo.selftest.mjs; Sunscar
// Oasis reads as its own desert row, not Verdant. Unknown and inherited ids still read as verdant.)
for (const mapId of ['random', '', '__proto__', 'constructor', 'toString']) assert.equal(autoCamoBiomeId(mapId), 'verdant', mapId);
assert.equal(autoCamoBiomeId('oasis'), 'oasis');
assert.equal(AUTO_CAMO_BIOMES.oasis.environment, 'desert');
assert.equal(autoCamoBiomeId('desert'), 'desert');

// --- the coordinator's cases on Sirocco Wadi (the desert-line scene): four nations, four schemes
const auto = (id, mapId) => autoCamoPatternIdFor(getSpec(id), mapId);
for (const id of ['merkava4_trophy', 'merkava1b', 'merkava2b', 'merkava3c', 'merkava4_x', 'namer_ifv', 'sabra_mk2_x']) {
  for (const mapId of ['desert', 'verdant', 'winter', 'urban', 'steppe', 'railyard']) {
    assert.equal(auto(id, mapId), 'service_merkava2d', `${id} on ${mapId}: IDF Sinai grey, never a generic desert blotch`);
  }
}
assert.equal(auto('challenger1', 'desert'), 'light_stone', 'Gulf War Challenger 1 on sand: plain British Light Stone');
assert.equal(auto('type99a', 'desert'), 'digitaldesert', 'Type 99A on sand: the PLA desert digital');
for (const id of ['m1a1', 'm1a2', 'm1a2_sepv3', 'm60a1', 'm3a3_bradley']) {
  assert.equal(auto(id, 'desert'), 'carc_tan', `${id} on sand: plain CARC Tan, not the shared three-tone`);
}
const desertLine = ['challenger1', 'm60a1', 'type99a', 'merkava4_trophy'].map((id) => auto(id, 'desert'));
assert.equal(new Set(desertLine).size, 4, `the desert line wears four national schemes (${desertLine.join(', ')})`);
for (const id of ['t90ms', 't90m_proryv', 't72b3m', 't14_x']) {
  assert.ok(['sig_t90ms', 'paint_t90ms'].includes(auto(id, 'desert')), `${id} on sand: a Russian desert coat`);
}
// a nation without a desert scheme keeps the shared pool, minus every other nation's own scheme and (round 4,
// 2026-10-07: "pixel digital only where a nation really fields it") minus the pixel desert unless the nation fields
// pixel camouflage (China, Poland, South Korea, Ukraine)
const neutralDesert = AUTO_CAMO_BIOMES.desert.pool.filter((patternId) => nationTags(patternId).length === 0);
assert.deepEqual(neutralDesert, ['desert', 'digitaldesert']);
for (const id of ['leo2a4', 'leo2a6', 'ariete_c1', 'type10', 'k2', 'strv122', 'pt91_twardy', 'ua_t64bv', 't80u']) {
  const pick = auto(id, 'desert');
  const pool = nationFieldsPixelCamo(camoNationTag(getSpec(id).nation)) ? neutralDesert
    : neutralDesert.filter((patternId) => !camoPatternTags(patternId).includes('digital'));
  assert.ok(pool.includes(pick), `${id} (${getSpec(id).nation}, no desert scheme) wears the shared pool: ${pick}`);
  assert.equal(pick, legacyPick(pool, `${id}:desert`), `${id}: the camo r2 draw over the neutral pool`);
}
for (const id of ['leo2a4', 'leo2a6', 'ariete_c1', 'type10', 'strv122', 't80u']) {
  assert.equal(auto(id, 'desert'), 'desert', `${id}: the shared desert three-tone, never the pixel desert`);
}

// --- the verdant-spawn scene: four nations, each in its own woodland coat (round 4, 2026-10-07: the T-90M Proryv in
// the Russian green, sand and black coat, not service digital; the Leopard 2A4 in the NATO three-tone only)
const woodland = {
  m1a2_sepv3: ['paint_m1a1'], t90m_proryv: ['paint_ru_t80u_modern'],
  pt91_twardy: ['paint_pl_t80u_modern', 'service_pl01'], leo2a4: ['paint_marder2'],
};
for (const [id, allowed] of Object.entries(woodland)) assert.ok(allowed.includes(auto(id, 'verdant')), `${id} on verdant: ${auto(id, 'verdant')}`);
const spawn = Object.keys(woodland).map((id) => auto(id, 'verdant'));
assert.equal(new Set(spawn).size, 4, `the verdant spawn wears four national schemes (${spawn.join(', ')})`);
// the critics judge paint, not ids: each scene's four vehicles paint four different palettes (scheme and colours)
const sceneVisual = (id, mapId) => {
  const visual = resolveCamoVisual(getSpec(id), autoCamoPatternIdFor(getSpec(id), mapId));
  return JSON.stringify([visual.scheme, visual.base, visual.weather, visual.patches || []]);
};
for (const [mapId, ids] of [['desert', ['challenger1', 'm60a1', 'type99a', 'merkava4_trophy']], ['verdant', Object.keys(woodland)]]) {
  assert.equal(new Set(ids.map((id) => sceneVisual(id, mapId))).size, 4, `${mapId} scene: four different painted palettes`);
}
// --- round 4 (2026-10-07; both critics after wave 240 found tanks in another army's scheme: the T-90M and T-72B3M in
// pixel digital, the Leopard 2A6 in "a four-colour scheme with cream patches", the M1A2 SEPv3 "mixes desert blocks
// with green rosettes"): each army's own scheme for the biome, pixel only where the nation fields it
for (const tag of ['usa', 'de', 'ru', 'uk', 'fr', 'it', 'jp', 'se', 'il']) assert.equal(nationFieldsPixelCamo(tag), false, tag);
for (const tag of ['cn', 'pl', 'kr', 'ua']) assert.equal(nationFieldsPixelCamo(tag), true, tag);
for (const [id, verdant, desert] of [
  ['t90m', 'paint_ru_t80u_modern', ['sig_t90ms', 'paint_t90ms']], ['t90m_proryv', 'paint_ru_t80u_modern', ['sig_t90ms', 'paint_t90ms']],
  ['t72b3m', 'paint_ru_t80u_modern', ['sig_t90ms', 'paint_t90ms']], ['leo2a6', 'paint_marder2', ['desert']],
  ['leo2a4', 'paint_marder2', ['desert']], ['m1a2_sepv3', 'paint_m1a1', ['carc_tan']], ['m60a1', 'paint_m1a1', ['carc_tan']],
]) {
  assert.equal(auto(id, 'verdant'), verdant, `${id} on verdant: ${verdant}`);
  assert.ok(desert.includes(auto(id, 'desert')), `${id} on sand: ${auto(id, 'desert')}`);
}
assert.equal(resolveCamoVisual(getSpec('leo2a6'), auto('leo2a6', 'verdant')).scheme, 'nato', 'the Leopard: NATO three-tone');
assert.equal(resolveCamoVisual(getSpec('leo2a6'), auto('leo2a6', 'verdant')).patches.length, 2, 'green with brown and black');
// the whole fleet: a nation that fields no pixel camouflage never draws a pixel scheme, on any biome
for (const id of ALL_TANK_IDS) {
  const spec = getSpec(id);
  if (nationFieldsPixelCamo(camoNationTag(spec.nation))) continue;
  for (const biomeId of Object.keys(AUTO_CAMO_BIOMES)) {
    const pick = autoCamoPatternIdFor(spec, biomeId);
    assert.ok(!camoPatternTags(pick).includes('digital'), `${id}@${biomeId}: ${pick} is not pixel camouflage`);
  }
}
// era rows: the wartime and Cold War hulls wear their period's scheme
assert.equal(auto('kv2', 'verdant'), 'service_soviet_ww2');
assert.equal(auto('kv2', 'urban'), 'berlin45');
// (fleet lane 2026-10-08: the Cold War Soviet row is plain 4BO green AND the three-tone amoeba; the draw picks one)
assert.ok(['national_ru', 'service_soviet_coldwar'].includes(auto('t80', 'verdant')), 'Cold War Soviet: 4BO green or three-tone');
assert.equal(auto('m60a1', 'verdant'), 'paint_m1a1', 'round 4: the NATO three-tone in woodland (MERDC left the row)');
assert.equal(auto('m60a1', 'winter'), 'merdcwinter');
assert.ok(AUTO_CAMO_BIOMES.winter.pool.includes(auto('m1a2_sepv3', 'winter')), 'no modern US winter scheme: the shared pool');
assert.equal(auto('chieftain5', 'urban'), 'berlin', 'British hulls in a city: the Berlin Brigade blocks');
assert.equal(nationalAutoCamoSchemes('USSR/Russia', 'cold-war', 'desert').length, 0, 'no Cold War Soviet desert row');
assert.deepEqual(nationalAutoCamoSchemes('Atlantis', 'modern', 'woodland'), []);
assert.deepEqual(nationalAutoCamoSchemes(null, 'modern', 'woodland'), []);

// --- the whole fleet on every biome: concrete, deterministic, never another nation's scheme; autumn and the moon
// keep their seasonal pools for every nation; a vehicle without a nation keeps the exact legacy draw
let resolved = 0;
for (const id of ALL_TANK_IDS) {
  const spec = getSpec(id);
  const own = camoNationTag(spec.nation);
  assert.ok(own, `${id}: ${spec.nation} is a catalog nation`);
  for (const [biomeId, biome] of Object.entries(AUTO_CAMO_BIOMES)) {
    const pick = autoCamoPatternIdFor(spec, biomeId);
    resolved++;
    assert.ok(pick === 'urban' || isBuiltInCamoId(pick), `${id}@${biomeId}: concrete (${pick})`);
    assert.ok(pick !== 'auto' && pick !== 'factory' && pick !== 'signature', `${id}@${biomeId}: never an alias`);
    assert.equal(autoCamoPatternIdFor({ id: spec.id, nation: spec.nation, era: spec.era }, biomeId), pick, `${id}@${biomeId}: pure`);
    assert.ok(nationTags(pick).every((tag) => tag === own), `${id}@${biomeId}: ${pick} is not another nation's scheme`);
    if (!biome.environment) assert.ok(biome.pool.includes(pick), `${id}@${biomeId}: the seasonal pool`);
    // multiplayer: every peer resolves the wire selection 'auto' to the same scheme from the shared registry spec
    assert.equal(resolveMultiplayerCamoPattern(spec, 'auto', biomeId), pick, `${id}@${biomeId}: the peer resolution agrees`);
    assert.equal(autoCamoPatternIdFor({ id }, biomeId), legacyPick(biome.pool, `${id}:${biomeId}`), `${id}@${biomeId}: no-nation draw`);
  }
}
// (fleet lane 2026-10-08: Sunscar Oasis has its own desert theatre row now; a Leopard 2A4 there paints the desert pool's
// neutral desert, as on Sirocco Wadi. An id without a row still paints as verdant.)
assert.equal(autoCamoPatternIdFor(getSpec('leo2a4'), 'oasis'), autoCamoPatternIdFor(getSpec('leo2a4'), 'desert'),
  'Sunscar Oasis paints as the desert theatre');
assert.equal(autoCamoPatternIdFor(getSpec('leo2a4'), 'random'), autoCamoPatternIdFor(getSpec('leo2a4'), 'verdant'),
  'an id without its own row paints as verdant (unchanged)');

// --- the wire carries the selection, never the resolution; explicit and custom selections are untouched
assert.equal(networkCamoId('auto'), 'auto');
assert.equal(networkCamoId('urban'), 'factory', 'the AUTO-only urban grey stays off the wire allowlist');
assert.equal(resolveMultiplayerCamoPattern(getSpec('merkava4_trophy'), 'winter', 'desert'), 'winter', 'an explicit pick is kept');
assert.equal(resolveMultiplayerCamoPattern(getSpec('merkava4_trophy'), 'custom', 'desert'), 'factory', 'custom paint degrades');
assert.equal(resolveMultiplayerCamoPattern('bare-id', 'auto', 'desert'), legacyPick(AUTO_CAMO_BIOMES.desert.pool, 'bare-id:desert'),
  'a bare id has no nation and keeps the whole shared pool');

// --- the solo battle path (state.ts / battleIntentRuntime: setCamoBiome + setCamoOverride('auto')) paints the same
// national scheme, keeps the AUTO concealment verdict, and never overrides an explicit pick
const paletteOf = (visual) => JSON.stringify([visual.scheme, visual.base, visual.weather, visual.patches || []]);
try {
  for (const [id, mapId] of [['merkava4_trophy', 'desert'], ['challenger1', 'desert'], ['type99a', 'desert'],
    ['m60a1', 'desert'], ['m1a2_sepv3', 'verdant'], ['leo2a4', 'desert'], ['kv2', 'urban']]) {
    const spec = getSpec(id);
    setCamoBiome(mapId);
    setCamoOverride(id, 'auto');
    assert.equal(paletteOf(resolveCamoVisual(spec)), paletteOf(resolveCamoVisual(spec, autoCamoPatternIdFor(spec, mapId))),
      `${id} on ${mapId}: the battle paint is the national AUTO scheme`);
    assert.equal(hasCamoPaint(id), true, `${id} on ${mapId}: AUTO always earns the biome bonus`);
    setCamoOverride(id, 'pinkdesert');
    assert.equal(paletteOf(resolveCamoVisual(spec)), paletteOf(resolveCamoVisual(spec, 'pinkdesert')), `${id}: explicit pick kept`);
    setCamoOverride(id, null);
  }
  setCamoBiome('desert');
  setCamoOverride('m1a2', 'winter');
  assert.equal(hasCamoPaint('m1a2'), false, 'a mismatched manual pick still earns nothing');
  setCamoOverride('m1a2', 'pinkdesert');
  assert.equal(hasCamoPaint('m1a2'), true, 'a hand-picked pool scheme still earns on its biome');
} finally {
  for (const id of ['merkava4_trophy', 'challenger1', 'type99a', 'm60a1', 'm1a2_sepv3', 'leo2a4', 'kv2', 'm1a2']) setCamoOverride(id, null);
  setCamoBiome('verdant');
}

console.log(`autoCamoNational.selftest: ${Object.keys(NATIONAL_AUTO_CAMO).length} nations, ${schemes} national scheme slots, `
  + `${resolved} fleet x biome resolutions; desert line ${desertLine.join(' / ')}; verdant spawn ${spawn.join(' / ')}`);

import assert from 'node:assert/strict';
import './tankFactory.ts';
import { ALL_TANK_IDS, getSpec } from './specs.ts';
import { MAP_IDS } from '../world/maps/mapIds.ts';
import {
  AUTO_CAMO_BIOMES, CAMO_COUNTRY_TAG_IDS, autoCamoBiomeId, autoCamoPatternIdFor, camoNationTag, camoPatternTags,
  camoSuitsTheatre, nationalAutoCamoSchemes, nationFieldsPixelCamo, stockCamoPatternIdFor,
} from './camoPolicy.ts';
import { autoCamoIdsForBattle } from '../game/rosterState.ts';

// Fleet lane (2026-10-08; the coordinator after wave 258: "camo is wrong for nation, era and theatre"): every playable
// vehicle on every battlefield paints a deterministic scheme from its own nation's list for that map's theatre (or,
// for a nation without one there, the shared theatre pool without other nations' schemes); pixel only for a nation that
// fields it; winter coats only on winter maps. Bots keep their own paint only where it suits the theatre, and their AUTO
// draws re-seed per battle among the same candidates.

const COUNTRY = new Set(CAMO_COUNTRY_TAG_IDS);
const envOf = (mapId) => AUTO_CAMO_BIOMES[autoCamoBiomeId(mapId)].environment;

// every real battlefield names its own theatre row (none falls back to Verdant any more)
for (const mapId of MAP_IDS) {
  assert.equal(autoCamoBiomeId(mapId), mapId, `${mapId} has its own AUTO theatre row`);
}
const theatres = { woodland: [], desert: [], winter: [], urban: [], none: [] };
for (const mapId of MAP_IDS) theatres[envOf(mapId) ?? 'none'].push(mapId);
assert.deepEqual(theatres.winter.sort(), ['alpine', 'whiteout', 'winter'], 'the snowbound maps are the winter theatre');
assert.ok(['desert', 'oasis', 'badlands', 'copper_mesa', 'titan_gorge', 'skybridge', 'mars', 'steppe'].every((id) => theatres.desert.includes(id)),
  'the sand and rock-desert maps are the desert theatre');
assert.ok(['urban', 'railyard', 'ruinspires', 'foundry', 'blackglass'].every((id) => theatres.urban.includes(id)), 'the built-up maps are urban');

let rows = 0, national = 0, pooled = 0;
for (const id of ALL_TANK_IDS) {
  const spec = getSpec(id);
  const nationTag = camoNationTag(spec.nation ?? null);
  const pixelNation = !!nationTag && nationFieldsPixelCamo(nationTag);
  for (const mapId of MAP_IDS) {
    const env = envOf(mapId);
    const pick = autoCamoPatternIdFor(spec, mapId);
    assert.equal(autoCamoPatternIdFor(spec, mapId), pick, `${id}@${mapId}: AUTO is deterministic`);
    const tags = camoPatternTags(pick);
    const own = nationTag === 'il' ? ['service_merkava2d'] : env ? nationalAutoCamoSchemes(spec.nation, spec.era, env) : [];
    if (own.length) {
      national++;
      assert.ok(own.includes(pick), `${id}@${mapId}: ${pick} is from ${spec.nation}'s own ${env} list`);
    } else {
      pooled++;
      const pool = AUTO_CAMO_BIOMES[autoCamoBiomeId(mapId)].pool;
      assert.ok(pool.includes(pick), `${id}@${mapId}: ${pick} is from the ${mapId} theatre pool`);
      const owners = tags.filter((tag) => COUNTRY.has(tag));
      if (nationTag && owners.length && owners.some((tag) => tag !== nationTag)) {
        // only a pool with nothing neutral left may lend another nation's scheme
        assert.ok(pool.every((patternId) => camoPatternTags(patternId).some((tag) => COUNTRY.has(tag) && tag !== nationTag)),
          `${id}@${mapId}: ${pick} belongs to another nation (${owners.join(',')})`);
      }
    }
    if (tags.includes('digital')) assert.ok(pixelNation || !nationTag, `${id}@${mapId}: pixel ${pick} only for a nation that fields it`);
    if (tags.includes('winter')) assert.equal(env, 'winter', `${id}@${mapId}: winter coat ${pick} only on a winter map`);
    // the battle seed re-draws among the same candidates, deterministically
    for (const seed of [1, 2, 37]) {
      const seeded = autoCamoPatternIdFor(spec, mapId, seed);
      assert.equal(autoCamoPatternIdFor(spec, mapId, seed), seeded, `${id}@${mapId}#${seed}: seeded AUTO is deterministic`);
      if (own.length) assert.ok(own.includes(seeded), `${id}@${mapId}#${seed}: ${seeded} from the national list`);
      else assert.ok(AUTO_CAMO_BIOMES[autoCamoBiomeId(mapId)].pool.includes(seeded), `${id}@${mapId}#${seed}: ${seeded} from the pool`);
    }
    // a bot's kept stock paint only where it suits the theatre
    const stock = stockCamoPatternIdFor(id, spec.nation, spec.era);
    if (stock && camoSuitsTheatre(stock, spec.nation, mapId)) {
      const stockTags = camoPatternTags(stock);
      assert.ok(!stockTags.includes('winter') || env === 'winter', `${id}@${mapId}: kept winter stock ${stock} off a winter map`);
      assert.ok(!stockTags.includes('digital') || pixelNation, `${id}@${mapId}: kept pixel stock ${stock} for a non-pixel nation`);
      if (env === 'desert') assert.ok(stockTags.includes('desert'), `${id}@${mapId}: kept non-desert stock ${stock} on sand`);
      if (env === 'woodland') assert.ok(stockTags.includes('woodland') || stockTags.includes('tropical'), `${id}@${mapId}: kept ${stock} on grass`);
    }
    rows++;
  }
}

// brand, special and signature-only finishes carry no theatre: never kept by a bot
for (const special of ['claude', 'openai', 'flames', 'midnight', 'hexfield']) {
  for (const mapId of ['verdant', 'desert', 'winter', 'urban']) assert.equal(camoSuitsTheatre(special, 'USA', mapId), false, `${special}@${mapId}`);
}
// the wave-258 cases: US CARC tan and Israeli Sinai grey kept on sand, CARC tan never on grass, whitewash never on grass,
// Russian exhibition digital never kept anywhere
assert.equal(camoSuitsTheatre('carc_tan', 'USA', 'oasis'), true);
assert.equal(camoSuitsTheatre('carc_tan', 'USA', 'verdant'), false);
assert.equal(camoSuitsTheatre('washworn', 'Russia', 'verdant'), false);
assert.equal(camoSuitsTheatre('washworn', 'Russia', 'whiteout'), true);
assert.equal(camoSuitsTheatre('sig_t90m_proryv', 'Russia', 'verdant'), false);
assert.equal(camoSuitsTheatre('service_type99a', 'China', 'verdant'), true);
// the IDF paints every vehicle Sinai grey in every theatre (the coordinator after wave 257): an Israeli hull keeps no
// multi-tone signature anywhere, and its AUTO coat is Sinai grey on every map
let israeli = 0;
for (const id of ALL_TANK_IDS) {
  const spec = getSpec(id);
  if (camoNationTag(spec.nation ?? null) !== 'il') continue;
  israeli++;
  for (const mapId of MAP_IDS) {
    assert.equal(autoCamoPatternIdFor(spec, mapId), 'service_merkava2d', `${id}@${mapId}: Sinai grey`);
    const stock = stockCamoPatternIdFor(id, spec.nation, spec.era);
    if (stock && stock !== 'service_merkava2d' && stock !== 'national_il') {
      assert.equal(camoSuitsTheatre(stock, spec.nation, mapId), false, `${id}@${mapId}: ${stock} is not an IDF coat`);
    }
  }
}
assert.ok(israeli >= 5, `the Israeli hulls are covered (${israeli})`);

// the roster helper: a bot that rolled to keep its paint takes AUTO when its paint does not suit the theatre; the rolls
// (and so every other bot's draw) are unchanged
const roster = ['m1a2_sepv3', 't90m_proryv', 'leo2a4', 'challenger1', 'type99a', 'merkava4_trophy', 'm60a1', 'pt91_twardy']
  .map((specId) => ({ specId }));
for (const mapId of ['verdant', 'orchard', 'urban']) {
  for (let ordinal = 1; ordinal <= 6; ordinal++) {
    const keepAll = autoCamoIdsForBattle(roster, 'none', mapId, true, ordinal);
    const suits = (specId) => camoSuitsTheatre(stockCamoPatternIdFor(specId, getSpec(specId).nation, getSpec(specId).era), getSpec(specId).nation, mapId);
    const theatre = autoCamoIdsForBattle(roster, 'none', mapId, true, ordinal, suits);
    for (const specId of keepAll) assert.ok(theatre.includes(specId), `${mapId}#${ordinal}: ${specId} still rolls AUTO`);
    for (const { specId } of roster) {
      if (!theatre.includes(specId)) assert.ok(suits(specId), `${mapId}#${ordinal}: ${specId} keeps only a theatre-true paint`);
    }
    assert.deepEqual(autoCamoIdsForBattle(roster, 'none', mapId, true, ordinal, suits), theatre, `${mapId}#${ordinal}: deterministic`);
  }
}

console.log(`battleTheatreCamo: ${ALL_TANK_IDS.length} vehicles x ${MAP_IDS.length} maps = ${rows} theatre picks (${national} national, ${pooled} pooled); pixel only where fielded, winter only on winter maps, bots keep only theatre-true paint`);

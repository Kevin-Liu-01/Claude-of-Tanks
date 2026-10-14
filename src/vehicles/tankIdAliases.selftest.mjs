// Receipt for the tank id alias layer (SSOT 2.19, ID.03): src/vehicles/tankIdAliases.ts.
//
// - The live maps are append-only, the schema matches them, and every schema
//   bump came with a PROTOCOL_VERSION bump (the MP build gate keeps a room on
//   one id schema; the per-frame wire stays unchanged).
// - Every id of schema 1 (the 220 saved ids of 2026-10-13) still names exactly
//   one live vehicle, and no two old ids land on the same one.
// - A swap resolves by schema: in a fixture schema 2 built from the rename
//   table, leo2a6m written under schema 1 is the Leopard 2A4 OTCO (leo2a4_otco)
//   while leo2a6m written under schema 2 is the Leopard 2A6M.
// - The live registry: schema-1 leo2a6m and t90m name the vehicles shown as
//   "Leopard 2A4 OTCO" and "T-90AM", before and after the rename lands.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import './tankFactory.ts';
import { TANK_SPECS } from './specs.ts';
import {
  TANK_IDS, TANK_ID_RENAMES, TANK_ID_SCHEMA, createTankIdResolver, resolveTankId, tankSeedId,
} from './tankIdAliases.ts';
import { PROTOCOL_VERSION } from '../mp/wire/constants.ts';
import { decorEra } from './decorations.ts';

const shownName = (id) => TANK_SPECS[id]?.label?.displayName ?? TANK_SPECS[id]?.name;

// ---- append-only maps and the build gate
// sha256 of JSON.stringify(map) for every landed map, in order. Append a row with each rename; never edit one.
const LANDED_MAP_SHA256 = [
  '9c6b9d486a0f2b82d519a5cbdffb5f3f775e3fb8f371b5d2a5cd4979ef129dec', // schema 2 (2026-10-13): fv510_milan_x -> warrior_tes_h
  'c28c92b974a74bedf6e088c36dd082ab6d6eaedb7d39cc277bee3f224950c9ed', // schema 3 (ID.04/05): the 130 renames of the 2026-10-13 table
];
// The PROTOCOL_VERSION that first carried each tank id schema. A new schema needs a higher protocol, so builds of
// two schemas never share a match.
const PROTOCOL_FOR_SCHEMA = { 1: 6, 2: 7, 3: 8 };
assert.equal(TANK_ID_SCHEMA, TANK_ID_RENAMES.length + 1, 'one rename map per schema step');
assert.deepEqual(
  TANK_ID_RENAMES.map((map) => createHash('sha256').update(JSON.stringify(map)).digest('hex')),
  LANDED_MAP_SHA256,
  'a landed rename map changed or a new one is unpinned: append its sha256 here (never edit a landed map)',
);
assert.ok(PROTOCOL_FOR_SCHEMA[TANK_ID_SCHEMA] !== undefined,
  `tank id schema ${TANK_ID_SCHEMA} has no PROTOCOL_VERSION row: bump PROTOCOL_VERSION with the rename and record it`);
for (let s = 2; s <= TANK_ID_SCHEMA; s += 1) {
  assert.ok(PROTOCOL_FOR_SCHEMA[s] > PROTOCOL_FOR_SCHEMA[s - 1], `schema ${s} must ride a newer PROTOCOL_VERSION than schema ${s - 1}`);
}
assert.ok(PROTOCOL_VERSION >= PROTOCOL_FOR_SCHEMA[TANK_ID_SCHEMA], 'the protocol cannot be older than its id schema');

// ---- every schema-1 id still names one live vehicle
const SCHEMA_1_IDS = [
  'abramsx', 'aft10_x', 'ajax_x', 'amx10p', 'amx10p_25', 'amx30', 'amx30_x', 'amx30b2', 'amx40', 'amx40_x', 'amx56',
  'ares_apc_x', 'ariete', 'ariete_c1', 'ariete_c1_x', 'ariete_c2', 'ariete_c2_x', 'bmp2', 'bmp3', 'bmp3_rok',
  'bmp3m_dragun125_x', 'bmpt_t90', 'bmpt_terminator2', 'borsuk', 'bwp1', 'carro45t', 'centurion3', 'centurion5',
  'challenger1', 'challenger1_x', 'challenger2', 'challenger2e', 'challenger_3', 'challenger_3x', 'chieftain5',
  'chieftain5_x', 'chieftain_mk10', 'chieftain_mk10_x', 'cn_t72b3_modern', 'cn_t72b3m_modern', 'cn_t80u_modern',
  'cv90', 'cv90105_tml_x', 'cv90_mkiv', 'cv90_mkiv_x', 'cv90_x', 'dardo', 'fv4034', 'fv510', 'fv510_milan',
  'fv510_milan_x', 'griffin50_x', 'griffin_viper', 'jpz_e100_x', 'k1a1', 'k1a1_x', 'k2', 'k21_x', 'k2_x', 'k2b',
  'kf41_lynx_x', 'kf51', 'kf51_x', 'kf51b', 'kurganets25_x', 'kv2', 'leclerc', 'leclerc_classic_x', 'leclerc_x',
  'leclerc_xlr', 'leo1a5', 'leo2_revolution', 'leo2_revolution_proto', 'leo2a4', 'leo2a4_otco', 'leo2a4m',
  'leo2a4m_x', 'leo2a5', 'leo2a5_a5nl', 'leo2a5_x', 'leo2a6', 'leo2a6_ua', 'leo2a6_x', 'leo2a6m', 'leo2a6m_x',
  'leo2a7v', 'leo2a7v_x', 'leopard2_proto', 'lrmv_lynx', 'm1a1', 'm1a1ha', 'm1a2', 'm1a2_sepv2', 'm1a2_sepv2_x',
  'm1a2_sepv3', 'm1a2_sepv3_x', 'm1a2_tusk', 'm1a2_tusk_x', 'm1a2_x', 'm1a3', 'm2a2_bradley', 'm3a3_bradley',
  'm46_patton', 'm47_patton', 'm48', 'm551_sheridan', 'm551a1_tts', 'm60a1', 'm60a2', 'm60a3', 'm6_linebacker',
  'marder1a3', 'marder2', 'mbt70', 'merkava1b', 'merkava2b', 'merkava2d', 'merkava3c', 'merkava3d', 'merkava3d_x',
  'merkava4_barak', 'merkava4_trophy', 'merkava4_x', 'merkava4b', 'namer_ifv', 'object695_x', 'pl01', 'pl01_105',
  'pl_t72b3_modern', 'pl_t72b3_zubr_ii', 'pl_t72b3m_modern', 'pl_t80u_modern', 'pt91_twardy', 'pt91m',
  'ru_t72b3_modern', 'ru_t72b3m_modern', 'ru_t80u_modern', 'sabra_mk2_x', 'spz_puma', 'spz_puma_s1', 'spz_puma_s1_x',
  'stb1', 'strv103', 'strv103a', 'strv122', 'strv122_x', 'strv81', 't14', 't14_x', 't62mv1', 't62mv1_x', 't64bv1',
  't72_rys', 't72b3_x', 't72b3m', 't72b3m_x', 't72b_1987_x', 't72bu', 't72bu_x', 't72m1_jaguar', 't80', 't80b',
  't80bv', 't80u', 't80u_x', 't84', 't90', 't90_x', 't90a', 't90a_burlak', 't90a_burlak_x', 't90a_vladimir',
  't90a_vladimir_x', 't90a_x', 't90m', 't90m_proryv', 't90m_x', 't90ms', 't90ms_x', 't90sm', 't90sm_x',
  'tos1a_tagil', 'type10', 'type100', 'type10_x', 'type10b', 'type59', 'type74', 'type89', 'type89_light_tiger',
  'type89_x', 'type90', 'type90_x', 'type90a', 'type96_72_long', 'type96_72m_lei', 'type96_80_feng', 'type96b_x',
  'type99a', 'ua_challenger2', 'ua_m1a1', 'ua_m1a1_x', 'ua_m2a3_bradley', 'ua_t64bv', 'ua_t72b3_modern',
  'ua_t72b3m_hetman_ii', 'ua_t72b3m_modern', 'ua_t80bv', 'ua_t80u_kursk', 'ua_t80u_modern', 'ua_t84_oplot_m',
  'udes03', 'upior', 'vickers_mk1', 'vt4a1', 'ztz100_prototype', 'ztz100_x', 'ztz85_iii', 'ztz99a2',
  'ztz99a2_prototype',
];
const landed = new Map();
for (const id of SCHEMA_1_IDS) {
  const now = resolveTankId(id, 1);
  assert.ok(TANK_SPECS[now], `schema-1 id ${id} resolves to ${now}, which no spec carries`);
  assert.ok(!landed.has(now), `schema-1 ids ${landed.get(now)} and ${id} both resolve to ${now}`);
  landed.set(now, id);
}
for (const map of TANK_ID_RENAMES) {
  for (const [from, to] of Object.entries(map)) {
    assert.match(to, /^[a-z][a-z0-9_]*$/, `rename target ${to}`);
    assert.notEqual(from, to, `rename ${from} -> ${to} is a no-op`);
  }
  assert.equal(new Set(Object.values(map)).size, Object.values(map).length, 'a rename map never merges two ids');
}

// ---- schema reading, stamps and links on the live build
assert.equal(TANK_IDS.schema, TANK_ID_SCHEMA);
assert.equal(TANK_IDS.schemaOf(undefined), 1, 'missing means schema 1');
assert.equal(TANK_IDS.schemaOf('nonsense'), 1);
assert.equal(TANK_IDS.schemaOf(TANK_ID_SCHEMA + 5), TANK_ID_SCHEMA, 'a newer schema reads as current (no renames applied)');
if (TANK_ID_SCHEMA === 1) {
  assert.deepEqual(TANK_IDS.stamp(), {}, 'schema 1 writes no stamp: missing already means 1');
  assert.equal(TANK_IDS.linkParam(), '');
} else {
  assert.deepEqual(TANK_IDS.stamp(), { tankIdSchema: TANK_ID_SCHEMA }, 'every record this build writes names its schema');
  assert.equal(TANK_IDS.linkParam(), `ids=${TANK_ID_SCHEMA}`);
}

// ---- a swap resolves by schema (fixture schema 2 from the rename table)
const fixture = createTankIdResolver({
  schema: 2,
  renames: [{
    leo2a6m: 'leo2a4_otco', leo2a6m_x: 'leo2a6m', leo2a4_otco: 'leo2a3',
    t90m: 't90am', t90m_x: 't90m', fv510_milan_x: 'warrior_tes_h',
  }],
});
assert.equal(fixture.resolve('leo2a6m'), 'leo2a4_otco', 'schema-1 leo2a6m was the 2A4 OTCO');
assert.equal(fixture.resolve('leo2a6m', 1), 'leo2a4_otco');
assert.equal(fixture.resolve('leo2a6m', 2), 'leo2a6m', 'schema-2 leo2a6m is the 2A6M: never renamed twice');
assert.equal(fixture.resolve('leo2a6m_x', 1), 'leo2a6m');
assert.equal(fixture.resolve('leo2a4_otco', 1), 'leo2a3');
assert.equal(fixture.resolve('t90m', '1'), 't90am');
assert.equal(fixture.resolve('t90m_x'), 't90m');
assert.equal(fixture.resolve('m1a3', 1), 'm1a3', 'an id no map names keeps its spelling');
assert.equal(fixture.resolveIncoming('leo2a6m'), 'leo2a6m', 'an unstamped current id passes');
assert.equal(fixture.resolveIncoming('leo2a6m_x'), 'leo2a6m', 'a retired id resolves from its last schema');
assert.equal(fixture.resolveIncoming('fv510_milan_x'), 'warrior_tes_h');
assert.ok(fixture.isRetired('t90m_x') && !fixture.isRetired('t90m') && !fixture.isRetired('leo2a4_otco'));
assert.deepEqual(fixture.stamp(), { tankIdSchema: 2 });
assert.equal(fixture.linkParam(), 'ids=2');
assert.throws(() => createTankIdResolver({ schema: 3, renames: [{}] }), /needs 2 rename maps/);

// A chain of two maps: an id renamed in schema 2 and again in schema 3 resolves through both.
const chain = createTankIdResolver({ schema: 3, renames: [{ a: 'b' }, { b: 'c', d: 'b' }] });
assert.equal(chain.resolve('a', 1), 'c');
assert.equal(chain.resolve('b', 2), 'c');
assert.equal(chain.resolve('d', 2), 'b');
assert.equal(chain.resolve('b', 3), 'b');
assert.equal(chain.resolveIncoming('a'), 'c');
assert.ok(chain.isRetired('a') && chain.isRetired('d') && !chain.isRetired('b'));

// ---- looks are seeded from the schema-1 spelling, so a rename never changes a vehicle's appearance
assert.equal(fixture.originalOf('leo2a6m'), 'leo2a6m_x', 'the schema-2 2A6M paints and stows as the old leo2a6m_x did');
assert.equal(fixture.originalOf('leo2a4_otco'), 'leo2a6m');
assert.equal(fixture.originalOf('leo2a3'), 'leo2a4_otco');
assert.equal(fixture.originalOf('m1a3'), 'm1a3', 'a vehicle no map names keeps its own seed');
assert.equal(chain.originalOf('c'), 'a');
assert.equal(chain.originalOf('b'), 'd');
for (const id of SCHEMA_1_IDS) {
  assert.equal(tankSeedId(resolveTankId(id, 1)), id, `${id}: a renamed vehicle keeps its schema-1 seed`);
}
// Every place that hashes a vehicle id into its look or name hashes tankSeedId (decor kit, texture seeds and AUTO
// camouflage, hull numbers, track shade, garage plate hue, bot names).
const SEEDED = {
  'decorations.ts': /const seedId = tankSeedId\(specId\)/,
  'materials.ts': /tankSeedId\(key\.slice\(0, split\)\)[\s\S]*\$\{tankSeedId\(specId\)\}:\$\{activeBiome\}[\s\S]*\$\{tankSeedId\(specId\)\}:\$\{biome\}/,
  'vehicleMarkings.ts': /String\(id \? tankSeedId\(id\) : 'tank'\)/,
  'tankFactoryCore.ts': /for \(const ch of tankSeedId\(builderSpec\.id\)\) shadePhase/,
  '../ui/garage.ts': /\$\{spec\?\.id \? tankSeedId\(spec\.id\) : 'tank'\}:\$\{pid \|\| 'factory'\}/,
  '../ui/hud.ts': /hashStr\(String\(t\.id\) \+ \(t\.spec \? tankSeedId\(t\.spec\.id\) : ''\)\)/,
  '../audio/vehicleAudioProfiles.ts': /return tankSeedId\(String\(spec\.id \?\? ''\)\)\.toLowerCase\(\)/,
  // Schema-1 id vocabulary tables (ID.04/05 prep): a rename keeps launcher arcs and suspension families.
  'smokeFan.ts': /const seedId = tankSeedId\(String\(id\)\);\s+for \(const arc of FAMILY_ARCS\) if \(arc\.pattern\.test\(seedId\)\)/,
  'suspensionPatterns.ts': /const id = tankSeedId\(String\(spec\?\.id \|\| ''\)\)\.toLowerCase\(\);/,
  'trackPatterns.ts': /const id = tankSeedId\(String\(spec\?\.id \|\| ''\)\)\.toLowerCase\(\);\s+for \(const \[matcher, patternId\] of FAMILY_RULES\)/,
  'wheelPatterns.ts': /const id = tankSeedId\(String\(spec\?\.id \|\| ''\)\)\.toLowerCase\(\);\s+for \(const \[matcher, patternId\] of PERIOD_RULES\)/,
  '../fx/projectileTracers.ts': /SOVIET_DESIGN\.test\(tankSeedId\(String\(shooter\?\.id \?\? ''\)\)\)/,
  // Gates on the `_x` suffix and names built from an id (hit zones, ERA clusters) keep their schema-1 spelling.
  'additionalFleetSpecs.ts': /const prefix = tankSeedId\(idPrefix\);[\s\S]*merkava_\$\{tankSeedId\(id\)\}_turret_era_R/,
  'profiles/merkava.ts': /const sector = `merkava_\$\{tankSeedId\(id\)\}_turret_era_/,
  'profiles/chineseFrontline.ts': /visualEraCluster\(`\$\{tankSeedId\(variant\)\}-integrated-chevron-front`/,
};
assert.match(readFileSync(new URL('./decorations.ts', import.meta.url), 'utf8'), /\/_x\$\/\.test\(tankSeedId\(spec\.id\)\)/,
  'the source-study rebuild gate reads the schema-1 `_x` suffix');
for (const [file, pattern] of Object.entries(SEEDED)) {
  assert.match(readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'), pattern, `${file} seeds from tankSeedId`);
}
assert.ok(!/key\.split\(''\)\.reduce/.test(readFileSync(new URL('./materials.ts', import.meta.url), 'utf8').replace(/function textureSeedFor[\s\S]*?\n\}/, '')),
  'every texture bake seed goes through textureSeedFor');

// ---- schema 2 (VEH-11): the Warrior MILAN X is the Warrior TES(H)
assert.equal(resolveTankId('fv510_milan_x'), 'warrior_tes_h', 'a schema-1 save, link or scene naming the Warrior MILAN X');
assert.equal(TANK_IDS.resolveIncoming('fv510_milan_x'), 'warrior_tes_h', 'a room seat from a schema-1 build');
assert.equal(tankSeedId('warrior_tes_h'), 'fv510_milan_x', 'the Warrior TES(H) keeps the look it had as the Warrior MILAN X');
assert.equal(resolveTankId('fv510_milan', 1), 'fv510_milan', 'the FV510 Warrior MILAN stays itself');
assert.equal(shownName('warrior_tes_h'), 'Warrior TES(H)');
assert.equal(TANK_SPECS.warrior_tes_h.era, 'modern', 'the Warrior TES(H) plays in the modern era (coordinator, 2026-10-13)');
assert.equal(decorEra(TANK_SPECS.warrior_tes_h), 'cold-war', 'and keeps the Cold War stowage it shipped with');
assert.equal(TANK_SPECS.fv510_milan_x, undefined, 'the retired id names no spec');

// ---- the live registry names the vehicles the owner sees
const shown = shownName;
assert.equal(shown(resolveTankId('leo2a6m', 1)), 'Leopard 2A4 OTCO', 'schema-1 leo2a6m is the vehicle shown as Leopard 2A4 OTCO');
assert.equal(shown(resolveTankId('leo2a6m_x', 1)), 'Leopard 2A6M');
assert.equal(shown(resolveTankId('t90m', 1)), 'T-90AM', 'schema-1 t90m is the vehicle shown as T-90AM');
assert.equal(shown(resolveTankId('t90m_x', 1)), 'T-90M');

console.log(`tankIdAliases selftest: schema ${TANK_ID_SCHEMA} (${TANK_ID_RENAMES.length} landed maps, protocol ${PROTOCOL_VERSION}); `
  + `${SCHEMA_1_IDS.length} schema-1 ids name one live vehicle each; swaps resolve by schema`);

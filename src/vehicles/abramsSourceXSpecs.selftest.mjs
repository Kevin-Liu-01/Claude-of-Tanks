import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// The browser facade registers metadata without evaluating authored profiles.
import { isTankBuilderReady } from './fleetFactory.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import {
  ABRAMS_SOURCE_X_ENTRIES,
  ABRAMS_SOURCE_X_IDS,
  ABRAMS_SOURCE_X_DONORS,
  ABRAMS_SOURCE_X_STATUS,
  createAbramsSourceXSpecs,
  synchronizeAbramsSourceXCombatMetadata,
} from './abramsSourceXSpecs.ts';
import { FLEET_GROUP_BY_ID, FLEET_GROUP_IDS } from './fleetManifest.ts';
import { internalLayoutFor } from './internalLayoutRegistry.ts';
import { tankLabelRecord } from './tankLabels.ts';
import { tankTier } from './tier.ts';
import { vehicleEraForId } from './taxonomy.ts';
import { applyNativeFamilyOrder } from './fleetOrder.ts';
import { ABRAMS_SOURCE_X_FRAME, ABRAMS_SOURCE_X_MEASUREMENTS } from './abramsSourceXDatums.ts';

const expected = [
  ['m1a1_x', 'm1a1', 'M1A1 Abrams X', 'USA', 9],
  ['m1a1ha_x', 'm1a1ha', 'M1A1 Abrams HA X', 'USA', 9],
  ['m1a2_x', 'm1a2', 'M1A2 Abrams X', 'USA', 10],
  ['m1a2_tusk_x', 'm1a2_tusk', 'M1A2 Abrams TUSK X', 'USA', 10],
  ['m1a2_sepv2_x', 'm1a2_sepv2', 'M1A2 Abrams SEPv2 X', 'USA', 10],
  ['m1a2_sepv3_x', 'm1a2_sepv3', 'M1A2 Abrams SEPv3 X', 'USA', 10],
  ['ua_m1a1_x', 'ua_m1a1', 'M1A1 Abrams UA X', 'Ukraine', 9],
];
assert.deepEqual(ABRAMS_SOURCE_X_ENTRIES, expected.map((row) => row.slice(0, 3)));
assert.deepEqual(ABRAMS_SOURCE_X_IDS, expected.map(([id]) => id));
assert.deepEqual(FLEET_GROUP_IDS.abramsSourceX, ABRAMS_SOURCE_X_IDS);

for (const [id, donorId, name, nation, tier] of expected) {
  const spec = TANK_SPECS[id], donor = TANK_SPECS[donorId];
  assert.equal(ALL_TANK_IDS.filter((value) => value === id).length, 1);
  assert.equal(spec.name, name);
  assert.equal(tankLabelRecord(spec).displayName, name);
  assert.equal(spec.nation, nation);
  assert.equal(tankTier(id), tier);
  assert.equal(tankTier(id), tankTier(donorId));
  assert.equal(vehicleEraForId(id), vehicleEraForId(donorId));
  assert.equal(spec.balancePeerOf, donorId);
  assert.equal(ABRAMS_SOURCE_X_DONORS[id], donorId);
  assert.equal(FLEET_GROUP_BY_ID[id], 'abramsSourceX');
  assert.equal(internalLayoutFor(id).layoutKey, 'abrams');
  assert.deepEqual(internalLayoutFor(id).crew, internalLayoutFor(donorId).crew);
  assert.equal(MODEL_SOURCE[id].source, 'procedural');
  assert.equal(spec.community, undefined);
  assert.equal(spec.publicVisualFallback, undefined);
  assert.equal(isTankBuilderReady(id), false, `${id}: metadata import must stay boot-light`);
  assert.notEqual(spec.armor, donor.armor);
  assert.notEqual(spec.gun, donor.gun);
  assert.deepEqual(spec.gun, donor.gun);
  assert.equal(spec.hp, donor.hp);
  assert.deepEqual(spec.sourceStudyStatus, ABRAMS_SOURCE_X_STATUS);
  assert.equal(spec.sourceStudyStatus.qualification, 'pending');
  assert.deepEqual(spec.armor.turretPivot, ABRAMS_SOURCE_X_FRAME.turret);
  assert.deepEqual(spec.armor.gunPivot, ABRAMS_SOURCE_X_FRAME.gun.map((v,i)=>v-ABRAMS_SOURCE_X_FRAME.turret[i]));
  assert.equal(spec.armor.gunBarrel.lengthM,
    ABRAMS_SOURCE_X_MEASUREMENTS.muzzleZ - ABRAMS_SOURCE_X_FRAME.gun[2]);
  assert.equal(spec.dims.hullLengthM, ABRAMS_SOURCE_X_MEASUREMENTS.structuralHullLengthM);
  assert.equal(spec.dims.overallLengthM, ABRAMS_SOURCE_X_MEASUREMENTS.overallLengthM);
  assert.equal(spec.dims.heightM, donor.dims.heightM, 'published height is not fit to the candidate');
  assert.ok(Object.keys(spec.dims).every((key) => !key.startsWith('silhouette')),
    `${id}: no inherited source silhouette result`);
}

// Exercise isolated construction and repeated realistic pre-finalization sync.
// Seed generated donor artifacts deliberately: none may become X evidence.
const donors = structuredClone(TANK_SPECS);
for (const [, donorId] of expected) {
  const donor = donors[donorId];
  donor.armor.collisionShells = { hull: [{ donorOnly: true }], turret: [] };
  donor.armor.bodyContactPoints = { hull: [1, 2, 3], turret: [4, 5, 6] };
  donor.armor.modules[0].parts = [{ min: [0, 0, 0], max: [1, 1, 1] }];
  donor.armor.crew[0].shapes = [{ donorOnly: true }];
  donor.dims.silhouetteHeightM = 123;
  donor.community = { path: '/models/not-a-runtime-source.glb' };
  donor.publicVisualFallback = 'm1a2';
}
const before = structuredClone(donors);
const candidates = createAbramsSourceXSpecs(donors);
assert.deepEqual(donors, before, 'constructing X metadata preserves every existing spec');
const registry = { ...donors, ...candidates };
for (const [id, donorId] of expected) {
  registry[donorId].hp += 17;
  registry[donorId].gun.reloadS += 0.125;
  const dimensions = structuredClone(registry[id].dims);
  synchronizeAbramsSourceXCombatMetadata(registry);
  assert.equal(registry[id].hp, registry[donorId].hp);
  assert.deepEqual(registry[id].gun, registry[donorId].gun);
  assert.deepEqual(registry[id].dims, dimensions, 'combat sync does not replace authored dimensions');
  assert.equal(registry[id].armor.collisionShells, undefined);
  assert.equal(registry[id].armor.bodyContactPoints, undefined);
  assert.equal(registry[id].armor.modules[0].parts, undefined);
  assert.equal(registry[id].armor.crew[0].shapes, undefined);
  assert.equal(registry[id].community, undefined);
  assert.equal(registry[id].publicVisualFallback, undefined);
}
const once = structuredClone(registry);
synchronizeAbramsSourceXCombatMetadata(registry);
assert.deepEqual(registry, once, 'same donor state makes repeated pre-finalization sync idempotent');
assert.throws(() => createAbramsSourceXSpecs({}), /Abrams X combat donor is not registered/);

// Adding this family cannot reorder the existing IDs relative to each other.
const oldIds = ALL_TANK_IDS.filter((id) => !ABRAMS_SOURCE_X_IDS.includes(id));
const reordered = applyNativeFamilyOrder([...oldIds, ...ABRAMS_SOURCE_X_IDS].reverse());
const oldOnly = applyNativeFamilyOrder([...oldIds].reverse());
assert.deepEqual(reordered.filter((id) => !ABRAMS_SOURCE_X_IDS.includes(id)), oldOnly);
for (const id of ['m1_x', 'm1ip_x', 'm1a1_aim_x', 'm1a2_legacy_x', 'm1a3_x', 'abramsx_x']) {
  assert.equal(ABRAMS_SOURCE_X_IDS.includes(id), false, `${id}: outside the approved conventional scope`);
}

// Pin the same independent entry point in eager and lazy paths without
// constructing geometry or accepting a donor builder as an implementation.
const facade = readFileSync(new URL('./fleetFactory.ts', import.meta.url), 'utf8');
const eager = readFileSync(new URL('./profiledProcedurals.ts', import.meta.url), 'utf8');
const metadata = readFileSync(new URL('./abramsSourceXSpecs.ts', import.meta.url), 'utf8');
assert.match(facade, /abramsSourceX:.*import\('\.\/profiles\/abramsSourceX\.ts'\)/);
assert.match(facade, /build: mod\.buildAbramsX/);
assert.doesNotMatch(facade, /from ['"]\.\/profiles\/abramsSourceX\.ts/);
assert.match(eager, /FLEET_GROUP_IDS\.abramsSourceX\.map\(.*build: buildAbramsX/);
assert.doesNotMatch(metadata, /from ['"].*(?:profiles\/|three|\.glb|\.obj)/);
console.log('abramsSourceXSpecs: seven native-only prototype rows, donor balance/identity isolation, exact scope, crew layout and boot-light bindings PASS; geometry and source qualification remain pending');

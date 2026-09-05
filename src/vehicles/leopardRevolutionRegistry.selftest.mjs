import assert from 'node:assert/strict';
import './fleetFactory.ts';
import { TANK_CATALOGS, getSpec } from './specs.ts';
import { FLEET_GROUP_BY_ID } from './fleetManifest.ts';
import { NATIVE_FAMILY_ORDER } from './fleetOrder.ts';
import { internalLayoutFor } from './internalLayoutRegistry.ts';
import { requiredTankAssetFiles, tankAssetMetadata } from './tankAssets.ts';
import { tankTier, tierNumeral } from './tier.ts';
import { vehicleMarkingAnchor } from './vehicleMarkings.ts';

const protoId = 'leo2_revolution_proto';
const revolutionId = 'leo2_revolution';
const proto = getSpec(protoId);
const revolution = getSpec(revolutionId);

for (const [catalog, ids] of Object.entries(TANK_CATALOGS)) {
  for (const id of [protoId, revolutionId]) {
    assert.equal(ids.filter((candidate) => candidate === id).length, 1,
      `${catalog} includes each Revolution identity exactly once`);
  }
}
assert.equal(proto.name, 'Leopard 2 Revolution Proto');
assert.equal(revolution.name, 'Leopard 2 Revolution');
assert.equal(proto.label.shortName, 'Revolution Proto');
assert.ok(proto.label.searchAliases.includes('Leopard 2 Revolution Prototype'));
assert.equal(proto.era, 'modern');
assert.equal(proto.nation, 'Germany');
assert.equal(proto.roster.productionVisible, true);
assert.equal(proto.authorship.geometry, 'first-party-procedural');
assert.equal(proto.publicVisualFallback, undefined);
assert.equal(tankTier(protoId), 9);
assert.equal(tierNumeral(protoId), 'IX');
assert.equal(tankTier(revolutionId), 10);
assert.equal(tierNumeral(revolutionId), 'X');

// This is the preserved model's authored envelope before the rebuild. The
// new Revolution is free to use its own source-derived dimensions.
assert.deepEqual(
  ['hullLengthM', 'overallLengthM', 'widthM', 'heightM'].map((key) => proto.dims[key]),
  [7.72, 9.97, 4, 2.64],
  'the preserved prototype retains the original authored dimensions',
);
assert.equal(proto.variantOf, 'leo2a7', 'prototype retains the original independent donor');
for (const other of [revolution, getSpec('leo2a7')]) {
  for (const key of ['dims', 'armor', 'gun', 'visual', 'terrainResistance']) {
    assert.notEqual(proto[key], other[key], `${key} is not shared with ${other.id}`);
  }
  assert.notEqual(proto.gun.shells[0], other.gun.shells[0], 'shell changes cannot leak into Proto');
  assert.notEqual(proto.armor.hullPlates[0], other.armor.hullPlates[0], 'armor changes cannot leak into Proto');
}
assert.deepEqual(proto.visual, getSpec('leo2a7').visual, 'prototype retains its original paint and number');
const protoMarking = vehicleMarkingAnchor(protoId);
assert.deepEqual(
  ['owner', 'side', 'longitudinal', 'vertical', 'sizeM', 'designationDirection']
    .map((key) => protoMarking[key]),
  ['turret', 'right', 0.34, 0.43, 0.25, -1],
  'prototype preserves the original marking station independently of the rebuild',
);
assert.equal(internalLayoutFor(protoId).layoutKey, 'leopard');
assert.equal(FLEET_GROUP_BY_ID[protoId], 'leopard');
assert.equal(FLEET_GROUP_BY_ID[revolutionId], 'leopard');
assert.equal(NATIVE_FAMILY_ORDER.leopard.indexOf(protoId) + 1,
  NATIVE_FAMILY_ORDER.leopard.indexOf(revolutionId),
  'canonical Leopard progression places the preserved prototype before Revolution');

const protoFiles = Object.values(requiredTankAssetFiles(protoId));
const revolutionFiles = new Set(Object.values(requiredTankAssetFiles(revolutionId)));
assert.ok(protoFiles.every((file) => !revolutionFiles.has(file)),
  'all nine prototype asset paths are distinct from the rebuilt vehicle');
assert.equal(tankAssetMetadata(proto).name, 'Leopard 2 Revolution Proto');
assert.equal(tankAssetMetadata(proto).tierNumeral, 'IX');

console.log('leopardRevolutionRegistry.selftest: separate catalog identities, tiers, mutable specs, and asset paths passed');

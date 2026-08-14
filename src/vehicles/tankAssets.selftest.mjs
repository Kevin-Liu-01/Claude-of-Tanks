import assert from 'node:assert/strict';
import { createTank } from './tankFactory.js';
import { ALL_TANK_IDS, getSpec, RETIRED_EXTERNAL_PLACEHOLDER_IDS } from './specs.js';
import {
  TANK_ASSET_VIEWS, geometryFingerprint, metadataFingerprint, requiredTankAssetFiles, tankAssetMetadata,
} from './tankAssets.js';

assert.equal(Object.keys(TANK_ASSET_VIEWS).length, 8, 'release contract includes eight views/diagrams');

const displayNames = new Set();

for (const id of ALL_TANK_IDS) {
  const spec = getSpec(id);
  assert.equal(spec.community, undefined, `${id}: obsolete community/source credit leaked into selectable spec`);
  assert.notEqual(String(spec.nation || '').toLowerCase(), 'community', `${id}: Community nation is not selectable`);
  assert.equal(spec.authorship?.geometry, 'first-party-procedural', `${id}: first-party geometry authorship`);
  assert.equal(spec.authorship?.runtimeExternalGeometry, false, `${id}: runtime external geometry disabled`);
  assert.equal(spec.publicVisualFallback, undefined, `${id}: own first-party public visuals`);
  const metadata = tankAssetMetadata(spec);
  const files = Object.values(requiredTankAssetFiles(id));
  assert.equal(new Set(files).size, 8, `${id}: asset filenames are unique`);
  assert(Number.isInteger(metadata.tier) && metadata.tier >= 1 && metadata.tier <= 10, `${id}: tier`);
  assert(metadata.tierNumeral, `${id}: Roman tier`);
  assert(metadata.countryCode, `${id}: flag country code`);
  assert.equal(metadata.name, metadata.label.displayName, `${id}: canonical display label`);
  assert(metadata.label.shortName && metadata.label.shortName.length <= 28, `${id}: compact card label`);
  assert.equal(metadata.label.id, id, `${id}: stable id label key`);
  assert(!/\bMk\./.test(metadata.name), `${id}: consistent Mk typography`);
  assert(!displayNames.has(metadata.name), `${id}: unique display label (${metadata.name})`);
  displayNames.add(metadata.name);
  assert(metadata.gun.caliberMm > 0, `${id}: gun caliber`);
  assert(metadata.gun.shells.length > 0, `${id}: penetration data`);
  assert(metadata.armor.plates.length > 0, `${id}: armor hit areas`);
  assert(metadata.armor.modules.length > 0, `${id}: module volumes`);
  assert.equal(metadataFingerprint(metadata), metadataFingerprint(tankAssetMetadata(spec)), `${id}: stable metadata hash`);
}

for (const id of RETIRED_EXTERNAL_PLACEHOLDER_IDS) {
  assert.equal(ALL_TANK_IDS.includes(id), false, `${id}: retired external placeholder is not selectable`);
}

assert.equal(getSpec('m1a2').name, 'M1A2 Abrams', 'Tejas is the canonical M1A2 identity');
assert.equal(getSpec('m1a2_legacy').name, 'M1A2 Abrams (Legacy)', 'former M1A2 retains the legacy identity');
assert.equal(getSpec('m1a1ha').name, 'M1A1 Abrams HA', 'Abrams family naming is consistent');
assert.equal(getSpec('m1a2_sepv3').name, 'M1A2 Abrams SEPv3', 'SEPv3 carries the family name');
assert.equal(ALL_TANK_IDS.includes('m1a2_tejas'), false, 'retired Tejas alias is not selectable');
const canonicalM1A2 = createTank('m1a2', null, { proceduralOnly: true, geometryReceipt: true });
const legacyM1A2 = createTank('m1a2_legacy', null, { proceduralOnly: true, geometryReceipt: true });
assert.notEqual(
  geometryFingerprint(canonicalM1A2.root),
  geometryFingerprint(legacyM1A2.root),
  'canonical and legacy M1A2 ids resolve to distinct procedural profiles',
);
canonicalM1A2.dispose();
legacyM1A2.dispose();

console.log(`tankAssets.selftest: ${ALL_TANK_IDS.length} tanks have tier, flag, gun, hit-area and module metadata`);

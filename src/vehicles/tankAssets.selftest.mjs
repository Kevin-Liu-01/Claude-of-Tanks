import assert from 'node:assert/strict';
import './tankFactory.js';
import { ALL_TANK_IDS, getSpec } from './specs.js';
import {
  TANK_ASSET_VIEWS, metadataFingerprint, requiredTankAssetFiles, tankAssetMetadata,
} from './tankAssets.js';

assert.equal(Object.keys(TANK_ASSET_VIEWS).length, 8, 'release contract includes eight views/diagrams');

for (const id of ALL_TANK_IDS) {
  const spec = getSpec(id);
  const metadata = tankAssetMetadata(spec);
  const files = Object.values(requiredTankAssetFiles(id));
  assert.equal(new Set(files).size, 8, `${id}: asset filenames are unique`);
  assert(Number.isInteger(metadata.tier) && metadata.tier >= 1 && metadata.tier <= 10, `${id}: tier`);
  assert(metadata.tierNumeral, `${id}: Roman tier`);
  assert(metadata.countryCode, `${id}: flag country code`);
  assert(metadata.gun.caliberMm > 0, `${id}: gun caliber`);
  assert(metadata.gun.shells.length > 0, `${id}: penetration data`);
  assert(metadata.armor.plates.length > 0, `${id}: armor hit areas`);
  assert(metadata.armor.modules.length > 0, `${id}: module volumes`);
  assert.equal(metadataFingerprint(metadata), metadataFingerprint(tankAssetMetadata(spec)), `${id}: stable metadata hash`);
}

console.log(`tankAssets.selftest: ${ALL_TANK_IDS.length} tanks have tier, flag, gun, hit-area and module metadata`);

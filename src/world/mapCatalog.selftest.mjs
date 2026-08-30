import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_GARAGE_SKY,
  MAP_IDS,
  getMapName,
} from './maps/catalog.ts';
import { getMapConfig } from './maps/index.ts';

for (const mapId of MAP_IDS) {
  assert.equal(getMapName(mapId), getMapConfig(mapId).name,
    `${mapId} lightweight name must match its full battlefield config`);
}
assert.strictEqual(DEFAULT_GARAGE_SKY, getMapConfig('verdant').sky,
  'Garage fallback and Verdant must share one exact sky object');

const [mainSource, catalogSource] = await Promise.all([
  readFile(new URL('../main.ts', import.meta.url), 'utf8'),
  readFile(new URL('./maps/catalog.ts', import.meta.url), 'utf8'),
]);
assert.match(mainSource, /from '\.\/world\/maps\/catalog\.ts'/,
  'Garage boot must consume only lightweight battlefield identity');
assert.doesNotMatch(mainSource, /from '\.\/world\/maps\/index\.ts'/,
  'Garage boot must not statically transfer every full battlefield config');
assert.doesNotMatch(catalogSource, /from '\.\/[^']*(?:verdant|desert|winter|urban)\.ts'/,
  'the lightweight catalog cannot import a full battlefield module');

console.log(`mapCatalog.selftest: ${MAP_IDS.length} lightweight identities match full configs`);

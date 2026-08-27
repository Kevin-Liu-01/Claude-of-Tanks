import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  addCatalogExterior, addConnectedExterior, exteriorSupportEpsilon,
} from './maps/exteriorDetailKit.js';

const bucketNames = ['plaster', 'plaster2', 'plaster3', 'stone', 'roof', 'wood', 'dark'];
const makeParts = () => Object.fromEntries(bucketNames.map((name) => [name, []]));

for (const [profile, minimum] of [
  ['rural', 13], ['timber', 13], ['urban', 23], ['industrial', 23],
  ['civic', 17], ['desert', 16],
]) {
  const parts = makeParts();
  const receipt = addConnectedExterior(parts, {
    id: `fixture-${profile}`, w: 10, d: 12, wallH: 5, profile, variant: 0,
  });
  assert.ok(receipt.added >= minimum, `${profile}: substantial exterior detail set`);
  assert.ok(receipt.maxSupportGap <= exteriorSupportEpsilon(),
    `${profile}: every exterior part touches a declared support`);
  const authored = Object.values(parts).flat()
    .filter((geo) => geo.userData.structureSupport);
  assert.equal(authored.length, receipt.added, `${profile}: every added geometry has a support receipt`);
  assert.equal(new Set(receipt.records.map(({ part }) => part)).size, receipt.records.length,
    `${profile}: fixture ids are unique within one building`);
}

const catalogParts = makeParts();
catalogParts.wood.push(new THREE.BoxGeometry(7, 3.4, 9).translate(0, 1.7, 0));
const catalogReceipt = addCatalogExterior(catalogParts, {
  id: 'logcabin', info: { w: 7.4, d: 9.4, h: 5.8 }, variant: 2,
});
assert.equal(catalogReceipt.profile, 'timber', 'catalog buildings select a deterministic facade profile');
assert.equal(addCatalogExterior(catalogParts, {
  id: 'logcabin', info: { w: 7.4, d: 9.4, h: 5.8 }, variant: 2,
}), catalogReceipt, 'catalog decoration is idempotent');
assert.deepEqual(Object.keys(catalogParts).sort(), [...bucketNames].sort(),
  'support bookkeeping is non-enumerable and cannot become a material bucket');

console.log('exteriorDetailKit.selftest: connected facade profiles and catalog inference passed');

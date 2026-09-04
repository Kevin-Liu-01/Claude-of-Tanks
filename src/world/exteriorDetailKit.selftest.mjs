import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  addCatalogExterior, addConnectedExterior, exteriorSupportEpsilon,
} from './maps/exteriorDetailKit.ts';
import { auditSkillionRoofPitch } from './propGeometry.ts';

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
  assert.ok(receipt.records.every(({ contactAxes, minContactSpan }) => (
    contactAxes >= 2 && minContactSpan >= 0.012
  )), `${profile}: every exterior part forms an area joint instead of grazing a support corner`);
  const authored = Object.values(parts).flat()
    .filter((geo) => geo.userData.structureSupport);
  assert.equal(authored.length, receipt.added, `${profile}: every added geometry has a support receipt`);
  assert.equal(new Set(receipt.records.map(({ part }) => part)).size, receipt.records.length,
    `${profile}: fixture ids are unique within one building`);
  assert.ok(receipt.records.some(({ part }) => part === 'entry-door'),
    `${profile}: the shared facade pass includes a framed entrance`);
  assert.ok(receipt.added <= 72,
    `${profile}: exterior variety remains bounded before material merging`);
  const pitched = [];
  for (const geo of authored) {
    if (geo.userData.skillionRoofPitch) pitched.push(auditSkillionRoofPitch(geo));
  }
  assert.ok(pitched.length >= 1, `${profile}: rain hood participates in the pitch audit`);
  assert.ok(pitched.every(({ drop }) => drop > 0.01),
    `${profile}: every wall-mounted exterior canopy drains away from the facade`);
  const partIds = new Set(receipt.records.map(({ part }) => part));
  if (profile === 'rural' || profile === 'timber') {
    assert.ok(partIds.has('shutter-head'), `${profile}: timber facade signature`);
  } else if (profile === 'urban' || profile === 'civic') {
    assert.ok(partIds.has('balcony-deck') && partIds.has('balcony-rail'),
      `${profile}: connected balcony signature`);
    assert.ok(partIds.has('facade-bay-1--1') && partIds.has('aperture-head--1'),
      `${profile}: long elevations carry connected bay rhythm and framed apertures`);
  } else if (profile === 'industrial') {
    assert.ok(partIds.has('ladder-rail--1') && partIds.has('ladder-rung-0'),
      `${profile}: connected service ladder signature`);
    assert.ok(partIds.has('side-bay-1--1') && partIds.has('aperture-louver--1-0'),
      `${profile}: industrial elevations carry pilasters and real louvers`);
  } else if (profile === 'desert') {
    assert.ok(partIds.has('buttress--1') && partIds.has('buttress-1'),
      `${profile}: grounded adobe buttress signature`);
    assert.ok(partIds.has('facade-bay-1--1') && partIds.has('aperture-sill-1'),
      `${profile}: desert elevations carry connected bays and recessed openings`);
  }
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

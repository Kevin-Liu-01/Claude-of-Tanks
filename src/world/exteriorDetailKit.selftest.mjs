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
  assert.ok(receipt.added <= 128, // settlement pass 2026-09-12: up to 12 framed panes (6 pieces each) join the fixture set
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

// settlement pass 2026-09-12: bare authored window panes receive jambs, a
// head and a sill (shutters on alternate rural/timber buildings); panes a
// builder already framed, attic panes above the wall and recessed wing panes
// are left alone.
{
  const joinery = (profile, variant, withFrame = false) => {
    const parts = makeParts();
    parts.plaster.push(new THREE.BoxGeometry(8, 3.4, 10).translate(0, 1.7, 0));
    // two bare panes on the +z face, one on the -x face, one attic pane above the wall
    parts.dark.push(new THREE.BoxGeometry(0.8, 1.0, 0.06).translate(-2.2, 1.8, 5.02));
    parts.dark.push(new THREE.BoxGeometry(0.8, 1.0, 0.06).translate(1.6, 1.8, 5.02));
    parts.dark.push(new THREE.BoxGeometry(0.06, 0.9, 0.7).translate(-4.02, 1.7, -1.0));
    parts.dark.push(new THREE.BoxGeometry(0.5, 0.6, 0.06).translate(0, 4.2, 5.02));
    if (withFrame) parts.wood.push(new THREE.BoxGeometry(0.96, 1.16, 0.14).translate(-2.2, 1.8, 5.05));
    const receipt = addConnectedExterior(parts, { id: `joinery-${profile}`, w: 8, d: 10, wallH: 3.4, profile, variant });
    return { parts, receipt, ids: new Set(receipt.records.map(({ part }) => part)) };
  };
  const rural = joinery('rural', 1);
  for (const id of ['window-0-jamb--1', 'window-0-jamb-1', 'window-0-head', 'window-0-sill',
    'window-1-head', 'window-2-head', 'window-0-shutter--1', 'window-0-shutter-1', 'window-1-shutter-1']) {
    assert.ok(rural.ids.has(id), `rural odd variant frames and shutters every bare wall pane: ${id}`);
  }
  assert.ok(!rural.ids.has('window-3-head'), 'attic panes above the wall envelope are not framed');
  assert.ok(!rural.ids.has('window-2-shutter-1'), 'every third pane keeps its shutters off (variety)');
  assert.ok(rural.receipt.records.every(({ part, contactAxes, minContactSpan, gap }) => (
    !part.startsWith('window-') || (gap <= exteriorSupportEpsilon() && contactAxes >= 2 && minContactSpan >= 0.012)
  )), 'every joinery piece carries a real area joint with the wall');
  const even = joinery('rural', 0);
  assert.ok(even.ids.has('window-0-head') && !even.ids.has('window-0-shutter-1'),
    'even rural variants are framed without shutters');
  const civic = joinery('civic', 1);
  assert.ok(civic.ids.has('window-0-head') && !civic.ids.has('window-0-shutter-1'),
    'masonry profiles frame in stone without shutters');
  assert.ok(civic.parts.stone.some((geo) => geo.userData.structureSupport?.part === 'window-0-sill'),
    'masonry joinery lands in the stone bucket');
  const framed = joinery('rural', 1, true);
  const heads = (set) => [...set].filter((id) => /^window-\d+-head$/.test(id)).length;
  assert.equal(heads(rural.ids), 3, 'three bare wall panes are dressed');
  assert.equal(heads(framed.ids), 2, 'a pane the builder already framed is skipped; its neighbours are still dressed');
  assert.ok(!framed.parts.wood.some((geo) => {
    const support = geo.userData.structureSupport;
    if (!support || !/^window-\d+-head$/.test(support.part)) return false;
    geo.computeBoundingBox();
    return Math.abs((geo.boundingBox.min.x + geo.boundingBox.max.x) * 0.5 + 2.2) < 0.3;
  }), 'no second head lands over the builder-framed pane');
  const canvas = joinery('canvas', 1);
  assert.ok(![...canvas.ids].some((id) => id.startsWith('window-')), 'canvas/open profiles carry no joinery');
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

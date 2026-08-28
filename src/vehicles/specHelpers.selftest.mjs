import assert from 'node:assert/strict';
import {
  plate,
  frontPlate,
  moduleBox,
  crewBox,
  shell,
  apfsdsPenetration,
  communityArmor,
  modernArmor,
} from './specHelpers.ts';
import './tankFactory.ts';
import { SAVED_TANK_IDS, TANK_SPECS } from './specs.js';

const quad = plate('test', 40, [0, 0, 0], [2, 0, 0], [0, 3, 1], {
  keMm: 60,
  kind: 'spaced',
  gunFollow: true,
});
assert.deepEqual(quad, {
  name: 'test',
  verts: [[0, 0, 0], [2, 0, 0], [2, 3, 1], [0, 3, 1]],
  physicalMm: 40,
  keMm: 60,
  ceMm: 40,
  kind: 'spaced',
  era: null,
  moduleLink: null,
  gunFollow: true,
});
assert.deepEqual(frontPlate('front', 30, 2, 1, 4, 3, 2), {
  name: 'front',
  verts: [[-2, 1, 4], [2, 1, 4], [2, 3, 2], [-2, 3, 2]],
  physicalMm: 30,
  keMm: 30,
  ceMm: 30,
  kind: 'main',
  era: null,
  moduleLink: null,
  gunFollow: false,
});
assert.deepEqual(moduleBox('engine', [-1, 0, -2], [1, 1, 0]), {
  module: 'engine', min: [-1, 0, -2], max: [1, 1, 0], turretLocal: false,
});
assert.deepEqual(crewBox('gunner', [0, 0, 0], [1, 1, 1], true), {
  crew: 'gunner', min: [0, 0, 0], max: [1, 1, 1], turretLocal: true,
});
assert.deepEqual(shell('Round', 'APFSDS', 120, 600, 550, 500, 1600, { pen2000Mm: 500 }), {
  name: 'Round', type: 'APFSDS', caliberMm: 120,
  pen100Mm: 600, pen1000Mm: 550, dmg: 500, velocityMps: 1600,
  moduleDmg: 120, tracer: 'APFSDS', pen2000Mm: 500,
});
assert.deepEqual(shell('Missile', 'HEAT', 152, 800, 800, 560, 300, { guided: true }), {
  name: 'Missile', type: 'HEAT', caliberMm: 152,
  pen100Mm: 800, pen1000Mm: 800, dmg: 560, velocityMps: 300,
  moduleDmg: 152, tracer: 'HEAT', guided: true,
});
assert.deepEqual(apfsdsPenetration(460), [562, 511, 460]);

const communityInput = {
  lenM: 8, widM: 4, hgtM: 3, turretPivot: [0, 1.4, 0], gunPivot: [0, 0.3, 0.5],
  barrelLenM: 5, barrelRadM: 0.08, frontMm: 80, sideMm: 40, rearMm: 30,
  roofMm: 20, tFrontMm: 100, tSideMm: 50, tRearMm: 30, mantletMm: 120,
  turretless: true,
};
const communityDefault = communityArmor(communityInput);
assert.equal(communityDefault.turretless, true);
assert.equal(communityDefault.turretPlates[0].verts[0][2], 2);
const communityLegacy = communityArmor(communityInput, {
  exposeTurretless: false,
  allowTurretless: false,
});
assert.equal(Object.hasOwn(communityLegacy, 'turretless'), false);
assert.equal(communityLegacy.turretPlates[0].verts[0][2], 1.24);

const armor = modernArmor({
  hl: 3.4, hw: 1.7, inW: 1.1, floor: 0.4, trkTop: 1.1, roofY: 1.6,
  turretPivot: [0, 1.6, 0.1], gunPivot: [0, 0.35, 0.8],
  barrelLenM: 5.2, barrelRadM: 0.08,
  glacis: [80, 400, 500], lower: [60, 100, 120], side: [40, 50, 60],
  skirt: [10, 20, 200], rear: 30, roof: 20,
  tw: 1.0, tFrontZ: 1.3, tRearZ: -1.2, tH: 0.7,
  cheek: [120, 500, 700], tSide: [50, 80, 100], tRear: 30, tRoof: 20,
  mantlet: [100, 400, 600], loader: true, bustleAmmo: true,
});
assert.equal(armor.hullPlates.length, 12);
assert.equal(armor.turretPlates.length, 7);
assert.equal(armor.modules.length, 9);
assert.equal(armor.crew.length, 4);
assert.equal(armor.modules.find((entry) => entry.module === 'ammoRack').turretLocal, true);
assert.equal(armor.hullPlates.find((entry) => entry.name === 'skirt_R').ceMm, 200);
assert.equal(armor.turretPlates.find((entry) => entry.name === 'mantlet').gunFollow, true);

const bradleyCannon = TANK_SPECS.m2a2_bradley.gun.shells[0];
assert.equal(bradleyCannon.velocityMps, 1345, 'ordinary cannon velocity is unchanged');
assert.equal(Object.hasOwn(bradleyCannon, 'authoredVelocityMps'), false,
  'balance metadata does not leak onto ordinary shells');

console.log('specHelpers.selftest: shared armor and shell constructors passed');

// The package test command already owns this stable entrypoint. Chain the
// fleet-wide balance gate here so new spec packs cannot bypass it.
await import('./fleetBalance.selftest.mjs');

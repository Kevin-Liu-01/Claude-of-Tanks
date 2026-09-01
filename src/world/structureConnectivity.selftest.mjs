import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VILLAGE_BUILDERS } from './maps/villageKit.ts';
import { URBAN_BUILDERS } from './maps/urbanKit.ts';
import { STRUCTURE_BUILDERS } from './maps/structureKit.ts';
import { DESTRUCTIBLE_TYPES } from './maps/inhabitKit.ts';
import { auditSkillionRoofPitch } from './propGeometry.ts';
import { certifyGroundedStructureParts } from './structureConnectivity.ts';

const BUCKET_NAMES = [
  'plaster', 'plaster2', 'plaster3', 'stone', 'roof', 'wood', 'dark',
  'glass', 'curtain', 'straw', 'baked',
];

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const entries = [
  ...Object.entries(VILLAGE_BUILDERS),
  ...Object.entries(URBAN_BUILDERS),
  ...Object.entries(STRUCTURE_BUILDERS),
];
assert.equal(entries.length, 41, 'all heavyweight and site structure families are certified');
assert.equal(new Set(entries.map(([id]) => id)).size, entries.length,
  'structure registries cannot silently replace a duplicate family id');

const pitchedFamilies = new Set();
let upwardConeSpireCount = 0;

function endSpan(geometry, upper) {
  const position = geometry.attributes.position;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < position.count; i++) {
    minY = Math.min(minY, position.getY(i));
    maxY = Math.max(maxY, position.getY(i));
  }
  const y = upper ? maxY : minY;
  const epsilon = Math.max(1e-5, (maxY - minY) * 0.03);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < position.count; i++) {
    if (Math.abs(position.getY(i) - y) > epsilon) continue;
    minX = Math.min(minX, position.getX(i));
    maxX = Math.max(maxX, position.getX(i));
    minZ = Math.min(minZ, position.getZ(i));
    maxZ = Math.max(maxZ, position.getZ(i));
  }
  return Math.max(maxX - minX, maxZ - minZ);
}

for (const seed of [0x51a7c7, 0xa1139e]) {
  for (const [id, build] of entries) {
    const buckets = Object.fromEntries(BUCKET_NAMES.map((name) => [name, []]));
    const dimensions = build(seeded(seed), buckets, 'plaster');
    const geometries = Object.values(buckets).flat();
    const receipt = certifyGroundedStructureParts(id, geometries);
    assert.equal(receipt.connected, geometries.length,
      `${id}: every authored part reaches a grounded support chain`);
    assert.ok(receipt.groundSupported >= 1, `${id}: at least one part reaches the ground`);
    assert.ok(receipt.maxConnectionGap <= receipt.epsilon,
      `${id}: fixture gaps stay within the construction tolerance`);
    assert.ok(dimensions.w > 1 && dimensions.d > 1 && dimensions.h > 2,
      `${id}: finite battlefield-scale dimensions`);
    for (const geometry of geometries) {
      if (geometry.type === 'ConeGeometry') {
        assert.ok(endSpan(geometry, false) > endSpan(geometry, true) + 0.1,
          `${id}: conical roof spire has its broad base below its point`);
        upwardConeSpireCount++;
      }
      if (!geometry.userData.skillionRoofPitch) continue;
      const pitch = auditSkillionRoofPitch(geometry);
      assert.ok(pitch.drop > 0.01,
        `${id}: wall-mounted roof drains toward its unsupported edge`);
      pitchedFamilies.add(id);
    }
  }
}

assert.ok(upwardConeSpireCount >= 18,
  'all heavyweight/site conical roof spires are audited across both seeded variants');

for (const id of ['farmhouse', 'compound', 'tavern', 'schoolhouse', 'caravanserai', 'rangerlodge']) {
  assert.ok(pitchedFamilies.has(id), `${id}: side-roof orientation participates in the map-wide audit`);
}

const streetlamp = DESTRUCTIBLE_TYPES.lamp.build(seeded(0x1a4f));
const lampConnectivity = streetlamp.userData.structureConnectivity;
assert.equal(lampConnectivity.id, 'streetlamp', 'streetlight carries an attachment receipt');
assert.equal(lampConnectivity.connected, lampConnectivity.parts,
  'streetlight pole, elbow, arm, neck, housing, cap, and lens form one supported assembly');
assert.ok(lampConnectivity.maxConnectionGap <= 0.025,
  'streetlight joints stay inside the strict furniture attachment tolerance');
const lampAttachments = streetlamp.userData.streetFurnitureAttachment;
assert.equal(lampAttachments.id, 'streetlamp');
assert.equal(lampAttachments.parts, 8,
  'streetlight attachment receipt covers pole, collar, elbow, arm, neck, housing, cap, and lens');
assert.ok(lampAttachments.records.every(({ gap }) => gap <= lampAttachments.epsilon),
  'every named streetlight fixture reaches its intended local support');
assert.deepEqual(lampAttachments.records.map(({ part, support }) => [part, support]), [
  ['base-collar', 'pole'], ['elbow', 'pole'], ['arm', 'elbow'],
  ['drop-neck', 'arm'], ['housing', 'drop-neck'],
  ['cap', 'housing'], ['lens', 'housing'],
], 'streetlight audit names every visible load-path joint');
assert.ok((streetlamp.index?.count || streetlamp.attributes.position.count) / 3 <= 180,
  'the repaired streetlight stays a sub-180-triangle instanced prop');

const floor = new THREE.BoxGeometry(2, 0.2, 2).translate(0, 0, 0);
const floating = new THREE.BoxGeometry(0.4, 0.4, 0.4).translate(0, 2, 0);
assert.throws(
  () => certifyGroundedStructureParts('floating-fixture', [floor, floating]),
  /1 floating authored part \(1\)/,
  'the authoring gate rejects a fixture that cannot reach ground or another support',
);

console.log(`structureConnectivity.selftest: 41 heavyweight/site families × 2 variants grounded; ${pitchedFamilies.size} pitched families + streetlight load path audited`);

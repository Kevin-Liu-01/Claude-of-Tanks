import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VILLAGE_BUILDERS } from './maps/villageKit.ts';
import { URBAN_BUILDERS } from './maps/urbanKit.ts';
import { STRUCTURE_BUILDERS } from './maps/structureKit.ts';
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
  }
}

const floor = new THREE.BoxGeometry(2, 0.2, 2).translate(0, 0, 0);
const floating = new THREE.BoxGeometry(0.4, 0.4, 0.4).translate(0, 2, 0);
assert.throws(
  () => certifyGroundedStructureParts('floating-fixture', [floor, floating]),
  /1 floating authored part \(1\)/,
  'the authoring gate rejects a fixture that cannot reach ground or another support',
);

console.log('structureConnectivity.selftest: 41 heavyweight/site families × 2 variants are grounded');

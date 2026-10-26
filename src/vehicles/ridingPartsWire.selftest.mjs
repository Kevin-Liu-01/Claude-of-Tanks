// ridingPartsWire.selftest.mjs — the riding parts' wire (UI-LOCKDOWN E, 2026-10-25): an entry a worker posts rebuilds
// the same geometry (attributes, index, groups, draw range, bounds, user data), a seed never replaces an entry a build
// filled, and a key names its public fitting and options. The fleet-wide proof (every tank built from seeded entries
// matches the geometry ledger) runs beside the stage receipts: ~/cot-launch-state/streams/frontend-e/riding/proof.mjs.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RIDING_CRADLE_PARTS, RIDING_STATION_PARTS } from './ridingPartsCache.ts';
import { ridingPartKeys, ridingPartsSource, ridingPartsTransfer, ridingPartsWire, seedRidingParts } from './ridingPartsWire.ts';

const part = () => {
  const geometry = new THREE.BoxGeometry(0.1, 0.2, 0.3).toNonIndexed();
  geometry.setIndex([0, 1, 2, 3, 4, 5]);
  geometry.addGroup(0, 6, 1);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = 'cradle cheek';
  geometry.userData = { ammoCartridge: true, slots: [1, 2] };
  return geometry;
};
const key = '{"cls":"m2","ridingCradle":true,"working":true}';
const fit = { stroke: 0.04, shieldDrop: 0.012, ringDrop: 0.002 };
RIDING_CRADLE_PARTS.set(key, { parts: [[['detail', [part()]]], [['dark', [part(), part()]]]], fit });

const wire = ridingPartsWire(key);
assert.ok(wire && wire.fit && wire.sets.length === 2);
assert.ok(ridingPartsTransfer(wire).length >= 3, 'each geometry\'s arrays travel without a copy');
assert.equal(seedRidingParts(wire), false, 'an entry a build filled keeps its own');
const original = RIDING_CRADLE_PARTS.get(key);
RIDING_CRADLE_PARTS.delete(key);
assert.equal(seedRidingParts(structuredClone(wire)), true);
const seeded = RIDING_CRADLE_PARTS.get(key);
assert.deepEqual(seeded.fit, fit);
const [a] = original.parts[1][0][1], [b] = seeded.parts[1][0][1];
for (const name of Object.keys(a.attributes)) {
  assert.deepEqual([...b.getAttribute(name).array], [...a.getAttribute(name).array], `${name} rebuilt exactly`);
  assert.equal(b.getAttribute(name).itemSize, a.getAttribute(name).itemSize);
}
assert.deepEqual([...b.index.array], [...a.index.array]);
assert.deepEqual(b.groups, a.groups);
assert.deepEqual(b.drawRange, a.drawRange);
assert.ok(b.boundingBox.equals(a.boundingBox) && b.boundingSphere.equals(a.boundingSphere));
assert.equal(b.name, 'cradle cheek');
assert.deepEqual(b.userData, a.userData);

RIDING_STATION_PARTS.set(`americanRws:${key}`, [[['detail', [part()]]]]);
const station = ridingPartsWire(`americanRws:${key}`);
assert.equal(station.fit, null, 'a station carries no cradle fit');
assert.deepEqual(ridingPartKeys().sort(), [key, `americanRws:${key}`].sort());

assert.deepEqual(ridingPartsSource(key), { fitting: 'pintleMG', options: { cls: 'm2', ridingCradle: true, working: true } });
assert.equal(ridingPartsSource(`americanM2:${key}`).fitting, 'americanM2');
assert.equal(ridingPartsSource(`openYokeRws:${key}`).fitting, 'openYokeRws');
assert.equal(ridingPartsSource('unknown:{}'), null);
console.log('ridingPartsWire.selftest: the wire rebuilds every geometry exactly, a seed never replaces a built entry, keys name their fittings');

// auxiliaryInventoryCodec.ts (host-fleet-bytes-278): the auxiliary inventory's compact form gives every record back exactly
// (vehicle order, keys in order, every number by Object.is, fresh arrays), keeps a mirrored smoke set as its first half,
// shares smoke sets and weapon bodies (the roof-gun table's bodies first), refuses what it cannot give back, and the
// committed module is the one the encoder writes for its own table. The size is pinned too: the plain table was 488 kB of
// the host Worker's static source (src/mp/host/hostFleet.selftest.mjs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeAuxiliaryInventory, encodeAuxiliaryInventory, auxiliaryInventoryModuleSource, roofGunTableOf } from './auxiliaryInventoryCodec.ts';
import { encodeAuxiliaryRoofGuns } from './auxiliaryRoofGunsCodec.ts';
import { AUXILIARY_INVENTORY } from './auxiliaryInventory.generated.ts';
import { AUXILIARY_ROOF_GUN_BODIES } from './auxiliaryRoofGuns.generated.ts';

const tagged = (value) => JSON.stringify(value, (_k, v) => (Object.is(v, -0) ? '-0' : v));
const exact = (a, b) => tagged(a) === tagged(b);
const gun = (extra = {}) => ({
  collisionParts: [{ min: [-0.083, -0.0914, -0.266], max: [0.1126, 0.0728, 0.6409] }], name: 'fitting_m240', owner: 'turret',
  position: [0.98, 0.723, -0.2], caliberMm: 7.62, muzzle: [0, 0.21436500000000003, 0.68531], pivot: [0, 0.21036500000000002, 0.04446],
  scale: [1, 1, 1], rotation: [0, 0.017499106784510804, 0, 0.9998468789078379], ...extra,
});
const tube = (owner, position, direction) => ({ owner, position, direction });
const pair = [tube('turret', [-1.5382, 0.4753, 0.8165], [-0.2653, 0.3972, 0.8786]), tube('turret', [-1.6295, 0.4575, 0.7798], [-0.5701, 0.3972, 0.7192])];
const mirrored = [...pair, ...pair.map((t) => tube(t.owner, [-t.position[0], t.position[1], t.position[2]], [-t.direction[0], t.direction[1], t.direction[2]]))];
const table = {
  a: { turretPivot: [0, 1.632, 0.35], smoke: mirrored, guns: [gun()], lights: true },
  b: { turretPivot: [0, 1.632, 0.35], smoke: mirrored, guns: [gun({ position: [-0.7, 0.81, 0.25], owner: 'hull' })], lights: false },
  c: { turretPivot: [0.123456789, 1, 0], smoke: [tube('hull', [1, 2, 3.33333], [0, 1, 0])], guns: [], lights: true },
  d: { smoke: [tube('turret', [1, 0, 0], [0, 0, 1]), tube('hull', [-1, 0, 0], [0, 0, 1])], guns: [gun({ collisionParts: [] }), gun({ yawArc: [-1.2, 0.9] })], lights: true },
  e: { turretPivot: [0, 1, 0], smoke: [], guns: [gun({ depressionByYaw: [[-0.5, -0.1], [0.5, -0.05]] })], lights: false },
};
const encoded = encodeAuxiliaryInventory(table);
assert.equal(encoded.smokeSets.length, 3, 'one set per distinct launcher layout: a and b share theirs');
assert.equal(encoded.smokeSets[0][1], 1, 'a set whose second half mirrors its first in x keeps the first half');
assert.equal(encoded.smokeSets[0][3].length, 12, 'two tubes of six numbers, not four');
assert.equal(encoded.smokeSets[0][2], 1, 'exact coordinates go as integers of 1/10000 m');
assert.equal(encoded.smokeSets[1][2], 0, 'a coordinate with more decimals keeps the set as written');
assert.equal(encoded.smokeSets[2][0], '01', 'tubes on the turret and the hull keep an owner each');
assert.deepEqual(encoded.rows[2][1], [[0.123456789, 1, 0]], 'an inexact pivot is kept as written');
assert.equal(encoded.rows[3][1], 0, 'no pivot, no key');
assert.equal(encoded.guns[0][0], encoded.guns[1][0], 'two vehicles mounting one fitting share its body');
assert.deepEqual(encoded.bodies.slice(0, encoded.roofBodies.length), encoded.roofBodies, 'the roof-gun table\'s bodies come first');
const back = decodeAuxiliaryInventory(encoded.smokeSets, encoded.bodies, encoded.guns, encoded.rows);
assert.ok(exact(back, table), 'every record comes back exactly, in its key order');
assert.deepEqual(Object.keys(back), Object.keys(table), 'in the vehicle order');
assert.notEqual(back.a.smoke[0].position, back.b.smoke[0].position, 'no two vehicles share an array');
assert.throws(() => encodeAuxiliaryInventory({ x: { ...table.a, smoke: [tube('cupola', [0, 0, 0], [0, 0, 1])] } }), /owner/);
assert.throws(() => encodeAuxiliaryInventory({ x: { ...table.a, guns: [{ name: 'n', ...gun() }] } }), /keys/, 'an unexpected key order is refused');

// the committed table: its module is exactly what the encoder writes for it, on the committed roof-gun bodies
const path = new URL('./auxiliaryInventory.generated.ts', import.meta.url);
assert.equal(readFileSync(path, 'utf8'), auxiliaryInventoryModuleSource(AUXILIARY_INVENTORY), 'the committed module is the encoder\'s');
assert.ok(exact(AUXILIARY_ROOF_GUN_BODIES, encodeAuxiliaryRoofGuns(roofGunTableOf(AUXILIARY_INVENTORY)).bodies),
  'the roof-gun table the inventory points into is the one its own rows imply');
const committed = encodeAuxiliaryInventory(AUXILIARY_INVENTORY);
assert.ok(exact(decodeAuxiliaryInventory(committed.smokeSets, committed.bodies, committed.guns, committed.rows), AUXILIARY_INVENTORY));
const plain = JSON.stringify(AUXILIARY_INVENTORY).length, bytes = readFileSync(path).length;
assert.ok(bytes < plain * 0.25, `the compact module is under a quarter of the plain table (${bytes} of ${plain} bytes)`);

console.log(`auxiliaryInventoryCodec.selftest: ${Object.keys(AUXILIARY_INVENTORY).length} vehicles, ${committed.smokeSets.length} smoke sets (${committed.smokeSets.filter((set) => set[1]).length} mirrored), ${committed.bodies.length - committed.roofBodies.length} weapon bodies beyond the roof table's ${committed.roofBodies.length}; module ${bytes} of ${plain} bytes, every record back exactly`);

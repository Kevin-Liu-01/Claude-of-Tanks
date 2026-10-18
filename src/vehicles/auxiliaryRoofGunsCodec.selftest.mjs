// auxiliaryRoofGunsCodec.ts (2026-10-16, the perf lane): the roof-gun table's compact form gives every record back
// exactly (keys in order, every number by Object.is), shares a weapon body between the vehicles that mount it, and refuses
// a table it cannot give back.
import assert from 'node:assert/strict';
import { decodeAuxiliaryRoofGuns, encodeAuxiliaryRoofGuns, auxiliaryRoofGunsModuleSource } from './auxiliaryRoofGunsCodec.ts';
import { AUXILIARY_ROOF_GUNS } from './auxiliaryRoofGuns.generated.ts';

const exact = (a, b) => JSON.stringify(a, (_k, v) => (Object.is(v, -0) ? '-0' : v)) === JSON.stringify(b, (_k, v) => (Object.is(v, -0) ? '-0' : v));
const part = (min, max) => ({ min, max });
const gun = (extra = {}) => ({
  collisionParts: [part([-0.083, -0.0914, -0.266], [0.1126, 0.0728, 0.6409])], name: 'fitting_m240', owner: 'turret',
  position: [0.98, 0.723, -0.2], caliberMm: 7.62, muzzle: [0, 0.21436500000000003, 0.68531], pivot: [0, 0.21036500000000002, 0.04446],
  scale: [1, 1, 1], rotation: [0, 0.017499106784510804, 0, 0.9998468789078379], ...extra,
});
const table = {
  a: gun(),
  b: gun({ position: [-0.7, 0.81, 0.25], owner: 'hull' }),
  c: gun({ name: 'fitting_odd', collisionParts: [part([0.123456789, 0, 0], [1, 1, 1])], scale: [1.2, 1, 1] }),
  d: gun({ yawArc: [-1.2, 0.9] }),
  e: gun({ depressionByYaw: [[-0.5, -0.1], [0.5, -0.05]] }),
  f: gun({ yawArc: [-0, 1], depressionByYaw: [[0, -0.2]] }),
};
const { bodies, rows } = encodeAuxiliaryRoofGuns(table);
assert.equal(bodies.length, 2, 'one body per distinct weapon: the shared M240 and the odd one');
assert.equal(rows[0][1], rows[1][1], 'two vehicles mounting one fitting share its body');
assert.equal(bodies[0][5], 1, 'exact corners go as integers of 1/10000 m');
assert.equal(bodies[1][5], 0, 'a corner with more decimals keeps every corner as written');
const back = decodeAuxiliaryRoofGuns(bodies, rows);
assert.ok(exact(back, table), 'every record comes back exactly, in its key order');
assert.notEqual(back.a.collisionParts, back.b.collisionParts, 'no two vehicles share an array');
assert.throws(() => encodeAuxiliaryRoofGuns({ x: { ...gun(), owner: 'cupola' } }), /owner/);
assert.throws(() => encodeAuxiliaryRoofGuns({ x: { name: 'n', ...gun() } }), /keys/, 'an unexpected key order is refused');

// the committed table: its compact module gives back what the inventory generator wrote
const source = auxiliaryRoofGunsModuleSource(AUXILIARY_ROOF_GUNS);
assert.match(source, /export const AUXILIARY_ROOF_GUNS = decodeAuxiliaryRoofGuns\(BODIES, ROWS\);/);
const committed = encodeAuxiliaryRoofGuns(AUXILIARY_ROOF_GUNS);
assert.ok(exact(decodeAuxiliaryRoofGuns(committed.bodies, committed.rows), AUXILIARY_ROOF_GUNS));
const json = JSON.stringify(AUXILIARY_ROOF_GUNS).length, compact = JSON.stringify(committed.bodies).length + JSON.stringify(committed.rows).length;
assert.ok(compact < json * 0.6, `the compact form is much smaller than the plain table (${compact} of ${json} characters)`);

console.log(`auxiliaryRoofGunsCodec.selftest: ${Object.keys(AUXILIARY_ROOF_GUNS).length} roof guns, ${committed.bodies.length} weapon bodies; compact ${compact} of ${json} characters, every record back exactly`);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStructureSupportField, structureTopAt, SUPPORT_MIN_HEIGHT_M, SUPPORT_STEP_UP_M } from './structureSupport.ts';
import { pointInsideCollisionRecord } from '../world/collision.ts';

// Round 30 (owner 2026-09-20): a hull above a building's roof stands on it instead of falling through the footprint
// and being shoved out sideways; hulls beside or inside a part keep the ground OBB solver.
const rec = (min, max, shape2, extra = {}) => ({ min, max, shape2, ...extra });
const aabb = rec([10, 0, 10], [20, 6, 20], undefined);
const obb = rec([28, 0, 8], [42, 5, 22], { kind: 'obb', cx: 35, cz: 15, hw: 3, hl: 6, yaw: Math.PI / 2 }); // long axis along x
const convex = rec([50, 0, 10], [60, 4, 20], { kind: 'convex', cx: 55, cz: 15, points: [50, 10, 60, 10, 60, 20, 50, 20] });
const compound = rec([70, 0, 10], [90, 12, 30], { kind: 'compound', cx: 80, cz: 20, parts: [
  { kind: 'obb', cx: 75, cz: 20, hw: 5, hl: 10, yaw: 0, y0: 0, y1: 12 },   // tower 12 m
  { kind: 'obb', cx: 85, cz: 20, hw: 5, hl: 10, yaw: 0, y0: 0, y1: 4 },    // low wing 4 m
] });
const kerb = rec([0, 0, 0], [4, 0.4, 4], undefined);
const crushed = rec([100, 0, 0], [110, 5, 10], undefined, { crushed: true });
const sandbags = rec([120, 0, 0], [130, 1.1, 10], undefined, { crushable: true });
const records = [aabb, obb, convex, compound, kerb, crushed, sandbags];

// --- point containment per primitive kind
assert.equal(pointInsideCollisionRecord(aabb, null, 15, 15), true);
assert.equal(pointInsideCollisionRecord(aabb, null, 21, 15), false);
assert.equal(pointInsideCollisionRecord(obb, obb.shape2, 40, 15), true, 'inside the long axis of a rotated box');
assert.equal(pointInsideCollisionRecord(obb, obb.shape2, 35, 19), false, 'outside the short axis');
assert.equal(pointInsideCollisionRecord(convex, convex.shape2, 55, 15), true);
assert.equal(pointInsideCollisionRecord(convex, convex.shape2, 61, 15), false);
assert.equal(pointInsideCollisionRecord(compound, compound.shape2.parts[0], 72, 25), true);
assert.equal(pointInsideCollisionRecord(compound, compound.shape2.parts[1], 72, 25), false);

// --- tops: only parts the belly is not below, only tall enough, never crushed
assert.equal(structureTopAt(records, records.length, 15, 15, 6.2), 6, 'a hull at roof height stands on the aabb top');
assert.equal(structureTopAt(records, records.length, 15, 15, 5.7), 6, `a hull up to ${SUPPORT_STEP_UP_M} m below a top still steps onto it`);
assert.equal(structureTopAt(records, records.length, 15, 15, 2), -Infinity, 'a hull well below the top is beside/inside the box: the OBB solver owns it');
assert.equal(structureTopAt(records, records.length, 40, 15, 5), 5, 'rotated box top');
assert.equal(structureTopAt(records, records.length, 55, 15, 4), 4, 'convex top');
assert.equal(structureTopAt(records, records.length, 72, 20, 12), 12, 'compound: the tower part');
assert.equal(structureTopAt(records, records.length, 85, 20, 4), 4, 'compound: the low wing has its own top');
assert.equal(structureTopAt(records, records.length, 85, 20, 12), 4, 'a hull high above the wing still sees only the wing top under it');
assert.equal(structureTopAt(records, records.length, 2, 2, 1), -Infinity, `a ${kerb.max[1]} m kerb is not standable (SUPPORT_MIN_HEIGHT_M ${SUPPORT_MIN_HEIGHT_M})`);
assert.equal(structureTopAt(records, records.length, 105, 5, 6), -Infinity, 'a crushed record never supports');
assert.equal(structureTopAt(records, records.length, 125, 5, 0.6), -Infinity, 'crushable cover (a 1.1 m sandbag wall) is crushed, never stood on');
assert.equal(structureTopAt(records, records.length, 200, 200, 6), -Infinity);

// --- the field: terrain plus tops, candidates gathered per hull, ground type passes through
let queries = 0;
const terrain = { getHeightAt: (x, z) => 0.5 + x * 0.001, getHeightAtFast: (x, z) => 0.5 + x * 0.001, getGroundType: () => 'dirt' };
const source = { queryObstacles: (minX, minZ, maxX, maxZ, out) => { queries += 1; for (const r of records) if (!(r.max[0] < minX || r.min[0] > maxX || r.max[2] < minZ || r.min[2] > maxZ)) out.push(r); return out; } };
const field = createStructureSupportField(terrain, source);
assert.equal(field.getHeightAt(15, 15), terrain.getHeightAt(15, 15), 'no hull selected: plain terrain');
field.beginHull(15, 15, 6.1);
assert.equal(queries, 1); assert.ok(field.candidateCount >= 1);
assert.equal(field.getHeightAt(15, 15), 6, 'the roof is the floor under a hull standing on it');
assert.equal(field.getHeightAtFast(15, 15), 6, 'the fast sampler agrees');
assert.equal(field.getHeightAt(25, 15), terrain.getHeightAt(25, 15), 'off the roof edge the terrain is the floor (the hull falls)');
assert.equal(field.getGroundType(15, 15), 'dirt');
field.beginHull(15, 15, 1.0);
assert.equal(field.getHeightAt(15, 15), terrain.getHeightAt(15, 15), 'a hull inside/beside the box rides the terrain');
field.beginHull(300, 300, 1.0);
assert.equal(field.candidateCount, 0);
assert.equal(field.getHeightAt(15, 15), terrain.getHeightAt(15, 15));
// getObstacles fallback
const field2 = createStructureSupportField(terrain, { getObstacles: () => records });
field2.beginHull(72, 20, 12.2);
assert.equal(field2.getHeightAt(72, 20), 12);

// --- wiring: both sims ride the support field
const state = readFileSync(new URL('../game/state.ts', import.meta.url), 'utf8');
assert.match(state, /support\.beginHull\(entity\.state\.pos\.x, entity\.state\.pos\.z,\n\s*entity\.state\.pos\.y \+ \(entity\.contactGeom\?\.bottomYM \?\? 0\)\);\n\s*updateTank\(entity, support, SIM_DT, collider\.collide\);/,
  'the solo step selects the hull and rides the support field');
const authority = readFileSync(new URL('./authoritativeMatch.ts', import.meta.url), 'utf8');
assert.match(authority, /structureSupport\.beginHull\(entity\.state\.pos\.x, entity\.state\.pos\.z, entity\.state\.pos\.y\);\n\s*updateTank\(entity, structureSupport, dt, collideMovingEntity\);/,
  'the authority rides the same field');
console.log('structureSupport.selftest: containment per primitive, standable tops, field composition and sim wiring');

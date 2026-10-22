// structureDeferredMeasure.selftest.mjs — a structure's damage measures (its intact reading and its drawn enclosure) are
// made once, off its parts, when first asked for or by the idle measurer, never in the props build (destruction-slabs 227
// round 4; the engineering critic: the build ran 7.7-11 % slower than main, the two measures a ninth of an urban build):
//   - described, the anatomy carries neither until asked; asked, both come from the parts as described;
//   - placed in the world since (props.ts mergeInto transforms the parts in place), they are read back through the
//     placement: the same enclosure and intact reading as the parts in their body frame give;
//   - the idle measurer measures what is left, a slice at a time, and holds one map's parts at most.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { describeStructure, measureDeferredStructures } from './structureDamageSeam.ts';

/** A box's triangles (non-indexed). */
function box(x0, y0, z0, x1, y1, z1) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed();
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}
/**
 * A 10 x 6 m house of 0.3 m walls, 6 m high, a door in its front, a flat roof deck (11.3 x 7.6 m: no wall face on an
 * enclosure cell's edge, where a float's last bit read back would move it a cell).
 */
function houseParts() {
  const t = 0.3, h = 6;
  const deck = new THREE.PlaneGeometry(11.3, 7.6).toNonIndexed();
  deck.rotateX(-Math.PI / 2); deck.translate(0, 6.1, 0);
  return {
    stone: [box(-5, 0, 2.7, -0.6, h, 3), box(0.6, 0, 2.7, 5, h, 3), box(-0.6, 2.2, 2.7, 0.6, h, 3), box(-5, 0, -3, 5, h, -3 + t),
      box(-5, 0, -3, -5 + t, h, 3), box(5 - t, 0, -3, 5, h, 3)],
    roof: [deck],
  };
}
const placement = { x: 31.5, y: 2.25, z: -12.75, yaw: 0.7 };
const describe = (parts, mapId) => describeStructure({ structureIdx: 1, mapId, builder: 'house', style: null, parts, w: 10, d: 6, h: 6.1,
  placement: { ...placement }, massClass: 'house' });
const digest = (a) => {
  const e = a.enclosure, i = a.intact;
  assert.ok(e && i, 'both measures there when asked for');
  return {
    grid: [e.nx, e.nz, Math.round(e.x0 * 100), Math.round(e.z0 * 100)], top: Array.from(e.top), base: Array.from(e.base ?? []),
    bands: e.bands.map((b) => Array.from(b.cells)), intact: [i.p90M, i.topM, i.minX, i.maxX, i.minZ, i.maxZ, i.planFill].map((v) => Math.round(v * 1000)),
  };
};

// ---- asked for in the body frame (a tool reading a structure before the build places it)
const bodyParts = houseParts();
const a = describe(bodyParts, 'deferred-a');
const asBuilt = digest(a);

// ---- placed since (the build's merge transforms the parts in place): read back through the placement
const placedParts = houseParts();
const b = describe(placedParts, 'deferred-b');
const m = new THREE.Matrix4().compose(new THREE.Vector3(placement.x, placement.y, placement.z),
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.yaw), new THREE.Vector3(1, 1, 1));
for (const list of Object.values(placedParts)) for (const g of list) g.applyMatrix4(m);
const readBack = digest(b);
assert.deepEqual(readBack.grid, asBuilt.grid, 'the read-back enclosure lies on the same grid');
assert.deepEqual(readBack.intact, asBuilt.intact, 'the read-back intact reading is the same (to the millimetre)');
assert.deepEqual(readBack.top, asBuilt.top, "the walls' tops the same, cell for cell");
assert.deepEqual(readBack.base, asBuilt.base, "the walls' feet the same, cell for cell");
assert.deepEqual(readBack.bands, asBuilt.bands, "each storey band's cells the same");
assert.ok(asBuilt.top.some((v) => v > 600) && asBuilt.bands.every((cells) => cells.some((v) => v === 1)), 'the house read as walls 6 m high in every band');

// ---- the idle measurer: what is left measured in slices, none left after
const c = describe(houseParts(), 'deferred-c');
let left = measureDeferredStructures(Infinity);
assert.equal(left, 0, 'the idle measurer measures what is left');
assert.ok(c.enclosure && c.intact, 'measured by the idle measurer, there when asked');
left = measureDeferredStructures(2);
assert.equal(left, 0, 'nothing left to measure');

// ---- one map's parts held at most: a tool building map after map (no idle measurer) has the last map's measured first
describe(houseParts(), 'deferred-d'); describe(houseParts(), 'deferred-d');
const e = describe(houseParts(), 'deferred-e');
assert.equal(measureDeferredStructures(0), 0, "another map's described structures measured before the next map's join the queue");
assert.ok(e.enclosure && e.intact, 'the last one measured too');

console.log('structureDeferredMeasure selftest: measures made when first asked for, the same read back through the placement after the build placed the parts, the idle measurer leaves none');
